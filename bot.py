import os
import re
import time
import asyncio

import discord
from discord.ext import commands
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

# 토큰/할당량 절약용 설정
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "6"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "300"))
DEFAULT_QUOTA_COOLDOWN_SECONDS = int(os.getenv("GEMINI_QUOTA_COOLDOWN_SECONDS", "60"))

if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN 환경변수가 없어. Railway Variables에 DISCORD_TOKEN을 넣어줘.")

if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY 환경변수가 없어. Railway Variables에 GOOGLE_API_KEY를 넣어줘.")

client = genai.Client(api_key=GOOGLE_API_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

memory = {}
learned = []
quota_blocked_until = 0.0


def build_system_prompt():
    base = (
        "너는 떡볶이라는 이름의 AI야. "
        "친구처럼 반말로 짧고 자연스럽게 말해. "
        "너무 AI처럼 말하지 말고, 답변은 웬만하면 1~4문장으로 해."
    )

    if learned:
        extra = "\n\n추가로 알고 있는 것들:\n" + "\n".join(f"- {x}" for x in learned[-30:])
        return base + extra

    return base


def is_quota_error(error: Exception) -> bool:
    err = str(error).lower()
    keywords = [
        "resource_exhausted",
        "429",
        "quota",
        "rate limit",
        "rate-limit",
        "exceeded your current quota",
    ]
    return any(keyword in err for keyword in keywords)


def get_retry_delay_seconds(error: Exception) -> int:
    err = str(error)
    match = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+)s", err)
    if match:
        return max(5, int(match.group(1)))
    return DEFAULT_QUOTA_COOLDOWN_SECONDS


async def ask_ai(channel_id, user_msg):
    global quota_blocked_until

    now = time.monotonic()
    if quota_blocked_until > now:
        remain = int(quota_blocked_until - now)
        return f"지금 Gemini 요청 제한 걸렸어. {remain}초 뒤에 다시 말 걸어줘."

    if channel_id not in memory:
        memory[channel_id] = []

    history = memory[channel_id]

    contents = []
    for msg in history[-MAX_HISTORY_MESSAGES:]:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))

    contents.append(types.Content(role="user", parts=[types.Part(text=user_msg)]))

    config = types.GenerateContentConfig(
        system_instruction=build_system_prompt(),
        temperature=0.8,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=MODEL,
            contents=contents,
            config=config,
        )
    except Exception as e:
        if is_quota_error(e):
            delay = get_retry_delay_seconds(e)
            quota_blocked_until = time.monotonic() + delay
            print(f"❌ Gemini 할당량/요청 제한: {e}")
            return (
                "지금 Gemini 무료 사용량이나 요청 제한이 걸렸어. "
                "잠깐 뒤에 다시 해보거나, 관리자한테 Google AI Studio 결제/할당량 확인하라고 해줘."
            )
        raise

    reply = (getattr(response, "text", None) or "답변이 비어있어. 다시 말해줘.").strip()

    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": reply})
    memory[channel_id] = history[-40:]

    return reply


@bot.event
async def on_ready():
    print(f"🔥 봇 실행됨: {bot.user} / 모델: {MODEL}")


@bot.command(name="학습")
async def learn(ctx, *, content: str):
    learned.append(content)
    await ctx.send(f"✅ 학습 완료: {content}")


@bot.command(name="학습목록")
async def learn_list(ctx):
    if not learned:
        await ctx.send("아직 학습한 게 없어!")
        return

    msg = "\n".join(f"{i + 1}. {x}" for i, x in enumerate(learned))
    if len(msg) > 1900:
        msg = msg[:1900] + "..."
    await ctx.send(f"📚 학습 목록:\n{msg}")


@bot.command(name="학습삭제")
async def learn_delete(ctx, index: int):
    if index < 1 or index > len(learned):
        await ctx.send("없는 번호야!")
        return

    removed = learned.pop(index - 1)
    await ctx.send(f"🗑️ 삭제됨: {removed}")


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("값이 빠졌어. 예: `/학습 내용` 이런 식으로 써줘.")
    elif isinstance(error, commands.BadArgument):
        await ctx.send("입력값 형식이 이상해. 번호 같은 건 숫자로 넣어줘.")
    elif isinstance(error, commands.CommandNotFound):
        return
    else:
        print(f"❌ 명령어 오류: {error}")
        await ctx.send("명령어 처리 중 오류났어. 관리자한테 로그 확인하라고 해줘.")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # 일반 /명령어는 AI 반응보다 먼저 처리
    if message.content.strip().startswith("/"):
        await bot.process_commands(message)
        return

    content = message.content.strip()

    is_mentioned = bot.user in message.mentions if bot.user else False

    is_reply_to_bot = False
    if message.reference and message.reference.message_id:
        try:
            ref_msg = await message.channel.fetch_message(message.reference.message_id)
            if ref_msg.author == bot.user:
                is_reply_to_bot = True
        except Exception as e:
            print(f"⚠️ 답장 원본 확인 실패: {e}")

    starts_with_trigger = content.startswith("떡볶이")

    if not is_mentioned and not is_reply_to_bot and not starts_with_trigger:
        return

    if starts_with_trigger:
        content = content[len("떡볶이"):].strip()
    elif is_mentioned and bot.user:
        content = content.replace(f"<@{bot.user.id}>", "").replace(f"<@!{bot.user.id}>", "").strip()

    if not content:
        await message.reply("응? 뭐야")
        return

    print(f"📨 반응: {message.author} -> {content}")

    async with message.channel.typing():
        try:
            reply = await ask_ai(message.channel.id, content)
            if len(reply) > 2000:
                reply = reply[:1990] + "..."
            await message.reply(reply)
        except Exception as e:
            print(f"❌ 오류: {e}")
            await message.reply("오류났어. 관리자한테 Railway 로그 확인하라고 해줘.")


bot.run(DISCORD_TOKEN)

import asyncio
import os
import re
import time
from collections import defaultdict, deque

import discord
from discord.ext import commands
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

BOT_TRIGGER = os.getenv("BOT_TRIGGER", "소낭아")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "4"))
MAX_STORED_HISTORY = int(os.getenv("MAX_STORED_HISTORY", "16"))
MAX_LEARNED_ITEMS = int(os.getenv("MAX_LEARNED_ITEMS", "20"))
MAX_LEARNED_CHARS = int(os.getenv("MAX_LEARNED_CHARS", "80"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "700"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "180"))
QUOTA_COOLDOWN_SECONDS = int(os.getenv("GEMINI_QUOTA_COOLDOWN_SECONDS", "60"))

if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN 환경변수가 없습니다. Railway Variables에 DISCORD_TOKEN을 넣어주세요.")

if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY 환경변수가 없습니다. Railway Variables에 GOOGLE_API_KEY를 넣어주세요.")

client = genai.Client(api_key=GOOGLE_API_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

memory = defaultdict(lambda: deque(maxlen=MAX_STORED_HISTORY))
learned = deque(maxlen=MAX_LEARNED_ITEMS)
channel_locks = defaultdict(asyncio.Lock)
quota_blocked_until = 0.0


def clean_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def build_system_prompt() -> str:
    prompt = (
        f"너는 '{BOT_TRIGGER.removesuffix('아')}'라는 이름의 디스코드 AI 친구야. "
        "반말로 자연스럽게 말해. 답은 보통 1~3문장으로 짧게 해. "
        "확실하지 않은 내용은 아는 척하지 말고 솔직히 말해."
    )

    if learned:
        facts = "\n".join(f"- {item}" for item in learned)
        prompt += "\n기억할 내용:\n" + facts

    return prompt


def is_quota_error(error: Exception) -> bool:
    err = str(error).lower()
    return any(
        keyword in err
        for keyword in (
            "resource_exhausted",
            "429",
            "quota",
            "rate limit",
            "rate-limit",
            "exceeded your current quota",
        )
    )


def get_retry_delay_seconds(error: Exception) -> int:
    match = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+)s", str(error))
    if match:
        return max(5, int(match.group(1)))
    return QUOTA_COOLDOWN_SECONDS


def remove_bot_mention(content: str) -> str:
    if not bot.user:
        return content
    content = content.replace(f"<@{bot.user.id}>", "")
    content = content.replace(f"<@!{bot.user.id}>", "")
    return content.strip()


def to_gemini_contents(history, user_msg: str) -> list[types.Content]:
    contents = []
    for msg in list(history)[-MAX_HISTORY_MESSAGES:]:
        contents.append(
            types.Content(
                role=msg["role"],
                parts=[types.Part(text=msg["content"])],
            )
        )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part(text=user_msg)],
        )
    )
    return contents


async def ask_ai(channel_id: int, user_msg: str) -> str:
    global quota_blocked_until

    now = time.monotonic()
    if quota_blocked_until > now:
        remain = int(quota_blocked_until - now)
        return f"지금 Gemini 요청 제한에 걸렸어. {remain}초 뒤에 다시 말 걸어줘."

    user_msg = clean_text(user_msg, MAX_INPUT_CHARS)
    history = memory[channel_id]
    contents = to_gemini_contents(history, user_msg)

    config = types.GenerateContentConfig(
        system_instruction=build_system_prompt(),
        temperature=0.7,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=MODEL,
            contents=contents,
            config=config,
        )
    except Exception as error:
        if is_quota_error(error):
            delay = get_retry_delay_seconds(error)
            quota_blocked_until = time.monotonic() + delay
            print(f"Gemini quota/rate limit: {error}")
            return f"지금 Gemini 무료 사용량이나 요청 제한에 걸린 것 같아. {delay}초 뒤에 다시 해줘."
        raise

    reply = clean_text(getattr(response, "text", "") or "답이 비어 있어. 다시 말해줘.", 1900)

    history.append({"role": "user", "content": user_msg})
    history.append({"role": "model", "content": reply})
    return reply


@bot.event
async def on_ready():
    print(f"Bot ready: {bot.user} / model: {MODEL}")


@bot.command(name="학습")
async def learn(ctx, *, content: str):
    content = clean_text(content, MAX_LEARNED_CHARS)
    learned.append(content)
    await ctx.send(f"학습 완료: {content}")


@bot.command(name="학습목록")
async def learn_list(ctx):
    if not learned:
        await ctx.send("아직 학습한 내용이 없어.")
        return

    msg = "\n".join(f"{idx}. {item}" for idx, item in enumerate(learned, start=1))
    await ctx.send(f"학습 목록:\n{clean_text(msg, 1900)}")


@bot.command(name="학습삭제")
async def learn_delete(ctx, index: int):
    if index < 1 or index > len(learned):
        await ctx.send("없는 번호야.")
        return

    items = list(learned)
    removed = items.pop(index - 1)
    learned.clear()
    learned.extend(items)
    await ctx.send(f"삭제했어: {removed}")


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("값이 빠졌어. 예: `/학습 내용`")
    elif isinstance(error, commands.BadArgument):
        await ctx.send("입력 형식이 이상해. 번호는 숫자로 넣어줘.")
    elif isinstance(error, commands.CommandNotFound):
        return
    else:
        print(f"Command error: {error}")
        await ctx.send("명령어 처리 중 오류가 났어. 로그를 확인해줘.")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    content = message.content.strip()
    if content.startswith("/"):
        await bot.process_commands(message)
        return

    is_mentioned = bot.user in message.mentions if bot.user else False
    starts_with_trigger = content.startswith(BOT_TRIGGER)
    is_reply_to_bot = False

    if message.reference and message.reference.resolved:
        is_reply_to_bot = getattr(message.reference.resolved, "author", None) == bot.user
    elif message.reference and message.reference.message_id:
        try:
            ref_msg = await message.channel.fetch_message(message.reference.message_id)
            is_reply_to_bot = ref_msg.author == bot.user
        except (discord.NotFound, discord.Forbidden, discord.HTTPException) as error:
            print(f"Could not fetch referenced message: {error}")

    if not (is_mentioned or starts_with_trigger or is_reply_to_bot):
        return

    if starts_with_trigger:
        content = content[len(BOT_TRIGGER) :].strip()
    elif is_mentioned:
        content = remove_bot_mention(content)

    if not content:
        await message.reply("응? 뭐라고 말해줘.")
        return

    print(f"AI request: {message.author} -> {clean_text(content, 120)}")

    async with channel_locks[message.channel.id]:
        async with message.channel.typing():
            try:
                reply = await ask_ai(message.channel.id, content)
                await message.reply(reply)
            except Exception as error:
                print(f"AI error: {error}")
                await message.reply("오류가 났어. Railway 로그를 확인해줘.")


bot.run(DISCORD_TOKEN)

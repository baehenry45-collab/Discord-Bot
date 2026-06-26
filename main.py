from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

import discord
from discord.ext import commands
from dotenv import load_dotenv

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

load_dotenv()


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def split_env_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in re.split(r"[,\n]", value) if item.strip()]


def unique_items(items: list[str]) -> list[str]:
    result = []
    for item in items:
        if item and item not in result:
            result.append(item)
    return result


DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_MODELS = unique_items(
    [
        *split_env_list(os.getenv("GEMINI_MODELS")),
        MODEL,
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
    ]
)

AI_BACKEND = os.getenv("AI_BACKEND", "ollama").lower()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_DEEP_MODEL = os.getenv("OLLAMA_DEEP_MODEL", OLLAMA_MODEL)
OLLAMA_TIMEOUT_SECONDS = env_int("OLLAMA_TIMEOUT_SECONDS", 30)  # 무한 대기 방지

BOT_TRIGGER = os.getenv("BOT_TRIGGER", "떡볶이")
BOT_NAME = os.getenv("BOT_NAME", "떡볶이")
BOT_TRIGGERS = []
for trigger in (
    BOT_TRIGGER,
    "떡볶이",
    "떡볶야",
    "소낙아",
    *os.getenv("BOT_TRIGGERS", "").split(","),
):
    trigger = trigger.strip()
    if trigger and trigger not in BOT_TRIGGERS:
        BOT_TRIGGERS.append(trigger)

MAX_HISTORY_MESSAGES = env_int("MAX_HISTORY_MESSAGES", 4)
MAX_STORED_HISTORY = env_int("MAX_STORED_HISTORY", 16)
MAX_LEARNED_ITEMS = env_int("MAX_LEARNED_ITEMS", 20)
MAX_LEARNED_CHARS = env_int("MAX_LEARNED_CHARS", 90)
MAX_INPUT_CHARS = env_int("MAX_INPUT_CHARS", 700)
MAX_OUTPUT_TOKENS = env_int("MAX_OUTPUT_TOKENS", 180)
MAX_DEEP_OUTPUT_TOKENS = env_int("MAX_DEEP_OUTPUT_TOKENS", 320)
QUOTA_COOLDOWN_SECONDS = env_int("GEMINI_QUOTA_COOLDOWN_SECONDS", 60)
HARD_QUOTA_COOLDOWN_SECONDS = env_int("GEMINI_HARD_QUOTA_COOLDOWN_SECONDS", 3600)

APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "WARNING").upper()
DISCORD_LOG_LEVEL = os.getenv("DISCORD_LOG_LEVEL", "WARNING").upper()
LEARNED_FILE = Path(os.getenv("LEARNED_FILE", "learned_memory.json"))

# 명령어 상수
CMD_LEARN = "학습"
CMD_LEARN_LIST = "학습목록"
CMD_LEARN_DELETE = "학습삭제"
CMD_FEEDBACK = "피드백"
CMD_STATUS = "상태"
CMD_CLEAR = "기억초기화"
CMD_SETTINGS = "설정"
CMD_HELP = "도움말"
CMD_PING = "핑"
CMD_MY_MEMORY = "내기억"


def configure_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, APP_LOG_LEVEL, logging.WARNING),
        format="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
    )
    discord_level = getattr(logging, DISCORD_LOG_LEVEL, logging.WARNING)
    for name in ("discord", "discord.client", "discord.gateway", "discord.http"):
        logging.getLogger(name).setLevel(discord_level)


configure_logging()
logger = logging.getLogger("discord_gemini_bot")

if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN이 없습니다. 환경 변수를 확인해주세요.")

if AI_BACKEND == "gemini" and not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY가 없습니다. 로컬 모드로 전환합니다.")
    AI_BACKEND = "local"

if AI_BACKEND == "gemini" and genai is None:
    logger.warning("google-genai 라이브러리가 없습니다. 로컬 모드로 전환합니다.")
    AI_BACKEND = "local"

client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY and genai else None

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents, help_command=None)

memory = defaultdict(lambda: deque(maxlen=MAX_STORED_HISTORY))
learned = deque(maxlen=MAX_LEARNED_ITEMS)
channel_locks = defaultdict(asyncio.Lock)
quota_blocked_until = 0.0
gemini_invalid_key_until = 0.0


def clean_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def load_learned() -> None:
    if not LEARNED_FILE.exists():
        return
    try:
        data = json.loads(LEARNED_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning("메모리를 불러오지 못했습니다: %s", error)
        return

    if not isinstance(data, list):
        return

    for item in data[-MAX_LEARNED_ITEMS:]:
        if isinstance(item, str) and item.strip():
            learned.append(clean_text(item, MAX_LEARNED_CHARS))


def save_learned() -> None:
    try:
        LEARNED_FILE.write_text(
            json.dumps(list(learned), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as error:
        logger.warning("메모리를 저장하지 못했습니다: %s", error)


def wants_deeper_answer(text: str) -> bool:
    deep_words = ("설명", "자세", "자세히", "분석", "코드", "수정", "고쳐", "오류", "왜", "어떻게", "방법", "추천")
    lowered = text.lower()
    return any(word in lowered for word in deep_words) or len(text) > 180


def local_quick_reply(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text).lower()
    if normalized in {"말", "말해", "대답", "야", "ㅎㅇ", "하이", "안녕"}:
        return "어, 나 여기 있어! 무슨 일이야?"
    if "오프라인" in normalized or "상태" in normalized:
        return "봇 서버는 켜져 있어! 다만 AI 응답이 늦어지면 백엔드 점검 중일 수 있어."
    return None


def degraded_ai_reply(user_msg: str) -> str:
    quick_reply = local_quick_reply(user_msg)
    if quick_reply:
        return quick_reply
    return "지금은 임시 퀵 리플라이 모드야. API 설정 상태를 점검해줘."


def match_trigger(content: str) -> str | None:
    for trigger in sorted(BOT_TRIGGERS, key=len, reverse=True):
        if content.startswith(trigger):
            return trigger
    return None


def build_system_prompt(user_msg: str) -> str:
    style = (
        f"You are {BOT_NAME}, a Discord AI friend. "
        "Reply in Korean in a friendly, casual banmal style. "
        "CRITICAL STYLE: Be concise and clean. Give essential information first without unnecessary fillers. "
    )
    if wants_deeper_answer(user_msg):
        style += "When explaining errors, code, or providing technical info, use clean bullet points or numbered steps. Be extremely organized. "
    else:
        style += "For casual chit-chat, keep it clean and limited to 1-2 direct sentences. "

    if learned:
        facts = "\n".join(f"- {item}" for item in learned)
        style += "\nApply these facts to your response style/context:\n" + facts
    return style


def is_quota_error(error: Exception) -> bool:
    err = str(error).lower()
    return any(k in err for k in ("resource_exhausted", "429", "quota", "rate limit"))


def is_invalid_api_key_error(error: Exception) -> bool:
    err = str(error).lower()
    return any(k in err for k in ("api_key_invalid", "api key not valid", "invalid api key"))


def to_gemini_contents(history, user_msg: str) -> list[types.Content]:
    contents = []
    for msg in list(history)[-MAX_HISTORY_MESSAGES:]:
        contents.append(types.Content(role=msg["role"], parts=[types.Part(text=msg["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_msg)]))
    return contents


def to_ollama_messages(history, user_msg: str) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": build_system_prompt(user_msg)}]
    for msg in list(history)[-MAX_HISTORY_MESSAGES:]:
        role = "assistant" if msg["role"] == "model" else "user"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_msg})
    return messages


async def generate_ollama_stream(payload: dict):
    url = f"{OLLAMA_BASE_URL}/api/chat"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

    def sync_request():
        return urllib.request.urlopen(request, timeout=OLLAMA_TIMEOUT_SECONDS)

    try:
        response = await asyncio.to_thread(sync_request)
        for line in response:
            if line:
                chunk = json.loads(line.decode("utf-8"))
                yield chunk.get("message", {}).get("content", "")
    except Exception as e:
        logger.warning("Ollama API 연결 실패: %s", e)
        yield " 로컬 AI 서버 응답 시간이 초과되었거나 연결에 실패했어."


async def ask_ai_stream(channel_id: int, user_msg: str, base_message: discord.Message):
    global quota_blocked_until, gemini_invalid_key_until

    user_msg = clean_text(user_msg, MAX_INPUT_CHARS)
    quick_reply = local_quick_reply(user_msg)
    history = memory[channel_id]

    if quick_reply:
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "model", "content": quick_reply})
        await base_message.edit(content=quick_reply)
        return

    backend = AI_BACKEND
    if backend == "auto":
        backend = "gemini" if GOOGLE_API_KEY else "ollama"

    if backend == "local" or (backend == "gemini" and (quota_blocked_until > time.monotonic() or gemini_invalid_key_until > time.monotonic())):
        await base_message.edit(content=degraded_ai_reply(user_msg))
        return

    full_reply = ""
    last_update_time = time.monotonic()

    if backend == "gemini" and client:
        deep = wants_deeper_answer(user_msg)
        max_tokens = MAX_DEEP_OUTPUT_TOKENS if deep else MAX_OUTPUT_TOKENS
        config = types.GenerateContentConfig(
            system_instruction=build_system_prompt(user_msg),
            temperature=0.72,
            max_output_tokens=max_tokens
        )
        contents = to_gemini_contents(history, user_msg)

        try:
            response_stream = await asyncio.to_thread(
                client.models.generate_content_stream,
                model=MODEL,
                contents=contents,
                config=config
            )
            for chunk in response_stream:
                chunk_text = chunk.text or ""
                full_reply += chunk_text
                if time.monotonic() - last_update_time > 0.4 and full_reply.strip():
                    await base_message.edit(content=full_reply + f" 💬")
                    last_update_time = time.monotonic()
        except Exception as error:
            if is_invalid_api_key_error(error):
                gemini_invalid_key_until = time.monotonic() + HARD_QUOTA_COOLDOWN_SECONDS
            elif is_quota_error(error):
                quota_blocked_until = time.monotonic() + QUOTA_COOLDOWN_SECONDS
            logger.exception("Gemini API 호출 에러")
            await base_message.edit(content="⚠️ Gemini 요청 중 제한 혹은 에러가 발생했어.")
            return

    elif backend == "ollama":
        deep = wants_deeper_answer(user_msg)
        model = OLLAMA_DEEP_MODEL if deep else OLLAMA_MODEL
        max_tokens = MAX_DEEP_OUTPUT_TOKENS if deep else MAX_OUTPUT_TOKENS
        payload = {
            "model": model,
            "messages": to_ollama_messages(history, user_msg),
            "stream": True,
            "options": {"temperature": 0.72, "num_predict": max_tokens, "num_ctx": 2048},
        }

        async for chunk_text in generate_ollama_stream(payload):
            full_reply += chunk_text
            if time.monotonic() - last_update_time > 0.4 and full_reply.strip():
                await base_message.edit(content=full_reply + f" 💬")
                last_update_time = time.monotonic()
    else:
        await base_message.edit(content="설정된 AI 백엔드 값이 바르지 않아.")
        return

    final_reply = clean_text(full_reply or "답변 내용을 가져오지 못했어.", 1900)
    await base_message.edit(content=final_reply)
    
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "model", "content": final_reply})


# ------------------ 디스코드 명령어 섹션 ------------------

@bot.event
async def on_ready():
    logger.info("봇 로그인 완료: %s", bot.user)


@bot.command(name=CMD_HELP)
async def help_command(ctx):
    embed = discord.Embed(title=f"📜 {BOT_NAME} 봇 명령어 가이드", color=discord.Color.green())
    embed.add_field(name=f"`/{CMD_HELP}`", value="이 도움말 목록을 보여줘.", inline=True)
    embed.add_field(name=f"`/{CMD_PING}`", value="봇의 통신 상태와 반응 속도를 확인해.", inline=True)
    embed.add_field(name=f"`/{CMD_SETTINGS}`", value="현재 AI 백엔드와 활성화된 모델을 확인해.", inline=True)
    embed.add_field(name=f"`/{CMD_LEARN} [내용]`", value="봇에게 규칙이나 고정 정보를 강제로 기억시켜.", inline=False)
    embed.add_field(name=f"`/{CMD_LEARN_LIST}`", value="학습된 수동 메모리 리스트를 조회해.", inline=True)
    embed.add_field(name=f"`/{CMD_LEARN_DELETE} [번호]`", value="학습 목록에서 특정 번호의 기억을 지워.", inline=True)
    embed.add_field(name=f"`/{CMD_MY_MEMORY}`", value="현재 채널에 쌓여있는 유저 대화 기억 카운트를 확인해.", inline=True)
    embed.add_field(name=f"`/{CMD_CLEAR}`", value="현재 채널의 이전 대화 기록 문맥을 전부 초기화해.", inline=True)
    embed.set_footer(text="💡 명령어 대신 대화 도중 '떡볶이'를 붙여 부르면 AI가 답변해!")
    await ctx.send(embed=embed)


@bot.command(name=CMD_PING)
async def ping(ctx):
    latency = round(bot.latency * 1000)
    await ctx.send(f"🏓 퐁! 현재 반응 속도: `{latency}ms` (정상 작동 중)")


@bot.command(name=CMD_MY_MEMORY)
async def my_memory(ctx):
    count = len(memory[ctx.channel.id])
    await ctx.send(f"📊 현재 이 채널에서 기억하고 있는 대화 문맥 수: `{count} / {MAX_STORED_HISTORY}` 개")


@bot.command(name=CMD_LEARN)
async def learn(ctx, *, content: str):
    content = clean_text(content, MAX_LEARNED_CHARS)
    learned.append(content)
    save_learned()
    await ctx.send(f"✅ 규칙 학습 완료: `{content}`")


@bot.command(name=CMD_FEEDBACK)
async def feedback(ctx, *, content: str):
    content = clean_text("피드백: " + content, MAX_LEARNED_CHARS)
    learned.append(content)
    save_learned()
    await ctx.send("📥 피드백이 기록되었어. 다음 답변 품질 향상에 참고할게.")


@bot.command(name=CMD_CLEAR)
async def clear_channel_memory(ctx):
    if ctx.channel.id in memory and len(memory[ctx.channel.id]) > 0:
        memory[ctx.channel.id].clear()
        await ctx.send("🧹 이 채널에서 나눈 이전 대화 흐름 기억을 모두 비웠어!")
    else:
        await ctx.send("❌ 비울 대화 기억 문맥이 없어.")


@bot.command(name=CMD_SETTINGS)
async def view_settings(ctx):
    embed = discord.Embed(title=f"🛠️ {BOT_NAME} 설정 정보", color=discord.Color.blue())
    embed.add_field(name="AI 엔진 백엔드", value=f"`{AI_BACKEND.upper()}`", inline=True)
    embed.add_field(name="현재 구동 모델", value=f"`{MODEL if AI_BACKEND == 'gemini' else OLLAMA_MODEL}`", inline=True)
    embed.add_field(name="호출 활성 트리거", value=f"`{', '.join(BOT_TRIGGERS)}`", inline=False)
    embed.add_field(name="기억 슬롯 상태", value=f"대화 컨텍스트 상한 `{MAX_HISTORY_MESSAGES}개` / 저장된 고정 규칙 `{len(learned)}개`", inline=True)
    await ctx.send(embed=embed)


@bot.command(name=CMD_STATUS)
async def status(ctx):
    if AI_BACKEND in {"ollama", "local"}:
        await ctx.send(f"🤖 **백엔드:** `{AI_BACKEND}`\n- **Ollama 엔드포인트:** `{OLLAMA_BASE_URL}`\n- **모델명:** `{OLLAMA_MODEL}`")
    else:
        await ctx.send(f"🤖 **백엔드:** `{AI_BACKEND}`\n- **Gemini 타겟 모델:** `{MODEL}`")


@bot.command(name=CMD_LEARN_LIST)
async def learn_list(ctx):
    if not learned:
        await ctx.send("현재 강제 고정 입력된 규칙 리스트가 비어 있어.")
        return
    msg = "\n".join(f"{idx}. {item}" for idx, item in enumerate(learned, start=1))
    await ctx.send(f"📜 **수동 학습 규칙 목록**\n{clean_text(msg, 1900)}")


@bot.command(name=CMD_LEARN_DELETE)
async def learn_delete(ctx, index: int):
    if index < 1 or index > len(learned):
        await ctx.send("❌ 명시한 인덱스 번호를 목록에서 찾을 수 없어.")
        return
    items = list(learned)
    removed = items.pop(index - 1)
    learned.clear()
    learned.extend(items)
    save_learned()
    await ctx.send(f"🗑️ 다음 고정 규칙을 메모리에서 제거했어: `{removed}`")


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("❗ 필수 요소가 누락되었어. 명령어를 올바르게 입력해줘.")
    elif isinstance(error, commands.BadArgument):
        await ctx.send("❗ 잘못된 인자 형식이야. 숫자가 필요한 곳인지 확인해줘.")
    elif isinstance(error, commands.CommandNotFound):
        return
    else:
        logger.exception("명령어 처리 중 에러")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    content = message.content.strip()
    
    # 명령어 접두사(/)가 있으면 온전히 커맨드로만 처리하고 일반 AI 처리 로직은 생략
    if content.startswith("/"):
        await bot.process_commands(message)
        return

    is_mentioned = bot.user in message.mentions if bot.user else False
    trigger = match_trigger(content)
    starts_with_trigger = trigger is not None
    is_reply_to_bot = False

    if message.reference and message.reference.resolved:
        is_reply_to_bot = getattr(message.reference.resolved, "author", None) == bot.user
    elif message.reference and message.reference.message_id:
        try:
            ref_msg = await message.channel.fetch_message(message.reference.message_id)
            is_reply_to_bot = ref_msg.author == bot.user
        except (discord.NotFound, discord.Forbidden, discord.HTTPException):
            pass

    if not (is_mentioned or starts_with_trigger or is_reply_to_bot):
        return

    if starts_with_trigger:
        content = content[len(trigger) :].strip()
    elif is_mentioned:
        content = message.content
        if bot.user:
            content = content.replace(f"<@{bot.user.id}>", "").replace(f"<@!{bot.user.id}>", "")
        content = content.strip()

    if not content:
        await message.reply("응? 할 말이 있으면 편하게 말해줘!")
        return

    logger.info("AI 요청 접수: %s -> %s", message.author, clean_text(content, 120))

    async with channel_locks

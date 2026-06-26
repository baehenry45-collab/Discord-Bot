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
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
    ]
)

AI_BACKEND = os.getenv("AI_BACKEND", "ollama").lower()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_DEEP_MODEL = os.getenv("OLLAMA_DEEP_MODEL", OLLAMA_MODEL)
OLLAMA_TIMEOUT_SECONDS = env_int("OLLAMA_TIMEOUT_SECONDS", 90)

BOT_TRIGGER = os.getenv("BOT_TRIGGER", "\ub5a1\ubcf6\uc774")
BOT_NAME = os.getenv("BOT_NAME", "\ub5a1\ubcf6\uc774")
BOT_TRIGGERS = []
for trigger in (
    BOT_TRIGGER,
    "\ub5a1\ubcf6\uc774",
    "\ub5a1\ubcf6\uc544",
    "\uc18c\ub0ad\uc544",
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
MAX_DEEP_OUTPUT_TOKENS = env_int("MAX_DEEP_OUTPUT_TOKENS", 320)
RESPONSE_SENTENCES = env_int("RESPONSE_SENTENCES", 2)
MAX_REPLY_MESSAGES = env_int("MAX_REPLY_MESSAGES", 1)
REPLY_CHUNK_CHARS = env_int("REPLY_CHUNK_CHARS", 1800)
BOT_TONE = os.getenv("BOT_TONE", "친근하고 자연스럽게")
RESPONSE_DETAIL = os.getenv("RESPONSE_DETAIL", "balanced")
RESPONSE_FORMAT = os.getenv("RESPONSE_FORMAT", "auto")
CUSTOM_STYLE = os.getenv("CUSTOM_STYLE", "").strip()
BANNED_WORDS = split_env_list(os.getenv("BANNED_WORDS"))
QUOTA_COOLDOWN_SECONDS = env_int("GEMINI_QUOTA_COOLDOWN_SECONDS", 60)
HARD_QUOTA_COOLDOWN_SECONDS = env_int("GEMINI_HARD_QUOTA_COOLDOWN_SECONDS", 3600)
MODEL_COOLDOWN_SECONDS = env_int("GEMINI_MODEL_COOLDOWN_SECONDS", 300)

APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "WARNING").upper()
DISCORD_LOG_LEVEL = os.getenv("DISCORD_LOG_LEVEL", "WARNING").upper()
LEARNED_FILE = Path(os.getenv("LEARNED_FILE", "learned_memory.json"))

CMD_LEARN = "\ud559\uc2b5"
CMD_LEARN_LIST = "\ud559\uc2b5\ubaa9\ub85d"
CMD_LEARN_DELETE = "\ud559\uc2b5\uc0ad\uc81c"
CMD_FEEDBACK = "\ud53c\ub4dc\ubc31"
CMD_STATUS = "\uc0c1\ud0dc"


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
    raise RuntimeError("DISCORD_TOKEN is missing. Add it to Railway Variables.")

if AI_BACKEND == "gemini" and not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY/GEMINI_API_KEY is missing. Falling back to local quick replies.")
    AI_BACKEND = "local"

if AI_BACKEND == "gemini" and genai is None:
    logger.warning("google-genai is missing. Falling back to local quick replies.")
    AI_BACKEND = "local"

client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY and genai else None

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

memory = defaultdict(lambda: deque(maxlen=MAX_STORED_HISTORY))
learned = deque(maxlen=MAX_LEARNED_ITEMS)
channel_locks = defaultdict(asyncio.Lock)
quota_blocked_until = 0.0
gemini_invalid_key_until = 0.0
gemini_model_cooldowns: dict[str, float] = {}
last_gemini_model_index = -1


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
        logger.warning("Could not load learned memory: %s", error)
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
        logger.warning("Could not save learned memory: %s", error)


def wants_deeper_answer(text: str) -> bool:
    deep_words = (
        "\uc124\uba85",
        "\uc790\uc138",
        "\uc790\uc138\ud788",
        "\ubd84\uc11d",
        "\ucf54\ub4dc",
        "\uc218\uc815",
        "\uace0\uccd0",
        "\uc624\ub958",
        "\uc65c",
        "\uc5b4\ub5bb\uac8c",
        "\ubc29\ubc95",
        "\ucd94\ucc9c",
    )
    lowered = text.lower()
    return any(word in lowered for word in deep_words) or len(text) > 180


def local_quick_reply(text: str) -> str | None:
    normalized = re.sub(r"\s+", "", text).lower()
    if normalized in {"말", "말해", "대답", "야", "ㅎㅇ", "하이", "안녕"}:
        return "\uc5b4, \ub098 \uc788\uc5b4. \ubb50 \ud574\uc904\uae4c?"
    if "\uc624\ud504\ub77c\uc778" in normalized:
        return "\uc811\uc18d\uc740 \ub418\uc5b4 \uc788\uc5b4. \ub2e4\ub9cc AI \ubaa8\ub378 \uc694\uccad\uc774 \ub9c9\ud788\uba74 \ub2f5\uc774 \ub290\ub9b4 \uc218 \uc788\uc5b4."
    if "\ud1a0\ud070" in normalized and ("\ub192" in normalized or "\ub9ce" in normalized or "\uc18c\ube44" in normalized):
        return "\ub9de\uc544, \uc9c0\uae08\uc740 \ud638\ucd9c\uc744 \uc544\ub07c\ub294 \ucabd\uc73c\ub85c \ubc14\uafb8\ub294 \uac8c \uc88b\uc544. \uc9e7\uc740 \ub9d0\uc740 \ub85c\uceec \ub2f5\ubcc0\uc73c\ub85c \ucc98\ub9ac\ud558\uace0, \ud544\uc694\ud560 \ub54c\ub9cc \ubaa8\ub378\uc744 \ubd80\ub974\uac8c \ud560\uac8c."
    return None


def local_quick_reply(text: str) -> str | None:
    normalized = re.sub(r"\s+", "", text).lower()
    if normalized in {"말", "말해", "대답", "야", "ㅎㅇ", "하이", "안녕"}:
        return "어, 나 있어. 뭐 해줄까?"
    if "오프라인" in normalized:
        return "접속은 되어 있어. 다만 AI 모델 요청이 막히면 답이 늦을 수 있어."
    if "토큰" in normalized and ("높" in normalized or "많" in normalized or "소비" in normalized):
        return "맞아, 짧은 말은 모델 호출 없이 처리하고 필요한 질문만 모델에 보내는 쪽으로 줄이면 돼."
    return None


def degraded_ai_reply(user_msg: str) -> str:
    quick_reply = local_quick_reply(user_msg)
    if quick_reply:
        return quick_reply
    return (
        "지금은 Gemini 키나 사용량 제한 때문에 간단 응답 모드야. "
        "AI 답변까지 쓰려면 Railway Variables의 `GOOGLE_API_KEY`를 정상 키로 바꿔줘."
    )


def match_trigger(content: str) -> str | None:
    for trigger in sorted(BOT_TRIGGERS, key=len, reverse=True):
        if content.startswith(trigger):
            return trigger
    return None


def build_system_prompt(user_msg: str) -> str:
    style = (
        f"You are {BOT_NAME}, a Discord AI friend. "
        "Reply in Korean unless the user uses another language. "
        "Use natural casual banmal, warm but not childish. "
        "Answer the user's real intent first. Avoid filler. "
        "If unsure, say so honestly. "
    )

    if wants_deeper_answer(user_msg):
        style += (
            "For troubleshooting, code, or explanation, give clear steps or compact bullets. "
            "Keep it practical and specific. "
        )
    else:
        style += "For casual chat, answer in 1-2 short sentences. "

    if learned:
        facts = "\n".join(f"- {item}" for item in learned)
        style += "\nRemember these user preferences/facts:\n" + facts

    return style


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


def is_invalid_api_key_error(error: Exception) -> bool:
    err = str(error).lower()
    return (
        "api_key_invalid" in err
        or "api key not valid" in err
        or "invalid api key" in err
    )


def is_missing_model_error(error: Exception) -> bool:
    err = str(error).lower()
    return (
        "404" in err
        or "not_found" in err
        or "model not found" in err
        or "not found for api version" in err
    )


def is_retryable_model_error(error: Exception) -> bool:
    err = str(error).lower()
    return any(
        keyword in err
        for keyword in (
            "500",
            "502",
            "503",
            "504",
            "internal",
            "unavailable",
            "deadline",
            "timeout",
        )
    )


def pick_gemini_model() -> str | None:
    global last_gemini_model_index

    now = time.monotonic()
    for offset in range(1, len(GEMINI_MODELS) + 1):
        index = (last_gemini_model_index + offset) % len(GEMINI_MODELS)
        model = GEMINI_MODELS[index]
        if gemini_model_cooldowns.get(model, 0.0) <= now:
            last_gemini_model_index = index
            return model
    return None


def cool_down_model(model: str, seconds: int) -> None:
    gemini_model_cooldowns[model] = time.monotonic() + max(5, seconds)


def is_hard_quota_error(error: Exception) -> bool:
    err = str(error).lower()
    return (
        "limit: 0" in err
        or "generaterequestsperday" in err
        or "free_tier_requests" in err
    )


def get_retry_delay_seconds(error: Exception) -> int:
    if is_hard_quota_error(error):
        return HARD_QUOTA_COOLDOWN_SECONDS

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


def to_ollama_messages(history, user_msg: str) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": build_system_prompt(user_msg)}]
    for msg in list(history)[-MAX_HISTORY_MESSAGES:]:
        role = "assistant" if msg["role"] == "model" else "user"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_msg})
    return messages


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=OLLAMA_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def ollama_error_message(error: Exception) -> str:
    if isinstance(error, urllib.error.HTTPError):
        try:
            body = error.read().decode("utf-8", errors="replace")
        except OSError:
            body = str(error)
        if "not found" in body.lower() or error.code == 404:
            return (
                f"\ub85c\uceec \ubaa8\ub378 `{OLLAMA_MODEL}`\uc744 \ubabb \ucc3e\uc558\uc5b4. "
                f"\ud130\ubbf8\ub110\uc5d0\uc11c `ollama pull {OLLAMA_MODEL}` \ud55c \ubc88\ub9cc \ud574\uc918."
            )
        return f"Ollama HTTP \uc624\ub958\uac00 \ub0ac\uc5b4: {error.code}"

    if isinstance(error, urllib.error.URLError):
        return (
            "\ub85c\uceec Ollama\uac00 \uc544\uc9c1 \uc548 \ucf1c\uc838 \uc788\uc5b4. "
            "`ollama serve`\ub97c \uc2e4\ud589\ud558\uace0 \ub2e4\uc2dc \ub9d0 \uac78\uc5b4\uc918."
        )

    return "\ub85c\uceec AI \ud638\ucd9c \uc911 \uc624\ub958\uac00 \ub0ac\uc5b4. Ollama \ub85c\uadf8\ub97c \ud655\uc778\ud574\uc918."


async def ask_ollama(channel_id: int, user_msg: str) -> str:
    user_msg = clean_text(user_msg, MAX_INPUT_CHARS)
    quick_reply = local_quick_reply(user_msg)
    history = memory[channel_id]

    if quick_reply:
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "model", "content": quick_reply})
        return quick_reply

    deep = wants_deeper_answer(user_msg)
    model = OLLAMA_DEEP_MODEL if deep else OLLAMA_MODEL
    max_tokens = MAX_DEEP_OUTPUT_TOKENS if deep else MAX_OUTPUT_TOKENS
    payload = {
        "model": model,
        "messages": to_ollama_messages(history, user_msg),
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "temperature": 0.72,
            "num_predict": max_tokens,
            "num_ctx": 2048,
        },
    }

    try:
        response = await asyncio.to_thread(
            post_json,
            f"{OLLAMA_BASE_URL}/api/chat",
            payload,
        )
    except Exception as error:
        logger.warning("Ollama call failed: %s", error)
        return ollama_error_message(error)

    reply = clean_text(
        response.get("message", {}).get("content", "") or "\ub2f5\uc774 \ube44\uc5b4 \uc788\uc5b4. \ub2e4\uc2dc \ub9d0\ud574\uc918.",
        1900,
    )
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "model", "content": reply})
    return reply


async def ask_gemini(channel_id: int, user_msg: str) -> str:
    global quota_blocked_until, gemini_invalid_key_until

    if genai is None:
        return "Gemini\ub97c \uc4f0\ub824\uba74 `pip install google-genai`\uac00 \ud544\uc694\ud574."

    if not client:
        return "Gemini API key\uac00 \uc5c6\uc5b4. `AI_BACKEND=ollama`\ub85c \uc4f0\uac70\ub098 `GOOGLE_API_KEY`\ub97c \ub123\uc5b4\uc918."

    now = time.monotonic()
    if gemini_invalid_key_until > now:
        return degraded_ai_reply(user_msg)

    if quota_blocked_until > now:
        return degraded_ai_reply(user_msg)

    user_msg = clean_text(user_msg, MAX_INPUT_CHARS)
    history = memory[channel_id]
    contents = to_gemini_contents(history, user_msg)
    max_tokens = MAX_DEEP_OUTPUT_TOKENS if wants_deeper_answer(user_msg) else MAX_OUTPUT_TOKENS

    config = types.GenerateContentConfig(
        system_instruction=build_system_prompt(user_msg),
        temperature=0.72,
        max_output_tokens=max_tokens,
    )

    response = None
    used_model = None
    last_error = None

    for _ in range(len(GEMINI_MODELS)):
        model = pick_gemini_model()
        if not model:
            break

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=contents,
                config=config,
            )
            used_model = model
            break
        except Exception as error:
            last_error = error
            if is_invalid_api_key_error(error):
                gemini_invalid_key_until = time.monotonic() + HARD_QUOTA_COOLDOWN_SECONDS
                logger.warning("Gemini API key is invalid; falling back to local quick replies")
                return degraded_ai_reply(user_msg)

            if is_quota_error(error):
                delay = get_retry_delay_seconds(error)
                cool_down_model(model, min(delay, MODEL_COOLDOWN_SECONDS))
                logger.warning("Gemini model quota/rate limit: %s; cooldown=%ss", model, delay)
                if is_hard_quota_error(error):
                    quota_blocked_until = time.monotonic() + delay
                    return degraded_ai_reply(user_msg)
                continue

            if is_missing_model_error(error):
                cool_down_model(model, 24 * 60 * 60)
                logger.warning("Gemini model unavailable/not found: %s", model)
                continue

            if is_retryable_model_error(error):
                cool_down_model(model, MODEL_COOLDOWN_SECONDS)
                logger.warning("Gemini transient model error: %s", model)
                continue

            raise

    if response is None:
        logger.warning("No Gemini model usable right now: %s", last_error)
        return degraded_ai_reply(user_msg)

    reply = clean_text(
        getattr(response, "text", "") or "\ub2f5\uc774 \ube44\uc5b4 \uc788\uc5b4. \ub2e4\uc2dc \ub9d0\ud574\uc918.",
        1900,
    )

    history.append({"role": "user", "content": user_msg})
    history.append({"role": "model", "content": reply})
    logger.info("Gemini response model: %s", used_model)
    return reply


async def ask_ai(channel_id: int, user_msg: str) -> str:
    quick_reply = local_quick_reply(user_msg)
    if quick_reply:
        return quick_reply

    if AI_BACKEND == "local":
        return degraded_ai_reply(user_msg)
    if AI_BACKEND == "ollama":
        return await ask_ollama(channel_id, user_msg)
    if AI_BACKEND == "gemini":
        return await ask_gemini(channel_id, user_msg)
    if AI_BACKEND == "auto":
        reply = await ask_ollama(channel_id, user_msg)
        if "Ollama" not in reply and "\ub85c\uceec" not in reply:
            return reply
        if GOOGLE_API_KEY:
            return await ask_gemini(channel_id, user_msg)
        return reply
    return "AI_BACKEND\uac12\uc740 `ollama`, `local`, `gemini`, `auto` \uc911 \ud558\ub098\ub85c \ub123\uc5b4\uc918."


@bot.event
async def on_ready():
    logger.info("Bot ready: %s / backend: %s / gemini models: %s", bot.user, AI_BACKEND, GEMINI_MODELS)


@bot.command(name=CMD_LEARN)
async def learn(ctx, *, content: str):
    content = clean_text(content, MAX_LEARNED_CHARS)
    learned.append(content)
    save_learned()
    await ctx.send(f"\ud559\uc2b5 \uc644\ub8cc: {content}")


@bot.command(name=CMD_FEEDBACK)
async def feedback(ctx, *, content: str):
    content = clean_text("\ud53c\ub4dc\ubc31: " + content, MAX_LEARNED_CHARS)
    learned.append(content)
    save_learned()
    await ctx.send("\uc88b\uc544, \ub2e4\uc74c \ub2f5\ubcc0\ubd80\ud130 \ubc18\uc601\ud574\ubcfc\uac8c.")


@bot.command(name=CMD_STATUS)
async def status(ctx):
    if AI_BACKEND in {"ollama", "local"}:
        await ctx.send(
            "AI status\n"
            f"- backend: `{AI_BACKEND}`\n"
            f"- triggers: `{', '.join(BOT_TRIGGERS)}`\n"
            f"- ollama: `{OLLAMA_BASE_URL}`\n"
            f"- model: `{OLLAMA_MODEL}`\n"
            f"- deep model: `{OLLAMA_DEEP_MODEL}`"
        )
        return

    await ctx.send(
        "AI status\n"
        f"- backend: `{AI_BACKEND}`\n"
        f"- triggers: `{', '.join(BOT_TRIGGERS)}`\n"
        f"- gemini models: `{', '.join(GEMINI_MODELS[:5])}`\n"
        f"- cooling models: `{sum(1 for until in gemini_model_cooldowns.values() if until > time.monotonic())}`"
    )


@bot.command(name=CMD_LEARN_LIST)
async def learn_list(ctx):
    if not learned:
        await ctx.send("\uc544\uc9c1 \ud559\uc2b5\ud55c \ub0b4\uc6a9\uc774 \uc5c6\uc5b4.")
        return

    msg = "\n".join(f"{idx}. {item}" for idx, item in enumerate(learned, start=1))
    await ctx.send(f"\ud559\uc2b5 \ubaa9\ub85d:\n{clean_text(msg, 1900)}")


@bot.command(name=CMD_LEARN_DELETE)
async def learn_delete(ctx, index: int):
    if index < 1 or index > len(learned):
        await ctx.send("\uc5c6\ub294 \ubc88\ud638\uc57c.")
        return

    items = list(learned)
    removed = items.pop(index - 1)
    learned.clear()
    learned.extend(items)
    save_learned()
    await ctx.send(f"\uc0ad\uc81c\ud588\uc5b4: {removed}")


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("\uac12\uc774 \ube60\uc84c\uc5b4. \uc608: `/\ud559\uc2b5 \ub0b4\uc6a9`")
    elif isinstance(error, commands.BadArgument):
        await ctx.send("\uc785\ub825 \ud615\uc2dd\uc774 \uc774\uc0c1\ud574. \ubc88\ud638\ub294 \uc22b\uc790\ub85c \ub123\uc5b4\uc918.")
    elif isinstance(error, commands.CommandNotFound):
        return
    else:
        logger.exception("Command error: %s", error)
        await ctx.send("\uba85\ub839\uc5b4 \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ub0ac\uc5b4. \ub85c\uadf8\ub97c \ud655\uc778\ud574\uc918.")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    content = message.content.strip()
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
        except (discord.NotFound, discord.Forbidden, discord.HTTPException) as error:
            logger.debug("Could not fetch referenced message: %s", error)

    if not (is_mentioned or starts_with_trigger or is_reply_to_bot):
        return

    if starts_with_trigger:
        content = content[len(trigger) :].strip()
    elif is_mentioned:
        content = remove_bot_mention(content)

    if not content:
        await message.reply("\uc751? \ubb50\ub77c\uace0 \ub9d0\ud574\uc918.")
        return

    logger.info("AI request: %s -> %s", message.author, clean_text(content, 120))

    async with channel_locks[message.channel.id]:
        async with message.channel.typing():
            try:
                reply = await ask_ai(message.channel.id, content)
                await message.reply(reply)
            except Exception as error:
                logger.exception("AI error: %s", error)
                await message.reply("\uc624\ub958\uac00 \ub0ac\uc5b4. Railway \ub85c\uadf8\ub97c \ud655\uc778\ud574\uc918.")


load_learned()
bot.run(DISCORD_TOKEN, log_level=getattr(logging, DISCORD_LOG_LEVEL, logging.WARNING))

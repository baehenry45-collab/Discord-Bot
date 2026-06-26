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
MODEL_COOLDOWN_SECONDS = env_int("GEMINI_MODEL_COOLDOWN_SECONDS", 300)

APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "WARNING").upper()
DISCORD_LOG_LEVEL = os.getenv("DISCORD_LOG_LEVEL", "WARNING").upper()
LEARNED_FILE = Path(os.getenv("LEARNED_FILE", "learned_memory.json"))

CMD_LEARN = "학습"
CMD_LEARN_LIST = "학습목록"
CMD_LEARN_DELETE = "학습삭제"
CMD_FEEDBACK = "피드백"
CMD_STATUS = "상태"
CMD_CLEAR = "기억초기화"
CMD_SETTINGS = "설정"


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
    logger.warning("GOOGLE_API_KEY가 없습니다. 로컬 퀵 리플라이 모드로 전환합니다.")
    AI_BACKEND = "local"

if AI_BACKEND == "gemini" and genai is None:
    logger.warning("google-genai 라이브러리가 없습니다. 로컬 퀵 리플라이 모드로 전환합니다.")
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
    return "지금은 Gemini 키나 사용량 제한 때문에 간단 응답 모드야. 정상 이용을 위해 API 키를 확인해줘."


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
        style += "For troubleshooting, code, or explanation, give clear steps or compact bullets. Keep it practical and specific. "
    else:
        style += "For casual chat, answer in 1-2 short sentences. "

    if learned:
        facts = "\n".join(f"- {item}" for item in learned)
        style += "\nRemember these user preferences/facts:\n" + facts
    return style


def is_quota_error(error: Exception) -> bool:
    err = str(error).lower()
    return any(k in err for k in ("resource_exhausted", "429", "quota", "rate limit", "rate-limit"))


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
        logger.warning("Ollama 스트림 실패: %s", e)
        yield " 로컬 AI 호출 중 오류가 발생했어."


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
            temperature=

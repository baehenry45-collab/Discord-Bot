from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()


ROOT_DIR = Path(__file__).resolve().parent
UDON_BRIDGE = ROOT_DIR / "udon_bridge.js"
UDON_ENGINE_DIR = ROOT_DIR / "Udon_M1"


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def split_env_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in re.split(r"[,\n]", value) if item.strip()]


DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
NODE_BIN = os.getenv("NODE_BIN", "node")
UDON_TIMEOUT_SECONDS = env_int("UDON_TIMEOUT_SECONDS", 20)
MAX_INPUT_CHARS = env_int("MAX_INPUT_CHARS", 900)
REPLY_CHUNK_CHARS = env_int("REPLY_CHUNK_CHARS", 1800)

BOT_TRIGGER = os.getenv("BOT_TRIGGER", "떡볶이")
BOT_NAME = os.getenv("BOT_NAME", "떡볶이")
BOT_TRIGGERS: list[str] = []
for trigger in (
    BOT_TRIGGER,
    "떡볶이",
    "떡볶아",
    "소낭아",
    "우돈아",
    "우돈봇",
    *split_env_list(os.getenv("BOT_TRIGGERS")),
):
    if trigger and trigger not in BOT_TRIGGERS:
        BOT_TRIGGERS.append(trigger)

APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "WARNING").upper()
DISCORD_LOG_LEVEL = os.getenv("DISCORD_LOG_LEVEL", "WARNING").upper()

CMD_LEARN = "학습"
CMD_STATUS = "상태"


def configure_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, APP_LOG_LEVEL, logging.WARNING),
        format="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
    )
    discord_level = getattr(logging, DISCORD_LOG_LEVEL, logging.WARNING)
    for name in ("discord", "discord.client", "discord.gateway", "discord.http"):
        logging.getLogger(name).setLevel(discord_level)


configure_logging()
logger = logging.getLogger("udon_m1_discord_bot")

if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN is missing. Add it to Railway Variables.")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)
channel_locks = {}


def clean_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def match_trigger(content: str) -> str | None:
    for trigger in sorted(BOT_TRIGGERS, key=len, reverse=True):
        if content.startswith(trigger):
            return trigger
    return None


def remove_bot_mention(content: str) -> str:
    if not bot.user:
        return content
    content = content.replace(f"<@{bot.user.id}>", "")
    content = content.replace(f"<@!{bot.user.id}>", "")
    return content.strip()


def node_available() -> bool:
    return shutil.which(NODE_BIN) is not None


def call_udon_sync(payload: dict[str, Any]) -> dict[str, Any]:
    if not UDON_ENGINE_DIR.exists():
        return {"ok": False, "error": "Udon_M1 folder is missing."}
    if not UDON_BRIDGE.exists():
        return {"ok": False, "error": "udon_bridge.js is missing."}
    if not node_available():
        return {"ok": False, "error": f"Node.js executable not found: {NODE_BIN}"}

    raw_input = json.dumps(payload, ensure_ascii=False)
    try:
        completed = subprocess.run(
            [NODE_BIN, str(UDON_BRIDGE)],
            input=raw_input,
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=UDON_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Udon_M1 response timed out."}
    except OSError as error:
        return {"ok": False, "error": str(error)}

    output = (completed.stdout or "").strip()
    if not output:
        return {
            "ok": False,
            "error": completed.stderr.strip() or f"Udon_M1 exited with {completed.returncode}.",
        }

    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return {"ok": False, "error": f"Invalid Udon_M1 output: {output[:500]}"}

    if completed.returncode != 0 and data.get("ok") is not False:
        data["ok"] = False
        data["error"] = data.get("error") or completed.stderr.strip() or f"Udon_M1 exited with {completed.returncode}."
    return data


async def call_udon(payload: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(call_udon_sync, payload)


async def ask_udon(question: str, message: discord.Message | None = None) -> dict[str, Any]:
    context = {}
    if message is not None:
        context = {
            "userId": str(message.author.id),
            "guildId": str(message.guild.id) if message.guild else None,
            "username": message.author.name,
            "channelId": str(message.channel.id),
        }
    return await call_udon(
        {
            "action": "answer",
            "question": clean_text(question, MAX_INPUT_CHARS),
            "context": context,
        }
    )


async def teach_udon(
    question: str,
    answer: str,
    *,
    category: str = "general",
    user_id: str | None = None,
    guild_id: str | None = None,
    username: str | None = None,
) -> dict[str, Any]:
    return await call_udon(
        {
            "action": "teach",
            "question": question,
            "answer": answer,
            "category": category or "general",
            "context": {
                "userId": user_id,
                "guildId": guild_id,
                "username": username,
                "category": category or "general",
            },
        }
    )


def fallback_error(error: str) -> str:
    return (
        "Udon_M1 엔진 호출 중 문제가 났어.\n"
        f"- 원인: `{clean_text(error, 300)}`\n"
        "- Railway라면 Node.js가 같이 설치되는지, `Udon_M1` 폴더가 배포에 포함됐는지 확인해줘."
    )


def chunk_reply(text: str) -> list[str]:
    text = str(text or "").strip() or "답변이 비어 있어. 다시 말해줘."
    if len(text) <= REPLY_CHUNK_CHARS:
        return [text]
    return [text[i : i + REPLY_CHUNK_CHARS] for i in range(0, len(text), REPLY_CHUNK_CHARS)]


class TeachModal(discord.ui.Modal):
    def __init__(self, question: str, context: dict[str, str | None]):
        super().__init__(title="Udon_M1 가르치기")
        self.question = question
        self.context = context
        self.answer = discord.ui.TextInput(
            label="이 말에 어떻게 답하면 돼?",
            style=discord.TextStyle.paragraph,
            max_length=1000,
            required=True,
            placeholder="예: 이건 서버 재시작 방법을 알려주면 돼.",
        )
        self.category = discord.ui.TextInput(
            label="분류(선택)",
            style=discord.TextStyle.short,
            max_length=40,
            required=False,
            placeholder="general, coding, server_ops ...",
        )
        self.add_item(self.answer)
        self.add_item(self.category)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        result = await teach_udon(
            self.question,
            str(self.answer.value),
            category=str(self.category.value or "general"),
            user_id=self.context.get("userId"),
            guild_id=self.context.get("guildId"),
            username=self.context.get("username"),
        )
        if not result.get("ok"):
            await interaction.response.send_message(
                fallback_error(str(result.get("error", "unknown error"))),
                ephemeral=True,
            )
            return

        await interaction.response.send_message(
            "학습했어. 다음에 비슷한 말이 오면 이 답변을 먼저 참고할게.",
            ephemeral=True,
        )


class TeachView(discord.ui.View):
    def __init__(self, question: str, context: dict[str, str | None]):
        super().__init__(timeout=600)
        self.question = question
        self.context = context

    @discord.ui.button(label="가르치기", style=discord.ButtonStyle.primary)
    async def teach_button(self, interaction: discord.Interaction, _button: discord.ui.Button) -> None:
        await interaction.response.send_modal(TeachModal(self.question, self.context))

    @discord.ui.button(label="괜찮아", style=discord.ButtonStyle.secondary)
    async def dismiss_button(self, interaction: discord.Interaction, _button: discord.ui.Button) -> None:
        for item in self.children:
            item.disabled = True
        await interaction.response.edit_message(view=self)


def maybe_teach_view(result: dict[str, Any], message: discord.Message) -> TeachView | None:
    if not result.get("learnable"):
        return None
    context = {
        "userId": str(message.author.id),
        "guildId": str(message.guild.id) if message.guild else None,
        "username": message.author.name,
    }
    return TeachView(str(result.get("question") or message.content), context)


@bot.event
async def on_ready():
    status = await call_udon({"action": "status"})
    if status.get("ok"):
        engine_status = status.get("status", {})
        logger.info(
            "Bot ready: %s / backend: Udon_M1 / cases: %s",
            bot.user,
            engine_status.get("conversationCases"),
        )
    else:
        logger.warning("Bot ready but Udon_M1 status failed: %s", status.get("error"))


@bot.command(name=CMD_STATUS)
async def status(ctx):
    data = await call_udon({"action": "status"})
    if not data.get("ok"):
        await ctx.send(fallback_error(str(data.get("error", "unknown error"))))
        return

    s = data.get("status", {})
    await ctx.send(
        "AI status\n"
        "- backend: `Udon_M1`\n"
        f"- triggers: `{', '.join(BOT_TRIGGERS)}`\n"
        f"- node: `{NODE_BIN}` / available: `{node_available()}`\n"
        f"- conversation cases: `{s.get('conversationCases', '?')}`\n"
        f"- knowledge documents: `{s.get('knowledgeDocuments', '?')}`"
    )


@bot.command(name=CMD_LEARN)
async def learn(ctx, *, content: str):
    if "=>" in content:
        question, answer = [part.strip() for part in content.split("=>", 1)]
    elif "->" in content:
        question, answer = [part.strip() for part in content.split("->", 1)]
    else:
        await ctx.send("형식은 이렇게 써줘: `/학습 질문 => 원하는 답변`")
        return

    result = await teach_udon(
        question,
        answer,
        user_id=str(ctx.author.id),
        guild_id=str(ctx.guild.id) if ctx.guild else None,
        username=ctx.author.name,
    )
    if not result.get("ok"):
        await ctx.send(fallback_error(str(result.get("error", "unknown error"))))
        return
    await ctx.send("학습 완료. 다음에 비슷한 말이 오면 이 답변을 먼저 참고할게.")


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("값이 빠졌어. 예: `/학습 질문 => 원하는 답변`")
    elif isinstance(error, commands.CommandNotFound):
        return
    else:
        logger.exception("Command error: %s", error)
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

    if starts_with_trigger and trigger:
        content = content[len(trigger) :].strip()
    elif is_mentioned:
        content = remove_bot_mention(content)

    if not content:
        await message.reply("응? 뭐라고 말해줘.", mention_author=False)
        return

    lock = channel_locks.setdefault(message.channel.id, asyncio.Lock())
    async with lock:
        async with message.channel.typing():
            result = await ask_udon(content, message)

        if not result.get("ok"):
            await message.reply(fallback_error(str(result.get("error", "unknown error"))), mention_author=False)
            return

        replies = chunk_reply(str(result.get("text") or "답변이 비어 있어. 다시 말해줘."))
        view = maybe_teach_view(result, message)
        await message.reply(replies[0], view=view, mention_author=False)
        for extra in replies[1:]:
            await message.channel.send(extra)


bot.run(DISCORD_TOKEN, log_level=getattr(logging, DISCORD_LOG_LEVEL, logging.WARNING))

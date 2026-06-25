import os
import discord
import random
from discord.ext import commands
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

client = Groq(api_key=GROQ_API_KEY)

MODEL = "llama-3.3-70b-versatile"

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# 🧠 채널 기억 저장
memory = {}

# ⚡ 반응 확률 (0~1)
REPLY_CHANCE = 0.35


def ask_ai(channel_id, user_msg):
    if channel_id not in memory:
        memory[channel_id] = []

    history = memory[channel_id]

    messages = [
        {
            "role": "system",
            "content": "너는 친구처럼 말하는 AI야. 반말, 짧고 자연스럽게 말해. 너무 AI처럼 말하지 마."
        }
    ]

    messages += history[-12:]
    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.8
    )

    reply = response.choices[0].message.content

    # 기억 저장
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": reply})

    memory[channel_id] = history

    return reply


@bot.event
async def on_ready():
    print(f"🔥 봇 실행됨: {bot.user}")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    content = message.content.strip()

    # 🍜 1. "떡볶이" 있으면 무조건 반응
    force_reply = False

    if content.startswith("떡볶이"):
        force_reply = True
        content = content.replace("떡볶이", "", 1).strip()

    # 🍜 2. 없으면 랜덤 확률로 반응
    if not force_reply:
        if random.random() > REPLY_CHANCE:
            return

    # 아무 내용 없으면 무시
    if not content:
        return

    async with message.channel.typing():
        reply = ask_ai(message.channel.id, content)

        if len(reply) > 2000:
            reply = reply[:1990] + "..."

        await message.reply(reply)

    await bot.process_commands(message)


bot.run(DISCORD_TOKEN)
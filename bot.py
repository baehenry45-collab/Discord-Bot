import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
from openai import AsyncOpenAI  # OpenRouter는 OpenAI 호환 API

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# OpenRouter 클라이언트 (Gemma 4 12B 지원)
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

MODEL = "google/gemma-4-12b-it"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# 채널별 대화 기억
memory = {}

async def ask_ai(channel_id, user_msg):
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

    response = await client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.8,
        max_tokens=1000,
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

    # ✅ 봇에게 답장(Reply)할 때만 반응
    is_reply_to_bot = (
        message.reference is not None
        and message.reference.resolved is not None
        and message.reference.resolved.author == bot.user
    )

    if not is_reply_to_bot:
        await bot.process_commands(message)
        return

    content = message.content.strip()
    if not content:
        return

    async with message.channel.typing():
        reply = await ask_ai(message.channel.id, content)
        if len(reply) > 2000:
            reply = reply[:1990] + "..."
        await message.reply(reply)

    await bot.process_commands(message)

bot.run(DISCORD_TOKEN)

import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
import google.generativeai as genai
import asyncio

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=GOOGLE_API_KEY)

MODEL = "gemini-2.0-flash"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

memory = {}

async def ask_ai(channel_id, user_msg):
    if channel_id not in memory:
        memory[channel_id] = []

    history = memory[channel_id]

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction="너는 친구처럼 말하는 AI야. 반말, 짧고 자연스럽게 말해. 너무 AI처럼 말하지 마."
    )

    chat_history = []
    for msg in history[-12:]:
        role = "user" if msg["role"] == "user" else "model"
        chat_history.append({"role": role, "parts": [msg["content"]]})

    chat = model.start_chat(history=chat_history)

    # 블로킹 함수를 async로 실행
    response = await asyncio.to_thread(chat.send_message, user_msg)
    reply = response.text

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
        try:
            reply = await ask_ai(message.channel.id, content)
            if len(reply) > 2000:
                reply = reply[:1990] + "..."
            await message.reply(reply)
        except Exception as e:
            await message.reply(f"오류 발생: {e}")

    await bot.process_commands(message)

bot.run(DISCORD_TOKEN)

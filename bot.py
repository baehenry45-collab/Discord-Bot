import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
from google import genai
from google.genai import types
import asyncio
import json

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

client = genai.Client(api_key=GOOGLE_API_KEY)
MODEL = "gemini-2.0-flash"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

# 채널별 대화 기억
memory = {}

# 학습 데이터 (봇 성격/지식 추가)
learned = []

def build_system_prompt():
    base = "너는 친구처럼 말하는 AI야. 반말, 짧고 자연스럽게 말해. 너무 AI처럼 말하지 마."
    if learned:
        extra = "\n\n추가로 알고 있는 것들:\n" + "\n".join(f"- {x}" for x in learned)
        return base + extra
    return base

async def ask_ai(channel_id, user_msg):
    if channel_id not in memory:
        memory[channel_id] = []

    history = memory[channel_id]

    contents = []
    for msg in history[-12:]:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_msg)]))

    config = types.GenerateContentConfig(
        system_instruction=build_system_prompt(),
        temperature=0.8,
        max_output_tokens=1000,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=MODEL,
        contents=contents,
        config=config,
    )

    reply = response.text

    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": reply})
    memory[channel_id] = history

    return reply

@bot.event
async def on_ready():
    print(f"🔥 봇 실행됨: {bot.user}")

@bot.command(name="학습")
async def learn(ctx, *, content: str):
    learned.append(content)
    await ctx.send(f"✅ 학습 완료: {content}")

@bot.command(name="학습목록")
async def learn_list(ctx):
    if not learned:
        await ctx.send("아직 학습한 게 없어!")
        return
    msg = "\n".join(f"{i+1}. {x}" for i, x in enumerate(learned))
    await ctx.send(f"📚 학습 목록:\n{msg}")

@bot.command(name="학습삭제")
async def learn_delete(ctx, index: int):
    if index < 1 or index > len(learned):
        await ctx.send("없는 번호야!")
        return
    removed = learned.pop(index - 1)
    await ctx.send(f"🗑️ 삭제됨: {removed}")

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # 봇에게 답장할 때만 반응
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

    print(f"📨 답장 감지: {message.author} -> {content}")  # 디버그용

    async with message.channel.typing():
        try:
            reply = await ask_ai(message.channel.id, content)
            if len(reply) > 2000:
                reply = reply[:1990] + "..."
            await message.reply(reply)
        except Exception as e:
            print(f"❌ 오류: {e}")
            await message.reply(f"오류 발생했어: {e}")

    await bot.process_commands(message)

bot.run(DISCORD_TOKEN)

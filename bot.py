import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
from google import genai
from google.genai import types
import asyncio

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

client = genai.Client(api_key=GOOGLE_API_KEY)
MODEL = "gemini-2.0-flash-lite"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

memory = {}
learned = []

def build_system_prompt():
    base = "너는 떡볶이라는 이름의 AI야. 친구처럼 반말로 짧고 자연스럽게 말해. 너무 AI처럼 말하지 마."
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

    content = message.content.strip()

    # 멘션 감지
    is_mentioned = bot.user in message.mentions

    # 답장 감지
    is_reply_to_bot = False
    if message.reference and message.reference.message_id:
        try:
            ref_msg = await message.channel.fetch_message(message.reference.message_id)
            if ref_msg.author == bot.user:
                is_reply_to_bot = True
        except:
            pass

    # "떡볶이"로 시작하는 메시지 감지
    starts_with_trigger = content.startswith("떡볶이")

    if not is_mentioned and not is_reply_to_bot and not starts_with_trigger:
        await bot.process_commands(message)
        return

    # 트리거 단어/멘션 제거
    if starts_with_trigger:
        content = content[len("떡볶이"):].strip()
    elif is_mentioned:
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
            await message.reply(f"오류 발생했어: {e}")

    await bot.process_commands(message)

bot.run(DISCORD_TOKEN)

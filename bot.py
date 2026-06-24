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
        return f"\uc9c0\uae08 Gemini \uc694\uccad \uc81c\ud55c\uc5d0 \uac78\ub838\uc5b4. {remain}\ucd08 \ub4a4\uc5d0 \ub2e4\uc2dc \ub9d0 \uac78\uc5b4\uc918."

    user_msg = clean_text(user_msg, MAX_INPUT_CHARS)
    history = memory[channel_id]
    contents = to_gemini_contents(history, user_msg)
    max_tokens = MAX_DEEP_OUTPUT_TOKENS if wants_deeper_answer(user_msg) else MAX_OUTPUT_TOKENS

    config = types.GenerateContentConfig(
        system_instruction=build_system_prompt(user_msg),
        temperature=0.72,
        max_output_tokens=max_tokens,
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
            logger.warning("Gemini quota/rate limit: %s", error)
            return f"\uc9c0\uae08 Gemini \uc0ac\uc6a9\ub7c9\uc774\ub098 \uc694\uccad \uc81c\ud55c\uc5d0 \uac78\ub9b0 \uac83 \uac19\uc544. {delay}\ucd08 \ub4a4\uc5d0 \ub2e4\uc2dc \ud574\uc918."
        raise

    reply = clean_text(
        getattr(response, "text", "") or "\ub2f5\uc774 \ube44\uc5b4 \uc788\uc5b4. \ub2e4\uc2dc \ub9d0\ud574\uc918.",
        1900,
    )

    history.append({"role": "user", "content": user_msg})
    history.append({"role": "model", "content": reply})
    return reply


@bot.event
async def on_ready():
    logger.info("Bot ready: %s / model: %s", bot.user, MODEL)


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
    starts_with_trigger = content.startswith(BOT_TRIGGER)
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
        content = content[len(BOT_TRIGGER) :].strip()
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

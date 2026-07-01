require("./bot");

const path = require("path");
const {
    Client,
    GatewayIntentBits,
    Events
} = require("discord.js");

const { createUdonAIM1 } = require("./src/core/engine");

const engine = createUdonAIM1({
    rootDir: __dirname,
    memoryDir: path.join(__dirname, "memory")
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} 온라인`);
});

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    try {

        const result = await engine.answer(message.content, {
            userId: message.author.id,
            guildId: message.guild?.id
        });

        await message.reply(result.text);

    } catch (err) {

        console.error(err);

        await message.reply("❌ 오류가 발생했습니다.");

    }

});

client.login(process.env.DISCORD_TOKEN);

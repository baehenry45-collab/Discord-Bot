require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} 로그인 완료`);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
        const res = await fetch("http://127.0.0.1:3000/v1/answer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: message.content,
                context: {
                    userId: message.author.id,
                    guildId: message.guild?.id
                }
            })
        });

        const data = await res.json();

        if (data.text)
            await message.reply(data.text);

    } catch (err) {
        console.error(err);
        await message.reply("❌ Udon_M1 엔진에 연결하지 못했습니다.");
    }
});

client.login(process.env.DISCORD_TOKEN);

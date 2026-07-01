const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`${client.user.tag} 로그인 완료`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    try {
        const res = await fetch("http://127.0.0.1:3000/v1/answer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: message.content
            })
        });

        const data = await res.json();

        await message.reply(data.text);
    } catch (err) {
        console.error(err);
        await message.reply("엔진에 연결하지 못했습니다.");
    }
});

client.login(process.env.DISCORD_TOKEN);

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

const settings = {
    spice: "normal",
    style: "normal"
};

client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} 온라인`);
});

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    if (message.content.startsWith("/강도 ")) {

        const value = message.content.replace("/강도 ","").trim();

        settings.spice = value;

        return message.reply(`🌶️ 강도를 **${value}** 로 변경했습니다.`);
    }

    if (message.content.startsWith("/말투 ")) {

        const value = message.content.replace("/말투 ","").trim();

        settings.style = value;

        return message.reply(`🎭 말투를 **${value}** 로 변경했습니다.`);
    }

    if (message.content === "/설정") {

        return message.reply(
`현재 설정

🌶️ 강도 : ${settings.spice}

🎭 말투 : ${settings.style}`
        );

    }

    try {

        let prompt = message.content;

        if(settings.spice==="순한맛")
            prompt="친절하고 부드럽게 답변해.\n"+prompt;

        if(settings.spice==="매운맛")
            prompt="조금 직설적이고 재밌게 답변해.\n"+prompt;

        if(settings.spice==="핵매운맛")
            prompt="유머를 많이 섞고 자신감 있게 답변해.\n"+prompt;

        if(settings.style==="귀여움")
            prompt="귀엽게 말해.\n"+prompt;

        if(settings.style==="떡볶이")
            prompt="떡볶이를 좋아하는 캐릭터처럼 말해.\n"+prompt;

        if(settings.style==="AI")
            prompt="AI 비서처럼 말해.\n"+prompt;

        const result = await engine.answer(prompt,{
            userId:message.author.id,
            guildId:message.guild?.id
        });

        await message.reply(result.text);

    } catch(err){

        console.error(err);

        message.reply("❌ 오류가 발생했습니다.");

    }

});

client.login(process.env.DISCORD_TOKEN);

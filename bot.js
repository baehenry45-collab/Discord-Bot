const path = require("path");
const fs = require("fs");

const {
    Client,
    GatewayIntentBits,
    Events,
    EmbedBuilder
} = require("discord.js");

const { createUdonAIM1 } = require("./src/core/engine");

const engine = createUdonAIM1({
    rootDir: __dirname,
    memoryDir: path.join(__dirname, "memory")
});

const SETTINGS_FILE = path.join(__dirname, "memory", "settings.json");

function loadSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, "{}");
            return {};
        }

        return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));

    } catch {

        return {};

    }
}

function saveSettings(data) {

    fs.writeFileSync(
        SETTINGS_FILE,
        JSON.stringify(data, null, 4)
    );

}

const settings = loadSettings();

function guildData(id) {

    if (!settings[id]) {

        settings[id] = {

            spice: "일반맛",
            style: "AI"

        };

        saveSettings(settings);

    }

    return settings[id];

}

function buildPrompt(setting, text) {

    let prompt = "";

    switch(setting.spice){

        case "순한맛":
            prompt += "매우 친절하고 부드럽게 대답해.\n";
            break;

        case "매운맛":
            prompt += "조금 직설적이고 자신감 있게 대답해.\n";
            break;

        case "핵매운맛":
            prompt += "유머를 섞어서 아주 시원하게 대답해.\n";
            break;

        default:
            prompt += "";
            break;

    }

    switch(setting.style){

        case "귀여움":
            prompt += "귀엽게 말해.\n";
            break;

        case "떡볶이":
            prompt += "떡볶이를 엄청 좋아하는 캐릭터처럼 말해.\n";
            break;

        case "존댓말":
            prompt += "항상 존댓말을 사용해.\n";
            break;

        case "시크":
            prompt += "짧고 시크하게 말해.\n";
            break;

        case "AI":
            prompt += "AI 비서처럼 정확하게 대답해.\n";
            break;

    }

    return prompt + text;

}

const client = new Client({

    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]

});

client.once(Events.ClientReady,()=>{

    console.log("================================");
    console.log("Udon_M1 Discord Connected");
    console.log(client.user.tag);
    console.log("================================");

});

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    const guildId = message.guild?.id || "dm";
    const config = guildData(guildId);

    // ===========================
    // /강도
    // ===========================

    if (message.content.startsWith("/강도 ")) {

        const value = message.content.replace("/강도 ", "").trim();

        const allow = [
            "순한맛",
            "일반맛",
            "매운맛",
            "핵매운맛"
        ];

        if (!allow.includes(value)) {

            return message.reply(
                "사용 가능 : 순한맛 / 일반맛 / 매운맛 / 핵매운맛"
            );

        }

        config.spice = value;

        saveSettings(settings);

        return message.reply(
            `🌶️ AI 강도가 **${value}** 로 변경되었습니다.`
        );

    }

    // ===========================
    // /말투
    // ===========================

    if (message.content.startsWith("/말투 ")) {

        const value = message.content.replace("/말투 ", "").trim();

        const allow = [
            "AI",
            "귀여움",
            "떡볶이",
            "존댓말",
            "시크"
        ];

        if (!allow.includes(value)) {

            return message.reply(
                "사용 가능 : AI / 귀여움 / 떡볶이 / 존댓말 / 시크"
            );

        }

        config.style = value;

        saveSettings(settings);

        return message.reply(
            `🎭 말투가 **${value}** 로 변경되었습니다.`
        );

    }

    // ===========================
    // /설정
    // ===========================

    if (message.content === "/설정") {

        const embed = new EmbedBuilder()

            .setTitle("⚙ 현재 AI 설정")

            .setDescription(
`🌶 강도 : **${config.spice}**

🎭 말투 : **${config.style}**`
            )

            .setColor(0x00b894);

        return message.reply({
            embeds:[embed]
        });

    }

    // ===========================
    // /상태
    // ===========================

    if (message.content === "/상태") {

        const status = engine.status();

        const embed = new EmbedBuilder()

            .setTitle("🤖 Udon_M1 상태")

            .addFields(

                {
                    name:"엔진",
                    value:status.name,
                    inline:true
                },

                {
                    name:"Provider",
                    value:status.provider.type,
                    inline:true
                },

                {
                    name:"Knowledge",
                    value:String(status.knowledgeDocuments),
                    inline:true
                }

            )

            .setColor(0x3498db);

        return message.reply({
            embeds:[embed]
        });

    }

    // ===========================
    // 일반 채팅
    // ===========================

    try {

        const prompt = buildPrompt(
            config,
            message.content
        );

        const result = await engine.answer(prompt,{
            userId:message.author.id,
            guildId
        });

        let text = result.text || "답변을 생성하지 못했습니다.";

        if(text.length > 1900){

            while(text.length){

                await message.channel.send(
                    text.slice(0,1900)
                );

                text = text.slice(1900);

            }

        }else{

            await message.reply(text);

        }

    } catch(err){

        console.error(err);

        message.reply("❌ AI 처리 중 오류가 발생했습니다.");

    }

});

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

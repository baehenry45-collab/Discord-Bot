require("dotenv").config();

const path = require("path");
const fs = require("fs");

const {
    Client,
    GatewayIntentBits,
    Events,
    EmbedBuilder
} = require("discord.js");

const { createUdonAIM1 } = require("./src/core/engine");

// =====================================
// Udon_M1 Engine
// =====================================

const engine = createUdonAIM1({

    rootDir: __dirname,

    memoryDir: path.join(__dirname, "memory")

});

// =====================================
// Discord Client
// =====================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent

    ]

});

// =====================================
// Settings
// =====================================

const SETTINGS_FILE = path.join(

    __dirname,

    "memory",

    "settings.json"

);

function loadSettings() {

    try {

        if (!fs.existsSync(SETTINGS_FILE)) {

            fs.mkdirSync(path.dirname(SETTINGS_FILE), {
                recursive: true
            });

            fs.writeFileSync(

                SETTINGS_FILE,

                "{}"

            );

        }

        return JSON.parse(

            fs.readFileSync(

                SETTINGS_FILE,

                "utf8"

            )

        );

    } catch (err) {

        console.log(err);

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

// =====================================
// Prompt Builder
// =====================================

function buildPrompt(config, text) {

    let prompt = "";

    switch (config.spice) {

        case "순한맛":

            prompt +=
                "매우 친절하게 대답해.\n";

            break;

        case "매운맛":

            prompt +=
                "조금 직설적으로 대답해.\n";

            break;

        case "핵매운맛":

            prompt +=
                "유머를 섞어서 시원하게 말해.\n";

            break;

    }

    switch (config.style) {

        case "귀여움":

            prompt +=
                "귀엽게 말해.\n";

            break;

        case "떡볶이":

            prompt +=
                "떡볶이를 좋아하는 캐릭터처럼 말해.\n";

            break;

        case "존댓말":

            prompt +=
                "항상 존댓말을 사용해.\n";

            break;

        case "시크":

            prompt +=
                "짧고 시크하게 말해.\n";

            break;

        default:

            prompt +=
                "AI 비서처럼 정확하게 답변해.\n";

    }

    return prompt + text;

}

// =====================================
// Ready
// =====================================

client.once(Events.ClientReady, () => {

    console.log("==================================");

    console.log(client.user.tag);

    console.log("Discord Connected");

    console.log("==================================");

});

// =====================================
// Message Event
// =====================================

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    const guildId = message.guild?.id || "dm";

    const config = guildData(guildId);

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
        // =====================================
    // /강도
    // =====================================

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
            `🌶️ AI 강도를 **${value}**(으)로 변경했습니다.`
        );

    }

    // =====================================
    // /말투
    // =====================================

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
            `🎭 말투를 **${value}**(으)로 변경했습니다.`
        );

    }

    // =====================================
    // /설정
    // =====================================

    if (message.content === "/설정") {

        const embed = new EmbedBuilder()

            .setTitle("⚙ 현재 AI 설정")

            .setDescription(

`🌶️ 강도 : **${config.spice}**

🎭 말투 : **${config.style}**`

            )

            .setColor(0x00b894);

        return message.reply({

            embeds: [embed]

        });

    }

    // =====================================
    // /초기화
    // =====================================

    if (message.content === "/초기화") {

        settings[guildId] = {

            spice: "일반맛",

            style: "AI"

        };

        saveSettings(settings);

        return message.reply(
            "✅ 설정을 기본값으로 초기화했습니다."
        );

    }

    // =====================================
    // /상태
    // =====================================

    if (message.content === "/상태") {

        const status = engine.status();

        const embed = new EmbedBuilder()

            .setTitle("🤖 Udon_M1 상태")

            .addFields(

                {
                    name: "Engine",
                    value: status.name,
                    inline: true
                },

                {
                    name: "Knowledge",
                    value: String(status.knowledgeDocuments),
                    inline: true
                },

                {
                    name: "Cases",
                    value: String(status.conversationCases),
                    inline: true
                }

            )

            .setColor(0x3498db);

        return message.reply({

            embeds: [embed]

        });

    }

    // =====================================
    // /도움말
    // =====================================

    if (message.content === "/도움말") {

        const embed = new EmbedBuilder()

            .setTitle("📖 Udon_M1 도움말")

            .setColor(0x5865F2)

            .addFields(

                {
                    name: "🌶️ 강도",
                    value:
"/강도 순한맛\n/강도 일반맛\n/강도 매운맛\n/강도 핵매운맛"
                },

                {
                    name: "🎭 말투",
                    value:
"/말투 AI\n/말투 귀여움\n/말투 떡볶이\n/말투 존댓말\n/말투 시크"
                },

                {
                    name: "⚙ 기타",
                    value:
"/설정\n/상태\n/초기화\n/학습 질문 | 답변"
                }

            );

        return message.reply({

            embeds: [embed]

        });

    }
    // =====================================
    // /학습
    // =====================================

    if (message.content.startsWith("/학습 ")) {

        const raw = message.content.replace("/학습 ", "");
        const split = raw.split("|");

        if (split.length !== 2) {

            return message.reply(
                "사용법\n/학습 질문 | 답변"
            );

        }

        const question = split[0].trim();
        const answer = split[1].trim();

        try {

            engine.teach({

                question,

                answer,

                category: "discord",

                method: "manual"

            });

            return message.reply(
                "✅ 학습이 완료되었습니다."
            );

        } catch (err) {

            console.error(err);

            return message.reply(
                "❌ 학습 실패"
            );

        }

    }

    // =====================================
    // 긴 답변 함수
    // =====================================

    async function sendLong(text) {

        while (text.length > 0) {

            const part = text.substring(0, 1900);

            text = text.substring(1900);

            await message.channel.send(part);

        }

    }

    // =====================================
    // 봇 멘션
    // =====================================

    if (message.mentions.has(client.user)) {

        try {

            await message.channel.sendTyping();

            const prompt = buildPrompt(

                config,

                message.content
                    .replace(`<@${client.user.id}>`, "")
                    .trim()

            );

            const result = await engine.answer(prompt, {

                userId: message.author.id,

                guildId,

                username: message.author.username,

                mention: true

            });

            const answer = result.text || "답변이 없습니다.";

            if (answer.length > 1900) {

                await sendLong(answer);

            } else {

                await message.reply(answer);

            }

            return;

        } catch (err) {

            console.error(err);

            return message.reply(
                "❌ 멘션 처리 실패"
            );

        }

    }

    // =====================================
    // 일반 AI 답변
    // =====================================

    try {

        await message.channel.sendTyping();

        const prompt = buildPrompt(
            config,
            message.content
        );

        const result = await engine.answer(prompt, {

            userId: message.author.id,

            guildId,

            username: message.author.username,

            channelId: message.channel.id

        });

        const answer = result.text || "답변을 생성하지 못했습니다.";

        if (answer.length > 1900) {

            await sendLong(answer);

        } else {

            await message.reply(answer);

        }

    } catch (err) {

        console.error(err);

        await message.reply(
            "❌ AI 처리 중 오류가 발생했습니다."
        );

    }

});

client.login(process.env.DISCORD_TOKEN);

// ======================================================
// bot.js Rewrite Part 1
// ======================================================

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    ActivityType
} = require("discord.js");

const { createUdonAIM1 } = require("./src/core/engine");

const engine = createUdonAIM1({

    rootDir: __dirname,

    memoryDir: path.join(__dirname, "memory")

});

const SETTINGS_FILE = path.join(
    __dirname,
    "memory",
    "settings.json"
);

function loadSettings() {

    try {

        if(!fs.existsSync(SETTINGS_FILE)){

            fs.writeFileSync(
                SETTINGS_FILE,
                "{}"
            );

            return {};

        }

        return JSON.parse(

            fs.readFileSync(
                SETTINGS_FILE,
                "utf8"
            )

        );

    }catch{

        return {};

    }

}

function saveSettings(data){

    fs.writeFileSync(

        SETTINGS_FILE,

        JSON.stringify(
            data,
            null,
            4
        )

    );

}

const settings = loadSettings();

function guildData(id){

    if(!settings[id]){

        settings[id]={

            spice:"일반맛",

            style:"AI",

            humor:50,

            iq:100,

            kindness:50,

            memory:true

        };

        saveSettings(settings);

    }

    return settings[id];

}

const client = new Client({

    intents:[

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent

    ]

});

client.once(
    Events.ClientReady,
    ()=>{

        console.log("======================");
        console.log("Udon_M1 ONLINE");
        console.log(client.user.tag);
        console.log("======================");

        client.user.setPresence({

            activities:[

                {

                    name:"Udon_M1 AI",

                    type:ActivityType.Playing

                }

            ],

            status:"online"

        });

    }
);

function buildPrompt(config,text){

    let prompt="";

    switch(config.spice){

        case "순한맛":

            prompt+="친절하고 부드럽게 대답해.\n";

            break;

        case "매운맛":

            prompt+="조금 직설적으로 대답해.\n";

            break;

        case "핵매운맛":

            prompt+="유머와 자신감을 섞어서 대답해.\n";

            break;

    }

    switch(config.style){

        case "귀여움":

            prompt+="귀엽게 말해.\n";

            break;

        case "존댓말":

            prompt+="항상 존댓말.\n";

            break;

        case "떡볶이":

            prompt+="떡볶이를 좋아하는 캐릭터처럼.\n";

            break;

        case "시크":

            prompt+="짧고 시크하게.\n";

            break;

        default:

            prompt+="AI 비서처럼 정확하게.\n";

    }

    prompt+=`유머:${config.humor}\n`;
    prompt+=`친절:${config.kindness}\n`;
    prompt+=`IQ:${config.iq}\n`;

    return prompt+"\n"+text;

}

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    const guildId = message.guild?.id || "dm";
    const config = guildData(guildId);

    // ==========================
    // 명령어
    // ==========================

    if (message.content === "/도움말") {

        const embed = new EmbedBuilder()

            .setTitle("🤖 Udon_M1 명령어")

            .setColor(0x5865F2)

            .setDescription(`

/강도 순한맛
/강도 일반맛
/강도 매운맛
/강도 핵매운맛

/말투 AI
/말투 귀여움
/말투 떡볶이
/말투 존댓말
/말투 시크

/설정
/초기화
/상태

`);

        return message.reply({
            embeds:[embed]
        });

    }

    if(message.content.startsWith("/강도 ")){

        const value = message.content.replace("/강도 ","").trim();

        const allow=[

            "순한맛",
            "일반맛",
            "매운맛",
            "핵매운맛"

        ];

        if(!allow.includes(value))
            return message.reply("순한맛 / 일반맛 / 매운맛 / 핵매운맛");

        config.spice=value;

        saveSettings(settings);

        return message.reply(
            `🌶️ 강도를 **${value}** 로 변경했습니다.`
        );

    }

    if(message.content.startsWith("/말투 ")){

        const value=message.content.replace("/말투 ","").trim();

        const allow=[

            "AI",
            "귀여움",
            "떡볶이",
            "존댓말",
            "시크"

        ];

        if(!allow.includes(value))
            return message.reply("AI / 귀여움 / 떡볶이 / 존댓말 / 시크");

        config.style=value;

        saveSettings(settings);

        return message.reply(
            `🎭 말투를 **${value}** 로 변경했습니다.`
        );

    }

    if(message.content==="/설정"){

        const embed=new EmbedBuilder()

        .setTitle("⚙ 현재 설정")

        .addFields(

            {

                name:"🌶 강도",

                value:config.spice,

                inline:true

            },

            {

                name:"🎭 말투",

                value:config.style,

                inline:true

            },

            {

                name:"😂 유머",

                value:String(config.humor),

                inline:true

            },

            {

                name:"😊 친절",

                value:String(config.kindness),

                inline:true

            },

            {

                name:"🧠 IQ",

                value:String(config.iq),

                inline:true

            }

        )

        .setColor(0x2ecc71);

        return message.reply({

            embeds:[embed]

        });

    }

    if(message.content==="/초기화"){

        settings[guildId]={

            spice:"일반맛",

            style:"AI",

            humor:50,

            kindness:50,

            iq:100,

            memory:true

        };

        saveSettings(settings);

        return message.reply(
            "✅ 설정을 초기화했습니다."
        );

    }

    if(message.content==="/상태"){

        const status=engine.status();

        return message.reply({

            embeds:[

                new EmbedBuilder()

                .setTitle("🤖 엔진 상태")

                .addFields(

                    {

                        name:"Engine",

                        value:status.name,

                        inline:true

                    },

                    {

                        name:"Knowledge",

                        value:String(status.knowledgeDocuments),

                        inline:true

                    },

                    {

                        name:"Cases",

                        value:String(status.conversationCases),

                        inline:true

                    }

                )

                .setColor(0x3498db)

            ]

        });

    }

    // ==========================
    // AI 답변
    // ==========================

    try{

        await message.channel.sendTyping();

        const prompt=buildPrompt(
            config,
            message.content
        );

        const result=await engine.answer(prompt,{

            userId:message.author.id,

            guildId,

            username:message.author.username

        });

        let text=result.text||"답변을 생성하지 못했습니다.";

        while(text.length){

            const part=text.substring(0,1900);

            text=text.substring(1900);

            if(text.length===0){

                await message.reply(part);

            }else{

                await message.channel.send(part);

            }

        }

    }catch(err){

        console.error(err);

        message.reply("❌ AI 오류가 발생했습니다.");

    }

});

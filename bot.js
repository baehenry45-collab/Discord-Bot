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

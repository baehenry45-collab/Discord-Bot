import "dotenv/config";
import fs from "fs";
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { GoogleGenAI } from "@google/genai";

// ===== AI =====
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ===== Discord =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== server (Railway) =====
const app = express();

app.get("/", (req, res) => {
  res.send("TteokAI running 🚀");
});

app.listen(process.env.PORT || 3000);

// ===== memory =====
const FILE = "./memory/memory.json";

function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

let memory = load();

// ===== styles =====
const styles = {
  기본: "친절하고 자연스럽게 답변",
  불닭맛: "매우 텐션 높고 과장된 말투",
  차분: "짧고 차분하게 말함",
  존댓말: "항상 존댓말",
  광기: "재미있고 약간 미친 텐션"
};

// ===== AI =====
async function askAI(id, text) {
  const user = memory[id] || { history: [], style: "기본" };
  const style = styles[user.style] || styles["기본"];

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `
${style}

대화:
${JSON.stringify(user.history.slice(-8))}

유저: ${text}
            `
          }
        ]
      }
    ],
  });

  const reply =
    result.candidates?.[0]?.content?.parts?.[0]?.text ||
    "응답 실패";

  memory[id] = {
    style: user.style,
    history: [
      ...user.history,
      { role: "user", parts: [{ text }] },
      { role: "model", parts: [{ text: reply }] }
    ].slice(-30)
  };

  save(memory);

  return reply;
}

// ===== message =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const content = message.content;

  if (content.startsWith("!말투 ")) {
    const style = content.replace("!말투 ", "");

    if (!styles[style]) {
      return message.reply("기본/불닭맛/차분/존댓말/광기");
    }

    memory[id] = memory[id] || { history: [], style: "기본" };
    memory[id].style = style;
    save(memory);

    return message.reply(`말투 변경: ${style}`);
  }

  if (content === "!reset") {
    memory[id] = { history: [], style: "기본" };
    save(memory);
    return message.reply("초기화 완료");
  }

  try {
    const reply = await askAI(id, content);
    message.reply(reply);
  } catch (e) {
    console.error(e);
    message.reply("에러");
  }
});

client.login(process.env.DISCORD_TOKEN);



async function askAI(id, text) {
  try {
    const user = memory[id] || { history: [], style: "기본" };
    const style = styles[user.style] || styles["기본"];

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
${style}

유저: ${text}
              `
            }
          ]
        }
      ],
    });

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "응답 실패";
  } catch (e) {
    console.log("Gemini 오류:", e);

    // ⭐ fallback (중요)
    return "지금 AI 요청이 너무 많아서 잠시 못 쓰는 중이에요 😢";
  }
}

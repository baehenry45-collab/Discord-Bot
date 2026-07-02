import "dotenv/config";
import fs from "fs";
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { GoogleGenAI } from "@google/genai";

// =====================
// 🌐 Railway 유지 서버
// =====================
const app = express();
app.get("/", (_, res) => res.send("Bot is running 🚀"));
app.listen(process.env.PORT || 3000);

// =====================
// 🤖 Discord 설정
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ["CHANNEL"]
});

// =====================
// 🤖 Gemini
// =====================
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// =====================
// 💾 Memory
// =====================
const FILE = "./memory.json";

function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

let memory = load();

// =====================
// 🎭 말투
// =====================
const styles = {
  기본: "친절하고 자연스럽게 답변",
  불닭맛: "텐션 높고 과장된 말투",
  차분: "짧고 안정적인 말투",
  존댓말: "정중하게 존댓말 사용",
  광기: "재미있고 약간 미친 느낌"
};

// =====================
// 🧠 모델 fallback
// =====================
const models = [
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

// =====================
// 🤖 AI 호출 (완전 안정)
// =====================
async function askAI(id, text) {
  const user = memory[id] || { history: [], style: "기본" };
  const style = styles[user.style] || styles["기본"];

  for (const model of models) {
    try {
      const result = await ai.models.generateContent({
        model,
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
        ]
      });

      const reply =
        result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (reply) return reply;

    } catch (e) {
      console.log(`❌ 모델 실패: ${model}`);
    }
  }

  return "지금 AI가 너무 바빠요 😢";
}

// =====================
// ✂️ 메시지 분할
// =====================
function split(text) {
  const arr = [];
  for (let i = 0; i < text.length; i += 1900) {
    arr.push(text.slice(i, i + 1900));
  }
  return arr;
}

// =====================
// 🚀 ready
// =====================
client.once("ready", () => {
  console.log(`로그인됨: ${client.user.tag}`);
});

// =====================
// 💬 message handler
// =====================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const content = message.content;

  // =====================
  // ⚙️ 말투 변경
  // =====================
  if (content.startsWith("!말투 ")) {
    const style = content.replace("!말투 ", "");

    if (!styles[style]) {
      return message.channel.send("가능: 기본 / 불닭맛 / 차분 / 존댓말 / 광기");
    }

    memory[id] = memory[id] || { history: [], style: "기본" };
    memory[id].style = style;
    save(memory);

    return message.channel.send(`말투 변경됨: ${style}`);
  }

  // =====================
  // 🔄 초기화
  // =====================
  if (content === "!reset") {
    memory[id] = { history: [], style: "기본" };
    save(memory);
    return message.channel.send("기억 초기화 완료");
  }

  // =====================
  // 🤖 AI 응답
  // =====================
  try {
    const reply = await askAI(id, content);

    for (const part of split(reply)) {
      await message.channel.send(part);
    }

    // memory 저장
    const user = memory[id] || { history: [], style: "기본" };

    memory[id] = {
      style: user.style,
      history: [
        ...user.history,
        { role: "user", parts: [{ text: content }] },
        { role: "model", parts: [{ text: reply }] }
      ].slice(-20)
    };

    save(memory);

  } catch (e) {
    console.log(e);
    message.channel.send("에러 발생");
  }
});

// =====================
client.login(process.env.DISCORD_TOKEN);

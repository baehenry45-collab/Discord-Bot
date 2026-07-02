import "dotenv/config";
import fs from "fs";
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { GoogleGenAI } from "@google/genai";

// ======================
// 🤖 Gemini AI
// ======================
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ======================
// 📦 Discord Client
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================
// 🌐 Railway keep-alive
// ======================
const app = express();
app.get("/", (req, res) => res.send("Bot is running 🚀"));
app.listen(process.env.PORT || 3000);

// ======================
// 💾 memory system
// ======================
const FILE = "./memory/memory.json";

function loadMemory() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function saveMemory(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

let memory = loadMemory();

// ======================
// 🎭 말투 시스템
// ======================
const styles = {
  기본: "너는 자연스럽고 친절하게 답하는 AI다.",
  불닭맛: "매우 텐션 높고 과장된 표현을 쓰는 불닭 스타일 AI다.",
  차분: "짧고 조용하고 안정적으로 말한다.",
  존댓말: "항상 정중한 존댓말로 말한다.",
  광기: "재미있고 약간 미친 텐션으로 말하지만 위험하지 않다."
};

// ======================
// 🧠 fallback models (핵심)
// ======================
const models = [
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

// ======================
// 🤖 AI 호출 (핵심 안정형)
// ======================
async function askAI(id, text) {
  const user = memory[id] || { history: [], style: "기본" };
  const style = styles[user.style] || styles["기본"];

  let lastError;

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

이 규칙을 유지하면서 답변해라.

대화 기록:
${JSON.stringify(user.history.slice(-6))}

유저: ${text}
                `
              }
            ]
          }
        ],
      });

      const reply =
        result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (reply) {
        return reply;
      }

    } catch (err) {
      lastError = err;
      console.log(`❌ 모델 실패: ${model}`);
    }
  }

  console.log("❌ 모든 모델 실패:", lastError);

  return "지금 AI 요청이 너무 많아서 잠시 못 써요 😢";
}

// ======================
// ✂️ 메시지 분할
// ======================
function split(text) {
  const arr = [];
  for (let i = 0; i < text.length; i += 1900) {
    arr.push(text.slice(i, i + 1900));
  }
  return arr;
}

// ======================
// 🚀 ready
// ======================
client.once("ready", () => {
  console.log(`로그인됨: ${client.user.tag}`);
});

// ======================
// 💬 message handler
// ======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const content = message.content;

  // ======================
  // ⚙️ 말투 변경
  // ======================
  if (content.startsWith("!말투 ")) {
    const style = content.replace("!말투 ", "");

    if (!styles[style]) {
      return message.reply("가능: 기본 / 불닭맛 / 차분 / 존댓말 / 광기");
    }

    memory[id] = memory[id] || { history: [], style: "기본" };
    memory[id].style = style;
    saveMemory(memory);

    return message.reply(`말투 변경됨: ${style}`);
  }

  // ======================
  // 🔄 초기화
  // ======================
  if (content === "!reset") {
    memory[id] = { history: [], style: "기본" };
    saveMemory(memory);
    return message.reply("기억 초기화 완료");
  }

  // ======================
  // 📌 도움말
  // ======================
  if (content === "!help") {
    return message.reply("!말투 / !reset / 그냥 채팅하면 AI 응답");
  }

  // ======================
  // 🤖 AI 응답
  // ======================
  try {
    const reply = await askAI(id, content);

    for (const part of split(reply)) {
      await message.reply(part);
    }

    // ======================
    // 💾 memory 저장
    // ======================
    const user = memory[id] || { history: [], style: "기본" };

    memory[id] = {
      style: user.style,
      history: [
        ...user.history,
        { role: "user", parts: [{ text: content }] },
        { role: "model", parts: [{ text: reply }] }
      ].slice(-20)
    };

    saveMemory(memory);

  } catch (e) {
    console.log(e);
    message.reply("에러 발생");
  }
});

// ======================
client.login(process.env.DISCORD_TOKEN);

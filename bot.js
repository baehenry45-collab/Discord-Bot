require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

// ===== Gemini 설정 =====
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== 메모리 저장 =====
const MEMORY_FILE = "./memory.json";

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
}

function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

let memory = loadMemory();

// ===== Gemini 응답 =====
async function askGemini(userId, text) {
  const history = memory[userId]?.history || [];

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      ...history,
      { role: "user", parts: [{ text }] }
    ],
  });

  const reply = result.candidates?.[0]?.content?.parts?.[0]?.text
    || "응답 실패";

  // 저장
  memory[userId] = {
    history: [
      ...history,
      { role: "user", parts: [{ text }] },
      { role: "model", parts: [{ text: reply }] }
    ].slice(-20)
  };

  saveMemory(memory);

  return reply;
}

// ===== 메시지 쪼개기 =====
function splitMessage(text) {
  const limit = 1900;
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

// ===== 봇 시작 =====
client.once("ready", () => {
  console.log(`로그인 완료: ${client.user.tag}`);
});

// ===== 메시지 처리 =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content;

  // 도움말
  if (content === "!도움말") {
    return message.reply("!안녕 입력하면 Gemini AI가 답합니다 🤖");
  }

  // 초기화
  if (content === "!초기화") {
    memory[message.author.id] = { history: [] };
    saveMemory(memory);
    return message.reply("메모리 초기화 완료!");
  }

  // AI 응답
  try {
    const reply = await askGemini(message.author.id, content);

    const parts = splitMessage(reply);
    for (const p of parts) {
      await message.reply(p);
    }
  } catch (err) {
    console.error(err);
    message.reply("오류 발생...");
  }
});

client.login(process.env.DISCORD_TOKEN);

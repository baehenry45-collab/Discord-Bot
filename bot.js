require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ADMIN_ID = process.env.ADMIN_ID;
const MEMORY_FILE = "./memory/memory.json";

// ===== memory load/save =====
function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
}

function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

let memory = loadMemory();

// ===== Gemini =====
async function askAI(userId, text) {
  const history = memory[userId]?.history || [];

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      ...history,
      { role: "user", parts: [{ text }] }
    ],
  });

  const reply =
    result.candidates?.[0]?.content?.parts?.[0]?.text ||
    "응답 실패";

  memory[userId] = {
    history: [
      ...history,
      { role: "user", parts: [{ text }] },
      { role: "model", parts: [{ text: reply }] }
    ].slice(-30),
  };

  saveMemory(memory);

  return reply;
}

// ===== split message =====
function split(text) {
  const limit = 1900;
  const arr = [];
  for (let i = 0; i < text.length; i += limit) {
    arr.push(text.slice(i, i + limit));
  }
  return arr;
}

// ===== ready =====
client.once("ready", () => {
  console.log(`로그인 완료: ${client.user.tag}`);
});

// ===== message system =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const content = message.content;

  // =========================
  // 📌 관리자 명령어
  // =========================
  const isAdmin = id === ADMIN_ID;

  if (content === "!shutdown") {
    if (!isAdmin) return message.reply("권한 없음");
    await message.reply("봇 종료합니다.");
    process.exit(0);
  }

  if (content === "!resetall") {
    if (!isAdmin) return message.reply("권한 없음");
    memory = {};
    saveMemory(memory);
    return message.reply("전체 메모리 초기화 완료");
  }

  if (content.startsWith("!say ")) {
    if (!isAdmin) return message.reply("권한 없음");
    const text = content.replace("!say ", "");
    return message.channel.send(text);
  }

  // =========================
  // 📌 일반 명령어
  // =========================
  if (content === "!help") {
    return message.reply(
      "!help, !reset, !ping, !resetall(관리자)"
    );
  }

  if (content === "!ping") {
    return message.reply("pong 🏓");
  }

  if (content === "!reset") {
    memory[id] = { history: [] };
    saveMemory(memory);
    return message.reply("네 기억 초기화됨");
  }

  // =========================
  // 📌 AI 응답 (기본)
  // =========================
  try {
    const reply = await askAI(id, content);

    for (const part of split(reply)) {
      await message.reply(part);
    }
  } catch (err) {
    console.error(err);
    message.reply("AI 오류 발생");
  }
});

client.login(process.env.DISCORD_TOKEN);

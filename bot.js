require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

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

// ===== 관리자 =====
const ADMIN_ID = process.env.ADMIN_ID;

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

// ===== 말투 시스템 =====
const styles = {
  기본: "너는 자연스럽고 친절한 AI다.",

  불닭맛:
    "너는 매우 텐션 높고 매운 느낌으로 말한다. 과장된 표현을 사용하지만 욕설은 하지 않는다.",

  차분: "너는 매우 차분하고 짧고 안정적으로 말한다.",

  존댓말: "항상 정중한 존댓말로만 말한다.",

  광기: "약간 미친 듯한 텐션이지만 위험하지 않은 재미있는 말투로 답한다."
};

// ===== AI 호출 =====
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

이 규칙을 반드시 유지해라.

대화 기록:
${JSON.stringify(user.history.slice(-8))}

유저: ${text}
            `
          }
        ]
      }
    ],
  });

  const reply =
    result.candidates?.[0]?.content?.parts?.[0]?.text || "오류 발생";

  memory[id] = {
    style: user.style || "기본",
    history: [
      ...user.history,
      { role: "user", parts: [{ text }] },
      { role: "model", parts: [{ text: reply }] }
    ].slice(-30)
  };

  save(memory);

  return reply;
}

// ===== 메시지 분할 =====
function split(text) {
  const arr = [];
  for (let i = 0; i < text.length; i += 1900) {
    arr.push(text.slice(i, i + 1900));
  }
  return arr;
}

// ===== ready =====
client.once("ready", () => {
  console.log(`로그인됨: ${client.user.tag}`);
});

// ===== message =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const content = message.content;

  const isAdmin = id === ADMIN_ID;

  // =========================
  // 📌 관리자 기능
  // =========================
  if (content === "!shutdown") {
    if (!isAdmin) return message.reply("권한 없음");
    await message.reply("종료");
    process.exit(0);
  }

  if (content === "!resetall") {
    if (!isAdmin) return message.reply("권한 없음");
    memory = {};
    save(memory);
    return message.reply("전체 초기화 완료");
  }

  if (content.startsWith("!say ")) {
    if (!isAdmin) return;
    return message.channel.send(content.replace("!say ", ""));
  }

  // =========================
  // 📌 말투 변경
  // =========================
  if (content.startsWith("!말투 ")) {
    const style = content.replace("!말투 ", "");

    if (!styles[style]) {
      return message.reply(
        "가능: 기본 / 불닭맛 / 차분 / 존댓말 / 광기"
      );
    }

    memory[id] = memory[id] || { history: [], style: "기본" };
    memory[id].style = style;
    save(memory);

    return message.reply(`말투 변경됨: ${style}`);
  }

  // =========================
  // 📌 일반 명령어
  // =========================
  if (content === "!help") {
    return message.reply("!말투, !reset, !shutdown(관리자)");
  }

  if (content === "!reset") {
    memory[id] = { history: [], style: "기본" };
    save(memory);
    return message.reply("초기화 완료");
  }

  // =========================
  // 📌 AI 응답
  // =========================
  try {
    const reply = await askAI(id, content);

    for (const part of split(reply)) {
      await message.reply(part);
    }
  } catch (e) {
    console.error(e);
    message.reply("AI 오류");
  }
});

client.login(process.env.DISCORD_TOKEN);

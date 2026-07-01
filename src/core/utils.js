const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function normalizeText(input) {
  return String(input || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function compactKey(input) {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 32);
}

function tokenize(input) {
  return compactKey(input).split(/\s+/).filter(Boolean);
}

function summarizeText(text, maxChars = 900) {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function scoreByTokens(text, queryTokens) {
  const lower = compactKey(text);
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (lower.split(/\s+/).includes(token)) score += 4;
    else if (lower.includes(token)) score += 1;
  }
  return score;
}

function nowIso() {
  return new Date().toISOString();
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

module.exports = {
  ensureDir,
  readJson,
  writeJsonAtomic,
  normalizeText,
  compactKey,
  stableHash,
  tokenize,
  summarizeText,
  scoreByTokens,
  nowIso,
  env
};

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
  return String(input || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
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
  return compactKey(input)
    .split(/\s+/)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceSplit(text) {
  const value = normalizeText(text);
  if (!value) return [];
  const parts = value
    .replace(/([.!?。！？])\s+/g, '$1\n')
    .split(/\n|(?<=다\.)\s+|(?<=요\.)\s+/u)
    .map((v) => v.trim())
    .filter(Boolean);
  return parts.length ? parts : [value];
}

function summarizeText(text, maxChars = 900) {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;
  const sentences = sentenceSplit(clean);
  let out = '';
  for (const sentence of sentences) {
    if ((out + ' ' + sentence).trim().length > maxChars) break;
    out = `${out} ${sentence}`.trim();
  }
  if (!out) out = clean.slice(0, maxChars - 1);
  return `${out.replace(/\s+$/g, '')}…`;
}

function scoreByTokens(text, queryTokens) {
  const lower = compactKey(text);
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'giu');
    const exact = lower.match(re);
    if (exact) score += exact.length * 4;
    else if (lower.includes(token)) score += 1;
  }
  return score;
}

function parseDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
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
  unique,
  clamp,
  stripHtml,
  sentenceSplit,
  summarizeText,
  scoreByTokens,
  parseDomain,
  nowIso,
  env
};

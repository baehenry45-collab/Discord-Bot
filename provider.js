const path = require('path');
const { ensureDir, readJson, writeJsonAtomic, stableHash } = require('./utils');

class AnswerCache {
  constructor({ memoryDir, fileName = 'answerCache.json' } = {}) {
    this.memoryDir = memoryDir || path.join(process.cwd(), 'memory');
    this.file = path.join(this.memoryDir, fileName);
    ensureDir(this.memoryDir);
    this.data = readJson(this.file, { items: {} });
  }

  key(question, category, scope = 'global') {
    return stableHash(`${scope}::${category}::${question}`);
  }

  get(question, category, { scope = 'global', ttlMs = 10 * 60 * 1000 } = {}) {
    const key = this.key(question, category, scope);
    const item = this.data.items[key];
    if (!item) return null;
    if (ttlMs > 0 && Date.now() - item.createdAt > ttlMs) return null;
    return { ...item.value, cacheKey: key };
  }

  set(question, category, value, { scope = 'global' } = {}) {
    const key = this.key(question, category, scope);
    this.data.items[key] = {
      createdAt: Date.now(),
      value
    };
    this.save();
    return key;
  }

  clear() {
    this.data = { items: {} };
    this.save();
  }

  save() {
    writeJsonAtomic(this.file, this.data);
  }
}

module.exports = {
  AnswerCache
};

const path = require('path');
const {
  ensureDir,
  readJson,
  writeJsonAtomic,
  stableHash,
  tokenize,
  scoreByTokens,
  summarizeText,
  normalizeText,
  nowIso
} = require('./utils');

class KnowledgeBase {
  constructor({ rootDir, memoryDir, seedFile, customFile = 'knowledgeBase.json' } = {}) {
    this.rootDir = rootDir || process.cwd();
    this.memoryDir = memoryDir || path.join(this.rootDir, 'memory');
    this.seedFile = seedFile || path.join(this.rootDir, 'data', 'seedKnowledge.json');
    this.customFile = path.join(this.memoryDir, customFile);
    ensureDir(this.memoryDir);
    this.seed = readJson(this.seedFile, []);
    this.custom = readJson(this.customFile, { documents: [] });
  }

  all() {
    return [...this.seed, ...(this.custom.documents || [])];
  }

  addDocument(input) {
    const question = normalizeText(input.question || input.title || '');
    const answer = summarizeText(input.answer || input.summary || input.content || '', 1800);
    const doc = {
      id: input.id || `learn-${stableHash(`${question}:${answer}:${Date.now()}`)}`,
      category: input.category || 'general',
      question,
      answer,
      prompts: Array.isArray(input.prompts) ? input.prompts.map(normalizeText).filter(Boolean) : [question].filter(Boolean),
      method: input.method || 'manual',
      learnedAt: input.learnedAt || nowIso()
    };

    this.custom.documents = (this.custom.documents || []).filter((existing) => existing.id !== doc.id);
    this.custom.documents.push(doc);
    this.save();
    return doc;
  }

  search(query, { category = null, limit = 5 } = {}) {
    const tokens = tokenize(query);
    return this.all()
      .filter((doc) => !category || doc.category === category || doc.category === 'general')
      .map((doc) => {
        const haystack = [doc.category, doc.question, doc.answer, ...(doc.prompts || [])].join(' ');
        const categoryBonus = category && doc.category === category ? 4 : 0;
        return { ...doc, score: scoreByTokens(haystack, tokens) + categoryBonus };
      })
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  save() {
    writeJsonAtomic(this.customFile, this.custom);
  }
}

module.exports = {
  KnowledgeBase
};

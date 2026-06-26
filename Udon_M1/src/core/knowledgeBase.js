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
    const title = normalizeText(input.title || 'Untitled source');
    const summary = summarizeText(input.summary || input.content || '', 1200);
    const facts = Array.isArray(input.facts)
      ? input.facts.map((fact) => summarizeText(fact, 360))
      : summarizeText(input.content || input.summary || '', 1000)
          .split(/(?<=[.!?。！？])\s+/)
          .slice(0, 5);

    const doc = {
      id: input.id || `kb-${stableHash(`${title}:${summary}:${Date.now()}`)}`,
      category: input.category || 'general',
      title,
      summary,
      facts,
      source: {
        name: input.source?.name || input.sourceName || title,
        url: input.source?.url || input.url || 'user://local-note',
        license: input.source?.license || input.license || 'unknown',
        retrievedAt: input.source?.retrievedAt || nowIso(),
        approvedBy: input.source?.approvedBy || input.approvedBy || null
      },
      prompts: Array.isArray(input.prompts) ? input.prompts.map((prompt) => normalizeText(prompt)).filter(Boolean) : [],
      tags: input.tags || [],
      createdAt: nowIso()
    };

    this.custom.documents = (this.custom.documents || []).filter((existing) => existing.id !== doc.id);
    this.custom.documents.push(doc);
    this.save();
    return doc;
  }

  remember({ text, category = 'general', userId = null, guildId = null, source = {} }) {
    return this.addDocument({
      category,
      title: `사용자 기억 ${new Date().toLocaleString('ko-KR')}`,
      summary: text,
      facts: [text],
      source: {
        name: source.name || '사용자 허락 기억',
        url: source.url || `user://${userId || 'unknown'}/${guildId || 'dm'}`,
        license: 'user-approved',
        approvedBy: userId || null,
        retrievedAt: nowIso()
      },
      tags: ['memory', userId, guildId].filter(Boolean)
    });
  }

  search(query, { category = null, limit = 6, includeGeneral = true } = {}) {
    const tokens = tokenize(query);
    const docs = this.all().filter((doc) => {
      if (!category) return true;
      if (doc.category === category) return true;
      return includeGeneral && ['general', 'source_policy', 'ai_system'].includes(doc.category);
    });

    return docs
      .map((doc) => {
        const haystack = [
          doc.category,
          doc.title,
          doc.summary,
          ...(doc.facts || []),
          ...(doc.prompts || []),
          ...(doc.tags || []),
          doc.source?.name,
          doc.source?.url
        ].join(' ');
        const categoryBonus = category && doc.category === category ? 8 : 0;
        const score = scoreByTokens(haystack, tokens) + categoryBonus;
        return { ...doc, score };
      })
      .filter((doc) => doc.score > 0 || doc.category === category)
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

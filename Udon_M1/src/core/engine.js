const path = require('path');
const { classifyQuestion } = require('./classifier');
const { buildSourcePolicy } = require('./sourcePolicy');
const { KnowledgeBase } = require('./knowledgeBase');
const { AnswerCache } = require('./cache');
const { LlmProvider } = require('./provider');
const { composeAnswer } = require('./composer');
const { validateAnswer } = require('./validator');
const { paginateAnswer } = require('./paginator');
const { normalizeText, stableHash, nowIso } = require('./utils');
const { conversationCaseCount } = require('./conversationBank');

const VERSION = 'Udon_M1';

class UdonAIM1 {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve(__dirname, '..', '..');
    this.ownerId = options.ownerId || '545157127690256388';
    this.memoryDir = options.memoryDir || path.join(this.rootDir, 'memory');
    this.policy = buildSourcePolicy({ rootDir: this.rootDir, registryFile: options.registryFile });
    this.kb = new KnowledgeBase({
      rootDir: this.rootDir,
      memoryDir: this.memoryDir,
      seedFile: options.seedFile
    });
    this.cache = new AnswerCache({ memoryDir: this.memoryDir });
    this.provider = new LlmProvider(options.llm || {});
    this.cacheEnabled = options.cacheEnabled !== false;
    this.pageMaxChars = options.pageMaxChars || 1800;
  }

  status() {
    return {
      name: VERSION,
      rootDir: this.rootDir,
      memoryDir: this.memoryDir,
      provider: {
        type: this.provider.provider,
        available: this.provider.available(),
        model: this.provider.model,
        endpointConfigured: Boolean(this.provider.endpoint)
      },
      sourceRegistryVersion: this.policy.version,
      knowledgeDocuments: this.kb.all().length,
      conversationCases: conversationCaseCount()
    };
  }

  remember(text, context = {}) {
    const clean = normalizeText(text);
    if (!clean) throw new Error('remember text is empty');
    return this.kb.remember({
      text: clean,
      category: context.category || 'general',
      userId: context.userId || null,
      guildId: context.guildId || null,
      source: {
        name: context.sourceName || '우돈봇 사용자 기억',
        url: context.sourceUrl || `discord://${context.guildId || 'dm'}/${context.userId || 'unknown'}`,
        approvedBy: context.userId || null
      }
    });
  }

  addKnowledge(document) {
    return this.kb.addDocument(document);
  }

  teach({ question, answer, category = 'general', userId = null, guildId = null, username = null } = {}) {
    const cleanQuestion = normalizeText(question);
    const cleanAnswer = normalizeText(answer);
    if (!cleanQuestion) throw new Error('teach question is empty');
    if (!cleanAnswer) throw new Error('teach answer is empty');

    return this.kb.addDocument({
      category,
      title: `학습 응답: ${cleanQuestion.slice(0, 80)}`,
      summary: `질문 "${cleanQuestion}"에는 이렇게 답한다: ${cleanAnswer}`,
      facts: [cleanAnswer],
      prompts: [cleanQuestion],
      source: {
        name: username ? `${username}의 학습 입력` : '사용자 학습 입력',
        url: `learned://${guildId || 'dm'}/${userId || 'unknown'}/${stableHash(cleanQuestion)}`,
        license: 'user-taught',
        approvedBy: userId || null,
        retrievedAt: nowIso()
      },
      tags: ['learned_reply', category, userId, guildId].filter(Boolean)
    });
  }

  ttlFor(classification) {
    const categoryInfo = this.policy.registry.categories?.[classification.category];
    const hours = categoryInfo?.freshnessHours ?? 24;
    return hours * 60 * 60 * 1000;
  }

  async answer(question, context = {}) {
    const cleanQuestion = normalizeText(question);
    if (!cleanQuestion) {
      return this.buildResult({
        question: cleanQuestion,
        classification: classifyQuestion('', context),
        text: '질문이 비어 있어. 우돈이가 답하려면 내용이 필요해.',
        sources: [],
        warnings: ['empty_question'],
        fromCache: false
      });
    }

    const classification = classifyQuestion(cleanQuestion, context);
    const scope = context.guildId ? `guild:${context.guildId}` : context.userId ? `user:${context.userId}` : 'global';
    const cacheTtl = this.ttlFor(classification);

    if (this.cacheEnabled && !classification.wantsMemory) {
      const cached = this.cache.get(cleanQuestion, classification.category, { scope, ttlMs: cacheTtl });
      if (cached) return { ...cached, fromCache: true };
    }

    if (classification.wantsMemory && context.userId === this.ownerId) {
      const remembered = this.remember(cleanQuestion, {
        userId: context.userId,
        guildId: context.guildId,
        category: classification.category,
        sourceName: '주인님 직접 기억'
      });
      const text = `기억했어. 앞으로 이 내용은 Udon_M1 지식베이스에서 우선 참고할게.\n\n- ${remembered.summary}`;
      return this.buildResult({ question: cleanQuestion, classification, text, sources: [remembered.source], warnings: [], fromCache: false });
    }

    const knowledge = this.kb.search(cleanQuestion, { category: classification.category, limit: 6 });
    const sourceCandidates = this.policy.sourceCandidates(classification.category);

    const composed = await composeAnswer(cleanQuestion, {
      classification,
      knowledge,
      sourceCandidates,
      provider: this.provider
    });

    const sources = composed.suppressSources ? [] : this.collectSources(knowledge, sourceCandidates, classification);
    const validated = validateAnswer(composed.text, classification, sources);
    const result = this.buildResult({
      question: cleanQuestion,
      classification,
      text: validated.text,
      sources,
      warnings: [...(composed.warnings || []), ...validated.warnings],
      providerResult: composed.providerResult,
      mode: composed.mode || null,
      learnable: Boolean(composed.learnable),
      fromCache: false
    });

    if (this.cacheEnabled && !classification.needsFreshSearch) {
      this.cache.set(cleanQuestion, classification.category, result, { scope });
    }
    return result;
  }

  collectSources(knowledge, sourceCandidates, classification) {
    const items = [];
    for (const doc of knowledge) {
      if (doc.source?.url) {
        items.push({
          name: doc.source.name || doc.title,
          url: doc.source.url,
          license: doc.source.license || 'unknown',
          category: doc.category,
          type: 'knowledge'
        });
      }
    }
    for (const source of sourceCandidates.slice(0, 4)) {
      items.push({
        name: source.name,
        url: source.url,
        license: source.licenseNote || 'check terms',
        category: classification.category,
        type: 'candidate'
      });
    }
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.name}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  buildResult({ question, classification, text, sources, warnings, providerResult = null, mode = null, learnable = false, fromCache }) {
    const id = stableHash(`${question}:${Date.now()}:${Math.random()}`);
    const pages = paginateAnswer({
      text,
      category: classification.category,
      sources,
      title: VERSION
    }, { maxChars: this.pageMaxChars });

    return {
      id,
      engine: VERSION,
      createdAt: nowIso(),
      question,
      category: classification.category,
      label: classification.label,
      confidence: classification.confidence,
      text,
      pages,
      sources,
      warnings,
      mode,
      learnable,
      provider: providerResult ? {
        provider: providerResult.provider,
        model: providerResult.model
      } : null,
      fromCache,
      diagnostics: {
        needsFreshSearch: classification.needsFreshSearch,
        emergency: classification.emergency,
        secondary: classification.secondary,
        ranked: classification.ranked
      }
    };
  }
}

function createUdonAIM1(options = {}) {
  return new UdonAIM1(options);
}

module.exports = {
  VERSION,
  UdonAIM1,
  createUdonAIM1
};

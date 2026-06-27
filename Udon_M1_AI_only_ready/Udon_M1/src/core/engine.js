const path = require('path');
const { classifyQuestion } = require('./classifier');
const { KnowledgeBase } = require('./knowledgeBase');
const { AnswerCache } = require('./cache');
const { LlmProvider } = require('./provider');
const { composeAnswer } = require('./composer');
const { normalizeText, stableHash, nowIso, summarizeText } = require('./utils');
const { conversationCaseCount, shouldRespond } = require('./conversationBank');

const VERSION = 'Udon_M1';

function paginate(text, maxChars = 1800) {
  const value = normalizeText(text);
  if (value.length <= maxChars) return [{ index: 0, total: 1, text: value }];
  const pages = [];
  for (let i = 0; i < value.length; i += maxChars) {
    pages.push({ index: pages.length, total: 0, text: value.slice(i, i + maxChars) });
  }
  return pages.map((page) => ({ ...page, total: pages.length }));
}

async function fetchOnlineSummary(question) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', question);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const res = await fetch(url, {
    headers: { 'user-agent': 'Udon_M1 learning engine' },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`online_learning_failed_${res.status}`);
  const data = await res.json();
  const pieces = [
    data.AbstractText,
    data.Answer,
    data.Definition,
    ...(data.RelatedTopics || []).slice(0, 3).map((item) => item.Text)
  ].filter(Boolean);

  const summary = summarizeText(pieces.join(' '), 1200);
  if (!summary) throw new Error('online_learning_no_summary');
  return summary;
}

class UdonAIM1 {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve(__dirname, '..', '..');
    this.memoryDir = options.memoryDir || path.join(this.rootDir, 'memory');
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
      knowledgeDocuments: this.kb.all().length,
      conversationCases: conversationCaseCount(),
      enabledFeatures: ['daily_conversation', 'simple_weather', 'manual_learning', 'online_learning']
    };
  }

  teach({ question, answer, category = 'general', method = 'manual' } = {}) {
    const cleanQuestion = normalizeText(question);
    const cleanAnswer = normalizeText(answer);
    if (!cleanQuestion) throw new Error('teach question is empty');
    if (!cleanAnswer) throw new Error('teach answer is empty');

    return this.kb.addDocument({
      category,
      question: cleanQuestion,
      answer: cleanAnswer,
      prompts: [cleanQuestion],
      method
    });
  }

  async learnOnline(question, context = {}) {
    const cleanQuestion = normalizeText(question);
    if (!cleanQuestion) throw new Error('question is empty');
    const classification = classifyQuestion(cleanQuestion, context);
    if (classification.medicalBlocked) {
      throw new Error('medical learning is disabled');
    }
    const answer = await fetchOnlineSummary(cleanQuestion);
    return this.teach({
      question: cleanQuestion,
      answer,
      category: classification.category,
      method: 'online'
    });
  }

  async answer(question, context = {}) {
    const cleanQuestion = normalizeText(question);
    const classification = classifyQuestion(cleanQuestion, context);
    if (!cleanQuestion) {
      return this.buildResult({
        question: cleanQuestion,
        classification,
        text: '질문이 비어 있어. 내용을 입력해줘.',
        warnings: ['empty_question'],
        mode: 'empty',
        learnable: false,
        providerResult: null,
        fromCache: false,
        context
      });
    }

    const scope = context.userId ? `user:${context.userId}` : 'global';
    if (this.cacheEnabled && !classification.needsFreshSearch) {
      const cached = this.cache.get(cleanQuestion, classification.category, { scope, ttlMs: 24 * 60 * 60 * 1000 });
      if (cached) return { ...cached, fromCache: true };
    }

    const knowledge = this.kb.search(cleanQuestion, { category: classification.category, limit: 5 });
    const composed = await composeAnswer(cleanQuestion, {
      classification,
      knowledge,
      provider: this.provider
    });

    const result = this.buildResult({
      question: cleanQuestion,
      classification,
      text: composed.text,
      warnings: composed.warnings || [],
      providerResult: composed.providerResult,
      mode: composed.mode || null,
      learnable: Boolean(composed.learnable),
      fromCache: false,
      context
    });

    if (this.cacheEnabled && !result.learnable && !classification.needsFreshSearch) {
      this.cache.set(cleanQuestion, classification.category, result, { scope });
    }
    return result;
  }

  buildResult({ question, classification, text, warnings, providerResult = null, mode = null, learnable = false, fromCache, context = {} }) {
    const id = stableHash(`${question}:${Date.now()}:${Math.random()}`);
    return {
      id,
      engine: VERSION,
      createdAt: nowIso(),
      question,
      category: classification.category,
      label: classification.label,
      confidence: classification.confidence,
      text,
      pages: paginate(text, this.pageMaxChars),
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
        medicalBlocked: classification.medicalBlocked,
        shouldRespond: shouldRespond(question, context)
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
  createUdonAIM1,
  shouldRespond
};

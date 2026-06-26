class UdonAIClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.UDONAI_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    this.apiKey = options.apiKey || process.env.UDONAI_API_KEY || '';
    this.timeoutMs = options.timeoutMs || 30000;
  }

  async request(path, body = null, method = 'POST') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  status() {
    return this.request('/v1/status', null, 'GET');
  }

  answer(question, context = {}) {
    return this.request('/v1/answer', { question, context });
  }

  discordAnswer(question, context = {}) {
    return this.request('/v1/discord/answer', { question, context });
  }

  addKnowledge(document) {
    return this.request('/v1/knowledge', document);
  }

  teach(question, answer, context = {}) {
    return this.request('/v1/teach', { question, answer, context, category: context.category });
  }

  chatCompletions(messages, options = {}) {
    return this.request('/v1/chat/completions', {
      model: options.model || 'udon_m1',
      messages,
      context: options.context || {}
    });
  }
}

module.exports = {
  UdonAIClient
};

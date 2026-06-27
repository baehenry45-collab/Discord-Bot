const { env } = require('./utils');

class LlmProvider {
  constructor(options = {}) {
    this.provider = options.provider || env('UDONAI_PROVIDER', 'none');
    const providerLower = String(this.provider).toLowerCase();
    this.endpoint = options.endpoint || env(
      'UDONAI_LLM_ENDPOINT',
      providerLower === 'huggingface' ? 'https://router.huggingface.co/v1/chat/completions' : ''
    );
    this.apiKey = options.apiKey || env('UDONAI_LLM_API_KEY', env('HF_TOKEN', ''));
    this.model = options.model || env(
      'UDONAI_LLM_MODEL',
      providerLower === 'huggingface' ? 'Qwen/Qwen2.5-7B-Instruct' : 'qwen2.5:7b'
    );
    this.timeoutMs = Number(options.timeoutMs || env('UDONAI_LLM_TIMEOUT_MS', 25000));
  }

  available() {
    const providerLower = String(this.provider).toLowerCase();
    if (!this.endpoint || providerLower === 'none') return false;
    if (providerLower === 'huggingface') return Boolean(this.apiKey);
    return true;
  }

  async complete(messages, options = {}) {
    if (!this.available()) return null;
    const provider = this.provider.toLowerCase();
    if (provider === 'ollama') return this.completeOllama(messages, options);
    return this.completeOpenAICompatible(messages, options);
  }

  async completeOpenAICompatible(messages, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: options.model || this.model,
          messages,
          temperature: options.temperature ?? 0.35,
          max_tokens: options.maxTokens ?? 900
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || '';
      return { text, provider: this.provider, model: options.model || this.model, raw: json };
    } finally {
      clearTimeout(timer);
    }
  }

  async completeOllama(messages, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = `${this.endpoint.replace(/\/$/, '')}/api/chat`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: options.model || this.model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.35,
            num_predict: options.maxTokens ?? 900
          }
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const json = await res.json();
      return { text: json.message?.content || '', provider: 'ollama', model: options.model || this.model, raw: json };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  LlmProvider
};

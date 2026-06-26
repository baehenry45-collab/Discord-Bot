const http = require('http');
const { URL } = require('url');
const { createUdonAIM1 } = require('../core/engine');
const { createDiscordBridge } = require('../adapters/discordBridge');
const { stableHash, nowIso } = require('../core/utils');

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('request_body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(text);
}

function parseAuth(req) {
  const header = req.headers.authorization || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : '';
}

function isAuthorized(req, apiKey) {
  if (!apiKey) return true;
  return parseAuth(req) === apiKey || req.headers['x-udonai-key'] === apiKey;
}

function corsHeaders(origin = '*') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-udonai-key'
  };
}

function compactResult(result) {
  return {
    id: result.id,
    engine: result.engine,
    createdAt: result.createdAt,
    category: result.category,
    label: result.label,
    confidence: result.confidence,
    text: result.text,
    pages: result.pages,
    sources: result.sources,
    warnings: result.warnings,
    mode: result.mode,
    learnable: result.learnable,
    provider: result.provider,
    fromCache: result.fromCache,
    diagnostics: result.diagnostics
  };
}

function toOpenAIChatCompletion(result, model = 'udon_m1') {
  return {
    id: `chatcmpl-${result.id || stableHash(`${Date.now()}`)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result.text
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    },
    udonai: {
      category: result.category,
      label: result.label,
      sources: result.sources,
      warnings: result.warnings
    }
  };
}

function extractQuestionFromMessages(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser?.content || '';
}

function createUdonAIApiServer(options = {}) {
  const engine = options.engine || createUdonAIM1(options.engineOptions || {});
  const bridge = createDiscordBridge(engine, options.discord || {});
  const apiKey = options.apiKey ?? process.env.UDONAI_API_KEY ?? '';
  const corsOrigin = options.corsOrigin ?? process.env.UDONAI_CORS_ORIGIN ?? '*';
  const headers = corsHeaders(corsOrigin);

  async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      sendText(res, 204, '', headers);
      return;
    }

    if (url.pathname === '/' && req.method === 'GET') {
      sendJson(res, 200, {
        name: 'Udon_M1 API',
        ok: true,
        time: nowIso(),
        routes: [
          'GET /health',
          'GET /v1/status',
          'POST /v1/answer',
          'POST /v1/discord/answer',
          'POST /v1/teach',
          'POST /v1/knowledge',
          'POST /v1/chat/completions'
        ]
      }, headers);
      return;
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, engine: 'Udon_M1', time: nowIso() }, headers);
      return;
    }

    if (url.pathname === '/v1/status' && req.method === 'GET') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      sendJson(res, 200, engine.status(), headers);
      return;
    }

    if (url.pathname === '/v1/answer' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const question = body.question || body.prompt || body.message || '';
      const result = await engine.answer(question, body.context || {});
      sendJson(res, 200, compactResult(result), headers);
      return;
    }

    if (url.pathname === '/v1/discord/answer' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const question = body.question || body.prompt || body.message || '';
      const { result, payload } = await bridge.answerPayload(question, body.context || {});
      sendJson(res, 200, { result: compactResult(result), discord: payload }, headers);
      return;
    }

    if (url.pathname === '/v1/knowledge' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const doc = engine.addKnowledge(body);
      sendJson(res, 200, { ok: true, document: doc }, headers);
      return;
    }

    if (url.pathname === '/v1/teach' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const doc = engine.teach({
        question: body.question || body.prompt || '',
        answer: body.answer || body.response || '',
        category: body.category || body.context?.category || 'general',
        userId: body.context?.userId || body.userId || null,
        guildId: body.context?.guildId || body.guildId || null,
        username: body.context?.username || body.username || null
      });
      sendJson(res, 200, { ok: true, document: doc }, headers);
      return;
    }

    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const question = body.question || body.prompt || extractQuestionFromMessages(body.messages);
      const result = await engine.answer(question, body.context || {});
      sendJson(res, 200, toOpenAIChatCompletion(result, body.model || 'udon_m1'), headers);
      return;
    }

    sendJson(res, 404, { error: 'not_found', path: url.pathname }, headers);
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      sendJson(res, 500, {
        error: 'internal_error',
        message: error.message || String(error)
      }, headers);
    });
  });

  return {
    server,
    engine,
    bridge,
    listen(port = 3000, host = '0.0.0.0') {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve({ port, host }));
      });
    }
  };
}

module.exports = {
  createUdonAIApiServer,
  toOpenAIChatCompletion
};

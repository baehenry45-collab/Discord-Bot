const http = require('http');
const { URL } = require('url');
const { createUdonAIM1 } = require('../core/engine');
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
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, html, headers = {}) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(html);
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
    choices: [{
      index: 0,
      message: { role: 'assistant', content: result.text },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    udon_m1: {
      category: result.category,
      label: result.label,
      warnings: result.warnings
    }
  };
}

function extractQuestionFromMessages(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser?.content || '';
}

function uiHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Udon_M1</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #17191f; }
    main { max-width: 860px; margin: 0 auto; padding: 32px 18px; }
    h1 { font-size: 28px; margin: 0 0 18px; }
    .panel { background: white; border: 1px solid #d8dde6; border-radius: 8px; padding: 16px; }
    textarea, input { width: 100%; box-sizing: border-box; border: 1px solid #c8ced8; border-radius: 6px; padding: 12px; font: inherit; }
    textarea { min-height: 94px; resize: vertical; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; cursor: pointer; background: #2454d6; color: white; }
    button.secondary { background: #3f4654; }
    button:disabled { opacity: .55; cursor: wait; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .answer { white-space: pre-wrap; line-height: 1.5; margin-top: 16px; }
    .teach { display: none; margin-top: 16px; border-top: 1px solid #e5e8ef; padding-top: 16px; }
    .meta { color: #5a6270; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>Udon_M1</h1>
    <section class="panel">
      <textarea id="question" placeholder="메시지를 입력하세요"></textarea>
      <div class="row">
        <button id="ask">답변</button>
        <button id="online" class="secondary" disabled>온라인 학습</button>
      </div>
      <div id="answer" class="answer"></div>
      <div id="meta" class="meta"></div>
      <div id="teach" class="teach">
        <textarea id="teachAnswer" placeholder="이 질문에 대한 올바른 답변을 입력하세요"></textarea>
        <div class="row">
          <button id="teachBtn">직접 가르치기</button>
        </div>
      </div>
    </section>
  </main>
  <script>
    const question = document.querySelector('#question');
    const answer = document.querySelector('#answer');
    const meta = document.querySelector('#meta');
    const teach = document.querySelector('#teach');
    const teachAnswer = document.querySelector('#teachAnswer');
    const online = document.querySelector('#online');
    let lastQuestion = '';

    async function post(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'request failed');
      return data;
    }

    document.querySelector('#ask').onclick = async () => {
      lastQuestion = question.value.trim();
      answer.textContent = '생각 중...';
      meta.textContent = '';
      teach.style.display = 'none';
      online.disabled = true;
      try {
        const data = await post('/v1/answer', { question: lastQuestion });
        answer.textContent = data.text;
        meta.textContent = data.mode ? 'mode: ' + data.mode : '';
        if (data.learnable) {
          teach.style.display = 'block';
          online.disabled = false;
        }
      } catch (error) {
        answer.textContent = error.message;
      }
    };

    document.querySelector('#teachBtn').onclick = async () => {
      answer.textContent = '저장 중...';
      const doc = await post('/v1/teach', { question: lastQuestion, answer: teachAnswer.value });
      answer.textContent = '학습했어. 다음부터 비슷한 질문에 먼저 참고할게.';
      meta.textContent = 'saved: ' + doc.document.id;
    };

    online.onclick = async () => {
      answer.textContent = '온라인에서 요약 정보를 찾는 중...';
      try {
        const doc = await post('/v1/learn-online', { question: lastQuestion });
        answer.textContent = '온라인 학습을 저장했어. 다시 질문하면 저장된 내용을 참고할게.';
        meta.textContent = 'saved: ' + doc.document.id;
      } catch (error) {
        answer.textContent = '온라인 학습 실패: ' + error.message;
      }
    };
  </script>
</body>
</html>`;
}

function createUdonAIApiServer(options = {}) {
  const engine = options.engine || createUdonAIM1(options.engineOptions || {});
  const apiKey = options.apiKey ?? process.env.UDONAI_API_KEY ?? '';
  const corsOrigin = options.corsOrigin ?? process.env.UDONAI_CORS_ORIGIN ?? '*';
  const headers = corsHeaders(corsOrigin);

  async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (url.pathname === '/' && req.method === 'GET') {
      sendHtml(res, uiHtml(), headers);
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
      const result = await engine.answer(body.question || body.prompt || body.message || '', body.context || {});
      sendJson(res, 200, compactResult(result), headers);
      return;
    }

    if (url.pathname === '/v1/teach' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const doc = engine.teach({
        question: body.question || body.prompt || '',
        answer: body.answer || body.response || '',
        category: body.category || body.context?.category || 'general'
      });
      sendJson(res, 200, { ok: true, document: doc }, headers);
      return;
    }

    if (url.pathname === '/v1/learn-online' && req.method === 'POST') {
      if (!isAuthorized(req, apiKey)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
      const body = JSON.parse((await readBody(req)) || '{}');
      const doc = await engine.learnOnline(body.question || body.prompt || '', body.context || {});
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

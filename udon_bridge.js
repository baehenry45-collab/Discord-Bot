const path = require('path');
const { createUdonAIM1 } = require('./Udon_M1/src');

const rootDir = path.join(__dirname, 'Udon_M1');
const memoryDir = process.env.UDONAI_MEMORY_DIR || path.join(__dirname, 'memory', 'udon_m1');
const ownerId = process.env.UDONAI_OWNER_ID || process.env.BOT_OWNER_ID || '';

const engine = createUdonAIM1({
  rootDir,
  memoryDir,
  ownerId
});

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function compactResult(result) {
  return {
    ok: true,
    id: result.id,
    engine: result.engine,
    question: result.question,
    category: result.category,
    label: result.label,
    text: result.text,
    sources: result.sources || [],
    warnings: result.warnings || [],
    mode: result.mode || null,
    learnable: Boolean(result.learnable),
    conversationCases: engine.status().conversationCases
  };
}

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  const action = input.action || 'answer';

  if (action === 'status') {
    process.stdout.write(JSON.stringify({ ok: true, status: engine.status() }));
    return;
  }

  if (action === 'teach') {
    const document = engine.teach({
      question: input.question,
      answer: input.answer,
      category: input.category || input.context?.category || 'general',
      userId: input.context?.userId || null,
      guildId: input.context?.guildId || null,
      username: input.context?.username || null
    });
    process.stdout.write(JSON.stringify({ ok: true, document }));
    return;
  }

  const result = await engine.answer(input.question || input.message || '', input.context || {});
  process.stdout.write(JSON.stringify(compactResult(result)));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: error.message || String(error),
    stack: error.stack || ''
  }));
  process.exitCode = 1;
});

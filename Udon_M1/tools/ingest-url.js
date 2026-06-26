const path = require('path');
const { createUdonAIM1 } = require('../src');
const { stripHtml, summarizeText } = require('../src/core/utils');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const url = arg('url');
  const category = arg('category', 'general');
  const title = arg('title', url);
  const allowUnknown = process.argv.includes('--allow-unknown');
  if (!url) throw new Error('사용법: npm run ingest:url -- --url https://example.com --category medical --title "제목"');

  const rootDir = path.resolve(__dirname, '..');
  const engine = createUdonAIM1({ rootDir, memoryDir: path.join(rootDir, 'memory') });
  const policy = engine.policy.checkUrl(url, category, { allowUnknown });
  if (!policy.allowed) {
    throw new Error(`허용되지 않은 도메인이야: ${policy.domain}. 필요하면 --allow-unknown 을 붙이고 라이선스를 직접 확인해.`);
  }

  const res = await fetch(url, {
    headers: {
      'user-agent': 'UdonAI-M1/1.0 source-aware research bot; contact=owner'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = stripHtml(html);
  const summary = summarizeText(text, 1400);

  const doc = engine.addKnowledge({
    category,
    title,
    summary,
    facts: summary.split(/(?<=[.!?。！？])\s+/).slice(0, 6),
    source: {
      name: title,
      url,
      license: arg('license', 'check-source-terms'),
      retrievedAt: new Date().toISOString()
    },
    tags: ['url-ingest', policy.domain]
  });

  console.log(JSON.stringify({ ok: true, document: doc }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

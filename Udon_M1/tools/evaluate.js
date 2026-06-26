const fs = require('fs');
const path = require('path');
const { createUdonAIM1 } = require('../src');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const evalFile = path.join(rootDir, 'data', 'evalSet.json');
  const cases = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
  const engine = createUdonAIM1({
    rootDir,
    memoryDir: path.join(rootDir, 'memory-eval'),
    cacheEnabled: false
  });

  const results = [];
  for (const item of cases) {
    const result = await engine.answer(item.question, {
      userId: 'eval-user',
      guildId: 'eval-guild'
    });
    const failures = [];
    if (item.expectedCategory && result.category !== item.expectedCategory) {
      failures.push(`category ${result.category} !== ${item.expectedCategory}`);
    }
    for (const needle of item.mustContain || []) {
      if (!result.text.includes(needle)) failures.push(`missing text: ${needle}`);
    }
    for (const blocked of item.mustNotSourceNames || []) {
      if (result.sources.some((source) => source.name === blocked)) failures.push(`bad source: ${blocked}`);
    }
    results.push({
      id: item.id,
      ok: failures.length === 0,
      category: result.category,
      failures
    });
  }

  const failed = results.filter((item) => !item.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


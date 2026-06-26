const path = require('path');
const { createUdonAIM1 } = require('../src');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const engine = createUdonAIM1({
    rootDir,
    memoryDir: path.join(rootDir, 'memory'),
    cacheEnabled: false
  });

  const questions = [
    '우돈아 1994년에 방영된 용자 애니 알려줘',
    '나 기침이 많이 나고 맛이 안 느껴져 어떻게 해야 해?',
    '우돈아 월드컵 경기 현황 알려줘',
    'Udon_M1은 뭐가 가능해?'
  ];

  console.log('[Udon_M1 상태]');
  console.log(JSON.stringify(engine.status(), null, 2));

  for (const question of questions) {
    const result = await engine.answer(question, {
      userId: '545157127690256388',
      guildId: 'demo'
    });
    console.log('\n==============================');
    console.log(`Q. ${question}`);
    console.log(`분류: ${result.label} / 페이지: ${result.pages.length}`);
    console.log(result.pages[0].content);
    if (result.sources.length) {
      console.log('출처:', result.sources.slice(0, 3).map((s) => s.name).join(', '));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

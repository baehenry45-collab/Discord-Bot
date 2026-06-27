const path = require('path');
const { createUdonAIM1 } = require('../src');

async function main() {
  const engine = createUdonAIM1({
    rootDir: path.resolve(__dirname, '..'),
    cacheEnabled: false
  });

  for (const question of ['안녕', '서울 오늘 날씨 알려줘', '몽실테스트키']) {
    const result = await engine.answer(question);
    console.log(`\nQ. ${question}\nA. ${result.text}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

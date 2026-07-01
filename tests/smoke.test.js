const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createUdonAIM1, TinyTokenizer, MiniGPT } = require('../src');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const memoryDir = path.join(rootDir, 'memory-test');
  fs.rmSync(memoryDir, { recursive: true, force: true });

  const engine = createUdonAIM1({
    rootDir,
    memoryDir,
    cacheEnabled: false
  });

  const status = engine.status();
  assert.strictEqual(status.name, 'Udon_M1');
  assert.ok(status.conversationCases >= 1000);
  assert.ok(status.enabledFeatures.includes('manual_learning'));

  const greeting = await engine.answer('안녕');
  assert.strictEqual(greeting.category, 'general');
  assert.ok(greeting.text.length > 0);
  assert.strictEqual(Object.hasOwn(greeting, 'sources'), false);

  const call = await engine.answer('떡볶이');
  assert.strictEqual(call.diagnostics.shouldRespond, true);
  assert.ok(call.text.includes('떡볶이') || call.text.includes('대화') || call.text.includes('불렀어'));

  const reply = await engine.answer('이어서 말할게', { replyToBot: true });
  assert.strictEqual(reply.diagnostics.shouldRespond, true);

  const udonMention = await engine.answer('Udon_M1 뭐야');
  assert.ok(
    udonMention.text.includes('545157127690256388') ||
    udonMention.text.includes('테스트 AI 엔진') ||
    udonMention.text.includes('우돈')
  );

  const weather = await engine.answer('서울 오늘 날씨 알려줘');
  assert.strictEqual(weather.category, 'weather');
  assert.strictEqual(weather.learnable, true);
  assert.ok(weather.text.includes('날씨'));

  const medical = await engine.answer('기침이 심한데 진단해줘');
  assert.strictEqual(medical.category, 'general');
  assert.strictEqual(medical.diagnostics.medicalBlocked, true);
  assert.ok(medical.warnings.includes('medical_feature_removed'));

  const unknownQuestion = 'zxqv-alpha-12345';
  const unknown = await engine.answer(unknownQuestion);
  assert.strictEqual(unknown.learnable, true);

  engine.teach({
    question: unknownQuestion,
    answer: 'zxqv-alpha-12345는 학습 저장 테스트 답변이야.',
    category: 'general'
  });

  const learned = await engine.answer(unknownQuestion);
  assert.ok(learned.text.includes('학습 저장 테스트 답변'));

  const memoryFile = path.join(memoryDir, 'knowledgeBase.json');
  assert.ok(fs.existsSync(memoryFile));

  const tokenizer = new TinyTokenizer().fit(['Udon_M1은 응답 엔진이다']);
  const model = new MiniGPT({ vocabSize: tokenizer.size, nEmb: 16, blockSize: 16, nLayer: 1 });
  const ids = tokenizer.encode('Udon_M1', { eos: false });
  const out = model.generate(ids, { maxNewTokens: 3 });
  assert.ok(out.length >= ids.length);

  console.log('Udon_M1 smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

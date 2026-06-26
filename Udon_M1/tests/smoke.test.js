const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createUdonAIM1, TinyTokenizer, MiniGPT } = require('../src');
const { resultToEmbeds, pagePayload } = require('../src/adapters/discordBridge');

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
  assert.ok(status.knowledgeDocuments >= 3);
  assert.ok(status.conversationCases >= 1000);

  const anime = await engine.answer('우돈아 1994년에 방영된 용자 애니 알려줘', {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.strictEqual(anime.category, 'anime_manga');
  assert.ok(anime.sources.some((source) => source.category === 'anime_manga' || source.type === 'candidate'));
  assert.ok(!anime.sources.some((source) => source.name === 'WHO' && source.category === 'anime_manga'));

  const medical = await engine.answer('기침이 많이 나고 맛이 안 느껴져. 약국 가야 해?', {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.strictEqual(medical.category, 'medical');
  assert.ok(/확진이 아니라|증상 기반/.test(medical.text));

  const smalltalk = await engine.answer('안녕', {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.strictEqual(smalltalk.category, 'general');
  assert.strictEqual(smalltalk.sources.length, 0);
  assert.ok(smalltalk.text.length > 5);
  assert.ok(String(smalltalk.mode).includes('greeting') || smalltalk.mode === 'smalltalk');

  const codingHelp = await engine.answer('배포 오류가 나는데 어떻게 봐야 해?', {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.ok(['coding', 'server_ops', 'general'].includes(codingHelp.category));
  assert.strictEqual(codingHelp.sources.length, 0);
  assert.ok(/에러 메시지|실무 흐름|확인할 항목/.test(codingHelp.text));

  const unknown = await engine.answer('몽실테스트키라는 말을 누가 입력하면 어떤 답을 해야 하는지 아직 모르겠어', {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.strictEqual(unknown.learnable, true);
  const unknownPayload = pagePayload(unknown);
  assert.ok(JSON.stringify(unknownPayload.components).includes('가르치기'));

  engine.teach({
    question: unknown.question,
    answer: '몽실테스트키는 학습 버튼 테스트 답변이야.',
    category: 'general',
    userId: 'test-user',
    guildId: 'test-guild'
  });
  const learned = await engine.answer(unknown.question, {
    userId: 'test-user',
    guildId: 'test-guild'
  });
  assert.ok(learned.text.includes('학습 버튼 테스트 답변'));

  const embeds = resultToEmbeds(medical);
  assert.ok(Array.isArray(embeds));
  assert.ok(embeds[0].description.length > 10);

  const tokenizer = new TinyTokenizer().fit(['우돈이는 똑똑하다']);
  const model = new MiniGPT({ vocabSize: tokenizer.size, nEmb: 16, blockSize: 16, nLayer: 1 });
  const ids = tokenizer.encode('우돈이는', { eos: false });
  const out = model.generate(ids, { maxNewTokens: 3 });
  assert.ok(out.length >= ids.length);

  console.log('✅ Udon_M1 smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

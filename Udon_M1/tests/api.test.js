const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createUdonAIApiServer, UdonAIClient } = require('../src');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const memoryDir = path.join(rootDir, 'memory-api-test');
  fs.rmSync(memoryDir, { recursive: true, force: true });
  const api = createUdonAIApiServer({
    engineOptions: {
      rootDir,
      memoryDir,
      cacheEnabled: false
    },
    apiKey: 'test-key'
  });
  await api.listen(33333, '127.0.0.1');

  try {
    const unauthorized = await fetch('http://127.0.0.1:33333/v1/status');
    assert.strictEqual(unauthorized.status, 401);

    const client = new UdonAIClient({
      baseUrl: 'http://127.0.0.1:33333',
      apiKey: 'test-key'
    });

    const status = await client.status();
    assert.strictEqual(status.name, 'Udon_M1');
    assert.ok(status.conversationCases >= 1000);

    const answer = await client.answer('우돈아 월드컵 경기 현황 알려줘', {
      userId: 'api-test',
      guildId: 'api-guild'
    });
    assert.strictEqual(answer.category, 'sports');

    const discord = await client.discordAnswer('기침이 많이 나고 맛이 안 느껴져', {
      userId: 'api-test',
      guildId: 'api-guild'
    });
    assert.ok(discord.discord.embeds.length >= 1);

    await client.teach('api학습테스트키', 'api 학습 답변이 저장됐어.', {
      userId: 'api-test',
      guildId: 'api-guild',
      category: 'general'
    });
    const learned = await client.answer('api학습테스트키', {
      userId: 'api-test',
      guildId: 'api-guild'
    });
    assert.ok(learned.text.includes('api 학습 답변'));

    const chat = await client.chatCompletions([
      { role: 'user', content: 'Udon_M1 설명해줘' }
    ]);
    assert.strictEqual(chat.object, 'chat.completion');
    assert.ok(chat.choices[0].message.content.includes('Udon_M1'));

    console.log('✅ Udon_M1 API test passed');
  } finally {
    await new Promise((resolve) => api.server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

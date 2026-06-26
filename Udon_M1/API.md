# Udon_M1 API 사용법

이 엔진은 이제 독립 API 서버로 사용할 수 있습니다.  
즉, 우돈봇이 아니어도 다른 사람이 만든 Discord 봇에서 HTTP 요청으로 붙일 수 있습니다.

## 서버 실행

```bash
cd outputs/Udon_M1
node server.js
```

기본 주소:

```txt
http://127.0.0.1:3000
```

환경 변수:

```env
PORT=3000
UDONAI_API_KEY=원하는_API_키
UDONAI_OWNER_ID=545157127690256388
```

`UDONAI_API_KEY`를 넣으면 요청 시 아래 헤더가 필요합니다.

```txt
Authorization: Bearer 원하는_API_키
```

## 주요 엔드포인트

### 상태 확인

```http
GET /health
GET /v1/status
```

### 일반 답변

```http
POST /v1/answer
Content-Type: application/json

{
  "question": "우돈아 1994년에 방영된 용자 애니 알려줘",
  "context": {
    "userId": "123",
    "guildId": "456",
    "username": "tester"
  }
}
```

응답:

```json
{
  "engine": "Udon_M1",
  "category": "anime_manga",
  "text": "...",
  "pages": [],
  "sources": []
}
```

### Discord 임베드 payload 답변

```http
POST /v1/discord/answer
Content-Type: application/json

{
  "question": "기침이 많이 나고 맛이 안 느껴져",
  "context": {
    "userId": "123",
    "guildId": "456"
  }
}
```

응답 안의 `discord`를 그대로 Discord.js `message.reply()`에 넣을 수 있습니다.

```js
await message.reply(data.discord);
```

### 학습시키기

```http
POST /v1/teach
Content-Type: application/json

{
  "question": "몽실테스트키가 뭐야?",
  "answer": "몽실테스트키는 서버에서 쓰는 테스트 호출어야.",
  "category": "general",
  "context": {
    "userId": "123",
    "guildId": "456",
    "username": "tester"
  }
}
```

이후 같은 질문이나 매우 비슷한 질문은 저장된 답변을 먼저 참고합니다.

### OpenAI 호환 Chat Completions

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "udon_m1",
  "messages": [
    { "role": "user", "content": "Udon_M1 설명해줘" }
  ]
}
```

OpenAI SDK나 OpenAI 호환 클라이언트에서 baseURL만 바꿔서 붙일 수 있게 만든 엔드포인트입니다.

## 다른 Discord 봇에 붙이는 예시

### fetch만 쓰는 방식

```js
async function askUdonAI(question, context) {
  const res = await fetch('http://127.0.0.1:3000/v1/discord/answer', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer YOUR_UDONAI_API_KEY'
    },
    body: JSON.stringify({ question, context })
  });
  if (!res.ok) throw new Error(`UdonAI HTTP ${res.status}`);
  return res.json();
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('우돈아')) return;

  const question = message.content.replace(/^우돈아\s*/, '');
  const data = await askUdonAI(question, {
    userId: message.author.id,
    guildId: message.guildId,
    username: message.author.username
  });

  await message.reply(data.discord);
});
```

### 클라이언트 모듈 쓰는 방식

```js
const { UdonAIClient } = require('./Udon_M1/src/api/client');

const udonAI = new UdonAIClient({
  baseUrl: 'http://127.0.0.1:3000',
  apiKey: 'YOUR_UDONAI_API_KEY'
});

const data = await udonAI.discordAnswer('뉴욕 날씨 알려줘', {
  userId: message.author.id,
  guildId: message.guildId
});

await message.reply(data.discord);
```

## Hugging Face 연결

우돈AI API 서버 자체가 HF 모델을 호출하게 하려면:

```env
UDONAI_PROVIDER=huggingface
UDONAI_LLM_ENDPOINT=https://router.huggingface.co/v1/chat/completions
UDONAI_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
```

토큰이 없으면 자체 지식베이스/분류기/템플릿 모드로 답합니다.

# 우돈봇 적용 가이드

이 패키지는 아직 우돈봇 호스팅 서버에 적용하지 않았습니다.  
나중에 올릴 때는 `outputs/Udon_M1` 폴더를 봇 프로젝트 안에 복사하고, 기존 AI 응답부에서 엔진을 호출하면 됩니다.

## 가장 안전한 적용 방식

기존 `udonSiri.js`의 응답 생성 함수 안에서 Udon_M1을 호출하는 방식이 가장 안전합니다.  
새 `messageCreate` 리스너를 무작정 추가하면 기존 AI 답변과 중복 응답이 날 수 있습니다.

```js
const { createUdonAIM1 } = require('./Udon_M1/src');

const udonAI = createUdonAIM1({
  ownerId: '545157127690256388',
  rootDir: './Udon_M1',
  memoryDir: './memory/udonai-m1'
});

async function answerWithUdonAI(question, message) {
  return udonAI.answer(question, {
    userId: message.author.id,
    guildId: message.guildId,
    username: message.author.username,
    channelId: message.channelId
  });
}
```

## 독립 플러그인 방식

테스트 서버에서만 빠르게 붙일 때는 아래처럼 사용할 수 있습니다.

```js
const { registerUdonAIM1 } = require('./Udon_M1/src');

registerUdonAIM1(client, {
  ownerId: '545157127690256388',
  rootDir: './Udon_M1',
  memoryDir: './memory/udonai-m1',
  triggers: ['우돈아', '우돈봇']
});
```

주의: 이 방식은 자체 `messageCreate`를 등록합니다. 기존 우돈봇 AI 리스너와 같이 켜면 중복 답변이 날 수 있습니다.

## Hugging Face 연결

`.env` 또는 호스팅 환경 변수에 아래 값을 넣으면 됩니다.

```env
UDONAI_PROVIDER=huggingface
UDONAI_LLM_ENDPOINT=https://router.huggingface.co/v1/chat/completions
UDONAI_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxx
```

HF 토큰이 없으면 우돈AI는 외부 모델 호출 없이 지식베이스/템플릿 모드로 동작합니다.

## Discord 페이지 버튼

`createDiscordBridge()`는 Discord API payload 형태로 `embeds`와 `components`를 만들어줍니다.  
못 알아들은 질문에는 `가르치기` 버튼이 붙고, 독립 플러그인 방식에서는 버튼을 누르면 모달로 답변을 저장할 수 있습니다.

```js
const { createDiscordBridge } = require('./Udon_M1/src');

const bridge = createDiscordBridge(udonAI);
const { payload } = await bridge.answerPayload('기침이 나고 맛이 안 느껴져', {
  userId: message.author.id,
  guildId: message.guildId
});

await message.reply(payload);
```

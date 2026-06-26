# Udon_M1

우돈봇에 바로 붙이지 않고 따로 보관할 수 있는 독립 AI 엔진입니다.  
목표는 “GPT/Gemini를 새로 학습”이 아니라, 우돈봇이 질문을 분류하고, 믿을 만한 자료를 찾고, 출처를 남기고, 긴 답변을 페이지로 나누고, 필요할 때만 외부 LLM을 호출하는 구조입니다.

## 들어있는 것

- 질문 분류기: 의료, 날씨/수온, 스포츠, 애니/만화, 음식, 게임, 기술, 금융, 법률, 뉴스, 서버운영 등
- 출처 라우터: 질문 종류에 맞는 공식/전문 출처 후보만 우선 사용
- 지식베이스: 출처 링크, 라이선스 메모, 요약, 핵심 사실을 저장
- 캐시: 같은 질문을 반복할 때 외부 AI/API 비용 절약
- 답변 검수기: 의료/약물/법률/금융 같은 고위험 답변을 안전하게 보정
- 자연 대화 은행: 9천 개 이상 말투 변형으로 인사, 감사, 설명, 위로, 코드 도움 같은 기본 대화 처리
- 학습 UI: 못 알아들은 질문은 Discord `가르치기` 버튼과 모달로 답변을 저장
- 긴 답변 페이지화: Discord 임베드/버튼 페이지에 넣기 쉬운 형태
- 외부 LLM 어댑터: OpenAI 호환 서버, Ollama 같은 오픈소스 LLM 서버와 연결 가능
- 미니 GPT 실험실: Transformer 구조를 이해하고 테스트하기 위한 장난감급 모델

## 중요한 기준

출처를 남기는 것은 필수지만, 출처를 남긴다고 모든 인터넷 자료를 마음대로 학습해도 되는 것은 아닙니다.  
이 엔진은 기본적으로 다음 자료를 권장합니다.

- 공식 문서
- 공공기관 자료
- 오픈 라이선스 자료
- 사용자가 직접 허락한 서버/문서 자료
- 출처 링크와 수집 시점이 남는 짧은 요약 지식

대량 원문 저장/무단 크롤링은 기본 기능으로 넣지 않았습니다. 대신 URL 단위 수집, 요약 저장, 출처 기록 중심으로 만들었습니다.

## 빠른 실행

```bash
cd outputs/Udon_M1
npm test
npm run demo
```

## 외부 LLM 연결

없어도 동작합니다. 없으면 우돈AI 자체 분류/지식베이스/템플릿 답변으로 답합니다.  
연결하면 더 자연스럽게 답합니다.

### OpenAI 호환 서버

```env
UDONAI_PROVIDER=openai-compatible
UDONAI_LLM_ENDPOINT=https://your-llm-server.example.com/v1/chat/completions
UDONAI_LLM_API_KEY=your_key
UDONAI_LLM_MODEL=qwen2.5:7b
```

### Ollama

```env
UDONAI_PROVIDER=ollama
UDONAI_LLM_ENDPOINT=http://127.0.0.1:11434
UDONAI_LLM_MODEL=qwen2.5:7b
```

Dishost 같은 작은 봇 호스팅에서는 Llama/Qwen/Gemma를 직접 돌리기 어렵습니다.  
이 경우 우돈봇 서버는 이 엔진만 돌리고, 실제 오픈소스 LLM은 별도 VPS/GPU 서버/Ollama 서버에 두는 방식이 안전합니다.

## 우돈봇에 붙이는 예시

```js
const { createUdonAIM1 } = require('./src');

const udonAI = createUdonAIM1({
  ownerId: '545157127690256388',
  dataDir: './data/udonai-m1',
  memoryDir: './memory/udonai-m1'
});

const result = await udonAI.answer('우돈아 뉴욕 날씨 알려줘', {
  userId: message.author.id,
  guildId: message.guildId,
  username: message.author.username
});

await message.reply(result.pages[0].content);
```

## 학습 예시

```js
udonAI.teach({
  question: '몽실테스트키가 뭐야?',
  answer: '몽실테스트키는 서버에서 쓰는 테스트 호출어야.',
  category: 'general',
  userId: message.author.id,
  guildId: message.guildId
});
```

Discord 플러그인 방식에서는 M1이 못 알아들은 질문에 `가르치기` 버튼을 붙입니다. 버튼을 누르면 모달이 열리고, 입력한 답변은 다음 비슷한 질문에 먼저 참고됩니다.

## 자료 수집 예시

```bash
npm run ingest:url -- --url https://www.who.int/health-topics --category medical --title "WHO Health Topics"
```

수집기는 원문 전체를 무제한 저장하지 않고, 출처/요약/짧은 스니펫 위주로 저장합니다.

## 파일 구조

```text
src/
  index.js                  # 엔진 진입점
  core/
    engine.js               # 전체 파이프라인
    classifier.js           # 질문 분류
    knowledgeBase.js        # 지식베이스 검색/저장
    sourcePolicy.js         # 출처 정책
    provider.js             # 외부 LLM 연결
    composer.js             # 답변 생성
    validator.js            # 답변 검수
    paginator.js            # 페이지화
  adapters/
    discordBridge.js        # Discord 연결 보조
  mini-gpt/
    tokenizer.js            # 장난감 토크나이저
    miniGpt.js              # 장난감 Transformer 구조
data/
  sourceRegistry.json       # 카테고리별 출처 후보
  seedKnowledge.json        # 기본 지식
tools/
  demo.js
  ingest-url.js
  mini-gpt-demo.js
tests/
  smoke.test.js
```

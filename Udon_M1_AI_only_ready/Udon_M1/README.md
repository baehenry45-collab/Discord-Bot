# Udon_M1

Udon_M1은 가벼운 AI 응답 엔진 이름입니다.

현재 구성에서 남긴 기능:

- 일상 대화
- 간단한 날씨 질문 처리
- `떡볶이` 단어가 들어간 메시지에 반응
- 답장 컨텍스트(`replyToBot: true`)로 이어서 대화 가능
- `Udon_M1`, `우돈봇`, `우돈엔진` 언급 시 테스트 AI 엔진 소개/칭찬 응답
- 모르는 질문에 대한 직접 학습 버튼
- 온라인 요약 학습 버튼
- 학습 내용 파일 저장: `memory/knowledgeBase.json`
- 선택적 외부 LLM 연결

## 실행

```bash
npm start
```

브라우저에서 `http://127.0.0.1:3000`을 열면 학습 버튼이 있는 간단한 UI를 사용할 수 있습니다.

## API

### 답변

```http
POST /v1/answer
Content-Type: application/json

{ "question": "안녕" }
```

### 직접 학습

```http
POST /v1/teach
Content-Type: application/json

{
  "question": "내 별명은?",
  "answer": "네 별명은 바다야.",
  "category": "general"
}
```

### 온라인 학습

```http
POST /v1/learn-online
Content-Type: application/json

{ "question": "HTML이 뭐야?" }
```

온라인 학습은 공개 요약 정보를 가져와 `memory/knowledgeBase.json`에 저장합니다. 검색 결과가 충분하지 않으면 실패할 수 있습니다.

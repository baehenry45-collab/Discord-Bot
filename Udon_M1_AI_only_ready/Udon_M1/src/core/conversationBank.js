const { compactKey, stableHash } = require('./utils');

const PREFIXES = ['', '저기 ', '혹시 ', '음 ', '그 ', '야 ', 'm1 ', 'Udon_M1 ', '잠깐 ', '질문 '];
const SUFFIXES = ['', '?', '!', ' 알려줘', ' 말해줘', ' 부탁해', ' 해줘', ' 좀', ' 지금', ' 괜찮아?'];

const INTENTS = [
  {
    id: 'tteokbokki_call',
    triggers: ['떡볶이', '떡볶이봇', '떡볶이 봇', '떡볶아', '떡볶이야', '떡볶이 부를게'],
    responses: [
      '응, 떡볶이 봇 대기 중. 이어서 말해줘.',
      '불렀어? 바로 들을게. 무슨 이야기야?',
      '여기 있어. 답장으로 이어서 말하면 계속 대화할게.',
      '떡볶이 봇 호출 확인. 편하게 질문해줘.'
    ]
  },
  {
    id: 'udon_engine_mention',
    triggers: ['Udon_M1', 'udon_m1', '우돈봇', '우돈엔진', '우돈 엔진', '우돈 M1', '우돈M1'],
    responses: [
      '545157127690256388가 만든 테스트 AI 엔진이 들어가 있어~!',
      'Udon_M1은 545157127690256388가 만든 테스트 AI 엔진이야. 꽤 알차게 다듬어진 엔진이지.',
      '우돈봇 쪽에서 쓰기 좋게 만든 테스트 AI 엔진이 들어가 있어. 만든 사람은 545157127690256388야.',
      '우돈엔진은 가볍게 대화하고 학습하는 방향으로 잘 만들어진 테스트 엔진이야.',
      '좋은 말로 하자면, 우돈봇은 꾸준히 진화 중인 실험형 AI 프로젝트야.',
      'Udon_M1은 작지만 야무진 테스트 AI 엔진이야. 학습 저장까지 되는 게 장점이야.'
    ]
  },
  {
    id: 'greeting',
    triggers: ['안녕', '하이', '반가워', '좋은 아침', '좋은 밤', '왔어', '대화하자', '말 걸어도 돼'],
    responses: ['안녕. 편하게 말해줘.', '좋아, 듣고 있어. 무슨 이야기부터 할까?', '반가워. 오늘은 어떤 걸 같이 볼까?']
  },
  {
    id: 'thanks',
    triggers: ['고마워', '감사', '도움 됐어', '좋다', '해결됐어', '수고했어', '덕분이야'],
    responses: ['천천히 맞춰가면 돼. 다음 것도 바로 볼게.', '좋아. 막히는 부분 생기면 이어서 말해줘.', '다행이야. 필요한 만큼 계속 같이 정리하자.']
  },
  {
    id: 'identity',
    triggers: ['너 누구야', '정체가 뭐야', '기능 설명', '뭐 할 수 있어', '엔진 설명'],
    responses: ['나는 Udon_M1 기반의 대화 엔진이야. 일상 대화, 간단한 날씨 질문, 학습 저장을 처리해.', '지금 구성은 가볍게 대화하고, 모르는 건 배워서 다음에 쓰는 방식이야.']
  },
  {
    id: 'status',
    triggers: ['상태 어때', '살아있어', '작동해', '온라인이야', '준비됐어', '대답 가능해'],
    responses: ['응, 작동 중이야.', '준비됐어. 질문을 보내면 바로 처리할게.', '대화와 날씨, 학습 저장 기능이 켜져 있어.']
  },
  {
    id: 'comfort',
    triggers: ['힘들어', '답답해', '짜증나', '멘탈 나갔어', '외로워', '피곤해', '스트레스'],
    responses: ['그럴 때는 한 번에 다 풀려고 하지 말고, 지금 제일 거슬리는 것 하나만 잡아보자.', '일단 숨 좀 고르고, 문제를 작게 나눠보자. 내가 같이 정리해볼게.', '괜찮아. 지금은 결론보다 다음 한 걸음만 잡아도 충분해.']
  },
  {
    id: 'bored',
    triggers: ['심심해', '뭐해', '대화하자', '할 거 없어', '놀자', '잡담하자', '이야기하자'],
    responses: ['좋아. 가볍게 잡담해도 되고, 오늘 있었던 일부터 꺼내도 돼.', '그럼 주제를 하나 골라보자. 오늘 기분, 할 일, 궁금한 것 중 뭐가 좋아?', '대화 가능. 짧게 던져주면 내가 이어 받을게.']
  },
  {
    id: 'explain',
    triggers: ['설명해줘', '쉽게 말해줘', '이해 안 돼', '무슨 뜻이야', '정리해줘', '요약해줘', '간단히'],
    responses: ['좋아. 핵심부터 짧게 잡고, 필요한 부분만 이어서 풀어볼게.', '쉽게 가면 먼저 결론, 그다음 이유, 마지막으로 예시 순서가 좋아.', '한 번에 길게 가지 말고 중요한 부분부터 정리해보자.']
  },
  {
    id: 'decision',
    triggers: ['어떻게 할까', '뭐가 나아', '추천해줘', '골라줘', '선택해줘', '판단해줘', '결정해줘'],
    responses: ['되돌리기 쉬운 선택부터 작게 해보는 쪽이 좋아.', '정보가 부족하면 먼저 기준 하나만 정하자. 안정성인지, 속도인지, 편한 관리인지.', '지금은 크게 바꾸기보다 작은 테스트로 확인하는 흐름이 좋아 보여.']
  },
  {
    id: 'learning',
    triggers: ['이거 배워', '기억해', '학습해', '다음부터 이렇게', '가르칠게', '외워', '저장해'],
    responses: ['좋아. 학습 버튼이나 teach API로 질문과 답변을 저장하면 다음부터 먼저 참고할게.', '질문과 원하는 답변을 같이 저장하면 다음 비슷한 말에 바로 써먹을 수 있어.', '학습 내용은 memory/knowledgeBase.json 파일에 저장돼.']
  },
  {
    id: 'retry',
    triggers: ['다시 해줘', '다시 말해줘', '틀렸어', '아니야', '그거 아냐', '다르게', '자연스럽게'],
    responses: ['좋아, 방향을 바꿔서 다시 말해볼게.', '알겠어. 원하는 말투나 기준을 하나만 알려주면 더 맞춰볼게.', '다시 잡아보자. 내가 놓친 기준이 있으면 같이 알려줘.']
  },
  {
    id: 'weather',
    triggers: ['날씨 어때', '비 와', '우산 필요해', '덥니', '춥니', '기온 알려줘', '내일 날씨'],
    responses: ['날씨는 지역이 필요해. 예를 들면 "서울 오늘 날씨"처럼 물어봐줘.', '지역을 같이 말해주면 날씨 답변으로 정리해볼게.', '도시 이름을 붙여주면 더 정확히 처리할 수 있어.']
  },
  {
    id: 'limit',
    triggers: ['모르면', '대답 못하면', '학습 가능해', '온라인에서 배워', '검색해서 배워', '다음엔 대답해'],
    responses: ['모르는 질문은 학습 버튼으로 저장할 수 있어. 온라인 학습을 누르면 공개 요약 정보를 찾아 저장해볼게.', '확실히 모르는 내용은 아는 척하지 않고 학습 후보로 남길게.', '배운 내용은 파일에 저장되고, 다음 비슷한 질문에서 먼저 참고돼.']
  }
];

function pickResponse(intent, input) {
  const index = parseInt(stableHash(`${intent.id}:${input}`).slice(0, 4), 16) % intent.responses.length;
  return intent.responses[index];
}

function buildCases() {
  const cases = [];
  for (const intent of INTENTS) {
    for (const trigger of intent.triggers) {
      for (const prefix of PREFIXES) {
        for (const suffix of SUFFIXES) {
          const phrase = `${prefix}${trigger}${suffix}`.trim();
          cases.push({
            id: `${intent.id}:${cases.length}`,
            intentId: intent.id,
            phrase,
            key: compactKey(phrase).replace(/\s+/g, ''),
            triggerKey: compactKey(trigger).replace(/\s+/g, ''),
            responseIntent: intent
          });
        }
      }
    }
  }
  return cases.sort((a, b) => b.key.length - a.key.length);
}

const CONVERSATION_CASES = buildCases();

function matchConversationCase(input) {
  const key = compactKey(input).replace(/\s+/g, '');
  if (!key) return null;

  let match = CONVERSATION_CASES.find((item) => item.key === key);
  if (!match) {
    match = CONVERSATION_CASES.find((item) => item.triggerKey.length >= 2 && key.includes(item.triggerKey));
  }
  if (!match) return null;

  return {
    text: pickResponse(match.responseIntent, input),
    mode: `bank:${match.intentId}`,
    conversationCaseId: match.id
  };
}

function conversationCaseCount() {
  return CONVERSATION_CASES.length;
}

function shouldRespond(input, context = {}) {
  const key = compactKey(input).replace(/\s+/g, '');
  return key.includes('떡볶이') || Boolean(context.replyToBot || context.isReplyToBot);
}

module.exports = {
  matchConversationCase,
  conversationCaseCount,
  shouldRespond,
  INTENTS
};

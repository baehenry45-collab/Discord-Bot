const { compactKey, normalizeText, stableHash } = require('./utils');

const PREFIXES = ['', '우돈아 ', 'Udon_M1 ', 'm1 ', '야 ', '저기 ', '혹시 ', '음 ', '그 ', '봇아 '];
const SUFFIXES = ['', '?', '!', ' 좀', ' 해줘', ' 알려줘', ' 부탁해', ' ㅋㅋ', ' ㅎㅎ', ' 지금'];

const INTENTS = [
  {
    id: 'greeting',
    triggers: ['안녕', '하이', 'ㅎㅇ', '반가워', '왔어', '있어', '대답해', '말해', 'hello', 'hi'],
    responses: [
      '응, 나 있어. Udon_M1 모드로 가볍게 대답할게. 뭐부터 볼까?',
      '여기 있어. 짧게 던져줘도 내가 맥락 잡아볼게.',
      '응, 부르면 바로 봐. 지금 뭐 확인할까?'
    ]
  },
  {
    id: 'thanks',
    triggers: ['고마워', '감사', 'ㄱㅅ', '땡큐', '도움 됐어', '좋다', '굿', '수고했어'],
    responses: [
      '좋아. 막히는 부분 생기면 거기부터 이어서 보면 돼.',
      '천천히 맞춰가면 돼. 다음 것도 바로 볼게.',
      '도움 됐다니 다행이야. 이어서 더 다듬어도 돼.'
    ]
  },
  {
    id: 'identity',
    triggers: ['너 누구야', '정체가 뭐야', 'Udon_M1 뭐야', 'Udon_M1 설명해줘', 'Udon_M1 기능', '뭐 할 수 있어', '기능 설명', '엔진 설명', '너 ai야', '너 뭐야'],
    responses: [
      '나는 Udon_M1이야. 질문을 분류하고, 저장된 지식과 출처 정책을 참고해서 답하는 경량 대화 엔진이야.',
      'Udon_M1은 봇 안에서 돌아가는 응답 엔진이야. 잡담, 코드 점검, 출처 기반 안내를 가볍게 처리할 수 있어.',
      '나는 외부 LLM 없이도 기본 대화와 점검형 답변을 해주는 Udon_M1이야. 복잡한 추론은 provider를 붙이면 더 좋아져.'
    ]
  },
  {
    id: 'status',
    triggers: ['상태 어때', '살아있어', '작동해', '온라인이야', '연결됐어', '준비됐어', '응답 가능', '정상 작동'],
    responses: [
      '응, 응답 가능해. 지금은 Udon_M1 기본 엔진으로 처리 중이야.',
      '작동 중이야. 외부 provider가 없으면 기본 대화와 분류 기반 답변으로 처리해.',
      '살아있어. 질문을 주면 분류하고, 필요한 경우 출처 후보까지 붙여서 답할게.'
    ]
  },
  {
    id: 'comfort',
    triggers: ['힘들어', '답답해', '짜증나', '멘탈 나감', '피곤해', '외로워', '막막해', '스트레스'],
    responses: [
      '그럴 때 있지. 지금은 제일 거슬리는 것 하나만 잡아서 같이 풀어보자.',
      '숨 좀 고르고, 문제를 하나로 줄여보자. 뭐가 제일 답답해?',
      '괜찮아. 한 번에 다 정리하려고 하지 말고, 지금 제일 작은 다음 단계부터 보자.'
    ]
  },
  {
    id: 'bored',
    triggers: ['심심해', '뭐해', '놀아줘', '할 거 없어', '대화하자', '얘기하자', '잡담하자'],
    responses: [
      '좋아. 잡담도 되고, 봇 설정이나 코드 얘기도 돼. 가볍게 하나 던져줘.',
      '지금은 대기 중. 짧은 얘기든 문제 해결이든 바로 받을게.',
      '대화 가능해. 오늘 제일 신경 쓰이는 주제부터 꺼내봐.'
    ]
  },
  {
    id: 'explain',
    triggers: ['설명해줘', '쉽게 말해줘', '이해 안돼', '무슨 뜻이야', '정리해줘', '요약해줘', '핵심만', '간단히'],
    responses: [
      '좋아. 핵심만 먼저 잡고, 필요한 부분만 뒤에 붙이는 식으로 정리할게.',
      '쉽게 풀면, 먼저 큰 구조를 보고 그다음 막히는 지점을 좁히면 돼.',
      '한 번에 길게 가기보다 핵심, 이유, 다음 행동 순서로 나누면 이해가 빨라.'
    ]
  },
  {
    id: 'decision',
    triggers: ['어떻게 할까', '뭐가 나아', '추천해줘', '골라줘', '선택해줘', '판단해줘', '결정해줘'],
    responses: [
      '나라면 안전하고 되돌리기 쉬운 쪽부터 고를 거야. 먼저 작은 테스트로 확인해보자.',
      '기준을 하나만 세우면 쉬워져. 안정성이 중요하면 보수적으로, 속도가 중요하면 작은 범위부터 바로 적용하면 돼.',
      '지금 정보만 보면 한 번에 크게 바꾸기보다, 새 경로를 만들고 테스트 후 교체하는 쪽이 좋아.'
    ]
  },
  {
    id: 'coding',
    triggers: ['코드 봐줘', '에러 났어', '버그 있어', '수정해줘', '배포 오류', '로그 봐줘', '서버 안 켜져', '실행 안돼'],
    responses: [
      '좋아, 실무 순서로 보자. 에러 원문, 실행 명령, 최근 수정 파일 세 가지가 먼저야.',
      '먼저 재현부터 잡으면 돼. 로컬에서 같은 에러가 나는지 보고, 그다음 환경 변수와 시작 명령을 비교하자.',
      '코드 문제는 입력, 처리, 출력 중 어디서 값이 비는지 보면 빨라. 로그 첫 부분부터 확인하자.'
    ]
  },
  {
    id: 'learning',
    triggers: ['이거 배워', '기억해', '학습해', '다음부터 이렇게', '이렇게 답해', '가르칠게', '외워'],
    responses: [
      '좋아. 내가 못 알아듣는 말이면 학습 버튼으로 답변을 저장할 수 있어.',
      '가르쳐주면 다음부터 참고할게. 질문과 원하는 답을 같이 남겨주면 가장 좋아.',
      '좋아, 학습 흐름으로 저장하면 다음에 비슷한 말에서 먼저 참고할게.'
    ]
  },
  {
    id: 'retry',
    triggers: ['다시 해줘', '다시 말해줘', '틀렸어', '아니야', '그거 아냐', '다르게', '좀 더 자연스럽게'],
    responses: [
      '오케이. 그럼 더 짧고 자연스럽게 다시 잡아볼게.',
      '좋아, 방향을 바꿔볼게. 원하는 말투나 답변 예시가 있으면 더 잘 맞출 수 있어.',
      '알겠어. 내가 놓친 기준을 하나만 알려주면 그쪽으로 다시 정리할게.'
    ]
  },
  {
    id: 'capability_limit',
    triggers: ['모르면', '못 알아들으면', '헷갈리면', '애매하면', '모르는 질문', '학습 가능해'],
    responses: [
      '모르면 억지로 아는 척하지 않고, 학습 버튼을 띄워서 네가 답을 가르칠 수 있게 할게.',
      '애매한 말은 확정하지 않고 되물어볼게. 필요하면 버튼으로 바로 가르칠 수도 있어.',
      '못 알아듣는 질문은 학습 후보로 표시할게. 답을 저장하면 다음부터 비슷한 질문에 참고해.'
    ]
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
          const phrase = normalizeText(`${prefix}${trigger}${suffix}`);
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
    match = CONVERSATION_CASES.find((item) => item.triggerKey.length >= 3 && key.includes(item.triggerKey));
  }
  if (!match) return null;

  return {
    text: pickResponse(match.responseIntent, input),
    suppressSources: true,
    mode: `bank:${match.intentId}`,
    conversationCaseId: match.id
  };
}

function conversationCaseCount() {
  return CONVERSATION_CASES.length;
}

module.exports = {
  matchConversationCase,
  conversationCaseCount,
  INTENTS
};

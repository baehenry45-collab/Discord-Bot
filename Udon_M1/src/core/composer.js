const { compactKey, normalizeText, scoreByTokens, tokenize } = require('./utils');
const { matchConversationCase } = require('./conversationBank');

const CATEGORY_TEMPLATES = {
  medical: {
    title: '의료 가능성 정리',
    sections: ['가능성', '지금 할 일', '약물 정보', '병원/진료과', '출처']
  },
  weather_water: {
    title: '날씨/수온 정보',
    sections: ['현재 확인 포인트', '자료 확인 방법', '주의점', '출처']
  },
  sports: {
    title: '경기 정보',
    sections: ['현황', '일정/스코어 확인', '해석', '출처']
  },
  anime_manga: {
    title: '애니/만화 정보',
    sections: ['핵심 답변', '작품 정보', '확인할 출처', '주의점']
  },
  food: {
    title: '음식/조리 정보',
    sections: ['핵심 답변', '조리/맛 포인트', '주의점', '출처']
  },
  game: {
    title: '게임 정보',
    sections: ['핵심 답변', '공략/메타', '주의점', '출처']
  },
  coding: {
    title: '기술 답변',
    sections: ['원인', '해결 방향', '예시', '출처']
  },
  finance: {
    title: '금융 정보',
    sections: ['핵심 요약', '확인 지표', '주의점', '출처']
  },
  law: {
    title: '법률/규정 정보',
    sections: ['가능한 쟁점', '확인할 법령', '주의점', '출처']
  },
  server_ops: {
    title: '서버 운영 답변',
    sections: ['핵심 답변', '설정 방향', '주의점', '출처']
  },
  general: {
    title: '답변',
    sections: ['핵심 답변', '근거', '더 확인할 점']
  }
};

function formatSources(sources, limit = 5) {
  const selected = sources.slice(0, limit);
  if (!selected.length) return '아직 연결된 외부 출처가 없어. 대신 카테고리에 맞는 공식 자료 후보를 같이 확인해야 해.';
  return selected
    .map((source, index) => `${index + 1}. ${source.name || source.title || '출처'} — ${source.url || source.source?.url || 'internal://unknown'}`)
    .join('\n');
}

function buildContextBlock({ classification, knowledge = [], sourceCandidates = [] }) {
  const kb = knowledge
    .slice(0, 6)
    .map((doc, index) => {
      const facts = (doc.facts || []).slice(0, 4).map((fact) => `  - ${fact}`).join('\n');
      return `[자료 ${index + 1}] ${doc.title}\n요약: ${doc.summary}\n${facts}\n출처: ${doc.source?.name || 'unknown'} ${doc.source?.url || ''}`;
    })
    .join('\n\n');

  const candidates = sourceCandidates
    .slice(0, 6)
    .map((source) => `- ${source.name}: ${source.url}`)
    .join('\n');

  return [
    `분류: ${classification.label} (${classification.category}, confidence ${classification.confidence.toFixed(2)})`,
    kb ? `지식베이스:\n${kb}` : '지식베이스: 관련 저장 자료 없음',
    candidates ? `권장 출처 후보:\n${candidates}` : ''
  ].filter(Boolean).join('\n\n');
}

function buildSystemPrompt() {
  return [
    '너는 디스코드 봇 우돈봇의 독립 AI 엔진 "Udon_M1"이다.',
    '답변은 한국어로, 똑똑하지만 과장하지 말고, 질문에 직접 답한다.',
    '질문 카테고리와 맞지 않는 출처를 붙이지 않는다.',
    '출처가 부족하면 부족하다고 말하고, 확인해야 할 자료를 안내한다.',
    '의료/법률/금융은 확정 판단이나 개인 처방처럼 말하지 않는다.',
    '긴 답변은 제목과 섹션을 나눠서 Discord 페이지화에 적합하게 작성한다.'
  ].join('\n');
}

const HIGH_RISK_CATEGORIES = new Set(['medical', 'finance', 'law']);

function compactSpeech(input) {
  return normalizeText(input).toLowerCase().replace(/\s+/g, '');
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function findLearnedReply(question, knowledge = []) {
  const qKey = compactKey(question).replace(/\s+/g, '');
  const qTokens = tokenize(question);
  let best = null;

  for (const doc of knowledge) {
    if (!doc.tags?.includes('learned_reply')) continue;
    const prompts = doc.prompts?.length ? doc.prompts : [doc.title, doc.summary];
    const promptKeys = prompts.map((prompt) => compactKey(prompt).replace(/\s+/g, ''));
    const exact = promptKeys.some((key) => key && key === qKey);
    const overlap = Math.max(
      0,
      ...prompts.map((prompt) => scoreByTokens(prompt, qTokens))
    );
    const score = exact ? 100 + overlap : overlap;
    if (score >= 8 && (!best || score > best.score)) best = { doc, score };
  }

  if (!best) return null;
  const doc = best.doc;
  return {
    text: doc.facts?.[0] || doc.summary || '배운 답변을 찾았어.',
    suppressSources: true,
    mode: 'learned_reply'
  };
}

function composeCodingHelp(question, classification) {
  const compact = compactSpeech(question);
  const lines = ['좋아, 이건 바로 실무 흐름으로 보면 돼.'];

  if (includesAny(compact, ['에러', '오류', '버그', '안됨', '안돼', '터짐', '로그'])) {
    lines.push(
      '',
      '먼저 볼 순서는 이거야.',
      '- 에러 메시지 원문을 그대로 확인하기',
      '- 방금 바꾼 파일과 실행 명령을 같이 보기',
      '- 로컬에서 재현되는지 확인하고, 배포 환경 변수 차이를 비교하기',
      '',
      '지금 당장 고치려면 에러 로그 첫 20줄이 제일 중요해. 그 줄에 모듈 누락, 권한 문제, 토큰 누락, 포트 충돌 중 하나가 거의 바로 드러나.'
    );
  } else if (includesAny(compact, ['추가', '붙여', '연동', '적용', '교체', '제거', '빼고'])) {
    lines.push(
      '',
      '안전한 순서는 이렇게 가면 좋아.',
      '- 기존 응답 함수를 한 번에 지우지 말고 새 엔진 호출 함수를 먼저 만들기',
      '- 입력/출력 형태를 기존 봇 메시지 구조에 맞추기',
      '- 실패하면 짧은 로컬 fallback으로 답하게 만들기',
      '- 테스트 질문 3개 정도로 중복 응답과 빈 응답을 확인하기',
      '',
      '이렇게 붙이면 나중에 LLM provider를 다시 넣어도 구조가 안 흔들려.'
    );
  } else {
    lines.push(
      '',
      '핵심은 문제를 “입력, 처리, 출력”으로 나누는 거야.',
      '- 입력: 사용자가 실제로 보낸 메시지',
      '- 처리: 분류, 캐시, 엔진 호출, 예외 처리',
      '- 출력: Discord reply/embed/page 버튼',
      '',
      '어디가 이상한지 모를 때는 이 세 구간 중 어느 지점에서 값이 비는지부터 보면 빨라.'
    );
  }

  if (classification.category === 'server_ops') {
    lines.push('', '배포 쪽이면 환경 변수, 포트, 시작 명령, 로그 레벨도 같이 확인해야 해.');
  }

  return {
    text: lines.join('\n'),
    suppressSources: true,
    mode: 'practical_help'
  };
}

function composeConversationalAnswer(question, { classification, knowledge = [] } = {}) {
  const q = normalizeText(question);
  const compact = compactSpeech(q);

  if (!q || classification.wantsSource || classification.needsFreshSearch) return null;
  if (HIGH_RISK_CATEGORIES.has(classification.category)) return null;

  const learned = findLearnedReply(q, knowledge);
  if (learned) return learned;

  const bank = matchConversationCase(q);
  if (bank && classification.category === 'general') return bank;

  if (classification.category === 'coding' || classification.category === 'server_ops') {
    return composeCodingHelp(q, classification);
  }

  if (classification.category !== 'general') return null;

  if (/^(안녕|하이|ㅎㅇ|야|어이|대답|말해|말좀|있어)\??$/.test(compact)) {
    return {
      text: '응, 나 있어. Udon_M1 모드로 가볍게 대답할게. 뭐부터 볼까?',
      suppressSources: true,
      mode: 'smalltalk'
    };
  }

  if (includesAny(compact, ['고마워', 'ㄱㅅ', '감사', '땡큐'])) {
    return {
      text: '천천히 같이 맞춰보면 돼. 막히는 부분 생기면 거기부터 이어서 보면 되고.',
      suppressSources: true,
      mode: 'smalltalk'
    };
  }

  if (includesAny(compact, ['뭐해', '뭐하냐', '심심', '놀아줘'])) {
    return {
      text: '지금은 대기 중. 잡담도 되고, 코드나 봇 설정도 같이 볼 수 있어. 짧게 던져줘도 내가 맥락 잡아볼게.',
      suppressSources: true,
      mode: 'smalltalk'
    };
  }

  if (includesAny(compact, ['힘들', '짜증', '답답', '멘탈', '피곤', '외로'])) {
    return {
      text: '그럴 때 있지. 지금은 결론부터 세게 밀기보다, 제일 거슬리는 것 하나만 잡아서 같이 풀어보자. 뭐가 제일 답답해?',
      suppressSources: true,
      mode: 'supportive'
    };
  }

  if (includesAny(compact, ['누구', '정체', '뭐야', '가능', '기능', '설명']) && includesAny(compact, ['udon_m1', '우돈', '엔진', 'ai', '너'])) {
    return {
      text: [
        '나는 Udon_M1이야. Gemini 같은 외부 모델이 없어도 봇 안에서 질문을 분류하고, 저장된 지식과 출처 정책을 참고해서 답하는 엔진이야.',
        '',
        '잘하는 쪽은 이런 거야.',
        '- 간단한 잡담과 상태 응답',
        '- 코드/배포 문제를 점검 순서로 정리하기',
        '- 의료/법률/금융처럼 조심해야 하는 질문에서 확정 표현 줄이기',
        '- 출처가 필요한 질문은 후보 자료를 붙여서 답하기',
        '',
        '대신 외부 LLM 없이 완전 자유 추론을 하는 타입은 아니라서, 복잡한 창작이나 긴 분석은 provider를 붙이면 더 좋아져.'
      ].join('\n'),
      suppressSources: true,
      mode: 'identity'
    };
  }

  if (includesAny(compact, ['어떻게', '방법', '추천', '도와줘', '정리', '설명'])) {
    const facts = knowledge.flatMap((doc) => doc.facts || []).slice(0, 4);
    return {
      text: [
        '좋아. 지금 정보만 놓고 보면 이렇게 잡으면 돼.',
        '',
        facts.length
          ? facts.map((fact) => `- ${fact}`).join('\n')
          : '- 목표를 한 문장으로 정하고, 지금 막히는 지점을 하나만 고르면 돼.',
        '- 필요한 정보가 부족하면 바로 확정하지 말고 확인할 항목을 먼저 세우기',
        '- 결과는 짧게 테스트해서 맞는지 보고 다음 단계로 넘어가기',
        '',
        '더 정확히 하려면 현재 상황이나 원하는 결과를 한 줄만 더 붙여줘.'
      ].join('\n'),
      suppressSources: true,
      mode: 'general_help'
    };
  }

  if (q.length <= 35) {
    return {
      text: `응, "${q}" 얘기하는 거지? 조금만 더 구체적으로 말해주면 바로 이어서 정리해볼게.`,
      suppressSources: true,
      mode: 'clarify'
    };
  }

  return {
    text: [
      '아직 이 말은 정확히 못 배웠어.',
      '',
      '아래의 `가르치기` 버튼을 누르면 이 질문에 어떻게 답해야 하는지 저장할 수 있어. 한 번 배워두면 다음에 비슷한 말이 들어왔을 때 먼저 참고할게.',
      '',
      `질문: ${q}`
    ].join('\n'),
    suppressSources: true,
    learnable: true,
    warnings: ['needs_teaching'],
    mode: 'needs_teaching'
  };
}

function composeTemplateAnswer(question, { classification, knowledge = [], sourceCandidates = [] } = {}) {
  const template = CATEGORY_TEMPLATES[classification.category] || CATEGORY_TEMPLATES.general;
  const q = normalizeText(question);
  const facts = knowledge.flatMap((doc) => doc.facts || []).slice(0, 6);
  const sourceLines = formatSources([
    ...knowledge.map((doc) => ({ name: doc.source?.name || doc.title, url: doc.source?.url || 'internal://unknown' })),
    ...sourceCandidates
  ]);

  if (classification.category === 'medical') {
    return [
      `## ${template.title}`,
      '',
      `질문: ${q}`,
      '',
      '먼저 말해둘게. 이건 확진이 아니라 증상 기반 가능성 정리야. 위험 신호가 있으면 119나 응급실이 우선이야.',
      '',
      '### 가능성',
      facts.length
        ? facts.map((fact) => `- ${fact}`).join('\n')
        : '- 증상 조합에 따라 감염, 염증, 알레르기, 심폐 문제 등 여러 가능성을 나눠 봐야 해.',
      '',
      '### 지금 할 일',
      '- 증상이 심하거나 빠르게 악화되면 응급 평가를 받아.',
      '- 열, 호흡곤란, 흉통, 의식 혼란, 심한 탈수, 피가 섞인 증상이 있으면 지체하지 않는 게 좋아.',
      '- 약은 기존 질환/복용약/나이에 따라 달라져서 약사나 의사에게 확인하는 게 안전해.',
      '',
      '### 약물 정보',
      '일반의약품은 증상 완화 목적이야. 성분 중복, 알레르기, 간/신장 질환, 임신, 소아 여부는 꼭 확인해야 해.',
      '',
      '### 출처',
      sourceLines
    ].join('\n');
  }

  if (classification.needsFreshSearch) {
    return [
      `## ${template.title}`,
      '',
      `질문: ${q}`,
      '',
      '이 질문은 최신성이 중요해. 지금 엔진 단독 모드에서는 실시간 API/검색 키가 없으면 최신 결과를 확정해서 말하지 않아.',
      '',
      '### 확인 방향',
      facts.length ? facts.map((fact) => `- ${fact}`).join('\n') : '- 연결된 검색/API가 있으면 최신 자료를 우선 확인해야 해.',
      '',
      '### 우선 확인할 출처',
      sourceLines
    ].join('\n');
  }

  return [
    `## ${template.title}`,
    '',
    `질문: ${q}`,
    '',
    '내가 보기엔 이렇게 정리하는 게 제일 정확해.',
    '',
    facts.length
      ? facts.map((fact) => `- ${fact}`).join('\n')
      : '- 아직 이 주제에 대해 저장된 전용 자료가 부족해. 관련 공식 자료를 추가하면 답변 품질이 더 올라가.',
    '',
    '### 참고 출처',
    sourceLines
  ].join('\n');
}

async function composeAnswer(question, context) {
  const { provider, classification, knowledge, sourceCandidates } = context;

  if (provider?.available()) {
    const promptContext = buildContextBlock({ classification, knowledge, sourceCandidates });
    const result = await provider.complete([
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: `질문:\n${question}\n\n사용 가능한 자료:\n${promptContext}\n\n위 자료만 근거로 우돈AI답게 답해줘.` }
    ], {
      temperature: classification.category === 'medical' ? 0.2 : 0.35,
      maxTokens: 1000
    });
    if (result?.text) return { text: result.text, providerResult: result };
  }

  const conversational = composeConversationalAnswer(question, { classification, knowledge });
  if (conversational) {
    return {
      ...conversational,
      providerResult: null
    };
  }

  return {
    text: composeTemplateAnswer(question, { classification, knowledge, sourceCandidates }),
    providerResult: null
  };
}

module.exports = {
  composeAnswer,
  composeTemplateAnswer,
  composeConversationalAnswer,
  buildContextBlock,
  CATEGORY_TEMPLATES
};

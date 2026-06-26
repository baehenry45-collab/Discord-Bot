const { compactKey, normalizeText } = require('./utils');

const CATEGORY_RULES = [
  {
    category: 'medical',
    label: '의료/건강',
    weight: 10,
    patterns: [
      '아파', '통증', '증상', '기침', '열', '두통', '복통', '설사', '구토', '가슴', '숨', '호흡',
      '응급실', '병원', '진료과', '약', '처방', '복용', '코로나', '독감', '미각', '후각', '혈압',
      '심장', '폐', '알레르기', '발진', '어지러', '마비', '의식', '피가', '출혈'
    ]
  },
  {
    category: 'weather_water',
    label: '날씨/수온',
    weight: 9,
    patterns: ['날씨', '기온', '습도', '비', '눈', '태풍', '풍속', '미세먼지', '수온', '바다 온도', '해수욕장', '호수 온도', '강 온도']
  },
  {
    category: 'sports',
    label: '스포츠/경기',
    weight: 9,
    patterns: ['월드컵', '경기', '스코어', '순위', '일정', '축구', '야구', '농구', '배구', 'epl', 'k리그', '챔스', '올림픽']
  },
  {
    category: 'anime_manga',
    label: '애니/만화',
    weight: 8,
    patterns: ['애니', '만화', '웹툰', '방영', '성우', '작화', '제작사', '감독', '용자', '건담', '원피스', '나루토', '귀멸', '라노벨']
  },
  {
    category: 'food',
    label: '음식/조리',
    weight: 8,
    patterns: ['음식', '레시피', '요리', '조리', '맛집', '호텔', '셰프', '미쉐린', '칼로리', '영양', '라멘', '우동', '초밥']
  },
  {
    category: 'game',
    label: '게임',
    weight: 8,
    patterns: ['게임', '공략', '빌드', '스팀', '닌텐도', '플스', '엑박', '패치노트', '티어', '메타', '버그', '벅샷룰렛']
  },
  {
    category: 'coding',
    label: '기술/코딩',
    weight: 8,
    patterns: ['코드', '코딩', '자바스크립트', 'node', 'discord.js', 'api', '에러', '버그', '깃허브', '배포', '서버', '호스팅', '로그']
  },
  {
    category: 'finance',
    label: '금융',
    weight: 8,
    patterns: ['주식', '코인', '환율', '나스닥', '코스피', '코스닥', '금리', '실적', '공시', '배당', '비트코인', '투자']
  },
  {
    category: 'law',
    label: '법률/규정',
    weight: 7,
    patterns: ['법', '불법', '합법', '규정', '약관', '개인정보', '저작권', '고소', '신고', '계약', '처벌']
  },
  {
    category: 'news',
    label: '뉴스/시사',
    weight: 6,
    patterns: ['뉴스', '속보', '최근', '오늘', '방금', '최신', '현황', '이슈', '사건', '정치', '대통령']
  },
  {
    category: 'server_ops',
    label: '서버운영/디스코드',
    weight: 10,
    patterns: ['디스코드', '봇', '명령어', '권한', '역할', '채널', '서버테러', '안티누크', '도배', '멘션', '슬래시', '초대링크', '전체멘션', '분탕']
  }
];

const EMERGENCY_PATTERNS = [
  '숨이 안', '호흡곤란', '가슴 압박', '가슴통증', '의식', '혼란', '마비', '말이 어눌',
  '피가 멈추지', '자살', '죽고 싶', '실신', '아나필락시스', '입술이 파래'
];

const FRESH_PATTERNS = ['오늘', '지금', '현재', '최신', '방금', '현황', '일정', '스코어', '날씨', '주가', '환율'];

function scoreRule(text, rule) {
  let score = 0;
  for (const pattern of rule.patterns) {
    if (text.includes(compactKey(pattern))) score += rule.weight;
  }
  return score;
}

function classifyQuestion(question, options = {}) {
  const raw = normalizeText(question);
  const text = compactKey(raw);
  const scores = CATEGORY_RULES
    .map((rule) => ({ category: rule.category, label: rule.label, score: scoreRule(text, rule) }))
    .filter((x) => x.score > 0);

  const byCategory = Object.fromEntries(scores.map((item) => [item.category, item]));

  // "오늘/현황/최신" 같은 단어는 거의 모든 최신 질문에 붙는다.
  // 그래서 금융/스포츠/날씨처럼 더 구체적인 카테고리가 잡히면 뉴스보다 우선시한다.
  const news = byCategory.news;
  if (news) {
    for (const specific of ['finance', 'sports', 'weather_water', 'medical', 'anime_manga', 'game', 'food', 'server_ops']) {
      if (byCategory[specific]?.score > 0) news.score = Math.max(1, news.score - 10);
    }
  }

  // 디스코드 보안/관리 질문은 "서버"라는 단어 때문에 코딩으로 새는 일이 많아서 보정한다.
  if (byCategory.server_ops && /(도배|초대링크|안티누크|권한|역할|채널|멘션|분탕|검열|보안)/.test(raw)) {
    byCategory.server_ops.score += 12;
  }

  const ranked = scores
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0] || { category: 'general', label: '일반 지식', score: 1 };
  const secondary = ranked.slice(1, 4).map((x) => x.category);
  const confidence = Math.max(0.25, Math.min(0.95, primary.score / 30));
  const needsFreshSearch =
    FRESH_PATTERNS.some((pattern) => text.includes(compactKey(pattern))) ||
    ['weather_water', 'sports', 'finance', 'news'].includes(primary.category);
  const emergency = EMERGENCY_PATTERNS.some((pattern) => text.includes(compactKey(pattern)));

  const wantsMemory = /(기억해|기억하라고|잊지마|저장해)/.test(raw);
  const wantsSource = /(출처|근거|어디서|자료|논문|기관)/.test(raw);
  const wantsAction = /(해줘|만들어|수정|적용|삭제|켜줘|꺼줘|설정)/.test(raw);

  return {
    raw,
    category: primary.category,
    label: primary.label,
    confidence,
    secondary,
    needsFreshSearch,
    emergency,
    wantsMemory,
    wantsSource,
    wantsAction,
    ranked,
    userId: options.userId || null,
    guildId: options.guildId || null
  };
}

module.exports = {
  CATEGORY_RULES,
  classifyQuestion
};

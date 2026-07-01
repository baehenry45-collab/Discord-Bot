const { compactKey, normalizeText } = require('./utils');

const WEATHER_PATTERNS = [
  '날씨', '기온', '온도', '비', '눈', '바람', '습도', '미세먼지', '우산',
  '덥', '춥', '태풍', '오늘 날씨', '내일 날씨', '주간 날씨'
];

const REMOVED_MEDICAL_PATTERNS = [
  '진단', '처방', '증상', '아파', '통증', '병원', '약', '복용', '응급',
  '두통', '복통', '기침', '열', '코로나', '알레르기', '발진'
];

const FRESH_PATTERNS = ['오늘', '내일', '지금', '현재', '최신', '방금', '이번 주'];

function hasAny(text, patterns) {
  return patterns.some((pattern) => text.includes(compactKey(pattern)));
}

function classifyQuestion(question, options = {}) {
  const raw = normalizeText(question);
  const key = compactKey(raw);
  const medicalBlocked = hasAny(key, REMOVED_MEDICAL_PATTERNS);
  const isWeather = !medicalBlocked && hasAny(key, WEATHER_PATTERNS);

  return {
    raw,
    category: isWeather ? 'weather' : 'general',
    label: isWeather ? '날씨' : '일상 대화',
    confidence: isWeather ? 0.86 : 0.55,
    needsFreshSearch: isWeather || hasAny(key, FRESH_PATTERNS),
    medicalBlocked,
    secondary: [],
    ranked: [],
    userId: options.userId || null
  };
}

module.exports = {
  classifyQuestion,
  WEATHER_PATTERNS,
  REMOVED_MEDICAL_PATTERNS
};

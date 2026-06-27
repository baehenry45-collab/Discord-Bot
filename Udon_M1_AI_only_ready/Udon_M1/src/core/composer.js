const { normalizeText } = require('./utils');
const { matchConversationCase } = require('./conversationBank');

function findLearnedReply(question, knowledge = []) {
  if (!knowledge.length) return null;
  const best = knowledge[0];
  if (!best || best.score < 5) return null;
  return {
    text: best.answer,
    mode: best.method === 'online' ? 'learned_online' : 'learned_manual'
  };
}

function composeWeatherAnswer(question) {
  return {
    text: [
      '날씨 질문으로 이해했어.',
      '',
      '현재 이 엔진에는 실시간 날씨 API 키가 연결되어 있지 않아서 정확한 현재 기온을 단정하지는 않을게.',
      '지역을 포함해서 물어보면 온라인 학습 버튼이나 별도 날씨 API 연결로 다음부터 더 정확히 답할 수 있어.',
      '',
      `질문: ${question}`
    ].join('\n'),
    mode: 'weather',
    learnable: true
  };
}

function composeBlockedMedicalAnswer() {
  return {
    text: '이 구성에서는 의료 진단/처방/증상 판단 기능을 제거했어. 건강 문제는 의료 전문가나 공식 상담 창구를 이용해줘.',
    mode: 'removed_medical',
    learnable: false,
    warnings: ['medical_feature_removed']
  };
}

async function composeAnswer(question, context) {
  const { provider, classification, knowledge } = context;
  const clean = normalizeText(question);

  if (classification.medicalBlocked) return composeBlockedMedicalAnswer();

  const bank = matchConversationCase(clean);
  if (bank && classification.category === 'general') return bank;

  if (classification.category === 'weather') return composeWeatherAnswer(clean);

  const learned = findLearnedReply(clean, knowledge);
  if (learned) return learned;

  if (provider?.available()) {
    const result = await provider.complete([
      { role: 'system', content: '너는 Udon_M1이다. 캐릭터 설정 없이, 일상 대화와 간단한 안내만 자연스럽게 답한다. 건강 판단이나 참고 링크 표기는 하지 않는다.' },
      { role: 'user', content: clean }
    ], { temperature: 0.5, maxTokens: 700 });
    if (result?.text) return { text: result.text, mode: 'provider', providerResult: result };
  }

  return {
    text: [
      '아직 이 질문에 맞는 답변을 배우지 못했어.',
      '',
      '아래 학습 버튼으로 직접 답변을 저장하거나, 온라인 학습을 눌러 공개 요약 정보를 찾아 저장할 수 있어.',
      '저장된 내용은 다음 비슷한 질문에서 먼저 참고할게.',
      '',
      `질문: ${clean}`
    ].join('\n'),
    mode: 'needs_teaching',
    learnable: true,
    warnings: ['needs_teaching']
  };
}

module.exports = {
  composeAnswer
};

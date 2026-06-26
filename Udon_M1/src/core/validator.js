const RISKY_MEDICAL_WORDS = [
  { from: /확진입니다/g, to: '가능성이 있어 보여요' },
  { from: /무조건\s*([^\n.]+)먹/g, to: '약물은 의사/약사와 확인 후 복용' },
  { from: /응급실 갈 필요 없/g, to: '응급 여부는 증상 변화에 따라 달라질 수 있어요' }
];

function validateAnswer(answer, classification, sources = []) {
  const warnings = [];
  let text = String(answer || '');

  if (classification.category === 'medical') {
    for (const rule of RISKY_MEDICAL_WORDS) {
      if (rule.from.test(text)) {
        text = text.replace(rule.from, rule.to);
        warnings.push('medical_risky_phrase_rewritten');
      }
    }
    if (!/확진|진단|의료진|진찰|검사/.test(text)) {
      text = `먼저 말해둘게. 이건 확진이 아니라 증상 기반 가능성 정리야.\n\n${text}`;
      warnings.push('medical_uncertainty_added');
    }
  }

  if (['medical', 'finance', 'law'].includes(classification.category) && sources.length === 0) {
    warnings.push('high_risk_answer_without_sources');
  }

  if (classification.needsFreshSearch && sources.length === 0) {
    warnings.push('fresh_question_without_live_source');
  }

  return {
    text,
    warnings,
    ok: warnings.length === 0 || warnings.every((w) => w.endsWith('_added') || w.endsWith('_rewritten'))
  };
}

module.exports = {
  validateAnswer
};

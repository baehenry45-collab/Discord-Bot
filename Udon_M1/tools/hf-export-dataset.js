const fs = require('fs');
const path = require('path');
const { createUdonAIM1 } = require('../src');
const { ensureDir } = require('../src/core/utils');

function toJsonlLine(item) {
  return JSON.stringify(item).replace(/\u2028|\u2029/g, '');
}

function buildTrainingRows(engine) {
  const docs = engine.kb.all();
  const rows = [];

  for (const doc of docs) {
    rows.push({
      id: `${doc.id}:summary`,
      task: 'source_grounded_answer',
      category: doc.category,
      messages: [
        {
          role: 'system',
          content: '너는 Udon_M1이다. 질문에 직접 답하되, 출처와 자료 범위를 분명히 말한다.'
        },
        {
          role: 'user',
          content: `${doc.title}에 대해 출처 기반으로 요약해줘.`
        },
        {
          role: 'assistant',
          content: `${doc.summary}\n\n출처: ${doc.source?.name || doc.title} (${doc.source?.url || 'internal://unknown'})`
        }
      ],
      source: doc.source,
      license: doc.source?.license || 'unknown'
    });

    for (const [index, fact] of (doc.facts || []).entries()) {
      rows.push({
        id: `${doc.id}:fact:${index}`,
        task: 'fact_grounding',
        category: doc.category,
        messages: [
          {
            role: 'system',
            content: '너는 Udon_M1이다. 저장된 사실을 과장하지 말고 답한다.'
          },
          {
            role: 'user',
            content: `${doc.title}에서 중요한 점 하나만 말해줘.`
          },
          {
            role: 'assistant',
            content: `${fact}\n\n출처: ${doc.source?.name || doc.title} (${doc.source?.url || 'internal://unknown'})`
          }
        ],
        source: doc.source,
        license: doc.source?.license || 'unknown'
      });
    }
  }

  return rows;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const engine = createUdonAIM1({ rootDir, memoryDir: path.join(rootDir, 'memory') });
  const outDir = path.join(rootDir, 'exports', 'huggingface');
  ensureDir(outDir);

  const rows = buildTrainingRows(engine);
  const jsonl = rows.map(toJsonlLine).join('\n') + '\n';
  const jsonlFile = path.join(outDir, 'udonai-m1-train.jsonl');
  fs.writeFileSync(jsonlFile, jsonl, 'utf8');

  const card = [
    '---',
    'license: other',
    'language:',
    '- ko',
    'task_categories:',
    '- text-generation',
    '- question-answering',
    'pretty_name: Udon_M1 Source Grounded Dataset',
    '---',
    '',
    '# Udon_M1 Source Grounded Dataset',
    '',
    'Udon_M1의 출처 기반 답변 실험용 데이터셋입니다.',
    '',
    '## 주의',
    '',
    '- 공개 전 개인정보와 서버 로그 포함 여부를 반드시 확인하세요.',
    '- 원문 대량 복사가 아니라 요약/출처/허락된 자료 중심으로 구성해야 합니다.',
    '- 각 row의 `source`와 `license`를 확인하고, 공개 범위를 결정하세요.',
    '',
    '## Format',
    '',
    '각 줄은 ChatML 스타일 `messages` 배열을 가진 JSON 객체입니다.',
    '',
    `Rows: ${rows.length}`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'dataset-card.md'), card, 'utf8');

  console.log(JSON.stringify({ ok: true, rows: rows.length, jsonlFile, cardFile: path.join(outDir, 'dataset-card.md') }, null, 2));
}

main();

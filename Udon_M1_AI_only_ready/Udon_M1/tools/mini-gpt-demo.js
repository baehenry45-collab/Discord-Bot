const { TinyTokenizer, MiniGPT } = require('../src');

const texts = [
  'Udon_M1은 일상 대화를 처리한다.',
  '모르는 질문은 학습 버튼으로 저장한다.',
  '날씨 질문은 지역을 함께 물어보면 좋다.',
  '학습한 답변은 다음 질문에서 먼저 참고한다.'
];

const tokenizer = new TinyTokenizer().fit(texts);
const sequences = texts.map((text) => tokenizer.encode(text));
const model = new MiniGPT({
  vocabSize: tokenizer.size,
  blockSize: 24,
  nEmb: 24,
  nLayer: 2,
  seed: 545157
}).fitBigram(sequences);

const prompt = tokenizer.encode('Udon_M1은', { eos: false });
const generated = model.generate(prompt, { maxNewTokens: 18, eosId: tokenizer.tokenToId.get('<eos>') });

console.log('[Mini GPT demo]');
console.log('vocab:', tokenizer.size);
console.log('prompt:', tokenizer.decode(prompt));
console.log('generated:', tokenizer.decode(generated));

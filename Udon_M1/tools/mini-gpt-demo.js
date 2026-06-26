const { TinyTokenizer, MiniGPT } = require('../src');

const texts = [
  '우돈이는 출처를 보고 답한다.',
  '의료 질문은 확진이 아니라 가능성을 정리한다.',
  '애니 질문에는 애니 관련 출처를 붙인다.',
  '날씨 질문은 최신 자료가 필요하다.'
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

const prompt = tokenizer.encode('우돈이는', { eos: false });
const generated = model.generate(prompt, { maxNewTokens: 18, eosId: tokenizer.tokenToId.get('<eos>') });

console.log('[Mini GPT 구조 데모]');
console.log('vocab:', tokenizer.size);
console.log('prompt:', tokenizer.decode(prompt));
console.log('generated:', tokenizer.decode(generated));

function seededRandom(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function zeros(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function randomMatrix(rows, cols, rnd, scale = 0.02) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rnd() * 2 - 1) * scale));
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function matVec(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function add(a, b) {
  return a.map((v, i) => v + b[i]);
}

function gelu(x) {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((v) => v / sum);
}

function layerNorm(vector, eps = 1e-5) {
  const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
  const variance = vector.reduce((a, b) => a + (b - mean) ** 2, 0) / vector.length;
  return vector.map((v) => (v - mean) / Math.sqrt(variance + eps));
}

class MiniTransformerBlock {
  constructor(config, rnd) {
    this.nEmb = config.nEmb;
    this.wq = randomMatrix(config.nEmb, config.nEmb, rnd);
    this.wk = randomMatrix(config.nEmb, config.nEmb, rnd);
    this.wv = randomMatrix(config.nEmb, config.nEmb, rnd);
    this.wo = randomMatrix(config.nEmb, config.nEmb, rnd);
    this.ff1 = randomMatrix(config.nEmb * 4, config.nEmb, rnd);
    this.ff2 = randomMatrix(config.nEmb, config.nEmb * 4, rnd);
  }

  forward(sequence) {
    const normalized = sequence.map((x) => layerNorm(x));
    const q = normalized.map((x) => matVec(this.wq, x));
    const k = normalized.map((x) => matVec(this.wk, x));
    const v = normalized.map((x) => matVec(this.wv, x));
    const attended = [];

    for (let t = 0; t < sequence.length; t += 1) {
      const scores = [];
      for (let j = 0; j <= t; j += 1) scores.push(dot(q[t], k[j]) / Math.sqrt(this.nEmb));
      const weights = softmax(scores);
      const mixed = Array(this.nEmb).fill(0);
      for (let j = 0; j <= t; j += 1) {
        for (let d = 0; d < this.nEmb; d += 1) mixed[d] += weights[j] * v[j][d];
      }
      attended[t] = matVec(this.wo, mixed);
    }

    const withAttention = sequence.map((x, i) => add(x, attended[i]));
    const ffInput = withAttention.map((x) => layerNorm(x));
    const ffOutput = ffInput.map((x) => {
      const hidden = matVec(this.ff1, x).map(gelu);
      return matVec(this.ff2, hidden);
    });
    return withAttention.map((x, i) => add(x, ffOutput[i]));
  }
}

class MiniGPT {
  constructor(config = {}) {
    this.config = {
      vocabSize: config.vocabSize || 128,
      blockSize: config.blockSize || 32,
      nEmb: config.nEmb || 32,
      nLayer: config.nLayer || 2,
      seed: config.seed || 1337
    };
    this.rnd = seededRandom(this.config.seed);
    this.tokenEmbedding = randomMatrix(this.config.vocabSize, this.config.nEmb, this.rnd);
    this.positionEmbedding = randomMatrix(this.config.blockSize, this.config.nEmb, this.rnd);
    this.blocks = Array.from({ length: this.config.nLayer }, () => new MiniTransformerBlock(this.config, this.rnd));
    this.lmHead = randomMatrix(this.config.vocabSize, this.config.nEmb, this.rnd);
    this.bigramCounts = zeros(this.config.vocabSize, this.config.vocabSize);
  }

  embed(ids) {
    return ids.slice(-this.config.blockSize).map((id, pos) => {
      const token = this.tokenEmbedding[id] || this.tokenEmbedding[1];
      const position = this.positionEmbedding[pos];
      return add(token, position);
    });
  }

  forward(ids) {
    let x = this.embed(ids);
    for (const block of this.blocks) x = block.forward(x);
    const last = layerNorm(x[x.length - 1]);
    return matVec(this.lmHead, last);
  }

  fitBigram(sequences = []) {
    for (const ids of sequences) {
      for (let i = 0; i < ids.length - 1; i += 1) {
        const a = ids[i];
        const b = ids[i + 1];
        if (a < this.config.vocabSize && b < this.config.vocabSize) this.bigramCounts[a][b] += 1;
      }
    }
    return this;
  }

  nextToken(ids, temperature = 0.9) {
    const logits = this.forward(ids);
    const last = ids[ids.length - 1] || 0;
    const bigram = this.bigramCounts[last] || [];
    const mixed = logits.map((logit, index) => logit + Math.log((bigram[index] || 0) + 1));
    const probs = softmax(mixed.map((v) => v / Math.max(0.05, temperature)));
    let r = this.rnd();
    for (let i = 0; i < probs.length; i += 1) {
      r -= probs[i];
      if (r <= 0) return i;
    }
    return probs.length - 1;
  }

  generate(promptIds, { maxNewTokens = 32, eosId = 3, temperature = 0.9 } = {}) {
    const ids = [...promptIds];
    for (let i = 0; i < maxNewTokens; i += 1) {
      const next = this.nextToken(ids, temperature);
      ids.push(next);
      if (next === eosId) break;
    }
    return ids;
  }
}

module.exports = {
  MiniGPT
};

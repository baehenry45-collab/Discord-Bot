const fs = require('fs');

class TinyTokenizer {
  constructor(options = {}) {
    this.specialTokens = options.specialTokens || ['<pad>', '<unk>', '<bos>', '<eos>'];
    this.tokenToId = new Map();
    this.idToToken = [];
    for (const token of this.specialTokens) this.addToken(token);
  }

  addToken(token) {
    if (this.tokenToId.has(token)) return this.tokenToId.get(token);
    const id = this.idToToken.length;
    this.tokenToId.set(token, id);
    this.idToToken[id] = token;
    return id;
  }

  fit(texts = []) {
    for (const text of texts) {
      for (const token of this.basicTokenize(text)) this.addToken(token);
    }
    return this;
  }

  basicTokenize(text) {
    return String(text || '')
      .normalize('NFKC')
      .replace(/([.,!?;:()[\]{}"“”‘’])/g, ' $1 ')
      .split(/\s+/)
      .filter(Boolean);
  }

  encode(text, { bos = true, eos = true } = {}) {
    const ids = [];
    if (bos) ids.push(this.tokenToId.get('<bos>'));
    for (const token of this.basicTokenize(text)) ids.push(this.tokenToId.get(token) ?? this.tokenToId.get('<unk>'));
    if (eos) ids.push(this.tokenToId.get('<eos>'));
    return ids;
  }

  decode(ids = []) {
    return ids
      .map((id) => this.idToToken[id] || '<unk>')
      .filter((token) => !this.specialTokens.includes(token))
      .join(' ')
      .replace(/\s+([.,!?;:)])/g, '$1')
      .replace(/([(])\s+/g, '$1')
      .trim();
  }

  get size() {
    return this.idToToken.length;
  }

  toJSON() {
    return {
      specialTokens: this.specialTokens,
      idToToken: this.idToToken
    };
  }

  save(file) {
    fs.writeFileSync(file, JSON.stringify(this.toJSON(), null, 2), 'utf8');
  }

  static fromJSON(json) {
    const tokenizer = new TinyTokenizer({ specialTokens: json.specialTokens });
    tokenizer.tokenToId = new Map();
    tokenizer.idToToken = [];
    for (const token of json.idToToken || []) tokenizer.addToken(token);
    return tokenizer;
  }

  static load(file) {
    return TinyTokenizer.fromJSON(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
}

module.exports = {
  TinyTokenizer
};

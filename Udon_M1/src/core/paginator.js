function splitLongText(text, maxChars = 1800) {
  const value = String(text || '');
  if (value.length <= maxChars) return [value];

  const blocks = value.split(/\n{2,}/);
  const pages = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) pages.push(current);
    if (block.length <= maxChars) {
      current = block;
    } else {
      for (let i = 0; i < block.length; i += maxChars) {
        pages.push(block.slice(i, i + maxChars));
      }
      current = '';
    }
  }
  if (current) pages.push(current);
  return pages;
}

function paginateAnswer({ text, category, sources = [], title = 'Udon_M1' }, options = {}) {
  const maxChars = options.maxChars || 1800;
  const chunks = splitLongText(text, maxChars);
  const total = chunks.length;
  return chunks.map((content, index) => ({
    index,
    total,
    title: total > 1 ? `${title} · ${index + 1}/${total}` : title,
    category,
    content,
    sources: index === total - 1 ? sources : [],
    footer: `Udon_M1 · ${index + 1}/${total}`
  }));
}

module.exports = {
  splitLongText,
  paginateAnswer
};

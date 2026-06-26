const path = require('path');
const { readJson, parseDomain, nowIso } = require('./utils');

function loadRegistry(registryFile) {
  return readJson(registryFile, { version: 'empty', categories: {} });
}

function sourceCandidatesForCategory(registry, category) {
  const categories = registry.categories || {};
  const selected = categories[category] || categories.general || { sources: [] };
  return selected.sources || [];
}

function allAllowedDomains(registry) {
  const domains = [];
  for (const category of Object.values(registry.categories || {})) {
    for (const source of category.sources || []) {
      const domain = parseDomain(source.url);
      if (domain) domains.push(domain);
    }
  }
  return [...new Set(domains)];
}

function isDomainAllowed(url, registry, category = null) {
  const domain = parseDomain(url);
  if (!domain) return false;
  const candidates = category ? sourceCandidatesForCategory(registry, category) : Object.values(registry.categories || {}).flatMap((c) => c.sources || []);
  return candidates.some((source) => {
    const sourceDomain = parseDomain(source.url);
    return domain === sourceDomain || domain.endsWith(`.${sourceDomain}`);
  });
}

function buildSourcePolicy({ rootDir, registryFile } = {}) {
  const file = registryFile || path.join(rootDir || process.cwd(), 'data', 'sourceRegistry.json');
  const registry = loadRegistry(file);

  return {
    registry,
    version: registry.version,
    sourceCandidates(category) {
      return sourceCandidatesForCategory(registry, category);
    },
    allowedDomains(category = null) {
      if (category) return sourceCandidatesForCategory(registry, category).map((s) => parseDomain(s.url)).filter(Boolean);
      return allAllowedDomains(registry);
    },
    checkUrl(url, category = null, { allowUnknown = false } = {}) {
      const domain = parseDomain(url);
      const allowed = allowUnknown || isDomainAllowed(url, registry, category);
      return {
        url,
        domain,
        allowed,
        category,
        checkedAt: nowIso(),
        reason: allowed ? 'allowed_or_user_approved' : 'domain_not_in_category_registry'
      };
    }
  };
}

module.exports = {
  buildSourcePolicy,
  loadRegistry,
  sourceCandidatesForCategory,
  isDomainAllowed
};

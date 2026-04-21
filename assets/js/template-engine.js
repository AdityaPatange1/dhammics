/**
 * Lightweight HTML templating engine for static pages.
 *
 * Supports:
 * - Block includes: {{> block-name}}
 * - Variable interpolation: {{varName}}
 */

const templateCache = new Map();

const fetchText = async (url) => {
  if (templateCache.has(url)) return templateCache.get(url);
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Template load failed (${res.status}): ${url}`);
  const text = await res.text();
  templateCache.set(url, text);
  return text;
};

const resolveIncludes = async (content) => {
  const includePattern = /\{\{\>\s*([a-z0-9/_-]+)\s*\}\}/gi;
  let output = content;
  let match = includePattern.exec(output);
  while (match) {
    const [token, blockName] = match;
    const blockPath = `./assets/templates/blocks/${blockName}.html`;
    const blockRaw = await fetchText(blockPath);
    const blockResolved = await resolveIncludes(blockRaw);
    output = output.replace(token, blockResolved);
    includePattern.lastIndex = 0;
    match = includePattern.exec(output);
  }
  return output;
};

const interpolate = (content, data = {}) =>
  content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
    if (!(key in data)) return '';
    return String(data[key]);
  });

export const renderTemplate = async ({ page, mount, data = {} }) => {
  const pagePath = `./assets/templates/pages/${page}.html`;
  const pageRaw = await fetchText(pagePath);
  const withIncludes = await resolveIncludes(pageRaw);
  mount.innerHTML = interpolate(withIncludes, data);
  document.dispatchEvent(new CustomEvent('dhammics:template-rendered', { detail: { page } }));
};


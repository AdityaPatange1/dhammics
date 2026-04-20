/**
 * Tiny, safe-ish Markdown → HTML renderer. Purposefully small and dependency
 * free so the site can ship as pure static assets with no bundler required.
 * Supports: headings, bold, italic, inline/bolded code, links, images,
 * block quotes, ordered/unordered lists, code blocks, horizontal rules, and
 * YAML-style front matter.
 */

const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const parseFrontMatter = (text) => {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const yaml = match[1];
  const body = text.slice(match[0].length);
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    // Arrays in bracket form: [a, b, c]
    if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    data[m[1]] = value;
  }
  return { data, body };
};

const inline = (text) => {
  let out = escape(text);
  // images ![alt](src)
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
    (_, alt, src, title) =>
      `<img src="${src}" alt="${alt}" loading="lazy" decoding="async"${
        title ? ` title="${title}"` : ''
      } />`
  );
  // links [text](href)
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
    (_, label, href, title) =>
      `<a href="${href}" ${
        /^https?:\/\//.test(href) ? 'target="_blank" rel="noopener noreferrer"' : ''
      }${title ? ` title="${title}"` : ''}>${label}</a>`
  );
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *x* (avoid when adjacent to word characters to minimise false hits)
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
  // underline via _x_
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
  return out;
};

export const renderMarkdown = (markdown) => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isListItem = (line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
  const listType = (line) => (/^\s*\d+\./.test(line) ? 'ol' : 'ul');
  const stripMarker = (line) =>
    line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim();

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(
        `<pre><code${lang ? ` class="lang-${lang}"` : ''}>${escape(buf.join('\n'))}</code></pre>`
      );
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(buf.join(' ').trim())}</blockquote>`);
      continue;
    }

    // Lists
    if (isListItem(line)) {
      const type = listType(line);
      const items = [];
      while (i < lines.length && isListItem(lines[i])) {
        const buf = [stripMarker(lines[i])];
        i += 1;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          buf.push(lines[i].trim());
          i += 1;
        }
        items.push(`<li>${inline(buf.join(' '))}</li>`);
      }
      out.push(`<${type}>${items.join('')}</${type}>`);
      continue;
    }

    // Paragraph
    const buf = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !isListItem(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return out.join('\n');
};

export const excerpt = (markdown, max = 180) => {
  const { body } = parseFrontMatter(markdown);
  const clean = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
};

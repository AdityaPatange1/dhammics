#!/usr/bin/env node
/**
 * Build step for Dhammics.
 *
 * The site is static and ships the source files directly — but this script
 * performs three useful jobs:
 *
 *   1. Re-derives the post manifest from the `.md` front-matter so a single
 *      source of truth exists (the markdown files themselves).
 *   2. Generates a simple sitemap.xml and rss.xml from the manifest.
 *   3. Emits a `dist/` folder ready for GitHub Pages, with `.nojekyll`.
 *
 * Running `npm run build` is optional during development — serving the
 * repository root works fine. It becomes useful on CI/CD.
 */

import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');
const postsDir = join(root, 'content/posts');

const SITE_URL = process.env.DHAMMICS_SITE_URL || 'https://example.github.io/dhammics';

const parseFrontMatter = (text) => {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const rawVal = m[2].trim();
    if (/^\[.*\]$/.test(rawVal)) {
      data[m[1]] = rawVal
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      data[m[1]] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
  return { data, body: text.slice(match[0].length) };
};

const readPosts = async () => {
  const files = (await readdir(postsDir)).filter((f) => f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const raw = await readFile(join(postsDir, file), 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const words = body.trim().split(/\s+/).length;
    posts.push({
      slug: data.slug || file.replace(/\.md$/, ''),
      title: data.title || 'Untitled',
      description: data.description || '',
      date: data.date || new Date().toISOString().slice(0, 10),
      author: data.author || 'Dhammics',
      tags: Array.isArray(data.tags) ? data.tags : [],
      cover: data.cover || '',
      readingTime: Number(data.readingTime) || Math.max(1, Math.round(words / 220)),
      file: `./content/posts/${file}`,
    });
  }
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
};

const writeManifest = async (posts) => {
  const manifest = {
    $schema: './manifest.schema.json',
    generatedAt: new Date().toISOString().slice(0, 10),
    posts,
  };
  await writeFile(join(postsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ Wrote manifest with ${posts.length} post(s)`);
};

const writeSitemap = async (posts, targetDir) => {
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/index.html`,
    `${SITE_URL}/feed.html`,
    `${SITE_URL}/user.html`,
    ...posts.map((p) => `${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
  await writeFile(join(targetDir, 'sitemap.xml'), xml);
  console.log(`✓ Wrote sitemap.xml (${urls.length} urls)`);
};

const writeRss = async (posts, targetDir) => {
  const items = posts
    .map(
      (p) => `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="false">${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dhammics</title>
    <link>${SITE_URL}</link>
    <description>Essays on the Dhamma.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  await writeFile(join(targetDir, 'rss.xml'), xml);
  console.log(`✓ Wrote rss.xml (${posts.length} items)`);
};

const copyDist = async () => {
  if (existsSync(dist)) await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const ignore = new Set(['node_modules', 'dist', '.git', '.github', 'scripts', '.vite']);
  for (const name of await readdir(root)) {
    if (ignore.has(name)) continue;
    if (name.startsWith('.') && !['.htmlhintrc'].includes(name)) continue;
    await cp(join(root, name), join(dist, name), { recursive: true });
  }

  await writeFile(join(dist, '.nojekyll'), '');
  console.log(`✓ Copied site to ${relative(root, dist)}/`);
};

const main = async () => {
  console.log('→ Building Dhammics…');
  const posts = await readPosts();
  await writeManifest(posts);
  await copyDist();
  await writeSitemap(posts, dist);
  await writeRss(posts, dist);
  console.log('\n\u001b[32m✓ Build complete.\u001b[0m');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

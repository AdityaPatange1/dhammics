/**
 * Post loader — fetches /content/posts/manifest.json and resolves individual
 * markdown files. Also merges in any local drafts saved via the admin panel
 * for a live preview without needing to redeploy.
 */

import { parseFrontMatter, excerpt } from './markdown.js';

const MANIFEST_URL = new URL('../../content/posts/manifest.json', import.meta.url);
const DRAFTS_KEY = 'dhammics:drafts';

const cache = {
  manifest: null,
  posts: new Map(),
};

const toNumberOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalise = (entry, body = '') => ({
  slug: entry.slug,
  title: entry.title,
  description: entry.description || excerpt(body, 180),
  date: entry.date,
  author: entry.author || 'Dhammics',
  tags: Array.isArray(entry.tags) ? entry.tags : [],
  cover: entry.cover || '',
  readingTime: toNumberOr(entry.readingTime, 0),
  file: entry.file || `./content/posts/${entry.slug}.md`,
  draft: Boolean(entry.draft),
});

const readDrafts = () => {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const writeDrafts = (list) => {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
};

export const getDrafts = () => readDrafts();

export const loadManifest = async () => {
  if (cache.manifest) return cache.manifest;
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Manifest ${res.status}`);
    const data = await res.json();
    const posts = Array.isArray(data.posts) ? data.posts.map((p) => normalise(p)) : [];
    cache.manifest = { posts };
  } catch (err) {
    console.error('Failed to load manifest:', err);
    cache.manifest = { posts: [] };
  }
  return cache.manifest;
};

export const listPosts = async ({ includeDrafts = true } = {}) => {
  const { posts } = await loadManifest();
  const drafts = includeDrafts
    ? readDrafts().map((d) =>
        normalise(
          {
            slug: d.slug,
            title: d.title,
            description: d.description,
            date: d.date,
            author: d.author,
            tags: d.tags,
            cover: d.cover,
            readingTime: d.readingTime,
            draft: true,
          },
          d.body
        )
      )
    : [];
  const merged = [...drafts, ...posts];
  const seen = new Set();
  const unique = merged.filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });
  return unique.sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const getPost = async (slug) => {
  if (cache.posts.has(slug)) return cache.posts.get(slug);

  const drafts = readDrafts();
  const draft = drafts.find((d) => d.slug === slug);
  if (draft) {
    const post = {
      ...normalise(
        {
          slug: draft.slug,
          title: draft.title,
          description: draft.description,
          date: draft.date,
          author: draft.author,
          tags: draft.tags,
          cover: draft.cover,
          readingTime: draft.readingTime,
          draft: true,
        },
        draft.body
      ),
      body: draft.body,
    };
    cache.posts.set(slug, post);
    return post;
  }

  const { posts } = await loadManifest();
  const meta = posts.find((p) => p.slug === slug);
  if (!meta) return null;

  const fileUrl = new URL(`../../${meta.file.replace(/^\.\//, '')}`, import.meta.url);
  const res = await fetch(fileUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load post: ${res.status}`);
  const text = await res.text();
  const { data, body } = parseFrontMatter(text);
  const merged = { ...meta, ...normalise({ ...meta, ...data }, body), body };
  cache.posts.set(slug, merged);
  return merged;
};

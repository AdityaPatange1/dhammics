/**
 * Post loader — merges static markdown posts + localStorage user posts.
 */

import { parseFrontMatter, excerpt } from './markdown.js';
import { dbApi } from './localdb.js';

const MANIFEST_URL = new URL('../../content/posts/manifest.json', import.meta.url);

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
  date: entry.date || new Date().toISOString().slice(0, 10),
  author: entry.author || 'Dhammics',
  tags: Array.isArray(entry.tags) ? entry.tags : [],
  cover: entry.cover || '',
  readingTime: toNumberOr(entry.readingTime, 0),
  file: entry.file || `./content/posts/${entry.slug}.md`,
  local: Boolean(entry.local),
  contentType: entry.contentType || 'markdown',
});

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

const mergeUnique = (posts) => {
  const seen = new Set();
  return posts.filter((p) => {
    if (!p?.slug || seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });
};

export const listPosts = async ({ includeLocal = true } = {}) => {
  const { posts: staticPosts } = await loadManifest();
  const localPosts = includeLocal
    ? (await dbApi.listLocalPosts()).map((p) => normalise({ ...p, local: true, contentType: 'html' }, p.bodyHtml))
    : [];

  return mergeUnique([...localPosts, ...staticPosts]).sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const getPost = async (slug) => {
  if (cache.posts.has(slug)) return cache.posts.get(slug);

  const localPosts = await dbApi.listLocalPosts();
  const local = localPosts.find((p) => p.slug === slug);
  if (local) {
    const post = {
      ...normalise({ ...local, local: true, contentType: 'html' }, local.bodyHtml),
      bodyHtml: local.bodyHtml || '',
      body: local.bodyHtml || '',
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

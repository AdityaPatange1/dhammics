/**
 * Post loader — merges API posts, static markdown manifest, and caches.
 */

import { parseFrontMatter, excerpt } from './markdown.js';
import { apiFetch } from './http.js';
import { invalidateApiCaches, refreshApiSlugSet } from './localdb.js';

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
  apiBacked: Boolean(entry.apiBacked),
  kind: entry.kind,
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

const mapApiListItem = (p) =>
  normalise(
    {
      slug: p.slug,
      title: p.title,
      description: p.description || '',
      date: p.date,
      author: p.author,
      tags: p.tags || [],
      cover: p.cover || '',
      readingTime: p.reading_time ?? 0,
      file: '',
      local: false,
      contentType: 'html',
      apiBacked: true,
      kind: p.kind,
    },
    ''
  );

async function fetchApiPublished() {
  try {
    const res = await apiFetch('/posts');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(mapApiListItem);
  } catch (e) {
    console.warn('Could not load posts from API:', e);
    return [];
  }
}

async function fetchApiMine() {
  try {
    const res = await apiFetch('/posts/mine');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(mapApiListItem);
  } catch (e) {
    console.warn('Could not load your posts from API:', e);
    return [];
  }
}

/** Clears post caches after writes or auth changes that affect listings. */
export function invalidatePostCaches() {
  cache.manifest = null;
  cache.posts.clear();
  invalidateApiCaches();
}

export const listPosts = async ({ includeLocal = true } = {}) => {
  const { posts: staticPosts } = await loadManifest();
  await refreshApiSlugSet().catch(() => {});

  const apiPublished = await fetchApiPublished();
  const apiMine = includeLocal ? await fetchApiMine() : [];

  return mergeUnique([...apiMine, ...apiPublished, ...staticPosts]).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
};

async function fetchPostFromApi(slug) {
  try {
    const res = await apiFetch(`/posts/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const p = await res.json();
    const merged = normalise(
      {
        slug: p.slug,
        title: p.title,
        description: p.description,
        date: p.date,
        author: p.author,
        tags: p.tags || [],
        cover: p.cover || '',
        readingTime: p.reading_time ?? 0,
        file: '',
        local: false,
        contentType: 'html',
        apiBacked: true,
        kind: p.kind,
      },
      p.body_html || ''
    );
    return {
      ...merged,
      bodyHtml: p.body_html || '',
      body: p.body_html || '',
    };
  } catch (e) {
    console.warn('API getPost:', e);
    return null;
  }
}

export const getPost = async (slug) => {
  if (cache.posts.has(slug)) return cache.posts.get(slug);

  const apiPost = await fetchPostFromApi(slug);
  if (apiPost) {
    cache.posts.set(slug, apiPost);
    return apiPost;
  }

  const { posts } = await loadManifest();
  const meta = posts.find((p) => p.slug === slug);
  if (!meta) return null;

  const fileUrl = new URL(`../../${meta.file.replace(/^\.\//, '')}`, import.meta.url);
  const res = await fetch(fileUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load post: ${res.status}`);
  const text = await res.text();
  const { data, body } = parseFrontMatter(text);
  const merged = {
    ...normalise({ ...meta, ...data, apiBacked: false }, body),
    body,
  };
  cache.posts.set(slug, merged);
  return merged;
};

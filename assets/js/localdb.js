/**
 * Server-backed API with legacy localStorage interaction fallback for
 * static markdown posts that do not exist on the backend.
 */

import { apiFetch, clearToken, getToken, parseApiError, setToken } from './http.js';
import {
  legacyAddComment,
  legacyGetPostInteractions,
  legacyGetPostInteractionsForUser,
  legacyListUserState,
  legacySetRating,
  legacyToggleInteraction,
} from './legacy-interactions.js';

let apiSlugSet = new Set();
let apiSlugSetReady = false;

export function invalidateApiCaches() {
  apiSlugSet = new Set();
  apiSlugSetReady = false;
}

export async function refreshApiSlugSet() {
  const set = new Set();
  const r1 = await apiFetch('/posts');
  if (r1.ok) {
    for (const p of await r1.json()) set.add(p.slug);
  }
  const r2 = await apiFetch('/posts/mine');
  if (r2.ok) {
    for (const p of await r2.json()) set.add(p.slug);
  }
  apiSlugSet = set;
  apiSlugSetReady = true;
}

async function slugOnApi(slug) {
  if (!apiSlugSetReady) await refreshApiSlugSet();
  return apiSlugSet.has(slug);
}

const mapUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  createdAt: u.created_at,
});

const mapStats = (data) => ({
  slug: data.slug,
  likes: data.likes,
  stars: data.stars,
  favorites: data.favorites,
  ratingsCount: data.ratings_count,
  ratingAvg: data.rating_avg,
  comments: (data.comments || []).map((c) => ({
    id: c.id,
    username: c.username,
    text: c.text,
    createdAt: c.created_at,
  })),
});

const mapMeState = (data) => ({
  liked: data.liked || [],
  starred: data.starred || [],
  favorited: data.favorited || [],
  ratings: data.ratings || {},
  comments: (data.comments || []).map((c) => ({
    id: c.id,
    slug: c.slug,
    text: c.text,
    createdAt: c.created_at,
  })),
});

const mergeUserState = (a, b) => {
  const commentKey = (c) => `${c.slug}:${c.id || c.text?.slice(0, 20)}`;
  const seen = new Set();
  const comments = [];
  for (const c of [...(a.comments || []), ...(b.comments || [])]) {
    const k = commentKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    comments.push(c);
  }
  comments.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
  return {
    liked: [...new Set([...(a.liked || []), ...(b.liked || [])])],
    starred: [...new Set([...(a.starred || []), ...(b.starred || [])])],
    favorited: [...new Set([...(a.favorited || []), ...(b.favorited || [])])],
    ratings: { ...b.ratings, ...a.ratings },
    comments,
  };
};

export const dbApi = {
  async registerUser({ username, password, displayName }) {
    clearToken();
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: { username, password, displayName },
    });
    if (!res.ok) return { ok: false, error: await parseApiError(res) };
    const data = await res.json();
    setToken(data.access_token, true);
    invalidateApiCaches();
    return { ok: true, user: mapUser(data.user) };
  },

  async loginUser({ username, password, remember = false }) {
    clearToken();
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (!res.ok) return { ok: false, error: await parseApiError(res) };
    const data = await res.json();
    setToken(data.access_token, Boolean(remember));
    invalidateApiCaches();
    return { ok: true, user: mapUser(data.user) };
  },

  async logoutUser() {
    clearToken();
    invalidateApiCaches();
    return { ok: true };
  },

  async getCurrentUser() {
    const token = getToken();
    if (!token) return null;
    const res = await apiFetch('/auth/me');
    if (!res.ok) {
      clearToken();
      return null;
    }
    const u = await res.json();
    return mapUser(u);
  },

  async isAuthenticated() {
    return Boolean(await this.getCurrentUser());
  },

  async listLocalPosts() {
    const res = await apiFetch('/posts/mine');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description || '',
      date: p.date,
      author: p.author,
      tags: p.tags || [],
      cover: p.cover || '',
      readingTime: p.reading_time || 0,
      bodyHtml: '',
      local: false,
      contentType: 'html',
      published: p.published,
      kind: p.kind,
    }));
  },

  async saveLocalPost(input) {
    const token = getToken();
    if (!token) return { ok: false, error: 'Please sign in first.' };

    const slug = String(input.slug || '').trim();
    const payload = {
      title: input.title,
      slug,
      kind: input.kind || 'essay',
      description: input.description || '',
      bodyHtml: input.bodyHtml || '',
      cover: input.cover || '',
      date: input.date || new Date().toISOString().slice(0, 10),
      author: input.author || '',
      tags: input.tags || [],
      readingTime: input.readingTime || 0,
      published: input.published !== false,
      contentType: 'html',
    };

    const mine = await apiFetch('/posts/mine');
    let exists = false;
    if (mine.ok) {
      exists = (await mine.json()).some((p) => p.slug === slug);
    }

    let res;
    if (exists) {
      res = await apiFetch(`/posts/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: {
          title: payload.title,
          description: payload.description,
          body_html: payload.bodyHtml,
          cover: payload.cover,
          date: payload.date,
          author: payload.author,
          tags: payload.tags,
          reading_time: payload.readingTime,
          published: payload.published,
          kind: payload.kind,
        },
      });
    } else {
      res = await apiFetch('/posts', {
        method: 'POST',
        body: payload,
      });
    }

    if (!res.ok) return { ok: false, error: await parseApiError(res) };
    invalidateApiCaches();
    await refreshApiSlugSet();
    const saved = await res.json();
    return {
      ok: true,
      post: {
        ...input,
        slug: saved.slug,
        bodyHtml: saved.body_html || payload.bodyHtml,
        local: false,
      },
    };
  },

  async deleteLocalPost(slug) {
    const res = await apiFetch(`/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) return { ok: false, error: await parseApiError(res) };
    invalidateApiCaches();
    await refreshApiSlugSet();
    return { ok: true };
  },

  async getPostInteractions(slug) {
    if (await slugOnApi(slug)) {
      const res = await apiFetch(`/posts/${encodeURIComponent(slug)}/interactions`);
      if (res.ok) return mapStats(await res.json());
    }
    return legacyGetPostInteractions(slug);
  },

  async getPostInteractionsForUser(slug, userId) {
    const user = userId ? { id: userId } : await this.getCurrentUser();
    const uid = user?.id || null;
    if (await slugOnApi(slug)) {
      const res = await apiFetch(`/posts/${encodeURIComponent(slug)}/interactions/me`);
      if (res.ok) {
        const m = await res.json();
        return {
          liked: Boolean(m.liked),
          starred: Boolean(m.starred),
          favorited: Boolean(m.favorited),
          rating: m.rating && m.rating >= 1 && m.rating <= 5 ? m.rating : 0,
        };
      }
    }
    return legacyGetPostInteractionsForUser(slug, uid);
  },

  async toggleInteraction(slug, kind) {
    const user = await this.getCurrentUser();
    if (!user) return { ok: false, error: 'Please sign in to interact.' };
    if (await slugOnApi(slug)) {
      const res = await apiFetch(`/posts/${encodeURIComponent(slug)}/interactions/toggle`, {
        method: 'POST',
        body: { kind },
      });
      if (!res.ok) return { ok: false, error: await parseApiError(res) };
      const data = await res.json();
      return { ok: true, active: data.active };
    }
    return legacyToggleInteraction(slug, kind, user.id);
  },

  async setRating(slug, rating) {
    const user = await this.getCurrentUser();
    if (!user) return { ok: false, error: 'Please sign in to rate posts.' };
    if (await slugOnApi(slug)) {
      const res = await apiFetch(`/posts/${encodeURIComponent(slug)}/interactions/rating`, {
        method: 'PUT',
        body: { value: rating },
      });
      if (!res.ok) return { ok: false, error: await parseApiError(res) };
      const data = await res.json();
      return { ok: true, value: data.value };
    }
    return legacySetRating(slug, rating, user.id);
  },

  async addComment(slug, text) {
    const user = await this.getCurrentUser();
    if (!user) return { ok: false, error: 'Please sign in to comment.' };
    if (await slugOnApi(slug)) {
      const res = await apiFetch(`/posts/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        body: { text },
      });
      if (!res.ok) return { ok: false, error: await parseApiError(res) };
      return { ok: true };
    }
    const label = user.displayName || user.username || 'User';
    return legacyAddComment(slug, text, user.id, label);
  },

  async listUserState() {
    const user = await this.getCurrentUser();
    const legacy = legacyListUserState(user?.id || null);
    if (!user) return legacy;
    const res = await apiFetch('/me/state');
    if (!res.ok) return legacy;
    const apiState = mapMeState(await res.json());
    return mergeUserState(apiState, legacy);
  },
};

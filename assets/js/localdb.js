/**
 * localdb.js
 *
 * A tiny localStorage-backed API layer. All reads/writes are wrapped in
 * async functions so the rest of the app can later swap this module with
 * a real HTTP API without changing feature code.
 */

const DB_KEY = 'dhammics:db:v1';
const SESSION_KEY = 'dhammics:session:v1';

const defaultDB = () => ({
  users: [],
  localPosts: [],
  interactions: {},
});

const load = () => {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      localPosts: Array.isArray(parsed.localPosts) ? parsed.localPosts : [],
      interactions: parsed.interactions && typeof parsed.interactions === 'object' ? parsed.interactions : {},
    };
  } catch {
    return defaultDB();
  }
};

const save = (db) => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
};

const makeId = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 11)}`;

const nowIso = () => new Date().toISOString();

const getSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session.userId || !session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
};

const setSession = (session, remember = false) => {
  const target = remember ? localStorage : sessionStorage;
  target.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
};

const ensurePostBucket = (db, slug) => {
  if (!db.interactions[slug]) {
    db.interactions[slug] = {
      likes: [],
      stars: [],
      favorites: [],
      ratings: {},
      comments: [],
    };
  }
  return db.interactions[slug];
};

export const dbApi = {
  async registerUser({ username, password, displayName }) {
    const db = load();
    const name = String(username || '').trim().toLowerCase();
    const pass = String(password || '');
    const shown = String(displayName || username || '').trim();
    if (!name || !pass) return { ok: false, error: 'Username and password are required.' };
    if (db.users.some((u) => u.username === name)) {
      return { ok: false, error: 'That username already exists.' };
    }
    const user = {
      id: makeId('user'),
      username: name,
      displayName: shown || name,
      password: pass,
      createdAt: nowIso(),
    };
    db.users.push(user);
    save(db);
    return { ok: true, user: { ...user, password: undefined } };
  },

  async loginUser({ username, password, remember = false }) {
    const db = load();
    const name = String(username || '').trim().toLowerCase();
    const pass = String(password || '');
    const user = db.users.find((u) => u.username === name && u.password === pass);
    if (!user) return { ok: false, error: 'Incorrect username or password.' };
    const session = {
      userId: user.id,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    };
    setSession(session, remember);
    return { ok: true, user: { ...user, password: undefined } };
  },

  async logoutUser() {
    clearSession();
    return { ok: true };
  },

  async getCurrentUser() {
    const session = getSession();
    if (!session) return null;
    const db = load();
    const user = db.users.find((u) => u.id === session.userId);
    if (!user) return null;
    return { ...user, password: undefined };
  },

  async isAuthenticated() {
    return Boolean(await this.getCurrentUser());
  },

  async listLocalPosts() {
    const db = load();
    return [...db.localPosts].sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  async saveLocalPost(input) {
    const db = load();
    const session = getSession();
    if (!session) return { ok: false, error: 'Please sign in first.' };

    const existing = db.localPosts.findIndex((p) => p.slug === input.slug);
    const post = {
      ...input,
      local: true,
      contentType: 'html',
      authorId: session.userId,
      updatedAt: nowIso(),
      createdAt: existing >= 0 ? db.localPosts[existing].createdAt : nowIso(),
    };
    if (existing >= 0) db.localPosts[existing] = post;
    else db.localPosts.push(post);
    save(db);
    return { ok: true, post };
  },

  async deleteLocalPost(slug) {
    const db = load();
    db.localPosts = db.localPosts.filter((p) => p.slug !== slug);
    save(db);
    return { ok: true };
  },

  async getPostInteractions(slug) {
    const db = load();
    const bucket = ensurePostBucket(db, slug);
    return {
      slug,
      likes: bucket.likes.length,
      stars: bucket.stars.length,
      favorites: bucket.favorites.length,
      ratingsCount: Object.keys(bucket.ratings).length,
      ratingAvg:
        Object.values(bucket.ratings).reduce((sum, n) => sum + Number(n || 0), 0) /
          Math.max(1, Object.keys(bucket.ratings).length) || 0,
      comments: [...bucket.comments].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    };
  },

  async getPostInteractionsForUser(slug, userId) {
    const db = load();
    const bucket = ensurePostBucket(db, slug);
    const uid = userId || (getSession()?.userId ?? null);
    return {
      liked: uid ? bucket.likes.includes(uid) : false,
      starred: uid ? bucket.stars.includes(uid) : false,
      favorited: uid ? bucket.favorites.includes(uid) : false,
      rating: uid && bucket.ratings[uid] ? Number(bucket.ratings[uid]) : 0,
    };
  },

  async toggleInteraction(slug, kind) {
    const session = getSession();
    if (!session) return { ok: false, error: 'Please sign in to interact.' };
    if (!['likes', 'stars', 'favorites'].includes(kind)) {
      return { ok: false, error: 'Unknown interaction type.' };
    }
    const db = load();
    const bucket = ensurePostBucket(db, slug);
    const list = bucket[kind];
    const idx = list.indexOf(session.userId);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(session.userId);
    save(db);
    return { ok: true, active: idx < 0 };
  },

  async setRating(slug, rating) {
    const session = getSession();
    if (!session) return { ok: false, error: 'Please sign in to rate posts.' };
    const value = Math.max(1, Math.min(5, Number(rating || 0)));
    const db = load();
    const bucket = ensurePostBucket(db, slug);
    bucket.ratings[session.userId] = value;
    save(db);
    return { ok: true, value };
  },

  async addComment(slug, text) {
    const session = getSession();
    if (!session) return { ok: false, error: 'Please sign in to comment.' };
    const body = String(text || '').trim();
    if (!body) return { ok: false, error: 'Comment cannot be empty.' };
    const db = load();
    const bucket = ensurePostBucket(db, slug);
    const user = db.users.find((u) => u.id === session.userId);
    bucket.comments.push({
      id: makeId('comment'),
      userId: session.userId,
      username: user?.displayName || user?.username || 'User',
      text: body,
      createdAt: nowIso(),
    });
    save(db);
    return { ok: true };
  },

  async listUserState() {
    const user = await this.getCurrentUser();
    const db = load();
    if (!user) return { liked: [], starred: [], favorited: [], ratings: {}, comments: [] };
    const liked = [];
    const starred = [];
    const favorited = [];
    const ratings = {};
    const comments = [];
    Object.entries(db.interactions).forEach(([slug, bucket]) => {
      if (bucket.likes.includes(user.id)) liked.push(slug);
      if (bucket.stars.includes(user.id)) starred.push(slug);
      if (bucket.favorites.includes(user.id)) favorited.push(slug);
      if (bucket.ratings[user.id]) ratings[slug] = Number(bucket.ratings[user.id]);
      bucket.comments
        .filter((c) => c.userId === user.id)
        .forEach((c) => comments.push({ ...c, slug }));
    });
    return { liked, starred, favorited, ratings, comments };
  },
};


/**
 * Local-only interaction storage for manifest/static posts that are not stored
 * on the API. Uses the previous localStorage layout for backward compatibility.
 */

const DB_KEY = 'dhammics:db:v1';

const loadDb = () => {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { users: [], localPosts: [], interactions: {} };
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      localPosts: Array.isArray(parsed.localPosts) ? parsed.localPosts : [],
      interactions:
        parsed.interactions && typeof parsed.interactions === 'object' ? parsed.interactions : {},
    };
  } catch {
    return { users: [], localPosts: [], interactions: {} };
  }
};

const saveDb = (db) => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};

const ensureBucket = (db, slug) => {
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

const makeId = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 11)}`;

export function legacyGetPostInteractions(slug) {
  const db = loadDb();
  const bucket = ensureBucket(db, slug);
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
}

export function legacyGetPostInteractionsForUser(slug, userId) {
  const db = loadDb();
  const bucket = ensureBucket(db, slug);
  const uid = userId || null;
  return {
    liked: uid ? bucket.likes.includes(uid) : false,
    starred: uid ? bucket.stars.includes(uid) : false,
    favorited: uid ? bucket.favorites.includes(uid) : false,
    rating: uid && bucket.ratings[uid] ? Number(bucket.ratings[uid]) : 0,
  };
}

export function legacyToggleInteraction(slug, kind, userId) {
  if (!userId) return { ok: false, error: 'Please sign in to interact.' };
  if (!['likes', 'stars', 'favorites'].includes(kind)) {
    return { ok: false, error: 'Unknown interaction type.' };
  }
  const db = loadDb();
  const bucket = ensureBucket(db, slug);
  const list = bucket[kind];
  const idx = list.indexOf(userId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(userId);
  saveDb(db);
  return { ok: true, active: idx < 0 };
}

export function legacySetRating(slug, rating, userId) {
  if (!userId) return { ok: false, error: 'Please sign in to rate posts.' };
  const value = Math.max(1, Math.min(5, Number(rating || 0)));
  const db = loadDb();
  const bucket = ensureBucket(db, slug);
  bucket.ratings[userId] = value;
  saveDb(db);
  return { ok: true, value };
}

export function legacyAddComment(slug, text, userId, usernameLabel) {
  if (!userId) return { ok: false, error: 'Please sign in to comment.' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'Comment cannot be empty.' };
  const db = loadDb();
  const bucket = ensureBucket(db, slug);
  bucket.comments.push({
    id: makeId('comment'),
    userId,
    username: usernameLabel || 'User',
    text: body,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  return { ok: true };
}

export function legacyListUserState(userId) {
  const db = loadDb();
  if (!userId) return { liked: [], starred: [], favorited: [], ratings: {}, comments: [] };
  const liked = [];
  const starred = [];
  const favorited = [];
  const ratings = {};
  const comments = [];
  Object.entries(db.interactions).forEach(([slug, bucket]) => {
    if (bucket.likes.includes(userId)) liked.push(slug);
    if (bucket.stars.includes(userId)) starred.push(slug);
    if (bucket.favorites.includes(userId)) favorited.push(slug);
    if (bucket.ratings[userId]) ratings[slug] = Number(bucket.ratings[userId]);
    bucket.comments
      .filter((c) => c.userId === userId)
      .forEach((c) => comments.push({ ...c, slug }));
  });
  return { liked, starred, favorited, ratings, comments };
}

/**
 * Minimal client-side auth for the demo admin panel.
 *
 * IMPORTANT: this is a static site deployable to GitHub Pages, so real
 * server-side authentication is out of scope. Credentials are stored in
 * localStorage only to gate the admin UI — never for real security.
 * Default credentials: admin / dhamma123 (change via localStorage).
 */

const SESSION_KEY = 'dhammics:session';
const CREDS_KEY = 'dhammics:creds';
const DEFAULT_USER = 'admin';
const DEFAULT_PASS = 'dhamma123';

const readCreds = () => {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return { username: DEFAULT_USER, password: DEFAULT_PASS };
    return JSON.parse(raw);
  } catch {
    return { username: DEFAULT_USER, password: DEFAULT_PASS };
  }
};

export const isAuthenticated = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Boolean(data && data.user && data.exp > Date.now());
  } catch {
    return false;
  }
};

export const login = (username, password, { remember = false } = {}) => {
  const creds = readCreds();
  if (username !== creds.username || password !== creds.password) {
    return { ok: false, error: 'Incorrect username or password.' };
  }
  const session = {
    user: username,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const store = remember ? localStorage : sessionStorage;
  store.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true };
};

export const logout = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
};

export const requireAuth = (redirect = './login.html') => {
  if (!isAuthenticated()) {
    location.replace(redirect);
    return false;
  }
  return true;
};

export const currentUser = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw).user;
  } catch {
    return null;
  }
};

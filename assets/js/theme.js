/**
 * Theme controller — persists user preference in localStorage, respects
 * prefers-color-scheme otherwise, and swaps the toggle icon without flicker.
 */

const STORAGE_KEY = 'dhammics:theme';
const root = document.documentElement;

const getStoredTheme = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const persist = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
};

export const getActiveTheme = () => {
  const explicit = root.dataset.theme;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const setTheme = (value) => {
  root.dataset.theme = value;
  persist(value);
  updateToggleIcon();
  window.dispatchEvent(new CustomEvent('themechange', { detail: value }));
};

export const toggleTheme = () => {
  setTheme(getActiveTheme() === 'dark' ? 'light' : 'dark');
};

const updateToggleIcon = () => {
  const isDark = getActiveTheme() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    const icon = btn.querySelector('[data-lucide]');
    if (!icon) return;
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  });
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

export const initTheme = () => {
  const stored = getStoredTheme();
  if (stored === 'dark' || stored === 'light') {
    root.dataset.theme = stored;
  }
  updateToggleIcon();

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', () => {
    if (!getStoredTheme()) updateToggleIcon();
  });
};

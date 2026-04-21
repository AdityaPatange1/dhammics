/**
 * Shared page bootstrap — theme, nav, scroll behavior, icons.
 */

import { initTheme } from './theme.js';
import { $, $$, observeReveals } from './utils.js';
import { currentUserObject, isAuthenticated, logout } from './auth.js';

const renderIcons = () => {
  if (window.lucide?.createIcons) window.lucide.createIcons();
};

const initNavToggle = () => {
  const toggle = $('[data-nav-toggle]');
  const links = $('[data-nav-links]');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (e) => {
    if (!links.contains(e.target) && !toggle.contains(e.target)) {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
};

const initScrollHeader = () => {
  const header = $('.site-header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
};

const initAuthAwareNav = async () => {
  const authed = await isAuthenticated();
  const user = authed ? await currentUserObject() : null;
  $$('[data-auth-only]').forEach((el) => {
    el.hidden = !authed;
  });
  $$('[data-guest-only]').forEach((el) => {
    el.hidden = authed;
  });
  $$('[data-current-user]').forEach((el) => {
    el.textContent = user?.displayName || user?.username || 'User';
  });
  $$('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await logout();
      location.assign('./index.html');
    });
  });
};

const markActiveNav = () => {
  const current = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-links a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    if (href === current || (current === '' && href === 'index.html')) {
      link.setAttribute('aria-current', 'page');
    }
  });
};

const init = async () => {
  initTheme();
  renderIcons();
  initNavToggle();
  initScrollHeader();
  await initAuthAwareNav();
  markActiveNav();
  observeReveals();

  window.addEventListener('themechange', renderIcons);
  document.addEventListener('dhammics:rendered', () => {
    renderIcons();
    observeReveals();
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
} else {
  init();
}

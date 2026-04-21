import { renderTemplate } from './template-engine.js';

const boot = async () => {
  const page = document.body.dataset.page;
  const mount = document.querySelector('[data-app-root]');
  if (!page || !mount) return;

  await renderTemplate({ page, mount });

  // Shared bootstrap after template assembly.
  await import('./main.js');

  const pageScripts = {
    home: ['./home.js'],
    feed: ['./feed.js'],
    post: ['./post.js'],
    user: ['./user.js'],
    notfound: [],
  };

  const scripts = pageScripts[page] || [];
  for (const script of scripts) {
    await import(script);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot();
  });
} else {
  boot();
}


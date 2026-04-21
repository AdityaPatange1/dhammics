import { listPosts } from './posts.js';
import { currentUserObject } from './auth.js';
import { dbApi } from './localdb.js';
import { $, escapeHTML, formatDate } from './utils.js';

const card = (post) => `
  <article class="card post-card">
    <a class="post-thumb" href="./post.html?slug=${encodeURIComponent(post.slug)}">
      <img src="${escapeHTML(post.cover || 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?auto=format&fit=crop&w=1600&q=80')}" alt="" loading="lazy" decoding="async" />
    </a>
    <div class="post-body">
      <div class="post-meta">
        ${post.tags?.[0] ? `<span class="chip">${escapeHTML(post.tags[0])}</span>` : ''}
        <span>${formatDate(post.date)}</span>
      </div>
      <h3><a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></h3>
      <p>${escapeHTML(post.description || '')}</p>
      <a class="read-more" href="./post.html?slug=${encodeURIComponent(post.slug)}">Read now <i data-lucide="arrow-right"></i></a>
    </div>
  </article>
`;

const rerankByFavorites = async (posts) => {
  const user = await currentUserObject();
  if (!user) return posts;
  const state = await dbApi.listUserState();
  const fav = new Set(state.favorited);
  return [...posts].sort((a, b) => {
    const scoreA = (fav.has(a.slug) ? 1000000000 : 0) + new Date(a.date).getTime();
    const scoreB = (fav.has(b.slug) ? 1000000000 : 0) + new Date(b.date).getTime();
    return scoreB - scoreA;
  });
};

const render = async () => {
  const grid = $('[data-feed-grid]');
  const modeSelect = $('[data-feed-mode]');
  if (!grid || !modeSelect) return;
  const all = await listPosts({ includeLocal: true });
  const mode = modeSelect.value;
  const ordered = mode === 'reranked' ? await rerankByFavorites(all) : all;
  grid.innerHTML = ordered.length ? ordered.map(card).join('') : '<div class="empty">No posts yet.</div>';
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

const init = () => {
  $('[data-feed-mode]')?.addEventListener('change', render);
  render();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


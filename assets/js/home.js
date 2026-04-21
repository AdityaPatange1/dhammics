/**
 * Homepage — renders the featured post hero and the post grid with filtering.
 */

import { listPosts } from './posts.js';
import { $, $$, formatDate, escapeHTML, observeReveals } from './utils.js';

const postCard = (post, i) => `
  <article class="card post-card reveal" style="transition-delay:${Math.min(i * 60, 360)}ms">
    <a class="post-thumb" href="./post.html?slug=${encodeURIComponent(post.slug)}" aria-label="${escapeHTML(post.title)}">
      <img src="${escapeHTML(post.cover)}" alt="" loading="lazy" decoding="async" />
    </a>
    <div class="post-body">
      <div class="post-meta">
        ${post.tags[0] ? `<span class="chip">${escapeHTML(post.tags[0])}</span>` : ''}
        ${post.local ? '<span class="chip outline">Local</span>' : ''}
        <span>${formatDate(post.date)}</span>
        <span aria-hidden="true">•</span>
        <span>${post.readingTime || 5} min read</span>
      </div>
      <h3><a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></h3>
      <p>${escapeHTML(post.description)}</p>
      <a class="read-more" href="./post.html?slug=${encodeURIComponent(post.slug)}">
        Continue reading <i data-lucide="arrow-right"></i>
      </a>
    </div>
  </article>
`;

const renderTags = (posts) => {
  const bar = $('[data-tag-bar]');
  if (!bar) return;
  const counts = new Map();
  posts.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const entries = [['All', posts.length], ...counts.entries()].slice(0, 10);
  bar.innerHTML = entries
    .map(
      ([tag, count], i) =>
        `<button class="chip${i === 0 ? '' : ' outline'}" data-tag="${escapeHTML(tag)}" type="button">
          ${escapeHTML(tag)} <span class="muted">${count}</span>
        </button>`
    )
    .join('');

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    $$('[data-tag]', bar).forEach((b) => {
      b.classList.toggle('outline', b !== btn);
    });
    filterByTag(btn.dataset.tag);
  });
};

let allPosts = [];
const filterByTag = (tag) => {
  const grid = $('[data-post-grid]');
  if (!grid) return;
  const filtered = tag === 'All' ? allPosts : allPosts.filter((p) => p.tags.includes(tag));
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty">No posts in this category yet.</div>';
    return;
  }
  grid.innerHTML = filtered.map((p, i) => postCard(p, i)).join('');
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
  observeReveals(grid);
};

const renderHero = (post) => {
  const hero = $('[data-hero-post]');
  if (!hero || !post) return;
  hero.innerHTML = `
    <span class="chip">${escapeHTML(post.tags[0] || 'Featured')}</span>
    <h2 class="section-title" style="margin-top: var(--space-3)">
      <a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a>
    </h2>
    <p class="section-desc" style="max-width:56ch">${escapeHTML(post.description)}</p>
    <div class="post-meta" style="margin-top:var(--space-4); color:var(--text-soft); font-size: var(--fs-sm);">
      <span>${formatDate(post.date)}</span>
      <span aria-hidden="true">•</span>
      <span>${post.readingTime || 5} min read</span>
    </div>
    <a class="btn btn-secondary" style="margin-top: var(--space-5)" href="./post.html?slug=${encodeURIComponent(post.slug)}">
      Read the essay <i data-lucide="arrow-right"></i>
    </a>
  `;
};

const init = async () => {
  const grid = $('[data-post-grid]');
  if (!grid) return;

  allPosts = await listPosts({ includeLocal: true });

  if (allPosts.length === 0) {
    grid.innerHTML = '<div class="empty">No posts yet. Check back soon.</div>';
    return;
  }

  renderHero(allPosts[0]);
  renderTags(allPosts);

  grid.innerHTML = allPosts.map((p, i) => postCard(p, i)).join('');
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

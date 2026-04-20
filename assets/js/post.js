/**
 * Post page — reads ?slug=… and renders the markdown content.
 */

import { getPost, listPosts } from './posts.js';
import { renderMarkdown } from './markdown.js';
import { $, formatDate, escapeHTML, readingTime } from './utils.js';

const params = new URLSearchParams(location.search);
const slug = params.get('slug');

const renderNotFound = (reason = '') => {
  const shell = $('[data-post-shell]');
  if (!shell) return;
  shell.innerHTML = `
    <div class="container container-narrow" style="padding-block: var(--space-9); text-align:center">
      <span class="chip outline">404</span>
      <h1 style="margin-top: var(--space-3)">Post not found</h1>
      <p class="muted" style="margin: var(--space-3) auto; max-width: 52ch">
        ${escapeHTML(reason || "We couldn't find the essay you were looking for. It may have been removed or renamed.")}
      </p>
      <a class="btn btn-primary" href="./index.html">
        <i data-lucide="arrow-left"></i> Back to home
      </a>
    </div>
  `;
  document.title = 'Post not found · Dhammics';
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

const renderPost = async (post) => {
  const shell = $('[data-post-shell]');
  if (!shell) return;
  const html = renderMarkdown(post.body || '');
  const minutes = post.readingTime || readingTime(post.body || '');

  document.title = `${post.title} · Dhammics`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', post.description);

  shell.innerHTML = `
    <section class="post-hero">
      <div class="container container-narrow">
        <a href="./index.html" class="btn btn-ghost" style="margin-bottom: var(--space-5)">
          <i data-lucide="arrow-left"></i> All essays
        </a>
        ${post.draft ? '<span class="chip" style="background: color-mix(in srgb, var(--warning) 20%, transparent); color: var(--warning)">Draft (local)</span>' : ''}
        ${post.tags[0] ? `<span class="chip">${escapeHTML(post.tags[0])}</span>` : ''}
        <h1>${escapeHTML(post.title)}</h1>
        <div class="post-meta">
          <span><i data-lucide="user"></i> ${escapeHTML(post.author)}</span>
          <span><i data-lucide="calendar"></i> ${formatDate(post.date)}</span>
          <span><i data-lucide="clock"></i> ${minutes} min read</span>
        </div>
        ${
          post.cover
            ? `<div class="post-cover"><img src="${escapeHTML(post.cover)}" alt="" loading="eager" decoding="async" /></div>`
            : ''
        }
      </div>
    </section>
    <article class="post-article">
      <div class="container container-narrow">
        <div class="post-content">${html}</div>
        <div class="post-nav" data-post-nav></div>
      </div>
    </article>
  `;

  await renderPostNav(post);
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

const renderPostNav = async (current) => {
  const nav = $('[data-post-nav]');
  if (!nav) return;
  const all = await listPosts({ includeDrafts: false });
  const idx = all.findIndex((p) => p.slug === current.slug);
  const prev = idx >= 0 ? all[idx + 1] : null;
  const next = idx > 0 ? all[idx - 1] : null;

  nav.innerHTML = `
    ${
      prev
        ? `<a class="btn btn-ghost" href="./post.html?slug=${encodeURIComponent(prev.slug)}">
             <i data-lucide="arrow-left"></i>
             <span style="text-align:left"><span class="muted" style="display:block;font-size:var(--fs-xs)">Previous</span>${escapeHTML(prev.title)}</span>
           </a>`
        : '<span></span>'
    }
    ${
      next
        ? `<a class="btn btn-ghost" href="./post.html?slug=${encodeURIComponent(next.slug)}">
             <span style="text-align:right"><span class="muted" style="display:block;font-size:var(--fs-xs)">Next</span>${escapeHTML(next.title)}</span>
             <i data-lucide="arrow-right"></i>
           </a>`
        : '<span></span>'
    }
  `;
};

const init = async () => {
  if (!slug) {
    renderNotFound('No post was specified.');
    return;
  }
  try {
    const post = await getPost(slug);
    if (!post) {
      renderNotFound();
      return;
    }
    await renderPost(post);
  } catch (err) {
    console.error(err);
    renderNotFound('Something went wrong loading this post.');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

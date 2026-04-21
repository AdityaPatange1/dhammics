/**
 * Post page — renders article + localStorage interactions.
 */

import { getPost, listPosts } from './posts.js';
import { renderMarkdown } from './markdown.js';
import { isAuthenticated } from './auth.js';
import { dbApi } from './localdb.js';
import { $, formatDate, formatDateTime, escapeHTML, readingTime, sanitizeHTML, toast } from './utils.js';

const params = new URLSearchParams(location.search);
const slug = params.get('slug');

const renderBody = (post) => {
  if (post.contentType === 'html') return sanitizeHTML(post.bodyHtml || post.body || '');
  return renderMarkdown(post.body || '');
};

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
  const html = renderBody(post);
  const minutes = post.readingTime || readingTime(post.body || '');

  document.title = `${post.title} · Dhammics`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', post.description);

  shell.innerHTML = `
    <section class="post-hero">
      <div class="container container-narrow">
        <a href="./index.html" class="btn btn-ghost" style="margin-bottom: var(--space-5)">
          <i data-lucide="arrow-left"></i> All essays
        </a>
        ${post.local ? '<span class="chip" style="background: color-mix(in srgb, var(--warning) 20%, transparent); color: var(--warning)">Local user post</span>' : ''}
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
        <section class="engagement-panel" data-engagement-panel>
          <div class="engagement-actions" data-engagement-actions></div>
          <div class="engagement-rate" data-engagement-rate></div>
          <div class="engagement-comments" data-engagement-comments></div>
        </section>
        <div class="post-nav" data-post-nav></div>
      </div>
    </article>
  `;

  await renderEngagement(post);
  await renderPostNav(post);
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

const renderPostNav = async (current) => {
  const nav = $('[data-post-nav]');
  if (!nav) return;
  const all = await listPosts({ includeLocal: true });
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

const renderEngagement = async (post) => {
  const root = $('[data-engagement-panel]');
  if (!root) return;
  const authed = await isAuthenticated();
  const stats = await dbApi.getPostInteractions(post.slug);
  const mine = await dbApi.getPostInteractionsForUser(post.slug);

  const actions = $('[data-engagement-actions]', root);
  const rating = $('[data-engagement-rate]', root);
  const comments = $('[data-engagement-comments]', root);

  actions.innerHTML = `
    <div class="engagement-buttons">
      <button class="btn btn-ghost ${mine.liked ? 'is-active' : ''}" type="button" data-action="likes">
        <i data-lucide="thumbs-up"></i> Like (${stats.likes})
      </button>
      <button class="btn btn-ghost ${mine.starred ? 'is-active' : ''}" type="button" data-action="stars" title="Star saves this post for revival and re-reading later.">
        <i data-lucide="star"></i> Star (${stats.stars})
      </button>
      <button class="btn btn-ghost ${mine.favorited ? 'is-active' : ''}" type="button" data-action="favorites" title="Favorite boosts this post in your feed ranking.">
        <i data-lucide="heart"></i> Favorite (${stats.favorites})
      </button>
    </div>
    ${
      authed
        ? ''
        : '<p class="form-help">Sign in from the <a href="./user.html">user panel</a> to interact.</p>'
    }
  `;

  rating.innerHTML = `
    <label class="form-help">Your rating</label>
    <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
      <div class="rating-stars ${authed ? '' : 'is-disabled'}" role="group" aria-label="Rate this post">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `
          <button
            class="rating-star ${mine.rating >= n ? 'is-filled' : ''}"
            data-rating-value="${n}"
            type="button"
            ${authed ? '' : 'disabled'}
            aria-label="Rate ${n} out of 5"
            title="Rate ${n}/5"
          >
            <i data-lucide="star"></i>
          </button>
        `
          )
          .join('')}
      </div>
      <span class="muted rating-caption">${mine.rating ? `Your rating: ${mine.rating}/5` : 'Not rated yet'}</span>
      <span class="muted">Average: ${stats.ratingAvg ? stats.ratingAvg.toFixed(1) : '0.0'} (${stats.ratingsCount} ratings)</span>
    </div>
  `;

  comments.innerHTML = `
    <h3 style="font-size:var(--fs-lg);margin-bottom:var(--space-3)">Comments (${stats.comments.length})</h3>
    <form data-comment-form class="field" ${authed ? '' : 'hidden'}>
      <textarea class="textarea" name="comment" rows="3" placeholder="Share your reflection..."></textarea>
      <button class="btn btn-secondary" type="submit"><i data-lucide="message-circle"></i> Post comment</button>
    </form>
    ${
      authed
        ? ''
        : '<p class="form-help" style="margin-bottom:var(--space-3)">Sign in to leave comments.</p>'
    }
    <div class="comments-list">
      ${
        stats.comments.length === 0
          ? '<p class="muted">No comments yet. Be the first to respond.</p>'
          : stats.comments
              .map(
                (comment) => `
          <article class="comment-item">
            <header>
              <strong>${escapeHTML(comment.username)}</strong>
              <span class="muted">${formatDateTime(comment.createdAt)}</span>
            </header>
            <p>${escapeHTML(comment.text)}</p>
          </article>
        `
              )
              .join('')
      }
    </div>
  `;

  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await dbApi.toggleInteraction(post.slug, btn.dataset.action);
      if (!res.ok) return toast(res.error, { type: 'error' });
      await renderEngagement(post);
      document.dispatchEvent(new CustomEvent('dhammics:rendered'));
    });
  });

  root.querySelectorAll('[data-rating-value]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = Number(button.dataset.ratingValue);
      if (!value) return;
      const res = await dbApi.setRating(post.slug, value);
      if (!res.ok) return toast(res.error, { type: 'error' });
      await renderEngagement(post);
      document.dispatchEvent(new CustomEvent('dhammics:rendered'));
    });
  });

  $('[data-comment-form]', root)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('comment') || '');
    const res = await dbApi.addComment(post.slug, text);
    if (!res.ok) return toast(res.error, { type: 'error' });
    form.reset();
    await renderEngagement(post);
    document.dispatchEvent(new CustomEvent('dhammics:rendered'));
  });
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

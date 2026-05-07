import { login, logout, register, currentUserObject } from './auth.js';
import { listPosts } from './posts.js';
import { dbApi } from './localdb.js';
import { createNotionEditor } from './notion-editor.js';
import { $, escapeHTML, formatDate, formatDateTime, readingTime, sanitizeHTML, toast } from './utils.js';

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

/** Data URLs for cover can be large; keep localStorage posts under typical quota. */
const MAX_COVER_FILE_BYTES = 1.5 * 1024 * 1024;

const setCoverPreview = (root, src) => {
  const el = root.querySelector('[data-cover-preview]');
  if (!el) return;
  if (!src) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.replaceChildren();
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = src;
  el.appendChild(img);
};

const bindCoverImageField = (root) => {
  const urlInput = root.querySelector('#composer-cover');
  const fileInput = root.querySelector('#composer-cover-file');
  const trigger = root.querySelector('[data-cover-upload-trigger]');
  const clearBtn = root.querySelector('[data-cover-clear]');

  trigger?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file (JPEG, PNG, GIF, WebP, or SVG).', { type: 'error' });
      fileInput.value = '';
      return;
    }
    if (file.size > MAX_COVER_FILE_BYTES) {
      toast(
        `That image is too large to embed (${Math.round(file.size / 1024)} KB). Max about ${Math.round(MAX_COVER_FILE_BYTES / 1024)} KB for local posts—use a URL or a smaller file.`,
        { type: 'error' }
      );
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (urlInput) urlInput.value = dataUrl;
      setCoverPreview(root, dataUrl);
      if (window.lucide?.createIcons) window.lucide.createIcons();
    };
    reader.onerror = () => {
      toast('Could not read that file.', { type: 'error' });
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  urlInput?.addEventListener('input', () => {
    setCoverPreview(root, urlInput.value.trim());
  });

  clearBtn?.addEventListener('click', () => {
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    setCoverPreview(root, '');
  });
};

let composerBound = false;
let writeShellBound = false;
let activeScreen = 'feed';
let notionEditor = null;

const showScreen = (name) => {
  activeScreen = name;
  document.querySelectorAll('[data-screen-btn]').forEach((btn) => {
    const current = btn.dataset.screenBtn === name;
    btn.classList.toggle('is-active', current);
    btn.setAttribute('aria-selected', String(current));
  });
  document.querySelectorAll('[data-screen-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.screenPanel !== name;
  });
};

const bindScreenNav = () => {
  document.querySelectorAll('[data-screen-btn]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screenBtn));
  });
};

const setAuthState = async () => {
  const user = await currentUserObject();
  $('[data-auth-shell]')?.toggleAttribute('hidden', Boolean(user));
  $('[data-user-shell]')?.toggleAttribute('hidden', !user);
  if (user) $('[data-user-name]').textContent = user.displayName || user.username;
};

const bindAuthForms = () => {
  $('#signin-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const res = await login(String(data.get('username') || ''), String(data.get('password') || ''), {
      remember: Boolean(data.get('remember')),
    });
    if (!res.ok) return toast(res.error, { type: 'error' });
    toast('Signed in successfully.', { type: 'success' });
    await setAuthState();
    await renderUserPanel();
  });

  $('#signup-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username') || '');
    const password = String(data.get('password') || '');
    const displayName = String(data.get('displayName') || '');
    const created = await register(username, password, displayName);
    if (!created.ok) return toast(created.error, { type: 'error' });
    const loggedIn = await login(username, password, { remember: true });
    if (!loggedIn.ok) return toast(loggedIn.error, { type: 'error' });
    toast('Account created.', { type: 'success' });
    await setAuthState();
    await renderUserPanel();
  });

  $('[data-panel-logout]')?.addEventListener('click', async () => {
    await logout();
    activeScreen = 'feed';
    await setAuthState();
    await renderUserPanel();
  });
};

const feedRow = (post, state, interactions) => `
  <li class="post-manage-item premium-post-row">
    <div class="premium-post-top">
      <div>
        <strong><a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></strong>
        <p class="muted">${escapeHTML(post.description || '')}</p>
      </div>
      <div class="premium-post-meta">
        <span class="chip outline"><i data-lucide="calendar"></i> ${formatDate(post.date)}</span>
        <span class="chip outline"><i data-lucide="bar-chart-3"></i> ${interactions.ratingAvg.toFixed(1)} avg</span>
      </div>
    </div>
    <div class="post-manage-actions">
      <button class="btn btn-ghost ${state.liked.includes(post.slug) ? 'is-active' : ''}" data-toggle="likes" data-slug="${escapeHTML(post.slug)}" type="button">
        <i data-lucide="thumbs-up"></i> Like (${interactions.likes})
      </button>
      <button class="btn btn-ghost ${state.starred.includes(post.slug) ? 'is-active' : ''}" title="Star saves this article for revival and re-reading later." data-toggle="stars" data-slug="${escapeHTML(post.slug)}" type="button">
        <i data-lucide="star"></i> Star (${interactions.stars})
      </button>
      <button class="btn btn-ghost ${state.favorited.includes(post.slug) ? 'is-active' : ''}" title="Favorite reranks this article higher in your feed." data-toggle="favorites" data-slug="${escapeHTML(post.slug)}" type="button">
        <i data-lucide="heart"></i> Favorite (${interactions.favorites})
      </button>
      <div class="rating-stars" role="group" aria-label="Rate ${escapeHTML(post.title)}">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `
          <button
            class="rating-star ${state.ratings[post.slug] >= n ? 'is-filled' : ''}"
            type="button"
            data-rate-value="${n}"
            data-rate="${escapeHTML(post.slug)}"
            aria-label="Rate ${n} out of 5"
            title="Rate ${n}/5"
          >
            <i data-lucide="star"></i>
          </button>
        `
          )
          .join('')}
      </div>
      <span class="muted rating-caption">${state.ratings[post.slug] ? `You rated ${state.ratings[post.slug]}/5` : 'Not rated yet'}</span>
    </div>
    <div class="premium-post-comment">
      <input class="input comment-mini" data-comment-input="${escapeHTML(post.slug)}" placeholder="Add thoughtful annotation or note..." />
      <button class="btn btn-secondary" data-comment-submit="${escapeHTML(post.slug)}" type="button">
        <i data-lucide="message-circle-plus"></i> Post
      </button>
    </div>
  </li>
`;

const bindInteractions = (root) => {
  root.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const res = await dbApi.toggleInteraction(btn.dataset.slug, btn.dataset.toggle);
      if (!res.ok) return toast(res.error, { type: 'error' });
      await renderUserPanel();
    })
  );
  root.querySelectorAll('[data-rate-value]').forEach((button) =>
    button.addEventListener('click', async () => {
      const value = Number(button.dataset.rateValue);
      const slug = button.dataset.rate;
      if (!value || !slug) return;
      const res = await dbApi.setRating(slug, value);
      if (!res.ok) return toast(res.error, { type: 'error' });
      await renderUserPanel();
    })
  );
  root.querySelectorAll('[data-comment-submit]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.commentSubmit;
      const input = root.querySelector(`[data-comment-input="${slug}"]`);
      const res = await dbApi.addComment(slug, input?.value || '');
      if (!res.ok) return toast(res.error, { type: 'error' });
      if (input) input.value = '';
      await renderUserPanel();
    })
  );
};

const closeWriteFullscreen = () => {
  const shell = $('[data-write-fullscreen]');
  if (!shell || shell.hidden) return;
  shell.hidden = true;
  document.body.classList.remove('write-fs-open');
};

const openWriteFullscreen = () => {
  const shell = $('[data-write-fullscreen]');
  if (!shell) return;
  shell.hidden = false;
  document.body.classList.add('write-fs-open');
  const dateInput = $('#composer-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => notionEditor?.focus());
  });
};

const bindWriteFullscreenShell = () => {
  if (writeShellBound) return;
  const shell = $('[data-write-fullscreen]');
  if (!shell) return;
  writeShellBound = true;

  shell.querySelector('[data-close-write-editor]')?.addEventListener('click', closeWriteFullscreen);

  // The launch button lives outside the shell, inside the dashboard panel.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-write-editor]')) openWriteFullscreen();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shell.hidden) {
      e.preventDefault();
      closeWriteFullscreen();
    }
  });
};

const bindComposer = async () => {
  if (composerBound) return;
  // With the new architecture, the form IS the fullscreen container.
  const form = $('[data-write-fullscreen]');
  const editorRoot = form?.querySelector('[data-notion-root]');
  const toolbar = form?.querySelector('[data-toolbar]');
  const imageTray = form?.querySelector('[data-image-tray]');
  if (!form || !editorRoot || !toolbar || !imageTray) return;

  notionEditor = await createNotionEditor({
    rootElement: editorRoot,
    toolbarElement: toolbar,
    imageTrayElement: imageTray,
  });
  notionEditor.setHTML('<p></p>');
  bindCoverImageField(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const slug = String(data.get('slug') || '').trim() || slugify(title);
    if (!title || !slug) return toast('Title and slug are required.', { type: 'error' });
    const editorHtml = notionEditor?.getHTML() || '<p></p>';
    const images = notionEditor?.getImages() || [];
    const imageHtml = images.map((url) => `<p><img src="${url}" alt="" loading="lazy" /></p>`).join('');
    const bodyHtml = sanitizeHTML(`${editorHtml}${imageHtml}`);
    const post = {
      title,
      slug,
      date: String(data.get('date') || '') || new Date().toISOString().slice(0, 10),
      author:
        String(data.get('author') || '') ||
        (await currentUserObject())?.displayName ||
        'Dhammics User',
      description: String(data.get('description') || '').trim(),
      cover: String(data.get('cover') || '').trim(),
      tags: String(data.get('tags') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      readingTime: readingTime(bodyHtml.replace(/<[^>]*>/g, ' ')),
      bodyHtml,
    };
    const result = await dbApi.saveLocalPost(post);
    if (!result.ok) return toast(result.error, { type: 'error' });
    toast('Local post saved.', { type: 'success' });
    await renderUserPanel();
    form.reset();
    setCoverPreview(form, '');
    notionEditor?.clear();
  });

  form.querySelector('[data-generate-slug]')?.addEventListener('click', () => {
    const titleInput = form.querySelector('#composer-title');
    const slugInput = form.querySelector('#composer-slug');
    if (slugInput) slugInput.value = slugify(titleInput?.value || '');
  });

  if (window.lucide?.createIcons) window.lucide.createIcons();
  composerBound = true;
};

const renderUserPanel = async () => {
  const shell = $('[data-user-shell]');
  if (!shell || shell.hidden) return;
  const [posts, state, localPosts] = await Promise.all([
    listPosts({ includeLocal: true }),
    dbApi.listUserState(),
    dbApi.listLocalPosts(),
  ]);

  const withStats = await Promise.all(
    posts.map(async (p) => ({ post: p, stats: await dbApi.getPostInteractions(p.slug) }))
  );
  $('[data-feed-list]').innerHTML = withStats
    .slice(0, 12)
    .map(({ post, stats }) => feedRow(post, state, stats))
    .join('');

  $('[data-reading-list]').innerHTML =
    state.starred.length === 0
      ? '<li class="empty" style="padding:var(--space-4)">No starred posts yet.</li>'
      : state.starred
          .map((slug) => posts.find((p) => p.slug === slug))
          .filter(Boolean)
          .map((post) => `<li><a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></li>`)
          .join('');

  $('[data-reading-comments]').innerHTML =
    state.comments.length === 0
      ? '<li class="empty" style="padding:var(--space-4)">No comments yet.</li>'
      : state.comments
          .slice()
          .reverse()
          .slice(0, 12)
          .map(
            (comment) =>
              `<li><a href="./post.html?slug=${encodeURIComponent(comment.slug)}">${escapeHTML(comment.text.slice(0, 90))}</a> <span class="muted">(${formatDateTime(comment.createdAt)})</span></li>`
          )
          .join('');

  $('[data-favorites-list]').innerHTML =
    state.favorited.length === 0
      ? '<li class="empty" style="padding:var(--space-4)">No favorites yet.</li>'
      : state.favorited
          .map((slug) => posts.find((p) => p.slug === slug))
          .filter(Boolean)
          .map((post) => `<li><a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></li>`)
          .join('');

  const favSet = new Set(state.favorited);
  const reranked = [...posts].sort((a, b) => {
    const scoreA = (favSet.has(a.slug) ? 1000000000 : 0) + new Date(a.date).getTime();
    const scoreB = (favSet.has(b.slug) ? 1000000000 : 0) + new Date(b.date).getTime();
    return scoreB - scoreA;
  });
  $('[data-reranked-list]').innerHTML = reranked
    .slice(0, 10)
    .map(
      (post, i) =>
        `<li><span class="muted">#${i + 1}</span> <a href="./post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a>${favSet.has(post.slug) ? ' <span class="chip">fav</span>' : ''}</li>`
    )
    .join('');

  $('[data-local-posts]').innerHTML =
    localPosts.length === 0
      ? '<li class="empty" style="padding:var(--space-4)">No local posts created yet.</li>'
      : localPosts
          .map(
            (post) => `
      <li>
        <strong>${escapeHTML(post.title)}</strong>
        <span class="muted">${formatDate(post.date)}</span>
        <div class="draft-actions">
          <a class="icon-btn" href="./post.html?slug=${encodeURIComponent(post.slug)}" title="Preview"><i data-lucide="eye"></i></a>
          <button class="icon-btn" type="button" data-delete-local="${escapeHTML(post.slug)}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </li>`
          )
          .join('');

  $('[data-stat-total-posts]').textContent = String(posts.length);
  $('[data-stat-starred]').textContent = String(state.starred.length);
  $('[data-stat-favorites]').textContent = String(state.favorited.length);
  $('[data-stat-local-posts]').textContent = String(localPosts.length);

  shell.querySelectorAll('[data-delete-local]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await dbApi.deleteLocalPost(btn.dataset.deleteLocal);
      await renderUserPanel();
    })
  );

  bindInteractions(shell);
  showScreen(activeScreen);
  document.dispatchEvent(new CustomEvent('dhammics:rendered'));
};

const init = async () => {
  bindAuthForms();
  bindScreenNav();
  bindWriteFullscreenShell();
  await setAuthState();
  await renderUserPanel();
  await bindComposer();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
} else {
  init();
}


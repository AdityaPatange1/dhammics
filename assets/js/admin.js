/**
 * Admin panel — compose new posts in markdown, live-preview the rendered
 * output, save drafts (localStorage) for on-the-fly previews, and export a
 * .md file + a manifest snippet that can be committed to the repo to publish.
 */

import { requireAuth, logout, currentUser } from './auth.js';
import { renderMarkdown, excerpt } from './markdown.js';
import { getDrafts, writeDrafts } from './posts.js';
import { $, toast, debounce, formatDate, readingTime, escapeHTML } from './utils.js';

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const formValues = () => {
  const form = $('#post-form');
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const slug = String(data.get('slug') || '').trim() || slugify(title);
  const tags = String(data.get('tags') || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const body = String(data.get('body') || '');
  return {
    title,
    slug,
    description: String(data.get('description') || '').trim() || excerpt(body),
    author: String(data.get('author') || '').trim() || 'Dhammics',
    date: String(data.get('date') || '').trim() || new Date().toISOString().slice(0, 10),
    cover: String(data.get('cover') || '').trim(),
    tags,
    readingTime: readingTime(body),
    body,
  };
};

const renderPreview = () => {
  const preview = $('[data-preview]');
  if (!preview) return;
  const { body, title } = formValues();
  preview.innerHTML = `${title ? `<h2>${escapeHTML(title)}</h2>` : ''}${renderMarkdown(body)}`;
};

const renderDrafts = () => {
  const list = $('[data-drafts]');
  if (!list) return;
  const drafts = getDrafts();
  if (drafts.length === 0) {
    list.innerHTML =
      '<li class="empty" style="padding:var(--space-4)">No drafts yet. Your local drafts appear here.</li>';
    return;
  }
  list.innerHTML = drafts
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(
      (d) => `
      <li>
        <div class="draft-info">
          <strong>${escapeHTML(d.title || '(untitled)')}</strong>
          <span>${escapeHTML(d.slug)} · updated ${formatDate(d.updatedAt)}</span>
        </div>
        <div class="draft-actions">
          <button class="icon-btn" type="button" data-load="${escapeHTML(d.slug)}" title="Load draft">
            <i data-lucide="pencil"></i>
          </button>
          <a class="icon-btn" href="./post.html?slug=${encodeURIComponent(d.slug)}" title="Preview">
            <i data-lucide="eye"></i>
          </a>
          <button class="icon-btn" type="button" data-delete="${escapeHTML(d.slug)}" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </li>
    `
    )
    .join('');
  if (window.lucide?.createIcons) window.lucide.createIcons();
};

const saveDraft = () => {
  const values = formValues();
  if (!values.title) {
    toast('Give your post a title before saving.', { type: 'error' });
    return;
  }
  if (!values.slug) {
    toast('A slug is required.', { type: 'error' });
    return;
  }
  const drafts = getDrafts();
  const existing = drafts.findIndex((d) => d.slug === values.slug);
  const entry = { ...values, updatedAt: new Date().toISOString() };
  if (existing >= 0) drafts[existing] = entry;
  else drafts.push(entry);
  writeDrafts(drafts);
  toast('Draft saved locally.', { type: 'success' });
  renderDrafts();
};

const loadDraft = (slug) => {
  const drafts = getDrafts();
  const d = drafts.find((x) => x.slug === slug);
  if (!d) return;
  const form = $('#post-form');
  form.title.value = d.title || '';
  form.slug.value = d.slug || '';
  form.description.value = d.description || '';
  form.author.value = d.author || '';
  form.date.value = d.date || '';
  form.cover.value = d.cover || '';
  form.tags.value = Array.isArray(d.tags) ? d.tags.join(', ') : d.tags || '';
  form.body.value = d.body || '';
  renderPreview();
  toast(`Loaded "${d.title}".`, { type: 'info' });
};

const deleteDraft = (slug) => {
  if (!confirm(`Delete draft "${slug}"? This cannot be undone.`)) return;
  writeDrafts(getDrafts().filter((d) => d.slug !== slug));
  renderDrafts();
  toast('Draft deleted.', { type: 'info' });
};

const buildMarkdownFile = (values) => {
  const fm = [
    '---',
    `title: "${values.title.replaceAll('"', '\\"')}"`,
    `slug: ${values.slug}`,
    `date: ${values.date}`,
    `author: "${values.author}"`,
    `description: "${values.description.replaceAll('"', '\\"')}"`,
    `cover: ${values.cover}`,
    `tags: [${values.tags.map((t) => `"${t}"`).join(', ')}]`,
    `readingTime: ${values.readingTime}`,
    '---',
    '',
    values.body.trim(),
    '',
  ].join('\n');
  return fm;
};

const buildManifestEntry = (values) => ({
  slug: values.slug,
  title: values.title,
  description: values.description,
  date: values.date,
  author: values.author,
  tags: values.tags,
  cover: values.cover,
  readingTime: values.readingTime,
  file: `./content/posts/${values.slug}.md`,
});

const download = (filename, content, mime = 'text/plain') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const publish = () => {
  const values = formValues();
  if (!values.title || !values.slug) {
    toast('Title and slug are required to publish.', { type: 'error' });
    return;
  }
  saveDraft();
  const md = buildMarkdownFile(values);
  const manifestSnippet = JSON.stringify(buildManifestEntry(values), null, 2);
  download(`${values.slug}.md`, md, 'text/markdown');
  download(`${values.slug}.manifest.json`, manifestSnippet, 'application/json');
  toast('Markdown + manifest downloaded. Commit to publish.', { type: 'success' });
};

const initTabs = () => {
  const tabs = $('[data-editor-tabs]');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;
    tabs.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-selected', String(b === btn));
    });
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tab;
    });
    if (tab === 'preview') renderPreview();
  });
};

const init = () => {
  if (!requireAuth()) return;

  const who = $('[data-current-user]');
  if (who) who.textContent = currentUser() || 'admin';

  const form = $('#post-form');
  if (!form) return;

  const today = new Date().toISOString().slice(0, 10);
  if (!form.date.value) form.date.value = today;

  form.addEventListener('input', debounce(renderPreview, 120));
  form.title.addEventListener('input', () => {
    if (!form.slug.dataset.edited) form.slug.value = slugify(form.title.value);
  });
  form.slug.addEventListener('input', () => {
    form.slug.dataset.edited = 'true';
  });

  $('[data-save-draft]')?.addEventListener('click', saveDraft);
  $('[data-publish]')?.addEventListener('click', publish);

  $('[data-clear]')?.addEventListener('click', () => {
    if (!confirm('Clear the form? Unsaved changes will be lost.')) return;
    form.reset();
    form.date.value = today;
    form.slug.dataset.edited = '';
    renderPreview();
  });

  $('[data-logout]')?.addEventListener('click', () => {
    logout();
    location.assign('./index.html');
  });

  $('[data-drafts]')?.addEventListener('click', (e) => {
    const loadBtn = e.target.closest('[data-load]');
    const deleteBtn = e.target.closest('[data-delete]');
    if (loadBtn) loadDraft(loadBtn.dataset.load);
    if (deleteBtn) deleteDraft(deleteBtn.dataset.delete);
  });

  initTabs();
  renderPreview();
  renderDrafts();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

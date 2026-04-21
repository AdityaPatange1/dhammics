# Dhammics

Vanilla HTML/CSS/JS Dhamma blogging platform with a localStorage-first user system.

## Features

- Static Markdown blog posts from `content/posts/*.md` + `manifest.json`
- User panel (`user.html`) with local account login/register (frontend only)
- Engagement features: like, comment, rate, star, favorite
- Separate star/favorite behavior:
  - Star = save for revival/re-reading (tooltip included)
  - Favorite = rerank and push posts up in personalized feed
- Feed page (`feed.html`) with latest + reranked modes
- Rich text composer (Medium-style contenteditable toolbar) that saves local posts to localStorage
- No backend yet: all API-style operations are wrapped over localStorage for easy future migration

## Pages

- `index.html` — shell for home
- `feed.html` — shell for latest/reranked feed
- `post.html` — shell for article + interactions
- `user.html` — shell for auth/dashboard/composer
- `404.html` — shell for not found page

## Templating Architecture

Pages are now assembled by a client-side templating engine rather than storing
full markup inside each HTML file.

- `assets/js/template-engine.js` — block/page template loader + renderer
- `assets/js/app-shell.js` — bootstraps templates and page scripts
- `assets/templates/pages/` — top-level page templates
- `assets/templates/blocks/` — reusable HTML blocks (header, footer, sections)

Each page shell (`index.html`, `feed.html`, `post.html`, `user.html`, `404.html`)
contains only metadata, a root mount node, and the app shell script. UI markup
is composed from block templates at runtime.

## Run

```bash
npm install
npm run dev
```

Local server: `http://localhost:4173`

## Scripts

- `npm run dev` — static dev server
- `npm run validate` — validates markdown manifest/front-matter
- `npm run lint` — JS/CSS/HTML lint checks
- `npm run build` — regenerates manifest and emits `dist/`
- `npm run check` — validate + lint + build

## localStorage API layer

`assets/js/localdb.js` contains async API-like wrappers for:

- user auth/session
- local user posts
- likes/stars/favorites
- ratings
- comments

Replace this module with real network APIs later without changing UI logic significantly.

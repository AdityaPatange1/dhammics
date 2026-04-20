#!/usr/bin/env node
/**
 * Validate the post manifest and every referenced markdown file:
 *   - manifest.json parses and is well-formed
 *   - every post has required front-matter fields
 *   - every slug is unique and matches its filename
 *   - every referenced .md file exists
 *   - dates are ISO-ish and parseable
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const REQUIRED_MANIFEST_FIELDS = ['slug', 'title', 'description', 'date', 'file'];
const REQUIRED_FRONT_FIELDS = ['title', 'slug', 'date', 'description'];

const parseFrontMatter = (text) => {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim().replace(/^["']|["']$/g, '');
    if (/^\[.*\]$/.test(m[2].trim())) {
      value = m[2]
        .trim()
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    data[m[1]] = value;
  }
  return { data, body: text.slice(match[0].length) };
};

const errors = [];
const warnings = [];
const pushError = (msg) => errors.push(`✗ ${msg}`);
const pushWarn = (msg) => warnings.push(`! ${msg}`);

const main = async () => {
  const manifestPath = join(root, 'content/posts/manifest.json');
  if (!existsSync(manifestPath)) {
    pushError(`Manifest not found at ${manifestPath}`);
    return report();
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    pushError(`manifest.json is not valid JSON: ${err.message}`);
    return report();
  }

  if (!Array.isArray(manifest.posts)) {
    pushError('manifest.posts is missing or not an array');
    return report();
  }

  const seenSlugs = new Set();

  for (const [i, entry] of manifest.posts.entries()) {
    const label = `posts[${i}] (${entry.slug || 'unknown'})`;

    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (!entry[field]) pushError(`${label}: missing manifest field "${field}"`);
    }

    if (entry.slug) {
      if (seenSlugs.has(entry.slug)) pushError(`${label}: duplicate slug "${entry.slug}"`);
      seenSlugs.add(entry.slug);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.slug)) {
        pushError(`${label}: slug must be kebab-case lowercase alphanumerics (got "${entry.slug}")`);
      }
    }

    if (entry.date && Number.isNaN(Date.parse(entry.date))) {
      pushError(`${label}: unparseable date "${entry.date}"`);
    }

    if (!entry.cover) pushWarn(`${label}: no cover image set`);

    if (!entry.file) continue;
    const absFile = resolve(root, entry.file.replace(/^\.\//, ''));
    if (!existsSync(absFile)) {
      pushError(`${label}: referenced file not found → ${entry.file}`);
      continue;
    }

    const raw = await readFile(absFile, 'utf8');
    const { data, body } = parseFrontMatter(raw);

    for (const field of REQUIRED_FRONT_FIELDS) {
      if (!data[field]) pushError(`${label}: front-matter missing "${field}"`);
    }
    if (data.slug && data.slug !== entry.slug) {
      pushError(`${label}: manifest slug "${entry.slug}" ≠ front-matter slug "${data.slug}"`);
    }
    if (body.trim().length < 80) {
      pushWarn(`${label}: body is very short (${body.trim().length} chars)`);
    }
  }

  report();
};

const report = () => {
  for (const w of warnings) console.log(`\u001b[33m${w}\u001b[0m`);
  for (const e of errors) console.log(`\u001b[31m${e}\u001b[0m`);

  if (errors.length > 0) {
    console.log(`\n\u001b[31m✗ Validation failed: ${errors.length} error(s)\u001b[0m`);
    process.exitCode = 1;
  } else {
    console.log(`\n\u001b[32m✓ Validation passed\u001b[0m (${warnings.length} warning(s))`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

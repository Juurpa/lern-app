import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));

test('jede SHELL-Datei existiert', () => {
  for (const p of shell.filter(p => p !== './')) assert.ok(existsSync(new URL(p, root)), `fehlt: ${p}`);
});

test('alle JS-Module und Datendateien sind in SHELL', () => {
  const js = readdirSync(new URL('js/', root)).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
  const ui = readdirSync(new URL('js/ui/', root)).map(f => `js/ui/${f}`);
  const data = readdirSync(new URL('data/', root)).map(f => `data/${f}`);
  for (const p of [...js, ...ui, ...data]) assert.ok(shell.includes(p), `nicht gecacht: ${p}`);
});

test('Gemini-Aufrufe werden nie gecacht', () => {
  assert.match(sw, /generativelanguage\.googleapis\.com/);
});

test('Fetch-Fallback liefert bei Cache-Miss + Netzwerkfehler eine saubere Response', () => {
  assert.match(sw, /Response\.error\(\)/);
});

const cdnMatch = sw.match(/const CDN = (\[[\s\S]*?\]);/);
const cdn = cdnMatch ? JSON.parse(cdnMatch[1].replace(/'/g, '"').replace(/,\s*\]/, ']')) : [];
const html = readFileSync(new URL('index.html', root), 'utf8');
const htmlCdn = [...html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/[^"'\s]+/g)].map(m => m[0]);

test('jede CDN-URL aus index.html ist exakt versioniert und im SW-Precache', () => {
  assert.ok(htmlCdn.length >= 8, `nur ${htmlCdn.length} CDN-URLs gefunden`);
  for (const u of htmlCdn) {
    assert.match(u, /@\d+\.\d+\.\d+\//, `nicht exakt gepinnt: ${u}`);
    assert.ok(cdn.includes(u), `nicht im Precache: ${u}`);
  }
});

test('KaTeX-Grundschriften sind im Precache', () => {
  for (const f of ['Main-Regular', 'Math-Italic', 'Main-Bold', 'Size1-Regular', 'Size2-Regular', 'AMS-Regular']) {
    assert.ok(cdn.some(u => u.endsWith(`/fonts/KaTeX_${f}.woff2`)), `fehlt: ${f}`);
  }
});

test('CDN wird mit CORS-Requests vorgeladen, Cache-Version erhöht', () => {
  assert.match(sw, /new Request\(u(rl)?, \{ mode: 'cors' \}\)/);
  assert.match(sw, /const CACHE = 'lernapp-v5'/);
});

test('Update-Prüfanfragen werden nicht gecacht', () => {
  assert.match(sw, /searchParams\.has\('check'\)/);
});

test('PNG-Icons: Manifest (192/512), apple-touch-icon und SHELL', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(i => i.sizes === size && i.type === 'image/png'), `fehlt: ${size}`);
  assert.match(html, /<link rel="apple-touch-icon" href="icon-180\.png">/);
  for (const i of ['icon-180.png', ...manifest.icons.map(x => x.src)]) assert.ok(shell.includes(i), `nicht gecacht: ${i}`);
});

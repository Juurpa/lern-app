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

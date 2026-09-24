import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRef, checkRef, refPath, cleanRefs, deckRefs, refLabel, createSlideLoader, SLIDE_CACHE } from '../js/slides.js';

const decks = new Map([['mts06', { id: 'mts06', title: 'MTS 06', pages: 55 }]]);

test('parseRef: Seite und Ausschnitt', () => {
  assert.deepEqual(parseRef('mts06:49'), { deck: 'mts06', page: 49, crop: null });
  assert.deepEqual(parseRef('mts06:9@0.1,0.25,0.9,0.8'), { deck: 'mts06', page: 9, crop: ['0.1', '0.25', '0.9', '0.8'] });
  assert.equal(parseRef('MTS06:4'), null);
  assert.equal(parseRef('mts06'), null);
  assert.equal(parseRef('mts06:4@1,2'), null);
});

test('checkRef: Deck, Seitenbereich, Ausschnitt', () => {
  assert.equal(checkRef('mts06:1', decks), null);
  assert.equal(checkRef('mts06:55', decks), null);
  assert.match(checkRef('mts06:56', decks), /außerhalb/);
  assert.match(checkRef('mts06:0', decks), /außerhalb/);
  assert.match(checkRef('xyz:1', decks), /unbekannter Foliensatz/);
  assert.match(checkRef('mts06:3@0.5,0.1,0.4,0.9', decks), /Ausschnitt/);
  assert.match(checkRef('mts06:3@0.1,0.1,1.2,0.9', decks), /Ausschnitt/);
  assert.match(checkRef('quatsch', decks), /ungültige/);
});

test('refPath: dreistellige Seite, Ausschnitt im Dateinamen (wie tools/render-slides.py)', () => {
  assert.equal(refPath('mts06:49'), 'slides/mts06/049.webp');
  assert.equal(refPath('mts06:7@0.1,0.2,0.9,0.8'), 'slides/mts06/007@0.1_0.2_0.9_0.8.webp');
  assert.throws(() => refPath('x'), /ungültige/);
});

test('cleanRefs trennt gültige von ungültigen und entfernt Duplikate', () => {
  const r = cleanRefs(['mts06:1', 'mts06:1', 'mts06:99', 'nope:2'], decks);
  assert.deepEqual(r.ok, ['mts06:1']);
  assert.equal(r.problems.length, 2);
  assert.deepEqual(cleanRefs(undefined, decks), { ok: [], problems: [] });
});

test('deckRefs und refLabel', () => {
  assert.deepEqual(deckRefs({ id: 'd', pages: 3 }), ['d:1', 'd:2', 'd:3']);
  assert.equal(refLabel('mts06:49', decks), 'MTS 06 · Folie 49');
  assert.equal(refLabel('mts06:4@0,0,1,1', decks), 'MTS 06 · Folie 4 (Ausschnitt)');
});

function fakeCaches() {
  const store = new Map();
  const cache = {
    async match(u) { return store.has(u) ? store.get(u) : undefined; },
    async put(u, r) { store.set(u, r); },
  };
  return { store, opened: [], async open(n) { this.opened.push(n); return cache; } };
}
const resp = (status = 200, body = 'IMG') => ({ ok: status < 300, status, clone() { return this; }, async blob() { return body; } });

test('Loader: holt mit Bearer-Schlüssel, speichert im eigenen Cache, zweiter Aufruf offline', async () => {
  const caches = fakeCaches();
  const calls = [];
  const l = createSlideLoader({ baseUrl: 'https://w.dev/', getKey: () => 'k1', cachesApi: caches, fetchFn: async (u, o) => { calls.push({ u, o }); return resp(); } });
  assert.equal(await l.load('mts06:49'), 'IMG');
  assert.equal(calls[0].u, 'https://w.dev/slides/mts06/049.webp');
  assert.equal(calls[0].o.headers.Authorization, 'Bearer k1');
  assert.equal(await l.load('mts06:49'), 'IMG');
  assert.equal(calls.length, 1);
  assert.equal(caches.opened[0], SLIDE_CACHE);
  assert.equal(await l.isCached('mts06:49'), true);
  assert.equal(await l.countCached(['mts06:49', 'mts06:50']), 1);
});

test('Loader: ohne Schlüssel oder bei 401 verständliche Fehler, nichts gecacht', async () => {
  const caches = fakeCaches();
  const noKey = createSlideLoader({ baseUrl: 'https://w.dev', getKey: () => '', cachesApi: caches, fetchFn: () => assert.fail('kein Fetch ohne Schlüssel') });
  await assert.rejects(noKey.load('mts06:1'), /Sync-Schlüssel fehlt/);
  const bad = createSlideLoader({ baseUrl: 'https://w.dev', getKey: () => 'x', cachesApi: caches, fetchFn: async () => resp(401) });
  await assert.rejects(bad.load('mts06:1'), /ungültig/);
  assert.equal(caches.store.size, 0);
});

test('Loader.prefetch: Fortschritt, zählt Fehler, bricht bei Schlüsselfehler ab', async () => {
  const seen = [];
  const l = createSlideLoader({ baseUrl: 'https://w.dev', getKey: () => 'k', cachesApi: fakeCaches(), fetchFn: async u => (u.endsWith('002.webp') ? resp(500) : resp()) });
  const r = await l.prefetch(['d:1', 'd:2', 'd:3'], (d, t) => seen.push(`${d}/${t}`), 2);
  assert.deepEqual(r, { done: 3, failed: 1 });
  assert.equal(seen.at(-1), '3/3');
  const nokey = createSlideLoader({ baseUrl: 'https://w.dev', getKey: () => '', cachesApi: fakeCaches(), fetchFn: async () => resp() });
  await assert.rejects(nokey.prefetch(['d:1', 'd:2']), /Sync-Schlüssel/);
});

import { refsFromSource } from '../tools/link-sources.mjs';

test('link-sources: Folienangaben aus source-Texten', () => {
  assert.deepEqual(refsFromSource('MTS__06_CRM1.pdf, Folie 20, 23'), ['mts06:20', 'mts06:23']);
  assert.deepEqual(refsFromSource('MTS__03_RS2.pdf, Folie 17–18'), ['mts03:17', 'mts03:18']);
  assert.deepEqual(refsFromSource('Lecture_RadarSystems_Lec.pdf, S. 218f'), ['rad-lec:218', 'rad-lec:219']);
  assert.deepEqual(refsFromSource('Lecture_RadarSystems_Lec.pdf, Kap. 5.7 (Single Target Tracking)'), ['rad-lec:355']);
  assert.deepEqual(refsFromSource('MTS_Ue__02_RS2.pdf, Aufgabe 3 (Lösung S. 6); MTS__03_RS2.pdf, Folie 29'), ['mtsue02:6', 'mts03:29']);
  assert.deepEqual(refsFromSource('Radar_FMCW_Diskussion.md, Abschnitt 4'), []);
  assert.equal(refsFromSource('MTS__02_RS1.pdf, Folie 1–40').length, 3);
});

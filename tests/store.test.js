import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, emptyDoc } from '../js/store.js';

const fakeStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('leerer Speicher liefert Standarddokument', () => {
  assert.deepEqual(createStore(fakeStorage()).load(), emptyDoc());
});

test('save/load Rundreise', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.cards.C1 = { fsrs: { reps: 1 }, alt: 1 };
  s.save(doc);
  assert.deepEqual(s.load().cards.C1, { fsrs: { reps: 1 }, alt: 1 });
});

test('kaputtes JSON im Speicher → Standarddokument', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', '{kaputt');
  assert.deepEqual(createStore(st).load(), emptyDoc());
});

test('Export enthält keinen Gemini-Key, Import behält den aktuellen Key', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.settings.geminiKey = 'GEHEIM';
  const text = s.exportJson(doc);
  assert.ok(!text.includes('GEHEIM'));
  assert.equal(s.importJson(text, 'GEHEIM').settings.geminiKey, 'GEHEIM');
});

test('Import lehnt fremde Dateien ab', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.importJson('{"foo":1}'), /Keine gültige Sicherung/);
  assert.throws(() => s.importJson('nicht json'));
});

test('fehlende Settings werden mit Standardwerten ergänzt', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', JSON.stringify({ version: 1, cards: {}, units: {}, gaps: [], settings: {} }));
  assert.equal(createStore(st).load().settings.newPerSession, 15);
});

test('importJson lehnt cards: null ab', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.importJson('{"version":1,"cards":null,"gaps":[]}'), /Keine gültige Sicherung/);
});

test('importJson lehnt cards: [] (Array) ab', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.importJson('{"version":1,"cards":[],"gaps":[]}'), /Keine gültige Sicherung/);
});

test('Import: ungültiges JSON → verständliche Meldung', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.importJson('nicht json'), /Datei ist keine gültige JSON-Sicherung/);
});

test('Import verwirft kaputte Kartenzustände und Lücken statt sie zu übernehmen', () => {
  const s = createStore(fakeStorage());
  const ok = { fsrs: { due: '2026-09-30T08:00:00.000Z', reps: 1, stability: 2 }, alt: 1 };
  const gapOk = { cardId: 'A', fach: 'INF2', front: 'F', added: '2026-09-22T08:00:00.000Z', hits: [], closed: null };
  const d = {
    version: 1, units: {},
    cards: { A: ok, B: { fsrs: { due: 'kein Datum' } }, C: { alt: 1 }, D: null, E: { fsrs: null } },
    gaps: [gapOk, { cardId: 5, fach: 'INF2', front: 'F', added: 'x', hits: [] }, { cardId: 'B', fach: 'INF2', front: 'F', added: 'x', hits: null }, null, { cardId: 'C', fach: 'INF2', front: 3, added: 'x', hits: [] }],
  };
  const doc = s.importJson(JSON.stringify(d));
  assert.deepEqual(Object.keys(doc.cards), ['A']);
  assert.deepEqual(doc.gaps, [gapOk]);
  assert.deepEqual(s.load().cards, { A: ok });
});

test('Standarddokument enthält leere Folien-Position/-Markierungen', () => {
  const doc = emptyDoc();
  assert.deepEqual(doc.slidePositions, {});
  assert.deepEqual(doc.slideMarks, {});
});

test('save/load Rundreise für Folien-Position und -Markierungen', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.slidePositions.mts06 = 12;
  doc.slideMarks['mts06:12'] = 'unsure';
  s.save(doc);
  const loaded = s.load();
  assert.equal(loaded.slidePositions.mts06, 12);
  assert.equal(loaded.slideMarks['mts06:12'], 'unsure');
});

test('load() (nicht nur Import) verwirft kaputte Folien-Positionen/-Markierungen aus localStorage', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', JSON.stringify({
    version: 1, cards: {}, units: {}, gaps: [],
    slidePositions: 'oops', slideMarks: null,
  }));
  const doc = createStore(st).load();
  assert.deepEqual(doc.slidePositions, {});
  assert.deepEqual(doc.slideMarks, {});
});

test('load() verwirft Array-artige Folien-Positionen/-Markierungen (würden sonst beim Speichern verschwinden)', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', JSON.stringify({
    version: 1, cards: {}, units: {}, gaps: [],
    slidePositions: [], slideMarks: [1, 2, 3],
  }));
  const doc = createStore(st).load();
  assert.deepEqual(doc.slidePositions, {});
  assert.deepEqual(doc.slideMarks, {});
});

test('Import verwirft ungültige Folien-Positionen und -Markierungen', () => {
  const s = createStore(fakeStorage());
  const d = {
    version: 1, units: {}, cards: {}, gaps: [],
    slidePositions: { a: 3, b: -1, c: 'x', d: 1.5 },
    slideMarks: { 'a:1': 'unsure', 'a:2': 'ok', 'a:3': 'quatsch', 'a:4': 1 },
  };
  const doc = s.importJson(JSON.stringify(d));
  assert.deepEqual(doc.slidePositions, { a: 3 });
  assert.deepEqual(doc.slideMarks, { 'a:1': 'unsure', 'a:2': 'ok' });
});

test('Export enthält keinen Sync-Schlüssel, Import behält beide Schlüssel', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.settings.syncKey = 'SYNC-GEHEIM';
  doc.settings.geminiKey = 'GEM';
  const text = s.exportJson(doc);
  assert.ok(!text.includes('SYNC-GEHEIM'));
  const back = s.importJson(text, { geminiKey: 'GEM', syncKey: 'SYNC-GEHEIM' });
  assert.equal(back.settings.syncKey, 'SYNC-GEHEIM');
  assert.equal(back.settings.geminiKey, 'GEM');
});

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

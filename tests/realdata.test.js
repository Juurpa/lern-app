import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const cards = [...read('cards-inf2.json'), ...read('cards-mts.json'), ...read('cards-radar.json')];
const decks = read('decks.json');
const exercises = read('exercises.json');

test('echte Daten: keine verworfenen Karten/Units/Aufgaben, alle Folien-Referenzen gültig', () => {
  const r = validateData({ meta, units, cards, decks, exercises });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.cards.length, cards.length);
  assert.equal(r.exercises.length, exercises.exercises.length);
});

test('Foliensätze: eindeutige IDs, nur bekannte Fächer/Units, keine privaten Dateien wie Bonuspunkte', () => {
  const ids = decks.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const unitIds = new Set(units.map(u => u.id));
  for (const d of decks) {
    assert.ok(meta.faecher[d.fach], d.id);
    assert.ok(d.pages > 0 && d.aspect > 0, d.id);
    for (const u of d.units) assert.ok(unitIds.has(u), `${d.id}: ${u}`);
    assert.doesNotMatch(d.file, /Bonuspunkte|Neurologie/i, d.id);
  }
});

test('INF2: 735 Karten + 60 Code-Übungen, 20 Units', () => {
  const inf2 = cards.filter(c => c.fach === 'INF2' && !/-F\d+$/.test(c.id)); // ohne Folienkarten
  assert.equal(inf2.length, 735);
  assert.equal(inf2.filter(c => c.examMode === 'code').length, 60);
  assert.equal(units.filter(u => u.fach === 'INF2').length, 20);
});

test('MTS: 10 Units (S1, K2-K10), RADAR: 5 Units (S1-S5), 35 Units insgesamt', () => {
  assert.equal(units.filter(u => u.fach === 'MTS').length, 10);
  assert.equal(units.filter(u => u.fach === 'RADAR').length, 5);
  assert.equal(units.length, 35);
  const radar = cards.filter(c => c.fach === 'RADAR');
  assert.ok(radar.length >= 90, `RADAR-Karten: ${radar.length}`);
  assert.ok(radar.every(c => ['voice', 'calc'].includes(c.examMode) || (/-F\d+$/.test(c.id) && c.examMode === 'sketch')));
});

test('bridges.json und synthesis.json sind Arrays', () => {
  assert.ok(Array.isArray(read('bridges.json')));
  assert.ok(Array.isArray(read('synthesis.json')));
});

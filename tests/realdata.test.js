import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const cards = [...read('cards-inf2.json'), ...read('cards-mts.json'), ...read('cards-radar.json')];

test('echte Daten: keine verworfenen Karten oder Units', () => {
  const r = validateData({ meta, units, cards });
  assert.deepEqual(r.errors, []);
  assert.equal(r.cards.length, cards.length);
});

test('INF2: 682 Karten + 60 Code-Übungen, 20 Units', () => {
  const inf2 = cards.filter(c => c.fach === 'INF2');
  assert.equal(inf2.length, 742);
  assert.equal(inf2.filter(c => c.examMode === 'code').length, 60);
  assert.equal(units.filter(u => u.fach === 'INF2').length, 20);
});

test('bridges.json und synthesis.json sind Arrays', () => {
  assert.ok(Array.isArray(read('bridges.json')));
  assert.ok(Array.isArray(read('synthesis.json')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = read('units.json').filter(u => u.fach === 'INF2');

test('INF2: alle 20 Units haben ein vollständiges Lerngerüst', () => {
  assert.equal(units.length, 20);
  for (const u of units) {
    for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) {
      assert.ok(u[k]?.length > 20, `${u.id}: ${k} fehlt oder zu kurz`);
    }
  }
});

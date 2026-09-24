import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const unit = read('units.json').find(u => u.id === 'MTS-K2');
const cards = read('cards-mts.json').filter(c => c.unit === 'MTS-K2' && !/-F\d+$/.test(c.id));

test('Unit MTS-K2 vollständig', () => {
  assert.ok(unit);
  for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) assert.ok(unit[k]?.length > 20, `${k} fehlt`);
});

test('15–20 Karten mit keyPoints und Quelle', () => {
  assert.ok(cards.length >= 15 && cards.length <= 20, `Anzahl ${cards.length}`);
  for (const c of cards) {
    assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    assert.match(c.source, /MTS__02_RS1\.pdf|MTS_Ue__01_RS1\.pdf|02_Medizintechnische_Systeme\.md/, `${c.id} source`);
  }
});

test('Abfrage-Varianten ausreichend', () => {
  assert.ok(cards.filter(c => c.mc).length >= 5);
  assert.ok(cards.filter(c => c.cloze).length >= 5);
  assert.ok(cards.filter(c => c.why).length >= 5);
});

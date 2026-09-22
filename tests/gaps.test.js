import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addGap, recordCorrect, openGaps, toMarkdown } from '../js/gaps.js';

const card = { id: 'C1', fach: 'INF2', front: 'Was ist | ein\nADT?' };
const d = (day, h = 10) => new Date(2026, 8, day, h);

test('addGap legt einmal an, zweites Rot setzt Treffer zurück', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  assert.equal(g[0].hits.length, 1);
  g = addGap(g, card, d(23, 15));
  assert.equal(g.length, 1);
  assert.equal(g[0].hits.length, 0);
});

test('Treffer am selben Tag wie der Eintrag zählt nicht', () => {
  const g = recordCorrect(addGap([], card, d(22, 9)), 'C1', d(22, 20));
  assert.equal(g[0].hits.length, 0);
});

test('zwei Treffer an verschiedenen Folgetagen schließen die Lücke', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  g = recordCorrect(g, 'C1', d(23, 18));
  assert.equal(g[0].closed, null);
  g = recordCorrect(g, 'C1', d(24));
  assert.ok(g[0].closed);
  assert.equal(openGaps(g).length, 0);
});

test('toMarkdown erzeugt LUECKEN.md-Tabellen pro Fach', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  const md = toMarkdown(g, { faecher: { INF2: { label: 'Informatik 2' }, MTS: { label: 'Medizintechnische Systeme' } } });
  assert.match(md, /## Informatik 2/);
  assert.match(md, /\| 22\.09\. \| Was ist \\\| ein ADT\? \| 23\.09\. \|  \|/);
  assert.match(md, /## Medizintechnische Systeme\n\n\| Datum/);
});

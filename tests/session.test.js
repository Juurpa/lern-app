import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, interleave, buildSession, insertRelearn } from '../js/session.js';
import { emptyDoc } from '../js/store.js';

const meta = { faecher: { INF2: { exam: '2026-10-07' }, MTS: { exam: '2026-10-07' } } };
const now = new Date(2026, 8, 22, 10);
const past = new Date(2026, 8, 21).toISOString();
const future = new Date(2026, 8, 30).toISOString();

test('allocate verteilt nach Gewicht (D\'Hondt) und respektiert Verfügbarkeit', () => {
  assert.deepEqual(allocate({ A: 10, B: 10 }, { A: 2, B: 1 }, 6), { A: 4, B: 2 });
  assert.deepEqual(allocate({ A: 1, B: 10 }, { A: 5, B: 1 }, 4), { A: 1, B: 3 });
  assert.deepEqual(allocate({ A: 0 }, { A: 1 }, 3), { A: 0 });
});

test('interleave: nie mehr als 3 gleiche Fächer hintereinander, solange andere da sind', () => {
  const items = [...Array(6)].map((_, i) => ({ fach: 'INF2', i })).concat([{ fach: 'MTS' }, { fach: 'MTS' }]);
  const out = interleave(items, 3);
  assert.equal(out.length, 8);
  let run = 1;
  for (let i = 1; i < out.length; i++) { run = out[i].fach === out[i - 1].fach ? run + 1 : 1; assert.ok(run <= 3); }
});

const units = [
  { id: 'U-I', fach: 'INF2', order: 1, title: 'I', kern: 'Kern I' },
  { id: 'U-M', fach: 'MTS', order: 2, title: 'M', kern: '' },
];
const mk = (id, fach, unit, priority = false) => ({ id, fach, unit, priority, examMode: 'free', front: id, back: id });

test('fällige vor neuen, newLimit greift, Priorität zuerst, Unit-Intro einmal', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I', true), mk('i3', 'INF2', 'U-I'), mk('m1', 'MTS', 'U-M'), mk('d1', 'MTS', 'U-M'), mk('f1', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.d1 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.cards.f1 = { fsrs: { due: future, reps: 2, stability: 3 }, alt: 2 };
  const s = buildSession({ cards, units, doc, meta, now, newLimit: 3 });
  const cardIds = s.filter(x => x.type === 'card').map(x => x.cardId);
  assert.equal(cardIds[0], 'd1');
  assert.ok(!cardIds.includes('f1'));
  assert.equal(cardIds.length, 4);
  assert.ok(cardIds.includes('i2'));
  const intro = s.filter(x => x.type === 'unit');
  assert.deepEqual(intro.map(x => x.unitId), ['U-I']);
  assert.equal(s[s.findIndex(x => x.type === 'unit') + 1].type, 'card');
});

test('gesehene Units bekommen kein Intro, exclude wird beachtet', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  const s = buildSession({ cards, units, doc, meta, now, exclude: new Set(['i1']) });
  assert.deepEqual(s, [{ type: 'card', cardId: 'i2', fach: 'INF2' }]);
});

test('insertRelearn fügt 5 Positionen später ein bzw. am Ende', () => {
  const q = [1, 2, 3, 4, 5, 6, 7].map(n => ({ type: 'card', cardId: String(n), fach: 'INF2' }));
  const item = { type: 'card', cardId: 'X', fach: 'INF2' };
  assert.equal(insertRelearn(q, 1, item).findIndex(x => x.cardId === 'X'), 6);
  assert.equal(insertRelearn(q.slice(0, 3), 2, item).at(-1).cardId, 'X');
});

test('buildSession: max-3 constraint respects seam between due and fresh (interleave globally)', () => {
  // 3 due INF2 + 5 fresh INF2 + 2 fresh MTS
  const cards = [
    mk('due1', 'INF2', 'U-I'),
    mk('due2', 'INF2', 'U-I'),
    mk('due3', 'INF2', 'U-I'),
    mk('fresh1', 'INF2', 'U-I'),
    mk('fresh2', 'INF2', 'U-I'),
    mk('fresh3', 'INF2', 'U-I'),
    mk('fresh4', 'INF2', 'U-I'),
    mk('fresh5', 'INF2', 'U-I'),
    mk('mts1', 'MTS', 'U-M'),
    mk('mts2', 'MTS', 'U-M'),
  ];
  const doc = emptyDoc();
  doc.cards.due1 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.cards.due2 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.cards.due3 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };

  const s = buildSession({ cards, units, doc, meta, now, size: 30, newLimit: 10 });
  const cardItems = s.filter(x => x.type === 'card');

  // First card should be due
  assert.ok(['due1', 'due2', 'due3'].includes(cardItems[0].cardId));

  // No run > 3 of same fach
  let run = 1;
  for (let i = 1; i < cardItems.length; i++) {
    run = cardItems[i].fach === cardItems[i - 1].fach ? run + 1 : 1;
    assert.ok(run <= 3, `Run of ${cardItems[i].fach} exceeded 3 at position ${i}: ${run}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, interleave, buildSession, insertRelearn, examFinished, calendarDaysUntil, newPerDayNeeded, sessionNewLimit, resolveFach, fachStats, examLabel, urgencyOf, estimateMinutes, reviewedToday, dayKey, resolveOnly } from '../js/session.js';
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

test('buildSession: Karten eines Fachs mit vergangener Prüfung werden ausgeschlossen', () => {
  const meta2 = { faecher: { INF2: { exam: '2026-10-07' }, RADAR: { exam: '2026-10-08' } } };
  const units2 = [{ id: 'U-I', fach: 'INF2', order: 1, title: 'I' }, { id: 'U-R', fach: 'RADAR', order: 2, title: 'R' }];
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I'), mk('r1', 'RADAR', 'U-R'), mk('r2', 'RADAR', 'U-R')];
  const doc = emptyDoc();
  doc.cards.i2 = { fsrs: { due: new Date(2026, 9, 6).toISOString(), reps: 2, stability: 3 }, alt: 2 };
  const onExamDay = buildSession({ cards, units: units2, doc, meta: meta2, now: new Date(2026, 9, 7, 20) });
  assert.ok(onExamDay.some(x => x.cardId === 'i2'), 'am Prüfungstag selbst noch dabei');
  const after = buildSession({ cards, units: units2, doc, meta: meta2, now: new Date(2026, 9, 8, 0, 30) });
  const ids = after.filter(x => x.type === 'card').map(x => x.cardId);
  assert.deepEqual(ids.sort(), ['r1', 'r2']);
});

test('buildSession mit fach: nur Karten (und Unit-Intros) dieses Fachs, fällige wie neue', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I'), mk('m1', 'MTS', 'U-M'), mk('md', 'MTS', 'U-M')];
  const doc = emptyDoc();
  doc.cards.md = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  const onlyMts = buildSession({ cards, units, doc, meta, now, fach: 'MTS' });
  assert.deepEqual(onlyMts.map(x => x.cardId).sort(), ['m1', 'md']);
  assert.ok(onlyMts.every(x => x.fach === 'MTS'));
  const onlyInf = buildSession({ cards, units, doc, meta, now, fach: 'INF2' });
  assert.ok(onlyInf.every(x => x.fach === 'INF2'));
  assert.deepEqual(onlyInf.filter(x => x.type === 'unit').map(x => x.unitId), ['U-I']);
  assert.equal(buildSession({ cards, units, doc, meta, now }).filter(x => x.type === 'card').length, 4, 'ohne fach: alle Fächer gemischt');
});

test('buildSession mit fach: Fach mit vergangener Prüfung bleibt leer', () => {
  const meta2 = { faecher: { INF2: { exam: '2026-10-07' }, RADAR: { exam: '2026-10-08' } } };
  const cards = [mk('i1', 'INF2', 'U-I'), mk('r1', 'RADAR', 'U-R')];
  const after = new Date(2026, 9, 8, 0, 30);
  assert.deepEqual(buildSession({ cards, units: [], doc: emptyDoc(), meta: meta2, now: after, fach: 'INF2' }), []);
});

test('resolveFach: Schlüssel case-insensitiv, unbekannt/leer → null (alle mischen)', () => {
  const m = { faecher: { INF2: {}, MTS: {}, RADAR: {} } };
  assert.equal(resolveFach(m, 'MTS'), 'MTS');
  assert.equal(resolveFach(m, 'radar'), 'RADAR');
  assert.equal(resolveFach(m, ' inf2 '), 'INF2');
  assert.equal(resolveFach(m, 'quatsch'), null);
  assert.equal(resolveFach(m, ''), null);
  assert.equal(resolveFach(m, null), null);
  assert.equal(resolveFach(m, undefined), null);
});

test('examFinished / calendarDaysUntil: lokale Kalendertage', () => {
  assert.equal(examFinished('2026-10-07', new Date(2026, 9, 7, 23, 59)), false);
  assert.equal(examFinished('2026-10-07', new Date(2026, 9, 8, 0, 0)), true);
  assert.equal(calendarDaysUntil('2026-10-07', new Date(2026, 9, 7, 8)), 0);
  assert.equal(calendarDaysUntil('2026-10-07', new Date(2026, 9, 6, 23)), 1);
  assert.equal(calendarDaysUntil('2026-10-07', new Date(2026, 8, 22, 10)), 15);
});

test('newPerDayNeeded: neue Karten auf die Tage bis zum Vortag verteilen', () => {
  assert.equal(newPerDayNeeded(700, '2026-10-07', new Date(2026, 8, 22, 10)), 50); // 700 / 14
  assert.equal(newPerDayNeeded(5, '2026-10-07', new Date(2026, 9, 6, 10)), 5); // min. 1 Tag
  assert.equal(newPerDayNeeded(0, '2026-10-07', new Date(2026, 8, 22)), 0);
  assert.equal(newPerDayNeeded(10, '2026-10-07', new Date(2026, 9, 8, 10)), 0); // Prüfung vorbei
});

test('sessionNewLimit: neue Karten pro 15-min-Session, nicht pro Queue-Aufbau', () => {
  assert.equal(sessionNewLimit({ newPerSession: 15 }, 0), 15);
  assert.equal(sessionNewLimit({ newPerSession: 15 }, 9), 6);
  assert.equal(sessionNewLimit({ newPerSession: 15 }, 20), 0);
  assert.equal(emptyDoc().settings.newPerSession, 15);
});

test('fachStats: fällig/neu/Lücken/Tempo nur für das gewählte Fach', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I'), mk('m1', 'MTS', 'U-M'), mk('md', 'MTS', 'U-M')];
  const doc = emptyDoc();
  doc.cards.md = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.gaps = [{ cardId: 'x', fach: 'MTS' }, { cardId: 'y', fach: 'INF2' }, { cardId: 'z', fach: 'MTS', closed: true }];
  const mts = fachStats({ cards, doc, fach: 'MTS', exam: '2026-10-07', now });
  assert.deepEqual(mts, { due: 1, fresh: 1, gaps: 1, pace: 1, prio: 0, prioTotal: 0, prioPace: 0, finished: false, urgency: 'low' });
  const inf = fachStats({ cards, doc, fach: 'INF2', exam: '2026-10-07', now });
  assert.equal(inf.due, 0);
  assert.equal(inf.fresh, 2);
  assert.equal(inf.gaps, 1);
  assert.equal(fachStats({ cards, doc, fach: 'INF2', exam: '2026-10-07', now: new Date(2026, 9, 8, 1) }).finished, true);
});

test('examLabel: Restzeit, heute, vorbei', () => {
  assert.equal(examLabel('2026-10-07', new Date(2026, 9, 6, 9)), 'noch 1 Tag');
  assert.equal(examLabel('2026-10-07', new Date(2026, 8, 29, 9)), 'noch 8 Tage');
  assert.equal(examLabel('2026-10-07', new Date(2026, 9, 7, 9)), 'heute Prüfung');
  assert.equal(examLabel('2026-10-07', new Date(2026, 9, 8, 9)), 'Prüfung vorbei');
});

test('buildSession only=due: nur Fälliges, keine neuen Karten', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I'), mk('id', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.id = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  const s = buildSession({ cards, units, doc, meta, now, only: 'due', fach: 'INF2' });
  assert.deepEqual(s, [{ type: 'card', cardId: 'id', fach: 'INF2' }]);
});

test('buildSession only=new: nur Neues, ohne 15-min-Limit (newLimit 0 wird ignoriert)', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I'), mk('id', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.id = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.units['U-I'] = { seen: true };
  const s = buildSession({ cards, units, doc, meta, now, only: 'new', newLimit: 0 });
  assert.deepEqual(s.map(x => x.cardId).sort(), ['i1', 'i2']);
});

test('buildSession only=prio: nur als wichtig markierte Karten, fällige wie neue', () => {
  const cards = [mk('p1', 'INF2', 'U-I', true), mk('p2', 'INF2', 'U-I', true), mk('n1', 'INF2', 'U-I'), mk('nd', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.p2 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.cards.nd = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.units['U-I'] = { seen: true };
  const s = buildSession({ cards, units, doc, meta, now, only: 'prio', newLimit: 0 });
  assert.deepEqual(s.map(x => x.cardId).sort(), ['p1', 'p2']);
});

test('buildSession only=gaps: offene Lücken auch vor der Fälligkeit, geschlossene nicht', () => {
  const cards = [mk('g1', 'MTS', 'U-M'), mk('g2', 'MTS', 'U-M'), mk('ok', 'MTS', 'U-M'), mk('n1', 'MTS', 'U-M')];
  const doc = emptyDoc();
  for (const id of ['g1', 'g2', 'ok']) doc.cards[id] = { fsrs: { due: future, reps: 1, stability: 1 }, alt: 1 };
  doc.gaps = [{ cardId: 'g1', fach: 'MTS' }, { cardId: 'g2', fach: 'MTS' }, { cardId: 'ok', fach: 'MTS', closed: true }];
  const s = buildSession({ cards, units, doc, meta, now, only: 'gaps' });
  assert.deepEqual(s.map(x => x.cardId).sort(), ['g1', 'g2']);
  assert.deepEqual(buildSession({ cards, units, doc, meta, now, only: 'gaps', exclude: new Set(['g1']) }).map(x => x.cardId), ['g2']);
});

test('resolveOnly: nur bekannte Modi, sonst null', () => {
  assert.equal(resolveOnly('due'), 'due');
  assert.equal(resolveOnly('gaps'), 'gaps');
  assert.equal(resolveOnly('quatsch'), null);
  assert.equal(resolveOnly(null), null);
});

test('fachStats: prio zählt nur neue Prioritätskarten; Tempo dafür separat', () => {
  const cards = [mk('p1', 'INF2', 'U-I', true), mk('p2', 'INF2', 'U-I', true), mk('p3', 'INF2', 'U-I', true), mk('n1', 'INF2', 'U-I'), mk('n2', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.p3 = { fsrs: { due: future, reps: 1, stability: 1 }, alt: 1 };
  const s = fachStats({ cards, doc, fach: 'INF2', exam: '2026-10-07', now });
  assert.equal(s.prio, 2);
  assert.equal(s.prioTotal, 3);
  assert.equal(s.fresh, 4);
  assert.ok(s.prioPace <= s.pace);
});

test('urgencyOf: Tempo-Schwellen, kurz vor der Prüfung immer dringend, vorbei = done', () => {
  const early = new Date(2026, 8, 22, 10);
  assert.equal(urgencyOf({ pace: 126, due: 0, fresh: 882, finished: false }, '2026-10-07', early), 'high');
  assert.equal(urgencyOf({ pace: 39, due: 0, fresh: 267, finished: false }, '2026-10-07', early), 'mid');
  assert.equal(urgencyOf({ pace: 18, due: 0, fresh: 140, finished: false }, '2026-10-07', early), 'low');
  assert.equal(urgencyOf({ pace: 5, due: 0, fresh: 5, finished: false }, '2026-10-07', new Date(2026, 9, 5, 10)), 'high');
  assert.equal(urgencyOf({ pace: 0, due: 0, fresh: 0, finished: false }, '2026-10-07', new Date(2026, 9, 5, 10)), 'low');
  assert.equal(urgencyOf({ pace: 99, due: 9, fresh: 9, finished: true }, '2026-10-07', early), 'done');
});

test('Zeit-Budget, Tagesschlüssel und heute bewertete Karten', () => {
  assert.equal(estimateMinutes(0), 0);
  assert.equal(estimateMinutes(1), 1);
  assert.equal(estimateMinutes(120), 60);
  assert.equal(dayKey(new Date(2026, 8, 5, 23, 59)), '2026-09-05');
  const cards = [mk('a', 'INF2', 'U-I'), mk('b', 'INF2', 'U-I'), mk('c', 'INF2', 'U-I'), mk('d', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.a = { fsrs: { due: future, last_review: new Date(2026, 8, 22, 8).toISOString() }, alt: 1 };
  doc.cards.b = { fsrs: { due: future, last_review: new Date(2026, 8, 21, 23, 59).toISOString() }, alt: 1 };
  doc.cards.c = { fsrs: { due: future, last_review: null }, alt: 1 };
  assert.equal(reviewedToday(cards, doc, now), 1);
});

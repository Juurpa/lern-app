import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, interleave, buildSession, scheduleAgain, barSegments, NEED_CORRECT, shuffle, weave, LEAD_FRESH, examFinished, calendarDaysUntil, newPerDayNeeded, sessionNewLimit, resolveFach, fachStats, examLabel, urgencyOf, estimateMinutes, reviewedToday, dayKey, resolveOnly } from '../js/session.js';
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

// Deterministischer Zufall (mulberry32), damit die Tests reproduzierbar bleiben.
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const dueState = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
const cardIdsOf = s => s.filter(x => x.type === 'card').map(x => x.cardId);

test('Neu zuerst, Wiederholer eingestreut, newLimit greift, Priorität zuerst, Unit-Intro einmal', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I', true), mk('i3', 'INF2', 'U-I'), mk('m1', 'MTS', 'U-M'), mk('d1', 'MTS', 'U-M'), mk('f1', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.d1 = { ...dueState };
  doc.cards.f1 = { fsrs: { due: future, reps: 2, stability: 3 }, alt: 2 };
  for (let seed = 1; seed <= 10; seed++) {
    const s = buildSession({ cards, units, doc, meta, now, newLimit: 3, rng: seeded(seed) });
    const ids = cardIdsOf(s);
    assert.equal(ids.length, 4);
    assert.ok(!ids.includes('f1'));
    assert.ok(ids.includes('i2'), 'Prioritätskarte immer dabei');
    assert.equal(ids[3], 'd1', 'die ersten drei sind neu, der Wiederholer kommt danach');
    assert.deepEqual(s.filter(x => x.type === 'unit').map(x => x.unitId), ['U-I']);
    assert.equal(s[s.findIndex(x => x.type === 'unit') + 1].type, 'card');
  }
});

test('gesehene Units bekommen kein Intro, exclude wird beachtet', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  const s = buildSession({ cards, units, doc, meta, now, exclude: new Set(['i1']) });
  assert.deepEqual(s, [{ type: 'card', cardId: 'i2', fach: 'INF2' }]);
});

const cardItem = id => ({ type: 'card', cardId: String(id), fach: 'INF2' });

test('scheduleAgain (falsch): ans Ende mit retry, Gezeigtes bleibt, keine Dopplung, Units bleiben', () => {
  const q = [1, 2, 3, 4, 5, 6, 7].map(cardItem);
  const item = cardItem('X');
  const out = scheduleAgain(q, 1, item, { wrong: true });
  assert.equal(out.length, 8);
  assert.deepEqual(out.slice(0, 7), q);
  assert.deepEqual(out.at(-1), { ...item, retry: true });
  assert.equal(q.length, 7, 'Eingabe bleibt unverändert');

  const again = scheduleAgain(out, 5, cardItem('X'), { wrong: true });
  assert.equal(again.filter(x => x.cardId === 'X').length, 1);
  assert.equal(again.at(-1).cardId, 'X');
  assert.deepEqual(scheduleAgain([], 0, item, { wrong: true }), [{ ...item, retry: true }]);

  const withUnit = [{ type: 'unit', unitId: 'X', fach: 'INF2' }, ...q];
  assert.equal(scheduleAgain(withUnit, 0, item, { wrong: true }).filter(x => x.type === 'unit').length, 1, 'Unit-Einträge werden nicht entfernt');
});

test('scheduleAgain (richtig, aber noch nicht genug): 4–8 Karten später, nie sofort, nie über das Ende hinaus', () => {
  const q = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(cardItem);
  const item = cardItem('X');
  const at = (rng, queue = q, pos = 2) => scheduleAgain(queue, pos, item, { wrong: false, rng }).findIndex(x => x.cardId === 'X');
  assert.equal(at(() => 0), 2 + 4, 'frühestens 4 Karten nach der aktuellen');
  assert.equal(at(() => 0.999), 2 + 8, 'spätestens 8 Karten danach');
  const out = scheduleAgain(q, 2, item, { wrong: false, rng: () => 0 });
  assert.equal(out.length, 13);
  assert.equal(out[6].retry, false);
  assert.deepEqual(out.filter(x => x.cardId !== 'X'), q);
  assert.equal(at(() => 0.5, q.slice(0, 5), 2), 5, 'kurze Queue: ans Ende, nicht darüber hinaus');
  assert.equal(scheduleAgain([], 0, item, { wrong: false }).length, 1);
  const dup = scheduleAgain([...q, item], 2, item, { wrong: false, rng: () => 0 });
  assert.equal(dup.filter(x => x.cardId === 'X').length, 1, 'keine Dopplung');
});

test('barSegments: Verlauf plus noch nötige richtige Antworten, aktuelle Frage markiert, Fehler verlängern den Balken', () => {
  assert.equal(NEED_CORRECT, 2);
  const queue = [cardItem('a'), cardItem('b'), { type: 'unit', unitId: 'U', fach: 'INF2' }];
  const got = new Map();
  assert.deepEqual(barSegments({ history: [], current: cardItem('a'), queue, pos: 1, got }), ['cur', '', '', ''], 'a und b brauchen je 2, Units zählen nicht');
  assert.deepEqual(barSegments({ history: ['g'], current: null, queue: [cardItem('b'), cardItem('a')], pos: 0, got: new Map([['a', 1]]) }), ['g', 'cur', '', '']);
  assert.deepEqual(barSegments({ history: ['g', 'r'], current: cardItem('c'), queue: [], pos: 0, got: new Map([['c', 1]]) }), ['g', 'r', 'cur']);
  assert.deepEqual(barSegments({ history: ['g', 'g'], current: null, queue: [], pos: 0, got: new Map() }), ['g', 'g'], 'nichts mehr offen → keine cur-Markierung');
  const before = barSegments({ history: [], current: cardItem('a'), queue: [cardItem('b')], pos: 0, got: new Map() });
  const afterWrong = barSegments({ history: ['r'], current: null, queue: [cardItem('b'), { ...cardItem('a'), retry: true }], pos: 0, got: new Map() });
  assert.equal(afterWrong.length, before.length + 1, 'eine falsche Antwort macht den Balken um ein Segment länger');
});

test('shuffle: Permutation ohne Mutation, seed-abhängig', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = shuffle(list, seeded(1));
  assert.deepEqual([...a].sort(), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(shuffle(list, seeded(1)), a);
  assert.ok([2, 3, 4, 5].some(seed => shuffle(list, seeded(seed)).join() !== a.join()));
  assert.deepEqual(shuffle([], seeded(1)), []);
});

test('weave streut Wiederholer gleichmäßig zwischen die neuen Karten', () => {
  assert.deepEqual(weave(['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], ['r1', 'r2']), ['f1', 'f2', 'r1', 'f3', 'f4', 'f5', 'r2', 'f6']);
  assert.deepEqual(weave(['f1', 'f2'], []), ['f1', 'f2']);
  assert.deepEqual(weave([], ['r1', 'r2']), ['r1', 'r2']);
  const out = weave(Array.from({ length: 9 }, (_, i) => `f${i}`), ['r1', 'r2', 'r3']);
  const at = out.map((x, i) => (x.startsWith('r') ? i : -1)).filter(i => i >= 0);
  assert.equal(out.length, 12);
  assert.ok(at.every((p, i) => i === 0 || p - at[i - 1] >= 3), 'nie zwei Wiederholer direkt hintereinander');
});

test('interleave mit head: gesetzte Anfangseinträge bleiben und zählen für den Lauf', () => {
  const head = [{ fach: 'INF2', id: 'h1' }, { fach: 'INF2', id: 'h2' }, { fach: 'INF2', id: 'h3' }];
  const out = interleave([{ fach: 'INF2', id: 'a' }, { fach: 'MTS', id: 'b' }], 3, head);
  assert.deepEqual(out.map(x => x.id), ['h1', 'h2', 'h3', 'b', 'a']);
});

// Läufe gleicher Fächer über 3 sind nur erlaubt, wenn danach nichts anderes mehr übrig ist.
const assertRuns = items => {
  let run = 1;
  for (let i = 1; i < items.length; i++) {
    run = items[i].fach === items[i - 1].fach ? run + 1 : 1;
    if (run > 3) assert.ok(items.slice(i).every(x => x.fach === items[i].fach), `Lauf > 3 bei Position ${i} trotz anderer Fächer`);
  }
};

test('buildSession: max-3-Lauf gilt über die Naht zwischen Wiederholern und Neuem hinweg', () => {
  const cards = [
    mk('due1', 'INF2', 'U-I'), mk('due2', 'INF2', 'U-I'), mk('due3', 'INF2', 'U-I'),
    mk('fresh1', 'INF2', 'U-I'), mk('fresh2', 'INF2', 'U-I'), mk('fresh3', 'INF2', 'U-I'), mk('fresh4', 'INF2', 'U-I'), mk('fresh5', 'INF2', 'U-I'),
    mk('mts1', 'MTS', 'U-M'), mk('mts2', 'MTS', 'U-M'), mk('mts3', 'MTS', 'U-M'),
  ];
  const doc = emptyDoc();
  for (const id of ['due1', 'due2', 'due3']) doc.cards[id] = { ...dueState };
  for (let seed = 1; seed <= 25; seed++) {
    const items = buildSession({ cards, units, doc, meta, now, rng: seeded(seed) }).filter(x => x.type === 'card');
    assert.equal(items.length, 11);
    assert.ok(items.slice(0, LEAD_FRESH).every(x => !doc.cards[x.cardId]), 'Anfang ist neu');
    assertRuns(items);
  }
});

test('Muster: erste Karten absolut neu, ca. jede dritte neue Karte ein Wiederholer, Rest zufällig', () => {
  const cards = [];
  for (let i = 0; i < 12; i++) { cards.push(mk(`ni${i}`, 'INF2', 'U-I'), mk(`nm${i}`, 'MTS', 'U-M')); }
  for (let i = 0; i < 8; i++) cards.push(mk(`d${i}`, i % 2 ? 'INF2' : 'MTS', i % 2 ? 'U-I' : 'U-M'));
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  for (let i = 0; i < 8; i++) doc.cards[`d${i}`] = { ...dueState };

  for (let seed = 1; seed <= 25; seed++) {
    const ids = cardIdsOf(buildSession({ cards, units, doc, meta, now, newLimit: 9, rng: seeded(seed) }));
    const isNew = id => !doc.cards[id];
    assert.equal(ids.length, 12, '9 neue + 3 Wiederholer');
    assert.equal(ids.filter(isNew).length, 9);
    assert.ok(ids.slice(0, LEAD_FRESH).every(isNew), `Session beginnt mit ${LEAD_FRESH} neuen Karten`);
    const firstRepeat = ids.findIndex(id => !isNew(id));
    assert.ok(firstRepeat >= LEAD_FRESH && firstRepeat <= 6, `erster Wiederholer an Position ${firstRepeat} statt am Ende zu kleben`);
    assert.ok(!isNew(ids.at(-1)) || ids.slice(-4).some(id => !isNew(id)), 'Wiederholer sind über die Session verteilt');
    assertRuns(ids.map(id => ({ fach: cards.find(c => c.id === id).fach })));
  }
});

test('Zufall: verschiedene Seeds ziehen andere Karten und andere Reihenfolgen', () => {
  const cards = [];
  for (let i = 0; i < 24; i++) cards.push(mk(`n${i}`, 'INF2', 'U-I'));
  for (let i = 0; i < 8; i++) cards.push(mk(`d${i}`, 'INF2', 'U-I'));
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  for (let i = 0; i < 8; i++) doc.cards[`d${i}`] = { ...dueState };
  const runs = Array.from({ length: 12 }, (_, k) => cardIdsOf(buildSession({ cards, units, doc, meta, now, newLimit: 9, rng: seeded(k + 1) })));
  assert.ok(new Set(runs.map(r => r.join())).size >= 10, 'fast jede Session sieht anders aus');
  const freshSeen = new Set(runs.flat().filter(id => id.startsWith('n')));
  const dueSeen = new Set(runs.flat().filter(id => id.startsWith('d')));
  assert.ok(freshSeen.size > 9, 'nicht immer dieselben neuen Karten');
  assert.ok(dueSeen.size > 3, 'nicht immer dieselben Wiederholer');
  assert.ok(runs.every(r => new Set(r).size === r.length), 'keine Karte doppelt');
});

test('Wiederholer: offene Lücken werden bevorzugt gezogen', () => {
  const cards = [mk('n1', 'INF2', 'U-I'), mk('n2', 'INF2', 'U-I'), mk('n3', 'INF2', 'U-I'), mk('g1', 'INF2', 'U-I'), mk('g2', 'INF2', 'U-I'), mk('a', 'INF2', 'U-I'), mk('b', 'INF2', 'U-I'), mk('c', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  for (const id of ['g1', 'g2', 'a', 'b', 'c']) doc.cards[id] = { ...dueState };
  doc.gaps = [{ cardId: 'g1', fach: 'INF2', closed: null }, { cardId: 'g2', fach: 'INF2', closed: null }];
  for (let seed = 1; seed <= 10; seed++) {
    const ids = cardIdsOf(buildSession({ cards, units, doc, meta, now, newLimit: 3, rng: seeded(seed) }));
    assert.deepEqual(ids.filter(id => doc.cards[id]).sort(), ['g1', 'g2']);
  }
});

test('ohne neue Karten füllen Wiederholer die Session; ohne Wiederholer besteht sie nur aus Neuem', () => {
  const cards = [mk('n1', 'INF2', 'U-I'), mk('n2', 'INF2', 'U-I'), mk('d1', 'INF2', 'U-I'), mk('d2', 'INF2', 'U-I'), mk('d3', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  for (const id of ['d1', 'd2', 'd3']) doc.cards[id] = { ...dueState };
  assert.deepEqual(cardIdsOf(buildSession({ cards, units, doc, meta, now, newLimit: 0, rng: seeded(1) })).sort(), ['d1', 'd2', 'd3']);
  for (const id of ['d1', 'd2', 'd3']) delete doc.cards[id];
  assert.deepEqual(cardIdsOf(buildSession({ cards, units, doc, meta, now, rng: seeded(1) })).sort(), ['d1', 'd2', 'd3', 'n1', 'n2']);
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

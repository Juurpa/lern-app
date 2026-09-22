import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rating } from 'ts-fsrs';
import { toRating, review, chooseMode, isDue } from '../js/scheduler.js';

const FAR = '2027-06-01';
const t0 = new Date(2026, 8, 22, 10, 0);

test('toRating bildet Buttons je nach Modus ab', () => {
  assert.equal(toRating('red', 'free'), Rating.Again);
  assert.equal(toRating('yellow', 'mc'), Rating.Hard);
  assert.equal(toRating('green', 'free'), Rating.Easy);
  assert.equal(toRating('green', 'voice'), Rating.Easy);
  assert.equal(toRating('green', 'free', true), Rating.Good);
  assert.equal(toRating('green', 'mc'), Rating.Good);
  assert.equal(toRating('green', 'cloze'), Rating.Good);
  assert.throws(() => toRating('blue', 'free'));
});

test('MC bringt weniger Stabilität als Freitext, aber mehr als vorher', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const viaMc = review(s1, { button: 'green', mode: 'mc' }, t1, FAR);
  const viaFree = review(s1, { button: 'green', mode: 'free' }, t1, FAR);
  assert.ok(viaMc.fsrs.stability > s1.fsrs.stability);
  assert.ok(viaMc.fsrs.stability < viaFree.fsrs.stability);
});

test('Intervall folgt der gedämpften Stabilität', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const s2 = review(s1, { button: 'green', mode: 'cloze' }, t1, FAR);
  const days = Math.round((new Date(s2.fsrs.due) - t1) / 86400000);
  assert.equal(days, Math.max(1, Math.round(s2.fsrs.stability)));
});

test('Prüfungsdeckel: fällig spätestens am Vortag 00:00', () => {
  let st = review(undefined, { button: 'green', mode: 'free' }, new Date(2026, 8, 1), '2026-10-07');
  st = review(st, { button: 'green', mode: 'free' }, new Date(2026, 9, 1), '2026-10-07');
  assert.ok(new Date(st.fsrs.due) <= new Date(2026, 9, 6));
});

test('kein Deckel mehr, wenn der Vortag schon begonnen hat', () => {
  const now = new Date(2026, 9, 6, 12, 0);
  const st = review(undefined, { button: 'green', mode: 'free' }, now, '2026-10-07');
  assert.ok(new Date(st.fsrs.due) > now);
});

test('Rot: Karte ist noch am selben Tag wieder fällig', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const s2 = review(s1, { button: 'red', mode: 'free' }, t1, FAR);
  assert.ok(new Date(s2.fsrs.due) - t1 < 86400000);
});

test('isDue', () => {
  assert.equal(isDue(undefined, t0), false);
  const st = review(undefined, { button: 'red', mode: 'free' }, t0, FAR);
  assert.equal(isDue(st, new Date(t0.getTime() + 3600000)), true);
});

const card = { examMode: 'free', mc: { options: ['a'], correct: 'a' }, cloze: { text: '{{1}}', answers: ['a'] }, why: 'Warum?' };
const stWith = (reps, stability, alt) => ({ fsrs: { reps, stability, due: t0.toISOString() }, alt });

test('chooseMode: neu → MC, dann Lückentext, dann examMode', () => {
  assert.equal(chooseMode(card, undefined, t0, FAR), 'mc');
  assert.equal(chooseMode(card, stWith(1, 1, 1), t0, FAR), 'cloze');
  assert.equal(chooseMode(card, stWith(2, 3, 2), t0, FAR), 'free');
  assert.equal(chooseMode({ examMode: 'voice' }, undefined, t0, FAR), 'voice');
});

test('chooseMode: Mutation ab S ≥ 10 im Wechsel', () => {
  assert.equal(chooseMode(card, stWith(6, 12, 4), t0, FAR), 'why');
  assert.equal(chooseMode(card, stWith(6, 12, 5), t0, FAR), 'free');
  assert.equal(chooseMode({ ...card, bridges: ['BR-1'] }, stWith(6, 12, 4), t0, FAR), 'bridge');
});

test('chooseMode: 3-Tage-Lock erzwingt examMode', () => {
  const now = new Date(2026, 9, 4, 9, 0);
  assert.equal(chooseMode(card, undefined, now, '2026-10-07'), 'free');
  assert.equal(chooseMode(card, stWith(6, 12, 4), now, '2026-10-07'), 'free');
});

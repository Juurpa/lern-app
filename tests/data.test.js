import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../js/data.js';

const meta = { faecher: { INF2: {}, MTS: {} } };
const units = [{ id: 'U1', fach: 'INF2', order: 1, title: 'Eins' }];
const ok = { id: 'C1', fach: 'INF2', unit: 'U1', front: 'F', back: 'B', examMode: 'free' };

test('gültige Karte bleibt erhalten', () => {
  const r = validateData({ meta, units, cards: [ok] });
  assert.equal(r.cards.length, 1);
  assert.deepEqual(r.errors, []);
});

test('fehlendes Pflichtfeld verwirft die Karte', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, back: '' }] });
  assert.equal(r.cards.length, 0);
  assert.match(r.errors[0], /C1: Feld 'back' fehlt/);
});

test('unbekannte Unit, unbekanntes Fach und falscher examMode sind Fehler', () => {
  const r = validateData({ meta, units, cards: [
    { ...ok, id: 'A', unit: 'X' }, { ...ok, id: 'B', fach: 'BIO' }, { ...ok, id: 'C', examMode: 'mc' },
  ] });
  assert.equal(r.cards.length, 0);
  assert.equal(r.errors.length, 3);
});

test('doppelte ID verwirft das Duplikat', () => {
  const r = validateData({ meta, units, cards: [ok, ok] });
  assert.equal(r.cards.length, 1);
  assert.match(r.errors[0], /doppelte ID/);
});

test('kaputtes mc/cloze wird entfernt, Karte bleibt (Warnung)', () => {
  const r = validateData({ meta, units, cards: [{
    ...ok,
    mc: { stem: 's', options: ['a', 'b'], correct: 'c' },
    cloze: { text: '{{1}} und {{2}}', answers: ['x'] },
  }] });
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].mc, undefined);
  assert.equal(r.cards[0].cloze, undefined);
  assert.equal(r.warnings.length, 2);
});

test('code-Karte braucht code.solution', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, examMode: 'code' }] });
  assert.equal(r.cards.length, 0);
});

test('Units ohne Pflichtfelder werden verworfen, Rest nach order sortiert', () => {
  const r = validateData({ meta, units: [
    { id: 'U2', fach: 'INF2', order: 2, title: 'Zwei' }, { id: 'U1', fach: 'INF2', order: 1, title: 'Eins' }, { id: 'U3' },
  ], cards: [] });
  assert.deepEqual(r.units.map(u => u.id), ['U1', 'U2']);
  assert.equal(r.errors.length, 1);
});

const calcOk = { vars: { a: [1, 3, 1] }, given: 'a = [[a]]', solution: 'a*2', unit: 'x' };

test('calc-Karte mit gültiger Aufgabe bleibt', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, examMode: 'calc', calc: calcOk }] });
  assert.equal(r.cards.length, 1);
});

test('calc-Karte ohne oder mit kaputter Aufgabe wird verworfen', () => {
  const r = validateData({ meta, units, cards: [
    { ...ok, id: 'A', examMode: 'calc' },
    { ...ok, id: 'B', examMode: 'calc', calc: { ...calcOk, solution: 'a*b' } },
  ] });
  assert.equal(r.cards.length, 0);
  assert.equal(r.errors.length, 2);
});

test('kaputtes calc an Nicht-calc-Karte wird entfernt (Warnung)', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, calc: { ...calcOk, given: '' } }] });
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].calc, undefined);
  assert.equal(r.warnings.length, 1);
});

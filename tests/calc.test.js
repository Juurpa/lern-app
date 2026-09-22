import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, drawVars, formatNumber, fill, parseNumber, checkAnswer, prepareCalc, checkCalcSpec } from '../js/calc.js';

test('evaluate: Rangfolge, Klammern, Potenz rechtsassoziativ, unäres Minus', () => {
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2^-1'), 0.5);
  assert.equal(evaluate('10/4'), 2.5);
  assert.equal(evaluate('1.5e3'), 1500);
});

test('evaluate: Variablen, Konstanten, Funktionen', () => {
  assert.equal(evaluate('VT*f/1000', { VT: 500, f: 12 }), 6);
  assert.ok(Math.abs(evaluate('pi') - Math.PI) < 1e-12);
  assert.equal(evaluate('sqrt(16)+ln(exp(2))+log10(100)+abs(-1)'), 9);
  assert.equal(evaluate('e', { e: 5 }), 5);
});

test('evaluate: Fehler bei unbekannten Namen und Syntaxfehlern', () => {
  assert.throws(() => evaluate('x+1'), /Unbekannte Variable x/);
  assert.throws(() => evaluate('foo(1)'), /Unbekannte Funktion foo/);
  assert.throws(() => evaluate('2+'), /Erwartet/);
  assert.throws(() => evaluate('2 3'), /Unerwartet/);
  assert.throws(() => evaluate('2;3'), /Unerwartetes Zeichen/);
});

test('drawVars bleibt im Raster und ist mit rng deterministisch', () => {
  const spec = { a: [400, 700, 50], b: [0.5, 1.5, 0.1] };
  assert.deepEqual(drawVars(spec, () => 0), { a: 400, b: 0.5 });
  assert.deepEqual(drawVars(spec, () => 0.9999), { a: 700, b: 1.5 });
  for (let i = 0; i < 200; i++) {
    const v = drawVars(spec);
    assert.ok(v.a >= 400 && v.a <= 700 && v.a % 50 === 0);
    assert.ok(v.b >= 0.5 && v.b <= 1.5 && Math.abs(v.b * 10 - Math.round(v.b * 10)) < 1e-9);
  }
});

test('formatNumber und fill', () => {
  assert.equal(formatNumber(1.23456), '1,235');
  assert.equal(formatNumber(3800), '3800');
  assert.equal(formatNumber(0.000123456), '0,0001235');
  assert.equal(fill('V = [[VT]] ml, AMV = [[= VT*f/1000]] l/min, $\\frac{a}{b}$', { VT: 500, f: 12 }), 'V = 500 ml, AMV = 6 l/min, $\\frac{a}{b}$');
  assert.equal(fill('[[unbekannt]]', {}), '[[unbekannt]]');
});

test('parseNumber und checkAnswer', () => {
  assert.equal(parseNumber('1,5'), 1.5);
  assert.equal(parseNumber(' 2.25 '), 2.25);
  assert.equal(parseNumber('-3e2'), -300);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.deepEqual(checkAnswer('6,1', 6), { ok: true, value: 6.1 });
  assert.deepEqual(checkAnswer('6,2', 6), { ok: false, value: 6.2 });
  assert.equal(checkAnswer('0', 0).ok, true);
  assert.equal(checkAnswer('x', 6).ok, false);
});

const calc = {
  vars: { VT: [400, 700, 50], f: [10, 20, 1] },
  given: 'VT = [[VT]] ml, f = [[f]] /min',
  solution: 'VT*f/1000',
  unit: 'l/min',
  steps: ['[[VT]] · [[f]] = [[= VT*f]] ml/min'],
  example: { vars: { VT: 500, f: 12 }, result: 6 },
};

test('prepareCalc liefert konsistente Aufgabe', () => {
  const t = prepareCalc(calc, () => 0);
  assert.deepEqual(t.vars, { VT: 400, f: 10 });
  assert.equal(t.expected, 4);
  assert.equal(t.given, 'VT = 400 ml, f = 10 /min');
  assert.deepEqual(t.steps, ['400 · 10 = 4000 ml/min']);
  assert.equal(t.unit, 'l/min');
  assert.equal(t.tolerance, 0.02);
});

test('checkCalcSpec erkennt kaputte Aufgaben', () => {
  assert.deepEqual(checkCalcSpec(calc), []);
  assert.ok(checkCalcSpec({ ...calc, vars: { VT: [1, 2] } }).length > 0);
  assert.ok(checkCalcSpec({ ...calc, solution: 'VT*g' }).length > 0);
  assert.ok(checkCalcSpec({ ...calc, given: '' }).length > 0);
  assert.ok(checkCalcSpec({ ...calc, solution: 'VT/(f-f)' }).length > 0);
  assert.ok(checkCalcSpec({ ...calc, example: { vars: { VT: 500, f: 12 }, result: 7 } }).length > 0);
});

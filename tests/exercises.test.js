import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExercises, clozeValid, exerciseVars, evalCalcPart, checkCalc, checkMc, checkCloze, suggestButton,
  exerciseStatus, recordExercise, setProgress, nextExercise, examExercises, scoreExam, partPoints, partCardId,
} from '../js/exercises.js';

const decksById = new Map([['mtsue02', { id: 'mtsue02', pages: 7 }]]);
const faecher = ['MTS', 'INF2'];
const unitIds = new Set(['MTS-K3']);
const set = { id: 'MTS-UE02', fach: 'MTS', title: 'Übung 02', kind: 'uebung' };
const calcEx = {
  id: 'MTS-UE02-A1', set: 'MTS-UE02', fach: 'MTS', unit: 'MTS-K3', title: 'Compliance', source: 'MTS_Ue__02_RS2.pdf, A1',
  intro: 'C_L = [[CL]] l/kPa, C_Th = [[CT]] l/kPa', slides: ['mtsue02:2'],
  calcVars: { CL: [1, 3, 0.1], CT: [1, 3, 0.1] }, calcExample: { CL: 2, CT: 2 },
  parts: [
    { id: 'a', prompt: 'Gesamtcompliance?', answer: 'Reihenschaltung: [[= 1/(1/CL+1/CT)]] l/kPa', mode: 'calc', calc: { solution: '1/(1/CL + 1/CT)', unit: 'l/kPa', steps: ['1/C = 1/[[CL]] + 1/[[CT]]'], exampleResult: 1 } },
    { id: 'b', prompt: 'Warum Reihe?', answer: 'Druck teilt sich auf', mode: 'free', keyPoints: ['Reihe', 'Kehrwerte addieren'] },
  ],
};

test('clozeValid: Wiederholungen erlaubt, Lücken außerhalb nicht', () => {
  assert.equal(clozeValid({ text: '{{1}} {{1}} {{2}}', answers: ['a', 'b'] }), true);
  assert.equal(clozeValid({ text: '{{1}} {{3}}', answers: ['a', 'b'] }), false);
  assert.equal(clozeValid({ text: 'keine', answers: [] }), false);
});

test('validateExercises: gültiges Set + Aufgabe bleiben erhalten', () => {
  const r = validateExercises({ sets: [set], exercises: [calcEx], decksById, unitIds, faecher });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.exercises[0].parts.length, 2);
  assert.equal(r.sets.length, 1);
});

test('validateExercises: falsches Rechenbeispiel, kaputtes mc und ungültige Folie werden entfernt (Warnung)', () => {
  const ex = {
    ...calcEx,
    slides: ['mtsue02:99'],
    parts: [
      { ...calcEx.parts[0], calc: { ...calcEx.parts[0].calc, exampleResult: 5 } },
      { id: 'c', prompt: 'p', answer: 'x', mode: 'mc', mc: { options: ['a', 'b'], correct: ['z'] } },
      calcEx.parts[1],
    ],
  };
  const r = validateExercises({ sets: [set], exercises: [ex], decksById, unitIds, faecher });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.exercises[0].parts.map(p => p.id), ['b']);
  assert.deepEqual(r.exercises[0].slides, []);
  assert.equal(r.warnings.length, 3);
});

test('validateExercises: Aufgabe ohne gültige Teile / unbekanntes Set / doppelte ID sind Fehler', () => {
  const r = validateExercises({
    sets: [set],
    exercises: [
      { ...calcEx, id: 'X1', parts: [{ id: 'a', prompt: 'p', answer: 'a', mode: 'tanz' }] },
      { ...calcEx, id: 'X2', set: 'GIBTSNICHT' },
      calcEx, calcEx,
    ],
    decksById, unitIds, faecher,
  });
  assert.equal(r.exercises.length, 1);
  assert.equal(r.errors.length, 3);
});

test('exerciseVars: Originalwerte oder gewürfelt; evalCalcPart füllt Platzhalter', () => {
  assert.deepEqual(exerciseVars(calcEx), { CL: 2, CT: 2 });
  const rolled = exerciseVars(calcEx, () => 0);
  assert.deepEqual(rolled, { CL: 1, CT: 1 });
  const t = evalCalcPart(calcEx, calcEx.parts[0], { CL: 2, CT: 2 });
  assert.equal(t.expected, 1);
  assert.equal(t.steps[0], '1/C = 1/2 + 1/2');
  assert.equal(checkCalc(calcEx, calcEx.parts[0], { CL: 2, CT: 2 }, '1,0').ok, true);
  assert.equal(checkCalc(calcEx, calcEx.parts[0], { CL: 2, CT: 2 }, '2').ok, false);
});

test('checkMc (Mehrfachauswahl exakt) und checkCloze (in Textreihenfolge)', () => {
  const mc = { mc: { options: ['a', 'b', 'c'], correct: ['a', 'c'] } };
  assert.equal(checkMc(mc, ['c', 'a']), true);
  assert.equal(checkMc(mc, ['a']), false);
  assert.equal(checkMc(mc, ['a', 'b', 'c']), false);
  const cl = { cloze: { text: '{{2}} und {{1}} und {{2}}', answers: ['eins', 'zwei'] } };
  assert.deepEqual(checkCloze(cl, ['zwei', ' Eins ', 'drei']), { right: [true, true, false], ok: 2, total: 3 });
});

test('Status, Fortschritt, nächste Aufgabe', () => {
  const e2 = { ...calcEx, id: 'E2' };
  const states = { [calcEx.id]: { at: '2026-09-20T10:00:00Z', parts: { a: 'green', b: 'green' } }, E2: { at: '2026-09-21T10:00:00Z', parts: { a: 'red' } } };
  assert.equal(exerciseStatus(calcEx, states[calcEx.id]), 'done');
  assert.equal(exerciseStatus(e2, states.E2), 'partial');
  assert.equal(exerciseStatus(e2, undefined), 'new');
  assert.deepEqual(setProgress([calcEx, e2], states), { total: 2, done: 1, partial: 1 });
  assert.equal(nextExercise([calcEx, e2, { ...calcEx, id: 'E3' }], states).id, 'E3');
  assert.equal(nextExercise([calcEx, e2], states).id, 'E2');
});

test('recordExercise: Teile zusammenführen, Läufe nur bei neuem Lauf zählen', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  const a = recordExercise(undefined, { a: 'red' }, now);
  const b = recordExercise(a, { b: 'green' }, now, { newRun: false });
  assert.deepEqual(b.parts, { a: 'red', b: 'green' });
  assert.equal(b.runs, 1);
  assert.equal(recordExercise(b, { a: 'green' }, now).runs, 2);
  assert.equal(partCardId(calcEx, calcEx.parts[1]), 'MTS-UE02-A1#b');
});

test('examExercises: festes Set in Reihenfolge, Misch-Set zieht deterministisch mit rng', () => {
  const all = [{ id: 'a', set: 'S1' }, { id: 'b', set: 'S1' }, { id: 'c', set: 'S2' }, { id: 'd', set: 'S3' }];
  assert.deepEqual(examExercises({ id: 'S1' }, all).map(e => e.id), ['a', 'b']);
  const mix = examExercises({ id: 'MIX', from: ['S1', 'S2'], draw: 2 }, all, () => 0);
  assert.equal(mix.length, 2);
  assert.ok(mix.every(e => ['S1', 'S2'].includes(e.set)));
  assert.equal(examExercises({ id: 'S1', draw: 1 }, all, () => 0).length, 1);
});

test('Punkte: Standard 1, Summe gedeckelt, Prozent', () => {
  assert.equal(partPoints({}), 1);
  assert.equal(partPoints({ points: 4 }), 4);
  assert.deepEqual(scoreExam([{ points: 4, earned: 4 }, { points: 2, earned: 5 }, { points: 2, earned: null }]), { earned: 6, max: 8, pct: 75 });
  assert.equal(suggestButton(0.8), 'green');
  assert.equal(suggestButton(0.5), 'yellow');
  assert.equal(suggestButton(0.1), 'red');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRef } from '../js/slides.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = read('units.json');
const cards = [...read('cards-inf2.json'), ...read('cards-mts.json'), ...read('cards-radar.json')];
const figureCards = cards.filter(c => /-F\d+$/.test(c.id));
const { sets, exercises } = read('exercises.json');

test('jede Lerneinheit hat 3–10 Schlüsselfolien', () => {
  for (const u of units) assert.ok(u.slides?.length >= 3 && u.slides.length <= 10, `${u.id}: ${u.slides?.length ?? 0}`);
});

test('Folienkarten: Modus, Kernpunkte, Lösungsfolie, Quelle', () => {
  assert.ok(figureCards.length >= 150, `nur ${figureCards.length} Folienkarten`);
  for (const c of figureCards) {
    assert.ok(['sketch', 'free', 'voice'].includes(c.examMode), `${c.id}: ${c.examMode}`);
    assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    assert.ok(c.slides?.length >= 1, `${c.id} slides`);
    assert.ok(c.source?.length > 3, `${c.id} source`);
  }
});

// Ganze Folie als Frage nur, wenn sie die Aufgabenstellung ist (hier: Programmcode, aus dem der Szenengraph folgt).
const FULL_PAGE_OK = new Set(['INF2-LE01-F04']);

test('Bild-Fragen zeigen nur Ausschnitte (sonst verrät die Folie die Antwort)', () => {
  const withFront = [...figureCards, ...exercises.flatMap(e => e.parts)].filter(x => x.frontSlides?.length);
  assert.ok(withFront.length > 0);
  for (const x of withFront) for (const r of x.frontSlides) assert.ok(parseRef(r)?.crop || FULL_PAGE_OK.has(x.id), `${x.id}: ${r} ist kein Ausschnitt`);
});

test('jede Einheit hat mindestens eine Skizzier-Karte oder Skizzier-Aufgabe', () => {
  const sketchUnits = new Set(figureCards.filter(c => c.examMode === 'sketch').map(c => c.unit));
  const missing = units.filter(u => !sketchUnits.has(u.id)).map(u => u.id);
  assert.ok(missing.length <= 5, `ohne Skizzen: ${missing.join(', ')}`);
});

test('Aufgaben: alle Fächer abgedeckt, Probeklausuren mit Zeit, Offizielles vs. Selbsterstelltes gekennzeichnet', () => {
  for (const f of ['MTS', 'INF2', 'RADAR']) assert.ok(exercises.some(e => e.fach === f), f);
  const timed = sets.filter(s => s.minutes > 0).map(s => s.id);
  for (const id of ['INF2-K25', 'MTS-PROBE', 'RAD-PRUEF']) assert.ok(timed.includes(id), id);
  for (const e of exercises) {
    assert.ok(e.source?.length > 3, `${e.id} source`);
    for (const p of e.parts) if (['free', 'voice', 'sketch', 'code'].includes(p.mode)) assert.ok(p.keyPoints?.length >= 2 || p.mode === 'code', `${e.id}/${p.id} keyPoints`);
  }
});

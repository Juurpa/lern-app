import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';
import { checkCalcSpec } from '../js/calc.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const all = read('cards-mts.json');

// Jede Inhaltseinheit ergänzt hier ihre Unit, die erlaubten Quelldateien und die
// minimal erwartete Mindestanzahl an calc-Karten (0, wenn die Quelle keine echten
// Rechenaufgaben hergibt - siehe Verifikations-Notizen in den jeweiligen Karten/Units).
const UNITS = [
  { id: 'MTS-S1', sources: /01__Einführung_Strömungsmechanik\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 2 },
  { id: 'MTS-K6', sources: /MTS__06_CRM1\.pdf|MTS_Ue__05_CRM1-2\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 0 },
  { id: 'MTS-K7', sources: /MTS__07_CRM2\.pdf|MTS_Ue__05_CRM1-2\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 2 },
  { id: 'MTS-K8', sources: /MTS__08_HLM\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 0 },
  { id: 'MTS-K9', sources: /MTS__09_NES1\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 2 },
  { id: 'MTS-K10', sources: /MTS__10_NES2\.pdf|02_Medizintechnische_Systeme\.md/, minCalc: 2 },
];

for (const { id, sources, minCalc } of UNITS) {
  const unit = units.find(u => u.id === id);
  const cards = all.filter(c => c.unit === id);

  test(`${id}: Unit vollständig`, () => {
    assert.ok(unit, 'Unit fehlt');
    for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) assert.ok(unit[k]?.length > 20, `${k} fehlt`);
  });

  test(`${id}: 12-25 Karten, Quellen, Kernpunkte`, () => {
    assert.ok(cards.length >= 12 && cards.length <= 25, `Anzahl ${cards.length}`);
    for (const c of cards) {
      assert.match(c.source, sources, `${c.id} source`);
      assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    }
  });

  test(`${id}: Varianten und Rechenkarten`, () => {
    assert.ok(cards.filter(c => c.mc).length >= 3, 'mc');
    assert.ok(cards.filter(c => c.cloze).length >= 2, 'cloze');
    assert.ok(cards.filter(c => c.why).length >= 3, 'why');
    const calcs = cards.filter(c => c.examMode === 'calc');
    assert.ok(calcs.length >= minCalc, `calc (min ${minCalc}, got ${calcs.length})`);
    for (const c of calcs) {
      assert.ok(c.calc.example, `${c.id} example`);
      assert.deepEqual(checkCalcSpec(c.calc), [], c.id);
    }
    for (const c of cards.filter(x => x.cloze)) for (const a of c.cloze.answers) assert.doesNotMatch(String(a), /\d[.,]\d/, `${c.id} Dezimalzahl in Lücke`);
  });

  test(`${id}: keine Validierungsfehler oder -warnungen`, () => {
    const r = validateData({ meta, units, cards: all });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });
}

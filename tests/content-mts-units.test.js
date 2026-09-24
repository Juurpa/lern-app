import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';
import { checkCalcSpec } from '../js/calc.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const all = read('cards-mts.json');

// Jede Inhaltsaufgabe ergänzt hier ihre Unit und die erlaubten Quelldateien.
const UNITS = [
  { id: 'MTS-K3', sources: /MTS__03_RS2\.pdf|MTS_Ue__02_RS2\.pdf|02_Medizintechnische_Systeme\.md/ },
  { id: 'MTS-K4', sources: /MTS__04_RS3\.pdf|MTS_Ue__03_RS3\.pdf|02_Medizintechnische_Systeme\.md/ },
  { id: 'MTS-K5', sources: /MTS__05_RS4\.pdf|MTS_Ue__04_RS4\.pdf|Lsg_RS4\.pdf|02_Medizintechnische_Systeme\.md/ },
];

for (const { id, sources } of UNITS) {
  const unit = units.find(u => u.id === id);
  const cards = all.filter(c => c.unit === id && !/-F\d+$/.test(c.id));

  test(`${id}: Unit vollständig`, () => {
    assert.ok(unit, 'Unit fehlt');
    for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) assert.ok(unit[k]?.length > 20, `${k} fehlt`);
  });

  test(`${id}: 15–20 Karten, Quellen, Kernpunkte`, () => {
    assert.ok(cards.length >= 15 && cards.length <= 20, `Anzahl ${cards.length}`);
    for (const c of cards) {
      assert.match(c.source, sources, `${c.id} source`);
      assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    }
  });

  test(`${id}: Varianten und Rechenkarten`, () => {
    assert.ok(cards.filter(c => c.mc).length >= 5, 'mc');
    assert.ok(cards.filter(c => c.cloze).length >= 5, 'cloze');
    assert.ok(cards.filter(c => c.why).length >= 5, 'why');
    const calcs = cards.filter(c => c.examMode === 'calc');
    assert.ok(calcs.length >= 2, 'calc');
    for (const c of calcs) {
      assert.ok(c.calc.example, `${c.id} example`);
      assert.deepEqual(checkCalcSpec(c.calc), [], c.id);
    }
    for (const c of cards.filter(x => x.cloze)) for (const a of c.cloze.answers) assert.doesNotMatch(String(a), /\d[.,]\d/, `${c.id} Dezimalzahl in Lücke`);
  });

  test(`${id}: keine Validierungsfehler oder -warnungen`, () => {
    const r = validateData({ meta, units, cards });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });
}

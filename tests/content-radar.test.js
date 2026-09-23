import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';
import { checkCalcSpec } from '../js/calc.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const all = read('cards-radar.json');

const UNITS = [
  { id: 'RAD-S1', sources: /Lecture_RadarSystems_Lec\.pdf|skript_physik_2_emf\.pdf|04_Radartechnik\.md|Fraunhofer/ },
  { id: 'RAD-S2', sources: /Lecture_RadarSystems_Lec\.pdf|04_Radartechnik\.md/ },
  { id: 'RAD-S3', sources: /Lecture_RadarSystems_Lec\.pdf|Radar_FMCW_Diskussion\.md|Anforderung\.txt|04_Radartechnik\.md/ },
  { id: 'RAD-S4', sources: /Lecture_RadarSystems_Lec\.pdf|04_Radartechnik\.md/ },
  { id: 'RAD-S5', sources: /Lecture_RadarSystems_Lec\.pdf|04_Radartechnik\.md/ },
];

for (const { id, sources } of UNITS) {
  const unit = units.find(u => u.id === id);
  const cards = all.filter(c => c.unit === id);

  test(`${id}: Unit vollständig, Fach RADAR`, () => {
    assert.ok(unit, 'Unit fehlt');
    assert.equal(unit.fach, 'RADAR');
    for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) assert.ok(unit[k]?.length > 20, `${k} fehlt`);
  });

  test(`${id}: 12-30 Karten, alle examMode voice/calc, Quellen, Kernpunkte`, () => {
    assert.ok(cards.length >= 12 && cards.length <= 30, `Anzahl ${cards.length}`);
    for (const c of cards) {
      assert.equal(c.fach, 'RADAR', `${c.id} fach`);
      assert.ok(['voice', 'calc'].includes(c.examMode), `${c.id} examMode`);
      assert.match(c.source, sources, `${c.id} source`);
      assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    }
  });

  test(`${id}: Varianten und ggf. Rechenkarten`, () => {
    assert.ok(cards.filter(c => c.mc).length >= 3, 'mc');
    assert.ok(cards.filter(c => c.cloze).length >= 2, 'cloze');
    assert.ok(cards.filter(c => c.why).length >= 3, 'why');
    const calcs = cards.filter(c => c.examMode === 'calc');
    for (const c of calcs) {
      assert.ok(c.calc.example, `${c.id} example`);
      assert.deepEqual(checkCalcSpec(c.calc), [], c.id);
    }
    for (const c of cards.filter(x => x.cloze)) for (const a of c.cloze.answers) assert.doesNotMatch(String(a), /\d[.,]\d/, `${c.id} Dezimalzahl in Lücke`);
  });
}

test('RADAR gesamt: alle 5 Stationen vorhanden, keine Validierungsfehler/-warnungen', () => {
  assert.equal(units.filter(u => u.fach === 'RADAR').length, 5);
  const r = validateData({ meta, units, cards: all });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

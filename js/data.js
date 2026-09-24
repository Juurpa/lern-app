import { checkCalcSpec } from './calc.js';
import { cleanRefs } from './slides.js';
import { clozeValid, validateExercises } from './exercises.js';

export const EXAM_MODES = ['free', 'voice', 'code', 'calc', 'sketch'];

export const DATA_FILES = {
  meta: 'data/meta.json',
  units: 'data/units.json',
  cards: ['data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json'],
  bridges: 'data/bridges.json',
  synthesis: 'data/synthesis.json',
  decks: 'data/decks.json',
  exercises: 'data/exercises.json',
};

const CARD_REQUIRED = ['id', 'fach', 'unit', 'front', 'back', 'examMode'];
const UNIT_REQUIRED = ['id', 'fach', 'order', 'title'];

function checkSlides(obj, id, decksById, warnings) {
  if (!decksById) return;
  for (const k of ['slides', 'frontSlides']) {
    if (obj[k] === undefined) continue;
    const r = cleanRefs(obj[k], decksById);
    r.problems.forEach(p => warnings.push(`${id}: ${p}`));
    obj[k] = r.ok;
  }
}

function checkCard(c, unitIds, faecher, decksById) {
  const id = c.id ?? '?';
  const errors = [];
  const warnings = [];
  for (const k of CARD_REQUIRED) if (!c[k]) errors.push(`${id}: Feld '${k}' fehlt`);
  if (c.fach && !faecher.includes(c.fach)) errors.push(`${id}: unbekanntes Fach ${c.fach}`);
  if (c.unit && !unitIds.has(c.unit)) errors.push(`${id}: unbekannte Unit ${c.unit}`);
  if (c.examMode && !EXAM_MODES.includes(c.examMode)) errors.push(`${id}: ungültiger examMode ${c.examMode}`);
  if (c.examMode === 'code' && !c.code?.solution) errors.push(`${id}: code.solution fehlt`);
  if (c.examMode === 'calc' && !c.calc) errors.push(`${id}: calc fehlt`);

  const card = { ...c };
  if (card.mc && !(Array.isArray(card.mc.options) && card.mc.options.includes(card.mc.correct))) {
    warnings.push(`${id}: mc.correct nicht in options – MC entfernt`);
    delete card.mc;
  }
  if (card.cloze && !clozeValid(card.cloze)) {
    warnings.push(`${id}: Lückenzahl ≠ answers – Lückentext entfernt`);
    delete card.cloze;
  }
  if (card.calc) {
    const problems = checkCalcSpec(card.calc);
    if (problems.length) {
      if (card.examMode === 'calc') errors.push(...problems.map(p => `${id}: ${p}`));
      else { warnings.push(`${id}: ${problems[0]} – Rechenaufgabe entfernt`); delete card.calc; }
    }
  }
  checkSlides(card, id, decksById, warnings);
  if (card.examMode === 'sketch' && decksById && !card.slides?.length) errors.push(`${id}: Skizzier-Karte ohne Lösungsfolie`);
  return { card, errors, warnings };
}

export function validateData({ meta, units, cards, decks, exercises }) {
  const errors = [];
  const warnings = [];
  const faecher = Object.keys(meta.faecher);
  const decksById = Array.isArray(decks) ? new Map(decks.map(d => [d.id, d])) : null;

  const validUnits = [];
  for (const u of units) {
    const missing = UNIT_REQUIRED.filter(k => u[k] === undefined || u[k] === '');
    if (missing.length) { errors.push(`Unit ${u.id ?? '?'}: ${missing.join(', ')} fehlt`); continue; }
    const unit = { ...u };
    checkSlides(unit, `Unit ${u.id}`, decksById, warnings);
    validUnits.push(unit);
  }
  validUnits.sort((a, b) => a.order - b.order);
  const unitIds = new Set(validUnits.map(u => u.id));

  const seen = new Set();
  const valid = [];
  for (const c of cards) {
    const r = checkCard(c, unitIds, faecher, decksById);
    if (c.id && seen.has(c.id)) r.errors.push(`${c.id}: doppelte ID`);
    if (c.id) seen.add(c.id);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (!r.errors.length) valid.push(r.card);
  }

  const ex = validateExercises({ sets: exercises?.sets ?? [], exercises: exercises?.exercises ?? [], decksById, unitIds, faecher });
  errors.push(...ex.errors);
  warnings.push(...ex.warnings);

  return { cards: valid, units: validUnits, decks: decks ?? [], sets: ex.sets, exercises: ex.exercises, errors, warnings };
}

export async function loadData(fetchJson) {
  const optional = p => fetchJson(p).catch(() => null);
  const [meta, units, bridges, synthesis, version, decks, exercises, ...cardLists] = await Promise.all([
    fetchJson(DATA_FILES.meta),
    fetchJson(DATA_FILES.units),
    fetchJson(DATA_FILES.bridges),
    fetchJson(DATA_FILES.synthesis),
    fetchJson('data/version.json').catch(() => ({ version: '0', changed: [] })),
    optional(DATA_FILES.decks),
    optional(DATA_FILES.exercises),
    ...DATA_FILES.cards.map(fetchJson),
  ]);
  const r = validateData({ meta, units, cards: cardLists.flat(), decks: decks ?? [], exercises: exercises ?? { sets: [], exercises: [] } });
  return { meta, bridges, synthesis, version, ...r };
}

export const EXAM_MODES = ['free', 'voice', 'code', 'calc'];

export const DATA_FILES = {
  meta: 'data/meta.json',
  units: 'data/units.json',
  cards: ['data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json'],
  bridges: 'data/bridges.json',
  synthesis: 'data/synthesis.json',
};

const CARD_REQUIRED = ['id', 'fach', 'unit', 'front', 'back', 'examMode'];
const UNIT_REQUIRED = ['id', 'fach', 'order', 'title'];

function checkCard(c, unitIds, faecher) {
  const id = c.id ?? '?';
  const errors = [];
  const warnings = [];
  for (const k of CARD_REQUIRED) if (!c[k]) errors.push(`${id}: Feld '${k}' fehlt`);
  if (c.fach && !faecher.includes(c.fach)) errors.push(`${id}: unbekanntes Fach ${c.fach}`);
  if (c.unit && !unitIds.has(c.unit)) errors.push(`${id}: unbekannte Unit ${c.unit}`);
  if (c.examMode && !EXAM_MODES.includes(c.examMode)) errors.push(`${id}: ungültiger examMode ${c.examMode}`);
  if (c.examMode === 'code' && !c.code?.solution) errors.push(`${id}: code.solution fehlt`);

  const card = { ...c };
  if (card.mc && !(Array.isArray(card.mc.options) && card.mc.options.includes(card.mc.correct))) {
    warnings.push(`${id}: mc.correct nicht in options – MC entfernt`);
    delete card.mc;
  }
  if (card.cloze) {
    const gaps = (card.cloze.text?.match(/\{\{\d+\}\}/g) ?? []).length;
    if (gaps === 0 || gaps !== card.cloze.answers?.length) {
      warnings.push(`${id}: Lückenzahl ≠ answers – Lückentext entfernt`);
      delete card.cloze;
    }
  }
  return { card, errors, warnings };
}

export function validateData({ meta, units, cards }) {
  const errors = [];
  const warnings = [];
  const faecher = Object.keys(meta.faecher);

  const validUnits = [];
  for (const u of units) {
    const missing = UNIT_REQUIRED.filter(k => u[k] === undefined || u[k] === '');
    if (missing.length) errors.push(`Unit ${u.id ?? '?'}: ${missing.join(', ')} fehlt`);
    else validUnits.push(u);
  }
  validUnits.sort((a, b) => a.order - b.order);
  const unitIds = new Set(validUnits.map(u => u.id));

  const seen = new Set();
  const valid = [];
  for (const c of cards) {
    const r = checkCard(c, unitIds, faecher);
    if (c.id && seen.has(c.id)) r.errors.push(`${c.id}: doppelte ID`);
    if (c.id) seen.add(c.id);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (!r.errors.length) valid.push(r.card);
  }
  return { cards: valid, units: validUnits, errors, warnings };
}

export async function loadData(fetchJson) {
  const [meta, units, bridges, synthesis, ...cardLists] = await Promise.all([
    fetchJson(DATA_FILES.meta),
    fetchJson(DATA_FILES.units),
    fetchJson(DATA_FILES.bridges),
    fetchJson(DATA_FILES.synthesis),
    ...DATA_FILES.cards.map(fetchJson),
  ]);
  const r = validateData({ meta, units, cards: cardLists.flat() });
  return { meta, bridges, synthesis, ...r };
}

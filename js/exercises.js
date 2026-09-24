// Aufgaben-Modus (Übungsblätter, Praktika, Klausuren, Prüfungsfragen): Validierung, gemeinsame
// Rechenvariablen je Aufgabe, automatische Prüfung (calc/mc/cloze), Fortschritt, Probeklausur-Ziehung.
import { checkCalcSpec, evaluate, drawVars, fill, checkAnswer } from './calc.js';
import { cleanRefs } from './slides.js';

export const PART_MODES = ['free', 'calc', 'sketch', 'code', 'voice', 'mc', 'cloze'];
export const SET_KINDS = ['uebung', 'praktikum', 'klausur', 'pruefung'];
export const SELF_GRADED = ['free', 'sketch', 'code', 'voice'];

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// Lückentext gültig, wenn die Menge der verwendeten Platzhalter genau 1..n ist (Wiederholungen erlaubt).
export function clozeValid(cloze) {
  const nums = [...String(cloze?.text ?? '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  const n = Array.isArray(cloze?.answers) ? cloze.answers.length : 0;
  const uniq = new Set(nums);
  return nums.length > 0 && uniq.size === n && [...uniq].every(i => i >= 1 && i <= n);
}

export function partCalcSpec(ex, part) {
  return {
    vars: ex.calcVars ?? {},
    given: part.calc?.given || part.prompt || '–',
    solution: part.calc?.solution,
    unit: part.calc?.unit,
    steps: part.calc?.steps,
    ...(Number.isFinite(part.calc?.exampleResult) ? { example: { vars: ex.calcExample ?? {}, result: part.calc.exampleResult } } : {}),
  };
}

function checkPart(ex, part, decksById, warn) {
  const where = `${ex.id}/${part?.id ?? '?'}`;
  if (!part?.id || !part.prompt || !part.answer) return warn(`${where}: id/prompt/answer fehlt – Teil entfernt`), null;
  if (!PART_MODES.includes(part.mode)) return warn(`${where}: unbekannter Modus '${part.mode}' – Teil entfernt`), null;
  const p = { ...part };
  if (p.mode === 'calc') {
    if (!isObj(ex.calcVars) || !isObj(ex.calcExample) || !p.calc?.solution) return warn(`${where}: calc ohne calcVars/calcExample/solution – Teil entfernt`), null;
    const problems = checkCalcSpec(partCalcSpec(ex, p));
    if (problems.length) return warn(`${where}: ${problems.join('; ')} – Teil entfernt`), null;
  }
  if (p.mode === 'mc') {
    const o = p.mc?.options, c = p.mc?.correct;
    if (!Array.isArray(o) || o.length < 2 || !Array.isArray(c) || !c.length || !c.every(x => o.includes(x))) return warn(`${where}: mc.correct nicht in options – Teil entfernt`), null;
  }
  if (p.mode === 'cloze' && !clozeValid(p.cloze)) return warn(`${where}: Lückenzahl ≠ answers – Teil entfernt`), null;
  if (decksById) {
    for (const k of ['slides', 'frontSlides']) {
      if (p[k] === undefined) continue;
      const r = cleanRefs(p[k], decksById);
      r.problems.forEach(x => warn(`${where}: ${x}`));
      p[k] = r.ok;
    }
  }
  return p;
}

export function validateExercises({ sets = [], exercises = [], decksById, unitIds, faecher }) {
  const errors = [];
  const warnings = [];
  const warn = m => warnings.push(m);
  const setIds = new Set();
  const validSets = [];
  for (const s of sets) {
    if (!s?.id || !s.title || !faecher.includes(s.fach) || !SET_KINDS.includes(s.kind)) { errors.push(`Set ${s?.id ?? '?'}: id/title/fach/kind ungültig`); continue; }
    if (setIds.has(s.id)) { errors.push(`Set ${s.id}: doppelte ID`); continue; }
    setIds.add(s.id);
    validSets.push(s);
  }
  for (const s of validSets) {
    if (s.from && (!Array.isArray(s.from) || !s.from.every(id => setIds.has(id)))) { errors.push(`Set ${s.id}: from verweist auf unbekannte Sets`); s.from = undefined; }
  }

  const seen = new Set();
  const valid = [];
  for (const ex of exercises) {
    const id = ex?.id ?? '?';
    if (!ex?.id || !ex.title || !setIds.has(ex.set) || !faecher.includes(ex.fach) || !Array.isArray(ex.parts)) { errors.push(`Aufgabe ${id}: id/title/set/fach/parts ungültig`); continue; }
    if (seen.has(ex.id)) { errors.push(`Aufgabe ${id}: doppelte ID`); continue; }
    seen.add(ex.id);
    const e = { ...ex };
    if (e.unit && unitIds && !unitIds.has(e.unit)) { warn(`Aufgabe ${id}: unbekannte Unit ${e.unit}`); delete e.unit; }
    if (decksById && e.slides !== undefined) {
      const r = cleanRefs(e.slides, decksById);
      r.problems.forEach(x => warn(`Aufgabe ${id}: ${x}`));
      e.slides = r.ok;
    }
    e.parts = e.parts.map(p => checkPart(e, p, decksById, warn)).filter(Boolean);
    if (!e.parts.length) { errors.push(`Aufgabe ${id}: keine gültigen Teilaufgaben`); continue; }
    valid.push(e);
  }
  const used = new Set(valid.map(e => e.set));
  const sets2 = validSets.filter(s => used.has(s.id) || s.from?.length);
  return { sets: sets2, exercises: valid, errors, warnings };
}

// Originalwerte der Aufgabe (ohne rng) oder neu gewürfelte Werte.
export function exerciseVars(ex, rng) {
  if (!isObj(ex.calcVars)) return {};
  return rng ? drawVars(ex.calcVars, rng) : { ...(ex.calcExample ?? {}) };
}

export const fillText = (text, vars) => fill(text ?? '', vars ?? {});

export function evalCalcPart(ex, part, vars) {
  return {
    expected: evaluate(part.calc.solution, vars),
    given: fill(part.calc.given ?? '', vars),
    steps: (part.calc.steps ?? []).map(s => fill(s, vars)),
    unit: part.calc.unit ?? '',
    tolerance: part.calc.tolerance ?? 0.02,
  };
}

export function checkCalc(ex, part, vars, input) {
  const t = evalCalcPart(ex, part, vars);
  return { ...checkAnswer(input, t.expected, t.tolerance), expected: t.expected };
}

export function checkMc(part, selected) {
  const want = new Set(part.mc.correct);
  const got = new Set(selected);
  return want.size === got.size && [...want].every(x => got.has(x));
}

// values: Eingaben in der Reihenfolge der Platzhalter im Text.
export function checkCloze(part, values) {
  const idx = [...part.cloze.text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]) - 1);
  const right = idx.map((i, k) => norm(values[k]) === norm(part.cloze.answers[i]));
  return { right, ok: right.filter(Boolean).length, total: idx.length };
}

export const suggestButton = ratio => (ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'yellow' : 'red');
export const partPoints = part => (Number.isFinite(part.points) && part.points > 0 ? part.points : 1);
export const BUTTON_SHARE = { green: 1, yellow: 0.5, red: 0 };

export function exerciseStatus(ex, state) {
  if (!state?.parts) return 'new';
  const b = ex.parts.map(p => state.parts[p.id]);
  if (b.every(x => x === 'green')) return 'done';
  return b.some(Boolean) ? 'partial' : 'new';
}

export function recordExercise(prev, partButtons, now, { newRun = true } = {}) {
  const parts = { ...(prev?.parts ?? {}), ...partButtons };
  return { at: now.toISOString(), parts, runs: (prev?.runs ?? 0) + (newRun ? 1 : 0) };
}

export const partCardId = (ex, part) => `${ex.id}#${part.id}`;

export function setProgress(exs, states) {
  const s = exs.map(e => exerciseStatus(e, states[e.id]));
  return { total: exs.length, done: s.filter(x => x === 'done').length, partial: s.filter(x => x === 'partial').length };
}

// Nächste sinnvolle Aufgabe: zuerst neue, dann solche mit Lücken, dann die am längsten nicht geübte.
export function nextExercise(exs, states) {
  const fresh = exs.find(e => exerciseStatus(e, states[e.id]) === 'new');
  if (fresh) return fresh;
  const weak = exs.filter(e => Object.values(states[e.id]?.parts ?? {}).some(b => b !== 'green'));
  const pool = weak.length ? weak : exs;
  return [...pool].sort((a, b) => String(states[a.id]?.at ?? '').localeCompare(String(states[b.id]?.at ?? '')))[0] ?? null;
}

export function examExercises(set, allExercises, rng = Math.random) {
  if (set.from?.length && set.draw > 0) {
    const pool = allExercises.filter(e => set.from.includes(e.set));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, set.draw);
  }
  const own = allExercises.filter(e => e.set === set.id);
  if (set.draw > 0 && set.draw < own.length) {
    const pool = [...own];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, set.draw);
  }
  return own;
}

export function scoreExam(entries) {
  const max = entries.reduce((s, e) => s + e.points, 0);
  const earned = entries.reduce((s, e) => s + Math.min(e.points, Math.max(0, e.earned ?? 0)), 0);
  return { earned, max, pct: max ? Math.round((earned / max) * 100) : 0 };
}

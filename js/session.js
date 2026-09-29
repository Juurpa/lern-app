import { isDue } from './scheduler.js';
import { openGaps } from './gaps.js';

const DAY = 86400000;

const examDay = (examDate, offset = 0) => { const [y, m, d] = examDate.split('-').map(Number); return new Date(y, m - 1, d + offset); };

function daysUntil(examDate, now) {
  return (examDay(examDate) - now) / DAY;
}

// Ein Fach ist erledigt, sobald sein Prüfungstag (lokal) vorbei ist.
export const examFinished = (examDate, now) => now >= examDay(examDate, 1);

// Kalendertage von heute bis zum Prüfungstag (0 = heute Prüfung).
export function calendarDaysUntil(examDate, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((examDay(examDate) - today) / DAY);
}

export const examLabel = (exam, now) => {
  if (examFinished(exam, now)) return 'Prüfung vorbei';
  const n = calendarDaysUntil(exam, now);
  return n === 0 ? 'heute Prüfung' : `noch ${n} ${n === 1 ? 'Tag' : 'Tage'}`;
};

// Neue Karten gelten pro 15-min-Session (bis „Weiter“), nicht pro Queue-Aufbau.
export const sessionNewLimit = (settings, shownNew) => Math.max(0, (settings.newPerSession ?? 0) - shownNew);

// Nötiges Tempo: verbleibende neue Karten auf die Tage bis zum Vortag der Prüfung verteilen.
export function newPerDayNeeded(freshCount, examDate, now) {
  if (!freshCount || examFinished(examDate, now)) return 0;
  return Math.ceil(freshCount / Math.max(1, calendarDaysUntil(examDate, now) - 1));
}

export function allocate(counts, weights, total) {
  const slots = Object.fromEntries(Object.keys(counts).map(f => [f, 0]));
  for (let i = 0; i < total; i++) {
    let best = null;
    for (const f of Object.keys(counts)) {
      if (slots[f] >= counts[f]) continue;
      const score = (weights[f] ?? 0) / (slots[f] + 1);
      if (best === null || score > (weights[best] ?? 0) / (slots[best] + 1)) best = f;
    }
    if (best === null) break;
    slots[best]++;
  }
  return slots;
}

// `head` sind bereits gesetzte Einträge, die unverändert am Anfang bleiben (zählen für den Lauf mit).
export function interleave(items, maxRun = 3, head = []) {
  const rest = [...items];
  const out = [...head];
  while (rest.length) {
    const n = out.length;
    const last = out[n - 1]?.fach;
    const blocked = n >= maxRun && out.slice(n - maxRun).every(x => x.fach === last) ? last : null;
    let i = blocked ? rest.findIndex(x => x.fach !== blocked) : 0;
    if (i === -1) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wiederholer gleichmäßig zwischen die neuen Karten streuen (jeder in seinem Abschnitt, nie am Anfang der Liste stapeln).
export function weave(fresh, reps) {
  if (!reps.length) return [...fresh];
  const total = fresh.length + reps.length;
  const step = total / reps.length;
  const at = new Set(reps.map((_, k) => Math.floor((k + 0.5) * step)));
  const f = [...fresh];
  const r = [...reps];
  return Array.from({ length: total }, (_, i) => (at.has(i) ? r.shift() : f.shift()));
}

export function fachWeights(meta, doc, cards, now) {
  const open = openGaps(doc.gaps);
  const w = {};
  for (const [f, info] of Object.entries(meta.faecher)) {
    const seen = cards.filter(c => c.fach === f && doc.cards[c.id]).length;
    const gapCount = open.filter(g => g.fach === f).length;
    w[f] = (1 / Math.max(1, daysUntil(info.exam, now))) * (1 + gapCount / Math.max(1, seen));
  }
  return w;
}

const groupBy = (list, key) => list.reduce((acc, x) => ((acc[x[key]] ??= []).push(x), acc), {});
const countsOf = groups => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));

// Dringlichkeit eines Fachs: hohes Neu-Tempo bzw. kurz vor der Prüfung noch Offenes → 'high'.
const URGENCY_HIGH = 80;
const URGENCY_MID = 30;
export function urgencyOf({ pace, due, fresh, finished }, exam, now) {
  if (finished) return 'done';
  if (calendarDaysUntil(exam, now) <= 2 && due + fresh > 0) return 'high';
  return pace >= URGENCY_HIGH ? 'high' : pace >= URGENCY_MID ? 'mid' : 'low';
}

// Kennzahlen eines Fachs für Start- und Fach-Seite: fällige/neue Karten, offene Lücken, Tempo bis zur Prüfung.
// prio/prioPace: dasselbe nur für die als wichtig markierten (priority) neuen Karten.
export function fachStats({ cards, doc, fach, exam, now }) {
  const own = cards.filter(c => c.fach === fach);
  const fresh = own.filter(c => !doc.cards[c.id]).length;
  const prio = own.filter(c => c.priority && !doc.cards[c.id]).length;
  const s = {
    due: own.filter(c => isDue(doc.cards[c.id], now)).length,
    fresh,
    gaps: openGaps(doc.gaps).filter(g => g.fach === fach).length,
    pace: newPerDayNeeded(fresh, exam, now),
    prio,
    prioTotal: own.filter(c => c.priority).length,
    prioPace: newPerDayNeeded(prio, exam, now),
    finished: examFinished(exam, now),
  };
  return { ...s, urgency: urgencyOf(s, exam, now) };
}

// Zeit-Budget: grobe Schätzung, wie lange n Karten dauern.
export const SECONDS_PER_CARD = 30;
export const estimateMinutes = n => Math.ceil((n * SECONDS_PER_CARD) / 60);

export const dayKey = now => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Wie viele verschiedene Karten wurden heute (lokaler Kalendertag) bewertet?
export function reviewedToday(cards, doc, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return cards.filter(c => { const last = doc.cards[c.id]?.fsrs.last_review; return last && new Date(last) >= start; }).length;
}

// Fach-Schlüssel aus der URL (z. B. "mts" → "MTS"); unbekannt/leer → null = alle Fächer mischen.
export const resolveFach = (meta, raw) => Object.keys(meta.faecher).find(k => k.toLowerCase() === String(raw ?? '').trim().toLowerCase()) ?? null;

// Fokus-Modi der Lern-Session: nur Fälliges, nur Neues, nur Wichtiges (priority) oder nur offene Lücken.
export const ONLY_MODES = ['due', 'new', 'prio', 'gaps'];
export const ONLY_LABEL = { due: 'fällige Karten', new: 'neue Karten', prio: '★ Wichtiges', gaps: 'Lücken' };
export const resolveOnly = raw => (ONLY_MODES.includes(raw) ? raw : null);

// Muster einer Session: die ersten Karten sind garantiert neu, dazwischen kommen ein paar Wiederholer
// (ca. 1 je 3 neue). Neue wie fällige Karten werden gezogen, nicht stur nach Fälligkeit/Reihenfolge abgearbeitet.
export const LEAD_FRESH = 3;
const REPEAT_PER_FRESH = 3;
const MIN_REPEATERS = 2;

export function buildSession({ cards, units, doc, meta, now, size = 30, newLimit = 10, exclude = new Set(), fach = null, only = null, rng = Math.random }) {
  const unitById = new Map(units.map(u => [u.id, u]));
  const gapIds = new Set(openGaps(doc.gaps).map(g => g.cardId));
  const pool = cards.filter(c => (!fach || c.fach === fach) && !exclude.has(c.id) && !examFinished(meta.faecher[c.fach].exam, now)
    && (only !== 'prio' || c.priority) && (only !== 'gaps' || gapIds.has(c.id)));
  const weights = fachWeights(meta, doc, cards, now);

  // Neu-/Prio-Modus ist eine bewusste Wahl: das 15-min-Neukarten-Limit gilt dort nicht.
  if (only === 'new' || only === 'prio') newLimit = size;
  // Lücken-Modus übt offene Lücken auch vor dem Fälligkeitstermin.
  const isDueHere = c => (only === 'gaps' ? Boolean(doc.cards[c.id]) : isDue(doc.cards[c.id], now));
  const due = only === 'new' ? [] : pool.filter(isDueHere);

  const order = c => unitById.get(c.unit)?.order ?? Infinity;
  const fresh = only === 'due' || only === 'gaps' ? [] : pool.filter(c => !doc.cards[c.id])
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || order(a) - order(b));

  // Anzahl: erst die neuen Karten festlegen, Wiederholer sind nur die Beilage; ohne Neues füllen Wiederholer die Session.
  const wantFresh = Math.min(newLimit, fresh.length, size);
  const nDue = wantFresh > 0
    ? Math.min(due.length, Math.max(MIN_REPEATERS, Math.ceil(wantFresh / REPEAT_PER_FRESH)), Math.floor(size / 3))
    : Math.min(due.length, size);
  const nFresh = Math.min(wantFresh, size - nDue);

  // Fächer nach Gewicht verteilen; Wiederholer zufällig (offene Lücken zuerst), Neues zufällig aus einem Fenster vorn (Wichtiges zuerst).
  const dueGroups = groupBy(due, 'fach');
  const dueAlloc = allocate(countsOf(dueGroups), weights, nDue);
  const pickDue = (list, n) => {
    const s = shuffle(list, rng);
    return [...s.filter(c => gapIds.has(c.id)), ...s.filter(c => !gapIds.has(c.id))].slice(0, n);
  };
  const dueCards = Object.entries(dueAlloc).flatMap(([f, n]) => pickDue(dueGroups[f], n));

  const freshGroups = groupBy(fresh, 'fach');
  const freshAlloc = allocate(countsOf(freshGroups), weights, nFresh);
  const pickFresh = (list, n) => {
    const s = shuffle(list.slice(0, Math.max(2 * n, n + 4)), rng);
    return [...s.filter(c => c.priority), ...s.filter(c => !c.priority)].slice(0, n);
  };
  const freshCards = Object.entries(freshAlloc).flatMap(([f, n]) => pickFresh(freshGroups[f], n));

  const maxRun = meta.maxRun ?? 3;
  const freshSeq = interleave(shuffle(freshCards, rng), maxRun);
  const lead = freshSeq.slice(0, LEAD_FRESH);
  const seq = interleave(weave(freshSeq.slice(LEAD_FRESH), shuffle(dueCards, rng)), maxRun, lead);
  const items = [];
  const introduced = new Set();
  for (const c of seq) {
    const u = unitById.get(c.unit);
    if (!doc.cards[c.id] && u?.kern && !doc.units[u.id]?.seen && !introduced.has(u.id)) {
      items.push({ type: 'unit', unitId: u.id, fach: c.fach });
      introduced.add(u.id);
    }
    items.push({ type: 'card', cardId: c.id, fach: c.fach });
  }
  return items;
}

// Jede Karte muss in einer Session zweimal in Folge richtig beantwortet werden.
export const NEED_CORRECT = 2;
const AGAIN_GAP = [4, 8];

// Die Karte kommt noch einmal: falsch → ganz ans Ende (`retry`); richtig, aber noch nicht oft genug → 4–8 Karten später,
// nie sofort. Bereits Gezeigtes (bis `pos`) bleibt unberührt, pro Karte steht nie mehr als ein Eintrag in der Queue.
export function scheduleAgain(queue, pos, item, { wrong, rng = Math.random, gap = AGAIN_GAP }) {
  const rest = queue.slice(pos).filter(x => !(x.type === 'card' && x.cardId === item.cardId));
  const head = queue.slice(0, pos);
  if (wrong) return [...head, ...rest, { ...item, retry: true }];
  const [lo, hi] = gap;
  const at = Math.min(rest.length, lo + Math.floor(rng() * (hi - lo + 1)));
  return [...head, ...rest.slice(0, at), { ...item, retry: false }, ...rest.slice(at)];
}

// Segmente des Fortschrittsbalkens einer Runde: je beantworteter Frage grün/rot ('g'/'r'), dahinter die noch nötigen
// richtigen Antworten (leer; das erste ist die aktuelle Frage 'cur'). Falsche Antworten verlängern den Balken.
export function barSegments({ history, current = null, queue, pos, got, need = NEED_CORRECT }) {
  const owed = item => (item?.type === 'card' ? Math.max(1, need - (got.get(item.cardId) ?? 0)) : 0);
  const pending = owed(current) + queue.slice(pos).reduce((n, x) => n + owed(x), 0);
  const segs = [...history, ...Array(pending).fill('')];
  if (pending) segs[history.length] = 'cur';
  return segs;
}

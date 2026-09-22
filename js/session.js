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

export function interleave(items, maxRun = 3) {
  const rest = [...items];
  const out = [];
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

export function buildSession({ cards, units, doc, meta, now, size = 30, newLimit = 10, exclude = new Set() }) {
  const unitById = new Map(units.map(u => [u.id, u]));
  const pool = cards.filter(c => !exclude.has(c.id) && !examFinished(meta.faecher[c.fach].exam, now));
  const weights = fachWeights(meta, doc, cards, now);
  const dueAt = c => new Date(doc.cards[c.id].fsrs.due);

  const due = pool.filter(c => isDue(doc.cards[c.id], now)).sort((a, b) => dueAt(a) - dueAt(b));
  const dueGroups = groupBy(due, 'fach');
  const dueAlloc = allocate(countsOf(dueGroups), weights, size);
  const dueCards = Object.entries(dueAlloc).flatMap(([f, n]) => dueGroups[f].slice(0, n)).sort((a, b) => dueAt(a) - dueAt(b));

  const order = c => unitById.get(c.unit)?.order ?? Infinity;
  const fresh = pool.filter(c => !doc.cards[c.id])
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || order(a) - order(b));
  const freshGroups = groupBy(fresh, 'fach');
  const freshAlloc = allocate(countsOf(freshGroups), weights, Math.max(0, Math.min(newLimit, size - dueCards.length)));
  const freshCards = Object.entries(freshAlloc).flatMap(([f, n]) => freshGroups[f].slice(0, n));

  const seq = interleave([...dueCards, ...freshCards], meta.maxRun ?? 3);
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

export function insertRelearn(queue, pos, item, gap = 5) {
  const out = [...queue];
  out.splice(Math.min(pos + gap, out.length), 0, item);
  return out;
}

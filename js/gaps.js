const DAY = 86400000;
const dayStart = iso => { const x = new Date(iso); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
const fmt = iso => { const x = new Date(iso); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.`; };

export function addGap(gaps, card, now) {
  const open = gaps.find(g => g.cardId === card.id && !g.closed);
  if (open) return gaps.map(g => (g === open ? { ...g, hits: [] } : g));
  return [...gaps, { cardId: card.id, fach: card.fach, front: card.front, added: now.toISOString(), hits: [], closed: null }];
}

export function recordCorrect(gaps, cardId, now) {
  return gaps.map(g => {
    if (g.cardId !== cardId || g.closed) return g;
    const ref = g.hits.at(-1) ?? g.added;
    if (daysBetween(ref, now) < 1) return g;
    const hits = [...g.hits, now.toISOString()];
    return { ...g, hits, closed: hits.length >= 2 ? now.toISOString() : null };
  });
}

export const openGaps = gaps => gaps.filter(g => !g.closed);

const cell = s => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim().slice(0, 140);

export function toMarkdown(gaps, meta) {
  const parts = ['# Lückenliste (Export Lern-App)', ''];
  for (const [fach, info] of Object.entries(meta.faecher)) {
    parts.push(`## ${info.label}`, '', '| Datum | Lücke | ✅ 1. | ✅ 2. |', '|---|---|---|---|');
    for (const g of gaps.filter(x => x.fach === fach)) {
      parts.push(`| ${fmt(g.added)} | ${cell(g.front)} | ${g.hits[0] ? fmt(g.hits[0]) : ''} | ${g.hits[1] ? fmt(g.hits[1]) : ''} |`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

import { h, esc, md, enhance, download } from '../render.js';
import { openGaps, toMarkdown } from '../gaps.js';
import { resolveFach } from '../session.js';

export function renderGaps({ data, store, root }, params) {
  const doc = store.load();
  const f = resolveFach(data.meta, params?.get('fach'));
  const scoped = list => (f ? list.filter(g => g.fach === f) : list);
  const open = scoped(openGaps(doc.gaps));
  const closed = scoped(doc.gaps.filter(g => g.closed));
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const front = g => cardById.get(g.cardId)?.front ?? g.front;
  const block = k => {
    const list = open.filter(g => g.fach === k);
    if (!list.length) return '';
    return `<h2>${esc(data.meta.faecher[k].label)}</h2>` + list.map(g =>
      `<div class="panel"><div class="kicker"><span>${new Date(g.added).toLocaleDateString('de-DE')}</span><span>${g.hits.length}/2 ✅</span></div>${md(front(g))}</div>`).join('');
  };
  const fachQuery = f ? `?fach=${encodeURIComponent(f)}&amp;only=gaps` : '?only=gaps';
  const el = h(`<section>
    <h1>Lücken${f ? ` ${esc(data.meta.faecher[f].short)}` : ''} (${open.length} offen)</h1>
    <div class="row">${open.length ? `<a class="btn primary" href="#/learn${fachQuery}">▶ Lücken üben</a>` : ''}${f ? '<a class="btn" href="#/gaps">Alle Fächer</a>' : ''}</div>
    ${Object.keys(data.meta.faecher).map(block).join('') || '<p class="muted">Keine offenen Lücken.</p>'}
    <p class="muted">${closed.length} geschlossen.</p>
    <div class="row"><button id="copy">📋 Markdown kopieren</button><button id="dl">⬇️ Als LUECKEN.md laden</button></div>
  </section>`);
  const text = toMarkdown(scoped(doc.gaps), data.meta);
  el.querySelector('#copy').onclick = e => navigator.clipboard.writeText(text).then(() => { e.target.textContent = 'Kopiert ✓'; });
  el.querySelector('#dl').onclick = () => download('LUECKEN.md', text, 'text/markdown');
  root.append(el);
  enhance(el);
}

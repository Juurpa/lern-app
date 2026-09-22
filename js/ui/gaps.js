import { h, esc, md, enhance, download } from '../render.js';
import { openGaps, toMarkdown } from '../gaps.js';

export function renderGaps({ data, store, root }) {
  const doc = store.load();
  const open = openGaps(doc.gaps);
  const closed = doc.gaps.filter(g => g.closed);
  const block = f => {
    const list = open.filter(g => g.fach === f);
    if (!list.length) return '';
    return `<h2>${esc(data.meta.faecher[f].label)}</h2>` + list.map(g =>
      `<div class="panel"><div class="kicker"><span>${new Date(g.added).toLocaleDateString('de-DE')}</span><span>${g.hits.length}/2 ✅</span></div>${md(g.front)}</div>`).join('');
  };
  const el = h(`<section>
    <h1>Lücken (${open.length} offen)</h1>
    ${Object.keys(data.meta.faecher).map(block).join('') || '<p class="muted">Keine offenen Lücken.</p>'}
    <p class="muted">${closed.length} geschlossen.</p>
    <div class="row"><button id="copy">Markdown kopieren</button><button id="dl">Als LUECKEN.md laden</button></div>
    <nav class="bottom"><a class="btn" href="#/">Zurück</a></nav>
  </section>`);
  const text = toMarkdown(doc.gaps, data.meta);
  el.querySelector('#copy').onclick = e => navigator.clipboard.writeText(text).then(() => { e.target.textContent = 'Kopiert ✓'; });
  el.querySelector('#dl').onclick = () => download('LUECKEN.md', text, 'text/markdown');
  root.append(el);
  enhance(el);
}

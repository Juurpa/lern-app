import { h, esc } from '../render.js';
import { isDue } from '../scheduler.js';
import { openGaps } from '../gaps.js';

const DAY = 86400000;
const daysLeft = (exam, now) => { const [y, m, d] = exam.split('-').map(Number); return Math.ceil((new Date(y, m - 1, d) - now) / DAY); };

export function renderStart({ data, store, root }) {
  const doc = store.load();
  const now = new Date();
  const gaps = openGaps(doc.gaps);
  const rows = Object.entries(data.meta.faecher).map(([f, info]) => {
    const cards = data.cards.filter(c => c.fach === f);
    const due = cards.filter(c => isDue(doc.cards[c.id], now)).length;
    const fresh = cards.filter(c => !doc.cards[c.id]).length;
    const g = gaps.filter(x => x.fach === f).length;
    return `<div class="panel"><div class="kicker"><span class="badge">${esc(info.short)}</span><span>noch ${daysLeft(info.exam, now)} Tage</span></div>
      <div class="stats"><div><b>${due}</b>fällig</div><div><b>${fresh}</b>neu</div><div><b>${g}</b>Lücken</div></div></div>`;
  }).join('');
  const warn = data.errors.length ? `<div class="warn">${data.errors.length} Karten fehlerhaft und ausgeblendet – siehe Einstellungen.</div>` : '';
  root.append(h(`<section>
    <h1>Klausurtraining</h1>${warn}
    <a class="btn primary big" href="#/learn">Lernen</a>
    <h2>Stand</h2>${rows}
    <nav class="bottom"><a class="btn" href="#/gaps">Lücken</a><a class="btn" href="#/settings">Einstellungen</a></nav>
  </section>`));
}

import { h, md, enhance, esc, isHttpUrl } from '../render.js';
import { slideStrip, openViewer, decksForUnit } from './slides.js';
import { pageRef } from '../slides.js';

const SECTIONS = [['kern', 'Der Kern'], ['unterDerHaube', 'Unter der Haube'], ['analogie', 'Die Analogie'], ['fehler', 'Der Fehler']];

export function renderUnit(root, unit, fachLabel, onDone, sctx, decks = []) {
  // Progressive Disclosure: nur der erste Abschnitt ist offen, der Rest lässt sich einzeln aufklappen
  // statt alles auf einmal zu zeigen.
  const present = SECTIONS.filter(([k]) => unit[k]);
  const body = present.map(([k, t], i) => `<details class="topic-section"${i === 0 ? ' open' : ''}>
    <summary><span class="chev">▸</span><span>${t}</span></summary>
    <div class="topic-body">${md(unit[k])}</div>
  </details>`).join('');
  const videos = (unit.videos ?? []).filter(v => isHttpUrl(v.url)).map(v =>
    `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>${v.verified ? '' : ' <span class="muted">(Suche)</span>'}</li>`).join('');
  const ownDecks = sctx ? decksForUnit(unit.id, decks) : [];
  const hasSource = Boolean((sctx && unit.slides?.length) || ownDecks.length);
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>Neue Lerneinheit</span></div>
    <h1>${esc(unit.title)}</h1>
    ${body}
    ${videos ? `<h3>Videos</h3><ul>${videos}</ul>` : ''}
    ${hasSource ? `<details class="topic-section source-section"><summary><span class="chev">▸</span><span>🔍 Quelle nachlesen</span></summary>
      <div class="topic-body"><div class="key-slides"></div>
      ${ownDecks.length ? `<div class="row deck-links">${ownDecks.map(d => `<button type="button" data-deck="${esc(d.id)}">📄 ${esc(d.title)}</button>`).join('')}</div>` : ''}
      </div></details>` : ''}
    <button class="primary big" id="go">Verstanden – zur Abfrage</button>
  </article>`);
  if (sctx && unit.slides?.length) el.querySelector('.key-slides').append(slideStrip(unit.slides, sctx, { title: '📄 Schlüsselfolien' }));
  el.querySelectorAll('[data-deck]').forEach(b => { b.onclick = () => openViewer(pageRef(b.dataset.deck, 1), sctx); });
  el.querySelector('#go').onclick = onDone;
  root.replaceChildren(el);
  enhance(el);
}

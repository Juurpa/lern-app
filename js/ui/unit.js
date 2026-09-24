import { h, md, enhance, esc, isHttpUrl } from '../render.js';
import { slideStrip, openViewer, decksForUnit } from './slides.js';
import { pageRef } from '../slides.js';

const SECTIONS = [['kern', 'Der Kern'], ['unterDerHaube', 'Unter der Haube'], ['analogie', 'Die Analogie'], ['fehler', 'Der Fehler']];

export function renderUnit(root, unit, fachLabel, onDone, sctx, decks = []) {
  const body = SECTIONS.filter(([k]) => unit[k]).map(([k, t]) => `<h3>${t}</h3>${md(unit[k])}`).join('');
  const videos = (unit.videos ?? []).filter(v => isHttpUrl(v.url)).map(v =>
    `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>${v.verified ? '' : ' <span class="muted">(Suche)</span>'}</li>`).join('');
  const ownDecks = sctx ? decksForUnit(unit.id, decks) : [];
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>Neue Lerneinheit</span></div>
    <h1>${esc(unit.title)}</h1><div class="key-slides"></div>${body}
    ${videos ? `<h3>Videos</h3><ul>${videos}</ul>` : ''}
    ${ownDecks.length ? `<div class="row deck-links">${ownDecks.map(d => `<button type="button" data-deck="${esc(d.id)}">📄 ${esc(d.title)}</button>`).join('')}</div>` : ''}
    <button class="primary big" id="go">Verstanden – zur Abfrage</button>
  </article>`);
  if (sctx && unit.slides?.length) el.querySelector('.key-slides').append(slideStrip(unit.slides, sctx, { title: '📄 Schlüsselfolien' }));
  el.querySelectorAll('[data-deck]').forEach(b => { b.onclick = () => openViewer(pageRef(b.dataset.deck, 1), sctx); });
  el.querySelector('#go').onclick = onDone;
  root.replaceChildren(el);
  enhance(el);
}

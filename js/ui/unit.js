import { h, md, enhance, esc } from '../render.js';

const SECTIONS = [['kern', 'Der Kern'], ['unterDerHaube', 'Unter der Haube'], ['analogie', 'Die Analogie'], ['fehler', 'Der Fehler']];

export function renderUnit(root, unit, fachLabel, onDone) {
  const body = SECTIONS.filter(([k]) => unit[k]).map(([k, t]) => `<h3>${t}</h3>${md(unit[k])}`).join('');
  const videos = (unit.videos ?? []).map(v =>
    `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>${v.verified ? '' : ' <span class="muted">(Suche)</span>'}</li>`).join('');
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>Neue Lerneinheit</span></div>
    <h1>${esc(unit.title)}</h1>${body}
    ${videos ? `<h3>Videos</h3><ul>${videos}</ul>` : ''}
    <button class="primary big" id="go">Verstanden – zur Abfrage</button>
  </article>`);
  el.querySelector('#go').onclick = onDone;
  root.replaceChildren(el);
  enhance(el);
}

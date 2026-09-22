import { h } from '../render.js';
import { buildSession, insertRelearn, sessionNewLimit } from '../session.js';
import { review, chooseMode } from '../scheduler.js';
import { addGap, recordCorrect } from '../gaps.js';
import { renderCard } from './card.js';
import { renderUnit } from './unit.js';

export function renderLearn({ data, store, root }) {
  const doc = store.load();
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const unitById = new Map(data.units.map(u => [u.id, u]));
  const done = new Set();
  const stats = { red: 0, yellow: 0, green: 0 };
  let started = Date.now();
  let shownNew = 0; // neue Karten in der aktuellen 15-min-Session
  let queue = [];
  let pos = 0;

  const build = () => buildSession({
    cards: data.cards, units: data.units, doc, meta: data.meta, now: new Date(),
    newLimit: sessionNewLimit(doc.settings, shownNew), exclude: done,
  });

  function save() {
    try { store.save(doc); }
    catch { alert('Speichern fehlgeschlagen (Speicher voll?). Bitte in den Einstellungen exportieren.'); }
  }

  function end(empty = false) {
    const total = stats.red + stats.yellow + stats.green;
    const el = h(`<section class="card">
      <h1>${empty ? 'Alles erledigt 🎉' : 'Session-Pause'}</h1>
      <div class="stats"><div><b>${stats.green}</b>🟢</div><div><b>${stats.yellow}</b>🟡</div><div><b>${stats.red}</b>🔴</div></div>
      <p class="muted">${total} Karten in ${Math.round((Date.now() - started) / 60000)} min.</p>
      <div class="row">${empty ? '' : '<button class="primary" id="more">Weiter (15 min)</button>'}<a class="btn" href="#/">Schluss</a></div>
    </section>`);
    el.querySelector('#more')?.addEventListener('click', () => { started = Date.now(); shownNew = 0; next(); });
    root.replaceChildren(el);
  }

  function next() {
    if (Date.now() - started > data.meta.sessionMinutes * 60000) return end();
    if (pos >= queue.length) {
      queue = build();
      pos = 0;
      if (!queue.length) return end(true);
    }
    const item = queue[pos++];
    const fachLabel = data.meta.faecher[item.fach].short;
    if (item.type === 'unit') {
      return renderUnit(root, unitById.get(item.unitId), fachLabel, () => {
        doc.units[item.unitId] = { seen: true };
        save();
        next();
      });
    }
    const card = cardById.get(item.cardId);
    const exam = data.meta.faecher[card.fach].exam;
    const mode = chooseMode(card, doc.cards[card.id], new Date(), exam);
    renderCard(root, {
      card, mode, fachLabel,
      onRated: ({ button, hinted }) => {
        const now = new Date();
        if (!doc.cards[card.id]) shownNew++;
        doc.cards[card.id] = review(doc.cards[card.id], { button, mode, hinted }, now, exam);
        if (button === 'red') {
          doc.gaps = addGap(doc.gaps, card, now);
          queue = insertRelearn(queue, pos, { type: 'card', cardId: card.id, fach: card.fach }, data.meta.relearnGap);
        } else if (button === 'green') {
          doc.gaps = recordCorrect(doc.gaps, card.id, now);
        }
        done.add(card.id);
        stats[button]++;
        save();
        next();
      },
    });
    window.scrollTo(0, 0);
  }

  next();
}

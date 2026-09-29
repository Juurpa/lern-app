import { h, esc } from '../render.js';
import { buildSession, requeueWrong, sessionNewLimit, resolveFach, resolveOnly, ONLY_LABEL } from '../session.js';
import { review, chooseMode } from '../scheduler.js';
import { addGap, recordCorrect } from '../gaps.js';
import { makeReviewEvent } from '../sync.js';
import { renderCard } from './card.js';
import { renderUnit } from './unit.js';

export function renderLearn({ data, store, root, sync, tutorPrompt, slides, decksById }, params) {
  const sctx = slides ? { slides, decksById } : null;
  const doc = store.load();
  const fach = resolveFach(data.meta, params?.get('fach'));
  const fachInfo = fach ? data.meta.faecher[fach] : null;
  const only = resolveOnly(params?.get('only'));
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const unitById = new Map(data.units.map(u => [u.id, u]));
  const done = new Set();
  const stats = { red: 0, yellow: 0, green: 0 };
  const sessionId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  let started = Date.now();
  let shownNew = 0; // neue Karten in der aktuellen 15-min-Session
  let queue = [];
  let pos = 0;

  const timeUp = () => Date.now() - started > data.meta.sessionMinutes * 60000;

  // Nachladen berücksichtigt, was schon in der Queue wartet (nicht doppelt, Neu-Limit nur für noch nicht gezeigte Karten).
  const build = () => {
    const queued = queue.slice(pos).filter(i => i.type === 'card');
    const queuedNew = queued.filter(i => !doc.cards[i.cardId]).length;
    return buildSession({
      cards: data.cards, units: data.units, doc, meta: data.meta, now: new Date(),
      newLimit: Math.max(0, sessionNewLimit(doc.settings, shownNew) - queuedNew),
      exclude: new Set([...done, ...queued.map(i => i.cardId)]), fach, only,
    });
  };

  // Falsch beantwortet: ans Ende der Queue. Ist dort kaum noch etwas übrig, vorher neues Material nachladen,
  // damit die Karte nicht sofort wiederkommt.
  function requeue(card) {
    if (!timeUp() && queue.length - pos < data.meta.relearnGap) queue = [...queue, ...build()];
    queue = requeueWrong(queue, pos, { type: 'card', cardId: card.id, fach: card.fach });
  }

  function save() {
    try { store.save(doc); }
    catch { alert('Speichern fehlgeschlagen (Speicher voll?). Bitte in den Einstellungen exportieren.'); }
  }

  function end(empty = false) {
    const total = stats.red + stats.yellow + stats.green;
    const scope = [fachInfo?.short, only && ONLY_LABEL[only]].filter(Boolean).join(' · ');
    const widenHref = only ? `#/learn${fach ? `?fach=${encodeURIComponent(fach)}` : ''}` : fach ? '#/learn' : '';
    const widenLabel = only ? (fachInfo ? `Alle ${fachInfo.short}-Karten` : 'Alle Karten') : 'Alle Fächer';
    const el = h(`<section class="card">
      <h1>${empty ? `Alles erledigt${scope ? ` (${esc(scope)})` : ''} 🎉` : 'Session-Pause'}</h1>
      <div class="stats"><div><b>${stats.green}</b>🟢</div><div><b>${stats.yellow}</b>🟡</div><div><b>${stats.red}</b>🔴</div></div>
      <p class="muted">${total} Karten in ${Math.round((Date.now() - started) / 60000)} min.</p>
      <div class="row">${empty ? '' : '<button class="primary" id="more">Weiter (15 min)</button>'}${widenHref ? `<a class="btn" href="${widenHref}">${esc(widenLabel)}</a>` : ''}<a class="btn" href="#/">Schluss</a></div>
    </section>`);
    el.querySelector('#more')?.addEventListener('click', () => { started = Date.now(); shownNew = 0; next(); });
    root.replaceChildren(el);
  }

  function next() {
    if (timeUp()) {
      // Pause erst, wenn alle falsch beantworteten Karten einmal richtig waren; Übriges wird nächste Runde neu gezogen.
      const retries = queue.slice(pos).filter(i => i.retry);
      if (!retries.length) return end();
      queue = [...queue.slice(0, pos), ...retries];
    }
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
      }, sctx, data.decks);
    }
    const card = cardById.get(item.cardId);
    const exam = data.meta.faecher[card.fach].exam;
    const mode = chooseMode(card, doc.cards[card.id], new Date(), exam);
    renderCard(root, {
      card, mode, fachLabel, retry: Boolean(item.retry), settings: doc.settings, tutorPrompt, sctx,
      onRated: ({ button, hinted, answer, ms }) => {
        const now = new Date();
        if (!doc.cards[card.id]) shownNew++;
        doc.cards[card.id] = review(doc.cards[card.id], { button, mode, hinted }, now, exam);
        done.add(card.id);
        if (button === 'red') {
          doc.gaps = addGap(doc.gaps, card, now);
          requeue(card);
        } else if (button === 'green') {
          doc.gaps = recordCorrect(doc.gaps, card.id, now);
        }
        stats[button]++;
        save();
        sync?.push(makeReviewEvent({ card, button, mode, hinted, answer, ms, sessionId, now }));
        sync?.flush();
        next();
      },
    });
    window.scrollTo(0, 0);
  }

  next();
}

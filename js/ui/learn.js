import { h, esc, mdInline, enhance } from '../render.js';
import { buildSession, scheduleAgain, barSegments, NEED_CORRECT, sessionNewLimit, resolveFach, resolveOnly, ONLY_LABEL } from '../session.js';
import { review, chooseMode } from '../scheduler.js';
import { addGap, recordCorrect } from '../gaps.js';
import { makeReviewEvent } from '../sync.js';
import { renderCard } from './card.js';
import { renderUnit } from './unit.js';

const SEG = { g: 'g', y: 'y', r: 'r' };

// Lern-Session in Runden (~10 Karten). Jede Karte muss NEED_CORRECT-mal in Folge richtig beantwortet werden; falsch oder
// nur teilweise richtig → ans Rundenende und der Zähler beginnt neu, richtig aber noch nicht genug → einige Karten später wieder.
// Die Bewertung läuft automatisch (siehe card.js), der Fortschrittsbalken zeigt jede Antwort als grünes/rotes Segment.
export function renderLearn({ data, store, root, sync, tutorPrompt, slides, decksById }, params) {
  const sctx = slides ? { slides, decksById } : null;
  const doc = store.load();
  const fach = resolveFach(data.meta, params?.get('fach'));
  const fachInfo = fach ? data.meta.faecher[fach] : null;
  const only = resolveOnly(params?.get('only'));
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const unitById = new Map(data.units.map(u => [u.id, u]));
  const sessionId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  const roundSize = data.meta.roundSize ?? 10;

  const done = new Set(); // in dieser Session abgeschlossene Karten (NEED_CORRECT× richtig)
  const got = new Map(); // Karte → richtige Antworten in Folge
  const lastMode = new Map(); // Karte → zuletzt gefragtes Format (Wiederholung soll anders gefragt werden)
  const total = { g: 0, y: 0, r: 0, mastered: 0, rounds: 0 };
  let started = Date.now();
  let shownNew = 0; // neue Karten in der aktuellen 15-min-Session
  let queue = [];
  let pos = 0;
  let round = 0;
  let history = [];
  let missed = new Map(); // Karte → Fehlversuche in dieser Runde
  let roundStats = { g: 0, y: 0, r: 0, mastered: 0 };

  const timeUp = () => Date.now() - started > data.meta.sessionMinutes * 60000;

  const bar = h(`<div class="lprog"><div class="lbar" role="progressbar"></div><div class="lmeta"><span class="lround"></span><span class="lleft"></span></div></div>`);
  const stage = document.createElement('div');

  function drawBar(current) {
    const segs = barSegments({ history, current, queue, pos, got });
    const left = segs.filter(s => s === '' || s === 'cur').length;
    const lbar = bar.querySelector('.lbar');
    lbar.innerHTML = segs.map(s => `<i class="${SEG[s] ?? s}"></i>`).join('');
    lbar.setAttribute('aria-label', `Runde ${round}: ${history.length} von ${segs.length} Antworten, noch ${left}`);
    bar.querySelector('.lround').textContent = `Runde ${round}`;
    bar.querySelector('.lleft').textContent = left ? `noch ${left} ${left === 1 ? 'Antwort' : 'Antworten'}` : 'geschafft';
  }

  function save() {
    try { store.save(doc); }
    catch { alert('Speichern fehlgeschlagen (Speicher voll?). Bitte in den Einstellungen exportieren.'); }
  }

  const scopeLabel = () => [fachInfo?.short, only && ONLY_LABEL[only]].filter(Boolean).join(' · ');

  function summary({ empty }) {
    const answers = roundStats.g + roundStats.y + roundStats.r;
    const rate = answers ? Math.round((roundStats.g / answers) * 100) : 0;
    const widenHref = only ? `#/learn${fach ? `?fach=${encodeURIComponent(fach)}` : ''}` : fach ? '#/learn' : '';
    const widenLabel = only ? (fachInfo ? `Alle ${fachInfo.short}-Karten` : 'Alle Karten') : 'Alle Fächer';
    const scope = scopeLabel();
    const title = empty
      ? `Alles erledigt${scope ? ` (${esc(scope)})` : ''} 🎉`
      : `Runde ${round} geschafft 🎉`;
    const missedCards = [...missed].map(([id, n]) => ({ card: cardById.get(id), n }));
    const el = h(`<section class="card">
      <h1>${title}</h1>
      ${answers ? `<div class="stats"><div><b>${roundStats.mastered}</b>🎯 erledigt</div><div><b>${roundStats.g}</b>✅ richtig</div><div><b>${roundStats.y + roundStats.r}</b>❌ daneben</div></div>
      <p class="muted">${rate} % richtig in dieser Runde · ${total.mastered} Karten insgesamt erledigt · ${Math.max(1, Math.round((Date.now() - started) / 60000))} min</p>` : ''}
      ${missedCards.length ? `<h3>Hier hat es gehakt</h3><ul class="missed">${missedCards.map(({ card, n }) =>
        `<li><span class="miss-n">${n}×</span><span class="miss-q">${mdInline(card.front)}</span></li>`).join('')}</ul>` : ''}
      ${!empty && timeUp() ? `<p class="muted">${data.meta.sessionMinutes} Minuten sind um – kurze Pause?</p>` : ''}
      <div class="row">${empty ? '' : `<button class="primary" id="more">${timeUp() ? `Weiter (${data.meta.sessionMinutes} min)` : 'Nächste Runde'}</button>`}${widenHref && empty ? `<a class="btn" href="${widenHref}">${esc(widenLabel)}</a>` : ''}<a class="btn" href="#/">Schluss</a></div>
    </section>`);
    el.querySelector('#more')?.addEventListener('click', () => {
      if (timeUp()) { started = Date.now(); shownNew = 0; }
      startRound();
    });
    enhance(el);
    root.replaceChildren(el);
    window.scrollTo(0, 0);
  }

  function startRound() {
    queue = buildSession({
      cards: data.cards, units: data.units, doc, meta: data.meta, now: new Date(),
      size: roundSize, newLimit: sessionNewLimit(doc.settings, shownNew), exclude: done, fach, only,
    });
    pos = 0;
    if (!queue.length) {
      roundStats = { g: 0, y: 0, r: 0, mastered: 0 };
      missed = new Map();
      return summary({ empty: true });
    }
    round++;
    history = [];
    missed = new Map();
    roundStats = { g: 0, y: 0, r: 0, mastered: 0 };
    next();
  }

  function finishRound() {
    total.rounds++;
    summary({ empty: false });
  }

  function onRated(item, card, mode, exam, { button, hinted, answer, ms }) {
    const now = new Date();
    if (!doc.cards[card.id]) shownNew++;
    doc.cards[card.id] = review(doc.cards[card.id], { button, mode, hinted }, now, exam);
    lastMode.set(card.id, mode);
    const seg = button === 'green' ? 'g' : button === 'yellow' ? 'y' : 'r';
    history.push(seg);
    roundStats[seg]++; total[seg]++;
    let note;
    if (button === 'green') {
      doc.gaps = recordCorrect(doc.gaps, card.id, now);
      const n = (got.get(card.id) ?? 0) + 1;
      got.set(card.id, n);
      if (n >= NEED_CORRECT) {
        done.add(card.id);
        roundStats.mastered++; total.mastered++;
        note = `${NEED_CORRECT}× richtig – diese Karte ist für heute durch.`;
      } else {
        queue = scheduleAgain(queue, pos, { type: 'card', cardId: card.id, fach: card.fach }, { wrong: false });
        note = `Noch ${NEED_CORRECT - n}× richtig, dann ist sie durch – kommt gleich noch einmal.`;
      }
    } else {
      got.set(card.id, 0);
      if (button === 'red') doc.gaps = addGap(doc.gaps, card, now);
      missed.set(card.id, (missed.get(card.id) ?? 0) + 1);
      queue = scheduleAgain(queue, pos, { type: 'card', cardId: card.id, fach: card.fach }, { wrong: true });
      note = `Kommt am Ende der Runde wieder – dann ${NEED_CORRECT}× richtig.`;
    }
    save();
    sync?.push(makeReviewEvent({ card, button, mode, hinted, answer, ms, sessionId, now }));
    sync?.flush();
    drawBar(null);
    return note;
  }

  function next() {
    if (pos >= queue.length) return finishRound();
    if (bar.parentNode !== root) root.replaceChildren(bar, stage);
    const item = queue[pos++];
    const fachLabel = data.meta.faecher[item.fach].short;
    if (item.type === 'unit') {
      drawBar(null);
      renderUnit(stage, unitById.get(item.unitId), fachLabel, () => {
        doc.units[item.unitId] = { seen: true };
        save();
        next();
      }, sctx, data.decks);
    } else {
      const card = cardById.get(item.cardId);
      const exam = data.meta.faecher[card.fach].exam;
      const mode = chooseMode(card, doc.cards[card.id], new Date(), exam, lastMode.get(card.id));
      drawBar(item);
      renderCard(stage, {
        card, mode, fachLabel, retry: Boolean(item.retry), got: got.get(card.id) ?? 0, need: NEED_CORRECT,
        settings: doc.settings, tutorPrompt, sctx,
        onRated: result => onRated(item, card, mode, exam, result),
        onNext: next,
      });
    }
    window.scrollTo(0, 0);
  }

  startRound();
}

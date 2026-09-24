import { h, md, mdInline, enhance, esc } from '../render.js';
import { formatNumber } from '../calc.js';
import { grade, mapRatingToButton } from '../grader.js';
import { addGap, recordCorrect } from '../gaps.js';
import { makeReviewEvent } from '../sync.js';
import { getSpeechRecognitionCtor, createSpeechInput } from '../voice.js';
import {
  exerciseVars, fillText, evalCalcPart, checkCalc, checkMc, checkCloze, suggestButton,
  exerciseStatus, recordExercise, setProgress, partCardId, SELF_GRADED,
} from '../exercises.js';
import { ratingBar } from './card.js';
import { slideStrip, slideFigure } from './slides.js';

export const KIND = { uebung: 'Übung', praktikum: 'Praktikum', klausur: 'Klausur', pruefung: 'Prüfung' };
const ICON = { new: '○', partial: '◐', done: '✓' };
const KIND_ORDER = ['uebung', 'praktikum', 'klausur', 'pruefung'];

// ---------- Bausteine (auch von der Probeklausur genutzt) ----------

export function partInput(part, ex, vars) {
  const el = document.createElement('div');
  el.className = 'p-input';
  if (part.mode === 'calc') {
    const t = evalCalcPart(ex, part, vars);
    el.innerHTML = `${t.given ? md(t.given) : ''}<div class="row calc-row"><input type="text" inputmode="decimal" class="calc-input" placeholder="Ergebnis" autocomplete="off"><span class="calc-unit">${esc(t.unit)}</span></div>`;
    const input = el.querySelector('input');
    return { el, value: () => input.value, mark: ok => { input.disabled = true; input.classList.add(ok ? 'right' : 'wrong'); } };
  }
  if (part.mode === 'mc') {
    const multi = part.mc.multi ?? part.mc.correct.length > 1;
    const name = `mc-${ex.id}-${part.id}-${Math.floor(performance.now())}`;
    el.innerHTML = `<p class="muted">${multi ? 'Mehrere Antworten möglich.' : 'Genau eine Antwort.'}</p>${part.mc.options.map((o, i) =>
      `<label class="mc-opt"><input type="${multi ? 'checkbox' : 'radio'}" name="${esc(name)}" value="${i}"><span>${mdInline(o)}</span></label>`).join('')}`;
    const boxes = [...el.querySelectorAll('input')];
    return {
      el,
      value: () => boxes.filter(b => b.checked).map(b => part.mc.options[Number(b.value)]),
      mark: () => boxes.forEach(b => {
        b.disabled = true;
        const correct = part.mc.correct.includes(part.mc.options[Number(b.value)]);
        b.closest('label').classList.add(correct ? 'right' : b.checked ? 'wrong' : 'plain');
      }),
    };
  }
  if (part.mode === 'cloze') {
    const p = document.createElement('p');
    part.cloze.text.split(/(\{\{\d+\}\})/).forEach(s => {
      if (/^\{\{\d+\}\}$/.test(s)) p.append(h('<input type="text" class="cloze-input" autocomplete="off">'));
      else p.append(s);
    });
    el.append(p);
    const inputs = [...p.querySelectorAll('input')];
    return {
      el,
      value: () => inputs.map(i => i.value),
      mark: right => inputs.forEach((i, k) => { i.disabled = true; i.classList.add(right[k] ? 'right' : 'wrong'); }),
    };
  }
  if (part.mode === 'sketch') {
    el.innerHTML = '<p class="muted">✏️ Auf Papier skizzieren (mit Beschriftung), dann vergleichen.</p>';
    return { el, value: () => '(Skizze auf Papier)', mark: () => {} };
  }
  const ta = h(`<textarea${part.mode === 'code' ? ' class="mono" spellcheck="false"' : ''} placeholder="${part.mode === 'voice' ? 'Laut erklären und Stichpunkte tippen …' : part.mode === 'code' ? 'Code schreiben …' : 'Antwort …'}"></textarea>`);
  el.append(ta);
  const SR = part.mode === 'voice' ? getSpeechRecognitionCtor() : null;
  if (SR) {
    let speech = null, on = false;
    const mic = h('<button type="button" class="mic">🎙️ Sprechen</button>');
    mic.onclick = () => {
      if (on) { speech.stop(); return; }
      speech = createSpeechInput({
        SpeechRecognitionCtor: SR,
        onTranscript: live => { ta.value = live; },
        onEnd: () => { on = false; mic.textContent = '🎙️ Sprechen'; },
        onError: () => { on = false; mic.textContent = '🎙️ Sprechen'; },
      });
      speech.start(); on = true; mic.textContent = '⏹️ Stopp';
    };
    el.append(mic);
  }
  return { el, value: () => ta.value, mark: () => { ta.readOnly = true; } };
}

// Automatische Prüfung für calc/mc/cloze; null bei Selbstbewertung.
export function autoCheck(part, ex, vars, value, input) {
  if (part.mode === 'calc') {
    const r = checkCalc(ex, part, vars, value);
    input?.mark(r.ok);
    return { ratio: r.ok ? 1 : 0, html: `<div class="panel"><b>${r.ok ? '✅ Richtig' : '❌ Erwartet'}:</b> ${esc(formatNumber(r.expected))} ${esc(part.calc.unit ?? '')}</div>` };
  }
  if (part.mode === 'mc') {
    const ok = checkMc(part, value);
    input?.mark();
    return { ratio: ok ? 1 : 0, html: `<div class="panel"><b>${ok ? '✅ Richtig' : '❌ Richtig wäre'}:</b> ${part.mc.correct.map(mdInline).join(' · ')}</div>` };
  }
  if (part.mode === 'cloze') {
    const r = checkCloze(part, value);
    input?.mark(r.right);
    return { ratio: r.total ? r.ok / r.total : 0, html: `<div class="panel"><b>${r.ok}/${r.total} Lücken richtig.</b> ${part.cloze.answers.map(mdInline).join(' · ')}</div>` };
  }
  return null;
}

export function partSolution(part, ex, vars, sctx) {
  const el = document.createElement('div');
  el.className = 'solution';
  const steps = part.mode === 'calc' ? evalCalcPart(ex, part, vars).steps : [];
  el.innerHTML = `${steps.map(s => `<div class="panel">🧮 ${md(s)}</div>`).join('')}<h4>Lösung</h4>${md(fillText(part.answer, vars))}`;
  if (sctx && part.slides?.length) {
    if (part.mode === 'sketch') part.slides.forEach(r => el.append(slideFigure(r, sctx)));
    else el.append(slideStrip(part.slides, sctx));
  }
  return el;
}

function keyPointChecklist(part, onDone) {
  const list = h(`<div class="checklist"><h4>Kernpunkte – was hattest du?</h4>${part.keyPoints.map((k, i) =>
    `<label><input type="checkbox" data-i="${i}"><span>${md(k)}</span></label>`).join('')}</div>`);
  const done = h('<button class="primary">Auswerten</button>');
  done.onclick = () => { done.remove(); onDone(list.querySelectorAll('input:checked').length / part.keyPoints.length); };
  const wrap = document.createElement('div');
  wrap.append(list, done);
  return wrap;
}

function partHeader(part) {
  return `<div class="part-head"><b>${esc(part.id)})</b>${part.points ? ` <span class="muted">${esc(part.points)} P.</span>` : ''}</div>`;
}

function renderPrompt(part, vars, sctx) {
  const box = document.createElement('div');
  box.className = 'p-prompt';
  box.innerHTML = md(fillText(part.prompt, vars));
  if (sctx && part.frontSlides?.length) part.frontSlides.forEach(r => box.append(slideFigure(r, sctx, { browse: false, caption: false })));
  return box;
}

// ---------- Übungs-Teilaufgabe ----------

function practicePart(part, ex, vars, ctx, onRate) {
  const { sctx, settings, tutorPrompt } = ctx;
  const sec = h(`<section class="part">${partHeader(part)}</section>`);
  sec.append(renderPrompt(part, vars, sctx));
  const input = partInput(part, ex, vars);
  const actions = h('<div class="row p-actions"></div>');
  const result = h('<div class="p-result"></div>');
  const rate = h('<div class="p-rate"></div>');
  sec.append(input.el, actions, result, rate);
  const t0 = Date.now();

  const showRating = suggest => {
    rate.replaceChildren(ratingBar(suggest, button => {
      sec.classList.add('rated', `r-${button}`);
      onRate(part, button, String(input.value() ?? ''), Date.now() - t0);
    }));
  };
  const reveal = (auto, suggestOverride) => {
    actions.replaceChildren();
    if (auto) result.insertAdjacentHTML('beforeend', auto.html);
    result.append(partSolution(part, ex, vars, sctx));
    enhance(result);
    if (auto) return showRating(suggestOverride ?? suggestButton(auto.ratio));
    if (suggestOverride) return showRating(suggestOverride);
    if (part.keyPoints?.length) { result.append(keyPointChecklist(part, ratio => showRating(suggestButton(ratio)))); enhance(result); return; }
    showRating(null);
  };

  const check = h(`<button class="primary">${SELF_GRADED.includes(part.mode) ? 'Lösung zeigen' : 'Prüfen'}</button>`);
  check.onclick = () => {
    const auto = autoCheck(part, ex, vars, input.value(), input); // markiert calc/mc/cloze selbst
    if (!auto) input.mark();
    reveal(auto);
  };
  actions.append(check);

  if (settings?.geminiKey && (part.mode === 'free' || part.mode === 'voice')) {
    let attempt = 0;
    const ai = h('<button>🤖 Bewerten lassen</button>');
    ai.onclick = async () => {
      ai.disabled = true; ai.textContent = 'Bewerte …';
      attempt++;
      const pseudo = { fach: ex.fach, examMode: part.mode, front: fillText(part.prompt, vars), back: fillText(part.answer, vars), keyPoints: part.keyPoints };
      const r = await grade({ settings, card: pseudo, attempt, systemPrompt: tutorPrompt, userText: String(input.value() ?? '').trim() || undefined });
      if (r.source === 'self') { result.append(h(`<p class="muted">Gemini nicht verfügbar (${esc(r.error ?? '')}) – Selbstbewertung.</p>`)); ai.remove(); return; }
      const fb = h(`<div class="panel gemini-feedback"><p><b>Stärke:</b> ${md(r.result.staerke)}</p><p><b>${r.revealSolution ? 'Unscharfe Stelle' : 'Noch nicht ganz'}:</b> ${md(r.result.unscharfeStelle)}</p></div>`);
      result.replaceChildren(fb);
      enhance(result);
      if (!r.revealSolution) { ai.disabled = false; ai.textContent = '🤖 Nochmal bewerten'; return; }
      reveal(null, mapRatingToButton(r.result.vorschlagRating) ?? 'yellow');
    };
    actions.append(ai);
  }
  return sec;
}

// ---------- Seiten ----------

function exercisesOf(data, setId) {
  return data.exercises.filter(e => e.set === setId);
}

function renderOverview({ data, store, root }) {
  const doc = store.load();
  const blocks = Object.entries(data.meta.faecher).map(([f, info]) => {
    const sets = data.sets.filter(s => s.fach === f && !s.from?.length).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    if (!sets.length) return '';
    return `<h2>${esc(info.label)}</h2>${sets.map(s => {
      const exs = exercisesOf(data, s.id);
      const p = setProgress(exs, doc.exercises);
      return `<a class="panel set-row" href="#/aufgaben?set=${encodeURIComponent(s.id)}">
        <div class="kicker"><span class="badge">${esc(KIND[s.kind] ?? s.kind)}</span><span>${p.done}/${p.total} ✓${p.partial ? ` · ${p.partial} ◐` : ''}</span></div>
        <b>${esc(s.title)}</b>${s.minutes ? ` <span class="muted">· ⏱ ${esc(s.minutes)} min</span>` : ''}</a>`;
    }).join('')}`;
  }).join('');
  root.append(h(`<section><h1>Aufgaben</h1>
    <p class="muted">Übungsblätter, Praktika, Klausur und Prüfungsfragen – Schritt für Schritt mit Lösung, Folien und Selbstbewertung. Rote Teilaufgaben landen in den Lücken.</p>
    ${blocks || '<p class="muted">Noch keine Aufgaben geladen.</p>'}
    <div class="row"><a class="btn" href="#/klausuren">⏱ Probeklausuren</a></div>
    <nav class="bottom"><a class="btn" href="#/">Zurück</a></nav></section>`));
}

function nextAfter(list, currentId, states) {
  const i = list.findIndex(e => e.id === currentId);
  const rest = [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))];
  return rest.find(e => exerciseStatus(e, states[e.id]) !== 'done') ?? null;
}

function renderSet({ data, store, root }, setId) {
  const set = data.sets.find(s => s.id === setId);
  if (!set) return root.append(h('<section><p>Aufgabenset nicht gefunden.</p><a class="btn" href="#/aufgaben">Zurück</a></section>'));
  const doc = store.load();
  const exs = exercisesOf(data, set.id);
  const next = exs.find(e => exerciseStatus(e, doc.exercises[e.id]) !== 'done') ?? exs[0];
  const unitTitle = id => data.units.find(u => u.id === id)?.title ?? '';
  root.append(h(`<section><h1>${esc(set.title)}</h1>
    <p class="muted">${esc(KIND[set.kind] ?? set.kind)}${set.note ? ` · ${esc(set.note)}` : ''}</p>
    <div class="row">${next ? `<a class="btn primary" href="#/aufgaben?id=${encodeURIComponent(next.id)}">▶ ${exerciseStatus(next, doc.exercises[next.id]) === 'new' ? 'Nächste Aufgabe' : 'Weiter üben'}</a>` : ''}${set.minutes ? `<a class="btn" href="#/klausur?set=${encodeURIComponent(set.id)}">⏱ Als Probeklausur (${esc(set.minutes)} min)</a>` : ''}</div>
    ${exs.map(e => {
      const st = exerciseStatus(e, doc.exercises[e.id]);
      const parts = doc.exercises[e.id]?.parts ?? {};
      const dots = e.parts.map(p => ({ green: '🟢', yellow: '🟡', red: '🔴' }[parts[p.id]] ?? '⚪')).join('');
      return `<a class="panel ex-row" href="#/aufgaben?id=${encodeURIComponent(e.id)}"><span class="status-icon s-${st}">${ICON[st]}</span><span><b>${esc(e.title)}</b><br><span class="muted">${esc(unitTitle(e.unit))} ${dots}</span></span></a>`;
    }).join('')}
    <nav class="bottom"><a class="btn" href="#/aufgaben">Alle Aufgaben</a></nav></section>`));
}

function renderPlayer(ctx, exId) {
  const { data, store, root, sync } = ctx;
  const ex = data.exercises.find(e => e.id === exId);
  if (!ex) return root.append(h('<section><p>Aufgabe nicht gefunden.</p><a class="btn" href="#/aufgaben">Zurück</a></section>'));
  const set = data.sets.find(s => s.id === ex.set);
  const doc = store.load();
  const sctx = ctx.slides ? { slides: ctx.slides, decksById: ctx.decksById } : null;
  const pctx = { sctx, settings: doc.settings, tutorPrompt: ctx.tutorPrompt };
  const sessionId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  let firstRating = true;

  const onRate = (part, button, answer, ms) => {
    const now = new Date();
    doc.exercises[ex.id] = recordExercise(doc.exercises[ex.id], { [part.id]: button }, now, { newRun: firstRating });
    firstRating = false;
    const pid = partCardId(ex, part);
    if (button === 'red') doc.gaps = addGap(doc.gaps, { id: pid, fach: ex.fach, front: `**${ex.title}**, Teil ${part.id}): ${fillText(part.prompt, {}).slice(0, 200)}` }, now);
    else if (button === 'green') doc.gaps = recordCorrect(doc.gaps, pid, now);
    try { store.save(doc); } catch { alert('Speichern fehlgeschlagen (Speicher voll?).'); }
    sync?.push(makeReviewEvent({ card: { id: pid, fach: ex.fach }, button, mode: part.mode, hinted: false, answer, ms, sessionId, now }));
    sync?.flush();
  };

  const draw = vars => {
    const prev = doc.exercises[ex.id];
    const last = prev?.parts ? ex.parts.map(p => `${esc(p.id)}) ${({ green: '🟢', yellow: '🟡', red: '🔴' }[prev.parts[p.id]] ?? '⚪')}`).join(' ') : '';
    const el = h(`<article class="card exercise">
      <div class="kicker"><span class="badge">${esc(data.meta.faecher[ex.fach]?.short ?? ex.fach)}</span><span>${esc(set?.title ?? '')}</span></div>
      <h1>${esc(ex.title)}</h1>
      ${ex.generated ? '<p class="muted">Übungsaufgabe nach den Unterlagen (nicht wörtlich aus dem Original).</p>' : ''}
      ${last ? `<p class="muted">Zuletzt ${new Date(prev.at).toLocaleDateString('de-DE')}: ${last}</p>` : ''}
      <div class="intro">${ex.intro ? md(fillText(ex.intro, vars)) : ''}</div>
      <div class="orig"></div><div class="calc-tools row"></div><div class="parts"></div>
      <p class="muted src">Quelle: ${esc(ex.source)}</p>
      <nav class="bottom"></nav>
    </article>`);
    if (sctx && ex.slides?.length) el.querySelector('.orig').append(slideStrip(ex.slides, sctx, { title: '📄 Originalaufgabe' }));
    if (ex.calcVars && Object.keys(ex.calcVars).length) {
      const tools = el.querySelector('.calc-tools');
      const roll = h('<button type="button">🎲 Neue Zahlen</button>');
      roll.onclick = () => draw(exerciseVars(ex, Math.random));
      const orig = h('<button type="button">↺ Originalwerte</button>');
      orig.onclick = () => draw(exerciseVars(ex));
      tools.append(roll, orig);
    }
    const parts = el.querySelector('.parts');
    ex.parts.forEach(p => parts.append(practicePart(p, ex, vars, pctx, onRate)));
    const list = exercisesOf(data, ex.set);
    const nxt = nextAfter(list, ex.id, doc.exercises);
    el.querySelector('nav.bottom').innerHTML = `${nxt ? `<a class="btn primary" href="#/aufgaben?id=${encodeURIComponent(nxt.id)}">Nächste Aufgabe →</a>` : ''}<a class="btn" href="#/aufgaben?set=${encodeURIComponent(ex.set)}">Übersicht</a>`;
    root.replaceChildren(el);
    enhance(el);
    window.scrollTo(0, 0);
  };
  draw(exerciseVars(ex));
}

export function renderExercises(ctx, params) {
  const id = params?.get('id');
  const set = params?.get('set');
  if (id) return renderPlayer(ctx, id);
  if (set) return renderSet(ctx, set);
  return renderOverview(ctx);
}

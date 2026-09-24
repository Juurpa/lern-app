import { h, md, enhance, esc } from '../render.js';
import { exerciseVars, fillText, partPoints, scoreExam, examExercises, recordExercise, partCardId, SELF_GRADED } from '../exercises.js';
import { addGap, recordCorrect } from '../gaps.js';
import { partInput, autoCheck, partSolution, KIND } from './exercises.js';
import { slideStrip } from './slides.js';

const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const RULES = {
  MTS: 'Open Book wie in der echten Klausur: Unterlagen und nicht programmierbarer Taschenrechner erlaubt.',
  INF2: 'Ohne Hilfsmittel. Code und Begründungen so präzise schreiben wie auf dem Klausurbogen.',
  RADAR: 'Mündlich: jede Frage laut beantworten (🎙️ oder Stichpunkte tippen), erst die 30-Sekunden-Kernaussage, dann vertiefen.',
};

export function renderExamList({ data, store, root }) {
  const doc = store.load();
  const sets = data.sets.filter(s => s.minutes > 0);
  const rows = sets.map(s => {
    const n = s.draw > 0 ? s.draw : data.exercises.filter(e => e.set === s.id).length;
    const runs = doc.exams.filter(x => x.set === s.id).slice(-3).reverse();
    return `<div class="panel"><div class="kicker"><span class="badge">${esc(data.meta.faecher[s.fach]?.short ?? s.fach)}</span><span>⏱ ${esc(s.minutes)} min · ${n} Aufgaben${s.draw ? ' (zufällig)' : ''}</span></div>
      <b>${esc(s.title)}</b>
      ${runs.length ? `<p class="muted">${runs.map(r => `${r.pct} % (${new Date(r.at).toLocaleDateString('de-DE')})`).join(' · ')}</p>` : ''}
      <a class="btn primary" href="#/klausur?set=${encodeURIComponent(s.id)}">Starten</a></div>`;
  }).join('');
  root.append(h(`<section><h1>Probeklausuren</h1>
    <p class="muted">Unter echten Bedingungen: Zeitlimit, Lösungen erst nach der Abgabe, danach Punkte vergeben.</p>
    ${rows || '<p class="muted">Noch keine Probeklausuren geladen.</p>'}
    <nav class="bottom"><a class="btn" href="#/aufgaben">Aufgaben</a><a class="btn" href="#/">Zurück</a></nav></section>`));
}

export function renderExam(ctx, params) {
  const { data, root } = ctx;
  const set = data.sets.find(s => s.id === params?.get('set'));
  if (!set) return root.append(h('<section><p>Probeklausur nicht gefunden.</p><a class="btn" href="#/klausuren">Zurück</a></section>'));
  const n = set.draw > 0 ? set.draw : data.exercises.filter(e => e.set === set.id).length;
  const el = h(`<section class="card"><h1>⏱ ${esc(set.title)}</h1>
    <p><b>${esc(set.minutes)} Minuten</b> · ${n} Aufgaben${set.draw ? ' (zufällig gezogen)' : ''} · ${esc(KIND[set.kind] ?? set.kind)}</p>
    <p>${esc(RULES[set.fach] ?? '')}</p>
    <p class="muted">Lösungen erscheinen erst nach der Abgabe (oder wenn die Zeit abläuft). Nicht wegnavigieren – der Versuch ginge verloren.</p>
    <button class="primary big" id="start">Start</button>
    <nav class="bottom"><a class="btn" href="#/klausuren">Zurück</a></nav></section>`);
  el.querySelector('#start').onclick = () => runExam(ctx, set);
  root.append(el);
}

function runExam(ctx, set) {
  const { data, root } = ctx;
  const exs = examExercises(set, data.exercises);
  const entries = [];
  const started = Date.now();
  const deadline = started + set.minutes * 60000;
  const el = h(`<article class="exam"><div class="timer"><span class="t-left"></span><span class="muted"> · ${esc(set.title)}</span></div><div class="exam-body"></div>
    <button class="primary big" id="submit">Abgeben</button></article>`);
  const body = el.querySelector('.exam-body');
  exs.forEach((ex, k) => {
    const vars = exerciseVars(ex, ex.calcVars ? Math.random : undefined); // frische Zahlen, damit nicht die bekannte Lösung abgefragt wird
    const sec = h(`<section class="card exam-ex"><h2>Aufgabe ${k + 1}: ${esc(ex.title)}</h2>${ex.intro ? md(fillText(ex.intro, vars)) : ''}</section>`);
    for (const part of ex.parts) {
      const p = h(`<div class="part"><div class="part-head"><b>${esc(part.id)})</b> <span class="muted">${esc(partPoints(part))} P.</span></div>${md(fillText(part.prompt, vars))}</div>`);
      const input = partInput(part, ex, vars);
      p.append(input.el);
      sec.append(p);
      entries.push({ ex, part, vars, input, points: partPoints(part), earned: null, box: p });
    }
    body.append(sec);
  });
  const left = el.querySelector('.t-left');
  let timer = null;
  const tick = () => {
    if (!el.isConnected) return clearInterval(timer);
    const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    left.textContent = `⏱ ${fmtTime(s)}`;
    el.classList.toggle('hurry', s < 300);
    if (s === 0) submit(true);
  };
  const submit = timeUp => {
    clearInterval(timer);
    if (timeUp) alert('Zeit abgelaufen – die Klausur wird abgegeben.');
    for (const e of entries) {
      e.value = e.input.value();
      const auto = autoCheck(e.part, e.ex, e.vars, e.value, e.input);
      e.auto = auto;
      e.earned = auto ? Math.round(auto.ratio * e.points * 2) / 2 : null;
    }
    review(ctx, set, entries, Math.round((Date.now() - started) / 60000));
  };
  el.querySelector('#submit').onclick = () => { if (confirm('Wirklich abgeben?')) submit(false); };
  root.replaceChildren(el);
  enhance(el);
  window.scrollTo(0, 0);
  timer = setInterval(tick, 1000);
  tick();
}

function answerText(e) {
  if (e.part.mode === 'mc') return e.value.length ? e.value.join(' · ') : '–';
  if (e.part.mode === 'cloze') return e.value.map(v => v || '–').join(' | ');
  return String(e.value ?? '').trim() || '–';
}

function review(ctx, set, entries, usedMin) {
  const { root, store } = ctx;
  const sctx = ctx.slides ? { slides: ctx.slides, decksById: ctx.decksById } : null;
  const el = h(`<article class="exam-review"><div class="timer"><span class="score"></span><span class="muted"> · ${usedMin} min</span></div>
    <p class="muted">Automatisch geprüft: Rechnen, Ankreuzen, Lücken. Für die übrigen Teile vergibst du die Punkte selbst – ehrlich wie ein Korrektor.</p>
    <div class="review-body"></div><button class="primary big" id="save" disabled>Ergebnis speichern</button></article>`);
  const bodyEl = el.querySelector('.review-body');
  const scoreEl = el.querySelector('.score');
  const saveBtn = el.querySelector('#save');
  const update = () => {
    const s = scoreExam(entries);
    scoreEl.textContent = `${s.earned} / ${s.max} P. (${s.pct} %)`;
    saveBtn.disabled = entries.some(e => e.earned === null);
    saveBtn.textContent = saveBtn.disabled ? `Noch ${entries.filter(e => e.earned === null).length} Teile bewerten` : 'Ergebnis speichern';
  };
  let lastEx = null;
  for (const e of entries) {
    if (e.ex !== lastEx) {
      lastEx = e.ex;
      const head = h(`<h2>${esc(e.ex.title)}</h2>`);
      bodyEl.append(head);
      if (sctx && e.ex.slides?.length) bodyEl.append(slideStrip(e.ex.slides, sctx, { title: '📄 Originalaufgabe' }));
    }
    const box = h(`<div class="panel part"><div class="part-head"><b>${esc(e.part.id)})</b> <span class="muted">${esc(e.points)} P.</span></div>${md(fillText(e.part.prompt, e.vars))}
      <p><b>Deine Antwort:</b></p><pre class="your-answer"></pre></div>`);
    box.querySelector('.your-answer').textContent = answerText(e);
    if (e.auto) box.insertAdjacentHTML('beforeend', e.auto.html);
    box.append(partSolution(e.part, e.ex, e.vars, sctx));
    if (e.part.keyPoints?.length) box.insertAdjacentHTML('beforeend', `<h4>Kernpunkte</h4><ul>${e.part.keyPoints.map(k => `<li>${md(k)}</li>`).join('')}</ul>`);
    if (SELF_GRADED.includes(e.part.mode) || !e.auto) {
      const opts = [0, e.points / 2, e.points];
      const row = h(`<div class="row points">${opts.map((v, i) => `<button type="button" data-v="${v}">${['0 P.', '½', `voll (${e.points} P.)`][i]}</button>`).join('')}</div>`);
      row.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          e.earned = Number(b.dataset.v);
          row.querySelectorAll('button').forEach(x => x.classList.toggle('suggested', x === b));
          update();
        };
      });
      box.append(row);
    }
    bodyEl.append(box);
  }
  saveBtn.onclick = () => {
    const doc = store.load();
    const now = new Date();
    const s = scoreExam(entries);
    doc.exams = [...(doc.exams ?? []), { set: set.id, at: now.toISOString(), earned: s.earned, max: s.max, pct: s.pct, minutes: usedMin }];
    const perEx = new Map();
    for (const e of entries) {
      const share = e.points ? e.earned / e.points : 0;
      const button = share >= 0.99 ? 'green' : share >= 0.5 ? 'yellow' : 'red';
      if (!perEx.has(e.ex)) perEx.set(e.ex, {});
      perEx.get(e.ex)[e.part.id] = button;
      const pid = partCardId(e.ex, e.part);
      if (button === 'red') doc.gaps = addGap(doc.gaps, { id: pid, fach: e.ex.fach, front: `**${e.ex.title}**, Teil ${e.part.id}): ${fillText(e.part.prompt, {}).slice(0, 200)}` }, now);
      else if (button === 'green') doc.gaps = recordCorrect(doc.gaps, pid, now);
    }
    for (const [ex, buttons] of perEx) doc.exercises[ex.id] = recordExercise(doc.exercises[ex.id], buttons, now);
    try { store.save(doc); } catch { alert('Speichern fehlgeschlagen (Speicher voll?).'); return; }
    root.replaceChildren(h(`<section class="card"><h1>${s.pct} %</h1><p>${s.earned} von ${s.max} Punkten in ${usedMin} Minuten.</p>
      <p class="muted">Rot bewertete Teile stehen jetzt in den Lücken.</p>
      <div class="row"><a class="btn primary" href="#/klausuren">Probeklausuren</a><a class="btn" href="#/gaps">Lücken</a><a class="btn" href="#/">Start</a></div></section>`));
  };
  root.replaceChildren(el);
  enhance(el);
  update();
  window.scrollTo(0, 0);
}

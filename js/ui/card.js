import { h, md, mdInline, enhance, esc } from '../render.js';
import { prepareCalc, checkAnswer, formatNumber } from '../calc.js';

const MODE_LABEL = { free: 'Freitext', voice: 'Erklären', code: 'Code', calc: 'Rechnen', mc: 'Multiple Choice', cloze: 'Lückentext', why: 'Warum?', bridge: 'Brücke' };
const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

function ratingBar(suggest, cb) {
  const el = h(`<div class="row rate">
    <button class="r-red" data-b="red">🔴 Lücke</button>
    <button class="r-yellow" data-b="yellow">🟡 Unsicher</button>
    <button class="r-green" data-b="green">🟢 Easy</button></div>`);
  el.querySelectorAll('button').forEach(b => {
    if (b.dataset.b === suggest) b.classList.add('suggested');
    b.onclick = () => { el.querySelectorAll('button').forEach(x => (x.disabled = true)); cb(b.dataset.b); };
  });
  return el;
}

export function renderCard(root, { card, mode, fachLabel, onRated }) {
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>${MODE_LABEL[mode] ?? mode}</span></div>
    <div class="q"></div><div class="work"></div><div class="reveal" hidden></div><div class="rate-slot" hidden></div>
  </article>`);
  root.replaceChildren(el);
  const [q, work, reveal, rate] = ['.q', '.work', '.reveal', '.rate-slot'].map(s => el.querySelector(s));
  let hinted = false;
  let answer = ''; const t0 = Date.now();

  const showBack = () => {
    reveal.hidden = false;
    reveal.innerHTML = `<h3>Lösung</h3>${md(card.back)}${card.why && mode !== 'why' ? `<h3>Denk-Trigger</h3>${md(card.why)}` : ''}`;
    enhance(reveal);
  };
  const showRating = suggest => {
    rate.hidden = false;
    rate.replaceChildren(ratingBar(suggest, button => onRated({ button, mode, hinted, answer, ms: Date.now() - t0 })));
    rate.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  if (mode === 'mc') {
    q.innerHTML = md(card.mc.stem || card.front);
    const correctIdx = card.mc.options.indexOf(card.mc.correct);
    for (const i of shuffle(card.mc.options.map((_, k) => k))) {
      const b = h(`<button class="opt" data-i="${i}">${mdInline(card.mc.options[i])}</button>`);
      b.onclick = () => {
        answer = card.mc.options[i];
        const right = i === correctIdx;
        work.querySelectorAll('.opt').forEach(o => { o.disabled = true; if (Number(o.dataset.i) === correctIdx) o.classList.add('right'); });
        if (!right) b.classList.add('wrong');
        showBack();
        showRating(right ? 'green' : 'red');
      };
      work.append(b);
    }
    enhance(work);
  } else if (mode === 'cloze') {
    q.innerHTML = md(card.front);
    const p = document.createElement('p');
    card.cloze.text.split(/(\{\{\d+\}\})/).forEach(part => {
      const m = part.match(/^\{\{(\d+)\}\}$/);
      if (m) { const i = h(`<input type="text" class="cloze-input" data-i="${Number(m[1]) - 1}" autocomplete="off">`); p.append(i); }
      else p.append(part);
    });
    const check = h('<button class="primary big">Prüfen</button>');
    check.onclick = () => {
      const inputs = [...p.querySelectorAll('input')];
      answer = inputs.map(i => i.value).join(' | ');
      let ok = 0;
      inputs.forEach(i => {
        const want = card.cloze.answers[Number(i.dataset.i)];
        const right = norm(i.value) === norm(want);
        ok += right; i.classList.add(right ? 'right' : 'wrong'); i.disabled = true;
        if (!right) i.value = `${i.value} → ${want}`;
      });
      check.remove();
      showBack();
      showRating(ok === inputs.length ? 'green' : ok * 2 >= inputs.length ? 'yellow' : 'red');
    };
    work.append(p, check);
  } else if (mode === 'code') {
    q.innerHTML = md(card.front);
    work.append(h('<textarea class="mono" placeholder="Erst auf Papier bzw. hier selbst schreiben …" spellcheck="false"></textarea>'));
    const hints = card.code?.hints ?? [];
    let shown = 0;
    const hintBox = document.createElement('div');
    const hintBtn = h(`<button>Hinweis (${hints.length})</button>`);
    hintBtn.hidden = !hints.length;
    hintBtn.onclick = () => {
      hinted = true;
      hintBox.append(h(`<div class="panel">💡 ${md(hints[shown++])}</div>`));
      enhance(hintBox);
      hintBtn.textContent = `Hinweis (${hints.length - shown})`;
      if (shown >= hints.length) hintBtn.hidden = true;
    };
    const solve = h('<button class="primary">Lösung zeigen</button>');
    solve.onclick = () => { answer = work.querySelector('textarea').value; solve.remove(); hintBtn.remove(); showBack(); showRating(null); };
    work.append(hintBox, h('<div class="row"></div>'));
    work.lastChild.append(hintBtn, solve);
  } else if (mode === 'calc' && card.calc) {
    const task = prepareCalc(card.calc);
    q.innerHTML = md(card.front) + md(task.given);
    const row = h(`<div class="row calc-row"><input type="text" inputmode="decimal" class="calc-input" placeholder="Ergebnis" autocomplete="off"><span class="calc-unit">${esc(task.unit)}</span></div>`);
    const input = row.querySelector('input');
    const stepBox = document.createElement('div');
    let shownSteps = 0;
    const stepBtn = h(`<button>Rechenweg-Schritt (${task.steps.length})</button>`);
    stepBtn.hidden = !task.steps.length;
    stepBtn.onclick = () => {
      hinted = true;
      stepBox.append(h(`<div class="panel">🧮 ${md(task.steps[shownSteps++])}</div>`));
      enhance(stepBox);
      stepBtn.textContent = `Rechenweg-Schritt (${task.steps.length - shownSteps})`;
      if (shownSteps >= task.steps.length) stepBtn.hidden = true;
    };
    const check = h('<button class="primary">Prüfen</button>');
    check.onclick = () => {
      answer = input.value;
      const r = checkAnswer(input.value, task.expected, task.tolerance);
      input.disabled = true;
      input.classList.add(r.ok ? 'right' : 'wrong');
      check.remove();
      stepBtn.remove();
      stepBox.replaceChildren(
        h(`<div class="panel"><b>${r.ok ? '✅ Richtig' : '❌ Erwartet'}:</b> ${esc(formatNumber(task.expected))} ${esc(task.unit)}</div>`),
        ...task.steps.map(s => h(`<div class="panel">🧮 ${md(s)}</div>`)),
      );
      enhance(stepBox);
      showBack();
      showRating(r.ok ? (hinted ? 'yellow' : 'green') : 'red');
    };
    const buttons = h('<div class="row"></div>');
    buttons.append(stepBtn, check);
    work.append(row, stepBox, buttons);
  } else {
    q.innerHTML = mode === 'why' && card.why ? `<div class="muted">${md(card.front)}</div>${md(`**${card.why}**`)}` : md(card.front);
    work.append(h(`<textarea placeholder="${mode === 'voice' ? 'Laut erklären und Stichpunkte tippen …' : 'Erst selbst antworten …'}"></textarea>`));
    const go = h('<button class="primary big">Aufdecken</button>');
    go.onclick = () => {
      answer = work.querySelector('textarea').value;
      go.remove();
      showBack();
      if (!card.keyPoints?.length) return showRating(null);
      const list = h(`<div class="checklist"><h3>Kernpunkte – was hattest du?</h3>${card.keyPoints.map((k, i) =>
        `<label><input type="checkbox" data-i="${i}"><span>${md(k)}</span></label>`).join('')}</div>`);
      const done = h('<button class="primary">Auswerten</button>');
      done.onclick = () => {
        const ratio = list.querySelectorAll('input:checked').length / card.keyPoints.length;
        done.remove();
        showRating(ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'yellow' : 'red');
      };
      reveal.append(list, done);
      enhance(list);
    };
    work.append(go);
  }
  enhance(q);
}

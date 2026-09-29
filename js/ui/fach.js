import { h, esc } from '../render.js';
import { resolveFach, fachStats, examLabel } from '../session.js';
import { fachSets, exerciseStatus, nextExercise, setProgress } from '../exercises.js';
import { setRow } from './exercises.js';

function examRow(data, doc, s) {
  const n = s.draw > 0 ? s.draw : data.exercises.filter(e => e.set === s.id).length;
  const runs = doc.exams.filter(x => x.set === s.id).slice(-3).reverse();
  return `<div class="panel"><div class="kicker"><span class="badge">Probeklausur</span><span>⏱ ${esc(s.minutes)} min · ${n} Aufgaben${s.draw ? ' (zufällig)' : ''}</span></div>
    <b>${esc(s.title)}</b>
    ${runs.length ? `<p class="muted">${runs.map(r => `${esc(r.pct)} % (${esc(new Date(r.at).toLocaleDateString('de-DE'))})`).join(' · ')}</p>` : ''}
    <a class="btn primary" href="#/klausur?set=${encodeURIComponent(s.id)}">Starten</a></div>`;
}

export function renderFach({ data, store, root }, params) {
  const f = resolveFach(data.meta, params?.get('f'));
  if (!f) return root.append(h('<section><p>Fach nicht gefunden.</p><a class="btn" href="#/">Zur Startseite</a></section>'));
  const info = data.meta.faecher[f];
  const doc = store.load();
  const now = new Date();
  const st = fachStats({ cards: data.cards, doc, fach: f, exam: info.exam, now });
  const { practice, exams } = fachSets(data.sets, f);
  const exs = data.exercises.filter(e => e.fach === f);
  const prog = setProgress(exs, doc.exercises);
  const pct = prog.total ? Math.round(((prog.done + prog.partial * 0.5) / prog.total) * 100) : 0;
  const next = nextExercise(exs, doc.exercises);
  const nextLabel = next && exerciseStatus(next, doc.exercises[next.id]) === 'new' ? 'Nächste Aufgabe' : 'Weiter üben';
  const learn = st.finished
    ? '<span class="btn" aria-disabled="true">Prüfung vorbei</span>'
    : `<a class="btn primary" href="#/learn?fach=${encodeURIComponent(f)}">▶ Nur ${esc(info.short)} lernen</a>`;

  root.append(h(`<section>
    <div class="kicker"><span class="badge">${esc(info.short)}</span><span>${esc(examLabel(info.exam, now))}</span></div>
    <h1>${esc(info.label)}</h1>
    <div class="stats"><div><b>${st.due}</b>fällig</div><div><b>${st.fresh}</b>neu</div><div><b>${st.gaps}</b>Lücken</div></div>
    ${st.pace ? `<p class="muted">Tempo: ≈ ${st.pace} neue Karten/Tag nötig</p>` : ''}
    <div class="row fach-actions">${learn}${next ? `<a class="btn" href="#/aufgaben?id=${encodeURIComponent(next.id)}">${nextLabel}</a>` : ''}</div>
    <h2>Aufgaben</h2>
    ${prog.total ? `<div class="progress-bar"><span style="width:${pct}%"></span></div>
    <p class="muted">${prog.done} von ${prog.total} Aufgaben fertig${prog.partial ? ` · ${prog.partial} angefangen` : ''}</p>` : ''}
    ${practice.map(s => setRow(data, doc, s)).join('') || '<p class="muted">Für dieses Fach gibt es noch keine Aufgaben.</p>'}
    ${exams.length ? `<h2>Probeklausur</h2>${exams.map(s => examRow(data, doc, s)).join('')}` : ''}
    <div class="row"><a class="btn" href="#/folien">Folien</a>${st.gaps ? '<a class="btn" href="#/gaps">Lücken</a>' : ''}</div>
    <nav class="bottom"><a class="btn" href="#/">Start</a></nav>
  </section>`));
}

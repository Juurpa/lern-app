import { h, esc } from '../render.js';
import { openGaps } from '../gaps.js';
import { fachStats, examLabel, reviewedToday, estimateMinutes, dayKey } from '../session.js';
import { fachSets } from '../exercises.js';
import { statLinks, paceNote } from './fach.js';

// Emoji rendern je nach Gerät/Font sehr unterschiedlich (z. B. 🕳 als schwarzer Klecks) – für die
// Schnellzugriffe deshalb dieselben handgezeichneten SVG-Icons wie in der Tab-Leiste.
const QI = {
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7.2"/><path d="M12 13V9.3M9.3 3.2h5.4"/><path d="m16.6 5.9 1.3-1.3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h10.5l-2.7 3.4L16.5 10.8H6"/></svg>',
};

function fachPick(f, info, { due, fresh, finished }) {
  const parts = finished ? ['vorbei'] : [due && `${due} fällig`, fresh && `${fresh} neu`].filter(Boolean);
  if (!parts.length) parts.push('erledigt ✓');
  const inner = `<b>${esc(info.short)}</b>${parts.map(p => `<small>${esc(p)}</small>`).join('')}`;
  return finished
    ? `<span class="btn fach-pick-btn" aria-disabled="true">${inner}</span>`
    : `<a class="btn fach-pick-btn" href="#/learn?fach=${encodeURIComponent(f)}" aria-label="Nur ${esc(info.label)} lernen, ${esc(parts.join(', '))}">${inner}</a>`;
}

// Das Tagesziel wird beim ersten Öffnen des Tages eingefroren, damit es beim Lernen nicht mitwächst.
function todaysGoal(computed, now) {
  const day = dayKey(now);
  try {
    const saved = JSON.parse(localStorage.getItem('lernapp.tagesziel'));
    if (saved?.day === day && Number.isFinite(saved.goal)) return saved.goal;
    localStorage.setItem('lernapp.tagesziel', JSON.stringify({ day, goal: computed }));
  } catch { /* ohne Speicher: Tagesziel gilt nur für diese Ansicht */ }
  return computed;
}

function dailyBlock(done, goal) {
  if (!goal && !done) return '';
  const target = Math.max(goal, done);
  const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const left = target - done;
  return `<div class="daily">
    <div class="daily-head"><span>Heute: <b>${done} / ${target}</b> Karten</span><span>${left > 0 ? `noch ≈ ${estimateMinutes(left)} min` : 'Ziel erreicht ✓'}</span></div>
    <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${done}" aria-label="Tagesfortschritt"><span style="width:${pct}%"></span></div>
  </div>`;
}

export function renderStart({ data, store, root }) {
  const doc = store.load();
  const now = new Date();
  const gaps = openGaps(doc.gaps);
  let totalDue = 0, totalFresh = 0, totalPace = 0, examSets = 0;
  const entries = Object.entries(data.meta.faecher).map(([f, info]) => {
    const st = fachStats({ cards: data.cards, doc, fach: f, exam: info.exam, now });
    // Abgeschlossene Fächer zählen nicht mit (die Session-Auswahl schließt sie ebenfalls aus).
    if (!st.finished) {
      totalDue += st.due; totalFresh += st.fresh; totalPace += st.pace;
      examSets += fachSets(data.sets, f).exams.length;
    }
    return { f, info, st };
  });
  // Prio 1 = größtes Neu-Tempo (dann meiste Fälliges); nur unter Fächern mit noch etwas zu tun.
  const ranked = entries.filter(e => !e.st.finished && e.st.due + e.st.fresh > 0)
    .sort((a, b) => b.st.pace - a.st.pace || b.st.due - a.st.due).map(e => e.f);
  const rows = entries.map(({ f, info, st }) => {
    const prio = ranked.length > 1 && ranked.includes(f) ? `Prio ${ranked.indexOf(f) + 1} · ` : '';
    return `<div class="panel fach-panel urg-${st.urgency}">
      <a class="kicker fach-head" href="#/fach?f=${encodeURIComponent(f)}" aria-label="${esc(info.label)}: Aufgaben, Probeklausur und mehr öffnen"><span class="badge">${esc(info.short)}</span><span>${prio}${esc(examLabel(info.exam, now))}</span></a>
      ${statLinks(f, info, st)}${paceNote(st)}
      <a class="fach-go" href="#/fach?f=${encodeURIComponent(f)}">Aufgaben, Probeklausur &amp; mehr ›</a></div>`;
  }).join('');
  const picks = entries.map(({ f, info, st }) => fachPick(f, info, st)).join('');
  const warn = data.errors.length ? `<div class="warn">${esc(data.errors.length)} Karten fehlerhaft und ausgeblendet – siehe Einstellungen.</div>` : '';
  const heroSub = totalDue > 0
    ? `${totalDue} Karte${totalDue === 1 ? '' : 'n'} fällig${totalFresh ? `, ${totalFresh} neu wartend` : ''}`
    : totalFresh > 0 ? `Keine Wiederholungen fällig – ${totalFresh} neue Karten warten` : 'Alles erledigt für heute 🎉';
  const daily = dailyBlock(reviewedToday(data.cards, doc, now), todaysGoal(totalDue + totalPace, now));
  root.append(h(`<section>
    <div class="card start-hero">
      <div class="kicker"><span class="badge">Klausurtraining</span></div>
      <h1>Bereit zum Lernen?</h1>
      <p class="muted">${esc(heroSub)}</p>
      ${daily}
      <a class="btn primary big" href="#/learn">▶ Lernen starten</a>
      <p class="fach-pick-label">Oder nur ein Fach lernen:</p>
      <div class="fach-pick">${picks}</div>
    </div>
    ${warn}
    <div class="row quick-actions">
      <a class="btn" href="#/klausuren"><span class="qi">${QI.timer}</span>Probeklausur${examSets ? `<small class="qsub">${examSets} Klausuren · mit Timer</small>` : ''}</a>
      <a class="btn" href="#/gaps"><span class="qi">${QI.flag}</span>Lücken${gaps.length ? `<span class="gap-pill">${gaps.length}</span>` : ''}</a>
    </div>
    <h2>Stand je Fach</h2>${rows}
  </section>`));
}

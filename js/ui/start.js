import { h, esc } from '../render.js';
import { isDue } from '../scheduler.js';
import { openGaps } from '../gaps.js';
import { examFinished, calendarDaysUntil, newPerDayNeeded } from '../session.js';

// Emoji rendern je nach Gerät/Font sehr unterschiedlich (z. B. 🕳 als schwarzer Klecks) – für die
// Schnellzugriffe deshalb dieselben handgezeichneten SVG-Icons wie in der Tab-Leiste.
const QI = {
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7.2"/><path d="M12 13V9.3M9.3 3.2h5.4"/><path d="m16.6 5.9 1.3-1.3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h10.5l-2.7 3.4L16.5 10.8H6"/></svg>',
};

const examLabel = (exam, now) => {
  if (examFinished(exam, now)) return 'Prüfung vorbei';
  const n = calendarDaysUntil(exam, now);
  return n === 0 ? 'heute Prüfung' : `noch ${n} ${n === 1 ? 'Tag' : 'Tage'}`;
};

export function renderStart({ data, store, root }) {
  const doc = store.load();
  const now = new Date();
  const gaps = openGaps(doc.gaps);
  let totalDue = 0, totalFresh = 0;
  const rows = Object.entries(data.meta.faecher).map(([f, info]) => {
    const cards = data.cards.filter(c => c.fach === f);
    const due = cards.filter(c => isDue(doc.cards[c.id], now)).length;
    const fresh = cards.filter(c => !doc.cards[c.id]).length;
    const g = gaps.filter(x => x.fach === f).length;
    const pace = newPerDayNeeded(fresh, info.exam, now);
    totalDue += due; totalFresh += fresh;
    return `<div class="panel"><div class="kicker"><span class="badge">${esc(info.short)}</span><span>${examLabel(info.exam, now)}</span></div>
      <div class="stats"><div><b>${due}</b>fällig</div><div><b>${fresh}</b>neu</div><div><b>${g}</b>Lücken</div></div>${pace ? `<p class="muted">Tempo: ≈ ${pace} neue Karten/Tag nötig</p>` : ''}</div>`;
  }).join('');
  const warn = data.errors.length ? `<div class="warn">${esc(data.errors.length)} Karten fehlerhaft und ausgeblendet – siehe Einstellungen.</div>` : '';
  const heroSub = totalDue > 0
    ? `${totalDue} Karte${totalDue === 1 ? '' : 'n'} fällig${totalFresh ? `, ${totalFresh} neu wartend` : ''}`
    : totalFresh > 0 ? `Keine Wiederholungen fällig – ${totalFresh} neue Karten warten` : 'Alles erledigt für heute 🎉';
  root.append(h(`<section>
    <div class="card start-hero">
      <div class="kicker"><span class="badge">Klausurtraining</span></div>
      <h1>Bereit zum Lernen?</h1>
      <p class="muted">${esc(heroSub)}</p>
      <a class="btn primary big" href="#/learn">▶ Lernen starten</a>
    </div>
    ${warn}
    <div class="row quick-actions">
      <a class="btn" href="#/klausuren"><span class="qi">${QI.timer}</span>Probeklausur</a>
      <a class="btn" href="#/gaps"><span class="qi">${QI.flag}</span>Lücken${gaps.length ? `<span class="gap-pill">${gaps.length}</span>` : ''}</a>
    </div>
    <h2>Stand je Fach</h2>${rows}
  </section>`));
}

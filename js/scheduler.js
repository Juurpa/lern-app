import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';

const DAY = 86400000;
const engine = fsrs(generatorParameters({ enable_fuzz: false }));

export const MULT = { mc: 0.3, cloze: 0.5, hinted: 0.7, free: 1.0, voice: 1.0, code: 1.0, calc: 1.0, why: 1.2, bridge: 1.2 };

export function toRating(button, mode, hinted = false) {
  if (button === 'red') return Rating.Again;
  if (button === 'yellow') return Rating.Hard;
  if (button !== 'green') throw new Error(`Unbekannter Button: ${button}`);
  return !hinted && mode !== 'mc' && mode !== 'cloze' ? Rating.Easy : Rating.Good;
}

function localDate(isoDay, offsetDays = 0) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays);
}

// Deckel: spätestens am Vortag der Prüfung (00:00) fällig. Gedeckelte Karten werden
// deterministisch (über die Stabilität) auf Stichtag, -1 und -2 Tage verteilt, statt alle
// auf einen Tag zu fallen – aber nie früher als 1 Tag ab jetzt, solange das möglich ist.
function capDue(due, examDate, now, stability) {
  const cut = localDate(examDate, -1);
  if (!(cut > now && due > cut)) return due;
  let offset = Math.floor(stability || 0) % 3;
  while (offset > 0 && localDate(examDate, -1 - offset) - now < DAY) offset--;
  return localDate(examDate, -1 - offset);
}

const serialize = c => ({ ...c, due: c.due.toISOString(), last_review: c.last_review ? c.last_review.toISOString() : null });
const revive = s => ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined });

export function review(st, { button, mode, hinted = false }, now, examDate) {
  const prev = st ? revive(st.fsrs) : createEmptyCard(now);
  const rating = toRating(button, mode, hinted);
  let next = engine.next(prev, now, rating).card;
  if (rating !== Rating.Again && next.state === State.Review) {
    const shouldApplyHinted = hinted && ['free', 'voice', 'code', 'calc'].includes(mode);
    const m = shouldApplyHinted ? MULT.hinted : (MULT[mode] ?? 1);
    const s0 = prev.stability || 0;
    const s = s0 + (next.stability - s0) * m;
    const days = Math.max(1, Math.round(s));
    next = { ...next, stability: s, scheduled_days: days, due: new Date(now.getTime() + days * DAY) };
  }
  next = { ...next, due: capDue(next.due, examDate, now, next.stability) };
  return { fsrs: serialize(next), alt: (st?.alt ?? 0) + 1 };
}

export function isDue(st, now) {
  return Boolean(st) && new Date(st.fsrs.due) <= now;
}

export function chooseMode(card, st, now, examDate) {
  const exam = card.examMode;
  if ((localDate(examDate) - now) / DAY <= 3) return exam;
  const reps = st?.fsrs.reps ?? 0;
  if (reps === 0 && card.mc) return 'mc';
  if (reps < 2 && card.cloze) return 'cloze';
  if (reps < 2 && card.mc) return 'mc';
  const hasBridge = (card.bridges?.length ?? 0) > 0;
  if ((st?.fsrs.stability ?? 0) >= 10 && (hasBridge || card.why) && st.alt % 2 === 0) {
    return hasBridge ? 'bridge' : 'why';
  }
  return exam;
}

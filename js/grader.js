// Bewertungs-Orchestrierung: Gemini-Tutor mit automatischem Rückfall auf Selbstbewertung,
// Zwei-Versuche-Logik (erster Versuch verrät keine Lösung, zweiter zeigt sie immer).
import { gradeAnswer } from './gemini.js';

export function mapRatingToButton(vorschlagRating) {
  return ['red', 'yellow', 'green'].includes(vorschlagRating) ? vorschlagRating : null;
}

export function selfAssessRatio(checkedCount, total) {
  if (!total) return null;
  const ratio = checkedCount / total;
  return ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'yellow' : 'red';
}

// --- Automatische Prüfung ohne Selbsteinschätzung: Lückentext-Vergleich und Kernpunkte-Abgleich ---

const fold = s => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[\s_-]+/g, '');

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Erlaubte Schreibweisen einer Musterantwort: komplett, ohne Klammerzusatz, nur der Klammerinhalt, jede „A/B“-Alternative.
function variants(want) {
  const w = String(want).trim();
  const bare = w.replace(/\s*\([^)]*\)/g, '').trim();
  const out = new Set([w, bare]);
  for (const m of w.matchAll(/\(([^)]{4,})\)/g)) out.add(m[1].trim());
  for (const base of [w, bare]) for (const p of base.split('/')) if (base.includes('/') && p.trim().length >= 4) out.add(p.trim());
  out.delete('');
  return [...out];
}

const digitsOf = s => s.replace(/\D/g, '');

// Groß-/Kleinschreibung, Leerzeichen, Bindestriche, Umlaut-Schreibweise egal; bei längeren Wörtern ein Tippfehler erlaubt (Zahlen müssen exakt stimmen).
export function answerMatches(input, want) {
  const a = fold(input);
  if (!a) return false;
  return variants(want).some(v => {
    const b = fold(v);
    if (a === b) return true;
    const letters = b.replace(/[^a-z]/g, '').length;
    return letters >= 6 && digitsOf(a) === digitsOf(b) && levenshtein(a, b) <= 1;
  });
}

const STOPWORDS = new Set(['der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'einer', 'einen', 'eines', 'ist', 'sind', 'wird', 'werden', 'mit', 'von', 'für', 'auf', 'bei', 'nach', 'aus', 'als', 'zum', 'zur', 'dem', 'den', 'des', 'nicht', 'auch', 'durch', 'wenn', 'dass', 'sich', 'kann', 'nur', 'über', 'beim', 'dies', 'diese', 'dieser', 'wie', 'zur', 'aber', 'sowie', 'wobei']);
const wordsOf = s => String(s ?? '').toLowerCase().split(/[^a-zäöüß0-9]+/).filter(Boolean);
const stemOf = w => fold(w).slice(0, 6);

// Schlägt vor, welche Kernpunkte in der getippten Antwort vorkommen (Stamm-Vergleich der Inhaltswörter, ≥ 60 %).
// Nur ein Vorschlag für die Ausfüll-Checkliste, wenn Gemini nicht zur Verfügung steht.
export function autoCheckKeyPoints(answer, keyPoints) {
  const have = new Set(wordsOf(answer).map(stemOf));
  return (keyPoints ?? []).map(kp => {
    const terms = [...new Set(wordsOf(kp).filter(w => (w.length >= 4 || /\d/.test(w)) && !STOPWORDS.has(w)).map(stemOf))];
    if (!terms.length) return false;
    return terms.filter(t => have.has(t)).length / terms.length >= 0.6;
  });
}

// revealSolution: ob die Musterlösung jetzt gezeigt werden darf (zweiter Versuch oder Gemini ist zufrieden).
export async function grade({ settings, card, userText, userAudio, attempt = 1, systemPrompt, fetchFn }) {
  if (!settings?.geminiKey) return { source: 'self', revealSolution: true };
  try {
    const result = await gradeAnswer({
      apiKey: settings.geminiKey,
      model: settings.geminiModel,
      fetchFn,
      systemPrompt,
      fach: card.fach,
      examMode: card.examMode,
      front: card.front,
      back: card.back,
      keyPoints: card.keyPoints,
      why: card.why,
      userText,
      userAudio,
      attempt,
    });
    const revealSolution = attempt >= 2 || !result.nochmalVersuchen;
    return { source: 'gemini', result, revealSolution, button: mapRatingToButton(result.vorschlagRating) };
  } catch (e) {
    return { source: 'self', revealSolution: true, error: e.message };
  }
}

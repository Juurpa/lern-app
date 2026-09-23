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

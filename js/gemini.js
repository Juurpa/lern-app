// Gemini-API: strukturierte Bewertung einer Lernantwort (Text oder Audio), DOM-frei, fetch injizierbar.

export const GRADE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keyPoints: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { point: { type: 'STRING' }, erfuellt: { type: 'BOOLEAN' }, kommentar: { type: 'STRING' } },
        required: ['point', 'erfuellt', 'kommentar'],
      },
    },
    staerke: { type: 'STRING' },
    unscharfeStelle: { type: 'STRING' },
    nochmalVersuchen: { type: 'BOOLEAN' },
    vorschlagRating: { type: 'STRING', enum: ['red', 'yellow', 'green'] },
  },
  required: ['keyPoints', 'staerke', 'unscharfeStelle', 'nochmalVersuchen', 'vorschlagRating'],
};

function taskText({ fach, examMode, front, back, keyPoints, why, userText, attempt }) {
  return [
    fach ? `Fach: ${fach}${examMode ? ` (Prüfungsformat: ${examMode})` : ''}` : '',
    `Frage: ${front}`,
    `Musterlösung: ${back}`,
    keyPoints?.length ? `Kernpunkte: ${keyPoints.join(' | ')}` : '',
    why ? `Warum-Frage (optional beantwortet): ${why}` : '',
    `Versuch Nr. ${attempt ?? 1}`,
    userText ? `Antwort des Lernenden (Text):\n${userText}` : 'Antwort des Lernenden: siehe angehängtes Audio.',
  ].filter(Boolean).join('\n');
}

export function buildGradeRequest({ systemPrompt, fach, examMode, front, back, keyPoints, why, userText, userAudio, attempt }) {
  const parts = [{ text: taskText({ fach, examMode, front, back, keyPoints, why, userText, attempt }) }];
  if (userAudio) parts.push({ inlineData: { mimeType: userAudio.mimeType, data: userAudio.base64 } });
  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: GRADE_SCHEMA },
  };
}

export function parseGradeResponse(json) {
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: keine Antwort erhalten');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Gemini: Antwort ist kein gültiges JSON'); }
  for (const k of ['keyPoints', 'staerke', 'unscharfeStelle', 'nochmalVersuchen', 'vorschlagRating']) {
    if (!(k in parsed)) throw new Error(`Gemini: Feld '${k}' fehlt in der Antwort`);
  }
  return parsed;
}

export async function gradeAnswer({ apiKey, model, fetchFn = globalThis.fetch?.bind(globalThis), ...params }) {
  if (!apiKey) throw new Error('Kein Gemini-Key konfiguriert');
  if (!fetchFn) throw new Error('Kein fetch verfügbar');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGradeRequest(params)),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message ?? ''; } catch { /* Body nicht lesbar/kein JSON */ }
    throw new Error(`Gemini HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return parseGradeResponse(await res.json());
}

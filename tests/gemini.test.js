import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGradeRequest, parseGradeResponse, gradeAnswer, GRADE_SCHEMA } from '../js/gemini.js';

const card = { front: 'Was ist Compliance?', back: 'C = dV/dP', keyPoints: ['Punkt A', 'Punkt B'], why: 'Warum RC-Modell?' };
const gradeResult = {
  keyPoints: [{ point: 'Punkt A', erfuellt: true, kommentar: 'ok' }, { point: 'Punkt B', erfuellt: false, kommentar: 'fehlt' }],
  staerke: 'Grundidee da', unscharfeStelle: 'Reihenschaltung fehlt', nochmalVersuchen: true, vorschlagRating: 'yellow',
};
const okJson = { candidates: [{ content: { parts: [{ text: JSON.stringify(gradeResult) }] } }] };

test('GRADE_SCHEMA verlangt alle fünf Felder', () => {
  assert.deepEqual(GRADE_SCHEMA.required, ['keyPoints', 'staerke', 'unscharfeStelle', 'nochmalVersuchen', 'vorschlagRating']);
});

test('buildGradeRequest: Text-Antwort, kein Audio-Part', () => {
  const req = buildGradeRequest({ systemPrompt: 'SYS', fach: 'MTS', examMode: 'free', ...card, userText: 'meine Antwort', attempt: 1 });
  assert.equal(req.system_instruction.parts[0].text, 'SYS');
  assert.equal(req.contents[0].parts.length, 1);
  assert.match(req.contents[0].parts[0].text, /Fach: MTS \(Prüfungsformat: free\)/);
  assert.match(req.contents[0].parts[0].text, /meine Antwort/);
  assert.equal(req.generationConfig.temperature, 0);
  assert.equal(req.generationConfig.responseMimeType, 'application/json');
});

test('buildGradeRequest: Audio-Antwort hängt inlineData an', () => {
  const req = buildGradeRequest({ systemPrompt: 'SYS', ...card, userAudio: { base64: 'QUJD', mimeType: 'audio/webm' }, attempt: 2 });
  assert.equal(req.contents[0].parts.length, 2);
  assert.deepEqual(req.contents[0].parts[1], { inlineData: { mimeType: 'audio/webm', data: 'QUJD' } });
  assert.match(req.contents[0].parts[0].text, /siehe angehängtes Audio/);
});

test('parseGradeResponse: gültige Antwort wird geparst', () => {
  assert.deepEqual(parseGradeResponse(okJson), gradeResult);
});

test('parseGradeResponse: fehlender Text wirft', () => {
  assert.throws(() => parseGradeResponse({ candidates: [] }), /keine Antwort/);
});

test('parseGradeResponse: kaputtes JSON wirft', () => {
  assert.throws(() => parseGradeResponse({ candidates: [{ content: { parts: [{ text: '{not json' }] } }] }), /kein gültiges JSON/);
});

test('parseGradeResponse: fehlendes Pflichtfeld wirft', () => {
  const bad = { ...gradeResult };
  delete bad.vorschlagRating;
  assert.throws(() => parseGradeResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(bad) }] } }] }), /vorschlagRating/);
});

test('gradeAnswer: ruft die Gemini-URL mit Key auf und liefert die geparste Bewertung', async () => {
  const calls = [];
  const fetchFn = async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => okJson }; };
  const r = await gradeAnswer({ apiKey: 'k123', model: 'gemini-flash-latest', fetchFn, systemPrompt: 'SYS', ...card, userText: 'x', attempt: 1 });
  assert.deepEqual(r, gradeResult);
  assert.match(calls[0].url, /models\/gemini-flash-latest:generateContent\?key=k123/);
  assert.equal(calls[0].opt.method, 'POST');
});

test('gradeAnswer: HTTP-Fehler wirft mit Statuscode und Detail', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Quota exceeded' } }) });
  await assert.rejects(gradeAnswer({ apiKey: 'k', model: 'm', fetchFn, systemPrompt: 'S', ...card, userText: 'x' }), /HTTP 429.*Quota exceeded/);
});

test('gradeAnswer: fehlender Key wirft ohne Netzwerkaufruf', async () => {
  await assert.rejects(gradeAnswer({ apiKey: '', model: 'm', fetchFn: () => assert.fail('darf nicht aufgerufen werden'), systemPrompt: 'S', ...card }), /Kein Gemini-Key/);
});

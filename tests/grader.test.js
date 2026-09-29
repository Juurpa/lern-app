import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRatingToButton, selfAssessRatio, grade, answerMatches, autoCheckKeyPoints } from '../js/grader.js';

const card = { fach: 'MTS', examMode: 'free', front: 'F', back: 'B', keyPoints: ['A', 'B'] };
const gradeResult = { keyPoints: [], staerke: 's', unscharfeStelle: 'u', nochmalVersuchen: false, vorschlagRating: 'green' };
const okJson = { candidates: [{ content: { parts: [{ text: JSON.stringify(gradeResult) }] } }] };

test('mapRatingToButton: nur bekannte Werte durchgereicht', () => {
  assert.equal(mapRatingToButton('green'), 'green');
  assert.equal(mapRatingToButton('rot'), null);
  assert.equal(mapRatingToButton(undefined), null);
});

test('selfAssessRatio: Schwellen bei 80%/40%', () => {
  assert.equal(selfAssessRatio(4, 5), 'green');
  assert.equal(selfAssessRatio(2, 5), 'yellow');
  assert.equal(selfAssessRatio(1, 5), 'red');
  assert.equal(selfAssessRatio(0, 0), null);
});

test('grade: ohne Gemini-Key sofort self-Fallback, kein Netzwerkaufruf', async () => {
  const r = await grade({ settings: { geminiKey: '' }, card, userText: 'x', fetchFn: () => assert.fail('darf nicht aufgerufen werden') });
  assert.deepEqual(r, { source: 'self', revealSolution: true });
});

test('grade: mit Key und Erfolg liefert Gemini-Ergebnis, revealSolution nach nochmalVersuchen', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => okJson });
  const r = await grade({ settings: { geminiKey: 'k', geminiModel: 'm' }, card, userText: 'x', attempt: 1, systemPrompt: 'S', fetchFn });
  assert.equal(r.source, 'gemini');
  assert.equal(r.button, 'green');
  assert.equal(r.revealSolution, true); // nochmalVersuchen: false im Fixture
});

test('grade: attempt 1 mit nochmalVersuchen=true verrät die Lösung noch nicht', async () => {
  const partial = { ...gradeResult, nochmalVersuchen: true, vorschlagRating: 'yellow' };
  const fetchFn = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(partial) }] } }] }) });
  const r = await grade({ settings: { geminiKey: 'k', geminiModel: 'm' }, card, userText: 'x', attempt: 1, systemPrompt: 'S', fetchFn });
  assert.equal(r.revealSolution, false);
});

test('grade: attempt 2 zeigt die Lösung immer, auch bei nochmalVersuchen=true', async () => {
  const partial = { ...gradeResult, nochmalVersuchen: true };
  const fetchFn = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(partial) }] } }] }) });
  const r = await grade({ settings: { geminiKey: 'k', geminiModel: 'm' }, card, userText: 'x', attempt: 2, systemPrompt: 'S', fetchFn });
  assert.equal(r.revealSolution, true);
});

test('grade: Netzwerk-/API-Fehler fällt sauber auf self zurück statt zu werfen', async () => {
  const fetchFn = async () => { throw new Error('network down'); };
  const r = await grade({ settings: { geminiKey: 'k', geminiModel: 'm' }, card, userText: 'x', systemPrompt: 'S', fetchFn });
  assert.equal(r.source, 'self');
  assert.equal(r.revealSolution, true);
  assert.match(r.error, /network down/);
});

test('grade: HTTP-Fehler (z.B. ungültiger Key) fällt auf self zurück', async () => {
  const fetchFn = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid' } }) });
  const r = await grade({ settings: { geminiKey: 'bad-key', geminiModel: 'm' }, card, userText: 'x', systemPrompt: 'S', fetchFn });
  assert.equal(r.source, 'self');
  assert.match(r.error, /API key not valid/);
});

test('answerMatches: Groß-/Kleinschreibung, Leerzeichen, Bindestrich, Umlaute egal', () => {
  assert.ok(answerMatches('  Fourier Transformation ', 'Fourier-Transformation'));
  assert.ok(answerMatches('ueberabtastung', 'Überabtastung'));
  assert.ok(answerMatches('MASSE', 'Maße'.replace('ße', 'sse')));
  assert.ok(!answerMatches('', 'x'));
  assert.ok(!answerMatches('Laplace', 'Fourier'));
});

test('answerMatches: „A/B“-Alternativen und Klammerzusätze', () => {
  assert.ok(answerMatches('Rechteck', 'Rechteck/Boxcar'));
  assert.ok(answerMatches('boxcar', 'Rechteck/Boxcar'));
  assert.ok(answerMatches('Nyquist', 'Nyquist (Abtasttheorem)'));
  assert.ok(answerMatches('Abtasttheorem', 'Nyquist (Abtasttheorem)'));
  assert.ok(!answerMatches('Abt', 'Nyquist (Abtasttheorem)'));
});

test('answerMatches: ein Tippfehler bei langen Wörtern ok, nicht bei kurzen Wörtern oder Zahlen', () => {
  assert.ok(answerMatches('Abtasttheorm', 'Abtasttheorem'));
  assert.ok(!answerMatches('Abtasttheorm', 'Abtastfrequenz'));
  assert.ok(!answerMatches('Ohn', 'Ohm'));
  assert.ok(!answerMatches('5', '6'));
  assert.ok(!answerMatches('Faktor 12', 'Faktor 13'), 'Ziffern müssen exakt stimmen');
});

test('autoCheckKeyPoints: schlägt Kernpunkte anhand der Inhaltswörter vor', () => {
  const kps = ['Abtastrate mindestens doppelt so hoch wie die Signalbandbreite', 'Aliasing entsteht bei zu niedriger Abtastung', 'Tiefpassfilter vor dem Abtasten'];
  const r = autoCheckKeyPoints('Die Abtastrate muss mindestens doppelte Signalbandbreite haben, sonst entsteht Aliasing, weil zu niedrig abgetastet wird.', kps);
  assert.deepEqual(r, [true, true, false]);
  assert.deepEqual(autoCheckKeyPoints('', kps), [false, false, false]);
  assert.deepEqual(autoCheckKeyPoints('egal', undefined), []);
  assert.deepEqual(autoCheckKeyPoints('egal', ['und der']), [false], 'nur Füllwörter → nie automatisch angehakt');
});

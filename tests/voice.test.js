import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickInputMode, getSpeechRecognitionCtor, createSpeechInput, recordAudio } from '../js/voice.js';

test('pickInputMode: Speech Recognition hat Vorrang', () => {
  assert.equal(pickInputMode({ hasSpeechRecognition: true, hasMediaRecorder: true, hasGeminiKey: true }), 'speech');
  assert.equal(pickInputMode({ hasSpeechRecognition: true, hasMediaRecorder: false, hasGeminiKey: false }), 'speech');
});

test('pickInputMode: Audioaufnahme nur als Fallback UND nur mit Gemini-Key', () => {
  assert.equal(pickInputMode({ hasSpeechRecognition: false, hasMediaRecorder: true, hasGeminiKey: true }), 'audio');
  assert.equal(pickInputMode({ hasSpeechRecognition: false, hasMediaRecorder: true, hasGeminiKey: false }), 'text');
});

test('pickInputMode: ohne beides bleibt Tippen', () => {
  assert.equal(pickInputMode({ hasSpeechRecognition: false, hasMediaRecorder: false, hasGeminiKey: true }), 'text');
});

test('getSpeechRecognitionCtor: findet Standard- oder webkit-Variante, sonst null', () => {
  assert.equal(getSpeechRecognitionCtor({}), null);
  const ctor = function () {};
  assert.equal(getSpeechRecognitionCtor({ SpeechRecognition: ctor }), ctor);
  assert.equal(getSpeechRecognitionCtor({ webkitSpeechRecognition: ctor }), ctor);
});

let instances;
function FakeSpeechRecognition() { instances.push(this); }

test('createSpeechInput: finales + interimes Transkript wird zusammengesetzt', () => {
  instances = [];
  const events = [];
  createSpeechInput({ SpeechRecognitionCtor: FakeSpeechRecognition, onTranscript: (live, final) => events.push({ live, final }) });
  const rec = instances[0];
  assert.equal(rec.lang, 'de-DE');
  assert.equal(rec.continuous, true);
  rec.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'hallo' } }] });
  assert.deepEqual(events[0], { live: 'hallo', final: '' });
  rec.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'hallo welt' } }] });
  assert.deepEqual(events[1], { live: 'hallo welt', final: 'hallo welt' });
  // zweiter finaler Satz wird an den ersten angehängt, nicht ersetzt
  rec.onresult({ resultIndex: 1, results: [{ isFinal: true, 0: { transcript: 'hallo welt' } }, { isFinal: true, 0: { transcript: 'zweiter satz' } }] });
  assert.deepEqual(events[2], { live: 'hallo welt zweiter satz', final: 'hallo welt zweiter satz' });
});

test('createSpeechInput: onend/onerror werden durchgereicht, start/stop delegieren', () => {
  instances = [];
  let ended, errored;
  const started = [];
  FakeSpeechRecognition.prototype.start = function () { started.push('start'); };
  FakeSpeechRecognition.prototype.stop = function () { started.push('stop'); };
  const input = createSpeechInput({ SpeechRecognitionCtor: FakeSpeechRecognition, onEnd: f => (ended = f), onError: e => (errored = e) });
  input.start(); input.stop();
  assert.deepEqual(started, ['start', 'stop']);
  instances[0].onerror({ error: 'not-allowed' });
  assert.equal(errored, 'not-allowed');
  instances[0].onend();
  assert.equal(ended, '');
});

class FakeMediaRecorder {
  constructor(stream, opts) { this.stream = stream; this.opts = opts; }
  start() { this.started = true; }
  stop() {
    this.ondataavailable?.({ data: new Blob(['fake-audio-bytes'], { type: this.opts.mimeType }) });
    this.onstop?.();
  }
}
const fakeStream = { getTracks: () => [{ stop: () => {} }] };
const fakeMediaDevices = { getUserMedia: async () => fakeStream };

test('recordAudio: nimmt auf und liefert base64 + mimeType nach stop()', async () => {
  const rec = await recordAudio({ mediaDevices: fakeMediaDevices, MediaRecorderCtor: FakeMediaRecorder, mimeType: 'audio/webm' });
  rec.stop();
  const r = await rec.result;
  assert.equal(r.mimeType, 'audio/webm');
  assert.equal(typeof r.base64, 'string');
  assert.ok(r.base64.length > 0);
});

test('recordAudio: ohne getUserMedia wirft verständliche Meldung', async () => {
  await assert.rejects(recordAudio({ mediaDevices: {}, MediaRecorderCtor: FakeMediaRecorder }), /Kein Mikrofonzugriff/);
});

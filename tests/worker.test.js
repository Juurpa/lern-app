import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, cleanEvent } from '../worker/src/handlers.js';

function fakeKV() {
  const m = new Map();
  return {
    m,
    puts: [],
    async put(k, v, opts) { m.set(k, v); this.puts.push({ k, v, opts }); },
    async get(k) { return m.get(k) ?? null; },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true }; },
  };
}
const env = () => ({ LERN: fakeKV(), DEVICE_KEY: 'dev-key', ADMIN_KEY: 'admin-key' });
const ORIGIN = 'https://juurpa.github.io';
const now = new Date('2026-09-23T10:00:00.000Z');
const ev = (o = {}) => ({ eventId: 'e1', type: 'review', cardId: 'MTS-K2-01', rev: 1, fach: 'MTS', button: 'red', mode: 'free', hinted: false, answer: 'Summe', ms: 4200, ts: '2026-09-23T09:59:00.000Z', sessionId: 's1', ...o });
const post = (body, key = 'dev-key') => new Request('https://w.example/events', { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (q, key = 'admin-key') => new Request(`https://w.example/events${q}`, { headers: { Authorization: `Bearer ${key}` } });

test('health und CORS-Preflight', async () => {
  const e = env();
  assert.equal(await (await handle(new Request('https://w.example/health'), e, now)).text(), 'ok');
  const pre = await handle(new Request('https://w.example/events', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), e, now);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const bad = await handle(new Request('https://w.example/events', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), e, now);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('POST /events braucht den Geräteschlüssel', async () => {
  const res = await handle(post({ events: [ev()] }, 'falsch'), env(), now);
  assert.equal(res.status, 401);
});

test('POST /events speichert bereinigte Ereignisse als Batch', async () => {
  const e = env();
  const res = await handle(post({ events: [ev(), ev({ eventId: 'e2', answer: 'x'.repeat(5000) }), { kaputt: true }, ev({ eventId: 'e3', button: 'blau' })] }), e, now);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stored: 2 });
  const [key] = [...e.LERN.m.keys()];
  assert.match(key, /^b:2026-09-23T10:00:00\.000Z:/);
  const stored = JSON.parse(e.LERN.m.get(key));
  assert.equal(stored[1].answer.length, 2000);
  assert.equal(e.LERN.puts.length, 1);
  assert.deepEqual(e.LERN.puts[0].opts, { expirationTtl: 60 * 60 * 24 * 120 });
});

test('POST /events: kaputtes JSON 400, zu groß 413, leer 200', async () => {
  assert.equal((await handle(post('{kaputt'), env(), now)).status, 400);
  assert.equal((await handle(post({ events: [ev({ answer: 'x'.repeat(300000) })] }), env(), now)).status, 413);
  assert.deepEqual(await (await handle(post({ events: [] }), env(), now)).json(), { stored: 0 });
});

test('GET /events?day= liefert die Ereignisse des Tages, nur mit Admin-Schlüssel', async () => {
  const e = env();
  await handle(post({ events: [ev()] }), e, now);
  await handle(post({ events: [ev({ eventId: 'e9' })] }), e, new Date('2026-09-24T01:00:00.000Z'));
  assert.equal((await handle(get('?day=2026-09-23', 'dev-key'), e, now)).status, 401);
  assert.equal((await handle(get(''), e, now)).status, 400);
  const body = await (await handle(get('?day=2026-09-23'), e, now)).json();
  assert.equal(body.day, '2026-09-23');
  assert.deepEqual(body.events.map(x => x.eventId), ['e1']);
});

test('cleanEvent: Veto ohne Button erlaubt, Review ohne gültigen Button nicht', () => {
  assert.equal(cleanEvent({ eventId: 'v', type: 'veto', cardId: 'X', ts: '2026-09-23T10:00:00Z' }).type, 'veto');
  assert.equal(cleanEvent(ev({ button: undefined })), null);
  assert.equal(cleanEvent(ev({ ts: 'gestern' })), null);
});

test('unbekannte Route 404', async () => {
  assert.equal((await handle(new Request('https://w.example/nix'), env(), now)).status, 404);
});

test('POST /events: UTF-8 byte size > 256KB (string.length deceptively small) → 413', async () => {
  const answerWithUmlauts = 'ä'.repeat(140000);
  assert(answerWithUmlauts.length < 256 * 1024, 'string length should be < 256KB');
  assert(new TextEncoder().encode(answerWithUmlauts).length > 256 * 1024, 'UTF-8 byte size should be > 256KB');
  const res = await handle(post({ events: [ev({ answer: answerWithUmlauts })] }), env(), now);
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'too large' });
});

test('POST /events: > 200 events → 413', async () => {
  const events = Array.from({ length: 201 }, (_, i) => ev({ eventId: `e${i}` }));
  const res = await handle(post({ events }), env(), now);
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'too many events' });
});

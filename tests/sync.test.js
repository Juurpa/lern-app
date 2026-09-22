import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeReviewEvent, enqueue, createSync, QUEUE_KEY } from '../js/sync.js';

const fakeStorage = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const card = { id: 'MTS-K2-01', fach: 'MTS', rev: 2 };
const now = new Date('2026-09-23T10:00:00Z');
const ev = i => makeReviewEvent({ card, button: 'red', mode: 'free', hinted: false, answer: `a${i}`, ms: 1000, sessionId: 's', now });

test('makeReviewEvent: Felder, Kürzung, leere Antwort', () => {
  const e = makeReviewEvent({ card, button: 'green', mode: 'calc', hinted: true, answer: '  ' + 'x'.repeat(3000), ms: 12.7, sessionId: 's', now });
  assert.equal(e.type, 'review');
  assert.equal(e.cardId, 'MTS-K2-01');
  assert.equal(e.rev, 2);
  assert.equal(e.answer.length, 2000);
  assert.equal(e.ms, 13);
  assert.equal(e.ts, '2026-09-23T10:00:00.000Z');
  assert.equal(typeof e.eventId, 'string');
  assert.equal(makeReviewEvent({ card: { id: 'X', fach: 'MTS' }, button: 'red', mode: 'mc', answer: '   ', now }).answer, undefined);
  assert.equal(makeReviewEvent({ card: { id: 'X', fach: 'MTS' }, button: 'red', mode: 'mc', now }).rev, 1);
});

test('enqueue verwirft die ältesten über dem Limit', () => {
  const r = enqueue([1, 2, 3], 4, 3);
  assert.deepEqual(r, { queue: [2, 3, 4], dropped: 1 });
});

test('flush ohne Schlüssel oder URL sendet nichts', async () => {
  const s = createSync({ storage: fakeStorage(), fetchFn: () => assert.fail('darf nicht senden'), getConfig: () => ({ url: 'https://w', key: '' }) });
  s.push(ev(1));
  assert.deepEqual(await s.flush(), { sent: 0, pending: 1, skipped: true });
});

test('flush sendet in Batches zu 100 und leert die Warteschlange', async () => {
  const calls = [];
  const fetchFn = async (url, opt) => { calls.push({ url, opt }); return { ok: true, status: 200 }; };
  const st = fakeStorage();
  const s = createSync({ storage: st, fetchFn, getConfig: () => ({ url: 'https://w', key: 'k' }) });
  for (let i = 0; i < 250; i++) s.push(ev(i));
  const r = await s.flush();
  assert.deepEqual(r, { sent: 250, pending: 0 });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://w/events');
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer k');
  assert.equal(JSON.parse(calls[0].opt.body).events.length, 100);
  assert.ok(s.status().lastSent);
});

test('flush-Fehler behält die Warteschlange und merkt den Fehler', async () => {
  const s = createSync({ storage: fakeStorage(), fetchFn: async () => ({ ok: false, status: 500 }), getConfig: () => ({ url: 'https://w', key: 'k' }) });
  s.push(ev(1));
  const r = await s.flush();
  assert.deepEqual(r, { sent: 0, pending: 1 });
  assert.equal(s.status().lastError, 'HTTP 500');
});

test('flush halbiert die Batchgröße bei HTTP 413 und sendet weiter', async () => {
  const sizes = [];
  const fetchFn = async (url, opt) => {
    const n = JSON.parse(opt.body).events.length;
    sizes.push(n);
    if (n > 25) return { ok: false, status: 413 };
    return { ok: true, status: 200 };
  };
  const s = createSync({ storage: fakeStorage(), fetchFn, getConfig: () => ({ url: 'https://w', key: 'k' }) });
  for (let i = 0; i < 100; i++) s.push(ev(i));
  const r = await s.flush();
  assert.deepEqual(r, { sent: 100, pending: 0 });
  // 100 → 413, 50 → 413, 25 geht durch (min 1 als Untergrenze der Halbierung)
  assert.deepEqual(sizes, [100, 50, 25, 25, 25, 25]);
});

test('flush verwirft ein einzelnes Ereignis, das auch bei Batchgröße 1 mit 413 abgelehnt wird', async () => {
  const fetchFn = async () => ({ ok: false, status: 413 });
  const s = createSync({ storage: fakeStorage(), fetchFn, getConfig: () => ({ url: 'https://w', key: 'k' }) });
  s.push(ev(1));
  const r = await s.flush();
  assert.deepEqual(r, { sent: 0, pending: 0 });
  assert.match(s.status().lastError, /413/);
});

test('Netzwerkfehler wird abgefangen', async () => {
  const s = createSync({ storage: fakeStorage(), fetchFn: async () => { throw new Error('offline'); }, getConfig: () => ({ url: 'https://w', key: 'k' }) });
  s.push(ev(1));
  assert.deepEqual(await s.flush(), { sent: 0, pending: 1 });
  assert.equal(s.status().lastError, 'offline');
});

test('gleichzeitige flush-Aufrufe teilen sich einen Lauf', async () => {
  let n = 0;
  const s = createSync({ storage: fakeStorage(), fetchFn: async () => { n++; await new Promise(r => setTimeout(r, 5)); return { ok: true }; }, getConfig: () => ({ url: 'https://w', key: 'k' }) });
  s.push(ev(1));
  const [a, b] = await Promise.all([s.flush(), s.flush()]);
  assert.equal(n, 1);
  assert.deepEqual(a, b);
});

test('push() begrenzt die Warteschlange auf 200, solange kein Sync-Schlüssel konfiguriert ist', () => {
  const s = createSync({ storage: fakeStorage(), fetchFn: async () => ({ ok: true }), getConfig: () => ({ key: '' }) });
  for (let i = 0; i < 250; i++) s.push(ev(i));
  assert.equal(s.pending(), 200);
});

test('push() erlaubt bis MAX_QUEUE, sobald ein Sync-Schlüssel konfiguriert ist', () => {
  const s = createSync({ storage: fakeStorage(), fetchFn: async () => ({ ok: true }), getConfig: () => ({ key: 'k' }) });
  for (let i = 0; i < 250; i++) s.push(ev(i));
  assert.equal(s.pending(), 250);
});

test('kaputte Warteschlange im Speicher gilt als leer', () => {
  const st = fakeStorage();
  st.setItem(QUEUE_KEY, '{kaputt');
  assert.equal(createSync({ storage: st, fetchFn: async () => ({ ok: true }), getConfig: () => ({}) }).pending(), 0);
});

test('push() wirft nicht, wenn der Speicher voll ist (QUEUE_KEY-Schreibfehler)', () => {
  const st = fakeStorage();
  const realSetItem = st.setItem;
  st.setItem = (k, v) => { if (k === QUEUE_KEY) throw new Error('QuotaExceededError'); return realSetItem(k, v); };
  const s = createSync({ storage: st, fetchFn: async () => ({ ok: true }), getConfig: () => ({}) });
  assert.doesNotThrow(() => s.push(ev(1)));
  assert.equal(s.status().lastError, 'Speicher voll – Ereignis nicht gespeichert');
});

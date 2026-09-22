// Lernereignisse: lokale Warteschlange, Versand an den Worker (Storage/Fetch injizierbar, damit testbar).
export const QUEUE_KEY = 'lernapp.queue.v1';
export const STATUS_KEY = 'lernapp.sync.v1';
export const MAX_QUEUE = 2000;
export const BATCH = 100;
const MAX_TEXT = 2000;

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function makeReviewEvent({ card, button, mode, hinted, answer, ms, sessionId, now }) {
  const text = typeof answer === 'string' && answer.trim() ? answer.trim().slice(0, MAX_TEXT) : undefined;
  return {
    eventId: uuid(), type: 'review', cardId: card.id, rev: card.rev ?? 1, fach: card.fach,
    button, mode, hinted: Boolean(hinted), answer: text,
    ms: Number.isFinite(ms) ? Math.round(ms) : undefined, ts: now.toISOString(), sessionId,
  };
}

export function makeVetoEvent({ card, now }) {
  return { eventId: uuid(), type: 'veto', cardId: card.id, rev: card.rev ?? 1, fach: card.fach, ts: now.toISOString() };
}

export function enqueue(queue, ev, max = MAX_QUEUE) {
  const q = [...queue, ev];
  const dropped = Math.max(0, q.length - max);
  return { queue: dropped ? q.slice(dropped) : q, dropped };
}

export function createSync({ storage = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis), getConfig }) {
  const readJson = (k, fallback) => { try { return JSON.parse(storage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; } };
  const readQueue = () => { const q = readJson(QUEUE_KEY, []); return Array.isArray(q) ? q : []; };
  const writeQueue = q => storage.setItem(QUEUE_KEY, JSON.stringify(q));
  const status = () => ({ lastSent: null, lastError: null, dropped: 0, ...readJson(STATUS_KEY, {}) });
  const setStatus = patch => storage.setItem(STATUS_KEY, JSON.stringify({ ...status(), ...patch }));
  let running = null;

  return {
    pending: () => readQueue().length,
    status,
    push(ev) {
      try {
        const r = enqueue(readQueue(), ev);
        writeQueue(r.queue);
        if (r.dropped) setStatus({ dropped: status().dropped + r.dropped });
      } catch {
        // Speicher voll (z. B. QuotaExceededError): älteste Hälfte verwerfen und einmal erneut versuchen.
        try {
          const q = readQueue();
          const half = q.slice(Math.ceil(q.length / 2));
          writeQueue(enqueue(half, ev).queue);
        } catch {
          try { setStatus({ lastError: 'Speicher voll – Ereignis nicht gespeichert' }); } catch { /* auch Status nicht schreibbar: aufgeben, aber nie werfen */ }
        }
      }
    },
    flush() {
      if (running) return running;
      running = (async () => {
        const { url, key } = getConfig() ?? {};
        if (!url || !key) return { sent: 0, pending: readQueue().length, skipped: true };
        let sent = 0;
        try {
          for (;;) {
            const batch = readQueue().slice(0, BATCH);
            if (!batch.length) break;
            const res = await fetchFn(`${url}/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({ events: batch }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const ids = new Set(batch.map(e => e.eventId));
            writeQueue(readQueue().filter(e => !ids.has(e.eventId)));
            sent += batch.length;
            setStatus({ lastSent: new Date().toISOString(), lastError: null });
          }
        } catch (e) {
          setStatus({ lastError: e.message });
        }
        return { sent, pending: readQueue().length };
      })().finally(() => { running = null; });
      return running;
    },
  };
}

const MAX_BODY = 256 * 1024;
const MAX_TEXT = 2000;
const ALLOWED_ORIGINS = ['https://juurpa.github.io', 'http://localhost:8080'];

const corsHeaders = origin => (ALLOWED_ORIGINS.includes(origin)
  ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' }
  : {});
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const bearer = req => (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
const isIso = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : undefined);

export function cleanEvent(e) {
  if (!e || typeof e.eventId !== 'string' || typeof e.cardId !== 'string' || !isIso(e.ts)) return null;
  const type = e.type === 'veto' ? 'veto' : 'review';
  if (type === 'review' && !['red', 'yellow', 'green'].includes(e.button)) return null;
  return {
    eventId: e.eventId.slice(0, 64), type, cardId: e.cardId.slice(0, 80), rev: Number(e.rev) || 1,
    fach: clip(e.fach, 10), button: type === 'review' ? e.button : undefined, mode: clip(e.mode, 10),
    hinted: Boolean(e.hinted), answer: clip(e.answer, MAX_TEXT), feedback: clip(e.feedback, MAX_TEXT),
    ms: Number.isFinite(e.ms) ? Math.max(0, Math.round(e.ms)) : undefined, ts: e.ts, sessionId: clip(e.sessionId, 64),
  };
}

export async function handle(req, env, now = new Date()) {
  const url = new URL(req.url);
  const cors = corsHeaders(req.headers.get('Origin') ?? '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/health') return new Response('ok', { headers: cors });

  if (url.pathname === '/events' && req.method === 'POST') {
    if (!env.DEVICE_KEY || bearer(req) !== env.DEVICE_KEY) return json({ error: 'unauthorized' }, 401, cors);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too large' }, 413, cors);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400, cors); }
    const events = (Array.isArray(body?.events) ? body.events : []).map(cleanEvent).filter(Boolean);
    if (!events.length) return json({ stored: 0 }, 200, cors);
    await env.LERN.put(`b:${now.toISOString()}:${crypto.randomUUID()}`, JSON.stringify(events));
    return json({ stored: events.length }, 200, cors);
  }

  if (url.pathname === '/events' && req.method === 'GET') {
    if (!env.ADMIN_KEY || bearer(req) !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401, cors);
    const day = url.searchParams.get('day') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'day=YYYY-MM-DD required' }, 400, cors);
    const events = [];
    let cursor;
    do {
      const list = await env.LERN.list({ prefix: `b:${day}`, cursor });
      for (const k of list.keys) {
        const v = await env.LERN.get(k.name);
        if (v) events.push(...JSON.parse(v));
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    return json({ day, events }, 200, cors);
  }

  return json({ error: 'not found' }, 404, cors);
}

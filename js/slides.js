// Folienbilder: Referenzen "deck:seite" bzw. "deck:seite@x0,y0,x1,y1" (Ausschnitt, relativ 0..1).
// Die Bilder liegen NICHT im öffentlichen Repo, sondern hinter dem Worker (Geräteschlüssel) –
// hier: Parsen/Prüfen (DOM-frei) und ein Loader mit eigenem, versionsunabhängigem Offline-Cache.

export const SLIDE_CACHE = 'lernapp-slides-v1';
const REF = /^([a-z0-9-]+):(\d+)(?:@([\d.]+),([\d.]+),([\d.]+),([\d.]+))?$/;

export function parseRef(ref) {
  const m = REF.exec(String(ref ?? ''));
  if (!m) return null;
  return { deck: m[1], page: Number(m[2]), crop: m[3] ? [m[3], m[4], m[5], m[6]] : null };
}

export function checkRef(ref, decksById) {
  const r = parseRef(ref);
  if (!r) return `ungültige Folien-Referenz '${ref}'`;
  const deck = decksById.get(r.deck);
  if (!deck) return `unbekannter Foliensatz '${r.deck}' in '${ref}'`;
  if (r.page < 1 || r.page > deck.pages) return `Seite ${r.page} außerhalb von '${r.deck}' (1–${deck.pages})`;
  if (r.crop) {
    const [x0, y0, x1, y1] = r.crop.map(Number);
    if (![x0, y0, x1, y1].every(v => v >= 0 && v <= 1) || x0 >= x1 || y0 >= y1) return `ungültiger Ausschnitt in '${ref}'`;
  }
  return null;
}

export function refPath(ref) {
  const r = parseRef(ref);
  if (!r) throw new Error(`ungültige Folien-Referenz '${ref}'`);
  return `slides/${r.deck}/${String(r.page).padStart(3, '0')}${r.crop ? `@${r.crop.join('_')}` : ''}.webp`;
}

export const pageRef = (deck, page) => `${deck}:${page}`;
export const deckRefs = deck => Array.from({ length: deck.pages }, (_, i) => pageRef(deck.id, i + 1));

export function refLabel(ref, decksById) {
  const r = parseRef(ref);
  if (!r) return String(ref);
  const deck = decksById?.get(r.deck);
  return `${deck ? deck.title : r.deck} · Folie ${r.page}${r.crop ? ' (Ausschnitt)' : ''}`;
}

// Filtert ungültige Referenzen heraus und liefert die Fehlermeldungen dazu.
export function cleanRefs(refs, decksById) {
  const ok = [];
  const problems = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const p = checkRef(ref, decksById);
    if (p) problems.push(p); else if (!ok.includes(ref)) ok.push(ref);
  }
  return { ok, problems };
}

export function createSlideLoader({ baseUrl, getKey, fetchFn = globalThis.fetch?.bind(globalThis), cachesApi = globalThis.caches }) {
  const urls = new Map();
  const abs = ref => `${String(baseUrl ?? '').replace(/\/+$/, '')}/${refPath(ref)}`;
  const cache = () => (cachesApi ? cachesApi.open(SLIDE_CACHE) : Promise.resolve(null));

  async function load(ref) {
    const url = abs(ref);
    const c = await cache();
    const hit = c && await c.match(url);
    if (hit) return hit.blob();
    const key = getKey?.();
    if (!baseUrl) throw new Error('Keine Worker-URL konfiguriert');
    if (!key) throw new Error('Sync-Schlüssel fehlt (Einstellungen)');
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(res.status === 401 ? 'Sync-Schlüssel ungültig' : `HTTP ${res.status}`);
    if (c) await c.put(url, res.clone());
    return res.blob();
  }

  return {
    abs,
    load,
    async objectUrl(ref) {
      if (urls.has(ref)) return urls.get(ref);
      const u = URL.createObjectURL(await load(ref));
      urls.set(ref, u);
      if (urls.size > 300) { const [k, v] = urls.entries().next().value; URL.revokeObjectURL(v); urls.delete(k); }
      return u;
    },
    async isCached(ref) {
      const c = await cache();
      return Boolean(c && await c.match(abs(ref)));
    },
    async countCached(refs) {
      const c = await cache();
      if (!c) return 0;
      let n = 0;
      for (const r of refs) if (await c.match(abs(r))) n++;
      return n;
    },
    // Lädt alle Referenzen parallel (begrenzt) in den Offline-Cache; bricht bei Auth-Fehlern ab.
    async prefetch(refs, onProgress = () => {}, concurrency = 6) {
      let done = 0, failed = 0, fatal = null, i = 0;
      const next = async () => {
        while (i < refs.length && !fatal) {
          const ref = refs[i++];
          try { await load(ref); }
          catch (e) { failed++; if (/Schlüssel|Worker-URL/.test(e.message)) fatal = e; }
          onProgress(++done, refs.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, refs.length) }, next));
      if (fatal) throw fatal;
      return { done, failed };
    },
  };
}

import { DATA_FILES } from './data.js';

export const VERSION_FILE = 'data/version.json';
export const DATA_URLS = [DATA_FILES.meta, DATA_FILES.units, ...DATA_FILES.cards, DATA_FILES.bridges, DATA_FILES.synthesis, DATA_FILES.decks, DATA_FILES.exercises, VERSION_FILE];
const APP_CACHE = /^lernapp-v\d+$/; // nicht den Folien-Cache (lernapp-slides-…) erwischen

export const hasUpdate = (loaded, remote) => Boolean(remote?.version) && remote.version !== loaded?.version;

export async function fetchRemoteVersion(fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(`${VERSION_FILE}?check=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function applyUpdate({ cachesApi = globalThis.caches, fetchFn = globalThis.fetch, urls = DATA_URLS } = {}) {
  const name = cachesApi ? (await cachesApi.keys()).find(k => APP_CACHE.test(k)) : undefined;
  const cache = name ? await cachesApi.open(name) : null;
  for (const u of urls) {
    // SW-Cache umgehen (Stale-while-revalidate liefert sonst weiter den alten Stand zurück).
    const r = await fetchFn(`${u}?check=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
    if (cache) await cache.put(u, r.clone()); // App-Cache-Key bleibt die reine URL
  }
}

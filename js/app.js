import { loadData } from './data.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { renderStart } from './ui/start.js';
import { renderLearn } from './ui/learn.js';
import { renderGaps } from './ui/gaps.js';
import { renderSettings } from './ui/settings.js';
import { renderSetup } from './ui/setup.js';

const root = document.getElementById('app');
const ctx = { data: null, store: createStore(), root };
const ROUTES = { '': renderStart, learn: renderLearn, gaps: renderGaps, settings: renderSettings, setup: renderSetup };

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const view = ROUTES[path] ?? renderStart;
  root.replaceChildren();
  window.scrollTo(0, 0);
  view(ctx, new URLSearchParams(query ?? ''));
}

async function main() {
  navigator.storage?.persist?.().catch(() => {}); // Fortschritt vor automatischer Löschung schützen
  ctx.data = await loadData(p => fetch(p).then(r => {
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  }));
  ctx.sync = createSync({ getConfig: () => ({ url: ctx.data.meta.workerUrl, key: ctx.store.load().settings.syncKey }) });
  ctx.sync.flush();
  window.addEventListener('online', () => ctx.sync.flush());
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main().catch(e => { root.textContent = `Fehler beim Laden: ${e.message}`; });

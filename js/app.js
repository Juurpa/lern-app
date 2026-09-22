import { loadData } from './data.js';
import { createStore } from './store.js';
import { renderStart } from './ui/start.js';
import { renderLearn } from './ui/learn.js';
import { renderGaps } from './ui/gaps.js';
import { renderSettings } from './ui/settings.js';

const root = document.getElementById('app');
const ctx = { data: null, store: createStore(), root };
const ROUTES = { '': renderStart, learn: renderLearn, gaps: renderGaps, settings: renderSettings };

function route() {
  const view = ROUTES[location.hash.replace(/^#\/?/, '')] ?? renderStart;
  root.replaceChildren();
  window.scrollTo(0, 0);
  view(ctx);
}

async function main() {
  navigator.storage?.persist?.().catch(() => {}); // Fortschritt vor automatischer Löschung schützen
  ctx.data = await loadData(p => fetch(p).then(r => {
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  }));
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main().catch(e => { root.textContent = `Fehler beim Laden: ${e.message}`; });

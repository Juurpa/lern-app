const CACHE = 'lernapp-v6';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/app.css',
  'js/app.js', 'js/calc.js', 'js/data.js', 'js/gaps.js', 'js/render.js', 'js/scheduler.js', 'js/session.js', 'js/store.js', 'js/sync.js', 'js/update.js',
  'js/ui/card.js', 'js/ui/gaps.js', 'js/ui/learn.js', 'js/ui/settings.js', 'js/ui/setup.js', 'js/ui/start.js', 'js/ui/unit.js',
  'data/bridges.json', 'data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json',
  'data/meta.json', 'data/synthesis.json', 'data/units.json', 'data/version.json'
];

// Exakt versionierte CDN-Bibliotheken (identisch zu index.html) + KaTeX-Grundschriften:
// werden bei der Installation vorgeladen, damit die App auch direkt nach einem Update offline startet.
const CDN = [
  'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/contrib/auto-render.min.js',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/styles/github-dark.min.css',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/highlight.min.js',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/languages/matlab.min.js',
  'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Main-Regular.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Main-Bold.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Main-Italic.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Math-Italic.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size1-Regular.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size2-Regular.woff2',
  'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_AMS-Regular.woff2'
];

// Atomar: schlägt ein Download fehl, bleibt die alte Version samt Cache aktiv.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...SHELL, ...CDN.map(u => new Request(u, { mode: 'cors' }))])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Stale-while-revalidate: sofort aus dem Cache, im Hintergrund aktualisieren.
// Neue Inhalte erscheinen damit beim nächsten Start der App.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'generativelanguage.googleapis.com') return;
  if (url.searchParams.has('check')) return; // Update-Prüfung immer direkt ans Netz
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request)
      // Hintergrund-Update: eine online geladene Ressource ist ab dem nächsten Start offline verfügbar.
      .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
      .catch(() => hit ?? Response.error());
    return hit ?? net;
  }));
});

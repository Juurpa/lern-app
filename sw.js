const CACHE = 'lernapp-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'js/app.js', 'js/data.js', 'js/gaps.js', 'js/render.js', 'js/scheduler.js', 'js/session.js', 'js/store.js',
  'js/ui/card.js', 'js/ui/gaps.js', 'js/ui/learn.js', 'js/ui/settings.js', 'js/ui/start.js', 'js/ui/unit.js',
  'data/bridges.json', 'data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json',
  'data/meta.json', 'data/synthesis.json', 'data/units.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request)
      .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
      .catch(() => hit);
    return hit ?? net;
  }));
});

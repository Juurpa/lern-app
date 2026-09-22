import { h } from '../render.js';

export function renderSetup({ store, root, sync }, params) {
  const key = params.get('k') ?? '';
  history.replaceState(null, '', `${location.pathname}#/setup`); // Schlüssel aus Adresse und Verlauf entfernen
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(key)) {
    root.append(h('<section class="card"><h1>Ungültiger Einrichtungslink</h1><a class="btn" href="#/">Zurück</a></section>'));
    return;
  }
  const doc = store.load();
  doc.settings.syncKey = key;
  store.save(doc);
  sync?.flush();
  root.append(h(`<section class="card"><h1>Lernmaschine verbunden ✓</h1>
    <p>Deine Bewertungen werden ab jetzt an die Lernmaschine gesendet und nachts ausgewertet.</p>
    <a class="btn primary" href="#/">Los geht's</a></section>`));
}

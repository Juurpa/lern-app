import { h, esc, download } from '../render.js';
import { emptyDoc } from '../store.js';

export function renderSettings({ data, store, root }) {
  const doc = store.load();
  const s = doc.settings;
  const problems = [...data.errors, ...data.warnings];
  const el = h(`<section>
    <h1>Einstellungen</h1>
    <div class="panel">
      <label>Neue Karten pro Session<input type="number" id="newPer" min="0" max="50" value="${s.newPerSession}"></label>
    </div>
    <div class="panel">
      <h3>Gemini (optional)</h3>
      <label>API-Key (bleibt nur auf diesem Gerät)<input type="password" id="key" value="${esc(s.geminiKey)}" autocomplete="off"></label>
      <label>Modell<input type="text" id="model" value="${esc(s.geminiModel)}"></label>
    </div>
    <div class="panel">
      <h3>Sicherung</h3>
      <div class="row"><button id="exp">Exportieren</button><label class="btn">Importieren<input type="file" id="imp" accept="application/json" hidden></label></div>
      <p class="muted">Der Export enthält keinen API-Key.</p>
      <button id="reset">Fortschritt zurücksetzen</button>
    </div>
    <div class="panel"><h3>Datenprüfung</h3>
      <p>${data.cards.length} Karten geladen · ${data.errors.length} Fehler · ${data.warnings.length} Warnungen</p>
      ${problems.length ? `<details><summary>Details</summary><pre>${esc(problems.join('\n'))}</pre></details>` : ''}
    </div>
    <nav class="bottom"><a class="btn primary" href="#/" id="save">Speichern &amp; zurück</a></nav>
  </section>`);
  const q = sel => el.querySelector(sel);
  q('#save').onclick = () => {
    doc.settings = { ...s, newPerSession: Math.max(0, Number(q('#newPer').value) || 0), geminiKey: q('#key').value.trim(), geminiModel: q('#model').value.trim() || s.geminiModel };
    store.save(doc);
  };
  q('#exp').onclick = () => download(`lernapp-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson(doc));
  q('#imp').onchange = async e => {
    try { store.importJson(await e.target.files[0].text(), s.geminiKey); alert('Import erfolgreich.'); location.hash = '#/'; }
    catch (err) { alert(err.message); }
  };
  q('#reset').onclick = () => {
    if (!confirm('Wirklich den gesamten Lernfortschritt löschen? Vorher exportieren!')) return;
    const fresh = emptyDoc();
    fresh.settings = s;
    store.save(fresh);
    location.hash = '#/';
  };
  root.append(el);
}

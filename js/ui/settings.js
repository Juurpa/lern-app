import { h, esc, download } from '../render.js';
import { emptyDoc } from '../store.js';
import { deckRefs } from '../slides.js';

function slidesPanel(data, slides) {
  const faecher = Object.entries(data.meta.faecher).filter(([f]) => data.decks.some(d => d.fach === f));
  const el = h(`<div class="panel"><h3>Folien offline</h3>
    <p class="muted">Die Folienbilder kommen privat über deinen Sync-Schlüssel (nicht öffentlich im Repo). Angesehene Folien bleiben automatisch offline – hier kannst du ganze Fächer vorab laden (WLAN empfohlen).</p>
    ${faecher.map(([f, info]) => {
      const pages = data.decks.filter(d => d.fach === f).reduce((s, d) => s + d.pages, 0);
      return `<div class="row slide-dl"><button type="button" data-fach="${esc(f)}">${esc(info.short)}-Folien laden (${pages})</button><span class="muted" data-status="${esc(f)}"></span></div>`;
    }).join('')}</div>`);
  for (const [f] of faecher) {
    const refs = data.decks.filter(d => d.fach === f).flatMap(deckRefs);
    const status = el.querySelector(`[data-status="${f}"]`);
    slides?.countCached(refs).then(n => { status.textContent = `${n}/${refs.length} offline`; }).catch(() => {});
    el.querySelector(`[data-fach="${f}"]`).onclick = async e => {
      const b = e.target;
      b.disabled = true;
      try {
        const r = await slides.prefetch(refs, (done, total) => { status.textContent = `${done}/${total} …`; });
        status.textContent = `✓ ${refs.length - r.failed}/${refs.length} offline${r.failed ? ` (${r.failed} fehlgeschlagen)` : ''}`;
      } catch (err) {
        status.textContent = `✗ ${err.message}`;
      } finally { b.disabled = false; }
    };
  }
  return el;
}

export function renderSettings({ data, store, root, sync, slides }) {
  const doc = store.load();
  const s = doc.settings;
  const problems = [...data.errors, ...data.warnings];
  const el = h(`<section>
    <h1>Einstellungen</h1>
    <div class="panel">
      <label>Neue Karten pro 15-min-Session<input type="number" id="newPer" min="0" max="50" value="${esc(s.newPerSession)}"></label>
    </div>
    <div class="panel">
      <h3>Lernmaschine (Sync)</h3>
      <label>Sync-Schlüssel<input type="password" id="syncKey" value="${esc(s.syncKey)}" autocomplete="off"></label>
      <p class="muted" id="syncStatus"></p>
      <button id="syncNow">Jetzt senden</button>
    </div>
    <div class="panel">
      <h3>Gemini (optional)</h3>
      <label>API-Key (bleibt nur auf diesem Gerät)<input type="password" id="key" value="${esc(s.geminiKey)}" autocomplete="off"></label>
      <label>Modell<input type="text" id="model" value="${esc(s.geminiModel)}"></label>
    </div>
    <div class="panel">
      <h3>Sicherung</h3>
      <div class="row"><button id="exp">Exportieren</button><label class="btn">Importieren<input type="file" id="imp" accept="application/json" hidden></label></div>
      <p class="muted">Der Export enthält keine Schlüssel.</p>
      <button id="reset">Fortschritt zurücksetzen</button>
    </div>
    <div class="panel"><h3>Datenprüfung</h3>
      <p>${data.cards.length} Karten geladen · ${data.errors.length} Fehler · ${data.warnings.length} Warnungen</p>
      ${problems.length ? `<details><summary>Details</summary><pre>${esc(problems.join('\n'))}</pre></details>` : ''}
    </div>
    <nav class="bottom"><a class="btn primary" href="#/" id="save">Speichern &amp; zurück</a></nav>
  </section>`);
  const q = sel => el.querySelector(sel);
  const showStatus = () => {
    const st = sync?.status() ?? {};
    q('#syncStatus').textContent = `${s.syncKey ? 'Verbunden' : 'Nicht verbunden'} · ${sync?.pending() ?? 0} wartend · zuletzt gesendet: ${st.lastSent ? new Date(st.lastSent).toLocaleString('de-DE') : '–'}${st.lastError ? ` · Fehler: ${st.lastError}` : ''}${st.dropped ? ` · ${st.dropped} verworfen (Speicherlimit)` : ''}`;
  };
  showStatus();
  q('#syncNow').onclick = async () => {
    // Getippten Schlüssel sichern, bevor gesendet wird – sonst greift flush() noch auf den alten Stand zu.
    doc.settings = { ...doc.settings, syncKey: q('#syncKey').value.trim() };
    store.save(doc);
    await sync?.flush();
    showStatus();
  };
  q('#save').onclick = e => {
    doc.settings = { ...s, newPerSession: Math.max(0, Number(q('#newPer').value) || 0), geminiKey: q('#key').value.trim(), geminiModel: q('#model').value.trim() || s.geminiModel, syncKey: q('#syncKey').value.trim() };
    try {
      store.save(doc);
    } catch (err) {
      e.preventDefault();
      alert(`Speichern fehlgeschlagen: ${err.message}`);
    }
  };
  q('#exp').onclick = () => download(`lernapp-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson(doc));
  q('#imp').onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return; // Auswahl abgebrochen
    try { store.importJson(await file.text(), { geminiKey: s.geminiKey, syncKey: s.syncKey }); alert('Import erfolgreich.'); location.hash = '#/'; }
    catch (err) { alert(err.message); }
    finally { e.target.value = ''; }
  };
  if (data.decks?.length) el.querySelector('.panel:nth-of-type(3)').after(slidesPanel(data, slides));
  q('#reset').onclick = () => {
    if (!confirm('Wirklich den gesamten Lernfortschritt löschen? Vorher exportieren!')) return;
    const fresh = emptyDoc();
    fresh.settings = s;
    store.save(fresh);
    location.hash = '#/';
  };
  root.append(el);
}

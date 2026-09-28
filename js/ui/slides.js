import { h, esc } from '../render.js';
import { parseRef, pageRef, refLabel, deckRefs } from '../slides.js';

// sctx: { slides: Loader aus createSlideLoader, decksById: Map }

function fillImg(img, box, ref, sctx) {
  sctx.slides.objectUrl(ref)
    .then(u => { img.src = u; box.classList.remove('loading'); })
    .catch(e => { box.classList.remove('loading'); box.classList.add('failed'); box.querySelector('.slide-msg').textContent = `📄 ${e.message}`; });
}

// Große Einzelabbildung (z. B. Frage-Ausschnitt oder Skizzen-Lösung). browse: im Viewer durch den Foliensatz blättern.
export function slideFigure(ref, sctx, { browse = true, caption = true } = {}) {
  const fig = h(`<figure class="slide-fig loading"><img alt="${esc(refLabel(ref, sctx.decksById))}"><span class="slide-msg">Folie lädt …</span>${caption ? `<figcaption>${esc(refLabel(ref, sctx.decksById))}</figcaption>` : ''}</figure>`);
  fillImg(fig.querySelector('img'), fig, ref, sctx);
  fig.onclick = () => openViewer(ref, sctx, { browse });
  return fig;
}

export function slideStrip(refs, sctx, { title = '📄 Folien', browse = true } = {}) {
  const list = (refs ?? []).filter(Boolean);
  if (!list.length || !sctx?.slides) return document.createElement('span');
  const el = h(`<div class="slide-strip"><h3>${esc(title)}</h3><div class="thumbs"></div></div>`);
  const thumbs = el.querySelector('.thumbs');
  for (const ref of list) {
    const r = parseRef(ref);
    const b = h(`<button type="button" class="thumb loading"><img alt=""><span class="slide-msg">…</span><span class="thumb-label">Folie ${r?.page ?? '?'}</span></button>`);
    fillImg(b.querySelector('img'), b, ref, sctx);
    b.onclick = () => openViewer(ref, sctx, { browse });
    thumbs.append(b);
  }
  return el;
}

// store/cardsBySlide sind optional (nur von der Folien-Übersicht gesetzt) und schalten dort zusätzlich
// gemerkte Position, Verstanden/Unsicher-Markierungen, "nur unsichere"-Filter, Folien-Sprung und
// verknüpfte Karten/Aufgaben frei – andere Aufrufer (Lernkarten, Aufgaben, Probeklausur, Lerneinheiten)
// bleiben unverändert.
export function openViewer(ref, sctx, { browse = true, store = null, cardsBySlide = null, onClose = null } = {}) {
  const start = parseRef(ref);
  if (!start) return;
  const deck = sctx.decksById.get(start.deck);
  const canBrowse = browse && !start.crop && deck;
  const withStore = Boolean(canBrowse && store);
  const withLinks = Boolean(canBrowse && cardsBySlide);
  let page = start.page;
  let unsureOnly = false;
  const doc = withStore ? store.load() : null;
  const returnFocus = document.activeElement;

  const el = h(`<div class="viewer" role="dialog" aria-modal="true" aria-label="Folienansicht">
    <div class="viewer-bar"><span class="viewer-title"></span><button type="button" class="v-zoom" title="Zoom" aria-label="Zoom umschalten">⤢</button><button type="button" class="v-close" title="Schließen" aria-label="Schließen">✕</button></div>
    <div class="viewer-stage"><img alt=""><span class="slide-msg"></span></div>
    ${canBrowse ? `<div class="progress-bar viewer-progress"><span></span></div>
    <div class="viewer-nav">
      <button type="button" class="v-prev" aria-label="Vorherige Folie">◀</button>
      <button type="button" class="v-page" aria-label="Zu Folie springen"></button>
      <button type="button" class="v-next" aria-label="Nächste Folie">▶</button>
    </div>
    <span class="sr-only v-announce" aria-live="polite"></span>` : ''}
    ${withStore ? `<div class="row viewer-marks">
      <button type="button" class="v-mark v-mark-ok" aria-pressed="false">👍 Verstanden</button>
      <button type="button" class="v-mark v-mark-unsure" aria-pressed="false">🤔 Unsicher</button>
      <button type="button" class="v-mark v-unsure-only" aria-pressed="false" aria-label="Nur unsichere Folien anzeigen">🔎 Filter</button>
    </div>` : ''}
    ${withLinks ? '<div class="viewer-links" hidden></div>' : ''}
  </div>`);

  const img = el.querySelector('img');
  const stage = el.querySelector('.viewer-stage');
  const msg = el.querySelector('.slide-msg');
  const pageBtn = el.querySelector('.v-page');
  const markBtns = { ok: el.querySelector('.v-mark-ok'), unsure: el.querySelector('.v-mark-unsure') };
  const unsureOnlyBtn = el.querySelector('.v-unsure-only');
  const linksBox = el.querySelector('.viewer-links');

  const flash = text => {
    const prev = msg.textContent;
    msg.textContent = text;
    setTimeout(() => { if (msg.textContent === text) msg.textContent = prev; }, 1800);
  };

  const updateMarkUI = () => {
    if (!withStore) return;
    const state = doc.slideMarks[pageRef(start.deck, page)];
    for (const [key, btn] of Object.entries(markBtns)) {
      const active = state === key;
      btn?.classList.toggle('active', active);
      btn?.setAttribute('aria-pressed', String(active));
    }
  };
  const setMark = state => {
    if (!withStore) return;
    const cur = pageRef(start.deck, page);
    if (doc.slideMarks[cur] === state) delete doc.slideMarks[cur]; else doc.slideMarks[cur] = state;
    try { store.save(doc); } catch { /* Speicher voll: Markierung gilt nur für diese Sitzung */ }
    updateMarkUI();
  };
  markBtns.ok?.addEventListener('click', () => setMark('ok'));
  markBtns.unsure?.addEventListener('click', () => setMark('unsure'));
  unsureOnlyBtn?.addEventListener('click', () => {
    unsureOnly = !unsureOnly;
    unsureOnlyBtn.classList.toggle('active', unsureOnly);
    unsureOnlyBtn.setAttribute('aria-pressed', String(unsureOnly));
  });

  const updateLinks = () => {
    if (!withLinks) return;
    const items = cardsBySlide.get(pageRef(start.deck, page)) ?? [];
    if (!items.length) { linksBox.hidden = true; linksBox.replaceChildren(); return; }
    linksBox.hidden = false;
    const chips = items.map(it => (it.kind === 'exercise'
      ? `<a class="chip" href="#/aufgaben?id=${encodeURIComponent(it.id)}">🟩 ${esc(it.label)}</a>`
      : `<span class="chip">${it.kind === 'unit' ? '📘' : '🟦'} ${esc(it.label)}</span>`)).join('');
    linksBox.innerHTML = `<p class="muted">🔗 Verknüpft mit:</p><div class="link-chips">${chips}</div>`;
  };

  const show = () => {
    const cur = canBrowse ? pageRef(start.deck, page) : ref;
    const label = refLabel(cur, sctx.decksById);
    el.querySelector('.viewer-title').textContent = label;
    img.alt = label;
    if (canBrowse) {
      pageBtn.textContent = `${page} / ${deck.pages}`;
      el.querySelector('.viewer-progress > span').style.width = `${(page / deck.pages) * 100}%`;
      const announce = el.querySelector('.v-announce');
      if (announce) announce.textContent = `Folie ${page} von ${deck.pages}`;
    }
    msg.textContent = 'lädt …';
    img.removeAttribute('src');
    sctx.slides.objectUrl(cur).then(u => { if (cur === (canBrowse ? pageRef(start.deck, page) : ref)) { img.src = u; msg.textContent = ''; } })
      .catch(e => {
        const m = e.message.match(/^(Sync-Schlüssel [^(]+)/);
        if (m) msg.innerHTML = `${esc(m[1].trim())} · <a href="#/settings">Einstellungen →</a>`;
        else msg.textContent = e.message;
      });
    if (canBrowse) {
      if (page < deck.pages) sctx.slides.objectUrl(pageRef(start.deck, page + 1)).catch(() => {});
      if (page > 1) sctx.slides.objectUrl(pageRef(start.deck, page - 1)).catch(() => {});
    }
    if (withStore) {
      doc.slidePositions[start.deck] = page;
      try { store.save(doc); } catch { /* Speicher voll: Position gilt nur für diese Sitzung */ }
      updateMarkUI();
    }
    updateLinks();
  };

  const jumpTo = target => {
    const p = Math.min(deck.pages, Math.max(1, target));
    if (p !== page) { page = p; stage.scrollTo(0, 0); show(); }
  };
  const isUnsure = p => withStore && doc.slideMarks[pageRef(start.deck, p)] === 'unsure';
  const go = d => {
    if (!canBrowse) return;
    if (unsureOnly) {
      let p = page;
      for (let i = 0; i < deck.pages; i++) {
        p = ((p - 1 + d + deck.pages) % deck.pages) + 1;
        if (isUnsure(p)) return jumpTo(p);
      }
      flash('Keine unsicheren Folien markiert.');
      return;
    }
    jumpTo(page + d);
  };

  const startJump = () => {
    if (!canBrowse) return;
    const input = h(`<input type="number" class="v-page-input" inputmode="numeric" min="1" max="${deck.pages}" aria-label="Foliennummer (1 bis ${deck.pages})">`);
    input.value = page;
    pageBtn.replaceWith(input);
    input.focus();
    input.select();
    const finish = apply => {
      input.removeEventListener('blur', onBlur);
      const raw = input.value.trim();
      const p = Number(raw);
      if (input.isConnected) { input.replaceWith(pageBtn); pageBtn.focus({ preventScroll: true }); }
      // raw !== '': ein geleertes Feld (Number('') === 0, also fälschlich "gültig") darf nicht
      // stillschweigend auf Folie 1 springen – Leeren + Wegtippen soll wie Escape abbrechen.
      if (apply && raw !== '' && Number.isInteger(p)) jumpTo(p);
    };
    const onBlur = () => finish(true);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  };
  pageBtn?.addEventListener('click', startJump);

  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHashChange);
    document.body.classList.remove('no-scroll');
    // Bei einem Routenwechsel (z. B. Link im Viewer angetippt) ist der ursprüngliche Auslöser oft schon
    // aus dem DOM entfernt – dann übernimmt die neue Seite den Fokus selbst, statt ihn ins Leere zu setzen.
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    onClose?.();
  };
  // Folgt der Nutzer einem Link im Viewer (z. B. zu einer verknüpften Aufgabe) oder geht zurück,
  // muss der Vollbild-Viewer mitschließen – er hängt direkt am body, nicht an der gerouteten Seite.
  const onHashChange = () => close();
  const onKey = e => {
    if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  el.querySelector('.v-close').onclick = close;
  el.querySelector('.v-zoom').onclick = () => stage.classList.toggle('zoomed');
  el.querySelector('.v-prev')?.addEventListener('click', () => go(-1));
  el.querySelector('.v-next')?.addEventListener('click', () => go(1));
  let x0 = null;
  stage.addEventListener('touchstart', e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (x0 === null || stage.classList.contains('zoomed')) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    x0 = null;
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHashChange);
  document.body.classList.add('no-scroll');
  document.body.append(el);
  show();
  // Fokus erst nach dem aktuellen Tick setzen: sonst überschreibt die Fokus-Ansage der Screenreader
  // sofort die gerade erst gesetzte aria-live-Meldung ("Folie 1 von N") beim ersten Öffnen.
  requestAnimationFrame(() => { if (el.isConnected) el.querySelector('.v-close')?.focus({ preventScroll: true }); });
}

export function decksForUnit(unitId, decks) {
  return decks.filter(d => d.units?.includes(unitId));
}

// Ordner-Kategorie aus dem Dateipfad ableiten (z. B. ".../Vorlesungsfolien/x.pdf" → "Vorlesungsfolien").
// Liegt die Datei direkt im Fach-Ordner (kein Unterordner), landet sie in "Weiteres Material".
const CATEGORY_LABEL = { Vorlesungsfolien: 'Vorlesung', Vorlesung: 'Vorlesung', Uebungen: 'Übungen', Seminar: 'Seminar', Praktika: 'Praktika' };
function deckCategory(deck) {
  const seg = deck.file.split('/')[1];
  return seg && deck.file.split('/').length > 2 ? (CATEGORY_LABEL[seg] ?? seg) : 'Weiteres Material';
}
const CATEGORY_ORDER = ['Vorlesung', 'Übungen', 'Seminar', 'Praktika', 'Weiteres Material'];

const countUnsure = (doc, deckId) => Object.keys(doc.slideMarks).filter(k => k.startsWith(`${deckId}:`) && doc.slideMarks[k] === 'unsure').length;
const unsureSlotHtml = n => (n ? ` · <span class="unsure-badge">🤔 ${n}</span>` : '');

function deckRow(d, { doc, meta } = {}) {
  const unsure = doc ? countUnsure(doc, d.id) : 0;
  const title = meta ? `${esc(d.title)}<br><span class="muted search-hit-meta">${esc(meta)}</span>` : esc(d.title);
  // unsure-slot ist ein stabiler Anker: nach dem Schließen des Viewers lässt sich hier gezielt
  // nachtragen/aktualisieren, ohne die ganze Zeile (und ihren Klick-Handler) neu bauen zu müssen.
  return `<button type="button" class="deck-row" data-deck="${esc(d.id)}"><span>${title}</span><span class="muted">${d.pages} Folien<span class="unsure-slot">${unsureSlotHtml(unsure)}</span></span></button>`;
}

export function renderDecks({ data, root, slides, decksById, store, cardsBySlide }) {
  const sctx = { slides, decksById };
  const doc = store?.load();
  const groups = Object.entries(data.meta.faecher).map(([f, info]) => {
    const ds = data.decks.filter(d => d.fach === f);
    if (!ds.length) return '';
    const byCat = new Map();
    for (const d of ds) { const c = deckCategory(d); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(d); }
    const cats = [...byCat.keys()].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
    const body = cats.map(c => `<details class="subfolder"><summary><span class="chev">▸</span><span>${esc(c)}</span><span class="muted">${byCat.get(c).length}</span></summary>
      <div class="subfolder-body">${byCat.get(c).map(d => deckRow(d, { doc })).join('')}</div></details>`).join('');
    return `<details class="folder"><summary><span class="chev">▸</span><span class="badge">${esc(info.short)}</span><span>${esc(info.label)}</span><span class="muted">${ds.length} Foliensätze</span></summary>
      <div class="folder-body">${body}</div></details>`;
  }).join('');
  const el = h(`<section><h1>Folien</h1>
    <p class="muted">Alle Foliensätze nach Fach und Ordner sortiert – zum Öffnen antippen. Die Bilder kommen privat über deinen Sync-Schlüssel und werden nach dem Ansehen offline gespeichert.</p>
    <input type="search" class="search-input" placeholder="Foliensatz suchen …" aria-label="Foliensätze durchsuchen">
    <div class="deck-tree">${groups}</div>
    <div class="search-results" hidden></div>
    </section>`);
  const tree = el.querySelector('.deck-tree');
  const results = el.querySelector('.search-results');

  // Nach dem Schließen des Viewers direkt die Unsicher-Badge(s) dieses Foliensatzes auffrischen
  // (Baum + evtl. sichtbare Suchtreffer) – renderDecks() läuft sonst erst beim nächsten Routenwechsel neu.
  const refreshUnsureBadges = deckId => {
    const fresh = store?.load();
    if (!fresh) return;
    const n = countUnsure(fresh, deckId);
    el.querySelectorAll(`.deck-row[data-deck="${CSS.escape(deckId)}"] .unsure-slot`).forEach(slot => { slot.innerHTML = unsureSlotHtml(n); });
  };
  const openDeckAt = deckId => {
    const cur = store?.load();
    const startPage = cur?.slidePositions?.[deckId] ?? 1;
    openViewer(pageRef(deckId, startPage), sctx, { store, cardsBySlide, onClose: () => refreshUnsureBadges(deckId) });
  };
  tree.querySelectorAll('.deck-row').forEach(b => { b.onclick = () => openDeckAt(b.dataset.deck); });

  // Offline-Stand je Foliensatz ist teuer (ein Cache-Lookup pro Seite) – deshalb erst beim
  // Aufklappen eines Unterordners berechnen, nicht beim ersten Rendern der ganzen Liste, und dann
  // parallel über die Foliensätze des Ordners statt nacheinander.
  if (slides) {
    tree.querySelectorAll('details.subfolder').forEach(sub => {
      sub.addEventListener('toggle', () => {
        if (!sub.open || sub.dataset.counted) return;
        sub.dataset.counted = '1';
        [...sub.querySelectorAll('.deck-row')].forEach(async row => {
          const deck = decksById.get(row.dataset.deck);
          if (!deck) return;
          const n = await slides.countCached(deckRefs(deck));
          if (n > 0) row.querySelector('.muted')?.insertAdjacentHTML('beforeend', ` · <span class="offline-badge">${n} offline</span>`);
        });
      });
    });
  }

  const input = el.querySelector('.search-input');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { tree.hidden = false; results.hidden = true; results.replaceChildren(); return; }
    tree.hidden = true;
    results.hidden = false;
    const matches = data.decks.filter(d => {
      const fach = data.meta.faecher[d.fach];
      return d.title.toLowerCase().includes(q) || deckCategory(d).toLowerCase().includes(q)
        || fach?.label.toLowerCase().includes(q) || fach?.short.toLowerCase().includes(q);
    }).sort((a, b) => (a.fach === b.fach ? a.title.localeCompare(b.title, 'de') : a.fach.localeCompare(b.fach, 'de')));
    if (!matches.length) { results.innerHTML = '<p class="muted">Keine Treffer.</p>'; return; }
    results.innerHTML = matches.map(d => deckRow(d, { doc, meta: `${data.meta.faecher[d.fach]?.short ?? d.fach} · ${deckCategory(d)}` })).join('');
    results.querySelectorAll('.deck-row').forEach(b => { b.onclick = () => openDeckAt(b.dataset.deck); });
  });

  root.append(el);
}

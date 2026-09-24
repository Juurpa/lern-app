import { h, esc } from '../render.js';
import { parseRef, pageRef, refLabel } from '../slides.js';

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

export function openViewer(ref, sctx, { browse = true } = {}) {
  const start = parseRef(ref);
  if (!start) return;
  const deck = sctx.decksById.get(start.deck);
  const canBrowse = browse && !start.crop && deck;
  let page = start.page;
  const el = h(`<div class="viewer" role="dialog" aria-modal="true">
    <div class="viewer-bar"><span class="viewer-title"></span><button type="button" class="v-zoom" title="Zoom">⤢</button><button type="button" class="v-close" title="Schließen">✕</button></div>
    <div class="viewer-stage"><img alt=""><span class="slide-msg"></span></div>
    ${canBrowse ? '<div class="viewer-nav"><button type="button" class="v-prev">◀</button><span class="v-page"></span><button type="button" class="v-next">▶</button></div>' : ''}
  </div>`);
  const img = el.querySelector('img');
  const stage = el.querySelector('.viewer-stage');
  const msg = el.querySelector('.slide-msg');
  const show = () => {
    const cur = canBrowse ? pageRef(start.deck, page) : ref;
    el.querySelector('.viewer-title').textContent = refLabel(cur, sctx.decksById);
    if (canBrowse) el.querySelector('.v-page').textContent = `${page} / ${deck.pages}`;
    msg.textContent = 'lädt …';
    img.removeAttribute('src');
    sctx.slides.objectUrl(cur).then(u => { if (cur === (canBrowse ? pageRef(start.deck, page) : ref)) { img.src = u; msg.textContent = ''; } })
      .catch(e => { msg.textContent = e.message; });
    if (canBrowse && page < deck.pages) sctx.slides.objectUrl(pageRef(start.deck, page + 1)).catch(() => {});
  };
  const go = d => { if (!canBrowse) return; const p = Math.min(deck.pages, Math.max(1, page + d)); if (p !== page) { page = p; stage.scrollTo(0, 0); show(); } };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
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
  document.body.classList.add('no-scroll');
  document.body.append(el);
  show();
}

export function decksForUnit(unitId, decks) {
  return decks.filter(d => d.units?.includes(unitId));
}

export function renderDecks({ data, root, slides, decksById }) {
  const sctx = { slides, decksById };
  const groups = Object.entries(data.meta.faecher).map(([f, info]) => {
    const ds = data.decks.filter(d => d.fach === f);
    if (!ds.length) return '';
    return `<h2>${esc(info.label)}</h2>${ds.map(d => `<button type="button" class="deck-row" data-deck="${esc(d.id)}"><span>${esc(d.title)}</span><span class="muted">${d.pages} Folien</span></button>`).join('')}`;
  }).join('');
  const el = h(`<section><h1>Folien</h1>
    <p class="muted">Alle Foliensätze zum Durchblättern (wischen oder ◀ ▶). Die Bilder kommen privat über deinen Sync-Schlüssel und werden nach dem Ansehen offline gespeichert.</p>
    ${groups}
    <nav class="bottom"><a class="btn" href="#/">Zurück</a></nav></section>`);
  el.querySelectorAll('.deck-row').forEach(b => { b.onclick = () => openViewer(pageRef(b.dataset.deck, 1), sctx); });
  root.append(el);
}

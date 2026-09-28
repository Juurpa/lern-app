export const VERSION = 1;

export function emptyDoc() {
  return {
    version: VERSION, cards: {}, units: {}, gaps: [], exercises: {}, exams: [],
    slidePositions: {}, // deckId -> zuletzt gesehene Seite (1-basiert)
    slideMarks: {}, // "deck:seite" -> 'ok' | 'unsure'
    settings: { newPerSession: 15, geminiKey: '', geminiModel: 'gemini-flash-latest', syncKey: '' },
  };
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

const validSlidePositions = v => (isPlainObject(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => Number.isInteger(n) && n > 0)) : {});
const validSlideMarks = v => (isPlainObject(v) ? Object.fromEntries(Object.entries(v).filter(([, m]) => m === 'ok' || m === 'unsure')) : {});

// Läuft auf JEDEM store.load(), nicht nur beim Import: slidePositions/slideMarks müssen hier schon die
// richtige Form haben, sonst werfen spätere direkte Zugriffe wie doc.slideMarks[ref] = … bei kaputtem
// localStorage-Inhalt (z. B. manuell editiert oder aus einer älteren/fremden Version).
function normalize(d) {
  const e = emptyDoc();
  return {
    ...e, ...d,
    slidePositions: validSlidePositions(d?.slidePositions),
    slideMarks: validSlideMarks(d?.slideMarks),
    settings: { ...e.settings, ...(d?.settings ?? {}) },
  };
}

const isDateString = v => (typeof v === 'string' || typeof v === 'number') && !Number.isNaN(new Date(v).getTime());
const validCardState = st => isPlainObject(st) && isPlainObject(st.fsrs) && isDateString(st.fsrs.due);
const validGap = g => isPlainObject(g) && ['cardId', 'fach', 'front', 'added'].every(k => typeof g[k] === 'string') && Array.isArray(g.hits);

export function createStore(storage = globalThis.localStorage, key = 'lernapp.v1') {
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw ? normalize(JSON.parse(raw)) : emptyDoc();
      } catch {
        return emptyDoc();
      }
    },
    save(doc) {
      storage.setItem(key, JSON.stringify(doc));
    },
    exportJson(doc) {
      return JSON.stringify({ ...doc, settings: { ...doc.settings, geminiKey: '', syncKey: '' } }, null, 1);
    },
    importJson(text, keep = '') {
      const k = typeof keep === 'string' ? { geminiKey: keep } : keep;
      let d;
      try { d = JSON.parse(text); }
      catch { throw new Error('Datei ist keine gültige JSON-Sicherung'); }
      if (d?.version !== VERSION || !isPlainObject(d.cards) || !Array.isArray(d.gaps) || (d.units !== undefined && !isPlainObject(d.units))) {
        throw new Error('Keine gültige Sicherung der Lern-App');
      }
      const doc = normalize(d);
      doc.cards = Object.fromEntries(Object.entries(doc.cards).filter(([, st]) => validCardState(st)));
      doc.gaps = doc.gaps.filter(validGap);
      doc.exercises = isPlainObject(doc.exercises) ? Object.fromEntries(Object.entries(doc.exercises).filter(([, st]) => isPlainObject(st?.parts))) : {};
      doc.exams = Array.isArray(doc.exams) ? doc.exams.filter(x => isPlainObject(x) && typeof x.set === 'string') : [];
      // slidePositions/slideMarks sind schon durch normalize() (oben) validiert.
      doc.settings.geminiKey = k.geminiKey ?? '';
      doc.settings.syncKey = k.syncKey ?? '';
      this.save(doc);
      return doc;
    },
  };
}

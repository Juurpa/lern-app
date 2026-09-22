export const VERSION = 1;

export function emptyDoc() {
  return {
    version: VERSION, cards: {}, units: {}, gaps: [],
    settings: { newPerSession: 10, geminiKey: '', geminiModel: 'gemini-flash-latest' },
  };
}

function normalize(d) {
  const e = emptyDoc();
  return { ...e, ...d, settings: { ...e.settings, ...(d.settings ?? {}) } };
}

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
      return JSON.stringify({ ...doc, settings: { ...doc.settings, geminiKey: '' } }, null, 1);
    },
    importJson(text, keepKey = '') {
      const d = JSON.parse(text);
      if (d?.version !== VERSION || typeof d.cards !== 'object' || !Array.isArray(d.gaps)) {
        throw new Error('Keine gültige Sicherung der Lern-App');
      }
      const doc = normalize(d);
      doc.settings.geminiKey = keepKey;
      this.save(doc);
      return doc;
    },
  };
}

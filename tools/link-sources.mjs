// Leitet aus den source-Angaben der Karten ("MTS__06_CRM1.pdf, Folie 20, 23", "Lecture_RadarSystems_Lec.pdf,
// S. 218f", "... Kap. 5.3") Folien-Referenzen ab und schreibt sie als card.slides (nur wo noch keine gesetzt sind).
// Aufruf (aus lern-app/): node tools/link-sources.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = f => JSON.parse(fs.readFileSync(path.join(APP, 'data', f), 'utf8'));
const decks = read('decks.json');
const byFile = new Map(decks.map(d => [path.basename(d.file), d]));
const MAX_PER_RANGE = 3;
const MAX_PER_CARD = 4;

// Abschnitt -> erste Folie im Radar-Deck (aus den Fußzeilen des Foliensatzes, siehe Kapitelstruktur).
const RADAR_SECTIONS = {
  '2.4.3': 91, '2.5.1': 98, '2.5.3': 108, '3.5': 137, '3.5.1': 158, '3.6': 164, '4.2.3': 195, '4.2.4': 203, '4.3': 221,
  '4.4.1': 223, '4.4.3': 231, '4.4.4': 234, '4.4.5': 239, '5.2': 277, '5.3': 281, '5.6': 319, '5.7': 355, '5.8': 366,
  '6.4.1': 450, '6.4.2': 452, '6.4.3': 454, '7': 471,
};

function expand(list, max) {
  const pages = [];
  for (const raw of list.split(/,|\bund\b/)) {
    const item = raw.trim();
    let m;
    if ((m = /^(\d+)\s*[–-]\s*(\d+)/.exec(item))) {
      const a = Number(m[1]), b = Number(m[2]);
      for (let p = a; p <= Math.min(b, a + MAX_PER_RANGE - 1); p++) pages.push(p);
    } else if ((m = /^(\d+)\s*ff?\b/.exec(item))) {
      pages.push(Number(m[1]), Number(m[1]) + 1);
    } else if ((m = /^(\d+)/.exec(item))) pages.push(Number(m[1]));
  }
  return pages.filter(p => p >= 1 && p <= max);
}

export function refsFromSource(source) {
  const refs = [];
  for (const seg of String(source ?? '').split(';')) {
    const file = [...byFile.keys()].find(f => seg.includes(f));
    if (!file) continue;
    const deck = byFile.get(file);
    const after = seg.slice(seg.indexOf(file) + file.length);
    const m = /(?:Folien?|Seiten?|S\.)\s*(?:ca\.\s*|~)?([\d\s,–\-f]+(?:\s*und\s*[\d\s,–\-f]+)*)/.exec(after);
    let pages = m ? expand(m[1], deck.pages) : [];
    if (!pages.length && deck.id === 'rad-lec') {
      const k = /(?:Kap\.|Abschnitt)\s*(\d+(?:\.\d+)*)/.exec(after);
      if (k) {
        let sec = k[1];
        while (sec && !RADAR_SECTIONS[sec]) sec = sec.includes('.') ? sec.slice(0, sec.lastIndexOf('.')) : '';
        if (sec) pages = [RADAR_SECTIONS[sec]];
      }
    }
    for (const p of pages) refs.push(`${deck.id}:${p}`);
  }
  return [...new Set(refs)].slice(0, MAX_PER_CARD);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const write = process.argv.includes('--write');
  for (const f of ['cards-mts.json', 'cards-radar.json', 'cards-inf2.json']) {
    const cards = read(f);
    let linked = 0, already = 0, none = 0;
    for (const c of cards) {
      if (c.slides?.length) { already++; continue; }
      const refs = refsFromSource(c.source);
      if (refs.length) { c.slides = refs; linked++; } else none++;
    }
    console.log(`${f}: ${linked} neu verknüpft, ${already} hatten schon Folien, ${none} ohne Folienangabe`);
    if (write) fs.writeFileSync(path.join(APP, 'data', f), JSON.stringify(cards, null, 1) + '\n');
  }
}

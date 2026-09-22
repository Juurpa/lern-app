// Konvertiert ../Lernplan/cards_data.js in data/cards-inf2.json + INF2-Units in data/units.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, '../Lernplan/cards_data.js');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(src, 'utf8'), sandbox);
const { CARDS, CODE_EXERCISES } = sandbox.window;

const DECKS = [
  ['LE01', 'Einführung GUI'], ['LE02', 'GUI mit Layoutbeschreibung'], ['LE02b', 'Konstruktoren'],
  ['LE02c', 'Bilder'], ['LE03a', 'Zeichnen mit Pane'], ['LE03b', 'Zeichnen mit Canvas'],
  ['LE04', 'OO: Klassen und Objekte'], ['LE05', 'OO: Polymorphie'], ['LE06', 'Schnittstellen'],
  ['LE07', 'Mehrfachvererbung'], ['LE08', 'Parameter'], ['LE09', 'Dynamische Datenstrukturen: Listen'],
  ['LE10', 'Datenstrukturen im JDK'], ['LE11', 'Dynamische Datenstrukturen: Bäume'],
  ['P01', 'Praktikum 1: JavaFX-Start'], ['P02', 'Praktikum 2: GUI'], ['P03', 'Praktikum 3: GUI mit FXML'],
  ['P04', 'Praktikum 4: Dynamische Datenstrukturen'], ['P05', 'Praktikum 5: Zeichnen'],
  ['K25', 'Klausur 2025'],
];

const inf2Units = DECKS.map(([deck, title], i) => ({
  id: `INF2-${deck}`, fach: 'INF2', order: 100 + i, title: `${deck} · ${title}`,
  kern: '', unterDerHaube: '', analogie: '', fehler: '', videos: [],
}));

const cards = CARDS.map(c => ({
  id: `INF2-${c.id}`, fach: 'INF2', unit: `INF2-${c.deck}`, examMode: 'free',
  front: c.front, back: c.back, priority: Boolean(c.priority) || c.deck === 'K25',
  mc: c.mc ? { stem: c.mc.stem, options: c.mc.options, correct: c.mc.correct } : undefined,
  cloze: c.cloze ? { text: c.cloze.text, answers: c.cloze.answers } : undefined,
  source: `Lernplan/cards_data.js ${c.id}`,
}));

for (const [deck, levels] of Object.entries(CODE_EXERCISES)) {
  for (const [level, ex] of Object.entries(levels)) {
    cards.push({
      id: `INF2-${deck}-code-${level}`, fach: 'INF2', unit: `INF2-${deck}`, examMode: 'code',
      front: `**${ex.title}** *(${level})*\n\n${ex.task}`,
      back: '```java\n' + ex.solution + '\n```',
      code: { hints: ex.hints ?? [], solution: ex.solution, level },
      priority: deck === 'K25',
      source: `Lernplan/code_exercises.json ${deck}/${level}`,
    });
  }
}

const unitsPath = resolve(root, 'data/units.json');
const others = existsSync(unitsPath) ? JSON.parse(readFileSync(unitsPath, 'utf8')).filter(u => u.fach !== 'INF2') : [];
writeFileSync(unitsPath, JSON.stringify([...others, ...inf2Units], null, 1));
writeFileSync(resolve(root, 'data/cards-inf2.json'), JSON.stringify(cards, null, 1));
console.log(`INF2: ${cards.length} Karten, ${inf2Units.length} Units`);

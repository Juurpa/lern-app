# Lern-App Tag 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare, offline-fähige Lern-PWA mit FSRS-Engine, „Lernen"-Knopf, Selbstbewertung, Lückenliste, allen INF2-Inhalten und der ersten MTS-Einheit (RS1).

**Architecture:** Statische PWA ohne Build-Schritt (ES-Module, Import-Map für `ts-fsrs`, Markdown/KaTeX/highlight.js als CDN-Globals). Die Lernlogik (`data`, `scheduler`, `gaps`, `store`, `session`) besteht aus reinen, DOM-freien Funktionen, die mit `node --test` getestet werden; die UI in `js/ui/` ist dünn und wird im Browser-Pane manuell geprüft. Inhalte liegen als JSON in `data/`.

**Tech Stack:** HTML/CSS/JS (ES2022), `ts-fsrs@5.4.2`, `marked@15`, `katex@0.16`, `@highlightjs/cdn-assets@11`, Node 24 (`node --test`), Python `http.server` für die lokale Vorschau.

**Spec:** `docs/superpowers/specs/2026-09-22-lern-app-design.md`

## Global Constraints

- Projektwurzel: `C:\Users\321up\Desktop\Klausuren\lern-app` (alle Pfade unten relativ dazu). Rohdaten liegen in `..\Lernplan\` und `..\Semester 4 - …\`.
- Kein Build-Schritt. Browser lädt `ts-fsrs` über Import-Map von `https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm`; Node aus `node_modules`.
- Fächer-IDs exakt: `INF2`, `MTS`, `RADAR`. Prüfungen: INF2 + MTS `2026-10-07`, RADAR `2026-10-08`.
- `examMode` ∈ `free | voice | code | calc`; Abfrage-Modi ∈ `free | voice | code | calc | mc | cloze | why | bridge`.
- Reiz-Multiplikatoren: MC 0,3 · Lückentext 0,5 · Freitext mit Hinweis 0,7 · Freitext/Voice/Code/Calc ohne Hilfe 1,0 · Warum/Brücke 1,2. Bei „Again" kein Multiplikator.
- Kein Fälligkeitsdatum nach `Prüfungstag − 1` (00:00 Ortszeit), solange dieser Zeitpunkt in der Zukunft liegt.
- 3-Tage-Lock: ≤ 3 Tage vor der Prüfung des Fachs wird immer `examMode` abgefragt.
- Session: ~15 min, max. 3 Karten desselben Fachs hintereinander, 🔴-Karten kommen nach 5 Karten erneut.
- Lücke geschlossen erst nach 2 korrekten (🟢) Abrufen, jeweils ≥ 1 Kalendertag nach dem vorherigen Ereignis (Eintrag bzw. letzter Treffer).
- Gemini-Key wird nie exportiert und nie gecacht. Gemini, Voice, Calc, Radar-Sim, Brücken, Boss-Runde sind **nicht** Teil von Tag 1 (Modus `voice`/`calc` fällt heute auf die Freitext-Ansicht zurück).
- UI-Sprache Deutsch. Mobil zuerst (375 px Breite).

## File Structure

```
lern-app/
  package.json, .gitignore
  index.html                 Import-Map, CDN-Skripte, #app
  manifest.webmanifest, icon.svg, sw.js
  css/app.css
  js/data.js                 Laden + Validieren der JSON-Daten (rein)
  js/scheduler.js            FSRS, Multiplikator, Prüfungsdeckel, Modus-Wahl (rein)
  js/gaps.js                 Lückenliste (rein)
  js/store.js                localStorage-Dokument, Export/Import
  js/session.js              Session-Zusammenstellung, Interleaving, Relearn (rein)
  js/render.js               Markdown/KaTeX/hljs, DOM-Helfer
  js/app.js                  Bootstrap + Hash-Router
  js/ui/start.js, learn.js, card.js, unit.js, gaps.js, settings.js
  data/meta.json, units.json, cards-inf2.json, cards-mts.json, cards-radar.json, bridges.json, synthesis.json
  tools/convert-inf2.mjs     einmalige Konvertierung aus ../Lernplan/cards_data.js
  tests/*.test.js
```

---

### Task 1: Projektgerüst und Datenvalidierung

**Files:**
- Create: `package.json`, `.gitignore`, `data/meta.json`, `js/data.js`
- Test: `tests/data.test.js`

**Interfaces:**
- Produces: `validateData({meta, units, cards}) → {cards: Card[], units: Unit[], errors: string[], warnings: string[]}`, `loadData(fetchJson: (path) => Promise<any>) → Promise<{meta, units, cards, bridges, synthesis, errors, warnings}>`, `DATA_FILES`, `EXAM_MODES`.

- [ ] **Step 1: Gerüst anlegen**

`package.json`:
```json
{
  "name": "lern-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test", "convert": "node tools/convert-inf2.mjs" },
  "devDependencies": { "ts-fsrs": "5.4.2" }
}
```

`.gitignore`:
```
node_modules/
```

`data/meta.json`:
```json
{
  "faecher": {
    "INF2":  { "label": "Informatik 2", "short": "INF2", "exam": "2026-10-07", "examMode": "free" },
    "MTS":   { "label": "Medizintechnische Systeme", "short": "MTS", "exam": "2026-10-07", "examMode": "free" },
    "RADAR": { "label": "Radartechnik", "short": "Radar", "exam": "2026-10-08", "examMode": "voice" }
  },
  "sessionMinutes": 15,
  "maxRun": 3,
  "relearnGap": 5
}
```

Run: `npm install`
Expected: `added 1 package`

- [ ] **Step 2: Failing test schreiben** — `tests/data.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../js/data.js';

const meta = { faecher: { INF2: {}, MTS: {} } };
const units = [{ id: 'U1', fach: 'INF2', order: 1, title: 'Eins' }];
const ok = { id: 'C1', fach: 'INF2', unit: 'U1', front: 'F', back: 'B', examMode: 'free' };

test('gültige Karte bleibt erhalten', () => {
  const r = validateData({ meta, units, cards: [ok] });
  assert.equal(r.cards.length, 1);
  assert.deepEqual(r.errors, []);
});

test('fehlendes Pflichtfeld verwirft die Karte', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, back: '' }] });
  assert.equal(r.cards.length, 0);
  assert.match(r.errors[0], /C1: Feld 'back' fehlt/);
});

test('unbekannte Unit, unbekanntes Fach und falscher examMode sind Fehler', () => {
  const r = validateData({ meta, units, cards: [
    { ...ok, id: 'A', unit: 'X' }, { ...ok, id: 'B', fach: 'BIO' }, { ...ok, id: 'C', examMode: 'mc' },
  ] });
  assert.equal(r.cards.length, 0);
  assert.equal(r.errors.length, 3);
});

test('doppelte ID verwirft das Duplikat', () => {
  const r = validateData({ meta, units, cards: [ok, ok] });
  assert.equal(r.cards.length, 1);
  assert.match(r.errors[0], /doppelte ID/);
});

test('kaputtes mc/cloze wird entfernt, Karte bleibt (Warnung)', () => {
  const r = validateData({ meta, units, cards: [{
    ...ok,
    mc: { stem: 's', options: ['a', 'b'], correct: 'c' },
    cloze: { text: '{{1}} und {{2}}', answers: ['x'] },
  }] });
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].mc, undefined);
  assert.equal(r.cards[0].cloze, undefined);
  assert.equal(r.warnings.length, 2);
});

test('code-Karte braucht code.solution', () => {
  const r = validateData({ meta, units, cards: [{ ...ok, examMode: 'code' }] });
  assert.equal(r.cards.length, 0);
});

test('Units ohne Pflichtfelder werden verworfen, Rest nach order sortiert', () => {
  const r = validateData({ meta, units: [
    { id: 'U2', fach: 'INF2', order: 2, title: 'Zwei' }, { id: 'U1', fach: 'INF2', order: 1, title: 'Eins' }, { id: 'U3' },
  ], cards: [] });
  assert.deepEqual(r.units.map(u => u.id), ['U1', 'U2']);
  assert.equal(r.errors.length, 1);
});
```

- [ ] **Step 3: Test laufen lassen**

Run: `node --test tests/data.test.js`
Expected: FAIL — `Cannot find module '.../js/data.js'`

- [ ] **Step 4: `js/data.js` implementieren**

```js
export const EXAM_MODES = ['free', 'voice', 'code', 'calc'];

export const DATA_FILES = {
  meta: 'data/meta.json',
  units: 'data/units.json',
  cards: ['data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json'],
  bridges: 'data/bridges.json',
  synthesis: 'data/synthesis.json',
};

const CARD_REQUIRED = ['id', 'fach', 'unit', 'front', 'back', 'examMode'];
const UNIT_REQUIRED = ['id', 'fach', 'order', 'title'];

function checkCard(c, unitIds, faecher) {
  const id = c.id ?? '?';
  const errors = [];
  const warnings = [];
  for (const k of CARD_REQUIRED) if (!c[k]) errors.push(`${id}: Feld '${k}' fehlt`);
  if (c.fach && !faecher.includes(c.fach)) errors.push(`${id}: unbekanntes Fach ${c.fach}`);
  if (c.unit && !unitIds.has(c.unit)) errors.push(`${id}: unbekannte Unit ${c.unit}`);
  if (c.examMode && !EXAM_MODES.includes(c.examMode)) errors.push(`${id}: ungültiger examMode ${c.examMode}`);
  if (c.examMode === 'code' && !c.code?.solution) errors.push(`${id}: code.solution fehlt`);

  const card = { ...c };
  if (card.mc && !(Array.isArray(card.mc.options) && card.mc.options.includes(card.mc.correct))) {
    warnings.push(`${id}: mc.correct nicht in options – MC entfernt`);
    delete card.mc;
  }
  if (card.cloze) {
    const gaps = (card.cloze.text?.match(/\{\{\d+\}\}/g) ?? []).length;
    if (gaps === 0 || gaps !== card.cloze.answers?.length) {
      warnings.push(`${id}: Lückenzahl ≠ answers – Lückentext entfernt`);
      delete card.cloze;
    }
  }
  return { card, errors, warnings };
}

export function validateData({ meta, units, cards }) {
  const errors = [];
  const warnings = [];
  const faecher = Object.keys(meta.faecher);

  const validUnits = [];
  for (const u of units) {
    const missing = UNIT_REQUIRED.filter(k => u[k] === undefined || u[k] === '');
    if (missing.length) errors.push(`Unit ${u.id ?? '?'}: ${missing.join(', ')} fehlt`);
    else validUnits.push(u);
  }
  validUnits.sort((a, b) => a.order - b.order);
  const unitIds = new Set(validUnits.map(u => u.id));

  const seen = new Set();
  const valid = [];
  for (const c of cards) {
    const r = checkCard(c, unitIds, faecher);
    if (c.id && seen.has(c.id)) r.errors.push(`${c.id}: doppelte ID`);
    if (c.id) seen.add(c.id);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (!r.errors.length) valid.push(r.card);
  }
  return { cards: valid, units: validUnits, errors, warnings };
}

export async function loadData(fetchJson) {
  const [meta, units, bridges, synthesis, ...cardLists] = await Promise.all([
    fetchJson(DATA_FILES.meta),
    fetchJson(DATA_FILES.units),
    fetchJson(DATA_FILES.bridges),
    fetchJson(DATA_FILES.synthesis),
    ...DATA_FILES.cards.map(fetchJson),
  ]);
  const r = validateData({ meta, units, cards: cardLists.flat() });
  return { meta, bridges, synthesis, ...r };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `node --test tests/data.test.js`
Expected: 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore data/meta.json js/data.js tests/data.test.js
git commit -m "feat: Projektgerüst und Datenvalidierung"
```

---

### Task 2: INF2-Inhalte konvertieren

**Files:**
- Create: `tools/convert-inf2.mjs`, `data/units.json` (generiert), `data/cards-inf2.json` (generiert), `data/cards-mts.json` (`[]`), `data/cards-radar.json` (`[]`), `data/bridges.json` (`[]`), `data/synthesis.json` (`[]`)
- Test: `tests/realdata.test.js`

**Interfaces:**
- Consumes: `validateData` (Task 1).
- Produces: Unit-IDs `INF2-<deck>` (z. B. `INF2-LE09`, `INF2-K25`), Karten-IDs `INF2-<alte id>` und `INF2-<deck>-code-<leicht|mittel|schwer>`. Feld `priority: boolean` auf jeder INF2-Karte.

Quellformat (`../Lernplan/cards_data.js`): `window.CARDS = [...]` mit `{id, deck, type, front, back, priority, mc: {stem, options, correct}, cloze: {text, answers}}` (682 Stück) und `window.CODE_EXERCISES = {deck: {leicht|mittel|schwer: {deck, title, task, hints[], solution, difficulty}}}` (20 Decks × 3 = 60).

- [ ] **Step 1: Failing test schreiben** — `tests/realdata.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../js/data.js';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const units = read('units.json');
const cards = [...read('cards-inf2.json'), ...read('cards-mts.json'), ...read('cards-radar.json')];

test('echte Daten: keine verworfenen Karten oder Units', () => {
  const r = validateData({ meta, units, cards });
  assert.deepEqual(r.errors, []);
  assert.equal(r.cards.length, cards.length);
});

test('INF2: 682 Karten + 60 Code-Übungen, 20 Units', () => {
  const inf2 = cards.filter(c => c.fach === 'INF2');
  assert.equal(inf2.length, 742);
  assert.equal(inf2.filter(c => c.examMode === 'code').length, 60);
  assert.equal(units.filter(u => u.fach === 'INF2').length, 20);
});

test('bridges.json und synthesis.json sind Arrays', () => {
  assert.ok(Array.isArray(read('bridges.json')));
  assert.ok(Array.isArray(read('synthesis.json')));
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `node --test tests/realdata.test.js`
Expected: FAIL — `ENOENT ... data/units.json`

- [ ] **Step 3: `tools/convert-inf2.mjs` schreiben**

```js
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
```

- [ ] **Step 4: Leere Datendateien anlegen und Konvertierung ausführen**

Lege `data/cards-mts.json`, `data/cards-radar.json`, `data/bridges.json`, `data/synthesis.json` jeweils mit Inhalt `[]` an.

Run: `npm run convert`
Expected: `INF2: 742 Karten, 20 Units`

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test`
Expected: alle Tests PASS. Falls `realdata` Warnungen erzeugt, ist das erlaubt; `errors` muss leer sein.

- [ ] **Step 6: Commit**

```bash
git add tools/convert-inf2.mjs data/ tests/realdata.test.js
git commit -m "feat: INF2-Karten und Code-Übungen übernommen"
```

---

### Task 3: Scheduler (FSRS, Wissens-1RM, Prüfungsdeckel, Modus-Wahl)

**Files:**
- Create: `js/scheduler.js`
- Test: `tests/scheduler.test.js`

**Interfaces:**
- Produces:
  - `MULT: Record<string, number>`
  - `toRating(button: 'red'|'yellow'|'green', mode: string, hinted?: boolean) → Rating`
  - `review(st: CardState|undefined, {button, mode, hinted?}, now: Date, examDate: 'YYYY-MM-DD') → CardState`
  - `chooseMode(card, st: CardState|undefined, now: Date, examDate) → mode`
  - `isDue(st, now) → boolean`
  - `CardState = { fsrs: { due: ISO, stability, difficulty, reps, lapses, state, last_review: ISO|null, … }, alt: number }`

Hinweis zu ts-fsrs 5.4.2 (geprüft): `fsrs(generatorParameters({enable_fuzz:false})).next(card, now, Rating.X).card` liefert `{due: Date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review}`. Neue Karte + Good → `State.Learning` (Minuten-Schritt); + Easy → `State.Review`. Bei Behaltensrate 0,9 entspricht das Intervall in Tagen der Stabilität S, deshalb gilt nach dem Multiplikator `Intervall = max(1, round(S_neu))`.

- [ ] **Step 1: Failing test schreiben** — `tests/scheduler.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rating } from 'ts-fsrs';
import { toRating, review, chooseMode, isDue } from '../js/scheduler.js';

const FAR = '2027-06-01';
const t0 = new Date(2026, 8, 22, 10, 0);

test('toRating bildet Buttons je nach Modus ab', () => {
  assert.equal(toRating('red', 'free'), Rating.Again);
  assert.equal(toRating('yellow', 'mc'), Rating.Hard);
  assert.equal(toRating('green', 'free'), Rating.Easy);
  assert.equal(toRating('green', 'voice'), Rating.Easy);
  assert.equal(toRating('green', 'free', true), Rating.Good);
  assert.equal(toRating('green', 'mc'), Rating.Good);
  assert.equal(toRating('green', 'cloze'), Rating.Good);
  assert.throws(() => toRating('blue', 'free'));
});

test('MC bringt weniger Stabilität als Freitext, aber mehr als vorher', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const viaMc = review(s1, { button: 'green', mode: 'mc' }, t1, FAR);
  const viaFree = review(s1, { button: 'green', mode: 'free' }, t1, FAR);
  assert.ok(viaMc.fsrs.stability > s1.fsrs.stability);
  assert.ok(viaMc.fsrs.stability < viaFree.fsrs.stability);
});

test('Intervall folgt der gedämpften Stabilität', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const s2 = review(s1, { button: 'green', mode: 'cloze' }, t1, FAR);
  const days = Math.round((new Date(s2.fsrs.due) - t1) / 86400000);
  assert.equal(days, Math.max(1, Math.round(s2.fsrs.stability)));
});

test('Prüfungsdeckel: fällig spätestens am Vortag 00:00', () => {
  let st = review(undefined, { button: 'green', mode: 'free' }, new Date(2026, 8, 1), '2026-10-07');
  st = review(st, { button: 'green', mode: 'free' }, new Date(2026, 9, 1), '2026-10-07');
  assert.ok(new Date(st.fsrs.due) <= new Date(2026, 9, 6));
});

test('kein Deckel mehr, wenn der Vortag schon begonnen hat', () => {
  const now = new Date(2026, 9, 6, 12, 0);
  const st = review(undefined, { button: 'green', mode: 'free' }, now, '2026-10-07');
  assert.ok(new Date(st.fsrs.due) > now);
});

test('Rot: Karte ist noch am selben Tag wieder fällig', () => {
  const s1 = review(undefined, { button: 'green', mode: 'free' }, t0, FAR);
  const t1 = new Date(s1.fsrs.due);
  const s2 = review(s1, { button: 'red', mode: 'free' }, t1, FAR);
  assert.ok(new Date(s2.fsrs.due) - t1 < 86400000);
});

test('isDue', () => {
  assert.equal(isDue(undefined, t0), false);
  const st = review(undefined, { button: 'red', mode: 'free' }, t0, FAR);
  assert.equal(isDue(st, new Date(t0.getTime() + 3600000)), true);
});

const card = { examMode: 'free', mc: { options: ['a'], correct: 'a' }, cloze: { text: '{{1}}', answers: ['a'] }, why: 'Warum?' };
const stWith = (reps, stability, alt) => ({ fsrs: { reps, stability, due: t0.toISOString() }, alt });

test('chooseMode: neu → MC, dann Lückentext, dann examMode', () => {
  assert.equal(chooseMode(card, undefined, t0, FAR), 'mc');
  assert.equal(chooseMode(card, stWith(1, 1, 1), t0, FAR), 'cloze');
  assert.equal(chooseMode(card, stWith(2, 3, 2), t0, FAR), 'free');
  assert.equal(chooseMode({ examMode: 'voice' }, undefined, t0, FAR), 'voice');
});

test('chooseMode: Mutation ab S ≥ 10 im Wechsel', () => {
  assert.equal(chooseMode(card, stWith(6, 12, 4), t0, FAR), 'why');
  assert.equal(chooseMode(card, stWith(6, 12, 5), t0, FAR), 'free');
  assert.equal(chooseMode({ ...card, bridges: ['BR-1'] }, stWith(6, 12, 4), t0, FAR), 'bridge');
});

test('chooseMode: 3-Tage-Lock erzwingt examMode', () => {
  const now = new Date(2026, 9, 4, 9, 0);
  assert.equal(chooseMode(card, undefined, now, '2026-10-07'), 'free');
  assert.equal(chooseMode(card, stWith(6, 12, 4), now, '2026-10-07'), 'free');
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `node --test tests/scheduler.test.js`
Expected: FAIL — `Cannot find module '.../js/scheduler.js'`

- [ ] **Step 3: `js/scheduler.js` implementieren**

```js
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';

const DAY = 86400000;
const engine = fsrs(generatorParameters({ enable_fuzz: false }));

export const MULT = { mc: 0.3, cloze: 0.5, hinted: 0.7, free: 1.0, voice: 1.0, code: 1.0, calc: 1.0, why: 1.2, bridge: 1.2 };

export function toRating(button, mode, hinted = false) {
  if (button === 'red') return Rating.Again;
  if (button === 'yellow') return Rating.Hard;
  if (button !== 'green') throw new Error(`Unbekannter Button: ${button}`);
  return !hinted && mode !== 'mc' && mode !== 'cloze' ? Rating.Easy : Rating.Good;
}

function localDate(isoDay, offsetDays = 0) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays);
}

function capDue(due, examDate, now) {
  const cut = localDate(examDate, -1);
  return cut > now && due > cut ? cut : due;
}

const serialize = c => ({ ...c, due: c.due.toISOString(), last_review: c.last_review ? c.last_review.toISOString() : null });
const revive = s => ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined });

export function review(st, { button, mode, hinted = false }, now, examDate) {
  const prev = st ? revive(st.fsrs) : createEmptyCard(now);
  const rating = toRating(button, mode, hinted);
  let next = engine.next(prev, now, rating).card;
  if (rating !== Rating.Again && next.state === State.Review) {
    const m = MULT[hinted ? 'hinted' : mode] ?? 1;
    const s0 = prev.stability || 0;
    const s = s0 + (next.stability - s0) * m;
    const days = Math.max(1, Math.round(s));
    next = { ...next, stability: s, scheduled_days: days, due: new Date(now.getTime() + days * DAY) };
  }
  next = { ...next, due: capDue(next.due, examDate, now) };
  return { fsrs: serialize(next), alt: (st?.alt ?? 0) + 1 };
}

export function isDue(st, now) {
  return Boolean(st) && new Date(st.fsrs.due) <= now;
}

export function chooseMode(card, st, now, examDate) {
  const exam = card.examMode;
  if ((localDate(examDate) - now) / DAY <= 3) return exam;
  const reps = st?.fsrs.reps ?? 0;
  if (reps === 0 && card.mc) return 'mc';
  if (reps < 2 && card.cloze) return 'cloze';
  const hasBridge = (card.bridges?.length ?? 0) > 0;
  if ((st?.fsrs.stability ?? 0) >= 10 && (hasBridge || card.why) && st.alt % 2 === 0) {
    return hasBridge ? 'bridge' : 'why';
  }
  return exam;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test tests/scheduler.test.js`
Expected: 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add js/scheduler.js tests/scheduler.test.js
git commit -m "feat: FSRS-Scheduler mit Reiz-Multiplikator, Prüfungsdeckel und Modus-Wahl"
```

---

### Task 4: Lückenliste und Speicher

**Files:**
- Create: `js/gaps.js`, `js/store.js`
- Test: `tests/gaps.test.js`, `tests/store.test.js`

**Interfaces:**
- Produces:
  - `addGap(gaps: Gap[], card, now: Date) → Gap[]`, `recordCorrect(gaps, cardId, now) → Gap[]`, `openGaps(gaps) → Gap[]`, `toMarkdown(gaps, meta) → string`
  - `Gap = { cardId, fach, front, added: ISO, hits: ISO[], closed: ISO|null }`
  - `emptyDoc() → Doc`, `createStore(storage?, key?) → { load(): Doc, save(doc): void, exportJson(doc): string, importJson(text, keepKey?): Doc }`
  - `Doc = { version: 1, cards: {[cardId]: CardState}, units: {[unitId]: {seen: true}}, gaps: Gap[], settings: {newPerSession: 10, geminiKey: '', geminiModel: 'gemini-flash-latest'} }`

- [ ] **Step 1: Failing tests schreiben**

`tests/gaps.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addGap, recordCorrect, openGaps, toMarkdown } from '../js/gaps.js';

const card = { id: 'C1', fach: 'INF2', front: 'Was ist | ein\nADT?' };
const d = (day, h = 10) => new Date(2026, 8, day, h);

test('addGap legt einmal an, zweites Rot setzt Treffer zurück', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  assert.equal(g[0].hits.length, 1);
  g = addGap(g, card, d(23, 15));
  assert.equal(g.length, 1);
  assert.equal(g[0].hits.length, 0);
});

test('Treffer am selben Tag wie der Eintrag zählt nicht', () => {
  const g = recordCorrect(addGap([], card, d(22, 9)), 'C1', d(22, 20));
  assert.equal(g[0].hits.length, 0);
});

test('zwei Treffer an verschiedenen Folgetagen schließen die Lücke', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  g = recordCorrect(g, 'C1', d(23, 18));
  assert.equal(g[0].closed, null);
  g = recordCorrect(g, 'C1', d(24));
  assert.ok(g[0].closed);
  assert.equal(openGaps(g).length, 0);
});

test('toMarkdown erzeugt LUECKEN.md-Tabellen pro Fach', () => {
  let g = addGap([], card, d(22));
  g = recordCorrect(g, 'C1', d(23));
  const md = toMarkdown(g, { faecher: { INF2: { label: 'Informatik 2' }, MTS: { label: 'Medizintechnische Systeme' } } });
  assert.match(md, /## Informatik 2/);
  assert.match(md, /\| 22\.09\. \| Was ist \\\| ein ADT\? \| 23\.09\. \|  \|/);
  assert.match(md, /## Medizintechnische Systeme\n\n\| Datum/);
});
```

`tests/store.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, emptyDoc } from '../js/store.js';

const fakeStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('leerer Speicher liefert Standarddokument', () => {
  assert.deepEqual(createStore(fakeStorage()).load(), emptyDoc());
});

test('save/load Rundreise', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.cards.C1 = { fsrs: { reps: 1 }, alt: 1 };
  s.save(doc);
  assert.deepEqual(s.load().cards.C1, { fsrs: { reps: 1 }, alt: 1 });
});

test('kaputtes JSON im Speicher → Standarddokument', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', '{kaputt');
  assert.deepEqual(createStore(st).load(), emptyDoc());
});

test('Export enthält keinen Gemini-Key, Import behält den aktuellen Key', () => {
  const s = createStore(fakeStorage());
  const doc = emptyDoc();
  doc.settings.geminiKey = 'GEHEIM';
  const text = s.exportJson(doc);
  assert.ok(!text.includes('GEHEIM'));
  assert.equal(s.importJson(text, 'GEHEIM').settings.geminiKey, 'GEHEIM');
});

test('Import lehnt fremde Dateien ab', () => {
  const s = createStore(fakeStorage());
  assert.throws(() => s.importJson('{"foo":1}'), /Keine gültige Sicherung/);
  assert.throws(() => s.importJson('nicht json'));
});

test('fehlende Settings werden mit Standardwerten ergänzt', () => {
  const st = fakeStorage();
  st.setItem('lernapp.v1', JSON.stringify({ version: 1, cards: {}, units: {}, gaps: [], settings: {} }));
  assert.equal(createStore(st).load().settings.newPerSession, 10);
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `node --test tests/gaps.test.js tests/store.test.js`
Expected: FAIL — Module nicht gefunden

- [ ] **Step 3: `js/gaps.js` implementieren**

```js
const DAY = 86400000;
const dayStart = iso => { const x = new Date(iso); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
const fmt = iso => { const x = new Date(iso); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.`; };

export function addGap(gaps, card, now) {
  const open = gaps.find(g => g.cardId === card.id && !g.closed);
  if (open) return gaps.map(g => (g === open ? { ...g, hits: [] } : g));
  return [...gaps, { cardId: card.id, fach: card.fach, front: card.front, added: now.toISOString(), hits: [], closed: null }];
}

export function recordCorrect(gaps, cardId, now) {
  return gaps.map(g => {
    if (g.cardId !== cardId || g.closed) return g;
    const ref = g.hits.at(-1) ?? g.added;
    if (daysBetween(ref, now) < 1) return g;
    const hits = [...g.hits, now.toISOString()];
    return { ...g, hits, closed: hits.length >= 2 ? now.toISOString() : null };
  });
}

export const openGaps = gaps => gaps.filter(g => !g.closed);

const cell = s => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim().slice(0, 140);

export function toMarkdown(gaps, meta) {
  const parts = ['# Lückenliste (Export Lern-App)', ''];
  for (const [fach, info] of Object.entries(meta.faecher)) {
    parts.push(`## ${info.label}`, '', '| Datum | Lücke | ✅ 1. | ✅ 2. |', '|---|---|---|---|');
    for (const g of gaps.filter(x => x.fach === fach)) {
      parts.push(`| ${fmt(g.added)} | ${cell(g.front)} | ${g.hits[0] ? fmt(g.hits[0]) : ''} | ${g.hits[1] ? fmt(g.hits[1]) : ''} |`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
```

- [ ] **Step 4: `js/store.js` implementieren**

```js
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
```

- [ ] **Step 5: Tests laufen lassen**

Run: `node --test tests/gaps.test.js tests/store.test.js`
Expected: 10 tests PASS

- [ ] **Step 6: Commit**

```bash
git add js/gaps.js js/store.js tests/gaps.test.js tests/store.test.js
git commit -m "feat: Lückenliste und lokaler Speicher mit Export/Import"
```

---

### Task 5: Session-Zusammenstellung

**Files:**
- Create: `js/session.js`
- Test: `tests/session.test.js`

**Interfaces:**
- Consumes: `isDue` aus `js/scheduler.js`; `Doc` aus Task 4; `meta`, `units`, `cards` aus Task 1.
- Produces:
  - `allocate(counts: {[fach]: number}, weights: {[fach]: number}, total: number) → {[fach]: number}`
  - `interleave(items: {fach}[], maxRun = 3) → items[]`
  - `fachWeights(meta, doc, cards, now) → {[fach]: number}`
  - `buildSession({cards, units, doc, meta, now, size = 30, newLimit = 10, exclude = new Set()}) → Item[]`
  - `insertRelearn(queue: Item[], pos: number, item: Item, gap = 5) → Item[]`
  - `Item = {type: 'card', cardId, fach} | {type: 'unit', unitId, fach}`

- [ ] **Step 1: Failing test schreiben** — `tests/session.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, interleave, buildSession, insertRelearn } from '../js/session.js';
import { emptyDoc } from '../js/store.js';

const meta = { faecher: { INF2: { exam: '2026-10-07' }, MTS: { exam: '2026-10-07' } } };
const now = new Date(2026, 8, 22, 10);
const past = new Date(2026, 8, 21).toISOString();
const future = new Date(2026, 8, 30).toISOString();

test('allocate verteilt nach Gewicht (D\'Hondt) und respektiert Verfügbarkeit', () => {
  assert.deepEqual(allocate({ A: 10, B: 10 }, { A: 2, B: 1 }, 6), { A: 4, B: 2 });
  assert.deepEqual(allocate({ A: 1, B: 10 }, { A: 5, B: 1 }, 4), { A: 1, B: 3 });
  assert.deepEqual(allocate({ A: 0 }, { A: 1 }, 3), { A: 0 });
});

test('interleave: nie mehr als 3 gleiche Fächer hintereinander, solange andere da sind', () => {
  const items = [...Array(6)].map((_, i) => ({ fach: 'INF2', i })).concat([{ fach: 'MTS' }, { fach: 'MTS' }]);
  const out = interleave(items, 3);
  assert.equal(out.length, 8);
  let run = 1;
  for (let i = 1; i < out.length; i++) { run = out[i].fach === out[i - 1].fach ? run + 1 : 1; assert.ok(run <= 3); }
});

const units = [
  { id: 'U-I', fach: 'INF2', order: 1, title: 'I', kern: 'Kern I' },
  { id: 'U-M', fach: 'MTS', order: 2, title: 'M', kern: '' },
];
const mk = (id, fach, unit, priority = false) => ({ id, fach, unit, priority, examMode: 'free', front: id, back: id });

test('fällige vor neuen, newLimit greift, Priorität zuerst, Unit-Intro einmal', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I', true), mk('i3', 'INF2', 'U-I'), mk('m1', 'MTS', 'U-M'), mk('d1', 'MTS', 'U-M'), mk('f1', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.cards.d1 = { fsrs: { due: past, reps: 2, stability: 3 }, alt: 2 };
  doc.cards.f1 = { fsrs: { due: future, reps: 2, stability: 3 }, alt: 2 };
  const s = buildSession({ cards, units, doc, meta, now, newLimit: 3 });
  const cardIds = s.filter(x => x.type === 'card').map(x => x.cardId);
  assert.equal(cardIds[0], 'd1');
  assert.ok(!cardIds.includes('f1'));
  assert.equal(cardIds.length, 4);
  assert.ok(cardIds.includes('i2'));
  const intro = s.filter(x => x.type === 'unit');
  assert.deepEqual(intro.map(x => x.unitId), ['U-I']);
  assert.equal(s[s.findIndex(x => x.type === 'unit') + 1].type, 'card');
});

test('gesehene Units bekommen kein Intro, exclude wird beachtet', () => {
  const cards = [mk('i1', 'INF2', 'U-I'), mk('i2', 'INF2', 'U-I')];
  const doc = emptyDoc();
  doc.units['U-I'] = { seen: true };
  const s = buildSession({ cards, units, doc, meta, now, exclude: new Set(['i1']) });
  assert.deepEqual(s, [{ type: 'card', cardId: 'i2', fach: 'INF2' }]);
});

test('insertRelearn fügt 5 Positionen später ein bzw. am Ende', () => {
  const q = [1, 2, 3, 4, 5, 6, 7].map(n => ({ type: 'card', cardId: String(n), fach: 'INF2' }));
  const item = { type: 'card', cardId: 'X', fach: 'INF2' };
  assert.equal(insertRelearn(q, 1, item).findIndex(x => x.cardId === 'X'), 6);
  assert.equal(insertRelearn(q.slice(0, 3), 2, item).at(-1).cardId, 'X');
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `node --test tests/session.test.js`
Expected: FAIL — Modul nicht gefunden

- [ ] **Step 3: `js/session.js` implementieren**

```js
import { isDue } from './scheduler.js';
import { openGaps } from './gaps.js';

const DAY = 86400000;

function daysUntil(examDate, now) {
  const [y, m, d] = examDate.split('-').map(Number);
  return (new Date(y, m - 1, d) - now) / DAY;
}

export function allocate(counts, weights, total) {
  const slots = Object.fromEntries(Object.keys(counts).map(f => [f, 0]));
  for (let i = 0; i < total; i++) {
    let best = null;
    for (const f of Object.keys(counts)) {
      if (slots[f] >= counts[f]) continue;
      const score = (weights[f] ?? 0) / (slots[f] + 1);
      if (best === null || score > (weights[best] ?? 0) / (slots[best] + 1)) best = f;
    }
    if (best === null) break;
    slots[best]++;
  }
  return slots;
}

export function interleave(items, maxRun = 3) {
  const rest = [...items];
  const out = [];
  while (rest.length) {
    const n = out.length;
    const last = out[n - 1]?.fach;
    const blocked = n >= maxRun && out.slice(n - maxRun).every(x => x.fach === last) ? last : null;
    let i = blocked ? rest.findIndex(x => x.fach !== blocked) : 0;
    if (i === -1) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

export function fachWeights(meta, doc, cards, now) {
  const open = openGaps(doc.gaps);
  const w = {};
  for (const [f, info] of Object.entries(meta.faecher)) {
    const seen = cards.filter(c => c.fach === f && doc.cards[c.id]).length;
    const gapCount = open.filter(g => g.fach === f).length;
    w[f] = (1 / Math.max(1, daysUntil(info.exam, now))) * (1 + gapCount / Math.max(1, seen));
  }
  return w;
}

const groupBy = (list, key) => list.reduce((acc, x) => ((acc[x[key]] ??= []).push(x), acc), {});
const countsOf = groups => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));

export function buildSession({ cards, units, doc, meta, now, size = 30, newLimit = 10, exclude = new Set() }) {
  const unitById = new Map(units.map(u => [u.id, u]));
  const pool = cards.filter(c => !exclude.has(c.id));
  const weights = fachWeights(meta, doc, cards, now);
  const dueAt = c => new Date(doc.cards[c.id].fsrs.due);

  const due = pool.filter(c => isDue(doc.cards[c.id], now)).sort((a, b) => dueAt(a) - dueAt(b));
  const dueGroups = groupBy(due, 'fach');
  const dueAlloc = allocate(countsOf(dueGroups), weights, size);
  const dueCards = Object.entries(dueAlloc).flatMap(([f, n]) => dueGroups[f].slice(0, n)).sort((a, b) => dueAt(a) - dueAt(b));

  const order = c => unitById.get(c.unit)?.order ?? Infinity;
  const fresh = pool.filter(c => !doc.cards[c.id])
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || order(a) - order(b));
  const freshGroups = groupBy(fresh, 'fach');
  const freshAlloc = allocate(countsOf(freshGroups), weights, Math.max(0, Math.min(newLimit, size - dueCards.length)));
  const freshCards = Object.entries(freshAlloc).flatMap(([f, n]) => freshGroups[f].slice(0, n));

  const seq = [...interleave(dueCards, meta.maxRun ?? 3), ...interleave(freshCards, meta.maxRun ?? 3)];
  const items = [];
  const introduced = new Set();
  for (const c of seq) {
    const u = unitById.get(c.unit);
    if (!doc.cards[c.id] && u?.kern && !doc.units[u.id]?.seen && !introduced.has(u.id)) {
      items.push({ type: 'unit', unitId: u.id, fach: c.fach });
      introduced.add(u.id);
    }
    items.push({ type: 'card', cardId: c.id, fach: c.fach });
  }
  return items;
}

export function insertRelearn(queue, pos, item, gap = 5) {
  const out = [...queue];
  out.splice(Math.min(pos + gap, out.length), 0, item);
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
git add js/session.js tests/session.test.js
git commit -m "feat: Session-Zusammenstellung mit Gewichtung, Interleaving und Relearn"
```

---

### Task 6: App-Shell, Rendering, Start/Lücken/Einstellungen

**Files:**
- Create: `index.html`, `css/app.css`, `js/render.js`, `js/app.js`, `js/ui/start.js`, `js/ui/gaps.js`, `js/ui/settings.js`, `.claude/launch.json` im Ordner `C:\Users\321up\Desktop\Klausuren` (existiert `.claude/launch.json` dort schon, Eintrag ergänzen statt überschreiben)
- Test: manuell im Browser-Pane

**Interfaces:**
- Consumes: `loadData` (T1), `createStore` (T4), `openGaps`, `toMarkdown` (T4), `isDue` (T3).
- Produces:
  - `render.js`: `md(text) → html`, `enhance(el)`, `h(html) → Element`, `esc(s) → string`, `download(filename, text, mime)`
  - `ctx = { data, store, root }`; Views mit Signatur `render<Name>(ctx)`; Route `#/learn` wird in Task 7 durch `renderLearn` bedient (hier Platzhalter-Import aus `js/ui/learn.js`, siehe Step 4).

- [ ] **Step 1: CDN-Versionen prüfen**

Run:
```bash
for u in "ts-fsrs@5.4.2/+esm" "marked@15/marked.min.js" "katex@0.16/dist/katex.min.js" "katex@0.16/dist/contrib/auto-render.min.js" "katex@0.16/dist/katex.min.css" "@highlightjs/cdn-assets@11/highlight.min.js" "@highlightjs/cdn-assets@11/languages/matlab.min.js" "@highlightjs/cdn-assets@11/styles/github-dark.min.css"; do curl -s -o /dev/null -w "%{http_code} $u\n" "https://cdn.jsdelivr.net/npm/$u"; done
```
Expected: jede Zeile `200`. Falls nicht: nächsthöhere existierende Major-Version eintragen.

- [ ] **Step 2: `index.html`**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0f172a">
  <title>Klausurtraining</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/github-dark.min.css">
  <link rel="stylesheet" href="css/app.css">
  <script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/languages/matlab.min.js"></script>
  <script type="importmap">
    { "imports": { "ts-fsrs": "https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm" } }
  </script>
</head>
<body>
  <main id="app"><p class="muted">Lade …</p></main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `css/app.css`**

```css
:root {
  --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0;
  --accent: #2563eb; --green: #16a34a; --yellow: #ca8a04; --red: #dc2626;
  --radius: 14px; --gap: 16px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 17px; line-height: 1.5;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f172a; --surface: #1e293b; --text: #e2e8f0; --muted: #94a3b8; --border: #334155; --accent: #60a5fa; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
#app { max-width: 720px; margin: 0 auto; padding: var(--gap) var(--gap) calc(var(--gap) * 5); }
h1 { font-size: 1.5rem; margin: 0 0 var(--gap); }
h2 { font-size: 1.15rem; margin: 1.5em 0 .5em; }
h3 { font-size: 1rem; margin: 1em 0 .4em; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.muted { color: var(--muted); }
.panel, .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--gap); margin-bottom: var(--gap); }
.kicker { display: flex; justify-content: space-between; gap: 8px; font-size: .85rem; color: var(--muted); margin-bottom: 8px; }
.badge { background: var(--accent); color: #fff; border-radius: 99px; padding: 2px 10px; font-weight: 600; }
button, .btn { font: inherit; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 12px; padding: 12px 16px; min-height: 48px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
button.primary, .btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
.big { width: 100%; font-size: 1.25rem; min-height: 64px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.row > * { flex: 1; }
textarea, input[type=text], input[type=number], input[type=password] { width: 100%; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
textarea { min-height: 120px; }
textarea.mono, pre, code { font-family: ui-monospace, Consolas, monospace; font-size: .9rem; }
pre { overflow-x: auto; border-radius: 10px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
.stats b { display: block; font-size: 1.4rem; }
.rate button.r-green { border-color: var(--green); } .rate button.r-yellow { border-color: var(--yellow); } .rate button.r-red { border-color: var(--red); }
.rate button.suggested { outline: 3px solid currentColor; font-weight: 700; }
.opt { width: 100%; text-align: left; justify-content: flex-start; margin-bottom: 8px; }
.opt.right { border-color: var(--green); background: color-mix(in srgb, var(--green) 15%, transparent); }
.opt.wrong { border-color: var(--red); background: color-mix(in srgb, var(--red) 15%, transparent); }
.cloze-input { display: inline-block; width: 9em; padding: 2px 6px; margin: 0 2px; }
.cloze-input.right { border-color: var(--green); } .cloze-input.wrong { border-color: var(--red); }
.checklist label { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; }
.checklist input { width: 22px; height: 22px; flex: none; margin-top: 2px; }
.warn { border-left: 4px solid var(--yellow); padding: 8px 12px; background: var(--surface); margin-bottom: var(--gap); }
nav.bottom { display: flex; gap: 8px; margin-top: var(--gap); }
nav.bottom a { flex: 1; }
```

- [ ] **Step 4: `js/render.js`, `js/app.js`, Platzhalter `js/ui/learn.js`**

`js/render.js`:
```js
export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function md(text = '') {
  if (!globalThis.marked) return esc(text).replace(/\n/g, '<br>');
  const math = [];
  const guarded = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => `@@M${math.push(m) - 1}@@`);
  return globalThis.marked.parse(guarded).replace(/@@M(\d+)@@/g, (_, i) => esc(math[Number(i)]));
}

export function enhance(el) {
  globalThis.renderMathInElement?.(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
  if (globalThis.hljs) el.querySelectorAll('pre code').forEach(b => globalThis.hljs.highlightElement(b));
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function download(filename, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
```

`js/app.js`:
```js
import { loadData } from './data.js';
import { createStore } from './store.js';
import { renderStart } from './ui/start.js';
import { renderLearn } from './ui/learn.js';
import { renderGaps } from './ui/gaps.js';
import { renderSettings } from './ui/settings.js';

const root = document.getElementById('app');
const ctx = { data: null, store: createStore(), root };
const ROUTES = { '': renderStart, learn: renderLearn, gaps: renderGaps, settings: renderSettings };

function route() {
  const view = ROUTES[location.hash.replace(/^#\/?/, '')] ?? renderStart;
  root.replaceChildren();
  window.scrollTo(0, 0);
  view(ctx);
}

async function main() {
  ctx.data = await loadData(p => fetch(p).then(r => {
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  }));
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main().catch(e => { root.textContent = `Fehler beim Laden: ${e.message}`; });
```

`js/ui/learn.js` (Platzhalter, wird in Task 7 ersetzt):
```js
export function renderLearn(ctx) {
  ctx.root.textContent = 'Lernmodus folgt.';
}
```

- [ ] **Step 5: `js/ui/start.js`**

```js
import { h, esc } from '../render.js';
import { isDue } from '../scheduler.js';
import { openGaps } from '../gaps.js';

const DAY = 86400000;
const daysLeft = (exam, now) => { const [y, m, d] = exam.split('-').map(Number); return Math.ceil((new Date(y, m - 1, d) - now) / DAY); };

export function renderStart({ data, store, root }) {
  const doc = store.load();
  const now = new Date();
  const gaps = openGaps(doc.gaps);
  const rows = Object.entries(data.meta.faecher).map(([f, info]) => {
    const cards = data.cards.filter(c => c.fach === f);
    const due = cards.filter(c => isDue(doc.cards[c.id], now)).length;
    const fresh = cards.filter(c => !doc.cards[c.id]).length;
    const g = gaps.filter(x => x.fach === f).length;
    return `<div class="panel"><div class="kicker"><span class="badge">${esc(info.short)}</span><span>noch ${daysLeft(info.exam, now)} Tage</span></div>
      <div class="stats"><div><b>${due}</b>fällig</div><div><b>${fresh}</b>neu</div><div><b>${g}</b>Lücken</div></div></div>`;
  }).join('');
  const warn = data.errors.length ? `<div class="warn">${data.errors.length} Karten fehlerhaft und ausgeblendet – siehe Einstellungen.</div>` : '';
  root.append(h(`<section>
    <h1>Klausurtraining</h1>${warn}
    <a class="btn primary big" href="#/learn">Lernen</a>
    <h2>Stand</h2>${rows}
    <nav class="bottom"><a class="btn" href="#/gaps">Lücken</a><a class="btn" href="#/settings">Einstellungen</a></nav>
  </section>`));
}
```

- [ ] **Step 6: `js/ui/gaps.js`**

```js
import { h, esc, md, enhance, download } from '../render.js';
import { openGaps, toMarkdown } from '../gaps.js';

export function renderGaps({ data, store, root }) {
  const doc = store.load();
  const open = openGaps(doc.gaps);
  const closed = doc.gaps.filter(g => g.closed);
  const block = f => {
    const list = open.filter(g => g.fach === f);
    if (!list.length) return '';
    return `<h2>${esc(data.meta.faecher[f].label)}</h2>` + list.map(g =>
      `<div class="panel"><div class="kicker"><span>${new Date(g.added).toLocaleDateString('de-DE')}</span><span>${g.hits.length}/2 ✅</span></div>${md(g.front)}</div>`).join('');
  };
  const el = h(`<section>
    <h1>Lücken (${open.length} offen)</h1>
    ${Object.keys(data.meta.faecher).map(block).join('') || '<p class="muted">Keine offenen Lücken.</p>'}
    <p class="muted">${closed.length} geschlossen.</p>
    <div class="row"><button id="copy">Markdown kopieren</button><button id="dl">Als LUECKEN.md laden</button></div>
    <nav class="bottom"><a class="btn" href="#/">Zurück</a></nav>
  </section>`);
  const text = toMarkdown(doc.gaps, data.meta);
  el.querySelector('#copy').onclick = e => navigator.clipboard.writeText(text).then(() => { e.target.textContent = 'Kopiert ✓'; });
  el.querySelector('#dl').onclick = () => download('LUECKEN.md', text, 'text/markdown');
  root.append(el);
  enhance(el);
}
```

- [ ] **Step 7: `js/ui/settings.js`**

```js
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
```

- [ ] **Step 8: Lokale Vorschau einrichten und prüfen**

In `C:\Users\321up\Desktop\Klausuren\.claude\launch.json` (anlegen bzw. `configurations` ergänzen):
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "lern-app", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8080", "--directory", "lern-app"], "port": 8080 }
  ]
}
```
Mit `preview_start` (`name: "lern-app"`) starten, `resize_window` preset `mobile`, dann prüfen:
- Startseite zeigt drei Fächer-Panels; INF2 mit `742` neu, MTS/Radar `0`.
- `#/settings` zeigt `742 Karten geladen · 0 Fehler`.
- `#/gaps` zeigt „Keine offenen Lücken.“
- `read_console_messages` mit `onlyErrors: true` → leer (Ausnahme: Service-Worker-404 für `sw.js`, der kommt in Task 8).

- [ ] **Step 9: Tests + Commit**

Run: `npm test` → PASS
```bash
git add index.html css/ js/render.js js/app.js js/ui/
git commit -m "feat: App-Shell mit Start, Lücken und Einstellungen"
```

---

### Task 7: Lernmodus (Session, Kartenansichten, Lerneinheit)

**Files:**
- Create: `js/ui/card.js`, `js/ui/unit.js`
- Modify: `js/ui/learn.js` (Platzhalter komplett ersetzen)
- Test: manuell im Browser-Pane

**Interfaces:**
- Consumes: `buildSession`, `insertRelearn` (T5), `review`, `chooseMode` (T3), `addGap`, `recordCorrect` (T4), `md`, `enhance`, `h`, `esc` (T6).
- Produces:
  - `renderCard(root, {card, mode, fachLabel, onRated})` — ruft `onRated({button, mode, hinted})` genau einmal auf.
  - `renderUnit(root, unit, fachLabel, onDone)`.
  - Modus-Zuordnung Tag 1: `mc`, `cloze`, `code` eigene Ansicht; `free`, `voice`, `calc`, `why`, `bridge` → Freitext-Ansicht (Voice/Calc/Brücke kommen an Tag 2–3).

- [ ] **Step 1: `js/ui/unit.js`**

```js
import { h, md, enhance, esc } from '../render.js';

const SECTIONS = [['kern', 'Der Kern'], ['unterDerHaube', 'Unter der Haube'], ['analogie', 'Die Analogie'], ['fehler', 'Der Fehler']];

export function renderUnit(root, unit, fachLabel, onDone) {
  const body = SECTIONS.filter(([k]) => unit[k]).map(([k, t]) => `<h3>${t}</h3>${md(unit[k])}`).join('');
  const videos = (unit.videos ?? []).map(v =>
    `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>${v.verified ? '' : ' <span class="muted">(Suche)</span>'}</li>`).join('');
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>Neue Lerneinheit</span></div>
    <h1>${esc(unit.title)}</h1>${body}
    ${videos ? `<h3>Videos</h3><ul>${videos}</ul>` : ''}
    <button class="primary big" id="go">Verstanden – zur Abfrage</button>
  </article>`);
  el.querySelector('#go').onclick = onDone;
  root.replaceChildren(el);
  enhance(el);
}
```

- [ ] **Step 2: `js/ui/card.js`**

```js
import { h, md, enhance, esc } from '../render.js';

const MODE_LABEL = { free: 'Freitext', voice: 'Erklären', code: 'Code', calc: 'Rechnen', mc: 'Multiple Choice', cloze: 'Lückentext', why: 'Warum?', bridge: 'Brücke' };
const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

function ratingBar(suggest, cb) {
  const el = h(`<div class="row rate">
    <button class="r-red" data-b="red">🔴 Lücke</button>
    <button class="r-yellow" data-b="yellow">🟡 Unsicher</button>
    <button class="r-green" data-b="green">🟢 Easy</button></div>`);
  el.querySelectorAll('button').forEach(b => {
    if (b.dataset.b === suggest) b.classList.add('suggested');
    b.onclick = () => { el.querySelectorAll('button').forEach(x => (x.disabled = true)); cb(b.dataset.b); };
  });
  return el;
}

export function renderCard(root, { card, mode, fachLabel, onRated }) {
  const el = h(`<article class="card">
    <div class="kicker"><span class="badge">${esc(fachLabel)}</span><span>${MODE_LABEL[mode] ?? mode}</span></div>
    <div class="q"></div><div class="work"></div><div class="reveal" hidden></div><div class="rate-slot" hidden></div>
  </article>`);
  root.replaceChildren(el);
  const [q, work, reveal, rate] = ['.q', '.work', '.reveal', '.rate-slot'].map(s => el.querySelector(s));
  let hinted = false;

  const showBack = () => {
    reveal.hidden = false;
    reveal.innerHTML = `<h3>Lösung</h3>${md(card.back)}${card.why && mode !== 'why' ? `<h3>Denk-Trigger</h3>${md(card.why)}` : ''}`;
    enhance(reveal);
  };
  const showRating = suggest => {
    rate.hidden = false;
    rate.replaceChildren(ratingBar(suggest, button => onRated({ button, mode, hinted })));
    rate.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  if (mode === 'mc') {
    q.innerHTML = md(card.mc.stem || card.front);
    for (const opt of shuffle(card.mc.options)) {
      const b = h(`<button class="opt">${esc(opt)}</button>`);
      b.onclick = () => {
        const right = opt === card.mc.correct;
        work.querySelectorAll('.opt').forEach(o => { o.disabled = true; if (o.textContent === card.mc.correct) o.classList.add('right'); });
        if (!right) b.classList.add('wrong');
        showBack();
        showRating(right ? 'green' : 'red');
      };
      work.append(b);
    }
  } else if (mode === 'cloze') {
    q.innerHTML = md(card.front);
    const p = document.createElement('p');
    card.cloze.text.split(/(\{\{\d+\}\})/).forEach(part => {
      const m = part.match(/^\{\{(\d+)\}\}$/);
      if (m) { const i = h(`<input type="text" class="cloze-input" data-i="${Number(m[1]) - 1}" autocomplete="off">`); p.append(i); }
      else p.append(part);
    });
    const check = h('<button class="primary big">Prüfen</button>');
    check.onclick = () => {
      const inputs = [...p.querySelectorAll('input')];
      let ok = 0;
      inputs.forEach(i => {
        const want = card.cloze.answers[Number(i.dataset.i)];
        const right = norm(i.value) === norm(want);
        ok += right; i.classList.add(right ? 'right' : 'wrong'); i.disabled = true;
        if (!right) i.value = `${i.value} → ${want}`;
      });
      check.remove();
      showBack();
      showRating(ok === inputs.length ? 'green' : ok * 2 >= inputs.length ? 'yellow' : 'red');
    };
    work.append(p, check);
  } else if (mode === 'code') {
    q.innerHTML = md(card.front);
    work.append(h('<textarea class="mono" placeholder="Erst auf Papier bzw. hier selbst schreiben …" spellcheck="false"></textarea>'));
    const hints = card.code?.hints ?? [];
    let shown = 0;
    const hintBox = document.createElement('div');
    const hintBtn = h(`<button>Hinweis (${hints.length})</button>`);
    hintBtn.hidden = !hints.length;
    hintBtn.onclick = () => {
      hinted = true;
      hintBox.append(h(`<div class="panel">💡 ${md(hints[shown++])}</div>`));
      enhance(hintBox);
      hintBtn.textContent = `Hinweis (${hints.length - shown})`;
      if (shown >= hints.length) hintBtn.hidden = true;
    };
    const solve = h('<button class="primary">Lösung zeigen</button>');
    solve.onclick = () => { solve.remove(); hintBtn.remove(); showBack(); showRating(null); };
    work.append(hintBox, h('<div class="row"></div>'));
    work.lastChild.append(hintBtn, solve);
  } else {
    q.innerHTML = mode === 'why' && card.why ? `<div class="muted">${md(card.front)}</div>${md(`**${card.why}**`)}` : md(card.front);
    work.append(h(`<textarea placeholder="${mode === 'voice' ? 'Laut erklären und Stichpunkte tippen …' : 'Erst selbst antworten …'}"></textarea>`));
    const go = h('<button class="primary big">Aufdecken</button>');
    go.onclick = () => {
      go.remove();
      showBack();
      if (!card.keyPoints?.length) return showRating(null);
      const list = h(`<div class="checklist"><h3>Kernpunkte – was hattest du?</h3>${card.keyPoints.map((k, i) =>
        `<label><input type="checkbox" data-i="${i}"><span>${md(k)}</span></label>`).join('')}</div>`);
      const done = h('<button class="primary">Auswerten</button>');
      done.onclick = () => {
        const ratio = list.querySelectorAll('input:checked').length / card.keyPoints.length;
        done.remove();
        showRating(ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'yellow' : 'red');
      };
      reveal.append(list, done);
      enhance(list);
    };
    work.append(go);
  }
  enhance(q);
}
```

- [ ] **Step 3: `js/ui/learn.js` ersetzen**

```js
import { h } from '../render.js';
import { buildSession, insertRelearn } from '../session.js';
import { review, chooseMode } from '../scheduler.js';
import { addGap, recordCorrect } from '../gaps.js';
import { renderCard } from './card.js';
import { renderUnit } from './unit.js';

export function renderLearn({ data, store, root }) {
  const doc = store.load();
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const unitById = new Map(data.units.map(u => [u.id, u]));
  const done = new Set();
  const stats = { red: 0, yellow: 0, green: 0 };
  let started = Date.now();
  let queue = [];
  let pos = 0;

  const build = () => buildSession({
    cards: data.cards, units: data.units, doc, meta: data.meta, now: new Date(),
    newLimit: doc.settings.newPerSession, exclude: done,
  });

  function save() {
    try { store.save(doc); }
    catch { alert('Speichern fehlgeschlagen (Speicher voll?). Bitte in den Einstellungen exportieren.'); }
  }

  function end(empty = false) {
    const total = stats.red + stats.yellow + stats.green;
    const el = h(`<section class="card">
      <h1>${empty ? 'Alles erledigt 🎉' : 'Session-Pause'}</h1>
      <div class="stats"><div><b>${stats.green}</b>🟢</div><div><b>${stats.yellow}</b>🟡</div><div><b>${stats.red}</b>🔴</div></div>
      <p class="muted">${total} Karten in ${Math.round((Date.now() - started) / 60000)} min.</p>
      <div class="row">${empty ? '' : '<button class="primary" id="more">Weiter (15 min)</button>'}<a class="btn" href="#/">Schluss</a></div>
    </section>`);
    el.querySelector('#more')?.addEventListener('click', () => { started = Date.now(); next(); });
    root.replaceChildren(el);
  }

  function next() {
    if (Date.now() - started > data.meta.sessionMinutes * 60000) return end();
    if (pos >= queue.length) {
      queue = build();
      pos = 0;
      if (!queue.length) return end(true);
    }
    const item = queue[pos++];
    const fachLabel = data.meta.faecher[item.fach].short;
    if (item.type === 'unit') {
      return renderUnit(root, unitById.get(item.unitId), fachLabel, () => {
        doc.units[item.unitId] = { seen: true };
        save();
        next();
      });
    }
    const card = cardById.get(item.cardId);
    const exam = data.meta.faecher[card.fach].exam;
    const mode = chooseMode(card, doc.cards[card.id], new Date(), exam);
    renderCard(root, {
      card, mode, fachLabel,
      onRated: ({ button, hinted }) => {
        const now = new Date();
        doc.cards[card.id] = review(doc.cards[card.id], { button, mode, hinted }, now, exam);
        if (button === 'red') {
          doc.gaps = addGap(doc.gaps, card, now);
          queue = insertRelearn(queue, pos, { type: 'card', cardId: card.id, fach: card.fach }, data.meta.relearnGap);
        } else if (button === 'green') {
          doc.gaps = recordCorrect(doc.gaps, card.id, now);
        }
        done.add(card.id);
        stats[button]++;
        save();
        next();
      },
    });
    window.scrollTo(0, 0);
  }

  next();
}
```

- [ ] **Step 4: Im Browser-Pane prüfen** (Mobil-Viewport, `localStorage` vorher leeren: `javascript_tool` → `localStorage.clear()`)

Durchspielen und bestätigen:
1. „Lernen“ → erste Karte ist eine INF2-Prioritätskarte im Modus **Multiple Choice**; richtige Antwort markiert grün und schlägt 🟢 vor.
2. 🔴 auf einer Karte → dieselbe Karte erscheint nach 5 weiteren Karten wieder; `#/gaps` zeigt sie mit `0/2 ✅`.
3. Eine Code-Übung (`INF2-K25-code-leicht`) erscheint mit Hinweis-Button und Java-Highlighting in der Lösung. Zum gezielten Testen in der Konsole: `localStorage.clear()` und Neuladen reicht nicht zwingend — alternativ in der Konsole prüfen, dass `document.querySelector('pre code.hljs')` nach „Lösung zeigen“ existiert.
4. Neuladen der Seite mitten in der Session → Fortschritt bleibt (Startseite zeigt weniger „neu“).
5. `read_console_messages` (`onlyErrors: true`) → keine Fehler außer `sw.js` 404.

- [ ] **Step 5: Commit**

```bash
git add js/ui/
git commit -m "feat: Lernmodus mit MC, Lückentext, Code, Freitext-Checkliste und Lerneinheiten"
```

---

### Task 8: PWA (Manifest, Icon, Service Worker)

**Files:**
- Create: `manifest.webmanifest`, `icon.svg`, `sw.js`
- Test: `tests/sw.test.js`

**Interfaces:**
- Consumes: alle Dateien aus Tasks 1–7 (werden in `SHELL` gelistet).
- Produces: `sw.js` mit `const CACHE` und `const SHELL = [...]` (der Test liest dieses Array).

- [ ] **Step 1: Failing test schreiben** — `tests/sw.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));

test('jede SHELL-Datei existiert', () => {
  for (const p of shell.filter(p => p !== './')) assert.ok(existsSync(new URL(p, root)), `fehlt: ${p}`);
});

test('alle JS-Module und Datendateien sind in SHELL', () => {
  const js = readdirSync(new URL('js/', root)).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
  const ui = readdirSync(new URL('js/ui/', root)).map(f => `js/ui/${f}`);
  const data = readdirSync(new URL('data/', root)).map(f => `data/${f}`);
  for (const p of [...js, ...ui, ...data]) assert.ok(shell.includes(p), `nicht gecacht: ${p}`);
});

test('Gemini-Aufrufe werden nie gecacht', () => {
  assert.match(sw, /generativelanguage\.googleapis\.com/);
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `node --test tests/sw.test.js`
Expected: FAIL — `ENOENT ... sw.js`

- [ ] **Step 3: Dateien anlegen**

`manifest.webmanifest`:
```json
{
  "name": "Klausurtraining Semester 4",
  "short_name": "Klausur",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "lang": "de",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
}
```

`icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f172a"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#60a5fa" stroke-width="28"/>
  <circle cx="256" cy="256" r="70" fill="none" stroke="#60a5fa" stroke-width="28" opacity=".6"/>
  <path d="M256 256 L380 150" stroke="#e2e8f0" stroke-width="28" stroke-linecap="round"/>
</svg>
```

`sw.js`:
```js
const CACHE = 'lernapp-v1';
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
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: alle Tests PASS

- [ ] **Step 5: Offline im Browser-Pane prüfen**

Seite neu laden (SW registriert), dann per `javascript_tool`:
```js
(await caches.keys()).join(',') + ' | ' + (await (await caches.open('lernapp-v1')).keys()).length
```
Expected: `lernapp-v1 | ` gefolgt von einer Zahl ≥ 25 (Shell + CDN-Dateien nach einem Durchlauf). Konsole ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add manifest.webmanifest icon.svg sw.js tests/sw.test.js
git commit -m "feat: PWA mit Manifest, Icon und Offline-Cache"
```

---

### Task 9: MTS-Einheit K2 · Respiratorisches System I (RS1)

**Files:**
- Modify: `data/units.json` (Unit `MTS-K2` ergänzen), `data/cards-mts.json`
- Test: `tests/content-mts.test.js`

**Interfaces:**
- Consumes: Datenformat aus Spec §5 und `validateData` (T1).
- Produces: Unit-ID `MTS-K2` (order `2`), Karten-IDs `MTS-K2-01` … `MTS-K2-NN`.

**Quellen (vollständig lesen, bevor geschrieben wird):**
- `..\Semester 4 - Medizintechnische Systeme & Fehlerdiagnose\Vorlesungsfolien\MTS__02_RS1.pdf`
- `..\Semester 4 - Medizintechnische Systeme & Fehlerdiagnose\Uebungen\MTS_Ue__01_RS1.pdf`
- `..\Lernplan\02_Medizintechnische_Systeme.md`, Abschnitte „K2 · Respiratorisches System I“, „Die Rechenaufgabentypen“, „Fallstricke“

**Inhaltsregeln:**
- Jede Aussage muss aus den Quellen stammen; `source` nennt Datei und Folien- bzw. Aufgabennummer (`"MTS__02_RS1.pdf, Folie 14"`).
- Unit-Felder `kern` (1–2 Sätze), `unterDerHaube`, `analogie`, `fehler` im Stil des Master-Prompts: knapp, hart, Fett für Schlüsselbegriffe, Formeln als `$…$`. `videos: []` (Videos kommen in einer späteren Stufe).
- 15–20 Karten, `examMode: "free"`. Jede Karte hat 2–4 `keyPoints` (prüfbare Einzelaussagen, kein Fließtext).
- Mindestens 5 Karten mit `mc` (4 Optionen, plausible Distraktoren), mindestens 5 mit `cloze`, mindestens 5 mit `why`.
- Mindestens 3 Karten sind Anwendungs- bzw. Rechenfragen aus der Übung RS1 (mit Rechenweg in `back`). Dynamische `calc`-Aufgaben kommen erst an Tag 2.

- [ ] **Step 1: Failing test schreiben** — `tests/content-mts.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const unit = read('units.json').find(u => u.id === 'MTS-K2');
const cards = read('cards-mts.json').filter(c => c.unit === 'MTS-K2');

test('Unit MTS-K2 vollständig', () => {
  assert.ok(unit);
  for (const k of ['kern', 'unterDerHaube', 'analogie', 'fehler']) assert.ok(unit[k]?.length > 20, `${k} fehlt`);
});

test('15–20 Karten mit keyPoints und Quelle', () => {
  assert.ok(cards.length >= 15 && cards.length <= 20, `Anzahl ${cards.length}`);
  for (const c of cards) {
    assert.ok(c.keyPoints?.length >= 2 && c.keyPoints.length <= 4, `${c.id} keyPoints`);
    assert.match(c.source, /MTS__02_RS1\.pdf|MTS_Ue__01_RS1\.pdf|02_Medizintechnische_Systeme\.md/, `${c.id} source`);
  }
});

test('Abfrage-Varianten ausreichend', () => {
  assert.ok(cards.filter(c => c.mc).length >= 5);
  assert.ok(cards.filter(c => c.cloze).length >= 5);
  assert.ok(cards.filter(c => c.why).length >= 5);
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `node --test tests/content-mts.test.js`
Expected: FAIL — `Unit MTS-K2 vollständig`

- [ ] **Step 3: Quellen lesen** (PDF mit dem Read-Tool seitenweise, `pages: "1-20"` usw.) und Stichpunkte der prüfungsrelevanten Inhalte notieren.

- [ ] **Step 4: Unit an `data/units.json` anhängen** — Form:

```json
{ "id": "MTS-K2", "fach": "MTS", "order": 2, "title": "K2 · Respiratorisches System I: Grundlagen",
  "kern": "…", "unterDerHaube": "…", "analogie": "…", "fehler": "…", "videos": [] }
```

- [ ] **Step 5: Karten in `data/cards-mts.json` schreiben** — jede Karte in dieser Form:

```json
{ "id": "MTS-K2-01", "fach": "MTS", "unit": "MTS-K2", "examMode": "free",
  "front": "…", "back": "…", "keyPoints": ["…", "…"], "why": "…",
  "mc": { "stem": "…", "options": ["…", "…", "…", "…"], "correct": "…" },
  "cloze": { "text": "… {{1}} … {{2}} …", "answers": ["…", "…"] },
  "source": "MTS__02_RS1.pdf, Folie N" }
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: alle PASS (inkl. `realdata`: keine Fehler)

- [ ] **Step 7: Im Browser-Pane prüfen** — nach `localStorage.clear()` und Neuladen erscheint innerhalb der ersten ~10 Items die Lerneinheit „K2 · Respiratorisches System I“ mit korrekt gerenderten Formeln; die folgende MTS-Karte zeigt nach „Aufdecken“ die Kernpunkte-Checkliste.

- [ ] **Step 8: Commit**

```bash
git add data/units.json data/cards-mts.json tests/content-mts.test.js
git commit -m "content: MTS K2 Respiratorisches System I"
```

Und: `const CACHE = 'lernapp-v1'` in `sw.js` auf `'lernapp-v2'` erhöhen, damit Geräte die neuen Daten sicher laden; `git commit -am "chore: Cache-Version erhöht"`.

---

### Task 10: Deployment (Checkpoint mit dem Nutzer)

**Files:** keine Code-Änderungen.

- [ ] **Step 1: Entscheidung einholen** — dem Nutzer die offene Frage aus Spec §2 stellen (AskUserQuestion):
  - **GitHub Pages, öffentliches Repo:** am schnellsten, aber Karten aus Vorlesungsunterlagen sind öffentlich einsehbar.
  - **Cloudflare Pages aus privatem Repo:** privat; Nutzer muss sich einmal bei Cloudflare anmelden und das Repo verbinden (das macht der Nutzer selbst).
  - **Nur lokal testen:** kein Deploy.

  Nicht ohne ausdrückliches Ja pushen oder veröffentlichen.

- [ ] **Step 2a (bei GitHub Pages):**

```bash
gh repo create lern-app --public --source . --push
gh api -X POST repos/Juurpa/lern-app/pages -f "source[branch]=main" -f "source[path]=/"
gh api repos/Juurpa/lern-app/pages --jq .html_url
```
Expected: URL `https://juurpa.github.io/lern-app/`. Nach 1–2 min im Browser-Pane öffnen und Startseite prüfen.

- [ ] **Step 2b (bei Cloudflare Pages):**

```bash
gh repo create lern-app --private --source . --push
```
Dann dem Nutzer die Schritte nennen: dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → `lern-app` wählen → Build command leer, Output directory `/` → Deploy. URL in den Browser-Pane laden und prüfen.

- [ ] **Step 3: Installation erklären** — Android/Chrome: Menü → „App installieren“. iPhone/Safari: Teilen → „Zum Home-Bildschirm“.

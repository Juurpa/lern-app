# Lern-App Semester 4 — Design

**Datum:** 2026-09-22 · **Status:** Entwurf zur Freigabe
**Prüfungen:** MTS (Open Book, schriftlich) + INF2 (Freitext, schriftlich) am **07.10.2026**, Radartechnik (**mündlich**) am **08.10.2026**.
**Harte Randbedingung:** 15 Tage bis zur Prüfung. Die App muss ab Tag 1 benutzbar sein; alles Weitere kommt inkrementell als Daten.

---

## 1. Ziel

Eine Handy-App, die **alle drei Fächer an einem Ort abfragt**, ohne dass der Nutzer Decks oder Fächer auswählt. Ein Knopf „Lernen" stellt die Session zusammen. Grundlage sind kognitionswissenschaftliche Prinzipien des Master-Prompts (`master_prompt_telegram_lern_bot.md`): Active Recall, Elaborative Interrogation, Feynman-Analogien, Interleaving.

**Nicht-Ziele:** Account/Sync zwischen Geräten, Neurophysiologie (abgemeldet), native App, Änderungen am bestehenden Telegram-Bot (`Claude outputs/bot.py` bleibt unverändert).

---

## 2. Plattform & Architektur

- **PWA ohne Build-Schritt:** reines HTML/CSS/JS (ES-Module), installierbar per „Zum Startbildschirm", offline per Service Worker.
- **Bibliotheken per CDN** (jsdelivr, vom Service Worker gecacht): `ts-fsrs` (Scheduling), `marked` (Markdown), `katex` (Formeln), `highlight.js` (Java/MATLAB-Code).
- **Speicher:** `localStorage` — Lernzustand pro Karte, Lückenliste, Einstellungen (inkl. Gemini-Key). Export/Import als JSON-Datei als Backup.
- **Hosting:** GitHub Pages (Account `Juurpa` vorhanden). HTTPS ist Pflicht für Installation und Mikrofon.
  **Offene Entscheidung beim Deployment:** GitHub Pages im Free-Plan braucht ein öffentliches Repo; die Inhalte sind aus Vorlesungsunterlagen abgeleitet. Alternative: privates Repo + Cloudflare Pages. Wird vor dem ersten Deploy mit dem Nutzer entschieden.

### Module (je eine klare Aufgabe)

| Modul | Aufgabe | Abhängig von |
|---|---|---|
| `js/data.js` | lädt `data/*.json`, validiert Pflichtfelder, liefert Karten/Units/Bridges | — |
| `js/store.js` | liest/schreibt Lernzustand, Lücken, Settings; Export/Import | localStorage |
| `js/scheduler.js` | FSRS + Reiz-Multiplikator + Prüfungsdeckel + Modus-Wahl | ts-fsrs, meta |
| `js/session.js` | baut die 15-Minuten-Session (Reihenfolge, Interleaving, Relearn) | scheduler, data |
| `js/grader.js` | Bewertung: Selbstbewertung (Checkliste) oder Gemini | gemini.js |
| `js/gemini.js` | Gemini-API-Aufrufe (Text + Audio), strukturierte JSON-Antwort | fetch |
| `js/voice.js` | Spracheingabe (Web Speech API, Fallback Audioaufnahme) | — |
| `js/calc.js` | Rechenaufgaben mit Zufallswerten erzeugen und prüfen | — |
| `js/sim/radar.js` | FMCW-Radar-Simulation (Canvas) | — |
| `js/ui/*.js` | Views: Start, Karte, Lerneinheit, Lücken, Boss-Runde, Sim, Einstellungen | alle |

`scheduler.js`, `session.js`, `calc.js` und die Radar-Rechenkerne sind **reine Funktionen ohne DOM** und werden mit `node --test` getestet.

---

## 3. Lern-Engine

### 3.1 Scheduling: FSRS + „Wissens-1RM"

FSRS (ts-fsrs, Standardparameter) verwaltet pro Karte Stabilität S und Schwierigkeit D.

**Rating-Abbildung** (Buttons → FSRS):

| Button | Freitext/Voice/Calc ohne Hilfe | mit Hinweis | Lückentext/MC |
|---|---|---|---|
| 🔴 Lücke | Again | Again | Again |
| 🟡 Unsicher | Hard | Hard | Hard |
| 🟢 Easy | Easy | Good | Good |

**Reiz-Multiplikator:** Nach dem FSRS-Update wird der Stabilitätszuwachs gedämpft:
`S_neu = S_alt + (S_fsrs − S_alt) × m`, mit m = MC 0,3 · Lückentext 0,5 · Freitext mit Hinweis 0,7 · Freitext/Voice/Calc ohne Hilfe 1,0 · Brücke/Warum gelöst 1,2. Das Intervall wird aus `S_neu` neu berechnet. Bei „Again" gilt kein Multiplikator.

**Prüfungsdeckel:** Kein Fälligkeitsdatum liegt nach `Prüfungstag − 1` des Fachs.

### 3.2 Abfrage-Modus pro Karte

| Stabilität | Modus |
|---|---|
| neu / erste 2 Wiederholungen | Lückentext oder MC (falls vorhanden), sonst Freitext |
| S < 10 Tage | `examMode` der Karte (free / voice / code / calc) |
| S ≥ 10 Tage („Mutation") | abwechselnd Warum-/Brückenfrage und `examMode` |
| **≤ 3 Tage vor Prüfung des Fachs (Lock)** | immer `examMode`; jede fällige Karte des Fachs mindestens einmal |

Standard-`examMode`: INF2 = free bzw. code · MTS = calc bzw. free · Radar = **voice**.

### 3.3 Session („Lernen"-Knopf)

1. **Relearn-Warteschlange:** 🔴 Karten kommen in derselben Session nach ~5 Karten erneut.
2. **Fällige Wiederholungen**, gewichtet nach Fachanteil: `w = 1/Tage_bis_Prüfung × (1 + Lückenquote)`.
3. **Neue Inhalte** in Unit-Reihenfolge; vor der ersten Karte einer neuen Unit wird die **Lerneinheit** gezeigt.
4. **Interleaving:** maximal 3 Karten desselben Fachs hintereinander.
5. Nach ~15 min: Auswahl **Weiter · Boss-Runde · Schluss**.

### 3.4 Nach dem Aufdecken

- **Warum-Frage** (`why`) als kurzer Denk-Trigger (optional beantworten).
- **Brücken-Challenge:** Es wird die Frage nach der Verbindung gestellt, nicht die Verbindung selbst. Nutzer antwortet (Text/Sprache), dann Hinweis aufdecken. Nur kuratierte, fachlich tragfähige Brücken aus `bridges.json`.

### 3.5 Lücken

Jede 🔴-Karte landet in der Lückenliste. Entfernt wird sie erst nach **zwei korrekten Abrufen im Abstand von ≥ 1 Tag**. Export als Markdown im Format von `Lernplan/LUECKEN.md`.

### 3.6 Boss-Runde

Zwei Konzepte aus der letzten Session, aus **verschiedenen Fächern**, werden zu einer Entwurfsaufgabe. Mit Gemini: frisch generiert und bewertet. Ohne KI: eine passende Aufgabe aus `synthesis.json` (~20 Stück) mit Kernpunkte-Checkliste zur Selbstbewertung.

---

## 4. Bewertung & Gemini

**Ohne KI (immer verfügbar):** Lösung aufdecken → `keyPoints` als Checkliste abhaken → Button 🟢/🟡/🔴 (vorgeschlagen anhand der abgehakten Anteile, überschreibbar).

**Mit Gemini** (Key in den Einstellungen, nur lokal gespeichert; Modellname konfigurierbar, Standard: aktuelles Flash-Modell):
- Eingabe: Frage, Musterlösung, `keyPoints`, Nutzerantwort (Text oder Audio).
- Parameter: `temperature: 0`, `responseSchema` → `{ keyPoints: [{point, erfuellt, kommentar}], staerke, unscharfeStelle, nochmalVersuchen, vorschlagRating }`.
- **Regeln (Tutor-Prompt, `prompts/tutor.md`):** Logik vor Vokabeln · erst nennen, was stimmt · genau eine unscharfe Stelle · beim ersten Versuch **keine Lösung verraten**, sondern zweiten Versuch fordern · nach dem zweiten Versuch Lösung + Brückenfrage.
- Fehler (kein Netz, Quota, ungültiger Key) → automatischer Rückfall auf Selbstbewertung, mit kurzem Hinweis.

**Spracheingabe:** Web Speech API (`de-DE`) mit Live-Transkript. Ist sie nicht verfügbar (z. B. iOS-Einschränkungen) und ein Gemini-Key vorhanden: Audioaufnahme per MediaRecorder und direkt an Gemini. Ohne beides: Tippen.

**Überarbeiteter Master-Prompt** (`prompts/tutor.md`) ist ein eigenes Lieferobjekt: das Original, geschärft um die Regeln oben, die `keyPoints`-Checkliste, das Prüfungsformat je Fach und das JSON-Ausgabeformat.

---

## 5. Datenformat

JSON als Container, Texte als Markdown (+ KaTeX `$…$`, Code-Fences).

```
data/meta.json        Fächer, Prüfungstermine, examMode-Defaults
data/units.json       Lerneinheiten
data/cards-inf2.json  konvertiert aus Lernplan/cards_data.js + code_exercises.json
data/cards-mts.json
data/cards-radar.json
data/bridges.json
data/synthesis.json
prompts/tutor.md
```

**Karte** — Pflicht: `id, fach, unit, front, back, examMode`. Optional: `modes, keyPoints, why, cloze, mc, calc, code, bridges, sim, source`.

```json
{
  "id": "RAD-S3-07", "fach": "RADAR", "unit": "RAD-S3",
  "examMode": "voice",
  "front": "Wie bestimmst du aus Up- und Downchirp Entfernung **und** Geschwindigkeit?",
  "back": "$f_R=\\frac{f_{up}+f_{down}}{2}$, $f_D=\\frac{f_{down}-f_{up}}{2}$ …",
  "keyPoints": ["Beat-Frequenz = Laufzeit- + Doppleranteil", "Summe → Entfernung", "Differenz → Geschwindigkeit"],
  "why": "Warum reicht ein einzelner Chirp nicht?",
  "bridges": ["BR-12"],
  "sim": { "preset": "twoTargets" },
  "source": "Anforderung.txt, Punkt 'Zielbestimmung'"
}
```

**Lerneinheit:** `{ id, fach, order, title, kern, unterDerHaube, analogie, fehler, videos: [{title, url, verified}] }`.
**Rechenaufgabe (`calc`):** `{ vars: {name: [min, max, step]}, prompt, solutionExpr, unit, tolerance, steps }`. Werte werden zur Laufzeit gezogen; die Lösung wird mit denselben Werten berechnet.
**Brücke:** `{ id, from, to, challenge, hint, keyPoints }`.
**Videos:** nur geprüfte Links (`verified: true`); sonst YouTube-Suchlink mit präzisem Suchbegriff (`verified: false`, in der UI als „Suche" gekennzeichnet).

---

## 6. Inhalte

| Fach | Quelle | Umfang |
|---|---|---|
| INF2 | `Lernplan/cards_data.js` (682 Karten), `code_exercises.json` (20 Decks) | vollständig übernehmen; `keyPoints` + `why` ergänzen für K25 und LE04–LE11 |
| MTS | Vorlesungsfolien K2–K10, Übungen RS1–4/CRM, Seminar Strömungsmechanik, `02_Medizintechnische_Systeme.md` | 10 Units, ~150 Karten, davon ~40 `calc` |
| Radar | `Lecture_RadarSystems_Lec.pdf`, `Anforderung.txt`, `04_Radartechnik.md`, `Radar_FMCW_Diskussion.md` | 5 Stationen, ~100 Karten, alle `examMode: voice` |
| Brücken / Boss | eigene Kuratierung | ~40 / ~20 |

Jede erzeugte Karte trägt `source` (Datei/Folie), damit sie gegen das Original prüfbar ist.

---

## 7. Radar-Simulation

Parameter nach `Anforderung.txt`: f₀ = 76 GHz, B = 100 MHz, Up- und Downchirp, 512 Samples, Zykluszeit 50 ms, zwei Ziele (Standard R = 10 m / 30 m, v = −2 / +5 m/s), per Schieberegler veränderbar.

Anzeigen: Beat-Spektrum Up/Down mit Peaks · aus Up/Down berechnete R und v · Kennwerte R_max, v_max, ΔR, Δv · zweite Antenne mit Abstand d (Standard λ/2), Zielwinkel (Standard −30° / 50°), Phasendifferenz → Winkel, Mehrdeutigkeit bei d > λ/2.

Karten können die Sim mit einem Preset und einer Aufgabe öffnen („Stell R so ein, dass die Ziele gerade nicht mehr trennbar sind"). Rechenkern (Signal, FFT, Peak-Suche, Winkel) ist DOM-frei und getestet.

---

## 8. Fehlerbehandlung

- Ungültige Karte in den Daten → wird übersprungen und in der Konsole/Einstellungen gelistet, App läuft weiter.
- `localStorage` nicht verfügbar/voll → Warnbanner, Export anbieten.
- Gemini-Fehler → Rückfall auf Selbstbewertung (siehe 4).
- Keine Spracherkennung → Tippen.
- Offline → alles außer Gemini und Videos funktioniert.

## 9. Tests

- `node --test` für `scheduler` (Rating-Abbildung, Multiplikator, Prüfungsdeckel, Modus-Wahl inkl. 3-Tage-Lock), `session` (Interleaving ≤ 3, Relearn nach ~5, Gewichtung), `calc` (Lösung stimmt mit Formel), Radar-Kern (Peaks bei den erwarteten Frequenzen, Winkel aus Phase).
- Datenvalidierung als Test: alle `data/*.json` gegen Pflichtfelder, eindeutige IDs, gültige Referenzen (`unit`, `bridges`).
- Manuell im Browser-Pane mit Mobil-Viewport: Session-Durchlauf, Offline, Installation.

## 10. Rollout

| Stufe | Inhalt |
|---|---|
| **Tag 1** | App-Gerüst, Engine, Store, Selbstbewertung, INF2 komplett, MTS Unit RS1, Deploy |
| **Tag 2–3** | restliches MTS inkl. `calc`, Radar-Karten, Radar-Sim, Voice, Gemini-Tutor + `prompts/tutor.md` |
| **Danach** | Brücken, Boss-Runden, Videos, `keyPoints` für INF2 nachziehen |

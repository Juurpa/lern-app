# Lernmaschine (Tag 2+) — Design

**Datum:** 2026-09-22 · **Status:** Entwurf zur Freigabe
**Baut auf:** `2026-09-22-lern-app-design.md` (Tag 1, live unter https://juurpa.github.io/lern-app/)
**Prüfungen:** MTS + INF2 am 07.10.2026 · Radar (mündlich) am 08.10.2026

---

## 1. Ziel

Die Lern-App wird zur **Lernmaschine**: Sie sammelt jede Bewertung samt Antworttext, ein täglicher Lauf auf dem PC des Nutzers wertet sie aus, verbessert gezielt Karten und schreibt neue, lässt alles prüfen und veröffentlicht es automatisch. Parallel werden die fehlenden Inhalte (MTS komplett, Radar) und Funktionen (Rechenaufgaben, KI-Tutor, Sprache, Radar-Simulation, Visualisierungen) gebaut.

**Freigaben des Nutzers (22.09.):** automatische Pushes ins öffentliche Repo `Juurpa/lern-app` ohne Rückfrage; PC läuft 24/7; Cloudflare-Login (`wrangler login`) führt der Nutzer einmalig selbst aus.

**Nicht-Ziele:** Wiederherstellung des Lernstands auf neuem Gerät (Daten liegen aber im Worker, später nachrüstbar), Mehrbenutzerbetrieb, Neurophysiologie.

---

## 2. Architektur

```
📱 App ──Ereignisse──▶ ☁️ Worker (Cloudflare) ──▶ KV
   ▲   ◀─Tutor/Whisper─┘      │  Workers AI (LLM, Whisper)
   │                          │
   │               🖥️ PC (Windows, 24/7)
   │                 ├─ alle 15 min: veto.mjs (ohne KI)
   │                 └─ 03:00 / 13:00: nightly (Node + Claude)
   │                          │ git push (nur wenn Prüfer + Tests grün)
   └──── GitHub Pages ◀───────┘
```

Der PC holt sich Daten zu festen Zeiten selbst (Pull). Der Worker muss den PC nie erreichen.

---

## 3. Worker (`worker/`)

Ein Cloudflare Worker (Modul-Syntax) mit KV-Namespace `LERN` und Workers-AI-Binding `AI`. Secrets: `DEVICE_KEY` (App), `ADMIN_KEY` (PC), optional `GEMINI_KEY`.

| Route | Auth | Zweck |
|---|---|---|
| `POST /events` | `Authorization: Bearer DEVICE_KEY` | Batch von Ereignissen speichern (Key `ev:<ts>:<batchId>`), Duplikate über `eventId` ignoriert |
| `GET /events?since=<ts>` | `ADMIN_KEY` | Ereignisse seit Zeitpunkt, für den PC |
| `POST /tutor` | `DEVICE_KEY` | Bewertung einer Freitextantwort (siehe §6) |
| `POST /transcribe` | `DEVICE_KEY` | Audio (webm/mp4, ≤ 60 s) → Text via Whisper |
| `GET /health` | – | `ok` |

CORS nur für `https://juurpa.github.io` und `http://localhost:8080`. Payload-Limits: 256 KB pro Request, `answer` ≤ 2000 Zeichen, `feedback` ≤ 2000 Zeichen.

**Geräteschlüssel:** Da das Repo öffentlich ist, kann der `DEVICE_KEY` nicht im Code stehen. Einrichtung: Die App zeigt beim ersten Start ein Feld „Sync-Schlüssel“; der Controller erzeugt den Schlüssel beim Deploy und nennt ihn dem Nutzer einmalig (bzw. als Link `…/lern-app/#/setup?k=<key>`, der ihn übernimmt und aus der URL entfernt).

---

## 4. App-Erweiterungen

**4.1 Ereignisse.** Nach jeder Bewertung: `{eventId, cardId, rev, fach, button, mode, hinted, answer?, feedback?, ms, ts, sessionId}`; zusätzlich `{type:'veto', cardId, rev}`. Lokale Warteschlange in `localStorage`, Versand sofort bei Netz, sonst beim nächsten Start/Online-Event; max. 2000 gepufferte Ereignisse (älteste zuerst verworfen, Warnung in Einstellungen).

**4.2 Update-Banner.** Beim Start und alle 30 min: `data/version.json` (vom Nachtlauf geschrieben: `{version, changed: [cardIds], date}`) ohne Cache abrufen; weicht sie ab: Banner „✨ N Karten verbessert – jetzt laden“ → SW-Cache für `data/*` aktualisieren, neu laden.

**4.3 Karten-Metadaten.** Neue optionale Felder: `rev` (Zahl, Start 1), `changeNote`, `changedAt`, `status: "suspended"`, `dependencies: [cardId]`, `warning` (Markdown, als ⚠️-Kasten unter der Lösung), `figure` (Pfad zu `data/assets/*.svg`). Karten mit `changedAt` < 3 Tage zeigen „✨ verbessert“ + `changeNote` + Button ♻️ „Zurücksetzen“ (sendet Veto).

**4.4 Pausieren/Vorstufen.** `buildSession` überspringt `status: "suspended"`, solange nicht alle `dependencies` Stabilität ≥ 3 haben; danach wird die Karte normal geplant und als „Mini-Boss“ markiert. Im 3-Tage-Fenster vor der Prüfung des Fachs wird `suspended` ignoriert.

**4.5 Rechenaufgaben (`calc`).** `{vars: {name: [min, max, step]}, given: "Markdown mit {name}", solution: "JS-Ausdruck über vars", unit, tolerance (relativ), steps: ["Markdown mit {name}"]}`. Auswertung ohne `eval`: kleiner Ausdrucksparser (+ − * / ^, Klammern, `sqrt exp ln log10 sin cos tan pi`). Eingabe akzeptiert Komma und Punkt.

**4.6 Tutor & Sprache.** Freitext/Voice: „Bewerten lassen“ → `POST /tutor` → Kernpunkte-Verdikt, Stärke, eine unscharfe Stelle, `nochmalVersuchen`; erster Versuch zeigt keine Lösung, zweiter Versuch dann Lösung. Ohne Netz/Worker-Fehler → Selbstbewertung (Tag-1-Verhalten). Sprache: Web Speech API (`de-DE`) mit Live-Transkript; wo nicht verfügbar → MediaRecorder → `POST /transcribe`. Radar-Karten `examMode: "voice"`.

**4.7 Visualisierung.** ```` ```mermaid ```` in Karten/Units → Mermaid (CDN, gepinnt, `securityLevel: 'strict'`, im SW-Precache). SVG-Dateien als Markdown-Bild (relativer Pfad). Videos: Vorschaubild + youtube-nocookie-iframe erst nach Tippen.

**4.8 Radar-Simulation (`#/sim`).** Parameter nach `Anforderung.txt`: f₀ 76 GHz, B 100 MHz, Up/Down-Chirp, 512 Samples, Zykluszeit 50 ms, 2 Ziele (R 10/30 m, v −2/+5 m/s), 2 Rx-Antennen Abstand d (Standard λ/2), Winkel −30°/50°. Anzeigen: Beat-Spektren Up/Down, Peaks, R und v aus Up/Down, R_max, v_max, ΔR, Δv, Phasendifferenz → Winkel, Mehrdeutigkeit bei d > λ/2. Rechenkern DOM-frei, getestet. Karten öffnen die Sim über `sim: {preset, task}`.

---

## 5. Nachtlauf (`automation/`)

Läuft auf dem PC: Node-Skripte, die Claude Code headless aufrufen (`claude -p … --output-format json`, installiert: Claude Code 2.1.280; `pypdf` 6.14 vorhanden). Geplant über die **Windows-Aufgabenplanung** (`schtasks`, Aufgaben „Lernmaschine-Nacht“ **03:00 voll**, „Lernmaschine-Mittag“ **13:00 klein**, „Lernmaschine-Veto“ **alle 15 min** `node automation/veto.mjs`), unabhängig davon, ob eine Claude-Sitzung offen ist. `ADMIN_KEY` liegt lokal in `automation/.env` (git-ignoriert).

**Ablauf `nightly.mjs --mode full|midday`:**
1. `git pull`; Ereignisse seit letztem Lauf vom Worker holen → lokal `automation/state/events.jsonl` (git-ignoriert).
2. `analyze.mjs` (deterministisch, getestet) → `findings.json`:
   - `weak_cards`: 🔴 bei ≥ 2 der letzten 3 Abrufe (mit Antworttexten)
   - `leeches`: ≥ 3 Rückfälle 🟢→🔴
   - `format_gaps`: 🟢 in mc/cloze, 🔴 in free/voice derselben Karte
   - `topic_gaps`: Unit mit ≥ 40 % 🔴 bei ≥ 8 Abrufen
   - `exam_freeze` pro Fach (≤ 2 Tage vor Prüfung), gesperrte Karten (Veto < 3 Tage), `rules.json`
   - Budget: full 15 Änderungen + 10 neue; midday 5 Änderungen + 0 neue
3. PDF-Kontext: für betroffene Karten den Text der zitierten Folien lokal extrahieren (`pypdf`), Quellen-PDFs bleiben außerhalb des Repos.
4. Claude (Prompt `automation/prompts/optimizer.md`, s. §5.1) liefert ein JSON-Array `{action: update|create, card, changeNote, source}`.
5. `apply.mjs` validiert und setzt um — **Durchsetzung im Code, nicht im Prompt**: Schema (`validateData`), Budget, `exam_freeze` (nur `warning`/neue Karten), Regeln, Quellenpflicht, `rev++`, `changedAt`, IDs unverändert.
6. Prüfer: zweiter Claude-Lauf (`automation/prompts/reviewer.md`) prüft jede Änderung gegen Folientext und Regeln → verwirft Beanstandetes.
7. Datenschutz-Check (deterministisch): keine 6-Wort-Folge aus Antworttexten im Diff; kein Name/E-Mail. Bei Treffer: Abbruch ohne Push.
8. `npm test` grün → `data/version.json` + `reports/YYYY-MM-DD.md` schreiben → commit + push. Sonst: nichts pushen, Fehlerbericht lokal.

**5.1 Optimizer-Prompt** — Grundlage ist der vom Nutzer gelieferte Entwurf „AI-Lern-Optimierer (Nachtlauf)“ mit Anpassungen: kein Personenname; Maßnahmen je Befund (Leech → 2–3 Vorstufen + `suspended`/`dependencies`; Formatkluft → Zwischenkarte/Abruf-Trigger; Verwechslung → `warning` mit Eselsbrücke; Lückenhaft → Zusatzkarte zum fehlenden Kernpunkt; unklare Karte → `front`/`back`/`mc` schärfen; Themenlücke → ≤ 3 neue Karten, optional Mermaid); nie Formulierungen aus Antworttexten übernehmen; nur Fakten aus dem mitgelieferten Folientext.

**5.2 Veto (`veto.mjs`, ohne KI).** Neue Veto-Ereignisse → Karte per `git` auf den Stand vor ihrem letzten automatischen Änderungs-Commit zurücksetzen, `rev++`, 3 Tage Sperre (`automation/locks.json`), Regel in `data/rules.json` (`{cardId, rule, since}`), commit + push.

**5.3 Morgenbericht** `reports/YYYY-MM-DD.md` (öffentlich, daher ohne Antwortzitate): Abrufe/Quote pro Fach, 5 schwächste Units, Änderungen mit `changeNote`, Tempo vs. Bedarf. In der App unter „Bericht“.

**5.4 Fehlerverhalten.** Worker nicht erreichbar → Lauf endet ohne Änderungen. Claude-Ausgabe kein gültiges JSON → verworfen. Push-Konflikt → `git pull --rebase` einmal, sonst abbrechen. Jeder Lauf schreibt `automation/logs/<ts>.log` (git-ignoriert).

---

## 6. Tutor (Worker)

Prompt `prompts/tutor.md` (überarbeiteter Master-Prompt): Logik vor Vokabeln · erst nennen, was stimmt · genau eine unscharfe Stelle · erster Versuch ohne Lösung · Kernpunkte als Checkliste. Eingabe: Frage, Musterlösung, `keyPoints`, Antwort, Versuch-Nr. Ausgabe (JSON): `{keyPoints:[{point, erfuellt}], staerke, unscharfeStelle, nochmalVersuchen, vorschlagRating}`. Modell: Workers AI (konfigurierbar im Worker), bei gesetztem `GEMINI_KEY` Gemini. Ungültige KI-Antwort → Fehlercode → App fällt auf Selbstbewertung zurück.

---

## 7. Inhalte

| Stufe | Fach | Umfang |
|---|---|---|
| 2a | MTS K3–K5 (RS2 Ventilation, RS3 Pathologien/Diagnostik, RS4 Beatmung) | je Unit 15–20 Karten, davon ≥ 4 `calc` wo die Übungen Rechnungen haben |
| 2c | MTS K6–K10 + S1 Strömungsmechanik | wie oben |
| 2d | Radar, 5 Stationen nach `04_Radartechnik.md` + `Anforderung.txt` | ~100 Karten, `examMode: voice`, keyPoints Pflicht, Sim-Aufgaben |
| 2e | INF2-Units `kern`…`fehler`, Brücken (~40), Boss-Runden (~20), Mermaid/SVG, Videos (nur geprüfte Links) | |

Regeln wie Tag 1: jede Aussage mit `source`, Prüfer gegen die PDFs, keine Folienbilder im Repo (Skizzen als eigene SVG/Mermaid).

---

## 8. Stufen und Reihenfolge

| Stufe | Inhalt |
|---|---|
| **2a** | `calc`-Engine + MTS K3–K5 · Worker (`/events`, `/health`) + Ereignis-Warteschlange + Sync-Schlüssel + Update-Banner + `version.json` |
| **2b** | `analyze`/`apply`/Prüfer/Datenschutz-Check/Bericht/`veto`, Karten-Metadaten + „✨ verbessert“/♻️ + Pausieren, Scheduled Tasks |
| **2c** | MTS K6–K10 + S1 · `/tutor` + `/transcribe` + Tutor-UI + Sprache |
| **2d** | Radar-Inhalte + Simulation |
| **2e** | Visualisierung, Videos, Brücken, Boss-Runden, INF2-Units |

Jede Stufe: eigener Plan, Unter-Agenten mit Task-Review, Abschlussreview, dann Merge + Push (freigegeben). Nach 2a/2b wird der erste echte Nachtlauf beobachtet.

## 9. Tests

- Node-Tests für `calc`-Parser, `analyze` (alle vier Befunde, Freeze, Budget), `apply` (Budget/Freeze/Regeln/Schema), Datenschutz-Check, Veto-Revert (gegen temporäres Git-Repo), Suspend-Logik in `buildSession`, Radar-Rechenkern, Ereignis-Warteschlange (Duplikate, Limit).
- Worker: Unit-Tests der Handler mit gemocktem KV/AI (`node --test`, Handler als reine Funktionen exportiert).
- Manuell im Browser-Pane (Mobil): Sync-Fluss, Banner, Veto, Tutor, Sim.

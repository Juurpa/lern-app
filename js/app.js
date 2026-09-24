import { loadData } from './data.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { renderStart } from './ui/start.js';
import { renderLearn } from './ui/learn.js';
import { renderGaps } from './ui/gaps.js';
import { renderSettings } from './ui/settings.js';
import { renderSetup } from './ui/setup.js';
import { renderDecks } from './ui/slides.js';
import { renderExercises } from './ui/exercises.js';
import { renderExamList, renderExam } from './ui/exam.js';
import { createSlideLoader } from './slides.js';
import { hasUpdate, fetchRemoteVersion, applyUpdate } from './update.js';

const root = document.getElementById('app');
const ctx = { data: null, store: createStore(), root };
const ROUTES = {
  '': renderStart, learn: renderLearn, gaps: renderGaps, settings: renderSettings, setup: renderSetup,
  folien: renderDecks, aufgaben: renderExercises, klausuren: renderExamList, klausur: renderExam,
};

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const view = ROUTES[path] ?? renderStart;
  root.replaceChildren();
  window.scrollTo(0, 0);
  view(ctx, new URLSearchParams(query ?? ''));
}

async function checkForUpdate() {
  const remote = await fetchRemoteVersion();
  if (!hasUpdate(ctx.data.version, remote) || document.querySelector('.update-banner')) return;
  const n = remote.changed?.length ?? 0;
  const bar = document.createElement('button');
  bar.className = 'update-banner primary';
  bar.textContent = n ? `✨ ${n} Karten verbessert – jetzt laden` : '✨ Neue Inhalte – jetzt laden';
  bar.onclick = async () => {
    bar.disabled = true;
    bar.textContent = 'Lade …';
    try { await applyUpdate(); location.reload(); }
    catch (e) { bar.disabled = false; bar.textContent = `Fehler: ${e.message} – erneut versuchen`; }
  };
  document.body.append(bar);
}

const FALLBACK_TUTOR_PROMPT = 'Du bist ein Prüfungstutor. Bewerte die Antwort fair anhand von Frage, Musterlösung und Kernpunkten. Antworte ausschließlich als JSON gemäß responseSchema.';

async function main() {
  navigator.storage?.persist?.().catch(() => {}); // Fortschritt vor automatischer Löschung schützen
  const [data, tutorPrompt] = await Promise.all([
    loadData(p => fetch(p).then(r => {
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.json();
    })),
    fetch('prompts/tutor.md').then(r => (r.ok ? r.text() : FALLBACK_TUTOR_PROMPT)).catch(() => FALLBACK_TUTOR_PROMPT),
  ]);
  ctx.data = data;
  ctx.tutorPrompt = tutorPrompt;
  ctx.decksById = new Map(data.decks.map(d => [d.id, d]));
  ctx.slides = createSlideLoader({ baseUrl: data.meta.workerUrl, getKey: () => ctx.store.load().settings.syncKey });
  ctx.sync = createSync({ getConfig: () => ({ url: ctx.data.meta.workerUrl, key: ctx.store.load().settings.syncKey }) });
  ctx.sync.flush();
  window.addEventListener('online', () => ctx.sync.flush());
  window.addEventListener('hashchange', route);
  route();
  checkForUpdate();
  setInterval(checkForUpdate, 30 * 60 * 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main().catch(e => { root.textContent = `Fehler beim Laden: ${e.message}`; });

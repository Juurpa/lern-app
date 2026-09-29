import { h } from '../render.js';

// Schlanke, per Hand gezeichnete Icons (kein Icon-Font/-Paket nötig) – 24x24, currentColor.
const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v8.5a1 1 0 0 0 1 1H10v-5.5h4V19.5h2.5a1 1 0 0 0 1-1V10"/>',
  learn: '<rect x="4.5" y="4.5" width="12" height="15" rx="2.2"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/>',
  tasks: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><path d="m8 12 2.2 2.2L16 8.5"/>',
  slides: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6M12 16v4"/><circle cx="9" cy="9.3" r="1.15" fill="currentColor" stroke="none"/><path d="m7.3 13 3-3.2 2.4 2.4 2.4-2.9 3.1 3.7"/>',
  sliders: '<path d="M5 7h2M11 7h8M5 12h8M17 12h2M5 17h5M14 17h5"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="17" r="2" fill="currentColor"/>',
};

const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

export const TABS = [
  { path: '', label: 'Start', icon: 'home' },
  { path: 'learn', label: 'Lernen', icon: 'learn' },
  { path: 'aufgaben', label: 'Aufgaben', icon: 'tasks' },
  { path: 'folien', label: 'Folien', icon: 'slides' },
  { path: 'settings', label: 'Einstellungen', icon: 'sliders' },
];

// Routen ohne eigenen Tab zählen für die Hervorhebung als Unterseite des jeweiligen Bereichs.
const ALIAS = { klausuren: 'aufgaben', klausur: 'aufgaben', fach: '' };

export function createTabBar(getBadge) {
  const el = h(`<nav class="tabbar" aria-label="Hauptnavigation">${TABS.map(t =>
    `<a href="#/${t.path}" data-path="${t.path}">${svg(t.icon)}<span>${t.label}</span></a>`).join('')}</nav>`);
  document.body.append(el);
  return {
    el,
    update(path) {
      const active = ALIAS[path] ?? path;
      el.querySelectorAll('a').forEach(a => {
        const isActive = a.dataset.path === active;
        a.classList.toggle('active', isActive);
        if (isActive) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      if (getBadge) {
        // Lücken haben keinen eigenen Tab – Hinweispunkt sitzt auf "Start", wo die Lücken-Übersicht verlinkt ist.
        const startTab = el.querySelector('[data-path=""]');
        startTab?.querySelector('.dot')?.remove();
        if (getBadge() > 0) startTab?.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
      }
    },
  };
}

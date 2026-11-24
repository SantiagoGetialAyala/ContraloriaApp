'use strict';

// Control de tema claro / oscuro sincronizado con localStorage y prefers-color-scheme.
(function initTheme() {
  const STORAGE_KEY = 'contraloria-theme';
  const META_COLORS = { light: '#085066', dark: '#08181E' };
  const readStored = () => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };
  const systemTheme = () =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const syncButtons = (mode) => {
    const isDark = mode === 'dark';
    const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', String(isDark));
      const icon = btn.querySelector('.theme-toggle-icon');
      const text = btn.querySelector('.theme-toggle-text');
      if (icon) icon.textContent = isDark ? '☀' : '☾';
      if (text) text.textContent = isDark ? 'Claro' : 'Oscuro';
    });
  };
  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[mode]);
    syncButtons(mode);
  };
  apply(readStored() || systemTheme());
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento persistente disponible.
    }
    apply(next);
  });
})();

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-confirm]');
  if (button && !window.confirm(button.dataset.confirm)) event.preventDefault();
});
const toggle = document.getElementById('menu-toggle');
if (toggle) toggle.addEventListener('click', () => {
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  document.getElementById('sidebar').classList.toggle('open', !expanded);
});
// Expose submission state while preserving named submit buttons and native validation.
document.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => {
  if (event.defaultPrevented) return;
  form.setAttribute('aria-busy', 'true');
}));

'use strict';
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

import { $, h, fill } from '../lib/dom.js';

const sheet = $('#sheet'), body = $('#sheet-in');
/** Abre a folha (diálogo nativo: foco preso, ESC fecha, leitores de tela entendem). */
export function openSheet(...nodes) {
  fill(body, h('button', { class: 'lgx', 'aria-label': 'Fechar', onclick: closeSheet }, '×'), nodes);
  if (!sheet.open) sheet.showModal();
  body.scrollTop = 0;
}
export function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

let tt;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 3200);
}
export const isSheetOpen = () => sheet.open;

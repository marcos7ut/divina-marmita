import { $, h } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { WEEKDAYS } from '../lib/dates.js';
import { stateOf } from '../lib/menuState.js';
import { add } from '../lib/cart.js';
import { S, menuNow, save, changed } from './state.js';
import { openSheet, closeSheet, toast } from './ui.js';

const MAIN = new Set(['dia', 'bov', 'fra', 'sui', 'fei', 'esp']);
const minPrice = (p) => Math.min(...p.tamanhos.map((t) => t.preco));

export function renderBoard() {
  const st = menuNow(), list = $('#board-list');
  $('#board-day').textContent = WEEKDAYS[new Date().getDay()];
  const mains = S.catalog.pratos.filter((p) => MAIN.has(p.cat) && st.on.has(p.id));
  const extras = S.catalog.pratos.filter((p) => !MAIN.has(p.cat) && st.on.has(p.id)).length;
  list.replaceChildren(...(mains.length
    ? mains.map((p) => h('li', { class: st.out.has(p.id) ? 'out' : '' }, h('span', {}, p.nome), h('span', { class: 'd' }), h('span', { class: 'p' }, brl(minPrice(p)))))
    : [h('li', { class: 'empty' }, 'Cardápio de hoje em atualização. Chame no WhatsApp.')]));
  $('#board-foot').textContent = extras ? `+ ${extras} entre bebidas, sobremesas e adicionais` : (st.custom ? 'Atualizado pela cozinha hoje' : 'Cardápio planejado do dia');
}

function thumb(p) {
  return h('span', { class: 'ph' }, p.img ? h('img', { src: 'assets/img/' + p.img, alt: '', loading: 'lazy', width: 76, height: 76 }) : p.nome[0]);
}

export function renderMenu() {
  const st = menuNow(), q = S.q.trim().toLowerCase();
  const visible = S.catalog.pratos.filter((p) => st.on.has(p.id) && (!q || (p.nome + ' ' + p.desc).toLowerCase().includes(q)));
  const cats = S.catalog.categorias.filter((c) => visible.some((p) => p.cat === c.id));
  if (S.cat && !cats.some((c) => c.id === S.cat)) S.cat = '';

  $('#cats').replaceChildren(
    h('button', { class: 'chip', 'aria-pressed': String(!S.cat), onclick: () => { S.cat = ''; renderMenu(); } }, 'Tudo'),
    ...cats.map((c) => h('button', { class: 'chip', 'aria-pressed': String(S.cat === c.id), onclick: () => { S.cat = c.id; renderMenu(); } }, c.nome)),
  );

  const shown = cats.filter((c) => !S.cat || c.id === S.cat);
  $('#menu').replaceChildren(...(shown.length ? shown.flatMap((c, i) => [
    h('div', { class: 'cat' }, h('span', {}, String(i + 1).padStart(2, '0')), h('h3', {}, c.nome)),
    h('div', { class: 'rows' }, ...visible.filter((p) => p.cat === c.id).map((p) => row(p, stateOf(st, p.id) === 'esgotado'))),
  ]) : [h('p', { class: 'nada' }, q ? 'Nada encontrado para essa busca. Chame no WhatsApp que a gente resolve.' : 'O cardápio de hoje está sendo atualizado. Volte já.')]));
}

function row(p, out) {
  const multi = p.tamanhos.length > 1;
  return h('button', { class: 'row', type: 'button', 'aria-disabled': out ? 'true' : null, onclick: () => (out ? toast('Esse prato esgotou hoje.') : openDish(p)) },
    thumb(p),
    h('span', {}, h('b', {}, p.nome), h('small', {}, p.desc), p.selo ? h('span', { class: 'tag' }, p.selo) : null, out ? h('span', { class: 'stamp' }, 'ESGOTOU') : null),
    h('span', { class: 'pr' }, multi ? h('small', {}, 'a partir de') : null, brl(minPrice(p))),
  );
}

export function openDish(p) {
  let size = p.tamanhos[0].id, qty = 1;
  const root = h('div');
  const draw = () => {
    const t = p.tamanhos.find((x) => x.id === size);
    root.replaceChildren(
      h('div', { class: 'big' }, p.img ? h('img', { src: 'assets/img/' + p.img, alt: p.nome }) : null),
      h('h3', { id: 'sheet-t' }, p.nome),
      h('p', { class: 'lead2' }, p.desc),
      p.tamanhos.length > 1 ? h('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Tamanho' }, ...p.tamanhos.map((x) => h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(x.id === size), onclick: () => { size = x.id; draw(); } }, h('span', {}, x.nome), h('span', { class: 'mono' }, brl(x.preco))))) : null,
      h('div', { class: 'qrow' },
        h('span', { class: 'qty' }, h('button', { type: 'button', 'aria-label': 'Diminuir', onclick: () => { qty = Math.max(1, qty - 1); draw(); } }, '−'), h('span', { 'aria-live': 'polite' }, String(qty)), h('button', { type: 'button', 'aria-label': 'Aumentar', onclick: () => { qty = Math.min(30, qty + 1); draw(); } }, '+')),
        h('button', { class: 'btn btn--leaf', type: 'button', onclick: () => { S.cart = add(S.cart, p.id, size, qty); save('cart', S.cart); closeSheet(); changed(); bump(); } }, `Adicionar ${brl(t.preco * qty)}`),
      ),
    );
  };
  draw();
  openSheet(root);
}
function bump() { const t = $('#tab'); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }

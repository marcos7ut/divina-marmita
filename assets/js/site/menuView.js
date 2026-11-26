import { $, h, fill } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { WEEKDAYS } from '../lib/dates.js';
import { stateOf } from '../lib/menuState.js';
import { add } from '../lib/cart.js';
import { S, menuNow, save, changed } from './state.js';
import { openSheet, closeSheet, toast } from './ui.js';

const MAIN = new Set(['dia', 'bov', 'fra', 'sui', 'fei', 'esp']);
const minPrice = (p) => Math.min(...p.tamanhos.map((t) => t.preco));

export function renderUpd() {
  const st = menuNow(), n = S.catalog.pratos.filter((p) => st.on.has(p.id) && !st.out.has(p.id)).length;
  $('#upd').replaceChildren('📅 ', WEEKDAYS[new Date().getDay()] + ' · ', h('b', {}, `${n} pratos disponíveis hoje`));
}

const thumb = (p) => (p.img ? h('img', { src: 'assets/img/' + p.img, alt: p.nome, loading: 'lazy', width: 104, height: 104 }) : h('div', { class: 'ph0' }, catIcon(p.cat)));
const catIcon = (id) => (S.catalog.categorias.find((c) => c.id === id) || {}).icone || '🍽️';

export function renderMenu() {
  const st = menuNow(), q = S.q.trim().toLowerCase();
  const visible = S.catalog.pratos.filter((p) => st.on.has(p.id) && (!q || (p.nome + ' ' + p.desc).toLowerCase().includes(q)));
  const cats = S.catalog.categorias.filter((c) => visible.some((p) => p.cat === c.id));

  $('#cats').replaceChildren(...cats.map((c) => h('button', { type: 'button', onclick: () => { const t = document.getElementById('cat-' + c.id); t && t.scrollIntoView({ behavior: 'smooth' }); } }, `${c.icone} ${c.nome}`)));

  $('#menu').replaceChildren(...(cats.length ? cats.flatMap((c) => [
    h('h3', { class: 'cat', id: 'cat-' + c.id }, `${c.icone} ${c.nome}`),
    h('div', { class: 'lst' }, ...visible.filter((p) => p.cat === c.id).map((p) => row(p, stateOf(st, p.id) === 'esgotado'))),
  ]) : [h('p', { class: 'nada' }, q ? 'Nada encontrado. Chame no WhatsApp!' : 'Cardápio de hoje em atualização. Chame no WhatsApp!')]));
}

function row(p, out) {
  const multi = p.tamanhos.length > 1;
  return h('button', { class: 'it2', type: 'button', 'aria-disabled': out ? 'true' : null, onclick: () => (out ? toast('Esse prato esgotou hoje.') : openDish(p)) },
    h('div', { class: 'tx' }, h('b', {}, p.nome), h('small', {}, p.desc), p.selo ? h('span', { class: 'tag' }, p.selo) : null, out ? h('span', { class: 'stamp' }, 'Esgotou hoje') : null, h('span', { class: 'pr' }, (multi ? 'a partir de ' : '') + brl(minPrice(p)))),
    h('div', { class: 'im' }, thumb(p), h('span', { class: 'pl' }, '+')),
  );
}

export function openDish(p) {
  let size = p.tamanhos[0].id, qty = 1;
  const root = h('div');
  const draw = () => {
    const t = p.tamanhos.find((x) => x.id === size);
    fill(root,
      h('div', { class: 'big' }, p.img ? h('img', { src: 'assets/img/' + p.img, alt: p.nome }) : h('div', { class: 'ph0' }, catIcon(p.cat))),
      h('h3', { id: 'sheet-t', class: 'dtit' }, p.nome),
      h('p', { class: 'dd' }, p.desc),
      p.tamanhos.length > 1 ? h('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Tamanho' }, ...p.tamanhos.map((x) => h('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(x.id === size), onclick: () => { size = x.id; draw(); } }, h('span', {}, x.nome), h('span', { class: 'mono' }, brl(x.preco))))) : null,
      h('div', { class: 'qrow' },
        h('span', { class: 'qty' }, h('button', { type: 'button', 'aria-label': 'Diminuir', onclick: () => { qty = Math.max(1, qty - 1); draw(); } }, '−'), h('span', { 'aria-live': 'polite' }, String(qty)), h('button', { type: 'button', 'aria-label': 'Aumentar', onclick: () => { qty = Math.min(30, qty + 1); draw(); } }, '+')),
        h('button', { class: 'btn g', type: 'button', onclick: () => { S.cart = add(S.cart, p.id, size, qty); save('cart', S.cart); closeSheet(); changed(); bump(); } }, `Adicionar ${brl(t.preco * qty)}`),
      ),
    );
  };
  draw();
  openSheet(root);
}
function bump() { $('#tab').animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], 200); }

import { $, h } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { change, totals, MIN_ORDER, FEE } from '../lib/cart.js';
import { buildOrder, PAYMENTS } from '../lib/validate.js';
import { orderMessage, waLink } from '../lib/wa.js';
import { CONFIG } from '../config.js';
import { S, save, load, changed, etaNow, opsNow } from './state.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { followOrder } from './tracker.js';

const draft = { nome: load('nome', ''), tel: load('tel', ''), end: load('end', ''), troco: '', obs: '' };

export function renderTab() {
  const t = totals(S.cart, S.catalog, S.mode);
  $('#tab').hidden = t.count === 0;
  $('#tab-n').textContent = t.count;
  $('#tab-t').textContent = brl(t.subtotal);
}
$('#tab').addEventListener('click', openCart);

function readForm() { for (const k of Object.keys(draft)) { const el = $('#c-' + k); if (el) draft[k] = el.value; } }

export function openCart() {
  const root = h('div');
  const draw = (focus) => {
    if ($('#c-nome')) readForm();
    const t = totals(S.cart, S.catalog, S.mode), ops = opsNow(), eta = etaNow(S.mode);
    if (!t.lines.length) { closeSheet(); return; }
    root.replaceChildren(
      h('h3', { id: 'sheet-t' }, 'Seu pedido'),
      h('div', { class: 'ticket' },
        ...t.lines.map((l) => h('div', { class: 'it' },
          h('span', {}, h('b', {}, l.n), h('small', {}, `${l.s} · ${brl(l.p)}`)),
          h('span', { class: 'qty' }, h('button', { type: 'button', 'aria-label': 'Diminuir ' + l.n, onclick: () => step(l.k, -1) }, '−'), h('span', {}, String(l.q)), h('button', { type: 'button', 'aria-label': 'Aumentar ' + l.n, onclick: () => step(l.k, 1) }, '+')),
        )),
        h('div', { class: 'sum' },
          h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, brl(t.subtotal))),
          h('div', {}, h('span', {}, 'Entrega'), h('span', {}, S.mode === 'e' ? brl(FEE) : 'grátis')),
          h('div', { class: 'tot' }, h('span', {}, 'Total'), h('span', {}, brl(t.total))),
        ),
      ),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Como receber' },
        h('button', { type: 'button', 'aria-pressed': String(S.mode === 'e'), onclick: () => { S.mode = 'e'; draw(); } }, 'Entrega'),
        h('button', { type: 'button', 'aria-pressed': String(S.mode === 'r'), onclick: () => { S.mode = 'r'; draw(); } }, 'Retirada'),
      ),
      h('div', { class: 'eta' }, h('span', {}, 'Previsão'), h('span', { class: 'mono' }, `${eta.min}–${eta.max} min`), ops.aberto === false ? h('span', { class: 'err' }, 'Pedidos pausados agora') : null),
      h('form', { class: 'form', id: 'c-form', novalidate: true, onsubmit: submit },
        field('Seu nome', h('input', { id: 'c-nome', autocomplete: 'name', maxlength: 60, value: draft.nome, placeholder: 'Como podemos te chamar?' })),
        field('WhatsApp (opcional, para avisos)', h('input', { id: 'c-tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 20, value: draft.tel, placeholder: '(15) 9 9999-9999' })),
        S.mode === 'e' ? field('Endereço de entrega (até 3 km)', h('input', { id: 'c-end', autocomplete: 'street-address', maxlength: 140, value: draft.end, placeholder: 'Rua, número, bairro' })) : null,
        field('Pagamento', h('select', { id: 'c-pag', onchange: (e) => { S.pay = e.target.value; draw(); } }, ...PAYMENTS.map((o) => h('option', { value: o, selected: o === S.pay }, o)))),
        S.pay === 'Dinheiro' ? field('Troco para quanto?', h('input', { id: 'c-troco', maxlength: 20, value: draft.troco, placeholder: 'Ex.: R$ 50' })) : null,
        field('Observações', h('textarea', { id: 'c-obs', maxlength: 200, placeholder: 'Sem cebola, caprichar na farofa…' }, draft.obs)),
        t.missing > 0 ? h('div', { class: 'note' }, `Faltam ${brl(t.missing)} para o pedido mínimo de ${brl(MIN_ORDER)}.`) : null,
        h('div', { class: 'err', id: 'c-err', role: 'alert', hidden: true }),
        h('button', { class: 'btn btn--leaf', type: 'submit', disabled: t.missing > 0 }, 'Enviar pedido'),
        h('p', { class: 'note' }, 'O pedido chega na cozinha e abre a conversa no WhatsApp para confirmar.'),
      ),
    );
    if (focus) { const el = $('#' + focus); el && el.focus(); }
  };
  const step = (k, d) => { S.cart = change(S.cart, k, d); save('cart', S.cart); changed(); draw(); };
  draw();
  openSheet(root);
}

const field = (label, input) => h('label', { class: 'field' }, label, input);

async function submit(e) {
  e.preventDefault();
  readForm();
  const err = $('#c-err'), btn = e.target.querySelector('button[type=submit]');
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  const last = load('last', 0);
  if (Date.now() - last < 20000) return showErr('Aguarde alguns segundos antes de enviar outro pedido.');
  if (opsNow().aberto === false) return showErr('A cozinha pausou os pedidos por agora. Chame no WhatsApp.');
  const r = buildOrder({ cart: S.cart, catalog: S.catalog, mode: S.mode, ...draft, pag: S.pay, eta: etaNow(S.mode) });
  if (!r.ok) return showErr(r.error);
  btn.disabled = true;
  let saved = true;
  try { await Promise.race([S.store.createOrder(r.order), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]); } catch { saved = false; }
  save('last', Date.now()); save('nome', draft.nome); save('tel', draft.tel); save('end', draft.end);
  const link = waLink(CONFIG.negocio.whatsapp, orderMessage(r.order));
  S.cart = {}; save('cart', S.cart); changed();
  if (saved) followOrder(r.order.id);
  const opened = window.open(link, '_blank', 'noopener');
  thanks(r.order, link, saved, !!opened);
}

function thanks(o, link, saved, opened) {
  openSheet(h('div', { class: 'thx' },
    h('div', { class: 'em', 'aria-hidden': 'true' }, '🍲'),
    h('h3', { id: 'sheet-t' }, `Pedido enviado, ${o.nome.split(' ')[0]}!`),
    h('p', {}, saved ? `Já está na cozinha. Previsão de ${o.eta.min}–${o.eta.max} min. Você acompanha pelo topo da página.` : 'Não conseguimos avisar o painel agora, mas o pedido segue pelo WhatsApp. Confirme por lá.'),
    h('div', { class: 'links' },
      h('a', { class: 'btn btn--leaf', href: link, target: '_blank', rel: 'noopener' }, opened ? 'Abrir o WhatsApp de novo' : 'Confirmar no WhatsApp'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: closeSheet }, 'Voltar ao cardápio'),
    ),
  ));
}
export { thanks };

import { h } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { hhmm, ago } from '../lib/dates.js';
import { promisedAt, isLate } from '../lib/eta.js';
import { actionLabel, next, prev, transition } from '../lib/status.js';

export const COLS = ['novo', 'producao', 'pronto', 'concluido'];

/** Cartão de pedido. Botão grande = próxima etapa; o resto é secundário. */
export function ticket(o, { onMove, onCancel, onPrint, fresh }) {
  const late = isLate(o);
  const nx = next(o.status), pv = prev(o.status);
  return h('article', { class: 'tk' + (late ? ' tk--late' : '') + (fresh ? ' tk--new' : ''), 'aria-label': `Pedido de ${o.nome}` },
    h('div', { class: 'tk__h' }, h('b', {}, o.nome), h('span', { class: 'tk__id' }, '#' + o.id.slice(0, 6).toUpperCase())),
    h('div', { class: 'tk__meta' },
      h('span', { class: 'pill ' + o.tipo }, o.tipo === 'e' ? '🛵 Entrega' : '🏪 Retirada'),
      h('span', { class: 'pill' }, `${hhmm(o.t)} · ${ago(o.t)}`),
      late ? h('span', { class: 'pill late' }, 'Atrasado') : null,
    ),
    o.tipo === 'e' ? h('div', { class: 'addr' }, '📍 ' + o.end) : null,
    h('ul', {}, ...o.itens.map((i) => h('li', {}, h('b', {}, i.q + 'x '), `${i.n} (${i.s})`))),
    o.obs ? h('div', { class: 'obs' }, '📝 ' + o.obs) : null,
    h('div', { class: 'line' }, h('span', {}, '💳 ' + o.pag + (o.troco ? ` · troco p/ ${o.troco}` : '')), h('b', {}, brl(o.total))),
    o.tel ? h('div', { class: 'line' }, h('span', {}, 'WhatsApp do cliente'), h('a', { href: `https://wa.me/55${o.tel.replace(/^55/, '')}`, target: '_blank', rel: 'noopener' }, o.tel)) : null,
    h('div', { class: 'line' }, h('span', {}, 'Prometido até'), h('b', {}, hhmm(promisedAt(o)))),
    o.status !== 'cancelado' ? h('div', { class: 'tk__a' },
      nx ? h('button', { class: 'btn g main', type: 'button', onclick: () => onMove(o, nx) }, actionLabel(o)) : null,
      pv && o.status !== 'concluido' ? h('button', { class: 'btn out sm', type: 'button', 'aria-label': 'Voltar etapa', onclick: () => onMove(o, pv) }, '↩ Voltar') : null,
      h('button', { class: 'btn out sm', type: 'button', onclick: () => onPrint(o) }, '🖨️ Imprimir'),
      o.status !== 'concluido' ? h('button', { class: 'btn out sm', type: 'button', onclick: () => onCancel(o) }, 'Cancelar') : null,
    ) : h('div', { class: 'tk__a' }, h('span', { class: 'pill late' }, 'Cancelado'), h('button', { class: 'btn out sm', type: 'button', onclick: () => onMove(o, 'novo') }, 'Reabrir')),
  );
}

export { transition };

/** HTML (como nós) da comanda de impressão 80 mm. */
export function receipt(o) {
  const L = (a, b) => h('div', { class: 'l' }, h('span', {}, a), h('span', {}, b));
  return [
    h('h2', {}, 'DIVINA MARMITA'),
    h('div', {}, `Pedido #${o.id.slice(0, 6).toUpperCase()} · ${new Date(o.t).toLocaleString('pt-BR')}`),
    h('hr'), h('div', {}, `${o.tipo === 'e' ? 'ENTREGA' : 'RETIRADA'} — ${o.nome}`),
    o.tipo === 'e' ? h('div', {}, o.end) : null, o.tel ? h('div', {}, 'Tel: ' + o.tel) : null, h('hr'),
    ...o.itens.map((i) => L(`${i.q}x ${i.n} (${i.s})`, brl(i.p * i.q))),
    h('hr'), o.tipo === 'e' ? L('Entrega', brl(o.taxa)) : null, L('TOTAL', brl(o.total)),
    L('Pagamento', o.pag + (o.troco ? ' troco ' + o.troco : '')),
    o.obs ? h('div', {}, 'OBS: ' + o.obs) : null,
    h('hr'), h('div', {}, `Prometido até ${hhmm(promisedAt(o))}`),
  ];
}

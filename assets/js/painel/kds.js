import { h } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { hhmm, ago } from '../lib/dates.js';
import { promisedAt, isLate } from '../lib/eta.js';
import { actionLabel, next, prev, transition, LABEL } from '../lib/status.js';
import { money } from '../lib/orders.js';

export const COLS = ['novo', 'producao', 'pronto', 'saiu', 'concluido'];

const MAPS = (addr) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);

/** Linha de dinheiro: o que cobrar, troco e conferência do Pix. */
export function moneyLine(o, onPago) {
  const m = money(o);
  if (m.kind === 'pago') return h('div', { class: 'cash ok' }, '✅ ', o.pag.split(' ')[0], ' pago · ', h('b', {}, brl(o.total)));
  if (m.kind === 'confirmar') return h('div', { class: 'cash warn2' }, '⏳ ', o.pag.split(' ')[0], ' a conferir · ', h('b', {}, brl(o.total)), onPago ? h('button', { class: 'btn sm g', type: 'button', onclick: () => onPago(o) }, 'Recebi') : null);
  if (m.kind === 'dinheiro') return h('div', { class: 'cash' }, '💵 Cobrar ', h('b', {}, brl(o.total)), m.troco != null ? ` · troco p/ ${brl(m.troco)}` : '', m.levar != null ? h('b', { class: 'levar' }, ` → levar ${brl(m.levar)} de troco`) : null);
  return h('div', { class: 'cash' }, '💳 Maquininha · cobrar ', h('b', {}, brl(o.total)));
}

/**
 * Cartão de pedido.
 * ctx: n (número do dia), pos (posição na fila de novos), up (é o próximo a fazer),
 *      onAdvance, onBack, onCancel, onPrint, onPago, fresh
 */
export function ticket(o, ctx) {
  const late = isLate(o);
  const nx = next(o), pv = prev(o);
  const wait = Math.floor((Date.now() - o.t) / 60000);
  return h('article', { class: 'tk' + (late ? ' tk--late' : '') + (ctx.fresh ? ' tk--new' : '') + (ctx.up ? ' tk--up' : ''), 'aria-label': `Pedido ${ctx.n} de ${o.nome}` },
    ctx.up ? h('div', { class: 'upbar' }, '▶ PRÓXIMO A FAZER') : (o.status === 'novo' && ctx.pos ? h('div', { class: 'posbar' }, `${ctx.pos}º na fila`) : null),
    h('div', { class: 'tk__h' }, h('span', { class: 'num' }, 'Nº ' + ctx.n), h('b', {}, o.nome), h('span', { class: 'tk__id' }, hhmm(o.t))),
    h('div', { class: 'tk__meta' },
      h('span', { class: 'pill ' + o.tipo }, o.tipo === 'e' ? '🛵 Entrega' : '🏪 Retirada'),
      ['novo', 'producao', 'pronto', 'saiu'].includes(o.status) ? h('span', { class: 'pill t' + (wait >= 25 ? ' r' : wait >= 12 ? ' y' : '') }, ago(o.t)) : null,
      late ? h('span', { class: 'pill late' }, 'Atrasado') : null,
      o.moto ? h('span', { class: 'pill rider' }, '🛵 ' + o.moto) : null,
    ),
    o.tipo === 'e' ? h('a', { class: 'addr', href: MAPS(o.end), target: '_blank', rel: 'noopener' }, '📍 ' + o.end) : null,
    h('ul', {}, ...o.itens.map((i) => h('li', {}, h('b', {}, i.q + 'x '), `${i.n} (${i.s})`))),
    o.obs ? h('div', { class: 'obs' }, '📝 ' + o.obs) : null,
    moneyLine(o, o.status === 'concluido' || o.status === 'cancelado' ? null : ctx.onPago),
    o.tel ? h('div', { class: 'line' }, h('span', {}, 'WhatsApp do cliente'), h('a', { href: `https://wa.me/55${o.tel.replace(/^55/, '')}`, target: '_blank', rel: 'noopener' }, o.tel)) : null,
    h('div', { class: 'line' }, h('span', {}, 'Prometido até'), h('b', {}, hhmm(promisedAt(o)))),
    o.status !== 'cancelado' ? h('div', { class: 'tk__a' },
      nx ? h('button', { class: 'btn g main', type: 'button', onclick: () => ctx.onAdvance(o) }, actionLabel(o)) : null,
      pv && o.status !== 'concluido' ? h('button', { class: 'btn out sm', type: 'button', 'aria-label': 'Voltar etapa', onclick: () => ctx.onBack(o) }, '↩ Voltar') : null,
      h('button', { class: 'btn out sm', type: 'button', onclick: () => ctx.onPrint(o) }, '🖨️ Imprimir'),
      o.status !== 'concluido' ? h('button', { class: 'btn out sm', type: 'button', onclick: () => ctx.onCancel(o) }, 'Cancelar') : null,
    ) : h('div', { class: 'tk__a' }, h('span', { class: 'pill late' }, LABEL.cancelado), h('button', { class: 'btn out sm', type: 'button', onclick: () => ctx.onBack(o) }, 'Reabrir')),
  );
}

export { transition };

/** Comanda de impressão 80 mm (como nós do DOM). */
export function receipt(o, n) {
  const L = (a, b) => h('div', { class: 'l' }, h('span', {}, a), h('span', {}, b));
  const m = money(o);
  return [
    h('h2', {}, 'DIVINA MARMITA'),
    h('h2', {}, `PEDIDO Nº ${n}`),
    h('div', {}, new Date(o.t).toLocaleString('pt-BR')),
    h('hr'), h('div', {}, `${o.tipo === 'e' ? 'ENTREGA' : 'RETIRADA'} — ${o.nome}`),
    o.tipo === 'e' ? h('div', {}, o.end) : null, o.tel ? h('div', {}, 'Tel: ' + o.tel) : null, o.moto ? h('div', {}, 'Entregador: ' + o.moto) : null, h('hr'),
    ...o.itens.map((i) => L(`${i.q}x ${i.n} (${i.s})`, brl(i.p * i.q))),
    h('hr'), o.tipo === 'e' ? L('Entrega', brl(o.taxa)) : null, L('TOTAL', brl(o.total)),
    h('div', {}, m.kind === 'dinheiro' ? `COBRAR EM DINHEIRO${m.troco != null ? ' · troco p/ ' + brl(m.troco) : ''}${m.levar != null ? ' · levar ' + brl(m.levar) : ''}` : m.kind === 'maquininha' ? 'COBRAR NA MAQUININHA' : (o.pago ? o.pag + ' (PAGO)' : o.pag + ' (conferir)')),
    o.obs ? h('div', {}, 'OBS: ' + o.obs) : null,
    h('hr'), h('div', {}, `Prometido até ${hhmm(promisedAt(o))}`),
  ];
}

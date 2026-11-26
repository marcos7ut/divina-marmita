import { cents } from './money.js';

/** Hora oficial de chegada: a do servidor (rec) quando existe; senão a do aparelho. */
export const arrival = (o) => (typeof o.rec === 'number' ? o.rec : o.t);

/** Ordem de chegada, estável e justa: ninguém "pula" na frente. */
export const byArrival = (a, b) => arrival(a) - arrival(b) || (a.id < b.id ? -1 : 1);

/** Número do pedido no dia (Nº 1, 2, 3…) pela ordem de chegada. Cancelados mantêm o número. */
export function numbering(orders) {
  const m = new Map();
  [...orders].sort(byArrival).forEach((o, i) => m.set(o.id, i + 1));
  return m;
}

/** Fila de uma etapa, do mais antigo para o mais novo. */
export const queue = (orders, status) => orders.filter((o) => o.status === status).sort(byArrival);

/** Pedidos novos que chegaram ANTES deste e ainda não foram começados. */
export const waitingBefore = (orders, o) => queue(orders, 'novo').filter((x) => x.id !== o.id && byArrival(x, o) < 0);

/** "R$ 50", "50,00", "cinquenta"? → 50 | null */
export function parseMoney(s) {
  const m = String(s || '').replace(/\./g, '').match(/(\d+)(?:,(\d{1,2}))?/);
  return m ? Number(m[1] + '.' + (m[2] || '0')) : null;
}

/** O que o entregador/balcão precisa saber sobre o dinheiro deste pedido. */
export function money(o) {
  const online = o.pag === 'Pix' || o.pag === 'Link de pagamento (débito/crédito)';
  if (online) return { kind: o.pago ? 'pago' : 'confirmar', cobrar: 0, troco: null, levar: null };
  const troco = o.pag === 'Dinheiro' ? parseMoney(o.troco) : null;
  return {
    kind: o.pag === 'Dinheiro' ? 'dinheiro' : 'maquininha',
    cobrar: o.total,
    troco,
    levar: troco != null && troco > o.total ? cents(troco - o.total) : null,
  };
}

/** Resumo por entregador: o que está na rua e o acerto do dia. */
export function motoSummary(orders, names) {
  const all = new Set([...names, ...orders.map((o) => o.moto).filter(Boolean)]);
  return [...all].map((name) => {
    const mine = orders.filter((o) => o.moto === name && o.status !== 'cancelado');
    const rua = mine.filter((o) => o.status === 'saiu').sort(byArrival);
    const done = mine.filter((o) => o.status === 'concluido');
    const sum = (list, f) => cents(list.reduce((a, o) => a + f(o), 0));
    return {
      name, rua, entregues: done.length,
      taxas: sum(done, (o) => o.taxa || 0),
      cobrarNaRua: sum(rua, (o) => money(o).cobrar),
      acertoDinheiro: sum(done, (o) => (money(o).kind === 'dinheiro' ? o.total : 0)),
      acertoMaquininha: sum(done, (o) => (money(o).kind === 'maquininha' ? o.total : 0)),
    };
  });
}

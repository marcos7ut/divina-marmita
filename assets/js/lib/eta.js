/**
 * Previsão de prazo. Modelo simples e explicável:
 *   preparo = base + (pedidos na fila / cozinheiros) * minutosPorPedido
 *   entrega = preparo + deslocamento
 * Devolve uma faixa (min–max) arredondada de 5 em 5 min.
 */
export const DEFAULT_OPS = { aberto: true, base: 20, porPedido: 4, cozinheiros: 2, deslocamento: 15 };
const r5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function estimate(queue, ops = DEFAULT_OPS, mode = 'e') {
  const o = { ...DEFAULT_OPS, ...ops };
  const cooks = Math.max(1, Number(o.cozinheiros) || 1);
  const prep = Number(o.base) + (Math.max(0, queue) / cooks) * Number(o.porPedido);
  const total = prep + (mode === 'e' ? Number(o.deslocamento) : 0);
  return { min: r5(total * 0.85), max: r5(total * 1.2 + 3) };
}

/** Tamanho da fila = pedidos novos + em produção. */
export const queueSize = (orders) => orders.filter((o) => o.status === 'novo' || o.status === 'producao').length;

/** Horário prometido ao cliente (ms) = hora do pedido + limite superior da previsão. */
export const promisedAt = (o) => o.t + ((o.eta && o.eta.max) || 45) * 60000;
export const isLate = (o, now = Date.now()) => (o.status === 'novo' || o.status === 'producao' || o.status === 'pronto') && now > promisedAt(o);

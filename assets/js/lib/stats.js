import { cents } from './money.js';
import { isLate } from './eta.js';

/** Resumo do dia para o painel. Cancelados não contam em faturamento. */
export function summarize(orders, now = Date.now()) {
  const valid = orders.filter((o) => o.status !== 'cancelado');
  const revenue = cents(valid.reduce((a, o) => a + o.total, 0));
  const queue = orders.filter((o) => o.status === 'novo' || o.status === 'producao');
  const done = valid.filter((o) => o.ts && o.ts.producao && o.ts.pronto);
  const prepTimes = done.map((o) => (o.ts.pronto - o.ts.producao) / 60000).filter((m) => m >= 0 && m < 240);
  const avgPrep = prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : null;
  const byHour = Array(24).fill(0);
  valid.forEach((o) => byHour[new Date(o.t).getHours()]++);
  const dish = new Map();
  valid.forEach((o) => o.itens.forEach((i) => dish.set(i.n, (dish.get(i.n) || 0) + i.q)));
  const top = [...dish.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([n, q]) => ({ n, q }));
  const pay = {}, payValue = {};
  valid.forEach((o) => { pay[o.pag] = (pay[o.pag] || 0) + 1; payValue[o.pag] = cents((payValue[o.pag] || 0) + o.total); });
  const toConfirm = valid.filter((o) => (o.pag === 'Pix' || o.pag.startsWith('Link')) && !o.pago && o.status !== 'novo');
  return {
    count: valid.length, revenue, ticket: valid.length ? cents(revenue / valid.length) : 0,
    queue: queue.length, late: orders.filter((o) => isLate(o, now)).length,
    avgPrep, byHour, top, delivery: valid.filter((o) => o.tipo === 'e').length, pickup: valid.filter((o) => o.tipo === 'r').length,
    pay, payValue, toConfirm: toConfirm.length, toConfirmValue: cents(toConfirm.reduce((a, o) => a + o.total, 0)), fees: cents(valid.reduce((a, o) => a + (o.taxa || 0), 0)),
    cancelled: orders.length - valid.length,
  };
}

export function leadsCsv(leads) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Data', 'Nome', 'WhatsApp', 'E-mail', 'Interesses'].map(q).join(';')];
  for (const l of leads) rows.push([new Date(l.t).toLocaleString('pt-BR'), l.nome, l.tel, l.email, l.interesses].map(q).join(';'));
  return '﻿' + rows.join('\r\n');
}

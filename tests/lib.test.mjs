import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayKey, isOpenNow, ago } from '../assets/js/lib/dates.js';
import { resolveMenu, applyState, stateOf, weekPlan } from '../assets/js/lib/menuState.js';
import { add, change, totals, lines, MIN_ORDER, FEE } from '../assets/js/lib/cart.js';
import { estimate, isLate, queueSize } from '../assets/js/lib/eta.js';
import { buildOrder, buildLead } from '../assets/js/lib/validate.js';
import { summarize, leadsCsv } from '../assets/js/lib/stats.js';
import { transition, next, prev, flowOf, customerText } from '../assets/js/lib/status.js';
import { numbering, queue, waitingBefore, money, motoSummary, parseMoney, byArrival } from '../assets/js/lib/orders.js';
import { orderMessage } from '../assets/js/lib/wa.js';

const catalog = JSON.parse(readFileSync(new URL('../data/menu.json', import.meta.url)));

test('catálogo: ids únicos, preços válidos e imagens existentes', async () => {
  const { existsSync } = await import('node:fs');
  const ids = catalog.pratos.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const cats = new Set(catalog.categorias.map((c) => c.id));
  for (const p of catalog.pratos) {
    assert.ok(cats.has(p.cat), p.id + ' categoria');
    assert.ok(p.tamanhos.length && p.tamanhos.every((t) => t.preco > 0 && t.id && t.nome), p.id + ' tamanhos');
    if (p.img) assert.ok(existsSync(new URL('../assets/img/' + p.img, import.meta.url)), p.id + ' imagem');
  }
  for (const d of Object.values(catalog.semana)) for (const id of d) assert.ok(ids.includes(id), 'plano referencia ' + id);
});

test('dayKey usa zeros (comparação de dias não quebra em 1-9)', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.notEqual(dayKey(new Date(2026, 0, 5)), dayKey(new Date(2026, 9, 5)));
});

test('horário de funcionamento', () => {
  assert.equal(isOpenNow(new Date(2026, 10, 26, 12, 0)), true);   // quinta 12h
  assert.equal(isOpenNow(new Date(2026, 10, 26, 15, 0)), false);
  assert.equal(isOpenNow(new Date(2026, 10, 26, 18, 30)), true);
  assert.equal(isOpenNow(new Date(2026, 10, 29, 12, 0)), false);  // domingo
});

test('cardápio: sem edição do dia vale o plano da semana', () => {
  const quinta = new Date(2026, 10, 26, 12);
  const st = resolveMenu(catalog, null, null, quinta);
  assert.ok(st.on.has('bife') && st.on.has('lasanha') && !st.on.has('parm'));
  assert.equal(st.custom, false);
});

test('cardápio: edição de ontem é ignorada, a de hoje vale', () => {
  const hoje = new Date(2026, 10, 26, 12);
  const ontem = { day: '2026-11-25', on: ['parm'], out: [] };
  assert.ok(!resolveMenu(catalog, ontem, null, hoje).on.has('parm'));
  const doc = { day: '2026-11-26', on: ['parm', 'bife'], out: ['bife'] };
  const st = resolveMenu(catalog, doc, null, hoje);
  assert.deepEqual([...st.on].sort(), ['bife', 'parm']);
  assert.equal(stateOf(st, 'bife'), 'esgotado');
  assert.equal(stateOf(st, 'parm'), 'ativo');
  assert.equal(stateOf(st, 'lagarto'), 'oculto');
});

test('cardápio: ids desconhecidos são descartados', () => {
  const st = resolveMenu(catalog, { day: '2026-11-26', on: ['xxx', 'parm'], out: [] }, null, new Date(2026, 10, 26));
  assert.deepEqual([...st.on], ['parm']);
});

test('applyState: ativo, esgotado e oculto', () => {
  const now = new Date(2026, 10, 26);
  let st = resolveMenu(catalog, null, null, now);
  let doc = applyState(catalog, st, 'parm', 'ativo', now);
  assert.ok(doc.on.includes('parm') && !doc.out.includes('parm'));
  st = resolveMenu(catalog, doc, null, now);
  doc = applyState(catalog, st, 'parm', 'esgotado', now);
  assert.ok(doc.on.includes('parm') && doc.out.includes('parm'));
  st = resolveMenu(catalog, doc, null, now);
  doc = applyState(catalog, st, 'parm', 'oculto', now);
  assert.ok(!doc.on.includes('parm') && !doc.out.includes('parm'));
});

test('plano salvo pelo dono substitui o padrão só nos dias informados', () => {
  const p = weekPlan(catalog, { dias: { 2: ['parm'] } });
  assert.deepEqual(p[2], ['parm']);
  assert.deepEqual(p[1], catalog.semana[1]);
});

test('carrinho: preço vem do catálogo, itens inválidos são ignorados', () => {
  let c = add({}, 'parm', 'M', 2);
  c = add(c, 'parm', 'G');
  c['fantasma|M'] = 5; c['parm|XXG'] = 3; c['bife|P'] = -1;
  const t = totals(c, catalog, 'e');
  assert.equal(t.lines.length, 2);
  assert.equal(t.subtotal, 82);
  assert.equal(t.fee, FEE);
  assert.equal(t.total, 84.99);
  assert.equal(totals(c, catalog, 'r').fee, 0);
});

test('carrinho: mínimo, remoção e limite', () => {
  let c = add({}, 'cola', 'Única');
  assert.equal(totals(c, catalog, 'r').missing, MIN_ORDER - 4);
  c = change(c, 'cola|Única', -1);
  assert.deepEqual(c, {});
  for (let i = 0; i < 50; i++) c = add(c, 'cola', 'Única');
  assert.equal(c['cola|Única'], 30);
});

test('previsão cresce com a fila e a entrega soma o deslocamento', () => {
  const vazio = estimate(0, undefined, 'r'), cheio = estimate(10, undefined, 'r');
  assert.ok(cheio.max > vazio.max && vazio.min <= vazio.max);
  assert.ok(estimate(3, undefined, 'e').max > estimate(3, undefined, 'r').max);
  assert.ok(estimate(0, { cozinheiros: 0 }, 'r').max > 0); // não divide por zero
});

test('atraso e fila', () => {
  const o = { t: 0, status: 'producao', eta: { min: 20, max: 30 } };
  assert.equal(isLate(o, 29 * 60000), false);
  assert.equal(isLate(o, 31 * 60000), true);
  assert.equal(isLate({ ...o, status: 'concluido' }, 999 * 60000), false);
  assert.equal(queueSize([{ status: 'novo' }, { status: 'producao' }, { status: 'pronto' }]), 2);
});

const base = { cart: { 'parm|M': 1 }, catalog, mode: 'e', nome: '  Maria   Silva ', tel: '(15) 99999-1234', end: 'Rua A, 10', pag: 'Pix', obs: 'sem cebola\n\n', eta: { min: 30, max: 45 } };

test('pedido válido é normalizado', () => {
  const r = buildOrder(base);
  assert.ok(r.ok, r.error);
  assert.equal(r.order.nome, 'Maria Silva');
  assert.equal(r.order.tel, '15999991234');
  assert.equal(r.order.obs, 'sem cebola');
  assert.equal(r.order.total, 28.99);
  assert.equal(r.order.status, 'novo');
  assert.match(r.order.id, /^[0-9a-f]{32}$/);
});

test('pedido inválido é recusado com motivo', () => {
  assert.equal(buildOrder({ ...base, cart: {} }).ok, false);
  assert.match(buildOrder({ ...base, cart: { 'cola|Única': 1 } }).error, /mínimo/);
  assert.equal(buildOrder({ ...base, nome: 'A' }).ok, false);
  assert.equal(buildOrder({ ...base, end: '' }).ok, false);
  assert.equal(buildOrder({ ...base, mode: 'r', end: '' }).ok, true);
  assert.equal(buildOrder({ ...base, tel: '123' }).ok, false);
  assert.equal(buildOrder({ ...base, pag: 'Bitcoin' }).ok, false);
});

test('textos longos e caracteres de controle são cortados', () => {
  const r = buildOrder({ ...base, nome: 'x'.repeat(500), obs: 'y'.repeat(900) + '\u0000' });
  assert.equal(r.order.nome.length, 60);
  assert.equal(r.order.obs.length, 200);
});

test('lead exige aceite, nome e telefone', () => {
  assert.equal(buildLead({ nome: 'Ana', tel: '15999990000', aceite: false }).ok, false);
  assert.equal(buildLead({ nome: 'Ana', tel: '1', aceite: true }).ok, false);
  assert.equal(buildLead({ nome: 'Ana', tel: '15999990000', email: 'ruim', aceite: true }).ok, false);
  assert.equal(buildLead({ nome: 'Ana', tel: '15999990000', aceite: true }).ok, true);
});

test('estatísticas do dia', () => {
  const t0 = new Date(2026, 10, 26, 12, 0).getTime();
  const mk = (o) => ({ eta: { min: 20, max: 30 }, itens: [{ n: 'Parmegiana', q: 1 }], tipo: 'e', pag: 'Pix', status: 'concluido', total: 30, t: t0, ...o });
  const orders = [
    mk({ ts: { novo: t0, producao: t0 + 60000, pronto: t0 + 11 * 60000 } }),
    mk({ total: 50, itens: [{ n: 'Parmegiana', q: 2 }, { n: 'Bife', q: 1 }], tipo: 'r', pag: 'Dinheiro' }),
    mk({ status: 'cancelado', total: 999 }),
    mk({ status: 'novo', t: t0 - 40 * 60000 }),
  ];
  const s = summarize(orders, t0 + 5 * 60000);
  assert.equal(s.count, 3);
  assert.equal(s.revenue, 110);
  assert.equal(s.ticket, 36.67);
  assert.equal(s.queue, 1);
  assert.equal(s.late, 1);
  assert.equal(s.avgPrep, 10);
  assert.equal(s.top[0].n, 'Parmegiana');
  assert.equal(s.top[0].q, 4);
  assert.equal(s.cancelled, 1);
  assert.equal(s.byHour[12], 2);
});

test('transições carimbam a etapa', () => {
  const o = { t: 100, status: 'novo' };
  const p = transition(o, 'producao', 200);
  assert.deepEqual(p, { status: 'producao', ts: { novo: 100, producao: 200 } });
  const e = { tipo: 'e', status: 'pronto' }, r = { tipo: 'r', status: 'pronto' };
  assert.equal(next(e), 'saiu');                       // entrega passa pela rua
  assert.equal(next(r), 'concluido');                  // retirada não
  assert.equal(next({ ...e, status: 'saiu' }), 'concluido');
  assert.equal(next({ ...e, status: 'concluido' }), null);
  assert.equal(prev({ ...e, status: 'novo' }), null);
  assert.equal(prev({ ...e, status: 'saiu' }), 'pronto');
  assert.deepEqual(flowOf(r), ['novo', 'producao', 'pronto', 'concluido']);
  assert.match(customerText({ ...e, status: 'saiu', moto: 'João' }), /com João/);
});

test('mensagem de WhatsApp contém itens, total e previsão', () => {
  const { order } = buildOrder(base);
  const m = orderMessage(order);
  assert.match(m, /1x Parmegiana de Frango \(M\)/);
  assert.match(m, /R\$ 28,99/);
  assert.match(m, /30–45 min/);
});

test('CSV da lista VIP escapa aspas e começa com BOM', () => {
  const csv = leadsCsv([{ t: 0, nome: 'A "B"', tel: '1', email: '', interesses: 'x' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"A ""B"""'));
});

test('ago', () => {
  assert.equal(ago(0, 30000), 'agora');
  assert.equal(ago(0, 5 * 60000), 'há 5 min');
  assert.equal(ago(0, 65 * 60000), 'há 1 h 05');
});

const O = (id, t, over = {}) => ({ id, t, status: 'novo', nome: id, tipo: 'e', pag: 'Pix', total: 30, taxa: 2.99, itens: [], eta: { min: 20, max: 30 }, ...over });

test('numeração e fila seguem a ordem de chegada do servidor, não a do aparelho', () => {
  // "b" tem relógio do celular adiantado (t maior), mas chegou ao servidor ANTES de "c"
  const list = [O('c', 100, { rec: 300 }), O('a', 500, { rec: 100 }), O('b', 900, { rec: 200 })];
  const n = numbering(list);
  assert.equal(n.get('a'), 1); assert.equal(n.get('b'), 2); assert.equal(n.get('c'), 3);
  assert.deepEqual(queue(list, 'novo').map((o) => o.id), ['a', 'b', 'c']);
});

test('sem rec (modo demonstração) usa a hora do pedido; empate desempata por id', () => {
  const list = [O('z', 10), O('y', 10), O('x', 5)];
  assert.deepEqual(list.sort(byArrival).map((o) => o.id), ['x', 'y', 'z']);
});

test('waitingBefore avisa quem chegou antes e ainda não começou', () => {
  const list = [O('a', 1), O('b', 2), O('c', 3, { status: 'producao' })];
  assert.deepEqual(waitingBefore(list, list[1]).map((o) => o.id), ['a']);
  assert.deepEqual(waitingBefore(list, list[0]), []);
});

test('dinheiro: cobrar, troco e quanto levar', () => {
  assert.equal(parseMoney('R$ 50'), 50); assert.equal(parseMoney('50,00'), 50); assert.equal(parseMoney('1.000,50'), 1000.5); assert.equal(parseMoney(''), null);
  const m = money(O('a', 1, { pag: 'Dinheiro', total: 32.99, troco: 'R$ 50' }));
  assert.deepEqual([m.kind, m.cobrar, m.troco, m.levar], ['dinheiro', 32.99, 50, 17.01]);
  assert.equal(money(O('a', 1, { pag: 'Dinheiro', total: 32.99, troco: '' })).levar, null);
  assert.equal(money(O('a', 1, { pag: 'Dinheiro', total: 32.99, troco: 'R$ 30' })).levar, null); // troco menor que o total
  assert.equal(money(O('a', 1, { pag: 'Débito/Crédito na entrega' })).kind, 'maquininha');
  assert.equal(money(O('a', 1, { pag: 'Pix' })).kind, 'confirmar');
  assert.equal(money(O('a', 1, { pag: 'Pix', pago: true })).cobrar, 0);
});

test('acerto por entregador: rua, taxas e dinheiro a prestar contas', () => {
  const list = [
    O('1', 1, { status: 'saiu', moto: 'João', pag: 'Dinheiro', total: 40 }),
    O('2', 2, { status: 'saiu', moto: 'João', pag: 'Pix', pago: true, total: 30 }),
    O('3', 3, { status: 'concluido', moto: 'João', pag: 'Dinheiro', total: 28.99 }),
    O('4', 4, { status: 'concluido', moto: 'João', pag: 'Débito/Crédito na entrega', total: 26 }),
    O('5', 5, { status: 'concluido', moto: 'Pedro', pag: 'Pix', pago: true, total: 50 }),
    O('6', 6, { status: 'cancelado', moto: 'Pedro', total: 99 }),
  ];
  const [joao, pedro, ana] = motoSummary(list, ['João', 'Pedro', 'Ana']);
  assert.equal(joao.rua.length, 2); assert.equal(joao.cobrarNaRua, 40);
  assert.equal(joao.entregues, 2); assert.equal(joao.taxas, 5.98);
  assert.equal(joao.acertoDinheiro, 28.99); assert.equal(joao.acertoMaquininha, 26);
  assert.equal(pedro.entregues, 1); assert.equal(pedro.acertoDinheiro, 0);
  assert.equal(ana.entregues, 0);
});

test('estatísticas: valor por forma de pagamento e Pix a conferir', () => {
  const t = 1000;
  const list = [O('1', t, { status: 'producao', pag: 'Pix', total: 30 }), O('2', t, { status: 'concluido', pag: 'Dinheiro', total: 20.5 }), O('3', t, { status: 'pronto', pag: 'Pix', pago: true, total: 10 })];
  const s = summarize(list, t);
  assert.equal(s.payValue.Pix, 40); assert.equal(s.payValue.Dinheiro, 20.5);
  assert.equal(s.toConfirm, 1); assert.equal(s.toConfirmValue, 30);
  assert.equal(s.fees, 8.97);
});

import { cents } from './money.js';
export const FEE = 2.99;
export const MIN_ORDER = 25;
export const MAX_QTY = 30;

export const keyOf = (id, size) => `${id}|${size}`;

export function add(cart, id, size, qty = 1) {
  const k = keyOf(id, size);
  return { ...cart, [k]: Math.min(MAX_QTY, (cart[k] || 0) + qty) };
}
export function change(cart, k, delta) {
  const q = (cart[k] || 0) + delta;
  const next = { ...cart };
  if (q <= 0) delete next[k]; else next[k] = Math.min(MAX_QTY, q);
  return next;
}
/** Linhas do carrinho com preço vindo do CATÁLOGO (nunca do navegador). Ignora itens inexistentes. */
export function lines(cart, catalog) {
  const byId = new Map(catalog.pratos.map((p) => [p.id, p]));
  const out = [];
  for (const [k, q] of Object.entries(cart)) {
    const [id, size] = k.split('|');
    const p = byId.get(id);
    const t = p && p.tamanhos.find((x) => x.id === size);
    if (!p || !t || !(q > 0)) continue;
    out.push({ k, id, n: p.nome, s: t.nome, q, p: t.preco, sub: cents(t.preco * q) });
  }
  return out;
}
export function totals(cart, catalog, mode) {
  const ls = lines(cart, catalog);
  const subtotal = cents(ls.reduce((a, l) => a + l.sub, 0));
  const fee = mode === 'e' ? FEE : 0;
  return { lines: ls, count: ls.reduce((a, l) => a + l.q, 0), subtotal, fee, total: cents(subtotal + fee), missing: Math.max(0, cents(MIN_ORDER - subtotal)) };
}

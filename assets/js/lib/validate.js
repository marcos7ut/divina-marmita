import { totals } from './cart.js';

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const digits = (s) => String(s || '').replace(/\D/g, '');
export const PAYMENTS = ['Pix', 'Link de pagamento (débito/crédito)', 'Dinheiro', 'Débito/Crédito na entrega'];

export function newId() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID().replace(/-/g, '');
  const b = new Uint8Array(16); c.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Monta e valida o pedido. Retorna { ok, error?, order? }. Preços sempre do catálogo. */
export function buildOrder({ cart, catalog, mode, nome, tel, end, pag, troco, obs, eta, now = Date.now() }) {
  const t = totals(cart, catalog, mode);
  const name = clean(nome, 60), address = clean(end, 140), phone = digits(tel);
  if (!t.lines.length) return { ok: false, error: 'Seu carrinho está vazio.' };
  if (t.missing > 0) return { ok: false, error: 'Faltam itens para o pedido mínimo.' };
  if (name.length < 2) return { ok: false, error: 'Diga seu nome.' };
  if (mode === 'e' && address.length < 6) return { ok: false, error: 'Informe o endereço de entrega.' };
  if (phone && (phone.length < 10 || phone.length > 13)) return { ok: false, error: 'WhatsApp inválido. Use DDD + número.' };
  if (!PAYMENTS.includes(pag)) return { ok: false, error: 'Escolha a forma de pagamento.' };
  const order = {
    id: newId(), t: now, status: 'novo',
    nome: name, tel: phone, tipo: mode === 'e' ? 'e' : 'r', end: mode === 'e' ? address : '',
    pag, troco: pag === 'Dinheiro' ? clean(troco, 20) : '', obs: clean(obs, 200),
    taxa: t.fee, total: t.total,
    itens: t.lines.map((l) => ({ id: l.id, n: l.n, s: l.s, q: l.q, p: l.p })),
    eta: eta && eta.min ? { min: eta.min, max: eta.max } : { min: 35, max: 50 },
  };
  return { ok: true, order };
}

export function buildLead({ nome, tel, email, interesses, aceite }) {
  const name = clean(nome, 60), phone = digits(tel), mail = clean(email, 100);
  if (name.length < 2) return { ok: false, error: 'Informe seu nome.' };
  if (phone.length < 10 || phone.length > 13) return { ok: false, error: 'Informe o WhatsApp com DDD.' };
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, error: 'E-mail inválido.' };
  if (!aceite) return { ok: false, error: 'É preciso aceitar receber as mensagens.' };
  return { ok: true, lead: { id: newId(), t: Date.now(), nome: name, tel: phone, email: mail, interesses: clean(interesses, 120) || 'Todos' } };
}

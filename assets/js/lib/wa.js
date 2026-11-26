import { brl } from './money.js';
export const waLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

export function orderMessage(o) {
  let m = `🍽️ *NOVO PEDIDO – DIVINA MARMITA*\nPedido #${o.id.slice(0, 6).toUpperCase()}\n\n👤 *Cliente:* ${o.nome}\n`;
  for (const i of o.itens) m += `• ${i.q}x ${i.n} (${i.s}) – ${brl(i.p * i.q)}\n`;
  m += `\n${o.tipo === 'e' ? `🛵 *Entrega:* ${o.end}\n💰 Taxa: ${brl(o.taxa)}` : '🏪 *Retirada no local*'}\n💳 *Pagamento:* ${o.pag}`;
  if (o.troco) m += ` (troco para ${o.troco})`;
  if (o.obs) m += `\n📝 *Obs:* ${o.obs}`;
  m += `\n\n✅ *TOTAL: ${brl(o.total)}*\n⏱️ Previsão: ${o.eta.min}–${o.eta.max} min\n\nAguardo a confirmação, obrigado!`;
  return m;
}

export function menuMessage(pratos, phone) {
  return '🍽️ *CARDÁPIO DE HOJE – DIVINA MARMITA*\n\n' +
    pratos.map((p) => `• *${p.nome}* – ${p.tamanhos.map((t) => `${t.nome} ${brl(t.preco)}`).join(' | ')}`).join('\n') +
    `\n\n🛵 Entrega R$ 2,99 até 3 km\n📲 Pedidos: ${phone}`;
}

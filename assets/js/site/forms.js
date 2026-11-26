import { $, h } from '../lib/dom.js';
import { buildLead } from '../lib/validate.js';
import { waLink } from '../lib/wa.js';
import { brl } from '../lib/money.js';
import { CONFIG } from '../config.js';
import { S } from './state.js';
import { openSheet, closeSheet } from './ui.js';
import { WEEKDAYS_SHORT } from '../lib/dates.js';
import { PAYMENTS } from '../lib/validate.js';

const N = CONFIG.negocio;

/* ----- Reserva de feijoada ----- */
export function initReserva() {
  const now = new Date(), opts = [];
  for (let i = 1; opts.length < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === 3 || d.getDay() === 6) opts.push(d);
  }
  $('#rd').replaceChildren(...opts.map((d) => h('option', {}, `${WEEKDAYS_SHORT[d.getDay()]}, ${d.toLocaleDateString('pt-BR')}`)));
  $('#rp').replaceChildren(...PAYMENTS.map((p) => h('option', {}, p)));
  $('#rm').addEventListener('change', () => { $('#rae').hidden = $('#rm').value !== 'e'; });
  $('#res-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('#re'), nome = $('#rn').value.replace(/\s+/g, ' ').trim().slice(0, 60), ent = $('#rm').value === 'e', end = $('#ra').value.replace(/\s+/g, ' ').trim().slice(0, 140);
    const q = Math.min(20, Math.max(1, parseInt($('#rq').value, 10) || 1)), g = $('#rs').value === 'G', price = g ? 35 : 28, fee = ent ? 2.99 : 0;
    if (nome.length < 2 || (ent && end.length < 6)) { err.textContent = 'Preencha seu nome' + (ent ? ' e o endereço.' : '.'); err.hidden = false; return; }
    err.hidden = true;
    const msg = `🍲 *RESERVA DE FEIJOADA – DIVINA MARMITA*\n\n👤 ${nome}\n📅 *Data:* ${$('#rd').value}\n• ${q}x Feijoada ${g ? 'G' : 'M'} – ${brl(price * q)}\n🎁 Bônus: ${q}x mini refrigerante\n${ent ? '🛵 Entrega: ' + end + ' (taxa ' + brl(fee) + ')' : '🏪 Retirada no local'}\n💳 Pagamento: ${$('#rp').value}\n\n✅ *TOTAL: ${brl(price * q + fee)}*\n\nPode confirmar minha reserva?`;
    const link = waLink(N.whatsapp, msg);
    const opened = window.open(link, '_blank', 'noopener');
    openSheet(h('div', { class: 'thx' }, h('div', { class: 'em' }, '🍲'), h('h3', { id: 'sheet-t' }, 'Reserva enviada!'),
      h('p', {}, 'Confirme no WhatsApp para garantir sua feijoada com o mini refri de brinde.'),
      h('div', { class: 'links' }, h('a', { class: 'btn g', href: link, target: '_blank', rel: 'noopener' }, opened ? 'Abrir o WhatsApp de novo' : 'Confirmar no WhatsApp'), h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Fechar'))));
  });
}

/* ----- Lista VIP ----- */
const INTERESTS = ['Frete grátis', 'Promoções', 'Aviso da feijoada', 'Cardápio do dia'];
export function initVip() {
  const on = new Set(INTERESTS);
  const draw = () => $('#li').replaceChildren(...INTERESTS.map((i) => h('button', { type: 'button', 'aria-pressed': String(on.has(i)), onclick: () => { on.has(i) ? on.delete(i) : on.add(i); draw(); } }, i)));
  draw();
  $('#vip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#le2');
    const r = buildLead({ nome: $('#ln').value, tel: $('#lw').value, email: $('#le').value, interesses: [...on].join(', '), aceite: $('#lc').checked });
    if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
    err.hidden = true;
    try { await Promise.race([S.store.addLead(r.lead), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 6000))]); } catch { /* segue pelo WhatsApp */ }
    const link = waLink(N.whatsapp, `🎁 *CADASTRO LISTA VIP – DIVINA MARMITA*\n\n👤 ${r.lead.nome}\n📱 ${r.lead.tel}\n${r.lead.email ? '✉️ ' + r.lead.email + '\n' : ''}⭐ Interesses: ${r.lead.interesses}\n\nQuero receber promoções e cupons!`);
    window.open(link, '_blank', 'noopener');
    $('#vip-box').replaceChildren(h('div', { class: 'thx' }, h('div', { class: 'em' }, '🎁'), h('h3', {}, `Quase lá, ${r.lead.nome.split(' ')[0]}!`), h('p', {}, 'Envie a mensagem que abrimos no WhatsApp para ativar suas vantagens.'), h('div', { class: 'links' }, h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, 'Abrir o WhatsApp'))));
  });
}

/* ----- Cantinho ----- */
const PAIR = {
  'Feijoada': 'Couve refogada, laranja fatiada, farofa, arroz branco e vinagrete. O clássico completo.',
  'Parmegiana de frango': 'Arroz branco soltinho e batata palha crocante.',
  'Lagarto assado': 'Macarrão alho e óleo, feijão carioca e farofa.',
  'Bife acebolado': 'Arroz, feijão carioca, farofa e um ovo frito por cima.',
  'Costelinha suína': 'Feijão tropeiro, arroz branco e macarrão no alho e óleo.',
  'Linguiça toscana': 'Couve refogada, farofa, arroz e feijão carioca.',
  'Carne de panela': 'Purê de batata cremoso, arroz branco e feijão carioca.',
  'Coxa com sobrecoxa': 'Espaguete ao molho, arroz branco e feijão carioca.',
};
export function initCantinho() {
  let cur = '';
  const draw = () => {
    $('#pairs').replaceChildren(...Object.keys(PAIR).map((k) => h('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => { cur = k; draw(); } }, k)));
    $('#pairing').replaceChildren(...(cur ? [h('b', {}, cur), ' combina com: ', h('p', {}, PAIR[cur]), h('a', { class: 'btn g sm mt', target: '_blank', rel: 'noopener', href: waLink(N.whatsapp, `Olá! Quero ${cur} com a combinação: ${PAIR[cur]}`) }, 'Pedir essa combinação')] : ['Escolha um prato acima.']));
  };
  draw();
}

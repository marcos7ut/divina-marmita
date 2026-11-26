/**
 * Máquina de estados do pedido.
 *   entrega:  novo → producao → pronto → saiu → concluido
 *   retirada: novo → producao → pronto → concluido
 */
export const FLOW_DELIVERY = ['novo', 'producao', 'pronto', 'saiu', 'concluido'];
export const FLOW_PICKUP = ['novo', 'producao', 'pronto', 'concluido'];
export const flowOf = (o) => (o.tipo === 'e' ? FLOW_DELIVERY : FLOW_PICKUP);

/** Rótulos (linguagem do cliente). */
export const LABEL = { novo: 'Recebido', producao: 'Em preparo', pronto: 'Pronto', saiu: 'Saiu para entrega', concluido: 'Entregue', cancelado: 'Cancelado' };
/** Títulos das colunas do painel (linguagem da cozinha). */
export const COL_LABEL = { novo: 'Novos pedidos', producao: 'Em preparo', pronto: 'Prontos', saiu: 'Na rua', concluido: 'Entregues' };

export const next = (o) => flowOf(o)[flowOf(o).indexOf(o.status) + 1] || null;
export const prev = (o) => { const f = flowOf(o), i = f.indexOf(o.status); return i > 0 ? f[i - 1] : null; };

/** Texto do botão de avançar. */
export function actionLabel(o) {
  if (o.status === 'novo') return 'Começar a fazer';
  if (o.status === 'producao') return 'Marcar como pronto';
  if (o.status === 'pronto') return o.tipo === 'e' ? 'Saiu para entrega' : 'Cliente retirou';
  if (o.status === 'saiu') return 'Entregue ✔';
  return '';
}

/** Patch de atualização, carimbando a hora de cada etapa (usado nas métricas). */
export function transition(o, to, now = Date.now()) {
  return { status: to, ts: { ...(o.ts || { novo: o.t }), [to]: now } };
}

/** Mensagem que o cliente vê no acompanhamento. */
export function customerText(o) {
  const e = o.tipo === 'e';
  return {
    novo: 'Recebemos seu pedido. A cozinha já vai olhar.',
    producao: 'Seu pedido está sendo preparado agora.',
    pronto: e ? 'Pronto! Já vai sair para entrega.' : 'Pronto! Pode vir retirar.',
    saiu: o.moto ? `Saiu para entrega com ${o.moto}. Já já chega!` : 'Saiu para entrega. Já já chega!',
    concluido: e ? 'Pedido entregue. Bom apetite!' : 'Pedido retirado. Bom apetite!',
    cancelado: 'Pedido cancelado. Fale com a gente no WhatsApp.',
  }[o.status];
}

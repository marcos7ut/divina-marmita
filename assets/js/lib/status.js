export const FLOW = ['novo', 'producao', 'pronto', 'concluido'];
export const LABEL = { novo: 'Recebido', producao: 'Em preparo', pronto: 'Pronto', concluido: 'Entregue', cancelado: 'Cancelado' };
/** Títulos das colunas do painel (linguagem da cozinha). */
export const COL_LABEL = { novo: 'Novos pedidos', producao: 'Em preparo', pronto: 'Prontos', concluido: 'Entregues' };
export const next = (s) => FLOW[FLOW.indexOf(s) + 1] || null;
export const prev = (s) => (FLOW.indexOf(s) > 0 ? FLOW[FLOW.indexOf(s) - 1] : null);
/** Texto do botão de avançar, depende de entrega/retirada. */
export function actionLabel(o) {
  if (o.status === 'novo') return 'Começar a fazer';
  if (o.status === 'producao') return o.tipo === 'e' ? 'Saiu para entrega' : 'Pronto p/ retirar';
  if (o.status === 'pronto') return 'Marcar como entregue';
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
    pronto: e ? 'Saiu para entrega. Já já chega aí!' : 'Pronto! Pode vir retirar.',
    concluido: 'Pedido entregue. Bom apetite!',
    cancelado: 'Pedido cancelado. Fale com a gente no WhatsApp.',
  }[o.status];
}

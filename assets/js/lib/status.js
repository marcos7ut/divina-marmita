export const FLOW = ['novo', 'producao', 'pronto', 'concluido'];
export const LABEL = { novo: 'Novo', producao: 'Na chapa', pronto: 'Pronto', concluido: 'Concluído', cancelado: 'Cancelado' };
export const next = (s) => FLOW[FLOW.indexOf(s) + 1] || null;
export const prev = (s) => (FLOW.indexOf(s) > 0 ? FLOW[FLOW.indexOf(s) - 1] : null);
/** Texto do botão de avançar, depende de entrega/retirada. */
export function actionLabel(o) {
  if (o.status === 'novo') return 'Iniciar preparo';
  if (o.status === 'producao') return o.tipo === 'e' ? 'Saiu para entrega' : 'Pronto para retirar';
  if (o.status === 'pronto') return 'Concluir';
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

import { $, h } from '../lib/dom.js';
import { FLOW, LABEL, customerText } from '../lib/status.js';
import { hhmm } from '../lib/dates.js';
import { S, load, save } from './state.js';

let unsub = null;
const bar = $('#track');

/** Acompanha um pedido ao vivo. O id aleatório (128 bits) é a "chave" de leitura. */
export function followOrder(id) {
  save('order', { id, t: Date.now() });
  unsub && unsub();
  unsub = S.store.onOrder(id, (o) => {
    if (!o) { bar.hidden = true; return; }
    draw(o);
  });
}

function draw(o) {
  const idx = FLOW.indexOf(o.status);
  const end = o.t + o.eta.max * 60000;
  bar.hidden = false;
  bar.replaceChildren(h('div', { class: 'track__in' },
    h('b', {}, `Pedido #${o.id.slice(0, 6).toUpperCase()} · ${LABEL[o.status]}`),
    h('div', { class: 'steps', role: 'img', 'aria-label': `Etapa ${Math.max(idx, 0) + 1} de 4` }, ...FLOW.map((_, i) => h('i', { class: i <= idx && o.status !== 'cancelado' ? 'on' : '' }))),
    h('span', { class: 'mono' }, o.status === 'concluido' || o.status === 'cancelado' ? customerText(o) : `${customerText(o)} Até ~${hhmm(end)}`),
    (o.status === 'concluido' || o.status === 'cancelado') ? h('button', { type: 'button', onclick: () => { save('order', null); unsub && unsub(); bar.hidden = true; } }, 'Fechar') : null,
  ));
}

export function resumeTracking() {
  const saved = load('order', null);
  if (saved && Date.now() - saved.t < 6 * 3600e3) followOrder(saved.id);
  else save('order', null);
}

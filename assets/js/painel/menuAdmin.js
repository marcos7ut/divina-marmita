import { h } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { stateOf, applyState, bulkDoc, weekPlan } from '../lib/menuState.js';
import { menuMessage } from '../lib/wa.js';
import { WEEKDAYS } from '../lib/dates.js';
import { CONFIG } from '../config.js';

export function renderMenuAdmin(root, S, { save, savePlan, toast }) {
  const st = S.menu(), q = (S.mq || '').toLowerCase();
  const all = S.catalog.pratos, on = all.filter((p) => st.on.has(p.id)).length, out = all.filter((p) => st.out.has(p.id)).length;

  const set = (id, v) => save(applyState(S.catalog, st, id, v));
  const setCat = (cat, v) => {
    const ids = all.filter((p) => p.cat === cat).map((p) => p.id);
    const nOn = new Set(st.on), nOut = new Set(st.out);
    ids.forEach((id) => { v ? nOn.add(id) : (nOn.delete(id), nOut.delete(id)); });
    save(bulkDoc(nOn, nOut));
  };

  const head = h('div', { class: 'mhead' },
    h('span', { class: 'meter' }, `${on - out} ativos · ${out} esgotados · ${all.length - on} ocultos`),
    h('input', { class: 'grow', type: 'search', placeholder: 'Buscar prato…', 'aria-label': 'Buscar prato', value: S.mq || '', oninput: (e) => { S.mq = e.target.value; renderMenuAdmin(root, S, { save, savePlan, toast }); const i = root.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }),
    h('button', { class: 'btn btn--sm', type: 'button', onclick: () => save({ day: '0000-00-00', on: [], out: [] }, 'Voltou ao plano da semana') }, 'Voltar ao plano de hoje'),
    h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => save(bulkDoc(all.map((p) => p.id), [])) }, 'Mostrar todos'),
    h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => save(bulkDoc([], [])) }, 'Ocultar todos'),
    h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => copy(all.filter((p) => st.on.has(p.id) && !st.out.has(p.id)), toast) }, 'Copiar para WhatsApp'),
  );

  const groups = S.catalog.categorias.map((c) => {
    const list = all.filter((p) => p.cat === c.id && (!q || p.nome.toLowerCase().includes(q)));
    if (!list.length) return null;
    return h('section', {},
      h('div', { class: 'mcat' }, h('h3', {}, c.nome), h('span', {}, h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => setCat(c.id, true) }, 'Mostrar'), ' ', h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => setCat(c.id, false) }, 'Ocultar'))),
      ...list.map((p) => {
        const v = stateOf(st, p.id);
        return h('div', { class: 'prow' },
          h('span', { class: 'th' }, p.img ? h('img', { src: '../assets/img/' + p.img, alt: '', loading: 'lazy', width: 52, height: 52 }) : p.nome[0]),
          h('span', {}, h('b', {}, p.nome), h('small', {}, p.tamanhos.map((t) => `${t.nome} ${brl(t.preco)}`).join(' · '), p.confirmarPreco ? h('i', {}, ' · confirmar preço') : null)),
          h('span', { class: 'tri', role: 'group', 'aria-label': 'Estado de ' + p.nome }, ...[['ativo', 'Ativo'], ['esgotado', 'Esgotou'], ['oculto', 'Oculto']].map(([k, l]) => h('button', { type: 'button', 'data-v': k, 'aria-pressed': String(v === k), onclick: () => v !== k && set(p.id, k) }, l))),
        );
      }),
    );
  });

  root.replaceChildren(head, h('p', { class: 'note' }, st.custom ? 'Você alterou o cardápio hoje. Os clientes veem exatamente o que está abaixo.' : 'Hoje vale o plano da semana. Mexer em qualquer prato cria o cardápio de hoje.'), ...groups.filter(Boolean), planner(S, savePlan));
}

function copy(list, toast) {
  const t = menuMessage(list, CONFIG.negocio.whatsappExibicao);
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Cardápio copiado. Cole no WhatsApp.')).catch(() => window.prompt('Copie o texto:', t));
}

/** Planejador: define o cardápio padrão de cada dia da semana. */
function planner(S, savePlan) {
  const plan = weekPlan(S.catalog, S.planDoc);
  const d = S.planDay;
  const sel = new Set(plan[d]);
  const draft = S.planDraft && S.planDraftDay === d ? S.planDraft : sel;
  S.planDraft = draft; S.planDraftDay = d;
  const rerender = () => document.dispatchEvent(new CustomEvent('plan-redraw'));
  return h('section', { class: 'card', style: null },
    h('div', { class: 'mcat' }, h('h3', {}, 'Planejamento da semana')),
    h('p', { class: 'note' }, 'Define o que aparece sozinho em cada dia, sem você precisar mexer. Hoje vale o plano, a menos que você altere acima.'),
    h('div', { class: 'days' }, ...[1, 2, 3, 4, 5, 6].map((i) => h('button', { type: 'button', 'aria-pressed': String(d === i), onclick: () => { S.planDay = i; S.planDraft = null; rerender(); } }, WEEKDAYS[i]))),
    ...S.catalog.pratos.map((p) => h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: draft.has(p.id), onchange: (e) => { e.target.checked ? draft.add(p.id) : draft.delete(p.id); } }), h('span', {}, p.nome), h('small', {}, S.catalog.categorias.find((c) => c.id === p.cat).nome))),
    h('div', { class: 'mhead mt' }, h('button', { class: 'btn', type: 'button', onclick: () => savePlan(d, [...draft]) }, `Salvar plano de ${WEEKDAYS[d]}`), h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { S.planDraft = null; rerender(); } }, 'Descartar mudanças')),
  );
}

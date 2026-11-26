import { h, fill } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { stateOf, applyState, bulkDoc, weekPlan } from '../lib/menuState.js';
import { menuMessage } from '../lib/wa.js';
import { WEEKDAYS } from '../lib/dates.js';
import { CONFIG } from '../config.js';

export function renderMenuAdmin(root, S, { save, savePlan, toast }) {
  const st = S.menu(), q = (S.mq || '').toLowerCase();
  const all = S.catalog.pratos;
  const shown = all.filter((p) => st.on.has(p.id)).length;
  const redraw = () => renderMenuAdmin(root, S, { save, savePlan, toast });

  const setCat = (cat, v) => {
    const nOn = new Set(st.on), nOut = new Set(st.out);
    all.filter((p) => p.cat === cat).forEach((p) => { v ? nOn.add(p.id) : (nOn.delete(p.id), nOut.delete(p.id)); });
    save(bulkDoc(nOn, nOut));
  };

  const guide = h('details', { class: 'guide', open: S.guideOpen !== false, ontoggle: (e) => { S.guideOpen = e.target.open; } },
    h('summary', {}, '👋 Como funciona (toque para abrir ou fechar)'),
    h('ol', {},
      h('li', {}, 'Cada prato tem uma ', h('b', {}, 'chave'), ' do lado direito.'),
      h('li', {}, h('b', {}, 'Chave verde'), ' = o prato ', h('b', {}, 'aparece'), ' para o cliente. ', h('b', {}, 'Chave cinza'), ' = o prato ', h('b', {}, 'some'), ' do cardápio.'),
      h('li', {}, 'Se o prato ', h('b', {}, 'acabou'), ' durante o dia, toque em ', h('b', {}, '“Acabou hoje”'), ': ele continua aparecendo, mas riscado, e ninguém consegue pedir.'),
      h('li', {}, 'Não precisa salvar: ao tocar, o cliente já vê a mudança ', h('b', {}, 'na hora'), '.'),
      h('li', {}, 'Errou? É só tocar de novo.'),
      h('li', {}, 'À meia-noite o cardápio volta sozinho para o ', h('b', {}, 'plano da semana'), ' (lá embaixo você escolhe o plano de cada dia).'),
    ));

  const bar = h('div', {},
    h('p', { class: 'pbar' }, h('b', {}, String(shown)), ` de ${all.length} pratos aparecendo hoje`),
    h('div', { class: 'pact' },
      h('button', { class: 'btn sm', type: 'button', onclick: () => save({ day: '0000-00-00', on: [], out: [] }, 'Voltou ao plano de hoje.') }, '📅 Voltar ao cardápio do dia'),
      h('button', { class: 'btn out sm', type: 'button', onclick: () => save(bulkDoc(all.map((p) => p.id), [])) }, '✅ Mostrar todos'),
      h('button', { class: 'btn out sm', type: 'button', onclick: () => save(bulkDoc([], [])) }, '⛔ Esconder todos'),
      h('button', { class: 'btn out sm', type: 'button', onclick: () => copy(all.filter((p) => st.on.has(p.id) && !st.out.has(p.id)), toast) }, '📋 Copiar para WhatsApp'),
    ),
    h('input', { class: 'msearch', type: 'search', placeholder: '🔍 Buscar prato…', 'aria-label': 'Buscar prato', value: S.mq || '', oninput: (e) => { S.mq = e.target.value; redraw(); const i = root.querySelector('.msearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }),
  );

  const groups = S.catalog.categorias.map((c) => {
    const list = all.filter((p) => p.cat === c.id && (!q || p.nome.toLowerCase().includes(q)));
    if (!list.length) return null;
    return h('section', {},
      h('div', { class: 'ph3' }, h('b', {}, `${c.icone} ${c.nome} · ${list.filter((p) => st.on.has(p.id)).length}/${list.length}`),
        h('span', {}, h('button', { class: 'btn out sm', type: 'button', onclick: () => setCat(c.id, true) }, 'Mostrar'), h('button', { class: 'btn out sm', type: 'button', onclick: () => setCat(c.id, false) }, 'Esconder'))),
      ...list.map((p) => {
        const v = stateOf(st, p.id), on = v !== 'oculto';
        return h('div', { class: 'prow' + (on ? '' : ' off') },
          h('span', { class: 'pth' }, p.img ? h('img', { src: '../assets/img/' + p.img, alt: '', loading: 'lazy', width: 60, height: 60 }) : c.icone),
          h('span', { class: 'pin' }, h('b', {}, p.nome), h('small', {}, p.tamanhos.map((t) => `${t.nome} ${brl(t.preco)}`).join(' · '), p.confirmarPreco ? ' · ⚠️ confirmar preço' : ''),
            on ? h('button', { class: 'acabou', type: 'button', 'aria-pressed': String(v === 'esgotado'), onclick: () => save(applyState(S.catalog, st, p.id, v === 'esgotado' ? 'ativo' : 'esgotado')) }, v === 'esgotado' ? '↩ Voltou a ter' : 'Acabou hoje') : null),
          h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': `${on ? 'Esconder' : 'Mostrar'} ${p.nome}`, onclick: () => save(applyState(S.catalog, st, p.id, on ? 'oculto' : 'ativo')) }, h('i')),
        );
      }),
    );
  });

  fill(root, guide, bar, h('p', { class: 'note' }, st.custom ? 'Você mexeu no cardápio hoje. Os clientes veem exatamente o que está abaixo.' : 'Hoje está valendo o plano da semana. Ao mexer em qualquer prato, vira o cardápio de hoje.'), groups, planner(S, savePlan));
}

function copy(list, toast) {
  const t = menuMessage(list, CONFIG.negocio.whatsappExibicao);
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copiado! Agora é só colar no WhatsApp.')).catch(() => window.prompt('Copie o texto:', t));
}

/** Plano da semana: o cardápio que volta sozinho em cada dia. */
function planner(S, savePlan) {
  const plan = weekPlan(S.catalog, S.planDoc);
  const d = S.planDay;
  if (!S.planDraft || S.planDraftDay !== d) { S.planDraft = new Set(plan[d]); S.planDraftDay = d; }
  const draft = S.planDraft;
  const rerender = () => document.dispatchEvent(new CustomEvent('plan-redraw'));
  return h('details', { class: 'card', open: !!S.planOpen, ontoggle: (e) => { S.planOpen = e.target.open; } },
    h('summary', {}, '🗓️ Plano da semana (o que aparece sozinho em cada dia)'),
    h('p', { class: 'note mt' }, 'Escolha o dia, marque os pratos que você costuma fazer nele e toque em salvar. Assim você não precisa ligar tudo toda manhã.'),
    h('div', { class: 'days' }, ...[1, 2, 3, 4, 5, 6].map((i) => h('button', { type: 'button', 'aria-pressed': String(d === i), onclick: () => { S.planDay = i; S.planDraft = null; rerender(); } }, WEEKDAYS[i]))),
    ...S.catalog.pratos.map((p) => h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: draft.has(p.id), onchange: (e) => { e.target.checked ? draft.add(p.id) : draft.delete(p.id); } }), h('span', {}, p.nome), h('small', {}, S.catalog.categorias.find((c) => c.id === p.cat).nome))),
    h('div', { class: 'pact mt' }, h('button', { class: 'btn g', type: 'button', onclick: () => savePlan(d, [...draft]) }, `Salvar plano de ${WEEKDAYS[d]}`), h('button', { class: 'btn out', type: 'button', onclick: () => { S.planDraft = null; rerender(); } }, 'Desfazer')),
  );
}

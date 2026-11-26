import { CONFIG } from '../config.js';
import { createStore } from '../data/store.js';
import { $, h, debounce } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { dayKey, startOfDay, endOfDay, fromKey, WEEKDAYS } from '../lib/dates.js';
import { resolveMenu } from '../lib/menuState.js';
import { DEFAULT_OPS, queueSize, estimate } from '../lib/eta.js';
import { summarize, leadsCsv } from '../lib/stats.js';
import { transition, LABEL } from '../lib/status.js';
import { ticket, receipt, COLS } from './kds.js';
import { renderMenuAdmin } from './menuAdmin.js';

const app = $('#app');
const S = {
  store: null, catalog: null, user: null, tab: 'pedidos', col: 'novo', showCancelled: false,
  day: new Date(), orders: [], menuDoc: null, planDoc: null, ops: null, planDay: Math.max(1, new Date().getDay()), planDraft: null,
  fresh: new Set(), knownNew: null, unsub: [], mq: '', loginErr: '', sync: '',
  menu() { return resolveMenu(this.catalog, this.menuDoc, this.planDoc, new Date()); },
};

const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); };
const isToday = () => dayKey(S.day) === dayKey(new Date());

/* ---------- alerta de pedido novo ---------- */
function beep() {
  try {
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.value = 0.12; o.connect(g); g.connect(a.destination); o.start(a.currentTime + i * 0.18); o.stop(a.currentTime + i * 0.18 + 0.15); });
    setTimeout(() => a.close(), 700);
  } catch { /* sem áudio */ }
}

/* ---------- gravações (com tratamento de erro visível) ---------- */
async function guard(p, ok) {
  try { await p; ok && toast(ok); S.sync = 'Salvo ' + new Date().toLocaleTimeString('pt-BR'); }
  catch (e) {
    const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
    toast(denied ? 'Sem permissão para salvar. Confira o UID do dono nas regras do Firestore.' : 'Não consegui salvar. Verifique a internet e tente de novo.');
  }
}
const saveMenu = (doc, msg) => guard(S.store.setMenu(doc), msg || 'Salvo. Os clientes já veem.');
const savePlan = (d, ids) => {
  const dias = { ...((S.planDoc && S.planDoc.dias) || {}) };
  dias[d] = ids;
  return guard(S.store.setPlan({ dias, t: Date.now() }), `Plano de ${WEEKDAYS[d]} salvo.`);
};
const saveOps = (patch) => guard(S.store.setOps({ ...DEFAULT_OPS, ...(S.ops || {}), ...patch, t: Date.now() }), 'Ajustes salvos.');
const move = (o, to) => guard(S.store.updateOrder(o.id, transition(o, to)));

/* ---------- publica a fila para o site calcular o prazo ---------- */
const publishQueue = debounce(() => {
  if (!isToday() || !S.user) return;
  const fila = queueSize(S.orders);
  if (!S.ops || S.ops.fila !== fila) S.store.setOps({ ...DEFAULT_OPS, ...(S.ops || {}), fila, t: Date.now() }).catch(() => {});
}, 1500);

/* ---------- assinaturas ---------- */
function subscribeOrders() {
  S.unsubOrders && S.unsubOrders();
  S.knownNew = null;
  S.unsubOrders = S.store.onOrders(startOfDay(S.day), endOfDay(S.day), (list) => {
    S.orders = list;
    const novos = new Set(list.filter((o) => o.status === 'novo').map((o) => o.id));
    if (S.knownNew && isToday()) {
      const fresh = [...novos].filter((id) => !S.knownNew.has(id));
      if (fresh.length) { fresh.forEach((id) => S.fresh.add(id)); beep(); }
    }
    S.knownNew = novos;
    document.title = (novos.size && isToday() ? `(${novos.size}) ` : '') + 'Cozinha · Divina Marmita';
    publishQueue(); draw();
    if (S.fresh.size) setTimeout(() => S.fresh.clear(), 4000);
  }, () => { S.orders = []; S.permErr = true; draw(); });
}

function start() {
  S.unsub.forEach((f) => f()); S.unsub = [];
  S.unsub.push(S.store.onMenu((d) => { S.menuDoc = d; draw(); }), S.store.onPlan((d) => { S.planDoc = d; draw(); }), S.store.onOps((d) => { S.ops = d; draw(); }));
  subscribeOrders();
}
const stop = () => { S.unsub.forEach((f) => f()); S.unsub = []; S.unsubOrders && S.unsubOrders(); S.unsubOrders = null; S.orders = []; };

/* ---------- telas ---------- */
function loginView() {
  const demo = S.store.mode === 'demo';
  let busy = false;
  const form = h('form', { novalidate: true, class: 'form', onsubmit: async (e) => {
    e.preventDefault(); if (busy) return; busy = true;
    const email = $('#lg-e').value, pw = $('#lg-p').value, err = $('#lg-err');
    err.hidden = true;
    try { await S.store.auth.signIn(email, pw); } catch (x) {
      const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(x.code);
      err.textContent = x.code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde alguns minutos.' : bad ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique a internet.';
      err.hidden = false;
    }
    busy = false;
  } },
    h('label', { class: 'field' }, 'E-mail', h('input', { id: 'lg-e', type: 'email', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true })),
    h('label', { class: 'field' }, 'Senha', h('span', { class: 'pw' }, h('input', { id: 'lg-p', type: 'password', autocomplete: 'current-password', required: true }), h('button', { type: 'button', onclick: (e) => { const i = $('#lg-p'); const v = i.type === 'password'; i.type = v ? 'text' : 'password'; e.target.textContent = v ? 'Ocultar' : 'Mostrar'; } }, 'Mostrar'))),
    h('div', { class: 'err', id: 'lg-err', role: 'alert', hidden: true }),
    h('button', { class: 'btn', type: 'submit' }, 'Entrar'),
  );
  return h('div', { class: 'login' }, h('div', { class: 'login__box' },
    h('h1', {}, 'Cozinha ', h('b', {}, 'Divina')), h('p', { class: 'sub' }, 'Área exclusiva do restaurante.'), form,
    demo ? h('p', { class: 'note demo' }, 'Modo demonstração (sem Firebase). Entre com ', h('code', {}, S.store.demoLogin.email), ' / ', h('code', {}, S.store.demoLogin.senha)) : null));
}

function kpi(label, value, cls = '') { return h('div', { class: 'kpi ' + cls }, h('small', {}, label), h('b', {}, value)); }

function pedidosView() {
  const sm = summarize(S.orders);
  const visible = S.orders.filter((o) => S.showCancelled || o.status !== 'cancelado');
  const maxH = Math.max(1, ...sm.byHour);
  const topMax = sm.top[0] ? sm.top[0].q : 1;
  const fresh = (o) => S.fresh.has(o.id);
  const col = (s) => {
    const list = visible.filter((o) => o.status === s).sort((a, b) => (s === 'concluido' ? b.t - a.t : a.t - b.t));
    return h('section', { class: 'col', 'data-s': s, 'hidden-mobile': S.col === s ? null : '1' },
      h('h2', {}, LABEL[s], h('span', {}, String(list.length))),
      ...(list.length ? list.map((o) => ticket(o, { fresh: fresh(o), onMove: move, onCancel: (x) => window.confirm(`Cancelar o pedido de ${x.nome}?`) && move(x, 'cancelado'), onPrint: printOrder })) : [h('p', { class: 'empty' }, 'Nada por aqui.')]));
  };
  return h('div', {},
    h('div', { class: 'bar-day' },
      h('input', { type: 'date', 'aria-label': 'Dia', value: dayKey(S.day), max: dayKey(new Date()), onchange: (e) => { if (e.target.value) { S.day = fromKey(e.target.value); S.fresh.clear(); subscribeOrders(); } } }),
      !isToday() ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => { S.day = new Date(); subscribeOrders(); } }, 'Voltar para hoje') : h('span', { class: 'sync' }, 'Ao vivo · deixe esta tela aberta para o prazo do site ficar certo'),
      h('span', { class: 'sp' }),
      h('label', { class: 'sync' }, h('input', { type: 'checkbox', checked: S.showCancelled, onchange: (e) => { S.showCancelled = e.target.checked; draw(); } }), ' ver cancelados'),
    ),
    S.permErr ? h('div', { class: 'err' }, 'Sem permissão para ler os pedidos. Confira o UID do dono em firebase/firestore.rules e publique as regras.') : null,
    h('div', { class: 'kpis' },
      kpi('Pedidos', String(sm.count)), kpi('Faturamento', brl(sm.revenue), 'kpi--hot'), kpi('Ticket médio', brl(sm.ticket)),
      kpi('Na fila', String(sm.queue), sm.queue ? 'kpi--hot' : ''), kpi('Atrasados', String(sm.late), sm.late ? 'kpi--bad' : ''), kpi('Preparo médio', sm.avgPrep == null ? '—' : sm.avgPrep + ' min')),
    h('div', { class: 'sub-tabs', role: 'group', 'aria-label': 'Etapa' }, ...COLS.map((s) => h('button', { type: 'button', 'aria-pressed': String(S.col === s), onclick: () => { S.col = s; draw(); } }, `${LABEL[s]} (${visible.filter((o) => o.status === s).length})`))),
    h('div', { class: 'cols' }, ...COLS.map(col)),
    h('div', { class: 'insights' },
      h('div', { class: 'card' }, h('h3', {}, 'Pedidos por hora'),
        h('div', { class: 'hours' }, ...sm.byHour.slice(10, 23).map((n, i) => { const b = h('i', { class: n ? '' : 'z', title: `${i + 10}h: ${n}` }); b.style.setProperty('--h', Math.round((n / maxH) * 100)); return b; })),
        h('div', { class: 'hl' }, h('span', {}, '10h'), h('span', {}, '14h'), h('span', {}, '18h'), h('span', {}, '22h'))),
      h('div', { class: 'card' }, h('h3', {}, 'Mais pedidos'), sm.top.length ? h('ul', { class: 'top-l' }, ...sm.top.map((t) => { const li = h('li', {}, h('span', {}, t.n), h('span', { class: 'q' }, t.q + 'x')); li.style.setProperty('--w', Math.round((t.q / topMax) * 100)); return li; })) : h('p', { class: 'sync' }, 'Sem pedidos ainda.')),
      h('div', { class: 'card' }, h('h3', {}, 'Como chegam'), h('div', { class: 'split' },
        h('div', {}, h('span', {}, 'Entrega'), h('b', {}, String(sm.delivery))), h('div', {}, h('span', {}, 'Retirada'), h('b', {}, String(sm.pickup))),
        ...Object.entries(sm.pay).map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v)))), sm.cancelled ? h('div', {}, h('span', {}, 'Cancelados'), h('b', {}, String(sm.cancelled))) : null))),
  );
}

function printOrder(o) { $('#receipt').replaceChildren(...receipt(o).filter(Boolean)); window.print(); }

function menuView() {
  const root = h('div');
  renderMenuAdmin(root, S, { save: saveMenu, savePlan, toast });
  return root;
}
document.addEventListener('plan-redraw', () => draw());

function ajustesView() {
  const ops = { ...DEFAULT_OPS, ...(S.ops || {}) };
  const num = (id, label, hint, min, max) => h('label', { class: 'field' }, label, h('input', { id, type: 'number', inputmode: 'numeric', min, max, value: ops[id.slice(2)] }), h('small', {}, hint));
  return h('div', { class: 'set' },
    h('div', { class: 'sw' }, h('span', {}, h('b', {}, ops.aberto === false ? 'Pedidos pausados' : 'Aceitando pedidos'), h('small', {}, 'Pause quando a cozinha estiver cheia. O site avisa o cliente.')),
      h('button', { type: 'button', role: 'switch', 'aria-checked': String(ops.aberto !== false), 'aria-label': 'Aceitar pedidos', onclick: () => saveOps({ aberto: ops.aberto === false }) })),
    h('div', { class: 'card' }, h('h3', {}, 'Prazo mostrado ao cliente'),
      h('div', { class: 'grid' }, num('o-base', 'Preparo base (min)', 'Com a fila vazia', 5, 120), num('o-porPedido', 'Minutos por pedido na fila', 'Soma por pedido', 0, 30), num('o-cozinheiros', 'Pessoas cozinhando', 'Divide a fila', 1, 10), num('o-deslocamento', 'Deslocamento (min)', 'Só para entrega', 0, 90)),
      h('p', { class: 'note mt' }, `Fila agora: ${queueSize(S.orders)} pedido(s). Prazo hoje: entrega ${previewEta('e', ops)}, retirada ${previewEta('r', ops)}.`),
      h('button', { class: 'btn mt', type: 'button', onclick: () => { const g = (k) => Math.max(0, Number($('#o-' + k).value) || 0); saveOps({ base: g('base') || 5, porPedido: g('porPedido'), cozinheiros: g('cozinheiros') || 1, deslocamento: g('deslocamento') }); } }, 'Salvar prazos')),
    h('div', { class: 'card' }, h('h3', {}, 'Lista VIP'), h('p', { class: 'note' }, 'Baixe os contatos de quem entrou na lista.'),
      h('button', { class: 'btn btn--ghost mt', type: 'button', onclick: exportLeads }, 'Baixar planilha (CSV)')),
    h('div', { class: 'card' }, h('h3', {}, 'Conta'), h('p', { class: 'note' }, S.user.email), h('button', { class: 'btn btn--ghost mt', type: 'button', onclick: () => S.store.auth.signOut() }, 'Sair')),
  );
}
const previewEta = (m, ops) => { const e = estimate(queueSize(S.orders), ops, m); return `${e.min}–${e.max} min`; };

function exportLeads() {
  let un; let done = false;
  un = S.store.onLeads((list) => {
    if (done) return; done = true; setTimeout(() => un && un(), 0);
    const url = URL.createObjectURL(new Blob([leadsCsv(list)], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `lista-vip-${dayKey()}.csv` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`${list.length} contato(s) exportado(s).`);
  }, () => toast('Sem permissão para ler a lista VIP.'));
}

/* ---------- casca ---------- */
function draw() {
  if (!S.store) return;
  const ae = document.activeElement;
  if (S.user && S.tab === 'ajustes' && ae && ae.tagName === 'INPUT' && ae.closest('.set')) return; // não apaga o que está sendo digitado
  if (!S.user) { app.replaceChildren(loginView()); return; }
  const novos = S.orders.filter((o) => o.status === 'novo').length;
  const tabs = [['pedidos', 'Pedidos'], ['cardapio', 'Cardápio'], ['ajustes', 'Ajustes']];
  const view = S.tab === 'pedidos' ? pedidosView() : S.tab === 'cardapio' ? menuView() : ajustesView();
  const scroll = scrollY;
  app.replaceChildren(
    S.store.mode === 'demo' ? h('div', { class: 'demo-bar' }, 'MODO DEMONSTRAÇÃO · os dados ficam só neste navegador') : null,
    h('header', { class: 'top' }, h('div', { class: 'top__in' }, h('h1', {}, 'Cozinha', h('small', {}, 'Divina Marmita')),
      h('div', { class: 'tabs', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S.tab === k), type: 'button', onclick: () => { S.tab = k; draw(); scrollTo(0, 0); } }, l, k === 'pedidos' && novos ? h('span', { class: 'dot' }, String(novos)) : null))),
      h('span', { class: 'who' }, S.sync))),
    h('main', { class: 'page' }, view));
  scrollTo(0, scroll);
}
setInterval(() => { if (S.user && S.tab === 'pedidos') draw(); }, 30000); // atualiza "há X min" e atrasos

async function boot() {
  try { S.catalog = await (await fetch('../data/menu.json', { cache: 'no-cache' })).json(); } catch { app.textContent = 'Não consegui carregar o cardápio.'; return; }
  S.store = await createStore(CONFIG);
  S.store.auth.onChange((u) => { const was = !!S.user; S.user = u; if (u && !was) start(); if (!u && was) stop(); draw(); });
  draw();
}
boot();

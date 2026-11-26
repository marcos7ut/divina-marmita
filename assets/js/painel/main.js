import { CONFIG } from '../config.js';
import { createStore } from '../data/store.js';
import { $, h, debounce, fill } from '../lib/dom.js';
import { brl } from '../lib/money.js';
import { dayKey, startOfDay, endOfDay, fromKey, WEEKDAYS } from '../lib/dates.js';
import { resolveMenu } from '../lib/menuState.js';
import { DEFAULT_OPS, queueSize, estimate } from '../lib/eta.js';
import { summarize, leadsCsv } from '../lib/stats.js';
import { transition, next, prev, COL_LABEL } from '../lib/status.js';
import { numbering, queue, waitingBefore, motoSummary, byArrival } from '../lib/orders.js';
import { ticket, receipt, COLS } from './kds.js';
import { renderMenuAdmin } from './menuAdmin.js';

const app = $('#app');
const S = {
  store: null, catalog: null, user: null, tab: 'pedidos', col: 'novo', showCancelled: false,
  day: new Date(), orders: [], menuDoc: null, planDoc: null, ops: null, planDay: Math.max(1, new Date().getDay()), planDraft: null,
  fresh: new Set(), knownNew: null, unsub: [], mq: '', loginErr: '', sync: '', team: null, alarm: localStorage.getItem('dm:alarm') !== '0',
  motos() { return (this.team && Array.isArray(this.team.motos) && this.team.motos.length ? this.team.motos : ['Entregador 1', 'Entregador 2']); },
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

/* Lembrete: repete o aviso enquanto houver pedido novo parado (cozinha barulhenta). */
setInterval(() => { if (S.user && S.alarm && isToday() && S.orders.some((o) => o.status === 'novo')) beep(); }, 45000);

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
const move = (o, to, extra = {}) => guard(S.store.updateOrder(o.id, { ...transition(o, to), ...extra }));
const saveTeam = (motos) => guard(S.store.setTeam({ motos, t: Date.now() }), 'Entregadores salvos.');

/* ---------- diálogo simples (escolher entregador) ---------- */
function askMoto(o) {
  const dlg = $('#dlg'), box = $('#dlg-in');
  const sum = new Map(motoSummary(S.orders, S.motos()).map((m) => [m.name, m]));
  return new Promise((ok) => {
    let chosen = null;
    const done = (v) => { chosen = v; dlg.close(); };
    fill(box, h('h3', {}, '🛵 Quem vai levar?'), h('p', {}, `Pedido Nº ${numbering(S.orders).get(o.id)} · ${o.nome} · ${o.end}`),
      h('div', { class: 'opts' }, ...S.motos().map((m) => h('button', { class: 'btn g', type: 'button', onclick: () => done(m) }, m, h('small', {}, `${(sum.get(m) || { rua: [] }).rua.length} na rua`))),
        h('button', { class: 'btn out', type: 'button', onclick: () => done(null) }, 'Cancelar')));
    dlg.addEventListener('close', () => ok(chosen), { once: true });
    dlg.showModal();
  });
}

/** Avança o pedido respeitando a fila e pedindo o entregador na saída. */
async function advance(o) {
  const to = next(o);
  if (!to) return;
  if (o.status === 'novo') {
    const before = waitingBefore(S.orders, o);
    if (before.length) {
      const n = numbering(S.orders), f = before[0];
      if (!window.confirm(`O pedido Nº ${n.get(f.id)} (${f.nome}) chegou ANTES e ainda não foi começado.\n\nComeçar o Nº ${n.get(o.id)} (${o.nome}) mesmo assim?`)) return;
    }
  }
  if (to === 'saiu') {
    const moto = await askMoto(o);
    if (!moto) return;
    return move(o, 'saiu', { moto });
  }
  return move(o, to);
}
const back = (o) => move(o, o.status === 'cancelado' ? 'novo' : prev(o), o.status === 'saiu' ? { moto: '' } : {});
const markPaid = (o) => guard(S.store.updateOrder(o.id, { pago: true }), 'Pagamento confirmado.');

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
  S.unsub.push(S.store.onMenu((d) => { S.menuDoc = d; draw(); }), S.store.onPlan((d) => { S.planDoc = d; draw(); }), S.store.onOps((d) => { S.ops = d; draw(); }), S.store.onTeam((d) => { S.team = d; draw(); }, () => {}));
  subscribeOrders();
}
const stop = () => { S.unsub.forEach((f) => f()); S.unsub = []; S.unsubOrders && S.unsubOrders(); S.unsubOrders = null; S.orders = []; };

/* ---------- telas ---------- */
function loginView() {
  const demo = S.store.mode === 'demo';
  let busy = false;
  const form = h('form', { novalidate: true, class: 'f', onsubmit: async (e) => {
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
    h('label', {}, 'E-mail', h('input', { id: 'lg-e', type: 'email', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true })),
    h('label', {}, 'Senha', h('span', { class: 'pw' }, h('input', { id: 'lg-p', type: 'password', autocomplete: 'current-password', required: true }), h('button', { type: 'button', onclick: (e) => { const i = $('#lg-p'); const v = i.type === 'password'; i.type = v ? 'text' : 'password'; e.target.textContent = v ? 'Ocultar' : 'Mostrar'; } }, 'Mostrar'))),
    h('div', { class: 'warn', id: 'lg-err', role: 'alert', hidden: true }),
    h('button', { class: 'btn g', type: 'submit' }, 'Entrar'),
  );
  return h('div', { class: 'login' }, h('div', { class: 'login__box' },
    h('span', { class: 'ic' }, '🔐'), h('h1', {}, 'Área do ', h('em', {}, 'restaurante')), h('p', { class: 'sub' }, 'Entre para ver os pedidos e escolher o cardápio do dia.'), form,
    demo ? h('p', { class: 'note demo' }, 'Modo demonstração (sem Firebase). Entre com ', h('code', {}, S.store.demoLogin.email), ' / ', h('code', {}, S.store.demoLogin.senha)) : null,
    h('p', { class: 'sync mt', }, h('a', { href: '../' }, '← Voltar ao site'))));
}

const kpi = (label, value, cls = '') => h('div', { class: 'kpi ' + cls }, h('small', {}, label), h('b', {}, value));

const ctxFor = (o, nums, novos, opts = {}) => ({
  n: nums.get(o.id), pos: novos.findIndex((x) => x.id === o.id) + 1, up: o.status === 'novo' && novos[0] && novos[0].id === o.id,
  fresh: S.fresh.has(o.id), onAdvance: advance, onBack: back, onPago: markPaid, onPrint: printOrder,
  onCancel: (x) => window.confirm(`Cancelar o pedido Nº ${nums.get(x.id)} de ${x.nome}?`) && move(x, 'cancelado'), ...opts,
});

function pedidosView() {
  const sm = summarize(S.orders);
  const nums = numbering(S.orders), novos = queue(S.orders, 'novo');
  const visible = S.orders.filter((o) => S.showCancelled || o.status !== 'cancelado');
  const maxH = Math.max(1, ...sm.byHour);
  const topMax = sm.top[0] ? sm.top[0].q : 1;
  const emPreparo = S.orders.filter((o) => o.status === 'producao').length, cooks = (S.ops && S.ops.cozinheiros) || DEFAULT_OPS.cozinheiros;
  const col = (st) => {
    const list = visible.filter((o) => o.status === st).sort(st === 'concluido' ? (a, b) => byArrival(b, a) : byArrival);
    return h('section', { class: 'col', 'data-s': st, 'hidden-mobile': S.col === st ? null : '1' },
      h('h2', {}, COL_LABEL[st], h('span', {}, st === 'producao' ? `${list.length}/${cooks}` : String(list.length))),
      ...(list.length ? list.map((o) => ticket(o, ctxFor(o, nums, novos))) : [h('p', { class: 'empty' }, st === 'novo' ? 'Nenhum pedido novo. Quando chegar, toca um aviso.' : 'Nada por aqui.')]));
  };
  const bars = sm.byHour.slice(10, 23).map((n, i) => { const b = h('i', { class: n ? '' : 'z', title: `${i + 10}h: ${n}` }); b.style.setProperty('--h', Math.round((n / maxH) * 100)); return b; });
  const rua = S.orders.filter((o) => o.status === 'saiu').length;
  return h('div', {},
    h('p', { class: 'hello' }, '👋 Os pedidos aparecem ', h('b', {}, 'na ordem em que chegaram'), '. Faça sempre o que está marcado ', h('b', {}, '▶ PRÓXIMO'), ': se você tentar começar outro antes, o painel pergunta. ', isToday() ? 'Deixe esta tela aberta durante o expediente.' : ''),
    S.permErr ? h('div', { class: 'warn' }, 'Sem permissão para ler os pedidos. Confira o UID do dono nas regras do Firebase (veja docs/SETUP-FIREBASE.md).') : null,
    h('div', { class: 'kpis' }, kpi('Pedidos', String(sm.count)), kpi('Vendido', brl(sm.revenue), 'hot'), kpi('Na fila', String(sm.queue), sm.queue ? 'hot' : '')),
    sm.toConfirm ? h('div', { class: 'warn mt' }, `⏳ ${sm.toConfirm} pedido(s) no Pix/link ainda sem conferir (${brl(sm.toConfirmValue)}). Toque em “Recebi” no pedido quando o pagamento cair.`) : null,
    h('div', { class: 'sub-tabs', role: 'group', 'aria-label': 'Etapa' }, ...COLS.map((st) => h('button', { type: 'button', 'aria-pressed': String(S.col === st), onclick: () => { S.col = st; draw(); } }, `${COL_LABEL[st]} (${visible.filter((o) => o.status === st).length})`))),
    h('div', { class: 'cols' }, ...COLS.map(col)),
    h('details', { class: 'resumo', open: !!S.resumoOpen, ontoggle: (e) => { S.resumoOpen = e.target.open; } },
      h('summary', {}, '📊 Resumo e caixa do dia'),
      h('div', { class: 'bar-day mt' },
        h('label', {}, 'Ver outro dia:', h('input', { type: 'date', 'aria-label': 'Dia', value: dayKey(S.day), max: dayKey(new Date()), onchange: (e) => { if (e.target.value) { S.day = fromKey(e.target.value); S.fresh.clear(); subscribeOrders(); } } })),
        !isToday() ? h('button', { class: 'btn out sm', type: 'button', onclick: () => { S.day = new Date(); subscribeOrders(); } }, 'Voltar para hoje') : null,
        h('span', { class: 'sp' }),
        h('label', {}, h('input', { type: 'checkbox', checked: S.showCancelled, onchange: (e) => { S.showCancelled = e.target.checked; draw(); } }), 'mostrar cancelados')),
      h('div', { class: 'kpis six' }, kpi('Pedidos', String(sm.count)), kpi('Vendido', brl(sm.revenue), 'hot'), kpi('Ticket médio', brl(sm.ticket)), kpi('Taxas de entrega', brl(sm.fees)), kpi('Atrasados', String(sm.late), sm.late ? 'bad' : ''), kpi('Preparo médio', sm.avgPrep == null ? '—' : sm.avgPrep + ' min')),
      h('div', { class: 'insights' },
        h('div', { class: 'card' }, h('h3', {}, 'Caixa por forma de pagamento'), h('div', { class: 'split' },
          ...(Object.keys(sm.payValue).length ? Object.entries(sm.payValue).map(([k, v]) => h('div', {}, h('span', {}, `${k} (${sm.pay[k]})`), h('b', {}, brl(v)))) : [h('p', { class: 'sync' }, 'Sem vendas ainda.')]),
          h('div', {}, h('span', {}, 'Entrega / Retirada'), h('b', {}, `${sm.delivery} / ${sm.pickup}`)), sm.cancelled ? h('div', {}, h('span', {}, 'Cancelados'), h('b', {}, String(sm.cancelled))) : null)),
        h('div', { class: 'card' }, h('h3', {}, 'Pedidos por hora'), h('div', { class: 'hours' }, ...bars), h('div', { class: 'hl' }, h('span', {}, '10h'), h('span', {}, '14h'), h('span', {}, '18h'), h('span', {}, '22h'))),
        h('div', { class: 'card' }, h('h3', {}, 'Mais pedidos'), sm.top.length ? h('ul', { class: 'top-l' }, ...sm.top.map((t) => { const li = h('li', {}, h('span', {}, t.n), h('span', { class: 'q' }, t.q + 'x')); li.style.setProperty('--w', Math.round((t.q / topMax) * 100)); return li; })) : h('p', { class: 'sync' }, 'Sem pedidos ainda.')))),
    rua ? h('p', { class: 'sync mt' }, `${rua} pedido(s) na rua agora. Veja na aba Entregas.`) : null,
  );
}

function entregasView() {
  const nums = numbering(S.orders), novos = queue(S.orders, 'novo');
  const prontos = queue(S.orders, 'pronto').filter((o) => o.tipo === 'e');
  const retirar = queue(S.orders, 'pronto').filter((o) => o.tipo === 'r');
  const motos = motoSummary(S.orders, S.motos());
  const mini = (o, ...extra) => ticket(o, ctxFor(o, nums, novos, { onAdvance: (x) => advance(x) }));
  return h('div', {},
    h('p', { class: 'hello' }, '🛵 Aqui você vê ', h('b', {}, 'quem está levando o quê'), ' e quanto cada entregador tem para cobrar e para acertar no fim do dia.'),
    h('h2', { class: 'sec2' }, `Prontos esperando entregador (${prontos.length})`),
    prontos.length ? h('div', { class: 'rota' }, ...prontos.map((o) => h('div', {}, mini(o), h('div', { class: 'sendrow' }, ...S.motos().map((m) => h('button', { class: 'btn g sm', type: 'button', onclick: () => move(o, 'saiu', { moto: m }) }, '🛵 Enviar com ' + m)))))) : h('p', { class: 'empty2' }, 'Nenhum pedido de entrega pronto no momento. Os mais antigos aparecem primeiro: leve sempre na ordem.'),
    retirar.length ? h('div', {}, h('h2', { class: 'sec2' }, `Prontos para retirar no balcão (${retirar.length})`), h('div', { class: 'rota' }, ...retirar.map((o) => mini(o)))) : null,
    h('h2', { class: 'sec2' }, 'Entregadores'),
    ...motos.map((m) => h('section', { class: 'moto' },
      h('h3', {}, '🛵 ' + m.name, h('span', {}, `${m.rua.length} na rua`)),
      h('div', { class: 'stats' },
        h('div', {}, h('small', {}, 'Cobrar na rua agora'), h('b', {}, brl(m.cobrarNaRua))),
        h('div', {}, h('small', {}, 'Entregas feitas hoje'), h('b', {}, String(m.entregues))),
        h('div', {}, h('small', {}, 'Taxas de entrega'), h('b', {}, brl(m.taxas))),
        h('div', {}, h('small', {}, 'Dinheiro a acertar'), h('b', {}, brl(m.acertoDinheiro)))),
      m.acertoMaquininha ? h('p', { class: 'sync' }, `Na maquininha hoje: ${brl(m.acertoMaquininha)}`) : null,
      m.rua.length ? h('div', { class: 'rota' }, ...m.rua.map((o) => mini(o))) : h('p', { class: 'empty2' }, 'Nenhuma entrega na rua com este entregador.'))),
  );
}

function printOrder(o) { $('#receipt').replaceChildren(...receipt(o, numbering(S.orders).get(o.id)).filter(Boolean)); window.print(); }

function menuView() {
  const root = h('div');
  renderMenuAdmin(root, S, { save: saveMenu, savePlan, toast });
  return root;
}
document.addEventListener('plan-redraw', () => draw());

function ajustesView() {
  const ops = { ...DEFAULT_OPS, ...(S.ops || {}) };
  const open = ops.aberto !== false;
  const num = (id, label, hint, min, max) => h('label', {}, label, h('input', { id, type: 'number', inputmode: 'numeric', min, max, value: ops[id.slice(2)] }), h('small', {}, hint));
  return h('div', { class: 'set' },
    h('div', { class: 'swrow' }, h('span', {}, h('b', {}, open ? '✅ Aceitando pedidos' : '⛔ Pedidos pausados'), h('small', {}, 'Cozinha lotada? Pause. O site avisa o cliente.')),
      h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': String(open), 'aria-label': 'Aceitar pedidos', onclick: () => saveOps({ aberto: !open }) }, h('i'))),
    h('div', { class: 'card' }, h('h3', {}, '⏱️ Prazo que o cliente vê'),
      h('p', { class: 'note' }, 'O site mostra uma faixa de tempo (ex.: 35–50 min) que aumenta quando há muitos pedidos na fila. Ajuste os números à realidade da sua cozinha.'),
      h('div', { class: 'f mt' }, h('div', { class: 'grid' }, num('o-base', 'Preparo base (min)', 'Com a fila vazia', 5, 120), num('o-porPedido', 'Minutos por pedido na fila', 'Cada pedido na frente soma isso', 0, 30), num('o-cozinheiros', 'Pessoas cozinhando', 'Dividem a fila', 1, 10), num('o-deslocamento', 'Tempo de entrega (min)', 'Só para entrega', 0, 90))),
      h('p', { class: 'note mt' }, `Agora: ${queueSize(S.orders)} pedido(s) na fila. Entrega ${previewEta('e', ops)} · retirada ${previewEta('r', ops)}.`),
      h('button', { class: 'btn g mt', type: 'button', onclick: () => { const g = (k) => Math.max(0, Number($('#o-' + k).value) || 0); saveOps({ base: g('base') || 5, porPedido: g('porPedido'), cozinheiros: g('cozinheiros') || 1, deslocamento: g('deslocamento') }); } }, 'Salvar prazos')),
    h('div', { class: 'card' }, h('h3', {}, '🛵 Entregadores'),
      h('p', { class: 'note' }, 'Os nomes aparecem na hora de escolher quem leva cada pedido. O cliente vê só o nome de quem está levando o pedido dele.'),
      h('div', { class: 'f mt' }, ...S.motos().map((m, i) => h('div', { class: 'mrow' }, h('input', { class: 'motoin', value: m, maxlength: 20, 'aria-label': 'Nome do entregador ' + (i + 1) }), h('button', { class: 'btn out sm', type: 'button', 'aria-label': 'Remover ' + m, onclick: () => { const l = S.motos().filter((_, j) => j !== i); l.length && saveTeam(l); } }, 'Remover'))),
        h('div', { class: 'pact' }, h('button', { class: 'btn out sm', type: 'button', onclick: () => saveTeam([...S.motos(), 'Entregador ' + (S.motos().length + 1)]) }, '+ Adicionar'),
          h('button', { class: 'btn g sm', type: 'button', onclick: () => { const l = [...document.querySelectorAll('.motoin')].map((i) => i.value.trim().slice(0, 20)).filter(Boolean); l.length && saveTeam([...new Set(l)]); } }, 'Salvar nomes')))),
    h('div', { class: 'swrow' }, h('span', {}, h('b', {}, S.alarm ? '🔔 Repetir o aviso de pedido novo' : '🔕 Aviso só uma vez'), h('small', {}, 'Toca de novo a cada 45 segundos enquanto houver pedido novo sem atender. Vale só para este aparelho.')),
      h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': String(S.alarm), 'aria-label': 'Repetir aviso', onclick: () => { S.alarm = !S.alarm; localStorage.setItem('dm:alarm', S.alarm ? '1' : '0'); draw(); } }, h('i'))),
    h('div', { class: 'card' }, h('h3', {}, '🎁 Lista VIP'), h('p', { class: 'note' }, 'Baixe a planilha com os contatos de quem entrou na lista.'),
      h('button', { class: 'btn out mt', type: 'button', onclick: exportLeads }, '📥 Baixar planilha')),
    h('div', { class: 'card' }, h('h3', {}, '👤 Conta'), h('p', { class: 'note' }, 'Você entrou como ' + S.user.email), h('button', { class: 'btn out mt', type: 'button', onclick: () => S.store.auth.signOut() }, 'Sair 🚪')),
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
  const tabs = [['pedidos', '🧾 Pedidos'], ['entregas', '🛵 Entregas'], ['cardapio', '🍽️ Cardápio'], ['ajustes', '⚙️ Ajustes']];
  const view = S.tab === 'pedidos' ? pedidosView() : S.tab === 'entregas' ? entregasView() : S.tab === 'cardapio' ? menuView() : ajustesView();
  const scroll = scrollY;
  fill(app,
    S.store.mode === 'demo' ? h('div', { class: 'demo-bar' }, 'MODO DEMONSTRAÇÃO · os dados ficam só neste navegador') : null,
    h('header', { class: 'top' }, h('div', { class: 'top__in' }, h('h1', {}, 'Divina Marmita'),
      h('div', { class: 'tabs', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(S.tab === k), type: 'button', onclick: () => { S.tab = k; draw(); scrollTo(0, 0); } }, l, k === 'pedidos' && novos ? h('span', { class: 'dot' }, String(novos)) : null))),
      h('a', { class: 'sair', href: '../' }, 'Ver o site'))),
    h('main', { class: 'page' }, view));
  scrollTo(0, scroll);
}
setInterval(() => { if (S.user && (S.tab === 'pedidos' || S.tab === 'entregas')) draw(); }, 30000); // atualiza "há X min" e atrasos

async function boot() {
  try { S.catalog = await (await fetch('../data/menu.json', { cache: 'no-cache' })).json(); } catch { app.textContent = 'Não consegui carregar o cardápio.'; return; }
  S.store = await createStore(CONFIG);
  S.store.auth.onChange((u) => { const was = !!S.user; S.user = u; if (u && !was) start(); if (!u && was) stop(); draw(); });
  draw();
}
boot();

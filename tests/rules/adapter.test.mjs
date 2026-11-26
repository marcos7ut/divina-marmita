// Teste de integração: o MESMO adaptador que roda no navegador (assets/js/data/firebase.js)
// contra os emuladores de Auth + Firestore, com as regras reais. Rodar com: npm run test:rules
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { buildOrder } from '../../assets/js/lib/validate.js';
import { transition } from '../../assets/js/lib/status.js';
import { resolveMenu, applyState } from '../../assets/js/lib/menuState.js';
import { startOfDay, endOfDay } from '../../assets/js/lib/dates.js';

const catalog = JSON.parse(readFileSync(new URL('../../data/menu.json', import.meta.url), 'utf8'));
const AUTH = 'http://127.0.0.1:9099';
const wait = (fn, ms = 4000) => new Promise((ok, no) => { const t0 = Date.now(); const i = setInterval(() => { const v = fn(); if (v) { clearInterval(i); ok(v); } else if (Date.now() - t0 > ms) { clearInterval(i); no(new Error('timeout')); } }, 25); });

let env, pub, boss, unsubs = [];
before(async () => {
  // usuário do dono no emulador de Auth
  const r = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dono@divina.test', password: 'senha-forte-123' }) })).json();
  const uid = r.localId;
  const rules = readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8').replaceAll('OWNER_UID', uid);
  env = await initializeTestEnvironment({ projectId: 'demo-divina', firestore: { rules, host: '127.0.0.1', port: 8181 } });
  // o adaptador de produção, com os imports do CDN trocados pelos pacotes locais
  const src = readFileSync(new URL('../../assets/js/data/firebase.js', import.meta.url), 'utf8')
    .replace("import(CDN + 'firebase-app.js')", "import('firebase/app')").replace("import(CDN + 'firebase-firestore.js')", "import('firebase/firestore')").replace("import(CDN + 'firebase-auth.js')", "import('firebase/auth')");
  const dir = mkdtempSync(join(process.cwd(), 'node_modules/.tmp-adapter-'));
  writeFileSync(join(dir, 'adapter.mjs'), src);
  const { createFirebaseStore } = await import(pathToFileURL(join(dir, 'adapter.mjs')).href);
  const cfg = (name) => ({ firebase: { projectId: 'demo-divina', apiKey: 'fake', appId: name, authDomain: 'x' }, emulator: { firestore: ['127.0.0.1', 8181], auth: AUTH } });
  pub = await createFirebaseStore({ ...cfg('pub'), appName: 'pub' });
  boss = await createFirebaseStore({ ...cfg('boss'), appName: 'boss' });
});
after(async () => { unsubs.forEach((u) => u && u()); await env.cleanup(); setTimeout(() => process.exit(0), 100); });

test('dono: login com senha errada falha; certa funciona', async () => {
  await assert.rejects(boss.auth.signIn('dono@divina.test', 'errada'), (e) => /invalid-credential|wrong-password/.test(e.code));
  await boss.auth.signIn('dono@divina.test', 'senha-forte-123');
  await wait(() => true);
});

test('cliente sem login NÃO consegue mudar o cardápio', async () => {
  await assert.rejects(pub.setMenu({ day: '2026-11-26', on: ['parm'], out: [] }), (e) => e.code === 'permission-denied');
  await assert.rejects(pub.setOps({ aberto: false }), (e) => e.code === 'permission-denied');
});

test('dono ativa/esgota/oculta e o cliente vê a mudança ao vivo', async () => {
  let seen = null;
  unsubs.push(pub.onMenu((d) => { seen = d; }));
  const now = new Date();
  let st = resolveMenu(catalog, null, null, now);
  await boss.setMenu(applyState(catalog, st, 'lasanha', 'ativo', now));
  await wait(() => seen && seen.on.includes('lasanha'));
  st = resolveMenu(catalog, seen, null, now);
  await boss.setMenu(applyState(catalog, st, 'lasanha', 'esgotado', now));
  await wait(() => seen.out.includes('lasanha'));
  assert.equal(resolveMenu(catalog, seen, null, now).out.has('lasanha'), true);
  st = resolveMenu(catalog, seen, null, now);
  await boss.setMenu(applyState(catalog, st, 'lasanha', 'oculto', now));
  await wait(() => !seen.on.includes('lasanha'));
});

test('pedido: cliente cria, acompanha; dono lista do dia, avança etapas', async () => {
  const r = buildOrder({ cart: { 'parm|M': 1 }, catalog, mode: 'e', nome: 'Maria Silva', tel: '15999991234', end: 'Rua das Flores, 10', pag: 'Pix', eta: { min: 30, max: 45 } });
  assert.ok(r.ok, r.error);
  const o = r.order;
  let mine = null, list = [];
  unsubs.push(pub.onOrder(o.id, (d) => { mine = d; }));
  unsubs.push(boss.onOrders(startOfDay(), endOfDay(), (l) => { list = l; }));
  await pub.createOrder(o);
  await wait(() => mine && mine.status === 'novo');
  await wait(() => list.some((x) => x.id === o.id));
  await boss.updateOrder(o.id, transition(o, 'producao'));
  await wait(() => mine.status === 'producao');
  assert.ok(mine.ts.producao && mine.ts.novo);
  // cliente não consegue listar nem alterar
  await assert.rejects(pub.updateOrder(o.id, { status: 'concluido' }), (e) => e.code === 'permission-denied');
});

test('lista VIP: cliente cadastra, só o dono lê', async () => {
  await pub.addLead({ id: 'c'.repeat(32), t: Date.now(), nome: 'Ana', tel: '15999990000', email: '', interesses: 'Todos' });
  let leads = null;
  unsubs.push(boss.onLeads((l) => { leads = l; }));
  await wait(() => leads && leads.length === 1);
  let err = null;
  unsubs.push(pub.onLeads(() => {}, (e) => { err = e; }));
  await wait(() => err);
  assert.equal(err.code, 'permission-denied');
});

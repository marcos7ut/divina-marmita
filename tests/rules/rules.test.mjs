// Testa as regras do Firestore no emulador. Rodar com: npm run test:rules
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';

const rules = readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8').replaceAll('OWNER_UID', 'dono');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-divina', firestore: { rules, host: '127.0.0.1', port: 8181 } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const anon = () => env.unauthenticatedContext().firestore();
const owner = () => env.authenticatedContext('dono').firestore();
const stranger = () => env.authenticatedContext('qualquer-um').firestore();

const id = 'a'.repeat(32);
const order = (over = {}) => ({ id, t: Date.now(), status: 'novo', nome: 'Maria', tel: '15999990000', tipo: 'e', end: 'Rua A, 10', pag: 'Pix', troco: '', obs: '', taxa: 2.99, total: 28.99, itens: [{ id: 'parm', n: 'Parmegiana', s: 'M', q: 1, p: 26 }], eta: { min: 30, max: 45 }, ...over });
const lead = (over = {}) => ({ id, t: Date.now(), nome: 'Ana', tel: '15999990000', email: '', interesses: 'Todos', ...over });

test('público lê o cardápio e os ajustes', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'config/menu'), { day: 'x', on: [] }));
  await assertSucceeds(getDoc(doc(anon(), 'config/menu')));
});

test('só o dono grava cardápio, ajustes e plano', async () => {
  await assertFails(setDoc(doc(anon(), 'config/menu'), { day: 'x' }));
  await assertFails(setDoc(doc(stranger(), 'config/menu'), { day: 'x' }));
  await assertSucceeds(setDoc(doc(owner(), 'config/menu'), { day: 'x', on: [] }));
  await assertSucceeds(setDoc(doc(owner(), 'config/ops'), { aberto: true }));
  await assertFails(setDoc(doc(owner(), 'config/outro'), { a: 1 }));
});

test('cliente anônimo cria pedido válido', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + id), order()));
});

test('retirada não exige endereço', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + id), order({ tipo: 'r', end: '' })));
});

test('pedido inválido é recusado', async () => {
  const bad = async (over, why) => { await assertFails(setDoc(doc(anon(), 'orders/' + id), order(over))); void why; };
  await bad({ status: 'concluido' }, 'nasce sempre como novo');
  await bad({ total: 0 }, 'total mínimo');
  await bad({ total: 99999 }, 'total máximo');
  await bad({ nome: 'A' }, 'nome curto');
  await bad({ nome: 'x'.repeat(61) }, 'nome longo');
  await bad({ obs: 'x'.repeat(201) }, 'obs longa');
  await bad({ tipo: 'z' }, 'tipo');
  await bad({ pag: 'Bitcoin' }, 'pagamento');
  await bad({ itens: [] }, 'sem itens');
  await bad({ t: Date.now() - 3600000 }, 'hora falsa (passado)');
  await bad({ t: Date.now() + 3600000 }, 'hora falsa (futuro)');
  await bad({ tipo: 'e', end: '' }, 'entrega sem endereço');
  await bad({ id: 'b'.repeat(32) }, 'id do documento diferente do campo id');
  await bad({ admin: true }, 'campo extra');
  await bad({ eta: { min: 1, max: 9999 } }, 'eta absurda');
  await assertFails(setDoc(doc(anon(), 'orders/curto'), order({ id: 'curto' })));
});

test('cliente não consegue alterar nem apagar pedido, nem sobrescrever', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + id), order()));
  await assertFails(updateDoc(doc(anon(), 'orders/' + id), { status: 'concluido' }));
  await assertFails(setDoc(doc(anon(), 'orders/' + id), order({ total: 1 })));
  await assertFails(deleteDoc(doc(anon(), 'orders/' + id)));
  await assertFails(updateDoc(doc(stranger(), 'orders/' + id), { status: 'concluido' }));
});

test('pedido: get por id é público, mas listar é só do dono', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + id), order()));
  await assertSucceeds(getDoc(doc(anon(), 'orders/' + id)));
  await assertFails(getDocs(collection(anon(), 'orders')));
  await assertFails(getDocs(collection(stranger(), 'orders')));
  const q = query(collection(owner(), 'orders'), where('t', '>=', 0), where('t', '<', Date.now() + 99999), orderBy('t', 'asc'));
  await assertSucceeds(getDocs(q));
});

test('dono atualiza o status do pedido, mas ninguém apaga', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + id), order()));
  await assertSucceeds(updateDoc(doc(owner(), 'orders/' + id), { status: 'producao', ts: { novo: 1, producao: 2 } }));
  await assertFails(deleteDoc(doc(owner(), 'orders/' + id)));
});

test('lista VIP: público só cria; só o dono lê', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'leads/' + id), lead()));
  await assertFails(getDoc(doc(anon(), 'leads/' + id)));
  await assertFails(getDocs(collection(anon(), 'leads')));
  await assertFails(getDocs(collection(stranger(), 'leads')));
  await assertSucceeds(getDocs(collection(owner(), 'leads')));
});

test('lead inválido é recusado', async () => {
  await assertFails(setDoc(doc(anon(), 'leads/' + id), lead({ tel: '123' })));
  await assertFails(setDoc(doc(anon(), 'leads/' + id), lead({ nome: '' })));
  await assertFails(setDoc(doc(anon(), 'leads/' + id), lead({ papel: 'admin' })));
});

test('qualquer outra coleção é negada', async () => {
  await assertFails(getDoc(doc(owner(), 'segredos/x')));
  await assertFails(setDoc(doc(owner(), 'segredos/x'), { a: 1 }));
  await assertFails(setDoc(doc(anon(), 'admins/dono'), { ok: true }));
});

// O que o site REALMENTE envia precisa passar nas regras (evita regra e código divergirem).
import { buildOrder, buildLead } from '../../assets/js/lib/validate.js';
const catalog = JSON.parse(readFileSync(new URL('../../data/menu.json', import.meta.url), 'utf8'));

test('pedido gerado pelo site (entrega e retirada) passa nas regras', async () => {
  for (const mode of ['e', 'r']) {
    const r = buildOrder({ cart: { 'parm|M': 2, 'cola|Única': 1 }, catalog, mode, nome: 'Maria Silva', tel: '(15) 99999-1234', end: 'Rua das Flores, 10', pag: 'Dinheiro', troco: 'R$ 50', obs: 'sem cebola', eta: { min: 30, max: 45 } });
    if (!r.ok) throw new Error(r.error);
    await assertSucceeds(setDoc(doc(anon(), 'orders/' + r.order.id), r.order));
  }
  const semTel = buildOrder({ cart: { 'parm|M': 1 }, catalog, mode: 'r', nome: 'Zé', tel: '', pag: 'Pix', eta: { min: 20, max: 30 } });
  await assertSucceeds(setDoc(doc(anon(), 'orders/' + semTel.order.id), semTel.order));
});

test('lead gerado pelo site passa nas regras', async () => {
  const r = buildLead({ nome: 'Ana Souza', tel: '(15) 9 9999-0000', email: '', interesses: 'Frete grátis, Promoções', aceite: true });
  await assertSucceeds(setDoc(doc(anon(), 'leads/' + r.lead.id), r.lead));
});

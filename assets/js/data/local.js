/**
 * Armazenamento local (modo demonstração e testes automáticos).
 * Mesma interface do firebase.js; sincroniza entre abas pelo BroadcastChannel,
 * então dá para abrir o site e o painel lado a lado e ver o pedido chegar.
 */
const P = 'dm:';
const read = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* cota cheia: ignora */ } };

export const DEMO_LOGIN = { email: 'demo@divina.local', senha: 'demo1234' };

export function createLocalStore() {
  const bc = 'BroadcastChannel' in globalThis ? new BroadcastChannel('dm') : null;
  const subs = new Set();
  const ping = () => { subs.forEach((f) => f()); };
  bc && (bc.onmessage = ping);
  addEventListener('storage', (e) => { if (e.key && e.key.startsWith(P)) ping(); });
  const emit = () => { ping(); bc && bc.postMessage(1); };
  const sub = (fn) => { subs.add(fn); fn(); return () => subs.delete(fn); };

  const authSubs = new Set();
  const me = () => (sessionStorage.getItem(P + 'auth') ? { uid: 'demo', email: DEMO_LOGIN.email } : null);

  const doc = (name) => ({ get: () => read('cfg:' + name, null), set: (v) => { write('cfg:' + name, v); emit(); } });
  const watch = (name) => (cb) => { let last; return sub(() => { const v = JSON.stringify(read('cfg:' + name, null)); if (v !== last) { last = v; cb(JSON.parse(v)); } }); };

  return {
    mode: 'demo',
    demoLogin: DEMO_LOGIN,
    onMenu: watch('menu'), onOps: watch('ops'), onPlan: watch('plan'),
    async createOrder(o) { const all = read('orders', {}); all[o.id] = o; write('orders', all); emit(); },
    onOrder(id, cb) { let last; return sub(() => { const v = JSON.stringify(read('orders', {})[id] || null); if (v !== last) { last = v; cb(JSON.parse(v)); } }); },
    async addLead(l) { const all = read('leads', {}); all[l.id] = l; write('leads', all); emit(); },
    auth: {
      onChange(cb) { const f = () => cb(me()); authSubs.add(f); f(); return () => authSubs.delete(f); },
      async signIn(email, senha) {
        if (email.trim().toLowerCase() !== DEMO_LOGIN.email || senha !== DEMO_LOGIN.senha) { const e = new Error('auth/invalid-credential'); e.code = 'auth/invalid-credential'; throw e; }
        sessionStorage.setItem(P + 'auth', '1'); authSubs.forEach((f) => f());
      },
      async signOut() { sessionStorage.removeItem(P + 'auth'); authSubs.forEach((f) => f()); },
    },
    async setMenu(v) { if (!me()) throw new Error('permission-denied'); doc('menu').set(v); },
    async setOps(v) { if (!me()) throw new Error('permission-denied'); doc('ops').set(v); },
    async setPlan(v) { if (!me()) throw new Error('permission-denied'); doc('plan').set(v); },
    onOrders(from, to, cb) {
      let last;
      return sub(() => {
        if (!me()) { cb([]); return; }
        const list = Object.values(read('orders', {})).filter((o) => o.t >= from && o.t < to).sort((a, b) => a.t - b.t);
        const s = JSON.stringify(list);
        if (s !== last) { last = s; cb(list); }
      });
    },
    async updateOrder(id, patch) {
      if (!me()) throw new Error('permission-denied');
      const all = read('orders', {});
      if (all[id]) { all[id] = { ...all[id], ...patch }; write('orders', all); emit(); }
    },
    onLeads(cb) { return sub(() => cb(me() ? Object.values(read('leads', {})).sort((a, b) => b.t - a.t) : [])); },
  };
}

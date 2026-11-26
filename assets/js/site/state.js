import { resolveMenu } from '../lib/menuState.js';
import { DEFAULT_OPS, estimate } from '../lib/eta.js';

/** Estado único do site. Tudo que a tela mostra deriva daqui. */
export const S = {
  catalog: null, store: null,
  menuDoc: null, planDoc: null, ops: null,
  q: '', cat: '',
  cart: load('cart', {}), mode: 'e', pay: 'Pix',
  listeners: new Set(),
};

export function load(k, d) { try { const v = localStorage.getItem('dm:' + k); return v ? JSON.parse(v) : d; } catch { return d; } }
export function save(k, v) { try { v == null ? localStorage.removeItem('dm:' + k) : localStorage.setItem('dm:' + k, JSON.stringify(v)); } catch { /* modo privado */ } }

export const menuNow = () => resolveMenu(S.catalog, S.menuDoc, S.planDoc, new Date());
export const opsNow = () => ({ ...DEFAULT_OPS, ...(S.ops || {}) });
export const etaNow = (mode) => estimate((S.ops && S.ops.fila) || 0, opsNow(), mode);
export const changed = () => S.listeners.forEach((f) => f());
export const onChange = (f) => S.listeners.add(f);

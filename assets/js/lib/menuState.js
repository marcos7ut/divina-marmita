import { dayKey } from './dates.js';

/** Plano da semana efetivo: o que o dono salvou ou, se nada, o padrão do catálogo. */
export function weekPlan(catalog, planDoc) {
  const base = catalog.semana || {};
  const saved = planDoc && planDoc.dias ? planDoc.dias : null;
  const out = {};
  for (let d = 0; d < 7; d++) out[d] = saved && Array.isArray(saved[d]) ? saved[d] : base[d] || [];
  return out;
}

/** Domingo não tem cozinha: mostra o plano da segunda como prévia. */
export const planDayFor = (date) => (date.getDay() === 0 ? 1 : date.getDay());

/**
 * Estado do cardápio agora.
 * - Se o dono mexeu HOJE (doc.day === hoje), vale o que ele salvou.
 * - Senão vale o plano da semana.
 * `out` (esgotado) só vale quando o dono mexeu hoje.
 */
export function resolveMenu(catalog, menuDoc, planDoc, now = new Date()) {
  const known = new Set(catalog.pratos.map((p) => p.id));
  const today = menuDoc && menuDoc.day === dayKey(now);
  const plan = weekPlan(catalog, planDoc)[planDayFor(now)];
  const on = new Set((today && Array.isArray(menuDoc.on) ? menuDoc.on : plan).filter((id) => known.has(id)));
  const out = new Set(today && Array.isArray(menuDoc.out) ? menuDoc.out.filter((id) => on.has(id)) : []);
  return { on, out, custom: !!today };
}

/** Estado de um prato: 'ativo' | 'esgotado' | 'oculto'. */
export const stateOf = (st, id) => (!st.on.has(id) ? 'oculto' : st.out.has(id) ? 'esgotado' : 'ativo');

/** Aplica um estado e devolve o documento a salvar. */
export function applyState(catalog, st, id, estado, now = new Date()) {
  const on = new Set(st.on), out = new Set(st.out);
  if (estado === 'oculto') { on.delete(id); out.delete(id); }
  if (estado === 'ativo') { on.add(id); out.delete(id); }
  if (estado === 'esgotado') { on.add(id); out.add(id); }
  return { day: dayKey(now), on: [...on], out: [...out] };
}

export const bulkDoc = (ids, outIds, now = new Date()) => ({ day: dayKey(now), on: [...ids], out: [...outIds] });

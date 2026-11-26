const pad = (n) => String(n).padStart(2, '0');
/** Chave de dia local, ex.: 2026-11-26 (sempre com zeros: ordena e compara certo). */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const endOfDay = (d = new Date()) => startOfDay(d) + 86400000;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Horários de funcionamento: seg a sáb, 11h–14h e 18h30–22h. */
export const HOURS = [[11 * 60, 14 * 60], [18 * 60 + 30, 22 * 60]];
export function isOpenNow(now = new Date()) {
  if (now.getDay() === 0) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return HOURS.some(([a, b]) => m >= a && m < b);
}
export const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/** "há 3 min", "há 1 h 05" */
export function ago(ms, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - ms) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

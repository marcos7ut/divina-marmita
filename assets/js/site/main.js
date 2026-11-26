import { CONFIG } from '../config.js';
import { createStore } from '../data/store.js';
import { $, debounce } from '../lib/dom.js';
import { isOpenNow } from '../lib/dates.js';
import { waLink } from '../lib/wa.js';
import { S, onChange, changed, opsNow, etaNow } from './state.js';
import { renderUpd, renderMenu } from './menuView.js';
import { initHero, initGallery, initFall, initReveal, trackTop } from './visuals.js';
import { renderTab } from './cartView.js';
import { resumeTracking } from './tracker.js';
import { initReserva, initVip, initCantinho } from './forms.js';

function renderLive() {
  const el = $('#live'), ops = opsNow(), open = isOpenNow();
  if (ops.aberto === false) { el.dataset.on = 'paused'; el.textContent = 'Pedidos pausados'; return; }
  const e = etaNow('e');
  el.dataset.on = open ? '1' : '0';
  el.textContent = open ? `Aberto agora · ${e.min}–${e.max} min` : 'Fechado agora';
}

function renderAll() { renderLive(); renderUpd(); renderMenu(); renderTab(); }

async function boot() {
  trackTop(); initReveal(); initFall();
  document.querySelectorAll('.wl').forEach((a) => { a.href = waLink(CONFIG.negocio.whatsapp, 'Olá, Divina Marmita! Quero fazer um pedido 😋'); a.target = '_blank'; a.rel = 'noopener'; });
  initReserva(); initVip(); initCantinho();
  try {
    const res = await fetch('data/menu.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    S.catalog = await res.json();
  } catch {
    $('#menu').textContent = 'Não conseguimos carregar o cardápio agora. Chame no WhatsApp.';
    return;
  }
  initHero(); initGallery();
  S.store = await createStore(CONFIG);
  if (S.store.mode === 'demo') document.title = '[DEMO] ' + document.title;
  onChange(renderAll);
  S.store.onMenu((d) => { S.menuDoc = d; changed(); });
  S.store.onPlan((d) => { S.planDoc = d; changed(); });
  S.store.onOps((d) => { S.ops = d; changed(); });
  $('#q').addEventListener('input', debounce((e) => { S.q = e.target.value; renderMenu(); }, 120));
  renderAll();
  setInterval(renderLive, 30000);
  resumeTracking();
}
boot();

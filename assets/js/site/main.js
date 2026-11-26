import { CONFIG } from '../config.js';
import { createStore } from '../data/store.js';
import { $ } from '../lib/dom.js';
import { isOpenNow } from '../lib/dates.js';
import { waLink } from '../lib/wa.js';
import { S, onChange, changed, opsNow, etaNow } from './state.js';
import { renderBoard, renderMenu } from './menuView.js';
import { renderTab } from './cartView.js';
import { resumeTracking } from './tracker.js';
import { initReserva, initVip, initCantinho } from './forms.js';
import { debounce } from '../lib/dom.js';

function renderLive() {
  const el = $('#live'), ops = opsNow(), open = isOpenNow();
  if (ops.aberto === false) { el.dataset.on = 'paused'; el.textContent = 'Pedidos pausados'; return; }
  const e = etaNow('e');
  el.dataset.on = open ? '1' : '0';
  el.textContent = open ? `Aberto · ${e.min}–${e.max} min` : 'Fechado agora';
}

function renderAll() { renderLive(); renderBoard(); renderMenu(); renderTab(); }

function trackBar() {
  const bar = document.querySelector('.bar'), set = () => document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px');
  set(); 'ResizeObserver' in window ? new ResizeObserver(set).observe(bar) : addEventListener('resize', set);
}

async function boot() {
  trackBar();
  $('#wa').href = waLink(CONFIG.negocio.whatsapp, 'Olá, Divina Marmita! Quero fazer um pedido 😋');
  initReserva(); initVip(); initCantinho();
  try {
    const res = await fetch('data/menu.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    S.catalog = await res.json();
  } catch {
    $('#menu').textContent = 'Não conseguimos carregar o cardápio agora. Chame no WhatsApp.';
    return;
  }
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

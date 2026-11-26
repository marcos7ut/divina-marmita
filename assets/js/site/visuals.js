import { $, h } from '../lib/dom.js';
import { S } from './state.js';

const SLIDES = ['bife', 'coxa', 'marmitas', 'feijoada', 'lagarto', 'escond', 'pdia'];
const CAPTION = { marmitas: 'Marmitas fresquinhas, todo dia', feijoada: 'Feijoada de quarta e sábado', pdia: 'Prato do dia completo' };
const GALLERY = [['lagarto', 'Lagarto assado na pressão'], ['bife', 'Bife acebolado'], ['costela', 'Costelinha suína'], ['panela', 'Carne de panela com purê'], ['medalhao', 'Medalhão de frango'], ['feijoada', 'Feijoada de quarta e sábado'], ['lasanha', 'Lasanha gratinada'], ['coxa', 'Coxa com sobrecoxa'], ['coxao', 'Coxão mole ao molho'], ['almond', 'Almôndegas ao molho'], ['recheado', 'Medalhão recheado com calabresa'], ['parm', 'Parmegiana de frango'], ['linguica', 'Linguiça toscana'], ['batata', 'Batata recheada'], ['escond', 'Escondidinho de frango'], ['pdia', 'Prato do dia completo'], ['empanado', 'Frango empanado'], ['marmitas', 'Marmitas fresquinhas']];
const src = (k) => `assets/img/${k}.webp`;
const nameOf = (k) => { const p = S.catalog.pratos.find((x) => x.id === k); return CAPTION[k] || (p ? p.nome : ''); };

/** Slideshow do topo (mesmo efeito do site original: zoom lento + barras de progresso). */
export function initHero() {
  const sl = $('#sl'), hd = $('#hd'), cap = $('#hc');
  sl.replaceChildren(...SLIDES.map((k) => h('img', { src: src(k), alt: '', width: 900, height: 600, loading: k === SLIDES[0] ? 'eager' : 'lazy' })));
  hd.replaceChildren(...SLIDES.map(() => h('i')));
  let i = 0;
  const imgs = [...sl.children], bars = [...hd.children];
  const step = () => {
    const c = i;
    imgs.forEach((e) => e.classList.remove('on'));
    bars.forEach((d, j) => { d.classList.remove('on'); d.classList.toggle('dn', j < c); });
    void imgs[c].offsetWidth;
    imgs[c].classList.add('on'); bars[c].classList.add('on');
    cap.style.opacity = 0;
    setTimeout(() => { cap.textContent = nameOf(SLIDES[c]); cap.style.opacity = 1; }, 350);
    i = (c + 1) % imgs.length;
  };
  step();
  setInterval(step, 5000);
}

export function initGallery() {
  const g = $('#gal');
  g.replaceChildren(...GALLERY.map(([k, t]) => h('figure', {}, h('img', { src: src(k), alt: t, loading: 'lazy', width: 320, height: 400 }), h('figcaption', {}, t))));
  const zo = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('z', e.isIntersecting)), { root: g, threshold: 0.6 });
  g.querySelectorAll('figure').forEach((f) => zo.observe(f));
  setInterval(() => { if (g.scrollLeft + g.clientWidth >= g.scrollWidth - 4) g.scrollTo({ left: 0, behavior: 'smooth' }); else g.scrollBy({ left: 250, behavior: 'smooth' }); }, 3500);
}

/** Feijões e folhas caindo no cartão da feijoada. */
export function initFall() {
  const fl = $('#fall');
  for (let i = 0; i < 26; i++) {
    const e = document.createElement('i');
    if (i % 3 === 0) { e.textContent = '🌿'; e.style.fontSize = 14 + Math.random() * 8 + 'px'; } else e.className = 'bn';
    e.style.left = Math.random() * 100 + '%';
    e.style.animationDuration = 4 + Math.random() * 5 + 's';
    e.style.animationDelay = -Math.random() * 8 + 's';
    fl.append(e);
  }
}

/** Mostra os blocos .rv suavemente ao rolar. */
export function initReveal() {
  document.querySelectorAll('.rv').forEach((el) => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }), { threshold: 0.12 });
    io.observe(el);
  });
}

export function trackTop() {
  const top = $('#top'), set = () => document.documentElement.style.setProperty('--tb', top.offsetHeight + 'px');
  set();
  'ResizeObserver' in window ? new ResizeObserver(set).observe(top) : addEventListener('resize', set);
}

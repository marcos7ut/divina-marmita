// Fluxo completo no navegador, em modo demonstração (sem Firebase):
// dono entra, muda o cardápio, cliente pede, cozinha avança o pedido, cliente acompanha.
// Rodar com: npm run test:e2e   (precisa de: npx playwright install chromium)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8199, BASE = `http://localhost:${PORT}`;
let server, browser, ctx, site, pn;
const errors = [];

before(async () => {
  server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route('https://fonts.*/**', (r) => r.abort());
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ body: 'ok' }));
  const hook = (p, n) => { p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${n}: ${m.text()}`); }); };
  site = await ctx.newPage(); pn = await ctx.newPage(); hook(site, 'site'); hook(pn, 'painel');
  await site.goto(BASE + '/?demo=1'); await pn.goto(BASE + '/painel/?demo=1');
});
after(async () => { await browser.close(); server.kill(); assert.deepEqual(errors, [], 'erros no console'); });

test('painel recusa senha errada e aceita a certa', async () => {
  await pn.fill('#lg-e', 'demo@divina.local'); await pn.fill('#lg-p', 'errada'); await pn.click('button[type=submit]');
  await pn.waitForSelector('#lg-err:not([hidden])');
  assert.match(await pn.textContent('#lg-err'), /incorretos/);
  await pn.fill('#lg-p', 'demo1234'); await pn.click('button[type=submit]');
  await pn.waitForSelector('.top h1');
});

test('dono ativa, esgota e oculta pratos e o site muda na hora', async () => {
  await pn.click('[role=tab]:has-text("Cardápio")');
  const row = (n) => pn.locator('.prow', { hasText: n }).first();
  // o plano da semana muda por dia: garante que os três pratos começam LIGADOS, seja qual for o dia
  for (const n of ['Parmegiana de Frango', 'Bife Acebolado', 'Lasanha']) {
    const sw = row(n).locator('.sw');
    if ((await sw.getAttribute('aria-checked')) === 'false') await sw.click();
  }
  await row('Bife Acebolado').locator('.acabou').click();         // "Acabou hoje"
  await row('Lasanha').locator('.sw').click();                    // desliga a chave
  await site.waitForFunction(() => [...document.querySelectorAll('.it2 b')].some((b) => b.textContent === 'Parmegiana de Frango'));
  const names = await site.$$eval('.it2 b', (e) => e.map((x) => x.textContent));
  assert.ok(!names.includes('Lasanha'));
  assert.equal(await site.$eval('.it2[aria-disabled=true] b', (e) => e.textContent), 'Bife Acebolado');
});

test('cliente faz o pedido, cozinha avança, cliente acompanha', async () => {
  await site.click('.it2:has-text("Parmegiana de Frango")');
  await site.click('.opt:has-text("G")');
  await site.click('#sheet-in .btn.g');
  await site.click('#tab');
  await site.fill('#c-nome', 'Maria Silva'); await site.fill('#c-end', 'Rua das Flores, 10');
  await site.click('#c-form button[type=submit]');
  await site.waitForSelector('#track:not([hidden])');
  assert.match(await site.textContent('#track'), /Recebido/);

  await pn.click('[role=tab]:has-text("Pedidos")');
  await pn.waitForSelector('.col[data-s=novo] .tk');
  assert.match(await pn.textContent('.kpis'), /R\$ 32,99/);
  for (const [from, to] of [['novo', 'Em preparo'], ['producao', 'Pronto']]) {
    await pn.click(`.col[data-s=${from}] .tk .btn.main`);
    await site.waitForFunction((t) => document.querySelector('#track b').textContent.includes(t), to);
  }
  await pn.click('.col[data-s=pronto] .tk .btn.main');           // "Saiu para entrega" pergunta quem leva
  await pn.click('#dlg .opts .btn.g >> nth=0');
  await site.waitForFunction(() => document.querySelector('#track').textContent.includes('Saiu para entrega'));
  assert.match(await site.textContent('#track'), /com Entregador 1/);
  await pn.click('[role=tab]:has-text("Entregas")');
  assert.match(await pn.textContent('.moto'), /Cobrar na rua agora/);
  await pn.click('[role=tab]:has-text("Pedidos")');
  await pn.click('.col[data-s=saiu] .tk .btn.main');             // "Entregue ✔"
  await site.waitForFunction(() => document.querySelector('#track b').textContent.includes('Entregue'));
});

test('pausar pedidos no painel aparece no site e bloqueia o envio', async () => {
  await pn.click('[role=tab]:has-text("Ajustes")'); await pn.click('[role=switch]');
  await site.waitForFunction(() => document.querySelector('#live').textContent === 'Pedidos pausados');
  await pn.click('[role=switch]');
});

test('texto malicioso no nome vira texto, nunca HTML', async () => {
  await site.evaluate(() => localStorage.removeItem('dm:last'));
  await site.reload();
  await site.click('.it2:has-text("Parmegiana de Frango")'); await site.click('#sheet-in .btn.g'); await site.click('#tab');
  await site.fill('#c-nome', '<img src=x onerror=window.__xss=1>'); await site.fill('#c-end', 'Rua das Flores, 10');
  await site.click('#c-form button[type=submit]');
  await pn.click('[role=tab]:has-text("Pedidos")');
  await pn.waitForSelector('.col[data-s=novo] .tk');
  assert.equal(await pn.evaluate(() => window.__xss), undefined);
  assert.match(await pn.textContent('.col[data-s=novo] .tk'), /<img src=x/);
  assert.ok(!(await pn.textContent('body')).includes('null'), 'a palavra null apareceu na tela');
});

test('prato de tamanho único abre sem texto sobrando ("null")', async () => {
  await site.reload();
  await site.click('.it2:has-text("Prato do Dia Completo")');
  await site.waitForSelector('#sheet-in .btn.g');
  assert.ok(!(await site.textContent('#sheet-in')).includes('null'));
});

test('fila justa: o painel avisa antes de começar um pedido que não é o primeiro', async () => {
  const order = async (nome) => {
    await site.evaluate(() => localStorage.removeItem('dm:last'));
    await site.reload();
    await site.click('.it2:has-text("Parmegiana de Frango")'); await site.click('#sheet-in .btn.g'); await site.click('#tab');
    await site.fill('#c-nome', nome); await site.fill('#c-end', 'Rua das Flores, 10');
    await site.click('#c-form button[type=submit]');
    await site.waitForSelector('#track:not([hidden])');
  };
  await pn.reload();
  await pn.waitForSelector('.top h1');
  await order('Primeira Cliente'); await new Promise((r) => setTimeout(r, 50)); await order('Segunda Cliente');
  await pn.click('[role=tab]:has-text("Pedidos")');
  await pn.waitForFunction(() => document.querySelectorAll('.col[data-s=novo] .tk').length >= 2);
  const second = pn.locator('.col[data-s=novo] .tk', { hasText: 'Segunda Cliente' });
  assert.match(await pn.locator('.col[data-s=novo] .tk--up').first().textContent(), /PRÓXIMO/);
  let asked = '';
  pn.once('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
  await second.locator('.btn.main').click();
  await pn.waitForTimeout(300);
  assert.match(asked, /chegou ANTES/);
  assert.equal(await pn.locator('.col[data-s=producao] .tk').count(), 0, 'não deve ter começado');
});

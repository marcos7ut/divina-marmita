// Verificações estáticas de segurança e qualidade. Falha (exit 1) se algo estiver errado.
// Rodar com: npm run check
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => {
  if (['node_modules', '.git', '_site'].includes(f)) return [];
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(root);
const rel = (p) => p.slice(root.length);
const bad = [];
const fail = (f, msg) => bad.push(`${rel(f)}: ${msg}`);

const html = files.filter((f) => extname(f) === '.html');
const js = files.filter((f) => extname(f) === '.js' && f.includes('/assets/'));

for (const f of html) {
  const s = readFileSync(f, 'utf8');
  if (!/Content-Security-Policy/.test(s)) fail(f, 'sem Content-Security-Policy');
  const csp = (s.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  if (/unsafe-eval/.test(csp)) fail(f, "CSP permite 'unsafe-eval'");
  if (/script-src[^;]*unsafe-inline/.test(csp)) fail(f, "CSP permite script inline ('unsafe-inline')");
  if (/style-src[^;]*unsafe-inline/.test(csp)) fail(f, "CSP permite estilo inline ('unsafe-inline')");
  if (!/object-src 'none'/.test(csp) || !/base-uri 'none'/.test(csp)) fail(f, "CSP sem object-src/base-uri 'none'");
  if (/\son[a-z]+="/i.test(s)) fail(f, 'handler inline (onclick=...) — viola a CSP');
  if (/\sstyle="/i.test(s)) fail(f, 'atributo style inline — viola a CSP');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(s)) fail(f, '<script> inline — viola a CSP');
  for (const m of s.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0])) fail(f, 'target=_blank sem rel=noopener: ' + m[0].slice(0, 60));
}
for (const f of js) {
  const s = readFileSync(f, 'utf8');
  if (/\binnerHTML\b|\binsertAdjacentHTML\b|\bdocument\.write\b/.test(s)) fail(f, 'usa innerHTML/insertAdjacentHTML/document.write (risco de XSS)');
  if (/\beval\s*\(|new Function\s*\(/.test(s)) fail(f, 'usa eval/new Function');
  if (/setAttribute\(\s*['"]style['"]/.test(s)) fail(f, 'setAttribute("style") — viola a CSP');
  if (/window\.open\([^)]*\)/.test(s) && !/noopener/.test(s.match(/window\.open\([^)]*\)/g).join(' '))) fail(f, 'window.open sem noopener');
}
// segredos
for (const f of files.filter((f) => /\.(js|mjs|json|md|html|yml|rules)$/.test(f) && !f.includes('package-lock') && !f.endsWith('tools/check.mjs'))) {
  const s = readFileSync(f, 'utf8');
  if (/BEGIN (RSA |EC )?PRIVATE KEY|"private_key"|service_account|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}/.test(s)) fail(f, 'parece conter segredo/chave privada');
}
// regras
const rules = readFileSync(join(root, 'firebase/firestore.rules'), 'utf8');
if (/allow\s+[a-z, ]*write\s*:\s*if\s+true/.test(rules)) fail(root + 'firebase/firestore.rules', 'permite escrita pública irrestrita');
if (!/match \/\{document=\*\*\}[\s\S]*if false/.test(rules)) fail(root + 'firebase/firestore.rules', 'falta o "negar tudo" final');
// links locais quebrados nos HTML
for (const f of html) {
  const dir = f.slice(0, f.lastIndexOf('/') + 1);
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:src|href)="(?!https?:|#|mailto:|tel:|data:)([^"?#]+)/g)) {
    if (!existsSync(join(dir, m[1]))) fail(f, 'arquivo referenciado não existe: ' + m[1]);
  }
}
if (readFileSync(join(root, 'assets/js/config.js'), 'utf8').includes('OWNER')) fail(root + 'assets/js/config.js', 'config contém placeholder de dono');

if (bad.length) { console.error('✖ Problemas encontrados:\n' + bad.map((b) => ' - ' + b).join('\n')); process.exit(1); }
console.log(`✔ ${html.length} páginas HTML, ${js.length} módulos JS e as regras do Firestore passaram nas verificações.`);
console.log(rules.includes("'OWNER_UID'") ? '⚠ Lembrete: troque OWNER_UID em firebase/firestore.rules pelo UID do dono antes de publicar as regras.' : '✔ UID do dono configurado nas regras.');

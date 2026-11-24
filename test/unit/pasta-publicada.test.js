// A pasta que vai para o ar (scripts/pasta-publicada.mjs, wrangler.jsonc) tem tudo o que as páginas carregam, e nada
// além do app. Os testes E2E servem o repositório inteiro: só este teste pega um arquivo que o app carrega e que ficou
// fora da lista (uma pasta nova de fontes ou ícones, por exemplo), que no ar daria 404.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGINAS = ['index.html', 'painel.html'];

// Um endereço do próprio site (relativo), sem a âncora e a busca; null para os de fora (https:, data:, #…)
function local(ref) {
  if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  return ref.split(/[?#]/)[0] || null;
}
const ler = caminho => readFileSync(join(RAIZ, caminho), 'utf8');
const junto = (base, ref) => posix.normalize(posix.join(posix.dirname(base), ref));

// O que as duas páginas carregam: src e href das tags, os módulos importados (estáticos e import() com texto), o CSS
// (@import e url()) e os arquivos que o JS pede pelo caminho a partir da página ('modelos/…', 'img/…', 'painel.html')
function arquivosCarregados() {
  const achados = new Set(PAGINAS);
  const fila = [];
  const incluir = caminho => { if (!achados.has(caminho)) { achados.add(caminho); fila.push(caminho); } };
  for (const pagina of PAGINAS) {
    for (const [, ref] of ler(pagina).matchAll(/\s(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const caminho = local(ref);
      if (caminho) incluir(junto(pagina, caminho));
    }
  }
  while (fila.length) {
    const arquivo = fila.shift();
    if (!existsSync(join(RAIZ, arquivo))) continue;
    const texto = ler(arquivo);
    if (arquivo.endsWith('.css')) {
      for (const [, ref] of texto.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)|url\(\s*["']?([^"')]+)/g)) {
        const caminho = local(ref);
        if (caminho) incluir(junto(arquivo, caminho));
      }
    }
    if (arquivo.endsWith('.js')) {
      const modulos = /(?:\bimport|\bexport)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
      for (const m of texto.matchAll(modulos)) {
        const caminho = local(m[1] ?? m[2] ?? m[3]);
        if (caminho) incluir(junto(arquivo, caminho));
      }
      // Caminhos a partir da página (fetch, <img> montado no JS, a troca para painel.html)
      for (const [, ref] of texto.matchAll(/['"`]((?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpe?g|svg|ico|webp|gif|xlsx|pdf|json|css|html|woff2?))(?=['"`?$])/gi)) {
        incluir(posix.normalize(ref));
      }
    }
  }
  return [...achados].sort();
}

describe('A pasta publicada', () => {
  let pasta;
  before(() => {
    pasta = mkdtempSync(join(tmpdir(), 'acpm-publicada-'));
    execFileSync(process.execPath, [join(RAIZ, 'scripts/pasta-publicada.mjs'), pasta], { stdio: 'pipe' });
  });
  after(() => rmSync(pasta, { recursive: true, force: true }));

  it('acha o que as páginas carregam (as duas páginas, o CSS, os módulos, o logo e o modelo do Excel)', () => {
    const carregados = arquivosCarregados();
    for (const esperado of ['index.html', 'painel.html', 'css/app.css', 'js/main.js', 'js/painel.js', 'js/engine.js',
      'img/acpm-aguia.png', 'img/favicon-32.png', 'modelos/escala-cavok.xlsx']) {
      assert.ok(carregados.includes(esperado), esperado);
    }
  });

  it('tudo o que as páginas carregam existe no repositório', () => {
    const faltando = arquivosCarregados().filter(caminho => !existsSync(join(RAIZ, caminho)));
    assert.deepEqual(faltando, []);
  });

  it('tudo o que as páginas carregam vai para o ar (senão daria 404 no site, com os testes E2E verdes)', () => {
    const deFora = arquivosCarregados().filter(caminho => existsSync(join(RAIZ, caminho)) && !existsSync(join(pasta, caminho)));
    assert.deepEqual(deFora, [], `fora de scripts/pasta-publicada.mjs: ${deFora.join(', ')}`);
  });

  it('nada além do app vai para o ar: testes, migrações, documentos, scripts e a configuração ficam de fora', () => {
    const noAr = readdirSync(pasta).sort();
    for (const nunca of ['test', 'supabase', 'docs', 'scripts', 'node_modules', '.git', '.github', '.redesenho', 'README.md',
      'package.json', 'package-lock.json', 'wrangler.jsonc', 'LICENSE', 'playwright.config.js', 'eslint.config.js']) {
      assert.ok(!noAr.includes(nunca), nunca);
    }
    assert.deepEqual(noAr, ['css', 'img', 'index.html', 'js', 'modelos', 'painel.html']);
  });
});

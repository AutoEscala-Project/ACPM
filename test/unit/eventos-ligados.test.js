// Os módulos de eventos (js/eventos/) ligam elementos da página quando são carregados: um elemento que falta faz o
// import parar com um TypeError, e o app não abre (nenhum teste E2E passa, e nenhum diz por quê). Aqui:
// - cada seletor que um módulo de eventos lê ao ser carregado (no corpo do módulo, ou na função que ele chama ali) existe
//   em index.html;
// - cada módulo que liga eventos ao ser carregado é importado por um arquivo só: js/main.js ou o módulo de uma tela. O
//   registro das ações (js/eventos/registro.js), em que todas as telas registram as delas, é o único que vários importam;
//   os ajudantes que não ligam nada (confirmacao.js) ficam de fora
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const nome = arquivo => relative(RAIZ, arquivo).split(sep).join('/');
const arquivos = pasta => readdirSync(pasta).flatMap(n => {
  const caminho = join(pasta, n);
  return statSync(caminho).isDirectory() ? arquivos(caminho) : n.endsWith('.js') ? [caminho] : [];
});
const arvores = new Map(arquivos(join(RAIZ, 'js')).map(a => [a, espree.parse(readFileSync(a, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true })]));
const EVENTOS = [...arvores.keys()].filter(a => nome(a).startsWith('js/eventos/'));

function percorrer(no, visitar, { dentroDeFuncoes = true } = {}) {
  if (!no || typeof no.type !== 'string') return;
  visitar(no);
  if (!dentroDeFuncoes && /Function/.test(no.type)) return;
  for (const valor of Object.values(no)) {
    if (Array.isArray(valor)) valor.forEach(filho => percorrer(filho, visitar, { dentroDeFuncoes }));
    else if (valor && typeof valor.type === 'string') percorrer(valor, visitar, { dentroDeFuncoes });
  }
}
const literal = no => (no && no.type === 'Literal' && typeof no.value === 'string' ? no.value : null);

// As constantes de texto de cada módulo (const BUSCA = '[data-flt="inst"]'): um seletor guardado numa delas também conta
const constantes = new Map([...arvores].map(([arquivo, arvore]) => [arquivo, new Map(arvore.body
  .flatMap(no => (no.type === 'VariableDeclaration' && no.kind === 'const' ? no.declarations : []))
  .filter(d => d.id.type === 'Identifier' && literal(d.init) !== null)
  .map(d => [d.id.name, literal(d.init)]))]));

// Os seletores escritos num trecho: $('…'), document.querySelector('…'), document.getElementById('…'), e os filtros de
// vários valores (criarFiltroMultiplo({ id }), criarFiltroDosCursos('id'), criarFiltroDasCategorias('id')), que leem o
// botão #<id> e o painel #<id>-painel
function seletoresEm(no, opcoes, arquivo) {
  const doModulo = constantes.get(arquivo) || new Map();
  const texto = n => literal(n) ?? (n && n.type === 'Identifier' && doModulo.has(n.name) ? doModulo.get(n.name) : null);
  const achados = [];
  percorrer(no, n => {
    if (n.type !== 'CallExpression') return;
    const nomeDaFuncao = n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' ? n.callee.property.name : null;
    const [primeiro] = n.arguments;
    if (['$', 'querySelector'].includes(nomeDaFuncao) && texto(primeiro)) achados.push({ seletor: texto(primeiro), linha: n.loc.start.line });
    if (nomeDaFuncao === 'getElementById' && texto(primeiro)) achados.push({ seletor: `#${texto(primeiro)}`, linha: n.loc.start.line });
    if (/^criarFiltro/.test(nomeDaFuncao || '')) {
      const id = texto(primeiro) || (primeiro && primeiro.type === 'ObjectExpression' && literal((primeiro.properties.find(p => p.key && p.key.name === 'id') || {}).value));
      if (id) achados.push({ seletor: `#${id}`, linha: n.loc.start.line }, { seletor: `#${id}-painel`, linha: n.loc.start.line });
    }
  }, opcoes);
  return achados;
}

// A declaração de uma função: no próprio módulo ou no módulo de onde ela foi importada (pelo nome)
function declaracao(arquivo, nomeDaFuncao) {
  const arvore = arvores.get(arquivo);
  for (const no of arvore.body) {
    const d = no.type === 'ExportNamedDeclaration' ? no.declaration : no;
    if (d && d.type === 'FunctionDeclaration' && d.id.name === nomeDaFuncao) return { arquivo, no: d };
    if (d && d.type === 'VariableDeclaration') {
      const v = d.declarations.find(x => x.id.name === nomeDaFuncao && x.init && /Function/.test(x.init.type));
      if (v) return { arquivo, no: v.init };
    }
  }
  for (const no of arvore.body) {
    if (no.type !== 'ImportDeclaration' || !no.source.value.startsWith('.')) continue;
    const s = no.specifiers.find(x => x.type === 'ImportSpecifier' && x.local.name === nomeDaFuncao);
    const alvo = resolve(dirname(arquivo), no.source.value);
    if (s && arvores.has(alvo)) return declaracao(alvo, s.imported.name);
  }
  return null;
}

// O que um módulo de eventos lê ao ser carregado: os seletores do corpo do módulo (fora das funções) e os das funções que
// ele chama ali (um nível)
function lidosAoCarregar(arquivo) {
  const arvore = arvores.get(arquivo);
  const corpo = arvore.body.filter(no => no.type !== 'ImportDeclaration');
  const lidos = corpo.flatMap(no => seletoresEm(no, { dentroDeFuncoes: false }, arquivo).map(s => ({ ...s, onde: `${nome(arquivo)}:${s.linha}` })));
  for (const no of corpo) {
    percorrer(no, n => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
      const d = declaracao(arquivo, n.callee.name);
      if (!d) return;
      lidos.push(...seletoresEm(d.no.body || d.no, {}, d.arquivo).map(s => ({ ...s, onde: `${nome(arquivo)}:${n.loc.start.line} → ${nome(d.arquivo)}:${s.linha}` })));
    }, { dentroDeFuncoes: false });
  }
  return lidos;
}

// O seletor está na página? #id pelo id; [atributo="valor"] pelo atributo; "#id parte" pelo id da frente
function naPagina(seletor) {
  const id = seletor.match(/^#([\w-]+)/);
  if (id) return new RegExp(`id="${id[1]}"`).test(HTML);
  const atributo = seletor.match(/^\[([\w-]+)="([^"]+)"\]$/);
  if (atributo) return HTML.includes(`${atributo[1]}="${atributo[2]}"`);
  return null;
}

describe('Os eventos ligados ao carregar', () => {
  it('cada seletor que um módulo de eventos lê ao ser carregado existe em index.html', () => {
    const lidos = EVENTOS.flatMap(lidosAoCarregar);
    // 65 ao fim do F0b (os 66 da abertura, menos o #importar-agenda, que passou a ser delegado); 64 no F1a (o Manual do
    // topo virou um link, js/views/telas.js): menos que isso é o teste que deixou de achar uma forma de ler a página
    assert.ok(lidos.length >= 64, `só ${lidos.length} seletores achados`);
    const faltam = lidos.filter(l => naPagina(l.seletor) === false).map(l => `${l.onde}: ${l.seletor}`);
    assert.deepEqual(faltam, []);
  });

  it('os painéis dos filtros de vários valores existem (o filtro lê #<id>-painel)', () => {
    // (o de Recursos, flt-rec-cat, saiu no B: os grupos por categoria da lista fazem o papel dele)
    for (const id of ['flt-ins-hab', 'flt-alu-cur', 'flt-proc-sit', 'flt-proc-cur', 'flt-proc-mis']) {
      assert.match(HTML, new RegExp(`id="${id}"`), id);
      assert.match(HTML, new RegExp(`id="${id}-painel"`), `${id}-painel`);
    }
  });

  it('cada módulo que liga eventos ao ser carregado é importado por um arquivo só: js/main.js ou o módulo de uma tela', () => {
    const importadores = new Map();
    for (const [arquivo, arvore] of arvores) {
      for (const no of arvore.body) {
        if (no.type !== 'ImportDeclaration' || !no.source.value.startsWith('.')) continue;
        const alvo = resolve(dirname(arquivo), no.source.value);
        if (!importadores.has(alvo)) importadores.set(alvo, new Set());
        importadores.get(alvo).add(nome(arquivo));
      }
    }
    const ligaAoCarregar = arquivo => arvores.get(arquivo).body.some(no => no.type === 'ExpressionStatement');
    const errados = [];
    for (const arquivo of EVENTOS) {
      if (nome(arquivo) === 'js/eventos/registro.js' || !ligaAoCarregar(arquivo)) continue;
      const quem = [...(importadores.get(arquivo) || [])];
      const valem = quem.length === 1 && (quem[0] === 'js/main.js' || quem[0].startsWith('js/eventos/'));
      if (!valem) errados.push(`${nome(arquivo)} <- ${quem.join(', ') || 'ninguém'}`);
    }
    assert.deepEqual(errados, []);
    assert.ok(existsSync(join(RAIZ, 'js', 'eventos', 'registro.js')));
  });
});

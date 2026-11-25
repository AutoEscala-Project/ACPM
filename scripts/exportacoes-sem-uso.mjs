// As exportações dos módulos do app (js/) que não precisam existir: as que ninguém usa, as que só os testes usam (o app
// não) e as que só o próprio módulo usa (não precisam ser exportadas). E o contrário: um nome importado pelo nome (import { a },
// export { a } from, const { a } = await import(…)) que o módulo de destino não exporta (nada mais confere isso antes de o
// navegador carregar a página; o import * as m não é conferido), e um import() de um módulo do app
// num teste que não diz os nomes (const { a } = await import(…)): sem os nomes, o módulo todo conta como usado. Uma parte interna exportada para os testes, e
// usada pelo próprio módulo, vale. Os arquivos são lidos com o analisador do ESLint (espree), não com expressões
// regulares: "export const a = 1, b = 2" exporta os dois nomes, e um ".nome" de objeto não conta como uso.
// Uso: node scripts/exportacoes-sem-uso.mjs (sai com erro se achar alguma)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arquivos(pasta, extensoes) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).flatMap(nome => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.some(e => nome.endsWith(e)) ? [caminho] : [];
  });
}

const doApp = arquivos(join(RAIZ, 'js'), ['.js']);
const todos = [...doApp, ...arquivos(join(RAIZ, 'test'), ['.js', '.mjs']), ...arquivos(join(RAIZ, 'scripts'), ['.js', '.mjs']),
  ...readdirSync(RAIZ).filter(n => /\.m?js$/.test(n)).map(n => join(RAIZ, n))];

let erros = 0;
const arvores = new Map();
for (const arquivo of todos) {
  try {
    arvores.set(arquivo, espree.parse(readFileSync(arquivo, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true }));
  } catch (e) {
    console.log(`${relative(RAIZ, arquivo)}: não deu para ler (${e.message})`);
    erros++;
  }
}

// Percorre a árvore; pais guarda o nó pai de cada nó
const pais = new WeakMap();
function percorrer(no, visitar, pai = null) {
  if (!no || typeof no.type !== 'string') return;
  pais.set(no, pai);
  visitar(no, pai);
  for (const valor of Object.values(no)) {
    if (Array.isArray(valor)) valor.forEach(filho => percorrer(filho, visitar, no));
    else if (valor && typeof valor.type === 'string') percorrer(valor, visitar, no);
  }
}

const nomeDe = no => (no.type === 'Identifier' ? no.name : String(no.value));

// Os nomes exportados por um módulo (o export default não entra: o app não usa)
function exportacoes(arvore) {
  const nomes = new Set();
  for (const no of arvore.body) {
    if (no.type !== 'ExportNamedDeclaration' || no.source) continue;
    if (no.declaration && no.declaration.type === 'VariableDeclaration') {
      no.declaration.declarations.forEach(d => { if (d.id.type === 'Identifier') nomes.add(d.id.name); });
    } else if (no.declaration && no.declaration.id) nomes.add(no.declaration.id.name);
    no.specifiers.forEach(s => nomes.add(nomeDe(s.exported)));
  }
  return nomes;
}

// Para onde aponta um caminho importado. O import() dentro de uma função mandada para a página (page.evaluate, nos testes
// no navegador) é relativo à raiz do app, não ao arquivo do teste
function alvoDe(arquivo, caminho) {
  if (!caminho.startsWith('.')) return null;
  const doArquivo = resolve(dirname(arquivo), caminho);
  if (existsSync(doArquivo)) return doArquivo;
  const daRaiz = resolve(RAIZ, caminho);
  if (relative(RAIZ, arquivo).startsWith(join('test', 'e2e')) && existsSync(daRaiz)) return daRaiz;
  console.log(`${relative(RAIZ, arquivo)}: o caminho "${caminho}" não existe`);
  erros++;
  return null;
}

// O que cada arquivo importa: import { a, b as c }, import * as x (tudo), export { a } from, export * from (tudo), e o
// import(): const { a, b } = await import(…) usa a e b; outro uso do import() conta como o módulo inteiro
const importados = new Map();
const ehTeste = arquivo => relative(RAIZ, arquivo).startsWith('test');
// Os pedidos de nomes, conferidos depois que todos os arquivos foram lidos: { arquivo, alvo, nomes }
const pedidos = [];
function registrar(arquivo, caminho, nomes) {
  const alvo = alvoDe(arquivo, caminho);
  if (!alvo) return;
  if (nomes !== 'todos') pedidos.push({ arquivo, alvo, nomes });
  const atual = importados.get(alvo) || { nomes: new Set(), doApp: new Set(), todos: false };
  if (nomes === 'todos') atual.todos = true;
  else nomes.forEach(n => { atual.nomes.add(n); if (!ehTeste(arquivo)) atual.doApp.add(n); });
  importados.set(alvo, atual);
}
function nomesDoImportDinamico(no) {
  const espera = pais.get(no);
  const declarador = espera && espera.type === 'AwaitExpression' ? pais.get(espera) : null;
  if (declarador && declarador.type === 'VariableDeclarator' && declarador.id.type === 'ObjectPattern') {
    return declarador.id.properties.filter(p => p.type === 'Property').map(p => nomeDe(p.key));
  }
  return 'todos';
}
for (const [arquivo, arvore] of arvores) {
  percorrer(arvore, no => {
    if (no.type === 'ImportDeclaration') {
      if (no.specifiers.some(s => s.type === 'ImportNamespaceSpecifier')) registrar(arquivo, no.source.value, 'todos');
      else registrar(arquivo, no.source.value, no.specifiers.filter(s => s.type === 'ImportSpecifier').map(s => nomeDe(s.imported)));
    } else if (no.type === 'ExportNamedDeclaration' && no.source) {
      registrar(arquivo, no.source.value, no.specifiers.map(s => nomeDe(s.local)));
    } else if (no.type === 'ExportAllDeclaration') {
      registrar(arquivo, no.source.value, 'todos');
    }
  });
  // Os import() depois da primeira volta: os pais de todos os nós já estão guardados. Num teste, o import() de um
  // módulo do app diz os nomes que usa
  percorrer(arvore, no => {
    if (no.type !== 'ImportExpression' || no.source.type !== 'Literal') return;
    const nomes = nomesDoImportDinamico(no);
    const alvo = nomes === 'todos' && ehTeste(arquivo) ? alvoDe(arquivo, no.source.value) : null;
    if (alvo && doApp.includes(alvo)) {
      console.log(`${relative(RAIZ, arquivo)}:${no.loc.start.line}: import('${no.source.value}') sem dizer os nomes (escreva const { … } = await import(…))`);
      erros++;
    }
    registrar(arquivo, no.source.value, nomes);
  });
}

// Os nomes que um módulo exporta, também os que ele reexporta (export { a } from, export * from: o fixtures.js dos testes)
const todosOsNomes = new Map();
function nomesExportados(arquivo, visitando = new Set()) {
  if (todosOsNomes.has(arquivo)) return todosOsNomes.get(arquivo);
  const arvore = arvores.get(arquivo);
  if (!arvore || visitando.has(arquivo)) return null;
  visitando.add(arquivo);
  const nomes = exportacoes(arvore);
  for (const no of arvore.body) {
    if (no.type === 'ExportNamedDeclaration' && no.source) no.specifiers.forEach(s => nomes.add(nomeDe(s.exported)));
    if (no.type === 'ExportAllDeclaration' && no.source) {
      const de = resolve(dirname(arquivo), no.source.value);
      if (no.exported) nomes.add(nomeDe(no.exported));
      else for (const n of nomesExportados(de, visitando) || []) nomes.add(n);
    }
  }
  todosOsNomes.set(arquivo, nomes);
  return nomes;
}
for (const { arquivo, alvo, nomes } of pedidos) {
  const exportados = nomesExportados(alvo);
  if (!exportados) continue;
  for (const nome of nomes) {
    if (nome === 'default' || exportados.has(nome)) continue;
    console.log(`${relative(RAIZ, arquivo)}: importa ${nome} de ${relative(RAIZ, alvo)}, que não o exporta`);
    erros++;
  }
}

// Quantas vezes um nome é usado no próprio módulo, fora de onde é declarado, das propriedades de objeto e dos exports
function usosInternos(arvore, nome) {
  let usos = 0;
  percorrer(arvore, (no, pai) => {
    if (no.type !== 'Identifier' || no.name !== nome || !pai) return;
    if (pai.type === 'MemberExpression' && pai.property === no && !pai.computed) return;
    if (pai.type === 'Property' && pai.key === no && !pai.computed && !pai.shorthand) return;
    if (['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'].includes(pai.type) && pai.id === no) return;
    if (pai.type === 'ExportSpecifier') return;
    usos++;
  });
  return usos;
}

const problemas = [];
for (const modulo of doApp) {
  const arvore = arvores.get(modulo);
  if (!arvore) continue;
  const usados = importados.get(modulo) || { nomes: new Set(), doApp: new Set(), todos: false };
  if (usados.todos) continue;
  for (const nome of exportacoes(arvore)) {
    if (usados.doApp.has(nome)) continue;
    const interno = usosInternos(arvore, nome) > 0;
    const testado = usados.nomes.has(nome);
    // Exportado para os testes, e usado pelo próprio módulo: é o jeito de testar uma parte interna
    if (interno && testado) continue;
    const motivo = interno ? 'só o próprio módulo usa: tire o export'
      : testado ? 'só os testes usam: o app não usa (apague, com os testes)'
        : 'ninguém usa: apague';
    problemas.push({ modulo: relative(RAIZ, modulo), nome, motivo });
  }
}

problemas.sort((a, b) => a.modulo.localeCompare(b.modulo) || a.nome.localeCompare(b.nome));
for (const p of problemas) console.log(`${p.modulo}: ${p.nome} (${p.motivo})`);
if (problemas.length || erros) {
  if (problemas.length) console.log(`\n${problemas.length} exportações a resolver.`);
  process.exit(1);
}
console.log('Nenhuma exportação sem uso.');

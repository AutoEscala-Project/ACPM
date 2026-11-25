// O censo dos estilos: o que cada folha de estilos faz na tela, medido no navegador (o Chromium do Playwright), para provar
// que dividir css/app.css em várias folhas não muda nada. Rodado antes e depois, imprime o mesmo resultado.
//
//   node scripts/medir-estilos.mjs [--raiz <pasta>] [--saida <arquivo.json>] [--so <parte do nome do estado>]
//   node scripts/medir-estilos.mjs --comparar <antes.json> <depois.json>
//
// --raiz: a pasta servida (padrão: este repositório; para medir outra versão, a pasta dela). Sem dependência nova: o
// servidor é este, e o navegador é o dos testes E2E. A medição tem três partes:
// - os estados: as duas páginas (index.html no modo local, com o estado sintético dos testes, e no modo compartilhado
//   com o servidor falso; painel.html), em várias larguras, temas e contextos (tema claro, escuro, o escuro do sistema,
//   toque, cores forçadas, movimento reduzido, impressão), nos perfis, em cada aba, vista, gaveta, diálogo e no popup
//   do mapa. Em cada estado, o estilo calculado de cada elemento do corpo da página e dos ::before, ::after e
//   ::backdrop dele vira um código (hash); o mesmo código antes e depois é o mesmo estilo;
// - o livro das regras: cada regra das folhas da página (com a @media em que está e as declarações), uma por seletor,
//   o que cobre :hover, :focus-visible, :disabled e :fullscreen, que o estilo em repouso não mostra;
// - os pares em ordem: as regras de mesma especificidade que valem para um mesmo elemento e declaram uma mesma
//   propriedade, na ordem em que estão; a comparação lista os pares cuja ordem se inverteu (para quem revisa).
// As funções medirNaPagina, livroNaPagina, paresNaPagina e propriedadesNaPagina rodam no navegador (page.evaluate)
/* global document, getComputedStyle, matchMedia, CSSImportRule, CSSMediaRule, CSSStyleRule */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { estadoSintetico } from '../test/helpers/estado.js';
import { comExemplo } from '../test/helpers/exemplo.js';
import { criarSupabaseFalso, documentosAtuais, CONTAS } from '../test/e2e/supabase-falso.js';

const AQUI = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opcao = nome => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };

// ---------- A comparação de duas medições ----------
if (args[0] === '--comparar') {
  const [antes, depois] = await Promise.all(args.slice(1, 3).map(async f => JSON.parse(await readFile(f, 'utf8'))));
  let diferencas = 0;
  if (JSON.stringify(antes.propriedades) !== JSON.stringify(depois.propriedades)) {
    console.log(`as propriedades medidas mudaram: ${antes.propriedades.filter(p => !depois.propriedades.includes(p)).join(', ')} saíram; ${depois.propriedades.filter(p => !antes.propriedades.includes(p)).join(', ')} entraram`);
  }
  const nomes = [...new Set([...Object.keys(antes.estados), ...Object.keys(depois.estados)])].sort();
  for (const nome of nomes) {
    if ([antes.estados[nome], depois.estados[nome]].some(h => String(h).startsWith('ERRO'))) { console.log(`estado que não abriu: ${nome}`); diferencas++; continue; }
    if (antes.estados[nome] === depois.estados[nome]) continue;
    console.log(`estado diferente: ${nome}`);
    diferencas++;
  }
  const contar = lista => lista.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
  const [la, ld] = [contar(antes.livro), contar(depois.livro)];
  for (const [regra, n] of la) if ((ld.get(regra) || 0) < n) console.log(`regra que saiu: ${regra}`);
  for (const [regra, n] of ld) if ((la.get(regra) || 0) < n) { console.log(`regra que entrou: ${regra}`); diferencas++; }
  const ordemAntes = new Set(antes.pares);
  const invertidos = depois.pares.filter(p => { const [a, b] = p.split('\u0001'); return ordemAntes.has(`${b}\u0001${a}`); });
  for (const par of invertidos) console.log(`par invertido:\n  ${par.split('\u0001').join('\n  depois de ')}`);
  for (const nome of Object.keys(antes.detalhe || {})) {
    const [a, d] = [antes.detalhe[nome], (depois.detalhe || {})[nome] || {}];
    for (const el of new Set([...Object.keys(a), ...Object.keys(d)])) {
      if (!a[el] || !d[el]) { console.log(`  ${nome}: ${el} só ${a[el] ? 'antes' : 'depois'}`); continue; }
      for (const p of Object.keys(a[el])) if (a[el][p] !== d[el][p]) console.log(`  ${nome}: ${el} ${p}: ${a[el][p]} → ${d[el][p]}`);
    }
  }
  console.log(`${nomes.length} estados, ${diferencas} diferenças; ${la.size} regras antes, ${ld.size} depois; ${invertidos.length} pares invertidos.`);
  process.exit(diferencas ? 1 : 0);
}

// ---------- O servidor da pasta medida ----------
const RAIZ = resolve(opcao('--raiz') || AQUI);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.xlsx': 'application/octet-stream' };
const servidor = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const arquivo = normalize(join(RAIZ, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  if (!arquivo.startsWith(RAIZ.endsWith(sep) ? RAIZ : RAIZ + sep)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' }).end(await readFile(arquivo));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${servidor.address().port}/`;

// ---------- O que é medido em cada estado (roda na página) ----------
// As propriedades medidas: as que as folhas do app declaram (com os desdobramentos: margin vira margin-top…), e as de
// tamanho e posição que o leiaute resolve; só elas mudam quando as regras mudam de lugar. A lista vem de index.html, que
// carrega todas as folhas, e vale para as duas páginas (a TV carrega só as dela)
function propriedadesNaPagina() {
  const declaradas = new Set(['display', 'width', 'height', 'top', 'left', 'right', 'bottom', 'visibility', 'opacity']);
  const percorrer = regras => {
    for (const r of regras) {
      if (r instanceof CSSImportRule) { if (r.styleSheet) percorrer(r.styleSheet.cssRules); continue; }
      if (r.cssRules && !(r instanceof CSSStyleRule)) { percorrer(r.cssRules); continue; }
      if (r.style) for (const p of Array.from(r.style)) declaradas.add(p);
    }
  };
  for (const folha of document.styleSheets) { try { percorrer(folha.cssRules); } catch { /* outra origem */ } }
  return [...declaradas].sort();
}

function medirNaPagina([nomes, detalhe = false]) {
  const fnv = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; });
  let h = 2166136261;
  const mapa = {};
  const caminho = el => { const p = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0; p.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}:${i}`); } return p.join('>'); };
  // O que está à vista: um elemento com display: none conta como tal, e o que está dentro dele não (aparece no estado
  // em que ele está à vista)
  const visitar = el => {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META'].includes(el.tagName)) return;
    const partes = [null, '::before', '::after', ...(el.matches('dialog[open]') ? ['::backdrop'] : [])];
    for (const pseudo of partes) {
      const cs = getComputedStyle(el, pseudo);
      if (!pseudo && cs.display === 'none') { h = fnv(h, `${el.tagName}:none`); return; }
      if (pseudo && pseudo !== '::backdrop' && ['none', 'normal'].includes(cs.content)) { h = fnv(h, `${pseudo}:${cs.content}`); continue; }
      let s = pseudo || el.tagName;
      for (const p of nomes) s += `;${cs.getPropertyValue(p)}`;
      h = fnv(h, s);
      if (detalhe) mapa[`${caminho(el)}${pseudo || ''}`] = Object.fromEntries(nomes.map(p => [p, cs.getPropertyValue(p)]));
    }
    for (const filho of el.children) visitar(filho);
  };
  visitar(document.body);
  h = fnv(h, getComputedStyle(document.documentElement).cssText || nomes.map(p => getComputedStyle(document.documentElement).getPropertyValue(p)).join(';'));
  return detalhe ? mapa : h.toString(16);
}

// As regras das folhas da página, uma por seletor: "@media …|seletor|declarações"
function livroNaPagina() {
  const livro = [];
  const percorrer = (regras, media) => {
    for (const r of regras) {
      if (r instanceof CSSImportRule) { if (r.styleSheet) percorrer(r.styleSheet.cssRules, media); continue; }
      if (r instanceof CSSMediaRule) { percorrer(r.cssRules, [...media, r.conditionText]); continue; }
      if (r instanceof CSSStyleRule) {
        for (const sel of r.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) livro.push(`${media.join(' and ')}|${sel}|${r.style.cssText}`);
        continue;
      }
      livro.push(`${media.join(' and ')}|${r.cssText}`);
    }
  };
  for (const folha of document.styleSheets) {
    let regras;
    try { regras = folha.cssRules; } catch { continue; } // as fontes do Google (outra origem)
    percorrer(regras, []);
  }
  return livro;
}

// Os pares de regras de mesma especificidade que valem para um mesmo elemento e declaram uma mesma propriedade, na ordem
// da cascata (os estados dinâmicos :hover, :focus… contam como se valessem, para pegar a ordem deles também)
function paresNaPagina() {
  const especificidade = sel => {
    const s = sel.replace(/::?(before|after|backdrop|placeholder|marker|selection)\b/g, ' ');
    let a = 0, b = 0, c = 0;
    const semNot = s.replace(/:(not|is|has)\(([^()]*)\)/g, (_, f, dentro) => { const [x, y, z] = especificidade(dentro); a += x; b += y; c += z; return ' '; })
      .replace(/:where\([^()]*\)/g, ' ');
    a += (semNot.match(/#[\w-]+/g) || []).length;
    b += (semNot.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
    c += (semNot.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g) || []).length;
    return [a, b, c];
  };
  const regras = [];
  let ordem = 0;
  const percorrer = (lista, media) => {
    for (const r of lista) {
      if (r instanceof CSSImportRule) { if (r.styleSheet) percorrer(r.styleSheet.cssRules, media); continue; }
      if (r instanceof CSSMediaRule) { percorrer(r.cssRules, [...media, r.conditionText]); continue; }
      if (!(r instanceof CSSStyleRule)) continue;
      const vale = media.every(m => matchMedia(m).matches);
      const props = Array.from(r.style).map(p => `${p}${r.style.getPropertyPriority(p) ? '!' : ''}`);
      for (const sel of r.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) {
        ordem++;
        if (!vale) continue;
        const pseudo = (sel.match(/::(before|after|backdrop|placeholder)/) || [''])[0];
        const paraCasar = sel.replace(/::?(before|after|backdrop|placeholder|marker|selection)\b/g, '')
          .replace(/:(hover|focus-visible|focus-within|focus|active|fullscreen)/g, '').trim() || '*';
        regras.push({ id: `${media.join(' and ')}|${sel}|${r.style.cssText}`, ordem, paraCasar, pseudo, esp: especificidade(sel).join(','), props });
      }
    }
  };
  for (const folha of document.styleSheets) {
    let lista;
    try { lista = folha.cssRules; } catch { continue; }
    percorrer(lista, []);
  }
  const pares = new Set();
  const aVista = [];
  const juntar = el => { if (getComputedStyle(el).display === 'none') return; aVista.push(el); for (const f of el.children) juntar(f); };
  juntar(document.body);
  for (const el of [document.documentElement, ...aVista]) {
    const valem = regras.filter(r => { try { return el.matches(r.paraCasar); } catch { return false; } });
    for (let i = 0; i < valem.length; i++) {
      for (let j = i + 1; j < valem.length; j++) {
        const [x, y] = [valem[i], valem[j]];
        if (x.esp !== y.esp || x.pseudo !== y.pseudo || x.id === y.id) continue;
        if (!x.props.some(p => y.props.includes(p))) continue;
        pares.add(x.ordem < y.ordem ? `${x.id}\u0001${y.id}` : `${y.id}\u0001${x.id}`);
      }
    }
  }
  return [...pares];
}

// ---------- Os estados ----------
const LARGURAS = [320, 390, 640, 760, 1029, 1100, 1280, 1400, 1600];
const ABAS = ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'cur', 'rod', 'bi'];
const ABAS_DA_SECRETARIA = ['esc', 'age', 'ins', 'alu', 'cur'];
const AGORA = new Date('2026-11-10T12:00:00-03:00');
const LIBS = { 'supabase.js': join(AQUI, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'jspdf.umd.min.js': join(AQUI, 'node_modules/jspdf/dist/jspdf.umd.min.js'), 'jspdf.plugin.autotable.min.js': join(AQUI, 'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js') };

// Os contextos: o tema (claro, escuro, o do sistema), o toque, as cores forçadas, o movimento reduzido e a impressão
const CONTEXTOS = {
  claro: { tema: 'light' },
  escuro: { tema: 'dark' },
  'escuro-do-sistema': { colorScheme: 'dark' },
  toque: { tema: 'light', hasTouch: true },
  'cores-forcadas': { tema: 'light', forcedColors: 'active' },
  'movimento-reduzido': { tema: 'light', reducedMotion: 'reduce' },
  impressao: { tema: 'light', media: 'print' }
};

async function novoContexto(navegador, { tema, colorScheme = 'light', hasTouch = false, forcedColors = 'none', reducedMotion = 'no-preference', media = 'screen' }) {
  const contexto = await navegador.newContext({ hasTouch, colorScheme, forcedColors, reducedMotion, viewport: { width: 1400, height: 900 } });
  await contexto.clock.setFixedTime(AGORA);
  await contexto.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await contexto.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, r => {
    const arquivo = LIBS[new URL(r.request().url()).pathname.split('/').pop()];
    return arquivo ? r.fulfill({ path: arquivo, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' } }) : r.abort();
  });
  if (tema) await contexto.addInitScript(t => { try { localStorage.setItem('acpm3_theme', t); } catch { /* sem armazenamento */ } }, tema);
  contexto.media = media;
  return contexto;
}

async function pagina(contexto) {
  const page = await contexto.newPage();
  await page.emulateMedia({ media: contexto.media });
  return page;
}

const pronto = page => page.waitForSelector('body[data-pronto]', { state: 'attached', timeout: 60000 });
const quieto = page => page.waitForTimeout(150);
const aba = async (page, id) => { await page.locator(`#nav button[data-t="${id}"]`).click(); await quieto(page); };

// As vistas, gavetas, diálogos e o popup, cada um a partir do app aberto na Escala
const DETALHES = {
  'escala-por-recurso': async page => { await aba(page, 'esc'); await page.locator('#s-esc [data-tl="eq"]').click(); },
  'escala-por-instrutor': async page => { await aba(page, 'esc'); await page.locator('#s-esc [data-tl="ins"]').click(); },
  'escala-painel': async page => { await aba(page, 'esc'); await page.locator('#s-esc [data-tl="painel"]').click(); },
  'popup-do-mapa': async page => { await aba(page, 'esc'); await page.locator('#s-esc [data-tl="eq"]').click(); await page.locator('#out .tl-bar').first().click(); },
  'recursos-cadastro': async page => { await aba(page, 'rec'); await page.locator('[data-vista-rec="cadastro"]').click(); },
  'instrutores-cadastro': async page => { await aba(page, 'ins'); await page.locator('[data-vista-ins="cadastro"]').click(); },
  historico: async page => { await page.locator('#btn-open-log').click(); },
  habilitacoes: async page => { await aba(page, 'ins'); await page.locator('[data-vista-ins="cadastro"]').click(); await page.locator('[data-act="editar-habs"]').first().click(); },
  'dados-pessoais': async page => { await aba(page, 'alu'); await page.locator('#alu [data-dados]').first().click(); await page.waitForSelector('#form-dados'); },
  'menu-da-conta': async page => { await page.locator('#btn-menu-conta').click(); },
  'dialogo-agendar': async page => { await aba(page, 'esc'); await page.locator('#btn-agendar').click(); await page.waitForSelector('#dlg-agendar[open]'); },
  'dialogo-do-painel': async page => { await aba(page, 'esc'); await page.locator('#s-esc [data-tl="painel"]').click(); await page.locator('[data-fids="configurar"]').click(); await page.waitForSelector('#dlg-painel[open]'); },
  manual: async page => { await page.locator('#btn-manual').click(); }
};

// Cada grupo: um contexto, uma entrada (como o app abre) e, nele, as larguras e o que é aberto
function grupos() {
  const lista = [];
  const telas = ABAS.map(a => [`aba-${a}`, page => aba(page, a)]);
  // Os dados pessoais só aparecem no modo compartilhado (a conta do Operador): no grupo dele
  const detalhes = Object.entries(DETALHES).filter(([nome]) => nome !== 'dados-pessoais');
  lista.push({ nome: 'local-operador-claro', contexto: 'claro', entrada: 'local', larguras: LARGURAS, telas: [...telas, ...detalhes], pares: true });
  for (const c of ['escuro', 'escuro-do-sistema', 'toque', 'cores-forcadas', 'movimento-reduzido']) {
    lista.push({ nome: `local-operador-${c}`, contexto: c, entrada: 'local', larguras: [390, 1029, 1400], telas: c === 'escuro' ? [...telas, ...detalhes] : telas });
  }
  // Na impressão só a Escala vai para o papel (sem as abas para clicar): o app abre nela
  lista.push({ nome: 'local-operador-impressao', contexto: 'impressao', entrada: 'local', larguras: [390, 1029, 1400], telas: [['aba-esc', async () => {}]] });
  lista.push({ nome: 'local-gestor-claro', contexto: 'claro', entrada: 'local-gestor', larguras: [390, 1400], telas });
  lista.push({ nome: 'compartilhado-operador-claro', contexto: 'claro', entrada: 'operador', larguras: [390, 1400], telas: [...telas, ['dados-pessoais', DETALHES['dados-pessoais']]] });
  lista.push({ nome: 'compartilhado-secretaria-claro', contexto: 'claro', entrada: 'secretaria', larguras: [390, 1400], telas: ABAS_DA_SECRETARIA.map(a => [`aba-${a}`, page => aba(page, a)]) });
  lista.push({ nome: 'login', contexto: 'claro', entrada: 'login', larguras: [320, 390, 1400], telas: [['login', async () => {}]] });
  lista.push({ nome: 'login-escuro', contexto: 'escuro', entrada: 'login', larguras: [390, 1400], telas: [['login', async () => {}]] });
  for (const c of ['claro', 'escuro', 'cores-forcadas']) {
    lista.push({ nome: `tv-${c}`, contexto: c, entrada: 'tv', larguras: c === 'claro' ? LARGURAS : [1029, 1600], telas: [['painel', async () => {}]] });
  }
  return lista;
}

// Como o app abre em cada entrada: o modo local (o estado sintético com a demanda de exemplo), o modo compartilhado (o
// servidor falso dos testes, com a conta), o login, e a TV (painel.html, com o dia gravado neste navegador)
async function abrirEntrada(contexto, entrada) {
  const estado = comExemplo(estadoSintetico());
  if (entrada === 'local' || entrada === 'local-gestor') {
    await contexto.addInitScript(json => { if (!localStorage.getItem('acpm3')) localStorage.setItem('acpm3', json); }, JSON.stringify(estado));
    const page = await pagina(contexto);
    await page.goto(`${BASE}${entrada === 'local-gestor' ? '?role=gestor' : ''}`);
    await pronto(page);
    return page;
  }
  if (entrada === 'tv') {
    const { documentos, dias } = documentosAtuais(estado, '2026-11-10');
    await contexto.addInitScript(([cadastro, dia]) => { localStorage.setItem('acpm4_cadastro', cadastro); localStorage.setItem('acpm4_dia_2026-11-10', dia); }, [JSON.stringify(documentos.cadastro), JSON.stringify(dias['2026-11-10'])]);
    const page = await pagina(contexto);
    await page.goto(`${BASE}painel.html`);
    await page.waitForSelector('.fids', { timeout: 60000 });
    return page;
  }
  const { documentos, dias } = documentosAtuais(estado, '2026-11-11');
  const falso = criarSupabaseFalso({ documentos, dias });
  await falso.instalar(contexto);
  const page = await pagina(contexto);
  await page.goto(`${BASE}?supabase=teste`);
  await page.waitForSelector('#login-email');
  if (entrada === 'login') return page;
  const conta = CONTAS[entrada];
  await page.locator('#login-email').fill(conta.email);
  await page.locator('#login-senha').fill(conta.senha);
  await page.locator('#btn-entrar').click();
  await pronto(page);
  return page;
}

// ---------- A medição ----------
const so = opcao('--so');
const resultado = { raiz: RAIZ, propriedades: null, estados: {}, livro: [], pares: [] };
const pares = new Set();
const navegador = await chromium.launch();
try {
  for (const grupo of grupos()) {
    if (so && !grupo.telas.some(([tela]) => grupo.larguras.some(l => `${grupo.nome}|${l}|${tela}`.includes(so)))) continue;
    const contexto = await novoContexto(navegador, CONTEXTOS[grupo.contexto]);
    try {
      let page = await abrirEntrada(contexto, grupo.entrada);
      const endereco = page.url();
      const esperar = p => (grupo.entrada === 'tv' ? p.waitForSelector('.fids', { timeout: 60000 })
        : grupo.entrada === 'login' ? p.waitForSelector('#login-email') : pronto(p));
      if (!resultado.livro.length && grupo.entrada === 'local') resultado.livro = (await page.evaluate(livroNaPagina)).sort();
      if (!resultado.propriedades) {
        const doApp = grupo.entrada === 'local' ? page : await (async () => { const p = await pagina(contexto); await p.goto(BASE); await pronto(p).catch(() => {}); return p; })();
        resultado.propriedades = await doApp.evaluate(propriedadesNaPagina);
        if (doApp !== page) await doApp.close();
      }
      for (const [tela, abrirTela] of grupo.telas) {
        for (const largura of grupo.larguras) {
          const nome = `${grupo.nome}|${largura}|${tela}`;
          if (so && !nome.includes(so)) continue;
          // Cada tela a partir da página recarregada: o que outra tela abriu (uma gaveta, um diálogo) não fica. Uma
          // página que não abre (a máquina lenta) é trocada por outra, uma vez
          let falhou = null;
          for (let tentativa = 1; ; tentativa++) {
            try {
              await page.setViewportSize({ width: largura, height: 900 });
              await page.reload();
              await esperar(page);
              await abrirTela(page);
              await quieto(page);
              break;
            } catch (erro) {
              if (tentativa > 1) { falhou = erro.message.split('\n')[0]; break; }
              process.stderr.write(`${nome}: de novo, numa página nova (${erro.message.split('\n')[0]})\n`);
              await page.close().catch(() => {});
              page = await pagina(contexto);
              await page.goto(endereco);
            }
          }
          // O estado que não abriu nem na segunda vez fica marcado (a comparação o lista), e o censo continua
          if (falhou) {
            resultado.estados[nome] = `ERRO: ${falhou}`;
            process.stderr.write(`${nome}: não abriu (${falhou})\n`);
            continue;
          }
          const t0 = Date.now();
          resultado.estados[nome] = await page.evaluate(medirNaPagina, [resultado.propriedades]);
          if (args.includes('--detalhe')) resultado.detalhe = { ...(resultado.detalhe || {}), [nome]: await page.evaluate(medirNaPagina, [resultado.propriedades, true]) };
          const t1 = Date.now();
          if (grupo.pares && !args.includes('--sem-pares') && [390, 1400].includes(largura)) (await page.evaluate(paresNaPagina)).forEach(p => pares.add(p));
          process.stderr.write(`${nome} (estilos ${t1 - t0} ms, pares ${Date.now() - t1} ms)\n`);
        }
      }
    } finally {
      await contexto.close();
    }
  }
} finally {
  await navegador.close();
  servidor.close();
}
resultado.pares = [...pares].sort();
const saida = opcao('--saida');
if (saida) await writeFile(saida, JSON.stringify(resultado));
for (const [nome, hash] of Object.entries(resultado.estados)) console.log(`${hash}\t${nome}`);
console.log(`${Object.keys(resultado.estados).length} estados, ${resultado.livro.length} regras no livro, ${resultado.pares.length} pares em ordem`);

// A meteorologia no pé do painel (a vista Painel da Escala, em tela cheia também, e a TV da recepção): o METAR e o TAF
// oficiais de Pampulha (SBBH) e de Confins (SBCF), pela função meteorologia do servidor (no servidor falso dos testes, a
// rota /functions/v1/meteorologia), em duas caixas lado a lado, sempre as duas, sem alternar. A cada 10 minutos, as
// mensagens novas; a busca que falha guarda as últimas, com a idade. Sem a função publicada e neste navegador (sem
// servidor): "Meteorologia indisponível", e o resto do painel igual.
import { test, expect, abrir, abrirEscala, entrar, prepararContexto, vigiarErros, preencherLogin, URL_APP } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS, METEOROLOGIA_DE_TESTE } from './supabase-falso.js';
import { runAllocationEngine } from '../../js/engine.js';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';

const HOJE = '2026-11-10';
const NOME_DA_FAIXA = 'Meteorologia: METAR e TAF de Pampulha e Confins';
const faixa = page => page.getByRole('region', { name: NOME_DA_FAIXA });
const caixa = (page, icao) => faixa(page).locator(`.meteo-estacao[data-icao="${icao}"]`);
const linhas = page => page.locator('.fids tbody tr:not(.fids-vazia):not(.fids-nada)');

// O dia de exemplo (com os voos duas vezes, em outra chave: o quadro tem mais de uma página na tela toda), gravado como
// o operador deixa, e o mesmo cadastro
function diaCheio() {
  const e = comExemplo(estadoSintetico());
  const escala = runAllocationEngine(e);
  escala.out = [...escala.out, ...escala.out.map(o => ({ ...o, fKey: o.fKey.replace(/^\d+/, n => String(Number(n) + 5000)) }))];
  const docs = documentosAtuais(e, HOJE);
  docs.dias[HOJE] = { ...docs.dias[HOJE], resultado: escala };
  return docs;
}

// Uma TV (ou um navegador) com o servidor falso; statusEsperados: as respostas de erro que o teste provoca
async function novoContexto(browser, opcoes = {}, { statusEsperados = [], viewport } = {}) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...(viewport ? { viewport } : {}) });
  await prepararContexto(context);
  const servidor = await instalarSupabaseFalso(context, { ...diaCheio(), ...opcoes });
  const page = await context.newPage();
  return { context, servidor, page, erros: vigiarErros(page, { statusEsperados }) };
}
const abrirPainelDaEscala = async page => {
  await abrirEscala(page);
  await page.locator('#s-esc [data-tl="painel"]').click();
  await expect(page.locator('#out .fids')).toBeVisible();
};
// As duas caixas lado a lado: na mesma altura, a de Pampulha à esquerda, sem se sobrepor, as duas inteiras na tela
async function ladoALado(page) {
  const [a, b] = await Promise.all([caixa(page, 'SBBH').boundingBox(), caixa(page, 'SBCF').boundingBox()]);
  const largura = page.viewportSize().width;
  expect(Math.abs(a.y - b.y), 'na mesma altura').toBeLessThan(1);
  expect(a.x + a.width, 'Pampulha à esquerda de Confins').toBeLessThanOrEqual(b.x);
  expect(a.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(largura);
}

test.describe('Meteorologia no painel', () => {
  test('na Escala: as duas estações lado a lado, com o METAR, o TAF em linhas e a hora da observação (local e Z)', async ({ browser }) => {
    const { context, servidor, page, erros } = await novoContexto(browser);
    await entrar(page, CONTAS.operador);
    await abrirPainelDaEscala(page);
    await expect(faixa(page)).toBeVisible();
    await expect(faixa(page).locator('.meteo-atualizada')).toHaveText('Atualizado às 12:00');
    await expect(caixa(page, 'SBBH').locator('.meteo-nome')).toHaveText('SBBH · Pampulha');
    await expect(caixa(page, 'SBCF').locator('.meteo-nome')).toHaveText('SBCF · Confins');
    await expect(caixa(page, 'SBBH').locator('.meteo-hora')).toHaveText('Observado às 11:00 (14:00Z)');
    await expect(caixa(page, 'SBCF').locator('.meteo-hora')).toHaveText('Observado às 12:00 (15:00Z)');
    await expect(caixa(page, 'SBBH').locator('.meteo-metar')).toHaveText(METEOROLOGIA_DE_TESTE.estacoes[0].metar);
    await expect(caixa(page, 'SBBH').locator('.meteo-sem')).toHaveText('Sem TAF em vigor');
    await expect(caixa(page, 'SBCF').locator('.meteo-metar')).toHaveText(METEOROLOGIA_DE_TESTE.estacoes[1].metar);
    expect(await caixa(page, 'SBCF').locator('.meteo-taf').innerText()).toBe([
      'TAF SBCF 100800Z 1012/1112 34005KT 7000 SCT016 TX28/1018Z TN19/1109Z',
      'BECMG 1015/1017 9999 SCT035', 'TEMPO 1018/1021 TS SCT035 FEW040CB', 'PROB30 1107/1111 2000 BR SCT002 RMK PGM'
    ].join('\n'));
    await expect(faixa(page).locator('.meteo-antigo')).toHaveCount(0);
    // Letra de máquina de escrever
    expect(await caixa(page, 'SBCF').locator('.meteo-taf').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/monospace/);
    await ladoALado(page);
    // As caixas são grupos com o nome da estação; a faixa não é uma região viva (a atualização não é anunciada)
    await expect(faixa(page).getByRole('group', { name: 'SBBH · Pampulha' })).toBeVisible();
    await expect(faixa(page).getByRole('group', { name: 'SBCF · Confins' })).toBeVisible();
    expect(await faixa(page).evaluate(el => Boolean(el.closest('[aria-live]') || el.querySelector('[aria-live], [role="alert"], [role="status"]')))).toBe(false);
    // Uma chamada, com a sessão do operador
    expect(servidor.chamadasDaMeteorologia).toEqual([{ metodo: 'GET', conta: 'operador' }]);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('as duas caixas ficam sempre à vista: o quadro troca de página, e a faixa não muda nem alterna', async ({ browser }) => {
    const { context, page, erros } = await novoContexto(browser, {}, { viewport: { width: 1280, height: 720 } });
    await page.clock.install({ time: new Date('2026-11-10T06:00:00-03:00') });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(caixa(page, 'SBCF')).toBeVisible();
    await expect(page.locator('.fids-relogio small').first()).toHaveText(/^página 1\/[2-9]$/);
    const paginas = Number(/\/(\d)/.exec(await page.locator('.fids-relogio small').first().textContent())[1]);
    // A faixa, marcada: a troca de página não a refaz
    await faixa(page).evaluate(el => { el.dataset.sonda = 'a mesma'; window.mudancasNaFaixa = 0; new MutationObserver(m => { window.mudancasNaFaixa += m.length; }).observe(el, { subtree: true, childList: true, characterData: true, attributes: true }); });
    for (const pagina of [2, paginas > 2 ? 3 : 1]) {
      await page.clock.runFor(10_000);
      await expect(page.locator('.fids-relogio small').first()).toHaveText(new RegExp(`^página ${pagina}/`));
      await expect(caixa(page, 'SBBH')).toBeVisible();
      await expect(caixa(page, 'SBCF')).toBeVisible();
      await ladoALado(page);
    }
    await expect(faixa(page)).toHaveAttribute('data-sonda', 'a mesma');
    expect(await page.evaluate(() => window.mudancasNaFaixa)).toBe(0);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a cada 10 minutos, as mensagens novas; a busca que falha guarda as últimas, com desde quando', async ({ browser }) => {
    const { context, servidor, page, erros } = await novoContexto(browser, {}, { statusEsperados: [503] });
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(faixa(page).locator('.meteo-atualizada')).toHaveText('Atualizado às 12:00');
    expect(servidor.chamadasDaMeteorologia).toHaveLength(1);
    // Antes dos 10 minutos, nenhuma busca nova
    await page.clock.runFor(9 * 60_000);
    expect(servidor.chamadasDaMeteorologia).toHaveLength(1);
    // Aos 10 minutos, a função fora do ar: as mensagens continuam, com a idade
    servidor.falhar('/functions/v1/meteorologia', 1);
    await page.clock.runFor(60_000);
    await expect(faixa(page).locator('.meteo-falha')).toHaveText('Sem atualização desde 12:00 (há 10 min)');
    await expect(caixa(page, 'SBCF').locator('.meteo-metar')).toHaveText(METEOROLOGIA_DE_TESTE.estacoes[1].metar);
    // A idade continua contando, minuto a minuto
    await page.clock.runFor(5 * 60_000);
    await expect(faixa(page).locator('.meteo-falha')).toHaveText('Sem atualização desde 12:00 (há 15 min)');
    // Aos 20 minutos, as mensagens novas (o METAR das 12:20 de Confins); a falha some
    const novas = structuredClone(METEOROLOGIA_DE_TESTE);
    novas.gerado = '2026-11-10T15:20:00.000Z';
    novas.estacoes[1] = { ...novas.estacoes[1], metar: 'SPECI SBCF 101520Z 34012KT 4000 TSRA BKN015 FEW030CB 22/20 Q1017', observado: '2026-11-10T15:20:00.000Z' };
    servidor.trocarMeteorologia(novas);
    await page.clock.runFor(5 * 60_000);
    await expect(faixa(page).locator('.meteo-atualizada')).toHaveText('Atualizado às 12:20');
    await expect(faixa(page).locator('.meteo-falha')).toHaveCount(0);
    await expect(caixa(page, 'SBCF').locator('.meteo-metar')).toHaveText(novas.estacoes[1].metar);
    await expect(caixa(page, 'SBCF').locator('.meteo-hora')).toHaveText('Observado às 12:20 (15:20Z)');
    // As que chegaram à função: a das 12:00 e a das 12:20 (a das 12:10 parou no servidor fora do ar)
    expect(servidor.chamadasDaMeteorologia).toHaveLength(2);
    // O METAR de Pampulha (14:00Z) passa dos 90 minutos às 15:30Z: a marca, só nele
    await page.clock.runFor(11 * 60_000);
    await expect(caixa(page, 'SBBH').locator('.meteo-antigo')).toHaveText('METAR antigo · há 1 h 31 min');
    await expect(caixa(page, 'SBCF').locator('.meteo-antigo')).toHaveCount(0);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('sem a função publicada: "Meteorologia indisponível", e o painel e a TV como antes', async ({ browser }) => {
    const { context, servidor, page, erros } = await novoContexto(browser, { meteorologia: null }, { statusEsperados: [404] });
    await entrar(page, CONTAS.operador);
    await abrirPainelDaEscala(page);
    await expect(faixa(page)).toHaveText('Meteorologia indisponível');
    await expect(faixa(page).locator('.meteo-estacao')).toHaveCount(0);
    await expect(page.locator('#out .fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('#out .fids tbody tr')).toHaveCount(12);
    // O resto do app segue: a Lista abre e o painel volta
    await page.locator('#s-esc [data-tl="lista"]').click();
    await expect(page.locator('#out .tabela-escala')).toBeVisible();
    // A TV também
    const tv = await context.newPage();
    const errosDaTV = vigiarErros(tv, { statusEsperados: [404] });
    await tv.goto('./painel.html?supabase=teste');
    await preencherLogin(tv, CONTAS.painel);
    await expect(linhas(tv).first()).toBeVisible();
    await expect(faixa(tv)).toHaveText('Meteorologia indisponível');
    expect(servidor.chamadasDaMeteorologia.length).toBeGreaterThanOrEqual(2);
    expect(erros).toEqual([]);
    expect(errosDaTV).toEqual([]);
    await context.close();
  });

  test('neste navegador (sem servidor): "Meteorologia indisponível", sem buscar nada', async ({ page }) => {
    const pedidos = [];
    page.on('request', r => { if (!r.url().startsWith('http://localhost')) pedidos.push(r.url()); });
    await abrir(page, { estado: comExemplo(estadoSintetico()) });
    await abrirPainelDaEscala(page);
    await expect(faixa(page)).toHaveText('Meteorologia indisponível');
    await page.goto('./painel.html');
    await expect(faixa(page)).toHaveText('Meteorologia indisponível');
    // Só as bibliotecas (o supabase-js do CDN vem nas duas páginas); nenhum servidor, nenhuma função
    expect(pedidos.filter(u => !u.startsWith('https://cdn') && !/fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([]);
  });

  test('o METAR de mais de 90 minutos: a marca "METAR antigo", com a idade; sem METAR, o aviso', async ({ browser }) => {
    const velhas = structuredClone(METEOROLOGIA_DE_TESTE);
    velhas.estacoes[0] = { ...velhas.estacoes[0], metar: 'METAR SBBH 101300Z 00000KT 9999 FEW030 24/18 Q1018', observado: '2026-11-10T13:00:00.000Z' };
    velhas.estacoes[1] = { ...velhas.estacoes[1], metar: null, observado: null };
    const { context, page, erros } = await novoContexto(browser, { meteorologia: velhas });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(caixa(page, 'SBBH').locator('.meteo-antigo')).toHaveText('METAR antigo · há 2 h 00 min');
    await expect(caixa(page, 'SBBH')).toHaveClass(/meteo-desatualizada/);
    await expect(caixa(page, 'SBCF').locator('.meteo-sem').first()).toHaveText('Sem METAR');
    await expect(caixa(page, 'SBCF').locator('.meteo-hora')).toHaveCount(0);
    await expect(caixa(page, 'SBCF').locator('.meteo-taf')).toBeVisible();
    expect(erros).toEqual([]);
    await context.close();
  });

  // No celular, as caixas ficam uma embaixo da outra, inteiras na tela (o quadro rola para o lado dentro da moldura; a
  // faixa fica parada)
  test('no celular (390 e 320 px), uma caixa embaixo da outra, sem rolar a página para o lado', async ({ browser }) => {
    const { context, page, erros } = await novoContexto(browser);
    await entrar(page, CONTAS.operador);
    await abrirPainelDaEscala(page);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await expect(caixa(page, 'SBCF')).toBeVisible();
      const [a, b] = await Promise.all([caixa(page, 'SBBH').boundingBox(), caixa(page, 'SBCF').boundingBox()]);
      expect(b.y, `${largura}: Confins embaixo de Pampulha`).toBeGreaterThanOrEqual(a.y + a.height);
      for (const c of [a, b]) {
        expect(c.x, `${largura}: a caixa na tela`).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width, `${largura}: a caixa na tela`).toBeLessThanOrEqual(largura);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${largura}: a página não rola para o lado`).toBeLessThanOrEqual(largura);
      // As mensagens quebram a linha dentro da caixa
      expect(await caixa(page, 'SBCF').locator('.meteo-taf').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      // O quadro rolado para o lado: a faixa fica no lugar
      await page.locator('#out .fids').evaluate(el => { el.scrollLeft = 400; });
      expect((await caixa(page, 'SBBH').boundingBox()).x).toBeCloseTo(a.x, 0);
      await page.locator('#out .fids').evaluate(el => { el.scrollLeft = 0; });
    }
    expect(erros).toEqual([]);
    await context.close();
  });

  // A tela toda: o quadro pagina as linhas que cabem acima da faixa (o TAF longo nas duas estações, o pior caso), na TV de
  // 1080p e de 720p, no monitor 4:3 e na tela cheia da Escala
  const LONGAS = structuredClone(METEOROLOGIA_DE_TESTE);
  LONGAS.estacoes = LONGAS.estacoes.map(e => ({
    ...e, metar: `${e.metar.split(' ').slice(0, 3).join(' ')} 34012G25KT 290V010 4000 1500SW -TSRA BR FEW008 BKN015 FEW030CB OVC080 22/20 Q1017 RERA WS R15`,
    taf: `TAF ${e.icao} 100800Z 1012/1112 34005KT 7000 SCT016 TX28/1018Z TN19/1109Z BECMG 1015/1017 9999 SCT035 TEMPO 1018/1021 4000 TSRA SCT035 FEW040CB BECMG 1022/1024 VRB03KT 8000 BKN015 PROB30 1107/1111 2000 BR SCT002 BECMG 1110/1112 9999 NSW SCT025 RMK PGM`
  }));
  const medirTela = page => page.evaluate(() => {
    const quadro = document.fullscreenElement || document.querySelector('.fids');
    const dados = [...quadro.querySelectorAll('tbody tr:not(.fids-vazia):not(.fids-nada)')];
    const meteo = quadro.querySelector('.fids-meteo').getBoundingClientRect();
    return {
      fundoDaTabela: quadro.querySelector('.fids-tabela').getBoundingClientRect().bottom,
      topoDaFaixa: meteo.top, fundoDaFaixa: meteo.bottom, altura: innerHeight,
      foraDaTela: dados.filter(tr => tr.getBoundingClientRect().bottom > meteo.top).length,
      linhas: dados.length,
      paginas: Number(/\/(\d+)/.exec(quadro.querySelector('.fids-relogio small').textContent)[1]),
      largura: document.documentElement.scrollWidth <= innerWidth
    };
  });
  const conferirTela = (m, rotulo) => {
    expect(m.fundoDaTabela, `${rotulo}: a tabela acima da faixa`).toBeLessThanOrEqual(m.topoDaFaixa + 0.5);
    expect(m.fundoDaFaixa, `${rotulo}: a faixa inteira na tela`).toBeLessThanOrEqual(m.altura + 0.5);
    expect(m.foraDaTela, `${rotulo}: nenhuma linha atrás da faixa`).toBe(0);
    expect(m.paginas, `${rotulo}: o que não cabe vai para outra página`).toBeGreaterThan(1);
    expect(m.linhas, `${rotulo}: as linhas da página`).toBeGreaterThanOrEqual(5);
    expect(m.largura, `${rotulo}: sem rolar para o lado`).toBe(true);
  };
  for (const [largura, altura] of [[1920, 1080], [1280, 720], [1024, 768]]) {
    test(`na TV de ${largura}×${altura}, o quadro pagina as linhas que cabem acima da faixa, com as duas caixas inteiras`, async ({ browser }) => {
      const { context, page, erros } = await novoContexto(browser, { meteorologia: LONGAS }, { viewport: { width: largura, height: altura } });
      await page.clock.setFixedTime(new Date('2026-11-10T06:00:00-03:00'));
      await page.goto('./painel.html?supabase=teste');
      await preencherLogin(page, CONTAS.painel);
      await expect(caixa(page, 'SBCF').locator('.meteo-taf')).toBeVisible();
      await expect(linhas(page).first()).toBeVisible();
      await ladoALado(page);
      await expect.poll(async () => { const m = await medirTela(page); return m.fundoDaTabela <= m.topoDaFaixa + 0.5 && m.foraDaTela === 0; }).toBe(true);
      conferirTela(await medirTela(page), `${largura}×${altura}`);
      expect(erros).toEqual([]);
      await context.close();
    });
  }

  test('em tela cheia na Escala: o quadro pagina acima da faixa; fora dela, volta às 12 linhas', async ({ browser }) => {
    const { context, page, erros } = await novoContexto(browser, { meteorologia: LONGAS }, { viewport: { width: 1280, height: 720 } });
    await entrar(page, CONTAS.operador, { url: `${URL_APP}&data=${HOJE}` });
    await abrirPainelDaEscala(page);
    await expect(caixa(page, 'SBCF').locator('.meteo-taf')).toBeVisible();
    await page.locator('#out [data-fids="tela-cheia"]').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect.poll(async () => { const m = await medirTela(page); return m.fundoDaTabela <= m.topoDaFaixa + 0.5 && m.foraDaTela === 0; }).toBe(true);
    conferirTela(await medirTela(page), 'tela cheia');
    await ladoALado(page);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#out .fids tbody tr')).toHaveCount(12);
    await expect(caixa(page, 'SBCF')).toBeVisible();
    expect(erros).toEqual([]);
    await context.close();
  });
});

// A TV da recepção: painel.html mostra o mesmo painel da Escala, na tela toda e sem botões, com o quadro de hoje e o
// aluno abreviado, no quadro e com as colunas da configuração do painel (sem ela, Missões com as colunas do padrão). No
// modo compartilhado, a conta da TV (perfil "painel") só vê o quadro, que ela busca de novo a cada minuto; a função do
// servidor ainda não entrega a configuração, e a TV mostra o padrão. Missões mostra também o voo cancelado.
import { test, expect, prepararContexto, vigiarErros, preencherLogin, URL_APP } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { runAllocationEngine } from '../../js/engine.js';
import { COLUNAS_DO_PAINEL } from '../../js/config-do-painel.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';

const TODAS_AS_COLUNAS = COLUNAS_DO_PAINEL.map(c => ({ id: c.id, on: true }));
const PADRAO = ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor', 'Missão'];

const HOJE = '2026-11-10';
const MANHA = new Date('2026-11-10T08:00:00-03:00');
// Hoje: Maria às 08:20 (atrasada para 08:50) e João às 10:10 (cancelado por "Outro", com um texto que a TV não mostra)
function estado() {
  const e = cenario({
    ins: [instrutor(1, 9), instrutor(2, 9)],
    stu: [aluno(1000, { p1: 500, p2: -1 }, { nm: 'Maria Silva Santos' }), aluno(1001, { p1: 610, p2: -1 }, { nm: 'João' })],
    fStatus: { '1000_0_1': 'Atrasado', '1001_0_1': 'Cancelado' }
  });
  e.fObs = { '1000_0_1': { novoInicio: 530 }, '1001_0_1': { motivo: 'Outro', texto: 'Aluno com febre' } };
  return e;
}
// Os documentos de hoje com a escala gravada (como o operador deixa) e, quando há, a configuração do painel
function documentosDeHoje(painel = null) {
  const e = { ...estado(), ...(painel ? { painel } : {}) };
  const docs = documentosAtuais(e, HOJE);
  docs.dias[HOJE] = { ...docs.dias[HOJE], fObs: e.fObs, resultado: runAllocationEngine(e) };
  return docs;
}
// Um dia cheio: os voos do dia de exemplo duas vezes (cada cópia com outra chave), com os nomes compridos, e, quando há,
// a configuração do painel
function diaCheio(painel = null) {
  const e = comExemplo(estadoSintetico());
  e.ins = e.ins.map(i => ({ ...i, nm: `${i.nm} Albuquerque Vasconcelos` }));
  e.stu = e.stu.map(s => ({ ...s, nm: `Bartolomeu ${s.nm} Figueiredo` }));
  if (painel) e.painel = painel;
  const escala = runAllocationEngine(e);
  escala.out = [...escala.out, ...escala.out.map(o => ({ ...o, fKey: o.fKey.replace(/^\d+/, n => String(Number(n) + 5000)) }))];
  const docs = documentosAtuais(e, HOJE);
  docs.dias[HOJE] = { ...docs.dias[HOJE], resultado: escala };
  return docs;
}
const linhas = page => page.locator('.fids tbody tr:not(.fids-vazia):not(.fids-nada)');
// Os documentos neste navegador, como o app grava
async function gravarNesteNavegador(page, { documentos, dias }) {
  await page.addInitScript(([cadastro, dia]) => {
    localStorage.setItem('acpm4_cadastro', cadastro);
    localStorage.setItem('acpm4_dia_2026-11-10', dia);
  }, [JSON.stringify(documentos.cadastro), JSON.stringify(dias[HOJE])]);
}

test.describe('TV da recepção', () => {
  test('neste navegador: o painel de hoje na tela toda, sem botões, com o aluno abreviado e sem o texto do motivo', async ({ page }) => {
    // Configurado para Partidas e chegadas, com todas as colunas
    await gravarNesteNavegador(page, documentosDeHoje({ quadro: 'alternar', colunas: TODAS_AS_COLUNAS }));
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Partidas');
    await expect(page.locator('.fids thead th')).toHaveText([...PADRAO, 'Previsto', 'Observação']);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    await expect(linhas(page).locator('.f-obs')).toHaveText(['Atrasado', 'Cancelado · Outro']);
    await expect(linhas(page).first().locator('.f-prev')).toHaveText('08:50');
    await expect(page.locator('[data-fids]')).toHaveCount(0);
    const caixa = await page.locator('.fids').boundingBox();
    const tela = page.viewportSize();
    expect(caixa.width).toBeGreaterThanOrEqual(tela.width - 1);
    expect(caixa.height).toBeGreaterThanOrEqual(tela.height - 1);
  });

  test('sem configuração, a TV mostra Missões com as colunas do padrão: todos os voos do dia, com o cancelado', async ({ page }) => {
    await gravarNesteNavegador(page, documentosDeHoje());
    await page.clock.setFixedTime(new Date('2026-11-10T09:00:00-03:00'));
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(PADRAO);
    // O voo das 08:20, atrasado para 08:50, já decolou: no quadro de Missões, ele continua (sem partidas e chegadas), no
    // horário programado; o cancelado das 10:10 também aparece
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    await expect(linhas(page).locator('.f-hora')).toHaveText(['08:20', '10:10']);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    await expect(linhas(page).locator('td')).toHaveCount(2 * PADRAO.length);
    await expect(page.locator('.fids .f-obs, .fids .f-prev')).toHaveCount(0);
    // As linhas vazias que completam a página ocupam as colunas que estão à vista
    await expect(page.locator('.fids tr.fids-vazia td').first()).toHaveAttribute('colspan', String(PADRAO.length));
  });

  // A configuração gravada fora do formato (escrita fora do app): a TV não quebra e mostra o que vale dela
  test('com a configuração adulterada, a TV mostra o padrão (ou o que vale dela), sem erro', async ({ page }) => {
    const erros = vigiarErros(page);
    await gravarNesteNavegador(page, documentosDeHoje({ quadro: '__proto__', colunas: 'horario,aluno' }));
    await page.clock.setFixedTime(new Date('2026-11-10T07:00:00-03:00'));
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(PADRAO);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    expect(erros).toEqual([]);
  });

  test('a TV segue a configuração do painel: o quadro, as colunas e a ordem delas', async ({ page }) => {
    const colunas = [{ id: 'aluno', on: true }, { id: 'horario', on: true }, { id: 'observacao', on: true }, { id: 'missao', on: false }];
    await gravarNesteNavegador(page, documentosDeHoje({ quadro: 'partidas', colunas }));
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Partidas');
    // As colunas que a configuração não tem entram no fim, como no padrão (Previsto, desligado)
    await expect(page.locator('.fids thead th')).toHaveText(['Aluno', 'Horário', 'Observação', 'Aeronave', 'Modelo', 'Instrutor']);
    await expect(linhas(page).first().locator('td')).toHaveText(['Maria S.', '08:20', 'Atrasado', /^P[PRT]-[A-Z]{3}$/, 'C152', 'Instrutor 01']);
    await expect(page.locator('.fids tr.fids-vazia td').first()).toHaveAttribute('colspan', '6');
  });

  // Um dia cheio na tela toda: o quadro cabe na largura (com todas as colunas, em qualquer ordem, e os textos longos: o
  // embarque, a turma de Ground, os nomes compridos) e na altura (as linhas que não cabem vão para a página seguinte), na
  // TV de 1080p e de 720p e no monitor 16:10 ou 4:3 em tela cheia
  const CASOS_DA_TELA = [
    [1920, 1080, { quadro: 'partidas', colunas: [...TODAS_AS_COLUNAS].reverse() }],
    [1280, 720, null],
    [1280, 800, { quadro: 'alternar', colunas: TODAS_AS_COLUNAS }],
    [1024, 768, { quadro: 'partidas', colunas: TODAS_AS_COLUNAS }],
    [1024, 768, { quadro: 'missoes', colunas: [{ id: 'missao', on: true }, { id: 'aluno', on: true }] }]
  ];
  for (const [largura, altura, painel] of CASOS_DA_TELA) {
    test(`num dia cheio, o quadro cabe na tela de ${largura}×${altura} (${painel ? painel.quadro : 'padrão'}, ${painel ? painel.colunas.length : 6} colunas) e pagina o que não cabe`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      // 06:00: os voos das 06:30 chamam para a sala de briefing (o texto mais longo da observação)
      await page.clock.setFixedTime(new Date('2026-11-10T06:00:00-03:00'));
      await gravarNesteNavegador(page, diaCheio(painel));
      await page.goto('./painel.html');
      await expect(linhas(page).first()).toBeVisible();
      const medidas = await medirOQuadro(page);
      expect(medidas.sobra, 'cada lista na largura dela').toBeGreaterThanOrEqual(0);
      expect(medidas.tabelas, 'as listas na largura do quadro').toBeLessThanOrEqual(medidas.quadro);
      expect(medidas.topo, 'a faixa do topo na largura').toBeLessThanOrEqual(medidas.quadro);
      expect(medidas.pagina).toBeLessThanOrEqual(largura);
      expect(medidas.fundo, 'o quadro (com as linhas vazias) na altura').toBeLessThanOrEqual(altura);
      expect(medidas.foraDaTela, 'nenhuma linha fora da tela').toBe(0);
      expect(medidas.paginas, 'o que não cabe vai para outra página').toBeGreaterThan(1);
      expect(medidas.linhas).toBeGreaterThanOrEqual(8);
    });
  }

  // Pedro, 2026-11-20: na tela grande, duas listas lado a lado, umas 28 linhas de uma vez, em todos os quadros: a página
  // começa na lista da esquerda e continua na da direita, com as mesmas colunas; as letras podem diminuir, até o mínimo
  // da lista única na tela toda (60% de 2,6% da altura). Automático: duas a partir de 1.600 px de largura
  // No Automático, as duas listas só valem quando cabem com as letras no mínimo: com todas as colunas e os nomes
  // compridos do dia cheio, a TV de 1080p fica com uma lista
  const CASOS_DAS_LISTAS = [
    [1920, 1080, null, 2],
    [2560, 1440, null, 2],
    [1280, 720, null, 1],
    [1920, 1080, { quadro: 'alternar', colunas: TODAS_AS_COLUNAS }, 1],
    [1920, 1080, { quadro: 'missoes', colunas: [], listas: 'uma' }, 1],
    [1280, 720, { quadro: 'missoes', colunas: [], listas: 'duas' }, 2]
  ];
  for (const [largura, altura, painel, listas] of CASOS_DAS_LISTAS) {
    const nome = painel ? `${painel.quadro}, ${painel.colunas.length || 6} colunas, ${painel.listas || 'auto'}` : 'padrão';
    test(`na tela de ${largura}×${altura} (${nome}), ${listas === 2 ? 'duas listas lado a lado' : 'uma lista'}, sem nada fora da tela`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.clock.setFixedTime(new Date('2026-11-10T06:00:00-03:00'));
      await gravarNesteNavegador(page, diaCheio(painel));
      await page.goto('./painel.html');
      await expect(linhas(page).first()).toBeVisible();
      await expect(page.locator('.fids .fids-lista')).toHaveCount(listas);
      const medidas = await medirOQuadro(page);
      expect(medidas.sobra, 'cada lista na largura dela').toBeGreaterThanOrEqual(0);
      expect(medidas.pagina).toBeLessThanOrEqual(largura);
      expect(medidas.fundo, 'as listas (com as linhas vazias) na altura').toBeLessThanOrEqual(altura);
      expect(medidas.foraDaTela, 'nenhuma linha fora da tela').toBe(0);
      expect(medidas.letras, 'as letras no mínimo da tela toda ou maiores').toBeGreaterThanOrEqual(Math.floor(0.6 * 0.026 * altura * 100) / 100);
      // As linhas de cada lista: as mesmas da lista única na tela toda (a linha tem 5,4% da altura: 14 em qualquer tela)
      const porLista = Math.floor((altura * 0.8) / (altura * 0.054));
      expect(medidas.porLista).toEqual(Array(listas).fill(porLista));
      expect(medidas.linhas, 'a primeira página cheia').toBe(porLista * listas);
      if (listas === 2) {
        expect(medidas.linhas, 'umas 28 linhas de uma vez').toBeGreaterThanOrEqual(26);
        // As duas lado a lado, com as mesmas colunas; a da esquerda primeiro (os horários seguem da esquerda para a direita)
        expect(medidas.cabecalhos[1]).toEqual(medidas.cabecalhos[0]);
        expect(medidas.lado).toBe(true);
        expect(medidas.emOrdem, 'a página continua da esquerda na direita').toBe(true);
      }
    });
  }

  // A TV que muda de tamanho (outra resolução, a janela do navegador) refaz as listas e as linhas de cada uma
  test('a tela que muda de tamanho passa de uma lista para duas e de volta', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.setFixedTime(new Date('2026-11-10T06:00:00-03:00'));
    await gravarNesteNavegador(page, diaCheio());
    await page.goto('./painel.html');
    const listas = page.locator('.fids .fids-lista');
    await expect(listas).toHaveCount(1);
    await expect(listas.first().locator('tbody tr')).toHaveCount(14);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(listas).toHaveCount(2);
    await expect(listas.nth(1).locator('tbody tr')).toHaveCount(14);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(listas).toHaveCount(1);
  });

  // "Sempre duas listas" com o que não cabe nem com as letras no mínimo: cada lista é cortada na metade dela, sem invadir a
  // outra e sem a página rolar (no Automático, ficaria uma lista)
  test('sempre duas listas, mesmo quando não cabem: as letras no mínimo e cada lista cortada na metade dela', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.clock.setFixedTime(new Date('2026-11-10T06:00:00-03:00'));
    await gravarNesteNavegador(page, diaCheio({ quadro: 'partidas', colunas: TODAS_AS_COLUNAS, listas: 'duas' }));
    await page.goto('./painel.html');
    await expect(linhas(page).first()).toBeVisible();
    await expect(page.locator('.fids .fids-lista')).toHaveCount(2);
    const medidas = await medirOQuadro(page);
    expect(medidas.sobra, 'não cabe').toBeLessThan(0);
    expect(medidas.letras).toBeCloseTo(0.6 * 0.026 * 1080, 0);
    expect(medidas.lado, 'uma não invade a outra').toBe(true);
    expect(medidas.cortadas, 'cada lista cortada na largura dela').toBe(true);
    expect(medidas.pagina).toBeLessThanOrEqual(1920);
  });

  test('embarque: o voo no avião que sai em até 35 minutos chama para a sala de briefing; o simulador não', async ({ page }) => {
    const e = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)],
      stu: [aluno(1000, { p1: 760, p2: -1 }, { nm: 'Ana Lima' }), aluno(1001, { mis: 'Simulador', eq: 'Sim. Mono', p1: 760, p2: -1 }, { nm: 'Bruno Melo' }),
        aluno(1002, { p1: 820, p2: -1 }, { nm: 'Carla Dias' })]
    });
    const docs = documentosAtuais({ ...e, painel: { quadro: 'partidas', colunas: TODAS_AS_COLUNAS } }, HOJE);
    await gravarNesteNavegador(page, { ...docs, dias: { [HOJE]: { ...docs.dias[HOJE], resultado: runAllocationEngine(e) } } });
    await page.clock.setFixedTime(new Date('2026-11-10T12:10:00-03:00'));
    await page.goto('./painel.html');
    const linhaDe = nome => linhas(page).filter({ hasText: nome });
    await expect(linhaDe('Ana L.').locator('.f-obs')).toHaveText('EMBARQUE IMEDIATO · Sala de briefing');
    await expect(linhaDe('Ana L.')).toHaveClass(/\bfids-Embarque\b/);
    await expect(linhaDe('Bruno M.').locator('.f-obs')).toHaveText('Confirmado');
    await expect(linhaDe('Carla D.').locator('.f-obs')).toHaveText('Confirmado');
  });

  // Pedro, 2026-11-20: o quadro Missões deixa de fora o que terminou há mais de 30 minutos (o fim efetivo: o novo, no
  // atraso; o programado, no cancelado), para a primeira página ser sempre o que acontece agora e o que vem depois
  test('Missões: o voo que terminou há 29 minutos fica; o que terminou há 31 minutos sai', async ({ page }) => {
    await gravarNesteNavegador(page, documentosDeHoje());
    // Maria: 08:20 atrasada para 08:50, termina às 09:50; João: 10:10 cancelado, terminaria às 11:10
    await page.clock.install({ time: new Date('2026-11-10T10:19:00-03:00') });
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    // 10:21: Maria terminou há 31 minutos e sai (o painel confere a cada virada do minuto)
    await page.clock.runFor(2 * 60_000);
    await expect(page.locator('.fids .fids-hora')).toHaveText('10:21');
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['João']);
    // O cancelado conta do fim programado: às 11:39 (29 minutos depois) fica; às 11:41, sai
    await page.clock.runFor(78 * 60_000);
    await expect(page.locator('.fids .fids-hora')).toHaveText('11:39');
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['João']);
    await page.clock.runFor(2 * 60_000);
    await expect(page.locator('.fids .fids-hora')).toHaveText('11:41');
    await expect(linhas(page)).toHaveCount(0);
    await expect(page.locator('.fids .fids-nada')).toHaveText('Nenhuma missão');
  });

  test('sem a escala de hoje gravada, o painel avisa', async ({ page }) => {
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-nada')).toHaveText('A escala de hoje ainda não foi publicada.');
  });

  test('a conta da TV entra pela própria página, vê o quadro e o atualiza a cada minuto', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    const servidor = await instalarSupabaseFalso(context, documentosDeHoje());
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await page.clock.install({ time: new Date('2026-11-10T08:00:00-03:00') });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    // O quadro de Missões, com o voo cancelado
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    await expect(page.locator('.fids .fids-aviso')).toHaveText('');

    // O operador muda um status (o voo cancelado volta): a TV mostra na próxima busca
    const dia = structuredClone(servidor.dias.get(HOJE).conteudo);
    dia.fStatus['1001_0_1'] = 'Confirmado';
    delete dia.fObs['1001_0_1'];
    servidor.alterarDiaPorOutraPessoa(HOJE, dia);
    await page.clock.runFor(60_000);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Confirmado\b/);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    expect(erros).toEqual([]);
    await context.close();
  });

  // O perfil da TV não lê o cadastro, e a função painel_do_dia ainda não entrega a configuração do painel: com o
  // servidor, a TV mostra o padrão, mesmo com o painel configurado
  test('com o servidor, a TV mostra o padrão (Missões, com as colunas do padrão)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    await instalarSupabaseFalso(context, documentosDeHoje({ quadro: 'chegadas', colunas: TODAS_AS_COLUNAS }));
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(PADRAO);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a conta da TV que abre o app vai direto para o painel; o app não fica conectado com ela', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.painel);
    await expect(page).toHaveURL(/painel\.html\?supabase=teste$/);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    await page.goto(URL_APP);
    await expect(page.locator('#form-login')).toBeVisible();
    expect(erros).toEqual([]);
    await context.close();
  });

  // A TV fica numa tela pública. Ela só aceita a conta da TV e guarda a sessão numa chave só dela: quem usar a TV não
  // abre o app com a conta de outra pessoa
  test('outra conta não entra na TV: a página pede a conta da TV', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#login-erro')).toHaveText('Esta conta não é a da TV. Entre com a conta da TV (perfil Painel).');
    await expect(page.locator('#quadro')).toBeHidden();
    await page.reload();
    await expect(page.locator('#form-login')).toBeVisible();
    await preencherLogin(page, CONTAS.painel);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a sessão do app não vale na TV, e a da TV não abre o app', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#usuario')).toContainText(CONTAS.operador.nome);
    await page.goto('./painel.html?supabase=teste');
    await expect(page.locator('#form-login')).toBeVisible();
    await preencherLogin(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    // O app continua com a conta do operador
    await page.goto(URL_APP);
    await expect(page.locator('#usuario')).toContainText(CONTAS.operador.nome);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a TV com a sessão na chave do app continua conectada', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    // Uma TV conectada por uma versão antiga do app tem a sessão na chave do app
    await page.evaluate(() => {
      localStorage.setItem('acpm-teste', localStorage.getItem('acpm-teste-painel'));
      localStorage.removeItem('acpm-teste-painel');
    });
    await page.reload();
    await expect(linhas(page)).toHaveCount(2);
    await page.goto(URL_APP);
    await expect(page.locator('#form-login')).toBeVisible();
    expect(erros).toEqual([]);
    await context.close();
  });
});

// As medidas do quadro na tela: as listas na largura (sobra: o menor espaço livre de uma lista; negativo, ela não cabe),
// a faixa do topo, a página, o fundo, as linhas fora da tela, as linhas e as páginas, o tamanho das letras e as listas
async function medirOQuadro(page) {
  return page.evaluate(() => {
    const quadro = document.querySelector('.fids');
    const dados = [...quadro.querySelectorAll('tbody tr:not(.fids-vazia):not(.fids-nada)')];
    const listas = [...quadro.querySelectorAll('.fids-lista')];
    const tabelas = listas.map(l => l.querySelector('.fids-tabela'));
    const caixas = listas.map(l => l.getBoundingClientRect());
    const horarios = tabelas.flatMap(t => [...t.querySelectorAll('tbody tr:not(.fids-vazia):not(.fids-nada)')].map(tr => tr.querySelector('.f-hora')?.textContent ?? ''));
    return {
      sobra: Math.min(...tabelas.map(t => t.parentElement.clientWidth - t.scrollWidth)),
      tabelas: Math.round(Math.max(...caixas.map(c => c.right)) - Math.min(...caixas.map(c => c.left))),
      topo: quadro.querySelector('.fids-topo').scrollWidth,
      quadro: quadro.clientWidth,
      pagina: document.documentElement.scrollWidth,
      fundo: Math.max(...tabelas.map(t => t.getBoundingClientRect().bottom)),
      foraDaTela: dados.filter(tr => tr.getBoundingClientRect().bottom > innerHeight || tr.getBoundingClientRect().right > innerWidth + 1).length,
      linhas: dados.length,
      porLista: tabelas.map(t => t.tBodies[0].rows.length),
      paginas: Number(/\/(\d+)/.exec(quadro.querySelector('.fids-relogio small').textContent)[1]),
      letras: parseFloat(getComputedStyle(quadro.querySelector('tbody td')).fontSize),
      cabecalhos: tabelas.map(t => [...t.querySelectorAll('thead th')].map(th => th.textContent)),
      lado: caixas.length === 2 && caixas[1].left >= caixas[0].right && Math.abs(caixas[1].top - caixas[0].top) < 1,
      cortadas: listas.every(l => getComputedStyle(l).overflowX === 'hidden'),
      emOrdem: horarios.every((h, i) => i === 0 || !h || !horarios[i - 1] || horarios[i - 1] <= h)
    };
  });
}

async function novaTV(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await prepararContexto(context);
  // 08:00: os voos de hoje ainda estão no quadro Missões (ao meio-dia, eles já teriam terminado há mais de 30 minutos)
  await context.clock.setFixedTime(MANHA);
  await instalarSupabaseFalso(context, documentosDeHoje());
  const page = await context.newPage();
  return { context, page, erros: vigiarErros(page) };
}


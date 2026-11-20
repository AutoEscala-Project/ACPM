// A TV da recepção: painel.html mostra o mesmo painel da Escala, na tela toda e sem botões, com o quadro de hoje e o
// aluno abreviado, no quadro e com as colunas da configuração do painel (sem ela, Missões com as colunas do padrão). No
// modo compartilhado, a conta da TV (perfil "painel") só vê o quadro, que ela busca de novo a cada minuto, com a
// configuração do painel que a função painel_do_dia entrega (sem ela, o banco ainda sem a migração, o padrão).
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

  test('sem configuração, a TV mostra Missões com as colunas do padrão: todos os voos do dia, menos o cancelado', async ({ page }) => {
    await gravarNesteNavegador(page, documentosDeHoje());
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00-03:00'));
    await page.goto('./painel.html');
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(PADRAO);
    // O voo das 08:20, atrasado para 08:50, já passou: no quadro de Missões, ele continua (sem partidas e chegadas)
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
    await expect(linhas(page).locator('.f-hora')).toHaveText(['08:20']);
    await expect(linhas(page).locator('td')).toHaveCount(PADRAO.length);
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
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
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
  // embarque, a turma de Ground, os nomes compridos) e na altura, acima da faixa da meteorologia (as linhas que não cabem
  // vão para a página seguinte), na TV de 1080p e de 720p e no monitor 16:10 ou 4:3 em tela cheia
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
      const medidas = await page.evaluate(() => {
        const quadro = document.querySelector('.fids');
        const dados = [...quadro.querySelectorAll('tbody tr:not(.fids-vazia):not(.fids-nada)')];
        return {
          tabela: quadro.querySelector('.fids-tabela').scrollWidth,
          topo: quadro.querySelector('.fids-topo').scrollWidth,
          quadro: quadro.clientWidth,
          pagina: document.documentElement.scrollWidth,
          fundo: quadro.querySelector('.fids-tabela').getBoundingClientRect().bottom,
          faixa: quadro.querySelector('.fids-meteo').getBoundingClientRect().toJSON(),
          foraDaTela: dados.filter(tr => tr.getBoundingClientRect().bottom > innerHeight).length,
          linhas: dados.length,
          paginas: Number(/\/(\d+)/.exec(quadro.querySelector('.fids-relogio small').textContent)[1])
        };
      });
      expect(medidas.tabela, 'a tabela na largura').toBeLessThanOrEqual(medidas.quadro);
      expect(medidas.topo, 'a faixa do topo na largura').toBeLessThanOrEqual(medidas.quadro);
      expect(medidas.pagina).toBeLessThanOrEqual(largura);
      expect(medidas.fundo, 'o quadro (com as linhas vazias) na altura').toBeLessThanOrEqual(altura);
      // Neste navegador, a faixa diz "Meteorologia indisponível", no pé da tela, embaixo do quadro
      expect(medidas.fundo, 'o quadro acima da faixa da meteorologia').toBeLessThanOrEqual(medidas.faixa.top + 0.5);
      expect(medidas.faixa.bottom, 'a faixa no pé da tela').toBeCloseTo(altura, 0);
      expect(medidas.foraDaTela, 'nenhuma linha fora da tela').toBe(0);
      expect(medidas.paginas, 'o que não cabe vai para outra página').toBeGreaterThan(1);
      expect(medidas.linhas).toBeGreaterThanOrEqual(8);
    });
  }

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
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    // O quadro de Missões, sem o voo cancelado
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
    await expect(page.locator('.fids .fids-aviso')).toHaveText('');

    // O operador muda um status (o voo cancelado volta): a TV mostra na próxima busca
    const dia = structuredClone(servidor.dias.get(HOJE).conteudo);
    dia.fStatus['1001_0_1'] = 'Confirmado';
    delete dia.fObs['1001_0_1'];
    servidor.alterarDiaPorOutraPessoa(HOJE, dia);
    await page.clock.runFor(60_000);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    expect(erros).toEqual([]);
    await context.close();
  });

  // O perfil da TV não lê o cadastro: a configuração do painel vem no campo "painel" de painel_do_dia (migração
  // 20261120150000), e a TV a segue, como a Escala; a mudança do operador chega na busca seguinte
  test('com o servidor, a TV segue a configuração do painel que painel_do_dia entrega, e a mudança dela', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    const servidor = await instalarSupabaseFalso(context, documentosDeHoje({ quadro: 'partidas', colunas: TODAS_AS_COLUNAS }));
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await page.clock.install({ time: new Date('2026-11-10T07:00:00-03:00') });
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Partidas');
    await expect(page.locator('.fids thead th')).toHaveText([...PADRAO, 'Previsto', 'Observação']);
    await expect(linhas(page).locator('.f-obs')).toHaveText(['Atrasado', 'Cancelado · Outro']);
    // O operador muda a configuração: a TV segue na busca seguinte
    const cadastro = structuredClone(servidor.banco.get('cadastro').conteudo);
    cadastro.painel = { quadro: 'missoes', colunas: [{ id: 'aluno', on: true }, { id: 'horario', on: true }] };
    servidor.alterarPorOutraPessoa('cadastro', cadastro);
    await page.clock.runFor(60_000);
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(['Aluno', 'Horário', 'Aeronave', 'Modelo', 'Instrutor', 'Missão']);
    expect(erros).toEqual([]);
    await context.close();
  });

  // A configuração gravada fora do formato pela API: o servidor manda só o que vale dela, e a TV não quebra
  test('com o servidor e a configuração adulterada, a TV mostra o que vale dela, sem erro', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    await instalarSupabaseFalso(context, documentosDeHoje({ quadro: '__proto__', colunas: [{ id: 'aluno', on: 'sim' }, { id: '<img src=x>', on: true }, 'horario', { id: 'missao', on: true }] }));
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    // Missão (ligada) primeiro; Aluno, desligado; as que faltam entram no fim, como no padrão
    await expect(page.locator('.fids thead th')).toHaveText(['Missão', 'Horário', 'Aeronave', 'Modelo', 'Instrutor']);
    await expect(page.locator('.fids img[src="x"]')).toHaveCount(0);
    expect(erros).toEqual([]);
    await context.close();
  });

  // O banco ainda sem a migração (painel_do_dia sem o campo "painel"): a TV mostra o padrão, como antes, mesmo com o
  // painel configurado
  test('com o servidor ainda sem a migração, a TV mostra o padrão (Missões, com as colunas do padrão)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    await instalarSupabaseFalso(context, { ...documentosDeHoje({ quadro: 'chegadas', colunas: TODAS_AS_COLUNAS }), painelDoDiaAntigo: true });
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await page.goto('./painel.html?supabase=teste');
    await preencherLogin(page, CONTAS.painel);
    await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
    await expect(page.locator('.fids thead th')).toHaveText(PADRAO);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a conta da TV que abre o app vai direto para o painel; o app não fica conectado com ela', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.painel);
    await expect(page).toHaveURL(/painel\.html\?supabase=teste$/);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
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
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.']);
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
    await expect(linhas(page)).toHaveCount(1);
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
    await expect(linhas(page)).toHaveCount(1);
    // Uma TV conectada por uma versão antiga do app tem a sessão na chave do app
    await page.evaluate(() => {
      localStorage.setItem('acpm-teste', localStorage.getItem('acpm-teste-painel'));
      localStorage.removeItem('acpm-teste-painel');
    });
    await page.reload();
    await expect(linhas(page)).toHaveCount(1);
    await page.goto(URL_APP);
    await expect(page.locator('#form-login')).toBeVisible();
    expect(erros).toEqual([]);
    await context.close();
  });
});

async function novaTV(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await prepararContexto(context);
  await instalarSupabaseFalso(context, documentosDeHoje());
  const page = await context.newPage();
  return { context, page, erros: vigiarErros(page) };
}


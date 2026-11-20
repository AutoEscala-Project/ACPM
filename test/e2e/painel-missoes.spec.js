// O painel do dia abre no quadro Missões (todos os voos do dia, sem partidas e chegadas: ainda não há o status ao vivo),
// com as colunas Horário, Aeronave, Modelo, Aluno, Instrutor e Missão. "Configurar painel" escolhe o quadro com que o
// painel abre (e a TV mostra) e as colunas: ligadas ou não e na ordem (↑ e ↓, pelo teclado também). Cada mudança vale na
// hora, para todos, e fica no Histórico; o Gestor só vê.
import { test, expect, abrir, abrirEscala, prepararContexto, vigiarErros, entrar, AMANHA } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';
import { COLUNAS_DO_PAINEL } from '../../js/config-do-painel.js';

const PADRAO = ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor', 'Missão'];

// 06:30 atrasado para 11:00; 10:10 confirmado; 11:30 cancelado; turma de Ground às 08:20
const dia = (extra = {}) => ({
  ...cenario({
    ins: [instrutor(1, 9), instrutor(2, 9)],
    stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 610, p2: -1 }), aluno(1002, { p1: 690, p2: -1, eq: 'C172' }),
      aluno(1003, { ...GROUND_C152, p1: 500, p2: -1 }), aluno(1004, { ...GROUND_C152, p1: 500, p2: -1 })],
    fStatus: { '1000_0_1': 'Atrasado', '1002_0_1': 'Cancelado' }
  }),
  fObs: { '1000_0_1': { novoInicio: 660 }, '1002_0_1': { motivo: 'Meteorologia' } },
  criterios: { buracos: 'inva', horarios: 'fixos' },
  ...extra
});

const abrirPainel = async page => {
  await abrirEscala(page);
  await page.locator('#s-esc [data-tl="painel"]').click();
  await expect(page.locator('#out .fids')).toBeVisible();
};
const titulo = page => page.locator('#out .fids .fids-titulo');
const cabecalho = page => page.locator('#out .fids thead th');
const linhas = page => page.locator('#out .fids tbody tr:not(.fids-vazia):not(.fids-nada)');
const dialogo = page => page.locator('#dlg-painel');
const coluna = (page, rotulo) => dialogo(page).locator('.pn-coluna', { hasText: rotulo });
const ordemNoDialogo = page => dialogo(page).locator('.pn-coluna .chk');
const configurar = page => page.locator('#out [data-fids="configurar"]');
const historico = page => page.locator('#audit-log-list');
const painelGravado = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).painel);

test.describe('Painel: o quadro Missões', () => {
  test('o painel abre em Missões, o primeiro dos quadros: todos os voos do dia pelo horário, sem o cancelado', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await expect(page.locator('#out .seg [data-fids]')).toHaveText(['Missões', 'Partidas e chegadas', 'Partidas', 'Chegadas']);
    await expect(page.locator('#out [data-fids="missoes"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(titulo(page)).toHaveText('Missões');
    await expect(cabecalho(page)).toHaveText(PADRAO);
    // Pelo horário programado; a turma de Ground numa linha só; o cancelado das 11:30 não aparece
    await expect(linhas(page).locator('.f-hora')).toHaveText(['06:30', '08:20', '10:10']);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Aluno 1000', '2 alunos', 'Aluno 1001']);
    await expect(linhas(page).locator('.f-missao')).toHaveText(['Voo Local', 'Ground C152', 'Voo Local']);
    await expect(linhas(page).nth(1).locator('.f-aeronave')).toHaveText('Sala Ground');
    await expect(page.locator('#out .fids .f-obs, #out .fids .f-prev')).toHaveCount(0);
    // As linhas vazias completam a página com as colunas à vista
    await expect(page.locator('#out .fids tbody tr')).toHaveCount(12);
    await expect(page.locator('#out .fids tr.fids-vazia td').first()).toHaveAttribute('colspan', String(PADRAO.length));

    // Os outros quadros continuam, com as mesmas colunas
    await page.locator('#out [data-fids="partidas"]').click();
    await expect(titulo(page)).toHaveText('Partidas');
    await expect(linhas(page)).toHaveCount(4);
    await expect(cabecalho(page)).toHaveText(PADRAO);
    await page.locator('#out [data-fids="missoes"]').click();
    await expect(titulo(page)).toHaveText('Missões');
    await expect(page.locator('#out [data-fids="partidas"]')).toHaveAttribute('aria-pressed', 'false');
  });

  // Em tela cheia, a página tem as linhas que cabem na altura (antes, a altura da linha em vh era lida como px: a página
  // tinha mais de cem linhas e as de baixo ficavam fora da tela, sem nunca aparecer), e o quadro cabe na largura com
  // todas as colunas, em qualquer ordem
  test('em tela cheia, um dia cheio cabe na tela e pagina o que não cabe, com qualquer conjunto de colunas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.install({ time: new Date('2026-11-10T06:00:00-03:00') });
    const colunas = [...COLUNAS_DO_PAINEL].reverse().map(c => ({ id: c.id, on: true }));
    await abrir(page, { estado: { ...comExemplo(estadoSintetico()), painel: { quadro: 'missoes', colunas } } });
    await abrirPainel(page);
    await page.locator('#out [data-fids="tela-cheia"]').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    const medidas = () => page.evaluate(() => {
      const quadro = document.querySelector('#out .fids');
      const dados = [...quadro.querySelectorAll('tbody tr:not(.fids-vazia):not(.fids-nada)')];
      return {
        cabe: quadro.querySelector('.fids-tabela').scrollWidth <= quadro.clientWidth,
        fundo: quadro.querySelector('.fids-tabela').getBoundingClientRect().bottom <= quadro.querySelector('.fids-meteo').getBoundingClientRect().top + 0.5,
        foraDaTela: dados.filter(tr => tr.getBoundingClientRect().bottom > innerHeight).length,
        colunas: quadro.querySelectorAll('thead th').length,
        pagina: quadro.querySelector('.fids-relogio small').textContent
      };
    });
    await expect.poll(medidas).toEqual({ cabe: true, fundo: true, foraDaTela: 0, colunas: 8, pagina: 'página 1/2' });
    // Fora da tela cheia, a página volta às 12 linhas, e as letras ao tamanho do painel
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#out .fids tbody tr')).toHaveCount(12);
    expect(await page.locator('#out .fids').evaluate(el => el.style.getPropertyValue('--fids-ajuste'))).toBe('');
  });

  test('Missões é um quadro só: não alterna com outro', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await expect(page.locator('#out .fids .fids-relogio small').first()).toHaveText('página 1/1');
    await page.clock.runFor(25_000);
    await expect(titulo(page)).toHaveText('Missões');
  });
});

test.describe('Configurar painel', () => {
  test('liga, desliga e reordena as colunas e escolhe o quadro; cada mudança vale na hora e fica no Histórico', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await configurar(page).click();
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).getByRole('heading')).toHaveText('Configurar painel');
    // O foco vai para o quadro escolhido
    await expect(dialogo(page).getByRole('radio', { name: 'Missões' })).toBeFocused();
    await expect(ordemNoDialogo(page)).toHaveText([...PADRAO, 'Previsto', 'Observação']);
    await expect(dialogo(page).getByRole('checkbox', { name: 'Previsto' })).not.toBeChecked();
    await expect(dialogo(page).locator('#pn-padrao')).toBeDisabled();

    // Liga a Observação: o painel atrás muda na hora
    await dialogo(page).getByRole('checkbox', { name: 'Observação' }).check();
    await expect(cabecalho(page)).toHaveText([...PADRAO, 'Observação']);
    await expect(linhas(page).first().locator('.f-obs')).toHaveText('Atrasado');
    await expect(dialogo(page).locator('#pn-padrao')).toBeEnabled();

    // Pelo teclado: Missão sobe uma posição e o foco continua no botão
    const subirMissao = dialogo(page).getByRole('button', { name: 'Subir Missão' });
    await subirMissao.focus();
    await page.keyboard.press('Enter');
    await expect(cabecalho(page)).toHaveText(['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Missão', 'Instrutor', 'Observação']);
    await expect(subirMissao).toBeFocused();
    await expect(dialogo(page).locator('#pn-anuncio')).toHaveText('Missão: posição 5 de 8');
    await page.keyboard.press('Space');
    await expect(ordemNoDialogo(page)).toHaveText(['Horário', 'Aeronave', 'Modelo', 'Missão', 'Aluno', 'Instrutor', 'Previsto', 'Observação']);
    // Na ponta, o botão fica desligado; o foco passa para o outro da mesma coluna
    await expect(dialogo(page).getByRole('button', { name: 'Subir Horário' })).toBeDisabled();
    const descerObservacao = dialogo(page).getByRole('button', { name: 'Descer Observação' });
    await expect(descerObservacao).toBeDisabled();
    const descerHorario = dialogo(page).getByRole('button', { name: 'Descer Horário' });
    await descerHorario.click();
    await expect(ordemNoDialogo(page).first()).toHaveText('Aeronave');
    await dialogo(page).getByRole('button', { name: 'Subir Horário' }).click();
    await expect(dialogo(page).getByRole('button', { name: 'Descer Horário' })).toBeFocused();
    await expect(cabecalho(page)).toHaveText(['Horário', 'Aeronave', 'Modelo', 'Missão', 'Aluno', 'Instrutor', 'Observação']);

    // O quadro com que o painel abre
    await dialogo(page).getByRole('radio', { name: 'Partidas', exact: true }).check();
    await expect(titulo(page)).toHaveText('Partidas');
    await expect(page.locator('#out [data-fids="partidas"]')).toHaveAttribute('aria-pressed', 'true');

    // Fica gravado no cadastro (vale em todas as datas) e no Histórico, uma entrada por mudança
    expect(await painelGravado(page)).toEqual({
      quadro: 'partidas',
      colunas: [{ id: 'horario', on: true }, { id: 'aeronave', on: true }, { id: 'modelo', on: true }, { id: 'missao', on: true },
        { id: 'aluno', on: true }, { id: 'instrutor', on: true }, { id: 'previsto', on: false }, { id: 'observacao', on: true }]
    });
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(configurar(page)).toBeFocused();
    for (const texto of ['Painel: coluna Observação ligada', 'Painel: coluna Missão na 5ª posição', 'Painel: coluna Missão na 4ª posição',
      'Painel: coluna Horário na 2ª posição', 'Painel: coluna Horário na 1ª posição', 'Painel: abre em Partidas (antes: Missões)']) {
      await expect(historico(page)).toContainText(texto);
    }

    // Recarregada a página, o painel abre como foi configurado
    await page.reload();
    await abrirPainel(page);
    await expect(titulo(page)).toHaveText('Partidas');
    await expect(cabecalho(page)).toHaveText(['Horário', 'Aeronave', 'Modelo', 'Missão', 'Aluno', 'Instrutor', 'Observação']);

    // Voltar ao padrão: Missões, com as colunas do padrão
    await configurar(page).click();
    await dialogo(page).locator('#pn-padrao').click();
    await expect(titulo(page)).toHaveText('Missões');
    await expect(cabecalho(page)).toHaveText(PADRAO);
    await expect(ordemNoDialogo(page)).toHaveText([...PADRAO, 'Previsto', 'Observação']);
    await expect(dialogo(page).getByRole('radio', { name: 'Missões' })).toBeChecked();
    await expect(dialogo(page).locator('#pn-padrao')).toBeDisabled();
    await expect(dialogo(page).locator('#pn-fechar')).toBeFocused();
    await expect(historico(page)).toContainText('Painel: de volta ao padrão (Missões; Horário, Aeronave, Modelo, Aluno, Instrutor, Missão)');
    // O padrão não fica gravado: sem a configuração, vale o padrão
    expect(await painelGravado(page)).toBeUndefined();
    await dialogo(page).locator('#pn-fechar').click();
    await expect(dialogo(page)).toBeHidden();
    await expect(configurar(page)).toBeFocused();
  });

  test('pelo menos uma coluna fica no painel', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await configurar(page).click();
    for (const rotulo of ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor']) await dialogo(page).getByRole('checkbox', { name: rotulo }).uncheck();
    await expect(cabecalho(page)).toHaveText(['Missão']);
    await expect(page.locator('#out .fids tr.fids-vazia td').first()).toHaveAttribute('colspan', '1');
    const missao = dialogo(page).getByRole('checkbox', { name: 'Missão' });
    await missao.click();
    await expect(missao).toBeChecked();
    await expect(dialogo(page).locator('#pn-erro')).toHaveText('Pelo menos uma coluna fica no painel.');
    await expect(cabecalho(page)).toHaveText(['Missão']);
    await expect(coluna(page, 'Horário')).toHaveClass(/\bdesligada\b/);
    // A mudança seguinte apaga o aviso
    await dialogo(page).getByRole('checkbox', { name: 'Aluno' }).check();
    await expect(dialogo(page).locator('#pn-erro')).toHaveText('');
    await expect(cabecalho(page)).toHaveText(['Aluno', 'Missão']);
  });

  test('o Gestor vê a configuração sem mudar nada; os quadros continuam à mão', async ({ page }) => {
    const painel = { quadro: 'chegadas', colunas: [{ id: 'aluno', on: true }, { id: 'horario', on: true }] };
    await abrir(page, { estado: dia({ painel }), url: './?role=gestor' });
    await abrirPainel(page);
    await expect(titulo(page)).toHaveText('Chegadas');
    await expect(cabecalho(page)).toHaveText(['Aluno', 'Horário', 'Aeronave', 'Modelo', 'Instrutor', 'Missão']);
    await page.locator('#out [data-fids="missoes"]').click();
    await expect(titulo(page)).toHaveText('Missões');

    await configurar(page).click();
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).locator('#dlg-painel-nota')).toHaveText('Só o Operador e o Administrador mudam o painel.');
    await expect(dialogo(page).getByRole('radio', { name: 'Chegadas', exact: true })).toBeChecked();
    for (const campo of await dialogo(page).locator('#dlg-painel-campos input, #dlg-painel-campos button, #pn-padrao').all()) await expect(campo).toBeDisabled();
    await expect(dialogo(page).locator('#pn-fechar')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  // Esc fecha só o diálogo: o Histórico aberto embaixo continua aberto
  test('Esc fecha só o diálogo, a camada de cima', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    await configurar(page).click();
    await expect(dialogo(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(page.locator('#historico')).toBeVisible();
  });

  test('no modo compartilhado, o Administrador grava a configuração no cadastro do servidor, com o Histórico', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(dia(), AMANHA));
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await entrar(page, CONTAS.administrador);
    await abrirPainel(page);
    await configurar(page).click();
    await dialogo(page).getByRole('checkbox', { name: 'Previsto' }).check();
    await expect(cabecalho(page)).toHaveText([...PADRAO, 'Previsto']);
    await expect.poll(() => servidor.banco.get('cadastro').conteudo.painel).toEqual({
      quadro: 'missoes',
      colunas: [...['horario', 'aeronave', 'modelo', 'aluno', 'instrutor', 'missao', 'previsto'].map(id => ({ id, on: true })), { id: 'observacao', on: false }]
    });
    await expect.poll(() => servidor.historico.map(h => h.descricao)).toContain('Painel: coluna Previsto ligada');
    expect(erros).toEqual([]);
    await context.close();
  });
});

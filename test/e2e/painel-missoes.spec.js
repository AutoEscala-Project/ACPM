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
// As colunas da primeira lista (com duas listas lado a lado, a segunda tem as mesmas)
const cabecalho = page => page.locator('#out .fids .fids-lista').first().locator('thead th');
const linhas = page => page.locator('#out .fids tbody tr:not(.fids-vazia):not(.fids-nada)');
const dialogo = page => page.locator('#dlg-painel');
const coluna = (page, rotulo) => dialogo(page).locator('.pn-coluna', { hasText: rotulo });
const ordemNoDialogo = page => dialogo(page).locator('.pn-coluna .chk');
const configurar = page => page.locator('#out [data-fids="configurar"]');
const historico = page => page.locator('#audit-log-list');
const painelGravado = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).painel);

test.describe('Painel: o quadro Missões', () => {
  test('o painel abre em Missões, o primeiro dos quadros: todos os voos do dia pelo horário, com o cancelado', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await expect(page.locator('#out .seg [data-fids]')).toHaveText(['Missões', 'Partidas e chegadas', 'Partidas', 'Chegadas']);
    await expect(page.locator('#out [data-fids="missoes"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(titulo(page)).toHaveText('Missões');
    await expect(cabecalho(page)).toHaveText(PADRAO);
    // Pelo horário programado; a turma de Ground numa linha só; o cancelado das 11:30 também aparece
    await expect(linhas(page).locator('.f-hora')).toHaveText(['06:30', '08:20', '10:10', '11:30']);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Aluno 1000', '2 alunos', 'Aluno 1001', 'Aluno 1002']);
    await expect(linhas(page).locator('.f-missao')).toHaveText(['Voo Local', 'Ground C152', 'Voo Local', 'Voo Local']);
    await expect(linhas(page).nth(3)).toHaveClass(/\bfids-Cancelado\b/);
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

  // Pedro, 2026-11-20: na tela grande, duas listas lado a lado também na tela cheia da Escala (as linhas que cabem na
  // altura, em cada uma). Na página, o painel não passa de 1.280 px de largura: no Automático, uma lista
  test('na tela grande, a tela cheia da Escala tem duas listas lado a lado; na página, uma', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.clock.install({ time: new Date('2026-11-10T06:00:00-03:00') });
    await abrir(page, { estado: comExemplo(estadoSintetico()) });
    await abrirPainel(page);
    const medidas = () => page.evaluate(() => {
      const quadro = document.querySelector('#out .fids');
      const tabelas = [...quadro.querySelectorAll('.fids-tabela')];
      return {
        cabem: tabelas.every(t => t.scrollWidth <= t.parentElement.clientWidth),
        linhas: tabelas.map(t => t.tBodies[0].rows.length),
        cabecalhos: tabelas.map(t => [...t.tHead.rows[0].cells].map(th => th.textContent).join(', ')),
        fundo: Math.max(...tabelas.map(t => t.getBoundingClientRect().bottom)) <= innerHeight
      };
    });
    const padrao = PADRAO.join(', ');
    expect(await medidas()).toEqual({ cabem: true, linhas: [12], cabecalhos: [padrao], fundo: true });
    await page.locator('#out [data-fids="tela-cheia"]').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    // Em cada lista, as linhas que cabem entre o cabeçalho e a faixa da meteorologia, embaixo das duas (a folga de 4 px)
    await expect.poll(async () => (await medidas()).linhas.length).toBe(2);
    const cabem = await page.evaluate(() => {
      const quadro = document.querySelector('#out .fids');
      const cabecalho = quadro.querySelector('.fids-tabela thead').getBoundingClientRect().bottom;
      const linha = quadro.querySelector('tbody tr').getBoundingClientRect().height;
      return Math.floor((quadro.querySelector('.fids-meteo').getBoundingClientRect().top - cabecalho - 4) / linha);
    });
    expect(cabem).toBeGreaterThanOrEqual(12);
    await expect.poll(medidas).toEqual({ cabem: true, linhas: [cabem, cabem], cabecalhos: [padrao, padrao], fundo: true });
    await expect(page.locator('#out .fids .fids-relogio small')).toHaveText(/^página 1\/\d+$/);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(medidas).toEqual({ cabem: true, linhas: [12], cabecalhos: [padrao], fundo: true });
  });

  // "Sempre duas listas" na tela estreita (o celular, o tablet em pé): o painel rola de lado inteiro, como com uma lista.
  // Antes, as listas ficavam na largura da tela e a faixa do topo ia até 860 px: rolando o painel para ver a hora, o
  // quadro ficava vazio embaixo dela
  for (const [largura, altura] of [[390, 844], [768, 1024]]) {
    test(`sempre duas listas na tela de ${largura} px: as listas vão até o fim do topo, sem um quadro vazio ao rolar`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await abrir(page, { estado: { ...comExemplo(estadoSintetico()), painel: { quadro: 'missoes', colunas: [], listas: 'duas' } } });
      await abrirPainel(page);
      await expect(page.locator('#out .fids .fids-lista')).toHaveCount(2);
      const medidas = await page.locator('#out .fids').evaluate(quadro => ({
        topo: quadro.querySelector('.fids-topo').getBoundingClientRect().width,
        listas: quadro.querySelector('.fids-listas').getBoundingClientRect().width,
        rola: quadro.scrollWidth,
        pagina: document.documentElement.scrollWidth
      }));
      expect(medidas.listas, 'as listas na largura do topo').toBeGreaterThanOrEqual(medidas.topo);
      expect(medidas.rola, 'nada além das listas').toBeLessThanOrEqual(Math.ceil(medidas.listas) + 12);
      expect(medidas.pagina, 'a página não rola de lado').toBeLessThanOrEqual(largura);
    });
  }

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
    await expect(linhas(page).locator('.f-obs')).toHaveText(['Atrasado', 'Confirmado', 'Confirmado', 'Cancelado · Meteorologia']);
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
      listas: 'auto',
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
    await expect(historico(page)).toContainText('Painel: de volta ao padrão (Missões; Horário, Aeronave, Modelo, Aluno, Instrutor, Missão; listas: Automático)');
    // O padrão não fica gravado: sem a configuração, vale o padrão
    expect(await painelGravado(page)).toBeUndefined();
    await dialogo(page).locator('#pn-fechar').click();
    await expect(dialogo(page)).toBeHidden();
    await expect(configurar(page)).toBeFocused();
  });

  // Pedro, 2026-11-20: "Listas": Automático (o padrão: duas listas lado a lado quando o painel tem pelo menos 1.600 px de
  // largura), "Sempre uma lista" e "Sempre duas listas lado a lado", nos botões de escolha como o quadro
  test('Listas: Automático, uma ou duas lado a lado, pelo teclado; vale na hora e fica no Histórico', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    const listas = page.locator('#out .fids .fids-lista');
    // A página de 1280 px: no Automático, uma lista
    await expect(listas).toHaveCount(1);
    await configurar(page).click();
    await expect(dialogo(page).getByRole('group', { name: 'Listas' }).getByRole('radio')).toHaveCount(3);
    const auto = dialogo(page).getByRole('radio', { name: 'Automático' });
    await expect(auto).toBeChecked();
    await expect(auto).toHaveAccessibleDescription(/pelo menos 1\.600 px de largura/);

    // Pelo teclado: as setas trocam a escolha, e o foco continua nela
    await auto.focus();
    await page.keyboard.press('ArrowDown');
    const uma = dialogo(page).getByRole('radio', { name: 'Sempre uma lista' });
    await expect(uma).toBeChecked();
    await expect(uma).toBeFocused();
    await expect(listas).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    const duas = dialogo(page).getByRole('radio', { name: 'Sempre duas listas lado a lado' });
    await expect(duas).toBeChecked();
    await expect(duas).toBeFocused();
    // O painel atrás muda na hora: duas listas de 12 linhas, com as mesmas colunas; os 4 voos na da esquerda
    await expect(listas).toHaveCount(2);
    for (const lista of await listas.all()) {
      await expect(lista.locator('thead th')).toHaveText(PADRAO);
      await expect(lista.locator('tbody tr')).toHaveCount(12);
    }
    await expect(listas.first().locator('tbody tr:not(.fids-vazia) .f-hora')).toHaveText(['06:30', '08:20', '10:10', '11:30']);
    await expect(listas.nth(1).locator('tbody tr:not(.fids-vazia)')).toHaveCount(0);
    await expect(listas.first().locator('caption')).toHaveText('Missões, lista 1 de 2');
    const caixas = await listas.evaluateAll(ls => ls.map(l => l.getBoundingClientRect()).map(c => [c.left, c.right, c.top]));
    expect(caixas[1][0], 'lado a lado').toBeGreaterThanOrEqual(caixas[0][1]);
    expect(caixas[1][2]).toBeCloseTo(caixas[0][2], 0);

    expect((await painelGravado(page)).listas).toBe('duas');
    await expect(historico(page)).toContainText('Painel: listas: Sempre uma lista (antes: Automático)');
    await expect(historico(page)).toContainText('Painel: listas: Sempre duas listas lado a lado (antes: Sempre uma lista)');
    await expect(dialogo(page).locator('#pn-padrao')).toBeEnabled();

    // Voltar ao padrão volta ao Automático
    await dialogo(page).locator('#pn-padrao').click();
    await expect(auto).toBeChecked();
    await expect(listas).toHaveCount(1);
    expect(await painelGravado(page)).toBeUndefined();
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
    const painel = { quadro: 'chegadas', colunas: [{ id: 'aluno', on: true }, { id: 'horario', on: true }], listas: 'duas' };
    await abrir(page, { estado: dia({ painel }), url: './?role=gestor' });
    await abrirPainel(page);
    await expect(titulo(page)).toHaveText('Chegadas');
    await expect(page.locator('#out .fids .fids-lista')).toHaveCount(2);
    await expect(cabecalho(page)).toHaveText(['Aluno', 'Horário', 'Aeronave', 'Modelo', 'Instrutor', 'Missão']);
    await page.locator('#out [data-fids="missoes"]').click();
    await expect(titulo(page)).toHaveText('Missões');

    await configurar(page).click();
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).locator('#dlg-painel-nota')).toHaveText('Só o Operador e o Administrador mudam o painel.');
    await expect(dialogo(page).getByRole('radio', { name: 'Chegadas', exact: true })).toBeChecked();
    await expect(dialogo(page).getByRole('radio', { name: 'Sempre duas listas lado a lado' })).toBeChecked();
    await expect(dialogo(page).getByRole('radio', { name: 'Sempre duas listas lado a lado' })).toBeDisabled();
    await expect(dialogo(page).getByRole('radio', { name: 'Automático' })).toBeDisabled();
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
      listas: 'auto',
      colunas: [...['horario', 'aeronave', 'modelo', 'aluno', 'instrutor', 'missao', 'previsto'].map(id => ({ id, on: true })), { id: 'observacao', on: false }]
    });
    await expect.poll(() => servidor.historico.map(h => h.descricao)).toContain('Painel: coluna Previsto ligada');
    expect(erros).toEqual([]);
    await context.close();
  });
});

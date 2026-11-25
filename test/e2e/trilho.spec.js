// O trilho (F1b): o calendário da data aberta no lugar das setas e do campo da data. Ao lado da tela a partir de 1280 px
// (por padrão), ou um painel aberto pelo botão da data; os dias (hoje, a data aberta, domingo, os pedidos de cada um), as
// teclas, "Fixar ao lado", o celular e a gaveta do Histórico à esquerda dele. Os padrões do produto, de propósito
import {
  test, expect, abrir, abrirComExemplo, entrar, preencherLogin, irPara, abrirHistorico, AMANHA, URL_APP, REGIOES, dataAberta, botaoDaData,
  rotuloDaData, trilho, diaDoCalendario, diasDoCalendario, contagemDoDia, paradasDoCalendario, escolherNoCalendario, mudarData, alvosPequenos,
  larguraDaPagina, semNome
} from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';
import { aluno } from '../helpers/montar.js';

test.use({ preferencias: false });

const pedido = (id, data, extra = {}) => ({
  id, data, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'manha', horario: null, observacao: null,
  registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null, ...extra
});
const comAluno = () => documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000)] }, AMANHA);
// As leituras dos pedidos que chegaram ao servidor: a data de uma ('11/11') ou as semanas do calendário ('01/11 a 05/12')
function leiturasDePedidos(page) {
  const lidas = [];
  const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  page.on('request', r => {
    const url = new URL(r.url());
    if (r.method() !== 'GET' || !url.pathname.endsWith('/rest/v1/solicitacoes')) return;
    const [de, ate] = url.searchParams.getAll('data').map(v => v.replace(/^(gte|lte)\./, ''));
    lidas.push(de === ate ? ddmm(de) : `${ddmm(de)} a ${ddmm(ate)}`);
  });
  return lidas;
}

test.describe('O trilho ao lado', () => {
  test('a 1280 px, o calendário fica ao lado da tela: hoje, a data aberta e o domingo', async ({ page }) => {
    await abrirComExemplo(page);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await expect(trilho(page)).toBeVisible();
    await expect(botaoDaData(page)).not.toHaveAttribute('aria-expanded');
    const [tela, lado] = await Promise.all([page.locator('main#conteudo').boundingBox(), trilho(page).boundingBox()]);
    expect(lado.x).toBeGreaterThan(tela.x + tela.width);
    await expect(page.locator('#cal-mes')).toHaveText('Novembro de 2026');
    await expect(diaDoCalendario(page, '2026-11-10')).toHaveClass(/\bhoje\b/);
    await expect(diaDoCalendario(page, AMANHA)).toHaveAttribute('aria-current', 'date');
    await expect(diaDoCalendario(page, AMANHA)).toHaveAccessibleName('quarta-feira, 11 de novembro de 2026, amanhã, data aberta');
    await expect(page.locator('#trilho-data')).toHaveText('Amanhã · quarta-feira · 11 de novembro');
    // O domingo não abre: o aviso, e a data fica
    // (aria-disabled: o Playwright não clica no que se diz desligado; quem usa o app clica e lê o aviso)
    await expect(diaDoCalendario(page, '2026-11-15')).toHaveAttribute('aria-disabled', 'true');
    await diaDoCalendario(page, '2026-11-15').click({ force: true });
    await expect(page.locator('#toast-box')).toContainText('O aeroclube não opera aos domingos: não há escala nem pedidos.');
    await expect(dataAberta(page)).toHaveAttribute('data-data', AMANHA);
    // Todos os controles com nome
    expect(await semNome(page, REGIOES.casca)).toEqual([]);
  });

  for (const largura of [1280, 1920]) {
    test(`a ${largura} px, as sete colunas cabem dentro do trilho, com os dias redondos e do mesmo tamanho`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await abrirComExemplo(page);
      const lado = await trilho(page).boundingBox();
      const dias = await diasDoCalendario(page).evaluateAll(bs => bs.map(b => b.getBoundingClientRect().toJSON()));
      expect(dias.length % 7).toBe(0);
      const primeira = dias.slice(0, 7);
      expect(new Set(primeira.map(d => Math.round(d.top))).size).toBe(1);
      for (let i = 1; i < 7; i++) expect(primeira[i].left).toBeGreaterThanOrEqual(primeira[i - 1].right);
      expect(Math.min(...dias.map(d => d.left))).toBeGreaterThanOrEqual(lado.x);
      expect(Math.max(...dias.map(d => d.right))).toBeLessThanOrEqual(lado.x + lado.width);
      expect(Math.max(...dias.map(d => d.width)) - Math.min(...dias.map(d => d.width))).toBeLessThan(1.5);
      for (const d of dias) expect(Math.abs(d.width - d.height)).toBeLessThan(1.5);
      expect(dias[0].width).toBeGreaterThanOrEqual(34);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
    });
  }

  test('um dia abre a data: a marca, o endereço, o anúncio; ao lado, o foco fica no dia', async ({ page }) => {
    await abrirComExemplo(page);
    await diaDoCalendario(page, '2026-11-12').click();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect(page).toHaveURL(/data=2026-11-12/);
    await expect(diaDoCalendario(page, '2026-11-12')).toHaveAttribute('aria-current', 'date');
    await expect(page.locator('#anuncio')).toHaveText('Data aberta: quinta-feira, 12/11');
    await expect(diaDoCalendario(page, '2026-11-12')).toBeFocused();
    await expect(rotuloDaData(page)).toHaveText('quinta-feira, 12/11', { useInnerText: true });
    await expect(page.locator('#trilho-data')).toHaveText('Quinta-feira · 12 de novembro');
  });

  test('as teclas andam pela grade, e a página do mês segue o dia', async ({ page }) => {
    await abrirComExemplo(page);
    await botaoDaData(page).click();
    await expect(diaDoCalendario(page, AMANHA)).toBeFocused();
    await expect(paradasDoCalendario(page)).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(diaDoCalendario(page, '2026-11-12')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(diaDoCalendario(page, '2026-11-19')).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect(page.locator('#cal-mes')).toHaveText('Dezembro de 2026');
    await expect(diaDoCalendario(page, '2026-12-19')).toBeFocused();
    // O número dos pedidos chega e a grade é refeita: o foco e a parada do Tab continuam no dia
    await expect(paradasDoCalendario(page)).toHaveAttribute('data-dia', '2026-12-19');
    await page.keyboard.press('Home');
    await expect(diaDoCalendario(page, '2026-12-13')).toBeFocused();
    // O domingo não abre, também pelo teclado
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-box')).toContainText('não opera aos domingos');
    await page.keyboard.press('Escape');
    await expect(botaoDaData(page)).toBeFocused();
    await expect(trilho(page)).toBeVisible();
  });

  test('a seta para um dia de outro mês já à vista não troca o mês; PageDown e PageUp vão sempre ao mês do dia', async ({ page }) => {
    await abrir(page, { url: './?data=2026-11-30' });
    await botaoDaData(page).click();
    await page.keyboard.press('ArrowRight');
    await expect(diaDoCalendario(page, '2026-12-01')).toBeFocused();
    await expect(page.locator('#cal-mes')).toHaveText('Novembro de 2026');
    // 1º de dezembro menos um mês: 1º de novembro, que já está à vista no mês dele
    await page.keyboard.press('PageUp');
    await expect(diaDoCalendario(page, '2026-11-01')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    // 2 de novembro mais um mês: 2 de dezembro está à vista na última semana de novembro, e mesmo assim o mês muda
    await page.keyboard.press('PageDown');
    await expect(diaDoCalendario(page, '2026-12-02')).toBeFocused();
    await expect(page.locator('#cal-mes')).toHaveText('Dezembro de 2026');
  });

  test('a única parada do Tab: a data aberta; sem ela à vista, hoje; sem nenhuma, o dia 1 do mês', async ({ page }) => {
    await abrir(page, { url: './?data=2026-12-16' });
    await expect(paradasDoCalendario(page)).toHaveCount(1);
    await expect(paradasDoCalendario(page)).toHaveAttribute('data-dia', '2026-12-16');
    await page.locator('#cal-mes-ant').click();
    await expect(paradasDoCalendario(page)).toHaveAttribute('data-dia', '2026-11-10');
    await page.locator('#cal-mes-ant').click();
    await expect(paradasDoCalendario(page)).toHaveAttribute('data-dia', '2026-10-01');
    await expect(paradasDoCalendario(page)).toHaveCount(1);
  });

  test('as setas do mês mudam só o mês à vista; um dia de outro mês abre a data e leva o calendário ao mês dele', async ({ page }) => {
    await abrirComExemplo(page);
    await page.locator('#cal-mes-prox').click();
    await expect(page.locator('#cal-mes')).toHaveText('Dezembro de 2026');
    await expect(dataAberta(page)).toHaveAttribute('data-data', AMANHA);
    await page.locator('#cal-mes-ant').click();
    const fora = diaDoCalendario(page, '2026-12-01');
    await expect(fora).toHaveClass(/\bfora\b/);
    await expect(fora).toHaveText(/dez/);
    await fora.click();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-12-01');
    await expect(page.locator('#cal-mes')).toHaveText('Dezembro de 2026');
    await expect(fora).not.toHaveClass(/\bfora\b/);
    await expect(fora).toBeFocused();
  });

  test('a gaveta do Histórico abre à esquerda do trilho, e a data muda com ela aberta', async ({ page }) => {
    for (const largura of [1280, 1920]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await abrirComExemplo(page);
      await abrirHistorico(page);
      const [gaveta, lado] = await Promise.all([page.locator('#historico').boundingBox(), trilho(page).boundingBox()]);
      expect(Math.abs(gaveta.x + gaveta.width - (lado.x - 12)), `${largura} px`).toBeLessThanOrEqual(1);
      await diaDoCalendario(page, '2026-11-12').click();
      await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
      await expect(page.locator('#historico')).toBeVisible();
    }
  });
});

test.describe('A data abrindo', () => {
  test('até os dados chegarem, o dia gira e a data aberta continua a de antes; depois, a data nova', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAluno());
    await entrar(page, CONTAS.operador);
    const liberar = servidor.segurarLeiturasDeDias();
    const dia = diaDoCalendario(page, '2026-11-12');
    await dia.click();
    await expect(dia).toHaveClass(/\babrindo\b/);
    await expect(dia).toHaveAttribute('aria-busy', 'true');
    await expect(dia).toHaveAccessibleName('quinta-feira, 12 de novembro de 2026, abrindo');
    expect(await dia.evaluate(b => getComputedStyle(b, '::after').animationName)).toBe('cal-girar');
    await expect(page.locator('#trilho-data')).toHaveText('Abrindo quinta-feira, 12/11…');
    await expect(dataAberta(page)).toHaveAttribute('data-data', AMANHA);
    await expect(diaDoCalendario(page, AMANHA)).toHaveAttribute('aria-current', 'date');
    await expect(rotuloDaData(page)).toContainText('11/11');
    await expect(page).toHaveURL(/data=2026-11-11/);
    // Com o movimento reduzido, o anel fica parado
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await dia.evaluate(b => getComputedStyle(b, '::after').animationName)).toBe('none');
    liberar();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect(dia).not.toHaveClass(/\babrindo\b/);
    await expect(dia).not.toHaveAttribute('aria-busy');
    await expect(page.locator('#trilho-data')).toHaveText('Quinta-feira · 12 de novembro');
    await expect(page).toHaveURL(/data=2026-11-12/);
  });

  // A data está aberta com os dados na tela: o BI do período, que chega depois, não segura o fim dela
  test('o fim da abertura não espera o BI', async ({ page, context }) => {
    await instalarSupabaseFalso(context, comAluno());
    await entrar(page, CONTAS.operador);
    let soltar;
    const espera = new Promise(resolve => { soltar = resolve; });
    await context.route(url => url.pathname.endsWith('/rest/v1/dias') && url.searchParams.getAll('data').some(v => v.startsWith('gte.')), async route => { await espera; await route.fallback(); });
    await diaDoCalendario(page, '2026-11-12').click();
    await expect(page.locator('#anuncio')).toHaveText('Data aberta: quinta-feira, 12/11');
    await expect(diaDoCalendario(page, '2026-11-12')).not.toHaveClass(/\babrindo\b/);
    soltar();
  });

  test('quem foi para um campo da tela enquanto a data abria continua nele', async ({ page, context }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    const servidor = await instalarSupabaseFalso(context, comAluno());
    await entrar(page, CONTAS.operador);
    const liberar = servidor.segurarLeiturasDeDias();
    await escolherNoCalendario(page, '2026-11-12');
    const busca = page.locator('#flt-esc-q');
    await busca.focus();
    liberar();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect(trilho(page)).toBeHidden();
    await expect(busca).toBeFocused();
  });

  test('a data que não abre: o aviso, e nada muda', async ({ page, context }) => {
    // As tentativas de novo do supabase-js demoram
    test.slow();
    const servidor = await instalarSupabaseFalso(context, comAluno());
    const outra = await context.newPage();
    const erros = [];
    outra.on('pageerror', e => erros.push(e.message));
    await entrar(outra, CONTAS.operador);
    servidor.falhar('/rest/v1/dias', 1000);
    await diaDoCalendario(outra, '2026-11-12').click();
    await expect(outra.locator('#toast-box')).toContainText('Não foi possível abrir essa data. Verifique a conexão e tente de novo.', { timeout: 15000 });
    await expect(diaDoCalendario(outra, '2026-11-12')).not.toHaveClass(/\babrindo\b/);
    await expect(dataAberta(outra)).toHaveAttribute('data-data', AMANHA);
    await expect(page.locator('body')).toBeAttached();
    await expect(outra.locator('#trilho-data')).toHaveText('Amanhã · quarta-feira · 11 de novembro');
    expect(erros).toEqual([]);
  });

  test('a data escolhida enquanto o app abre fica no lugar da abertura', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAluno());
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#usuario')).toBeVisible();
    await diaDoCalendario(page, '2026-11-13').click();
    liberar();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-13');
    await expect(diaDoCalendario(page, '2026-11-13')).toHaveAttribute('aria-current', 'date');
  });
});

test.describe('O trilho solto', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test('o botão da data abre o painel com o foco no calendário; a data aberta fecha o painel e o foco volta ao botão', async ({ page }) => {
    await abrirComExemplo(page);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    await expect(trilho(page)).toBeHidden();
    await expect(botaoDaData(page)).toHaveAttribute('aria-expanded', 'false');
    await botaoDaData(page).click();
    await expect(trilho(page)).toBeVisible();
    await expect(botaoDaData(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(diaDoCalendario(page, AMANHA)).toBeFocused();
    await diaDoCalendario(page, '2026-11-13').click();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-13');
    await expect(trilho(page)).toBeHidden();
    await expect(botaoDaData(page)).toBeFocused();
    // Nada fica guardado: abrir para olhar não fixa
    expect(await page.evaluate(() => localStorage.getItem('acpm_trilho'))).toBe(null);
  });

  test('o painel fecha no Esc (com o foco nele ou no botão da data), no ✕ e no próprio botão; ele abre no mês da data', async ({ page }) => {
    await abrirComExemplo(page);
    await botaoDaData(page).click();
    await page.keyboard.press('Escape');
    await expect(trilho(page)).toBeHidden();
    await expect(botaoDaData(page)).toBeFocused();
    await botaoDaData(page).click();
    await botaoDaData(page).focus();
    await page.keyboard.press('Escape');
    await expect(trilho(page)).toBeHidden();
    await botaoDaData(page).click();
    await page.locator('#cal-mes-prox').click();
    await page.locator('#cal-mes-prox').click();
    await expect(page.locator('#cal-mes')).toHaveText('Janeiro de 2027');
    await botaoDaData(page).click();
    await expect(trilho(page)).toBeHidden();
    await expect(botaoDaData(page)).toHaveAttribute('aria-expanded', 'false');
    await botaoDaData(page).click();
    await expect(page.locator('#cal-mes')).toHaveText('Novembro de 2026');
    await page.locator('#btn-fechar-trilho').click();
    await expect(trilho(page)).toBeHidden();
    await expect(botaoDaData(page)).toBeFocused();
    // Com o foco na tela, o Esc é da tela
    await botaoDaData(page).click();
    await page.locator('#flt-esc-q').focus();
    await page.keyboard.press('Escape');
    await expect(trilho(page)).toBeVisible();
  });

  test('o calendário tem no máximo 320 px, à esquerda, com a linha da data ao lado; no celular, embaixo', async ({ page }) => {
    await abrirComExemplo(page);
    await botaoDaData(page).click();
    const medidas = () => page.evaluate(() => {
      const r = seletor => document.querySelector(seletor).getBoundingClientRect().toJSON();
      return { cal: r('#cal'), lista: r('.trilho-avisos') };
    });
    const largo = await medidas();
    expect(largo.cal.width).toBeLessThanOrEqual(320);
    expect(largo.lista.left).toBeGreaterThanOrEqual(largo.cal.right);
    expect(largo.lista.top).toBeLessThan(largo.cal.top);
    await page.setViewportSize({ width: 720, height: 800 });
    await botaoDaData(page).click();
    expect((await medidas()).lista.left).toBeGreaterThanOrEqual((await medidas()).cal.right);
    await page.setViewportSize({ width: 640, height: 800 });
    const estreito = await medidas();
    expect(estreito.cal.width).toBeLessThanOrEqual(320);
    expect(estreito.lista.top).toBeGreaterThanOrEqual(estreito.cal.bottom);
  });

  test('"Fixar ao lado" põe o calendário ao lado e fica guardado para a largura', async ({ page }) => {
    await abrirComExemplo(page);
    await botaoDaData(page).click();
    await page.locator('#btn-fixar-trilho').click();
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await expect(page.locator('#btn-fixar-trilho')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btn-fechar-trilho')).toBeHidden();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-pronto', '1');
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    // Na largura larga, o guardado da média não vale: o padrão (ao lado)
    await page.setViewportSize({ width: 1400, height: 800 });
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await page.locator('#btn-fixar-trilho').click();
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    await expect(botaoDaData(page)).toBeFocused();
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
  });

  test('as larguras: ao lado a partir de 1280 px; "Fixar ao lado" a partir de 1024 px; o painel aberto fecha quando a classe muda', async ({ page }) => {
    const estado = async largura => {
      await page.setViewportSize({ width: largura, height: 800 });
      return page.locator('body').getAttribute('data-trilho');
    };
    await abrirComExemplo(page);
    await estado(1279);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    await estado(1280);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await estado(1279);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    // Fixado na média: ao lado a 1024 px, nunca a 1023 px
    await botaoDaData(page).click();
    await page.locator('#btn-fixar-trilho').click();
    await estado(1024);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await estado(1023);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    await botaoDaData(page).click();
    await expect(page.locator('#btn-fixar-trilho')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'aberto');
    // Dentro da classe o painel continua; mudando de classe, fecha (aqui, para o fixo da média)
    await estado(800);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'aberto');
    await estado(1024);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fixo');
    await page.locator('#btn-fixar-trilho').click();
    await botaoDaData(page).click();
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'aberto');
    await estado(1023);
    await expect(page.locator('body')).toHaveAttribute('data-trilho', 'fechado');
    await expect(botaoDaData(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('o Gestor deste navegador também muda a data, e nada é gravado', async ({ page }) => {
    await abrirComExemplo(page, { url: './?role=gestor' });
    const antes = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    await mudarData(page, '2026-11-12');
    await expect(page.locator('#s-esc h2')).toBeVisible();
    const depois = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    expect(depois).toBe(antes);
  });
});

test.describe('O trilho no celular', () => {
  for (const largura of [390, 320]) {
    test(`a ${largura} px, o painel de ponta a ponta, com dias de 44 px, sem rolar a página de lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await abrirComExemplo(page);
      await botaoDaData(page).click();
      await expect(trilho(page)).toBeVisible();
      await expect(page.locator('#btn-fixar-trilho')).toBeHidden();
      const painel = await trilho(page).boundingBox();
      expect([painel.x, painel.width]).toEqual([0, largura]);
      const dias = await diasDoCalendario(page).evaluateAll(bs => bs.map(b => b.getBoundingClientRect().toJSON()));
      for (const d of dias) {
        expect(d.width).toBeGreaterThanOrEqual(43.9);
        expect(d.height).toBeGreaterThanOrEqual(43.9);
        expect(d.left).toBeGreaterThanOrEqual(0);
        expect(d.right).toBeLessThanOrEqual(largura);
      }
      // Os dias não se sobrepõem, e os botões do alto também têm 44 px
      for (let i = 1; i < 7; i++) expect(dias[i].left).toBeGreaterThanOrEqual(dias[i - 1].right - 0.5);
      expect(await alvosPequenos(page)).toEqual([]);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      await page.locator('#btn-fechar-trilho').click();
      await expect(trilho(page)).toBeHidden();
    });
  }
});

test.describe('Os pedidos de cada dia', () => {
  test('o número de pedidos de cada dia (sem os cancelados); acima de 99, "99+"', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAluno());
    servidor.solicitacoes.push(pedido(1, AMANHA), pedido(2, AMANHA), pedido(3, '2026-11-13'), pedido(4, '2026-11-13', { cancelada_em: '2026-11-10T15:00:00.000Z' }),
      ...Array.from({ length: 100 }, (_, i) => pedido(100 + i, '2026-11-20')));
    await entrar(page, CONTAS.operador);
    await expect(contagemDoDia(page, AMANHA)).toHaveText('2');
    await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
    await expect(contagemDoDia(page, '2026-11-12')).toHaveCount(0);
    await expect(contagemDoDia(page, '2026-11-20')).toHaveText('99+');
    await expect(diaDoCalendario(page, AMANHA)).toHaveAccessibleName('quarta-feira, 11 de novembro de 2026, amanhã, data aberta: 2 pedidos');
    await expect(diaDoCalendario(page, '2026-11-20')).toHaveAccessibleName('sexta-feira, 20 de novembro de 2026: 100 pedidos');
  });

  for (const perfil of ['gestor', 'secretaria']) {
    test(`o perfil ${perfil} também vê os números`, async ({ page, context }) => {
      const servidor = await instalarSupabaseFalso(context, comAluno());
      servidor.solicitacoes.push(pedido(1, '2026-11-13'));
      await entrar(page, CONTAS[perfil]);
      await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
      await irPara(page, 'age');
      await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
    });
  }

  test('antes do login nada é pedido; depois, as semanas à vista uma vez, e de novo só ao mudar o mês, não a cada data', async ({ page, context }) => {
    await instalarSupabaseFalso(context, comAluno());
    const lidas = leiturasDePedidos(page);
    await page.goto(URL_APP);
    await expect(page.locator('#s-login')).toBeVisible();
    await page.waitForTimeout(200);
    expect(lidas).toEqual([]);
    await entrar(page, CONTAS.operador);
    await expect.poll(() => [...lidas].sort()).toEqual(['01/11 a 05/12', '11/11']);
    lidas.length = 0;
    await mudarData(page, '2026-11-12');
    await mudarData(page, '2026-11-13');
    await expect.poll(() => lidas).toContain('13/11');
    expect(lidas.filter(l => l.includes(' a '))).toEqual([]);
    await page.locator('#cal-mes-prox').click();
    await expect.poll(() => lidas.filter(l => l.includes(' a '))).toEqual(['29/11 a 02/01']);
  });

  test('a contagem que não veio deixa os dias sem número', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAluno());
    servidor.solicitacoes.push(pedido(1, '2026-11-13'));
    await context.route(url => url.pathname.endsWith('/rest/v1/solicitacoes') && url.searchParams.getAll('data').includes('gte.2026-11-01'), route => route.fulfill({ status: 200, contentType: 'application/json', body: '{' }));
    await entrar(page, CONTAS.operador);
    await expect(diaDoCalendario(page, '2026-11-13')).toBeVisible();
    await expect(contagemDoDia(page, '2026-11-13')).toHaveCount(0);
  });
});

test('sem a data no endereço, a Secretaria abre na primeira data que ainda aceita pedidos', async ({ page, context }) => {
  await context.clock.setFixedTime(new Date('2026-11-10T14:00:00-03:00'));
  await instalarSupabaseFalso(context, comAluno());
  await entrar(page, CONTAS.secretaria);
  await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
});

test('o link para um domingo abre a segunda, com o aviso', async ({ page }) => {
  await abrir(page, { url: './?data=2026-11-15' });
  await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-16');
  await expect(page.locator('#toast-box')).toContainText('O aeroclube não opera aos domingos: abrimos segunda-feira, 16/11.');
});

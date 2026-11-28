// Os horários fechados nesta data (J, N11; B: na Escala). O bloco details#fechamentos, entre a barra da Escala e a dos
// critérios, diz no resumo o que está fechado; dentro dele, "+ Fechar horários" fecha um intervalo (De, Até; "O dia todo")
// para todos os recursos ou para categorias, e o ✕ abre de novo. Na escala não aprovada, cada mudança pergunta antes
// (#dlg-refazer, F1g); na aprovada, não. A Escala, o "+ Agendar voo" e os horários de decolagem os leem; o Histórico desfaz
// (sem perguntar), e o trilho tem o aviso deles, que leva ao bloco aberto
import { test, expect, abrir, irPara, abrirEscala, lerEscala, abrirHistorico, aprovar, fecharHorarios, abrirDeNovo, abrirFechamentos, horariosFechados, resumoDosFechamentos, intervalosFechados, perguntaDoRefazer, naoRefazer, refazer, avisosDaData, alvosPequenos, semNome, larguraDaPagina, mostrarAvisos } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const estado = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [
  aluno(1000, { mis: 'Voo Local', eq: 'C152', p1: 820, p2: -1 }), aluno(1001, { mis: 'Voo Local', eq: 'C172', p1: 820, p2: -1 })] });
const inicioDe = async (page, nome) => ((await lerEscala(page)).linhas.find(l => l.includes(nome)) || '').slice(0, 5);
// Depois de uma mudança, a Lista é refeita com a escala: a leitura espera
const esperarInicio = (page, nome) => expect.poll(() => inicioDe(page, nome));
const esperarAntesDas = (page, nome, hora) => expect.poll(async () => { const i = await inicioDe(page, nome); return i !== '' && i < hora; }).toBe(true);

test.describe('Horários fechados nesta data, na Escala', () => {
  test('De 12:40 e Até 17:30 fecham a tarde: a pergunta, a lista, o resumo, o Histórico, a Escala sem eles; o ✕ e o ↶ Reverter', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirEscala(page);
    await esperarInicio(page, 'Aluno 1000').toBe('13:40');
    const bloco = horariosFechados(page);
    // O bloco fica entre a barra da Escala e a dos critérios, fechado quando nada está fechado
    expect(await page.evaluate(() => {
      const d = document.querySelector('#s-esc details#fechamentos');
      return Boolean(d) && d.previousElementSibling.matches('.bar') && d.nextElementSibling.id === 'compactacao';
    })).toBe(true);
    await expect(bloco).toHaveJSProperty('open', false);
    await expect(bloco.locator('summary')).toHaveText('Horários fechados nesta data: nenhum');
    await abrirFechamentos(page);
    await expect(bloco).toContainText('Nenhum horário fechado nesta data.');

    await fecharHorarios(page, { de: '12:40', ate: '17:30' });
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(resumoDosFechamentos(page)).toHaveText('12:40–17:30 · todos os recursos');
    await expect(page.locator('#audit-log-list')).toContainText('Horários fechados nesta data: 12:40–17:30 (todos os recursos)');
    await esperarAntesDas(page, 'Aluno 1000', '12:40');
    await esperarAntesDas(page, 'Aluno 1001', '12:40');

    await abrirDeNovo(page, 0);
    await expect(bloco).toContainText('Nenhum horário fechado nesta data.');
    await expect(resumoDosFechamentos(page)).toHaveText('nenhum');
    await esperarInicio(page, 'Aluno 1000').toBe('13:40');

    // O ↶ do Histórico desfaz sem perguntar
    await abrirHistorico(page);
    await page.locator('#audit-log-list button[data-act="rev-log"]').first().click();
    await expect(perguntaDoRefazer(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
  });

  // F1g: na escala não aprovada, cada mudança feita na Escala pergunta antes, com o que muda. Cancelar (e o Esc) não muda
  // nada: o formulário continua com o que estava, e o foco volta ao "Fechar"; o ✕ cancelado deixa o intervalo
  test('a escala não aprovada pergunta antes de cada mudança: Cancelar não muda nada; na aprovada, não pergunta', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirFechamentos(page);
    const bloco = horariosFechados(page);
    await bloco.locator('[data-act="fechar-horarios"]').click();
    const form = bloco.locator('.fechar-horarios');
    await form.locator('#fch-de').selectOption({ label: '12:40' });
    await form.locator('#fch-ate').selectOption({ label: '17:30' });
    await form.locator('[data-act="fch-fechar"]').click();
    await expect(perguntaDoRefazer(page)).toBeVisible();
    await expect(page.locator('#refazer-texto')).toHaveText('A escala de qua 11/11 não está aprovada. Com esta alteração (fecha 12:40–17:30 · todos os recursos), a escala inteira será refeita, e outros voos podem mudar de horário, de recurso ou de INVA.');
    await expect(page.locator('#refazer-cancelar')).toBeFocused();
    await naoRefazer(page);
    await expect(page.locator('#log-cnt')).toHaveText('0');
    await expect(form).toBeVisible();
    await expect(form.locator('#fch-de')).toHaveValue('760');
    await expect(form.locator('#fch-ate')).toHaveValue('1050');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeFocused();
    // O Esc na pergunta também desiste
    await form.locator('[data-act="fch-fechar"]').click();
    await expect(perguntaDoRefazer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(perguntaDoRefazer(page)).toBeHidden();
    await expect(page.locator('#log-cnt')).toHaveText('0');
    await form.locator('[data-act="fch-fechar"]').click();
    await refazer(page);
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(bloco.locator('[data-act="fechar-horarios"]')).toBeFocused();

    // O ✕: a pergunta diz o que abre de novo; Cancelar deixa o intervalo, com o foco no ✕
    await bloco.locator('[data-act="tirar-fechamento"]').click();
    await expect(page.locator('#refazer-texto')).toContainText('Com esta alteração (abre de novo 12:40–17:30 · todos os recursos)');
    await naoRefazer(page);
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(bloco.locator('[data-act="tirar-fechamento"]')).toBeFocused();
    await expect(page.locator('#log-cnt')).toHaveText('1');

    // Aprovada, nenhuma pergunta: a mudança grava na hora
    await abrirEscala(page);
    await aprovar(page);
    await abrirDeNovo(page, 0);
    await expect(perguntaDoRefazer(page)).toBeHidden();
    await expect(bloco).toContainText('Nenhum horário fechado nesta data.');
    await fecharHorarios(page, { de: '16:00', ate: '17:00' });
    await expect(intervalosFechados(page)).toHaveText(['16:00–17:00 · todos os recursos']);
  });

  test('um fechamento só do C152 deixa o C172; "O dia todo" fecha o dia inteiro', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await fecharHorarios(page, { de: '12:40', ate: '17:30', categorias: ['C152'] });
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · C152']);
    await esperarAntesDas(page, 'Aluno 1000', '12:40');
    await esperarInicio(page, 'Aluno 1001').toBe('13:40');
    await fecharHorarios(page, { diaTodo: true, categorias: ['C172'] });
    await expect(intervalosFechados(page)).toHaveText(['06:00–24:00 · C172', '12:40–17:30 · C152']);
    await expect(resumoDosFechamentos(page)).toHaveText('06:00–24:00 · C172; 12:40–17:30 · C152');
    await esperarInicio(page, 'Aluno 1001').toBe('');
  });

  // Aberto ou fechado: a data que abre com um horário fechado abre o bloco; sem nenhum, ele começa fechado. Quem só consulta
  // lê o resumo e a lista, sem "+ Fechar horários" nem o ✕
  test('a data que abre com um horário fechado abre o bloco; o Gestor lê a lista sem os botões', async ({ page }) => {
    await abrir(page, { estado: { ...estado(), fechamentos: [{ de: 760, ate: 1050 }] } });
    await abrirEscala(page);
    const bloco = horariosFechados(page);
    await expect(bloco).toHaveJSProperty('open', true);
    await expect(resumoDosFechamentos(page)).toHaveText('12:40–17:30 · todos os recursos');
    await page.locator('#role-sel').selectOption('gestor');
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(bloco.locator('[data-act="tirar-fechamento"], [data-act="fechar-horarios"]')).toHaveCount(0);
  });

  test('o formulário: a linha do que fecha muda com os campos, o Até depois do De, e Esc não grava nada e devolve o foco', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirFechamentos(page);
    const secao = horariosFechados(page);
    const abrirForm = secao.locator('[data-act="fechar-horarios"]');
    await abrirForm.focus();
    await page.keyboard.press('Enter');
    const form = secao.locator('.fechar-horarios');
    await expect(form).toBeVisible();
    await form.locator('#fch-de').selectOption({ label: '12:40' });
    await form.locator('#fch-ate').selectOption({ label: '17:30' });
    await expect(form.locator('[role="status"]')).toContainText('Fecha 4 horários do C152');
    await form.locator('input[data-cat="ground"]').check();
    await expect(form.locator('[role="status"]')).toHaveText('Fecha 4 horários da Sala Ground.');
    await form.locator('#fch-ate').selectOption({ label: '10:00' });
    await expect(form.locator('[role="status"]')).toHaveText('O Até vem depois do De.');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeHidden();
    await expect(abrirForm).toBeFocused();
    // O Esc fecha só o formulário: o bloco continua aberto
    await expect(secao).toHaveJSProperty('open', true);
    await expect(secao).toContainText('Nenhum horário fechado nesta data.');
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  // Revisão do J: o Noturno sai às 17:30, que nenhuma lista tem; 17:30–24:00 o fecha, e a linha diz isso. O pino do Noturno
  // (#97) sai quando o início dele fecha nesta data (#100, js/fixos.js): a Escala refeita fica sem ele
  test('17:30–24:00 fecha o Noturno: a linha diz "o Noturno, às 17:30", e a Escala fica sem ele', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 })] }) });
    await abrirEscala(page);
    await esperarInicio(page, 'Aluno 1000').toBe('17:30');
    await abrirFechamentos(page);
    const secao = horariosFechados(page);
    await secao.locator('[data-act="fechar-horarios"]').click();
    const form = secao.locator('.fechar-horarios');
    await form.locator('#fch-de').selectOption({ label: '17:30' });
    await form.locator('#fch-ate').selectOption({ label: '24:00' });
    await expect(form.locator('[role="status"]')).toHaveText('Fecha 1 horário do C172 (o Noturno, às 17:30).');
    await form.locator('#fch-de').selectOption({ label: '16:00' });
    await expect(form.locator('[role="status"]')).toHaveText('Fecha 1 horário do C152, 2 do C172 (com o Noturno, às 17:30), 1 do Simulador, 2 do PA-34, 1 da Sala Ground.');
    await form.locator('#fch-de').selectOption({ label: '17:30' });
    await form.locator('[data-act="fch-fechar"]').click();
    await refazer(page);
    await expect(intervalosFechados(page)).toHaveText(['17:30–24:00 · todos os recursos']);
    await esperarInicio(page, 'Aluno 1000').toBe('');
  });

  // A linha do efeito é uma região viva: o mesmo elemento recebe o texto novo (um elemento novo não seria anunciado), e o
  // foco fica no campo
  test('a linha do efeito muda no mesmo elemento, e o foco fica no campo', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirFechamentos(page);
    const secao = horariosFechados(page);
    await secao.locator('[data-act="fechar-horarios"]').click();
    const form = secao.locator('.fechar-horarios');
    await form.locator('[role="status"]').evaluate(el => { el.dataset.marca = '1'; });
    await form.locator('#fch-de').selectOption({ label: '14:00' });
    await expect(form.locator('[role="status"][data-marca="1"]')).toHaveText(/^Fecha 2 horários do C152/);
    await expect(form.locator('#fch-de')).toBeFocused();
    await form.locator('input[data-cat="ground"]').check();
    await expect(form.locator('[role="status"][data-marca="1"]')).toHaveText('Fecha 2 horários da Sala Ground.');
    await expect(form.locator('input[data-cat="ground"]')).toBeFocused();
    await form.locator('#fch-ate').selectOption({ label: '10:00' });
    await expect(form.locator('[role="status"][data-marca="1"]')).toHaveText('O Até vem depois do De.');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeDisabled();
    await form.locator('[data-act="fch-dia-todo"]').click();
    await expect(form.locator('#fch-de')).toHaveValue('360');
    await expect(form.locator('#fch-ate')).toHaveValue('1440');
    await expect(form.locator('[role="status"][data-marca="1"]')).toHaveText('Fecha 8 horários da Sala Ground.');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeEnabled();
    await expect(form.locator('[data-act="fch-dia-todo"]')).toBeFocused();
  });

  // No máximo 12 intervalos por data (revisão do J): o 13º não fecha (antes, "Fechar" o gravava e um dos outros saía sem
  // aviso); o que junta com um deles fecha
  test('com 12 intervalos fechados, o 13º separado não fecha; o que junta com um deles fecha', async ({ page }) => {
    const doze = Array.from({ length: 12 }, (_, i) => ({ de: 420 + 60 * i, ate: 430 + 60 * i }));
    await abrir(page, { estado: { ...estado(), fechamentos: doze } });
    await abrirFechamentos(page);
    const secao = horariosFechados(page);
    await expect(intervalosFechados(page)).toHaveCount(12);
    await secao.locator('[data-act="fechar-horarios"]').click();
    const form = secao.locator('.fechar-horarios');
    await form.locator('#fch-de').selectOption({ label: '06:00' });
    await form.locator('#fch-ate').selectOption({ label: '06:10' });
    await expect(form.locator('[role="status"]')).toHaveText('No máximo 12 intervalos fechados por data: abra um deles (✕) ou junte este a um que já está fechado.');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeDisabled();
    await form.locator('#fch-de').selectOption({ label: '07:00' });
    await form.locator('#fch-ate').selectOption({ label: '07:30' });
    await expect(form.locator('[data-act="fch-fechar"]')).toBeEnabled();
    await form.locator('[data-act="fch-fechar"]').click();
    await refazer(page);
    await expect(intervalosFechados(page)).toHaveCount(12);
    await expect(intervalosFechados(page).first()).toHaveText('07:00–07:30 · todos os recursos');
    await expect(intervalosFechados(page).last()).toHaveText('18:00–18:10 · todos os recursos');
  });

  // Só pelo teclado: o resumo abre o bloco (Enter), o formulário se preenche, "Fechar" e a pergunta respondem pelo teclado
  test('só pelo teclado: abrir o bloco, fechar a tarde, responder à pergunta', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirEscala(page);
    const bloco = horariosFechados(page);
    await bloco.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(bloco).toHaveJSProperty('open', true);
    await bloco.locator('[data-act="fechar-horarios"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fch-de')).toBeFocused();
    await page.locator('#fch-de').selectOption({ label: '12:40' });
    await page.locator('#fch-ate').focus();
    await page.locator('#fch-ate').selectOption({ label: '17:30' });
    await bloco.locator('[data-act="fch-fechar"]').focus();
    await page.keyboard.press('Enter');
    await expect(perguntaDoRefazer(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#refazer-salvar')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(perguntaDoRefazer(page)).toBeHidden();
    await expect(intervalosFechados(page)).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(bloco.locator('[data-act="fechar-horarios"]')).toBeFocused();
  });

  // O trilho: os horários fechados da data são um aviso (informação, sem horário); o clique leva à Escala, com o bloco
  // aberto e o foco no resumo dele
  test('o aviso "Horários fechados nesta data" no trilho leva ao bloco aberto na Escala', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await expect(avisosDaData(page, 'Horários fechados')).toHaveCount(0);
    await fecharHorarios(page, { de: '12:40', ate: '17:30' });
    const aviso = avisosDaData(page, 'Horários fechados nesta data');
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toHaveAttribute('data-gravidade', 'info');
    await expect(aviso.locator('a')).toHaveAttribute('data-aviso', 'horarios-fechados');
    await expect(aviso.locator('.aviso-titulo')).toHaveText('Horários fechados nesta data: 12:40–17:30 · todos os recursos');
    await horariosFechados(page).locator('summary').click();
    await expect(horariosFechados(page)).toHaveJSProperty('open', false);
    await irPara(page, 'rec');
    await mostrarAvisos(page);
    await aviso.locator('a').click();
    await expect(page.locator('#s-esc')).toBeVisible();
    await expect(horariosFechados(page)).toHaveJSProperty('open', true);
    await expect(horariosFechados(page).locator('summary')).toBeFocused();
  });

  for (const largura of [390, 320]) {
    test(`no celular (${largura} px): o bloco e o formulário cabem sem rolar de lado, os controles têm 44 px e nome`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await abrir(page, { estado: { ...estado(), fechamentos: [{ de: 760, ate: 1050 }] } });
      await abrirFechamentos(page);
      const secao = horariosFechados(page);
      await secao.locator('[data-act="fechar-horarios"]').click();
      const form = secao.locator('.fechar-horarios');
      await expect(form).toBeVisible();
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      for (const alvo of await secao.locator('summary, select, button').all()) {
        const caixa = await alvo.boundingBox();
        expect(caixa.height).toBeGreaterThanOrEqual(44);
      }
      expect((await alvosPequenos(page)).filter(a => /fch|fechamento|fechar-horarios|summary/.test(a))).toEqual([]);
      expect(await semNome(page, '#fechamentos')).toEqual([]);
    });
  }
});

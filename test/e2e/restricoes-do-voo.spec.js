// As restrições de um voo (G1): a gaveta "Restrições" (aside.gaveta#painel-restricoes), aberta pelo editor do voo
// (#dlg-voo) e pelo item do trilho da missão que não entrou, com o que o motor lê para encaixar o pedido: o tipo de
// recurso, o instrutor, a prioridade, o horário e a duração (as colunas que saíram da Demanda). O horário exato do pedido
// da agenda é mostrado, não editado (N14); o tipo e o horário contra as limitações do aluno avisam e pedem a confirmação; o
// INVA de "Não escalar com" fica na lista, desligado
import { test, comPrioridade, expect, abrir, abrirEscala, aprovar, lerEscala, irPara, abrirHistorico, entradasDoHistorico, larguraDaPagina, AMANHA,
  editarPelaLista, editarPeloMapa, editorDoVoo, botaoEditar, avisosDaData, vigiarErros } from './fixtures.js';
import {
  gavetaDasRestricoes, restricoesDoPedido, campoDasRestricoes, avisoDasRestricoes, confirmarRestricao, desistirDaRestricao, abrirRestricoes,
  restricoesPeloEditor, restricoesPeloTrilho, botaoDasRestricoesNoTrilho, fecharRestricoes
} from './telas/restricoes.js';
import { aluno, cenario, instrutor, apenas } from '../helpers/montar.js';

// Um C152 só (PP-LJV) e os C172: o Aluno 1000 às 06:30 e o 1001 às 08:20 no C152; o 1003, do pedido da agenda às 06:30
// (o minuto exato), fica fora: o C152 já está com o 1000
const dia = () => cenario({
  ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)],
  semAeronaves: apenas('C152', 'PP-LJV'),
  stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 }), aluno(1003, { p1: 390, p2: -1, jan: 'h390' })]
});
const diaGuardado = page => page.evaluate(d => localStorage.getItem(`acpm4_dia_${d}`), AMANHA);
const pedidoGuardado = (page, id) => page.evaluate(([d, id]) => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)).pedidos[id], [AMANHA, id]);
const linhaDe = (escala, nome) => escala.linhas.find(l => l.includes(`| ${nome} |`));

test.describe('A gaveta das restrições', () => {
  test('pelo item do trilho da missão que não entrou: o horário exato da agenda é mostrado, não editado; outro tipo encaixa o pedido', async ({ page }) => {
    const erros = vigiarErros(page);
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await expect(botaoDasRestricoesNoTrilho(page, 'Aluno 1003')).toHaveText('Restrições');
    await expect(botaoDasRestricoesNoTrilho(page, 'Aluno 1003')).toHaveAttribute('aria-label', 'Restrições: Aluno 1003');
    const campos = await restricoesPeloTrilho(page, 'Aluno 1003', 1003);
    await expect(page.locator('#painel-restricoes-titulo')).toHaveText('Restrições Aluno 1003');
    await expect(gavetaDasRestricoes(page)).toContainText('Fora da escala:');
    // O horário do pedido da agenda: o minuto, e onde ele muda; nenhuma preferência para escolher
    await expect(campos.locator('.restricao-horario')).toContainText('às 06:30');
    await expect(campos.locator('.restricao-horario')).toContainText('muda em Pedidos');
    await expect(campoDasRestricoes(page, 'p1')).toHaveCount(0);
    await expect(campoDasRestricoes(page, 'p2')).toHaveCount(0);
    await expect(campoDasRestricoes(page, 'eq')).toBeFocused();
    await campoDasRestricoes(page, 'eq').selectOption('C172');
    // O motor encaixa o pedido às 06:30, no C172: o item do trilho sai, a gaveta continua, agora com o voo
    await expect(avisosDaData(page, 'Aluno 1003')).toHaveCount(0);
    expect(linhaDe(await lerEscala(page), 'Aluno 1003')).toContain('06:30–07:30');
    await expect(gavetaDasRestricoes(page)).toContainText('Na escala: 06:30–07:30');
    expect((await pedidoGuardado(page, 1003)).jan).toBe('h390');
    await fecharRestricoes(page);
    await abrirHistorico(page);
    await expect(entradasDoHistorico(page, 'Pedido Aluno 1003: Voo Local · C172 · 1 h')).toHaveCount(1);
    expect(erros).toEqual([]);
  });

  test('pelo editor do voo: o editor fecha, a gaveta abre no primeiro campo; a 1ª preferência muda o pedido; o Esc volta o foco para o "Editar"', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await editarPelaLista(page, '1001_0_1');
    await restricoesPeloEditor(page, 1001);
    await expect(editorDoVoo(page)).toBeHidden();
    await expect(campoDasRestricoes(page, 'eq')).toBeFocused();
    await expect(gavetaDasRestricoes(page)).toContainText('Na escala: 08:20–09:20');
    await expect(gavetaDasRestricoes(page)).toContainText('o lugar, o recurso e o INVA do voo mudam no editor do voo');
    await expect(campoDasRestricoes(page, 'p1')).toHaveValue('500');
    await campoDasRestricoes(page, 'p1').focus();
    await campoDasRestricoes(page, 'p1').selectOption('760');
    await expect.poll(async () => (await pedidoGuardado(page, 1001)).p1).toBe(760);
    // O pedido sem horário exato muda pelas preferências: o motor o põe às 12:40
    expect(linhaDe(await lerEscala(page), 'Aluno 1001')).toContain('12:40–13:40');
    await expect(campoDasRestricoes(page, 'p1')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(gavetaDasRestricoes(page)).toBeHidden();
    await expect(botaoEditar(page, '1001_0_1')).toBeFocused();
  });

  test('a escala aprovada: o pedido recusado com outro tipo entra em volta dos voos aprovados, que não mudam', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    const antes = await lerEscala(page);
    await restricoesPeloTrilho(page, 'Aluno 1003', 1003);
    await campoDasRestricoes(page, 'eq').selectOption('C172');
    await expect(avisosDaData(page, 'Aluno 1003')).toHaveCount(0);
    const depois = await lerEscala(page);
    expect(linhaDe(depois, 'Aluno 1000')).toBe(linhaDe(antes, 'Aluno 1000'));
    expect(linhaDe(depois, 'Aluno 1001')).toBe(linhaDe(antes, 'Aluno 1001'));
    expect(linhaDe(depois, 'Aluno 1003')).toContain('06:30–07:30');
  });

  test('o tipo e o horário contra as limitações do aluno avisam e pedem a confirmação; o motor ainda recusa o pedido', async ({ page }) => {
    const estado = dia();
    estado.stu[1].eq = 'C172';
    estado.stu[1].limitacoes = { recursos: ['C172'], horarios: [{ de: 480, ate: 1080 }] };
    await abrir(page, { estado });
    await abrirEscala(page);
    await editarPelaLista(page, '1001_0_1');
    await restricoesPeloEditor(page, 1001);
    await expect(campoDasRestricoes(page, 'eq').locator('option')).toHaveText(['C152 (o aluno só voa no C172)', 'C172', 'PA-34 (o aluno só voa no C172)']);
    await expect(campoDasRestricoes(page, 'p1').locator('option[value="390"]')).toHaveText('06:30 (o aluno só voa das 08:00 às 18:00)');
    const guardado = await diaGuardado(page);
    // O horário fora: o aviso e a confirmação; "Manter" volta como estava, sem gravar
    await campoDasRestricoes(page, 'p1').selectOption('390');
    await expect(avisoDasRestricoes(page)).toHaveText('06:30: o aluno só voa das 08:00 às 18:00. Assim, o app não escala o pedido nesse horário; só um voo posto à mão, no editor do voo, voa assim.');
    await expect(campoDasRestricoes(page, 'p1')).toHaveAttribute('aria-describedby', 'restricoes-avisos');
    await expect(desistirDaRestricao(page)).toHaveText('Manter 08:20');
    await desistirDaRestricao(page).click();
    await expect(campoDasRestricoes(page, 'p1')).toHaveValue('500');
    await expect(avisoDasRestricoes(page)).toHaveText('');
    await expect(campoDasRestricoes(page, 'p1')).toBeFocused();
    expect(await diaGuardado(page)).toBe(guardado);
    // O tipo que ele não voa: confirmado, grava; o motor recusa o pedido, com o motivo
    await campoDasRestricoes(page, 'eq').selectOption('C152');
    await expect(avisoDasRestricoes(page)).toContainText('C152: o aluno só voa no C172.');
    expect(await diaGuardado(page)).toBe(guardado);
    await expect(confirmarRestricao(page)).toHaveText('Usar C152 mesmo assim');
    await confirmarRestricao(page).click();
    await expect.poll(async () => (await pedidoGuardado(page, 1001)).eq).toBe('C152');
    await expect(avisosDaData(page, 'o aluno só voa no C172 (o pedido está no C152)')).toHaveCount(1);
    await expect(gavetaDasRestricoes(page)).toContainText('Fora da escala: Rejeitado: o aluno só voa no C172 (o pedido está no C152).');
  });

  test('o INVA de "Não escalar com" fica na lista, desligado; o fora nesta data, com a nota', async ({ page }) => {
    const estado = dia();
    estado.stu[1].bl = [2];
    estado.ins[2].on = false;
    await abrir(page, { estado });
    await abrirEscala(page);
    await editarPelaLista(page, '1001_0_1');
    await restricoesPeloEditor(page, 1001);
    const opcoes = campoDasRestricoes(page, 'insId').locator('option');
    await expect(opcoes).toHaveText(['Automático', 'Instrutor 01', 'Instrutor 02 (em Não escalar com)', 'Instrutor 03 (fora nesta data)']);
    await expect(opcoes.nth(2)).toBeDisabled();
    await campoDasRestricoes(page, 'insId').selectOption('1');
    await expect.poll(async () => (await pedidoGuardado(page, 1001)).insId).toBe(1);
    await expect(campoDasRestricoes(page, 'insId')).toHaveClass(/\bescolhido\b/);
  });

  test('o Gestor lê as restrições como texto, pelo editor do voo', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page, { vista: 'eq' });
    await page.locator('#role-sel').selectOption('gestor');
    await editarPeloMapa(page, '1001_0_1');
    await restricoesPeloEditor(page, 1001);
    await expect(page.locator('#painel-restricoes select, #painel-restricoes input')).toHaveCount(0);
    await expect(restricoesDoPedido(page, 1001)).toContainText('Tipo de recurso');
    await expect(restricoesDoPedido(page, 1001)).toContainText('C152');
    await expect(restricoesDoPedido(page, 1001)).toContainText('1ª preferência');
    await expect(restricoesDoPedido(page, 1001)).toContainText('08:20');
    await fecharRestricoes(page);
  });

  for (const largura of [390, 320]) {
    test(`no celular (${largura} px): a gaveta ocupa a tela, sem rolar para o lado, com 44 px para o dedo`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 780 });
      await abrir(page, { estado: dia() });
      await abrirEscala(page);
      await editarPelaLista(page, '1001_0_1');
      await restricoesPeloEditor(page, 1001);
      const caixa = await gavetaDasRestricoes(page).boundingBox();
      expect(Math.round(caixa.width)).toBe(largura);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      const pequenos = await page.evaluate(() => [...document.querySelectorAll('#painel-restricoes select, #painel-restricoes input, #painel-restricoes button')]
        .filter(el => el.checkVisibility() && el.getBoundingClientRect().height < 44).map(el => el.id || el.dataset.f || el.textContent.trim()));
      expect(pequenos).toEqual([]);
    });
  }
});

test.describe('A Demanda sem as colunas das restrições', () => {
  comPrioridade('a tabela tem Aluno, Voa e Missão; "Restrições" na linha abre a gaveta, com a Prioridade', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'dem');
    await expect(page.locator('#s-dem thead th')).toHaveText(['Aluno', 'Voa', 'Missão']);
    await expect(page.locator('#dem [data-f="eq"], #dem [data-f="insId"], #dem [data-f="p1"], #dem [data-f="p2"], #dem [data-f="nb"], #dem [data-f="pr"]')).toHaveCount(0);
    await abrirRestricoes(page, 1000);
    await expect(campoDasRestricoes(page, 'pr')).toHaveValue('3');
    // A dica de cada campo fica fora do <label> (dentro dele, o botão seria o controle do rótulo, não a lista)
    await expect(page.locator('#painel-restricoes .dica-btn')).toHaveCount(5);
    await expect(page.locator('#painel-restricoes label .dica-btn')).toHaveCount(0);
    await campoDasRestricoes(page, 'pr').selectOption('1');
    await expect.poll(async () => (await pedidoGuardado(page, 1000)).pr).toBe(5);
    await campoDasRestricoes(page, 'nb').fill('1.5');
    await campoDasRestricoes(page, 'nb').press('Enter');
    await expect.poll(async () => (await pedidoGuardado(page, 1000)).nb).toBe(1.5);
    await fecharRestricoes(page);
    await expect(page.locator('#dem tr[data-k="d"][data-id="1000"] [data-act="restricoes"]')).toBeFocused();
  });
});

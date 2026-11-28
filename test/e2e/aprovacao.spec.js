// O dia de operação: "Aprovar escala" fixa os voos. Depois disso, uma alteração não tira ninguém do lugar:
// o pedido novo entra em volta, e o voo fixo que ficou impossível aparece em conflito. "Reabrir" volta ao normal.
// Em Voo, Atrasado, Pousou e Cancelado também fixam o voo.
import { test, comPrioridade, expect, abrir, abrirComExemplo, irPara, abrirEscala, lerEscala, abrirHistorico, alternarVem, aprovar, botaoAprovar, botaoReabrir, caixaVoa, reabrir, refazer, textosDaEscala, exportar } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { gerarCenario } from '../helpers/cenarios.js';
import { abrirRestricoes, campoDasRestricoes, fecharRestricoes } from './telas/restricoes.js';

const dia = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 }), aluno(1002, { fly: false, p1: 390, p2: -1 })] });
const linhas = async page => (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 100'));

test.describe('Escala aprovada', () => {
  comPrioridade('aprovar fixa os voos: o selo diz quando e quem; um pedido novo de prioridade 1 (a mais alta) não tira ninguém do lugar; reabrir volta ao normal', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const antes = await linhas(page);
    await aprovar(page);
    await expect(page.locator('#selo-aprovada')).toHaveText('Aprovada às 12:00');
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(2);

    // Pedido novo, prioridade 1 (a mais alta), no mesmo horário do primeiro voo
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    const novo = page.locator('#dem tr[data-id="1002"]');
    await caixaVoa(novo).check();
    await abrirRestricoes(page, 1002);
    await campoDasRestricoes(page, 'pr').selectOption('1');
    await fecharRestricoes(page);
    await abrirEscala(page);
    const depois = await linhas(page);
    for (const linha of antes) expect(depois).toContain(linha);
    expect(depois.some(l => l.includes('Aluno 1002'))).toBe(true);

    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Escala aprovada: 2 voos fixados');
    await page.keyboard.press('Escape');
    await reabrir(page);
    await expect(page.locator('#selo-aprovada')).toBeHidden();
    await expect(botaoAprovar(page)).toBeVisible();
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(0);
  });

  test('o instrutor que não vem mais: o voo fixo dele fica no lugar, em conflito', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    const primeiro = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    const instrutor = (await primeiro.locator('.c-instr').innerText()).trim();
    const id = instrutor.endsWith('01') ? 1 : 2;
    await irPara(page, 'ins');
    await alternarVem(page, id, false);
    await abrirEscala(page);
    // O conflito fica no trilho, com os avisos da data
    await expect(textosDaEscala(page, 'conflitos')).toHaveText([/^Aluno 1000 Conflito na escala aprovada: .*o instrutor não está disponível/]);
    await expect(primeiro).toHaveClass(/\bem-conflito\b/);
    await expect(primeiro.locator('.c-instr')).toHaveText(instrutor);
  });

  test('Em Voo fixa o voo mesmo sem aprovar', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const primeiro = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await primeiro.locator('.st-sel').selectOption('Em Voo');
    await refazer(page);
    await expect(primeiro.locator('.fixo')).toHaveCount(1);
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(1);
  });

  test('no Gestor, o selo aparece e os botões não', async ({ page }) => {
    const estado = { ...dia(), fixos: { '1000_0_1': { a: 390, b: 450, r: 'PP-LJV', insId: 1 } }, aprovacao: { em: '2026-11-10T21:05:00.000Z', por: 'Operador 01' } };
    await abrir(page, { estado, url: './?role=gestor' });
    await abrirEscala(page);
    await expect(page.locator('#selo-aprovada')).toHaveText('Aprovada às 18:05 por Operador 01');
    await expect(botaoReabrir(page)).toBeHidden();
  });
});

test.describe('O cadeado do voo', () => {
  const linha = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });

  test('fora da escala aprovada, Em Voo fixa o voo e Confirmado o solta; o cadeado diz por quê', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Em Voo');
    await refazer(page);
    const cadeado = linha(page, 'Aluno 1000').locator('.fixo');
    await expect(cadeado).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Confirmado');
    await refazer(page);
    await expect(cadeado).toHaveCount(0);
  });

  test('Reabrir mantém fixo o voo em andamento', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await expect(linha(page, 'Aluno 1001').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: escala aprovada');
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Em Voo');
    await reabrir(page);
    await expect(linha(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');
    await expect(linha(page, 'Aluno 1001').locator('.fixo')).toHaveCount(0);
  });
});

// O foco depois de aprovar e de reabrir (vindo de acessibilidade.spec.js)
test.describe('O foco depois de uma ação', () => {
  test('aprovar a escala leva o foco ao Reabrir, e reabrir, ao Aprovar', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await aprovar(page);
    await expect(botaoReabrir(page)).toBeFocused();
    await reabrir(page);
    await expect(botaoAprovar(page)).toBeFocused();
  });
});

// O H: as exportações registradas (d31, d32) e a reabertura registrada (d33). O que o dia gravado guarda
const diaGravado = page => page.evaluate(() => {
  const chave = Object.keys(localStorage).find(k => k.startsWith('acpm4_dia_'));
  return chave ? JSON.parse(localStorage.getItem(chave)) : null;
});
const situacao = page => page.locator('#exportacoes-situacao');

test.describe('As exportações e a reabertura registradas', () => {
  test('exportar o CSV o registra (quando, quem e a impressão): "Exportada", também depois de recarregar; a escala mudada a deixa desatualizada', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await expect(situacao(page)).toHaveCount(0);
    await exportar(page, 'csv');
    await expect(situacao(page)).toHaveText('Exportada');
    const gravado = await diaGravado(page);
    expect(Object.keys(gravado.exportacoes)).toEqual(['csv']);
    expect(gravado.exportacoes.csv.impressao).toMatch(/^[0-9a-f]{8}$/);
    await page.reload();
    await abrirEscala(page);
    await expect(situacao(page)).toHaveText('Exportada');

    // O instrutor do Aluno 1000 não vem mais: o voo muda de instrutor, e o CSV exportado ficou para trás
    const instrutor = (await page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' }).locator('.c-instr').innerText()).trim();
    await irPara(page, 'ins');
    await alternarVem(page, instrutor.endsWith('01') ? 1 : 2, false);
    await abrirEscala(page);
    await expect(situacao(page)).toHaveText('A escala mudou depois da exportação: CSV');
    await expect(situacao(page)).toHaveAttribute('data-exportada', 'false');
    await exportar(page, 'csv');
    await expect(situacao(page)).toHaveText('Exportada');
  });

  test('reabrir fica registrado no dia: quando e quem', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    expect((await diaGravado(page)).reabertura).toBeNull();
    await reabrir(page);
    await expect(botaoAprovar(page)).toBeVisible();
    const { reabertura, aprovacao } = await diaGravado(page);
    expect(aprovacao).toBeNull();
    expect(Date.parse(reabertura.em)).not.toBeNaN();
  });

  comPrioridade('na escala aprovada, o voo que entrou depois fica sem pino; "Fixar o voo novo" o fixa onde está, sem tirar ninguém do lugar', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await expect(page.locator('#btn-fixar-novos')).toHaveCount(0);
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    await caixaVoa(page.locator('#dem tr[data-id="1002"]')).check();
    await abrirEscala(page);
    const antes = await linhas(page);
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(2);
    await expect(page.locator('#btn-fixar-novos')).toHaveText('Fixar o voo novo');
    await page.locator('#btn-fixar-novos').click();
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(3);
    await expect(page.locator('#btn-fixar-novos')).toHaveCount(0);
    await expect(botaoReabrir(page)).toBeFocused();
    expect(await linhas(page)).toEqual(antes);
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Voo novo fixado: Aluno 1002');
  });
});

// A revisão do H (#113): a aprovação e "Fixar os N voos novos" sem o motor; a exportação registrada só com o arquivo
// entregue; o aviso à vista sem voos; o registro não mostra "Atualizada às"
test.describe('A aprovação e o registro das exportações, sem o motor', () => {
  test('aprovar fixa exatamente as linhas da tela: nenhuma a mais gravada, todas com o cadeado, sem "Fixar o voo novo"', async ({ page }) => {
    await abrir(page, { estado: gerarCenario(204) });
    await abrirEscala(page);
    const antes = (await lerEscala(page)).linhas;
    await aprovar(page);
    expect((await lerEscala(page)).linhas).toEqual(antes);
    await expect(page.locator('#btn-fixar-novos')).toHaveCount(0);
    const { fixos, resultado } = await diaGravado(page);
    expect(resultado.out.filter(o => !o.trecho).every(o => Object.hasOwn(fixos, o.fKey))).toBe(true);
  });

  test('o PDF sem a biblioteca não fica registrado: nenhuma exportação, nada de "Exportada"', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await page.evaluate(() => { window.jspdf = undefined; });
    await page.locator('#pdf').click();
    await expect(page.locator('#toast-box .toast', { hasText: 'A biblioteca de PDF não carregou' })).toBeVisible();
    await expect(situacao(page)).toHaveCount(0);
    expect(((await diaGravado(page)) || {}).exportacoes || {}).toEqual({});
  });

  test('sem nenhum voo, o aviso da exportação desatualizada continua à vista; o registro não mostra "Atualizada às"', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await page.reload();
    await abrirEscala(page);
    await expect(page.locator('#escala-atualizada')).toBeHidden();
    await exportar(page, 'csv');
    await expect(situacao(page)).toHaveText('Exportada');
    await expect(page.locator('#escala-atualizada')).toBeHidden();
    await expect(page.locator('#exp')).toHaveAttribute('aria-describedby', 'exportacoes-situacao');
    for (const nome of ['Aluno 1000', 'Aluno 1001']) await page.locator('#out tbody tr:not(.win)', { hasText: nome }).locator('[data-act="rm-fly"]').click();
    await expect(page.locator('#out tbody tr:not(.win)')).toHaveCount(0);
    await expect(situacao(page)).toBeVisible();
    await expect(situacao(page)).toHaveText('A escala mudou depois da exportação: CSV');
  });
});

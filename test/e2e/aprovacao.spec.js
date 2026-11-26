// O dia de operação: "Aprovar escala" fixa os voos. Depois disso, uma alteração não tira ninguém do lugar:
// o pedido novo entra em volta, e o voo fixo que ficou impossível aparece em conflito. "Reabrir" volta ao normal.
// Em Voo, Atrasado, Pousou e Cancelado também fixam o voo.
import { test, comPrioridade, expect, abrir, abrirComExemplo, irPara, abrirEscala, lerEscala, abrirHistorico, alternarVem, aprovar, botaoAprovar, botaoReabrir, caixaVoa, reabrir, refazer } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

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
    await novo.locator('[data-f="pr"]').selectOption('1');
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
    // A caixa abre recolhida, só com o título
    const conflitos = page.locator('#out details.caixa.conflitos');
    await expect(conflitos).not.toHaveAttribute('open', '');
    await expect(conflitos.locator('summary')).toHaveText('1 voo em conflito na escala aprovada');
    await expect(conflitos).toContainText('o instrutor não está disponível');
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

// Status do voo com detalhes: Cancelado pede o motivo e Atrasado, a nova decolagem. O detalhe aparece junto do status,
// vai para o CSV e fica guardado no dia; o histórico registra só a categoria do motivo.
import { test, expect, abrir, abrirEscala, botaoDoHistorico, editorDoVoo, refazer, textosDaEscala, itensDaEscala } from './fixtures.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';

// Dois voos seguidos do mesmo instrutor (e no mesmo avião): 10:10 e 11:30
const doisVoos = () => cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1 }), aluno(1001, { p1: 690, p2: -1 })] });
const linha = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });
const dialogo = page => page.locator('#dlg-status');
const confirmar = page => dialogo(page).getByRole('button', { name: 'Confirmar' }).click();

async function abrirHistorico(page) {
  await botaoDoHistorico(page).click();
  await expect(page.locator('#historico')).toBeVisible();
  return page.locator('#historico');
}

test.describe('Status do voo com detalhes', () => {
  test('Cancelado pede o motivo; o voo fica riscado com o motivo e o histórico registra a categoria', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Cancelado');
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).locator('h2')).toHaveText('Cancelar o voo');
    await expect(dialogo(page).locator('#dlg-status-voo')).toContainText('Aluno 1000 · 10:10–11:10 · Voo Local');
    await confirmar(page);
    await expect(dialogo(page).locator('[role="alert"]')).toHaveText('Escolha o motivo do cancelamento.');
    await expect(dialogo(page)).toBeVisible();

    await dialogo(page).getByLabel('Meteorologia').check();
    await confirmar(page);
    await expect(dialogo(page)).toBeHidden();
    // A escala não está aprovada: a pergunta antes de refazer (F1g)
    await refazer(page);
    const voo = linha(page, 'Aluno 1000');
    await expect(voo).toHaveClass(/\bst-Cancelado\b/);
    await expect(voo.locator('.st-sel')).toHaveValue('Cancelado');
    await expect(voo.locator('.st-detalhe')).toHaveText('Meteorologia');
    await expect(await abrirHistorico(page)).toContainText('Status de Aluno 1000 (10:10–11:10): Cancelado (Meteorologia)');
  });

  test('"Outro" pede a descrição, que aparece na escala e não vai para o histórico', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Cancelado');
    const descricao = dialogo(page).getByLabel('Descreva o motivo');
    await expect(descricao).toBeHidden();
    await dialogo(page).getByLabel('Outro').check();
    await expect(descricao).toBeVisible();
    await expect(descricao).toHaveAttribute('maxlength', '140');
    await confirmar(page);
    await expect(dialogo(page).locator('[role="alert"]')).toHaveText('Descreva o motivo do cancelamento.');
    await descricao.fill('Pista interditada');
    await confirmar(page);
    await refazer(page);
    await expect(linha(page, 'Aluno 1000').locator('.st-detalhe')).toHaveText('Pista interditada');
    const historico = await abrirHistorico(page);
    await expect(historico).toContainText('Status de Aluno 1000 (10:10–11:10): Cancelado (Outro)');
    await expect(historico).not.toContainText('Pista interditada');
  });

  test('Atrasado pede a nova decolagem, depois da original; o atraso que invade o voo seguinte vira aviso', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Atrasado');
    await expect(dialogo(page).locator('h2')).toHaveText('Voo atrasado');
    const novo = dialogo(page).getByLabel('Nova decolagem');
    await novo.fill('10:00');
    await confirmar(page);
    await expect(dialogo(page).locator('[role="alert"]')).toHaveText('A nova decolagem precisa ser depois das 10:10, no mesmo dia.');
    await novo.fill('23:30');
    await confirmar(page);
    await expect(dialogo(page).locator('[role="alert"]')).toHaveText('O voo atrasado precisa pousar até as 24:00 (decolagem até as 23:00).');
    await novo.fill('10:40');
    await confirmar(page);
    await expect(dialogo(page)).toBeHidden();
    await refazer(page);
    await expect(linha(page, 'Aluno 1000').locator('.st-detalhe')).toHaveText('nova decolagem 10:40');

    // Fora da escala aprovada, o voo seguinte (do mesmo instrutor) sai do horário novo do atrasado
    await expect(linha(page, 'Aluno 1001').locator('.c-hr')).not.toContainText('11:30');
    await expect(itensDaEscala(page, 'avisos')).toHaveCount(0);
    await expect(await abrirHistorico(page)).toContainText('Status de Aluno 1000 (10:10–11:10): Atrasado (nova decolagem 10:40)');
  });

  test('na escala aprovada, o atraso que invade o voo seguinte vira aviso', async ({ page }) => {
    const estado = {
      ...doisVoos(), aprovacao: { em: '2026-11-10T21:05:00.000Z', por: 'Operador 01' },
      fixos: { '1000_0_1': { a: 610, b: 670, r: 'PP-LJV', insId: 1 }, '1001_0_1': { a: 690, b: 750, r: 'PR-BTB', insId: 1 } }
    };
    await abrir(page, { estado });
    await abrirEscala(page);
    await linha(page, 'Aluno 1000').locator('.st-sel').selectOption('Atrasado');
    await dialogo(page).getByLabel('Nova decolagem').fill('10:40');
    await confirmar(page);
    await expect(textosDaEscala(page, 'avisos')).toHaveCount(1);
    await expect(textosDaEscala(page, 'avisos')).toContainText('Atraso: a nova decolagem às 10:40 (pouso às 11:40) se sobrepõe ao voo das 11:30 de Aluno 1001');
  });

  test('Voltar ou Esc desiste: o status continua o anterior e nada vai para o histórico', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    const status = () => linha(page, 'Aluno 1000').locator('.st-sel');
    await status().selectOption('Cancelado');
    await expect(dialogo(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(status()).toHaveValue('Confirmado');
    await status().selectOption('Atrasado');
    await dialogo(page).getByRole('button', { name: 'Voltar' }).click();
    await expect(dialogo(page)).toBeHidden();
    await expect(status()).toHaveValue('Confirmado');
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  test('o detalhe continua depois de recarregar; um clique nele permite alterar; o horário novo segue até o pouso', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    await linha(page, 'Aluno 1001').locator('.st-sel').selectOption('Atrasado');
    await dialogo(page).getByLabel('Nova decolagem').fill('11:50');
    await confirmar(page);
    await refazer(page);
    await page.reload();
    await abrirEscala(page);
    const detalhe = linha(page, 'Aluno 1001').locator('.st-detalhe');
    await expect(detalhe).toHaveText('nova decolagem 11:50');

    await detalhe.click();
    await expect(dialogo(page).getByLabel('Nova decolagem')).toHaveValue('11:50');
    await dialogo(page).getByLabel('Nova decolagem').fill('12:10');
    await confirmar(page);
    await refazer(page);
    await expect(detalhe).toHaveText('nova decolagem 12:10');
    await expect(linha(page, 'Aluno 1001').locator('.st-sel')).toHaveValue('Atrasado');

    // O horário novo continua no Em Voo e no Pousou (o quadro e o descanso usam o pouso de verdade); só aparece, sem o
    // clique para alterar. Voltar a Confirmado o apaga
    await linha(page, 'Aluno 1001').locator('.st-sel').selectOption('Em Voo');
    await expect(dialogo(page)).toBeHidden();
    await refazer(page);
    await expect(detalhe).toHaveText('decolou às 12:10');
    await expect(linha(page, 'Aluno 1001').locator('button.st-detalhe')).toHaveCount(0);
    await linha(page, 'Aluno 1001').locator('.st-sel').selectOption('Pousou');
    await refazer(page);
    await expect(detalhe).toHaveText('decolou às 12:10');
    await linha(page, 'Aluno 1001').locator('.st-sel').selectOption('Confirmado');
    await refazer(page);
    await expect(linha(page, 'Aluno 1001').locator('.st-detalhe')).toHaveCount(0);
  });

  // "Pousou" fecha o voo; no Ground e no simulador, o mesmo status aparece como "Concluída"
  test('Pousou: fixa o voo e vai para o histórico; no Ground, a opção se chama "Concluída"', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 610, p2: -1 }), aluno(1001, GROUND_C152)] }) });
    await abrirEscala(page);
    const voo = linha(page, 'Aluno 1000');
    expect(await voo.locator('.st-sel option').allTextContents()).toEqual(['Pendente', 'Confirmado', 'Atrasado', 'Em Voo', 'Pousou', 'Cancelado']);
    await voo.locator('.st-sel').selectOption('Pousou');
    await expect(dialogo(page)).toBeHidden();
    await refazer(page);
    await expect(voo.locator('.st-sel')).toHaveClass(/\bst-Pousou\b/);
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Pousou');
    await expect(await abrirHistorico(page)).toContainText('Status de Aluno 1000 (10:10–11:10): Pousou');
    await page.keyboard.press('Escape');

    const ground = linha(page, 'Aluno 1001');
    expect(await ground.locator('.st-sel option').allTextContents()).toEqual(['Pendente', 'Confirmado', 'Atrasado', 'Em Voo', 'Concluída', 'Cancelado']);
    await ground.locator('.st-sel').selectOption('Pousou');
    await refazer(page);
    await expect(ground.locator('.st-sel option:checked')).toHaveText('Concluída');
    await expect(ground.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Concluída');
  });

  test('no editor do voo (a barra do mapa): o mesmo diálogo, e o editor mostra o detalhe', async ({ page }) => {
    await abrir(page, { estado: doisVoos() });
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="eq"]').click();
    await page.locator('#out .tl-bar').first().click();
    await page.locator('#voo-status').selectOption('Cancelado');
    await dialogo(page).getByLabel('Aluno ausente').check();
    await confirmar(page);
    await expect(editorDoVoo(page)).toBeVisible();
    await expect(page.locator('#voo-status')).toHaveValue('Cancelado');
    await expect(page.locator('#dlg-voo .voo-detalhe')).toHaveText('Aluno ausente');
  });
});

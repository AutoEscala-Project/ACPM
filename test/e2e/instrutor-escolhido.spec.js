// O instrutor escolhido pelo operador: na Demanda (o app encaixa o voo com ele) e na Escala (o nome do instrutor abre a
// lista; o voo fica onde está, fixo, com o escolhido, e o resto é refeito em volta). O histórico desfaz
import { test, expect, abrir, irPara, abrirEscala, confirmar } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

// Dois voos às 08:20: o app põe o Instrutor 02 (menos habilitações) com o Aluno 1000 e o Instrutor 01 com o 1001
const dia = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 1), instrutor(3, 9, { on: false })], stu: [aluno(1000), aluno(1001)] });
const linha = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });
const pedido = (page, id) => page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="0"]`);

test.describe('Instrutor escolhido', () => {
  test('na Demanda: o voo sai com o escolhido; o histórico volta para o automático', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 02');

    await irPara(page, 'dem');
    const campo = pedido(page, 1000).locator('[data-f="insId"]');
    await expect(campo.locator('option')).toHaveText(['Automático', 'Instrutor 01', 'Instrutor 02', 'Instrutor 03 (fora nesta data)']);
    await campo.selectOption({ label: 'Instrutor 01' });
    await expect(pedido(page, 1000).locator('[data-f="insId"]')).toHaveClass(/\bescolhido\b/);

    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 01');
    await expect(linha(page, 'Aluno 1000').locator('.ins-btn')).toHaveClass(/\bescolhido\b/);
    await expect(linha(page, 'Aluno 1001').locator('.c-instr')).toHaveText('Instrutor 02');

    await page.locator('#btn-open-log').click();
    await expect(page.locator('#audit-log-list')).toContainText('Pedido Aluno 1000: instrutor Instrutor 01 (Voo Local)');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 02');
    await irPara(page, 'dem');
    await expect(pedido(page, 1000).locator('[data-f="insId"]')).toHaveValue('');
  });

  test('o escolhido que não pode voar: o pedido fica fora da escala, com o motivo', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'dem');
    await pedido(page, 1000).locator('[data-f="insId"]').selectOption({ label: 'Instrutor 03 (fora nesta data)' });
    await abrirEscala(page);
    await expect(page.locator('#out details.erros')).toContainText('o instrutor escolhido (Instrutor 03) não está disponível nesta data');
  });

  test('na Escala: o voo fica no horário e no avião dele, fixo, com o escolhido; "Automático" solta', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const voo = linha(page, 'Aluno 1001');
    const aviao = (await voo.locator('.c-aviao').innerText()).trim();
    await expect(voo.locator('.c-instr')).toHaveText('Instrutor 01');

    await voo.locator('[data-act="trocar-instrutor"]').click();
    const lista = voo.locator('select[data-a="insVoo"]');
    await expect(lista).toBeFocused();
    // Quem o app escolheu é a primeira opção; o Instrutor 02 está ocupado às 08:20 e o 03 não vem
    await expect(lista.locator('option')).toHaveText(['Instrutor 01 (escolhido pelo app)', 'Instrutor 02 (ocupado com Aluno 1000)', 'Instrutor 03 (indisponível)']);
    await lista.selectOption({ label: 'Instrutor 02 (ocupado com Aluno 1000)' });

    // O resto da escala é refeito em volta: o Aluno 1000 passa para o Instrutor 01, no mesmo horário
    await expect(voo.locator('.c-instr')).toHaveText('Instrutor 02');
    await expect(voo.locator('.c-hr')).toContainText('08:20–09:20');
    await expect(voo.locator('.c-aviao')).toHaveText(aviao);
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 01');
    await expect(page.locator('#out details.conflitos')).toHaveCount(0);

    await irPara(page, 'dem');
    await expect(pedido(page, 1001).locator('[data-f="insId"]')).toHaveValue('2');

    await abrirEscala(page);
    await voo.locator('[data-act="trocar-instrutor"]').click();
    await expect(voo.locator('select[data-a="insVoo"] option').first()).toHaveText('Automático (o app escolhe)');
    await voo.locator('select[data-a="insVoo"]').selectOption({ label: 'Automático (o app escolhe)' });
    await expect(voo.locator('.fixo')).toHaveCount(0);
    await expect(voo.locator('.ins-btn')).not.toHaveClass(/\bescolhido\b/);
  });

  test('na Escala, sair da lista sem escolher (Esc) volta ao nome, com o foco nele', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const voo = linha(page, 'Aluno 1000');
    await voo.locator('[data-act="trocar-instrutor"]').click();
    await expect(voo.locator('select[data-a="insVoo"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(voo.locator('select[data-a="insVoo"]')).toHaveCount(0);
    await expect(voo.locator('[data-act="trocar-instrutor"]')).toBeFocused();
  });

  test('Voa com (Alunos): o aluno voa com o instrutor dele; quando ele não vem, com outro, e a escala avisa', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'alu');
    const aluno = page.locator('#alu tr.cd[data-id="1000"]');
    await aluno.locator('[data-f="voaCom"]').selectOption({ label: 'Instrutor 01' });
    await expect(aluno.locator('.tg.par')).toHaveText(/Instrutor 01/);
    await expect(page.locator('#alu tr.cd[data-id="1000"] [data-f="voaCom"]')).toBeFocused();
    // Quem está no “Voa com” não aparece em “Não escalar com”, e o contrário
    await expect(aluno.locator('[data-f="bl"] option', { hasText: 'Instrutor 01' })).toHaveCount(1);
    await aluno.locator('[data-f="bl"]').selectOption({ label: 'Instrutor 03' });
    await expect(aluno.locator('[data-f="voaCom"] option', { hasText: 'Instrutor 03' })).toHaveCount(0);

    await irPara(page, 'dem');
    await expect(pedido(page, 1000).locator('[data-f="insId"] option').first()).toHaveText('Automático (voa com Instrutor 01)');

    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 01');
    await expect(page.locator('#out details.avisos')).toHaveCount(0);

    // O Instrutor 01 não vem: o voo fica com outro, com o aviso
    await irPara(page, 'ins');
    await page.locator('#inst-dia tr[data-id="1"] [data-f="on"]').uncheck();
    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000')).toHaveCount(1);
    await expect(linha(page, 'Aluno 1000').locator('.c-instr')).toHaveText('Instrutor 02');
    await expect(page.locator('#out details.avisos summary')).toContainText('1 voo sem o instrutor de Voa com');
    await expect(page.locator('#out details.avisos')).toContainText('Sem o instrutor de “Voa com” (Instrutor 01: fora nesta data)');

    // Tirar do “Voa com”: o aviso some
    await irPara(page, 'alu');
    await page.locator('#alu tr.cd[data-id="1000"] [data-act="unvc"]').click();
    await expect(page.locator('#alu tr.cd[data-id="1000"] .tg.par')).toHaveCount(0);
    await abrirEscala(page);
    await expect(page.locator('#out details.avisos')).toHaveCount(0);
  });

  test('o “Voa com” fica no cadastro: vale também na data seguinte', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'alu');
    await page.locator('#alu tr.cd[data-id="1001"] [data-f="voaCom"]').selectOption({ label: 'Instrutor 02' });
    await page.reload();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr.cd[data-id="1001"] .tg.par')).toHaveText(/Instrutor 02/);
  });

  test('o voo fixo pela escolha na Escala continua fixo ao mudar o status; "Automático" na Demanda o solta', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const voo = linha(page, 'Aluno 1001');
    await voo.locator('[data-act="trocar-instrutor"]').click();
    await voo.locator('select[data-a="insVoo"]').selectOption({ label: 'Instrutor 02 (ocupado com Aluno 1000)' });
    await expect(voo.locator('.fixo')).toHaveCount(1);

    await voo.locator('select[data-f="fstatus"]').selectOption('Pendente');
    await expect(voo.locator('select[data-f="fstatus"]')).toHaveValue('Pendente');
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
    await expect(voo.locator('.c-instr')).toHaveText('Instrutor 02');

    await irPara(page, 'dem');
    await pedido(page, 1001).locator('[data-f="insId"]').selectOption('');
    await abrirEscala(page);
    await expect(voo.locator('.fixo')).toHaveCount(0);
    await expect(voo.locator('.ins-btn')).not.toHaveClass(/\bescolhido\b/);
  });

  test('aprovar e reabrir a escala não soltam o voo fixo pela escolha na Escala', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const voo = linha(page, 'Aluno 1001');
    await voo.locator('[data-act="trocar-instrutor"]').click();
    await voo.locator('select[data-a="insVoo"]').selectOption({ label: 'Instrutor 02 (ocupado com Aluno 1000)' });
    await confirmar(page, '#btn-aprovar');
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: escala aprovada');
    await confirmar(page, '#btn-reabrir');
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
    await expect(linha(page, 'Aluno 1000').locator('.fixo')).toHaveCount(0);
  });
});


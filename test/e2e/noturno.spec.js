// O noturno de dois dias na tela: no dia, 4 h a partir das 17:30 (a Demanda e a Agenda travam a duração); no dia
// seguinte, a volta de BH às 07:30 entra sozinha na escala, com o instrutor, o aluno e o avião livres só às 10:10, e o
// repouso antes dela é um aviso
import { test, expect, abrir, irPara, abrirEscala } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const linha = (page, texto) => page.locator('#out tbody tr:not(.win)', { hasText: texto });
const NOTURNO = { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 };

test.describe('Noturno de dois dias', () => {
  test('a Demanda e a Agenda travam a duração do Noturno (4 h no dia e a volta no dia seguinte)', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await irPara(page, 'dem');
    await page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="mis"]').selectOption('Noturno');
    const duracao = page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="nb"]');
    await expect(duracao).toBeDisabled();
    await expect(duracao.locator('option:checked')).toHaveText('4 h + volta');
    // Saindo do Noturno, a missão nova começa com a duração dela (não fica com as 4 h)
    await page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="mis"]').selectOption('Voo Local');
    await expect(page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="nb"]')).toHaveValue('1');
    await page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="mis"]').selectOption('Noturno');
    await irPara(page, 'age');
    await page.locator('#ag-missao').selectOption('Noturno');
    await expect(page.locator('#ag-horas')).toHaveValue('4');
    await expect(page.locator('#ag-horas')).toBeDisabled();
  });

  test('no dia seguinte, a volta de BH entra às 07:30 e ninguém dela voa antes das 10:10', async ({ page }) => {
    // O Aluno 1000 voa o noturno hoje; o Aluno 1001 pede um voo local amanhã às 08:20 com o mesmo instrutor (o único)
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, NOTURNO), aluno(1001, { fly: false })] });
    await abrir(page, { estado });
    await abrirEscala(page);
    const noturno = linha(page, 'Aluno 1000');
    await expect(noturno.locator('.c-hr')).toContainText('17:30–21:30');
    await expect(noturno.locator('.c-missao')).toContainText('translado + 3 h em BH · volta amanhã às 07:30');
    // Uma alteração grava a escala do dia (o dia seguinte lê a escala gravada)
    await noturno.locator('select[data-f="fstatus"]').selectOption('Pendente');

    await page.locator('#dt-prox').click();
    await expect(page.locator('#dt-rotulo')).toContainText('12/11');
    await abrirEscala(page);
    const volta = linha(page, 'Aluno 1000');
    await expect(volta.locator('.c-hr')).toContainText('07:30–08:30');
    await expect(volta.locator('.c-missao')).toContainText('volta de BH · livres às 10:10');
    await expect(volta.locator('.fixo')).toHaveCount(1);
    // A volta não tem "Tirar da escala" nem a troca do instrutor (é o voo de ontem)
    await expect(volta.locator('[data-act="rm-fly"], [data-act="trocar-instrutor"]')).toHaveCount(0);
    await expect(page.locator('#out details.avisos')).toContainText('9h00 de repouso entre o noturno de ontem (até 21:30) e o translado de volta (07:30)');

    // Um voo pedido às 08:20 com o mesmo instrutor vai para depois das 10:10
    await irPara(page, 'dem');
    await page.locator('#incluir-aluno').fill('Aluno 1001');
    await page.locator('#incluir-aluno').press('Enter');
    await page.locator('#dem tr[data-k="d"][data-id="1001"] [data-f="p1"]').selectOption({ label: '08:20' });
    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1001').locator('.c-hr')).not.toContainText('08:20');
    const inicio = (await linha(page, 'Aluno 1001').locator('.c-hr').innerText()).slice(0, 5);
    expect(inicio >= '10:10', `começou às ${inicio}`).toBe(true);
  });
});

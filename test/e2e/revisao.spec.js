// Revisão de 50 horas em Recursos (no detalhe do avião, "Nesta data"): as horas disponíveis até a revisão (a operadora
// lança as horas disponíveis, não as horas desde a revisão), o avião que para na escala e a nova data.
import { test, expect, abrir, irPara, abrirEscala, lerEscala, escolherNoCalendario, horasDoRecurso, campoDoRecurso, linhaDoRecurso } from './fixtures.js';
import { aluno, apenas, cenario, instrutor } from '../helpers/montar.js';

// Três voos de 1 h (08:20, 10:10 e 12:40) e só o PP-LJV disponível no C152
const tresVoosNoPPLJV = () => cenario({
  ins: [instrutor(1, 1), instrutor(2, 1), instrutor(3, 1)],
  stu: [aluno(1000, { p1: 1, p2: 1 }), aluno(1001, { p1: 2, p2: 2 }), aluno(1002, { p1: 4, p2: 4 })],
  semAeronaves: apenas('C152', 'PP-LJV')
});

// As horas são gravadas ao sair do campo (o detalhe não redesenha o campo com o foco nele)
async function informarHoras(page, matricula, horas) {
  const campo = await horasDoRecurso(page, matricula);
  await campo.fill(horas);
  await campo.press('Tab');
  return campo;
}

test.describe('Revisão de 50 horas', () => {
  test('o avião voa as horas disponíveis e para; "Revisão feita" (com confirmação) volta para 50 h disponíveis', async ({ page }) => {
    await abrir(page, { estado: tresVoosNoPPLJV() });
    const campo = await informarHoras(page, 'PP-LJV', '2');
    await expect(campoDoRecurso(page, 'horas')).toContainText('Horas disponíveis');
    await expect(campoDoRecurso(page, 'horas')).not.toContainText('desde a revisão');
    await expect(campoDoRecurso(page, 'revisao').locator('.barra')).toHaveCount(1);
    await expect(page.locator('#audit-log-list')).toContainText('PP-LJV: 2 h disponíveis até a revisão de 50 horas');
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.filter(l => l.includes('PP-LJV'))).toHaveLength(2);
    await expect(page.locator('#out .al.warn')).toContainText('Aeronave parou para revisão de 50 horas às 11:10 (50 h desde a última revisão).');

    await irPara(page, 'rec');
    await expect(linhaDoRecurso(page, 'PP-LJV').locator('.lista-l3')).toHaveText('11/11 · parou para a revisão de 50 horas às 11:10');
    await expect(campoDoRecurso(page, 'escala')).toContainText('Parou para a revisão de 50 horas às 11:10');
    const botao = page.locator('#det-rec [data-act="revisao"][data-id="PP-LJV"]');
    await botao.click();
    await expect(botao).toHaveText('Confirmar revisão');
    await botao.click();
    await expect(campo).toHaveValue('50');
    await expect(page.locator('#audit-log-list')).toContainText('PP-LJV: revisão de 50 horas feita (50 h disponíveis)');
    await irPara(page, 'esc');
    expect((await lerEscala(page)).linhas.filter(l => l.includes('PP-LJV'))).toHaveLength(3);
  });

  test('a nova data começa com as horas disponíveis do dia anterior menos os voos dele', async ({ page }) => {
    await abrir(page, { estado: tresVoosNoPPLJV() });
    await informarHoras(page, 'PP-LJV', '40');
    await abrirEscala(page);
    await escolherNoCalendario(page, '2026-11-12');
    await expect(page.locator('#bi-dt')).toHaveValue('2026-11-12');
    await expect(await horasDoRecurso(page, 'PP-LJV')).toHaveValue('37');
    await expect(await horasDoRecurso(page, 'PR-BTB')).toHaveValue('', { timeout: 1000 });
  });

  test('horas disponíveis fora de 0 a 50: o campo não aceita, e diz por quê', async ({ page }) => {
    await abrir(page, { estado: tresVoosNoPPLJV() });
    const campo = await informarHoras(page, 'PP-LJV', '60');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAccessibleDescription('As horas disponíveis vão de 0 a 50.');
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });
});

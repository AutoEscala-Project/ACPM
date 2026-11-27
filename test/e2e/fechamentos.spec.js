// Os horários fechados nesta data (J, N11): em Recursos › Disponibilidade do dia, "+ Fechar horários" fecha um intervalo
// (De, Até; "O dia todo") para todos os recursos ou para categorias, no lugar das nove janelas de operação. A Escala, o
// "+ Agendar voo" e os horários de decolagem os leem; o ✕ abre de novo, e o Histórico desfaz
import { test, expect, abrir, irPara, irParaVista, abrirEscala, lerEscala, abrirHistorico, fecharHorarios, horariosFechados } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const estado = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [
  aluno(1000, { mis: 'Voo Local', eq: 'C152', p1: 820, p2: -1 }), aluno(1001, { mis: 'Voo Local', eq: 'C172', p1: 820, p2: -1 })] });
const inicioDe = async (page, nome) => ((await lerEscala(page)).linhas.find(l => l.includes(nome)) || '').slice(0, 5);

test.describe('Horários fechados nesta data', () => {
  test('De 12:40 e Até 17:30 fecham a tarde: a lista, o Histórico, os horários riscados, a Escala sem eles; o ✕ e o ↶ Reverter', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirEscala(page);
    expect(await inicioDe(page, 'Aluno 1000')).toBe('13:40');
    await irPara(page, 'rec');
    const secao = horariosFechados(page);
    await expect(secao).toContainText('Nenhum horário fechado nesta data.');

    await fecharHorarios(page, { de: '12:40', ate: '17:30' });
    await expect(secao.locator('li')).toHaveText(['12:40–17:30 · todos os recursos']);
    await expect(page.locator('#audit-log-list')).toContainText('Horários fechados nesta data: 12:40–17:30 (todos os recursos)');
    await irParaVista(page, 'rec', 'cadastro');
    await expect(page.locator('#horarios [data-cat="C152"] .hr.fechado')).toHaveText(['12:40 (fechado nesta data)', '13:40 (fechado nesta data)', '14:30 (fechado nesta data)', '16:20 (fechado nesta data)']);
    await expect(page.locator('#horarios [data-cat="C152"] .hr.fechado').first()).toHaveAttribute('data-dica', 'horario-fechado-na-data');
    await abrirEscala(page);
    expect(await inicioDe(page, 'Aluno 1000') < '12:40').toBe(true);
    expect(await inicioDe(page, 'Aluno 1001') < '12:40').toBe(true);

    await irParaVista(page, 'rec', 'dia');
    await secao.locator('[data-act="tirar-fechamento"]').click();
    await expect(secao).toContainText('Nenhum horário fechado nesta data.');
    await abrirEscala(page);
    expect(await inicioDe(page, 'Aluno 1000')).toBe('13:40');

    await abrirHistorico(page);
    await page.locator('#audit-log-list button[data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await irPara(page, 'rec');
    await expect(secao.locator('li')).toHaveText(['12:40–17:30 · todos os recursos']);
  });

  test('um fechamento só do C152 deixa o C172; "O dia todo" fecha o dia inteiro', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'rec');
    const secao = horariosFechados(page);
    await fecharHorarios(page, { de: '12:40', ate: '17:30', categorias: ['C152'] });
    await expect(secao.locator('li')).toHaveText(['12:40–17:30 · C152']);
    await abrirEscala(page);
    expect(await inicioDe(page, 'Aluno 1000') < '12:40').toBe(true);
    expect(await inicioDe(page, 'Aluno 1001')).toBe('13:40');
    await irPara(page, 'rec');
    await fecharHorarios(page, { diaTodo: true, categorias: ['C172'] });
    await expect(secao.locator('li')).toHaveText(['06:00–24:00 · C172', '12:40–17:30 · C152']);
    await abrirEscala(page);
    expect(await inicioDe(page, 'Aluno 1001')).toBe('');
  });

  test('o formulário: a linha do que fecha muda com os campos, o Até depois do De, e Esc não grava nada e devolve o foco', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'rec');
    const secao = horariosFechados(page);
    const abrirForm = secao.locator('[data-act="fechar-horarios"]');
    await abrirForm.focus();
    await page.keyboard.press('Enter');
    const form = secao.locator('.fechar-horarios');
    await expect(form).toBeVisible();
    await form.getByLabel('De', { exact: true }).selectOption({ label: '12:40' });
    await form.getByLabel('Até', { exact: true }).selectOption({ label: '17:30' });
    await expect(form.locator('[role="status"]')).toContainText('Fecha 4 horários do C152');
    await form.locator('input[data-cat="ground"]').check();
    await expect(form.locator('[role="status"]')).toHaveText('Fecha 4 horários da Sala Ground.');
    await form.getByLabel('Até', { exact: true }).selectOption({ label: '10:00' });
    await expect(form.locator('[role="status"]')).toHaveText('O Até vem depois do De.');
    await expect(form.locator('[data-act="fch-fechar"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeHidden();
    await expect(abrirForm).toBeFocused();
    await expect(secao).toContainText('Nenhum horário fechado nesta data.');
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  test('no celular (320 px): o formulário cabe sem rolar de lado, e os controles têm 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await abrir(page, { estado: estado() });
    await irPara(page, 'rec');
    const secao = horariosFechados(page);
    await secao.locator('[data-act="fechar-horarios"]').click();
    const form = secao.locator('.fechar-horarios');
    await expect(form).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const alvo of await form.locator('select, button').all()) {
      const caixa = await alvo.boundingBox();
      expect(caixa.height).toBeGreaterThanOrEqual(44);
    }
  });
});

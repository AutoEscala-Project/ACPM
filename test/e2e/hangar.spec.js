// Ordem dos aviões no hangar: em Recursos, o item fixo do alto da lista (B), da frente para o fundo, com subir, descer e
// pôr na frente. A escala tira primeiro os da frente e junta os voos nos aviões que já saíram; a data seguinte começa com a
// mesma ordem.
import { test, expect, abrir, abrirEscala, abrirHistorico, diaSeguinte, abrirHangar, ordemNoHangar, buscaDosRecursos, linhasDosRecursos, contagemDosRecursos } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

// Com o hangar ligado (desligado: funcionalidades.spec.js)
test.use({ funcionalidades: 'hangar' });

const posicoes = page => ordemNoHangar(page).evaluateAll(lis => lis.map(li => li.dataset.id));
const noHangar = (page, reg) => ordemNoHangar(page).and(page.locator(`[data-id="${reg}"]`));

test.describe('Ordem no hangar', () => {
  test('pôr um avião na frente: o primeiro voo do dia sai nele; o histórico registra; a data seguinte começa igual', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 610, p2: -1 })] }) });
    await abrirHangar(page);
    const antes = await posicoes(page);
    expect(antes[0]).toBe('PP-LJV');
    expect(antes).not.toContain('SIM-MONO-A');
    await noHangar(page, 'PR-VOB').locator('[data-act="hangar-frente"]').click();
    await expect.poll(async () => (await posicoes(page))[0]).toBe('PR-VOB');
    await noHangar(page, 'PR-VOB').locator('[data-act="hangar-descer"]').click();
    await expect.poll(async () => (await posicoes(page))[1]).toBe('PR-VOB');
    await noHangar(page, 'PR-VOB').locator('[data-act="hangar-subir"]').click();
    await expect.poll(async () => (await posicoes(page)).slice(0, 2)).toEqual(['PR-VOB', 'PP-LJV']);
    await expect(noHangar(page, 'PR-VOB')).toContainText('2 voos nesta data');

    await abrirEscala(page);
    const recursos = await page.locator('#out tbody tr:not(.win) .c-aviao').allTextContents();
    expect(recursos.map(t => t.trim().split(/\s+/)[0])).toEqual(['PR-VOB', 'PR-VOB']);
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Hangar: PR-VOB passou para 1º');

    await diaSeguinte(page);
    await abrirHangar(page);
    expect((await posicoes(page))[0]).toBe('PR-VOB');
  });

  // A busca de Recursos não vale no hangar: ele mostra sempre todos os aviões (é o item fixo da lista), e Subir troca o
  // avião com o vizinho da lista inteira, também com o que a busca esconde na lista
  test('a busca de Recursos não vale no hangar: todos os aviões continuam, e Subir troca com o vizinho da lista inteira', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await abrirHangar(page);
    const antes = await posicoes(page);
    await buscaDosRecursos(page).fill('vom');
    await expect(linhasDosRecursos(page)).toHaveCount(1);
    await expect(contagemDosRecursos(page)).toHaveText('1 de 27 recursos');
    expect(await posicoes(page)).toEqual(antes);
    // O PR-VOM (PA-34) sobe um lugar: troca com o PR-VOY, um C172 que a lista filtrada não mostra
    const i = antes.indexOf('PR-VOM');
    expect(antes[i - 1]).toBe('PR-VOY');
    await noHangar(page, 'PR-VOM').locator('[data-act="hangar-subir"]').click();
    const depois = [...antes];
    [depois[i - 1], depois[i]] = ['PR-VOM', 'PR-VOY'];
    await expect.poll(() => posicoes(page)).toEqual(depois);
    await expect(noHangar(page, 'PR-VOM').locator('.pos')).toHaveText(`${i}º`);
  });
});

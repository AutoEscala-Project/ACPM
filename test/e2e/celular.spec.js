// No celular (390 px): nenhuma aba rola para o lado e os alvos têm 44 px. Os testes de uma tela no celular estão no
// spec dela.
import { test, expect, abrirComExemplo, irPara, alvosPequenos, botaoDaAba, larguraDaPagina, percorrerTelas } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Celular', () => {
  test('nenhuma aba rola para o lado; o mapa rola dentro do próprio painel', async ({ page }) => {
    await abrirComExemplo(page);
    // Todas as abas, as outras vistas e as tabelas sem nenhum com os filtros
    await percorrerTelas(page, async tela => expect(await larguraDaPagina(page), tela).toBeLessThanOrEqual(390));
    await irPara(page, 'esc');
    for (const vista of ['eq', 'ins']) {
      await page.locator(`#s-esc [data-tl="${vista}"]`).click();
      await expect(page.locator('#out .mapa')).toBeVisible();
      expect(await larguraDaPagina(page), `mapa ${vista}`).toBeLessThanOrEqual(390);
    }
    await page.locator('#s-esc [data-tl="painel"]').click();
    await expect(page.locator('#out .painel-dia')).toBeVisible();
    expect(await larguraDaPagina(page), 'painel').toBeLessThanOrEqual(390);
  });

  test('botões e campos com pelo menos 44 px para o dedo, em todas as abas', async ({ page }) => {
    await abrirComExemplo(page);
    await percorrerTelas(page, async tela => expect(await alvosPequenos(page), tela).toEqual([]));
  });

  // A faixa das abas rola para o lado no celular: a aba aberta pelo "Abrir a Demanda" (Alunos) aparece nela, com a marca
  // da aba aberta à vista (sem isso, a faixa continuava em Alunos, e nenhuma aba à vista parecia aberta)
  test('"Abrir a Demanda" traz a aba Demanda para a parte à vista da faixa das abas', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    const naFaixa = aba => botaoDaAba(page, aba).evaluate(b => {
      const r = b.getBoundingClientRect(), faixa = b.closest('#nav').getBoundingClientRect();
      return r.left >= faixa.left - 0.5 && r.right <= faixa.right + 0.5;
    });
    // A faixa rolada até o fim, como depois de tocar numa das últimas abas: a Demanda fica fora, à esquerda
    await page.locator('#nav').evaluate(faixa => { faixa.scrollLeft = faixa.scrollWidth; });
    expect(await naFaixa('alu')).toBe(true);
    expect(await naFaixa('dem')).toBe(false);
    await page.getByRole('button', { name: 'Abrir a Demanda' }).click();
    await expect(page.locator('#s-dem h2')).toBeFocused();
    await expect(botaoDaAba(page, 'dem')).toHaveClass(/\bon\b/);
    await expect.poll(() => naFaixa('dem')).toBe(true);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
  });
});

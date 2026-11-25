// A gravação vem antes dos desenhos (js/actions.js, save): um desenho que falha (uma tela pela metade durante o redesenho,
// um elemento que saiu da página) vai para o console, e a alteração continua gravada e no histórico. Antes, a escala era
// redesenhada antes de gravar, e um desenho que falhava deixava a alteração só na tela
import { test, expect, abrirSintetico, irPara, alternarDisponivel, prepararContexto, vigiarErros, AMANHA } from './fixtures.js';

const diaGravado = page => page.evaluate(chave => localStorage.getItem(chave) || '', `acpm4_dia_${AMANHA}`);
const historicoGravado = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_historico') || '[]').map(e => e.descricao));

// Uma página sem a vigilância de erros do test padrão: o erro do desenho que falha é esperado, e o teste confere qual foi
async function novaPagina(browser) {
  const contexto = await browser.newContext();
  await prepararContexto(contexto);
  const page = await contexto.newPage();
  return { contexto, page, erros: vigiarErros(page) };
}

test.describe('A gravação antes dos desenhos', () => {
  test('um desenho da escala que falha não impede a gravação nem o histórico: o erro vai para o console', async ({ browser }) => {
    const { contexto, page, erros } = await novaPagina(browser);
    await abrirSintetico(page);
    await irPara(page, 'rec');
    // A grade do dia dos instrutores é desenhada a cada escala refeita: sem o cabeçalho dela, o desenho falha
    await page.evaluate(() => document.getElementById('inst-dia-cab').remove());
    await alternarDisponivel(page, 'PR-BTB', false);
    await expect.poll(() => diaGravado(page)).toContain('"PR-BTB":false');
    await expect.poll(() => historicoGravado(page)).toEqual(['PR-BTB: Manutenção']);
    // Os desenhos seguintes foram feitos: o histórico da tela mostra a entrada
    await expect(page.locator('#log-cnt')).toHaveText('1');
    expect(erros.length, erros.join('\n')).toBeGreaterThan(0);
    expect(erros.every(e => e.startsWith('console:')), erros.join('\n')).toBe(true);
    await contexto.close();
  });

  test('sem a marca "Atualizada às", a alteração é gravada e entra no histórico, sem erro', async ({ browser }) => {
    const { contexto, page, erros } = await novaPagina(browser);
    await abrirSintetico(page);
    await irPara(page, 'rec');
    await page.evaluate(() => document.getElementById('escala-atualizada').remove());
    await alternarDisponivel(page, 'PR-BTB', false);
    await expect.poll(() => diaGravado(page)).toContain('"PR-BTB":false');
    await expect.poll(() => historicoGravado(page)).toEqual(['PR-BTB: Manutenção']);
    await expect(page.locator('#log-cnt')).toHaveText('1');
    expect(erros).toEqual([]);
    await contexto.close();
  });
});

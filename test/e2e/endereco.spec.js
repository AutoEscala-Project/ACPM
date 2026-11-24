// O endereço escolhe o banco (js/config-supabase.js). Fora dos endereços do app e do localhost, o app funciona no modo
// local, sem o banco: o que se faz ali fica só naquele navegador. Ele avisa no alto, para ninguém montar a escala onde
// ninguém mais a vê, e diz onde o app fica
import { test, expect, abrir, URL_APP } from './fixtures.js';

const OUTRO = 'copia-do-autoescala.invalid';

test.describe('O endereço do app', () => {
  test('em outro endereço, o aviso no alto, que não se fecha: sem o banco, só neste navegador, e o endereço do app', async ({ page, context, baseURL }) => {
    // O outro endereço serve os arquivos do servidor dos testes
    await context.route(url => url.hostname === OUTRO, async route => {
      const pedido = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: new URL(pedido.pathname.slice(1) + pedido.search, baseURL).href }) });
    });
    await abrir(page, { url: `https://${OUTRO}/` });
    const aviso = page.locator('#aviso-endereco');
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveAttribute('role', 'alert');
    await expect(aviso).toContainText('aqui o app funciona sem o banco');
    await expect(aviso).toContainText('só neste navegador');
    await expect(aviso.getByRole('link', { name: 'autoescala.autoescala-acpm.workers.dev' }))
      .toHaveAttribute('href', 'https://autoescala.autoescala-acpm.workers.dev/');
    // O app funciona (o modo local) e o aviso não tem botão de fechar: ele fica enquanto o endereço for esse
    await expect(page.locator('#s-esc')).toBeVisible();
    await expect(aviso.getByRole('button')).toHaveCount(0);
  });

  test('no localhost, o modo local de quem desenvolve, sem o aviso', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#aviso-endereco')).toBeHidden();
  });

  // Os endereços de verdade do app (produção e prévia) ficam nos testes unitários: aqui eles chamariam o Supabase real
  test('no localhost com o servidor falso dos testes (o modo compartilhado), sem o aviso, também no login', async ({ page }) => {
    await page.goto(URL_APP);
    await expect(page.locator('#s-login')).toBeVisible();
    await expect(page.locator('#aviso-endereco')).toBeHidden();
  });
});

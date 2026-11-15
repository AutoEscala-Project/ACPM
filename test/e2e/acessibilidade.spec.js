// Acessibilidade: cada botão e cada campo tem um nome para o leitor de tela, e nenhum se chama só "✕" (que o leitor
// lê como "multiplicação"). Vale para todas as abas, o Histórico e o painel de habilitações.
import { test, expect, abrirComExemplo, irPara, entrar } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { comExemplo } from '../helpers/exemplo.js';
import { estadoSintetico } from '../helpers/estado.js';
import { razaoDeContraste } from '../helpers/contraste.js';

// Nome acessível, do jeito simples: aria-label, aria-labelledby, o rótulo do campo, o texto do botão ou a dica
const semNome = (page, raiz) => page.evaluate(seletor => {
  const nome = el => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const por = el.getAttribute('aria-labelledby');
    if (por) return por.split(' ').map(id => (document.getElementById(id) || {}).textContent || '').join(' ');
    if (el.labels && el.labels.length) return [...el.labels].map(l => l.textContent).join(' ');
    // Sem texto, o leitor de tela usa a dica (title)
    if (el.matches('button, summary, a') && el.textContent.trim()) return el.textContent;
    return el.title || '';
  };
  const problemas = new Set();
  for (const raiz of document.querySelectorAll(seletor)) {
    for (const el of raiz.querySelectorAll('button, select, input, textarea, summary, a[href]')) {
      if (!el.checkVisibility() && !el.matches('input[type=checkbox]')) continue;
      if (el.matches('input[type=checkbox]') && !el.closest('label, td, th, li')?.checkVisibility()) continue;
      const n = nome(el).replace(/\s+/g, ' ').trim();
      if (!n || n === '✕' || n === '×') {
        problemas.add(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.dataset.f ? `[data-f=${el.dataset.f}]` : ''}${el.dataset.act ? `[data-act=${el.dataset.act}]` : ''}${el.dataset.a ? `[data-a=${el.dataset.a}]` : ''} "${n}"`);
      }
    }
  }
  return [...problemas];
}, raiz);

test.describe('Acessibilidade', () => {
  test('todo botão e todo campo tem nome para o leitor de tela, em todas as abas', async ({ page }) => {
    await abrirComExemplo(page);
    for (const aba of ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'rod', 'bi']) {
      await irPara(page, aba);
      expect(await semNome(page, '.topo, #nav, main section.on'), `aba ${aba}`).toEqual([]);
    }
    await irPara(page, 'esc');
    for (const vista of ['eq', 'ins', 'painel']) {
      await page.locator(`#s-esc [data-tl="${vista}"]`).click();
      expect(await semNome(page, 'main section.on'), `mapa ${vista}`).toEqual([]);
    }
    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    expect(await semNome(page, 'main section.on'), 'cadastro de instrutores').toEqual([]);
    await page.locator('#inst [data-act="editar-habs"]').first().click();
    expect(await semNome(page, '#painel-instrutor'), 'painel de habilitações').toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#btn-open-log').click();
    expect(await semNome(page, '#historico'), 'histórico').toEqual([]);
  });
});

// O anel do foco precisa contrastar com o que está em volta (WCAG 2.4.7 e 1.4.11: pelo menos 3:1). A barra do topo é
// azul-escura nos dois temas
test.describe('O foco do teclado na barra do topo', () => {
  for (const [tema, nome] of [['light', 'claro'], ['dark', 'escuro']]) {
    test(`o anel do foco contrasta com a barra em todos os controles, no tema ${nome}`, async ({ page }) => {
      await abrirComExemplo(page);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      const fundo = await page.locator('header.topo').evaluate(el => getComputedStyle(el).backgroundColor);
      const controles = page.locator('header.topo :is(button, select):visible:not(:disabled)');
      const total = await controles.count();
      expect(total).toBeGreaterThan(8);
      const fracos = [];
      for (let i = 0; i < total; i++) {
        const controle = controles.nth(i);
        // Pelo teclado (Shift+Tab e Tab): o foco que o navegador mostra (:focus-visible)
        await controle.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(controle).toBeFocused();
        const { cor, estilo, nome: rotulo, cortadoPor } = await controle.evaluate(el => {
          const css = getComputedStyle(el);
          // O anel é desenhado fora da caixa (outline-offset + largura): um pai que corta o que transborda o esconde
          const folga = parseFloat(css.outlineOffset) + parseFloat(css.outlineWidth);
          const caixa = el.getBoundingClientRect();
          let cortadoPor = null;
          for (let pai = el.parentElement; pai && !cortadoPor; pai = pai.parentElement) {
            const estiloDoPai = getComputedStyle(pai);
            if (estiloDoPai.overflowX === 'visible' && estiloDoPai.overflowY === 'visible') continue;
            const limite = pai.getBoundingClientRect();
            if (caixa.left - folga < limite.left - 0.5 || caixa.top - folga < limite.top - 0.5
              || caixa.right + folga > limite.right + 0.5 || caixa.bottom + folga > limite.bottom + 0.5) cortadoPor = pai.id || pai.tagName;
          }
          return { cor: css.outlineColor, estilo: css.outlineStyle, nome: el.getAttribute('aria-label') || el.textContent.trim() || el.id, cortadoPor };
        });
        const razao = razaoDeContraste(cor, fundo);
        if (estilo === 'none' || razao < 3) fracos.push(`${rotulo}: ${estilo} ${razao.toFixed(2)}:1`);
        if (cortadoPor) fracos.push(`${rotulo}: anel cortado por ${cortadoPor}`);
      }
      expect(fracos).toEqual([]);
    });
  }

  for (const [tema, nome] of [['light', 'claro'], ['dark', 'escuro']]) {
    test(`no menu da conta (claro, dentro da barra), o anel contrasta com o menu, no tema ${nome}`, async ({ page }) => {
      await abrirComExemplo(page);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      const botao = page.locator('#btn-menu-conta');
      await botao.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.locator('#menu-conta')).toBeVisible();
      const fundo = await page.locator('#menu-conta').evaluate(el => getComputedStyle(el).backgroundColor);
      const itens = page.locator('#menu-conta button:visible');
      expect(await itens.count()).toBeGreaterThan(0);
      for (let i = 0; i < await itens.count(); i++) {
        const item = itens.nth(i);
        await item.focus();
        await page.keyboard.press('Shift');
        const { visivel, cor, nome: rotulo } = await item.evaluate(el => ({ visivel: el.matches(':focus-visible'), cor: getComputedStyle(el).outlineColor, nome: el.textContent.trim() }));
        expect(visivel, rotulo).toBe(true);
        expect(razaoDeContraste(cor, fundo), rotulo).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test('o rótulo da data mostra o foco em todas as paradas do Tab dentro do campo da data', async ({ page }) => {
    await abrirComExemplo(page);
    await page.locator('#dt-ant').focus();
    await page.keyboard.press('Tab');
    let paradas = 0;
    while (paradas < 8 && await page.evaluate(() => document.activeElement.id === 'dt')) {
      expect(await page.locator('.topo-data-campo').evaluate(el => getComputedStyle(el).outlineStyle), `parada ${paradas + 1}`).toBe('solid');
      paradas++;
      await page.keyboard.press('Tab');
    }
    expect(paradas).toBeGreaterThan(0);
  });
});

// WCAG 1.4.10: a 320 px de largura (o celular pequeno, ou 1280 px com zoom de 400%), nenhuma aba rola de lado
test.describe('Telas de 320 px', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('nenhuma aba rola de lado', async ({ page }) => {
    await abrirComExemplo(page);
    const abas = await page.locator('#nav button[data-t]:visible').evaluateAll(bs => bs.map(b => b.dataset.t));
    expect(abas.length).toBeGreaterThan(5);
    const largas = [];
    for (const aba of abas) {
      await irPara(page, aba);
      const largura = await page.evaluate(() => document.documentElement.scrollWidth);
      if (largura > 320) largas.push(`${aba}: ${largura}px`);
    }
    expect(largas).toEqual([]);
  });

  test('na virada do ano, a data com o ano e o "amanhã" também aparece inteira', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-12-31T12:00:00-03:00'));
    await abrirComExemplo(page);
    const rotulo = page.locator('#dt-rotulo');
    await expect(rotulo).toHaveText('sex., 01/01/2027', { useInnerText: true });
    await expect(page.locator('#dt-rel')).toHaveText('amanhã');
    expect(await rotulo.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('a data aparece inteira, com o dia da semana abreviado', async ({ page }) => {
    await abrirComExemplo(page);
    const rotulo = page.locator('#dt-rotulo');
    expect(await rotulo.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(rotulo).toHaveText('qua., 11/11', { useInnerText: true });
  });
});

test('na tela grande, o dia da semana aparece por extenso', async ({ page }) => {
  await abrirComExemplo(page);
  await expect(page.locator('#dt-rotulo .dt-semana')).toBeVisible();
  await expect(page.locator('#dt-rotulo .dt-semana')).toHaveText('quarta-feira');
  await expect(page.locator('#dt-rotulo .dt-semana-curta')).toBeHidden();
});

// Entre o celular e a tela grande, a barra do topo não pode sobrepor a data e as ferramentas. No modo compartilhado, as
// ferramentas levam o nome da conta (mais largas)
test.describe('A barra do topo nas larguras intermediárias', () => {
  for (const [largura, modo] of [[641, 'local'], [700, 'local'], [820, 'local'], [900, 'local'], [1024, 'local'], [1029, 'compartilhado'],
    [1030, 'compartilhado'], [1110, 'local'], [1280, 'local'], [1289, 'compartilhado'], [1290, 'compartilhado']]) {
    test(`a ${largura} px (modo ${modo}), nada na barra cobre a marca, as setas da data ou as ferramentas`, async ({ page, context }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      if (modo === 'local') await abrirComExemplo(page);
      else {
        await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), '2026-11-11'));
        await entrar(page, CONTAS.operador);
      }
      // O que está no meio de cada um é ele mesmo (nada por cima): a marca, as setas da data e as ferramentas
      for (const seletor of ['.topo-titulo', '#dt-ant', '#dt-prox', '#btn-open-log', '#btn-manual', '#btn-menu-conta']) {
        const noMeio = await page.locator(seletor).evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        expect(noMeio, seletor).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura);
    });
  }
});

// No celular, os botões do topo mostram só o ícone: o nome continua o da palavra escondida (e não só o número do selo)
test.describe('Os botões do topo no celular', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('o Histórico e o Manual mantêm o nome para o leitor de tela', async ({ page }) => {
    await abrirComExemplo(page);
    await expect(page.locator('#btn-open-log')).toHaveAccessibleName(/^Histórico/);
    await expect(page.locator('#btn-manual')).toHaveAccessibleName('Manual');
    await expect(page.locator('#btn-open-log .hd-txt')).not.toBeInViewport({ ratio: 0.5 });
  });
});

// Da tela média para cima, o Tab passa pelos controles da barra na ordem em que eles aparecem, linha por linha
test.describe('A ordem do Tab na barra do topo', () => {
  for (const largura of [700, 900, 1029, 1100, 1400]) {
    test(`a ${largura} px, cada controle da barra fica na mesma linha ou abaixo do anterior`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await abrirComExemplo(page);
      const linhas = await page.locator('header.topo').evaluate(topo => [...topo.querySelectorAll('button, select, input')]
        .filter(el => el.checkVisibility() && !el.closest('#menu-conta, nav')).map(el => [el.id || el.className, Math.round(el.getBoundingClientRect().top)]));
      for (let i = 1; i < linhas.length; i++) expect(linhas[i][1], `${linhas[i][0]} depois de ${linhas[i - 1][0]}`).toBeGreaterThanOrEqual(linhas[i - 1][1] - 6);
    });
  }
});

// Um nome de conta longo termina em reticências e não empurra as ferramentas para cima da marca
test.describe('Um nome de conta longo', () => {
  for (const largura of [1030, 1289]) {
    test(`a ${largura} px, o nome é cortado e a marca continua à vista`, async ({ page, context }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      const nome = 'Maria Aparecida dos Santos Albuquerque de Oliveira Figueiredo Pereira da Silva';
      await instalarSupabaseFalso(context, { ...documentosAtuais(comExemplo(estadoSintetico()), '2026-11-11'), nomes: { [CONTAS.operador.id]: nome } });
      await entrar(page, CONTAS.operador);
      await expect(page.locator('#usuario b')).toHaveText(nome);
      expect(await page.locator('#usuario b').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await page.locator('.topo-titulo').evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      })).toBe(true);
    });
  }
});

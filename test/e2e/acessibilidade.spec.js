// Acessibilidade: cada botão e cada campo tem um nome para o leitor de tela, e nenhum se chama só "✕" (que o leitor
// lê como "multiplicação"). Vale para todas as abas, o Histórico e o painel de habilitações.
import { test, expect, abrir, abrirComExemplo, irPara, entrar, abrirEscala, confirmar, prepararContexto, vigiarErros } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { comExemplo } from '../helpers/exemplo.js';
import { estadoSintetico } from '../helpers/estado.js';
import { razaoDeContraste } from '../helpers/contraste.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

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
    for (const aba of ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'cur', 'rod', 'bi']) {
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
        const { visivel, estilo, cor, nome: rotulo } = await item.evaluate(el => ({
          visivel: el.matches(':focus-visible'), estilo: getComputedStyle(el).outlineStyle,
          cor: getComputedStyle(el).outlineColor, nome: el.textContent.trim()
        }));
        expect(visivel, rotulo).toBe(true);
        // Primeiro, o anel existe: sem ele (outline none), o navegador continua informando uma cor
        expect(estilo, rotulo).not.toBe('none');
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

// Quem usa o teclado continua no mesmo lugar depois de uma ação: a tela é redesenhada, mas o foco volta para o campo ou o
// botão equivalente (antes, ele caía no <body> e o próximo Tab recomeçava do topo)
test.describe('O foco depois de uma ação', () => {
  const emFoco = page => page.evaluate(() => {
    const el = document.activeElement;
    return el === document.body ? 'body' : `${el.tagName.toLowerCase()}${['data-f', 'data-a', 'data-act', 'data-fkey', 'data-id', 'id'].filter(a => el.hasAttribute(a)).map(a => `[${a}="${el.getAttribute(a)}"]`).join('')}`;
  });

  test('o status mudado pelo teclado na lista da Escala', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const status = page.locator('#out select[data-f="fstatus"]').first();
    const fkey = await status.getAttribute('data-fkey');
    await status.focus();
    await status.selectOption('Em Voo');
    await expect(page.locator(`#out select[data-fkey="${fkey}"]`)).toHaveValue('Em Voo');
    expect(await emFoco(page)).toBe(`select[data-f="fstatus"][data-fkey="${fkey}"]`);
  });

  test('o Voa da Demanda (a linha que some com "Só quem voa" passa o foco para a seguinte) e a disponibilidade em Recursos', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    const voando = page.locator('#dem tr[data-k="d"]:not(.off)');
    // As missões extras do aluno saem junto com a principal: o foco vai para o Voa do próximo aluno
    const ids = await voando.evaluateAll(linhas => linhas.map(l => l.dataset.id));
    const [primeira, segunda] = [ids[0], ids.find(id => id !== ids[0])];
    await voando.nth(0).locator('input[data-f="fly"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator(`#dem tr[data-k="d"][data-id="${primeira}"][data-mid="0"]`)).toBeHidden();
    await expect(page.locator(`#dem tr[data-k="d"][data-id="${segunda}"] input[data-f="fly"]`).first()).toBeFocused();
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-a="av"][data-id="PR-BTB"]').focus();
    await page.keyboard.press('Space');
    expect(await emFoco(page)).toBe('input[data-a="av"][data-id="PR-BTB"]');
  });

  test('o diálogo do Atrasado devolve o foco ao status do voo, desistido ou confirmado (com a lista redesenhada)', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const status = page.locator('#out select[data-f="fstatus"]').first();
    const fkey = await status.getAttribute('data-fkey');
    const dialogo = page.locator('#dlg-status');
    await status.focus();
    await status.selectOption('Atrasado');
    await dialogo.getByRole('button', { name: 'Voltar' }).click();
    await expect(dialogo).toBeHidden();
    expect(await emFoco(page)).toBe(`select[data-f="fstatus"][data-fkey="${fkey}"]`);
    // Confirmado: o status muda e a lista é redesenhada; o foco fica no status do mesmo voo
    await status.selectOption('Atrasado');
    const [h, m] = (await page.locator('#dlg-status-voo').textContent()).match(/(\d\d):(\d\d)–/).slice(1).map(Number);
    const novo = h * 60 + m + 30;
    await page.locator('#st-novo').fill(`${String(Math.floor(novo / 60)).padStart(2, '0')}:${String(novo % 60).padStart(2, '0')}`);
    await dialogo.getByRole('button', { name: 'Confirmar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.locator(`#out select[data-fkey="${fkey}"]`)).toHaveValue('Atrasado');
    expect(await emFoco(page)).toBe(`select[data-f="fstatus"][data-fkey="${fkey}"]`);
  });

  test('o popup do mapa: Enter na barra leva o foco para ele, e Tab depois do último controle volta para a barra', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('[data-tl="eq"]').click();
    const barra = page.locator('#out .tl-bar').first();
    await barra.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#tl-pop')).toBeVisible();
    // O primeiro controle do popup é o instrutor (o nome abre a lista para trocar); depois, o status
    await expect(page.locator('#tl-pop [data-act="trocar-instrutor"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#tl-pop select[data-f="fstatus"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    const controles = await page.locator('#tl-pop select, #tl-pop button').count();
    for (let i = 0; i < controles; i++) await page.keyboard.press('Tab');
    await expect(page.locator('#tl-pop')).toBeHidden();
    await expect(barra).toBeFocused();
  });

  test('fechar o Histórico devolve o foco ao botão; o Manual leva o foco ao título dele', async ({ page }) => {
    await abrirComExemplo(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#btn-fechar-historico')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-open-log')).toBeFocused();
    await page.locator('#btn-manual').click();
    await expect(page.locator('#s-manual h2').first()).toBeFocused();
  });

  test('o ✕ que tira o voo da escala, com o Enter dado duas vezes ou segurado, tira um voo só; o foco fica na linha que ficou no lugar', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const xs = page.locator('#out .tabela-escala button[data-act="rm-fly"]');
    const antes = await xs.count();
    await xs.nth(2).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(xs).toHaveCount(antes - 1);
    // O foco fica na linha, que não faz nada com o Enter, e continua nela depois de outro redesenho
    const naLinha = () => page.evaluate(() => document.activeElement.matches('#out tbody tr[data-foco-neutro]'));
    expect(await naLinha()).toBe(true);
    await page.evaluate(() => import('./js/views/escala.js').then(m => m.rOut()));
    expect(await naLinha()).toBe(true);
    // Segurado: o primeiro keydown e as repetições da tecla
    await xs.nth(2).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(xs).toHaveCount(antes - 2);
  });

  test('com o Enter dado de novo, o Reverter não reverte outra alteração, e quem subiu ao topo do Rodízio fica lá', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'rec');
    // Três alterações que o Histórico desfaz: três recursos postos em manutenção
    const disponiveis = page.locator('#eqs input[data-a="av"]:checked');
    for (let i = 0; i < 3; i++) { await disponiveis.first().focus(); await page.keyboard.press('Space'); }
    await page.locator('#btn-open-log').click();
    const reverter = page.locator('#audit-log-list button[data-act="rev-log"]');
    await expect(reverter).toHaveCount(3);
    await reverter.first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(reverter).toHaveCount(2);
    await page.keyboard.press('Escape');
    // O Rodízio: o 2º da fila sobe para o 1º; o Enter de novo (o Subir dele ficou desligado) não o tira de lá
    await irPara(page, 'rod');
    const categoria = await page.locator('#rodizio .pn[data-cat]').evaluateAll(ps => ps.find(p => p.querySelectorAll('li').length >= 3).dataset.cat);
    const fila = page.locator(`#rodizio .pn[data-cat="${categoria}"] li`);
    const segundo = await fila.nth(1).getAttribute('data-id');
    await fila.nth(1).locator('[data-act="fila-subir"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(fila.first()).toHaveAttribute('data-id', segundo);
    // O foco fica com quem subiu (o item dele), e não com quem desceu
    expect(await page.evaluate(() => document.activeElement.dataset.id)).toBe(segundo);
  });

  test('num navegador sem checkVisibility (Safari antes do 17.4), mudar um status grava, redesenha e mantém o foco', async ({ page }) => {
    await page.addInitScript(() => { delete Element.prototype.checkVisibility; });
    await abrirComExemplo(page);
    await abrirEscala(page);
    const status = page.locator('#out select[data-f="fstatus"]').nth(2);
    const fkey = await status.getAttribute('data-fkey');
    await status.focus();
    await status.selectOption('Em Voo');
    await expect(page.locator(`#out select[data-fkey="${fkey}"]`)).toHaveClass(/\bst-EmVoo\b/);
    expect(await emFoco(page)).toBe(`select[data-f="fstatus"][data-fkey="${fkey}"]`);
    await page.reload();
    await abrirEscala(page);
    await expect(page.locator(`#out select[data-fkey="${fkey}"]`)).toHaveValue('Em Voo');
  });

  test('um clique num texto da tabela e Tab: o foco segue dali, e não do topo', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const linha = page.locator('#out .tabela-escala tbody tr:not(.win)').nth(5);
    await linha.locator('td.c-aluno b').click();
    await page.keyboard.press('Tab');
    const fkey = await linha.locator('select[data-f="fstatus"]').getAttribute('data-fkey');
    expect(await emFoco(page)).toBe(`select[data-f="fstatus"][data-fkey="${fkey}"]`);
  });

  test('o foco devolvido depois de um redesenho não rola a página até ele', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#out select[data-f="fstatus"]').first().focus();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    const antes = await page.evaluate(() => scrollY);
    expect(antes).toBeGreaterThan(300);
    // Um redesenho que chega depois (outra alteração, a resposta do servidor)
    await page.evaluate(() => import('./js/views/escala.js').then(m => m.rOut()));
    expect(await page.evaluate(() => scrollY)).toBe(antes);
    await expect(page.locator('#out select[data-f="fstatus"]').first()).toBeFocused();
  });

  // O Tab que sai de um campo digitado: o change chega com o foco já fora do campo, e a linha é redesenhada
  const vizinho = page => page.evaluate(() => {
    const el = document.activeElement;
    if (el === document.body) return 'body';
    const tr = el.closest('tr');
    return `${el.tagName.toLowerCase()}[${el.dataset.f || el.dataset.a || el.dataset.act || ''}] linha=${tr ? `${tr.dataset.id || tr.dataset.r || ''}/${tr.dataset.mid || ''}` : '-'}`;
  });
  for (const [nome, aba, seletor, valores] of [['a duração na Demanda', 'dem', '#dem tr[data-k="d"]:not(.off) input[data-f="nb"]', ['1.5', '2']],
    ['as horas em Recursos', 'rec', '#revisao input[data-a="horas"]', ['20', '21']]]) {
    test(`digitar ${nome} e sair com Tab ou Shift+Tab leva ao mesmo vizinho que sem digitar, com a linha redesenhada`, async ({ page }) => {
      await abrirComExemplo(page);
      await irPara(page, aba);
      const campo = page.locator(seletor).nth(2);
      for (const [i, tecla] of ['Tab', 'Shift+Tab'].entries()) {
        await campo.focus();
        await page.keyboard.press(tecla);
        const semDigitar = await vizinho(page);
        await campo.fill(valores[i]);
        await page.keyboard.press(tecla);
        expect(await vizinho(page), tecla).toBe(semDigitar);
      }
    });
  }

  test('com o Histórico aberto, o Esc dado na busca da Escala fecha a gaveta e o foco fica na busca', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    // O foco vai para a busca sem o clique: dependendo da largura, a gaveta cobre a busca
    const busca = page.locator('#flt-esc-q');
    await busca.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
    await expect(busca).toBeFocused();
  });

  test('aprovar a escala leva o foco ao Reabrir, e reabrir, ao Aprovar', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await confirmar(page, '#btn-aprovar');
    await expect(page.locator('#btn-reabrir')).toBeFocused();
    await confirmar(page, '#btn-reabrir');
    await expect(page.locator('#btn-aprovar')).toBeFocused();
  });
});

// O texto e o fundo que aparece atrás dele: as camadas semitransparentes somadas, de baixo para cima
const coresDoTexto = locator => locator.evaluate(el => {
  const canais = cor => /rgba?\(([^)]+)\)/.exec(cor)[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const camadas = [];
  for (let no = el; no; no = no.parentElement) camadas.unshift(getComputedStyle(no).backgroundColor);
  let fundo = [255, 255, 255];
  for (const camada of camadas) {
    const [r, g, b, a = 1] = canais(camada);
    fundo = [r, g, b].map((v, i) => v * a + fundo[i] * (1 - a));
  }
  return { texto: getComputedStyle(el).color, fundo: `rgb(${fundo.map(Math.round).join(', ')})` };
});
// Os textos sem o contraste mínimo da WCAG para texto normal (4,5:1), com o rótulo de cada um
const contrastesFracos = async (itens) => {
  const fracos = [];
  for (const [rotulo, locator] of itens) {
    const { texto, fundo } = await coresDoTexto(locator);
    const razao = razaoDeContraste(texto, fundo);
    if (razao < 4.5) fracos.push(`${rotulo}: ${razao.toFixed(2)}:1 (${texto} sobre ${fundo})`);
  }
  return fracos;
};

// O que a tela mostra pela cor ou pela posição também é dito ao leitor de tela; o teclado chega aonde o mouse chega
test.describe('O leitor de tela e o teclado', () => {
  test('a aba aberta (e o Manual), a vista escolhida e o dia da agenda são ditos, não só coloridos', async ({ page }) => {
    await abrirComExemplo(page);
    const atual = page.locator('[aria-current="page"]');
    await expect(atual).toHaveAttribute('data-t', 'esc');
    await irPara(page, 'dem');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveAttribute('data-t', 'dem');
    await page.locator('#btn-manual').click();
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveId('btn-manual');
    // A vista escolhida fica "pressionada"; as outras, não
    await abrirEscala(page);
    await expect(page.locator('#s-esc [data-tl][aria-pressed="true"]')).toHaveAttribute('data-tl', 'lista');
    await page.locator('#s-esc [data-tl="eq"]').click();
    await expect(page.locator('#s-esc [data-tl][aria-pressed="true"]')).toHaveAttribute('data-tl', 'eq');
    await expect(page.locator('#s-esc [data-tl][aria-pressed="false"]')).toHaveCount(3);
    await irPara(page, 'ins');
    await page.locator('[data-vista-ins="cadastro"]').click();
    await expect(page.locator('[data-vista-ins][aria-pressed="true"]')).toHaveAttribute('data-vista-ins', 'cadastro');
    // Cursos é uma aba, não uma vista de Alunos: a aba aberta é a atual
    await irPara(page, 'cur');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveAttribute('data-t', 'cur');
    // O dia escolhido no calendário da agenda, e o que passa a ser escolhido
    await irPara(page, 'age');
    const escolhido = page.locator('#agenda-cal [aria-current="date"]');
    await expect(escolhido).toHaveCount(1);
    await expect(escolhido).toHaveClass(/\bsel\b/);
    const outro = page.locator('#agenda-cal [data-cal="dia"]:not(.sel):not(.fora)').first();
    const dia = await outro.getAttribute('data-dia');
    await outro.click();
    await expect(escolhido).toHaveAttribute('data-dia', dia);
  });

  test('o pedido de confirmação é dito na região de status (o nome trocado do botão nem sempre é lido)', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const anuncio = page.locator('#anuncio');
    await expect(anuncio).toHaveAttribute('role', 'status');
    await expect(anuncio).toBeEmpty();
    // Um botão com texto e um ✕ com nome próprio (o do aluno): o anúncio é o nome do botão armado
    const aprovar = page.locator('#btn-aprovar');
    await aprovar.click();
    await expect(anuncio).toHaveText('Confirmar aprovação. Para confirmar, acione o botão de novo.');
    await irPara(page, 'alu');
    const x = page.locator('#alu [data-act="dels"]').first();
    const nome = await x.getAttribute('aria-label');
    await x.click();
    await expect(x).toHaveClass(/\barm\b/);
    await expect(anuncio).toHaveText(`Confirmar: ${nome}. Para confirmar, acione o botão de novo.`);
  });

  test('o menu da conta: as setas, Home e End andam pelos itens; o Tab que sai do menu o fecha', async ({ page, context }) => {
    await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), '2026-11-11'));
    await entrar(page, CONTAS.administrador);
    const botao = page.locator('#btn-menu-conta');
    await botao.focus();
    await page.keyboard.press('Enter');
    const itens = page.locator('#menu-conta [role^="menuitem"]:visible');
    await expect(itens).toHaveCount(4);
    expect(await itens.evaluateAll(els => els.map(el => el.getAttribute('aria-label') || el.textContent.trim())))
      .toEqual(['Minha conta', 'Usuários', 'Tema escuro', 'Sair']);
    await expect(itens.nth(0)).toBeFocused();
    for (const [tecla, item] of [['ArrowDown', 1], ['End', 3], ['ArrowDown', 0], ['ArrowUp', 3], ['ArrowUp', 2], ['Home', 0]]) {
      await page.keyboard.press(tecla);
      await expect(itens.nth(item), tecla).toBeFocused();
    }
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await expect(page.locator('#menu-conta')).toBeHidden();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    // Shift+Tab do botão (com o menu aberto) também sai e fecha
    await botao.click();
    await expect(itens.nth(0)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(botao).toBeFocused();
    await expect(page.locator('#menu-conta')).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#menu-conta')).toBeHidden();
  });

  test('o Esc fecha só a camada de cima: com o menu da conta aberto, o primeiro fecha a dica aberta pelo mouse', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const botao = page.locator('#btn-menu-conta');
    await botao.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu-conta')).toBeVisible();
    await page.locator('#out [data-dica]:not(select):not(button)').first().hover();
    await expect(page.locator('#dica')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dica')).toBeHidden();
    await expect(page.locator('#menu-conta')).toBeVisible();
  });

  test('o Esc fecha só a camada de cima: com o Histórico aberto, o primeiro fecha o menu da conta, o segundo, a gaveta', async ({ page }) => {
    await abrirComExemplo(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    const botao = page.locator('#btn-menu-conta');
    await botao.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu-conta')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-conta')).toBeHidden();
    await expect(botao).toBeFocused();
    await expect(page.locator('#historico')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
  });

  test('o Esc fecha só a camada de cima: com o Histórico aberto, o primeiro fecha o diálogo do status, o segundo, a gaveta', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    // O status muda sem o clique (dependendo da largura, a gaveta cobre a lista): o foco fica no ✕ da gaveta. Com o foco
    // no status, a volta do foco depois do Esc abriria a dica dele, uma camada a mais (o 2º Esc fecharia a dica)
    const status = page.locator('#out select[data-f="fstatus"]').first();
    const fkey = await status.getAttribute('data-fkey');
    const anterior = await status.inputValue();
    await status.selectOption('Cancelado');
    const dialogo = page.locator('#dlg-status');
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(page.locator('#historico')).toBeVisible();
    // Desistir deixa o status anterior, e o foco volta para o ✕ da gaveta
    await expect(page.locator(`#out select[data-fkey="${fkey}"]`)).toHaveValue(anterior);
    await expect(page.locator('#btn-fechar-historico')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
    await expect(page.locator('#btn-open-log')).toBeFocused();
  });

  test('o Esc fecha só a camada de cima: com o Histórico aberto, o primeiro fecha o popup do mapa, o segundo, a gaveta', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="eq"]').click();
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    // O popup abre pelo teclado (dependendo da largura, a gaveta cobre a barra), com o foco nele
    const barra = page.locator('#out .tl-bar').first();
    await barra.focus();
    await page.keyboard.press('Enter');
    const popup = page.locator('#tl-pop');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(barra).toBeFocused();
    await expect(page.locator('#historico')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
  });

  test('o Esc fecha só a camada de cima: as habilitações, abertas em Instrutores, continuam abertas na Escala quando o Esc fecha o diálogo do status', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await page.locator('#inst [data-act="editar-habs"]').first().click();
    const painel = page.locator('#painel-instrutor');
    await expect(painel).toBeVisible();
    // O painel continua aberto nas outras abas
    await abrirEscala(page);
    await expect(painel).toBeVisible();
    await page.locator('#out select[data-f="fstatus"]').first().selectOption('Cancelado');
    const dialogo = page.locator('#dlg-status');
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(painel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
  });

  // Qualquer diálogo é a camada de cima, não só o do status: o da sessão expirada aparece sozinho, na gravação, e o Esc
  // não o fecha. A gravação com a sessão expirada responde 401 de propósito
  test('o Esc fecha só a camada de cima: com o diálogo da sessão aberto sobre o popup do mapa, nem o Esc nem um clique no diálogo fecham o popup', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), '2026-11-11'));
    const page = await context.newPage();
    const erros = vigiarErros(page, { statusEsperados: [401] });
    await entrar(page, CONTAS.operador);
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="eq"]').click();
    await page.locator('#out .tl-bar').first().click();
    const popup = page.locator('#tl-pop');
    await expect(popup).toBeVisible();
    servidor.expirarSessoes();
    await popup.locator('select[data-f="fstatus"]').selectOption('Em Voo');
    const sessao = page.locator('#dlg-sessao');
    await expect(sessao).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sessao).toBeVisible();
    await expect(popup).toBeVisible();
    await page.locator('#sessao-senha').click();
    await expect(popup).toBeVisible();
    await page.locator('#sessao-senha').fill(CONTAS.operador.senha);
    await page.locator('#sessao-entrar').click();
    await expect(sessao).toBeHidden();
    await expect(popup).toBeVisible();
    await expect(popup.locator('select[data-f="fstatus"]')).toHaveValue('Em Voo');
    expect(erros).toEqual([]);
    await context.close();
  });

  for (const [tema, nome] of [['light', 'claro'], ['dark', 'escuro']]) {
    test(`os textos sobre cor (os status, o ✕ armado, o botão do popup, o selo da aprovação) contrastam, no tema ${nome}`, async ({ page }) => {
      await abrirComExemplo(page);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      await abrirEscala(page);
      const fracos = [];
      const conferir = async (rotulo, locator) => fracos.push(...await contrastesFracos([[rotulo, locator]]));
      const status = page.locator('#out select[data-f="fstatus"]');
      await status.nth(0).selectOption('Em Voo');
      await status.nth(1).selectOption('Pousou');
      await conferir('Em Voo', page.locator('#out .st-sel.st-EmVoo').first());
      await conferir('Pousou', page.locator('#out .st-sel.st-Pousou').first());
      await page.locator('#s-esc [data-tl="eq"]').click();
      await page.locator('#out .tl-bar').first().click();
      await conferir('botão do popup', page.locator('#tl-pop .tl-pop-btn'));
      await page.keyboard.press('Escape');
      await confirmar(page, '#btn-aprovar');
      await conferir('selo da aprovação', page.locator('#selo-aprovada'));
      await irPara(page, 'alu');
      const x = page.locator('#alu [data-act="dels"]').first();
      await x.click();
      await expect(x).toHaveClass(/\barm\b/);
      await conferir('✕ armado', x);
      expect(fracos).toEqual([]);
    });

    test(`o selo vermelho da aba (missões que não entraram na escala) contrasta, no tema ${nome}`, async ({ page }) => {
      await abrir(page, { estado: cenario({ ins: [instrutor(1, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' })] }) });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      await expect(page.locator('#selo-esc')).toHaveClass(/\berro\b/);
      expect(await contrastesFracos([['selo da aba', page.locator('#selo-esc')]])).toEqual([]);
    });
  }

  test('as barras do mapa dizem o status do voo (não só a cor)', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#out select[data-f="fstatus"]').first().selectOption('Em Voo');
    await page.locator('#s-esc [data-tl="eq"]').click();
    const barras = page.locator('#out .tl-bar');
    expect(await barras.count()).toBeGreaterThan(1);
    const ditos = await barras.evaluateAll(bs => bs.map(b => b.querySelector('.sr')?.textContent ?? ''));
    for (const dito of ditos) expect(dito).toMatch(/^, (Pendente|Confirmado|Atrasado|Em Voo|Pousou|Concluída|Cancelado)$/);
    expect(ditos).toContain(', Em Voo');
  });

  test('o primeiro Tab da página é o link para pular ao conteúdo, e o Tab seguinte já é dentro do conteúdo', async ({ page }) => {
    await abrirComExemplo(page);
    const pular = page.locator('a.pular');
    await expect(pular).not.toBeInViewport();
    await page.locator('body').focus();
    await page.keyboard.press('Tab');
    await expect(pular).toBeFocused();
    await expect(pular).toBeInViewport();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('main').contains(document.activeElement))).toBe(true);
  });

  test('os anúncios: a data do topo ao mudar, quantos voos ficaram com os filtros e o diálogo do status descrito pelo voo', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await expect(page.locator('#dt-rotulo')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.topo-data-campo svg.ico')).toHaveAttribute('aria-hidden', 'true');
    // O filtro muda a lista sem tirar o foco dele: o resultado vai para a região de status
    const busca = page.locator('#flt-esc-q');
    await busca.fill('zzzz');
    await expect(page.locator('#out')).toContainText('Nenhum voo na escala com esses filtros.');
    await expect(page.locator('#anuncio')).toHaveText('Nenhum voo na escala com esses filtros.');
    await busca.fill('');
    await expect(page.locator('#anuncio')).toHaveText(/^\d+ voos na escala com esses filtros\.$/);
    await expect(busca).toBeFocused();
    // Abrir o diálogo do Atrasado: a descrição dele é o voo
    const status = page.locator('#out select[data-f="fstatus"]').first();
    await status.selectOption('Atrasado');
    await expect(page.locator('#dlg-status')).toBeVisible();
    await expect(page.locator('#dlg-status')).toHaveAccessibleDescription(await page.locator('#dlg-status-voo').textContent());
    await expect(page.locator('#dlg-status-voo')).not.toBeEmpty();
    await page.locator('#dlg-status').getByRole('button', { name: 'Voltar' }).click();
  });
});

// No celular (390 px): a escala em cartões, um por voo, e nenhuma aba rola para o lado.
import { test, expect, abrir, abrirComExemplo, abrirEscala, irPara, irParaVista, confirmar, percorrerVistasEFiltros, filtrarHabilitacoes, filtrarCursos, AMANHA } from './fixtures.js';
import { documentosAtuais } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { cursosIniciais, gravarCurso } from '../../js/programa.js';

test.use({ viewport: { width: 390, height: 844 } });

const larguraDaPagina = page => page.evaluate(() => document.documentElement.scrollWidth);

// Controles da aba aberta e do topo com área de toque menor que 44 px (a caixa de seleção conta com o rótulo que a
// envolve; links no meio do texto ficam de fora)
const alvosPequenos = page => page.evaluate(() => {
  const secao = document.querySelector('main section.on');
  const controles = [...document.querySelectorAll('.topo button, .topo select, .topo input, #nav button'),
    ...secao.querySelectorAll('button, select, input, summary, a[href]')];
  const pequenos = new Set();
  for (const el of controles) {
    if (!el.checkVisibility({ visibilityProperty: true }) || el.matches('p a, .sr')) continue;
    const alvo = el.matches('input[type=checkbox]') ? (el.closest('label') || el) : el;
    const { width, height } = alvo.getBoundingClientRect();
    if (height < 44 || (!el.matches('select, input:not([type=checkbox]), summary') && width < 44)) {
      pequenos.add(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.dataset.f ? `[data-f=${el.dataset.f}]` : ''}${el.dataset.act ? `[data-act=${el.dataset.act}]` : ''} ${Math.round(width)}×${Math.round(height)}`);
    }
  }
  return [...pequenos];
});

test.describe('Celular', () => {
  test('nenhuma aba rola para o lado; o mapa rola dentro do próprio painel', async ({ page }) => {
    await abrirComExemplo(page);
    for (const aba of ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'cur', 'rod', 'bi']) {
      await irPara(page, aba);
      expect(await larguraDaPagina(page), `aba ${aba}`).toBeLessThanOrEqual(390);
    }
    await irPara(page, 'esc');
    for (const vista of ['eq', 'ins']) {
      await page.locator(`#s-esc [data-tl="${vista}"]`).click();
      await expect(page.locator('#out .mapa')).toBeVisible();
      expect(await larguraDaPagina(page), `mapa ${vista}`).toBeLessThanOrEqual(390);
    }
    await page.locator('#s-esc [data-tl="painel"]').click();
    await expect(page.locator('#out .painel-dia')).toBeVisible();
    expect(await larguraDaPagina(page), 'painel').toBeLessThanOrEqual(390);
    // As outras vistas e as tabelas sem nenhum com os filtros
    await percorrerVistasEFiltros(page, async tela => expect(await larguraDaPagina(page), tela).toBeLessThanOrEqual(390));
  });

  test('botões e campos com pelo menos 44 px para o dedo, em todas as abas', async ({ page }) => {
    await abrirComExemplo(page);
    for (const aba of ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'cur', 'rod', 'bi']) {
      await irPara(page, aba);
      expect(await alvosPequenos(page), `aba ${aba}`).toEqual([]);
    }
    await percorrerVistasEFiltros(page, async tela => expect(await alvosPequenos(page), tela).toEqual([]));
  });

  // O cadastro no celular (390 e 320 px), em Instrutores e em Alunos: um cartão por pessoa, o mesmo nas duas abas. Cada
  // parte vai para o lugar dela pela classe da célula, e não pela posição (desde a coluna do CANAC, o peso ficava no lugar
  // das habilitações em Instrutores), com o nome da coluna em cima, o mesmo do título dela na tela grande; nada sai do
  // cartão (o "Dados pessoais" e o ✕ saíam dele, em Alunos e, nos 320 px, em Instrutores), e a tabela não rola para o
  // lado. Na tela grande, os nomes não aparecem (a linha dos títulos está lá). Para quem só consulta, "Priorizar com" e
  // "Não escalar com" sem ninguém não aparecem (o nome sozinho, sem nada embaixo)
  test('o cadastro no celular: um cartão por pessoa, as partes no lugar pela classe, com o nome em cima e tudo dentro dele (390 e 320 px)', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { nm: 'Maria Fernanda dos Santos Oliveira' }), instrutor(2, 1)],
      stu: [aluno(1000, {}, { nm: 'João Pedro de Alcântara Albuquerque', curso: 'PP', voaCom: [1], bl: [2] }), aluno(1001)]
    });
    await page.addInitScript(dados => {
      if (!localStorage.getItem('acpm4_dados_pessoais')) localStorage.setItem('acpm4_dados_pessoais', dados);
    }, JSON.stringify({ 'aluno:1000': { canac: '123456' }, 'instrutor:1': { canac: '654321' } }));
    await abrir(page, { estado });
    // Cada cartão: a área de cada célula à vista (pela classe), o nome em cima dela (::before) e o título da coluna, e
    // o que sai do cartão
    const cartoes = corpo => page.locator(`${corpo} tr.cd`).evaluateAll(linhas => linhas.map(linha => {
      const titulos = [...linha.closest('table').tHead.rows[0].cells].map(th => th.textContent.trim());
      const caixa = linha.getBoundingClientRect();
      const celulas = [...linha.cells].filter(td => td.checkVisibility()).map(td => {
        const r = td.getBoundingClientRect();
        return {
          classe: td.classList[0], area: getComputedStyle(td).gridRowStart, base: Math.round(r.bottom), caixa: [r.left, r.top, r.right, r.bottom],
          nome: getComputedStyle(td, '::before').content, titulo: td.dataset.rotulo ? titulos[td.cellIndex] : null, rotulo: td.dataset.rotulo || null
        };
      });
      const fora = [...linha.querySelectorAll('button, input, select, .tg, .habs-resumo, .progresso')].filter(el => el.checkVisibility())
        .filter(el => { const r = el.getBoundingClientRect(); return r.left < caixa.left - 0.5 || r.right > caixa.right + 0.5; })
        .map(el => el.dataset.f || el.dataset.act || el.dataset.dados || el.className);
      // Os controles na ordem do Tab (a do HTML), com o lugar de cada um na tela
      const controles = [...linha.querySelectorAll('button, input, select')].filter(el => el.checkVisibility()).map(el => {
        const r = el.getBoundingClientRect();
        return { nome: el.dataset.f || el.dataset.act || (el.dataset.dados ? 'dados' : el.className), caixa: [r.left, r.top, r.right, r.bottom] };
      });
      return { id: linha.dataset.id, grade: getComputedStyle(linha).display, celulas, fora, controles };
    }));
    const AREAS = {
      inst: { 'c-nome': 'nome', 'c-canac': 'canac', 'c-peso': 'peso', 'c-habs': 'habs', acoes: 'acoes' },
      alu: { 'c-nome': 'nome', 'c-canac': 'canac', 'c-peso': 'peso', 'c-curso': 'curso', 'c-voa-com': 'voa-com', 'c-nao-escalar': 'nao-escalar', acoes: 'acoes' }
    };
    const ORDEM = { inst: [['c-nome'], ['c-peso', 'c-canac'], ['c-habs'], ['acoes']], alu: [['c-nome'], ['c-peso', 'c-canac'], ['c-curso'], ['c-voa-com'], ['c-nao-escalar'], ['acoes']] };
    const conferir = async (corpo, largura) => {
      const lista = await cartoes(`#${corpo}`);
      expect(lista.length, `${largura}: #${corpo}`).toBe(2);
      for (const { id, grade, celulas, fora, controles } of lista) {
        const onde = `${largura}: #${corpo} ${id}`;
        expect(grade, onde).toBe('grid');
        expect(fora, `${onde}: fora do cartão`).toEqual([]);
        // O Tab segue a ordem da tela: cada controle vem depois do anterior, na mesma linha (à direita dele) ou embaixo
        // (o foco não sobe e desce dentro do cartão)
        const foraDaOrdem = controles.slice(1).flatMap((b, i) => {
          const a = controles[i];
          const mesmaLinha = Math.min(a.caixa[3], b.caixa[3]) - Math.max(a.caixa[1], b.caixa[1]) > 1;
          return (mesmaLinha ? b.caixa[0] < a.caixa[2] - 1 : b.caixa[1] < a.caixa[3] - 1) ? [`${a.nome} → ${b.nome}`] : [];
        });
        expect(foraDaOrdem, `${onde}: a ordem do Tab ${JSON.stringify(controles.map(c => c.nome))}`).toEqual([]);
        for (const c of celulas) {
          expect(c.area, `${onde}: ${c.classe}`).toBe(AREAS[corpo][c.classe]);
          // O nome em cima é o do título da coluna
          if (c.rotulo) expect([c.nome, c.rotulo], `${onde}: ${c.classe}`).toEqual([`"${c.titulo}"`, c.titulo]);
        }
        // As linhas do cartão, de cima para baixo (as partes de uma linha ficam alinhadas embaixo): o nome; o peso e o CANAC
        // lado a lado; …; os botões
        const base = classe => (celulas.find(c => c.classe === classe) || {}).base;
        const linhas = ORDEM[corpo].map(grupo => grupo.map(base).filter(t => t !== undefined)).filter(g => g.length);
        expect(linhas.every(g => g.every(t => Math.abs(t - g[0]) <= 1)), `${onde}: ${JSON.stringify(linhas)}`).toBe(true);
        expect(linhas.slice(1).every((g, i) => g[0] > linhas[i][0]), `${onde}: a ordem das linhas ${JSON.stringify(linhas)}`).toBe(true);
        // Nenhuma parte por cima de outra
        const sobrepostas = celulas.flatMap((a, i) => celulas.slice(i + 1).filter(b => Math.min(a.caixa[2], b.caixa[2]) - Math.max(a.caixa[0], b.caixa[0]) > 1
          && Math.min(a.caixa[3], b.caixa[3]) - Math.max(a.caixa[1], b.caixa[1]) > 1).map(b => `${a.classe}/${b.classe}`));
        expect(sobrepostas, `${onde}: partes sobrepostas`).toEqual([]);
      }
      // Em Instrutores, "Editar habilitações" fica numa linha só dele, embaixo das habilitações, em cima dos outros botões
      if (corpo === 'inst') {
        const [editar, dados] = await Promise.all(['[data-act="editar-habs"]', '[data-dados]'].map(b => page.locator(`#inst tr.cd[data-id="1"] ${b}`).boundingBox()));
        expect(editar.y + editar.height, `${largura}: "Editar habilitações" em cima`).toBeLessThanOrEqual(dados.y);
      }
      expect(await page.locator(`#${corpo}`).evaluate(corpo => corpo.closest('.tw').scrollWidth <= corpo.closest('.tw').clientWidth), `${largura}: #${corpo} sem rolar para o lado`).toBe(true);
      expect(await larguraDaPagina(page), `${largura}: a página`).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page), `${largura}: #${corpo}`).toEqual([]);
    };
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await irParaVista(page, 'ins', 'cadastro');
      await expect(page.locator('#inst tr.cd[data-id="1"] .c-canac')).toHaveText('654321');
      await conferir('inst', largura);
      await irPara(page, 'alu');
      await expect(page.locator('#alu tr.cd[data-id="1000"] .c-canac')).toHaveText('123456');
      await conferir('alu', largura);
      // Sem o CANAC, o peso fica sozinho na linha dele (a célula vazia não aparece)
      await expect(page.locator('#alu tr.cd[data-id="1001"] .c-canac')).toBeHidden();
    }
    // Na tela grande, a tabela, com a linha dos títulos: os nomes em cima das partes não aparecem
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('#s-alu thead')).toBeVisible();
    expect(await page.locator('#alu tr.cd[data-id="1000"] td.c-peso').evaluate(td => getComputedStyle(td, '::before').content)).toBe('none');

    // Quem só consulta: sem a lista para escolher, "Priorizar com" e "Não escalar com" sem ninguém não aparecem; com alguém,
    // aparecem, com o nome em cima
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'alu');
    const celula = (id, classe) => page.locator(`#alu tr.cd[data-id="${id}"] td.${classe}`);
    await expect(celula(1001, 'c-voa-com')).toBeHidden();
    await expect(celula(1001, 'c-nao-escalar')).toBeHidden();
    await expect(celula(1000, 'c-voa-com')).toBeVisible();
    await expect(celula(1000, 'c-voa-com').locator('.tg')).toHaveText('Maria Fernanda dos Santos Oliveira', { useInnerText: true });
    await expect(celula(1000, 'c-nao-escalar').locator('.tg')).toHaveText('Instrutor 02', { useInnerText: true });
    // O Gestor não tem nenhum botão no cartão: a parte deles não aparece
    await expect(celula(1000, 'acoes')).toBeHidden();
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
  });

  // O filtro dos cursos no celular (390 e 320 px), em Alunos e na Demanda: o botão fica na linha da busca (em Alunos, como
  // o das habilitações em Instrutores); o painel abre inteiro na tela, com a tabela embaixo dele, e alvos de 44 px
  test('o filtro dos cursos cabe no celular (390 e 320 px), em Alunos e na Demanda: o painel empurra a tabela, com alvos de 44 px', async ({ page }) => {
    await abrirComExemplo(page);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      for (const [aba, busca, tabela] of [['alu', '[data-flt="alu"]', '#s-alu .tw'], ['dem', '#flt-dem', '#s-dem .tw']]) {
        await irPara(page, aba);
        await filtrarCursos(page, aba, ['PP', 'sem-curso'], { fechar: false });
        const [campo, botao, painel, abaixo] = await Promise.all([busca, `#flt-${aba}-cur`, `#flt-${aba}-cur-painel`, tabela].map(seletor => page.locator(seletor).boundingBox()));
        if (aba === 'alu') expect(Math.abs(botao.y + botao.height / 2 - (campo.y + campo.height / 2)), `${largura}: o botão na linha da busca`).toBeLessThan(4);
        expect(botao.x + botao.width, `${largura} ${aba}: o botão na tela`).toBeLessThanOrEqual(largura);
        expect(painel.x, `${largura} ${aba}: o painel na tela`).toBeGreaterThanOrEqual(0);
        expect(painel.x + painel.width, `${largura} ${aba}: o painel na tela`).toBeLessThanOrEqual(largura);
        expect(abaixo.y, `${largura} ${aba}: a tabela embaixo do painel`).toBeGreaterThanOrEqual(painel.y + painel.height);
        expect(await larguraDaPagina(page), `${largura} ${aba}: a página não rola para o lado`).toBeLessThanOrEqual(largura);
        expect(await alvosPequenos(page), `${largura} ${aba}: alvos de 44 px`).toEqual([]);
        await filtrarCursos(page, aba, []);
      }
    }
  });

  // A faixa das abas rola para o lado no celular: a aba aberta pelo "Abrir a Demanda" (Alunos) aparece nela, com a marca
  // da aba aberta à vista (sem isso, a faixa continuava em Alunos, e nenhuma aba à vista parecia aberta)
  test('"Abrir a Demanda" traz a aba Demanda para a parte à vista da faixa das abas', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    const naFaixa = aba => page.locator(`#nav button[data-t="${aba}"]`).evaluate(b => {
      const r = b.getBoundingClientRect(), faixa = b.closest('#nav').getBoundingClientRect();
      return r.left >= faixa.left - 0.5 && r.right <= faixa.right + 0.5;
    });
    // A faixa rolada até o fim, como depois de tocar numa das últimas abas: a Demanda fica fora, à esquerda
    await page.locator('#nav').evaluate(faixa => { faixa.scrollLeft = faixa.scrollWidth; });
    expect(await naFaixa('alu')).toBe(true);
    expect(await naFaixa('dem')).toBe(false);
    await page.getByRole('button', { name: 'Abrir a Demanda' }).click();
    await expect(page.locator('#s-dem h2')).toBeFocused();
    await expect(page.locator('#nav button[data-t="dem"]')).toHaveClass(/\bon\b/);
    await expect.poll(() => naFaixa('dem')).toBe(true);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
  });

  // O filtro das habilitações no celular (390 e 320 px): o botão divide a linha com a busca; o painel abre no fluxo da
  // página, inteiro na largura da tela (a grade desce para baixo dele: nada fica coberto), e as caixas, o "Limpar" e o
  // "?" têm 44 px para o dedo
  test('o filtro das habilitações cabe no celular (390 e 320 px): o painel empurra a grade, com alvos de 44 px', async ({ page }) => {
    await abrirComExemplo(page);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await irPara(page, 'ins');
      await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
      const caixas = await Promise.all(['[data-flt="inst"]', '#flt-ins-hab', '#flt-ins-hab-painel', '#s-ins .vista-dia .tw']
        .map(seletor => page.locator(seletor).boundingBox()));
      const [busca, botao, painel, grade] = caixas;
      expect(Math.abs(botao.y + botao.height / 2 - (busca.y + busca.height / 2)), `${largura}: o botão na linha da busca`).toBeLessThan(4);
      expect(botao.x + botao.width, `${largura}: o botão na tela`).toBeLessThanOrEqual(largura);
      expect(painel.x, `${largura}: o painel na tela`).toBeGreaterThanOrEqual(0);
      expect(painel.x + painel.width, `${largura}: o painel na tela`).toBeLessThanOrEqual(largura);
      expect(grade.y, `${largura}: a grade embaixo do painel`).toBeGreaterThanOrEqual(painel.y + painel.height);
      expect(await larguraDaPagina(page), `${largura}: a página não rola para o lado`).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page), `${largura}: alvos de 44 px`).toEqual([]);
      await filtrarHabilitacoes(page, []);
    }
  });

  // O exemplo não tem programa: aqui, a aba Cursos com missões, um cartão por missão (o Ground, com o recurso e as horas
  // desligados)
  test('a aba Cursos com o programa cabe na tela, com alvos de 44 px', async ({ page }) => {
    const cursos = { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'Ground', mis: 'Ground C152', eq: 'Sala Ground', nb: 1.5 }], PC: [], INVA: [] };
    await abrir(page, { estado: { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), cursos } });
    await irPara(page, 'cur');
    await expect(page.locator('#cursos tr[data-i]')).toHaveCount(2);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
    expect(await alvosPequenos(page)).toEqual([]);
  });

  // O programa em fases (gravado neste navegador, como as tabelas dos cursos o guardam): os cabeçalhos das fases, a
  // missão "Depois de…" com a escolha aberta, a fase de cada missão, as retiradas, os alunos do curso e as alterações
  // também cabem na tela, com alvos de 44 px
  test('a aba Cursos em fases cabe na tela, com as caixas abertas e alvos de 44 px', async ({ page }) => {
    const u = n => `00000000-0000-4000-8013-${String(n).padStart(12, '0')}`;
    const modulo = 'Módulo 01 – Treinamento Duplo Comando';
    const conteudo = {
      nome: 'Piloto Privado', ativo: true,
      fases: [{ id: u(1), nome: 'Fase 1 – Introdução ao Voo', modulo }, { id: u(2), nome: 'Fase 2 – O Controle da Aeronave', modulo, regra: 'depois', requer: [u(1)] }],
      missoes: [
        { id: u(11), fase: u(1), codigo: 'IN-01', nome: 'IN-01', mis: 'Voo Local', eq: 'C152', nb: 1 },
        { id: u(12), fase: u(1), codigo: 'IN-02', nome: 'IN-02', mis: 'Ground C152', eq: 'Sala Ground', nb: 1.5, dispensada: true },
        { id: u(13), fase: u(2), codigo: 'AVP-SOLO-05', nome: 'AV PROF. SOLO 05', mis: 'Voo Local', eq: 'C152', nb: 0.3, regra: 'depois', requer: [u(11), u(12)], avaliacao: true },
        { id: u(14), fase: u(2), codigo: 'CT-09', nome: 'CT-09', mis: 'Voo Local', eq: 'C152', nb: 1 }
      ]
    };
    // A CT-09 tirada do programa: fica nas retiradas
    const comCt09 = gravarCurso({ cursos: cursosIniciais() }, { sigla: 'PP', versaoLida: 1, conteudo, descricao: 'PP: cronograma' });
    const semCt09 = gravarCurso({ cursos: comCt09.cursos }, { sigla: 'PP', versaoLida: 2, conteudo: { ...conteudo, missoes: conteudo.missoes.slice(0, 3) }, descricao: 'PP: CT-09 tirada do programa' });
    const { documentos: { cadastro }, dias } = documentosAtuais(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), AMANHA);
    const docs = {
      acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_cursos: { cursos: semCt09.cursos, alteracoes: [comCt09.alteracao, semCt09.alteracao] }
    };
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm4_cadastro')) return;
      for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
    }, JSON.stringify(docs));
    await page.goto('./');
    await irPara(page, 'cur');
    await expect(page.locator('#cursos .curso[data-curso="PP"] tr[data-i]')).toHaveCount(3);
    for (const resumo of await page.locator('#cursos .curso[data-curso="PP"] summary').all()) await resumo.click();
    await expect(page.locator('#cursos .curso[data-curso="PP"] details[open]')).toHaveCount(5);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
    expect(await alvosPequenos(page)).toEqual([]);
    // Os cursos pela sigla e as fases do índice pelo nome curto; as fases recolhidas, também para quem só consulta, e
    // nos 320 px: a aba continua na tela, com alvos de 44 px
    await expect(page.locator('#cursos .seg-dos-cursos button')).toHaveText(['PP', 'PC', 'INVA'], { useInnerText: true });
    await expect(page.locator('#cursos .indice-das-fases a')).toHaveText(['Fase 1', 'Fase 2'], { useInnerText: true });
    await page.locator('#fases-recolher').click();
    await expect(page.locator('#cursos .curso[data-curso="PP"] tr[data-i]:visible')).toHaveCount(0);
    // Para quem muda, a seta da fase fica na linha do nome dela (não sozinha numa linha acima dele), também nos 320 px
    await expect(page.locator('#cursos .fase-cab .nome-da-fase')).toHaveCount(2);
    const setasForaDaLinha = () => page.locator('#cursos .fase-cab').evaluateAll(cabs => cabs.filter(cab => {
      const nome = cab.querySelector('.nome-da-fase');
      if (!nome) return false;
      const seta = cab.querySelector('.fase-titulo').getBoundingClientRect(), campo = nome.getBoundingClientRect();
      return seta.bottom <= campo.top || campo.bottom <= seta.top;
    }).map(cab => cab.closest('.fase').dataset.fase));
    for (const perfil of ['operador', 'gestor']) {
      await page.locator('#role-sel').selectOption(perfil);
      for (const largura of [390, 320]) {
        await page.setViewportSize({ width: largura, height: 844 });
        for (const fases of ['#fases-abrir', '#fases-recolher']) {
          await page.locator(fases).click();
          expect(await larguraDaPagina(page), `${perfil}, ${largura} px, ${fases}`).toBeLessThanOrEqual(largura);
          expect(await alvosPequenos(page), `${perfil}, ${largura} px, ${fases}`).toEqual([]);
          if (perfil === 'operador') expect(await setasForaDaLinha(), `${largura} px, ${fases}`).toEqual([]);
        }
      }
    }
    // O curso encerrado à mostra: o botão dele, com a marca, também cabe nos 320 px
    await page.locator('#role-sel').selectOption('operador');
    await page.locator('#cur-ver-PC').click();
    await confirmar(page, '#cursos .curso[data-curso="PC"] [data-act="curso-encerrar"]');
    await expect(page.locator('#cur-ver-PC')).toHaveText('PC (encerrado)', { useInnerText: true });
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(320);
    expect(await alvosPequenos(page)).toEqual([]);
  });

  // Com os cursos que o Administrador cria (as siglas com hífen, como PC-IFR) e um encerrado à mostra, os botões dos
  // cursos não encolhem abaixo do texto: a sigla e "(encerrado)" ficam inteiros, e o botão que não cabe vai para a linha de
  // baixo, nos 390 e nos 320 px, para quem muda e para quem só consulta
  test('com muitos cursos, os botões dos cursos ficam inteiros no celular', async ({ page }) => {
    let cursos = cursosIniciais();
    for (const [sigla, nome, ativo] of [['PC-IFR', 'Piloto Comercial IFR', true], ['MLTE', 'Multimotor', false], ['INVA-B', 'Instrutor de Voo (turma B)', true]]) {
      ({ cursos } = gravarCurso({ cursos }, { sigla, versaoLida: 0, conteudo: { nome, ativo, fases: [], missoes: [] }, descricao: `Curso ${sigla} criado: ${nome}` }));
    }
    const { documentos: { cadastro }, dias } = documentosAtuais(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), AMANHA);
    const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_cursos: { cursos, alteracoes: [] } };
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm4_cadastro')) return;
      for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
    }, JSON.stringify(docs));
    await page.goto('./');
    await irPara(page, 'cur');
    await page.locator('#cur-encerrados').check();
    const botoes = page.locator('#cursos .seg-dos-cursos button');
    // O botão com o texto cortado (mais largo que ele), ou com a sigla ou o "(encerrado)" partidos em duas linhas
    const cortados = () => botoes.evaluateAll(bs => bs.filter(b => {
      const linhas = el => {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        return new Set([...faixa.getClientRects()].map(r => Math.round(r.top))).size;
      };
      return b.scrollWidth > b.clientWidth || [...b.querySelectorAll('.sigla, .curso-encerrado')].some(el => linhas(el) > 1);
    }).map(b => `${b.id} ${b.clientWidth}/${b.scrollWidth}`));
    for (const perfil of ['operador', 'gestor']) {
      await page.locator('#role-sel').selectOption(perfil);
      for (const largura of [390, 320]) {
        await page.setViewportSize({ width: largura, height: 844 });
        await expect(botoes).toHaveText(['PP', 'PC', 'INVA', 'PC-IFR', 'MLTE (encerrado)', 'INVA-B'], { useInnerText: true });
        expect(await cortados(), `${perfil}, ${largura} px`).toEqual([]);
        expect(await larguraDaPagina(page), `${perfil}, ${largura} px`).toBeLessThanOrEqual(largura);
        expect(await alvosPequenos(page), `${perfil}, ${largura} px`).toEqual([]);
      }
    }
  });

  // O "+" que agenda, na lista (um por horário) e em cada linha do mapa, por recurso e por instrutor
  test('o "+" que agenda tem pelo menos 44 px, na lista e no mapa', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const pequenos = seletor => page.locator(seletor).evaluateAll(bs => bs.filter(b => b.checkVisibility())
      .map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).map(r => `${Math.round(r.width)}×${Math.round(r.height)}`));
    await expect(page.locator('#out .win-agendar').first()).toBeVisible();
    expect(await pequenos('#out .win-agendar'), 'lista').toEqual([]);
    for (const vista of ['eq', 'ins']) {
      await page.locator(`#s-esc [data-tl="${vista}"]`).click();
      await expect(page.locator('#out .mapa .tl-agendar').first()).toBeVisible();
      expect(await pequenos('#out .mapa .tl-agendar'), `mapa ${vista}`).toEqual([]);
    }
  });

  // Com o "+" de 44 px, sobram uns 107 px para o nome da linha do mapa: o nome longo quebra em linhas e fica inteiro à
  // vista (no toque, não há o title para ler o resto)
  test('no mapa, o nome longo da linha quebra em linhas, inteiro, sem reticências', async ({ page }) => {
    const longo = 'Maria Fernanda dos Santos Oliveira';
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9, { nm: longo }), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }) });
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="ins"]').click();
    const linha = page.locator('#out .mapa .tl-row', { has: page.locator('.tl-lbl > span', { hasText: longo }) });
    await expect(linha.locator('.tl-agendar')).toBeVisible();
    const nome = await linha.locator('.tl-lbl > span').evaluate(span => ({
      cortado: span.scrollWidth > span.clientWidth || span.scrollHeight > span.clientHeight,
      linhas: Math.round(span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight))
    }));
    expect(nome.cortado).toBe(false);
    expect(nome.linhas).toBeGreaterThan(1);
    // Com o mouse (na tela larga, o nome continua numa linha só), o title mostra o nome inteiro
    await expect(linha.locator('.tl-lbl > span')).toHaveAttribute('title', longo);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
  });

  test('a escala vira um cartão por voo, com horário, aluno, missão, avião, instrutor e status à vista', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await expect(page.locator('#out thead')).toBeHidden();
    const cartao = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 12' });
    expect(await cartao.evaluate(el => getComputedStyle(el).display)).toBe('grid');
    for (const campo of ['.c-hr', '.c-aluno', '.c-missao', '.c-aviao', '.c-instr', '.c-status']) {
      const caixa = await cartao.locator(campo).boundingBox();
      expect(caixa, campo).not.toBeNull();
      expect(caixa.x + caixa.width, campo).toBeLessThanOrEqual(390);
    }
    await expect(cartao.locator('.c-instr')).toContainText('Instrutor 13');
  });
  // O painel no celular (390 e 320 px): os quatro quadros dois por linha, o quadro rola dentro da moldura, e o diálogo
  // "Configurar painel" cabe na tela, com alvos de 44 px
  test('o painel e "Configurar painel" cabem no celular (390 e 320 px), com alvos de 44 px', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="painel"]').click();
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 700 });
      await expect(page.locator('#out .fids')).toBeVisible();
      expect(await larguraDaPagina(page), `${largura}: painel`).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page), `${largura}: painel`).toEqual([]);
      const quadros = await page.locator('#out .seg [data-fids]').evaluateAll(bs => bs.map(b => b.getBoundingClientRect()).map(r => [r.x, r.right]));
      for (const [x, direita] of quadros) {
        expect(x, `${largura}: quadro na tela`).toBeGreaterThanOrEqual(0);
        expect(direita, `${largura}: quadro na tela`).toBeLessThanOrEqual(largura);
      }
      await page.locator('#out [data-fids="configurar"]').click();
      const dialogo = page.locator('#dlg-painel');
      await expect(dialogo).toBeVisible();
      const caixa = await dialogo.boundingBox();
      expect(caixa.x, `${largura}: diálogo`).toBeGreaterThanOrEqual(0);
      expect(caixa.x + caixa.width, `${largura}: diálogo`).toBeLessThanOrEqual(largura);
      expect(await dialogo.evaluate(d => d.scrollWidth <= d.clientWidth), `${largura}: o diálogo não rola para o lado`).toBe(true);
      expect(await larguraDaPagina(page), `${largura}: com o diálogo`).toBeLessThanOrEqual(largura);
      const pequenos = await dialogo.evaluate(d => [...d.querySelectorAll('button, input')].map(el => {
        const alvo = el.matches('input') ? el.closest('label') : el;
        const { width, height } = alvo.getBoundingClientRect();
        return width < 44 || height < 44 ? `${el.getAttribute('aria-label') || alvo.textContent.trim()} ${Math.round(width)}×${Math.round(height)}` : null;
      }).filter(Boolean));
      expect(pequenos, `${largura}: alvos do diálogo`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
    }
  });
});

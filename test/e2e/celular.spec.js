// No celular (390 px): a escala em cartões, um por voo, e nenhuma aba rola para o lado.
import { test, expect, abrir, abrirComExemplo, abrirEscala, irPara, percorrerVistasEFiltros, AMANHA } from './fixtures.js';
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
});

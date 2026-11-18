// Cursos: o programa de cada curso (PP, PC e INVA) fica na aba Cursos, lido das tabelas dos cursos (neste navegador,
// acpm4_cursos). O Administrador inclui, muda, reordena e tira missões; os outros perfis só consultam. Cada alteração
// grava o curso inteiro (não o cadastro nem o dia) e não entra no histórico da data. Cada aluno tem o curso dele, em
// Alunos.
import { test, expect, abrir, irPara, confirmar, abrirEscala, prepararContexto, vigiarErros, preencherLogin, AMANHA, URL_APP, entrar as entrarNoApp } from './fixtures.js';
import { criarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { IDS } from '../helpers/casos-do-programa.js';
import { cursosIniciais, gravarCurso } from '../../js/programa.js';

const dia = (extra = {}) => ({ ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' }), aluno(1001)] }), ...extra });
const PROGRAMA = { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2 }], PC: [], INVA: [] };
const curso = (page, id) => page.locator(`#cursos .curso[data-curso="${id}"]`);
const linhas = (page, id) => curso(page, id).locator('tbody tr[data-i]');

// O programa gravado neste navegador (acpm4_cursos): as missões de um curso, as do programa e as tiradas dele, e as
// alterações registradas
const programaGuardado = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cursos')));
const missoesGuardadas = (guardado, sigla) => {
  const c = guardado.cursos.find(x => x.sigla === sigla);
  return c.missoes.map(m => [m.codigo, m.nome, m.mis, m.nb, m.removida]).sort((a, b) => a[4] - b[4] || a[0].localeCompare(b[0]));
};

test.describe('Cursos', () => {
  test('o Administrador monta o programa: inclui, muda, reordena e tira missões; tudo fica gravado nos cursos, fora do histórico da data', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'cur');
    await expect(curso(page, 'PP')).toContainText('Nenhuma missão no programa');
    // A primeira missão começa a Fase 1; a segunda entra nela, com o código seguinte
    await curso(page, 'PP').getByRole('button', { name: '+ Missão' }).click();
    await expect(curso(page, 'PP').locator('.fase h4')).toHaveText('Fase 1');
    await curso(page, 'PP').getByRole('button', { name: '+ Missão' }).click();
    await expect(linhas(page, 'PP')).toHaveCount(2);
    await expect(linhas(page, 'PP').nth(1).locator('[data-cf="codigo"]')).toHaveValue('PP-02');
    await expect(linhas(page, 'PP').nth(1).locator('[data-cf="nome"]')).toBeFocused();
    await expect(linhas(page, 'PP').nth(1).locator('[data-cf="nome"]')).toHaveValue('PP-02');

    await linhas(page, 'PP').nth(0).locator('[data-cf="nome"]').fill('Familiarização');
    await linhas(page, 'PP').nth(0).locator('[data-cf="nome"]').press('Tab');
    await linhas(page, 'PP').nth(1).locator('[data-cf="mis"]').selectOption('Navegação');
    await linhas(page, 'PP').nth(1).locator('[data-cf="nb"]').fill('2');
    await linhas(page, 'PP').nth(1).locator('[data-cf="nb"]').press('Enter');
    await linhas(page, 'PP').nth(1).getByRole('button', { name: 'Subir PP-02' }).click();
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]')).toHaveValue('PP-02');
    // No topo da fase, o Subir fica desligado: o foco vai para o código da missão que subiu
    await expect(linhas(page, 'PP').nth(0).getByRole('button', { name: 'Subir PP-02' })).toBeDisabled();
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]')).toBeFocused();

    // Código repetido no curso não vale
    await linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]').fill('pp-01');
    await linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]').press('Tab');
    await expect(page.locator('#toast-box')).toContainText('O código PP-01 já existe no PP.');
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]')).toHaveValue('PP-02');

    await confirmar(page, '#cursos .curso[data-curso="PP"] tbody tr[data-i="1"] [data-act="missao-retirar"]');
    await expect(linhas(page, 'PP')).toHaveCount(1);
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]')).toBeFocused();
    // Tirada do programa, a PP-01 guarda o código: ele não vale para outra missão
    await linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]').fill('PP-01');
    await linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]').press('Tab');
    await expect(page.locator('#toast-box')).toContainText('O código PP-01 é de uma missão tirada do programa do PP (ela guarda o código).');

    // O curso inteiro, gravado a cada alteração (uma versão por alteração, com a descrição); o cadastro guarda só a cópia
    // de antes, e o histórico da data não recebe o programa
    await expect.poll(async () => (await programaGuardado(page)).alteracoes.map(a => [a.curso, a.versao, a.descricao])).toEqual([
      ['PP', 2, 'PP: PP-01 incluída'], ['PP', 3, 'PP: PP-02 incluída'], ['PP', 4, 'PP: PP-01 alterada'], ['PP', 5, 'PP: PP-02 alterada'],
      ['PP', 6, 'PP: PP-02 alterada'], ['PP', 7, 'PP: PP-02 passou para 1ª'], ['PP', 8, 'PP: PP-01 tirada do programa']
    ]);
    expect(missoesGuardadas(await programaGuardado(page), 'PP')).toEqual([['PP-02', 'PP-02', 'Navegação', 2, false], ['PP-01', 'Familiarização', 'Voo Local', 1, true]]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).cursos)).toEqual({ PP: [], PC: [], INVA: [] });
    await expect(page.locator('#log-cnt')).toHaveText('0');

    await page.reload();
    await irPara(page, 'cur');
    await expect(linhas(page, 'PP')).toHaveCount(1);
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="mis"]')).toHaveValue('Navegação');
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="nb"]')).toHaveValue('2');
  });

  // O programa do cadastro (o de antes do formato dos cursos) vai para os cursos na primeira abertura, uma vez só, e o
  // cadastro fica com a cópia
  test('na primeira abertura, o programa guardado no cadastro vai para os cursos deste navegador', async ({ page }) => {
    await abrir(page, { estado: dia({ cursos: PROGRAMA }) });
    await irPara(page, 'cur');
    await expect(linhas(page, 'PP')).toHaveCount(2);
    await expect(curso(page, 'PP').locator('.fase h4')).toHaveText('Programa');
    const guardado = await programaGuardado(page);
    expect(missoesGuardadas(guardado, 'PP')).toEqual([['PP-01', 'Familiarização', 'Voo Local', 1, false], ['PP-02', 'Navegação', 'Navegação', 2, false]]);
    expect(guardado.alteracoes.map(a => [a.curso, a.versao, a.descricao])).toEqual([['PP', 2, 'Programa trazido do cadastro (2 missões)']]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).cursos.PP.map(m => m.id))).toEqual(['PP-01', 'PP-02']);
    await page.reload();
    await irPara(page, 'cur');
    await expect(linhas(page, 'PP')).toHaveCount(2);
    expect((await programaGuardado(page)).alteracoes).toHaveLength(1);
  });

  test('cada aluno tem o curso dele, na lista de alunos', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1000"] [data-f="curso"]')).toHaveValue('PP');
    await page.locator('#alu tr[data-id="1001"] [data-f="curso"]').selectOption('INVA');
    await page.reload();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1001"] [data-f="curso"]')).toHaveValue('INVA');
  });

  test('no Gestor, o programa (em texto) e o curso dos alunos só aparecem', async ({ page }) => {
    await abrir(page, { estado: dia({ cursos: PROGRAMA }), url: './?role=gestor' });
    await irPara(page, 'cur');
    await expect(linhas(page, 'PP')).toHaveCount(2);
    await expect(linhas(page, 'PP').nth(1).locator('td')).toHaveText(['2', 'PP-02', 'Navegação', 'Navegação', 'C152', '2 h', 'Depois das anteriores', '']);
    await expect(curso(page, 'PP').locator('input, select')).toHaveCount(0);
    await expect(curso(page, 'PP').getByRole('button', { name: '+ Missão' })).toBeHidden();
    await expect(page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1000"] [data-f="curso"]')).toBeDisabled();
  });

  // Neste navegador, o perfil muda pelo topo: a aba Cursos aberta mostra ou tira na hora os controles de quem muda
  test('trocar o perfil com a aba Cursos aberta troca os controles do programa', async ({ page }) => {
    await abrir(page, { estado: dia({ cursos: PROGRAMA }) });
    await irPara(page, 'cur');
    await expect(curso(page, 'PP').getByRole('button', { name: '+ Missão' })).toBeVisible();
    await page.locator('#role-sel').selectOption('gestor');
    await expect(curso(page, 'PP').getByRole('button', { name: '+ Missão' })).toHaveCount(0);
    await expect(linhas(page, 'PP').nth(0).locator('[data-act="missao-retirar"]')).toHaveCount(0);
    await expect(page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    await page.locator('#role-sel').selectOption('operador');
    await expect(curso(page, 'PP').getByRole('button', { name: '+ Missão' })).toBeVisible();
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="nome"]')).toBeEnabled();
    await expect(page.locator('#cursos')).not.toContainText('aqui é consulta');
  });
});

// A missão do curso no dia: a Demanda sugere a próxima missão do programa ("Usar" põe a missão, o recurso e
// as horas); na escala, o código fica com o aluno e o operador registra o resultado; aprovada, ela conta no progresso
// e a próxima passa a ser a seguinte
test.describe('Cursos no dia', () => {
  const dia = () => ({ ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false, p1: 500, p2: -1 }, { curso: 'PP' }), aluno(1001, { fly: false })] }), cursos: PROGRAMA });
  const naDemanda = async page => {
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    return page.locator('#dem tr[data-id="1000"][data-mid="0"]');
  };
  const vooNaEscala = page => page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });

  test('Usar a próxima missão; registrar o resultado na escala; o progresso e a próxima avançam; o resultado fica gravado', async ({ page }) => {
    await abrir(page, { estado: dia() });
    const linha = await naDemanda(page);
    await expect(linha.locator('[data-act="usar-proxima"]')).toHaveText('Próxima: PP-01 · Usar');
    await expect(page.locator('#dem tr[data-id="1001"] [data-act="usar-proxima"]')).toHaveCount(0);
    await linha.locator('[data-act="usar-proxima"]').click();
    await expect(linha.locator('[data-f="fly"]')).toBeChecked();
    await expect(linha.locator('.etapa')).toHaveText('PP-01');
    await expect(linha.locator('[data-act="usar-proxima"]')).toHaveCount(0);

    await abrirEscala(page);
    await expect(vooNaEscala(page).locator('.c-status .etapa')).toHaveText('PP-01');
    await vooNaEscala(page).locator('[data-resultado]').selectOption('aprovado');
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#audit-log-list')).toContainText('Resultado de Aluno 1000 em PP-01: aprovado');
    await page.keyboard.press('Escape');

    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('1/2 · próxima PP-02');
    // Com um resultado, o código da missão fica travado (os resultados guardam o código; o nome muda), já na tela que
    // registrou e, depois de recarregar, pelo programa lido
    const travado = async () => {
      await irPara(page, 'cur');
      const codigo = linhas(page, 'PP').nth(0).locator('[data-cf="codigo"]');
      await expect(codigo).toHaveAttribute('readonly', '');
      await expect(codigo).toHaveAttribute('title', 'Já há resultados com este código: o código não muda (o nome muda)');
      await expect(linhas(page, 'PP').nth(0).locator('[data-act="missao-retirar"]')).toHaveAttribute('aria-label', 'Tirar PP-01 do programa; os resultados ficam no histórico');
      await expect(linhas(page, 'PP').nth(1).locator('[data-cf="codigo"]')).not.toHaveAttribute('readonly');
    };
    await travado();

    await page.reload();
    await abrirEscala(page);
    await expect(vooNaEscala(page).locator('[data-resultado]')).toHaveValue('aprovado');
    await travado();
  });

  test('mudar a missão à mão tira o código do curso', async ({ page }) => {
    await abrir(page, { estado: dia() });
    const linha = await naDemanda(page);
    await linha.locator('[data-act="usar-proxima"]').click();
    await linha.locator('[data-f="mis"]').selectOption('Navegação');
    await expect(linha.locator('.etapa')).toHaveCount(0);
    await expect(linha.locator('[data-act="usar-proxima"]')).toHaveText('Próxima: PP-01 · Usar');
  });

  test('no Gestor, o código e o resultado só aparecem', async ({ page }) => {
    const estado = { ...dia(), stu: [aluno(1000, { p1: 500, p2: -1, etapa: 'PP-01' }, { curso: 'PP' })] };
    await abrir(page, { estado, url: './?role=gestor' });
    await abrirEscala(page);
    await expect(vooNaEscala(page).locator('.c-status .etapa')).toHaveText('PP-01');
    await expect(vooNaEscala(page).locator('[data-resultado]')).toHaveCount(0);
  });
});

// No modo compartilhado, o resultado vai para o servidor pela função registrar_resultado; quem abre depois vê o
// resultado na escala e o progresso em Alunos. O programa vem das tabelas dos cursos (programa_dos_cursos), e só o
// Administrador o grava (salvar_curso), um curso de cada vez, sem gravar o cadastro nem o dia
test.describe('Cursos no servidor (modo compartilhado)', () => {
  async function entrar(browser, servidor, conta, { statusEsperados = [] } = {}) {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    await servidor.instalar(contexto);
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados });
    await entrarNoApp(page, conta);
    return { contexto, page, erros };
  }
  const servidorComPrograma = () => criarSupabaseFalso(documentosAtuais({ ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), cursos: PROGRAMA }, AMANHA));
  const doServidor = (servidor, sigla = 'PP') => servidor.cursos.find(c => c.sigla === sigla);
  const noPrograma = (servidor, sigla = 'PP') => doServidor(servidor, sigla).missoes.filter(m => !m.removida).sort((a, b) => a.ordem - b.ordem).map(m => [m.codigo, m.nome]);

  test('o operador registra; o servidor guarda com quem registrou; o gestor vê o resultado e o progresso', async ({ browser }) => {
    const estado = { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 500, p2: -1, etapa: 'PP-01' }, { curso: 'PP' })] }), cursos: PROGRAMA };
    const servidor = criarSupabaseFalso(documentosAtuais(estado, AMANHA));
    const operador = await entrar(browser, servidor, CONTAS.operador);
    await abrirEscala(operador.page);
    const voo = page => page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await voo(operador.page).locator('[data-resultado]').selectOption('aprovado');
    await expect.poll(() => servidor.resultados.length).toBe(1);
    expect(servidor.resultados[0]).toMatchObject({ aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'aprovado', data: AMANHA, voo: '1000_0_1', registrado_por: 'Operador de Teste' });
    expect(operador.erros).toEqual([]);
    await operador.contexto.close();

    const gestor = await entrar(browser, servidor, CONTAS.gestor);
    await abrirEscala(gestor.page);
    await expect(voo(gestor.page).locator('.res-aprovado')).toHaveText('Aprovado');
    await irPara(gestor.page, 'alu');
    await expect(gestor.page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('1/2 · próxima PP-02');
    expect(gestor.erros).toEqual([]);
    await gestor.contexto.close();
  });

  // A resposta que chega depois de trocar de data não vai para a data nova
  test('o resultado registrado antes de trocar de data fica no histórico da data do voo', async ({ browser }) => {
    const estado = { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 500, p2: -1, etapa: 'PP-01' }, { curso: 'PP' })] }), cursos: PROGRAMA };
    const servidor = criarSupabaseFalso(documentosAtuais(estado, AMANHA));
    const operador = await entrar(browser, servidor, CONTAS.operador);
    await abrirEscala(operador.page);
    const liberar = servidor.segurar('/rpc/registrar_resultado');
    await operador.page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' }).locator('[data-resultado]').selectOption('aprovado');
    await operador.page.locator('#dt-prox').click();
    // A data nova já aberta (o rótulo muda depois de carregar)
    await expect(operador.page.locator('#dt-rotulo')).toContainText('12/11');
    liberar();
    await expect.poll(() => servidor.historico.filter(h => h.descricao.startsWith('Resultado de')).map(h => h.data)).toEqual([AMANHA]);
    expect(servidor.resultados.map(r => r.data)).toEqual([AMANHA]);
    expect(operador.erros).toEqual([]);
    await operador.contexto.close();
  });

  // Trocar de data lê os programas de novo: a aba Cursos aberta mostra o programa que o Administrador mudou nesse
  // meio-tempo
  test('com a aba Cursos aberta, a data nova mostra o programa lido de novo', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const gestor = await entrar(browser, servidor, CONTAS.gestor);
    await irPara(gestor.page, 'cur');
    await expect(linhas(gestor.page, 'PP')).toHaveCount(2);
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    await irPara(admin.page, 'cur');
    await confirmar(admin.page, '#cursos .curso[data-curso="PP"] tbody tr[data-i="0"] [data-act="missao-retirar"]');
    await expect.poll(() => noPrograma(servidor)).toEqual([['PP-02', 'Navegação']]);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
    await gestor.page.locator('#dt-prox').click();
    await expect(gestor.page.locator('#dt-rotulo')).toContainText('12/11');
    await expect(gestor.page.locator('#s-cur')).toBeVisible();
    await expect(linhas(gestor.page, 'PP')).toHaveCount(1);
    await expect(linhas(gestor.page, 'PP').nth(0).locator('td.c-codigo')).toHaveText('PP-02');
    expect(gestor.erros).toEqual([]);
    await gestor.contexto.close();
  });

  // Cada alteração grava o curso inteiro, a partir da versão confirmada pela gravação anterior, com a descrição dela; o
  // cadastro (com a cópia do programa de antes), o dia e o histórico da data não mudam
  test('o Administrador muda o programa: só as tabelas dos cursos gravam, uma alteração depois da outra; quem abre depois vê', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    const enviadas = [];
    admin.page.on('request', r => { if (r.url().endsWith('/rpc/salvar_curso')) enviadas.push(r.postDataJSON()); });
    await irPara(admin.page, 'cur');
    // A primeira gravação demora: a segunda alteração aparece na hora e espera na fila, sem sair antes da primeira
    const liberar = servidor.segurar('/rpc/salvar_curso');
    const nome = linhas(admin.page, 'PP').nth(0).locator('[data-cf="nome"]');
    await nome.fill('Familiarização no C152');
    await nome.press('Tab');
    await linhas(admin.page, 'PP').nth(1).getByRole('button', { name: 'Subir PP-02' }).click();
    await expect(linhas(admin.page, 'PP').nth(0).locator('[data-cf="codigo"]')).toHaveValue('PP-02');
    await expect(linhas(admin.page, 'PP').nth(1).locator('[data-cf="nome"]')).toHaveValue('Familiarização no C152');
    await expect.poll(() => enviadas.length).toBe(1);
    liberar();
    await expect.poll(() => doServidor(servidor).versao).toBe(4);
    expect(enviadas.map(g => [g.p_sigla, g.p_versao_lida, g.p_descricao])).toEqual([['PP', 2, 'PP: PP-01 alterada'], ['PP', 3, 'PP: PP-02 passou para 1ª']]);
    expect(noPrograma(servidor)).toEqual([['PP-02', 'Navegação'], ['PP-01', 'Familiarização no C152']]);
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
    expect(servidor.banco.get('cadastro').conteudo.cursos.PP.map(m => [m.id, m.nome])).toEqual([['PP-01', 'Familiarização'], ['PP-02', 'Navegação']]);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();

    const gestor = await entrar(browser, servidor, CONTAS.gestor);
    await irPara(gestor.page, 'cur');
    await expect(linhas(gestor.page, 'PP').nth(0).locator('td.c-codigo')).toHaveText('PP-02');
    await expect(linhas(gestor.page, 'PP').nth(1).locator('td.c-codigo')).toHaveText('PP-01');
    await expect(linhas(gestor.page, 'PP').nth(1).locator('td.c-nome')).toHaveText('Familiarização no C152');
    // As alterações do programa, a mais recente primeiro: quando, quem e o que mudou (também para quem só consulta)
    const alteracoes = curso(gestor.page, 'PP').locator('details.alteracoes');
    await alteracoes.locator('summary').click();
    await expect(alteracoes.locator('li')).toHaveText([
      '[10/11 12:00] Admin de Teste · PP: PP-02 passou para 1ª', '[10/11 12:00] Admin de Teste · PP: PP-01 alterada',
      '[10/11 12:00] Operador de Teste · Programa trazido do cadastro (2 missões)'
    ]);
    await irPara(gestor.page, 'alu');
    await expect(gestor.page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('0/2 · próxima PP-02');
    expect(gestor.erros).toEqual([]);
    await gestor.contexto.close();
  });

  // A data trocada lê os programas de novo; com uma gravação do programa ainda indo, a leitura traz o programa de antes
  // dela. Quando ela volta, a tela mostra o que ficou gravado, e a alteração seguinte parte da versão nova
  test('trocar de data com uma gravação do programa indo: a tela fica com o que foi gravado', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    await irPara(admin.page, 'cur');
    const liberar = servidor.segurar('/rpc/salvar_curso');
    const nome = linhas(admin.page, 'PP').nth(0).locator('[data-cf="nome"]');
    await nome.fill('Familiarização no C152');
    await nome.press('Tab');
    await admin.page.locator('#dt-prox').click();
    await expect(admin.page.locator('#dt-rotulo')).toContainText('12/11');
    await expect(nome).toHaveValue('Familiarização');
    liberar();
    await expect(nome).toHaveValue('Familiarização no C152');
    await linhas(admin.page, 'PP').nth(1).locator('[data-cf="nome"]').fill('Navegação de 2 h');
    await linhas(admin.page, 'PP').nth(1).locator('[data-cf="nome"]').press('Tab');
    await expect.poll(() => noPrograma(servidor)).toEqual([['PP-01', 'Familiarização no C152'], ['PP-02', 'Navegação de 2 h']]);
    expect(doServidor(servidor).versao).toBe(4);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
  });

  // A alteração do programa vai para o servidor fora da fila das gravações da escala: fechar a página com ela ainda indo
  // também pede confirmação (ela se perderia); gravada, a página fecha sem perguntar
  test('fechar a página com uma alteração do programa ainda sendo gravada pede confirmação', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    await irPara(admin.page, 'cur');
    const liberar = servidor.segurar('/rpc/salvar_curso');
    const nome = linhas(admin.page, 'PP').nth(0).locator('[data-cf="nome"]');
    await nome.fill('Familiarização no C152');
    await nome.press('Tab');
    const dialogo = new Promise(resolve => admin.page.once('dialog', async d => { resolve(d.type()); await d.dismiss(); }));
    await admin.page.close({ runBeforeUnload: true });
    expect(await dialogo, 'fechar a página com a gravação do programa indo pede confirmação').toBe('beforeunload');
    expect(admin.page.isClosed(), 'quem desiste continua na página').toBe(false);
    liberar();
    await expect.poll(() => noPrograma(servidor)).toEqual([['PP-01', 'Familiarização no C152'], ['PP-02', 'Navegação']]);
    await expect.poll(() => admin.page.evaluate(async () => (await import('./js/eventos/cursos.js')).programaSendoGravado())).toBe(false);
    let perguntou = false;
    admin.page.once('dialog', async d => { perguntou = true; await d.dismiss(); });
    await admin.page.close({ runBeforeUnload: true });
    await expect.poll(() => admin.page.isClosed()).toBe(true);
    expect(perguntou, 'com tudo gravado, fecha sem perguntar').toBe(false);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
  });

  // O programa em fases (como as tabelas dos cursos o guardam): cada fase com o nome (só leitura), a tabela das missões e
  // o "+ Missão" dela, que inclui no fim da fase, com o código seguinte ao da missão anterior e o tipo de missão, o
  // recurso e as horas dela; os nomes dos campos e a descrição da alteração dizem a fase
  test('o programa em fases: o "+ Missão" de cada fase inclui nela, com o código seguinte ao da anterior', async ({ browser }) => {
    const { f1, f2, m1, m2 } = IDS;
    const { cursos } = gravarCurso({ cursos: cursosIniciais() }, {
      sigla: 'PP', versaoLida: 1, descricao: 'PP: o programa em fases', conteudo: {
        nome: 'Piloto Privado', ativo: true,
        fases: [{ id: f1, nome: 'Fase 1 – Duplo comando' }, { id: f2, nome: 'Fase 2 – Navegação' }],
        missoes: [
          { id: m1, fase: f1, codigo: 'TMA-01', nome: 'Tráfego', mis: 'Voo Local', eq: 'C152', nb: 1 },
          { id: m2, fase: f2, codigo: 'NAV-01', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2.5 }
        ]
      }
    });
    const servidor = criarSupabaseFalso({ ...documentosAtuais(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), AMANHA), cursos });
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    const enviadas = [];
    admin.page.on('request', r => { if (r.url().endsWith('/rpc/salvar_curso')) enviadas.push(r.postDataJSON().p_descricao); });
    await irPara(admin.page, 'cur');
    const pp = curso(admin.page, 'PP');
    await expect(pp.locator('h3 small')).toHaveText('Piloto Privado · 2 fases · 2 missões');
    await expect(pp.locator('.fase h4')).toHaveText(['Fase 1 – Duplo comando', 'Fase 2 – Navegação']);
    await expect(pp.locator(`tr[data-missao="${m2}"] [data-cf="codigo"]`)).toHaveAttribute('aria-label', 'Código da 1ª missão da Fase 2');
    await pp.getByRole('button', { name: '+ Missão na Fase 2' }).click();
    const daFase2 = pp.locator(`.fase[data-fase="${f2}"] tbody tr`);
    await expect(daFase2).toHaveCount(2);
    const nova = daFase2.nth(1);
    await expect(nova.locator('[data-cf="codigo"]')).toHaveValue('NAV-02');
    await expect(nova.locator('[data-cf="codigo"]')).toHaveAttribute('aria-label', 'Código da 2ª missão da Fase 2');
    await expect(nova.locator('[data-cf="nome"]')).toBeFocused();
    await expect(nova.locator('[data-cf="mis"]')).toHaveValue('Navegação');
    await expect(nova.locator('[data-cf="nb"]')).toHaveValue('2.5');
    await expect(pp.locator(`.fase[data-fase="${f1}"] tbody tr`)).toHaveCount(1);
    await expect.poll(() => doServidor(servidor).versao).toBe(3);
    const daFase = fase => doServidor(servidor).missoes.filter(m => m.fase === fase && !m.removida).sort((a, b) => a.ordem - b.ordem).map(m => [m.codigo, m.mis, m.eq, m.nb]);
    expect([daFase(f1), daFase(f2)]).toEqual([[['TMA-01', 'Voo Local', 'C152', 1]], [['NAV-01', 'Navegação', 'C152', 2.5], ['NAV-02', 'Navegação', 'C152', 2.5]]]);
    expect(enviadas).toEqual(['PP: NAV-02 incluída na Fase 2']);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
  });

  // Outra pessoa gravou o programa depois da leitura: a gravação é recusada (PT409), a tela volta a mostrar o programa
  // gravado, com o aviso, e continua editável (não é um conflito da escala: nada fica travado)
  test('outra pessoa mudou o programa: a alteração é recusada, a tela mostra a versão atual e continua editável', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const primeiro = await entrar(browser, servidor, CONTAS.administrador, { statusEsperados: [409] });
    await irPara(primeiro.page, 'cur');
    await expect(linhas(primeiro.page, 'PP')).toHaveCount(2);
    const outro = await entrar(browser, servidor, CONTAS.administrador);
    await irPara(outro.page, 'cur');
    await linhas(outro.page, 'PP').nth(1).locator('[data-cf="nome"]').fill('Navegação de outra pessoa');
    await linhas(outro.page, 'PP').nth(1).locator('[data-cf="nome"]').press('Tab');
    await expect.poll(() => doServidor(servidor).versao).toBe(3);
    expect(outro.erros).toEqual([]);
    await outro.contexto.close();

    const nome = linhas(primeiro.page, 'PP').nth(0).locator('[data-cf="nome"]');
    await nome.fill('Minha alteração');
    await nome.press('Tab');
    await expect(primeiro.page.locator('#toast-box')).toContainText('Outra pessoa mudou o programa do PP: a tela mostra a versão atual. Refaça a alteração.');
    await expect(linhas(primeiro.page, 'PP').nth(1).locator('[data-cf="nome"]')).toHaveValue('Navegação de outra pessoa');
    await expect(nome).toHaveValue('Familiarização');
    expect(noPrograma(servidor)).toEqual([['PP-01', 'Familiarização'], ['PP-02', 'Navegação de outra pessoa']]);
    // Sem trava: nem o aviso do conflito, e a alteração refeita grava a partir da versão atual
    await expect(primeiro.page.locator('#aviso-sync')).toBeHidden();
    await expect(primeiro.page.locator('#cursos')).toContainText('Só o Administrador muda.');
    await nome.fill('Minha alteração');
    await nome.press('Tab');
    await expect.poll(() => noPrograma(servidor)).toEqual([['PP-01', 'Minha alteração'], ['PP-02', 'Navegação de outra pessoa']]);
    expect(doServidor(servidor).versao).toBe(4);
    expect(servidor.gravacoes).toEqual([]);
    expect(primeiro.erros).toEqual([]);
    await primeiro.contexto.close();
  });

  // Sem os programas, nada é inferido de um programa vazio: o aviso do topo e a aba Cursos dizem por quê, e "Tentar de
  // novo" lê os programas de novo
  test('sem os programas dos cursos: o aviso, a aba Cursos sem o programa e "Tentar de novo"', async ({ browser }) => {
    const servidor = servidorComPrograma();
    servidor.falhar('/rpc/programa_dos_cursos');
    const admin = await entrar(browser, servidor, CONTAS.administrador, { statusEsperados: [503] });
    const semProgramas = 'Não foi possível ler os programas dos cursos: a próxima missão, o progresso e a missão do curso no agendamento ficam desligados.';
    await expect(admin.page.locator('#aviso-dados-texto')).toHaveText(semProgramas);
    await irPara(admin.page, 'cur');
    await expect(admin.page.locator('#cursos')).toHaveText(semProgramas);
    await expect(admin.page.locator('#cursos [data-act="missao-nova"]')).toHaveCount(0);
    await irPara(admin.page, 'alu');
    await expect(admin.page.locator('#alu tr[data-id="1000"] .progresso')).toHaveCount(0);
    await admin.page.locator('#btn-tentar-dados').click();
    await expect(admin.page.locator('#aviso-dados')).toBeHidden();
    await expect(admin.page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('0/2 · próxima PP-01');
    await irPara(admin.page, 'cur');
    await expect(linhas(admin.page, 'PP')).toHaveCount(2);
    await expect(admin.page.locator('#cursos [data-act="missao-nova"]')).toHaveCount(3);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
  });

  // O Operador consulta os cursos; quem grava é o Administrador, e o servidor confere (salvar_curso recusa com 42501)
  test('o Operador só consulta o programa: a gravação de um curso pela API é recusada pelo servidor (42501)', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const operador = await entrar(browser, servidor, CONTAS.operador, { statusEsperados: [403] });
    await irPara(operador.page, 'cur');
    await expect(linhas(operador.page, 'PP')).toHaveCount(2);
    await expect(operador.page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    await expect(operador.page.locator('#cursos [data-act="missao-nova"]')).toHaveCount(0);
    await expect(linhas(operador.page, 'PP').nth(0).locator('td.c-nome')).toHaveText('Familiarização');
    // Só o filtro da aba (o curso e "Mostrar encerrados") fica para quem consulta: nenhum campo do programa nem o curso novo
    await expect(operador.page.locator('#cursos :is(input, select):not(.flt-ctrl), #cur-novo, #form-curso')).toHaveCount(0);
    const recusa = await operador.page.evaluate(async () => {
      const { ApiClient } = await import('./js/storage.js');
      const pp = (await ApiClient.lerProgramas()).find(c => c.sigla === 'PP');
      return ApiClient.salvarCurso('PP', pp.versao, { nome: pp.nome, ativo: true, fases: [], missoes: [] }, 'PP: tentativa do Operador')
        .then(() => null, e => ({ code: e.code, campo: e.campo }));
    });
    expect(recusa).toEqual({ code: '42501', campo: null });
    expect([doServidor(servidor).versao, noPrograma(servidor).length]).toEqual([2, 2]);
    expect(operador.erros).toEqual([]);
    await operador.contexto.close();
  });

  // O curso novo vai para as tabelas dos cursos pela gravação do curso inteiro, a partir da versão 0 (que o cria); o
  // encerrado também é só uma gravação do curso. O cadastro, o dia e o histórico da data não mudam
  test('o Administrador cria um curso com o cronograma do PP e o encerra: só as tabelas dos cursos gravam; quem abre depois vê', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const admin = await entrar(browser, servidor, CONTAS.administrador);
    const enviadas = [];
    admin.page.on('request', r => { if (r.url().endsWith('/rpc/salvar_curso')) enviadas.push(r.postDataJSON()); });
    await irPara(admin.page, 'cur');
    await admin.page.locator('#cur-novo').click();
    await admin.page.locator('#cur-sigla').fill('pp-b');
    await admin.page.locator('#cur-nome').fill('Piloto Privado (turma B)');
    await admin.page.locator('#form-curso [name="cur-comeco"][value="pp-acpm"]').check();
    await admin.page.getByRole('button', { name: 'Criar o curso' }).click();
    const ppb = curso(admin.page, 'PP-B');
    await expect(ppb.locator('h3 small')).toHaveText('Piloto Privado (turma B) · 9 fases · 46 missões (1 dispensada)');
    await expect(ppb.locator('[data-cc="nome"]')).toBeFocused();
    await expect.poll(() => doServidor(servidor, 'PP-B') && doServidor(servidor, 'PP-B').versao).toBe(1);
    await confirmar(admin.page, '#cursos .curso[data-curso="PP-B"] [data-act="curso-encerrar"]');
    await expect.poll(() => doServidor(servidor, 'PP-B').ativo).toBe(false);
    expect(enviadas.map(g => [g.p_sigla, g.p_versao_lida, g.p_descricao])).toEqual([
      ['PP-B', 0, 'Curso PP-B criado: Piloto Privado (turma B) (com o cronograma P.I PPA 001A)'], ['PP-B', 1, 'PP-B encerrado']
    ]);
    const daB = doServidor(servidor, 'PP-B');
    expect([daB.ordem, daB.fases.length, daB.missoes.length, daB.missoes.filter(m => m.trecho).map(m => [m.codigo, m.trecho])])
      .toEqual([3, 9, 47, [['TSL-01', 'ida'], ['NOT', 'noite'], ['TSL-02', 'volta']]]);
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();

    // O Gestor vê o curso encerrado só com "Mostrar encerrados", em texto
    const gestor = await entrar(browser, servidor, CONTAS.gestor);
    await irPara(gestor.page, 'cur');
    await expect(gestor.page.locator('#cursos .curso')).toHaveCount(3);
    await gestor.page.locator('#cur-encerrados').check();
    await expect(curso(gestor.page, 'PP-B').locator('h3')).toHaveText('PP-B Piloto Privado (turma B) · 9 fases · 46 missões (1 dispensada) encerrado');
    await expect(curso(gestor.page, 'PP-B').locator('input, select, [data-act]')).toHaveCount(0);
    await expect(curso(gestor.page, 'PP-B').locator('tr[data-missao] td.c-mis', { hasText: 'Noturno' })).toHaveText(['Noturno · ida', 'Noturno · noite', 'Noturno · volta']);
    expect(gestor.erros).toEqual([]);
    await gestor.contexto.close();
  });

  // O curso novo que o servidor não cria: com a sigla que outra pessoa criou antes (PT409, sigla), a tela mostra o curso
  // dela; com a gravação que falha, o curso sai da tela, e o foco que estava nele vai para "+ Novo curso"
  test('o curso novo que não foi criado: a sigla que outra pessoa criou antes e a gravação que falha', async ({ browser }) => {
    const servidor = servidorComPrograma();
    const criar = async (page, sigla, nome) => {
      await page.locator('#cur-novo').click();
      await page.locator('#cur-sigla').fill(sigla);
      await page.locator('#cur-nome').fill(nome);
      await page.getByRole('button', { name: 'Criar o curso' }).click();
    };
    const admin = await entrar(browser, servidor, CONTAS.administrador, { statusEsperados: [409, 503] });
    await irPara(admin.page, 'cur');
    // Outra pessoa cria o MLTE depois que esta tela leu os cursos
    const outro = await entrar(browser, servidor, CONTAS.administrador);
    await irPara(outro.page, 'cur');
    await criar(outro.page, 'MLTE', 'Multimotor');
    await expect.poll(() => doServidor(servidor, 'MLTE') && doServidor(servidor, 'MLTE').versao).toBe(1);
    expect(outro.erros).toEqual([]);
    await outro.contexto.close();
    await criar(admin.page, 'mlte', 'Multimotor IFR');
    await expect(admin.page.locator('#toast-box')).toContainText('Outra pessoa já criou o curso MLTE: a tela mostra os cursos como estão.');
    await expect(curso(admin.page, 'MLTE').locator('h3 small')).toHaveText('Multimotor · 0 missões');
    expect([doServidor(servidor, 'MLTE').nome, doServidor(servidor, 'MLTE').versao]).toEqual(['Multimotor', 1]);

    // A gravação que falha: o curso novo sai da tela e do filtro
    servidor.falhar('/rpc/salvar_curso');
    await criar(admin.page, 'PC-IFR', 'Piloto Comercial IFR');
    await expect(admin.page.locator('#toast-box')).toContainText('Sem conexão: a alteração do programa não foi gravada.');
    await expect(curso(admin.page, 'PC-IFR')).toHaveCount(0);
    await expect(admin.page.locator('#cur-sel')).toHaveValue('');
    await expect(admin.page.locator('#cur-novo')).toBeFocused();
    expect(doServidor(servidor, 'PC-IFR')).toBeUndefined();
    // De novo, agora gravado
    await criar(admin.page, 'PC-IFR', 'Piloto Comercial IFR');
    await expect.poll(() => doServidor(servidor, 'PC-IFR') && doServidor(servidor, 'PC-IFR').versao).toBe(1);
    await expect(curso(admin.page, 'PC-IFR').getByRole('button', { name: '+ Fase' })).toBeFocused();
    expect(admin.erros).toEqual([]);
    await admin.contexto.close();
  });

  // A aba aberta enquanto os dados carregam é refeita quando eles chegam: a Secretaria, que consulta os cursos, fica na
  // aba e vê o programa, não a aba vazia de antes da leitura
  test('a aba Cursos aberta enquanto os dados carregavam mostra o programa quando eles chegam', async ({ browser }) => {
    const estado = { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' })] }), cursos: PROGRAMA };
    const servidor = criarSupabaseFalso(documentosAtuais(estado, AMANHA));
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    await servidor.instalar(contexto);
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.secretaria);
    await expect(page.locator('#usuario')).toBeVisible();
    // Antes dos dados, a aba ainda não tem programa nenhum
    await irPara(page, 'cur');
    await expect(page.locator('#cursos .curso')).toHaveCount(0);
    liberar();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await expect(page.locator('#s-cur')).toBeVisible();
    await expect(linhas(page, 'PP')).toHaveCount(2);
    // A Secretaria lê o programa em texto, sem campos
    await expect(linhas(page, 'PP').nth(0).locator('td')).toHaveText(['1', 'PP-01', 'Familiarização', 'Voo Local', 'C152', '1 h', 'Depois das anteriores', '']);
    await expect(page.locator('#cursos :is(input, select):not(.flt-ctrl), #cur-novo, #form-curso')).toHaveCount(0);
    await expect(page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    expect(servidor.gravacoes).toEqual([]);
    expect(erros).toEqual([]);
    await contexto.close();
  });
});

// As fases, os módulos e quando voar: o programa em fases (como as tabelas dos cursos o guardam) gravado neste navegador,
// com o cadastro e o dia no formato atual (sem a conversão do cadastro)
test.describe('Cursos: fases, módulos e quando voar', () => {
  const u = n => `00000000-0000-4000-8013-${String(n).padStart(12, '0')}`;
  const [F4, F5, F7, F8, F6, F9] = [4, 5, 7, 8, 6, 9].map(u);
  const M = { tma05: u(101), pe03: u(102), pe04: u(103), adapt: u(104), endSolo: u(105), navSolo: u(106), not: u(107), avx: u(108) };
  const M01 = 'Módulo 01 – Duplo Comando', M02 = 'Módulo 02 – Voo Solo', M03 = 'Módulo 03 – Avaliação';
  const missao = (id, fase, codigo, nome, mis = 'Voo Local', eq = 'C152', nb = 1, extra = {}) => ({ id, fase, codigo, nome, mis, eq, nb, ...extra });
  // O cronograma do PP, resumido (uma ou duas missões de cada fase), com as fases na ordem impressa (a 6, do noturno,
  // depois da 8) e sem as exceções, que o Administrador monta
  const CRONOGRAMA = {
    nome: 'Piloto Privado', ativo: true,
    fases: [
      { id: F4, nome: 'Fase 4 – Manobras e Aproximações', modulo: M01 }, { id: F5, nome: 'Fase 5 – Procedimentos de Emergência', modulo: M01 },
      { id: F7, nome: 'Fase 7 – Voo Solo', modulo: M02 }, { id: F8, nome: 'Fase 8 – Navegação Solo', modulo: M02 },
      { id: F6, nome: 'Fase 6 – Voo Noturno', modulo: M02 }, { id: F9, nome: 'Fase 9 – Voo de Cheque', modulo: M03 }
    ],
    missoes: [
      missao(M.tma05, F4, 'TMA-05', 'TMA-05', 'Voo Local', 'C152', 1, { avaliacao: true }),
      missao(M.pe03, F5, 'PE-03', 'PE-03'), missao(M.pe04, F5, 'PE-04', 'PE-04 – SPIN', 'Parafuso'),
      missao(M.adapt, F7, 'ADAPT-C152', 'ADAPTAÇÃO AO CESSNA 152'), missao(M.endSolo, F7, 'END-SOLO', 'ENDOSSO SOLO LOCAL'),
      missao(M.navSolo, F8, 'NAV-SOLO-01', 'NAV SOLO 01', 'Voo Solo'),
      missao(M.not, F6, 'NOT', 'NOT', 'Noturno', 'C172', 3),
      missao(M.avx, F9, 'AVX-CQ', 'AVX ENDOSSO CQ', 'Navegação', 'C152', 2)
    ]
  };
  const comMudancas = (conteudo, fases = {}, missoes = {}) => ({
    ...conteudo, fases: conteudo.fases.map(f => ({ ...f, ...fases[f.id] })), missoes: conteudo.missoes.map(m => ({ ...m, ...missoes[m.id] }))
  });
  // O PP como as tabelas dos cursos o guardam (versão 2)
  const ppGuardado = conteudo => gravarCurso({ cursos: cursosIniciais() }, { sigla: 'PP', versaoLida: 1, conteudo, descricao: 'PP: cronograma' }).cursos;
  const aprovadas = (aluno, codigos, primeiro) => codigos.map((missao, i) => ({
    id: primeiro + i, aluno, curso: 'PP', missao, resultado: 'aprovado', data: '2026-11-05', voo: null, registrado_em: '2026-11-05T12:00:00.000Z', registrado_por: 'Operador'
  }));
  const alunos = () => cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] });

  async function abrirComPrograma(page, { conteudo, resultados = [], url = './' }) {
    const { documentos: { cadastro }, dias } = documentosAtuais(alunos(), AMANHA);
    const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_cursos: { cursos: ppGuardado(conteudo), alteracoes: [] }, acpm4_resultados: resultados };
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm4_cadastro')) return;
      for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
    }, JSON.stringify(docs));
    await page.goto(url);
    await expect(page.locator('#wins input[data-a="win"]').first()).toBeAttached();
  }
  const descricoesGuardadas = async page => (await programaGuardado(page)).alteracoes.map(a => a.descricao);
  const proxima = (page, id) => page.locator(`#dem tr[data-id="${id}"][data-mid="0"] [data-act="usar-proxima"]`);
  async function naDemanda(page) {
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
  }

  // As exceções do PP são dados do programa: o SPIN livre na Fase 5, a Fase 6 (impressa depois da 8) depois da Fase 4 e
  // a ADAPTAÇÃO dispensada. A próxima missão da Demanda (a primeira liberada, na ordem do programa) as segue
  test('o Administrador monta as exceções do PP, e a próxima missão da Demanda as segue', async ({ page }) => {
    const resultados = [...aprovadas(1000, ['TMA-05', 'PE-03', 'PE-04'], 1), ...aprovadas(1001, ['TMA-05', 'PE-03', 'PE-04', 'END-SOLO', 'NAV-SOLO-01'], 10)];
    await abrirComPrograma(page, { conteudo: CRONOGRAMA, resultados });
    await naDemanda(page);
    await expect(proxima(page, 1000)).toHaveText('Próxima: ADAPT-C152 · Usar');
    await expect(proxima(page, 1001)).toHaveText('Próxima: ADAPT-C152 · Usar');

    await irPara(page, 'cur');
    const pp = curso(page, 'PP');
    await expect(pp.locator('h3 small')).toHaveText('Piloto Privado · 6 fases · 8 missões');
    // As fases seguidas do mesmo módulo, sob um título só
    await expect(pp.locator('h4.modulo')).toHaveText([M01, M02, M03]);
    await expect(pp.locator('.fase-cab h5')).toHaveText(CRONOGRAMA.fases.map(f => f.nome));

    await pp.locator(`tr[data-missao="${M.pe04}"] [data-cf="regra"]`).selectOption('livre');
    // "Depois de…" começa com a fase logo antes (a 8) e abre a escolha, só das fases anteriores
    const f6 = pp.locator(`.fase[data-fase="${F6}"]`);
    await f6.locator('[data-cfa="regra"]').selectOption('depois');
    const requisitos = f6.locator('details.requisitos');
    await expect(requisitos.locator('summary')).toHaveText('Depois de: Fase 8');
    await expect(requisitos).toHaveAttribute('open', '');
    await expect(requisitos.locator('label')).toHaveText(['Fase 4', 'Fase 5', 'Fase 7', 'Fase 8']);
    await requisitos.locator(`[data-cfa="requer"][value="${F4}"]`).click();
    await expect(requisitos.locator('summary')).toHaveText('Depois de: Fase 4 e Fase 8');
    await expect(requisitos.locator(`[data-cfa="requer"][value="${F4}"]`)).toBeFocused();
    await requisitos.locator(`[data-cfa="requer"][value="${F8}"]`).click();
    await expect(requisitos.locator('summary')).toHaveText('Depois de: Fase 4');
    // A última da lista não sai: sem nenhuma, a regra seria outra
    await requisitos.locator(`[data-cfa="requer"][value="${F4}"]`).click();
    await expect(page.locator('#toast-box')).toContainText('A Fase 6 espera pelo menos uma fase: para não esperar nenhuma, escolha “Desde o início do curso”.');
    await expect(requisitos.locator(`[data-cfa="requer"][value="${F4}"]`)).toBeChecked();
    await pp.locator(`tr[data-missao="${M.adapt}"] [data-cf="dispensada"]`).click();
    await expect(pp.locator(`tr[data-missao="${M.adapt}"] [data-cf="dispensada"]`)).toBeChecked();
    await expect(pp.locator('h3 small')).toHaveText('Piloto Privado · 6 fases · 7 missões (1 dispensada)');

    // Cada alteração grava o curso, com a descrição; a lista das alterações, a mais recente primeiro
    const descricoes = ['PP: PE-04 livre na fase', 'PP: Fase 6 depois de Fase 8', 'PP: Fase 6 depois de Fase 4 e Fase 8', 'PP: Fase 6 depois de Fase 4', 'PP: ADAPT-C152 dispensada'];
    await expect.poll(() => descricoesGuardadas(page)).toEqual(descricoes);
    const guardado = (await programaGuardado(page)).cursos.find(c => c.sigla === 'PP');
    const doGuardado = id => [...guardado.fases, ...guardado.missoes].find(x => x.id === id);
    expect([doGuardado(M.pe04).regra, doGuardado(F6).regra, doGuardado(F6).requer, doGuardado(M.adapt).dispensada]).toEqual(['livre', 'depois', [F4], true]);
    const alteracoes = pp.locator('details.alteracoes');
    await alteracoes.locator('summary').click();
    await expect(alteracoes.locator('li')).toHaveText(descricoes.map(d => `[10/11 12:00] ${d}`).reverse());

    // A ADAPTAÇÃO dispensada não é mais a próxima; quem fez as Fases 7 e 8 vai para o noturno
    await naDemanda(page);
    await expect(proxima(page, 1000)).toHaveText('Próxima: END-SOLO · Usar');
    await expect(proxima(page, 1001)).toHaveText('Próxima: NOT · Usar');

    await page.reload();
    await irPara(page, 'cur');
    await expect(pp.locator(`tr[data-missao="${M.pe04}"] [data-cf="regra"]`)).toHaveValue('livre');
    await expect(f6.locator('[data-cfa="regra"]')).toHaveValue('depois');
    await expect(f6.locator('details.requisitos summary')).toHaveText('Depois de: Fase 4');
    await expect(pp.locator(`tr[data-missao="${M.adapt}"] [data-cf="dispensada"]`)).toBeChecked();
  });

  // Para o Gestor (e a Secretaria, abaixo, no modo compartilhado), o programa é texto, sem paredes de campos desligados
  test('para quem só consulta, o programa é texto: quando a fase abre, quando voar e as marcas', async ({ page }) => {
    const conteudo = comMudancas(CRONOGRAMA, { [F6]: { regra: 'depois', requer: [F4] } },
      { [M.pe04]: { regra: 'livre' }, [M.adapt]: { dispensada: true }, [M.not]: { regra: 'depois', requer: [M.tma05] } });
    await abrirComPrograma(page, { conteudo, url: './?role=gestor' });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP');
    await expect(page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    await expect(pp.locator('input, select')).toHaveCount(0);
    await expect(pp.locator('[data-act]')).toHaveCount(0);
    await expect(pp.locator('h4.modulo')).toHaveText([M01, M02, M03]);
    await expect(pp.locator(`.fase[data-fase="${F6}"] h5`)).toHaveText('Fase 6 – Voo Noturno');
    await expect(pp.locator('p.regra')).toHaveText(['Abre depois da Fase 4']);
    const quando = id => pp.locator(`tr[data-missao="${id}"] td.c-quando`);
    await expect(quando(M.pe03)).toHaveText('Depois das anteriores');
    await expect(quando(M.pe04)).toHaveText('Livre na fase');
    await expect(quando(M.not)).toHaveText('Depois de TMA-05');
    await expect(pp.locator(`tr[data-missao="${M.adapt}"] td.c-marcas`)).toHaveText('dispensada');
    await expect(pp.locator(`tr[data-missao="${M.tma05}"] td.c-marcas`)).toHaveText('AVAL');
    await expect(pp.locator(`tr[data-missao="${M.not}"] td`)).toHaveText(['1', 'NOT', 'NOT', 'Noturno', 'C172', '3 h', 'Depois de TMA-05', '']);
  });

  // "Voltar ao programa" devolve a missão ao lugar dela, com a regra. O servidor guarda a missão retirada sem a lista
  // "depois de…" (o adendo do desenho, §6): lido de novo o programa, ela volta "depois das anteriores", com o aviso
  test('tirar e voltar ao programa: no mesmo lugar e com a regra; lido de novo, o "depois de…" volta com o aviso', async ({ page }) => {
    const [F1, F2, IN01, IN02, CT01, CT02] = [1, 2, 201, 202, 203, 204].map(u);
    const conteudo = {
      nome: 'Piloto Privado', ativo: true,
      fases: [{ id: F1, nome: 'Fase 1 – Introdução ao Voo' }, { id: F2, nome: 'Fase 2 – O Controle da Aeronave' }],
      missoes: [missao(IN01, F1, 'IN-01', 'IN-01'), missao(IN02, F1, 'IN-02', 'IN-02'), missao(CT01, F2, 'CT-01', 'CT-01', 'Voo Local', 'C152', 1, { regra: 'depois', requer: [IN01] }),
        missao(CT02, F2, 'CT-02', 'CT-02')]
    };
    await abrirComPrograma(page, { conteudo });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP'), ct01 = pp.locator(`tr[data-missao="${CT01}"]`);
    const retirar = () => confirmar(page, `#cursos tr[data-missao="${CT01}"] [data-act="missao-retirar"]`);
    await expect(ct01.locator('details.requisitos summary')).toHaveText('Depois de: IN-01');
    await retirar();
    await expect(ct01).toHaveCount(0);
    const retiradas = pp.locator('details.retiradas');
    await retiradas.locator('summary').click();
    await expect(retiradas.locator('summary')).toHaveText('Retiradas (1)');
    await expect(retiradas.locator('li')).toHaveText(['CT-01 · Fase 2 Voltar ao programa']);
    // De volta: o 1º lugar da Fase 2, ainda depois da IN-01, com o foco no código
    await retiradas.getByRole('button', { name: 'Voltar ao programa: CT-01' }).click();
    await expect(pp.locator('details.retiradas')).toHaveCount(0);
    await expect(pp.locator(`.fase[data-fase="${F2}"] tbody tr`).first()).toHaveAttribute('data-missao', CT01);
    await expect(ct01.locator('[data-cf="codigo"]')).toBeFocused();
    await expect(ct01.locator('[data-cf="regra"]')).toHaveValue('depois');
    await expect(ct01.locator('details.requisitos summary')).toHaveText('Depois de: IN-01');

    // Tirada de novo e lida de novo (recarregada): a lista não ficou guardada
    await retirar();
    await expect.poll(() => descricoesGuardadas(page)).toEqual(['PP: CT-01 tirada do programa', 'PP: CT-01 de volta ao programa', 'PP: CT-01 tirada do programa']);
    await page.reload();
    await irPara(page, 'cur');
    await pp.locator('details.retiradas summary').click();
    await pp.getByRole('button', { name: 'Voltar ao programa: CT-01' }).click();
    await expect(page.locator('#toast-box')).toContainText('A missão CT-01 voltou “depois das anteriores”: a lista “Depois de…” não fica guardada fora do programa. Escolha de novo em “Quando voar”.');
    await expect(ct01.locator('[data-cf="regra"]')).toHaveValue('ordem');
    await expect(ct01.locator('details.requisitos')).toHaveCount(0);

    // A fase só sai sem missões. "+ Fase" entra no fim, com o nome em foco; tirada e de volta, ela fica no lugar
    await expect(pp.locator(`.fase[data-fase="${F2}"] [data-act="fase-retirar"]`)).toBeDisabled();
    await pp.getByRole('button', { name: '+ Fase' }).click();
    const nova = pp.locator('.fase').nth(2);
    await expect(nova.locator('[data-cfa="nome"]')).toBeFocused();
    await expect(nova.locator('[data-cfa="nome"]')).toHaveValue('Fase 3');
    await page.keyboard.type('Fase 3 – Revisão');
    await page.keyboard.press('Tab');
    await expect(nova.locator('[data-cfa="nome"]')).toHaveValue('Fase 3 – Revisão');
    await expect(nova.locator('[data-cfa="modulo"]')).toBeFocused();
    await nova.locator('[data-cfa="modulo"]').fill('Módulo 02 – Revisão');
    await nova.locator('[data-cfa="modulo"]').press('Enter');
    await expect(pp.locator('h4.modulo')).toHaveText(['Módulo 02 – Revisão']);
    await expect(pp.locator('.fase-cab h5')).toHaveText(['Fase 3 – Revisão']);
    await confirmar(page, `#cursos .fase[data-fase="${await nova.getAttribute('data-fase')}"] [data-act="fase-retirar"]`);
    await expect(pp.locator('.fase')).toHaveCount(2);
    await pp.locator('details.retiradas summary').click();
    await expect(pp.locator('details.retiradas li')).toHaveText(['Fase 3 – Revisão Voltar ao programa']);
    await pp.getByRole('button', { name: 'Voltar ao programa: Fase 3' }).click();
    await expect(pp.locator('.fase')).toHaveCount(3);
    await expect(pp.locator('.fase').nth(2).locator('[data-cfa="nome"]')).toBeFocused();
    await expect.poll(() => descricoesGuardadas(page)).toEqual([
      'PP: CT-01 tirada do programa', 'PP: CT-01 de volta ao programa', 'PP: CT-01 tirada do programa', 'PP: CT-01 de volta ao programa',
      'PP: Fase 3 incluída', 'PP: Fase 3 alterada', 'PP: Fase 3 alterada', 'PP: Fase 3 tirada do programa', 'PP: Fase 3 de volta ao programa'
    ]);
  });

  // A ordem que poria uma fase ou uma missão antes do que ela espera não muda nada e diz por quê; a missão vai para o fim
  // de outra fase pela lista ao lado do ✕
  test('subir ou mudar de fase o que ficaria antes do que espera é recusado, com o motivo', async ({ page }) => {
    const [TSL01] = [301].map(u);
    const conteudo = {
      nome: 'Piloto Privado', ativo: true,
      fases: [{ id: F4, nome: 'Fase 4 – Manobras e Aproximações' }, { id: F6, nome: 'Fase 6 – Voo Noturno', regra: 'depois', requer: [F4] }],
      missoes: [missao(M.tma05, F4, 'TMA-05', 'TMA-05'), missao(TSL01, F6, 'TSL-01', 'TSL-01', 'Navegação', 'C172', 1),
        missao(M.not, F6, 'NOT', 'NOT', 'Noturno', 'C172', 3, { regra: 'depois', requer: [TSL01] })]
    };
    await abrirComPrograma(page, { conteudo });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP'), toast = page.locator('#toast-box');
    await pp.getByRole('button', { name: 'Subir a Fase 6' }).click();
    await expect(toast).toContainText('A Fase 6 abre depois da Fase 4: ela não pode passar para antes dela.');
    await pp.getByRole('button', { name: 'Descer a Fase 4' }).click();
    await expect(toast).toContainText('A Fase 6 abre depois da Fase 4: a Fase 4 não pode passar para depois dela.');
    await pp.getByRole('button', { name: 'Subir NOT' }).click();
    await expect(toast).toContainText('A missão NOT voa depois da TSL-01: ela não pode passar para antes dela.');
    // O mesmo motivo pela lista da fase: sem o aviso de antes na tela, o aviso é desta recusa
    await page.evaluate(() => document.querySelector('#toast-box').replaceChildren());
    await pp.locator(`tr[data-missao="${M.not}"] [data-cf="fase"]`).selectOption(F4);
    await expect(toast).toContainText('A missão NOT voa depois da TSL-01: ela não pode passar para antes dela.');
    await expect(pp.locator(`tr[data-missao="${M.not}"] [data-cf="fase"]`)).toHaveValue(F6);
    await expect(pp.locator('.fase').first()).toHaveAttribute('data-fase', F4);
    expect(await descricoesGuardadas(page)).toEqual([]);
    // A TSL-01 pode ir para a Fase 4 (fica antes da NOT): vai para o fim dela, e o foco a acompanha
    await pp.locator(`tr[data-missao="${TSL01}"] [data-cf="fase"]`).selectOption(F4);
    await expect(pp.locator(`.fase[data-fase="${F4}"] tbody tr`)).toHaveCount(2);
    await expect(pp.locator(`.fase[data-fase="${F4}"] tbody tr`).nth(1)).toHaveAttribute('data-missao', TSL01);
    await expect(pp.locator(`tr[data-missao="${TSL01}"] [data-cf="fase"]`)).toBeFocused();
    await expect.poll(() => descricoesGuardadas(page)).toEqual(['PP: TSL-01 passou para a Fase 4']);
  });

  // O campo digitado que perde o foco para um clique avisa a mudança no mousedown, antes do click: a aba é refeita depois
  // do clique (também o demorado), e o clique vale. Sem clicar num controle, ela é refeita do mesmo jeito
  test('digitar num campo e clicar direto em outro botão, marca ou campo: valem as duas alterações', async ({ page }) => {
    const [F1, F2, IN01, IN02, CT01] = [1, 2, 401, 402, 403].map(u);
    const conteudo = {
      nome: 'Piloto Privado', ativo: true,
      fases: [{ id: F1, nome: 'Fase 1 – Introdução ao Voo' }, { id: F2, nome: 'Fase 2 – O Controle da Aeronave' }],
      missoes: [missao(IN01, F1, 'IN-01', 'IN-01'), missao(IN02, F1, 'IN-02', 'IN-02'), missao(CT01, F2, 'CT-01', 'CT-01')]
    };
    await abrirComPrograma(page, { conteudo });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP'), daFase1 = pp.locator(`.fase[data-fase="${F1}"] tbody tr`);
    // O nome de uma missão, e o ↓ de outra, com o botão do mouse apertado por um tempo
    await pp.locator(`tr[data-missao="${CT01}"] [data-cf="nome"]`).fill('Controle da aeronave');
    await pp.getByRole('button', { name: 'Descer IN-01' }).click({ delay: 300 });
    await expect(daFase1.first()).toHaveAttribute('data-missao', IN02);
    await expect(pp.getByRole('button', { name: 'Descer IN-01' })).toBeDisabled();
    // O nome de uma fase, e a marca de uma missão
    await pp.locator(`.fase[data-fase="${F2}"] [data-cfa="nome"]`).fill('Fase 2 – Controle');
    await pp.locator(`tr[data-missao="${IN01}"] [data-cf="dispensada"]`).click();
    await expect(pp.locator(`tr[data-missao="${IN01}"] [data-cf="dispensada"]`)).toBeChecked();
    await expect(pp.locator(`tr[data-missao="${IN01}"] [data-cf="dispensada"]`)).toBeFocused();
    // O código de uma missão, e o "+ Fase": o nome da fase nova fica em foco e selecionado
    await pp.locator(`tr[data-missao="${IN02}"] [data-cf="codigo"]`).fill('IN-05');
    await pp.getByRole('button', { name: '+ Fase' }).click();
    const nova = pp.locator('.fase').nth(2).locator('[data-cfa="nome"]');
    await expect(nova).toBeFocused();
    await page.keyboard.type('Fase 3 – Revisão');
    await page.keyboard.press('Enter');
    await expect(nova).toHaveValue('Fase 3 – Revisão');
    // O código de outra missão, e um clique fora dos controles: a aba é refeita, com o código novo nos nomes dos botões
    await pp.locator(`tr[data-missao="${CT01}"] [data-cf="codigo"]`).fill('CT-09');
    await pp.locator('h3').click();
    await expect(pp.locator(`tr[data-missao="${CT01}"] [data-act="missao-retirar"]`)).toHaveAttribute('aria-label', 'Tirar CT-09 do programa');
    await expect(pp.locator(`tr[data-missao="${IN02}"] [data-act="missao-retirar"]`)).toHaveAttribute('aria-label', 'Tirar IN-05 do programa');
    await expect(pp.locator(`tr[data-missao="${CT01}"] [data-cf="nome"]`)).toHaveValue('Controle da aeronave');
    // O nome de uma missão, e um clique no fim do nome de outra: o foco e o cursor ficam onde o clique os pôs
    await pp.locator(`tr[data-missao="${CT01}"] [data-cf="nome"]`).fill('Controle');
    const nomeDaIN01 = pp.locator(`tr[data-missao="${IN01}"] [data-cf="nome"]`);
    const caixa = await nomeDaIN01.boundingBox();
    await page.mouse.click(caixa.x + caixa.width - 4, caixa.y + caixa.height / 2);
    await expect(nomeDaIN01).toBeFocused();
    await page.keyboard.type(' (revisão)');
    await page.keyboard.press('Enter');
    await expect(nomeDaIN01).toHaveValue('IN-01 (revisão)');
    // O nome de uma missão, e os dois cliques do ✕ de outra: o primeiro arma o ✕, e ele continua armado para o segundo
    await nomeDaIN01.fill('Introdução');
    const tirar = `#cursos tr[data-missao="${IN02}"] [data-act="missao-retirar"]`;
    await page.locator(tirar).click();
    await expect(page.locator(tirar)).toHaveText('Confirmar');
    await page.waitForTimeout(700);
    await expect(page.locator(tirar)).toHaveText('Confirmar');
    await page.locator(tirar).click();
    await expect(pp.locator(`tr[data-missao="${IN02}"]`)).toHaveCount(0);
    await expect.poll(() => descricoesGuardadas(page)).toEqual([
      'PP: CT-01 alterada', 'PP: IN-01 passou para 2ª', 'PP: Fase 2 alterada', 'PP: IN-01 dispensada', 'PP: IN-05 alterada', 'PP: Fase 3 incluída',
      'PP: Fase 3 alterada', 'PP: CT-09 alterada', 'PP: CT-09 alterada', 'PP: IN-01 alterada', 'PP: IN-01 alterada', 'PP: IN-05 tirada do programa'
    ]);
  });

  // Na tela estreita, a tabela de cada fase rola para o lado: refeita a aba, ela fica onde estava, com a marca à vista
  test('na tela estreita, a tabela da fase não volta ao começo a cada alteração', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await abrirComPrograma(page, { conteudo: CRONOGRAMA });
    await irPara(page, 'cur');
    const tabela = curso(page, 'PP').locator(`.fase[data-fase="${F7}"] > .tw`);
    const rolagem = () => tabela.evaluate(tw => tw.scrollLeft);
    await tabela.evaluate(tw => { tw.scrollLeft = tw.scrollWidth; });
    const noFim = await rolagem();
    expect(noFim).toBeGreaterThan(0);
    const marca = curso(page, 'PP').locator(`tr[data-missao="${M.adapt}"] [data-cf="dispensada"]`);
    await marca.click();
    await expect(marca).toBeChecked();
    await expect(marca).toBeFocused();
    expect(await rolagem()).toBe(noFim);
    // A marca em foco continua à vista dentro da tabela
    expect(await marca.evaluate(el => {
      const r = el.getBoundingClientRect(), caixa = el.closest('.tw').getBoundingClientRect();
      return r.left >= caixa.left && r.right <= caixa.right;
    })).toBe(true);
    await expect.poll(() => descricoesGuardadas(page)).toEqual(['PP: ADAPT-C152 dispensada']);
  });
});

// Os cursos: "+ Novo curso" (a sigla e o nome conferidos no formulário, o programa vazio ou o cronograma do PP), o nome,
// encerrar e reativar, o filtro da aba, os alunos de cada curso, o cronograma do PP no PP ainda vazio ou numa fase só e o
// trecho do Noturno. Neste navegador, com o cadastro e o dia no formato atual
test.describe('Cursos: cursos novos, encerrar, o cronograma do PP e o curso de cada aluno', () => {
  const u = n => `00000000-0000-4000-8015-${String(n).padStart(12, '0')}`;
  // O cadastro e o dia, os cursos (como as tabelas dos cursos os guardam) e os resultados, neste navegador
  async function abrirComCursos(page, { estado, cursos = cursosIniciais(), resultados = [], url = './' }) {
    const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
    const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_cursos: { cursos, alteracoes: [] }, acpm4_resultados: resultados };
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm4_cadastro')) return;
      for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
    }, JSON.stringify(docs));
    await page.goto(url);
    await expect(page.locator('#wins input[data-a="win"]').first()).toBeAttached();
  }
  const comPP = conteudo => gravarCurso({ cursos: cursosIniciais() }, { sigla: 'PP', versaoLida: 1, conteudo, descricao: 'PP: programa' }).cursos;
  const descricoes = async page => (await programaGuardado(page)).alteracoes.map(a => a.descricao);
  const opcoesDoCurso = (page, id) => page.locator(`#alu tr[data-id="${id}"] [data-f="curso"] option`);
  // Os cursos na aba, pela sigla; os valores de uma lista de campos
  const siglasNaAba = page => page.locator('#cursos .curso').evaluateAll(els => els.map(e => e.dataset.curso));
  const valores = campos => campos.evaluateAll(els => els.map(e => e.value));
  const aprovada = (aluno, missao, id) => ({ id, aluno, curso: 'PP', missao, resultado: 'aprovado', data: '2026-11-05', voo: null, registrado_em: '2026-11-05T12:00:00.000Z', registrado_por: 'Operador' });

  test('um curso novo: a sigla e o nome conferidos no formulário; criado, ele vale em Alunos, e o resultado de um voo vai para ele', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PP' }), aluno(1001, { fly: false, p1: 500, p2: -1 })] });
    await abrirComCursos(page, { estado });
    await irPara(page, 'cur');
    const novo = page.locator('#cur-novo'), form = page.locator('#form-curso');
    await expect(form).toBeHidden();
    await novo.click();
    await expect(novo).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#cur-sigla')).toBeFocused();
    await expect(form.locator('fieldset label')).toHaveText(['Programa vazio', 'Cronograma do Piloto Privado (P.I PPA 001A)']);
    await expect(form.locator('[name="cur-comeco"][value="vazio"]')).toBeChecked();
    // Os erros ficam embaixo dos campos, com o campo marcado e em foco
    const erro = page.locator('#cur-erro');
    await form.getByRole('button', { name: 'Criar o curso' }).click();
    await expect(erro).toHaveText('Escreva a sigla do curso (por exemplo, PC-IFR).');
    await expect(page.locator('#cur-sigla')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#cur-sigla').fill('pc');
    await page.locator('#cur-nome').fill('Outro comercial');
    await page.locator('#cur-nome').press('Enter');
    await expect(erro).toHaveText('Já existe o curso PC (Piloto Comercial).');
    await expect(page.locator('#cur-sigla')).toBeFocused();
    await page.locator('#cur-sigla').fill('mlte');
    await page.locator('#cur-nome').fill('   ');
    await page.locator('#cur-nome').press('Enter');
    await expect(erro).toHaveText('Escreva o nome do curso (até 80 caracteres).');
    await expect(page.locator('#cur-nome')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cur-sigla')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cur-nome')).toBeFocused();
    await page.locator('#cur-nome').fill('Multimotor');
    await page.locator('#cur-nome').press('Enter');

    // Criado: escolhido no filtro, só ele na aba, com o foco em "+ Fase"; a gravação o cria (versão 1)
    await expect(form).toBeHidden();
    await expect(novo).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#cur-sel')).toHaveValue('MLTE');
    await expect(page.locator('#cursos .curso')).toHaveCount(1);
    await expect(curso(page, 'MLTE').locator('h3')).toHaveText('MLTE Multimotor · 0 missões');
    await expect(curso(page, 'MLTE').getByRole('button', { name: '+ Fase' })).toBeFocused();
    await expect.poll(async () => (await programaGuardado(page)).alteracoes.map(a => [a.curso, a.versao, a.descricao])).toEqual([['MLTE', 1, 'Curso MLTE criado: Multimotor']]);
    await curso(page, 'MLTE').getByRole('button', { name: '+ Missão' }).click();
    await expect(linhas(page, 'MLTE').nth(0).locator('[data-cf="codigo"]')).toHaveValue('MLTE-01');
    // O filtro volta a todos os cursos: o novo vem no fim
    await page.locator('#cur-sel').selectOption('');
    await expect.poll(() => siglasNaAba(page)).toEqual(['PP', 'PC', 'INVA', 'MLTE']);
    await expect(page.locator('#cur-sel option')).toHaveText(['Todos os cursos', 'PP · Piloto Privado', 'PC · Piloto Comercial', 'INVA · Instrutor de Voo', 'MLTE · Multimotor']);

    // Em Alunos, o curso novo está na lista; com ele, a próxima missão, a escala e o resultado no MLTE
    await irPara(page, 'alu');
    await expect(opcoesDoCurso(page, 1001)).toHaveText(['—', 'PP · Piloto Privado', 'PC · Piloto Comercial', 'INVA · Instrutor de Voo', 'MLTE · Multimotor']);
    await page.locator('#alu tr[data-id="1001"] [data-f="curso"]').selectOption('MLTE');
    await expect(page.locator('#audit-log-list')).toContainText('Curso de Aluno 1001: MLTE');
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    const usar = page.locator('#dem tr[data-id="1001"][data-mid="0"] [data-act="usar-proxima"]');
    await expect(usar).toHaveText('Próxima: MLTE-01 · Usar');
    await usar.click();
    await abrirEscala(page);
    const voo = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1001' });
    await expect(voo.locator('.c-status .etapa')).toHaveText('MLTE-01');
    await voo.locator('[data-resultado]').selectOption('aprovado');
    const ultimo = () => page.evaluate(() => {
      const r = (JSON.parse(localStorage.getItem('acpm4_resultados')) || []).at(-1);
      return r && [r.aluno, r.curso, r.missao, r.resultado];
    });
    await expect.poll(ultimo).toEqual([1001, 'MLTE', 'MLTE-01', 'aprovado']);
    // Os alunos do curso, com o progresso
    await irPara(page, 'cur');
    const alunos = curso(page, 'MLTE').locator('details.alunos-do-curso');
    await expect(alunos.locator('summary')).toHaveText('1 aluno no MLTE');
    await alunos.locator('summary').click();
    await expect(alunos.locator('li')).toHaveText(['Aluno 1001 · 1/1 · concluído']);
  });

  test('encerrar e reativar: o encerrado sai das matrículas novas, e quem já está nele continua; o nome do curso muda', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { curso: 'PC' }), aluno(1001), aluno(1002, {}, { curso: 'ZZ9' })] });
    await abrirComCursos(page, { estado });
    await irPara(page, 'cur');
    const pc = curso(page, 'PC');
    await confirmar(page, '#cursos .curso[data-curso="PC"] [data-act="curso-encerrar"]');
    // Ele continua na aba ("Mostrar encerrados" fica marcado), com a etiqueta, e o foco vai para "Reativar o curso"
    await expect(page.locator('#cur-encerrados')).toBeChecked();
    await expect(pc.locator('h3 .tag')).toHaveText('encerrado');
    await expect(pc.getByRole('button', { name: 'Reativar o curso PC' })).toBeFocused();
    await expect(page.locator('#toast-box')).toContainText('PC encerrado: ele sai da lista dos cursos em Alunos; quem já está nele continua.');
    await expect(page.locator('#cur-sel option')).toHaveText(['Todos os cursos', 'PP · Piloto Privado', 'PC · Piloto Comercial (encerrado)', 'INVA · Instrutor de Voo']);
    await page.locator('#cur-encerrados').uncheck();
    await expect.poll(() => siglasNaAba(page)).toEqual(['PP', 'INVA']);
    await expect(page.locator('#cur-sel option')).toHaveText(['Todos os cursos', 'PP · Piloto Privado', 'INVA · Instrutor de Voo']);

    // Em Alunos: o PC não aparece para quem não está nele; quem está continua, com o curso marcado como encerrado
    await irPara(page, 'alu');
    await expect(opcoesDoCurso(page, 1001)).toHaveText(['—', 'PP · Piloto Privado', 'INVA · Instrutor de Voo']);
    await expect(opcoesDoCurso(page, 1000)).toHaveText(['—', 'PP · Piloto Privado', 'INVA · Instrutor de Voo', 'PC · Piloto Comercial (encerrado)']);
    await expect(page.locator('#alu tr[data-id="1000"] [data-f="curso"]')).toHaveValue('PC');
    // O curso que não existe nas tabelas dos cursos continua, dito como tal
    await expect(opcoesDoCurso(page, 1002)).toHaveText(['—', 'PP · Piloto Privado', 'INVA · Instrutor de Voo', 'ZZ9 (curso desconhecido)']);
    await expect(page.locator('#alu tr[data-id="1002"] [data-f="curso"]')).toHaveValue('ZZ9');
    // Quem sai do encerrado não volta para ele pela lista
    await page.locator('#alu tr[data-id="1000"] [data-f="curso"]').selectOption('PP');
    await expect(opcoesDoCurso(page, 1000)).toHaveText(['—', 'PP · Piloto Privado', 'INVA · Instrutor de Voo']);

    // Reativado (o filtro escolhe o encerrado), ele volta às matrículas
    await irPara(page, 'cur');
    await page.locator('#cur-encerrados').check();
    await page.locator('#cur-sel').selectOption('PC');
    await expect.poll(() => siglasNaAba(page)).toEqual(['PC']);
    await pc.getByRole('button', { name: 'Reativar o curso PC' }).click();
    await expect(pc.locator('h3 .tag')).toHaveCount(0);
    await expect(pc.getByRole('button', { name: 'Encerrar o curso PC' })).toBeFocused();
    // O nome do curso: vazio não vale; o novo vai para Alunos
    const nome = pc.locator('[data-cc="nome"]');
    await nome.fill(' ');
    await nome.press('Tab');
    await expect(page.locator('#toast-box')).toContainText('O nome do curso vai de 1 a 80 caracteres.');
    await expect(nome).toHaveValue('Piloto Comercial');
    await nome.fill('Piloto  Comercial   ACPM');
    await nome.press('Enter');
    await expect(pc.locator('h3 small')).toHaveText('Piloto Comercial ACPM · 0 missões');
    await irPara(page, 'alu');
    await expect(opcoesDoCurso(page, 1001)).toHaveText(['—', 'PP · Piloto Privado', 'PC · Piloto Comercial ACPM', 'INVA · Instrutor de Voo']);
    await expect.poll(() => descricoes(page)).toEqual(['PC encerrado', 'PC reativado', 'Curso PC renomeado: Piloto Comercial ACPM']);
    expect((await programaGuardado(page)).cursos.find(c => c.sigla === 'PC')).toMatchObject({ nome: 'Piloto Comercial ACPM', ativo: true, versao: 4 });
  });

  test('no PP vazio, "Usar o cronograma do PP": dois cliques, com o resumo; as 9 fases, com a Fase 6 depois da Fase 4 e o Noturno em trechos', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }, { curso: 'PP' })] });
    await abrirComCursos(page, { estado });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP');
    // Só no PP (o curso do cronograma)
    await expect(page.locator('#cursos [data-act="curso-modelo"]')).toHaveCount(1);
    const usar = pp.getByRole('button', { name: 'Usar o cronograma do PP (P.I PPA 001A)' });
    await usar.click();
    await expect(pp.locator('[data-act="curso-modelo"]')).toHaveText('Confirmar: 47 missões entram');
    expect(await descricoes(page)).toEqual([]);
    await pp.locator('[data-act="curso-modelo"]').click();
    await expect(pp.locator('h3 small')).toHaveText('Piloto Privado · 9 fases · 46 missões (1 dispensada)');
    await expect(pp.locator('h4.modulo')).toHaveText(['Módulo 01 – Treinamento Duplo Comando', 'Módulo 02 – Treinamento de Voo Solo', 'Módulo 03 – Avaliação']);
    await expect(pp.locator('[data-act="curso-modelo"]')).toHaveCount(0);
    await expect(pp.locator('[data-cc="nome"]')).toBeFocused();
    const f6 = pp.locator('.fase').nth(7);
    await expect(f6.locator('[data-cfa="nome"]')).toHaveValue('Fase 6 – Treinamento de Voo Noturno');
    await expect(f6.locator('details.requisitos summary')).toHaveText('Depois de: Fase 4');
    await expect.poll(() => valores(f6.locator('[data-cf="trecho"]'))).toEqual(['ida', 'noite', 'volta']);
    await expect.poll(() => descricoes(page)).toEqual(['PP: cronograma P.I PPA 001A aplicado (0 mantidas, 47 novas, 0 retiradas)']);
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    await expect(page.locator('#dem tr[data-id="1000"][data-mid="0"] [data-act="usar-proxima"]')).toHaveText('Próxima: IN-01 · Usar');
  });

  // O PP trazido do cadastro (uma fase só, "Programa"), com resultados na IN-01 e na PP-02: a IN-01 (código do cronograma)
  // fica, com o mesmo id e os resultados; a PP-02 sai do programa (os resultados ficam); a fase "Programa" também sai
  test('no PP trazido do cadastro, o cronograma mantém o código que já tem resultados e tira o resto do programa', async ({ page }) => {
    const plano = {
      nome: 'Piloto Privado', ativo: true, fases: [{ id: u(1), nome: 'Programa' }],
      missoes: [
        { id: u(11), fase: u(1), codigo: 'IN-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 },
        { id: u(12), fase: u(1), codigo: 'PP-02', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2 },
        { id: u(13), fase: u(1), codigo: 'TMA-05', nome: 'Tráfego', mis: 'Voo Local', eq: 'C152', nb: 1 }
      ]
    };
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }, { curso: 'PP' })] });
    await abrirComCursos(page, { estado, cursos: comPP(plano), resultados: [aprovada(1000, 'IN-01', 1), aprovada(1000, 'PP-02', 2)] });
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('2/3 · próxima TMA-05');
    await irPara(page, 'cur');
    const pp = curso(page, 'PP');
    await confirmar(page, '#cursos .curso[data-curso="PP"] [data-act="curso-modelo"]');
    await expect(pp.locator('h3 small')).toHaveText('Piloto Privado · 9 fases · 46 missões (1 dispensada)');
    // A IN-01 é a mesma missão (o id), com o nome do cronograma e o código travado pelos resultados
    const in01 = pp.locator(`tr[data-missao="${u(11)}"]`);
    await expect(in01.locator('[data-cf="codigo"]')).toHaveValue('IN-01');
    await expect(in01.locator('[data-cf="codigo"]')).toHaveAttribute('readonly', '');
    await expect(in01.locator('[data-cf="nome"]')).toHaveValue('IN-01');
    await expect(pp.locator(`tr[data-missao="${u(13)}"] [data-cf="avaliacao"]`)).toBeChecked();
    const retiradas = pp.locator('details.retiradas');
    await retiradas.locator('summary').click();
    await expect(retiradas.locator('li')).toHaveText(['Programa Voltar ao programa', 'PP-02 Navegação · Programa Voltar ao programa']);
    await expect.poll(() => descricoes(page)).toEqual(['PP: cronograma P.I PPA 001A aplicado (2 mantidas, 45 novas, 1 retirada)']);
    const guardado = (await programaGuardado(page)).cursos.find(c => c.sigla === 'PP');
    expect(guardado.missoes.filter(m => [u(11), u(12), u(13)].includes(m.id)).map(m => [m.codigo, m.removida]).sort())
      .toEqual([['IN-01', false], ['PP-02', true], ['TMA-05', false]]);
    // O resultado da IN-01 continua contando; o da PP-02, fora do programa, não
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1000"] .progresso')).toHaveText('1/46 · Fase 1 · próxima IN-02');
  });

  // O trecho do Noturno de cada missão Noturno: o Noturno desmanchado é recusado com o motivo (a tela volta a mostrar como
  // estava); quem só consulta lê o trecho em texto
  test('o trecho do Noturno: a lista nas missões Noturno, a recusa do Noturno desmanchado e o texto para quem só consulta', async ({ page }) => {
    const [F4, F6, TMA05, TSL01, NOT, TSL02] = [4, 6, 21, 22, 23, 24].map(u);
    const noturno = (id, codigo, nb = 1) => ({ id, fase: F6, codigo, nome: codigo, mis: 'Noturno', eq: 'C172', nb });
    const plano = {
      nome: 'Piloto Privado', ativo: true,
      fases: [{ id: F4, nome: 'Fase 4 – Manobras' }, { id: F6, nome: 'Fase 6 – Voo Noturno' }],
      missoes: [{ id: TMA05, fase: F4, codigo: 'TMA-05', nome: 'TMA-05', mis: 'Voo Local', eq: 'C152', nb: 1 }, noturno(TSL01, 'TSL-01'), noturno(NOT, 'NOT', 3), noturno(TSL02, 'TSL-02')]
    };
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }, { curso: 'PP' })] });
    await abrirComCursos(page, { estado, cursos: comPP(plano), resultados: [aprovada(1000, 'TMA-05', 1)] });
    await irPara(page, 'cur');
    const pp = curso(page, 'PP'), trecho = id => pp.locator(`tr[data-missao="${id}"] [data-cf="trecho"]`);
    await expect(pp.locator('[data-cf="trecho"]')).toHaveCount(3);
    await expect(trecho(TSL01)).toHaveAccessibleName('Trecho do Noturno de TSL-01');
    await expect(trecho(TSL01).locator('option')).toHaveText(['Nenhum', 'Ida', 'Noite', 'Volta']);
    // A ida sem a noite logo depois não forma um Noturno
    await trecho(TSL01).selectOption('ida');
    await expect(page.locator('#toast-box')).toContainText('Cada Noturno fica junto na fase: a ida (se houver), uma noite e a volta (se houver), nesta ordem, sem outra missão no meio.');
    await expect(trecho(TSL01)).toHaveValue('');
    await trecho(NOT).selectOption('noite');
    await expect(trecho(NOT)).toHaveValue('noite');
    await trecho(TSL01).selectOption('ida');
    await expect(trecho(TSL01)).toHaveValue('ida');
    await trecho(TSL02).selectOption('volta');
    await expect.poll(() => valores(pp.locator('[data-cf="trecho"]'))).toEqual(['ida', 'noite', 'volta']);
    // A noite que deixa de ser Noturno desmancharia o Noturno: recusada, ela continua a noite
    await page.evaluate(() => document.querySelector('#toast-box').replaceChildren());
    await pp.locator(`tr[data-missao="${NOT}"] [data-cf="mis"]`).selectOption('Navegação');
    await expect(page.locator('#toast-box')).toContainText('Cada Noturno fica junto na fase');
    await expect(pp.locator(`tr[data-missao="${NOT}"] [data-cf="mis"]`)).toHaveValue('Noturno');
    await expect(trecho(NOT)).toHaveValue('noite');
    await expect.poll(() => descricoes(page)).toEqual(['PP: NOT é a noite do Noturno', 'PP: TSL-01 é a ida do Noturno', 'PP: TSL-02 é a volta do Noturno']);
    // A próxima missão: o Noturno, pela noite, com os translados
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    await expect(page.locator('#dem tr[data-id="1000"][data-mid="0"] [data-act="usar-proxima"]')).toHaveText('Próxima: NOT (com TSL-01 e TSL-02) · Usar');
    // Quem só consulta lê o trecho no tipo de missão
    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'cur');
    await expect(pp.locator('td.c-mis')).toHaveText(['Voo Local', 'Noturno · ida', 'Noturno · noite', 'Noturno · volta']);
    await expect(pp.locator('input, select')).toHaveCount(0);
  });
});

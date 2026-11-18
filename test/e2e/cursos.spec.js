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

  test('no Gestor, o programa e o curso dos alunos só aparecem', async ({ page }) => {
    await abrir(page, { estado: dia({ cursos: PROGRAMA }), url: './?role=gestor' });
    await irPara(page, 'cur');
    await expect(linhas(page, 'PP')).toHaveCount(2);
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="nome"]')).toBeDisabled();
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
    await expect(linhas(gestor.page, 'PP').nth(0).locator('[data-cf="codigo"]')).toHaveValue('PP-02');
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
    await expect(linhas(gestor.page, 'PP').nth(0).locator('[data-cf="codigo"]')).toHaveValue('PP-02');
    await expect(linhas(gestor.page, 'PP').nth(1).locator('[data-cf="codigo"]')).toHaveValue('PP-01');
    await expect(linhas(gestor.page, 'PP').nth(1).locator('[data-cf="nome"]')).toHaveValue('Familiarização no C152');
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
    await expect(linhas(operador.page, 'PP').nth(0).locator('[data-cf="nome"]')).toBeDisabled();
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
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="nome"]')).toHaveValue('Familiarização');
    await expect(linhas(page, 'PP').nth(0).locator('[data-cf="nome"]')).toBeDisabled();
    await expect(page.locator('#cursos')).toContainText('Só o Administrador muda; aqui é consulta.');
    expect(servidor.gravacoes).toEqual([]);
    expect(erros).toEqual([]);
    await contexto.close();
  });
});

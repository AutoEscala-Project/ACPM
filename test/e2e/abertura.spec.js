// A escala abrindo: até os dados da data chegarem, e depois de uma leitura que falhou, nada é gravado. Antes deles, o
// estado da tela é o inicial (sem os alunos e os instrutores), mas o cadastro já foi lido, com a versão atual: gravar
// nessa hora levaria o cadastro vazio por cima do de todos. Numa troca de data, a tela ainda é a da data anterior, com o
// cadastro já lido de novo. Toda mudança é recusada, com o aviso, e a tela fica como estava. As datas são lidas uma de
// cada vez (a versão que a gravação leva é a da leitura dos dados da tela), e nenhuma data é lida antes de a abertura
// preparar os dados, nem depois de a preparação falhar
import { test, expect, prepararContexto, vigiarErros, preencherLogin, entrar, irPara, abrirEscala, AMANHA, URL_APP } from './fixtures.js';
import { criarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { runAllocationEngine } from '../../js/engine.js';
import { ApiClient } from '../../js/storage.js';

const AVISO = 'A escala ainda não abriu: nada foi mudado. Espere os dados chegarem ou recarregue a página.';
const FALHA = 'Não foi possível preparar os dados da escala. Verifique a conexão e recarregue a página; nada foi perdido.';
const PROGRAMA = { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }], PC: [], INVA: [] };
// Um instrutor, dois alunos (o do PP voa a PP-01 amanhã), o programa do PP e um pedido da agenda para amanhã
const estado = () => ({
  ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 500, p2: -1, etapa: 'PP-01' }, { curso: 'PP' }), aluno(1001, { fly: false })] }),
  cursos: PROGRAMA, nid: 1002
});
const PEDIDO = {
  id: 1, data: AMANHA, aluno: 1001, aluno_nome: 'Aluno 1001', missao: 'Voo Local', janela: 'horario', horario: '07:00', horas: 1, observacao: null,
  registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null
};

function criarServidor(dias = {}) {
  const documentos = documentosAtuais(estado(), AMANHA);
  const servidor = criarSupabaseFalso({ ...documentos, dias: { ...documentos.dias, ...dias } });
  servidor.solicitacoes.push(PEDIDO);
  return servidor;
}

async function novoContexto(browser, servidor) {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await prepararContexto(contexto);
  await servidor.instalar(contexto);
  return contexto;
}

// O cadastro do servidor: os alunos, os instrutores e o programa do PP
const cadastroDe = servidor => {
  const { conteudo } = servidor.banco.get('cadastro');
  return { alunos: conteudo.stu.map(s => s.nm), instrutores: conteudo.ins.map(i => i.nm), pp: conteudo.cursos.PP.map(m => m.id) };
};

// A mudança recusada mostra o aviso, uma vez (os avisos anteriores saem antes)
async function recusada(page, nome, mudar) {
  await page.locator('#toast-box').evaluate(caixa => caixa.replaceChildren());
  await mudar();
  await expect(page.locator('#toast-box .toast'), nome).toHaveText([AVISO]);
}

// Os botões que já estão na tela antes de os dados chegarem, e o "+ Missão" de Alunos › Cursos (desenhado com o programa
// vazio do estado inicial)
const BOTOES_DA_ABERTURA = [
  ['+ Novo aluno', async page => { await irPara(page, 'alu'); await page.locator('#s-alu [data-act="adds"]').click(); }],
  ['+ Novo instrutor', async page => { await irPara(page, 'ins'); await page.locator('#s-ins [data-act="addi"]').click(); }],
  ['Alunos › Cursos › + Missão', async page => {
    await irPara(page, 'alu');
    await page.locator('#s-alu [data-vista-alu="cursos"]').click();
    await page.locator('#cursos .curso[data-curso="PP"] [data-act="curso-nova"]').click();
  }],
  ['+ Novo recurso', async page => {
    await irPara(page, 'rec');
    await page.locator('#btn-novo-recurso').click();
    await page.locator('#rec-reg').fill('PR-ZZZ');
    await page.locator('#rec-tipo').selectOption('C152');
    await page.locator('#form-recurso [type="submit"]').click();
  }],
  ['Limpar demanda', async page => {
    await irPara(page, 'dem');
    await page.locator('#btn-mais-dem').click();
    await page.locator('#clr').click();
  }],
  ['Importar da agenda', async page => { await irPara(page, 'dem'); await page.locator('#importar-agenda').click(); }]
];

test.describe('A escala abrindo: nada é gravado antes de os dados da data chegarem', () => {
  test('enquanto os dados chegam, nenhum botão grava (o cadastro de todos fica como estava); com eles, os mesmos botões gravam', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    const antes = cadastroDe(servidor);
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.administrador);
    await expect(page.locator('#usuario')).toBeVisible();

    for (const [nome, usar] of BOTOES_DA_ABERTURA) await recusada(page, nome, () => usar(page));
    // A tela também ficou como estava: sem o aluno novo, a missão nova ou "Limpar demanda" armado
    await expect(page.locator('#alu tr.cd')).toHaveCount(0);
    await expect(page.locator('#cursos tr[data-curso]')).toHaveCount(0);
    await expect(page.locator('#clr')).toHaveText('Limpar demanda');
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
    expect(cadastroDe(servidor)).toEqual(antes);

    // Com os dados, os mesmos botões gravam, junto com o que já estava no cadastro
    liberar();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await irPara(page, 'alu');
    await page.locator('#s-alu [data-vista-alu="alunos"]').click();
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);
    await page.locator('#s-alu [data-act="adds"]').click();
    await expect.poll(() => cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001', 'Novo aluno']);
    await page.locator('#s-alu [data-vista-alu="cursos"]').click();
    await page.locator('#cursos .curso[data-curso="PP"] [data-act="curso-nova"]').click();
    await expect.poll(() => cadastroDe(servidor).pp).toEqual(['PP-01', 'PP-02']);
    expect(cadastroDe(servidor).instrutores).toEqual(antes.instrutores);
    await expect.poll(() => servidor.historico.map(h => h.descricao)).toEqual(['Aluno cadastrado: Novo aluno', 'Programa do PP: PP-02 incluída']);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  test('depois de a abertura falhar, nenhum botão grava; recarregando, a escala abre e grava', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [503] });
    const antes = cadastroDe(servidor);
    // A leitura da data falha, também nas tentativas de novo do supabase-js
    servidor.falhar('/rest/v1/dias', 1000);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.administrador);
    await expect(page.locator('#aviso-sync-texto')).toHaveText(FALHA, { timeout: 15000 });

    for (const [nome, usar] of BOTOES_DA_ABERTURA) await recusada(page, nome, () => usar(page));
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
    expect(cadastroDe(servidor)).toEqual(antes);

    // O servidor volta: recarregando, a escala abre
    servidor.falhar('/rest/v1/dias', 0);
    await page.locator('#btn-recarregar').click();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await expect(page.locator('#aviso-sync')).toBeHidden();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);
    await page.locator('#s-alu [data-act="adds"]').click();
    await expect.poll(() => cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001', 'Novo aluno']);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // Fora dos botões fixos, as mudanças da tela da data anterior: o resultado da missão, aprovar, a compactação, a Demanda,
  // os limites da lei e o programa do curso
  test('enquanto outra data abre, nenhuma mudança grava e a tela fica como estava; na data nova, vale de novo', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    await entrar(page, CONTAS.administrador);
    await abrirEscala(page);
    const liberar = servidor.segurarLeiturasDeDias();
    await page.locator('#dt-prox').click();

    const resultado = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' }).locator('[data-resultado]');
    await recusada(page, 'o resultado da missão', () => resultado.selectOption('aprovado'));
    await expect(resultado).toHaveValue('pendente');
    await recusada(page, 'Aprovar escala', () => page.locator('#btn-aprovar').click());
    await expect(page.locator('#btn-aprovar')).toHaveText('Aprovar escala');
    const criterio = page.locator('[data-criterio="buracos"][data-valor="aviao"]');
    await recusada(page, 'a compactação', () => criterio.click());
    await expect(criterio).toHaveAttribute('aria-pressed', 'false');

    await irPara(page, 'dem');
    await recusada(page, 'Pôr um aluno na demanda', async () => {
      await page.locator('#incluir-aluno').fill('Aluno 1001');
      await page.locator('#incluir-aluno').press('Enter');
    });
    const voa = page.locator('#dem tr[data-k="d"][data-id="1000"] [data-f="fly"]');
    await recusada(page, 'o Voa da demanda', () => voa.click());
    await expect(voa).toBeChecked();

    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    const limite = page.locator('#limites-lei [data-limite="vooMesH"]');
    await recusada(page, 'os limites da lei', async () => { await limite.fill('90'); await limite.press('Tab'); });
    await expect(limite).toHaveValue('100');

    await irPara(page, 'alu');
    await page.locator('#s-alu [data-vista-alu="cursos"]').click();
    const nome = page.locator('#cursos tr[data-curso="PP"][data-i="0"] [data-cf="nome"]');
    await recusada(page, 'o programa do curso', async () => { await nome.fill('Primeiro voo'); await nome.press('Tab'); });
    await expect(nome).toHaveValue('Familiarização');
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
    expect(servidor.resultados).toEqual([]);

    liberar();
    await expect(page.locator('#dt-rotulo')).toContainText('12/11');
    await nome.fill('Primeiro voo');
    await nome.press('Tab');
    await expect.poll(() => servidor.banco.get('cadastro').conteudo.cursos.PP[0].nome).toBe('Primeiro voo');
    expect(cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001']);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // Exportar e "Tentar de novo" gravam sem passar por uma alteração (a escala só calculada; as horas lidas de novo): enquanto
  // outra data abre, os dois continuam (o CSV sai, as horas são lidas), mas não gravam. Na data nova, exportar grava
  test('enquanto outra data abre, exportar e "Tentar de novo" não gravam', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [503] });
    servidor.falhar('/rpc/horas_dos_instrutores');
    await entrar(page, CONTAS.operador);
    await expect(page.locator('#aviso-dados')).toBeVisible();
    await abrirEscala(page);
    const liberar = servidor.segurarLeiturasDeDias();
    await page.locator('#dt-prox').click();
    // A escala de amanhã só foi calculada: exportar a gravaria
    await Promise.all([page.waitForEvent('download'), page.locator('#exp').click()]);
    await page.locator('#btn-tentar-dados').click();
    await expect(page.locator('#aviso-dados')).toBeHidden();
    await page.waitForTimeout(300);
    expect(servidor.gravacoes).toEqual([]);

    liberar();
    await expect(page.locator('#dt-rotulo')).toContainText('12/11');
    await Promise.all([page.waitForEvent('download'), page.locator('#exp').click()]);
    await expect.poll(() => servidor.gravacoes.map(g => g.chave)).toContain('dia:2026-11-12');
    expect(servidor.gravacoes.map(g => g.chave)).not.toContain(`dia:${AMANHA}`);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // A abertura (amanhã) e o dia 13, escolhido na Agenda enquanto ela lia: as datas são lidas uma de cada vez, e o dia 13
  // só é lido depois da abertura (a resposta dela nunca chega depois da dele). Depois, a tela e a gravação ficam com os
  // dados do dia 13 (o PR-BTB em manutenção)
  test('a data escolhida enquanto a escala abria espera a leitura da abertura e fica no lugar dela', async ({ browser }) => {
    const dia13 = structuredClone(documentosAtuais(estado(), AMANHA).dias[AMANHA]);
    dia13.av['PR-BTB'] = false;
    const servidor = criarServidor({ '2026-11-13': dia13 });
    const contexto = await novoContexto(browser, servidor);
    // Os resultados do dia da abertura demoram
    let soltarAbertura;
    const abertura = new Promise(resolve => { soltarAbertura = resolve; });
    await contexto.route(url => url.pathname.endsWith('/rest/v1/resultados_de_missao') && url.searchParams.get('data') === `eq.${AMANHA}`, async route => {
      await abertura;
      await route.fallback();
    });
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    const leiturasDo13 = [];
    page.on('request', r => { if (new URL(r.url()).searchParams.get('data') === 'eq.2026-11-13') leiturasDo13.push(r.url()); });
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#usuario')).toBeVisible();
    await irPara(page, 'age');
    await page.locator('[data-cal][data-dia="2026-11-13"]').click();
    liberar();
    // O dia 13 espera: nada dele é lido enquanto a abertura lê
    await page.waitForTimeout(300);
    expect(leiturasDo13).toEqual([]);
    soltarAbertura();
    await expect(page.locator('#dt-rotulo')).toContainText('13/11');
    await expect(page.locator('body[data-pronto]')).toBeAttached();

    await irPara(page, 'rec');
    await expect(page.locator('#dt')).toHaveValue('2026-11-13');
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).not.toBeChecked();
    await page.locator('#eqs input[data-id="PR-IGU"]').uncheck();
    await expect.poll(() => servidor.dias.get('2026-11-13').versao).toBe(2);
    expect(servidor.dias.get('2026-11-13').conteudo.av).toMatchObject({ 'PR-BTB': false, 'PR-IGU': false });
    expect(servidor.gravacoes.map(g => g.chave)).not.toContain(`dia:${AMANHA}`);
    expect(cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001']);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // Na outra ordem, a resposta da abertura chega antes da do dia 13: a escala da abertura aparece (com os alunos), mas nada
  // grava até o dia 13 abrir
  test('a resposta da abertura que chega antes da data escolhida aparece, mas nada grava até a escolhida abrir', async ({ browser }) => {
    const dia13 = structuredClone(documentosAtuais(estado(), AMANHA).dias[AMANHA]);
    dia13.av['PR-BTB'] = false;
    const servidor = criarServidor({ '2026-11-13': dia13 });
    const contexto = await novoContexto(browser, servidor);
    let soltar13;
    const espera13 = new Promise(resolve => { soltar13 = resolve; });
    await contexto.route(url => url.pathname.endsWith('/rest/v1/resultados_de_missao') && url.searchParams.get('data') === 'eq.2026-11-13', async route => {
      await espera13;
      await route.fallback();
    });
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#usuario')).toBeVisible();
    await irPara(page, 'age');
    await page.locator('[data-cal][data-dia="2026-11-13"]').click();
    liberar();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);
    await recusada(page, '+ Novo aluno', () => page.locator('#s-alu [data-act="adds"]').click());
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);

    soltar13();
    await expect(page.locator('#dt-rotulo')).toContainText('13/11');
    await irPara(page, 'rec');
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).not.toBeChecked();
    await irPara(page, 'alu');
    await page.locator('#s-alu [data-act="adds"]').click();
    await expect.poll(() => cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001', 'Novo aluno']);
    expect(servidor.gravacoes.map(g => g.chave)).not.toContain(`dia:${AMANHA}`);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // Duas trocas de data seguidas (o dia 12 e logo o 13): o 13 só é lido depois do 12. Lidos juntos, a resposta atrasada do
  // cadastro do 12 (já com o aluno que uma colega acabou de incluir) deixaria valendo a versão dela, com os dados do 13 na
  // tela, sem o aluno: a alteração seguinte gravaria por cima, sem conflito, e o aluno da colega sumiria
  test('as datas são lidas uma de cada vez: a leitura atrasada de uma troca anterior não apaga o aluno que outra pessoa incluiu', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    await entrar(page, CONTAS.operador);
    // A leitura do cadastro da troca para o dia 12 demora
    let soltar12, segurar = true;
    const espera12 = new Promise(resolve => { soltar12 = resolve; });
    await contexto.route(url => url.pathname.endsWith('/rest/v1/documentos') && url.searchParams.get('chave') === 'eq.cadastro', async route => {
      if (segurar) { segurar = false; await espera12; }
      await route.fallback();
    });
    await page.locator('#dt-prox').click();
    await page.locator('#dt').fill('2026-11-13');
    // O dia 13 espera a leitura do 12
    await page.waitForTimeout(300);
    await expect(page.locator('#dt-rotulo')).toContainText('11/11');
    const { conteudo } = servidor.banco.get('cadastro');
    servidor.alterarPorOutraPessoa('cadastro', { ...conteudo, nid: 1003, stu: [...conteudo.stu, { ...conteudo.stu[0], id: 1002, nm: 'Aluno da colega' }] });
    soltar12();
    await expect(page.locator('#dt-rotulo')).toContainText('13/11');
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await expect.poll(() => servidor.dias.get('2026-11-13')?.conteudo.av['PR-BTB']).toBe(false);
    expect(cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001', 'Aluno da colega']);
    await expect(page.locator('#aviso-sync')).toBeHidden();
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // › duas vezes, rápido: a mesma data pedida duas vezes. A primeira leitura demora e a segunda espera por ela; a data abre
  // e grava (a resposta da primeira, chegando por último, deixaria a tela sem gravar até trocar de data de novo)
  test('a mesma data pedida duas vezes (› duas vezes) abre e grava', async ({ browser }) => {
    const servidor = criarServidor();
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    await entrar(page, CONTAS.operador);
    let soltar, segurar = true;
    const espera = new Promise(resolve => { soltar = resolve; });
    await contexto.route(url => url.pathname.endsWith('/rest/v1/dias') && url.searchParams.get('data') === 'eq.2026-11-12', async route => {
      if (segurar) { segurar = false; await espera; }
      await route.fallback();
    });
    await page.locator('#dt-prox').click();
    await page.locator('#dt-prox').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#dt-rotulo')).toContainText('11/11');
    soltar();
    await expect(page.locator('#dt-rotulo')).toContainText('12/11');
    await irPara(page, 'rec');
    await page.locator('#toast-box').evaluate(caixa => caixa.replaceChildren());
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await expect.poll(() => servidor.dias.get('2026-11-12')?.conteudo.av['PR-BTB']).toBe(false);
    await expect(page.locator('#toast-box')).not.toContainText(AVISO);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // A conversão dos documentos antigos (de antes da escala por data) para no meio, antes de gravar o cadastro. Nenhuma data
  // abre depois disso: lida, ela viria com o cadastro vazio, e "+ Novo aluno" gravaria esse cadastro (a conversão ficaria
  // por feita, sem os alunos de antes). Recarregando, a conversão termina, com eles
  test('depois de a conversão dos dados antigos falhar, nenhuma data abre e nada é gravado; recarregando, ela termina', async ({ browser }) => {
    const antigo = ApiClient.normalizeAndMigrateState(estado());
    const servidor = criarSupabaseFalso({ documentos: { estado: antigo, escala: runAllocationEngine(antigo) } });
    const contexto = await novoContexto(browser, servidor);
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [400] });
    // A gravação do primeiro dia da conversão é recusada
    servidor.falharGravacoes(1, 400);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#aviso-sync-texto')).toHaveText(FALHA);
    await page.locator('#toast-box').evaluate(caixa => caixa.replaceChildren());
    await page.locator('#dt-prox').click();
    await expect(page.locator('#toast-box .toast')).toHaveText(['Não foi possível abrir essa data. Verifique a conexão e tente de novo.']);
    await expect(page.locator('#dt')).toHaveValue(AMANHA);
    await recusada(page, '+ Novo aluno', async () => { await irPara(page, 'alu'); await page.locator('#s-alu [data-act="adds"]').click(); });
    expect(servidor.banco.has('cadastro')).toBe(false);
    expect(servidor.gravacoes.map(g => g.chave)).toEqual([`dia:${AMANHA}`]);

    await page.locator('#btn-recarregar').click();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);
    expect(cadastroDe(servidor).alunos).toEqual(['Aluno 1000', 'Aluno 1001']);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // No modo local (os dados neste navegador) também. Aqui, o histórico antigo ilegível faz a conversão dos dados antigos
  // falhar: gravar o cadastro do estado inicial marcaria a conversão como feita, e os alunos de antes não voltariam mais.
  // Nenhuma data abre depois disso (ela viria com o cadastro vazio)
  test('modo local: depois de a abertura falhar, nada é gravado; com a conversão consertada, os alunos de antes abrem', async ({ page }) => {
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm3')) return;
      localStorage.setItem('acpm3', json);
      localStorage.setItem('acpm3_audit', '{}');
    }, JSON.stringify(estado()));
    await page.goto('./');
    await expect(page.locator('#aviso-sync-texto')).toHaveText(FALHA);
    await page.locator('#dt-prox').click();
    await expect(page.locator('#toast-box')).toContainText('Não foi possível abrir essa data.');
    await expect(page.locator('#dt')).toHaveValue(AMANHA);
    await recusada(page, '+ Novo aluno', async () => { await irPara(page, 'alu'); await page.locator('#s-alu [data-act="adds"]').click(); });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('acpm4_')))).toEqual([]);

    await page.evaluate(() => localStorage.removeItem('acpm3_audit'));
    await page.reload();
    await expect(page.locator('#alu tr.cd')).toHaveCount(2);
    await expect(page.locator('#aviso-sync')).toBeHidden();
  });
});

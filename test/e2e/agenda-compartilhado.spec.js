// Pedidos no modo compartilhado: a Secretaria registra pedidos (a escala ela só consulta), o
// Operador usa a exceção da coordenação e o Gestor só consulta. O servidor falso aplica o mesmo prazo do banco.
import { test, expect, entrar, preencherLogin, irPara, abrirMenuDaConta, AMANHA, URL_APP, botaoDaAba, campoDaAgenda, dataAberta, diaSeguinte, escolherNoCalendario, registrarPedido, contagemDoDia, prepararContexto, vigiarErros, importarDaAgenda, rotuloDaData, rotulosDasAbas,
  missaoDoCursoNaAgenda, enviarDaAgenda, estadoDoFormulario, linhasDosPedidos, linhaDaLista, grupoDosPedidos, aprovarNaLinha, botaoDosPedidos, escolherPedido, campoDoDetalhe,
  acaoDoPedido, detalheDoPedido, avisoDosPedidos } from './fixtures.js';
import { instalarSupabaseFalso, criarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';
import { aluno, apenas } from '../helpers/montar.js';
import { cursosIniciais, novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';

const comAlunos = () => documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000), aluno(1001)] }, AMANHA);
const pedidoDe = (id, data, extra = {}) => ({
  id, data, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1, observacao: null,
  registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null, ...extra
});
// O pedido aprovado (as colunas da aprovação: só o aprovado entra na demanda)
const APROVADO = { aprovada_em: '2026-11-10T14:30:00.000Z', aprovada_por: 'Operador de Teste', aprovacao_retirada_em: null };
// Segura as leituras dos pedidos de uma data até soltar()
async function segurarPedidos(context, dia) {
  let soltar;
  const espera = new Promise(resolve => { soltar = resolve; });
  await context.route(url => url.pathname.endsWith('/rest/v1/solicitacoes') && url.searchParams.getAll('data').join() === `gte.${dia},lte.${dia}`, async route => { await espera; await route.fallback(); });
  return soltar;
}

test.describe('Agenda de Solicitações (modo compartilhado)', () => {
  // A Secretaria vai para a Agenda quando os dados terminam de carregar, a menos que já tenha saído da Escala
  const enquantoCarrega = async (page, context, escolher, conta = CONTAS.secretaria) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    const liberar = servidor.segurarLeiturasDeDias();
    await page.goto(URL_APP);
    await preencherLogin(page, conta);
    await expect(page.locator('#usuario')).toBeVisible();
    await escolher();
    liberar();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
  };
  for (const [nome, secao, escolher] of [
    ['Alunos', '#s-alu', page => irPara(page, 'alu')],
    ['o Manual', '#s-manual', page => page.locator('#btn-manual').click()],
    ['Minha conta', '#s-conta', async page => { await abrirMenuDaConta(page); await page.locator('#btn-conta').click(); }]
  ]) {
    test(`a Secretaria que abriu ${nome} enquanto os dados carregavam continua lá`, async ({ page, context }) => {
      await enquantoCarrega(page, context, () => escolher(page));
      await expect(page.locator(secao)).toBeVisible();
      await expect(page.locator('#s-age')).toBeHidden();
    });
  }

  // Voltar enquanto os dados carregam também é uma escolha: a entrada de antes (sem tela no endereço) é a tela da abertura,
  // e ela fica quando os dados chegam
  test('Voltar enquanto os dados carregavam: a Secretaria volta para a tela da abertura dela, a Agenda, e fica lá', async ({ page, context }) => {
    await enquantoCarrega(page, context, async () => {
      await irPara(page, 'cur');
      await page.goBack();
      await expect(page.locator('#s-age')).toBeVisible();
    });
    await expect(page.locator('#s-age')).toBeVisible();
    await expect(page.locator('#s-cur')).toBeHidden();
    await expect(page).toHaveURL(/#\/age$/);
  });

  test('a Agenda aberta enquanto os dados carregavam é lida de novo quando eles chegam (com os alunos)', async ({ page, context }) => {
    await enquantoCarrega(page, context, () => irPara(page, 'age'));
    await expect(page.locator('#s-age')).toBeVisible();
    await expect(campoDaAgenda(page, 'aluno').locator('option', { hasText: 'Aluno 1001' })).toHaveCount(1);
  });

  test('a data escolhida no calendário enquanto os dados carregavam continua escolhida, na Agenda e no app', async ({ page, context }) => {
    await enquantoCarrega(page, context, async () => {
      await irPara(page, 'age');
      await escolherNoCalendario(page, '2026-11-13');
    }, CONTAS.operador);
    await expect(page.locator('#agenda-data')).toContainText('13/11');
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-13');
  });

  test('a Secretaria abre na agenda, registra pedidos e só consulta a escala', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.secretaria);
    await expect(page.locator('#usuario')).toHaveText('Secretaria de Teste · Secretaria');
    await expect(page.locator('#s-age')).toBeVisible();
    await expect(campoDaAgenda(page, 'aluno').locator('option', { hasText: 'Aluno 1001' })).toHaveCount(1);

    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('12:40');
    await campoDaAgenda(page, 'horas').fill('2.5');
    await campoDaAgenda(page, 'por').fill('Maria');
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    const pedido = linhasDosPedidos(page).first();
    await expect(pedido).toContainText('Registrado por Maria às 12:00');
    await expect(grupoDosPedidos(page, 'aguardando')).toBeVisible();
    await escolherPedido(page, servidor.solicitacoes[0].id);
    await expect(campoDoDetalhe(page, 'Registrado por')).toHaveText('Maria em 10/11 12:00 (conta: Secretaria de Teste)');
    // Ela cancela e registra de novo, mas não aprova
    await expect(acaoDoPedido(page, 'cancelar')).toBeVisible();
    await expect(acaoDoPedido(page, 'repetir')).toBeVisible();
    await expect(acaoDoPedido(page, 'aprovar')).toHaveCount(0);
    await botaoDosPedidos(page, 'novo').click();
    await expect(botaoDosPedidos(page, 'importar')).toHaveCount(0);
    expect(servidor.solicitacoes.map(s => [s.data, s.aluno, s.janela, s.horario, s.horas, s.recurso, s.registrado_por, s.usuario])).toEqual([[AMANHA, 1001, 'horario', '12:40', 2.5, 'C152', 'Maria', CONTAS.secretaria.id]]);

    // Só as datas que aceitam pedidos: hoje não está na lista dela
    await expect(campoDaAgenda(page, 'data').locator('option').first()).toHaveText('qua 11/11 (amanhã)');
    await expect(campoDaAgenda(page, 'data').locator('option', { hasText: 'prazo encerrado' })).toHaveCount(0);
    await expect(campoDaAgenda(page, 'excecao')).toBeHidden();

    // Ela vê a Agenda, a Escala e os Cursos (que só consulta) e, pelos dados pessoais, Instrutores e Alunos
    await expect(rotulosDasAbas(page, { visiveis: true })).toHaveText(['Pedidos', 'Escala', 'Aprovar', 'Alunos', 'Instrutores', 'Cursos']);
    await botaoDaAba(page, 'esc').click();
    await expect(page.locator('body')).toHaveAttribute('data-role', 'gestor');
    expect(servidor.gravacoes).toEqual([]);
  });

  test('o Operador registra fora do prazo pela exceção da coordenação', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await botaoDaAba(page, 'age').click();
    await campoDaAgenda(page, 'data').selectOption('2026-11-10');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Navegação');
    await campoDaAgenda(page, 'recurso').selectOption('PA-34');
    await campoDaAgenda(page, 'horario').selectOption('07:30');
    await campoDaAgenda(page, 'por').fill('Coordenação');
    await campoDaAgenda(page, 'excecao').click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para ter 10/11 pela Exceção da Coordenação.');
    expect(servidor.solicitacoes.map(s => [s.data, s.excecao, s.recurso, s.aprovada_por])).toEqual([['2026-11-10', true, 'PA-34', 'Operador de Teste']]);
    // A lista é a da data aberta: aberta a data do pedido, ele aparece nela
    await escolherNoCalendario(page, '2026-11-10');
    await expect(linhasDosPedidos(page).first()).toContainText('Exceção da Coordenação');
  });

  test('a Agenda lê os pedidos da data uma vez e diz enquanto lê e quando não lê', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    let resposta;
    const erro = new Promise(resolve => { resposta = resolve; });
    let doDia12 = true;
    await context.route(url => url.pathname.endsWith('/rest/v1/solicitacoes') && url.searchParams.getAll('data').includes('gte.2026-11-12'), async route => {
      if (!doDia12) { await route.fallback(); return; }
      await erro;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
    });
    await botaoDaAba(page, 'age').click();
    await expect(page.locator('#age')).toHaveText('Nenhum pedido para esta data.');
    await diaSeguinte(page);
    await expect(page.locator('#age')).toHaveText('Lendo os pedidos desta data…');
    resposta();
    await expect(page.locator('#age')).toHaveText('Não foi possível ler os pedidos desta data. Verifique a conexão. Tentar de novo');
    // O clique na tela já aberta lê de novo
    doDia12 = false;
    servidor.solicitacoes.push({ id: 1, data: '2026-11-12', aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1,
      observacao: null, registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null });
    await botaoDaAba(page, 'age').click();
    await expect(linhasDosPedidos(page)).toHaveCount(1);
  });

  // As duas conferências do formulário são da data do pedido, lida uma vez quando o campo muda. Sem os pedidos dela, o
  // servidor recusa o 7º voo local (PT422), e o formulário diz o mesmo aviso, armado
  test('a data do pedido que não é a aberta: os pedidos dela são lidos uma vez; sem eles, o 7º voo local é avisado pela recusa do servidor', async ({ browser }) => {
    const context = await browser.newContext();
    await prepararContexto(context);
    const page = await context.newPage();
    // A recusa do servidor (PT422: o PostgREST responde 422)
    const erros = vigiarErros(page, { statusEsperados: [422] });
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    for (let i = 0; i < 6; i++) {
      servidor.solicitacoes.push({ id: 50 + i, data: '2026-11-13', aluno: 1001, aluno_nome: 'Aluno 1001', missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1,
        observacao: null, registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null });
    }
    let leituras = 0, falhar = false;
    await context.route(url => url.pathname.endsWith('/rest/v1/solicitacoes') && url.searchParams.getAll('data').join() === 'gte.2026-11-13,lte.2026-11-13', async route => {
      leituras++;
      if (falhar) await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
      else await route.fallback();
    });
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await registrarPedido(page, { horario: '08:20' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Horário cheio: já há 6 voos locais');
    expect(leituras).toBe(1);
    expect(servidor.solicitacoes).toHaveLength(6);
    // A leitura falha: as conferências não são feitas, o servidor recusa, e o aviso é o mesmo; confirmado, o 7º fica registrado
    falhar = true;
    await campoDaAgenda(page, 'data').selectOption('2026-11-12');
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await registrarPedido(page, { aluno: 'Aluno 1000', horario: '08:20' });
    await expect(campoDaAgenda(page, 'erro')).toHaveText('Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    expect(servidor.solicitacoes).toHaveLength(6);
    falhar = false;
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para sex 13/11.');
    expect(servidor.solicitacoes.map(s => [s.aluno, s.limite_confirmado_por])).toContainEqual([1000, 'Operador de Teste']);
    // Registrado, só duas leituras: os pedidos da data dele e os de cada dia do calendário
    await expect(contagemDoDia(page, '2026-11-13')).toHaveText('7');
    expect(erros).toEqual([]);
    await context.close();
  });

  // A Secretaria lê os programas dos cursos: o aluno de um curso tem as missões dele, e o pedido leva a missão do curso
  test('a Secretaria vê as missões do curso do aluno e registra a missão do curso', async ({ page, context }) => {
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    const pp = { ...novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, uuid).curso, versao: 1 };
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, {}, { nm: 'Maria', curso: 'PP' }), aluno(1001)] }, AMANHA);
    const servidor = await instalarSupabaseFalso(context, { ...docs, cursos: cursosIniciais().map(c => (c.sigla === 'PP' ? pp : c)) });
    await entrar(page, CONTAS.secretaria);
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Maria' });
    await expect(missaoDoCursoNaAgenda(page, 'NAV-150NM')).toHaveText('NAV-150NM · Navegação · C152 · 3 h');
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '10:10' });
    await expect(linhasDosPedidos(page).first()).toContainText('NAV-150NM · C152');
    expect(servidor.solicitacoes.map(s => [s.missao, s.recurso, s.horas, s.missao_do_curso])).toEqual([['Navegação', 'C152', 3, pp.missoes.find(m => m.codigo === 'NAV-150NM').id]]);
  });

  // Sem os programas lidos, a importação não sabe se a missão do curso do pedido saiu do programa: o pedido espera (não
  // conta como importado), o app diz, e ele entra com ela depois de "Tentar de novo"
  test('importar sem os programas dos cursos lidos: o pedido com a missão do curso espera e entra com ela depois', async ({ browser }) => {
    const context = await browser.newContext();
    await prepararContexto(context);
    const page = await context.newPage();
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    const pp = { ...novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, uuid).curso, versao: 1 };
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false }, { nm: 'Maria', curso: 'PP' }), aluno(1001, { fly: false })] }, AMANHA);
    const servidor = await instalarSupabaseFalso(context, { ...docs, cursos: cursosIniciais().map(c => (c.sigla === 'PP' ? pp : c)) });
    servidor.solicitacoes.push(pedidoDe(1, AMANHA, { aluno_nome: 'Maria', missao: 'Navegação', horas: 3, recurso: 'C152', missao_do_curso: pp.missoes.find(m => m.codigo === 'NAV-150NM').id, ...APROVADO }),
      pedidoDe(2, AMANHA, { aluno: 1001, aluno_nome: 'Aluno 1001', horario: '10:10', recurso: 'C152', ...APROVADO }));
    servidor.falhar('/rpc/programa_dos_cursos');
    const erros = vigiarErros(page, { statusEsperados: [503] });
    await entrar(page, CONTAS.operador);
    await expect(page.locator('#aviso-dados')).toBeVisible();
    await botaoDaAba(page, 'dem').click();
    await importarDaAgenda(page);
    await expect(page.locator('#toast-box')).toContainText('1 pedido(s) na demanda · 1 pedido com a missão do curso espera os programas dos cursos, que não foram lidos: importe de novo depois de lê-los.');
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.importadas).toEqual([2]);
    expect(servidor.dias.get(AMANHA).conteudo.pedidos[1000].fly).toBe(false);
    await page.locator('#btn-tentar-dados').click();
    await expect(page.locator('#aviso-dados')).toBeHidden();
    await importarDaAgenda(page);
    await expect(page.locator('#toast-box')).toContainText('1 pedido(s) na demanda.');
    await expect.poll(() => { const p = servidor.dias.get(AMANHA).conteudo.pedidos[1000]; return [p.fly, p.etapa, p.cursoDaEtapa]; }).toEqual([true, 'NAV-150NM', 'PP']);
    expect(erros).toEqual([]);
    await context.close();
  });

  // A aprovação no servidor (D1) pelos botões do D2: o do operador nasce aprovado (por ele) com "Registrar e aprovar" e
  // aguarda com "Registrar sem aprovar"; o da secretaria ("Registrar pedido") aguarda. A 2ª preferência vai com ele
  for (const [quem, conta, botao, aprovadoPor, aviso] of [
    ['do operador com "Registrar e aprovar" nasce aprovado', CONTAS.operador, 'aprovar', 'Operador de Teste', 'Pedido registrado e aprovado: já está na demanda.'],
    ['do operador com "Registrar sem aprovar" aguarda a aprovação', CONTAS.operador, 'sem-aprovar', null, 'Pedido registrado: aguardando aprovação.'],
    ['da secretaria aguarda a aprovação', CONTAS.secretaria, 'aprovar', null, 'Pedido registrado: aguardando aprovação.']
  ]) {
    test(`o pedido ${quem}`, async ({ page, context }) => {
      const servidor = await instalarSupabaseFalso(context, comAlunos());
      await entrar(page, conta);
      await irPara(page, 'age');
      await registrarPedido(page, { horario: '08:20', horario2: '10:10', botao });
      await expect(page.locator('#toast-box')).toContainText(aviso);
      expect(servidor.solicitacoes.map(s => [s.aluno, s.aprovada_por, s.horario2])).toEqual([[1000, aprovadoPor, '10:10']]);
    });
  }

  // Outra pessoa registra para a data do campo, que não é a aberta: abrir a Agenda de novo lê os pedidos dela
  test('a Agenda aberta de novo lê também os pedidos da data do pedido', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date('2026-11-10T13:30:00-03:00'));
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-12');
    servidor.solicitacoes.push(pedidoDe(1, '2026-11-12'));
    await irPara(page, 'esc');
    await irPara(page, 'age');
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 12/11: Voo Local às 08:20.');
    expect(servidor.solicitacoes).toHaveLength(1);
  });

  // A data acabou de abrir e os pedidos dela ainda chegam: o registro espera por eles
  test('registrar enquanto os pedidos da data aberta chegam espera por eles', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    servidor.solicitacoes.push(pedidoDe(1, '2026-11-12'));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    const soltar = await segurarPedidos(context, '2026-11-12');
    await diaSeguinte(page);
    await expect(page.locator('#age')).toHaveText('Lendo os pedidos desta data…');
    await registrarPedido(page, { horario: '10:10' });
    const registrar = page.locator('#form-agenda [type="submit"]');
    await expect(registrar).toHaveText('Registrando…');
    soltar();
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 12/11: Voo Local às 08:20.');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    expect(servidor.solicitacoes).toHaveLength(1);
  });

  test('dois cliques em Registrar enquanto os pedidos da outra data chegam registram um pedido só', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    const soltar = await segurarPedidos(context, '2026-11-13');
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await registrarPedido(page, { horario: '10:10' });
    const registrar = page.locator('#form-agenda [type="submit"]');
    await expect(registrar).toHaveText('Registrando…');
    await expect(page.locator('#form-agenda')).toHaveAttribute('aria-busy', 'true');
    await registrar.click();
    soltar();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para sex 13/11.');
    await expect(registrar).toHaveText('Registrar e aprovar');
    await expect(page.locator('#form-agenda')).not.toHaveAttribute('aria-busy');
    await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
    expect(servidor.solicitacoes).toHaveLength(1);
    // O seguinte já vê o registrado
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 13/11: Voo Local · C152 às 10:10.');
    expect(servidor.solicitacoes).toHaveLength(1);
  });

  test('a exceção da coordenação também registra uma vez só, e o botão volta ao nome dele', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    const excecao = campoDaAgenda(page, 'excecao');
    const nome = await excecao.textContent();
    const soltar = await segurarPedidos(context, '2026-11-10');
    await campoDaAgenda(page, 'data').selectOption('2026-11-10');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('06:30');
    await campoDaAgenda(page, 'por').fill('Coordenação');
    await excecao.click();
    await expect(excecao).toHaveText('Registrando…');
    await excecao.click();
    soltar();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para ter 10/11 pela Exceção da Coordenação.');
    await expect(excecao).toHaveText(nome);
    expect(servidor.solicitacoes).toHaveLength(1);
  });

  test('cancelar lê de novo os pedidos da data e os de cada dia do calendário', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    servidor.solicitacoes.push(pedidoDe(1, AMANHA));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await campoDaAgenda(page, 'por').fill('Maria');
    await escolherPedido(page, 1);
    const cancelar = acaoDoPedido(page, 'cancelar');
    await expect(contagemDoDia(page, AMANHA)).toHaveText('1');
    await cancelar.click();
    // Enquanto isso, outra pessoa registrou para o dia 13
    servidor.solicitacoes.push(pedidoDe(2, '2026-11-13'));
    await cancelar.click();
    await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
    await expect(contagemDoDia(page, AMANHA)).toHaveCount(0);
    await expect(linhaDaLista(page, 1)).toHaveClass(/\bapagado\b/);
    expect(servidor.solicitacoes[0].cancelada_por).toBe('Maria');
  });

  test('o Gestor vê a agenda, sem registrar nem cancelar', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    servidor.solicitacoes.push({ id: 1, data: AMANHA, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'manha', horario: null,
      observacao: null, registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null });
    await entrar(page, CONTAS.gestor);
    await botaoDaAba(page, 'age').click();
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    // O pedido de antes, sem o recurso: só a missão; de um período, sem horário
    await expect(linhasDosPedidos(page).first().locator('.lista-l2-texto')).toHaveText('Voo Local · 1 h');
    await expect(page.locator('#form-agenda')).toBeHidden();
    await expect(page.locator('#det-age')).toContainText('Escolha um pedido na lista.');
    await expect(botaoDosPedidos(page, 'novo')).toBeHidden();
    await expect(aprovarNaLinha(page, 1)).toBeHidden();
    await escolherPedido(page, 1);
    await expect(detalheDoPedido(page)).toBeVisible();
    await expect(acaoDoPedido(page, 'cancelar')).toHaveCount(0);
    await expect(acaoDoPedido(page, 'repetir')).toHaveCount(0);
    await expect(acaoDoPedido(page, 'aprovar')).toHaveCount(0);
  });

  // Um clique a mais enquanto o servidor não respondeu não é outro pedido (nem outro voo na demanda)
  test('o segundo clique em "Registrar pedido" antes da resposta não registra de novo', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.secretaria);
    let chamadas = 0;
    page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/rpc/registrar_solicitacao')) chamadas++; });
    const liberar = servidor.segurar('/rpc/registrar_solicitacao');
    await registrarPedido(page, { aluno: 'Aluno 1000', missao: 'Navegação', recurso: 'PA-34', horario: '07:30' });
    await page.locator('#form-agenda [type="submit"]').click();
    await campoDaAgenda(page, 'por').press('Enter');
    liberar();
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(campoDaAgenda(page, 'aluno')).toHaveValue('');
    expect(chamadas).toBe(1);
    // O pedido seguinte é registrado normalmente
    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'Navegação', recurso: 'PA-34', horario: '08:00' });
    await expect(linhasDosPedidos(page)).toHaveCount(2);
    expect(servidor.solicitacoes.map(s => [s.aluno, s.horario])).toEqual([[1000, '07:30'], [1001, '08:00']]);
  });

  // A rede que cai no meio do registro: não se sabe se ele chegou, e o app não tenta de novo sozinho
  test('o registro sem resposta não é repetido', async ({ browser }) => {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    const servidor = await instalarSupabaseFalso(contexto, comAlunos());
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [503], ignorar: [/ERR_FAILED/] });
    let chamadas = 0;
    await page.route('**/rpc/registrar_solicitacao', async route => {
      chamadas++;
      await route.abort();
    });
    await entrar(page, CONTAS.secretaria);
    await registrarPedido(page, { aluno: 'Aluno 1000', missao: 'Navegação', recurso: 'C152', horario: '08:20' });
    await expect(campoDaAgenda(page, 'erro')).toHaveText('Não foi possível registrar o pedido. Verifique a conexão e tente de novo.');
    expect(chamadas).toBe(1);
    expect(servidor.solicitacoes).toEqual([]);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // A importação que termina depois de trocar de data não grava nada na data nova
  test('trocar de data durante a importação da agenda cancela a importação', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false })] }, AMANHA));
    servidor.solicitacoes.push({
      id: 1, data: AMANHA, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'tarde', horario: null, observacao: null,
      registrado_por: 'Secretaria', registrado_em: '2026-11-10T12:00:00.000Z', excecao: false, cancelada_em: null, cancelada_por: null, ...APROVADO
    });
    await entrar(page, CONTAS.operador);
    await botaoDaAba(page, 'dem').click();
    const liberar = servidor.segurar('/rest/v1/solicitacoes');
    await importarDaAgenda(page);
    await diaSeguinte(page);
    // A data nova já aberta (o rótulo muda depois de carregar)
    await expect(rotuloDaData(page)).toContainText('12/11');
    liberar();
    await expect(page.locator('#toast-box')).toContainText('A data mudou durante a importação dos pedidos: nada foi importado.');
    const dia = servidor.dias.get('2026-11-12');
    expect(dia && dia.conteudo.pedidos[1000] && dia.conteudo.pedidos[1000].fly).toBeFalsy();
    expect(servidor.dias.get(AMANHA).conteudo.pedidos[1000].fly).toBe(false);
  });
});

// A página dos pedidos (D2) no modo compartilhado: "Registrar e aprovar" e "Registrar na lista de espera" só pelo teclado
// (o aviso, a linha de estado do formulário e a linha do pedido à vista), a Secretaria que registra sem aprovar e o
// Operador que aprova o pedido dela. D3: os pedidos em dia (a vigia a cada minuto, com o relógio dos testes: nada espera o
// tempo de verdade) e o aviso das novidades
test.describe('A página dos pedidos (modo compartilhado)', () => {
  // Um pedido já no servidor, com as colunas da aprovação (aprovado: pelo Operador de Teste)
  const noServidor = (id, extra = {}, { aprovado = true } = {}) => ({
    ...pedidoDe(id, AMANHA, { recurso: 'C152', horario2: null, missao_do_curso: null, usuario: null, limite_confirmado_por: null, limite_confirmado_em: null }),
    aprovada_em: aprovado ? '2026-11-10T14:30:00.000Z' : null, aprovada_por: aprovado ? 'Operador de Teste' : null, aprovada_usuario: null,
    aprovacao_retirada_em: null, aprovacao_retirada_por: null, aprovacao_retirada_usuario: null, ...extra
  });
  // Escolhe a opção pelo texto digitado no campo (a busca do próprio campo), e vai para o seguinte com Tab
  const digitarETab = async (page, texto) => { await page.keyboard.type(texto); await page.keyboard.press('Tab'); };
  // O formulário inteiro pelo teclado, do Aluno até o botão (a 2ª preferência e a duração ficam como estão)
  async function preencherPeloTeclado(page, { aluno, horario, por = 'Maria' }) {
    await campoDaAgenda(page, 'aluno').focus();
    await digitarETab(page, aluno);
    await digitarETab(page, 'Voo Local');
    await digitarETab(page, 'C152');
    await digitarETab(page, horario);
    await page.keyboard.press('Tab'); // a 2ª preferência
    await page.keyboard.press('Tab'); // a duração
    await digitarETab(page, por);
    await page.keyboard.press('Tab'); // a observação
  }

  test('"Registrar e aprovar" só pelo teclado: o aviso, a linha de estado e a linha à vista; dois alunos com o mesmo nome', async ({ page, context }) => {
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false }, { nm: 'Maria Silva' }), aluno(1001, { fly: false }, { nm: 'Maria Silva' }),
      ...Array.from({ length: 24 }, (_, i) => aluno(1002 + i, { fly: false }))] }, AMANHA);
    const servidor = await instalarSupabaseFalso(context, docs);
    // A outra Maria Silva já tem pedido, e a lista é comprida: a linha nova fica embaixo
    servidor.solicitacoes.push(noServidor(1, { aluno: 1001, aluno_nome: 'Maria Silva', horario: '06:30' }),
      ...Array.from({ length: 24 }, (_, i) => noServidor(2 + i, { aluno: 1002 + i, aluno_nome: `Aluno ${1002 + i}`, horario: '06:30' })));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await expect(linhasDosPedidos(page)).toHaveCount(25);
    await preencherPeloTeclado(page, { aluno: 'Maria Silva', horario: '16:20' });
    await expect(enviarDaAgenda(page)).toBeFocused();
    await expect(enviarDaAgenda(page)).toHaveText('Registrar e aprovar');
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect(estadoDoFormulario(page)).toHaveText('Último pedido: Maria Silva · Voo Local · C152 às 16:20 · aprovado, na demanda.');
    const novo = servidor.solicitacoes.at(-1);
    expect([novo.aluno, novo.horario, novo.aprovada_por]).toEqual([1000, '16:20', 'Operador de Teste']);
    await expect(linhaDaLista(page, novo.id)).toHaveAttribute('data-recente', '');
    await expect(linhaDaLista(page, novo.id)).toBeInViewport();
    await expect(page.locator('#age > li[data-recente]')).toHaveCount(1);
    await expect(linhaDaLista(page, novo.id)).toContainText('16:20');
    // Entrou na demanda da data (gravada), com o aluno certo
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.importadas).toEqual([novo.id]);
    expect(servidor.dias.get(AMANHA).conteudo.pedidos[1000].solicitacao).toBe(novo.id);
    // O formulário fica para o próximo, com o foco no Aluno
    await expect(campoDaAgenda(page, 'aluno')).toHaveValue('');
  });

  test('"Registrar na lista de espera" pelo teclado, com o aviso dele; a recusa do servidor (o 6º registrado em outro computador) arma os dois botões; "Registrar mesmo assim" ainda registra a confirmação', async ({ browser }) => {
    const context = await browser.newContext();
    await prepararContexto(context);
    const page = await context.newPage();
    const erros = vigiarErros(page, { statusEsperados: [422] });
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false }), ...Array.from({ length: 6 }, (_, i) => aluno(1010 + i, { fly: false }))] }, AMANHA);
    const servidor = await instalarSupabaseFalso(context, docs);
    servidor.solicitacoes.push(...Array.from({ length: 5 }, (_, i) => noServidor(1 + i, { aluno: 1010 + i, aluno_nome: `Aluno ${1010 + i}` })));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await expect(linhasDosPedidos(page)).toHaveCount(5);
    // O 6º, em outro computador: este não leu de novo, e quem recusa é o servidor
    servidor.solicitacoes.push(noServidor(6, { aluno: 1015, aluno_nome: 'Aluno 1015' }));
    await preencherPeloTeclado(page, { aluno: 'Aluno 1000', horario: '08:20' });
    await page.keyboard.press('Enter');
    await expect(campoDaAgenda(page, 'erro')).toHaveText('Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(enviarDaAgenda(page)).toHaveText('Registrar mesmo assim');
    await expect(campoDaAgenda(page, 'esperar')).toBeVisible();
    expect(servidor.solicitacoes).toHaveLength(6);
    // Pelo teclado: de "Registrar mesmo assim", Tab passa por "Registrar sem aprovar" e chega à lista de espera
    await expect(enviarDaAgenda(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(campoDaAgenda(page, 'esperar')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado na lista de espera das 08:20: já há 6 voos locais.');
    await expect(estadoDoFormulario(page)).toContainText('Aluno 1000 · Voo Local · C152 às 08:20 · na lista de espera');
    const espera = servidor.solicitacoes.at(-1);
    expect([espera.aluno, espera.limite_confirmado_por, Boolean(espera.aprovada_em)]).toEqual([1000, null, true]);
    await expect(campoDaAgenda(page, 'esperar')).toBeHidden();
    // O seguinte confirma o 8º: a confirmação fica registrada
    await preencherPeloTeclado(page, { aluno: 'Aluno 1001', horario: '08:20' });
    await page.keyboard.press('Enter');
    await expect(campoDaAgenda(page, 'erro')).toContainText('já há 7 voos locais');
    await expect(enviarDaAgenda(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    const confirmado = servidor.solicitacoes.at(-1);
    expect([confirmado.aluno, confirmado.limite_confirmado_por]).toEqual([1001, 'Operador de Teste']);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a Secretaria registra sem aprovar, sem "Aprovar" na lista; o Operador aprova o pedido dela na linha, e ele entra na demanda', async ({ browser }) => {
    const servidor = criarSupabaseFalso(comAlunos());
    const abrirComo = async conta => {
      const context = await browser.newContext();
      await prepararContexto(context);
      await servidor.instalar(context);
      const page = await context.newPage();
      await entrar(page, conta);
      await irPara(page, 'age');
      return { context, page };
    };
    const secretaria = await abrirComo(CONTAS.secretaria);
    await expect(enviarDaAgenda(secretaria.page)).toHaveText('Registrar pedido');
    await expect(campoDaAgenda(secretaria.page, 'registrar')).toBeHidden();
    await registrarPedido(secretaria.page, { horario: '08:20' });
    await expect(secretaria.page.locator('#toast-box')).toContainText('Pedido registrado: aguardando aprovação.');
    const { id } = servidor.solicitacoes.at(-1);
    await expect(grupoDosPedidos(secretaria.page, 'aguardando')).toContainText('Aguardando aprovação');
    await expect(linhaDaLista(secretaria.page, id)).toBeVisible();
    await expect(aprovarNaLinha(secretaria.page, id)).toBeHidden();
    await expect(botaoDosPedidos(secretaria.page, 'aprovar-todos')).toBeHidden();
    expect(servidor.gravacoes).toEqual([]);
    await secretaria.context.close();

    const operador = await abrirComo(CONTAS.operador);
    await aprovarNaLinha(operador.page, id).click();
    await expect(operador.page.locator('#toast-box')).toContainText('Pedido aprovado: já está na demanda.');
    expect([servidor.solicitacoes.at(-1).aprovada_por]).toEqual(['Operador de Teste']);
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.importadas).toEqual([id]);
    await expect(linhaDaLista(operador.page, id)).toContainText('Aprovado por Operador de Teste às 12:00 · Na demanda');
    await operador.context.close();
  });

  test('dois alunos com o mesmo nome: o pedido do segundo é dele, na agenda e na demanda (o nome não vira o primeiro)', async ({ page, context }) => {
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false }, { nm: 'Maria Silva' }), aluno(1001, { fly: false }, { nm: 'Maria Silva' })] }, AMANHA);
    const servidor = await instalarSupabaseFalso(context, docs);
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await campoDaAgenda(page, 'aluno').selectOption('1001');
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await campoDaAgenda(page, 'por').fill('Maria');
    await enviarDaAgenda(page).click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    const novo = servidor.solicitacoes.at(-1);
    expect([novo.aluno, novo.aluno_nome]).toEqual([1001, 'Maria Silva']);
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.importadas).toEqual([novo.id]);
    const { pedidos } = servidor.dias.get(AMANHA).conteudo;
    expect([pedidos[1001].solicitacao, pedidos[1000]?.solicitacao ?? null]).toEqual([novo.id, null]);
  });

  test('a escala mudou em outro computador: o aprovado não entra na hora, o aviso pede "Atualizar"; "Importar" na Demanda lê a data de novo e o põe lá', async ({ browser }) => {
    const docs = documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false }), aluno(1002, { fly: false })] }, AMANHA);
    const servidor = criarSupabaseFalso(docs);
    servidor.solicitacoes.push(noServidor(1, {}, { aprovado: false }), noServidor(2, { aluno: 1001, aluno_nome: 'Aluno 1001', horario: '10:10' }, { aprovado: false }),
      noServidor(3, { aluno: 1002, aluno_nome: 'Aluno 1002', horario: '12:40' }));
    const abrirComo = async conta => {
      const context = await browser.newContext();
      await prepararContexto(context);
      await servidor.instalar(context);
      const page = await context.newPage();
      await entrar(page, conta);
      await irPara(page, 'age');
      return { context, page };
    };
    const a = await abrirComo(CONTAS.operador);
    const b = await abrirComo(CONTAS.operador);
    // B aprova o 1: ele entra, e a escala desta data é gravada
    await aprovarNaLinha(b.page, 1).click();
    await expect(b.page.locator('#toast-box')).toContainText('Pedido aprovado: já está na demanda.');
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.importadas).toEqual([1]);
    // A, que leu a escala antes, aprova o 2: ele não entra por cima da escala de B
    await aprovarNaLinha(a.page, 2).click();
    await expect(a.page.locator('#toast-box')).toContainText('Pedido aprovado. A escala desta data mudou em outro computador: “Atualizar” e depois “Importar”.');
    await expect(avisoDosPedidos(a.page)).toContainText('A escala desta data mudou em outro computador.');
    await expect(botaoDosPedidos(a.page, 'atualizar-data')).toBeVisible();
    expect(servidor.solicitacoes.find(s => s.id === 2).aprovada_por).toBe('Operador de Teste');
    expect(servidor.dias.get(AMANHA).conteudo.importadas).toEqual([1]);
    // "Importar" na Demanda: lê a data de novo antes e põe os aprovados fora da demanda (o 2 e o 3), sem apagar o 1
    await irPara(a.page, 'dem');
    await importarDaAgenda(a.page);
    await expect(a.page.locator('#toast-box')).toContainText('2 pedido(s) na demanda.');
    await expect.poll(() => [...servidor.dias.get(AMANHA).conteudo.importadas].sort()).toEqual([1, 2, 3]);
    await a.context.close();
    await b.context.close();
  });

  test('outra data aberta enquanto o servidor diz se a escala mudou: o pedido fica aprovado, fora da demanda, e o aviso diz', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    servidor.solicitacoes.push(noServidor(1, {}, { aprovado: false }));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    // Segura a pergunta "a escala mudou?" (a versão gravada da data) até a outra data abrir
    let soltar, perguntas = 0;
    const espera = new Promise(resolve => { soltar = resolve; });
    await context.route(url => url.pathname.endsWith('/rest/v1/dias') && url.searchParams.get('select') === 'versao', async route => { perguntas++; await espera; await route.fallback(); });
    await aprovarNaLinha(page, 1).click();
    await expect.poll(() => perguntas).toBe(1);
    await diaSeguinte(page);
    soltar();
    await expect(page.locator('#toast-box')).toContainText('Pedido aprovado. Outra data foi aberta enquanto isso: na data dele, “Importar” o põe na demanda.');
    expect(servidor.solicitacoes[0].aprovada_por).toBe('Operador de Teste');
    expect(servidor.dias.get(AMANHA).conteudo.importadas || []).toEqual([]);
  });

  // D3. O relógio dos testes (fixtures.js) anda os temporizadores: runFor passa um minuto sem esperar um
  const umMinuto = page => page.clock.runFor(60_000);

  test('D3: um pedido registrado em outro computador aparece em até um minuto, com o aviso; a escala da data gravada em outro computador, também', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    // Outro computador registra um pedido: esta tela ainda não leu
    servidor.solicitacoes.push(noServidor(1, {}, { aprovado: false }));
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    await umMinuto(page);
    await expect(linhaDaLista(page, 1)).toBeVisible();
    await expect(grupoDosPedidos(page, 'aguardando')).toContainText('Aguardando aprovação');
    await expect(page.locator('#toast-box')).toContainText('Pedidos de qua 11/11: 1 novo.');
    // Outro computador aprova e grava a escala da data: a vigia pergunta pela escala, e o aviso pede "Atualizar"
    Object.assign(servidor.solicitacoes[0], { aprovada_em: '2026-11-10T15:00:00.000Z', aprovada_por: 'Outro Operador' });
    servidor.dias.get(AMANHA).versao++;
    await umMinuto(page);
    await expect(page.locator('#toast-box')).toContainText('Pedidos de qua 11/11: 1 aprovado.');
    await expect(avisoDosPedidos(page)).toContainText('A escala desta data mudou em outro computador.');
    await expect(linhaDaLista(page, 1)).toContainText('Aprovado por Outro Operador');
    await botaoDosPedidos(page, 'atualizar-data').click();
    await expect(avisoDosPedidos(page)).not.toContainText('mudou em outro computador');
    // A vigia só lê: nada foi gravado
    expect(servidor.gravacoes).toEqual([]);
  });

  test('D3: a página escondida não lê a cada minuto; de volta a ela, lê', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, comAlunos());
    await entrar(page, CONTAS.operador);
    await irPara(page, 'age');
    let leituras = 0;
    page.on('request', r => { if (new URL(r.url()).pathname.endsWith('/rest/v1/solicitacoes')) leituras++; });
    const visibilidade = estado => page.evaluate(v => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    }, estado);
    await visibilidade('hidden');
    servidor.solicitacoes.push(noServidor(1, {}, { aprovado: false }));
    await umMinuto(page);
    await umMinuto(page);
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    expect(leituras).toBe(0);
    await visibilidade('visible');
    await expect(linhaDaLista(page, 1)).toBeVisible();
    await expect(page.locator('#toast-box')).toContainText('Pedidos de qua 11/11: 1 novo.');
    expect(leituras).toBe(1);
  });

  // Um C152 só e dois pedidos da agenda às 08:20, na demanda: o 1º voa, o 2º espera a vaga (a espera da recusa, F1h)
  const comListaDeEspera = ({ espera }) => {
    const estado = { ...estadoSintetico(), stu: [1000, 1001].map((id, i) => aluno(id, { p1: 500, p2: -1, jan: 'h500', solicitacao: i + 1 })) };
    for (const r of espera ? apenas('C152', 'PP-LJV') : apenas('C152', 'PP-LJV', 'PR-BTB')) estado.av[r] = false;
    estado.importadas = [1, 2];
    return documentosAtuais(estado, AMANHA);
  };
  for (const espera of [true, false]) {
    test(`D3: o pedido cancelado em outro computador ${espera ? 'diz o 1º da lista de espera do horário dele, sem pôr ninguém na escala' : 'sem ninguém na lista de espera: só o cancelamento'}`, async ({ page, context }) => {
      const servidor = await instalarSupabaseFalso(context, comListaDeEspera({ espera }));
      servidor.solicitacoes.push(noServidor(1), noServidor(2, { aluno: 1001, aluno_nome: 'Aluno 1001' }));
      await entrar(page, CONTAS.operador);
      await irPara(page, 'age');
      await expect(linhasDosPedidos(page)).toHaveCount(2);
      Object.assign(servidor.solicitacoes[0], { cancelada_em: '2026-11-10T15:00:00.000Z', cancelada_por: 'Maria' });
      await umMinuto(page);
      await expect(page.locator('#toast-box')).toContainText('Pedidos de qua 11/11: 1 cancelado.');
      if (espera) await expect(page.locator('#toast-box')).toContainText('A vaga de Aluno 1000 às 08:20 fica livre quando o voo sair da escala; 1º na lista de espera: Aluno 1001.');
      else await expect(page.locator('#toast-box')).not.toContainText('lista de espera');
      // Ninguém foi posto na escala: o voo do cancelado continua lá até a escala ser refeita, e nada foi gravado
      await expect(avisoDosPedidos(page)).toContainText('pedido cancelado ou sem aprovação ainda está na demanda: Aluno 1000');
      expect(servidor.gravacoes).toEqual([]);
    });
  }
});

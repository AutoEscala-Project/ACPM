// Backend local (localStorage) e a troca de backend do ApiClient.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { backendLocal } from '../../js/backends/local.js';
import { ApiClient } from '../../js/storage.js';
import { FORMATO_DOS_CURSOS } from '../../js/migracoes.js';
import { programaDoLegado } from '../../js/programa.js';
import { normalizarCursos } from '../../js/cursos.js';
import { simularNavegador } from '../helpers/navegador.js';
import { PROGRAMA, IDS } from '../helpers/casos-do-programa.js';
import { CASOS_DA_AGENDA, CURSO_DOS_CASOS, pedidoDosCasos, localDosCasos } from '../helpers/casos-da-agenda.js';
import { CASOS_DAS_SOLICITACOES, AGORA_DOS_CASOS, DATAS_DOS_CASOS, ID_QUE_NAO_EXISTE, linhaDoCaso, pedidoDoPasso, situacaoDoCaso, paraOModoLocal } from '../helpers/casos-das-solicitacoes.js';
import { cursosIniciais } from '../../js/programa.js';
import { CASOS_DOS_IMPORTADOS } from '../helpers/casos-dos-importados.js';
import { CASOS_DOS_DADOS_PESSOAIS, CADASTRO_DOS_CASOS, ALUNO_DOS_CASOS, VERSAO_DOS_CASOS, tabelaDoCaso, versaoLidaDoCaso } from '../helpers/casos-dos-dados-pessoais.js';

beforeEach(() => simularNavegador());

describe('Backend local (localStorage)', () => {
  it('grava e lê cada documento na sua chave do localStorage', async () => {
    const chaves = { estado: 'acpm3', escala: 'acpm3_res', historico: 'acpm3_audit', bi: 'acpm3_bi' };
    for (const [documento, chaveLocal] of Object.entries(chaves)) {
      assert.equal(await backendLocal.gravar(documento, { documento }), true);
      assert.deepEqual(JSON.parse(localStorage.getItem(chaveLocal)), { documento });
      assert.deepEqual(await backendLocal.ler(documento), { documento });
    }
  });

  it('documento ausente ou corrompido é lido como null', async () => {
    assert.equal(await backendLocal.ler('escala'), null);
    localStorage.setItem('acpm3_bi', '{corrompido');
    assert.equal(await backendLocal.ler('bi'), null);
  });

  it('recusa documentos desconhecidos', async () => {
    await assert.rejects(backendLocal.ler('outro'), /documento desconhecido/);
    await assert.rejects(backendLocal.gravar('outro', {}), /documento desconhecido/);
  });
});

describe('Backend local: escala por data, cadastro e histórico', () => {
  it('grava e lê o cadastro e a escala de cada data em chaves próprias', async () => {
    assert.equal(await backendLocal.gravar('cadastro', { ins: [] }), true);
    assert.deepEqual(JSON.parse(localStorage.getItem('acpm4_cadastro')), { ins: [] });
    assert.equal(await backendLocal.gravar('dia:2026-11-11', { v: 1 }), true);
    assert.deepEqual(JSON.parse(localStorage.getItem('acpm4_dia_2026-11-11')), { v: 1 });
    assert.deepEqual(await backendLocal.ler('dia:2026-11-11'), { v: 1 });
    assert.equal(await backendLocal.ler('dia:2026-11-12'), null);
    await assert.rejects(backendLocal.ler('dia:amanhã'), /documento desconhecido/);
  });

  it('as datas guardadas num formato anterior (a atualização do formato lê só essas)', async () => {
    localStorage.setItem('acpm4_dia_2026-11-10', JSON.stringify({ esquema: 17 }));
    localStorage.setItem('acpm4_dia_2026-11-11', JSON.stringify({ esquema: 18 }));
    localStorage.setItem('acpm4_dia_2026-11-12', JSON.stringify({ v: 1 }));
    localStorage.setItem('acpm4_dia_2026-11-13', '{corrompido');
    assert.deepEqual(await backendLocal.diasEmFormatoAntigo(18), ['2026-11-10', '2026-11-12', '2026-11-13']);
  });

  it('lista as datas de um período em ordem e acha o dia anterior com escala', async () => {
    for (const d of ['2026-11-12', '2026-10-30', '2026-11-01', '2026-11-30', '2026-12-01']) await backendLocal.gravar(`dia:${d}`, { d });
    localStorage.setItem('acpm3', '{}');
    assert.deepEqual((await backendLocal.listarDias('2026-11-01', '2026-11-30')).map(x => x.data), ['2026-11-01', '2026-11-12', '2026-11-30']);
    assert.deepEqual(await backendLocal.diaAnterior('2026-11-12'), { data: '2026-11-01', conteudo: { d: '2026-11-01' } });
    assert.deepEqual(await backendLocal.diaAnterior('2027-01-01'), { data: '2026-12-01', conteudo: { d: '2026-12-01' } });
    assert.equal(await backendLocal.diaAnterior('2026-10-30'), null);
  });

  it('histórico: registra com data, lista por data (mais recente primeiro) e importa uma vez só', async () => {
    const a = await backendLocal.registrar({ data: '2026-11-11', tipo: 'exc', descricao: 'PR-BTB: Manutenção', reverter: { kind: 'setAv' } });
    const b = await backendLocal.registrar({ data: '2026-11-11', tipo: 'inc', descricao: 'Revertido: PR-BTB', reverte: a });
    await backendLocal.registrar({ data: '2026-11-12', tipo: 'mod', descricao: 'Outra data' });
    const lista = await backendLocal.listarHistorico('2026-11-11');
    assert.deepEqual(lista.map(e => [e.id, e.descricao, e.reverte]), [[b, 'Revertido: PR-BTB', a], [a, 'PR-BTB: Manutenção', null]]);
    assert.deepEqual(lista[1].reverter, { kind: 'setAv' });
    assert.equal(lista[0].autor, null);

    assert.equal(await backendLocal.importarHistorico('2026-11-11', [{ registrado_em: '2026-11-09T10:00:00.000Z', tipo: 'inc', descricao: 'Antiga' }]), 1);
    assert.equal(await backendLocal.importarHistorico('2026-11-11', [{ tipo: 'inc', descricao: 'De novo' }]), 0);
    const depois = await backendLocal.listarHistorico('2026-11-11');
    assert.deepEqual(depois.map(e => e.descricao), ['Revertido: PR-BTB', 'PR-BTB: Manutenção', 'Antiga']);
    assert.deepEqual([depois[2].importado, depois[2].registrado_em], [true, '2026-11-09T10:00:00.000Z']);
  });
});

describe('Backend local: agenda de solicitações', () => {
  const antesDas13 = new Date('2026-11-10T12:00:00-03:00');
  const depoisDas13 = new Date('2026-11-10T13:30:00-03:00');
  // O pedido é num horário específico, com a duração
  const pedido = (extra = {}) => ({ data: '2026-11-11', aluno: 1000, aluno_nome: ' Aluno 1000 ', missao: 'Voo Local', janela: 'horario', horario: '06:30', horas: 1, registrado_por: ' Maria ', recurso: 'C152', ...extra });

  it('registra no prazo com quem anotou, a hora e a duração; lista por período em ordem', async () => {
    const id = await backendLocal.registrarSolicitacao(pedido(), antesDas13);
    await backendLocal.registrarSolicitacao(pedido({ data: '2026-11-16', aluno: 1001, horario: '14:30', horas: 2.64, observacao: ' PP-ABP ' }), antesDas13);
    const lista = await backendLocal.listarSolicitacoes('2026-11-01', '2026-11-30');
    assert.deepEqual(lista.map(s => [s.data, s.aluno]), [['2026-11-11', 1000], ['2026-11-16', 1001]]);
    assert.deepEqual([lista[0].id, lista[0].aluno_nome, lista[0].registrado_por, lista[0].excecao, lista[0].registrado_em], [id, 'Aluno 1000', 'Maria', false, antesDas13.toISOString()]);
    assert.deepEqual([lista[1].horario, lista[1].horas, lista[1].observacao], ['14:30', 2.6, 'PP-ABP']);
    assert.deepEqual(await backendLocal.listarSolicitacoes('2026-11-12', '2026-11-14'), []);
  });

  it('fora do prazo: recusa (403), a não ser pela exceção da coordenação, que fica marcada', async () => {
    await assert.rejects(backendLocal.registrarSolicitacao(pedido(), depoisDas13), e => e.code === 'PT403');
    await backendLocal.registrarSolicitacao(pedido({ excecao: true }), depoisDas13);
    assert.equal((await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11'))[0].excecao, true);
  });

  it('"Registrado por" é obrigatório; o horário é específico; a duração vai de 0,1 h a 5 h (o Ground, 01h30)', async () => {
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ registrado_por: '  ' }), antesDas13), e => e.code === '23514');
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ horario: null }), antesDas13), e => e.code === '22023');
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ janela: 'manha' }), antesDas13), e => e.code === '22023');
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ horas: 5.5 }), antesDas13), e => e.code === '22023');
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ horas: 0 }), antesDas13), e => e.code === '22023');
    await backendLocal.registrarSolicitacao(pedido({ missao: 'Ground C152', recurso: 'Sala Ground', horas: 3 }), antesDas13);
    assert.equal((await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11'))[0].horas, 1.5);
  });

  // Como a função de 13 argumentos: o recurso é obrigatório e é um dos que a missão permite
  it('guarda o recurso do pedido, sem os espaços; sem ele, ou um que a missão não permite, é recusado (22023, recurso)', async () => {
    for (const recurso of ['PA-34', ' C172 ']) await backendLocal.registrarSolicitacao(pedido({ missao: 'Navegação', recurso }), antesDas13);
    assert.deepEqual((await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11')).map(s => s.recurso), ['PA-34', 'C172']);
    for (const recurso of ['', null, undefined, '<b>', 'C'.repeat(31), 'Sim. Mono']) {
      await assert.rejects(backendLocal.registrarSolicitacao(pedido({ missao: 'Navegação', recurso }), antesDas13), e => e.code === '22023' && e.campo === 'recurso', String(recurso));
    }
    assert.equal((await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11')).length, 2);
  });

  // No máximo 6 voos locais no mesmo horário, como no servidor: o 7º só com a confirmação, que fica registrada
  it('o 7º voo local no mesmo horário é recusado (PT422) sem a confirmação; com ela, registrado com quem confirmou', async () => {
    for (let i = 0; i < 6; i++) await backendLocal.registrarSolicitacao(pedido({ aluno: 2000 + i, missao: ['Voo Local', 'Voo Solo', 'TGL (TMA)'][i % 3], horario: i % 3 === 1 ? '06:30' : '08:20' }), antesDas13);
    await backendLocal.registrarSolicitacao(pedido({ aluno: 2006, missao: 'Voo Local', horario: '08:20' }), antesDas13);
    await backendLocal.registrarSolicitacao(pedido({ aluno: 2007, missao: 'TGL (TMA)', horario: '08:20' }), antesDas13);
    await assert.rejects(backendLocal.registrarSolicitacao(pedido({ aluno: 2010, horario: '08:20' }), antesDas13), e => e.code === 'PT422' && e.campo === 'locais');
    await backendLocal.registrarSolicitacao(pedido({ aluno: 2011, missao: 'Navegação', horario: '08:20' }), antesDas13);
    await backendLocal.registrarSolicitacao(pedido({ aluno: 2012, horario: '08:20', confirmarLimite: true }), antesDas13);
    const [setimo] = (await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11')).filter(s => s.aluno === 2012);
    assert.deepEqual([setimo.limite_confirmado_por, setimo.limite_confirmado_em], ['Maria', antesDas13.toISOString()]);
    const [navegacao] = (await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11')).filter(s => s.aluno === 2011);
    assert.deepEqual([navegacao.limite_confirmado_por, navegacao.limite_confirmado_em, navegacao.missao_do_curso], [null, null, null]);
  });

  // Os casos da função de 13 argumentos (test/helpers/casos-da-agenda.js), com o programa do curso ZZ1 neste navegador
  for (const caso of CASOS_DA_AGENDA) {
    it(`caso da agenda: ${caso.nome}`, async () => {
      localStorage.setItem('acpm4_cursos', JSON.stringify({ cursos: [...cursosIniciais(), CURSO_DOS_CASOS], alteracoes: [] }));
      for (let n = 0; n < (caso.locais || 0); n++) await backendLocal.registrarSolicitacao(localDosCasos(n), antesDas13);
      const registro = backendLocal.registrarSolicitacao(pedidoDosCasos(caso.pedido), antesDas13);
      if (caso.erro) {
        await assert.rejects(registro, e => e.code === caso.erro.code && e.campo === caso.erro.campo);
        assert.equal((await backendLocal.listarSolicitacoes('2026-11-16', '2026-11-16')).length, caso.locais || 0);
        return;
      }
      const id = await registro;
      const s = (await backendLocal.listarSolicitacoes('2026-11-16', '2026-11-16')).find(x => x.id === id);
      assert.deepEqual({ horas: s.horas, recurso: s.recurso, missao_do_curso: s.missao_do_curso, limite_confirmado: s.limite_confirmado_por !== null && s.limite_confirmado_em !== null, horario2: s.horario2 },
        caso.registrado);
    });
  }

  // O pedido nasce aprovado com aprovar (quem aprovou: quem anotou, já que este navegador não tem conta) ou pela exceção
  it('o pedido registrado com aprovar, ou pela exceção, nasce aprovado por quem anotou; sem, aguarda', async () => {
    const aprovado = await backendLocal.registrarSolicitacao(pedido({ aprovar: true }), antesDas13);
    const aguardando = await backendLocal.registrarSolicitacao(pedido({ aluno: 1001 }), antesDas13);
    const excecao = await backendLocal.registrarSolicitacao(pedido({ aluno: 1002, excecao: true }), depoisDas13);
    const lista = await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11');
    const de = id => lista.find(s => s.id === id);
    assert.deepEqual([de(aprovado).aprovada_por, de(aprovado).aprovada_em], ['Maria', antesDas13.toISOString()]);
    assert.deepEqual([de(aguardando).aprovada_por, de(aguardando).aprovada_em, de(aguardando).horario2], [null, null, null]);
    assert.deepEqual([de(excecao).aprovada_por, de(excecao).aprovada_em], ['Maria', depoisDas13.toISOString()]);
  });

  it('aprovar e retirar a aprovação guardam quem (o nome dado; sem ele, Operador) e quando', async () => {
    const id = await backendLocal.registrarSolicitacao(pedido(), antesDas13);
    assert.deepEqual(await backendLocal.aprovarSolicitacoes([id], { por: ' Coordenação ', agora: antesDas13 }), [id]);
    let [s] = await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11');
    assert.deepEqual([s.aprovada_por, s.aprovada_em], ['Coordenação', antesDas13.toISOString()]);
    await backendLocal.retirarAprovacaoDaSolicitacao(id, { agora: depoisDas13 });
    [s] = await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11');
    assert.deepEqual([s.aprovada_por, s.aprovada_em, s.aprovacao_retirada_por, s.aprovacao_retirada_em], [null, null, 'Operador', depoisDas13.toISOString()]);
  });

  it('a contagem por dia: os que aguardam e os aprovados, sem os cancelados', async () => {
    await backendLocal.registrarSolicitacao(pedido({ aprovar: true }), antesDas13);
    await backendLocal.registrarSolicitacao(pedido({ aluno: 1001 }), antesDas13);
    const cancelado = await backendLocal.registrarSolicitacao(pedido({ data: '2026-11-12', aluno: 1002 }), antesDas13);
    await backendLocal.cancelarSolicitacao(cancelado, 'Maria', antesDas13);
    assert.deepEqual(await backendLocal.solicitacoesPorDia('2026-11-01', '2026-11-30'), { '2026-11-11': { aguardando: 1, aprovadas: 1 } });
    assert.deepEqual(await backendLocal.solicitacoesPorDia('2026-11-12', '2026-11-30'), {});
  });

  // Sem servidor, só as abas deste navegador gravam as datas dele (D2): a escala mudou quando o dia guardado agora não é o
  // que esta aba leu ou gravou por último (a revisão do D3: outra aba que pôs um pedido na demanda)
  it('a escala da data mudou em outra aba: o dia guardado agora contra o que esta aba leu ou gravou', async () => {
    await backendLocal.gravar('dia:2026-11-21', { esquema: 1 });
    assert.equal(await backendLocal.diaMudou('2026-11-21'), false);
    // Outra aba grava a data
    localStorage.setItem('acpm4_dia_2026-11-21', JSON.stringify({ esquema: 1, outra: true }));
    assert.equal(await backendLocal.diaMudou('2026-11-21'), true);
    // Esta aba lê de novo: a escala é a de agora
    await backendLocal.ler('dia:2026-11-21');
    assert.equal(await backendLocal.diaMudou('2026-11-21'), false);
    // A consulta que não guarda a versão (a véspera) não conta como leitura
    localStorage.setItem('acpm4_dia_2026-11-21', JSON.stringify({ esquema: 1, de: 'outra aba' }));
    await backendLocal.ler('dia:2026-11-21', { guardarVersao: false });
    assert.equal(await backendLocal.diaMudou('2026-11-21'), true);
    // A data sem dia guardado quando foi lida: o dia gravado depois, em outra aba, é uma mudança
    assert.equal(await backendLocal.ler('dia:2026-11-22'), null);
    assert.equal(await backendLocal.diaMudou('2026-11-22'), false);
    localStorage.setItem('acpm4_dia_2026-11-22', '{}');
    assert.equal(await backendLocal.diaMudou('2026-11-22'), true);
    // A data que esta aba nunca leu nem gravou: nada a comparar
    assert.equal(await backendLocal.diaMudou('2026-11-23'), false);
  });

  // A conversão dos pedidos de antes, uma vez (a marca acpm4_agenda_aprovacoes): a regra (a) do banco, sobre os dias deste
  // navegador, e a (b) para todos os pedidos (não há contas: quem usa tem os direitos de operador)
  it('os pedidos de antes da aprovação: convertidos uma vez, pelas regras do banco', async () => {
    // Sem pedidos guardados, nada é gravado (nem a marca)
    assert.deepEqual(await backendLocal.listarSolicitacoes('2026-01-01', '2026-12-31'), []);
    assert.equal(localStorage.getItem('acpm4_agenda_aprovacoes'), null);
    const hoje = new Date();
    const dia = n => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
    const linha = (id, data, extra = {}) => ({ id, data, aluno: 1000 + id, aluno_nome: 'Aluno', missao: 'Navegação', janela: 'horario', horario: '08:20', horas: 1,
      recurso: 'C152', observacao: null, registrado_por: 'Maria', registrado_em: hoje.toISOString(), conta: null, excecao: false, cancelada_em: null, cancelada_por: null, ...extra });
    localStorage.setItem('acpm4_agenda', JSON.stringify([
      linha(1, dia(-3)), linha(2, dia(-3)), linha(3, dia(3)), linha(4, dia(3)), linha(5, dia(3)), linha(6, dia(3), { cancelada_em: hoje.toISOString(), cancelada_por: 'Maria' }),
      linha(7, dia(4)), { ...linha(8, dia(4)), horario2: null, aprovada_em: null, aprovada_por: null, aprovacao_retirada_em: null, aprovacao_retirada_por: null }
    ]));
    localStorage.setItem(`acpm4_dia_${dia(-3)}`, JSON.stringify({ importadas: [1], pedidos: {} }));
    localStorage.setItem(`acpm4_dia_${dia(3)}`, JSON.stringify({ importadas: [3, 4, 5, 6], pedidos: { 1003: { fly: false, solicitacao: 3, extra: [] }, 1004: { extra: [{ solicitacao: 4 }] }, 1006: { solicitacao: 6, extra: [] } } }));
    const lista = await backendLocal.listarSolicitacoes(dia(-10), dia(10));
    const aprovadaPor = Object.fromEntries(lista.map(s => [s.id, s.aprovada_por]));
    // O 8, com as colunas da aprovação, foi registrado depois do passo D1: aguarda como estava
    assert.deepEqual(aprovadaPor, { 1: 'importação anterior', 2: null, 3: 'importação anterior', 4: 'importação anterior', 5: null, 6: null, 7: 'Maria', 8: null });
    assert.ok(lista.every(s => ['aprovada_em', 'aprovada_por', 'aprovacao_retirada_em', 'aprovacao_retirada_por', 'horario2'].every(c => Object.hasOwn(s, c))), 'as colunas novas em todas as linhas');
    assert.equal(localStorage.getItem('acpm4_agenda_aprovacoes'), '1');
    // Uma vez só: o pedido que aguarda depois da conversão continua aguardando
    const guardada = JSON.parse(localStorage.getItem('acpm4_agenda'));
    guardada.find(s => s.id === 7).aprovada_por = null;
    guardada.find(s => s.id === 7).aprovada_em = null;
    localStorage.setItem('acpm4_agenda', JSON.stringify(guardada));
    assert.equal((await backendLocal.listarSolicitacoes(dia(-10), dia(10))).find(s => s.id === 7).aprovada_em, null);
  });

  // G2 (a migração 20261129100100_importados_ja_aprovados no modo local, marca acpm4_agenda_aprovacoes_g): a regra (a) de
  // novo, uma vez, também nos pedidos que já têm as colunas da aprovação: o que uma aba antiga importou depois do D1 e
  // ainda aguarda fica aprovado ("importação anterior"); o resto fica como estava
  it('G2: os importados que ainda aguardam ficam aprovados, uma vez, pela regra (a) de novo', async () => {
    const hoje = new Date();
    const dia = n => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
    const colunas = { horario2: null, aprovada_em: null, aprovada_por: null, aprovacao_retirada_em: null, aprovacao_retirada_por: null };
    const linha = (id, data, extra = {}) => ({ id, data, aluno: 1000 + id, aluno_nome: 'Aluno', missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1,
      recurso: 'C152', observacao: null, registrado_por: 'Maria', registrado_em: hoje.toISOString(), conta: null, excecao: false, cancelada_em: null, cancelada_por: null, ...colunas, ...extra });
    localStorage.setItem('acpm4_agenda_aprovacoes', '1');
    localStorage.setItem('acpm4_agenda', JSON.stringify([
      linha(1, dia(3)), linha(2, dia(3)), linha(3, dia(3), { aprovacao_retirada_em: hoje.toISOString(), aprovacao_retirada_por: 'Ana' }), linha(4, dia(3)),
      linha(5, dia(-3)), linha(6, dia(3), { aprovada_em: hoje.toISOString(), aprovada_por: 'Ana' })
    ]));
    localStorage.setItem(`acpm4_dia_${dia(3)}`, JSON.stringify({ importadas: [1, 3, 4, 6], pedidos: { 1001: { fly: true, solicitacao: 1, extra: [] }, 1003: { solicitacao: 3, extra: [] }, 1006: { solicitacao: 6, extra: [] } } }));
    localStorage.setItem(`acpm4_dia_${dia(-3)}`, JSON.stringify({ importadas: [5], pedidos: {} }));
    const porId = async () => Object.fromEntries((await backendLocal.listarSolicitacoes(dia(-10), dia(10))).map(s => [s.id, s.aprovada_por]));
    // 1: levado por um registro, aguardando: aprovado; 2: não importado; 3: aprovação retirada; 4: só em importadas, sem
    // registro; 5: data passada, importado: aprovado; 6: já aprovado
    assert.deepEqual(await porId(), { 1: 'importação anterior', 2: null, 3: null, 4: null, 5: 'importação anterior', 6: 'Ana' });
    assert.equal(localStorage.getItem('acpm4_agenda_aprovacoes_g'), '1');
    // Uma vez só
    const guardada = JSON.parse(localStorage.getItem('acpm4_agenda'));
    Object.assign(guardada.find(s => s.id === 1), { aprovada_em: null, aprovada_por: null });
    localStorage.setItem('acpm4_agenda', JSON.stringify(guardada));
    assert.equal((await porId())[1], null);
  });

  // Os casos da regra (a) de novo (test/helpers/casos-dos-importados.js), os mesmos do pgTAP da migração do G2: cada um sozinho,
  // a conversão feita duas vezes (pela marca, a segunda não roda; a função pura, de novo, não muda nada)
  for (const caso of CASOS_DOS_IMPORTADOS) {
    it(`caso da regra (a) de novo: ${caso.nome}`, async () => {
      const { aprovarOsImportadosDeNovo } = await import('../../js/agenda.js');
      const hoje = new Date();
      const dia = n => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
      const data = caso.data === 'passada' ? dia(-3) : dia(5);
      const estado = {
        aguardando: {}, retirada: { aprovacao_retirada_em: hoje.toISOString(), aprovacao_retirada_por: 'Operador de teste' },
        cancelada: { cancelada_em: hoje.toISOString(), cancelada_por: 'Maria' }, aprovada: { aprovada_em: hoje.toISOString(), aprovada_por: 'Operador de teste' }
      }[caso.estado];
      const linha = { id: 7, data, aluno: 1001, aluno_nome: 'Aluno', missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1, recurso: 'C152', observacao: null,
        registrado_por: 'Maria', registrado_em: hoje.toISOString(), conta: null, excecao: false, cancelada_em: null, cancelada_por: null,
        horario2: null, aprovada_em: null, aprovada_por: null, aprovacao_retirada_em: null, aprovacao_retirada_por: null, ...estado };
      const registro = { principal: { 1001: { fly: true, solicitacao: 7, extra: [] } }, extra: { 1001: { fly: true, mis: 'Voo Local', extra: [{ mid: 1, fly: true, solicitacao: 7 }] } } }[caso.registro] || {};
      localStorage.setItem('acpm4_agenda_aprovacoes', '1');
      localStorage.setItem('acpm4_agenda', JSON.stringify([linha]));
      localStorage.setItem(`acpm4_dia_${data}`, JSON.stringify({ importadas: caso.importada ? [7] : [], pedidos: registro }));
      const [lida] = await backendLocal.listarSolicitacoes(dia(-10), dia(10));
      const esperado = caso.aprovado ? 'importação anterior' : caso.estado === 'aprovada' ? 'Operador de teste' : null;
      assert.equal(lida.aprovada_por, esperado);
      const diaDe = d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`));
      assert.deepEqual(aprovarOsImportadosDeNovo([lida], diaDe, { hoje: dia(0), agora: hoje.toISOString() }), [lida], 'de novo, nada muda');
    });
  }

  // Os casos da aprovação (test/helpers/casos-das-solicitacoes.js) que o modo local faz (só os dos operadores), no relógio
  // dos casos, com a conversão já feita
  for (const caso of CASOS_DAS_SOLICITACOES.filter(paraOModoLocal)) {
    it(`caso da aprovação: ${caso.nome}`, async () => {
      const agora = new Date(AGORA_DOS_CASOS);
      const NOMES = { operador: 'Operador de teste', administrador: 'Admin de teste' };
      localStorage.setItem('acpm4_agenda_aprovacoes', '1');
      const ids = {};
      const existentes = (caso.existentes || []).map((e, i) => { ids[e.chave] = 100 + i; return linhaDoCaso(e, 100 + i); });
      localStorage.setItem('acpm4_agenda', JSON.stringify(existentes));
      let registrados = 0;
      for (const passo of caso.passos) {
        const id = chave => ids[chave] ?? ID_QUE_NAO_EXISTE;
        const fazer = () => {
          if (passo.registrar) return backendLocal.registrarSolicitacao(pedidoDoPasso(passo.registrar, 1000), agora);
          if (passo.aprovar) return backendLocal.aprovarSolicitacoes(passo.aprovar.map(id), { por: NOMES[passo.como], agora });
          if (passo.retirar) return backendLocal.retirarAprovacaoDaSolicitacao(id(passo.retirar), { por: NOMES[passo.como], agora });
          if (passo.cancelar) return backendLocal.cancelarSolicitacao(id(passo.cancelar), 'Maria', agora);
          return backendLocal.solicitacoesPorDia(DATAS_DOS_CASOS[passo.contar[0]], DATAS_DOS_CASOS[passo.contar[1]]);
        };
        if (passo.erro) {
          await assert.rejects(fazer(), e => e.code === passo.erro.code && (e.campo ?? null) === passo.erro.campo, JSON.stringify(passo));
          continue;
        }
        const r = await fazer();
        if (passo.registrar) { ids[passo.chave] = r; registrados++; }
        const chaveDe = Object.fromEntries(Object.entries(ids).map(([c, i]) => [i, c]));
        if (passo.aprovar) assert.deepEqual(r.map(i => chaveDe[i]), passo.devolve);
        if (passo.contar) {
          const rotulo = Object.fromEntries(Object.entries(DATAS_DOS_CASOS).map(([r, d]) => [d, r]));
          assert.deepEqual(Object.fromEntries(Object.entries(r).map(([d, n]) => [rotulo[d], n])), passo.devolve);
        }
      }
      const lista = JSON.parse(localStorage.getItem('acpm4_agenda'));
      assert.equal(lista.length, existentes.length + registrados);
      for (const [chave, situacao] of Object.entries(caso.fica)) assert.equal(situacaoDoCaso(lista.find(s => s.id === ids[chave])), situacao, chave);
      // Quem aprovou: o nome dado a aprovarSolicitacoes (o registro aprovado guarda quem anotou: não é conferido aqui)
      if (!caso.passos.some(p => p.registrar)) {
        for (const [chave, como] of Object.entries(caso.aprovadaPor || {})) assert.equal(lista.find(s => s.id === ids[chave]).aprovada_por, NOMES[como], chave);
      }
    });
  }

  it('cancela guardando quem cancelou (uma vez só); o pedido continua na agenda', async () => {
    const id = await backendLocal.registrarSolicitacao(pedido(), antesDas13);
    await backendLocal.cancelarSolicitacao(id, ' Maria ', antesDas13);
    const [s] = await backendLocal.listarSolicitacoes('2026-11-11', '2026-11-11');
    assert.deepEqual([s.cancelada_por, s.cancelada_em], ['Maria', antesDas13.toISOString()]);
    await assert.rejects(backendLocal.cancelarSolicitacao(id, 'Maria'), e => e.code === 'P0002');
  });
});

// Os dados pessoais neste navegador, com as regras do servidor: os casos do nome completo (test/helpers/
// casos-dos-dados-pessoais.js) e a lista só com o CANAC e o nome completo (o resto, só na leitura da pessoa)
describe('Backend local: os dados pessoais', () => {
  const guardar = tabela => {
    localStorage.setItem('acpm4_cadastro', JSON.stringify(CADASTRO_DOS_CASOS));
    localStorage.setItem('acpm4_dados_pessoais', JSON.stringify(tabela));
  };
  const agora = new Date('2026-11-14T12:00:00.000Z');

  for (const caso of CASOS_DOS_DADOS_PESSOAIS) {
    it(`caso dos dados pessoais: ${caso.nome}`, async () => {
      guardar(tabelaDoCaso(caso));
      const gravar = backendLocal.salvarDadosPessoais('aluno', ALUNO_DOS_CASOS, caso.dados, { autor: 'Maria', agora, atualizadoEm: versaoLidaDoCaso(caso), data: '2026-11-14' });
      if (caso.erro) {
        await assert.rejects(gravar, e => e.code === caso.erro.code && e.campo === caso.erro.campo);
        return;
      }
      const r = await gravar;
      const linha = JSON.parse(localStorage.getItem('acpm4_dados_pessoais'))[`aluno:${ALUNO_DOS_CASOS}`];
      assert.equal(Boolean(linha), caso.gravado.linha);
      assert.equal((linha && linha.nome_completo) ?? null, caso.gravado.nome_completo);
      if (caso.gravado.historico) assert.equal(r.historico.descricao, caso.gravado.historico);
    });
  }

  it('a lista traz só o CANAC, o nome completo e a versão; a leitura da pessoa traz todos', async () => {
    guardar({ 'aluno:1002': { nome_completo: 'Caio da Silva', cpf: '52998224725', canac: '222333', email: 'caio@exemplo.com', atualizado_em: VERSAO_DOS_CASOS, atualizado_por: 'Maria' }, 'instrutor:7': { cpf: '11144477735', atualizado_em: VERSAO_DOS_CASOS } });
    assert.deepEqual(await backendLocal.listarDadosPessoais('aluno'), { 1002: { nome_completo: 'Caio da Silva', canac: '222333', atualizado_em: VERSAO_DOS_CASOS } });
    assert.deepEqual(await backendLocal.listarDadosPessoais('instrutor'), { 7: { atualizado_em: VERSAO_DOS_CASOS } });
    assert.equal((await backendLocal.lerDadosPessoais('aluno', 1002)).cpf, '52998224725');
  });
});

describe('Backend local: resultados das missões', () => {
  const registro = { aluno: 1000, curso: 'PP', missao: 'PP-07', resultado: 'reprovado', data: '2026-11-10', voo: '1000_0_1' };

  it('registra com quem registrou; a situação é o último registro; lê os registros do dia', async () => {
    const primeiro = await backendLocal.registrarResultado(registro, { autor: 'Maria' });
    const segundo = await backendLocal.registrarResultado({ ...registro, missao: ' pp-07 ', resultado: 'aprovado', data: '2026-11-11' }, { autor: 'Maria' });
    assert.ok(segundo > primeiro);
    assert.deepEqual((await backendLocal.situacaoDasMissoes()).map(r => [r.missao, r.resultado, r.data, r.registrado_por]), [['PP-07', 'aprovado', '2026-11-11', 'Maria']]);
    assert.deepEqual((await backendLocal.resultadosDoDia('2026-11-10')).map(r => [r.id, r.resultado]), [[primeiro, 'reprovado']]);
  });

  it('valida como o servidor e nunca apaga nem altera', async () => {
    await assert.rejects(backendLocal.registrarResultado({ ...registro, resultado: 'talvez' }), e => e.code === '23514');
    await backendLocal.registrarResultado(registro);
    await backendLocal.registrarResultado({ ...registro, resultado: 'pendente' });
    assert.deepEqual((await backendLocal.resultadosDoDia('2026-11-10')).map(r => r.resultado), ['reprovado', 'pendente']);
  });

  it('o curso tem de existir (23514): os três de hoje, sem programa gravado; depois, os cursos gravados', async () => {
    await assert.rejects(backendLocal.registrarResultado({ ...registro, curso: 'ZZ9', missao: 'ZZ9-01' }), { code: '23514', message: 'curso desconhecido' });
    await backendLocal.registrarResultado({ ...registro, curso: 'INVA' });
    localStorage.setItem('acpm4_cadastro', JSON.stringify({ esquema: FORMATO_DOS_CURSOS }));
    await backendLocal.salvarCurso('ZZ9', 0, PROGRAMA, { descricao: 'Curso ZZ9 criado: Curso de teste' });
    await backendLocal.registrarResultado({ ...registro, curso: 'ZZ9', missao: 'ZZ9-01' });
    await assert.rejects(backendLocal.registrarResultado({ ...registro, curso: 'XX' }), { code: '23514' });
    assert.deepEqual((await backendLocal.resultadosDoDia('2026-11-10')).map(r => r.curso), ['INVA', 'ZZ9']);
  });
});

describe('Backend local: o programa dos cursos (as regras do servidor, js/programa.js)', () => {
  const agora = new Date('2026-11-18T13:00:00.000Z');
  const comCadastro = esquema => localStorage.setItem('acpm4_cadastro', JSON.stringify({ nid: 1000, ins: [], stu: [], esquema }));
  const guardado = () => localStorage.getItem('acpm4_cursos');
  const criarZZ9 = () => backendLocal.salvarCurso('ZZ9', 0, PROGRAMA, { descricao: 'Curso ZZ9 criado: Curso de teste', autor: 'Maria', agora });

  it('sem programa gravado: PP, PC e INVA vazios, na versão 1, como o servidor começa; a leitura não grava a chave', async () => {
    const programa = await backendLocal.programaDosCursos();
    assert.deepEqual(programa.map(c => [c.sigla, c.nome, c.ordem, c.ativo, c.versao, c.fases, c.missoes, c.alteracoes]), [
      ['PP', 'Piloto Privado', 0, true, 1, [], [], []], ['PC', 'Piloto Comercial', 1, true, 1, [], [], []], ['INVA', 'Instrutor de Voo', 2, true, 1, [], [], []]
    ]);
    assert.equal(guardado(), null);
    assert.equal(localStorage.length, 0);
  });

  it('grava o curso como o servidor: a versão, a ordem, as alterações com quem gravou e as missões que já têm resultados', async () => {
    comCadastro(FORMATO_DOS_CURSOS);
    assert.deepEqual(await criarZZ9(), { versao: 1, atualizado_em: agora.toISOString() });
    await backendLocal.registrarResultado({ aluno: 1000, curso: 'ZZ9', missao: 'ZZ9-01', resultado: 'reprovado', data: '2026-11-18', voo: null });
    const semM5 = { ...PROGRAMA, nome: 'Curso de teste (novo nome)', missoes: PROGRAMA.missoes.filter(m => m.id !== IDS.m5) };
    assert.equal((await backendLocal.salvarCurso('ZZ9', 1, semM5, { descricao: 'ZZ9: ZZ9-05 tirada do programa', agora })).versao, 2);
    const zz9 = (await backendLocal.programaDosCursos()).find(c => c.sigla === 'ZZ9');
    assert.deepEqual([zz9.nome, zz9.ordem, zz9.versao], ['Curso de teste (novo nome)', 3, 2]);
    assert.deepEqual(zz9.missoes.map(m => [m.codigo, m.removida, m.comResultados]),
      [['ZZ9-01', false, true], ['ZZ9-02', false, false], ['ZZ9-03', false, false], ['ZZ9-04', false, false], ['ZZ9-05', true, false]]);
    assert.deepEqual(zz9.alteracoes, [
      { versao: 2, descricao: 'ZZ9: ZZ9-05 tirada do programa', registrado_em: agora.toISOString(), registrado_por: null },
      { versao: 1, descricao: 'Curso ZZ9 criado: Curso de teste', registrado_em: agora.toISOString(), registrado_por: 'Maria' }
    ]);
    // Na chave, os cursos no formato do servidor (sem o que a leitura acrescenta) e as alterações com o curso
    const { cursos, alteracoes } = JSON.parse(guardado());
    assert.deepEqual([cursos.map(c => c.sigla), Object.hasOwn(cursos[3].missoes[0], 'comResultados'), alteracoes.map(a => [a.curso, a.versao])],
      [['PP', 'PC', 'INVA', 'ZZ9'], false, [['ZZ9', 1], ['ZZ9', 2]]]);
  });

  it('recusa como o servidor (PT409, 23505, 23514, 22023, P0002), com o código e o campo, sem gravar nada', async () => {
    comCadastro(FORMATO_DOS_CURSOS);
    await criarZZ9();
    await backendLocal.registrarResultado({ aluno: 1000, curso: 'ZZ9', missao: 'ZZ9-01', resultado: 'aprovado', data: '2026-11-18', voo: null });
    const antes = guardado();
    const comMissao = (i, campos) => ({ ...PROGRAMA, missoes: PROGRAMA.missoes.map((m, j) => (j === i ? { ...m, ...campos } : m)) });
    const recusas = [
      [() => criarZZ9(), { code: 'PT409', campo: 'sigla' }],
      [() => backendLocal.salvarCurso('ZZ9', 7, PROGRAMA, { descricao: 'ZZ9: alteração' }), { code: 'PT409', campo: null }],
      [() => backendLocal.salvarCurso('ZZ9', 1, comMissao(1, { codigo: 'ZZ9-01' }), { descricao: 'ZZ9: alteração' }), { code: '23505', campo: 'codigo' }],
      [() => backendLocal.salvarCurso('ZZ9', 1, comMissao(0, { codigo: 'ZZ9-10' }), { descricao: 'ZZ9: alteração' }), { code: '23514', campo: 'codigo' }],
      [() => backendLocal.salvarCurso('ZZ9', 1, comMissao(4, { eq: 'C152' }), { descricao: 'ZZ9: alteração' }), { code: '22023', campo: 'mis' }],
      [() => backendLocal.salvarCurso('ZZ7', 1, PROGRAMA, { descricao: 'ZZ7: alteração' }), { code: 'P0002', campo: null }]
    ];
    for (const [gravar, erro] of recusas) {
      // A recusa vem na promessa (nada é lançado na chamada)
      let gravacao;
      assert.doesNotThrow(() => { gravacao = gravar(); });
      await assert.rejects(gravacao, erro);
    }
    assert.equal(guardado(), antes, 'nada gravado');
  });

  it('antes do formato dos cursos, o programa espera a conversão (PT409 formato); sem cadastro, grava', async () => {
    comCadastro(FORMATO_DOS_CURSOS - 1);
    await assert.rejects(criarZZ9(), { code: 'PT409', campo: 'formato' });
    assert.equal(guardado(), null);
    localStorage.removeItem('acpm4_cadastro');
    assert.equal((await criarZZ9()).versao, 1);
  });

  it('a conversão do cadastro: só antes do formato dos cursos; o curso igual é pulado e a chave só é gravada quando algum curso muda', async () => {
    const legado = () => programaDoLegado(normalizarCursos({ PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }] }));
    comCadastro(FORMATO_DOS_CURSOS);
    assert.equal(await backendLocal.importarCursos(legado()), 0);
    assert.equal(guardado(), null, 'no formato dos cursos, nada');
    comCadastro(FORMATO_DOS_CURSOS - 1);
    assert.equal(await backendLocal.importarCursos(legado(), { autor: 'Maria', agora }), 1);
    const depois = guardado();
    const [pp] = await backendLocal.programaDosCursos();
    assert.deepEqual([pp.versao, pp.fases.map(f => f.nome), pp.missoes.map(m => m.codigo)], [2, ['Programa'], ['PP-01']]);
    assert.deepEqual(pp.alteracoes, [{ versao: 2, descricao: 'Programa trazido do cadastro (1 missão)', registrado_em: agora.toISOString(), registrado_por: 'Maria' }]);
    // O mesmo programa com outros ids (cada abertura gera ids novos) é o mesmo: nada é gravado
    const gravadas = [], setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (chave, valor) => { gravadas.push(chave); setItem(chave, valor); };
    assert.equal(await backendLocal.importarCursos(legado()), 0);
    assert.deepEqual([gravadas, guardado()], [[], depois]);
    // Sem cadastro (o primeiro uso deste navegador), a conversão grava
    localStorage.removeItem('acpm4_cadastro');
    localStorage.removeItem('acpm4_cursos');
    assert.equal(await backendLocal.importarCursos(legado()), 1);
    assert.deepEqual(gravadas, ['acpm4_cursos']);
  });
});

describe('Backend local: limpeza (só no modo local)', () => {
  it('limpa o histórico de uma data sem tocar nas outras', async () => {
    await backendLocal.registrar({ data: '2026-11-11', tipo: 'mod', descricao: 'Dia 11' });
    await backendLocal.registrar({ data: '2026-11-12', tipo: 'mod', descricao: 'Dia 12' });
    await backendLocal.limparHistorico('2026-11-11');
    assert.deepEqual(await backendLocal.listarHistorico('2026-11-11'), []);
    assert.deepEqual((await backendLocal.listarHistorico('2026-11-12')).map(e => e.descricao), ['Dia 12']);
  });

  it('remove só os dias simulados do BI', async () => {
    await backendLocal.gravar('dia:2026-11-10', { simulado: true });
    await backendLocal.gravar('dia:2026-11-11', { av: {} });
    localStorage.setItem('acpm3', '{}');
    await backendLocal.removerDiasSimulados();
    assert.deepEqual((await backendLocal.listarDias('2026-11-01', '2026-11-30')).map(x => x.data), ['2026-11-11']);
    assert.equal(localStorage.getItem('acpm3'), '{}');
  });
});

describe('ApiClient com outro backend', () => {
  const original = ApiClient.backend;
  afterEach(() => { ApiClient.backend = original; ApiClient.readOnly = false; ApiClient.cadastroGravado = undefined; });

  it('lê e grava pelo backend configurado (nada vai para o localStorage) e respeita o modo somente leitura', async () => {
    const memoria = new Map();
    ApiClient.backend = {
      ler: async chave => memoria.get(chave) ?? null,
      gravar: async (chave, conteudo) => { memoria.set(chave, conteudo); return true; },
      diaAnterior: async () => null
    };
    const estado = ApiClient.createFreshState();
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, null), true);
    assert.deepEqual([...memoria.keys()], ['cadastro', 'dia:2026-11-11']);
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).estado, ApiClient.normalizeAndMigrateState(structuredClone(estado)));
    assert.equal(localStorage.length, 0, 'nada vai para o localStorage');

    ApiClient.readOnly = true;
    memoria.clear();
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, null), false);
    assert.equal(memoria.size, 0);
  });

  // Quem só consulta (a Secretaria e o Gestor no modo compartilhado, a tela travada depois de um conflito) lê os dados
  // pessoais e não os grava: a recusa com o código do servidor, sem chamar o backend
  it('os dados pessoais: somente leitura recusa a gravação (42501) e continua lendo', async () => {
    const chamadas = [];
    ApiClient.backend = {
      lerDadosPessoais: async (...args) => { chamadas.push(['ler', ...args]); return { canac: '123456' }; },
      salvarDadosPessoais: async (...args) => { chamadas.push(['salvar', ...args]); return { atualizado_em: null }; }
    };
    ApiClient.readOnly = true;
    await assert.rejects(ApiClient.salvarDadosPessoais('aluno', 1000, { canac: '123456' }), e => e.code === '42501');
    assert.deepEqual(await ApiClient.lerDadosPessoais('aluno', 1000), { canac: '123456' });
    assert.deepEqual(chamadas.map(c => c[0]), ['ler']);
  });
});

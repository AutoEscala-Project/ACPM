// Agenda de solicitações: o prazo das 13:00 (horário de São Paulo) e o pedido que cada solicitação vira na demanda (a
// importação para a demanda: test/unit/processamento.test.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIS, ALL_EQ_TYPES } from '../../js/config.js';
import { HORARIOS_INICIAIS } from '../../js/horarios.js';
import { prazoDaAgendaPermite, primeiraDataAberta, datasParaRegistrar, disponibilidadeDaSolicitacao, pedidoDaSolicitacao, recursosDaMissao, recursoValido, RECURSO_DO_PEDIDO,
  situacaoDaSolicitacao, solicitacaoAprovada, resumoDasSolicitacoes, situacaoNaDemanda, solicitacoesParaImportar, contagemPorDia, motivoSemEntrada,
  opcoesDaSegundaPreferencia, novidadesDasSolicitacoes, temNovidades, textoDasNovidades, agoraEmSaoPaulo, preferenciasDaSolicitacao } from '../../js/agenda.js';

const em = iso => new Date(iso);

describe('Agenda de solicitações', () => {
  // A data e o minuto do dia em São Paulo (E: os de ficaNaEscala, na conciliação do app)
  it('agora em São Paulo: a data e o minuto do dia, qualquer que seja o fuso do navegador', () => {
    assert.deepEqual(agoraEmSaoPaulo(em('2026-11-10T15:30:00Z')), { data: '2026-11-10', minuto: 750 });
    assert.deepEqual(agoraEmSaoPaulo(em('2026-11-11T02:10:00Z')), { data: '2026-11-10', minuto: 23 * 60 + 10 }, '02:10 UTC ainda é o dia anterior');
    assert.deepEqual(agoraEmSaoPaulo(em('2026-11-11T03:00:00Z')), { data: '2026-11-11', minuto: 0 });
  });

  it('pedido para o dia seguinte só até as 13:00 de São Paulo; depois, a partir de dois dias', () => {
    assert.equal(prazoDaAgendaPermite('2026-11-11', em('2026-11-10T12:59:00-03:00')), true);
    assert.equal(prazoDaAgendaPermite('2026-11-11', em('2026-11-10T13:00:00-03:00')), false);
    assert.equal(prazoDaAgendaPermite('2026-11-12', em('2026-11-10T13:00:00-03:00')), true);
    assert.equal(prazoDaAgendaPermite('2026-11-10', em('2026-11-10T08:00:00-03:00')), false, 'o próprio dia nunca');
    assert.equal(prazoDaAgendaPermite('2026-11-11', em('2026-11-10T15:30:00Z')), true, '15:30 UTC é 12:30 em São Paulo');
    assert.equal(prazoDaAgendaPermite('2026-11-11', em('2026-11-10T16:30:00Z')), false, '16:30 UTC é 13:30 em São Paulo');
    assert.equal(prazoDaAgendaPermite('2026-11-11', em('2026-11-11T01:00:00Z')), false, '01:00 UTC do dia 11 ainda é 10/11 22:00 em São Paulo');
    assert.equal(prazoDaAgendaPermite('2027-01-01', em('2026-12-31T12:00:00-03:00')), true, 'virada de ano');
  });

  it('primeira data aberta para pedidos: amanhã até as 13:00, depois o dia seguinte a amanhã', () => {
    assert.equal(primeiraDataAberta(em('2026-11-10T12:00:00-03:00')), '2026-11-11');
    assert.equal(primeiraDataAberta(em('2026-11-10T13:00:00-03:00')), '2026-11-12');
    assert.equal(primeiraDataAberta(em('2026-12-31T14:00:00-03:00')), '2027-01-02');
  });

  // O aeroclube não opera aos domingos; os voos de segunda são agendados até sábado às 10:00
  it('domingo não tem voo; segunda até sábado às 10:00; os outros dias até 13:00 do dia anterior', () => {
    const sabado = h => em(`2026-11-14T${h}:00-03:00`);
    assert.equal(prazoDaAgendaPermite('2026-11-15', sabado('08:00')), false, 'domingo nunca');
    assert.equal(prazoDaAgendaPermite('2026-11-22', sabado('08:00')), false, 'domingo nunca, nem na semana seguinte');
    assert.equal(prazoDaAgendaPermite('2026-11-16', sabado('09:59')), true, 'segunda: até sábado 09:59');
    assert.equal(prazoDaAgendaPermite('2026-11-16', sabado('10:00')), false, 'segunda: encerrado sábado às 10:00');
    assert.equal(prazoDaAgendaPermite('2026-11-16', em('2026-11-13T15:00:00-03:00')), true, 'segunda: na sexta à tarde ainda pode');
    assert.equal(prazoDaAgendaPermite('2026-11-16', em('2026-11-15T08:00:00-03:00')), false, 'segunda: no domingo já fechou');
    assert.equal(prazoDaAgendaPermite('2026-11-17', em('2026-11-15T08:00:00-03:00')), true, 'terça: no domingo pode');
    assert.equal(prazoDaAgendaPermite('2026-11-17', em('2026-11-16T12:59:00-03:00')), true, 'terça: até segunda 12:59');
    assert.equal(prazoDaAgendaPermite('2026-11-17', em('2026-11-16T13:00:00-03:00')), false, 'terça: encerrado segunda às 13:00');
    assert.equal(prazoDaAgendaPermite('2026-11-14', em('2026-11-13T12:59:00-03:00')), true, 'sábado: até sexta 12:59');
  });

  it('primeira data aberta: pula o domingo', () => {
    assert.equal(primeiraDataAberta(em('2026-11-14T09:00:00-03:00')), '2026-11-16', 'sábado de manhã: segunda');
    assert.equal(primeiraDataAberta(em('2026-11-14T10:00:00-03:00')), '2026-11-17', 'sábado depois das 10:00: terça');
    assert.equal(primeiraDataAberta(em('2026-11-13T12:00:00-03:00')), '2026-11-14', 'sexta antes das 13:00: sábado');
    assert.equal(primeiraDataAberta(em('2026-11-13T13:00:00-03:00')), '2026-11-16', 'sexta depois das 13:00: segunda');
  });

  it('a disponibilidade da solicitação vira a do pedido (o horário específico vira aquele horário, em minutos)', () => {
    // J (N13): o pedido de um período (o app só manda "horario" desde 14/11; um registro de antes pode ter um) fica sem horário
    assert.deepEqual(['manha', 'tarde', 'noite'].map(janela => disponibilidadeDaSolicitacao({ janela })), [undefined, undefined, undefined]);
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '14:30' }), 'h870');
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '07:30' }), 'h450');
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '25:00' }), undefined, 'horário inválido: sem restrição');
  });

  it('cada solicitação vira um pedido pronto para a escala, com os horários da categoria', () => {
    // O pedido de um período: sem horário e com as preferências padrão da lista (J, N13)
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Voo Local', janela: 'tarde' }),
      { fly: true, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 3 });
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'IFR', janela: 'horario', horario: '14:30' }),
      { fly: true, mis: 'IFR', eq: 'C172', p1: 870, p2: 870, nb: 1, ss: 1, pr: 3, jan: 'h870' });
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Noturno', janela: 'noite' }),
      { fly: true, mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1, nb: 4, ss: 1, pr: 3 });
    const ground = pedidoDaSolicitacao({ missao: 'Ground C152', janela: 'manha' });
    assert.deepEqual([ground.eq, ground.nb, ground.p1, ground.p2, ground.jan], ['Sala Ground', 1.5, 500, 610, undefined]);
    // O PA-34 tem horários de 30 em 30 minutos
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Multimotor', janela: 'horario', horario: '07:30' }),
      { fly: true, mis: 'Multimotor', eq: 'PA-34', p1: 450, p2: 450, nb: 1, ss: 1, pr: 3, jan: 'h450' });
    const manhaPa34 = pedidoDaSolicitacao({ missao: 'Multimotor', janela: 'manha' });
    assert.deepEqual([manhaPa34.p1, manhaPa34.p2, manhaPa34.jan], [510, 630, undefined]);
  });

  // U1 (Pedro, 2026-11-26: "Second exact time"): a 2ª preferência (horario2, D1) é outro horário exato: o pedido fica com
  // os dois (jan h<m1>|h<m2>, o 1º primeiro) e as preferências são eles, na ordem do pedido
  it('a 2ª preferência do pedido: jan com os dois horários e as preferências neles (U1)', () => {
    const lista = [390, 450, 500, 610, 720, 820, 900];
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '10:10', horario2: '08:20' }, lista), { p1: 610, p2: 500, jan: 'h610|h500' });
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: null }, lista), { p1: 500, p2: 500, jan: 'h500' });
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: '08:20' }, lista), { p1: 500, p2: 500, jan: 'h500' }, 'o mesmo horário duas vezes é um');
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: '18:00' }, lista), { p1: 500, p2: 500, jan: 'h500' }, 'o 2º fora dos horários exatos do dia não vale');
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '06:00', horario2: '10:10' }, lista), { p1: 500, p2: 610 }, 'sem o 1º, nenhum horário exato');
    // O 2º que a lista do recurso não tem fica no jan (N14: o motor o recusa nele); a preferência fica no 1º
    assert.deepEqual(preferenciasDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: '08:50' }, lista), { p1: 500, p2: 500, jan: 'h500|h530' });
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '08:20', horario2: '10:10' }), 'h500|h610');
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: '10:10', recurso: 'C152' }),
      { fly: true, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 3, jan: 'h500|h610' });
  });

  // O Ground tem 01h30 e o Noturno, 4 h às 17:30 (o translado e o noturno em BH): nem a agenda nem o programa mudam isso
  it('as horas do pedido: as fixas da missão; senão, as registradas na agenda; senão, as do programa; senão, as padrão da missão', () => {
    const horas = (missao, registradas, doPrograma) => pedidoDaSolicitacao({ missao, janela: 'tarde', horas: registradas }, undefined, { nb: doPrograma }).nb;
    assert.deepEqual([horas('Voo Local', 2.6, 2), horas('Voo Local', null, 2), horas('Voo Local', undefined), horas('Simulador', null)], [2.6, 2, 1, 2]);
    assert.deepEqual([horas('Noturno', 3, 3), horas('Noturno', null, 3), horas('Ground C152', 2, 1), horas('Voo Local', 'x')], [4, 4, 1.5, 1]);
  });

  // O pedido guarda o recurso escolhido; os de antes, e o que a missão não permite, valem como sem recurso
  it('os recursos da missão, e o recurso do pedido só quando a missão o permite', () => {
    for (const [missao, { eq }] of Object.entries(MIS)) assert.deepEqual(recursosDaMissao(missao), eq, missao);
    assert.deepEqual([recursosDaMissao(''), recursosDaMissao('Outra'), recursosDaMissao('constructor')], [[], [], []]);
    const valido = (missao, recurso) => recursoValido({ missao, recurso });
    assert.deepEqual([valido('Navegação', 'PA-34'), valido('Noturno', 'C172'), valido('Ground C152', 'Sala Ground')], ['PA-34', 'C172', 'Sala Ground']);
    assert.deepEqual([valido('Noturno', 'C152'), valido('Navegação', null), valido('Navegação', undefined), valido('Navegação', 'c152'), valido('Outra', 'C152')], [null, null, null, null, null]);
    for (const tipo of ALL_EQ_TYPES) assert.match(tipo, RECURSO_DO_PEDIDO);
    for (const ruim of ['', ' C152', 'C152 ', '<b>', 'C'.repeat(31), 'C152\n']) assert.doesNotMatch(ruim, RECURSO_DO_PEDIDO);
  });

  it('o recurso do pedido decide o avião, os horários e as preferências; sem ele, ou com um que a missão não permite, o padrão', () => {
    const p = (extra, opcoes) => pedidoDaSolicitacao({ missao: 'Navegação', janela: 'horario', horario: '07:30', horas: 2, ...extra }, HORARIOS_INICIAIS, opcoes);
    assert.deepEqual(p({ recurso: 'PA-34' }), { fly: true, mis: 'Navegação', eq: 'PA-34', p1: 450, p2: 450, nb: 2, ss: 1, pr: 3, jan: 'h450' });
    for (const recurso of [null, undefined, 'Sim. Mono', 'x']) assert.deepEqual(p({ recurso }), p({}), String(recurso));
    assert.equal(p({}).eq, 'C152');
    // O recurso da missão do curso já escolhida pelo operador (eq) vale mais
    assert.equal(p({ recurso: 'PA-34' }, { eq: 'C172' }).eq, 'C172');
    // O horário que o cadastro não tem mais: as preferências padrão da lista do recurso, com o horário pedido na disponibilidade
    const semAs0730 = { ...HORARIOS_INICIAIS, 'PA-34': [480, 540, 600, 660] };
    const velho = pedidoDaSolicitacao({ missao: 'Navegação', janela: 'horario', horario: '07:30', recurso: 'PA-34' }, semAs0730);
    assert.deepEqual([velho.eq, velho.p1, velho.p2, velho.jan], ['PA-34', 540, 660, 'h450']);
  });
});

// No máximo 6 voos locais (Voo Local, Voo Solo e TGL) no mesmo horário; ao agendar o 7º,
// o horário está indisponível, e o app diz o próximo possível
describe('Agenda: o limite de voos locais no mesmo horário', async () => {
  const { vagaDeVooLocal } = await import('../../js/agenda.js');
  const pedido = (id, horario, missao = 'Voo Local', extra = {}) => ({ id, data: '2026-11-11', aluno: id, missao, janela: 'horario', horario, cancelada_em: null, ...extra });
  const seisAs = horario => [0, 1, 2, 3, 4, 5].map(i => pedido(i + 1, horario, ['Voo Local', 'Voo Solo', 'TGL (TMA)'][i % 3]));

  it('com menos de 6 locais no horário, há vaga; outras missões e pedidos cancelados não contam', () => {
    const pedidos = [...seisAs('08:20').slice(0, 5), pedido(10, '08:20', 'Navegação'), pedido(11, '08:20', 'Voo Local', { cancelada_em: '2026-11-10T10:00:00Z' })];
    assert.deepEqual(vagaDeVooLocal(pedidos, { data: '2026-11-11', horario: '08:20', missao: 'Voo Local' }), { ok: true });
  });

  it('com 6 locais no horário, não há vaga: o próximo horário possível', () => {
    const pedidos = [...seisAs('08:20'), ...seisAs('10:10').map(p => ({ ...p, id: p.id + 20 }))];
    assert.deepEqual(vagaDeVooLocal(pedidos, { data: '2026-11-11', horario: '08:20', missao: 'TGL (TMA)' }), { ok: false, locais: 6, proximo: '11:30' });
  });

  // O 7º confirmado (F1c) fica registrado: o aviso do pedido seguinte diz quantos já há, não o limite
  it('com o 7º confirmado já registrado, a conta é a dos locais no horário (locais)', () => {
    const pedidos = [...seisAs('08:20'), pedido(7, '08:20', 'Voo Local', { limite_confirmado_por: 'Maria' })];
    assert.deepEqual(vagaDeVooLocal(pedidos, { data: '2026-11-11', horario: '08:20', missao: 'Voo Local' }), { ok: false, locais: 7, proximo: '10:10' });
  });

  it('o próximo horário possível é um dos horários do recurso do pedido', () => {
    const local = extra => vagaDeVooLocal(seisAs('08:30'), { data: '2026-11-11', horario: '08:30', missao: 'Voo Local', ...extra });
    assert.deepEqual([local({ recurso: 'PA-34' }), local({}), local({ recurso: 'Sim. Mono' })],
      [{ ok: false, locais: 6, proximo: '09:00' }, { ok: false, locais: 6, proximo: '10:10' }, { ok: false, locais: 6, proximo: '10:10' }]);
  });

  it('outra missão não tem o limite; o Solo (só às 06:30) não tem próximo horário', () => {
    assert.deepEqual(vagaDeVooLocal(seisAs('08:20'), { data: '2026-11-11', horario: '08:20', missao: 'Navegação' }), { ok: true });
    assert.deepEqual(vagaDeVooLocal(seisAs('06:30'), { data: '2026-11-11', horario: '06:30', missao: 'Voo Solo' }), { ok: false, locais: 6, proximo: null });
  });
});

describe('A data do pedido (datasParaRegistrar)', () => {
  const HOJE = '2026-11-10';
  const meioDia = em('2026-11-10T12:00:00-03:00'), tarde = em('2026-11-10T14:00:00-03:00');

  it('os dias de operação de hoje a 14 dias, sem domingo, com as fechadas marcadas (com a exceção)', () => {
    const { opcoes, padrao } = datasParaRegistrar(HOJE, '2026-11-11', { excecao: true, agora: meioDia });
    assert.deepEqual([opcoes[0], opcoes[1], opcoes.at(-1)], [{ data: '2026-11-10', fechada: true }, { data: '2026-11-11', fechada: false }, { data: '2026-11-24', fechada: false }]);
    assert.equal(opcoes.length, 13);
    assert.equal(opcoes.some(o => ['2026-11-15', '2026-11-22'].includes(o.data)), false);
    assert.equal(padrao, '2026-11-11');
  });

  it('a Secretaria só recebe as datas que aceitam pedidos', () => {
    assert.equal(datasParaRegistrar(HOJE, '2026-11-11', { agora: meioDia }).opcoes[0].data, '2026-11-11');
    assert.equal(datasParaRegistrar(HOJE, '2026-11-11', { agora: tarde }).opcoes[0].data, '2026-11-12');
    assert.equal(datasParaRegistrar(HOJE, '2026-11-11', { agora: tarde }).opcoes.some(o => o.fechada), false);
  });

  it('a data aberta mais adiante entra na lista, e só ela; uma passada não', () => {
    const longe = datasParaRegistrar(HOJE, '2026-12-18', { excecao: true, agora: meioDia });
    assert.deepEqual([longe.opcoes.at(-2).data, longe.opcoes.at(-1).data], ['2026-11-24', '2026-12-18']);
    assert.equal(longe.padrao, '2026-12-18');
    const passada = datasParaRegistrar(HOJE, '2026-11-03', { excecao: true, agora: meioDia });
    assert.equal(passada.opcoes[0].data, HOJE);
    assert.equal(passada.padrao, '2026-11-11');
  });

  it('a data com que o campo começa: a aberta, se aceita pedidos; senão, a primeira que aceita', () => {
    assert.equal(datasParaRegistrar(HOJE, '2026-11-13', { agora: tarde }).padrao, '2026-11-13');
    assert.equal(datasParaRegistrar(HOJE, '2026-11-11', { excecao: true, agora: tarde }).padrao, '2026-11-12');
    // Sábado depois das 10:00: segunda já fechou
    assert.equal(datasParaRegistrar('2026-11-14', '2026-11-16', { excecao: true, agora: em('2026-11-14T10:30:00-03:00') }).padrao, '2026-11-17');
  });
});

// As missões que a Agenda oferece para o aluno (N8): as do programa do curso dele, por fase, na ordem do programa, sem as
// retiradas e as dispensadas, o Noturno pela noite; sem curso (ou com o curso encerrado, fora dos programas, sem missões,
// ou sem os programas lidos), os tipos de missão, com a frase que diz por quê. O programa é o lido (S.programa), não o da
// próxima missão: a lista é a mesma com o progresso ligado ou desligado, e nada de ordem, aprovação ou "já voada" conta
describe('Agenda: as missões do curso do aluno (missoesDoAluno)', async () => {
  const { missoesDoAluno } = await import('../../js/agenda.js');
  const { novoCurso, retirarMissao, retirarFase, mudarCurso, incluirFase } = await import('../../js/programa.js');
  const { MODELOS } = await import('../../js/modelos-de-curso.js');
  const { ligarFuncionalidades } = await import('../helpers/funcionalidades.js');
  const gerarId = (sigla, codigo) => `${sigla}:${codigo}`;
  const cursoPP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, gerarId).curso;
  const maria = { id: 1000, nm: 'Maria', curso: 'PP' };
  const textos = r => r.grupos.map(g => [g.fase, g.missoes.map(m => m.texto)]);

  it('um grupo por fase, na ordem do programa, com "NAV-150NM · Navegação · C152 · 3 h"; sem a dispensada; o Noturno pela noite', () => {
    const r = missoesDoAluno(maria, [cursoPP()]);
    assert.equal(r.motivo, null);
    assert.deepEqual(r.grupos.map(g => g.fase), ['Fase 1 – Introdução ao Voo', 'Fase 2 – O Controle da Aeronave', 'Fase 3 – A Coordenação de Atitude e Potência',
      'Fase 4 – Treinamento de Manobras e Aproximações', 'Fase 5 – Procedimentos Avançados e de Emergência', 'Fase 7 – Treinamento de Voo Solo',
      'Fase 8 – Procedimentos de Navegação Solo', 'Fase 6 – Treinamento de Voo Noturno', 'Fase 9 – Avaliação para Voo de Cheque']);
    assert.deepEqual(textos(r)[0], ['Fase 1 – Introdução ao Voo', ['IN-01 · Voo Local · C152 · 1 h', 'IN-02 · Voo Local · C152 · 1 h']]);
    assert.deepEqual(textos(r)[4][1].slice(0, 3), ['NAV-01 · Navegação · C152 · 1,5 h', 'NAV-02 · Navegação · C152 · 1,5 h', 'NAV-150NM · Navegação · C152 · 3 h']);
    const fase7 = r.grupos[5].missoes.map(m => m.codigo);
    assert.equal(fase7.includes('ADAPT-C152'), false, 'a dispensada não é oferecida');
    assert.deepEqual(fase7.slice(0, 3), ['END-SOLO', 'AVP-SOLO-01', 'SOLO-01']);
    // O Noturno de dois dias é um voo só: a noite, com os translados, e as 4 h do dia
    assert.deepEqual(textos(r)[7], ['Fase 6 – Treinamento de Voo Noturno', ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h']]);
    const nav = r.grupos[4].missoes[2];
    assert.deepEqual({ id: nav.id, codigo: nav.codigo, mis: nav.mis, eq: nav.eq, nb: nav.nb }, { id: 'PP:NAV-150NM', codigo: 'NAV-150NM', mis: 'Navegação', eq: 'C152', nb: 3 });
    assert.equal(r.grupos.flatMap(g => g.missoes).length, 47 - 1 - 2, 'as 47 missões, sem a dispensada e sem os dois translados');
  });

  it('a missão e a fase retiradas do programa saem; a fase que fica sem missão também', () => {
    let curso = cursoPP();
    curso = retirarMissao(curso, 'PP:IN-02');
    curso = retirarMissao(curso, 'PP:AVX-CQ');
    curso = retirarFase(curso, 'PP:F9');
    const r = missoesDoAluno(maria, [curso]);
    assert.deepEqual(textos(r)[0][1], ['IN-01 · Voo Local · C152 · 1 h']);
    assert.equal(r.grupos.some(g => g.fase.startsWith('Fase 9')), false);
    // Uma fase nova, vazia, não vira um grupo
    const comVazia = incluirFase(cursoPP(), () => '00000000-0000-4000-8000-000000000001').curso;
    assert.equal(missoesDoAluno(maria, [comVazia]).grupos.length, 9);
  });

  it('sem curso, com o curso encerrado, fora dos programas, sem missões ou sem os programas lidos: os tipos de missão, com o motivo', () => {
    const vazio = novoCurso([], { sigla: 'PC', nome: 'Piloto Comercial' }).curso;
    const casos = [
      [{ id: 1, nm: 'Ana' }, [cursoPP()], 'Aluno sem curso: escolha o tipo da missão.'],
      [maria, [mudarCurso(cursoPP(), 'ativo', false)], 'O curso PP está encerrado: escolha o tipo da missão.'],
      [maria, [vazio], 'O curso PP não está nos programas dos cursos: escolha o tipo da missão.'],
      [{ ...maria, curso: 'PC' }, [cursoPP(), vazio], 'O curso PC não tem missões no programa: escolha o tipo da missão.'],
      [maria, null, 'Os programas dos cursos não foram lidos: escolha o tipo da missão.']
    ];
    for (const [aluno, programa, motivo] of casos) assert.deepEqual(missoesDoAluno(aluno, programa), { curso: null, grupos: [], motivo }, motivo);
  });

  it('a lista é a mesma com o progresso ligado e desligado (o programa lido, sem a ordem nem os resultados)', () => {
    const programa = [cursoPP()];
    try {
      ligarFuncionalidades('progresso');
      const ligado = missoesDoAluno(maria, programa);
      ligarFuncionalidades('');
      assert.deepEqual(missoesDoAluno(maria, programa), ligado);
      assert.equal(ligado.grupos.length, 9);
    } finally {
      ligarFuncionalidades(undefined);
    }
  });
});

// A página dos pedidos (D2): o estado de cada pedido, o resumo da data, onde o pedido está na demanda (até o G), o que
// "Importar" traz, a entrada do aprovado na demanda, a contagem do trilho, as cinco condições da entrada na hora e a 2ª
// preferência do formulário
describe('Os pedidos e a aprovação (D2)', () => {
  const linha = (id, extra = {}) => ({ id, data: '2026-11-11', aluno: 1000 + id, aluno_nome: `Aluno ${1000 + id}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', cancelada_em: null, aprovada_em: null, excecao: false, ...extra });
  const aprovada = (id, extra = {}) => linha(id, { aprovada_em: '2026-11-10T14:00:00Z', aprovada_por: 'Operador', ...extra });

  it('três estados, das colunas: cancelado, aprovado, aguardando aprovação', () => {
    assert.equal(situacaoDaSolicitacao(linha(1)), 'aguardando');
    assert.equal(situacaoDaSolicitacao(aprovada(1)), 'aprovada');
    assert.equal(situacaoDaSolicitacao(linha(1, { cancelada_em: 'x' })), 'cancelada');
    assert.equal(situacaoDaSolicitacao(aprovada(1, { cancelada_em: 'x' })), 'cancelada', 'o aprovado cancelado é cancelado');
    assert.equal(situacaoDaSolicitacao(linha(1, { aprovacao_retirada_em: 'x' })), 'aguardando', 'a aprovação retirada volta a aguardar');
    assert.deepEqual([linha(1), aprovada(2), aprovada(3, { cancelada_em: 'x' })].map(solicitacaoAprovada), [false, true, false]);
  });

  it('o resumo da data: os registrados (sem os cancelados), os que aguardam e os aprovados', () => {
    const lista = [linha(1), linha(2, { excecao: true, aprovada_em: 'x' }), aprovada(3), linha(4, { cancelada_em: 'x' }), aprovada(5, { cancelada_em: 'x', excecao: true })];
    assert.deepEqual(resumoDasSolicitacoes(lista), { registradas: 3, aguardando: 1, aprovadas: 2 });
    assert.deepEqual(resumoDasSolicitacoes([]), { registradas: 0, aguardando: 0, aprovadas: 0 });
  });

  it('o resumo conta como aguardando só os que pedem atenção (o pedido que ninguém pode aprovar, do aluno inativo ou fora do cadastro, não)', () => {
    const lista = [linha(1), linha(2), aprovada(3)];
    assert.deepEqual(resumoDasSolicitacoes(lista, s => s.aluno !== 1002), { registradas: 3, aguardando: 1, aprovadas: 1 });
  });

  // O estado da data: os alunos com o registro do dia (o pedido principal e as missões extras) e as importadas
  const estado = ({ importadas = [], stu = [] } = {}) => ({ importadas, stu });
  const comRegistro = (id, extra = {}) => ({ id, nm: `Aluno ${id}`, fly: true, mis: 'Voo Local', extra: [], ...extra });

  it('na demanda: "fora" (nunca importado), "voa" (um registro que voa o leva) e "tirada" (importado, sem registro que voe)', () => {
    assert.equal(situacaoNaDemanda(aprovada(1), estado()), 'fora');
    assert.equal(situacaoNaDemanda(aprovada(1), estado({ importadas: [1], stu: [comRegistro(1001, { solicitacao: 1 })] })), 'voa');
    assert.equal(situacaoNaDemanda(aprovada(1), estado({ importadas: [1], stu: [comRegistro(1001, { extra: [{ mid: 1, fly: true, solicitacao: 1 }] })] })), 'voa', 'numa missão extra');
    assert.equal(situacaoNaDemanda(aprovada(1), estado({ importadas: [1], stu: [comRegistro(1001, { solicitacao: 1, fly: false })] })), 'tirada', 'o Voa desligado');
    assert.equal(situacaoNaDemanda(aprovada(1), estado({ importadas: [1], stu: [comRegistro(1001)] })), 'tirada', 'depois de Limpar demanda (o id fica nas importadas)');
  });

  it('"Importar" traz só os aprovados que nunca entraram na demanda', () => {
    const lista = [linha(1), aprovada(2), aprovada(3), aprovada(4, { cancelada_em: 'x' }), aprovada(5)];
    assert.deepEqual(solicitacoesParaImportar(lista, estado({ importadas: [3] })).map(s => s.id), [2, 5]);
    assert.deepEqual(solicitacoesParaImportar([], estado()), []);
  });

  it('a contagem do trilho: os que aguardam e os aprovados de cada dia, sem domingo', () => {
    assert.deepEqual(contagemPorDia({ '2026-11-11': { aguardando: 2, aprovadas: 3 }, '2026-11-15': { aguardando: 1, aprovadas: 0 }, '2026-11-12': { aguardando: 0, aprovadas: 1 } }),
      { '2026-11-11': 5, '2026-11-12': 1 });
    assert.deepEqual(contagemPorDia({}), {});
    assert.deepEqual(contagemPorDia(null), {});
  });

  it('a entrada na hora: só a data aberta, lida e já gravada, com os resultados e os cursos lidos, sem mudança em outro computador', () => {
    const tudo = { data: '2026-11-11', aberta: '2026-11-11', lida: true, gravada: true, indisponiveis: [], mudou: false };
    assert.equal(motivoSemEntrada(tudo), null);
    assert.equal(motivoSemEntrada({ ...tudo, data: '2026-11-12' }), 'outra-data');
    assert.equal(motivoSemEntrada({ ...tudo, lida: false }), 'nao-lida');
    assert.equal(motivoSemEntrada({ ...tudo, gravada: false }), 'nao-gravada');
    for (const falta of ['resultados', 'cursos', 'cursos-pendentes']) assert.equal(motivoSemEntrada({ ...tudo, indisponiveis: [falta] }), 'dados', falta);
    assert.equal(motivoSemEntrada({ ...tudo, indisponiveis: ['horas'] }), null, 'sem as horas, entra (só os limites da lei ficam sem conferir)');
    assert.equal(motivoSemEntrada({ ...tudo, mudou: true }), 'mudou');
  });

  it('a 2ª preferência: os outros horários do recurso; o Noturno e o Voo Solo, nenhum', () => {
    assert.deepEqual(opcoesDaSegundaPreferencia(['06:30', '08:20', '10:10'], '08:20', 'Voo Local'), ['06:30', '10:10']);
    assert.deepEqual(opcoesDaSegundaPreferencia(['06:30', '08:20', '10:10'], '', 'Voo Local'), ['06:30', '08:20', '10:10']);
    assert.deepEqual(opcoesDaSegundaPreferencia(['17:30'], '17:30', 'Noturno'), []);
    assert.deepEqual(opcoesDaSegundaPreferencia(['06:30', '08:20'], '06:30', 'Voo Solo'), []);
    assert.deepEqual(opcoesDaSegundaPreferencia([], '', 'Voo Local'), []);
  });
});

// D3: o que mudou nos pedidos da data entre duas leituras e o aviso das novidades (o 1º da lista de espera de cada vaga:
// test/unit/rejeicoes.test.js)
describe('Os pedidos em dia (D3)', () => {
  const linha = (id, extra = {}) => ({ id, data: '2026-11-11', aluno: 1000 + id, aluno_nome: `Aluno ${1000 + id}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', cancelada_em: null, aprovada_em: null, ...extra });
  const aprovada = (id, extra = {}) => linha(id, { aprovada_em: '2026-11-10T14:00:00Z', aprovada_por: 'Operador', ...extra });
  const cancelada = (pedido, extra = {}) => ({ ...pedido, cancelada_em: '2026-11-10T15:00:00Z', cancelada_por: 'Maria', ...extra });
  const ids = novidades => Object.fromEntries(Object.entries(novidades).map(([k, v]) => [k, v.map(s => s.id)]));

  it('as novidades: os novos, os aprovados, os que voltaram a aguardar e os cancelados, cada um uma vez', () => {
    const antes = [linha(1), linha(2), aprovada(3), aprovada(4), linha(5)];
    const depois = [aprovada(1), linha(2), linha(3, { aprovacao_retirada_em: 'x' }), cancelada(aprovada(4)), cancelada(linha(5)), linha(6), aprovada(7), cancelada(linha(8))];
    assert.deepEqual(ids(novidadesDasSolicitacoes(antes, depois)), { novas: [6, 7], aprovadas: [1], semAprovacao: [3], canceladas: [4, 5] });
    // O novo já cancelado não é novidade; o que sumiu da leitura (outra data) também não
    assert.deepEqual(ids(novidadesDasSolicitacoes([linha(1)], [])), { novas: [], aprovadas: [], semAprovacao: [], canceladas: [] });
    assert.equal(temNovidades(novidadesDasSolicitacoes(antes, antes)), false);
    assert.equal(temNovidades(novidadesDasSolicitacoes(antes, depois)), true);
  });

  it('as novidades deixam de fora os pedidos que este navegador acabou de mudar', () => {
    const antes = [linha(1), aprovada(2)];
    const depois = [aprovada(1), cancelada(aprovada(2)), linha(3), linha(4)];
    assert.deepEqual(ids(novidadesDasSolicitacoes(antes, depois, { deste: [1, 3] })), { novas: [4], aprovadas: [], semAprovacao: [], canceladas: [2] });
  });

  it('o texto: a data e os números, no plural certo; o 1º da lista de espera de cada vaga, sem dizer que ele fica com ela', () => {
    const n = (novas = 0, aprovadas = 0, semAprovacao = 0, canceladas = 0) => ({
      novas: Array(novas).fill(linha(1)), aprovadas: Array(aprovadas).fill(linha(1)), semAprovacao: Array(semAprovacao).fill(linha(1)), canceladas: Array(canceladas).fill(linha(1))
    });
    assert.equal(textoDasNovidades(n(2), { data: 'qua 11/11' }), 'Pedidos de qua 11/11: 2 novos.');
    assert.equal(textoDasNovidades(n(1), { data: 'qua 11/11' }), 'Pedidos de qua 11/11: 1 novo.');
    assert.equal(textoDasNovidades(n(0, 1, 0, 1), { data: 'sex 13/11' }), 'Pedidos de sex 13/11: 1 aprovado, 1 cancelado.');
    assert.equal(textoDasNovidades(n(1, 2, 1, 2), { data: 'sex 13/11' }), 'Pedidos de sex 13/11: 1 novo, 2 aprovados, 1 voltou a aguardar aprovação, 2 cancelados.');
    assert.equal(textoDasNovidades(n(0, 0, 2), { data: 'sex 13/11' }), 'Pedidos de sex 13/11: 2 voltaram a aguardar aprovação.');
    assert.equal(textoDasNovidades(n(0, 0, 0, 1), { data: 'qua 11/11', vagas: [{ aluno: 'Aluno 1000', minuto: 500, primeiro: 'Aluno 1001' }] }),
      'Pedidos de qua 11/11: 1 cancelado. A vaga de Aluno 1000 às 08:20 fica livre quando o voo sair da escala; 1º na lista de espera: Aluno 1001.');
    assert.equal(textoDasNovidades(n(), { data: 'qua 11/11' }), '');
  });
});

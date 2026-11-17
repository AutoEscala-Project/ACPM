// Agenda de solicitações: o prazo das 13:00 (horário de São Paulo) e o pedido que cada solicitação vira na demanda.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prazoDaAgendaPermite, primeiraDataAberta, disponibilidadeDaSolicitacao, pedidoDaSolicitacao, importarSolicitacoes } from '../../js/agenda.js';
import { aluno } from '../helpers/montar.js';

const em = iso => new Date(iso);

describe('Agenda de solicitações', () => {
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
    assert.deepEqual(['manha', 'tarde', 'noite'].map(janela => disponibilidadeDaSolicitacao({ janela })), ['manha', 'tarde', 'noite']);
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '14:30' }), 'h870');
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '07:30' }), 'h450');
    assert.equal(disponibilidadeDaSolicitacao({ janela: 'horario', horario: '25:00' }), undefined, 'horário inválido: sem restrição');
  });

  it('cada solicitação vira um pedido pronto para a escala, com os horários da categoria', () => {
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Voo Local', janela: 'tarde' }),
      { fly: true, mis: 'Voo Local', eq: 'C152', p1: 760, p2: 820, nb: 1, ss: 1, pr: 3, jan: 'tarde' });
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'IFR', janela: 'horario', horario: '14:30' }),
      { fly: true, mis: 'IFR', eq: 'C172', p1: 870, p2: 870, nb: 1, ss: 1, pr: 3, jan: 'h870' });
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Noturno', janela: 'noite' }),
      { fly: true, mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1, nb: 4, ss: 1, pr: 3, jan: 'noite' });
    const ground = pedidoDaSolicitacao({ missao: 'Ground C152', janela: 'manha' });
    assert.deepEqual([ground.eq, ground.nb, ground.p1, ground.p2, ground.jan], ['Sala Ground', 1.5, 390, 500, 'manha']);
    // O PA-34 tem horários de 30 em 30 minutos
    assert.deepEqual(pedidoDaSolicitacao({ missao: 'Multimotor', janela: 'horario', horario: '07:30' }),
      { fly: true, mis: 'Multimotor', eq: 'PA-34', p1: 450, p2: 450, nb: 1, ss: 1, pr: 3, jan: 'h450' });
    const manhaPa34 = pedidoDaSolicitacao({ missao: 'Multimotor', janela: 'manha' });
    assert.deepEqual([manhaPa34.p1, manhaPa34.p2], [390, 420]);
  });
});

describe('Importar as solicitações da agenda para a demanda', () => {
  const pedido = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'tarde', horario: null, cancelada_em: null, ...extra });
  const estado = () => ({ nid: 2000, importadas: [], stu: [aluno(1000, { fly: false }), aluno(1001, { mis: 'IFR', eq: 'C172' }), aluno(1002)] });

  it('aluno sem voo no dia: o pedido vira a missão principal', () => {
    const e = estado();
    const resumo = importarSolicitacoes(e, [pedido(1, 1000)]);
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0 });
    assert.deepEqual([e.stu[0].fly, e.stu[0].mis, e.stu[0].jan, e.stu[0].p1], [true, 'Voo Local', 'tarde', 760]);
    assert.deepEqual(e.importadas, [1]);
  });

  it('aluno já voando outra missão: o pedido entra como missão extra', () => {
    const e = estado();
    importarSolicitacoes(e, [pedido(2, 1001)]);
    assert.equal(e.stu[1].mis, 'IFR', 'a missão que ele já tinha continua');
    // A missão extra é numerada no aluno: o número do cadastro (nid) não muda
    assert.deepEqual(e.stu[1].extra.map(x => [x.mid, x.mis, x.jan]), [[1, 'Voo Local', 'tarde']]);
    assert.equal(e.nid, 2000);
  });

  it('aluno já voando a mesma missão (copiada da data anterior, sem pedido da agenda): o pedido toma o lugar dela', () => {
    const e = estado();
    const resumo = importarSolicitacoes(e, [pedido(3, 1002)]);
    assert.deepEqual(resumo, { novos: 0, atualizados: 1, semAluno: 0 });
    assert.deepEqual([e.stu[2].jan, e.stu[2].p1, e.stu[2].solicitacao, e.stu[2].extra], ['tarde', 760, 3, []]);
  });

  it('dois pedidos da mesma missão para o mesmo aluno: dois voos, cada um no seu horário', () => {
    const e = estado();
    const pedidos = [pedido(10, 1002, { janela: 'horario', horario: '10:10' }), pedido(11, 1002, { janela: 'horario', horario: '14:30' })];
    const resumo = importarSolicitacoes(e, pedidos);
    assert.deepEqual(resumo, { novos: 1, atualizados: 1, semAluno: 0 });
    const voos = [e.stu[2], ...e.stu[2].extra];
    assert.deepEqual(voos.map(v => [v.mis, v.jan, v.solicitacao, v.fly]), [['Voo Local', 'h610', 10, true], ['Voo Local', 'h870', 11, true]]);
  });

  it('aluno de um curso: quando a próxima missão dele é do tipo pedido, o pedido já entra como ela (código, recurso e horas)', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'B', mis: 'Navegação', eq: 'C172', nb: 2 }], PC: [], INVA: [] };
    const e = { ...estado(), cursos: programa, stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    const situacao = [{ aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'aprovado' }];
    importarSolicitacoes(e, [pedido(7, 1000, { missao: 'Navegação' }), pedido(8, 1001, { missao: 'Navegação' })], { situacao });
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].nb], ['PP-02', 'C172', 2]);
    assert.deepEqual([e.stu[1].etapa, e.stu[1].mis], [undefined, 'Navegação'], 'a próxima do 1001 é PP-01 (Voo Local): o pedido entra como veio');
  });

  it('ignora cancelados e os já importados; conta os alunos que não estão no cadastro', () => {
    const e = { ...estado(), importadas: [5] };
    const resumo = importarSolicitacoes(e, [pedido(4, 1000, { cancelada_em: '2026-11-10T13:00:00Z' }), pedido(5, 1000), pedido(6, 9999)]);
    assert.deepEqual(resumo, { novos: 0, atualizados: 0, semAluno: 1 });
    assert.equal(e.stu[0].fly, false);
    // O pedido de quem não está no cadastro não conta como visto (entra quando o aluno for cadastrado)
    assert.deepEqual(e.importadas, [5]);
  });

  // A agenda guarda a duração; o pedido sem ela fica com 1 h ou as horas do curso
  it('a duração do pedido vai para a demanda (vale mais que as horas do programa do curso)', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 2 }], PC: [], INVA: [] };
    const e = { ...estado(), cursos: programa, stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    importarSolicitacoes(e, [pedido(20, 1000, { janela: 'horario', horario: '10:10', horas: 2.6 }), pedido(21, 1001, { janela: 'horario', horario: '10:10', horas: null })]);
    assert.deepEqual([e.stu[0].nb, e.stu[0].etapa, e.stu[1].nb, e.stu[1].etapa], [2.6, 'PP-01', 2, 'PP-01']);
  });

  it('missão do curso noutro recurso: as preferências são os horários desse recurso, na disponibilidade pedida', () => {
    const programa = { PP: [], PC: [{ id: 'PC-01', nome: 'A', mis: 'IFR', eq: 'PA-34', nb: 1 }], INVA: [] };
    const e = { ...estado(), cursos: programa, stu: [aluno(1000, { fly: false }, { curso: 'PC' })] };
    importarSolicitacoes(e, [pedido(9, 1000, { missao: 'IFR', janela: 'manha' })]);
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].p1, e.stu[0].p2], ['PC-01', 'PA-34', 390, 420]);
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
    assert.deepEqual(vagaDeVooLocal(pedidos, { data: '2026-11-11', horario: '08:20', missao: 'TGL (TMA)' }), { ok: false, proximo: '11:30' });
  });

  it('outra missão não tem o limite; o Solo (só às 06:30) não tem próximo horário', () => {
    assert.deepEqual(vagaDeVooLocal(seisAs('08:20'), { data: '2026-11-11', horario: '08:20', missao: 'Navegação' }), { ok: true });
    assert.deepEqual(vagaDeVooLocal(seisAs('06:30'), { data: '2026-11-11', horario: '06:30', missao: 'Voo Solo' }), { ok: false, proximo: null });
  });
});

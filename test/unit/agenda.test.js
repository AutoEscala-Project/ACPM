// Agenda de solicitações: o prazo das 13:00 (horário de São Paulo) e o pedido que cada solicitação vira na demanda.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prazoDaAgendaPermite, primeiraDataAberta, disponibilidadeDaSolicitacao, pedidoDaSolicitacao, importarSolicitacoes } from '../../js/agenda.js';
import { normalizarCursos } from '../../js/cursos.js';
import { programaDoLegado, percursoDoCurso, novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { runAllocationEngine } from '../../js/engine.js';
import { blank } from '../../js/rules.js';
import { setS } from '../../js/state.js';
import { programaParaInferir } from '../../js/views/etapas.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const em = iso => new Date(iso);
// O cronograma do PP (o modelo do app, com o Noturno em trechos) como o curso PP, com os ids tirados da sigla e da chave
const cursoPP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, (s, c) => `${s}:${c}`).curso;

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

  // O Ground tem 01h30 e o Noturno, 4 h às 17:30 (o translado e o noturno em BH): nem a agenda nem o programa mudam isso
  it('as horas do pedido: as fixas da missão; senão, as registradas na agenda; senão, as do programa; senão, as padrão da missão', () => {
    const horas = (missao, registradas, doPrograma) => pedidoDaSolicitacao({ missao, janela: 'tarde', horas: registradas }, undefined, { nb: doPrograma }).nb;
    assert.deepEqual([horas('Voo Local', 2.6, 2), horas('Voo Local', null, 2), horas('Voo Local', undefined), horas('Simulador', null)], [2.6, 2, 1, 2]);
    assert.deepEqual([horas('Noturno', 3, 3), horas('Noturno', null, 3), horas('Ground C152', 2, 1), horas('Voo Local', 'x')], [4, 4, 1.5, 1]);
  });
});

describe('Importar as solicitações da agenda para a demanda', () => {
  const pedido = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'tarde', horario: null, cancelada_em: null, ...extra });
  const estado = () => ({ nid: 2000, importadas: [], stu: [aluno(1000, { fly: false }), aluno(1001, { mis: 'IFR', eq: 'C172' }), aluno(1002)] });
  // O programa do cadastro (a lista de missões de cada curso) no formato dos cursos, como a tela o passa
  const doCadastro = cursos => programaDoLegado(normalizarCursos(cursos), (s, c) => `${s}:${c}`);

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
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    const situacao = [{ aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'aprovado' }];
    importarSolicitacoes(e, [pedido(7, 1000, { missao: 'Navegação' }), pedido(8, 1001, { missao: 'Navegação' })], { situacao, programa: doCadastro(programa) });
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
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    importarSolicitacoes(e, [pedido(20, 1000, { janela: 'horario', horario: '10:10', horas: 2.6 }), pedido(21, 1001, { janela: 'horario', horario: '10:10', horas: null })], { programa: doCadastro(programa) });
    assert.deepEqual([e.stu[0].nb, e.stu[0].etapa, e.stu[1].nb, e.stu[1].etapa], [2.6, 'PP-01', 2, 'PP-01']);
  });

  it('missão do curso noutro recurso: as preferências são os horários desse recurso, na disponibilidade pedida', () => {
    const programa = { PP: [], PC: [{ id: 'PC-01', nome: 'A', mis: 'IFR', eq: 'PA-34', nb: 1 }], INVA: [] };
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PC' })] };
    importarSolicitacoes(e, [pedido(9, 1000, { missao: 'IFR', janela: 'manha' })], { programa: doCadastro(programa) });
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].p1, e.stu[0].p2], ['PC-01', 'PA-34', 390, 420]);
  });

  // No programa em fases, várias missões podem estar liberadas: o pedido entra como a primeira do tipo pedido (o Noturno
  // em trechos, pela noite: o bloco de 4 h às 17:30, o translado e o noturno em BH); nenhuma liberada do tipo (fora da
  // ordem, ou fora do programa), ele entra como veio, com a duração da missão: o simulador, as 2 h de padrão
  it('aluno de um curso em fases: a primeira missão liberada do tipo pedido; fora da ordem, nenhuma', () => {
    // As fases 1 a 4 aprovadas (as 13 primeiras missões do curso): o Voo Solo (na Fase 7) ainda está fora da ordem
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
    importarSolicitacoes(e, [pedido(30, 1000, { missao: 'Parafuso' }), pedido(31, 1000, { missao: 'Navegação' }), pedido(32, 1000, { missao: 'Noturno' }),
      pedido(33, 1000, { missao: 'Simulador' }), pedido(39, 1000, { missao: 'Voo Solo' })], { situacao, programa: [PP] });
    assert.deepEqual([e.stu[0], ...e.stu[0].extra].map(p => [p.mis, p.etapa, p.eq, p.nb]), [
      ['Parafuso', 'PE-04', 'C152', 1], ['Navegação', 'NAV-01', 'C152', 1.5], ['Noturno', 'NOT', 'C172', 4], ['Simulador', undefined, 'Sim. Mono', 2],
      ['Voo Solo', undefined, 'C152', 1]
    ]);
    const noturno = e.stu[0].extra.find(p => p.mis === 'Noturno');
    assert.deepEqual([noturno.p1, noturno.p2], [1050, -1], 'o Noturno sai às 17:30');
  });

  // O curso da missão vai com o código: o resultado vai para ele, mesmo que o aluno troque de curso no mesmo dia
  it('o pedido que entra como missão do curso leva o curso dela; o que entra como veio, nenhum', () => {
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })] };
    importarSolicitacoes(e, [pedido(34, 1000, { missao: 'Parafuso' }), pedido(35, 1000, { missao: 'Simulador' }), pedido(36, 1001)], { situacao, programa: [PP] });
    assert.deepEqual([e.stu[0], ...e.stu[0].extra, e.stu[1]].map(p => [p.mis, p.etapa, p.cursoDaEtapa]),
      [['Parafuso', 'PE-04', 'PP'], ['Simulador', undefined, undefined], ['Voo Local', undefined, undefined]]);
    assert.equal(Object.hasOwn(e.stu[0].extra[0], 'cursoDaEtapa'), false);
  });

  // A escolha do operador vale mais que a do app: a missão do curso que o operador pôs no voo ("Outra missão do curso",
  // Usar), sem voo fixo, continua quando o pedido da agenda da mesma missão toma o lugar dele. Antes, o pedido entrava
  // como a primeira liberada do tipo (a NAV-01 no lugar da NAV-02 escolhida), e a escolha se perdia
  it('a missão do curso escolhida no voo que dá lugar ao pedido da agenda continua a dele, com o curso, o recurso e as horas', () => {
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C152', nb: 1.5, etapa: 'NAV-02', cursoDaEtapa: 'PP', insId: 2 }, { curso: 'PC' })] };
    const resumo = importarSolicitacoes(e, [pedido(37, 1000, { missao: 'Navegação', janela: 'manha' })], { situacao, programa: [PP] });
    assert.deepEqual(resumo, { novos: 0, atualizados: 1, semAluno: 0 });
    const p = e.stu[0];
    assert.deepEqual([p.etapa, p.cursoDaEtapa, p.eq, p.nb, p.solicitacao, p.jan, p.insId, p.extra], ['NAV-02', 'PP', 'C152', 1.5, 37, 'manha', 2, []]);
    // Sem os programas lidos, a escolha também continua (ela não é inferida); a duração registrada na agenda vale mais
    const semPrograma = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 2, etapa: 'TSL-01' }, { curso: 'PP' })] };
    importarSolicitacoes(semPrograma, [pedido(38, 1000, { missao: 'Navegação', horas: 1.2 })], { programa: [] });
    const q = semPrograma.stu[0];
    assert.deepEqual([q.etapa, Object.hasOwn(q, 'cursoDaEtapa'), q.eq, q.nb, q.solicitacao], ['TSL-01', false, 'C172', 1.2, 38]);
  });

  it('sem programa (os resultados ou os programas não foram lidos), nenhum pedido entra como missão do curso', () => {
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
    importarSolicitacoes(e, [pedido(40, 1000)], { programa: [] });
    assert.deepEqual([e.stu[0].fly, e.stu[0].etapa], [true, undefined]);
  });

  // A missão de um voo cancelado não conta como já marcada no dia
  it('as missões dos outros voos do dia contam como feitas; a do voo cancelado, não', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'B', mis: 'Navegação', eq: 'C152', nb: 2 }] };
    const importar = fStatus => {
      const e = { ...estado(), fStatus, stu: [aluno(1000, { etapa: 'PP-01' }, { curso: 'PP' })] };
      importarSolicitacoes(e, [pedido(50, 1000, { missao: 'Navegação' })], { programa: doCadastro(programa) });
      return e.stu[0].extra.map(x => [x.mis, x.etapa]);
    };
    assert.deepEqual(importar({}), [['Navegação', 'PP-02']]);
    assert.deepEqual(importar({ '1000_0_1': 'Cancelado' }), [['Navegação', undefined]], 'a PP-01 ainda falta');
  });

  // A sonda do juiz (sonda-agenda.mjs): o voo agendado na escala é o pedido com o voo fixo, sem pedido da agenda. Ele não
  // é a "mesma missão copiada": o pedido da agenda o sobrescrevia, e o voo fixo ficava em conflito (fora da
  // disponibilidade, a duração mudou)
  it('o voo fixo não dá lugar ao pedido da agenda: o pedido vira outro voo, e o fixo fica onde estava', () => {
    const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1, etapa: 'PP-07' })] });
    const o = runAllocationEngine(e).out[0];
    e.fixos = { '1000_0_1': { a: o.a, b: o.b, r: o.r, insId: o.insId, agendado: true } };
    const resumo = importarSolicitacoes(e, [pedido(7, 1000, { janela: 'horario', horario: '13:40', horas: 2 })]);
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0 });
    const principal = e.stu[0], [extra] = principal.extra;
    assert.deepEqual([principal.p1, principal.nb, principal.etapa, principal.solicitacao], [610, 1, 'PP-07', undefined]);
    assert.deepEqual([extra.mid, extra.mis, extra.p1, extra.nb, extra.solicitacao], [1, 'Voo Local', 820, 2, 7]);
    const { out } = runAllocationEngine(e);
    assert.deepEqual(out.map(v => [v.fKey, v.a, Boolean(v.fixo), v.conflito || []]), [['1000_0_1', 610, true, []], ['1000_1_1', 820, false, []]]);
  });

  // O voo que já tem resultado na data aconteceu: o pedido da agenda que tomasse o lugar dele mostraria o resultado dele
  it('o voo que já tem resultado na data também não dá lugar ao pedido da agenda', () => {
    const e = { ...estado(), resultados: { situacao: [], doDia: [{ id: 1, aluno: 1002, curso: 'PP', missao: 'PP-01', resultado: 'aprovado', data: '2026-11-11', voo: '1002_0_1' }] } };
    importarSolicitacoes(e, [pedido(3, 1002)]);
    assert.deepEqual([e.stu[2].solicitacao, e.stu[2].extra.map(x => [x.mid, x.mis, x.solicitacao])], [undefined, [[1, 'Voo Local', 3]]]);
  });

  // Em voo, atrasado, pousado ou cancelado, o voo fica onde está mesmo sem o cadeado (a aprovação da escala tira o cadeado
  // do voo que estava com o Voa desligado, e ele volta a voar sem ele): o pedido da agenda que tomasse o lugar dele
  // entraria cancelado ou em voo. Pendente e Confirmado não fixam o voo
  it('o voo fixado pelo status, mesmo sem o cadeado, também não dá lugar ao pedido da agenda', () => {
    const importar = status => {
      const e = { ...estado(), fStatus: { '1002_0_1': status } };
      importarSolicitacoes(e, [pedido(12, 1002)]);
      return [e.stu[2].solicitacao, e.stu[2].extra.map(x => [x.mid, x.solicitacao])];
    };
    for (const status of ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado']) assert.deepEqual(importar(status), [undefined, [[1, 12]]], status);
    for (const status of ['Pendente', 'Confirmado']) assert.deepEqual(importar(status), [12, []], status);
  });

  // A sonda do juiz (sonda-limpar.mjs), de antes de "Limpar demanda" soltar os voos que limpa: os pedidos voltavam ao
  // branco, e o voo fixo (o agendado) ficava preso à chave do pedido principal. O pedido da agenda que entrasse nele
  // herdaria o voo fixo de outra missão; o mesmo com o status, o detalhe ou o resultado de um voo que saiu da escala
  it('o pedido principal que não voa mas tem sobras no dia não recebe o pedido da agenda: ele vira uma missão extra', () => {
    const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1 })] });
    e.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PP-LJV', insId: 1, agendado: true } };
    e.stu.forEach(d => { Object.assign(d, blank()); delete d.insId; d.extra = []; });
    importarSolicitacoes(e, [pedido(8, 1000, { missao: 'Navegação', janela: 'horario', horario: '13:40', horas: 1.5 })]);
    assert.deepEqual([e.stu[0].fly, e.stu[0].extra.map(x => [x.mid, x.mis, x.solicitacao])], [false, [[1, 'Navegação', 8]]]);
    const { out } = runAllocationEngine(e);
    assert.deepEqual(out.map(v => [v.fKey, v.mis, v.a, Boolean(v.fixo), v.conflito || []]), [['1000_1_1', 'Navegação', 820, false, []]]);

    const sobras = [{ fStatus: { '1000_0_1': 'Cancelado' } }, { fObs: { '1000_0_1': { motivo: 'Meteorologia' } } },
      { resultados: { situacao: [], doDia: [{ id: 1, aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'reprovado', data: '2026-11-11', voo: '1000_0_1' }] } }];
    for (const sobra of sobras) {
      const comSobra = { ...estado(), ...sobra };
      importarSolicitacoes(comSobra, [pedido(9, 1000)]);
      assert.deepEqual([comSobra.stu[0].fly, comSobra.stu[0].extra.map(x => [x.mid, x.solicitacao])], [false, [[1, 9]]], JSON.stringify(sobra));
    }
  });

  // O pedido principal que volta a voar com o pedido da agenda não traz nada do voo de antes (a disponibilidade, a missão
  // do curso, o pedido da agenda, o instrutor escolhido)
  it('o pedido principal que recebe o pedido da agenda começa em branco', () => {
    const e = { ...estado(), stu: [aluno(1000, { fly: false, mis: 'Navegação', eq: 'C172', nb: 2, pr: 1, jan: 'manha', etapa: 'PP-09', solicitacao: 99, insId: 1 }, { curso: 'PP' })] };
    importarSolicitacoes(e, [pedido(61, 1000, { janela: 'horario', horario: null })]);
    const p = e.stu[0];
    assert.deepEqual([p.fly, p.mis, p.eq, p.nb, p.pr, p.solicitacao, p.extra], [true, 'Voo Local', 'C152', 1, 3, 61, []]);
    assert.deepEqual(['jan', 'etapa', 'insId'].filter(campo => Object.hasOwn(p, campo)), []);
  });

  // O pedido posto à mão com a missão do curso (o Usar), da mesma missão do pedido da agenda, dá lugar a ele, e a missão do
  // curso continua no dia. Antes, a missão dele contava como já no dia: o pedido entrava como a seguinte, no lugar dele, e
  // a do Usar sumia do dia
  it('o voo da mesma missão posto à mão com a missão do curso dá lugar ao pedido da agenda, com a mesma missão do curso', () => {
    const programa = { PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) };
    const e = { ...estado(), stu: [aluno(1000, { etapa: 'PP-01', insId: 2 }, { curso: 'PP' })] };
    const resumo = importarSolicitacoes(e, [pedido(62, 1000, { janela: 'horario', horario: '13:40' }), pedido(63, 1000, { janela: 'horario', horario: '15:20' })],
      { programa: doCadastro(programa) });
    assert.deepEqual(resumo, { novos: 1, atualizados: 1, semAluno: 0 });
    // O instrutor escolhido continua no voo; o segundo pedido é outro voo, a missão seguinte
    assert.deepEqual([e.stu[0].etapa, e.stu[0].solicitacao, e.stu[0].jan, e.stu[0].insId], ['PP-01', 62, 'h820', 2]);
    assert.deepEqual(e.stu[0].extra.map(x => [x.mid, x.etapa, x.solicitacao, x.insId]), [[1, 'PP-02', 63, undefined]]);
  });

  // O Noturno do programa (o NOT, com as 3 h do noturno em BH) é o bloco de 4 h às 17:30 do dia (o translado e o noturno;
  // a volta no dia seguinte), também com outra duração registrada na agenda
  it('a missão de duração fixa entra com ela: o NOT do programa com 4 h às 17:30; o Ground com 01h30', () => {
    const PP = cursoPP();
    const feitas = [...percursoDoCurso(PP).missoes.slice(0, 13).map(m => m.codigo), 'TSL-01'];
    const situacao = feitas.map((codigo, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })] };
    importarSolicitacoes(e, [pedido(64, 1000, { missao: 'Noturno', janela: 'noite', horas: 3 }), pedido(65, 1001, { missao: 'Ground C152', janela: 'manha', horas: 2 })],
      { situacao, programa: [PP] });
    const [noturno, ground] = e.stu;
    assert.deepEqual([noturno.mis, noturno.etapa, noturno.eq, noturno.nb, noturno.p1, noturno.p2], ['Noturno', 'NOT', 'C172', 4, 1050, -1]);
    assert.deepEqual([ground.mis, ground.eq, ground.nb], ['Ground C152', 'Sala Ground', 1.5]);
  });

  // A Agenda importa com o programa da tela (programaParaInferir, em js/eventos/agenda.js): sem os resultados ou os
  // programas, vazio. Nenhum pedido entra como missão do curso (antes, inferia de uma situação vazia: a primeira missão)
  it('sem os resultados ou os programas lidos, nenhum pedido entra como missão do curso', () => {
    const importar = indisponiveis => {
      setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [cursoPP()], indisponiveis });
      const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
      importarSolicitacoes(e, [pedido(66, 1000)], { situacao: [], programa: programaParaInferir() });
      return e.stu[0].etapa;
    };
    assert.equal(importar([]), 'IN-01');
    assert.equal(importar(['horas']), 'IN-01');
    for (const parte of ['resultados', 'cursos', 'cursos-pendentes']) assert.equal(importar([parte]), undefined, parte);
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

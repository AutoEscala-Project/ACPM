// As restrições de um voo (G1, js/restricoes.js, puro): o que o motor lê para encaixar um pedido (o tipo de recurso, o
// instrutor, a prioridade, o horário e a duração), na gaveta "Restrições" (aside.gaveta#painel-restricoes), que toma o
// lugar das colunas da Demanda. O horário exato do pedido da agenda nunca é afrouxado nem editado ali (N14); o tipo e o
// horário contra as limitações do aluno (L) avisam e pedem a confirmação (o motor ainda recusa: só o voo posto à mão
// voa assim); o INVA em "Não escalar com" fica na lista, desligado. E a regra que solta o voo agendado
// (fixosSemOAgendadoQueMudou): só uma mudança de verdade da missão, do tipo ou das horas
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mudouOVoo, fixosSemOAgendadoQueMudou, horarioExatoDoPedido, opcoesDeTipoDoPedido, opcoesDeHorarioDoPedido,
  instrutoresDasRestricoes, avisoDaRestricao, aplicarRestricao, pedidosDasRecusas, tipoDaMissaoDoCurso
} from '../../js/restricoes.js';
import { runAllocationEngine } from '../../js/engine.js';
import { avisosDaData } from '../../js/linha-do-dia.js';
import { HORARIOS_INICIAIS } from '../../js/horarios.js';
import { ERRO_DA_DURACAO } from '../../js/rules.js';
import { aluno, cenario, instrutor, missaoExtra } from '../helpers/montar.js';

// 2026-11-30 é uma segunda-feira
const SEGUNDA = '2026-11-30';
const C172_SO = { recursos: ['C172'] };
const TARDE = { horarios: [{ de: 780, ate: 1080 }] };

describe('mudouOVoo: a missão, o tipo ou as horas, de verdade', () => {
  it('a mesma duração escrita de outro jeito (1 e 1.0, "1") não muda o voo; a missão, o tipo ou outra duração mudam', () => {
    const p = { mis: 'Voo Local', eq: 'C152', nb: 1 };
    assert.equal(mudouOVoo(p, { ...p }), false);
    assert.equal(mudouOVoo(p, { ...p, nb: 1.0 }), false);
    assert.equal(mudouOVoo(p, { ...p, nb: '1' }), false);
    assert.equal(mudouOVoo(p, { ...p, nb: 1.2 }), true);
    assert.equal(mudouOVoo(p, { ...p, eq: 'C172' }), true);
    assert.equal(mudouOVoo(p, { ...p, mis: 'Navegação' }), true);
    // As preferências, o instrutor e a prioridade não são do voo
    assert.equal(mudouOVoo(p, { ...p, p1: 500, insId: 2, pr: 5 }), false);
  });
});

describe('fixosSemOAgendadoQueMudou: só a mudança de verdade solta o voo agendado', () => {
  const PINO = { a: 500, b: 560, r: 'PR-EJA', insId: 1, agendado: true };
  const estado = (fixos, fStatus = {}, pedido = {}) => ({ ...cenario({ stu: [aluno(1000, pedido)] }), fixos, fStatus });

  it('sem mudança (ou a mesma duração escrita de outro jeito), os mesmos voos fixos, o mesmo objeto', () => {
    const e = estado({ '1000_0_1': PINO });
    const antes = { mis: 'Voo Local', eq: 'C152', nb: 1 };
    assert.equal(fixosSemOAgendadoQueMudou(e, '1000_0_1', antes, { ...antes }), e.fixos);
    assert.equal(fixosSemOAgendadoQueMudou(e, '1000_0_1', antes, { ...antes, nb: 1.0 }), e.fixos);
  });

  it('a missão, o tipo ou as horas mudados: o voo agendado sai dos fixos; os outros voos fixos ficam', () => {
    const outro = { a: 390, b: 450, r: 'PR-EJB', insId: 2 };
    const e = estado({ '1000_0_1': PINO, '1001_0_1': outro });
    const antes = { mis: 'Voo Local', eq: 'C152', nb: 1 };
    for (const depois of [{ ...antes, mis: 'Navegação' }, { ...antes, eq: 'C172' }, { ...antes, nb: 1.5 }]) {
      const fixos = fixosSemOAgendadoQueMudou(e, '1000_0_1', antes, depois);
      assert.equal(Object.hasOwn(fixos, '1000_0_1'), false, JSON.stringify(depois));
      assert.deepEqual(fixos['1001_0_1'], outro);
    }
  });

  it('o voo fixo pelo status continua fixo, só sem a marca do agendamento', () => {
    const e = estado({ '1000_0_1': PINO }, { '1000_0_1': 'Pousou' });
    const fixos = fixosSemOAgendadoQueMudou(e, '1000_0_1', { mis: 'Voo Local', eq: 'C152', nb: 1 }, { mis: 'Voo Local', eq: 'C152', nb: 2 });
    assert.deepEqual(fixos['1000_0_1'], { a: 500, b: 560, r: 'PR-EJA', insId: 1 });
  });

  it('o voo fixo sem a marca do agendamento (a escala aprovada, o instrutor escolhido) não é solto por aqui', () => {
    const e = estado({ '1000_0_1': { a: 500, b: 560, r: 'PR-EJA', insId: 1, escolhido: true } });
    assert.equal(fixosSemOAgendadoQueMudou(e, '1000_0_1', { mis: 'Voo Local', eq: 'C152', nb: 1 }, { mis: 'Navegação', eq: 'C152', nb: 1 }), e.fixos);
  });

  it('o Noturno agendado que passa para outra missão perde também o pino do Noturno', () => {
    const noturno = { a: 1050, b: 1290, r: 'PR-EJC', insId: 1, agendado: true, noturno: true };
    // O pedido já mudou (o estado é o de depois): ele não voa mais o Noturno
    const e = estado({ '1000_0_1': noturno }, {}, { mis: 'Voo Local', eq: 'C172', nb: 1 });
    const fixos = fixosSemOAgendadoQueMudou(e, '1000_0_1', { mis: 'Noturno', eq: 'C172', nb: 4 }, { mis: 'Voo Local', eq: 'C172', nb: 1 });
    assert.equal(Object.hasOwn(fixos, '1000_0_1'), false);
  });
});

describe('horarioExatoDoPedido: o horário do pedido da agenda (N14)', () => {
  it('o minuto exato, um ou dois, com o texto; sem jan (o pedido feito à mão), null', () => {
    assert.deepEqual(horarioExatoDoPedido({ jan: 'h500' }), { minutos: [500], texto: 'às 08:20' });
    assert.deepEqual(horarioExatoDoPedido({ jan: 'h500|h610' }), { minutos: [500, 610], texto: 'às 08:20 ou às 10:10' });
    assert.equal(horarioExatoDoPedido({}), null);
    assert.equal(horarioExatoDoPedido({ jan: 'manha' }), null);
  });

  it('os dois horários exatos do E (U1): o da 1ª e o da 2ª preferência, na ordem do pedido, não na do relógio', () => {
    assert.deepEqual(horarioExatoDoPedido({ jan: 'h500|h390' }), { minutos: [500, 390], texto: 'às 08:20 ou às 06:30' });
    assert.equal(horarioExatoDoPedido({ jan: 'h500|h500' }), null);
  });
});

describe('opcoesDeTipoDoPedido: os tipos da missão, com o das limitações dito (L)', () => {
  it('sem limitação, os tipos da missão, sem motivo', () => {
    const opcoes = opcoesDeTipoDoPedido(aluno(1000), { mis: 'Voo Local', eq: 'C152' }, SEGUNDA);
    assert.deepEqual(opcoes.map(o => o.valor), ['C152', 'C172', 'PA-34']);
    assert.ok(opcoes.every(o => o.motivo === null && o.texto === o.valor));
  });

  it('o aluno que só voa no C172: os outros tipos ficam na lista (nada esconde), cada um com o motivo', () => {
    const opcoes = opcoesDeTipoDoPedido(aluno(1000, {}, { limitacoes: C172_SO }), { mis: 'Voo Local', eq: 'C152' }, SEGUNDA);
    assert.deepEqual(opcoes.map(o => [o.valor, o.texto]), [
      ['C152', 'C152 (o aluno só voa no C172)'], ['C172', 'C172'], ['PA-34', 'PA-34 (o aluno só voa no C172)']
    ]);
    assert.equal(opcoes[0].motivo, 'o aluno só voa no C172');
  });

  it('a limitação dos aviões não pega o simulador (a espécie que ela nomeia, L); o Ground, só a Sala', () => {
    const lim = aluno(1000, {}, { limitacoes: C172_SO });
    assert.ok(opcoesDeTipoDoPedido(lim, { mis: 'Simulador', eq: 'Sim. Mono' }, SEGUNDA).every(o => o.motivo === null));
    assert.deepEqual(opcoesDeTipoDoPedido(lim, { mis: 'Ground C152', eq: 'Sala Ground' }, SEGUNDA).map(o => o.valor), ['Sala Ground']);
  });
});

describe('opcoesDeHorarioDoPedido: as preferências, com o horário fora das limitações dito', () => {
  const lista = HORARIOS_INICIAIS.C152;

  it('"—", os horários da lista e a preferência que saiu da lista (marcada); sem limitação, sem motivo', () => {
    const opcoes = opcoesDeHorarioDoPedido(aluno(1000), { p1: 505 }, 505, lista, SEGUNDA);
    assert.deepEqual(opcoes[0], { valor: -1, texto: '—', motivo: null });
    assert.deepEqual(opcoes.slice(1, -1).map(o => o.valor), lista);
    assert.deepEqual(opcoes.at(-1), { valor: 505, texto: '08:25 (fora da lista)', motivo: null });
  });

  it('o aluno que só voa à tarde: os horários de fora ficam (nada esconde), com o motivo', () => {
    const opcoes = opcoesDeHorarioDoPedido(aluno(1000, {}, { limitacoes: TARDE }), {}, -1, lista, SEGUNDA);
    const das = m => opcoes.find(o => o.valor === m);
    assert.equal(das(390).texto, '06:30 (o aluno só voa das 13:00 às 18:00)');
    assert.equal(das(390).motivo, 'o aluno só voa das 13:00 às 18:00');
    assert.equal(das(820).motivo, null);
  });

  it('os horários com dias da semana valem pelo dia da data (a terça fora do "seg")', () => {
    const lim = aluno(1000, {}, { limitacoes: { horarios: [{ de: 780, ate: 1080, dias: [1] }] } });
    assert.equal(opcoesDeHorarioDoPedido(lim, {}, -1, lista, SEGUNDA).find(o => o.valor === 820).motivo, null);
    assert.equal(opcoesDeHorarioDoPedido(lim, {}, -1, lista, '2026-12-01').find(o => o.valor === 820).motivo, 'o aluno não voa nesta data');
  });

  it('o horário guardado das 06:00 (antes da decisão de 28/11, L): lido como das 06:30, como o motor o lê; o que termina até as 06:30 sai', () => {
    const cedo = aluno(1000, {}, { limitacoes: { horarios: [{ de: 360, ate: 600 }] } });
    const opcoes = opcoesDeHorarioDoPedido(cedo, {}, -1, lista, SEGUNDA);
    assert.equal(opcoes.find(o => o.valor === 390).motivo, null);
    assert.equal(opcoes.find(o => o.valor === 820).motivo, 'o aluno só voa das 06:30 às 10:00');
    assert.equal(avisoDaRestricao(cedo, 'p1', 820, SEGUNDA), '13:40: o aluno só voa das 06:30 às 10:00. Assim, o app não escala o pedido nesse horário; só um voo posto à mão, no editor do voo, voa assim.');
    const antesDas0630 = aluno(1000, {}, { limitacoes: { horarios: [{ de: 360, ate: 390 }] } });
    assert.ok(opcoesDeHorarioDoPedido(antesDas0630, {}, -1, lista, SEGUNDA).every(o => o.motivo === null));
    assert.equal(avisoDaRestricao(antesDas0630, 'p1', 820, SEGUNDA), null);
  });
});

describe('instrutoresDasRestricoes: "Automático" e os INVAs do pedido; o de "Não escalar com" listado, desligado', () => {
  it('o bloqueado aparece desligado, "em Não escalar com" (escolhido, o motor recusaria o pedido)', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9, { on: false })], stu: [aluno(1000, {}, { bl: [2] })] });
    const opcoes = instrutoresDasRestricoes(estado, estado.stu[0], estado.stu[0]);
    assert.deepEqual(opcoes.map(o => [o.valor, o.texto, o.desligada]), [
      ['', 'Automático', false],
      [1, 'Instrutor 01', false],
      [2, 'Instrutor 02 (em Não escalar com)', true],
      [3, 'Instrutor 03 (fora nesta data)', false]
    ]);
  });

  it('o bloqueado que também não vem na data continua desligado, "em Não escalar com" (o bloqueio vale mais que a nota da data)', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { on: false })], stu: [aluno(1000, {}, { bl: [2] })] });
    const opcoes = instrutoresDasRestricoes(estado, estado.stu[0], estado.stu[0]);
    assert.deepEqual(opcoes.find(o => o.valor === 2), { valor: 2, texto: 'Instrutor 02 (em Não escalar com)', desligada: true });
  });

  it('"Automático" diz quem o "Priorizar com" prioriza; o sem a habilitação fica de fora, como na Demanda', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }, { voaCom: [1] })] });
    const opcoes = instrutoresDasRestricoes(estado, estado.stu[0], estado.stu[0]);
    assert.equal(opcoes[0].texto, 'Automático (prioriza Instrutor 01)');
    assert.equal(opcoes.some(o => o.valor === 2), false);
  });

  it('o escolhido que saiu do cadastro aparece, com o aviso', () => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { insId: 9 })] });
    const opcoes = instrutoresDasRestricoes(estado, estado.stu[0], estado.stu[0]);
    assert.deepEqual(opcoes[1], { valor: 9, texto: 'Instrutor fora do cadastro (o app escolhe)', desligada: false });
  });
});

describe('tipoDaMissaoDoCurso: o tipo da missão do curso no pedido, para o aluno que não voa no do programa (R7, como em Pedidos)', () => {
  const PP01 = { codigo: 'PP-01', mis: 'Voo Local', eq: 'C152' };
  it('sem limitação, ou com o tipo do programa permitido: o do programa, sem aviso', () => {
    assert.deepEqual(tipoDaMissaoDoCurso(aluno(1000), PP01, { eq: 'C172' }, SEGUNDA), { eq: 'C152', aviso: null });
    assert.deepEqual(tipoDaMissaoDoCurso(aluno(1000, {}, { limitacoes: { recursos: ['C152'] } }), PP01, { eq: 'C172' }, SEGUNDA), { eq: 'C152', aviso: null });
  });

  it('o aluno que só voa no C172: o pedido vai num tipo que a missão permite e ele voa, e a missão continua a do curso', () => {
    const r = tipoDaMissaoDoCurso(aluno(1000, {}, { limitacoes: C172_SO }), PP01, { eq: 'C152' }, SEGUNDA);
    assert.deepEqual(r, { eq: 'C172', aviso: 'O programa faz PP-01 no C152, e o aluno só voa no C172: o pedido vai no C172, e a missão continua PP-01.' });
  });

  it('com mais de um tipo que serve, o do pedido, quando é um deles', () => {
    const lim = aluno(1000, {}, { limitacoes: { recursos: ['C172', 'PA-34'] } });
    assert.equal(tipoDaMissaoDoCurso(lim, PP01, { eq: 'PA-34' }, SEGUNDA).eq, 'PA-34');
    assert.equal(tipoDaMissaoDoCurso(lim, PP01, { eq: 'C152' }, SEGUNDA).eq, 'C172');
  });

  it('nenhum tipo da missão que o aluno voa: o do programa, com o aviso das limitações (o motor recusa o pedido)', () => {
    const r = tipoDaMissaoDoCurso(aluno(1000, {}, { limitacoes: C172_SO }), { codigo: 'MLT-01', mis: 'Multimotor', eq: 'PA-34' }, { eq: 'C172' }, SEGUNDA);
    assert.equal(r.eq, 'PA-34');
    assert.equal(r.aviso, avisoDaRestricao(aluno(1000, {}, { limitacoes: C172_SO }), 'eq', 'PA-34', SEGUNDA));
  });

  it('o Ground não tem tipo a trocar', () => {
    assert.deepEqual(tipoDaMissaoDoCurso(aluno(1000, {}, { limitacoes: C172_SO }), { codigo: 'GND-01', mis: 'Ground C152', eq: 'Sala Ground' }, { eq: 'Sala Ground' }, SEGUNDA), { eq: 'Sala Ground', aviso: null });
  });
});

describe('avisoDaRestricao: o tipo e o horário contra as limitações avisam (e pedem a confirmação)', () => {
  it('o tipo que o aluno não voa e o horário fora dos dele: o motivo e o que acontece', () => {
    const lim = aluno(1000, {}, { limitacoes: { ...C172_SO, ...TARDE } });
    assert.equal(avisoDaRestricao(lim, 'eq', 'C152', SEGUNDA),
      'C152: o aluno só voa no C172. Assim, o app não escala o pedido (ele fica fora da escala, com o motivo); só um voo posto à mão, no editor do voo, voa assim.');
    assert.equal(avisoDaRestricao(lim, 'p1', 390, SEGUNDA),
      '06:30: o aluno só voa das 13:00 às 18:00. Assim, o app não escala o pedido nesse horário; só um voo posto à mão, no editor do voo, voa assim.');
    assert.equal(avisoDaRestricao(lim, 'p2', 390, SEGUNDA).startsWith('06:30: '), true);
  });

  it('dentro das limitações, sem limitação, "—" e os outros campos: nenhum aviso', () => {
    const lim = aluno(1000, {}, { limitacoes: { ...C172_SO, ...TARDE } });
    assert.equal(avisoDaRestricao(lim, 'eq', 'C172', SEGUNDA), null);
    assert.equal(avisoDaRestricao(lim, 'p1', 820, SEGUNDA), null);
    assert.equal(avisoDaRestricao(lim, 'p1', -1, SEGUNDA), null);
    assert.equal(avisoDaRestricao(lim, 'nb', 2, SEGUNDA), null);
    assert.equal(avisoDaRestricao(aluno(1000), 'eq', 'C152', SEGUNDA), null);
  });
});

describe('aplicarRestricao: o campo no pedido, como a Demanda fazia', () => {
  const horarios = { ...HORARIOS_INICIAIS };

  it('o tipo: as preferências vão para a lista nova, a missão do curso e a confirmação do 7º local saem; o horário exato fica (N14)', () => {
    const pedido = { mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: 610, etapa: 'PP-07', cursoDaEtapa: 'PP', etapaDoPrograma: true, limiteConfirmado: true, jan: 'h500' };
    const feito = aplicarRestricao(pedido, 'eq', 'PA-34', { horarios });
    assert.deepEqual(feito, { aplicada: true, mudouOVoo: true });
    assert.equal(pedido.eq, 'PA-34');
    assert.ok(HORARIOS_INICIAIS['PA-34'].includes(pedido.p1) && HORARIOS_INICIAIS['PA-34'].includes(pedido.p2));
    for (const campo of ['etapa', 'cursoDaEtapa', 'etapaDoPrograma', 'limiteConfirmado']) assert.equal(Object.hasOwn(pedido, campo), false, campo);
    assert.equal(pedido.jan, 'h500');
  });

  it('o mesmo tipo não muda nada', () => {
    const pedido = { mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, etapa: 'PP-07' };
    assert.deepEqual(aplicarRestricao(pedido, 'eq', 'C152', { horarios }), { aplicada: true, mudouOVoo: false });
    assert.equal(pedido.etapa, 'PP-07');
  });

  it('a duração: de 0,1 a 5 h, em décimos; a mesma escrita de outro jeito não tira o código; fora disso, não vale', () => {
    const pedido = { mis: 'Voo Local', eq: 'C152', nb: 1, etapa: 'PP-07', limiteConfirmado: true };
    assert.deepEqual(aplicarRestricao(pedido, 'nb', '1.0', { horarios }), { aplicada: true, mudouOVoo: false });
    assert.equal(pedido.etapa, 'PP-07');
    assert.deepEqual(aplicarRestricao(pedido, 'nb', '1.5', { horarios }), { aplicada: true, mudouOVoo: true });
    assert.equal(pedido.nb, 1.5);
    assert.equal(Object.hasOwn(pedido, 'etapa'), false);
    // A confirmação do 7º local vale para a missão e o recurso, não para as horas
    assert.equal(pedido.limiteConfirmado, true);
    assert.deepEqual(aplicarRestricao(pedido, 'nb', '7', { horarios }), { aplicada: false, mudouOVoo: false, motivo: ERRO_DA_DURACAO });
    assert.equal(pedido.nb, 1.5);
  });

  it('as preferências: só no pedido sem horário exato; o da agenda não muda aqui (Pedidos ou o editor do voo)', () => {
    const livre = { mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: 610 };
    assert.deepEqual(aplicarRestricao(livre, 'p1', '720', { horarios }), { aplicada: true, mudouOVoo: false });
    assert.equal(livre.p1, 720);
    const daAgenda = { mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: -1, jan: 'h500' };
    const recusa = aplicarRestricao(daAgenda, 'p1', '720', { horarios });
    assert.equal(recusa.aplicada, false);
    assert.equal(recusa.motivo, 'O horário do pedido da agenda (às 08:20) não muda aqui: mude-o em Pedidos (cancele e registre de novo) ou no editor do voo, movendo o voo.');
    assert.equal(daAgenda.p1, 500);
    assert.equal(daAgenda.jan, 'h500');
  });

  it('a prioridade: a tela mostra 1 como a mais alta, o pedido guarda 5; fora de 1 a 5, não vale', () => {
    const pedido = { mis: 'Voo Local', eq: 'C152', nb: 1, pr: 3 };
    assert.deepEqual(aplicarRestricao(pedido, 'pr', '1', { horarios }), { aplicada: true, mudouOVoo: false });
    assert.equal(pedido.pr, 5);
    assert.equal(aplicarRestricao(pedido, 'pr', '9', { horarios }).aplicada, false);
    assert.equal(pedido.pr, 5);
  });

  it('a missão (ainda na Demanda até o G2): o recurso padrão dela, o Ground na Sala com 1h30, o simulador com 2 h', () => {
    const pedido = { mis: 'Voo Local', eq: 'PA-34', nb: 1.2, p1: 500, p2: 610, etapa: 'PP-07' };
    assert.deepEqual(aplicarRestricao(pedido, 'mis', 'Noturno', { horarios }), { aplicada: true, mudouOVoo: true });
    assert.deepEqual([pedido.eq, pedido.p1], ['C172', 1050]);
    assert.equal(Object.hasOwn(pedido, 'etapa'), false);
    aplicarRestricao(pedido, 'mis', 'Ground C152', { horarios });
    assert.deepEqual([pedido.eq, pedido.nb], ['Sala Ground', 1.5]);
    aplicarRestricao(pedido, 'mis', 'Simulador', { horarios });
    assert.deepEqual([pedido.eq, pedido.nb], ['Sim. Mono', 2]);
  });

  it('um campo que a gaveta não tem não muda nada', () => {
    const pedido = { mis: 'Voo Local', eq: 'C152', nb: 1 };
    assert.equal(aplicarRestricao(pedido, 'fStatus', 'Pousou', { horarios }).aplicada, false);
    assert.deepEqual(pedido, { mis: 'Voo Local', eq: 'C152', nb: 1 });
  });
});

describe('pedidosDasRecusas: a recusa de cada missão que não entrou, com o pedido dela (o item do trilho)', () => {
  it('cada alerta de recusa leva ao aluno e à missão do pedido recusado (as extras também)', () => {
    // Um instrutor só, que não voa o PA-34: as duas missões no PA-34 ficam fora
    const estado = cenario({
      ins: [instrutor(1, 1)],
      stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }), aluno(1001, {}, { extra: [missaoExtra(2, { mis: 'Multimotor', eq: 'PA-34' })] })]
    });
    const resultado = runAllocationEngine(estado);
    const mapa = pedidosDasRecusas(estado, resultado);
    const recusas = resultado.al.filter(a => a.t === 'err');
    assert.equal(recusas.length, 2);
    assert.deepEqual(recusas.map(a => mapa.get(a)).sort((p, q) => p.stuId - q.stuId), [
      { fKey: '1000_0_1', stuId: 1000, mid: 0 }, { fKey: '1001_2_1', stuId: 1001, mid: 2 }
    ]);
  });

  it('sem recusa, nada', () => {
    const estado = cenario({ stu: [aluno(1000)] });
    assert.equal(pedidosDasRecusas(estado, runAllocationEngine(estado)).size, 0);
    assert.equal(pedidosDasRecusas(estado, null).size, 0);
  });
});

describe('O item do trilho da missão que não entrou leva às restrições do pedido (avisosDaData, restricoes)', () => {
  it('a recusa com o pedido ganha { stuId, mid }; os outros avisos e a recusa sem o pedido, não', () => {
    const estado = cenario({ ins: [instrutor(1, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }), aluno(1001)] });
    const RES = runAllocationEngine(estado);
    const comPedido = avisosDaData({ S: estado, RES, pedidosDasRecusas: pedidosDasRecusas(estado, RES), indisponiveis: [] }).filter(a => a.restricoes);
    assert.deepEqual(comPedido.map(a => [a.titulo, a.restricoes]), [['Aluno 1000', { stuId: 1000, mid: 0 }]]);
    assert.equal(avisosDaData({ S: estado, RES, indisponiveis: [] }).some(a => a.restricoes), false);
  });
});

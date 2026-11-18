// O dia de operação: a escala aprovada fica fixa. O motor põe primeiro os voos fixos (no mesmo horário, avião
// e instrutor) e encaixa o resto em volta; um voo fixo que fica impossível continua onde está, marcado em conflito, e o
// voo fixo cancelado libera o avião e o instrutor.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { normalizarFixos, pinoDoVoo, fixosAoMudarStatus, fixosAoReabrir, fixosAoAprovar, semAgendados, motivoDoFixo } from '../../js/fixos.js';
import { escolherInstrutor, reverterEscolha } from '../../js/instrutor-escolhido.js';
import { comRepousoDoNoturno } from '../../js/noturno.js';
import { gerarCenario } from '../helpers/cenarios.js';
import { aluno, cenario, instrutor, apenas, missaoExtra, GROUND_C152 } from '../helpers/montar.js';

const pino = o => ({ a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}) });
const fixarTudo = out => Object.fromEntries(out.map(o => [o.fKey, pino(o)]));
const doAluno = (out, id) => out.find(o => o.stuId === id);

describe('Voos fixos', () => {
  it('a escala fixada não muda quando a demanda muda: o pedido novo entra em volta', () => {
    const base = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    const antes = runAllocationEngine(base);
    // Um aluno novo, de prioridade maior, que tiraria a vaga do primeiro: os fixos ficam onde estão
    const depois = runAllocationEngine({ ...base, stu: [...base.stu, aluno(1002, { p1: 390, p2: -1, pr: 5 })], fixos: fixarTudo(antes.out) });
    for (const o of antes.out) assert.deepEqual(pino(doAluno(depois.out, o.stuId)), pino(o));
    assert.ok(doAluno(depois.out, 1002), 'o pedido novo entra');
    assert.deepEqual(depois.out.filter(o => o.fixo).map(o => o.stuId).sort(), [1000, 1001]);
    assert.equal(doAluno(depois.out, 1002).fixo, undefined);
  });

  it('o voo fixo que fica impossível (o instrutor não vem mais) continua no lugar, em conflito', () => {
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] });
    const antes = runAllocationEngine(base);
    const { out, al } = runAllocationEngine({ ...base, ins: [{ ...base.ins[0], on: false }], fixos: fixarTudo(antes.out) });
    assert.deepEqual(pino(out[0]), pino(antes.out[0]));
    assert.deepEqual(out[0].conflito, ['o instrutor não está disponível']);
    assert.deepEqual(al.filter(a => a.t === 'conf'), [{ t: 'conf', s: 'Aluno 1000', fKey: '1000_0_1', m: 'Conflito na escala aprovada: o instrutor não está disponível.' }]);
  });

  it('avião em manutenção: o voo fixo nele fica em conflito', () => {
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] });
    const antes = runAllocationEngine(base);
    const { out } = runAllocationEngine({ ...base, av: { ...base.av, [antes.out[0].r]: false }, fixos: fixarTudo(antes.out) });
    assert.deepEqual(out[0].conflito, ['o avião está indisponível']);
  });

  it('o voo fixo cancelado libera o avião e o instrutor para outro pedido', () => {
    // Um avião e um instrutor só
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })], semAeronaves: apenas('C152', 'PP-LJV') });
    const antes = runAllocationEngine(base);
    const { out } = runAllocationEngine({
      ...base, stu: [...base.stu, aluno(1001, { p1: 390, p2: -1 })], fixos: fixarTudo(antes.out), fStatus: { [antes.out[0].fKey]: 'Cancelado' }
    });
    assert.equal(doAluno(out, 1000).status, 'Cancelado');
    assert.deepEqual([doAluno(out, 1001).a, doAluno(out, 1001).r, doAluno(out, 1001).insId], [390, 'PP-LJV', 1]);
  });

  it('a divisão das horas e a troca de matrículas não mexem nos fixos', () => {
    // Fixados: o instrutor 1 com os dois voos (06:30 e 08:20) em dois aviões; a divisão mandaria um para o instrutor 2
    const base = cenario({ ins: [instrutor(1, 1), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    const fixos = {
      '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 },
      '1001_0_1': { a: 500, b: 560, r: 'PR-VOC', insId: 1 }
    };
    const { out } = runAllocationEngine({ ...base, fixos });
    assert.deepEqual(out.map(pino), [fixos['1000_0_1'], fixos['1001_0_1']]);
    assert.ok(out.every(o => !o.conflito));
  });

  it('turma de Ground fixa: um aluno novo entra na mesma turma', () => {
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { ...GROUND_C152, p1: 500, p2: -1 })] });
    const antes = runAllocationEngine(base);
    const { out } = runAllocationEngine({ ...base, stu: [...base.stu, aluno(1001, { ...GROUND_C152, p1: 500, p2: -1 })], fixos: fixarTudo(antes.out) });
    assert.equal(new Set(out.map(o => o.classKey)).size, 1, 'a mesma turma');
    assert.equal(doAluno(out, 1001).a, 500);
  });

  it('pedido que saiu da demanda: o voo fixo dele não aparece', () => {
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    const antes = runAllocationEngine(base);
    const { out } = runAllocationEngine({ ...base, stu: [base.stu[0], { ...base.stu[1], fly: false }], fixos: fixarTudo(antes.out) });
    assert.deepEqual(out.map(o => o.stuId), [1000]);
  });
});

// O voo fixo é conferido de novo a cada cálculo, com as mesmas regras do motor. O que não vale mais
// vira conflito, com o texto e o código (o código decide as sugestões de reparo)
describe('Voos fixos conferidos de novo', () => {
  const VOO = { a: 390, b: 450, r: 'PR-VOB', insId: 1 };
  const fixado = (pedido = {}, extra = {}, pinoDoVoo = VOO) => ({
    ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1, ...pedido })] }),
    fixos: { '1000_0_1': pinoDoVoo }, ...extra
  });
  const conflitoDe = estado => {
    const [voo] = runAllocationEngine(estado).out;
    return { conflito: voo.conflito, codigos: voo.conflitoCodigos };
  };

  it('o voo fixo que continua valendo fica sem conflito', () => {
    assert.deepEqual(conflitoDe(fixado()), { conflito: undefined, codigos: undefined });
  });

  it('Parafuso fora do avião "Só Parafuso", e outra missão nele', () => {
    assert.deepEqual(conflitoDe(fixado({ mis: 'Parafuso' })),
      { conflito: ['o Parafuso só voa no PR-JPL'], codigos: ['so-parafuso'] });
    assert.deepEqual(conflitoDe(fixado({}, {}, { ...VOO, r: 'PR-JPL' })),
      { conflito: ['o PR-JPL é só para o Parafuso'], codigos: ['so-parafuso'] });
  });

  it('peso do aluno e do instrutor acima do limite, mesmo com o mínimo de combustível', () => {
    assert.deepEqual(conflitoDe(fixado({}, { stu: [aluno(1000, { p1: 390, p2: -1 }, { kg: 160 })] })),
      { conflito: ['o peso do aluno e do instrutor passa do limite do avião, mesmo com o mínimo de combustível'], codigos: ['peso'] });
  });

  it('o avião passaria da revisão de 50 horas', () => {
    assert.deepEqual(conflitoDe(fixado({}, { horas: { 'PR-VOB': 49.5 } })),
      { conflito: ['o avião passaria da revisão de 50 horas'], codigos: ['revisao'] });
  });

  it('o instrutor passaria dos limites da lei (o repouso depois de ontem)', () => {
    const horasDosInstrutores = { 1: { mes: 0, semestre: 0, ano: 0, fimAnterior: 1410 } };
    assert.deepEqual(conflitoDe(fixado({}, { horasDosInstrutores })),
      { conflito: ['o instrutor passaria do limite da lei (repouso)'], codigos: ['limite-da-lei'] });
  });

  it('o aluno não voa com o instrutor', () => {
    assert.deepEqual(conflitoDe(fixado({}, { stu: [aluno(1000, { p1: 390, p2: -1 }, { bl: [1] })] })),
      { conflito: ['o aluno não voa com este instrutor'], codigos: ['bloqueio'] });
  });

  it('o período fechado nesta data e fora da disponibilidade do aluno', () => {
    const fechado = fixado();
    fechado.win = fechado.win.map((v, w) => (w === 0 ? false : v));
    assert.deepEqual(conflitoDe(fechado), { conflito: ['o horário está fechado nesta data'], codigos: ['horario-fechado'] });
    assert.deepEqual(conflitoDe(fixado({ jan: 'tarde' })),
      { conflito: ['o horário está fora da disponibilidade do aluno'], codigos: ['disponibilidade'] });
  });

  it('a duração do pedido mudou', () => {
    assert.deepEqual(conflitoDe(fixado({ nb: 2 })), { conflito: ['a duração do pedido mudou'], codigos: ['duracao'] });
  });

  it('o pedido passou de voo para Ground, e de Ground para voo', () => {
    assert.deepEqual(conflitoDe(fixado(GROUND_C152)), { conflito: ['o pedido passou de voo para Ground'], codigos: ['ground-ou-voo'] });
    const turma = { a: 390, b: 480, r: 'SALA-GROUND', insId: 1, classKey: 'GND_Ground C152_0_1' };
    assert.deepEqual(conflitoDe(fixado({}, {}, turma)), { conflito: ['o pedido passou de Ground para voo'], codigos: ['ground-ou-voo'] });
  });

  it('os conflitos do instrutor indisponível e da missão ou do avião que mudou também têm código', () => {
    assert.deepEqual(conflitoDe(fixado({}, { ins: [{ ...instrutor(1, 9), on: false }] })),
      { conflito: ['o instrutor não está disponível'], codigos: ['instrutor-indisponivel'] });
    assert.deepEqual(conflitoDe(fixado({ eq: 'C172' })), { conflito: ['a missão ou o avião do pedido mudou'], codigos: ['tipo-de-aviao'] });
  });

  it('o voo fixo cancelado não é conferido', () => {
    assert.deepEqual(conflitoDe(fixado({ nb: 2 }, { fStatus: { '1000_0_1': 'Cancelado' } })), { conflito: undefined, codigos: undefined });
  });
});

describe('Turma de Ground fixa', () => {
  const TURMA = { a: 390, b: 480, r: 'SALA-GROUND', insId: 1, classKey: 'GND_Ground C152_0_1' };
  const ground = (id, pedido = {}, extra = {}) => aluno(id, { ...GROUND_C152, p1: 390, p2: -1, ...pedido }, extra);

  it('com o primeiro aluno cancelado, a turma continua ocupando a sala e o instrutor', () => {
    const estado = {
      ...cenario({ ins: [instrutor(1, 9)], stu: [ground(1000), ground(1001), aluno(1002, { mis: 'Ground PA-34', eq: 'Sala Ground', nb: 1.5, p1: 390, p2: -1 })] }),
      fixos: { '1000_0_1': TURMA, '1001_0_1': TURMA }, fStatus: { '1000_0_1': 'Cancelado' }
    };
    const { out } = runAllocationEngine(estado);
    assert.equal(doAluno(out, 1001).conflito, undefined);
    assert.ok(doAluno(out, 1002).a >= 480, `a outra turma às ${doAluno(out, 1002).a}`);
  });

  it('turma fixa sem o instrutor: um aluno novo não entra nela', () => {
    const estado = {
      ...cenario({ ins: [instrutor(1, 9, { on: false }), instrutor(2, 9)], stu: [ground(1000), ground(1001)] }),
      fixos: { '1000_0_1': TURMA }
    };
    const { out } = runAllocationEngine(estado);
    assert.deepEqual(doAluno(out, 1000).conflitoCodigos, ['instrutor-indisponivel']);
    const novo = doAluno(out, 1001);
    assert.notEqual(novo.classKey, TURMA.classKey);
    assert.deepEqual([novo.insId, novo.conflito], [2, undefined]);
  });

  it('a chave de uma turma nova não repete a de uma turma fixa', () => {
    // A turma fixa foi passada para as 08:20 (a chave continua a do período 0); o aluno novo só pode às 06:30
    const estado = {
      ...cenario({ ins: [instrutor(1, 9)], stu: [ground(1000), ground(1001, { jan: 'h390' })] }),
      fixos: { '1000_0_1': { ...TURMA, a: 500, b: 590 } }
    };
    const { out } = runAllocationEngine(estado);
    assert.equal(doAluno(out, 1001).a, 390);
    assert.notEqual(doAluno(out, 1001).classKey, doAluno(out, 1000).classKey);
  });

  it('o voo fixo que depende do Ground é um prazo: o Ground termina antes dele', () => {
    // O voo está fixo às 08:20, mas o pedido ainda diz 12:40; o Ground prefere as 10:10
    const voo = { a: 500, b: 560, r: 'PR-VOB', insId: 1 };
    const estado = {
      ...cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [ground(1000, { p1: 610 }, { extra: [missaoExtra(1, { p1: 760, p2: -1 })] })] }),
      fixos: { '1000_1_1': voo }
    };
    const { out, al } = runAllocationEngine(estado, { compactar: false });
    const turma = out.find(o => o.isGround);
    assert.ok(turma && turma.b <= 500, JSON.stringify({ turma, al }));
  });

  it('sem horário para o Ground antes do voo fixo, a rejeição diz por quê', () => {
    const voo = { a: 390, b: 450, r: 'PR-VOB', insId: 1 };
    const estado = {
      ...cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [ground(1000, { p1: 610 }, { extra: [missaoExtra(1, { p1: 390, p2: -1 })] })] }),
      fixos: { '1000_1_1': voo }
    };
    const { al } = runAllocationEngine(estado);
    assert.deepEqual(al, [{ t: 'err', s: 'Aluno 1000', m: 'Rejeitado: o Ground precisa terminar antes do voo fixo das 06:30, e não há horário para ele antes disso.', codigo: 'ground-antes-do-voo-fixo' }]);
  });
});

// O voo atrasado ocupa o horário novo; o cancelado não ocupa nada nem conta nas horas
describe('Voos fixos atrasados e cancelados', () => {
  const VOO = { a: 390, b: 450, r: 'PP-LJV', insId: 1 };

  it('o voo fixo atrasado ocupa o horário novo (e deixa o de antes)', () => {
    const estado = {
      ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })], semAeronaves: apenas('C152', 'PP-LJV') }),
      fixos: { '1000_0_1': VOO }, fStatus: { '1000_0_1': 'Atrasado' }, fObs: { '1000_0_1': { novoInicio: 500 } }
    };
    const { out, al } = runAllocationEngine(estado);
    const novo = doAluno(out, 1001);
    assert.ok(novo.b <= 500 || novo.a >= 560, `o voo novo às ${novo.a}`);
    assert.deepEqual(al.filter(a => /Atraso/.test(a.m)), []);
  });

  it('o atraso conta no limite da lei do instrutor (o horário novo)', () => {
    // O voo das 06:30 atrasado para as 16:30: com a jornada de 10 h (até 18:00 com o encerramento), o voo novo do
    // instrutor só cabe a partir das 10:10 (pelo horário de antes, caberia às 08:20)
    const estado = {
      ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 390, p2: -1 })] }),
      fixos: { '1000_0_1': VOO }, fStatus: { '1000_0_1': 'Atrasado' }, fObs: { '1000_0_1': { novoInicio: 990 } },
      limites: { jornadaMin: 600 }
    };
    const { out } = runAllocationEngine(estado, { compactar: false });
    assert.equal(doAluno(out, 1001).a, 610);
  });

  it('o voo cancelado não conta na revisão de 50 horas, no limite da lei nem na turma', () => {
    const turma = { a: 500, b: 590, r: 'SALA-GROUND', insId: 1, classKey: 'GND_Ground C152_1_1' };
    const estado = {
      ...cenario({
        ins: [instrutor(1, 9)],
        stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { ...GROUND_C152, p1: 500, p2: -1 }), aluno(1002, { ...GROUND_C152, p1: 500, p2: -1 })],
        horas: { 'PP-LJV': 49 }
      }),
      fixos: { '1000_0_1': VOO, '1001_0_1': turma, '1002_0_1': turma },
      fStatus: { '1000_0_1': 'Cancelado', '1001_0_1': 'Cancelado' },
      horasDosInstrutores: { 1: { mes: 99, semestre: 0, ano: 0, fimAnterior: null } }
    };
    const { out, al, revisao } = runAllocationEngine(estado);
    assert.deepEqual(revisao['PP-LJV'], { inicio: 49, voadas: 0, fim: 49, paraAs: null });
    assert.deepEqual(al.filter(a => a.codigo === 'perto-do-limite'), []);
    assert.deepEqual([doAluno(out, 1002).groupSize, doAluno(out, 1002).tag], [1, 'Pref. 1']);
  });

  it('o voo fixo cancelado não conta nas horas da divisão igual', () => {
    // O instrutor 1 (menos habilitações) tem o voo das 08:20 e um cancelado;
    // com o cancelado contando, o voo iria para o 2
    const estado = {
      ...cenario({ ins: [instrutor(1, 1), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] }),
      fixos: { '1000_0_1': VOO }, fStatus: { '1000_0_1': 'Cancelado' }
    };
    const { out } = runAllocationEngine(estado, { compactar: false });
    assert.equal(doAluno(out, 1001).insId, 1);
  });
});

describe('Voos fixos: em 100 dias gerados', async () => {
  const { gerarCenario } = await import('../helpers/cenarios.js');

  it('com a escala fixada, pedidos novos de prioridade máxima nunca mexem num voo fixo', () => {
    for (let seed = 2001; seed <= 2100; seed++) {
      const estado = gerarCenario(seed);
      const antes = runAllocationEngine(estado);
      const novos = [0, 1, 2].map(i => aluno(9000 + i, { p1: [390, 500, 610][i], p2: -1, pr: 5 }));
      const depois = runAllocationEngine({ ...estado, stu: [...estado.stu, ...novos], fixos: fixarTudo(antes.out) });
      for (const o of antes.out) {
        const igual = depois.out.find(v => v.fKey === o.fKey);
        assert.ok(igual, `seed ${seed}: ${o.fKey} sumiu`);
        assert.deepEqual(pino(igual), pino(o), `seed ${seed}: ${o.fKey} mudou`);
        assert.equal(igual.conflito, undefined, `seed ${seed}: ${o.fKey} em conflito sem motivo`);
      }
    }
  });
});

// O ciclo do cadeado. Em Voo, Atrasado, Pousou e Cancelado fixam o voo; Pendente ou Confirmado o soltam fora
// da escala aprovada; Reabrir mantém os fixados pelo status; o cadeado diz por que o voo está fixo
describe('O cadeado do voo', () => {
  const VOO = { fKey: '1000_0_1', a: 390, b: 450, r: 'PR-VOB', insId: 1 };
  const PINO = { a: 390, b: 450, r: 'PR-VOB', insId: 1 };

  it('o status de andamento fixa o voo (mantém o pino que já havia)', async () => {
    const { fixosAoMudarStatus } = await import('../../js/fixos.js');
    for (const status of ['Em Voo', 'Atrasado', 'Cancelado']) {
      assert.deepEqual(fixosAoMudarStatus({}, VOO, status, { aprovada: false }), { '1000_0_1': PINO });
    }
    const antigo = { '1000_0_1': { ...PINO, r: 'PR-VOC' } };
    assert.deepEqual(fixosAoMudarStatus(antigo, VOO, 'Em Voo', { aprovada: true }), antigo);
  });

  it('Pendente ou Confirmado soltam o voo fora da escala aprovada; na aprovada, ele continua fixo', async () => {
    const { fixosAoMudarStatus } = await import('../../js/fixos.js');
    const fixos = { '1000_0_1': PINO, '1001_0_1': { ...PINO, a: 500, b: 560 } };
    assert.deepEqual(fixosAoMudarStatus(fixos, VOO, 'Confirmado', { aprovada: false }), { '1001_0_1': fixos['1001_0_1'] });
    assert.deepEqual(fixosAoMudarStatus(fixos, VOO, 'Pendente', { aprovada: true }), fixos);
  });

  it('Reabrir mantém só os voos fixados pelo status', async () => {
    const { fixosAoReabrir } = await import('../../js/fixos.js');
    const fixos = { '1000_0_1': PINO, '1001_0_1': PINO, '1002_0_1': PINO, '1003_0_1': PINO };
    const fStatus = { '1000_0_1': 'Em Voo', '1001_0_1': 'Confirmado', '1002_0_1': 'Cancelado', '1003_0_1': 'Pousou' };
    assert.deepEqual(Object.keys(fixosAoReabrir(fixos, fStatus)), ['1000_0_1', '1002_0_1', '1003_0_1']);
  });

  it('o motivo do cadeado', async () => {
    const { motivoDoFixo } = await import('../../js/fixos.js');
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: {}, aprovacao: { em: '2026-11-10T21:05:00.000Z', por: 'Operador 01' } }), 'Voo fixo: escala aprovada');
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: { '1000_0_1': 'Em Voo' }, aprovacao: null }), 'Voo fixo: Em Voo');
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: { '1000_0_1': 'Cancelado' }, aprovacao: { em: 'x' } }), 'Voo fixo: Cancelado');
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: { '1000_0_1': 'Pousou' }, aprovacao: null }), 'Voo fixo: Pousou');
    // No Ground e no simulador, o Pousou aparece como "Concluída"
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: { '1000_0_1': 'Pousou' }, aprovacao: null, voo: { mis: 'Ground C152', isGround: true } }), 'Voo fixo: Concluída');
  });
});

// O voo agendado na Escala: o pino com a marca agendado. Ele fica fixo no ciclo inteiro do cadeado (o status, a
// reabertura e a aprovação, que guarda até o agendado que está fora da escala) e sai quando a Demanda solta o pedido
// dele (semAgendados: a demanda limpa, a missão extra tirada, outra missão no pedido)
describe('O voo agendado na Escala', () => {
  const VOO = { fKey: '1000_0_1', a: 390, b: 450, r: 'PR-VOB', insId: 1 };
  const PINO = { a: 390, b: 450, r: 'PR-VOB', insId: 1 };
  const AGENDADO = { ...PINO, agendado: true };
  const APROVACAO = { em: '2026-11-10T21:05:00.000Z', por: 'Operador 01' };

  it('os dados guardam a marca só quando ela é true: adulterada, sai (o voo fixo continua)', () => {
    const lidos = normalizarFixos({
      '1000_0_1': AGENDADO,
      '1001_0_1': { ...PINO, agendado: 'sim' },
      '1002_0_1': { ...PINO, agendado: 1 },
      '1003_0_1': { ...PINO, agendado: false },
      '1004_0_1': { ...PINO, agendado: true, escolhido: true, onclick: 'x' },
      '1005_0_1': { ...PINO, escolhido: 'true', agendado: true },
      '1006_0_1': { ...PINO, a: '390', agendado: true }
    });
    assert.deepEqual(lidos, {
      '1000_0_1': AGENDADO, '1001_0_1': PINO, '1002_0_1': PINO, '1003_0_1': PINO,
      '1004_0_1': { ...PINO, escolhido: true, agendado: true }, '1005_0_1': AGENDADO
    });
  });

  it('o pino do voo leva a marca da linha da escala (também na turma de Ground)', () => {
    assert.deepEqual(pinoDoVoo({ ...VOO, agendado: true }), AGENDADO);
    assert.deepEqual(pinoDoVoo(VOO), PINO);
    const turma = { fKey: '1000_0_1', a: 390, b: 480, r: 'SALA-GROUND', insId: 1, isGround: true, classKey: 'GND_Ground C152_0_1', agendado: true };
    assert.deepEqual(pinoDoVoo(turma), { a: 390, b: 480, r: 'SALA-GROUND', insId: 1, classKey: 'GND_Ground C152_0_1', agendado: true });
  });

  it('Pendente e Confirmado não soltam o agendado; o status de andamento mantém o pino dele, com a marca', () => {
    const fixos = { '1000_0_1': AGENDADO, '1001_0_1': { ...PINO, a: 500, b: 560 } };
    for (const status of ['Pendente', 'Confirmado']) assert.deepEqual(fixosAoMudarStatus(fixos, VOO, status, { aprovada: false }), fixos);
    for (const status of ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado']) assert.deepEqual(fixosAoMudarStatus(fixos, VOO, status, { aprovada: false }), fixos);
    // O voo fixo sem marca continua sendo solto, como antes
    assert.deepEqual(fixosAoMudarStatus(fixos, { ...VOO, fKey: '1001_0_1' }, 'Confirmado', { aprovada: false }), { '1000_0_1': AGENDADO });
  });

  it('Reabrir mantém o agendado, com os fixados pelo status e pela escolha do instrutor; o fixo só pela aprovação sai', () => {
    const fixos = { '1000_0_1': AGENDADO, '1001_0_1': PINO, '1002_0_1': { ...PINO, escolhido: true }, '1003_0_1': PINO, '1004_0_1': { ...AGENDADO, escolhido: true } };
    const reaberta = fixosAoReabrir(fixos, { '1003_0_1': 'Em Voo', '1000_0_1': 'Confirmado' });
    assert.deepEqual(reaberta, { '1000_0_1': AGENDADO, '1002_0_1': fixos['1002_0_1'], '1003_0_1': PINO, '1004_0_1': fixos['1004_0_1'] });
  });

  it('Aprovar fixa cada voo da escala com as marcas: o agendado (do pino ou da linha) e o escolhido (do pino)', () => {
    const linha = (fKey, extra = {}) => ({ fKey, classKey: fKey, isGround: false, a: 390, b: 450, r: 'PR-VOB', insId: 1, ...extra });
    const turma = 'GND_Ground C152_0_1';
    const out = [
      linha('1000_0_1'), linha('1001_0_1', { agendado: true }), linha('1002_0_1'), linha('1003_0_1'),
      linha('1004_0_1', { isGround: true, classKey: turma, r: 'SALA-GROUND', b: 480, agendado: true })
    ];
    // A escala da tela pode ser a gravada antes da marca (o 1000 não a tem na linha): a marca vem do pino
    const fixos = { '1000_0_1': AGENDADO, '1002_0_1': { ...PINO, escolhido: true }, '1003_0_1': { ...PINO, a: 500, b: 560 } };
    assert.deepEqual(fixosAoAprovar(fixos, out), {
      '1000_0_1': AGENDADO, '1001_0_1': AGENDADO, '1002_0_1': { ...PINO, escolhido: true }, '1003_0_1': PINO,
      '1004_0_1': { a: 390, b: 480, r: 'SALA-GROUND', insId: 1, classKey: turma, agendado: true }
    });
  });

  it('Aprovar mantém o agendado que está fora da escala (o pedido tirado dela); os outros fixos fora dela saem, como antes', () => {
    const fixos = { '1000_0_1': AGENDADO, '1001_0_1': { ...AGENDADO, escolhido: true }, '1002_0_1': { ...PINO, escolhido: true }, '1003_0_1': PINO };
    const out = [{ fKey: '1004_0_1', classKey: '1004_0_1', isGround: false, a: 500, b: 560, r: 'PR-VOC', insId: 2 }];
    const PINO_DA_ESCALA = { a: 500, b: 560, r: 'PR-VOC', insId: 2 };
    assert.deepEqual(fixosAoAprovar(fixos, out), { '1000_0_1': AGENDADO, '1001_0_1': fixos['1001_0_1'], '1004_0_1': PINO_DA_ESCALA });
    assert.deepEqual(fixosAoAprovar(undefined, out), { '1004_0_1': PINO_DA_ESCALA });
    assert.deepEqual(fixosAoAprovar(fixos, []), { '1000_0_1': AGENDADO, '1001_0_1': fixos['1001_0_1'] });
  });

  it('sem agendados, Aprovar fixa o mesmo que antes: cada voo da escala, com a escolha do instrutor que o pino tinha', () => {
    // O código de antes, como estava em js/eventos/escala.js
    const comoAntes = (fixos, out) => Object.fromEntries(out.map(o => [o.fKey, { ...pino(o), ...((fixos || {})[o.fKey]?.escolhido ? { escolhido: true } : {}) }]));
    for (let seed = 2001; seed <= 2030; seed++) {
      const { out } = runAllocationEngine(gerarCenario(seed));
      const fixos = { ...Object.fromEntries(out.filter((o, i) => i % 3 === 0).map(o => [o.fKey, { ...pino(o), escolhido: true }])), '9999_0_1': { ...PINO, escolhido: true } };
      assert.deepEqual(fixosAoAprovar(fixos, out), comoAntes(fixos, out), `seed ${seed}`);
    }
  });

  it('com o motor: o agendado tirado da escala volta ao lugar dele depois da aprovação, e a reabertura não o solta', () => {
    // O agendamento: o Aluno 1000 às 10:10 no PR-VOB com o Instrutor 02 (o pedido dele prefere as 06:30)
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    const agendado = { a: 610, b: 670, r: 'PR-VOB', insId: 2, agendado: true };
    estado.fixos = { '1000_0_1': agendado };
    const doAluno1000 = r => doAluno(r.out, 1000);
    const antes = runAllocationEngine(estado);
    assert.deepEqual([doAluno1000(antes).a, doAluno1000(antes).agendado, antes.al], [610, true, []]);

    // Tirado da escala (Voa desligado) e a escala aprovada: o agendado continua nos voos fixos
    estado.stu[0].fly = false;
    const semEle = runAllocationEngine(estado);
    assert.equal(doAluno1000(semEle), undefined);
    estado.fixos = fixosAoAprovar(estado.fixos, semEle.out);
    estado.aprovacao = APROVACAO;
    assert.deepEqual(Object.keys(estado.fixos).sort(), ['1000_0_1', '1001_0_1']);

    // De volta à escala: no lugar do agendamento, com a marca, e o cadeado diz por quê
    estado.stu[0].fly = true;
    const voo = doAluno1000(runAllocationEngine(estado));
    assert.deepEqual([voo.a, voo.r, voo.insId, voo.fixo, voo.agendado, voo.conflito], [610, 'PR-VOB', 2, true, true, undefined]);
    assert.equal(motivoDoFixo(voo.fKey, { fStatus: {}, aprovacao: estado.aprovacao, voo, fixos: estado.fixos }), 'Voo fixo: agendado na escala');
    assert.equal(motivoDoFixo('1001_0_1', { fStatus: {}, aprovacao: estado.aprovacao, fixos: estado.fixos }), 'Voo fixo: escala aprovada');
    // Reabrir: o agendado continua fixo; o fixo só pela aprovação sai
    assert.deepEqual(fixosAoReabrir(estado.fixos, {}), { '1000_0_1': agendado });
  });

  it('o cadeado: o status primeiro, depois o agendamento, a escala aprovada e o instrutor escolhido', () => {
    const motivo = (pinoDoDia, { fStatus = {}, aprovacao = null } = {}) => motivoDoFixo('1000_0_1', { fStatus, aprovacao, voo: VOO, fixos: { '1000_0_1': pinoDoDia } });
    const AMBOS = { ...AGENDADO, escolhido: true };
    assert.equal(motivo(AMBOS, { fStatus: { '1000_0_1': 'Em Voo' }, aprovacao: APROVACAO }), 'Voo fixo: Em Voo');
    assert.equal(motivo(AMBOS, { aprovacao: APROVACAO }), 'Voo fixo: agendado na escala');
    assert.equal(motivo(AGENDADO), 'Voo fixo: agendado na escala');
    assert.equal(motivo({ ...PINO, escolhido: true }, { aprovacao: APROVACAO }), 'Voo fixo: escala aprovada');
    assert.equal(motivo({ ...PINO, escolhido: true }), 'Voo fixo: instrutor escolhido na escala');
    assert.equal(motivo(PINO), 'Voo fixo');
    assert.equal(motivoDoFixo('1000_0_1', { fStatus: {}, aprovacao: null }), 'Voo fixo');
  });

  it('semAgendados: sem chaves, tira todos os agendados; com chaves, só os delas; os outros voos fixos ficam', () => {
    const fixos = {
      '1000_0_1': AGENDADO, '1001_0_1': PINO, '1002_0_1': { ...PINO, escolhido: true }, '1003_0_1': { ...AGENDADO, escolhido: true }, '1004_1_1': AGENDADO
    };
    const copia = structuredClone(fixos);
    assert.deepEqual(semAgendados(fixos), { '1001_0_1': PINO, '1002_0_1': fixos['1002_0_1'] });
    assert.deepEqual(semAgendados(fixos, ['1004_1_1']), { '1000_0_1': AGENDADO, '1001_0_1': PINO, '1002_0_1': fixos['1002_0_1'], '1003_0_1': fixos['1003_0_1'] });
    // O agendado que também tinha o instrutor escolhido sai inteiro
    assert.equal(semAgendados(fixos, ['1003_0_1'])['1003_0_1'], undefined);
    // As chaves de voos fixos sem a marca: nada muda
    assert.deepEqual(semAgendados(fixos, ['1001_0_1', '1002_0_1', '1009_0_1']), fixos);
    assert.deepEqual(semAgendados(fixos, []), fixos);
    assert.deepEqual(semAgendados(undefined), {});
    assert.deepEqual(fixos, copia, 'os voos fixos de antes não mudam');
  });

  it('semAgendados com o status: o agendado em andamento, pousado ou cancelado continua fixo pelo status, só sem a marca', () => {
    const fixos = {
      '1000_0_1': AGENDADO, '1001_0_1': { ...AGENDADO, escolhido: true }, '1002_0_1': AGENDADO, '1003_0_1': AGENDADO, '1004_0_1': PINO
    };
    const fStatus = { '1000_0_1': 'Em Voo', '1001_0_1': 'Cancelado', '1002_0_1': 'Confirmado', '1004_0_1': 'Pousou' };
    const copia = structuredClone(fixos);
    // A demanda limpa: o agendado com um status que fixa fica como o fixo pelo status (com a escolha do instrutor, se tinha)
    assert.deepEqual(semAgendados(fixos, null, fStatus), { '1000_0_1': PINO, '1001_0_1': { ...PINO, escolhido: true }, '1004_0_1': PINO });
    assert.deepEqual(semAgendados(fixos, ['1000_0_1', '1002_0_1'], fStatus), { '1000_0_1': PINO, '1001_0_1': fixos['1001_0_1'], '1003_0_1': AGENDADO, '1004_0_1': PINO });
    for (const status of ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado']) {
      assert.deepEqual(semAgendados({ '1000_0_1': AGENDADO }, ['1000_0_1'], { '1000_0_1': status }), { '1000_0_1': PINO }, status);
    }
    for (const status of ['Pendente', 'Confirmado']) assert.deepEqual(semAgendados({ '1000_0_1': AGENDADO }, ['1000_0_1'], { '1000_0_1': status }), {}, status);
    assert.deepEqual(fixos, copia, 'os voos fixos de antes não mudam');
  });

  it('com o motor: o agendado com um status que fixa não sai do lugar quando a Demanda muda a missão, como o fixo pelo status', () => {
    for (const status of ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado']) {
      for (const agendado of [true, false]) {
        const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
        estado.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PR-VOB', insId: 2, ...(agendado ? { agendado: true } : {}) } };
        // O status na Escala mantém o pino (com a marca); depois, outra missão no pedido (eventos/demanda.js)
        estado.fixos = fixosAoMudarStatus(estado.fixos, doAluno(runAllocationEngine(estado).out, 1000), status, { aprovada: false });
        estado.fStatus = { '1000_0_1': status };
        estado.stu[0].mis = 'Navegação';
        estado.fixos = semAgendados(estado.fixos, ['1000_0_1'], estado.fStatus);
        const voo = doAluno(runAllocationEngine(estado).out, 1000);
        assert.deepEqual([voo.a, voo.r, voo.insId, voo.fixo, voo.agendado, voo.status], [610, 'PR-VOB', 2, true, undefined, status], `${status}, agendado: ${agendado}`);
      }
    }
  });

  it('o agendado com o instrutor escolhido que a Demanda solta: o pedido continua com o instrutor, e o motor também', () => {
    // O Aluno 1001 agendado às 10:10 e depois com o Instrutor 02 escolhido na Escala (o pedido guarda a escolha)
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000), aluno(1001, { insId: 2 })] });
    estado.fixos = { '1001_0_1': { a: 610, b: 670, r: 'PR-VOC', insId: 2, agendado: true, escolhido: true } };
    estado.fixos = semAgendados(estado.fixos, ['1001_0_1']);
    assert.deepEqual(estado.fixos, {});
    const voo = doAluno(runAllocationEngine(estado).out, 1001);
    assert.deepEqual([voo.insId, voo.insEscolhido, voo.fixo], [2, true, undefined]);
  });

  it('"Automático" no agendado com o instrutor escolhido: ele continua agendado, com o instrutor de agora, sem a marca da escolha', () => {
    // O app põe o Instrutor 02 (menos habilitações) no Aluno 1000 e o 01 no 1001, os dois às 08:20
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000), aluno(1001)] });
    const agendado = { ...pino(doAluno(runAllocationEngine(estado).out, 1001)), agendado: true };
    estado.fixos = { '1001_0_1': agendado };
    // O instrutor escolhido na Escala: o agendado leva também a marca da escolha
    escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    assert.deepEqual(estado.fixos, { '1001_0_1': { ...agendado, insId: 2, escolhido: true } });
    const { antes } = escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, null, { noLugar: true });
    assert.deepEqual([estado.fixos, estado.stu[1].insId], [{ '1001_0_1': { ...agendado, insId: 2 } }, undefined]);
    // Pela Demanda, também
    escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, null);
    assert.deepEqual(estado.fixos, { '1001_0_1': { ...agendado, insId: 2 } });
    // A reversão do "Automático" volta a escolha
    reverterEscolha(estado, antes);
    assert.deepEqual([estado.fixos, estado.stu[1].insId], [{ '1001_0_1': { ...agendado, insId: 2, escolhido: true } }, 2]);
  });

  it('reverter uma escolha não solta o voo agendado depois dela no mesmo lugar', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000), aluno(1001)] });
    const { antes } = escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    assert.deepEqual(antes.soltar, ['1001_0_1']);
    const agendado = { ...estado.fixos['1001_0_1'], agendado: true };
    delete agendado.escolhido;
    estado.fixos = { '1001_0_1': agendado };
    reverterEscolha(estado, antes);
    assert.deepEqual([estado.fixos, estado.stu[1].insId], [{ '1001_0_1': agendado }, undefined]);
  });
});

// A volta do noturno de ontem é uma linha fixa da escala (lida da véspera), não um voo fixo do dia: o agendamento não
// mexe nela. A aprovação, o status, a reabertura e a Demanda a tratam como antes (o pino da volta tem a chave da sessão
// 2, que o motor não lê)
describe('O voo agendado e a volta do noturno de ontem', () => {
  const volta = { stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290 };
  const PINO_DA_VOLTA = { a: 450, b: 510, r: 'PR-HAR', insId: 1 };
  const diaSeguinte = () => {
    const estado = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })],
      semAeronaves: apenas('C172', 'PR-HAR')
    });
    estado.noturnosDaVespera = [volta];
    estado.horasDosInstrutores = comRepousoDoNoturno({ 1: { mes: 0, semestre: 0, ano: 0, fimAnterior: 1290 } }, [volta]);
    return estado;
  };
  const daVolta = out => out.find(o => o.trecho === 'volta');

  it('Aprovar fixa a volta como antes, sem marca, ao lado do voo agendado; o motor não lê o pino dela', () => {
    const estado = diaSeguinte();
    estado.fixos = { '1001_0_1': { a: 610, b: 670, r: 'PR-VOB', insId: 2, agendado: true } };
    const res = runAllocationEngine(estado);
    const linha = daVolta(res.out);
    assert.deepEqual([linha.fKey, linha.fixo, Object.hasOwn(linha, 'agendado')], ['1000_0_2', true, false]);
    const aprovados = fixosAoAprovar(estado.fixos, res.out);
    assert.deepEqual(Object.keys(aprovados).sort(), res.out.map(o => o.fKey).sort());
    assert.deepEqual([aprovados['1000_0_2'], aprovados['1001_0_1']], [PINO_DA_VOLTA, estado.fixos['1001_0_1']]);
    const aprovada = runAllocationEngine({ ...estado, fixos: aprovados });
    assert.deepEqual(daVolta(aprovada.out), linha);
    assert.deepEqual(aprovada.al.filter(a => a.t === 'conf'), []);
    // Só o pino da volta não muda a escala
    assert.deepEqual(runAllocationEngine({ ...estado, fixos: { ...estado.fixos, '1000_0_2': PINO_DA_VOLTA } }), res);
  });

  it('o status, a reabertura e a Demanda (semAgendados) tratam a volta como antes', () => {
    const estado = diaSeguinte();
    const res = runAllocationEngine(estado);
    const linha = daVolta(res.out);
    // O status de andamento fixa a volta; Confirmado a solta fora da escala aprovada
    const emVoo = fixosAoMudarStatus({}, linha, 'Em Voo', { aprovada: false });
    assert.deepEqual(emVoo, { '1000_0_2': PINO_DA_VOLTA });
    assert.deepEqual(fixosAoMudarStatus(emVoo, linha, 'Confirmado', { aprovada: false }), {});
    // A demanda limpa e o pedido do aluno mudado não tiram o pino da volta
    const aprovados = fixosAoAprovar({}, res.out);
    assert.deepEqual(semAgendados(aprovados), aprovados);
    assert.deepEqual(semAgendados(aprovados, ['1000_0_1', '1000_0_2']), aprovados);
    // Reabrir: a volta sai com os outros fixos pela aprovação, menos com um status que fixa
    assert.equal(Object.hasOwn(fixosAoReabrir(aprovados, {}), '1000_0_2'), false);
    assert.deepEqual(fixosAoReabrir(aprovados, { '1000_0_2': 'Pousou' }), { '1000_0_2': PINO_DA_VOLTA });
    assert.equal(motivoDoFixo('1000_0_2', { fStatus: {}, aprovacao: null, voo: linha, fixos: aprovados }), 'Voo fixo');
  });
});

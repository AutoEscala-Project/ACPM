// O instrutor escolhido pelo operador: na Demanda (o pedido do dia leva o instrutor, e o motor encaixa o voo com ele)
// e na Escala (o voo fica onde está, fixo, com o instrutor escolhido). O que o operador define vale mais que a escolha
// do app.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { escolherInstrutor, instrutoresDoPedido, instrutoresDoVoo } from '../../js/instrutor-escolhido.js';
import { motivoDoFixo } from '../../js/fixos.js';
import { validarReversao } from '../../js/reversoes.js';
import { normalizeMissionFields } from '../../js/rules.js';
import { separar, juntar } from '../../js/dias.js';
import { normalizarLinhaGravada } from '../../js/escala-gravada.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { aluno, apenas, cenario, instrutor, missaoExtra, GROUND_C152 } from '../helpers/montar.js';
import { gerarCenario, comEscolhas } from '../helpers/cenarios.js';
import { ApiClient } from '../../js/storage.js';

const SO_PP_LJV = apenas('C152', 'PP-LJV');
const semCompactar = estado => runAllocationEngine(estado, { compactar: false });
const resumo = o => [o.s, o.a, o.insId];

describe('Instrutor escolhido na Demanda: o motor encaixa o voo com ele', () => {
  it('o voo sai com o instrutor escolhido, não com o que o app escolheria', () => {
    const ins = [instrutor(1, 9), instrutor(2, 1)];
    assert.equal(runAllocationEngine(cenario({ ins, stu: [aluno(1000)] })).out[0].insId, 2, 'sem escolha: o que tem menos habilitações');
    const { out, al } = runAllocationEngine(cenario({ ins, stu: [aluno(1000, { insId: 1 })] }));
    assert.deepEqual(al, []);
    assert.deepEqual([out[0].insId, out[0].insEscolhido, out[0].tag], [1, true, 'Pref. 1']);
  });

  it('o pedido com o instrutor escolhido vem antes dos outros, mesmo os de prioridade maior', () => {
    // Um avião só: o pedido com a escolha fica com a 1ª preferência
    const { out } = semCompactar(cenario({ ins: [instrutor(1, 1), instrutor(2, 1)], stu: [aluno(1000, { pr: 5 }), aluno(1001, { pr: 1, insId: 2 })], semAeronaves: SO_PP_LJV }));
    assert.deepEqual(out.map(o => [o.s, o.insId, o.tag]), [['Aluno 1001', 2, 'Pref. 1'], ['Aluno 1000', 1, 'Pref. 2']]);
  });

  it('com o escolhido ocupado na preferência, o voo vai para outro horário com ele (o outro instrutor livre não entra)', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, { insId: 1 }), aluno(1001, { insId: 1 })] });
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual(al, []);
    assert.deepEqual(out.map(resumo), [['Aluno 1000', 500, 1], ['Aluno 1001', 610, 1]]);
  });

  it('a divisão das horas e a compactação não trocam o instrutor escolhido', () => {
    // Sem a escolha, a divisão das horas passa um dos dois voos para o instrutor 2
    const ins = [instrutor(1, 1), instrutor(2, 9)];
    const stu = escolha => [aluno(1000, { p1: 390, ...escolha }), aluno(1001, { p1: 500, ...escolha })];
    assert.deepEqual(runAllocationEngine(cenario({ ins, stu: stu({}) })).out.map(o => o.insId).sort(), [1, 2]);
    assert.deepEqual(runAllocationEngine(cenario({ ins, stu: stu({ insId: 1 }) })).out.map(o => o.insId), [1, 1]);
  });

  it('a missão extra tem o seu próprio instrutor escolhido', () => {
    const extra = missaoExtra(1, { p1: 4, insId: 1 });
    const { out } = runAllocationEngine(cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, {}, { extra: [extra] })] }));
    assert.deepEqual(out.map(o => [o.mid, o.insId, Boolean(o.insEscolhido)]), [[0, 2, false], [1, 1, true]]);
  });

  it('o escolhido que não pode voar o pedido em nenhum horário: o pedido fica fora, com o motivo', () => {
    const caso = (ins, pedido = {}, extra = {}) => runAllocationEngine(cenario({ ins: [ins, instrutor(2, 9)], stu: [aluno(1000, { insId: 1, ...pedido }, extra)] }));
    const motivo = r => [r.out.length, r.al.map(a => [a.codigo, a.m])];
    assert.deepEqual(motivo(caso(instrutor(1, 9, { on: false }))), [0, [['instrutor-escolhido', 'Rejeitado: o instrutor escolhido (Instrutor 01) não está disponível nesta data.']]]);
    assert.deepEqual(motivo(caso(instrutor(1, 9, { hab: ['grounds'] }))), [0, [['instrutor-escolhido', 'Rejeitado: o instrutor escolhido (Instrutor 01) não tem a habilitação de Voo Local no C152 (Voo Local + C152).']]]);
    assert.deepEqual(motivo(caso(instrutor(1, 9), {}, { bl: [1] })), [0, [['instrutor-escolhido', 'Rejeitado: o instrutor escolhido (Instrutor 01) está em “Não escalar com” deste aluno.']]]);
    assert.deepEqual(motivo(caso(instrutor(1, 9), { insId: 99 })), [0, [['instrutor-escolhido', 'Rejeitado: o instrutor escolhido saiu do cadastro.']]]);
    assert.deepEqual(motivo(caso(instrutor(1, 9, { aw: Array(9).fill(false) }))),
      [0, [['instrutores-indisponiveis', 'Rejeitado: o instrutor escolhido (Instrutor 01) não está disponível durante o voo inteiro nos horários possíveis.']]]);
  });

  it('Ground: o aluno com o instrutor escolhido só entra na turma dele; quem não escolheu entra em qualquer uma', () => {
    const { out, al } = runAllocationEngine(cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { ...GROUND_C152, insId: 1 }), aluno(1001, { ...GROUND_C152, insId: 2 }), aluno(1002, GROUND_C152)]
    }));
    assert.deepEqual(al, []);
    // Uma sala só: a turma do instrutor 2 vai para a 2ª preferência
    assert.deepEqual(out.map(o => [o.s, o.a, o.insId, o.groupSize]), [['Aluno 1000', 500, 1, 2], ['Aluno 1002', 500, 1, 2], ['Aluno 1001', 610, 2, 1]]);
  });
});

describe('Instrutor escolhido na Escala: o voo fica onde está', () => {
  // Dois voos às 08:20: o app põe o instrutor 2 (menos habilitações) no primeiro e o 1 no segundo
  const doisVoos = (extra = {}) => cenario({ ins: [instrutor(1, 9), instrutor(2, 1), instrutor(3, 9, { on: false })], stu: [aluno(1000), aluno(1001)], ...extra });

  it('fixa o voo no horário e no avião dele, com o instrutor novo, e refaz o resto em volta', () => {
    const estado = doisVoos();
    const antes = runAllocationEngine(estado);
    assert.deepEqual(antes.out.map(resumo), [['Aluno 1000', 500, 2], ['Aluno 1001', 500, 1]]);
    const voo = antes.out.find(o => o.stuId === 1001);
    const r = escolherInstrutor(estado, antes, { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    assert.deepEqual(r, { antes: { pedidos: [{ stuId: 1001, mid: 0, insId: 0 }], fixos: {}, soltar: ['1001_0_1'] }, alunos: 1 });
    assert.equal(estado.stu[1].insId, 2);
    assert.deepEqual(estado.fixos, { '1001_0_1': { a: 500, b: 560, r: voo.r, insId: 2 } });

    const depois = runAllocationEngine(estado);
    assert.deepEqual(depois.al, []);
    assert.deepEqual(depois.out.map(resumo), [['Aluno 1000', 500, 1], ['Aluno 1001', 500, 2]]);
    const fixo = depois.out.find(o => o.stuId === 1001);
    assert.deepEqual([fixo.fixo, fixo.insEscolhido, fixo.r], [true, true, voo.r]);
    assert.equal(motivoDoFixo(fixo.fKey, { fStatus: {}, aprovacao: null, voo: fixo }), 'Voo fixo: instrutor escolhido na escala');
    assert.equal(motivoDoFixo(fixo.fKey, { fStatus: {}, aprovacao: { em: '2026-11-17T10:00:00Z' }, voo: fixo }), 'Voo fixo: escala aprovada');
  });

  it('o instrutor que não serve no horário pode ser escolhido: o voo fica fixo, em conflito', () => {
    const estado = doisVoos();
    escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, 3, { noLugar: true });
    const { out, al } = runAllocationEngine(estado);
    const fixo = out.find(o => o.stuId === 1001);
    assert.deepEqual([fixo.insId, fixo.conflitoCodigos], [3, ['instrutor-indisponivel']]);
    assert.equal(al.filter(a => a.t === 'conf').length, 1);
  });

  it('as opções do voo: os que servem primeiro; os outros com o motivo', () => {
    const estado = doisVoos();
    const res = runAllocationEngine(estado);
    assert.deepEqual(instrutoresDoVoo(estado, res, '1000_0_1'), [
      { id: 2, nm: 'Instrutor 02', nota: '' }, { id: 1, nm: 'Instrutor 01', nota: 'ocupado com Aluno 1001' }, { id: 3, nm: 'Instrutor 03', nota: 'indisponível' }
    ]);
    assert.deepEqual(instrutoresDoVoo(estado, res, '9_0_1'), []);
  });

  it('"Automático" solta o voo fixado pela escolha; com a escala aprovada ou o status, o voo continua fixo', () => {
    const estado = doisVoos();
    escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    const r = escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1001, mid: 0 }, null, { noLugar: true });
    assert.deepEqual([estado.fixos, estado.stu[1].insId], [{}, undefined]);
    assert.deepEqual(r.antes.pedidos, [{ stuId: 1001, mid: 0, insId: 2 }]);
    assert.equal(r.antes.fixos['1001_0_1'].insId, 2);

    const aprovada = doisVoos();
    escolherInstrutor(aprovada, runAllocationEngine(aprovada), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    aprovada.aprovacao = { em: '2026-11-17T10:00:00Z', por: '' };
    escolherInstrutor(aprovada, runAllocationEngine(aprovada), { stuId: 1001, mid: 0 }, null, { noLugar: true });
    assert.deepEqual([Object.keys(aprovada.fixos), aprovada.fixos['1001_0_1'].insId, aprovada.stu[1].insId], [['1001_0_1'], 2, undefined]);

    const emVoo = doisVoos({ fStatus: { '1001_0_1': 'Em Voo' } });
    escolherInstrutor(emVoo, runAllocationEngine(emVoo), { stuId: 1001, mid: 0 }, 2, { noLugar: true });
    escolherInstrutor(emVoo, runAllocationEngine(emVoo), { stuId: 1001, mid: 0 }, null, { noLugar: true });
    assert.deepEqual(Object.keys(emVoo.fixos), ['1001_0_1']);
  });

  it('na Demanda, só o pedido muda; o voo que já é fixo fica onde está, com o instrutor novo', () => {
    const estado = doisVoos();
    const r = escolherInstrutor(estado, runAllocationEngine(estado), { stuId: 1000, mid: 0 }, 1);
    assert.deepEqual([estado.stu[0].insId, estado.fixos, r.alunos], [1, undefined, 1]);

    const comFixo = doisVoos();
    const res = runAllocationEngine(comFixo);
    const pino = { a: 500, b: 560, r: res.out[0].r, insId: 2 };
    comFixo.fixos = { '1000_0_1': pino };
    escolherInstrutor(comFixo, runAllocationEngine(comFixo), { stuId: 1000, mid: 0 }, 1);
    assert.deepEqual(comFixo.fixos, { '1000_0_1': { ...pino, insId: 1 } });
  });

  it('na turma de Ground, a escolha muda a turma inteira (os pedidos e os voos fixos)', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, GROUND_C152), aluno(1001, GROUND_C152)] });
    const res = runAllocationEngine(estado);
    assert.equal(new Set(res.out.map(o => o.classKey)).size, 1);
    const outro = res.out[0].insId === 1 ? 2 : 1;
    const r = escolherInstrutor(estado, res, { stuId: 1001, mid: 0 }, outro, { noLugar: true });
    assert.equal(r.alunos, 2);
    assert.deepEqual(estado.stu.map(s => s.insId), [outro, outro]);
    assert.deepEqual(Object.values(estado.fixos).map(p => [p.insId, p.classKey]), [[outro, res.out[0].classKey], [outro, res.out[0].classKey]]);
    const depois = runAllocationEngine(estado);
    assert.deepEqual([depois.al, depois.out.map(o => [o.insId, o.groupSize])], [[], [[outro, 2], [outro, 2]]]);
  });

  it('as opções da Demanda: os habilitados, sem os de "Não escalar com"; quem não vem na data, marcado', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { hab: ['grounds'] }), instrutor(3, 9, { on: false }), instrutor(4, 9)] });
    const s = aluno(1000, {}, { bl: [4] });
    assert.deepEqual(instrutoresDoPedido(estado, s, s), [{ id: 1, nm: 'Instrutor 01', nota: '' }, { id: 3, nm: 'Instrutor 03', nota: 'fora nesta data' }]);
    // O escolhido continua na lista mesmo quando não serve mais (com o motivo), ou quando saiu do cadastro
    assert.deepEqual(instrutoresDoPedido(estado, s, { ...s, insId: 4 }).map(o => [o.id, o.nota]), [[1, ''], [3, 'fora nesta data'], [4, 'em Não escalar com']]);
    assert.deepEqual(instrutoresDoPedido(estado, s, { ...s, insId: 99 })[0], { id: 99, nm: 'Instrutor fora do cadastro', nota: '' });
  });
});

describe('Voa com: os instrutores do aluno (o par permanente do cadastro)', () => {
  const avisos = al => al.filter(a => a.codigo === 'voa-com').map(a => a.m);

  it('o aluno voa com o instrutor dele, não com o que o app escolheria, e sem aviso', () => {
    const { out, al } = runAllocationEngine(cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, {}, { voaCom: [1] })] }));
    assert.deepEqual([out.map(o => [o.insId, o.insPar, o.tag]), al], [[[1, true, 'Pref. 1']], []]);
  });

  it('com o instrutor dele ocupado na preferência, o aluno vai para outro horário com ele', () => {
    // O Aluno 1001 escolheu o Instrutor 01 para o dia: vai antes e fica com as 08:20
    const { out, al } = semCompactar(cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, {}, { voaCom: [1] }), aluno(1001, { insId: 1 })] }));
    assert.deepEqual(avisos(al), []);
    assert.deepEqual(out.map(o => [o.s, o.a, o.insId]), [['Aluno 1001', 500, 1], ['Aluno 1000', 610, 1]]);
  });

  it('com dois instrutores no “Voa com”, qualquer um deles', () => {
    const { out } = runAllocationEngine(cenario({ ins: [instrutor(1, 9), instrutor(2, 1), instrutor(3, 9)], stu: [aluno(1000, {}, { voaCom: [3, 1] }), aluno(1001, {}, { voaCom: [3, 1] })] }));
    assert.deepEqual(out.map(o => o.insId).sort(), [1, 3]);
  });

  it('o instrutor escolhido para o dia vale mais que o “Voa com”', () => {
    const { out, al } = runAllocationEngine(cenario({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, { insId: 2 }, { voaCom: [1] })] }));
    assert.deepEqual([out.map(o => [o.insId, Boolean(o.insEscolhido), Boolean(o.insPar)]), avisos(al)], [[[2, true, false]], []]);
  });

  it('quando nenhum instrutor do “Voa com” pode, o voo fica com outro e a escala avisa, com o motivo', () => {
    const caso = (ins1, extra = {}, pedido = {}) => runAllocationEngine(cenario({ ins: [ins1, instrutor(2, 9)], stu: [aluno(1000, pedido, { voaCom: [1], ...extra })] }));
    const resumo = r => [r.out.map(o => [o.insId, Boolean(o.insPar)]), avisos(r.al), r.al.filter(a => a.codigo === 'voa-com').map(a => [a.stuId, a.insId])];
    assert.deepEqual(resumo(caso(instrutor(1, 9, { on: false }))),
      [[[2, false]], ['Sem o instrutor de “Voa com” (Instrutor 01: fora nesta data): o voo ficou com Instrutor 02.'], [[1000, 2]]]);
    assert.deepEqual(avisos(caso(instrutor(1, 9, { hab: ['grounds'] })).al), ['Sem o instrutor de “Voa com” (Instrutor 01: sem a habilitação da missão): o voo ficou com Instrutor 02.']);
    assert.deepEqual(avisos(caso(instrutor(1, 9, { aw: Array(9).fill(false) })).al), ['Sem o instrutor de “Voa com” (Instrutor 01: indisponível nos horários possíveis): o voo ficou com Instrutor 02.']);
    assert.deepEqual(avisos(caso(instrutor(1, 9, { kg: 150 }), { kg: 100 }).al), ['Sem o instrutor de “Voa com” (Instrutor 01: peso acima do limite do avião): o voo ficou com Instrutor 02.']);
    // Fora do cadastro, o “Voa com” não conta
    assert.deepEqual(resumo(caso(instrutor(1, 9), { voaCom: [99] })), [[[1, false]], [], []]);
  });

  it('o aviso não aparece quando o voo nem entra na escala (a rejeição diz o motivo)', () => {
    const { out, al } = runAllocationEngine(cenario({ ins: [instrutor(1, 9, { on: false }), instrutor(2, 9)], stu: [aluno(1000, {}, { voaCom: [1] })], semAeronaves: apenas('C152') }));
    assert.deepEqual([out.length, avisos(al), al.map(a => a.codigo)], [0, [], ['sem-aviao']]);
  });

  it('Ground: o aluno entra na turma do instrutor dele; sem ela, em outra, com aviso', () => {
    const { out, al } = runAllocationEngine(cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { ...GROUND_C152, insId: 2 }), aluno(1001, GROUND_C152, { voaCom: [1] }), aluno(1002, GROUND_C152, { voaCom: [2] })]
    }));
    assert.deepEqual(avisos(al), []);
    assert.deepEqual(out.map(o => [o.s, o.a, o.insId]), [['Aluno 1000', 500, 2], ['Aluno 1002', 500, 2], ['Aluno 1001', 610, 1]]);
    const semSala = runAllocationEngine(cenario({ ins: [instrutor(1, 9, { on: false }), instrutor(2, 9)], stu: [aluno(1000, GROUND_C152), aluno(1001, GROUND_C152, { voaCom: [1] })] }));
    assert.deepEqual(avisos(semSala.al), ['Sem o instrutor de “Voa com” (Instrutor 01: fora nesta data): o voo ficou com Instrutor 02.']);
    assert.deepEqual(semSala.out.map(o => o.groupSize), [2, 2]);
  });

  it('a divisão das horas e a compactação não trocam o instrutor do “Voa com”', () => {
    const ins = [instrutor(1, 1), instrutor(2, 9)];
    const stu = extra => [aluno(1000, { p1: 390 }, extra), aluno(1001, { p1: 500 }, extra)];
    assert.deepEqual(runAllocationEngine(cenario({ ins, stu: stu({}) })).out.map(o => o.insId).sort(), [1, 2]);
    assert.deepEqual(runAllocationEngine(cenario({ ins, stu: stu({ voaCom: [1] }) })).out.map(o => o.insId), [1, 1]);
  });

  // Achado pela busca em cenários aleatórios: o voo que ficou sem o “Voa com” e que a divisão das horas leva para um
  // instrutor do “Voa com” fica marcado e sem aviso (o aviso diria o instrutor errado)
  it('o voo que a divisão das horas leva para o instrutor do “Voa com” não tem aviso', () => {
    const estado = comEscolhas(gerarCenario(3691), 3691);
    const antes = runAllocationEngine(estado, { compactar: false, dividirHoras: false });
    const depois = runAllocationEngine(estado);
    const paresDe = o => estado.stu.find(s => s.id === o.stuId).voaCom || [];
    const levados = depois.out.filter(o => { const a = antes.out.find(v => v.fKey === o.fKey); return a && paresDe(o).includes(o.insId) && !paresDe(a).includes(a.insId); });
    assert.ok(levados.length > 0);
    for (const o of levados) {
      assert.equal(o.insPar, true);
      assert.ok(!depois.al.some(a => a.codigo === 'voa-com' && a.stuId === o.stuId && a.insId === o.insId), o.fKey);
    }
  });
});

describe('Instrutor escolhido nos dados', () => {
  it('o pedido guarda só um id de instrutor válido', () => {
    const pedido = v => { const p = { mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, insId: v }; normalizeMissionFields(p); return p.insId; };
    assert.deepEqual([pedido(3), pedido(0), pedido('3'), pedido(1.5), pedido(null)], [3, undefined, undefined, undefined, undefined]);
  });

  it('o instrutor escolhido vai com o pedido do dia (também na missão extra)', () => {
    const estado = cenario({ stu: [aluno(1000, { insId: 1 }, { extra: [missaoExtra(1, { insId: 2 })] }), aluno(1001)] });
    const { cadastro, dia } = separar(estado);
    assert.deepEqual([dia.pedidos[1000].insId, dia.pedidos[1000].extra[0].insId, Object.hasOwn(dia.pedidos[1001], 'insId')], [1, 2, false]);
    const junto = juntar(cadastro, dia);
    assert.deepEqual([junto.stu[0].insId, junto.stu[0].extra[0].insId], [1, 2]);
  });

  it('a escala gravada guarda as marcas do instrutor escolhido e do “Voa com”', () => {
    assert.deepEqual(normalizarLinhaGravada({ fKey: '1000_0_1', insEscolhido: true, insPar: true }), { fKey: '1000_0_1', insEscolhido: true, insPar: true });
    assert.equal(normalizarLinhaGravada({ fKey: '1000_0_1', insEscolhido: 'sim' }), null);
    assert.equal(normalizarLinhaGravada({ fKey: '1000_0_1', insPar: 1 }), null);
  });

  it('ao abrir, o “Voa com” fica só com ids, sem repetir e sem os de “Não escalar com”; o instrutor do pedido, só um id', () => {
    const estado = ApiClient.createFreshState();
    const pedido = { fly: true, mis: 'Voo Local', eq: 'C152', p1: 500, p2: -1, nb: 1, ss: 1, pr: 3 };
    estado.stu = [
      { id: 1000, nm: 'A', kg: 70, bl: [3], voaCom: [1, 1, 'x', 3, 2.5, -4, 2], ...pedido, insId: 2, extra: [{ mid: 1, ...pedido, insId: 'x' }] },
      { id: 1001, nm: 'B', kg: 70, bl: [], voaCom: ['x'], ...pedido, insId: 0, extra: [] },
      { id: 1002, nm: 'C', kg: 70, bl: [], voaCom: 'x', ...pedido, extra: [] }
    ];
    const x = ApiClient.normalizeAndMigrateState(estado);
    assert.deepEqual(x.stu.map(s => [s.voaCom, s.insId, (s.extra[0] || {}).insId]), [[[1, 2], 2, undefined], [undefined, undefined, undefined], [undefined, undefined, undefined]]);
  });

  it('o “Voa com” vai com o cadastro do aluno (só quando há)', () => {
    const estado = cenario({ stu: [aluno(1000, {}, { voaCom: [2, 1] }), aluno(1001)] });
    const { cadastro, dia } = separar(estado);
    assert.deepEqual(cadastro.stu.map(s => s.voaCom), [[2, 1], undefined]);
    assert.deepEqual(juntar(cadastro, dia).stu.map(s => s.voaCom), [[2, 1], undefined]);
  });

  it('a reversão devolve os pedidos e os voos fixos de antes; fora do formato, não vale', () => {
    const rev = { kind: 'restaurarEscolha', pedidos: [{ stuId: 1000, mid: 0, insId: 0 }, { stuId: 1001, mid: 2, insId: 3 }], fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, soltar: ['1001_2_1'], label: '↶ Reverter' };
    assert.deepEqual(validarReversao(rev, FROTA_INICIAL), rev);
    for (const ruim of [{ ...rev, pedidos: [] }, { ...rev, pedidos: [{ stuId: 1000, mid: 0, insId: -1 }] }, { ...rev, soltar: ['x'] }, { ...rev, soltar: undefined }]) {
      assert.equal(validarReversao(ruim, FROTA_INICIAL), null, JSON.stringify(ruim));
    }
  });
});

// Os candidatos para um voo num horário (js/candidatos.js): a ocupação da escala, os recursos e os instrutores, cada
// um com o motivo de não servir, na ordem das Sugestões para um conflito (js/reparo.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ocupacaoDaEscala, problemaDoRecurso, avioesQueServem, instrutoresQueServem } from '../../js/candidatos.js';
import { TEXTO_DO_PROBLEMA } from '../../js/conflitos.js';
import { runAllocationEngine } from '../../js/engine.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';

// Uma linha da escala, só com o que a ocupação usa: Voo Local de 1 h no PR-VOB às 06:30, com o instrutor 1
const linha = (fKey, campos = {}) => ({
  fKey, stuId: +fKey.split('_')[0], a: 390, b: 450, h: 1, r: 'PR-VOB', insId: 1, eqType: 'C152', isGround: false, mis: 'Voo Local', s: `Aluno ${fKey.split('_')[0]}`, ...campos
});
const intervalos = voos => (voos || []).map(o => [o.a, o.b]);

describe('Candidatos: a ocupação da escala', () => {
  it('o voo cancelado não ocupa nada (pelo status do dia ou pelo da linha)', () => {
    const out = [linha('1000_0_1'), linha('1001_0_1', { r: 'PR-VOC', insId: 2 }), linha('1002_0_1', { r: 'PR-VOI', insId: 3, status: 'Cancelado' })];
    const ocupacao = ocupacaoDaEscala(out, { fStatus: { '1001_0_1': 'Cancelado' } });
    assert.deepEqual([...ocupacao.recursos.keys()], ['PR-VOB']);
    assert.deepEqual([...ocupacao.instrutores.keys()], [1]);
    assert.deepEqual([...ocupacao.alunos.keys()], [1000]);
  });

  it('a turma de Ground ocupa a sala e o instrutor uma vez só; cada aluno dela, o horário dele', () => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { ...GROUND_C152, p1: 500, p2: -1 }), aluno(1001, { ...GROUND_C152, p1: 500, p2: -1 })] });
    const { out } = runAllocationEngine(estado);
    assert.equal(new Set(out.map(o => o.classKey)).size, 1, 'uma turma com os dois alunos');
    const ocupacao = ocupacaoDaEscala(out);
    assert.deepEqual(intervalos(ocupacao.recursos.get('SALA-GROUND')), [[500, 590]]);
    assert.deepEqual(intervalos(ocupacao.instrutores.get(1)), [[500, 590]]);
    assert.deepEqual([1000, 1001].map(id => intervalos(ocupacao.alunos.get(id))), [[[500, 590]], [[500, 590]]]);
  });

  it('efetivo: o voo atrasado ocupa o horário novo (também em voo); sem ele, o marcado, como nas Sugestões', () => {
    const out = [linha('1000_0_1')];
    const fObs = { '1000_0_1': { novoInicio: 420 } };
    const atrasado = { fStatus: { '1000_0_1': 'Atrasado' }, fObs };
    assert.deepEqual(intervalos(ocupacaoDaEscala(out, atrasado).recursos.get('PR-VOB')), [[390, 450]]);
    const efetiva = ocupacaoDaEscala(out, { ...atrasado, efetivo: true });
    assert.deepEqual([efetiva.recursos.get('PR-VOB'), efetiva.instrutores.get(1), efetiva.alunos.get(1000)].map(intervalos), [[[420, 480]], [[420, 480]], [[420, 480]]]);
    assert.deepEqual(intervalos(ocupacaoDaEscala(out, { fStatus: { '1000_0_1': 'Em Voo' }, fObs, efetivo: true }).recursos.get('PR-VOB')), [[420, 480]]);
    assert.deepEqual(intervalos(ocupacaoDaEscala(out, { fStatus: { '1000_0_1': 'Confirmado' }, fObs, efetivo: true }).recursos.get('PR-VOB')), [[390, 450]], 'sem atraso, o horário marcado');
    assert.equal(out[0].a, 390, 'a escala não muda');
  });

  it('soFixos: só os voos fixos contam; exceto: as chaves que não contam', () => {
    const out = [linha('1000_0_1', { fixo: true }), linha('1001_0_1', { r: 'PR-VOC', insId: 2 }), linha('1002_0_1', { r: 'PR-VOI', insId: 3, fixo: true })];
    assert.deepEqual([...ocupacaoDaEscala(out).recursos.keys()], ['PR-VOB', 'PR-VOC', 'PR-VOI']);
    assert.deepEqual([...ocupacaoDaEscala(out, { soFixos: true }).recursos.keys()], ['PR-VOB', 'PR-VOI']);
    assert.deepEqual([...ocupacaoDaEscala(out, { exceto: ['1000_0_1'] }).instrutores.keys()], [2, 3]);
    assert.deepEqual([...ocupacaoDaEscala(out, { soFixos: true, exceto: new Set(['1002_0_1']) }).alunos.keys()], [1000]);
  });
});

describe('Candidatos: os recursos', () => {
  // Oito C152 (o PR-JPL só para o Parafuso) e um C172; o hangar do PR-GGG (na frente) ao PR-AAA
  const frota = ['PR-AAA', 'PR-BBB', 'PR-CCC', 'PR-DDD', 'PR-EEE', 'PR-FFF', 'PR-GGG'].map(reg => ({ reg, tipo: 'C152' }));
  const estado = {
    ...cenario(),
    frota: [...frota, { reg: 'PR-JPL', tipo: 'C152', soParafuso: true }, { reg: 'PR-HHH', tipo: 'C172' }],
    hangar: ['PR-GGG', 'PR-DDD', 'PR-FFF', 'PR-EEE', 'PR-CCC', 'PR-BBB', 'PR-AAA'],
    av: { 'PR-AAA': true, 'PR-BBB': true, 'PR-CCC': true, 'PR-DDD': true, 'PR-EEE': false, 'PR-FFF': true, 'PR-GGG': true, 'PR-JPL': true, 'PR-HHH': true },
    horas: { 'PR-FFF': 49.5 }
  };
  // O voo é das 10:10 às 11:10. O PR-AAA voa até as 09:10 (folga de 1 h), o PR-BBB a partir das 11:10 (encosta: folga
  // 0) e o PR-CCC das 10:30 às 11:30 (ocupado); o PR-EEE está em manutenção e o PR-FFF, a meia hora da revisão
  const ocupacao = ocupacaoDaEscala([
    linha('1000_0_1', { r: 'PR-AAA', a: 490, b: 550 }), linha('1001_0_1', { r: 'PR-BBB', a: 670, b: 730 }), linha('1002_0_1', { r: 'PR-CCC', a: 630, b: 690 })
  ]);
  const voo = { tipo: 'C152', mis: 'Voo Local', a: 610, b: 670 };

  it('os que servem primeiro: um que já saiu, com a menor folga, e depois o da frente do hangar', () => {
    const lista = avioesQueServem(estado, ocupacao, voo);
    assert.deepEqual(lista.filter(c => !c.problema).map(c => [c.r, c.folga]), [['PR-BBB', 0], ['PR-AAA', 60], ['PR-GGG', Infinity], ['PR-DDD', Infinity]]);
    assert.ok(lista.findIndex(c => c.problema) === lista.filter(c => !c.problema).length, 'os que não servem vêm depois');
    assert.ok(!lista.some(c => c.r === 'PR-HHH'), 'só o tipo do voo');
  });

  it('o motivo de cada um que não serve: manutenção, outro voo (qual), a revisão de 50 horas e o Parafuso', () => {
    const problemas = Object.fromEntries(avioesQueServem(estado, ocupacao, voo).filter(c => c.problema).map(c => [c.r, c.problema.codigo]));
    assert.deepEqual(problemas, { 'PR-CCC': 'aviao-ocupado', 'PR-EEE': 'aviao-indisponivel', 'PR-FFF': 'revisao', 'PR-JPL': 'so-parafuso' });
    assert.equal(problemaDoRecurso(estado, ocupacao, 'PR-CCC', voo).voo.fKey, '1002_0_1', 'o voo que ocupa');
    assert.equal(problemaDoRecurso(estado, ocupacao, 'PR-CCC', { a: 690, b: 750 }), null, 'encostar não conta');
    // O Parafuso só no PR-JPL
    const parafuso = avioesQueServem(estado, ocupacao, { ...voo, mis: 'Parafuso' });
    assert.deepEqual(parafuso.filter(c => !c.problema).map(c => c.r), ['PR-JPL']);
    assert.ok(parafuso.filter(c => c.problema).every(c => c.problema.codigo === 'so-parafuso' || c.r === 'PR-EEE'));
  });

  it('a sala de Ground: ocupada por outra turma no horário (sala-ocupada); nunca em manutenção', () => {
    const turma = ocupacaoDaEscala([linha('1003_0_1', { r: 'SALA-GROUND', isGround: true, classKey: '1003_0_1', eqType: 'Sala Ground', a: 500, b: 590, h: 1.5 })]);
    const sala = (a, b) => avioesQueServem(estado, turma, { tipo: 'Sala Ground', mis: 'Ground C152', a, b, ground: true }).map(c => [c.r, c.problema && c.problema.codigo]);
    assert.deepEqual(sala(500, 590), [['SALA-GROUND', 'sala-ocupada']]);
    assert.deepEqual(sala(610, 700), [['SALA-GROUND', null]]);
  });
});

describe('Candidatos: os instrutores', () => {
  // O aluno pesa 110 kg; no C152 (170 kg), o instrutor de 60 kg voa com o tanque cheio e o de 80 kg com 8 gal a menos
  const estudante = aluno(1000, {}, { kg: 110, bl: [8] });
  const voo = { mis: 'Voo Local', tipo: 'C152', a: 610, b: 670, alunos: [estudante], stuKg: 110 };
  const estado = cenario({
    ins: [
      instrutor(1, 9, { kg: 80 }), instrutor(2, 9, { kg: 60 }), instrutor(3, 5, { kg: 60 }), instrutor(4, 5, { kg: 60 }), instrutor(5, 5, { kg: 60 }),
      instrutor(6, 9, { kg: 60, on: false, hab: [] }), instrutor(7, 9, { kg: 60 }), instrutor(8, 9, { kg: 60 }), instrutor(9, 9, { kg: 60 }),
      instrutor(10, 9, { kg: 150 })
    ],
    stu: [estudante]
  });
  estado.horasDosInstrutores = { 9: { mes: 99.5, semestre: 0, ano: 0, fimAnterior: null } };
  // O instrutor 4 já voa 1 h de manhã; o 7 está ocupado no horário do voo
  const ocupacao = ocupacaoDaEscala([linha('1001_0_1', { insId: 4 }), linha('1002_0_1', { insId: 7, r: 'PR-VOC', a: 640, b: 700 })]);

  it('os que servem, na ordem das Sugestões: o tanque cheio, menos horas no dia, menos habilitações e o id', () => {
    const lista = instrutoresQueServem(estado, ocupacao, voo);
    const servem = lista.filter(c => !c.problemas.length);
    assert.deepEqual(servem.map(c => [c.x.id, c.reducao]), [[3, 0], [5, 0], [2, 0], [4, 0], [1, 8]]);
    assert.deepEqual(lista.slice(0, servem.length), servem, 'os que não servem vêm depois');
  });

  it('quem não serve tem todos os problemas, e cada um tem o texto do conflito', () => {
    const lista = instrutoresQueServem(estado, ocupacao, voo);
    const textos = Object.fromEntries(lista.filter(c => c.problemas.length).map(c => [c.x.id, c.problemas.map(p => TEXTO_DO_PROBLEMA[p.codigo](p))]));
    assert.deepEqual(textos, {
      6: ['o instrutor não está disponível', 'o instrutor não tem a habilitação da missão'],
      7: ['o instrutor já tem outro compromisso neste horário'],
      8: ['o aluno não voa com este instrutor'],
      9: ['o instrutor passaria do limite da lei (horas de voo no mês)'],
      10: ['o peso do aluno e do instrutor passa do limite do avião, mesmo com o mínimo de combustível']
    });
    assert.equal(lista.find(c => c.x.id === 10).reducao, Infinity, 'nem com o mínimo de combustível');
    assert.equal(TEXTO_DO_PROBLEMA['instrutor-saiu'](), 'o instrutor saiu do cadastro');
  });

  it('o horário marcado ou o efetivo decide quem está livre (as Sugestões usam o marcado)', () => {
    // O voo do instrutor 7 atrasou das 10:40 para as 11:20: no horário efetivo, ele fica livre às 10:10
    const atrasado = [linha('1002_0_1', { insId: 7, a: 640, b: 700 })];
    const detalhes = { fStatus: { '1002_0_1': 'Atrasado' }, fObs: { '1002_0_1': { novoInicio: 680 } } };
    const do7 = ocupacao => instrutoresQueServem(estado, ocupacao, voo).find(c => c.x.id === 7).problemas.map(p => p.codigo);
    assert.deepEqual(do7(ocupacaoDaEscala(atrasado, detalhes)), ['instrutor-ocupado']);
    assert.deepEqual(do7(ocupacaoDaEscala(atrasado, { ...detalhes, efetivo: true })), []);
  });

  it('na turma de Ground: o "Não escalar com" de qualquer aluno dela; na sala, nem peso nem combustível', () => {
    const outro = aluno(1001, {}, { kg: 200, bl: [2] });
    const lista = instrutoresQueServem(estado, ocupacaoDaEscala([]), { mis: 'Ground C152', tipo: 'Sala Ground', a: 610, b: 700, alunos: [estudante, outro], stuKg: 110 });
    assert.deepEqual(lista.filter(c => c.problemas.some(p => p.codigo === 'bloqueio')).map(c => c.x.id), [2, 8]);
    assert.ok(lista.every(c => c.reducao === 0 && !c.problemas.some(p => p.codigo === 'peso')));
  });
});

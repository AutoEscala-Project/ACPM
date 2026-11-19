// A escala gravada ao abrir: cada linha precisa ter os campos que o motor produz, nos formatos dele. Uma linha
// adulterada invalida a escala gravada (a tela usa a escala calculada de novo); os campos desconhecidos saem. As
// escalas que o próprio motor produz passam inteiras.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEscalaGravada, normalizarLinhaGravada } from '../../js/escala-gravada.js';
import { runAllocationEngine } from '../../js/engine.js';
import { aluno, cenario, instrutor, apenas } from '../helpers/montar.js';
import { lerGoldens } from '../helpers/goldens.js';
import { CODIGOS_DO_AGENDADO, CODIGOS_DE_AVISO, CODIGOS_DE_REJEICAO } from '../../js/conflitos.js';

const goldens = lerGoldens();
const saidas = [goldens.exemplo.saida, ...goldens.cenarios.map(c => c.saida)];
const ATAQUE = 'x"><img/src/onerror=window.__xss=1>';

describe('Escala gravada', () => {
  it('as escalas do motor passam inteiras (o dia de exemplo e as 40 geradas), com a data', () => {
    for (const saida of saidas) assert.deepEqual(normalizarEscalaGravada(saida), saida);
    assert.deepEqual(normalizarEscalaGravada({ ...saidas[0], data: '2026-11-11' }), { ...saidas[0], data: '2026-11-11' });
  });

  it('também os campos que só aparecem às vezes: combustível, voo fixo, conflito, missão do curso e a revisão de 50 horas', () => {
    // O aluno 1000 tem um voo fixo com um instrutor que saiu do cadastro (conflito); o 1001, de 100 kg com o instrutor de
    // 95 kg, só voa com menos combustível
    const estado = cenario({
      ins: [instrutor(1, 9, { kg: 95 })], stu: [aluno(1000, { p1: 390, p2: -1, etapa: 'PP-07' }), aluno(1001, { p1: 500, p2: -1 }, { kg: 100 })],
      horas: { 'PR-VOB': 49 }, semAeronaves: apenas('C152', 'PR-VOB', 'PR-VOC')
    });
    const escala = runAllocationEngine({ ...estado, fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 2 } } });
    const [fixo, outro] = [escala.out.find(o => o.stuId === 1000), escala.out.find(o => o.stuId === 1001)];
    assert.ok(fixo.fixo && fixo.conflito && fixo.etapa && outro.comb, JSON.stringify(escala.out));
    assert.ok(escala.al.some(a => a.t === 'conf' && a.fKey) && Object.keys(escala.revisao).length);
    assert.deepEqual(normalizarEscalaGravada(escala), escala);
  });

  it('o voo agendado na Escala: a marca fica na escala gravada; adulterada, invalida a escala', () => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    const escala = runAllocationEngine({ ...estado, fixos: { '1000_0_1': { a: 610, b: 670, r: 'PR-VOB', insId: 1, agendado: true } } });
    const agendado = escala.out.find(o => o.stuId === 1000);
    assert.deepEqual([agendado.fixo, agendado.agendado], [true, true]);
    assert.deepEqual(normalizarEscalaGravada(escala), escala);
    assert.deepEqual(normalizarLinhaGravada({ fKey: '1000_0_1', fixo: true, agendado: true }), { fKey: '1000_0_1', fixo: true, agendado: true });
    for (const valor of ['sim', 1, false, null, {}]) assert.equal(normalizarLinhaGravada({ fKey: '1000_0_1', agendado: valor }), null, JSON.stringify(valor));
  });

  it('os avisos do voo agendado fora das regras: os códigos valem no aviso; só o limite de locais vale também na rejeição', () => {
    const base = saidas[0];
    const comAlerta = a => normalizarEscalaGravada({ ...base, al: [a] });
    for (const codigo of CODIGOS_DO_AGENDADO) {
      const aviso = { t: 'warn', s: 'Aluno 1000', fKey: '1000_0_1', m: 'Agendado às 07:00.', codigo, stuId: 1000 };
      assert.deepEqual(comAlerta(aviso).al, [aviso], codigo);
      assert.equal(comAlerta({ ...aviso, fKey: ATAQUE }), null, `${codigo}: a chave do voo adulterada`);
      assert.equal(comAlerta({ t: 'conf', s: 'x', m: 'y', codigo }), null, `${codigo}: o conflito não tem código`);
    }
    // O limite de locais é os dois: o aviso do agendado e a rejeição do pedido; cada tipo confere a lista dele
    assert.deepEqual(CODIGOS_DO_AGENDADO.filter(c => CODIGOS_DE_REJEICAO.includes(c)), ['limite-de-locais']);
    assert.deepEqual(comAlerta({ t: 'err', s: 'x', m: 'y', codigo: 'limite-de-locais' }).al, [{ t: 'err', s: 'x', m: 'y', codigo: 'limite-de-locais' }]);
    for (const codigo of ['fora-dos-horarios', 'depois-das-17h30', 'antes-do-ground']) {
      assert.equal(comAlerta({ t: 'err', s: 'x', m: 'y', codigo }), null, `${codigo} numa rejeição`);
    }
    assert.ok(CODIGOS_DO_AGENDADO.every(c => CODIGOS_DE_AVISO.includes(c)));
    // A escala do motor com os avisos do agendado passa inteira: às 07:00 (fora dos horários do C152) e o 7º voo local
    const estado = cenario({ ins: Array.from({ length: 8 }, (_, i) => instrutor(i + 1, 9)), stu: Array.from({ length: 8 }, (_, i) => aluno(1000 + i, { p1: 500, p2: -1 })) });
    const regs = ['PP-LJV', 'PR-BTB', 'PR-IGU', 'PR-MLB', 'PR-TBT', 'PR-THI', 'PR-VOB'];
    const fixos = Object.fromEntries(regs.map((r, i) => [`${1000 + i}_0_1`, { a: 500, b: 560, r, insId: i + 1, ...(i === 6 ? { agendado: true } : {}) }]));
    fixos['1007_0_1'] = { a: 420, b: 480, r: 'PR-VOC', insId: 8, agendado: true };
    const escala = runAllocationEngine({ ...estado, fixos });
    assert.deepEqual(escala.al.map(a => a.codigo), ['limite-de-locais', 'fora-dos-horarios']);
    assert.deepEqual(normalizarEscalaGravada(escala), escala);
  });

  it('um campo adulterado em qualquer linha invalida a escala gravada', () => {
    const base = saidas[0];
    const adulterar = (campo, valor) => ({ ...base, out: [{ ...base.out[0], [campo]: valor }, ...base.out.slice(1)] });
    const ruins = [
      ['fKey', ATAQUE], ['classKey', ATAQUE], ['isGround', 'sim'], ['w', ATAQUE], ['w', 9], ['a', '390'], ['b', 2000], ['o', -1],
      ['stuId', ATAQUE], ['mid', 1.5], ['insId', '1'], ['eqType', ATAQUE], ['s', 7], ['ins', { nm: 1 }], ['mis', ATAQUE],
      ['h', ATAQUE], ['ss', ATAQUE], ['r', ATAQUE], ['stuKg', ATAQUE], ['insKg', -5], ['limKg', ATAQUE], ['kg', ATAQUE],
      ['comb', { reduzirGal: ATAQUE, abastecerGal: 7, minimoGal: 11, autonomiaMin: 60 }], ['baseTag', ATAQUE], ['tag', ATAQUE],
      ['status', ATAQUE], ['groupSize', ATAQUE], ['fixo', 'sim'], ['agendado', 'sim'], ['conflito', ATAQUE], ['conflito', [ATAQUE, 3]], ['conflitoCodigos', [ATAQUE]], ['conflitoCodigos', 'peso'], ['etapa', ATAQUE]
    ];
    for (const [campo, valor] of ruins) assert.equal(normalizarEscalaGravada(adulterar(campo, valor)), null, `${campo} = ${JSON.stringify(valor)}`);
    assert.equal(normalizarEscalaGravada({ ...base, out: [{ ...base.out[0], a: 450, b: 390 }] }), null, 'termina antes de começar');
  });

  it('alertas, total, revisão e data também no formato; os campos desconhecidos saem', () => {
    const base = saidas[0];
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ t: ATAQUE, s: 'x', m: 'y' }] }), null);
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ t: 'warn', s: 'x', m: 'y', fKey: ATAQUE }] }), null);
    // O código da rejeição: só os da lista
    assert.deepEqual(normalizarEscalaGravada({ ...base, al: [{ t: 'err', s: 'x', m: 'y', codigo: 'bloqueio' }] }).al, [{ t: 'err', s: 'x', m: 'y', codigo: 'bloqueio' }]);
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ t: 'err', s: 'x', m: 'y', codigo: ATAQUE }] }), null);
    // O aviso tem os códigos dele e, no de peso, de quem é o peso que falta
    const aviso = { t: 'warn', s: 'x', m: 'y', codigo: 'sem-peso', stuId: 1000, insId: 3 };
    assert.deepEqual(normalizarEscalaGravada({ ...base, al: [aviso] }).al, [aviso]);
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ ...aviso, codigo: 'bloqueio' }] }), null, 'código de rejeição num aviso');
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ t: 'err', s: 'x', m: 'y', codigo: 'sem-peso' }] }), null, 'código de aviso numa rejeição');
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ ...aviso, stuId: ATAQUE }] }), null);
    assert.equal(normalizarEscalaGravada({ ...base, al: [{ ...aviso, insId: -1 }] }), null);
    assert.equal(normalizarEscalaGravada({ ...base, tot: ATAQUE }), null);
    assert.equal(normalizarEscalaGravada({ ...base, revisao: { [ATAQUE]: { inicio: 1, voadas: 1, fim: 2, paraAs: null } } }), null);
    assert.equal(normalizarEscalaGravada({ ...base, revisao: { 'PR-VOB': { inicio: ATAQUE, voadas: 1, fim: 2, paraAs: null } } }), null);
    assert.equal(normalizarEscalaGravada({ ...base, data: ATAQUE }), null);
    assert.equal(normalizarEscalaGravada({ ...base, data: '2026-13-01' }), null, 'uma data que não existe');
    assert.equal(normalizarEscalaGravada({ ...base, rej: ATAQUE }), null);
    assert.deepEqual(normalizarEscalaGravada({ ...base, rej: 2 }), { ...base, rej: 2 }, 'o número de rejeições dos dias importados do BI fica');
    const comExtras = { ...base, extra: ATAQUE, out: [{ ...base.out[0], onclick: ATAQUE }, ...base.out.slice(1)] };
    assert.deepEqual(normalizarEscalaGravada(comExtras), base);
  });

  it('sem lista de voos, ou sem os campos de que a tela precisa, não há escala gravada', () => {
    assert.equal(normalizarEscalaGravada(null), null);
    assert.equal(normalizarEscalaGravada({ out: 'x', al: [], tot: 0 }), null);
    const { fKey, ...semChave } = saidas[0].out[0];
    assert.equal(normalizarEscalaGravada({ ...saidas[0], out: [semChave] }), null);
  });
});

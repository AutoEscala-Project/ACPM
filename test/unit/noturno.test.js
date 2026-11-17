// O noturno de dois dias: no dia, 4 h a partir das 17:30 (o translado para BH e o noturno em BH); no dia seguinte, a
// volta de BH às 07:30 (1 h de voo), com o instrutor, o aluno e o avião livres só às 10:10. O repouso antes da volta é
// um aviso (a decisão do aeroclube), e a regra do repouso não barra os voos novos do dia.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { noturnosDaVespera, comRepousoDoNoturno, repousoAntesDaVolta } from '../../js/noturno.js';
import { filasDoDiaSeguinte } from '../../js/rodizio.js';
import { normalizarLimites, LIMITES_DA_LEI } from '../../js/limites.js';
import { normalizarLinhaGravada } from '../../js/escala-gravada.js';
import { ApiClient } from '../../js/storage.js';
import { ESQUEMA } from '../../js/migracoes.js';
import { simularNavegador } from '../helpers/navegador.js';
import { aluno, apenas, cenario, instrutor } from '../helpers/montar.js';

const NOTURNO = { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 };
// Um só C172 (o PR-HAR), para ver o avião ocupado até as 10:10
const SO_PR_HAR = apenas('C172', 'PR-HAR');
const volta = (extra = {}) => ({ stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290, ...extra });
const diaSeguinte = (opts, noturnos = [volta()], horas = comRepousoDoNoturno({}, noturnos)) => {
  const estado = cenario({ semAeronaves: SO_PR_HAR, ...opts });
  estado.noturnosDaVespera = noturnos;
  estado.horasDosInstrutores = horas;
  return estado;
};
const resumo = out => out.map(o => [o.s, o.mis, o.a, o.b, o.insId, o.r, o.trecho || null]);

describe('Noturno: o dia dele', () => {
  it('4 h a partir das 17:30 (1 h de translado e 3 h de noturno em BH), qualquer que seja a duração pedida', () => {
    const { out } = runAllocationEngine(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { ...NOTURNO, nb: 1 })] }));
    assert.deepEqual(out.map(o => [o.a, o.b, o.h]), [[1050, 1290, 4]]);
  });
});

describe('Noturno: o dia seguinte', () => {
  it('a volta de BH entra fixa às 07:30–08:30, e o instrutor, o aluno e o avião só ficam livres às 10:10', () => {
    // O mesmo aluno e o mesmo instrutor pedem um voo às 08:20; o único C172 é o da volta
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })] });
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual(resumo(out), [['Aluno 1000', 'Noturno', 450, 510, 1, 'PR-HAR', 'volta'], ['Aluno 1000', 'Voo Local', 610, 670, 1, 'PR-HAR', null]]);
    const v = out[0];
    assert.deepEqual([v.fKey, v.ss, v.h, v.livreAs, v.fixo], ['1000_0_2', '2/2', 1, 610, true]);
    assert.deepEqual(al.map(a => a.codigo), ['repouso-do-noturno']);
  });

  it('ninguém usa o avião da volta antes das 10:10 (nem às 06:30: ele passou a noite em BH)', () => {
    const estado = diaSeguinte({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { fly: false }), aluno(1001, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })] });
    const voo = runAllocationEngine(estado).out.find(o => o.stuId === 1001);
    assert.deepEqual([voo.a, voo.r], [610, 'PR-HAR']);
  });

  it('a volta conta 1 h de voo para a lei (não as 2h40 que ocupa)', () => {
    // Limite de 2 h de voo na jornada: a volta (1 h) e mais 1 h cabem
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1 })] });
    estado.limites = { ...LIMITES_DA_LEI, vooPorJornadaMin: 120 };
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual([out.length, al.filter(a => a.t === 'err')], [2, []]);
  });

  it('o repouso antes da volta é um aviso, e a regra do repouso não barra os voos novos do instrutor', () => {
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1 })] });
    const { out, al } = runAllocationEngine(estado);
    assert.equal(out.length, 2);
    assert.deepEqual(al.map(a => [a.t, a.codigo, a.insId, a.m]), [['warn', 'repouso-do-noturno', 1,
      'Limite da lei: 9h00 de repouso entre o noturno de ontem (até 21:30) e o translado de volta (07:30), menos que as 12h00 da lei.']]);
    // Sem o ajuste (fimAnterior de ontem às 21:30), o voo das 10:10 seria recusado pelo repouso
    const semAjuste = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1 })] }, [volta()], { 1: { mes: 0, semestre: 0, ano: 0, fimAnterior: 1290 } });
    assert.deepEqual(runAllocationEngine(semAjuste).al.filter(a => a.t === 'err').map(a => a.codigo), ['limite-da-lei']);
  });

  it('a volta cancelada (mau tempo em BH) não ocupa nada nem avisa', () => {
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })], fStatus: { '1000_0_2': 'Cancelado' } });
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual(resumo(out).map(l => [l[1], l[2], l[6]]), [['Noturno', 450, 'volta'], ['Voo Local', 500, null]]);
    assert.deepEqual(al, []);
  });

  it('a divisão das horas e a compactação não mexem na volta; ela conta 1 h na revisão', () => {
    const estado = diaSeguinte({ ins: [instrutor(1, 9), instrutor(2, 1)], stu: [aluno(1000, { fly: false })], horas: { 'PR-HAR': 40 } });
    const { out, revisao } = runAllocationEngine(estado);
    assert.deepEqual(resumo(out), [['Aluno 1000', 'Noturno', 450, 510, 1, 'PR-HAR', 'volta']]);
    assert.equal(revisao['PR-HAR'].voadas, 1);
  });

  it('a volta não conta de novo no rodízio do noturno', () => {
    const dia = { filas: { noturno: [1, 2] }, resultado: { out: [{ fKey: '1000_0_2', mis: 'Noturno', eqType: 'C172', insId: 1, trecho: 'volta', status: 'Confirmado' }] }, fStatus: {} };
    assert.deepEqual(filasDoDiaSeguinte(dia, [instrutor(1, 9), instrutor(2, 9)]).noturno, [1, 2]);
  });

  it('a escala gravada guarda o trecho e até quando ele ocupa', () => {
    assert.deepEqual(normalizarLinhaGravada({ fKey: '1000_0_2', trecho: 'volta', livreAs: 610 }), { fKey: '1000_0_2', trecho: 'volta', livreAs: 610 });
    assert.equal(normalizarLinhaGravada({ fKey: '1000_0_2', trecho: 'ida' }), null);
  });
});

describe('Noturno: a véspera (js/noturno.js)', () => {
  const ontem = (out, extra = {}) => ({ data: '2026-11-10', conteudo: { esquema: ESQUEMA, fStatus: {}, fObs: {}, resultado: { out, al: [], tot: out.length }, ...extra } });
  const noturnoDeOntem = (extra = {}) => ({ fKey: '1000_0_1', classKey: '1000_0_1', isGround: false, a: 1050, b: 1290, stuId: 1000, mid: 0, insId: 1, eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', mis: 'Noturno', h: 4, r: 'PR-HAR', stuKg: 70, status: 'Confirmado', ...extra });

  it('só os noturnos de ontem (não os de outra data), sem os cancelados e sem as voltas', () => {
    const out = [noturnoDeOntem(), noturnoDeOntem({ fKey: '1001_0_1', stuId: 1001 }), noturnoDeOntem({ fKey: '1002_0_2', stuId: 1002, trecho: 'volta', a: 450, b: 510, livreAs: 610 }),
      noturnoDeOntem({ fKey: '1003_0_1', stuId: 1003, mis: 'Voo Local', a: 500, b: 560 })];
    const lidos = noturnosDaVespera(ontem(out, { fStatus: { '1001_0_1': 'Cancelado' } }), '2026-11-11');
    assert.deepEqual(lidos, [{ stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290 }]);
    assert.deepEqual(noturnosDaVespera(ontem(out), '2026-11-12'), [], 'a última data guardada não é ontem');
    assert.deepEqual(noturnosDaVespera(null, '2026-11-11'), []);
    assert.deepEqual(noturnosDaVespera(ontem([{ fKey: 'x' }]), '2026-11-11'), [], 'escala adulterada');
  });

  it('o atrasado termina mais tarde: o repouso conta do fim novo', () => {
    const [n] = noturnosDaVespera(ontem([noturnoDeOntem()], { fStatus: { '1000_0_1': 'Atrasado' }, fObs: { '1000_0_1': { novoInicio: 1080 } } }), '2026-11-11');
    assert.equal(n.fim, 1320);
    assert.equal(repousoAntesDaVolta(n.fim, normalizarLimites()), 1440 - 1350 + 450 - 30);
  });

  it('o instrutor que volta de BH fica sem fimAnterior e com o fim do noturno', () => {
    assert.deepEqual(comRepousoDoNoturno({ 1: { mes: 10, semestre: 20, ano: 30, fimAnterior: 1290 }, 2: { mes: 1, semestre: 1, ano: 1, fimAnterior: 1000 } }, [volta()]),
      { 1: { mes: 10, semestre: 20, ano: 30, fimAnterior: null, fimDoNoturno: 1290 }, 2: { mes: 1, semestre: 1, ano: 1, fimAnterior: 1000 } });
  });
});

describe('Noturno: abrir o dia seguinte (ApiClient)', () => {
  const original = ApiClient.backend;
  let docs;
  beforeEach(() => {
    simularNavegador();
    docs = new Map();
    ApiClient.backend = {
      async ler(doc) { return docs.has(doc) ? structuredClone(docs.get(doc)) : null; },
      async gravar(doc, conteudo) { docs.set(doc, structuredClone(conteudo)); return true; },
      async diaAnterior(data) {
        const d = [...docs.keys()].filter(k => k.startsWith('dia:')).map(k => k.slice(4)).filter(x => x < data).sort().pop();
        return d ? { data: d, conteudo: structuredClone(docs.get(`dia:${d}`)) } : null;
      },
      async horasDosInstrutores() { return { 1: { mes: 4, semestre: 4, ano: 4, fimAnterior: 1290 } }; },
      async situacaoDasMissoes() { return []; },
      async resultadosDoDia() { return []; }
    };
    ApiClient.readOnly = false;
    ApiClient.cadastroGravado = undefined;
  });
  afterEach(() => { ApiClient.backend = original; });

  it('o dia seguinte lê o noturno de ontem: a volta entra na escala e o repouso vira aviso', async () => {
    const estado = ApiClient.normalizeAndMigrateState(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, NOTURNO)] }));
    await ApiClient.salvarDia('2026-11-10', estado, runAllocationEngine(estado));
    const lido = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual(lido.estado.noturnosDaVespera.map(n => [n.stuId, n.insId, n.fim]), [[1000, 1, 1290]]);
    assert.deepEqual(lido.horasDosInstrutores[1], { mes: 4, semestre: 4, ano: 4, fimAnterior: null, fimDoNoturno: 1290 });
    const { out, al } = runAllocationEngine({ ...lido.estado, horasDosInstrutores: lido.horasDosInstrutores });
    assert.deepEqual(out.filter(o => o.trecho).map(o => [o.fKey, o.a, o.b, o.livreAs]), [['1000_0_2', 450, 510, 610]]);
    assert.deepEqual(al.map(a => a.codigo), ['repouso-do-noturno']);
    // Dois dias depois, nada volta (a véspera não teve noturno)
    await ApiClient.salvarDia('2026-11-11', lido.estado, runAllocationEngine(lido.estado));
    assert.equal((await ApiClient.carregarDia('2026-11-12')).estado.noturnosDaVespera, undefined);
  });
});

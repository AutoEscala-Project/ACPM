// O noturno de dois dias: no dia, 4 h a partir das 17:30 (o translado para BH e o noturno em BH); no dia seguinte, a
// volta de BH às 07:30 (1 h de voo), com o instrutor, o aluno e o avião livres só às 10:10. O repouso antes da volta é
// um aviso (a decisão do aeroclube), e a regra do repouso não barra os voos novos do dia.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { noturnosDaVespera, comRepousoDoNoturno, repousoAntesDaVolta, historicoDoDia, voltasConferem, voltasQueMudaram } from '../../js/noturno.js';
import { fixosAoMudarStatus, fixosAoAprovar, fixosAoReabrir, pinosDoNoturno, semAgendados, pinosDoNoturnoQueValem, pinoDoVoo } from '../../js/fixos.js';
import { normalizarHangar, moverNoHangar } from '../../js/hangar.js';
import { estadoParaEscalar } from '../../js/inativos.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { gerarCenario, comVolta, mulberry32 } from '../helpers/cenarios.js';
import { filasDoDiaSeguinte } from '../../js/rodizio.js';
import { normalizarLimites, LIMITES_DA_LEI } from '../../js/limites.js';
import { normalizarLinhaGravada, normalizarEscalaGravada } from '../../js/escala-gravada.js';
import { ApiClient } from '../../js/storage.js';
import { ESQUEMA } from '../../js/migracoes.js';
import { separar } from '../../js/dias.js';
import { simularNavegador } from '../helpers/navegador.js';
import { aluno, apenas, cenario, instrutor } from '../helpers/montar.js';
import { escolherInstrutor, reverterEscolha } from '../../js/instrutor-escolhido.js';
import { importarSolicitacoes } from '../../js/processamento.js';
import { escalaSemeada } from '../../scripts/dia-semeado.mjs';

const NOTURNO = { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 };
// Um só C172 (o PR-HAR), para ver o avião ocupado até as 10:10
const SO_PR_HAR = apenas('C172', 'PR-HAR');
const volta = (extra = {}) => ({ stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290, ...extra });
// As horas de ontem: o noturno terminou às 21:30 (fimAnterior), como o servidor entrega, com o fim do noturno
const diaSeguinte = (opts, noturnos = [volta()], horas = comRepousoDoNoturno({ 1: { mes: 0, semestre: 0, ano: 0, fimAnterior: 1290 } }, noturnos)) => {
  const estado = cenario({ semAeronaves: SO_PR_HAR, ...opts });
  estado.noturnosDaVespera = noturnos;
  estado.horasDosInstrutores = horas;
  return estado;
};
const resumo = out => out.map(o => [o.s, o.mis, o.a, o.b, o.insId, o.r, o.trecho || null]);
// A escala calculada como o app a faz (js/actions.js, calcularComOsNoturnosFixos): o Noturno que o motor pôs ganha o pino
// dele, e a escala é refeita com ele. Muda os voos fixos do estado
function comOsNoturnosFixos(estado) {
  const escala = runAllocationEngine(estado);
  const fixos = pinosDoNoturno(estado, escala);
  if (fixos === estado.fixos) return escala;
  estado.fixos = fixos;
  return runAllocationEngine(estado);
}

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
    // Sem a volta (o servidor não sabe do noturno), o voo das 10:10 seria recusado pelo repouso
    const semAjuste = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1, jan: 'h610' })] }, [], { 1: { mes: 0, semestre: 0, ano: 0, fimAnterior: 1290 } });
    assert.deepEqual(runAllocationEngine(semAjuste).al.filter(a => a.t === 'err').map(a => a.codigo), ['limite-da-lei']);
  });

  it('a volta cancelada (mau tempo em BH) não ocupa nada nem avisa, e o repouso volta a valer como sempre', () => {
    // O aluno voa com outro instrutor às 08:20; o instrutor do noturno não voa de manhã (repouso desde as 21:30)
    const estado = diaSeguinte({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })], fStatus: { '1000_0_2': 'Cancelado' } });
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual(resumo(out).map(l => [l[1], l[2], l[4], l[6]]), [['Noturno', 450, 1, 'volta'], ['Voo Local', 500, 2, null]]);
    assert.deepEqual(al, []);
    assert.equal(historicoDoDia(estado)(1).fimAnterior, 1290);
    // Só o instrutor do noturno: o voo das 08:20 dele é recusado pelo repouso
    const so = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1, jan: 'h500' })], fStatus: { '1000_0_2': 'Cancelado' } });
    assert.deepEqual(runAllocationEngine(so).al.map(a => a.codigo), ['limite-da-lei']);
  });

  it('a volta atrasada ocupa até o pouso novo, se for depois das 10:10', () => {
    // Nova decolagem às 09:30: pousa às 10:30, e o voo das 10:10 do mesmo aluno, instrutor e avião vai para depois
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172', p1: 610, p2: -1 })], fStatus: { '1000_0_2': 'Atrasado' } });
    estado.fObs = { '1000_0_2': { novoInicio: 570 } };
    const voo = runAllocationEngine(estado).out.find(o => !o.trecho);
    assert.ok(voo.a >= 630, `começou às ${voo.a}`);
  });

  it('o Ground C172 do aluno que volta de BH vai depois das 10:10 (a volta não é o voo que o Ground precede)', () => {
    const estado = diaSeguinte({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Ground C172', eq: 'Sala Ground', nb: 1.5, p1: 500, p2: -1 })] });
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual([al.filter(a => a.t === 'err'), out.find(o => o.isGround).a >= 610], [[], true]);
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

  it('o instrutor que volta de BH guarda o fim do noturno; no dia, sem o fimAnterior, menos com a volta cancelada', () => {
    const horas = comRepousoDoNoturno({ 1: { mes: 10, semestre: 20, ano: 30, fimAnterior: 1290 }, 2: { mes: 1, semestre: 1, ano: 1, fimAnterior: 1000 } }, [volta()]);
    assert.deepEqual(horas, { 1: { mes: 10, semestre: 20, ano: 30, fimAnterior: 1290, fimDoNoturno: 1290 }, 2: { mes: 1, semestre: 1, ano: 1, fimAnterior: 1000 } });
    const estado = { horasDosInstrutores: horas, noturnosDaVespera: [volta()], fStatus: {} };
    assert.deepEqual([historicoDoDia(estado)(1).fimAnterior, historicoDoDia(estado)(2).fimAnterior, historicoDoDia(estado)(9)], [null, 1000, null]);
    assert.equal(historicoDoDia({ ...estado, fStatus: { '1000_0_2': 'Cancelado' } })(1).fimAnterior, 1290);
  });

  it('a escala gravada confere com os noturnos de ontem só com as mesmas voltas', () => {
    const escala = { out: [{ fKey: '1000_0_2', trecho: 'volta', stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR' }, { fKey: '1001_0_1', stuId: 1001 }] };
    assert.equal(voltasConferem(escala, [volta()]), true);
    assert.equal(voltasConferem(escala, []), false, 'o noturno de ontem foi cancelado depois');
    assert.equal(voltasConferem({ out: [] }, [volta()]), false, 'o noturno de ontem entrou depois');
    assert.equal(voltasConferem(escala, [volta({ insId: 2 })]), false, 'o instrutor do noturno mudou');
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
    assert.deepEqual(lido.horasDosInstrutores[1], { mes: 4, semestre: 4, ano: 4, fimAnterior: 1290, fimDoNoturno: 1290 });
    const { out, al } = runAllocationEngine({ ...lido.estado, horasDosInstrutores: lido.horasDosInstrutores });
    assert.deepEqual(out.filter(o => o.trecho).map(o => [o.fKey, o.a, o.b, o.livreAs]), [['1000_0_2', 450, 510, 610]]);
    assert.deepEqual(al.map(a => a.codigo), ['repouso-do-noturno']);
    // A escala do dia seguinte gravada fica; se o noturno de ontem é cancelado depois, ela não vale mais (é calculada)
    await ApiClient.salvarDia('2026-11-11', lido.estado, runAllocationEngine({ ...lido.estado, horasDosInstrutores: lido.horasDosInstrutores }));
    assert.ok((await ApiClient.carregarDia('2026-11-11')).escala);
    const ontem = (await ApiClient.backend.ler('dia:2026-11-10'));
    await ApiClient.backend.gravar('dia:2026-11-10', { ...ontem, fStatus: { '1000_0_1': 'Cancelado' } });
    const depois = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([depois.escala, depois.estado.noturnosDaVespera], [null, undefined]);
  });
});

// O Noturno no mesmo avião (Pedro, 2026-11-27): a volta do dia seguinte sai da escala gravada do dia do Noturno, e o
// Noturno fica fixo (o pino do Noturno, js/fixos.js) onde a gravação o deixou. Uma alteração no dia do Noturno que refaz a
// escala (o Pousou dos voos da tarde, um cancelamento, um pedido novo, o hangar, a reabertura da escala aprovada, a escala
// refeita porque a volta de anteontem mudou) não muda o avião nem o INVA dele, e o dia seguinte gravado continua valendo
describe('Noturno: o mesmo avião na volta (ApiClient, com o backend na memória)', () => {
  const original = ApiClient.backend;
  let docs;
  const D0 = '2026-12-01', D1 = '2026-12-02', D2 = '2026-12-03';
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
      async horasDosInstrutores() { return {}; },
      async situacaoDasMissoes() { return []; },
      async resultadosDoDia() { return []; }
    };
    ApiClient.readOnly = false;
    ApiClient.cadastroGravado = undefined;
  });
  afterEach(() => { ApiClient.backend = original; });

  // Como o app: abrir (carregarDia: a escala gravada, ou a calculada com o pino de cada Noturno dela) e gravar (o motor com
  // o pino de cada Noturno, e salvarDia): js/actions.js, calcularComOsNoturnosFixos
  async function abrir(data) {
    const lido = await ApiClient.carregarDia(data);
    const estado = { ...lido.estado, horasDosInstrutores: lido.horasDosInstrutores };
    return { estado, escala: lido.escala, voltasDeAntes: lido.voltasDeAntes, tela: lido.escala || comOsNoturnosFixos(estado) };
  }
  const gravar = (data, estado) => ApiClient.salvarDia(data, estado, comOsNoturnosFixos(estado));
  const gravada = async data => (await ApiClient.backend.ler(`dia:${data}`)).resultado.out;
  const lugar = o => o && [o.r, o.insId];
  const noturno = out => out.find(o => o.stuId === 1000 && o.mis === 'Noturno' && !o.trecho);
  // O dia do Noturno: o Aluno 1000 no Noturno (prioridade 1) e três voos locais no C172 (08:20, 12:40 e 16:20, que pousa
  // às 17:20), com dois ou três INVAs. Sem o pino, cada alteração abaixo muda o Noturno de avião ou de INVA num deles
  const LOCAIS = [[1001, 500], [1002, 760], [1003, 980]];
  const diaDoNoturno = (instrutores = 3) => ApiClient.normalizeAndMigrateState(cenario({
    ins: [1, 2, 3].slice(0, instrutores).map(id => instrutor(id, 9)),
    stu: [aluno(1000, { ...NOTURNO, pr: 1 }), ...LOCAIS.map(([id, p1]) => aluno(id, { mis: 'Voo Local', eq: 'C172', p1, p2: -1 }))]
  }));
  // O dia do Noturno gravado e o dia seguinte gravado (a volta no avião do Noturno)
  async function comODiaSeguinte(instrutores) {
    await gravar(D1, diaDoNoturno(instrutores));
    const antes = noturno(await gravada(D1));
    const seguinte = await abrir(D2);
    await gravar(D2, seguinte.estado);
    return antes;
  }
  // Depois da alteração no dia do Noturno: o mesmo avião e o mesmo INVA, e o dia seguinte gravado vale (as voltas conferem).
  // novo: o Noturno que entrou no dia do Noturno (a volta dele entra no dia seguinte, que é refeito; a do Aluno 1000 fica)
  async function conferir(antes, rotulo, novo = null) {
    assert.deepEqual(lugar(noturno(await gravada(D1))), lugar(antes), `${rotulo}: o Noturno mudou`);
    const seguinte = await abrir(D2);
    const volta = seguinte.tela.out.find(o => o.trecho === 'volta' && o.stuId === 1000);
    assert.deepEqual(lugar(volta), lugar(antes), `${rotulo}: a volta`);
    if (novo) {
      const n = seguinte.estado.noturnosDaVespera.find(v => v.stuId === novo);
      assert.equal(voltasQueMudaram(seguinte.voltasDeAntes, seguinte.estado.noturnosDaVespera), `Volta do Noturno (o Noturno de ontem mudou): Aluno ${novo}: a volta entrou, no ${n.r}`);
      return;
    }
    assert.ok(seguinte.escala, `${rotulo}: a escala gravada do dia seguinte não vale mais`);
    assert.equal(seguinte.voltasDeAntes, null);
    assert.ok(voltasConferem(seguinte.escala, seguinte.estado.noturnosDaVespera));
  }

  it('a gravação põe o pino do Noturno no dia gravado e na tela, no lugar da escala gravada', async () => {
    const estado = diaDoNoturno();
    await gravar(D1, estado);
    const o = noturno(await gravada(D1));
    const pino = { a: o.a, b: o.b, r: o.r, insId: o.insId, noturno: true };
    assert.deepEqual((await ApiClient.backend.ler(`dia:${D1}`)).fixos, { [o.fKey]: pino });
    assert.deepEqual(estado.fixos, { [o.fKey]: pino }, 'o estado da tela também');
    // Sem o pedido do Noturno voando, o pino sai na gravação seguinte
    estado.stu[0].fly = false;
    await gravar(D1, estado);
    assert.deepEqual((await ApiClient.backend.ler(`dia:${D1}`)).fixos, {});
  });

  // Cada alteração, com quantos INVAs o dia tem
  const alteracoes = {
    // À noite, o Pousou dos voos que terminaram antes das 17:30 (o Noturno fica Confirmado)
    'o Pousou dos voos da tarde': (estado, out) => {
      for (const o of out.filter(v => v.mis !== 'Noturno' && v.b <= 1050)) {
        estado.fStatus = { ...estado.fStatus, [o.fKey]: 'Pousou' };
        estado.fixos = fixosAoMudarStatus(estado.fixos, o, 'Pousou', { aprovada: false });
      }
    },
    'um voo do INVA do Noturno cancelado': (estado, out) => {
      const o = out.find(v => v.mis !== 'Noturno' && v.insId === noturno(out).insId);
      estado.fStatus = { ...estado.fStatus, [o.fKey]: 'Cancelado' };
      estado.fixos = fixosAoMudarStatus(estado.fixos, o, 'Cancelado', { aprovada: false });
    },
    'um pedido novo de prioridade maior (outro Noturno)': estado => { estado.stu.push(aluno(1004, { ...NOTURNO, pr: 5 })); },
    'o hangar': (estado, out) => { estado.hangar = moverNoHangar(normalizarHangar(estado.hangar, estado.frota), noturno(out).r, estado.frota.length - 1); },
    'a reabertura da escala aprovada (com o hangar mudado)': (estado, out) => {
      estado.fixos = fixosAoAprovar(estado.fixos, out);
      estado.aprovacao = { em: '2026-12-02T10:00:00Z', por: 'Operador' };
      estado.fixos = fixosAoReabrir(estado.fixos, estado.fStatus);
      estado.aprovacao = null;
      estado.hangar = moverNoHangar(normalizarHangar(estado.hangar, estado.frota), noturno(out).r, estado.frota.length - 1);
    },
    'outro INVA que deixa de vir': (estado, out) => { estado.ins.find(x => x.id !== noturno(out).insId).on = false; }
  };
  const INVAS = { 'o Pousou dos voos da tarde': 2, 'um voo do INVA do Noturno cancelado': 2 };
  // Os voos fixos sem o pino do Noturno (o motor de antes dele)
  const semOPino = fixos => Object.fromEntries(Object.entries(fixos || {}).filter(([, p]) => !p.noturno));
  for (const [rotulo, alterar] of Object.entries(alteracoes)) {
    it(`${rotulo}: o Noturno fica no avião e com o INVA dele, e o dia seguinte gravado continua valendo`, async () => {
      const antes = await comODiaSeguinte(INVAS[rotulo]);
      const dia = await abrir(D1);
      alterar(dia.estado, dia.tela.out);
      const semPino = noturno(runAllocationEngine({ ...dia.estado, fixos: semOPino(dia.estado.fixos) }).out);
      assert.notDeepEqual(lugar(semPino), lugar(antes), 'sem o pino, o Noturno mudaria (o teste não passa por falta disso)');
      await gravar(D1, dia.estado);
      await conferir(antes, rotulo, rotulo.includes('outro Noturno') ? 1004 : null);
    });
  }

  it('a escala do dia do Noturno refeita na tela (a volta de anteontem mudou) e gravada: o Noturno fica onde estava', async () => {
    // Anteontem, o Noturno do Aluno 1003 (os outros não voam), gravado
    const anteontem = diaDoNoturno();
    anteontem.stu.forEach(s => { s.fly = s.id === 1003; });
    Object.assign(anteontem.stu.find(s => s.id === 1003), NOTURNO);
    await gravar(D0, anteontem);
    // O dia do Noturno (com a volta do Aluno 1003) e o seguinte, gravados
    const d1 = await abrir(D1);
    for (const [id, pedido] of [[1000, { ...NOTURNO, pr: 1 }], ...LOCAIS.map(([i, p1]) => [i, { mis: 'Voo Local', eq: 'C172', p1, p2: -1 }])]) Object.assign(d1.estado.stu.find(s => s.id === id), { fly: true, nb: 1, ...pedido });
    await gravar(D1, d1.estado);
    const antes = noturno(await gravada(D1));
    assert.ok((await gravada(D1)).some(o => o.trecho === 'volta' && o.stuId === 1003));
    const seguinte = await abrir(D2);
    await gravar(D2, seguinte.estado);
    // O Noturno de anteontem vai para outro avião (o operador, no editor): a volta dele no dia do Noturno muda
    const e0 = (await abrir(D0)).estado;
    const [fKey0, pino0] = Object.entries(e0.fixos)[0];
    const outro = FROTA_INICIAL.find(f => f.tipo === 'C172' && f.reg !== pino0.r && f.reg !== antes.r).reg;
    e0.fixos = { [fKey0]: { ...pino0, r: outro, agendado: true } };
    await gravar(D0, e0);
    // A tela do dia do Noturno: a escala gravada não confere, e a refeita é gravada (js/actions.js, seguirAsVoltasDeOntem)
    const dia = await abrir(D1);
    assert.equal(dia.escala, null);
    assert.equal(voltasQueMudaram(dia.voltasDeAntes, dia.estado.noturnosDaVespera), `Volta do Noturno (o Noturno de ontem mudou): Aluno 1003: ${pino0.r} → ${outro}`);
    assert.deepEqual(lugar(noturno(dia.tela.out)), lugar(antes));
    await gravar(D1, dia.estado);
    await conferir(antes, 'a escala refeita');
  });

  it('o dia gravado antes do pino do Noturno (um dia antigo, ou da prévia): carregarDia põe o pino pela linha gravada, antes do motor', async () => {
    const estado = diaDoNoturno();
    const escala = runAllocationEngine(estado);
    // Gravado sem o pino (como semear-dias-previa.mjs, ou antes desta versão)
    const { cadastro, dia } = separar(estado);
    docs.set('cadastro', { ...cadastro, esquema: ESQUEMA });
    docs.set(`dia:${D1}`, { ...dia, esquema: ESQUEMA, resultado: escala });
    const antes = noturno(escala.out);
    const seguinte = await abrir(D2);
    await gravar(D2, seguinte.estado);
    // O hangar mudado: o motor, sem o pino, mudaria o Noturno de avião
    const aberto = await abrir(D1);
    assert.deepEqual(aberto.estado.fixos, { [antes.fKey]: { a: antes.a, b: antes.b, r: antes.r, insId: antes.insId, noturno: true } });
    alteracoes['o hangar'](aberto.estado, aberto.tela.out);
    const semOPino = runAllocationEngine({ ...aberto.estado, fixos: {} });
    assert.notDeepEqual(lugar(noturno(semOPino.out)), lugar(antes), 'sem o pino, o Noturno mudaria (o teste não passa por falta disso)');
    await gravar(D1, aberto.estado);
    await conferir(antes, 'o dia antigo');
  });

  // A revisão do pino do Noturno ---------------------------------------------------------------------------------------
  // O ↶ da escolha do INVA do Noturno, na data que ainda não tinha escala gravada: o pino do Noturno já está na tela ao
  // abrir (sem gravar), a reversão o devolve como estava, e o Noturno volta para o INVA de antes
  const doisInvas = () => ApiClient.normalizeAndMigrateState(cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, NOTURNO)] }));
  for (const noLugar of [false, true]) {
    it(`o ↶ da escolha do INVA do Noturno (${noLugar ? 'na Escala' : 'na Demanda'}) na data sem escala gravada devolve o INVA de antes`, async () => {
      const desfazer = async pinoAoAbrir => {
        docs.clear();
        const estado = doisInvas();
        const tela = pinoAoAbrir ? comOsNoturnosFixos(estado) : runAllocationEngine(estado);
        const antes = noturno(tela.out);
        const outro = antes.insId === 1 ? 2 : 1;
        const { antes: rev } = escolherInstrutor(estado, tela, { stuId: 1000, mid: 0 }, outro, { noLugar });
        await gravar(D1, estado);
        assert.equal(noturno(await gravada(D1)).insId, outro, 'com a escolha');
        reverterEscolha(estado, rev);
        await gravar(D1, estado);
        return [lugar(antes), lugar(noturno(await gravada(D1))), estado.stu[0].insId];
      };
      const [antes, depois, escolhido] = await desfazer(true);
      assert.deepEqual([depois, escolhido], [antes, undefined]);
      // Sem o pino ao abrir (a versão de antes da revisão), a gravação da escolha punha o pino com o INVA escolhido, e o ↶
      // o deixava: o teste não passa por falta disso
      const [antesSem, depoisSem] = await desfazer(false);
      assert.notDeepEqual(depoisSem, antesSem);
    });
  }

  // "Usar" / "Outra missão do curso" na Demanda trocam só a missão do curso do Noturno posto à mão no editor (o pino agendado
  // com a marca do Noturno; soltarAgendado, js/eventos/demanda.js): o Noturno fica no avião e com o INVA do editor, e o dia
  // seguinte gravado continua valendo
  it('a missão do curso trocada no Noturno levado pelo editor: o avião e o INVA dele ficam', async () => {
    const estado = doisInvas();
    estado.stu[0] = { ...estado.stu[0], etapa: 'TSL-01', cursoDaEtapa: 'PP' };
    await gravar(D1, estado);
    const o = noturno(await gravada(D1));
    // O editor (aplicarEdicao): o outro C172, com o outro INVA
    const r = FROTA_INICIAL.find(f => f.tipo === 'C172' && f.reg !== o.r).reg, insId = o.insId === 1 ? 2 : 1;
    const dia = await abrir(D1);
    dia.estado.fixos = { [o.fKey]: { ...pinoDoVoo(o), r, insId, agendado: true, noturno: true } };
    dia.estado.stu[0].insId = insId;
    await gravar(D1, dia.estado);
    const editado = noturno(await gravada(D1));
    assert.deepEqual(lugar(editado), [r, insId]);
    await gravar(D2, (await abrir(D2)).estado);
    // "Usar" a NOT (a missão continua Noturno)
    const depois = await abrir(D1);
    Object.assign(depois.estado.stu[0], { etapa: 'NOT', cursoDaEtapa: 'PP' });
    depois.estado.fixos = pinosDoNoturnoQueValem({ ...depois.estado, fixos: semAgendados(depois.estado.fixos, [o.fKey], depois.estado.fStatus) });
    assert.deepEqual(depois.estado.fixos, { [o.fKey]: { ...pinoDoVoo(o), r, insId, noturno: true } });
    await gravar(D1, depois.estado);
    await conferir(editado, 'a missão do curso trocada');
  });

  // "Importar da agenda" com o Noturno que o operador pôs na Demanda e que a gravação fixou (só o pino do Noturno): o pedido
  // da agenda passa a ser esse voo (não um segundo Noturno, que o motor recusaria), no avião e com o INVA dele
  it('o pedido da agenda do mesmo Noturno passa a ser o voo fixo só pelo pino do Noturno', async () => {
    const estado = doisInvas();
    await gravar(D1, estado);
    const o = noturno(await gravada(D1));
    const dia = await abrir(D1);
    const pedido = [{ id: 501, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Noturno', data: D1, horas: null, cancelada_em: null }];
    const resumo = importarSolicitacoes(dia.estado, pedido, {});
    assert.deepEqual([resumo.novos, resumo.atualizados, dia.estado.stu[0].solicitacao, dia.estado.stu[0].extra.length], [0, 1, 501, 0]);
    const r = runAllocationEngine(dia.estado);
    assert.deepEqual([lugar(noturno(r.out)), r.al.filter(a => a.t === 'err')], [lugar(o), []]);
    // O Noturno agendado (o editor) continua como estava: o pedido da agenda entra como outro voo
    const agendado = await abrir(D1);
    agendado.estado.fixos = { [o.fKey]: { ...agendado.estado.fixos[o.fKey], agendado: true } };
    assert.deepEqual(importarSolicitacoes(agendado.estado, pedido, {}).novos, 1);
  });

  // A gravação que muda o Noturno avisa quando a escala gravada do dia seguinte tem a volta de antes (js/actions.js,
  // avisarVoltaDoDiaSeguinte): ApiClient.voltasGravadasDeAntes lê as duas datas sem guardar a versão
  it('voltasGravadasDeAntes: o dia seguinte gravado com a volta de antes, sem guardar a versão', async () => {
    const lidas = [];
    const ler = ApiClient.backend.ler;
    ApiClient.backend.ler = async (doc, opcoes) => { lidas.push([doc, opcoes]); return ler(doc); };
    assert.equal(await ApiClient.voltasGravadasDeAntes(D2), false, 'sem nada gravado');
    const antes = await comODiaSeguinte();
    lidas.length = 0;
    assert.equal(await ApiClient.voltasGravadasDeAntes(D2), false, 'as voltas conferem');
    assert.deepEqual(lidas, [[`dia:${D1}`, { guardarVersao: false }], [`dia:${D2}`, { guardarVersao: false }]]);
    const dia = await abrir(D1);
    const r = FROTA_INICIAL.find(f => f.tipo === 'C172' && f.reg !== antes.r).reg;
    dia.estado.fixos = { [antes.fKey]: { ...dia.estado.fixos[antes.fKey], r, agendado: true } };
    await gravar(D1, dia.estado);
    assert.equal(await ApiClient.voltasGravadasDeAntes(D2), true, 'o Noturno mudou de avião');
    await gravar(D2, (await abrir(D2)).estado);
    assert.equal(await ApiClient.voltasGravadasDeAntes(D2), false, 'o dia seguinte regravado');
  });

  it('o Noturno cancelado não ganha pino e a volta sai: o dia seguinte é refeito, com o texto do histórico', async () => {
    const antes = await comODiaSeguinte();
    const dia = await abrir(D1);
    dia.estado.fStatus = { ...dia.estado.fStatus, [antes.fKey]: 'Cancelado' };
    await gravar(D1, dia.estado);
    const seguinte = await abrir(D2);
    assert.deepEqual([seguinte.escala, seguinte.tela.out.filter(o => o.trecho)], [null, []]);
    assert.equal(voltasQueMudaram(seguinte.voltasDeAntes, seguinte.estado.noturnosDaVespera), 'Volta do Noturno (o Noturno de ontem mudou): Aluno 1000: a volta saiu da escala');
  });
});

// A volta do noturno de ontem fica no avião e com o INVA do Noturno (o avião está em BH): o que não está bem com eles hoje
// é um aviso, nunca outro avião. O motor de antes do F1h (o da gravação da conferência) não avisa
describe('Noturno: a volta com o avião ou o INVA indisponível', () => {
  const estado = (alterar = e => e) => alterar(diaSeguinte({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { fly: false })] }));
  const avisos = e => runAllocationEngine(e).al.filter(a => a.codigo === 'volta-do-noturno');
  const volta = e => runAllocationEngine(e).out.find(o => o.trecho === 'volta');
  const casos = {
    'o avião indisponível (em manutenção)': [e => ({ ...e, av: { ...e.av, 'PR-HAR': false } }), 'o avião está indisponível hoje'],
    'o avião inativo': [e => estadoParaEscalar({ ...e, frota: FROTA_INICIAL.map(f => (f.reg === 'PR-HAR' ? { ...f, inativo: true } : f)) }, { data: '2026-12-02', hoje: '2026-12-01' }), 'o avião está inativo'],
    'o avião sem saldo até a revisão de 50 horas': [e => ({ ...e, horas: { ...e.horas, 'PR-HAR': 49.5 } }), 'o avião passaria da revisão de 50 horas'],
    'o INVA inativo': [e => estadoParaEscalar({ ...e, ins: e.ins.map(x => (x.id === 1 ? { ...x, inativo: true } : x)) }, { data: '2026-12-02', hoje: '2026-12-01' }), 'o INVA (Instrutor 01) está inativo'],
    'o INVA que não vem nesta data': [e => ({ ...e, ins: e.ins.map(x => (x.id === 1 ? { ...x, on: false } : x)) }), 'o INVA (Instrutor 01) não está disponível nesta data']
  };
  for (const [rotulo, [alterar, motivo]] of Object.entries(casos)) {
    it(`${rotulo}: a volta fica no PR-HAR, com o aviso`, () => {
      const e = estado(alterar);
      assert.deepEqual([volta(e).r, volta(e).insId], ['PR-HAR', 1]);
      assert.deepEqual(avisos(e), [{ t: 'warn', s: 'Aluno 1000', codigo: 'volta-do-noturno', stuId: 1000, insId: 1, m: `A volta do Noturno de Aluno 1000 fica no PR-HAR (o avião está em BH): ${motivo}.` }]);
      // O motor de antes do F1h não avisa; a escala gravada aceita o aviso
      assert.deepEqual(runAllocationEngine(e, { antesDoF1h: true }).al.filter(a => a.codigo === 'volta-do-noturno'), []);
      const r = runAllocationEngine(e);
      assert.deepEqual(normalizarEscalaGravada(r), r);
    });
  }

  it('tudo junto: um aviso só, com os motivos; a volta cancelada não avisa; com tudo bem, nada', () => {
    const e = estado(casos['o avião indisponível (em manutenção)'][0]);
    e.ins = e.ins.map(x => (x.id === 1 ? { ...x, on: false } : x));
    assert.deepEqual(avisos(e).map(a => a.m), ['A volta do Noturno de Aluno 1000 fica no PR-HAR (o avião está em BH): o avião está indisponível hoje; o INVA (Instrutor 01) não está disponível nesta data.']);
    assert.deepEqual(avisos({ ...e, fStatus: { '1000_0_2': 'Cancelado' } }), []);
    assert.deepEqual(avisos(estado()), []);
  });
});

// O “Priorizar com” do Noturno fixo só pelo pino do Noturno (a revisão): o aviso continua depois da gravação, como antes
// dela; o fixo pela aprovação não avisa, como sempre
describe('Noturno: o “Priorizar com” com o pino do Noturno', () => {
  const voaCom = e => runAllocationEngine(e).al.filter(a => a.codigo === 'voa-com').map(a => a.m);
  const fixado = e => ({ ...e, fixos: pinosDoNoturno(e, runAllocationEngine(e)) });
  it('sem o INVA do “Priorizar com” disponível: o aviso de sempre, também com o pino', () => {
    const e = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { on: false })], stu: [aluno(1000, NOTURNO, { voaCom: [2] })] });
    const aviso = ['Sem o instrutor de “Priorizar com” (Instrutor 02: fora nesta data): o voo ficou com Instrutor 01.'];
    assert.deepEqual(voaCom(e), aviso);
    assert.deepEqual(voaCom(fixado(e)), aviso);
    assert.deepEqual(voaCom({ ...fixado(e), aprovacao: { em: '2026-12-02T10:00:00Z', por: 'Op' } }), []);
  });
  it('o INVA do “Priorizar com” disponível depois de gravado: o Noturno fica fixo com o de agora, e o aviso diz', () => {
    const e = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { on: false })], stu: [aluno(1000, NOTURNO, { voaCom: [2] })] });
    const gravado = fixado(e);
    gravado.ins = gravado.ins.map(x => ({ ...x, on: true }));
    assert.deepEqual(voaCom(gravado), ['Fora do “Priorizar com” de Aluno 1000 (Instrutor 02): o Noturno está fixo com Instrutor 01 (a volta vai com ele).']);
  });
});

// A prévia (scripts/semear-dias-previa.mjs): a data semeada é calculada como o app a abre, com a volta, o aviso do repouso
// antes dela e o pino de cada Noturno
describe('Noturno: a data semeada na prévia', () => {
  it('a mesma escala e os mesmos avisos que o app calcula ao abrir a data', () => {
    const d1 = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, NOTURNO), aluno(1001, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })] });
    const primeiro = escalaSemeada(d1, { anterior: null, dataAnterior: null, data: '2026-12-01' });
    const o = primeiro.resultado.out.find(v => v.mis === 'Noturno');
    assert.deepEqual(d1.fixos, { [o.fKey]: { ...pinoDoVoo(o), noturno: true } });
    const anterior = { ...separar(d1).dia, esquema: ESQUEMA, resultado: primeiro.resultado };
    const d2 = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { fly: false }), aluno(1001, { mis: 'Voo Local', eq: 'C172', p1: 500, p2: -1 })] });
    const { resultado, noturnos } = escalaSemeada(d2, { anterior, dataAnterior: '2026-12-01', data: '2026-12-02' });
    const app = runAllocationEngine({ ...d2, noturnosDaVespera: noturnos, horasDosInstrutores: comRepousoDoNoturno({}, noturnos) });
    assert.deepEqual(resultado.al, app.al);
    assert.ok(resultado.al.some(a => a.codigo === 'repouso-do-noturno'));
    assert.ok(voltasConferem(resultado, noturnos));
  });
});

// Propriedade, em dias gerados: com o pino que a gravação põe, nenhuma alteração comum no dia do Noturno muda o avião ou o
// INVA de um Noturno (o Pousou da tarde, um cancelamento, pedidos novos, o hangar, outro avião indisponível, outro INVA
// que deixa de vir, a aprovação e a reabertura)
describe('Noturno: o mesmo avião em 300 dias gerados', () => {
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const alteracoes = {
    pousou: (e, out) => { for (const o of out.filter(v => v.mis !== 'Noturno' && !v.trecho && !v.isGround && v.b <= 1050)) { e.fStatus = { ...e.fStatus, [o.fKey]: 'Pousou' }; e.fixos = fixosAoMudarStatus(e.fixos, o, 'Pousou', { aprovada: false }); } },
    cancelado: (e, out, r) => { const voos = out.filter(v => v.mis !== 'Noturno' && !v.trecho); if (!voos.length) return; const o = pick(r, voos); e.fStatus = { ...e.fStatus, [o.fKey]: 'Cancelado' }; e.fixos = fixosAoMudarStatus(e.fixos, o, 'Cancelado', { aprovada: false }); },
    pedidos: (e, out, r) => { e.stu = [...e.stu, { id: 99001, nm: 'Extra 1', kg: 70, bl: [], extra: [], fly: true, mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1, nb: 4, ss: 1, pr: 5 }, { id: 99002, nm: 'Extra 2', kg: 70, bl: [], extra: [], fly: true, mis: 'Voo Local', eq: 'C172', p1: pick(r, [390, 500, 610, 980]), p2: -1, nb: 1, ss: 1, pr: 5 }]; },
    hangar: (e, out, r) => { const frota = e.frota || FROTA_INICIAL; e.hangar = moverNoHangar(normalizarHangar(e.hangar, frota), pick(r, frota).reg, 0); },
    aviao: (e, out, r) => { const usados = new Set(out.filter(o => o.mis === 'Noturno').map(o => o.r)); const livres = (e.frota || FROTA_INICIAL).filter(f => !usados.has(f.reg)); if (livres.length) e.av = { ...e.av, [pick(r, livres).reg]: false }; },
    inva: (e, out, r) => { const usados = new Set(out.filter(o => o.mis === 'Noturno').map(o => o.insId)); const outros = e.ins.filter(x => !usados.has(x.id)); if (outros.length) { const id = pick(r, outros).id; e.ins = e.ins.map(x => (x.id === id ? { ...x, on: false } : x)); } },
    reabrir: (e, out) => { e.fixos = fixosAoReabrir(fixosAoAprovar(e.fixos, out), e.fStatus); }
  };

  // Os Noturnos de um dia que mudam de avião ou de INVA depois de duas a quatro alterações seguidas, cada uma gravada (com o
  // pino de cada gravação: ApiClient.salvarDia; comPino: false, o motor de antes dele, sem o pino)
  function mudancas(seed, comPino) {
    const r = mulberry32(seed * 4421 + 7);
    const base = seed % 3 ? gerarCenario(seed) : comVolta(gerarCenario(seed), seed);
    const out = runAllocationEngine(base).out;
    const gravar = e => { if (comPino) e.fixos = pinosDoNoturno(e, runAllocationEngine(e)); };
    gravar(base);
    const nts = out.filter(o => o.mis === 'Noturno' && !o.trecho && o.status !== 'Cancelado');
    const e = structuredClone(base);
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      alteracoes[pick(r, Object.keys(alteracoes))](e, runAllocationEngine(e).out, r);
      gravar(e);
    }
    const depois = runAllocationEngine(e).out;
    const mudaram = nts.flatMap(o => {
      const d = depois.find(v => v.fKey === o.fKey);
      return !d || d.r !== o.r || d.insId !== o.insId ? [`seed ${seed}: ${o.fKey} ${o.r}/${o.insId} → ${d ? `${d.r}/${d.insId}` : 'fora'}`] : [];
    });
    return { noturnos: nts.length, mudaram };
  }

  it('nenhum Noturno muda de avião ou de INVA (os dias têm Noturnos, e sem o pino eles mudariam: o teste não passa por falta disso)', () => {
    const SEMENTES = Array.from({ length: 300 }, (_, i) => i + 1);
    const comPino = SEMENTES.map(seed => mudancas(seed, true));
    const semPino = SEMENTES.flatMap(seed => mudancas(seed, false).mudaram);
    const noturnos = comPino.reduce((n, d) => n + d.noturnos, 0);
    assert.ok(noturnos > 100 && semPino.length > 20, `${noturnos} Noturnos; sem o pino, ${semPino.length} mudariam`);
    assert.deepEqual(comPino.flatMap(d => d.mudaram), []);
  });
});

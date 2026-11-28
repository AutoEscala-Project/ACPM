// Requisitos dos voos e atributos dos recursos: o voo IFR (inclusive o noturno do PC) só no avião homologado IFR e com
// o instrutor IFR; o recurso com habilitação própria (o PR-VOM) só com quem a tem; o simulador começa com 2 h. Uma regra
// só (js/frota.js e js/habilitacoes.js) vale no motor, na compactação, na divisão das horas e nas sugestões.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { aviaoServe, motivoDoAviao, exigenciasDoAviao, matriculasParaOVoo, normalizarFrota, novoRecurso, instrutorVoaNoAviao, habilitacaoQueFalta } from '../../js/frota.js';
import { TEXTO_DO_PROBLEMA } from '../../js/conflitos.js';
import { exigencias, podeFazer, normalizarHabilitacoes, nomeDaHabilitacao, descreverExigencias, habilitacoesDoNivel } from '../../js/habilitacoes.js';
import { duracaoPadraoDaMissao } from '../../js/rules.js';
import { migrarCadastro } from '../../js/migracoes.js';
import { validarReversao } from '../../js/reversoes.js';
import { sugerirReparos } from '../../js/reparo.js';
import { pedidoDaSolicitacao } from '../../js/agenda.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

// Uma frota pequena: dois C172 (o PR-CPL só VFR) e dois PA-34 (o PR-VOM com habilitação própria)
const FROTA = [
  { reg: 'PR-CPL', tipo: 'C172', soVfr: true }, { reg: 'PR-HAR', tipo: 'C172' },
  { reg: 'PR-VOM', tipo: 'PA-34', habilitacaoPropria: true }, { reg: 'PT-JOB', tipo: 'PA-34' }
];
const comFrota = (opts, frota = FROTA, av = {}) => {
  const estado = cenario(opts);
  estado.frota = frota;
  estado.av = Object.fromEntries(frota.map(f => [f.reg, av[f.reg] !== false]));
  return estado;
};
const comHab = (id, hab, extra = {}) => instrutor(id, 1, { hab, ...extra });
const C172_IFR = ['ifr', 'c172', 'noturno', 'local'];
const MLTE = ['mlte', 'local'];
const escala = estado => runAllocationEngine(estado, { compactar: false });

describe('Atributos dos recursos (js/frota.js)', () => {
  it('o voo IFR não vai para o avião "Só VFR"; o VFR, sim; o noturno do PC é IFR, o do PP não', () => {
    const cpl = FROTA[0];
    assert.equal(aviaoServe(cpl, { mis: 'Voo Local', eq: 'C172' }), true);
    assert.equal(motivoDoAviao(cpl, { mis: 'IFR', eq: 'C172' }), 'so-vfr');
    assert.equal(motivoDoAviao(cpl, { mis: 'Cheque PC MNTE IFR', eq: 'C172' }), 'so-vfr');
    assert.equal(motivoDoAviao(cpl, { mis: 'Noturno', eq: 'C172', curso: 'PC' }), 'so-vfr');
    assert.equal(motivoDoAviao(cpl, { mis: 'Noturno', eq: 'C172', curso: 'PP' }), null);
    assert.equal(motivoDoAviao(cpl, { mis: 'Voo Local', eq: 'PA-34' }), 'tipo-de-aviao');
    assert.equal(motivoDoAviao({ reg: 'PR-JPL', tipo: 'C152', soParafuso: true }, { mis: 'Voo Local', eq: 'C152' }), 'so-parafuso');
    assert.equal(motivoDoAviao({ reg: 'PR-A', tipo: 'C152' }, { mis: 'Parafuso', eq: 'C152' }), 'so-parafuso');
    assert.deepEqual(matriculasParaOVoo(FROTA, { mis: 'IFR', eq: 'C172' }), ['PR-HAR']);
    assert.deepEqual(matriculasParaOVoo(FROTA, { mis: 'Voo Local', eq: 'C172' }), ['PR-CPL', 'PR-HAR']);
  });

  it('o recurso com habilitação própria exige do instrutor a dele', () => {
    assert.deepEqual(exigenciasDoAviao(FROTA[2]), ['aviao:PR-VOM']);
    assert.deepEqual(exigenciasDoAviao(FROTA[3]), []);
    assert.equal(instrutorVoaNoAviao({ hab: ['mlte'] }, FROTA[2]), false);
    assert.equal(instrutorVoaNoAviao({ hab: ['mlte', 'aviao:PR-VOM'] }, FROTA[2]), true);
  });

  it('os atributos ficam só nos tipos em que valem; um recurso novo pode vir com eles', () => {
    assert.deepEqual(normalizarFrota([
      { reg: 'PR-A', tipo: 'C172', soVfr: true, soParafuso: true, habilitacaoPropria: 'sim' },
      { reg: 'PR-B', tipo: 'C152', soVfr: true, habilitacaoPropria: true },
      { reg: 'SIM-X', tipo: 'Sim. Mono', habilitacaoPropria: true, soVfr: true }
    // A habilitação própria vem com a lista exige (formato 26), de que ela é o espelho
    ]), [{ reg: 'PR-A', tipo: 'C172', soVfr: true }, { reg: 'PR-B', tipo: 'C152', habilitacaoPropria: true, exige: ['aviao:PR-B'] }, { reg: 'SIM-X', tipo: 'Sim. Mono', habilitacaoPropria: true, exige: ['aviao:SIM-X'] }]);
    assert.deepEqual(novoRecurso([], { reg: 'pr-new', tipo: 'PA-34', soVfr: true, habilitacaoPropria: true }), { recurso: { reg: 'PR-NEW', tipo: 'PA-34', soVfr: true, habilitacaoPropria: true, exige: ['aviao:PR-NEW'] } });
  });
});

describe('Requisitos do voo e habilitações (js/habilitacoes.js)', () => {
  it('o noturno do PC exige IFR; o avião com habilitação própria, a dele', () => {
    assert.deepEqual(exigencias('Noturno', 'C172'), [['noturno'], ['c172']]);
    assert.deepEqual(exigencias('Noturno', 'C172', { curso: 'PC' }), [['noturno'], ['c172'], ['ifr']]);
    assert.deepEqual(exigencias('Multimotor', 'PA-34', { recurso: FROTA[2] }), [['mlte'], ['aviao:PR-VOM']]);
    assert.equal(podeFazer({ hab: ['noturno', 'c172'] }, 'Noturno', 'C172', { curso: 'PP' }), true);
    assert.equal(podeFazer({ hab: ['noturno', 'c172'] }, 'Noturno', 'C172', { curso: 'PC' }), false);
    assert.equal(descreverExigencias('Noturno', 'C172', { curso: 'PC' }), 'Voo Noturno + C172 + Voo IFR');
    assert.equal(descreverExigencias('Multimotor', 'PA-34', { recurso: FROTA[2] }), 'MLTE (PA-34) + Avião PR-VOM');
  });

  it('a habilitação própria de um recurso é uma habilitação válida, depois das da grade', () => {
    assert.deepEqual(normalizarHabilitacoes(['aviao:PR-VOM', 'mlte', 'aviao:PR x', 'aviao:', 'mlte']), ['mlte', 'aviao:PR-VOM']);
    assert.equal(nomeDaHabilitacao('aviao:PR-VOM'), 'Avião PR-VOM');
    // Os níveis antigos não dão a habilitação própria
    assert.ok(!habilitacoesDoNivel(9).some(h => h.startsWith('aviao:')));
  });
});

describe('O motor com os requisitos e os atributos', () => {
  it('o voo IFR no C172 vai para o avião homologado IFR; sem ele, fica fora com o motivo', () => {
    const ifr = { mis: 'IFR', eq: 'C172' };
    const { out } = escala(comFrota({ ins: [comHab(1, C172_IFR)], stu: [aluno(1000, ifr)] }));
    assert.deepEqual(out.map(o => o.r), ['PR-HAR']);
    const semHar = escala(comFrota({ ins: [comHab(1, C172_IFR)], stu: [aluno(1000, ifr)] }, FROTA, { 'PR-HAR': false }));
    assert.deepEqual(semHar.al.map(a => [a.codigo, a.m]), [['sem-aviao', 'Rejeitado: nenhum C172 homologado IFR disponível (o voo é IFR; os disponíveis são “Só VFR”).']]);
    // O VFR pode ir para o PR-CPL
    const vfr = escala(comFrota({ ins: [comHab(1, C172_IFR)], stu: [aluno(1000, { mis: 'Voo Local', eq: 'C172' })] }, FROTA, { 'PR-HAR': false }));
    assert.deepEqual(vfr.out.map(o => o.r), ['PR-CPL']);
  });

  it('o noturno do PC vai para o instrutor IFR, no avião homologado IFR; o do PP, para qualquer um', () => {
    const noturno = { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 };
    const ins = [comHab(1, ['noturno', 'c172']), comHab(2, C172_IFR)];
    const pc = escala(comFrota({ ins, stu: [aluno(1000, noturno, { curso: 'PC' })] }));
    assert.deepEqual(pc.out.map(o => [o.insId, o.r]), [[2, 'PR-HAR']]);
    const pp = escala(comFrota({ ins, stu: [aluno(1000, noturno, { curso: 'PP' })] }));
    assert.deepEqual(pp.out.map(o => o.insId), [1]);
    const semIfr = escala(comFrota({ ins: [comHab(1, ['noturno', 'c172'])], stu: [aluno(1000, noturno, { curso: 'PC' })] }));
    assert.deepEqual(semIfr.al.map(a => a.codigo), ['sem-instrutor-habilitado']);
    assert.match(semIfr.al[0].m, /Voo Noturno \+ C172 \+ Voo IFR/);
  });

  it('o PR-VOM só com quem tem a habilitação dele: o motor escolhe o par instrutor e avião', () => {
    const mlte = { mis: 'Multimotor', eq: 'PA-34' };
    // Só o PR-VOM livre: o instrutor com menos habilitações não o voa, e o voo vai para o que tem a habilitação própria
    const ins = [comHab(1, MLTE), comHab(2, [...MLTE, 'ifr', 'aviao:PR-VOM'])];
    const soVom = escala(comFrota({ ins, stu: [aluno(1000, mlte)] }, FROTA, { 'PT-JOB': false }));
    assert.deepEqual(soVom.out.map(o => [o.insId, o.r]), [[2, 'PR-VOM']]);
    // Com o PT-JOB livre, o de menos habilitações voa nele
    const comJob = escala(comFrota({ ins, stu: [aluno(1000, mlte)] }));
    assert.deepEqual(comJob.out.map(o => [o.insId, o.r]), [[1, 'PT-JOB']]);
    // Sem ninguém com a habilitação própria, fica fora com o motivo
    const ninguem = escala(comFrota({ ins: [comHab(1, MLTE)], stu: [aluno(1000, mlte)] }, FROTA, { 'PT-JOB': false }));
    assert.deepEqual(ninguem.al.map(a => a.codigo), ['habilitacao-do-aviao']);
    // O texto diz onde marcar (C, "texto": a tela é INVAs, e a habilitação fica no detalhe do INVA)
    assert.equal(ninguem.al[0].m, 'Rejeitado: os PA-34 livres exigem do instrutor uma habilitação que nenhum instrutor livre tem (marque no INVA, em Habilitações).');
    // Com o INVA escolhido, o nome dele
    const comEscolhido = escala(comFrota({ ins: [comHab(1, MLTE)], stu: [aluno(1000, { ...mlte, insId: 1 })] }, FROTA, { 'PT-JOB': false }));
    assert.deepEqual(comEscolhido.al.map(a => [a.codigo, a.m]), [['habilitacao-do-aviao', 'Rejeitado: os PA-34 livres exigem do instrutor uma habilitação que Instrutor 01 não tem (marque no INVA, em Habilitações).']]);
  });

  // Achados da revisão: o aviso do "Priorizar com" e a rejeição do voo IFR dizem o motivo certo
  it('o "Priorizar com" sem a habilitação própria do avião livre: o aviso diz isso', () => {
    const ins = [comHab(1, MLTE), comHab(2, [...MLTE, 'aviao:PR-VOM'])];
    const { out, al } = escala(comFrota({ ins, stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }, { voaCom: [1] })] }, FROTA, { 'PT-JOB': false }));
    assert.deepEqual(out.map(o => o.insId), [2]);
    assert.deepEqual(al.map(a => a.m), ['Sem o instrutor de “Priorizar com” (Instrutor 01: sem a habilitação que os aviões livres exigem): o voo ficou com Instrutor 02.']);
  });

  it('com o avião homologado IFR ocupado e o "Só VFR" livre, a rejeição diz que o voo é IFR', () => {
    const ifr = { mis: 'IFR', eq: 'C172', jan: 'h500' };
    const { out, al } = escala(comFrota({ ins: [comHab(1, C172_IFR), comHab(2, C172_IFR)], stu: [aluno(1000, ifr), aluno(1001, ifr)] }));
    assert.deepEqual(out.map(o => o.r), ['PR-HAR']);
    // Só às 08:20 e recusado por falta de avião nesse horário: espera por ele (F1h, N14)
    assert.deepEqual(al.map(a => [a.codigo, a.m, a.espera]), [['avioes-ocupados', 'Rejeitado: nenhum C172 homologado IFR livre nos horários possíveis (o voo é IFR; os “Só VFR” não servem a ele); 1º na lista de espera das 08:20.', { minuto: 500, lugar: 1 }]]);
  });

  it('a divisão das horas, a compactação e a troca de matrículas não levam o voo para quem não voa no avião', () => {
    // Dois voos no PR-VOM com o instrutor 2 (o único habilitado nele); o instrutor 1 está livre e tem menos horas
    const ins = [comHab(1, MLTE), comHab(2, [...MLTE, 'aviao:PR-VOM'])];
    const stu = [aluno(1000, { mis: 'Multimotor', eq: 'PA-34', p1: 390 }), aluno(1001, { mis: 'Multimotor', eq: 'PA-34', p1: 500 })];
    const { out } = runAllocationEngine(comFrota({ ins, stu }, FROTA, { 'PT-JOB': false }));
    assert.deepEqual(out.map(o => [o.insId, o.r]), [[2, 'PR-VOM'], [2, 'PR-VOM']]);
  });

  it('o voo fixo no avião que não serve mais, ou com o instrutor sem a habilitação dele, fica em conflito', () => {
    const estado = comFrota({ ins: [comHab(1, C172_IFR), comHab(2, MLTE)], stu: [aluno(1000, { mis: 'IFR', eq: 'C172' }), aluno(1001, { mis: 'Multimotor', eq: 'PA-34' })] });
    estado.fixos = { '1000_0_1': { a: 500, b: 560, r: 'PR-CPL', insId: 1 }, '1001_0_1': { a: 500, b: 560, r: 'PR-VOM', insId: 2 } };
    const { out } = runAllocationEngine(estado);
    const por = k => out.find(o => o.fKey === k);
    assert.deepEqual([por('1000_0_1').conflitoCodigos, por('1000_0_1').conflito], [['so-vfr'], ['o PR-CPL não é homologado IFR, e o voo é IFR']]);
    assert.deepEqual([por('1001_0_1').conflitoCodigos, por('1001_0_1').conflito], [['habilitacao'], ['o instrutor não tem a habilitação própria do PR-VOM']]);
  });

  it('as sugestões só propõem o avião que serve e o instrutor que voa nele', () => {
    const estado = comFrota({ ins: [comHab(1, C172_IFR), comHab(2, MLTE), comHab(3, [...MLTE, 'aviao:PR-VOM'])],
      stu: [aluno(1000, { mis: 'IFR', eq: 'C172' }), aluno(1001, { mis: 'Multimotor', eq: 'PA-34' })] }, FROTA, { 'PT-JOB': false });
    estado.fixos = { '1000_0_1': { a: 500, b: 560, r: 'PR-CPL', insId: 1 }, '1001_0_1': { a: 500, b: 560, r: 'PR-VOM', insId: 2 } };
    const res = runAllocationEngine(estado);
    const textos = k => sugerirReparos(estado, res, k).map(o => o.texto);
    assert.deepEqual(textos('1000_0_1').filter(t => t.startsWith('Trocar')), ['Trocar o avião: PR-HAR']);
    assert.deepEqual(textos('1001_0_1').filter(t => t.startsWith('Trocar')), ['Trocar o instrutor: Instrutor 03']);
  });
});

describe('Duração padrão, dados e histórico', () => {
  it('o simulador começa com 2 h; o Ground com 01h30; as outras missões com 1 h', () => {
    assert.deepEqual(['Simulador', 'Ground C152', 'Voo Local', 'Noturno'].map(duracaoPadraoDaMissao), [2, 1.5, 1, 4]);
    assert.equal(pedidoDaSolicitacao({ missao: 'Simulador', janela: 'horario', horario: '08:20' }, undefined).nb, 2);
  });

  it('formato 23: o PR-CPL fica "Só VFR" e o PR-VOM com habilitação própria; o que já estava marcado fica', () => {
    const frota = [{ reg: 'PR-CPL', tipo: 'C172' }, { reg: 'PR-VOM', tipo: 'PA-34' }, { reg: 'PR-HAR', tipo: 'C172' }];
    assert.deepEqual(migrarCadastro({ esquema: 22, nid: 1000, ins: [], stu: [], frota }).frota,
      // (e o 26 põe a habilitação própria do PR-VOM na lista exige)
      [{ reg: 'PR-CPL', tipo: 'C172', soVfr: true }, { reg: 'PR-VOM', tipo: 'PA-34', habilitacaoPropria: true, exige: ['aviao:PR-VOM'] }, { reg: 'PR-HAR', tipo: 'C172' }]);
    const desmarcado = [{ reg: 'PR-CPL', tipo: 'C172', soVfr: false }];
    assert.deepEqual(migrarCadastro({ esquema: 22, nid: 1000, ins: [], stu: [], frota: desmarcado }).frota, desmarcado);
    assert.ok(FROTA_INICIAL.find(f => f.reg === 'PR-CPL').soVfr);
  });

  it('a reversão de um atributo vale só no formato do app', () => {
    const rev = { kind: 'setAtributo', reg: 'PR-CPL', atributo: 'soVfr', val: false, label: '↶ Reverter' };
    assert.deepEqual(validarReversao(rev, FROTA_INICIAL), rev);
    for (const ruim of [{ ...rev, atributo: 'outro' }, { ...rev, atributo: '__proto__' }, { ...rev, reg: 'x y' }, { ...rev, val: 'sim' }]) {
      assert.equal(validarReversao(ruim, FROTA_INICIAL), null, JSON.stringify(ruim));
    }
  });
});

// O que o recurso exige além da habilitação própria (formato 26): o motivo é a primeira que falta ao instrutor, e o texto a
// diz pelo nome (a habilitação própria continua com o texto de antes)
describe('O que o recurso exige: o motivo e o texto', () => {
  const instrutor = { hab: ['local', 'c172'] };
  it('o motivo é a primeira habilitação da lista exige que o instrutor não tem', () => {
    assert.equal(habilitacaoQueFalta(instrutor, { reg: 'PR-X', tipo: 'C172', exige: ['ifr', 'aviao:PR-X'] }), 'ifr');
    assert.equal(habilitacaoQueFalta({ hab: ['ifr'] }, { reg: 'PR-X', tipo: 'C172', exige: ['ifr', 'aviao:PR-X'] }), 'aviao:PR-X');
    assert.equal(habilitacaoQueFalta({ hab: ['ifr', 'aviao:PR-X'] }, { reg: 'PR-X', tipo: 'C172', exige: ['ifr', 'aviao:PR-X'] }), null);
  });

  it('o conflito do voo fixo: a habilitação própria pela matrícula; outra, pelo nome', () => {
    assert.equal(TEXTO_DO_PROBLEMA.habilitacao({ motivo: 'aviao:PR-VOM' }), 'o instrutor não tem a habilitação própria do PR-VOM');
    assert.equal(TEXTO_DO_PROBLEMA.habilitacao({ motivo: 'ifr' }), 'o instrutor não tem a habilitação que o recurso exige (Voo IFR)');
    assert.equal(TEXTO_DO_PROBLEMA.habilitacao({}), 'o instrutor não tem a habilitação da missão');
  });
});

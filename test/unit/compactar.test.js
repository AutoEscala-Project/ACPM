// Compactação da escala: depois de montada a escala e divididas as horas, voos mudam de horário ou de
// instrutor para fechar os buracos do dia, pelo critério que o operador escolhe (os buracos dos INVAs, os dos aviões ou
// o maior buraco primeiro) e pela regra dos horários (dentro da disponibilidade do aluno, só entre a 1ª e a 2ª
// preferência, ou sem mudar os horários). Todas as regras da escala continuam valendo, a divisão das horas não piora e
// os voos fixos não mudam.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { compactar, custoDaEscala } from '../../js/compactar.js';
import { CRITERIOS_PADRAO, normalizarCriterios } from '../../js/criterios.js';
import { AIRCRAFT_EQ_TYPES, T, NI } from '../../js/config.js';
import { categoriaDoRodizio } from '../../js/rodizio.js';
import { LIMITES_DA_LEI, dentroDosLimites } from '../../js/limites.js';
import { disponibilidadeDoAluno } from '../../js/rules.js';
import { minutoDaPreferencia } from '../../js/horarios.js';
import { metricasDaEscala } from '../../js/metricas.js';
import { hm } from '../../js/format.js';
import { aluno, cenario, instrutor, missaoExtra, apenas } from '../helpers/montar.js';
import { gerarCenario, comEscolhas, comAtributos, comVolta } from '../helpers/cenarios.js';

const doAluno = (out, id) => out.find(o => o.stuId === id);
const com = (estado, criterios) => ({ ...estado, criterios: { ...CRITERIOS_PADRAO, ...criterios } });
const unicos = out => [...new Map(out.map(o => [o.classKey, o])).values()];
const paradoDos = (out, id) => {
  const lista = unicos(out).filter(o => o.insId === id).map(o => [o.a, o.b]).sort((p, q) => p[0] - q[0]);
  return lista.slice(1).reduce((total, [a], i) => total + Math.max(0, a - lista[i][1]), 0);
};
// Só a tarde de um instrutor (os períodos de 12:40 a 16:20)
const TARDE = [false, false, false, false, true, true, true, true, false];

describe('Critérios da compactação', () => {
  it('o padrão: os buracos dos INVAs, dentro da disponibilidade; valor inválido volta ao padrão', () => {
    assert.deepEqual(CRITERIOS_PADRAO, { buracos: 'inva', horarios: 'disponibilidade' });
    assert.deepEqual(normalizarCriterios(undefined), CRITERIOS_PADRAO);
    assert.deepEqual(normalizarCriterios({ buracos: 'aviao', horarios: 'x' }), { buracos: 'aviao', horarios: 'disponibilidade' });
    assert.deepEqual(normalizarCriterios({ buracos: 'maior', horarios: 'fixos', extra: 1 }), { buracos: 'maior', horarios: 'fixos' });
  });
});

describe('Compactação: os horários', () => {
  // O instrutor voa às 06:30 (o aluno 1000 só pode nessa hora) e às 13:40: 6h10 parado no meio do dia
  const buraco = (pedido = {}) => cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' }), aluno(1001, { p1: 820, p2: -1, ...pedido })] });

  it('dentro da disponibilidade: o voo da tarde vem para logo depois do primeiro; o horário fica "ajustado"', () => {
    const voo = doAluno(runAllocationEngine(buraco()).out, 1001);
    assert.deepEqual([voo.a, voo.b, voo.w], [500, 560, 1]);
    assert.deepEqual([voo.baseTag, voo.tag], ['Horário ajustado', 'Horário ajustado']);
  });

  it('a disponibilidade de cada aluno vale: quem só pode à tarde vem para as 12:40, e o das 06:30 continua às 06:30', () => {
    const { out } = runAllocationEngine(buraco({ jan: 'tarde' }));
    assert.deepEqual(out.map(o => [o.stuId, o.a]), [[1000, 390], [1001, 760]]);
  });

  it('só entre a 1ª e a 2ª preferência: vai para a 2ª, mais perto; sem a 2ª, fica', () => {
    const comP2 = doAluno(runAllocationEngine(com(buraco({ p2: 610 }), { horarios: 'preferencias' })).out, 1001);
    assert.deepEqual([comP2.a, comP2.baseTag], [610, 'Pref. 2']);
    assert.equal(doAluno(runAllocationEngine(com(buraco(), { horarios: 'preferencias' })).out, 1001).a, 820);
  });

  it('sem mudar os horários: o voo fica onde a escala pôs', () => {
    assert.equal(doAluno(runAllocationEngine(com(buraco(), { horarios: 'fixos' })).out, 1001).a, 820);
  });

  it('o voo fixo (escala aprovada) não muda; o resto da escala continua igual em volta dele', () => {
    const { out } = runAllocationEngine({ ...buraco(), fixos: { '1001_0_1': { a: 820, b: 880, r: 'PP-LJV', insId: 1 } } });
    assert.equal(doAluno(out, 1001).a, 820);
  });

  // A regra do motor: o Noturno só sai às 17:30, e o aluno que tem um na demanda do dia termina as outras missões antes
  // dele, também quando o Noturno não entrou na escala ou foi cancelado. O simulador (2 h, 1ª preferência às 16:20)
  // fica às 14:30; levado para a 1ª preferência, iria até as 18:20
  it('o aluno com o Noturno no dia (rejeitado ou cancelado) não tem o simulador levado para depois das 17:30', () => {
    const sim = missaoExtra(1, { mis: 'Simulador', eq: 'Sim. Mono', nb: 2, p1: 980, p2: -1 });
    const comNoturno = (pedido, opcoes = {}) => cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Noturno', eq: 'C172', nb: 1, p1: 8, p2: 8, ...pedido }, { extra: [sim] })], ...opcoes });
    const simulador = estado => runAllocationEngine(estado).out.filter(o => o.mis === 'Simulador').map(o => [hm(o.a), hm(o.b)]);
    assert.deepEqual(simulador(comNoturno({}, { semAeronaves: apenas('C172') })), [['14:30', '16:30']], 'o Noturno rejeitado (nenhum C172)');
    assert.deepEqual(simulador(comNoturno({}, { fStatus: { '1000_0_1': 'Cancelado' } })), [['14:30', '16:30']], 'o Noturno cancelado');
    // Sem o Noturno na demanda, o simulador pode ir até depois das 17:30: fica na 1ª preferência
    assert.deepEqual(simulador(comNoturno({ fly: false })), [['16:20', '18:20']]);
  });

  // Os dias gerados em que a compactação levava o simulador de quem tem o Noturno no dia para depois das 17:30
  it('nos dias gerados, quem tem o Noturno no dia termina as outras missões até as 17:30', () => {
    const dias = [['129', gerarCenario(129)], ['129 com a volta do noturno', comVolta(gerarCenario(129), 129)],
      ['241 com escolhas', comEscolhas(gerarCenario(241), 241)], ['277', gerarCenario(277)], ['277 com atributos', comAtributos(gerarCenario(277), 277)]];
    for (const [seed, estado] of dias) {
      const comNoturno = new Set(estado.stu.filter(s => [s, ...s.extra].some(p => p.fly && p.mis === 'Noturno')).map(s => s.id));
      const depois = runAllocationEngine(estado).out.filter(o => comNoturno.has(o.stuId) && o.mis !== 'Noturno' && o.b > T[NI]);
      assert.deepEqual(depois.map(o => `${o.fKey} ${o.mis} ${hm(o.a)}–${hm(o.b)}`), [], `seed ${seed}`);
    }
  });
});

describe('Compactação: os critérios', () => {
  it('INVA x Maior buraco: com o mesmo tempo parado, o maior buraco divide o buraco; o INVA deixa na 1ª preferência', () => {
    // 06:30 e 14:30 só nessa hora; o voo do meio pode a qualquer hora (1ª preferência às 08:20)
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' }), aluno(1001, { p1: 500, p2: -1 }), aluno(1002, { p1: 870, p2: -1, jan: 'h870' })] });
    assert.equal(runAllocationEngine(base).out.length, 3);
    assert.equal(doAluno(runAllocationEngine(base).out, 1001).a, 500);
    assert.equal(doAluno(runAllocationEngine(com(base, { buracos: 'maior' })).out, 1001).a, 610, '10:10: 2h40 e 3h20 parado em vez de 50 min e 5h10');
  });

  it('INVA x Avião: cada instrutor com um voo, no mesmo avião, às 06:30 e às 13:40; só o critério do avião aproxima os voos', () => {
    const base = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' }), aluno(1001, { p1: 820, p2: -1 })] });
    const inva = runAllocationEngine(base).out, aviao = runAllocationEngine(com(base, { buracos: 'aviao' })).out;
    assert.notEqual(doAluno(inva, 1000).insId, doAluno(inva, 1001).insId);
    assert.equal(doAluno(inva, 1000).r, doAluno(inva, 1001).r);
    assert.equal(doAluno(inva, 1001).a, 820, 'nenhum instrutor fica parado: a 1ª preferência vale mais');
    assert.equal(doAluno(aviao, 1001).a, 500, '08:20, logo depois do primeiro voo do avião');
    assert.ok(metricasDaEscala(aviao).avioesParadoMin < metricasDaEscala(inva).avioesParadoMin);
  });
});

describe('Compactação: os instrutores', () => {
  it('passa o voo para o instrutor que já voa ao lado dele, sem piorar a divisão das horas', () => {
    // O instrutor 2 só vem à tarde; a escala dá a ele o voo das 13:40 e ao 1 os das 06:30 e 12:40 (5h10 parado)
    const base = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9, { aw: TARDE })],
      stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' }), aluno(1001, { p1: 820, p2: -1, jan: 'h820' }), aluno(1002, { p1: 760, p2: -1, jan: 'h760' })]
    });
    const { out } = runAllocationEngine(base);
    assert.deepEqual(out.map(o => [o.stuId, o.a, o.insId]), [[1000, 390, 1], [1002, 760, 2], [1001, 820, 2]]);
  });

  it('troca dois voos de mesma duração entre dois instrutores com horas iguais', () => {
    // Pela prioridade, o instrutor 1 fica com 06:30 e 13:40, e o 2 com 08:20 e 16:20; trocados, os dois param menos
    const base = cenario({
      ins: [instrutor(1, 1), instrutor(2, 9)],
      stu: [
        aluno(1000, { p1: 390, p2: -1, jan: 'h390', pr: 5 }), aluno(1002, { p1: 500, p2: -1, jan: 'h500', pr: 4 }),
        aluno(1001, { p1: 820, p2: -1, jan: 'h820', pr: 3 }), aluno(1003, { p1: 980, p2: -1, jan: 'h980', pr: 2 })
      ]
    });
    const { out } = runAllocationEngine(base);
    assert.equal(paradoDos(out, 1) + paradoDos(out, 2), 150);
    assert.deepEqual([out.filter(o => o.insId === 1).length, out.filter(o => o.insId === 2).length], [2, 2]);
  });
});

// Dias gerados com a disponibilidade dos alunos sorteada (manhã, tarde, um horário exato ou qualquer horário) e alguns
// voos fixos
describe('Compactação: em dias gerados', async () => {
  const { gerarCenario, mulberry32 } = await import('../helpers/cenarios.js');
  const JANS = [undefined, undefined, 'manha', 'tarde', 'h500', 'h820'];
  function dia(seed) {
    const sorteio = mulberry32(seed * 7);
    const estado = gerarCenario(seed);
    const comJan = p => ({ ...p, jan: JANS[Math.floor(sorteio() * JANS.length)] });
    return { ...estado, stu: estado.stu.map(s => ({ ...comJan(s), extra: s.extra.map(comJan) })) };
  }
  const COMBINACOES = ['inva', 'aviao', 'maior'].flatMap(buracos => ['disponibilidade', 'preferencias', 'fixos'].map(horarios => ({ buracos, horarios })));
  const SEEDS = Array.from({ length: 25 }, (_, i) => 4001 + i);
  const execucoes = COMBINACOES.flatMap(criterios => SEEDS.map(seed => {
    const estado = com(dia(seed), criterios);
    return { seed, criterios, estado, antes: runAllocationEngine(estado, { compactar: false }), depois: runAllocationEngine(estado) };
  }));
  const pedidoDe = (estado, o) => { const s = estado.stu.find(x => x.id === o.stuId); return o.mid ? s.extra.find(ex => ex.mid === o.mid) : s; };
  const emTodas = verificar => {
    const falhas = [];
    for (const e of execucoes) {
      try { verificar(e); } catch (erro) { falhas.push(`seed ${e.seed} ${e.criterios.buracos}/${e.criterios.horarios}: ${erro.message}`); }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} execuções falharam`);
  };

  it('os mesmos voos, com as mesmas durações e alunos; nenhum some', () => emTodas(({ antes, depois }) => {
    const chave = o => `${o.fKey}|${o.b - o.a}|${o.stuId}|${o.mis}`;
    assert.deepEqual(depois.out.map(chave).sort(), antes.out.map(chave).sort());
    assert.deepEqual(depois.al.filter(a => a.t === 'err'), antes.al.filter(a => a.t === 'err'));
  }));

  it('a divisão das horas não piora (a soma dos quadrados das horas não cresce)', () => emTodas(({ estado, antes, depois }) => {
    const ativos = estado.ins.filter(x => x.on).map(x => x.id);
    assert.ok(metricasDaEscala(depois.out, { ativos }).somaDosQuadrados <= metricasDaEscala(antes.out, { ativos }).somaDosQuadrados + 1e-9);
  }));

  it('o custo do critério escolhido nunca aumenta', () => emTodas(({ estado, antes, depois }) => {
    assert.ok(custoDaEscala(depois.out, estado) <= custoDaEscala(antes.out, estado) + 1e-6);
  }));

  it('os horários respeitam a regra escolhida e a disponibilidade de cada aluno', () => emTodas(({ estado, criterios, antes, depois }) => {
    for (const o of depois.out) {
      const anterior = antes.out.find(v => v.fKey === o.fKey);
      if (o.a === anterior.a) continue;
      const pedido = pedidoDe(estado, o);
      assert.notEqual(criterios.horarios, 'fixos', `${o.fKey} mudou de horário`);
      if (criterios.horarios === 'preferencias') assert.ok([minutoDaPreferencia(pedido.p1), minutoDaPreferencia(pedido.p2)].includes(o.a), `${o.fKey} às ${o.a}, fora das preferências`);
      const permitidas = disponibilidadeDoAluno(pedido.jan);
      assert.ok(!permitidas || permitidas(o.a), `${o.fKey} às ${o.a}, fora da disponibilidade ${pedido.jan}`);
      assert.ok(!o.isGround && o.mis !== 'Noturno', `${o.fKey} (${o.mis}) mudou de horário`);
    }
  }));

  it('os voos do rodízio ficam com o mesmo instrutor; o peso continua conferido e o combustível não piora', () => emTodas(({ antes, depois }) => {
    for (const o of depois.out) {
      const anterior = antes.out.find(v => v.fKey === o.fKey);
      if (categoriaDoRodizio(o.mis, o.eqType)) assert.equal(o.insId, anterior.insId, `${o.fKey} trocou de instrutor`);
      if (o.insId === anterior.insId || o.isGround) continue;
      if (o.limKg && o.stuKg) assert.ok(o.insKg > 0, `${o.fKey}: instrutor sem peso`);
      assert.ok((o.comb ? o.comb.reduzirGal : 0) <= (anterior.comb ? anterior.comb.reduzirGal : 0), `${o.fKey}: combustível pior`);
    }
  }));

  it('cada instrutor continua dentro dos limites da lei (também num dia em que fechar um buraco passaria da jornada)', () => {
    const dentroDaLei = out => {
      for (const [id, deles] of Map.groupBy(unicos(out), o => o.insId)) {
        const [novo, ...resto] = deles.map(o => ({ a: o.a, b: o.b, voo: AIRCRAFT_EQ_TYPES.includes(o.eqType) }));
        assert.ok(dentroDosLimites({ compromissos: resto, novo, historico: null, limites: LIMITES_DA_LEI }).ok, `instrutor ${id}`);
      }
    };
    emTodas(({ depois }) => dentroDaLei(depois.out));
    // Os dias gerados não chegam perto dos limites. Neste, o instrutor 2 voa às 06:30 e às 14:30 (os alunos não voam com
    // o 1) e o 1, às 08:20, 10:10 e 16:20: passar o das 16:20 para o 2 fecharia o buraco do 1, mas a jornada do 2 iria
    // das 06:00 às 17:50, mais de 11 h
    const { out } = runAllocationEngine(cenario({ ins: [instrutor(1, 1), instrutor(2, 9)], stu: [
      aluno(1000, { p1: 390, p2: -1, jan: 'h390' }, { bl: [1] }), aluno(1001, { p1: 870, p2: -1, jan: 'h870' }, { bl: [1] }),
      aluno(1002, { p1: 500, p2: -1, jan: 'h500' }), aluno(1003, { p1: 610, p2: -1, jan: 'h610' }), aluno(1004, { p1: 980, p2: -1, jan: 'h980' })
    ] }));
    dentroDaLei(out);
  });

  it('os voos fixos não mudam', () => {
    for (const seed of SEEDS) {
      const estado = dia(seed);
      const base = runAllocationEngine(estado, { compactar: false });
      // Fixa um voo a cada três (as turmas de Ground inteiras)
      const turmas = [...new Set(base.out.map(o => o.classKey))].filter((_, i) => i % 3 === 0);
      const fixos = Object.fromEntries(base.out.filter(o => turmas.includes(o.classKey))
        .map(o => [o.fKey, { a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}) }]));
      const { out } = runAllocationEngine({ ...estado, fixos });
      for (const [fKey, p] of Object.entries(fixos)) {
        const o = out.find(v => v.fKey === fKey);
        assert.deepEqual([o.a, o.b, o.insId], [p.a, p.b, p.insId], `seed ${seed}: ${fKey}`);
      }
    }
  });

  it('em média, o critério escolhido é o que mais reduz o que ele mede', () => {
    const soma = (buracos, campo) => execucoes.filter(e => e.criterios.buracos === buracos && e.criterios.horarios === 'disponibilidade')
      .reduce((total, e) => total + campo(metricasDaEscala(e.depois.out)), 0);
    const parados = b => soma(b, m => m.instrutoresParadoMin), saidas = b => soma(b, m => m.saidasDoHangar);
    assert.ok(parados('inva') < parados('aviao'), `INVAs parados: ${parados('inva')} x ${parados('aviao')}`);
    assert.ok(saidas('aviao') < saidas('inva'), `saídas: ${saidas('aviao')} x ${saidas('inva')}`);
  });
});

describe('Compactação chamada sem os limites', () => {
  it('usa os limites do estado', () => {
    // O instrutor 1 voa às 06:30 e às 13:40 (não vem às 08:20) e o 2, às 08:20: a compactação passa o das 06:30 para o 2,
    // a não ser que o estado limite o voo a 1 h por jornada
    const estado = cenario({
      ins: [instrutor(1, 1, { aw: Array(9).fill(true).map((v, k) => k !== 1) }), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' }), aluno(1001, { p1: 820, p2: -1, jan: 'h820' }), aluno(1002, { p1: 500, p2: -1, jan: 'h500' })]
    });
    const base = runAllocationEngine(estado, { compactar: false }).out;
    const instrutorDas0630 = limites => {
      const out = base.map(o => ({ ...o }));
      compactar(out, { ...estado, limites });
      return doAluno(out, 1000).insId;
    };
    assert.deepEqual([instrutorDas0630(undefined), instrutorDas0630({ vooPorJornadaMin: 60 })], [2, 1]);
  });
});

describe('O custo da escala', () => {
  // A volta do noturno de ontem leva o número do pedido de ontem (a missão 0); o pedido de hoje do aluno é outro, e a
  // preferência dele não vale para a volta (que é fixa, às 07:30)
  it('não cobra da volta do noturno de ontem a preferência do pedido de hoje do aluno', () => {
    const volta = { stuId: 1000, mid: 0, insId: 1, r: 'PR-HAR', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290 };
    const custo = pedidoDeHoje => {
      const estado = { ...cenario({ stu: [aluno(1000, { fly: false, ...pedidoDeHoje })] }), noturnosDaVespera: [volta] };
      const { out } = runAllocationEngine(estado);
      assert.deepEqual(out.map(o => [o.fKey, o.trecho, hm(o.a)]), [['1000_0_2', 'volta', '07:30']]);
      return custoDaEscala(out, estado);
    };
    // O pedido de hoje (que não voa) às 07:30 ou às 13:40, com prioridade 1 ou 5: o custo da escala é o mesmo
    assert.equal(custo({ p1: 820, p2: -1, pr: 5 }), custo({ p1: 450, p2: -1, pr: 1 }));
  });
});

// A conferência dos voos fixos (js/conferencia.js). Nenhum golden tem voo fixo, então eles não guardam a saída da
// conferência do motor: test/fixtures/conferencia-do-motor.json foi gravado do motor antes de ela sair de js/engine.js (a
// escala aprovada, os fixos pelo status, o instrutor escolhido, os agendados e os quatro juntos, em 300 sementes), e o
// motor depois devolve a mesma saída, dia a dia
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAllocationEngine } from '../../js/engine.js';
import { TIPOS_DE_PINO, SEMENTES_DOS_PINOS, diaComPinos, impressaoDaSaida } from '../helpers/pinos.js';

const GRAVADA = JSON.parse(readFileSync(new URL('../fixtures/conferencia-do-motor.json', import.meta.url), 'utf8'));

describe('O motor com voos fixos: a mesma saída de antes da conferência sair dele', () => {
  it('a gravação tem voos fixos, conflitos, avisos e recusas (o teste não passa por falta deles)', () => {
    const { contagem } = GRAVADA;
    assert.ok(contagem.fixos > 10000 && contagem.conflitos > 3000 && contagem.avisos > 3000 && contagem.recusas > 5000, JSON.stringify(contagem));
  });

  for (const tipo of TIPOS_DE_PINO) {
    it(`${tipo}: em 300 sementes, a saída gravada`, () => {
      const diferentes = SEMENTES_DOS_PINOS.filter(seed => impressaoDaSaida(runAllocationEngine(diaComPinos(seed, tipo))) !== GRAVADA.dias[seed][tipo]);
      assert.deepEqual(diferentes, []);
    });
  }
});

// conferirEscala: a escala montada, conferida de novo sem o motor. Ela não põe, não move e não tira nenhum voo
describe('conferirEscala: a escala conferida sem o motor', async () => {
  const { conferirEscala } = await import('../../js/conferencia.js');
  const { pinoDoVoo } = await import('../../js/fixos.js');
  const { mulberry32 } = await import('../helpers/cenarios.js');
  const { FROTA_POR_TIPO } = await import('../helpers/estado.js');
  const lugar = o => `${o.fKey} ${o.stuId} ${o.mis} ${o.a}-${o.b} ${o.r} ${o.insId}`;
  const semData = ({ data: _, ...resto }) => resto;
  const dias = SEMENTES_DOS_PINOS.slice(0, 120).flatMap(seed => TIPOS_DE_PINO.map(tipo => ({ seed, tipo, estado: diaComPinos(seed, tipo) })));

  it('a escala do motor, conferida de novo, é a mesma (linhas, alertas, total e revisão)', () => {
    const diferentes = [];
    for (const { seed, tipo, estado } of dias) {
      const motor = runAllocationEngine(estado);
      const conferida = conferirEscala(estado, motor);
      if (JSON.stringify(semData(conferida)) !== JSON.stringify(motor)) diferentes.push(`${seed} ${tipo}`);
    }
    assert.deepEqual(diferentes, []);
  });

  // Uma alteração sem o motor: um voo de cada dia vai para outro horário, avião e INVA (o pino agendado), ou sai da
  // escala, ou outro peso no cadastro
  function alterar(estado, motor, r) {
    const pick = a => a[Math.floor(r() * a.length)];
    const novo = { ...structuredClone(estado), fixos: { ...(estado.fixos || {}) } };
    const voos = motor.out.filter(o => !o.trecho);
    if (!voos.length) return null;
    const o = pick(voos);
    const tipo = r();
    if (tipo < 0.5) {
      const a = pick([390, 420, 500, 610, 690, 760, 820, 870, 980]);
      const r2 = o.isGround ? o.r : pick(FROTA_POR_TIPO[o.eqType] || [o.r]);
      // O aluno de uma turma de Ground que muda de lugar sai dela: uma turma só dele (a chave do voo)
      const { classKey: _, ...pino } = pinoDoVoo(o);
      novo.fixos[o.fKey] = { ...pino, a, b: a + (o.b - o.a), r: r2, insId: pick(novo.ins).id, agendado: true };
      return { novo, mudou: o.fKey };
    }
    if (tipo < 0.75) {
      // "✕": o voo fica fixo onde estava (pinado) e o pedido deixa de voar
      novo.fixos[o.fKey] = novo.fixos[o.fKey] || pinoDoVoo(o);
      const s = novo.stu.find(x => x.id === o.stuId);
      const d = o.mid ? s.extra.find(ex => ex.mid === o.mid) : s;
      d.fly = false;
      return { novo, mudou: o.fKey, saiu: true };
    }
    const s = novo.stu.find(x => x.id === o.stuId);
    s.kg = 40 + Math.floor(r() * 80);
    return { novo, mudou: null, peso: s.id };
  }

  it('depois de uma alteração, os outros voos ficam onde estavam; o motor deixa os fixos no mesmo lugar; total, recusas e turmas iguais aos do motor quando ele não põe nem tira ninguém', () => {
    const falhas = [];
    let comparados = 0;
    for (const [k, { seed, tipo, estado }] of dias.entries()) {
      const motor = runAllocationEngine(estado);
      const alteracao = alterar(estado, motor, mulberry32(seed * 31 + k));
      if (!alteracao) continue;
      const { novo, mudou, saiu, peso } = alteracao;
      const conferida = conferirEscala(novo, motor, { antes: estado });
      if (!conferida) { falhas.push(`${seed} ${tipo}: sem escala`); continue; }
      const antes = new Map(motor.out.map(o => [o.fKey, o]));
      const depois = new Map(conferida.out.map(o => [o.fKey, o]));
      for (const [fKey, o] of antes) {
        if (fKey === mudou) continue;
        if (!depois.has(fKey) || lugar(depois.get(fKey)) !== lugar(o)) falhas.push(`${seed} ${tipo}: ${fKey} mudou`);
      }
      if (saiu && depois.has(mudou)) falhas.push(`${seed} ${tipo}: ${mudou} continua`);
      if (mudou && !saiu && lugar(depois.get(mudou)) !== lugar({ ...depois.get(mudou), ...novo.fixos[mudou] })) falhas.push(`${seed} ${tipo}: ${mudou} fora do pino`);
      if (peso) for (const o of conferida.out.filter(v => v.stuId === peso && !v.trecho)) if (o.stuKg !== novo.stu.find(s => s.id === peso).kg) falhas.push(`${seed} ${tipo}: o peso de antes`);
      // O motor sobre o resultado: os fixos no mesmo lugar
      const refeita = runAllocationEngine(novo);
      for (const o of refeita.out.filter(v => v.fixo && !v.trecho)) {
        const c = depois.get(o.fKey);
        if (!c || lugar(c) !== lugar(o)) falhas.push(`${seed} ${tipo}: o fixo ${o.fKey} noutro lugar`);
      }
      // Sem pedido entrando ou saindo: o mesmo total e as mesmas recusas; com todos no mesmo lugar, as mesmas turmas
      const chaves = lista => lista.map(o => o.fKey).sort().join();
      if (chaves(refeita.out) === chaves(conferida.out)) {
        comparados++;
        if (refeita.tot !== conferida.tot) falhas.push(`${seed} ${tipo}: tot`);
        if (refeita.al.filter(a => a.t === 'err').length !== conferida.al.filter(a => a.t === 'err').length) falhas.push(`${seed} ${tipo}: recusas`);
        // As turmas (quem está com quem; o motor pode juntar numa turma aberta um aluno sem pino) e o tamanho de cada uma
        const membros = lista => lista.filter(o => o.isGround).map(o => `${lugar(o)}:${lista.filter(v => v.classKey === o.classKey).map(v => v.fKey).sort()}`).sort().join();
        const tamanhos = lista => lista.filter(o => o.isGround).map(o => `${o.fKey}:${o.groupSize}`).sort().join();
        if (membros(refeita.out) === membros(conferida.out) && tamanhos(refeita.out) !== tamanhos(conferida.out)) falhas.push(`${seed} ${tipo}: turmas`);
      }
    }
    assert.deepEqual(falhas.slice(0, 8), [], `${falhas.length} falha(s)`);
    assert.ok(comparados > 300, `só ${comparados} dias comparados com o motor`);
  });

  it('um pedido que voa sem pino, sem linha e sem recusa entra na escala: sem o motor não dá (null)', () => {
    const estado = diaComPinos(3, 'aprovada');
    const motor = runAllocationEngine(estado);
    const novo = structuredClone(estado);
    novo.stu.push({ id: 9999, nm: 'Chegou', kg: 70, bl: [], extra: [], fly: true, mis: 'Voo Local', eq: 'C152', p1: 610, p2: -1, nb: 1, ss: 1, pr: 3 });
    assert.equal(conferirEscala(novo, motor, { antes: estado }), null);
  });
});

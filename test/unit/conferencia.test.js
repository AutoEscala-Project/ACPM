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

  // A gravação é de antes do F1h, que muda de propósito os avisos do “Priorizar com” (as disputas, um aviso por voo, com a
  // chave dele) e, quando há um caminho, o instrutor dos voos de um mesmo horário (o pareamento no horário: js/engine.js).
  // Ela continua a mesma: o motor sem o pareamento e com os avisos de antes (opcoes.parearNoHorario: false) devolve a saída
  // gravada em todos os dias, e o motor de agora, em todos os dias sem “Priorizar com”. Com ele, nenhum horário muda: em
  // todos os dias, os horários são os do motor sem o pareamento (o “Priorizar com” escolhe o instrutor, não o horário)
  const comPar = estado => estado.stu.some(s => (s.voaCom || []).length > 0);
  const horarios = saida => JSON.stringify(saida.out.map(o => [o.fKey, o.a, o.b]).sort((p, q) => (p[0] < q[0] ? -1 : 1)));
  for (const tipo of TIPOS_DE_PINO) {
    it(`${tipo}: em 300 sementes, a saída gravada (sem o pareamento; com ele, nos dias sem “Priorizar com”, e os mesmos horários em todos)`, () => {
      const diferentes = [], comOF1h = [], outroHorario = [];
      const semOF1h = { parearNoHorario: false };
      for (const seed of SEMENTES_DOS_PINOS) {
        if (impressaoDaSaida(runAllocationEngine(diaComPinos(seed, tipo, semOF1h), semOF1h)) !== GRAVADA.dias[seed][tipo]) diferentes.push(seed);
        const estado = diaComPinos(seed, tipo);
        const agora = runAllocationEngine(estado);
        if (!comPar(estado) && impressaoDaSaida(agora) !== GRAVADA.dias[seed][tipo]) comOF1h.push(seed);
        if (horarios(agora) !== horarios(runAllocationEngine(estado, semOF1h))) outroHorario.push(seed);
      }
      assert.deepEqual([diferentes, comOF1h, outroHorario], [[], [], []]);
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

  // Revisão do F1h: a primeira visita do “Priorizar com” (que o F1h teve até a resposta de Pedro de 2026-11-26) encaixava
  // fora da ordem da fila, e o aviso do instrutor escolhido que saiu do cadastro saía na ordem do encaixe; a conferência o dá
  // na ordem da fila. Os dois dão a ordem da fila
  it('com “Priorizar com”, a escala do motor conferida de novo é a mesma: os avisos na ordem da fila', async () => {
    const { aluno, cenario, instrutor } = await import('../helpers/montar.js');
    // O INVA 99 (escolhido) saiu do cadastro; o de prioridade 1 tem “Priorizar com”
    const estado = cenario({ ins: [instrutor(1, 1), instrutor(2, 1)], stu: [aluno(1000, { pr: 5, insId: 99 }), aluno(1001, { pr: 1, insId: 99 }, { voaCom: [1] })] });
    const motor = runAllocationEngine(estado);
    assert.deepEqual(motor.al.map(a => `${a.codigo}:${a.s}`), ['escolhido-saiu:Aluno 1000', 'escolhido-saiu:Aluno 1001']);
    assert.equal(JSON.stringify(semData(conferirEscala(estado, motor))), JSON.stringify(motor));
  });

  // Dias gerados com “Priorizar com” (às vezes dois INVAs, às vezes um deles em “Não escalar com”), o minuto exato, o que a
  // missão exige do INVA, o 7º local confirmado, a agenda e o instrutor escolhido: a escala do motor, conferida de novo, é a mesma (a semente 1430 tinha os avisos do escolhido
  // que saiu do cadastro fora de ordem)
  it('em 400 dias gerados com “Priorizar com”, a escala do motor conferida de novo é a mesma', async () => {
    const { gerarCenario, comEscolhas, comAtributos } = await import('../helpers/cenarios.js');
    const { MISSOES_LOCAIS } = await import('../../js/config.js');
    const EXIGE = ['ifr', 'c172', 'mlte', 'checa_pp'];
    const gerar = seed => {
      const base = comAtributos(comEscolhas(gerarCenario(seed), seed), seed);
      const r = mulberry32(seed * 911 + 3);
      const ids = base.ins.map(x => x.id);
      const pick = a => a[Math.floor(r() * a.length)];
      const stu = base.stu.map(s => {
        const n = structuredClone(s);
        if (r() < 0.35) n.voaCom = [...new Set([pick(ids), ...(r() < 0.4 ? [pick(ids)] : [])])];
        if (r() < 0.08 && n.voaCom) n.bl = [...new Set([...n.bl, n.voaCom[0]])];
        for (const p of [n, ...n.extra]) {
          if (r() < 0.2) p.jan = `h${pick([390, 500, 610, 690, 760, 870, 980])}`;
          if (r() < 0.1) p.exige = [pick(EXIGE)];
          if (r() < 0.05 && MISSOES_LOCAIS.includes(p.mis) && p.jan) p.limiteConfirmado = true;
          if (r() < 0.1) p.solicitacao = Math.floor(r() * 50);
        }
        return n;
      });
      return { ...base, stu };
    };
    const diferentes = [];
    for (const seed of [1430, ...Array.from({ length: 399 }, (_, i) => i + 1)]) {
      const estado = gerar(seed);
      const motor = runAllocationEngine(estado);
      if (JSON.stringify(semData(conferirEscala(estado, motor))) !== JSON.stringify(motor)) diferentes.push(seed);
    }
    assert.deepEqual(diferentes, []);
  });

  // Revisão do F1h: a disputa de um voo sem pino nomeia o lugar de outro voo; depois que o outro muda de lugar (na escala
  // aprovada, sem o motor), a frase é refeita com os horários de agora, e o motivo de sempre do voo sem o INVA fica
  it('na escala aprovada, a disputa é refeita quando o outro voo muda de lugar; o motivo do voo sem o INVA fica', async () => {
    const { aluno, cenario, instrutor } = await import('../helpers/montar.js');
    const { fixosAoAprovar } = await import('../../js/fixos.js');
    const doPar = al => al.filter(a => a.codigo === 'voa-com').map(a => [a.fKey, a.m]);
    // Aprovada com o 1001 às 08:20 com o INVA 1; o 1000 (prioriza o 1, quer as 08:20) entra depois, sem pino, às 10:10
    const inicial = cenario({ ins: [instrutor(1, 1), instrutor(2, 1)], stu: [aluno(1000, { fly: false }, { voaCom: [1] }), aluno(1001, { p1: 1, p2: -1 }, { voaCom: [1] })] });
    const aprovado = { ...structuredClone(inicial), fixos: fixosAoAprovar({}, runAllocationEngine(inicial).out), aprovacao: { em: 'x', por: 'Op' } };
    aprovado.stu[0].fly = true;
    const motor = runAllocationEngine(aprovado);
    assert.deepEqual(doPar(motor.al), [['1000_0_1', 'Aluno 1000 e Aluno 1001 priorizam Instrutor 01 às 08:20: ficou com Aluno 1001 (voo fixo); Aluno 1000 voa às 10:10.']]);
    const movido = structuredClone(aprovado);
    movido.fixos['1001_0_1'] = { ...movido.fixos['1001_0_1'], a: 760, b: 820, agendado: true };
    const conferida = conferirEscala(movido, motor, { antes: aprovado });
    assert.deepEqual(conferida.out.map(o => [o.fKey, o.a, o.insId]), [['1000_0_1', 610, 1], ['1001_0_1', 760, 1]]);
    assert.deepEqual(doPar(conferida.al), []);
    // O motivo do voo que ficou sem o INVA (o 1001 com o INVA 1 às 08:20, o 1000 só pode às 08:20) fica; a disputa dentro
    // dele sai quando o outro voo sai do horário
    const soAs820 = structuredClone(aprovado);
    soAs820.stu[0].jan = 'h500';
    soAs820.stu[0].p2 = -1;
    const motor2 = runAllocationEngine(soAs820);
    const inicio = 'Sem o instrutor de “Priorizar com” (Instrutor 01: ocupado nos horários possíveis): o voo ficou com Instrutor 02.';
    assert.deepEqual(doPar(motor2.al), [['1000_0_1', `${inicio} Aluno 1000 e Aluno 1001 priorizam Instrutor 01 às 08:20: ficou com Aluno 1001 (voo fixo).`]]);
    const movido2 = structuredClone(soAs820);
    movido2.fixos['1001_0_1'] = { ...movido2.fixos['1001_0_1'], a: 760, b: 820, agendado: true };
    assert.deepEqual(doPar(conferirEscala(movido2, motor2, { antes: soAs820 }).al), [['1000_0_1', inicio]]);
  });
});

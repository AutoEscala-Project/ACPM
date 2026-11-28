// Propriedades que toda escala gerada deve respeitar, verificadas em centenas de cenários aleatórios.
import { horariosDaMissao, periodoDoMinuto, INICIOS_DOS_TEMPOS, HORARIO_DO_NOTURNO } from '../../js/horarios.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { EQ, GROUND_REG, ACROBAT_REG, DEFAULT_LIM, AIRCRAFT_EQ_TYPES } from '../../js/config.js';
import { isGroundMission, doesGroundGateFlight } from '../../js/rules.js';
import { podeFazer } from '../../js/habilitacoes.js';
import { categoriaDoRodizio } from '../../js/rodizio.js';
import { gerarCenario, comEscolhas, comAtributos, comVolta, comAgenda, FORA_DO_CADASTRO, mulberry32 } from '../helpers/cenarios.js';
import { FROTA_POR_TIPO } from '../helpers/estado.js';
import { FROTA_INICIAL, recursoDaFrota, aviaoServe, instrutorVoaNoAviao } from '../../js/frota.js';
import { CODIGOS_DE_REJEICAO, CODIGOS_DO_AGENDADO } from '../../js/conflitos.js';
import { fixosAoAprovar } from '../../js/fixos.js';
import { normalizarEscalaGravada } from '../../js/escala-gravada.js';
import { rejeicoesDosPedidos } from '../../js/rejeicoes.js';
import { hm } from '../../js/format.js';

// O w de uma linha é o tempo de antes em que ela começa (0 a 8); o do Noturno, o 8, o das 17:30
const TEMPO_DO_NOTURNO = INICIOS_DOS_TEMPOS.length - 1;

// Até quando o voo pode ir: o de dia no avião pousa até as 17:30; o Noturno, o simulador e o Ground, até o fim do dia
const fimDoVoo = o => (o.mis !== 'Noturno' && AIRCRAFT_EQ_TYPES.includes(o.eqType) ? HORARIO_DO_NOTURNO : 1440);

const SEEDS = Array.from({ length: 300 }, (_, i) => 1001 + i);
// Cada seed cinco vezes: o cenário como foi gerado, com as escolhas do operador (o instrutor escolhido para o dia e o
// “Priorizar com”), com os atributos dos recursos e os cursos dos alunos (“Só VFR”, habilitação própria, o noturno do
// PC), com a volta do noturno de ontem e com os pedidos da Agenda (o horário exato, a ordem de registro e a lista de
// espera): as regras da escala valem também com eles
const execucoes = SEEDS.flatMap(seed => [
  [seed, gerarCenario(seed)], [`${seed} com escolhas`, comEscolhas(gerarCenario(seed), seed)], [`${seed} com atributos`, comAtributos(gerarCenario(seed), seed)],
  [`${seed} com a volta do noturno`, comVolta(gerarCenario(seed), seed)], [`${seed} com a agenda`, comAgenda(gerarCenario(seed), seed)]
].map(([rotulo, estado]) => {
  // out: os voos que o motor escala hoje; a volta do noturno de ontem (fixa, de outro dia) fica em voltas, e todos tem os dois
  const resultado = runAllocationEngine(estado);
  return { seed: rotulo, estado, ...resultado, out: resultado.out.filter(o => !o.trecho), voltas: resultado.out.filter(o => o.trecho), todos: resultado.out };
}));
// A frota do cenário (sem ela, a inicial) e o recurso de um voo
const frotaDe = estado => (Array.isArray(estado.frota) ? estado.frota : FROTA_INICIAL);
const recursoDo = (estado, o) => (o.isGround ? null : recursoDaFrota(frotaDe(estado), o.r));
const comAsEscolhas = execucoes.filter(e => String(e.seed).endsWith('com escolhas'));

const sobrepoe = (x, y) => x.a < y.b && y.a < x.b;
// O voo do pedido com o 7º voo local confirmado (limiteConfirmado), no minuto exato do pedido (Q8)
const confirmadoNoMinuto = (estado, o) => {
  const stu = estado.stu.find(s => s.id === o.stuId);
  const d = stu && (o.mid ? (stu.extra || []).find(ex => ex.mid === o.mid) : stu);
  return Boolean(d && d.limiteConfirmado === true && d.jan === `h${o.a}`);
};
const pedidoDe = (estado, o) => {
  const stu = estado.stu.find(s => s.id === o.stuId);
  return { stu, d: o.mid ? stu.extra.find(ex => ex.mid === o.mid) : stu };
};

// As faixas e as pausas do instrutor na data: as dele (formato 29) ou as dos nove tempos de antes (aw)
function faixasEPausas(x) {
  if (Array.isArray(x.faixas)) return { faixas: x.faixas, pausas: x.pausas || [] };
  const fimDoTempo = k => (k < TEMPO_DO_NOTURNO ? INICIOS_DOS_TEMPOS[k + 1] : 1440);
  const faixas = [];
  (x.aw || []).forEach((marcado, k) => {
    if (!marcado) return;
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.ate === INICIOS_DOS_TEMPOS[k]) ultima.ate = fimDoTempo(k);
    else faixas.push({ de: INICIOS_DOS_TEMPOS[k], ate: fimDoTempo(k) });
  });
  return { faixas, pausas: faixas.slice(1).map((f, i) => ({ de: faixas[i].ate, ate: f.de })) };
}

// Executa a verificação em todos os cenários e informa os seeds que violam a propriedade
function emTodos(verificar) {
  const falhas = [];
  for (const exec of execucoes) {
    try { verificar(exec); } catch (e) { falhas.push(`seed ${exec.seed}: ${e.message}`); }
  }
  assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} cenário(s) violam a propriedade`);
}

describe('Invariantes do motor de alocação', () => {
  // Sem os confirmados (o 7º voo local confirmado na Agenda, no minuto dele: Q8) e sem os agendados na Escala
  it('no máximo 6 voos locais saindo no mesmo horário, sem os confirmados nem os agendados', () => emTodos(({ out, estado }) => {
    const porHorario = new Map();
    out.filter(o => ['Voo Local', 'Voo Solo', 'TGL (TMA)'].includes(o.mis) && o.status !== 'Cancelado' && !o.agendado && !confirmadoNoMinuto(estado, o))
      .forEach(o => porHorario.set(o.a, (porHorario.get(o.a) || 0) + 1));
    for (const [a, n] of porHorario) assert.ok(n <= 6, `${n} voos locais às ${a}`);
  }));

  // A rejeição diz onde resolver
  it('toda rejeição tem um código da lista', () => emTodos(({ al }) => {
    for (const a of al.filter(x => x.t === 'err')) assert.ok(CODIGOS_DE_REJEICAO.includes(a.codigo), `${a.m} (${a.codigo})`);
  }));

  it('toda missão marcada é alocada ou recebe um alerta de rejeição', () => emTodos(({ estado, out, al, tot }) => {
    const marcadas = estado.stu.reduce((n, s) => n + (s.fly ? 1 : 0) + s.extra.filter(ex => ex.fly).length, 0);
    const alocadas = new Set(out.map(o => `${o.stuId}_${o.mid}`)).size;
    assert.equal(tot, marcadas);
    assert.equal(alocadas + al.filter(a => a.t === 'err').length, tot);
  }));

  // O voo cancelado não ocupa nada: outro voo pode ficar no horário dele
  // A lista de espera (F1h; N14, U3): o pedido com o horário exato recusado só por falta de lugar nele (os 6 locais, os
  // aviões, os instrutores) espera, com o lugar dele na lista do horário, na ordem da fila; nenhum outro espera
  it('a lista de espera: só o pedido com horário exato recusado por falta de lugar nele, numerado na ordem da fila', () => {
    let esperas = 0;
    emTodos(({ estado, out, al }) => {
      // As recusas ligadas aos pedidos, na ordem da fila (js/rejeicoes.js)
      const lugares = {};
      for (const [fKey, a] of rejeicoesDosPedidos(estado, { out, al })) {
        const stu = estado.stu.find(x => x.id === Number(fKey.split('_')[0]));
        const mid = Number(fKey.split('_')[1]);
        const d = mid ? stu.extra.find(ex => ex.mid === mid) : stu;
        const exato = /^h\d+$/.test(d.jan || '') ? Number(d.jan.slice(1)) : null;
        const espera = exato !== null && ['limite-de-locais', 'avioes-ocupados', 'instrutores-ocupados'].includes(a.codigo);
        if (!espera) { assert.equal(a.espera, undefined, `${fKey}: espera sem horário exato ou por outro motivo (${a.codigo})`); continue; }
        esperas++;
        lugares[exato] = (lugares[exato] || 0) + 1;
        assert.deepEqual(a.espera, { minuto: exato, lugar: lugares[exato] }, fKey);
        assert.ok(a.m.endsWith(`; ${lugares[exato]}º na lista de espera das ${hm(exato)}.`), a.m);
      }
      assert.ok(al.every(a => a.espera === undefined || a.t === 'err'), 'espera fora de uma recusa');
    });
    assert.ok(esperas > 200, `${esperas} pedidos esperando (o teste não passa por falta deles)`);
  });

  it('nenhuma aeronave ou simulador é escalado em horários sobrepostos', () => emTodos(({ out }) => {
    const voos = out.filter(o => !o.isGround && o.status !== 'Cancelado');
    for (const [i, x] of voos.entries()) {
      for (const y of voos.slice(i + 1)) {
        assert.ok(!(x.r === y.r && sobrepoe(x, y)), `${x.r} em ${x.fKey} e ${y.fKey}`);
      }
    }
  }));

  it('nenhum instrutor atende duas turmas ou voos ao mesmo tempo', () => emTodos(({ out: todos }) => {
    const out = todos.filter(o => o.status !== 'Cancelado');
    for (const [i, x] of out.entries()) {
      for (const y of out.slice(i + 1)) {
        assert.ok(!(x.insId === y.insId && x.classKey !== y.classKey && sobrepoe(x, y)), `instrutor ${x.insId} em ${x.fKey} e ${y.fKey}`);
      }
    }
  }));

  it('nenhum aluno é escalado em horários sobrepostos', () => emTodos(({ out: todos }) => {
    const out = todos.filter(o => o.status !== 'Cancelado');
    for (const [i, x] of out.entries()) {
      for (const y of out.slice(i + 1)) {
        assert.ok(!(x.stuId === y.stuId && sobrepoe(x, y)), `aluno ${x.stuId} em ${x.fKey} e ${y.fKey}`);
      }
    }
  }));

  it('instrutor ativo, habilitado para a missão no equipamento (com o curso do aluno e a habilitação própria do avião) e não bloqueado', () => emTodos(({ estado, out }) => {
    for (const o of out) {
      const x = estado.ins.find(i => i.id === o.insId);
      const { stu } = pedidoDe(estado, o);
      assert.ok(x.on, `${o.fKey}: instrutor inativo`);
      assert.ok(podeFazer(x, o.mis, o.eqType, { curso: stu.curso, recurso: recursoDo(estado, o) }), `${o.fKey}: ${o.mis}/${o.eqType} no ${o.r} (${stu.curso}) sem habilitação (${x.hab})`);
      assert.ok(!stu.bl.includes(x.id), `${o.fKey}: instrutor bloqueado`);
    }
  }));

  // A regra do início (C, "regra"; decisão 1 do Pedro), lida aqui sem js/disponibilidade.js: com as faixas e as pausas da
  // data, ou, sem elas, com as do aw (cada sequência de tempos marcados é uma faixa, e o intervalo entre duas, a pausa)
  it('toda linha começa numa faixa do instrutor e não toca nenhuma pausa (o que termina até as 06:30 não pede faixa)', () => emTodos(({ estado, out }) => {
    let comFaixa = 0;
    for (const o of out) {
      const { faixas, pausas } = faixasEPausas(estado.ins.find(i => i.id === o.insId));
      const inicio = Math.max(o.a, INICIOS_DOS_TEMPOS[0]);
      if (o.b <= inicio) continue;
      comFaixa++;
      assert.ok(faixas.some(f => f.de <= inicio && inicio < f.ate), `${o.fKey}: começa às ${hm(o.a)}, fora das faixas (${faixas.map(f => `${hm(f.de)}–${hm(f.ate)}`).join(', ')})`);
      const pausa = pausas.find(p => o.a < p.ate && p.de < o.b);
      assert.ok(!pausa, `${o.fKey}: ${hm(o.a)}–${hm(o.b)} toca a pausa ${pausa && `${hm(pausa.de)}–${hm(pausa.ate)}`}`);
    }
    assert.ok(out.length === 0 || comFaixa > 0);
  }));

  // O almoço (#104), branda: o motor só desiste dele quando mantê-lo tiraria um voo da escala. Lido aqui sem js/almoco.js:
  // nenhum pedido escalado pelo motor sem o almoço (opcoes.almoco: false) fica fora com ele
  it('o almoço não tira nenhum voo da escala: cada pedido escalado sem ele continua escalado', () => emTodos(({ estado, out }) => {
    const com = new Set(out.map(o => o.fKey));
    const faltam = runAllocationEngine(estado, { almoco: false }).out.filter(o => !o.trecho && !com.has(o.fKey)).map(o => o.fKey);
    assert.deepEqual(faltam, []);
  }));

  // O almoço vem antes do “Priorizar com” (Pedro, 28/11): o voo só sai do INVA do “Priorizar com” que tinha sem o almoço
  // quando o aviso dele diz que foi pelo almoço (o almoço do INVA do “Priorizar com”, ou outro motivo que o almoço causou
  // ao empurrar outros voos, que a conferência abaixo cobre)
  it('o voo que perde o “Priorizar com” por causa do almoço tem o aviso do “Priorizar com”', () => emTodos(({ estado, out, al }) => {
    const sem = runAllocationEngine(estado, { almoco: false });
    const perdem = sem.out.filter(o => o.insPar && !out.some(v => v.fKey === o.fKey && v.insPar)).map(o => o.fKey);
    const avisados = new Set(al.filter(a => a.codigo === 'voa-com').map(a => a.fKey));
    assert.deepEqual(perdem.filter(k => !avisados.has(k)), []);
  }));

  // Todo INVA que vem e tem um compromisso que toca 11:00–14:00 tem uma hora livre seguida nessa janela (sem compromisso:
  // a turma de Ground uma vez, a volta do noturno até as 10:10; a pausa e o fora das faixas são livres), ou o aviso
  // "Sem almoço" com o nome dele; quem tem a hora não tem o aviso
  it('todo INVA que voa perto do meio-dia tem uma hora livre entre 11:00 e 14:00 ou o aviso com o nome dele', () => emTodos(({ estado, todos: linhas, al }) => {
    for (const x of estado.ins.filter(i => i.on)) {
      const ocupados = linhas.filter(o => o.insId === x.id && o.status !== 'Cancelado').map(o => (o.trecho === 'volta' ? [0, Math.max(o.b, o.livreAs)] : [o.a, o.b]));
      const naJanela = ocupados.filter(([a, b]) => a < 840 && b > 660).sort((p, q) => p[0] - q[0]);
      let inicio = 660, temHora = false;
      for (const [a, b] of naJanela) { if (a - inicio >= 60) temHora = true; inicio = Math.max(inicio, b); }
      if (840 - inicio >= 60) temHora = true;
      const aviso = al.filter(a => a.t === 'warn' && a.m.startsWith('Sem almoço: ') && a.insId === x.id);
      if (!naJanela.length || temHora) assert.deepEqual(aviso, [], `${x.nm} tem a hora livre e o aviso`);
      else assert.equal(aviso.length, 1, `${x.nm} sem a hora livre (${naJanela.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(', ')}) e sem o aviso`);
      if (aviso.length) assert.equal(aviso[0].s, x.nm);
    }
  }));

  // O motor só desiste do almoço (e o “Priorizar com” só cede ao almoço) quando nenhuma arrumação que ele testa guarda os
  // dois (Pedro, 28/11: "the engine should move another Mission before giving up an instructors lunch break"). Na
  // configuração em que o motor terminou (montarComOAlmoco: a guarda, as horas reservadas, os pedidos antes na fila e as
  // missões mudadas), cada mudança da busca, lida aqui sem js/almoco.js nem a busca do motor, é montada de novo:
  // - para cada INVA com o aviso "Sem almoço" (sem a pausa que já é o almoço, e com uma hora da janela que nenhum voo fixo
  //   dele toca), com o almoço dele: de volta; a hora dele reservada em cada hora que encosta num compromisso dele na janela, ou nas pontas (11:00 e 13:00), sem tocar um voo fixo dele; cada
  //   voo dele na janela (sem pino, fora o Ground) em outro horário ou, sem o instrutor escolhido nem o “Priorizar com”, com
  //   outro INVA; cada voo de outro INVA que poderia voar um desses (habilitado, fora do “Não escalar com”) no horário dele
  //   em outro horário ou com outro INVA; cada voo do mesmo tipo de avião entre 11:00 e 14:00 (com a duração do voo dele
  //   antes e depois) em outro horário ou em outro avião. Nenhuma escala tudo, deixa sem almoço só os de antes menos ele;
  // - para cada voo que tinha o INVA do “Priorizar com” sem o almoço e ficou sem ele: o pedido antes na fila; o voo em
  //   outro horário; a hora de cada INVA do “Priorizar com” dele reservada (como acima); cada voo desses INVAs na janela ou
  //   no horário dele em outro horário ou com outro INVA. Nenhuma escala tudo, sem mais INVAs sem almoço, e dá o
  //   “Priorizar com” a mais voos (todos os de antes também).
  // Nos 60 primeiros seeds (300 dias)
  it('nenhuma arrumação testada guarda o almoço de quem ficou sem ele, nem o “Priorizar com” que cedeu ao almoço', async () => {
    const { montarComOAlmoco, montarEscala, almocoDa } = await import('../../js/engine.js');
    const avisadosEm = r => new Set(r.al.filter(a => a.t === 'warn' && a.m.startsWith('Sem almoço: ')).map(a => a.insId));
    const escaladosEm = r => new Set(r.out.filter(o => !o.trecho).map(o => o.fKey));
    const comOParEm = r => new Set(r.out.filter(o => o.insPar).map(o => o.fKey));
    const contido = (menor, maior) => [...menor].every(k => maior.has(k));
    const toca = (o, de, ate) => o.a < ate && de < o.b;
    const falhas = [];
    let testadas = 0;
    for (const { seed, estado } of execucoes.slice(0, 300)) {
      const { resultado, almoco } = montarComOAlmoco(estado);
      if (!almoco) continue;
      const avisados = avisadosEm(resultado), escalados = escaladosEm(resultado), comOPar = comOParEm(resultado);
      const linhas = resultado.out;
      const ativo = o => (estado.fStatus || {})[o.fKey] !== 'Cancelado';
      const movel = o => !o.trecho && !o.fixo && !o.isGround && ativo(o);
      const naJanela = o => toca(o, 660, 840);
      const porId = new Map(estado.ins.map(x => [x.id, x]));
      const montar = (m, x) => {
        testadas++;
        const horas = new Map(almoco.horas);
        if (m.hora) horas.set(m.hora.insId, { de: m.hora.de, ate: m.hora.de + 60 });
        const guarda = new Set(almoco.guarda);
        if (x !== undefined) guarda.add(x);
        return montarEscala(estado, {}, almocoDa(guarda, horas, new Set([...almoco.antes, ...(m.antes || [])]), [...almoco.evitar, ...(m.evitar ? [m.evitar] : [])]));
      };
      // As horas da janela que encostam num compromisso do INVA, ou nas pontas, sem tocar um voo fixo dele
      const horasDe = id => {
        const meus = linhas.filter(o => o.insId === id && ativo(o)).map(o => ({ a: o.a, b: o.trecho === 'volta' ? Math.max(o.b, o.livreAs) : o.b, fixo: Boolean(o.fixo) }));
        const presos = meus.filter(o => o.fixo);
        return [...new Set([660, 780, ...meus.flatMap(o => [o.b, o.a - 60])])].filter(h => h >= 660 && h <= 780 && !presos.some(o => o.a < h + 60 && h < o.b)).sort((p, q) => p - q);
      };
      const podeVoar = (id, w) => {
        const x = porId.get(id), { stu, d } = pedidoDe(estado, w);
        return Boolean(x && x.on) && !(stu.bl || []).includes(id) && podeFazer(x, w.mis, w.eqType, { curso: stu.curso, exige: d.exige });
      };
      const moverInva = o => (o.insEscolhido || o.insPar ? [] : [{ evitar: [o.fKey, 'ins', o.insId] }]);
      for (const x of estado.ins.filter(i => avisados.has(i.id))) {
        const { pausas } = faixasEPausas(x);
        if (pausas.some(p => Math.min(p.ate, 840) - Math.max(p.de, 660) >= 60)) continue;
        const horas = horasDe(x.id);
        if (!horas.length) continue;
        const meus = linhas.filter(o => o.insId === x.id && movel(o) && naJanela(o));
        const mudancas = [
          ...(almoco.guarda.has(x.id) ? [] : [{}]),
          ...horas.map(de => ({ hora: { insId: x.id, de } })),
          ...meus.flatMap(w => [{ evitar: [w.fKey, 'a', w.a] }, ...moverInva(w)]),
          ...meus.flatMap(w => linhas.filter(o => o.insId !== x.id && movel(o) && toca(o, w.a, w.b) && podeVoar(o.insId, w)).flatMap(o => [{ evitar: [o.fKey, 'a', o.a] }, ...moverInva(o)])),
          ...meus.flatMap(w => linhas.filter(o => o !== w && movel(o) && o.eqType === w.eqType && !toca(o, w.a, w.b) && toca(o, 660 - (w.b - w.a), 840 + (w.b - w.a))).flatMap(o => [{ evitar: [o.fKey, 'a', o.a] }, { evitar: [o.fKey, 'r', o.r] }]))
        ];
        for (const m of mudancas) {
          const r = montar(m, x.id);
          const depois = avisadosEm(r);
          if (depois.size < avisados.size && contido(depois, avisados) && contido(escalados, escaladosEm(r))) {
            falhas.push(`seed ${seed}: ${x.nm} com ${JSON.stringify(m)}`);
            break;
          }
        }
      }
      const sem = runAllocationEngine(estado, { almoco: false });
      for (const p of linhas.filter(o => !o.trecho && !comOPar.has(o.fKey) && sem.out.some(v => v.fKey === o.fKey && v.insPar))) {
        const { stu } = pedidoDe(estado, p);
        const pares = (stu.voaCom || []).filter(id => porId.has(id) && porId.get(id).on);
        const mudancas = [
          { antes: [p.fKey] }, { evitar: [p.fKey, 'a', p.a] },
          ...pares.filter(z => almoco.guarda.has(z)).flatMap(z => horasDe(z).map(de => ({ hora: { insId: z, de } }))),
          ...pares.flatMap(z => linhas.filter(o => o !== p && o.insId === z && movel(o) && (naJanela(o) || toca(o, p.a, p.b))).flatMap(o => [{ evitar: [o.fKey, 'a', o.a] }, ...moverInva(o)]))
        ];
        for (const m of mudancas) {
          const r = montar(m);
          const par = comOParEm(r);
          if (contido(escalados, escaladosEm(r)) && contido(avisadosEm(r), avisados) && contido(comOPar, par) && par.size > comOPar.size) {
            falhas.push(`seed ${seed}: ${p.fKey} com o “Priorizar com” e ${JSON.stringify(m)}`);
            break;
          }
        }
      }
    }
    assert.ok(testadas > 0);
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} arrumação(ões) que o motor não achou`);
  });

  it('equipamento compatível, disponível, PR-JPL somente para Parafuso e o voo IFR só no avião homologado IFR', () => emTodos(({ estado, out }) => {
    for (const o of out) {
      if (o.isGround) {
        assert.equal(o.r, GROUND_REG);
        continue;
      }
      assert.ok(EQ[o.eqType].includes(o.r), `${o.fKey}: ${o.r} não pertence a ${o.eqType}`);
      assert.ok(estado.av[o.r], `${o.fKey}: ${o.r} em manutenção`);
      assert.equal(o.r === ACROBAT_REG, o.mis === 'Parafuso' && o.eqType === 'C152', `${o.fKey}: uso indevido do ${ACROBAT_REG}`);
      assert.ok(aviaoServe(recursoDo(estado, o), { mis: o.mis, eq: o.eqType, curso: pedidoDe(estado, o).stu.curso }), `${o.fKey}: ${o.r} não serve a ${o.mis}`);
    }
  }));

  it('peso da tripulação dentro do limite do equipamento (acima dele, só com menos combustível que ainda dá o voo)', () => emTodos(({ out }) => {
    for (const o of out.filter(v => !v.isGround)) {
      assert.equal(o.limKg, DEFAULT_LIM[o.eqType] || 0);
      if (!o.limKg || !o.stuKg || !o.insKg) continue;
      const kg = o.stuKg + o.insKg;
      if (!o.comb) assert.ok(kg <= o.limKg, `${o.fKey}: ${kg} kg > ${o.limKg} kg sem reduzir o combustível`);
      else assert.ok(kg > o.limKg && o.comb.abastecerGal >= o.comb.minimoGal, `${o.fKey}: combustível ${JSON.stringify(o.comb)}`);
    }
  }));

  it('horários da categoria em períodos habilitados, Noturno às 17:30, voo de dia no avião até 17:30 (simulador e Ground até o fim do dia)', () => emTodos(({ estado, out }) => {
    for (const o of out) {
      assert.ok(estado.win[o.w], `${o.fKey}: janela ${o.w} desativada`);
      assert.equal(o.w, periodoDoMinuto(o.a), `${o.fKey}: período errado`);
      assert.ok(horariosDaMissao(estado.horarios, o.mis, o.eqType).includes(o.a), `${o.fKey}: ${o.a} fora dos horários do ${o.eqType}`);
      if (o.mis === 'Noturno') assert.equal(o.w, TEMPO_DO_NOTURNO, `${o.fKey}: Noturno fora das 17:30`);
      else assert.ok(o.w < TEMPO_DO_NOTURNO && o.b <= fimDoVoo(o), `${o.fKey}: termina às ${o.b}`);
      if (o.isGround) assert.equal(o.b - o.a, 90);
    }
  }));

  // O Noturno só sai às 17:30: com ele na demanda do dia (entre ou não na escala), o simulador e a aula do aluno, que
  // podem passar das 17:30, terminam antes, também depois da compactação
  it('o aluno com o Noturno na demanda do dia termina as outras missões até as 17:30', () => emTodos(({ estado, out }) => {
    const comNoturno = new Set(estado.stu.filter(s => [s, ...s.extra].some(p => p.fly && p.mis === 'Noturno')).map(s => s.id));
    for (const o of out.filter(v => comNoturno.has(v.stuId) && v.mis !== 'Noturno')) assert.ok(o.b <= HORARIO_DO_NOTURNO, `${o.fKey} (${o.mis}): termina às ${o.b}`);
  }));

  it('o voo começa depois do término do Ground da mesma temática', () => emTodos(({ out }) => {
    for (const voo of out.filter(o => !o.isGround)) {
      for (const g of out.filter(o => o.isGround && o.stuId === voo.stuId)) {
        if (doesGroundGateFlight(g.mis, { mis: voo.mis, eq: voo.eqType })) {
          assert.ok(voo.a >= g.b, `${voo.fKey} às ${voo.a} antes do ${g.mis} (${g.b})`);
        }
      }
    }
  }));

  // A volta do noturno de ontem: fixa às 07:30–08:30, e o instrutor, o aluno e o avião dela não voam antes das 10:10
  it('a volta do noturno ocupa o instrutor, o aluno e o avião até as 10:10 (nada deles antes)', () => emTodos(({ estado, out, voltas }) => {
    assert.equal(voltas.length, (estado.noturnosDaVespera || []).length);
    for (const v of voltas.filter(o => (estado.fStatus[o.fKey] || o.status) !== 'Cancelado')) {
      assert.deepEqual([v.a, v.b, v.livreAs, v.h, v.fixo], [450, 510, 610, 1, true]);
      for (const o of out.filter(w => w !== v && w.a < 610 && (estado.fStatus[w.fKey] || w.status) !== 'Cancelado')) {
        assert.ok(o.insId !== v.insId && o.stuId !== v.stuId && o.r !== v.r, `${o.fKey} (${o.a}) junto da volta ${v.fKey}`);
      }
    }
  }));

  it('cada pedido de voo é um voo só, com as horas pedidas (o Noturno, as 4 h fixas do dia)', () => emTodos(({ estado, out }) => {
    const grupos = Map.groupBy(out.filter(o => !o.isGround), o => `${o.stuId}_${o.mid}`);
    for (const voos of grupos.values()) {
      const { d } = pedidoDe(estado, voos[0]);
      const horas = d.mis === 'Noturno' ? 4 : Math.max(1, Math.round(+d.nb || 1));
      assert.equal(voos.length, 1);
      assert.deepEqual([voos[0].fKey.endsWith('_1'), voos[0].ss, voos[0].h, voos[0].b - voos[0].a], [true, '1/1', horas, horas * 60]);
    }
  }));

  it('saída ordenada por horário, com Ground antes dos voos no mesmo horário', () => emTodos(({ out }) => {
    out.slice(1).forEach((o, i) => {
      const ant = out[i];
      assert.ok(ant.a < o.a || (ant.a === o.a && (ant.isGround || !o.isGround)), `${ant.fKey} antes de ${o.fKey}`);
    });
  }));

  it('a sala de Ground recebe uma turma por vez', () => emTodos(({ out }) => {
    const turmas = [...Map.groupBy(out.filter(o => o.isGround), o => o.classKey).values()].map(m => m[0]);
    for (const [i, x] of turmas.entries()) {
      for (const y of turmas.slice(i + 1)) assert.ok(!sobrepoe(x, y), `${x.classKey} e ${y.classKey} ao mesmo tempo`);
    }
  }));

  it('turmas de Ground reúnem a mesma temática, horário e instrutor', () => emTodos(({ out }) => {
    const turmas = Map.groupBy(out.filter(o => o.isGround), o => o.classKey);
    for (const membros of turmas.values()) {
      assert.equal(new Set(membros.map(m => `${m.mis}|${m.w}|${m.insId}`)).size, 1);
      membros.forEach(m => assert.equal(m.groupSize, Math.max(1, membros.filter(o => o.status !== 'Cancelado').length)));
      assert.ok(isGroundMission(membros[0].mis));
    }
  }));

  it('instrutor em duas matrículas do mesmo tipo só quando nenhuma estava livre em todos os horários dele', () => emTodos(({ estado, out }) => {
    // Os voos com status de andamento ficam no avião deles e o cancelado não ocupa nada: a regra vale
    // para os que podem mudar
    for (const tipo of ['C152', 'C172', 'PA-34']) {
      const voos = out.filter(o => o.eqType === tipo && o.r !== ACROBAT_REG && o.status !== 'Cancelado');
      const mudam = voos.filter(o => !['Atrasado', 'Em Voo'].includes(o.status));
      for (const insId of new Set(mudam.map(o => o.insId))) {
        const meus = mudam.filter(o => o.insId === insId);
        if (new Set(meus.map(o => o.r)).size < 2) continue;
        // Livre, servindo a todos os voos dele (os requisitos do voo) e com a habilitação própria, quando o avião exige
        const x = estado.ins.find(i => i.id === insId);
        const livre = EQ[tipo].find(r => r !== ACROBAT_REG && estado.av[r] && instrutorVoaNoAviao(x, recursoDaFrota(frotaDe(estado), r)) &&
          meus.every(f => aviaoServe(recursoDaFrota(frotaDe(estado), r), { mis: f.mis, eq: f.eqType, curso: pedidoDe(estado, f).stu.curso }) &&
            !voos.some(o => o.insId !== insId && o.r === r && sobrepoe(o, f))));
        assert.equal(livre, undefined, `instrutor ${insId} usou ${[...new Set(meus.map(o => o.r))]} com ${livre} livre o dia todo`);
      }
    }
  }));

  it('nenhum avião passa das 50 horas desde a última revisão (aviões perto do limite em 100 cenários)', () => {
    const falhas = [];
    for (const seed of SEEDS.slice(0, 100)) {
      const estado = gerarCenario(seed);
      const avioes = ['C152', 'C172', 'PA-34'].flatMap(t => EQ[t]);
      estado.horas = Object.fromEntries(avioes.filter((r, i) => i % 2 === 0).map((r, i) => [r, 46 + (i % 8) * 0.5]));
      const { out } = runAllocationEngine(estado);
      for (const [r, inicio] of Object.entries(estado.horas)) {
        const voadas = out.filter(o => o.r === r).reduce((t, o) => t + o.h, 0);
        if (inicio + voadas > 50 + 1e-9) falhas.push(`seed ${seed}: ${r} com ${inicio} + ${voadas} h`);
      }
    }
    assert.deepEqual(falhas.slice(0, 5), []);
  });

  it('é determinístico e não altera o estado recebido (também com as escolhas do operador)', () => {
    for (const [seed, estado] of SEEDS.slice(0, 50).flatMap(seed => [[seed, gerarCenario(seed)], [`${seed} com escolhas`, comEscolhas(gerarCenario(seed), seed)]])) {
      const copia = structuredClone(estado);
      const primeira = runAllocationEngine(estado);
      assert.deepEqual(estado, copia, `seed ${seed}: estado alterado`);
      assert.deepEqual(runAllocationEngine(estado), primeira, `seed ${seed}: saída diferente`);
    }
  });
});

// A escala aprovada com atrasos, cancelamentos e pedidos novos. Cada voo ocupa o horário efetivo (o atrasado, o novo);
// o cancelado não ocupa nada. Entre dois voos fixos, a sobreposição é o aviso de atraso; fora isso, nada se sobrepõe
describe('Invariantes da escala aprovada com atrasos e cancelamentos', () => {
  const fixar = out => Object.fromEntries(out.map(o => [o.fKey, { a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}) }]));
  const dias = SEEDS.slice(0, 150).map(seed => {
    const base = gerarCenario(seed);
    const antes = runAllocationEngine(base);
    const fStatus = {}, fObs = {};
    antes.out.forEach((o, i) => {
      if (i % 5 === 1) fStatus[o.fKey] = 'Cancelado';
      if (i % 5 === 3 && !o.isGround && o.b + 60 <= 1440) { fStatus[o.fKey] = 'Atrasado'; fObs[o.fKey] = { novoInicio: o.a + 60 }; }
    });
    const novos = [0, 1, 2, 3].map(i => ({ id: 9000 + i, nm: `Novo ${i}`, kg: 70, bl: [], extra: [], fly: true, mis: 'Voo Local', eq: 'C152', p1: [390, 500, 610, 760][i], p2: -1, nb: 1, ss: 1, pr: 5 }));
    const estado = { ...base, stu: [...base.stu, ...novos], fixos: fixar(antes.out), fStatus, fObs };
    return { seed, estado, ...runAllocationEngine(estado) };
  });

  it('nada se sobrepõe a um voo novo no avião, no instrutor ou no aluno (cada voo no horário efetivo)', () => {
    const falhas = [];
    for (const { seed, estado, out } of dias) {
      const ativos = [...new Map(out.filter(o => (estado.fStatus[o.fKey] || o.status) !== 'Cancelado').map(o => [o.classKey || o.fKey, o])).values()]
        .map(o => ({ o, a: estado.fObs[o.fKey] ? estado.fObs[o.fKey].novoInicio : o.a, b: estado.fObs[o.fKey] ? estado.fObs[o.fKey].novoInicio + o.b - o.a : o.b }));
      for (const [i, x] of ativos.entries()) {
        for (const y of ativos.slice(i + 1)) {
          if ((x.o.fixo && y.o.fixo) || !sobrepoe(x, y)) continue;
          if (x.o.r === y.o.r || x.o.insId === y.o.insId) falhas.push(`seed ${seed}: ${x.o.fKey} e ${y.o.fKey}`);
        }
      }
      const porAluno = out.filter(o => (estado.fStatus[o.fKey] || o.status) !== 'Cancelado' && !o.fixo);
      for (const x of porAluno) {
        for (const y of out.filter(o => o !== x && o.stuId === x.stuId && (estado.fStatus[o.fKey] || o.status) !== 'Cancelado')) {
          const ya = estado.fObs[y.fKey] ? estado.fObs[y.fKey].novoInicio : y.a;
          if (sobrepoe(x, { a: ya, b: ya + y.b - y.a })) falhas.push(`seed ${seed}: aluno ${x.stuId}`);
        }
      }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} sobreposição(ões)`);
  });

  it('os voos com status ficam onde estavam, com o mesmo instrutor e avião', () => {
    const falhas = [];
    for (const { seed, estado, out } of dias) {
      for (const o of out.filter(v => estado.fStatus[v.fKey])) {
        const p = estado.fixos[o.fKey];
        if (p && (o.a !== p.a || o.r !== p.r || o.insId !== p.insId)) falhas.push(`seed ${seed}: ${o.fKey}`);
      }
    }
    assert.deepEqual(falhas.slice(0, 5), []);
  });
});

// Fora das preferências, o voo vai para o horário mais perto da 1ª. Sem a compactação e sem a divisão das horas
// (que trocam o instrutor depois), nenhum horário mais perto (ou à mesma distância e mais cedo) servia ao mesmo avião,
// ao mesmo instrutor e ao aluno (sem a troca de matrículas também: ela muda o avião de outros voos depois; e sem o almoço,
// #104: o horário mais perto que levaria a última hora livre do INVA de 11:00 a 14:00 é pulado, e o almoço tem os testes
// dele em almoco.test.js)
describe('O horário mais perto da preferência, em 300 cenários', async () => {
  const { horariosDaMissao, minutoDaPreferencia } = await import('../../js/horarios.js');
  const { disponivelPara } = await import('../../js/disponibilidade.js');
  const { normalizarLimites, dentroDosLimites } = await import('../../js/limites.js');
  const { AIRCRAFT_EQ_TYPES } = await import('../../js/config.js');
  const { disponibilidadeDoAluno } = await import('../../js/rules.js');

  it('nenhum horário mais perto da 1ª preferência servia ao mesmo avião e instrutor', () => {
    const falhas = [];
    for (const seed of SEEDS) {
      const estado = gerarCenario(seed);
      const { out } = runAllocationEngine(estado, { compactar: false, dividirHoras: false, trocarMatriculas: false, almoco: false });
      for (const o of out.filter(v => !v.isGround && v.baseTag === 'Próximo livre' && v.status !== 'Cancelado')) {
        const { d } = pedidoDe(estado, o);
        const p1 = minutoDaPreferencia(d.p1), p2 = minutoDaPreferencia(d.p2);
        const ancora = p1 >= 0 ? p1 : p2;
        if (ancora < 0) continue;
        const dur = o.b - o.a, fim = fimDoVoo(o);
        const x = estado.ins.find(i => i.id === o.insId);
        const permitidas = disponibilidadeDoAluno(d.jan);
        // O voo cancelado sem o cadeado (dados antigos: o app fixa o cancelado) ainda ocupa o horário
        // quando o motor escala
        const outros = out.filter(v => v !== o);
        const depoisDoGround = Math.max(0, ...out.filter(g => g.isGround && g.stuId === o.stuId && doesGroundGateFlight(g.mis, d)).map(g => g.b));
        const unicos = lista => [...new Map(lista.map(v => [v.classKey || v.fKey, v])).values()];
        for (const m of horariosDaMissao(estado.horarios || undefined, o.mis, o.eqType)) {
          const maisPerto = Math.abs(m - ancora) < Math.abs(o.a - ancora) || (Math.abs(m - ancora) === Math.abs(o.a - ancora) && m < o.a);
          if (!maisPerto || m === p1 || m === p2 || m + dur > fim || m < depoisDoGround || !estado.win[periodoDoMinuto(m)] || (permitidas && !permitidas(m))) continue;
          const livre = v => !(v.a < m + dur && m < v.b);
          if (!outros.filter(v => v.r === o.r).every(livre) || !outros.filter(v => v.insId === o.insId).every(livre) || !outros.filter(v => v.stuId === o.stuId).every(livre)) continue;
          if (!disponivelPara(x, m, m + dur)) continue;
          const compromissos = unicos(outros.filter(v => v.insId === o.insId)).map(v => ({ a: v.a, b: v.b, voo: AIRCRAFT_EQ_TYPES.includes(v.eqType) }));
          if (!dentroDosLimites({ compromissos, novo: { a: m, b: m + dur, voo: AIRCRAFT_EQ_TYPES.includes(o.eqType) }, historico: (estado.horasDosInstrutores || {})[o.insId] || null, limites: normalizarLimites(estado.limites) }).ok) continue;
          falhas.push(`seed ${seed}: ${o.fKey} às ${o.a}, mas ${m} servia (âncora ${ancora})`);
        }
      }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} voo(s) longe da preferência sem motivo`);
  });
});

// O que o operador define vale mais que a escolha do app: o instrutor escolhido para o dia (na Demanda ou na Escala)
// e o “Priorizar com” do aluno (o par permanente, com aviso quando nenhum dos instrutores dele pode)
describe('Invariantes das escolhas do operador, em 300 cenários', () => {
  const pedidoDoVoo = (estado, o) => pedidoDe(estado, o).d;
  const emTodasAsEscolhas = verificar => {
    const falhas = [];
    for (const exec of comAsEscolhas) {
      try { verificar(exec); } catch (e) { falhas.push(`seed ${exec.seed}: ${e.message}`); }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} cenário(s) violam a propriedade`);
  };

  it('os cenários têm escolhas de todo tipo (o teste não passa por falta delas)', () => {
    const pedidos = comAsEscolhas.flatMap(({ estado }) => estado.stu.flatMap(s => [s, ...s.extra].filter(p => p.fly && p.insId)));
    const comPar = comAsEscolhas.flatMap(({ estado }) => estado.stu.filter(s => s.voaCom));
    const avisos = comAsEscolhas.flatMap(({ al }) => al.filter(a => a.codigo === 'voa-com'));
    const recusas = comAsEscolhas.flatMap(({ al }) => al.filter(a => a.codigo === 'instrutor-escolhido'));
    const noPar = comAsEscolhas.flatMap(({ out }) => out.filter(o => o.insPar));
    assert.ok(pedidos.length > 300 && comPar.length > 600 && avisos.length > 50 && recusas.length > 50 && noPar.length > 300,
      JSON.stringify({ pedidos: pedidos.length, comPar: comPar.length, avisos: avisos.length, recusas: recusas.length, noPar: noPar.length }));
  });

  // O escolhido que está no cadastro (o que saiu não vale mais: o pedido volta para o Automático, com aviso)
  const escolhidoValido = (estado, d) => Boolean(d.insId) && estado.ins.some(x => x.id === d.insId);

  it('o pedido com o instrutor escolhido voa só com ele', () => emTodasAsEscolhas(({ estado, out }) => {
    for (const o of out) {
      const d = pedidoDoVoo(estado, o);
      if (escolhidoValido(estado, d)) assert.ok(o.insId === d.insId && o.insEscolhido, `${o.fKey}: ${o.insId} em vez de ${d.insId}`);
      else assert.ok(!o.insEscolhido, `${o.fKey}: marcado sem escolha`);
    }
  }));

  it('o escolhido que saiu do cadastro: o voo fica com outro, e o aviso diz com quem', () => emTodasAsEscolhas(({ estado, out, al }) => {
    const avisos = al.filter(a => a.codigo === 'escolhido-saiu');
    for (const o of out) {
      const d = pedidoDoVoo(estado, o);
      const saiu = d.insId === FORA_DO_CADASTRO;
      // O aviso é do voo pelo rótulo (o aluno, e a missão na extra): duas missões do aluno podem ficar com o mesmo INVA
      const rotulo = o.mid ? `${o.s} (${o.mis})` : o.s;
      assert.equal(avisos.some(a => a.s === rotulo && a.stuId === o.stuId && a.insId === o.insId && a.m.includes(o.ins)), saiu, `${o.fKey}: aviso ${saiu ? 'faltando' : 'a mais'}`);
    }
  }));

  it('o escolhido que não vem, sem a habilitação ou bloqueado: o pedido fica fora, com o código', () => emTodasAsEscolhas(({ estado, out, al }) => {
    for (const s of estado.stu) {
      for (const [mid, d] of [[0, s], ...s.extra.map(ex => [ex.mid, ex])]) {
        if (!d.fly || !escolhidoValido(estado, d)) continue;
        const x = estado.ins.find(i => i.id === d.insId);
        const tipo = isGroundMission(d.mis) ? 'Sala Ground' : d.eq;
        if (x && x.on && podeFazer(x, d.mis, tipo) && !s.bl.includes(x.id)) continue;
        assert.ok(!out.some(o => o.stuId === s.id && o.mid === mid), `${s.id}_${mid} voou com ${d.insId}`);
        if (!x.on) assert.ok(al.some(a => a.codigo === 'instrutor-escolhido' || a.codigo === 'equipamento-da-missao'), `${s.id}_${mid} sem o motivo`);
      }
    }
  }));

  it('com o “Priorizar com”, o voo fica com um instrutor dele; senão, o aviso diz quem ficou com o voo', () => emTodasAsEscolhas(({ estado, out, todos, al }) => {
    const avisos = al.filter(a => a.codigo === 'voa-com');
    for (const o of out) {
      const s = estado.stu.find(x => x.id === o.stuId), d = pedidoDoVoo(estado, o);
      const pares = (s.voaCom || []).filter(id => estado.ins.some(x => x.id === id));
      if (escolhidoValido(estado, d) || !pares.length) { assert.ok(!o.insPar, `${o.fKey}: marcado sem Priorizar com`); continue; }
      if (pares.includes(o.insId)) { assert.ok(o.insPar, `${o.fKey}: com o par sem a marca`); continue; }
      assert.ok(avisos.some(a => a.stuId === o.stuId && a.insId === o.insId && a.m.includes(o.ins)), `${o.fKey}: com ${o.insId}, fora do Priorizar com ${pares}, sem aviso`);
    }
    // Um aviso por voo (F1h), de um voo que está na escala com aquele instrutor: fora do “Priorizar com”, o aviso de sempre;
    // com o instrutor dele, só a disputa, que nomeia quem ficou com o instrutor no horário pedido (está com ele na escala)
    assert.equal(new Set(avisos.map(a => a.fKey)).size, avisos.length, 'dois avisos no mesmo voo');
    for (const a of avisos) {
      const s = estado.stu.find(x => x.id === a.stuId);
      const o = out.find(v => v.fKey === a.fKey);
      assert.ok(o && o.stuId === a.stuId && o.insId === a.insId, `aviso solto: ${a.m}`);
      // Fora do “Priorizar com”: o de sempre, ou o do INVA escolhido para o dia na Demanda (a revisão do F1h)
      if (!s.voaCom.includes(a.insId)) {
        const escolhido = escolhidoValido(estado, pedidoDoVoo(estado, o));
        assert.ok(escolhido ? a.m.startsWith('Fora do “Priorizar com”') || a.m.startsWith('Sem o instrutor de “Priorizar com”') : a.m.startsWith('Sem o instrutor de “Priorizar com”'), a.m);
        continue;
      }
      // A disputa nomeia o INVA do “Priorizar com” (o do voo ou outro dele) e quem está com ele
      const [, nome, outro] = / priorizam? (.+?) às \d\d:\d\d: ficou com (.+?)(?: \(|;|\.$)/.exec(a.m) || [];
      const x = estado.ins.find(i => i.nm === nome);
      assert.ok(x && s.voaCom.includes(x.id) && todos.some(v => v.s === outro && v.insId === x.id && v.stuId !== a.stuId), `disputa sem o outro: ${a.m}`);
    }
  }));

  // F1h (Pedro, 2026-11-26): o “Priorizar com” escolhe o instrutor, não o horário. O pareamento no horário (js/engine.js)
  // só troca o instrutor de voos de um mesmo horário: contra o motor sem ele, nenhum horário muda, ninguém sai de um
  // instrutor do “Priorizar com”, e o voo fixo, o do instrutor escolhido, a turma de Ground e a volta do noturno ficam com o
  // instrutor deles; nenhum avião muda, e cada instrutor fica com os mesmos voos de cada categoria do rodízio
  it('o pareamento no horário só troca o instrutor: o horário, o avião, o rodízio, o “Priorizar com” de quem já tinha, os fixos e os escolhidos ficam', () => {
    let trocados = 0, noRodizio = 0;
    const doRodizio = out => JSON.stringify(out.filter(o => !o.trecho && categoriaDoRodizio(o.mis, o.eqType))
      .map(o => `${categoriaDoRodizio(o.mis, o.eqType)} ${o.insId}`).sort());
    emTodasAsEscolhas(({ estado, todos }) => {
      const semOPareamento = runAllocationEngine(estado, { parearNoHorario: false }).out;
      const sem = new Map(semOPareamento.map(o => [o.fKey, o]));
      assert.equal(todos.length, sem.size, 'outros voos');
      assert.equal(doRodizio(todos), doRodizio(semOPareamento), 'o rodízio mudou');
      for (const o of todos) {
        const v = sem.get(o.fKey);
        assert.ok(v && v.a === o.a && v.b === o.b, `${o.fKey}: o horário mudou`);
        assert.equal(o.r, v.r, `${o.fKey}: o avião mudou`);
        if (v.insId !== o.insId && categoriaDoRodizio(o.mis, o.eqType)) noRodizio++;
        if (v.insId === o.insId) continue;
        trocados++;
        const pares = (estado.stu.find(s => s.id === o.stuId) || {}).voaCom || [];
        assert.ok(!pares.includes(v.insId) || pares.includes(o.insId), `${o.fKey}: saiu do “Priorizar com”`);
        assert.ok(!v.fixo && !v.insEscolhido && !v.isGround && !v.trecho, `${o.fKey}: o instrutor de um voo preso mudou`);
      }
    });
    assert.ok(trocados > 0 && noRodizio > 0, `${trocados} voos trocaram de instrutor, ${noRodizio} do rodízio (o teste não passa por falta deles)`);
  });

  // Sem o pareamento no horário, que vem depois delas (e tem o invariante dele, acima): a escala antes e depois delas
  it('a divisão das horas e a compactação não trocam o instrutor escolhido nem o do “Priorizar com”', () => emTodasAsEscolhas(({ estado }) => {
    const antes = new Map(runAllocationEngine(estado, { compactar: false, dividirHoras: false, parearNoHorario: false }).out.map(o => [o.fKey, o]));
    const { out } = runAllocationEngine(estado, { parearNoHorario: false });
    for (const o of antes.values()) {
      if (!o.insEscolhido && !o.insPar) continue;
      const depois = out.find(v => v.fKey === o.fKey);
      assert.ok(depois && depois.insId === o.insId, `${o.fKey}: ${o.insId} → ${depois && depois.insId}`);
    }
  }));

});

// O dia aprovado com voos agendados na Escala em qualquer recurso, instrutor e horário (também fora das regras e em
// conflito): os agendados entram depois dos voos aprovados, que ficam onde estavam e sem conflito. Os conflitos e os
// avisos das regras puladas ficam nos agendados, a escala é determinística e a escala gravada a aceita inteira
describe('Voos agendados num dia aprovado, em 150 cenários', () => {
  const pino = o => ({ a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}) });
  const MISSOES = [['Voo Local', 'C152'], ['Voo Local', 'C172'], ['Navegação', 'C152'], ['Voo Solo', 'C152'], ['Noturno', 'C172'], ['Simulador', 'Sim. Mono'], ['Ground C152', 'Sala Ground'], ['Multimotor', 'PA-34']];
  const HORARIOS = [390, 420, 500, 610, 690, 760, 820, 870, 980, 1000, 1050];
  // Os agendamentos, com outro gerador (o cenário não muda): quatro voos de aluno novo ou missões extras de quem já voa,
  // às vezes na turma de Ground aprovada; num quarto dos dias, mais sete voos locais no mesmo horário
  function comAgendados(base, antes, seed) {
    const r = mulberry32(seed * 6151 + 11);
    const pick = a => a[Math.floor(r() * a.length)];
    const stu = structuredClone(base.stu);
    const fixos = fixosAoAprovar({}, antes.out);
    const turmas = antes.out.filter(o => o.isGround && o.status !== 'Cancelado');
    const horarioDosLocais = pick(HORARIOS.slice(0, -1));
    const pedidos = [
      ...Array.from({ length: 4 }, () => pick(MISSOES)),
      ...(seed % 4 ? [] : Array.from({ length: 7 }, () => ['Voo Local', 'C152', horarioDosLocais]))
    ];
    pedidos.forEach(([mis, eq, horario], i) => {
      const ground = eq === 'Sala Ground';
      const turma = ground && turmas.length && r() < 0.5 ? pick(turmas) : null;
      const nb = ground ? 1.5 : mis === 'Noturno' ? 4 : 1 + Math.floor(r() * 2);
      const pedido = { fly: true, mis: turma ? turma.mis : mis, eq, p1: 390, p2: -1, nb, ss: 1, pr: 1 + Math.floor(r() * 5) };
      const a = turma ? turma.a : horario || pick(HORARIOS);
      const agendado = {
        a, b: Math.min(a + Math.round(nb * 60), 1440), r: ground ? 'SALA-GROUND' : pick(FROTA_POR_TIPO[eq]),
        insId: turma ? turma.insId : pick(base.ins).id, agendado: true, ...(turma ? { classKey: turma.classKey } : {})
      };
      if (r() < 0.5) {
        stu.push({ id: 9000 + i, nm: `Agendado ${i}`, kg: r() < 0.2 ? 0 : 70, bl: [], extra: [], ...pedido });
        fixos[`${9000 + i}_0_1`] = agendado;
      } else {
        const s = pick(stu);
        s.extra.push({ mid: 900 + i, ...pedido });
        fixos[`${s.id}_${900 + i}_1`] = agendado;
      }
    });
    return { ...base, stu, fixos };
  }
  const dias = SEEDS.slice(0, 150).map(seed => {
    // Metade dos dias com a volta do noturno de ontem (não é um voo fixo do dia: fica como era)
    const base = seed % 2 ? gerarCenario(seed) : comVolta(gerarCenario(seed), seed);
    const antes = runAllocationEngine(base);
    const estado = comAgendados(base, antes, seed);
    const copia = structuredClone(estado);
    return { seed, antes, estado, copia, depois: runAllocationEngine(estado) };
  });
  const emTodosOsDias = verificar => {
    const falhas = [];
    for (const dia of dias) {
      try { verificar(dia); } catch (e) { falhas.push(`seed ${dia.seed}: ${e.message}`); }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} dia(s) violam a propriedade`);
  };

  it('os dias têm agendamentos de todo tipo (o teste não passa por falta deles)', () => {
    const agendados = dias.flatMap(({ depois }) => depois.out.filter(o => o.agendado));
    const avisos = dias.flatMap(({ depois }) => depois.al.filter(a => a.t === 'warn' && a.fKey));
    const quantos = codigo => avisos.filter(a => a.codigo === codigo).length;
    const naTurma = dias.flatMap(({ depois }) => depois.out.filter(o => o.agendado && o.isGround && depois.out.some(v => !v.agendado && v.classKey === o.classKey)));
    const contagens = { agendados: agendados.length, emConflito: agendados.filter(o => o.conflito).length, semConflito: agendados.filter(o => !o.conflito).length, naTurma: naTurma.length, semPeso: quantos('sem-peso'), ...Object.fromEntries(CODIGOS_DO_AGENDADO.map(c => [c, quantos(c)])) };
    assert.ok(contagens.agendados > 700 && contagens.emConflito > 300 && contagens.semConflito > 50 && contagens.naTurma > 10 && contagens.semPeso > 30 &&
      CODIGOS_DO_AGENDADO.every(c => contagens[c] > 10), JSON.stringify(contagens));
  });

  it('os voos aprovados ficam onde estavam, sem conflito (e a volta do noturno, como era)', () => emTodosOsDias(({ antes, depois }) => {
    for (const o of antes.out) {
      const igual = depois.out.find(v => v.fKey === o.fKey);
      assert.ok(igual, `${o.fKey} sumiu`);
      assert.deepEqual(pino(igual), pino(o), `${o.fKey} mudou`);
      assert.equal(igual.conflito, undefined, `${o.fKey} em conflito`);
      assert.equal(igual.agendado, undefined, `${o.fKey} com a marca`);
    }
    assert.deepEqual(depois.out.filter(o => o.trecho), antes.out.filter(o => o.trecho));
  }));

  it('cada agendado fica no lugar dele, com a marca; os conflitos e os avisos das regras puladas são só dos agendados', () => emTodosOsDias(({ estado, depois }) => {
    const agendados = new Map(depois.out.filter(o => o.agendado).map(o => [o.fKey, o]));
    for (const [fKey, p] of Object.entries(estado.fixos).filter(([, p]) => p.agendado)) {
      const o = agendados.get(fKey);
      assert.ok(o, `${fKey} fora da escala`);
      assert.deepEqual([o.a, o.b, o.r, o.insId, o.fixo], [p.a, p.b, p.r, p.insId, true], fKey);
    }
    for (const a of depois.al.filter(x => x.t === 'conf')) {
      assert.ok(agendados.has(a.fKey) && a.m.startsWith('Conflito no voo agendado: '), `${a.fKey}: ${a.m}`);
    }
    for (const a of depois.al.filter(x => x.t === 'warn' && (CODIGOS_DO_AGENDADO.includes(x.codigo) || x.fKey))) {
      assert.ok(agendados.has(a.fKey) && !agendados.get(a.fKey).conflitoCodigos?.includes('ground-ou-voo'), `${a.fKey}: ${a.m}`);
      assert.ok(!['Atrasado', 'Em Voo', 'Pousou', 'Cancelado'].includes(agendados.get(a.fKey).status), `${a.fKey}: ${a.m}`);
    }
  }));

  it('é determinístico, não altera o estado recebido, e a escala gravada aceita a escala inteira', () => emTodosOsDias(({ estado, copia, depois }) => {
    assert.deepEqual(estado, copia, 'estado alterado');
    assert.deepEqual(runAllocationEngine(estado), depois, 'saída diferente');
    assert.deepEqual(normalizarEscalaGravada(depois), depois, 'a escala gravada não aceita');
  }));
});

// Q8 (F1d): sete, oito ou nove voos locais pedidos no mesmo horário exato, um ou dois deles confirmados (o 7º voo local
// confirmado na Agenda), em 150 cenários, com prioridades, instrutores escolhidos e “Priorizar com” sorteados: os não
// confirmados ficam em no máximo 6 por horário, o confirmado não toma o lugar de nenhum deles (com 6 não confirmados no
// horário, todos voam ali) e cada confirmado num horário com mais de 6 locais avisa, uma vez
describe('O 7º voo local confirmado, em 150 cenários', () => {
  const LOCAIS = ['Voo Local', 'Voo Solo', 'TGL (TMA)'];
  const dias = SEEDS.slice(0, 150).map(seed => {
    const r = mulberry32(seed * 7919 + 3);
    const base = gerarCenario(seed);
    const minuto = [500, 610, 820][Math.floor(r() * 3)];
    const confirmados = 1 + Math.floor(r() * 2);
    const ativos = base.ins.filter(x => x.on);
    const novos = Array.from({ length: 6 + confirmados }, (_, i) => {
      const extra = {};
      if (r() < 0.2 && ativos.length) extra.insId = ativos[Math.floor(r() * ativos.length)].id;
      return {
        id: 8000 + i, nm: `Local ${i}`, kg: 60, bl: [], extra: [], ...(r() < 0.2 && ativos.length ? { voaCom: [ativos[Math.floor(r() * ativos.length)].id] } : {}),
        fly: true, mis: 'Voo Local', eq: 'C152', p1: minuto, p2: -1, jan: `h${minuto}`, nb: 1, ss: 1, pr: 1 + Math.floor(r() * 5),
        ...(i >= 6 ? { limiteConfirmado: true } : {}), ...extra
      };
    });
    // Os confirmados em qualquer lugar da fila
    novos.sort(() => r() - 0.5);
    const estado = { ...base, stu: [...base.stu, ...novos] };
    return { seed, estado, minuto, ...runAllocationEngine(estado) };
  });

  it('os não confirmados ficam em no máximo 6 por horário, e cada confirmado num horário cheio avisa uma vez', () => {
    const falhas = [];
    for (const { seed, estado, out, al } of dias) {
      try {
        const locais = out.filter(o => !o.trecho && LOCAIS.includes(o.mis) && o.status !== 'Cancelado');
        const porHorario = new Map();
        for (const o of locais.filter(o => !confirmadoNoMinuto(estado, o))) porHorario.set(o.a, (porHorario.get(o.a) || 0) + 1);
        for (const [a, n] of porHorario) assert.ok(n <= 6, `${n} locais não confirmados às ${a}`);
        // Os confirmados que passam dos 6 no horário (sem os cancelados) avisam, um aviso cada; o que ainda cabe, não
        for (const a of new Set(locais.map(o => o.a))) {
          const noHorario = locais.filter(o => o.a === a), confirmados = noHorario.filter(o => confirmadoNoMinuto(estado, o));
          const avisados = confirmados.filter(o => al.some(x => x.codigo === 'limite-de-locais' && x.fKey === o.fKey));
          assert.equal(avisados.length, Math.max(0, Math.min(confirmados.length, noHorario.length - 6)), `às ${a}`);
          for (const o of avisados) assert.equal(al.filter(x => x.codigo === 'limite-de-locais' && x.fKey === o.fKey).length, 1);
        }
        // Nenhum aviso de limite para quem não é confirmado (não há agendados aqui)
        assert.ok(al.filter(x => x.codigo === 'limite-de-locais' && x.t === 'warn').every(x => locais.some(o => o.fKey === x.fKey && confirmadoNoMinuto(estado, o))));
      } catch (e) { falhas.push(`seed ${seed}: ${e.message}`); }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} cenário(s) violam a propriedade`);
  });

  it('o confirmado não toma o lugar de um não confirmado: este só fica fora pelo limite com seis não confirmados no horário', () => {
    const falhas = [];
    let cheios = 0;
    // Sem a compactação: a contagem é a da fila (a compactação depois só tira voos do horário, nunca traz)
    for (const { seed, estado, minuto } of dias) {
      const { out, al } = runAllocationEngine(estado, { compactar: false });
      // A fila conta o voo cancelado que ela mesma pôs (só o fixo cancelado não ocupa o horário)
      const naoConfirmados = out.filter(o => o.a === minuto && !o.trecho && LOCAIS.includes(o.mis) && !(o.fixo && o.status === 'Cancelado') && !confirmadoNoMinuto(estado, o)).length;
      const todosNoMinuto = out.filter(o => o.a === minuto && !o.trecho && LOCAIS.includes(o.mis) && o.status !== 'Cancelado').length;
      if (todosNoMinuto > 6) cheios++;
      for (const s of estado.stu.filter(x => x.id >= 8000 && !x.limiteConfirmado && !out.some(o => o.stuId === x.id))) {
        const recusa = al.find(a => a.t === 'err' && a.s === s.nm);
        if (recusa && recusa.codigo === 'limite-de-locais' && naoConfirmados !== 6) falhas.push(`seed ${seed}: ${s.nm} fora pelo limite com ${naoConfirmados} não confirmados às ${minuto}`);
      }
    }
    assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} cenário(s)`);
    assert.ok(cheios > 30, `${cheios} dias com mais de 6 locais no horário (os confirmados a mais)`);
  });
});

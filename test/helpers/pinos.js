// Dias com voos fixos de todo tipo sobre os cenários dos goldens (js/conferencia.js): a escala aprovada (com pedidos novos
// e com o que mudou depois dela: um INVA fora, um avião parado, outra duração), os voos fixos pelo status (Em Voo,
// Atrasado com a nova decolagem, Pousou, Cancelado), o instrutor escolhido na Escala e os voos agendados em qualquer
// lugar (também fora das regras e em conflito), e os quatro juntos. Cada um com outro gerador: os cenários de base, e os
// goldens, não mudam. A saída do motor nesses dias foi gravada antes de a conferência dos voos fixos sair de
// js/engine.js (test/fixtures/conferencia-do-motor.json), e o motor depois dela devolve a mesma
import { createHash } from 'node:crypto';
import { runAllocationEngine as motor } from '../../js/engine.js';
import { fixosAoAprovar, fixosAoMudarStatus, pinoDoVoo } from '../../js/fixos.js';
import { chaveDoVoo, pedidoDoAluno } from '../../js/voo.js';
import { gerarCenario, comAtributos, comEscolhas, comVolta, mulberry32 } from './cenarios.js';
import { FROTA_POR_TIPO } from './estado.js';

export const TIPOS_DE_PINO = ['aprovada', 'status', 'escolhido', 'agendado', 'misto'];
export const SEMENTES_DOS_PINOS = Array.from({ length: 300 }, (_, i) => i + 1);

const MISSOES = [['Voo Local', 'C152'], ['Voo Local', 'C172'], ['Navegação', 'C152'], ['Voo Solo', 'C152'], ['Noturno', 'C172'], ['Simulador', 'Sim. Mono'], ['Ground C152', 'Sala Ground'], ['Multimotor', 'PA-34'], ['TGL', 'C152']];
const HORARIOS = [390, 420, 500, 610, 690, 760, 820, 870, 980, 1000, 1050];

// O cenário de base: às vezes com os atributos dos recursos, as escolhas do operador na Demanda ou a volta do noturno
function base(seed) {
  const cenario = gerarCenario(seed);
  return [cenario, comAtributos(cenario, seed), comEscolhas(cenario, seed), comVolta(cenario, seed)][seed % 4];
}

const pedidoDe = (estado, fKey) => {
  const [stuId, mid] = fKey.split('_').map(Number);
  const s = estado.stu.find(x => x.id === stuId);
  return s ? pedidoDoAluno(s, mid) : null;
};

// A escala aprovada (todos os voos fixos), com pedidos novos e o que mudou depois: um INVA que deixou de vir, um avião
// parado, um pedido com outra duração ou outro recurso, um pedido que saiu
function aprovada(estado, antes, r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const stu = structuredClone(estado.stu);
  const novo = { ...estado, stu, ins: estado.ins.map(x => ({ ...x })), av: { ...estado.av } };
  novo.fixos = fixosAoAprovar(estado.fixos || {}, antes.out);
  novo.aprovacao = { em: '2026-11-26T10:00:00.000Z', por: 'Operador' };
  const voos = antes.out.filter(o => !o.trecho);
  if (voos.length && r() < 0.5) { const x = novo.ins.find(i => i.id === pick(voos).insId); if (x) x.on = false; }
  if (voos.length && r() < 0.5) { const o = pick(voos); if (!o.isGround) novo.av[o.r] = false; }
  for (let i = 0; i < 2 && voos.length; i++) {
    const d = pedidoDe(novo, pick(voos).fKey);
    if (!d) continue;
    const mudanca = r();
    if (mudanca < 0.3 && !d.mis.startsWith('Ground')) d.nb = 1 + Math.floor(r() * 3);
    else if (mudanca < 0.45) d.jan = pick(['manha', 'tarde']);
    else if (mudanca < 0.6) d.fly = false;
  }
  for (let i = 0; i < 3; i++) {
    const [mis, eq] = pick(MISSOES);
    stu.push({ id: 9100 + i, nm: `Novo ${i}`, kg: r() < 0.2 ? 0 : 60 + Math.floor(r() * 40), bl: [], extra: [], fly: true, mis, eq, p1: pick(HORARIOS), p2: -1, nb: eq === 'Sala Ground' ? 1.5 : 1 + Math.floor(r() * 2), ss: 1, pr: 1 + Math.floor(r() * 5) });
  }
  return novo;
}

// Os voos fixos pelo status: Em Voo, Atrasado (a nova decolagem), Pousou e Cancelado; às vezes depois de uma aprovação
function peloStatus(estado, antes, r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const novo = { ...estado, stu: structuredClone(estado.stu), fStatus: { ...(estado.fStatus || {}) }, fObs: { ...(estado.fObs || {}) }, fixos: { ...(estado.fixos || {}) } };
  for (const o of antes.out.filter(v => !v.trecho)) {
    if (r() > 0.3) continue;
    const status = pick(['Em Voo', 'Atrasado', 'Pousou', 'Cancelado', 'Pendente', 'Confirmado']);
    novo.fStatus[o.fKey] = status;
    if (status === 'Atrasado') novo.fObs[o.fKey] = { novoInicio: Math.min(o.a + 10 * (1 + Math.floor(r() * 9)), 1380) };
    if (status === 'Cancelado') novo.fObs[o.fKey] = { motivo: pick(['Meteorologia', 'Instrutor indisponível', 'Manutenção da aeronave', 'Outro']) };
    novo.fixos = fixosAoMudarStatus(novo.fixos, o, status, { aprovada: Boolean(novo.aprovacao) });
  }
  return novo;
}

// O instrutor escolhido na Escala: o voo fixo onde está, com ele (o pino escolhido), e o pedido guarda a escolha
function escolhido(estado, antes, r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const novo = { ...estado, stu: structuredClone(estado.stu), fixos: { ...(estado.fixos || {}) } };
  for (const o of antes.out.filter(v => !v.trecho && !v.isGround)) {
    if (r() > 0.25) continue;
    const x = pick(novo.ins);
    const d = pedidoDe(novo, o.fKey);
    if (!d) continue;
    d.insId = x.id;
    novo.fixos[o.fKey] = { ...pinoDoVoo(o), insId: x.id, escolhido: true };
  }
  return novo;
}

// Voos agendados na Escala em qualquer recurso, instrutor e horário: alunos novos, missões extras de quem já voa e o voo
// de hoje de um aluno movido, às vezes na turma de Ground de outro, às vezes sete locais no mesmo horário
function agendado(estado, antes, r, seed) {
  const pick = a => a[Math.floor(r() * a.length)];
  const stu = structuredClone(estado.stu);
  const fixos = { ...(estado.fixos || {}) };
  const turmas = antes.out.filter(o => o.isGround && o.status !== 'Cancelado');
  const horarioDosLocais = pick(HORARIOS.slice(0, -1));
  const pedidos = [...Array.from({ length: 4 }, () => pick(MISSOES)), ...(seed % 5 ? [] : Array.from({ length: 7 }, () => ['Voo Local', 'C152', horarioDosLocais]))];
  pedidos.forEach(([mis, eq, horario], i) => {
    const ground = eq === 'Sala Ground';
    const turma = ground && turmas.length && r() < 0.5 ? pick(turmas) : null;
    const nb = ground ? 1.5 : mis === 'Noturno' ? 4 : 1 + Math.floor(r() * 2);
    const pedido = { fly: true, mis: turma ? turma.mis : mis, eq, p1: pick(HORARIOS), p2: -1, nb, ss: 1, pr: 1 + Math.floor(r() * 5), ...(r() < 0.2 ? { jan: pick(['manha', 'tarde']) } : {}) };
    const a = turma ? turma.a : horario || pick(HORARIOS);
    const pino = {
      a, b: Math.min(a + Math.round(nb * 60), 1440), r: ground ? 'SALA-GROUND' : pick(FROTA_POR_TIPO[eq]),
      insId: turma ? turma.insId : pick(estado.ins).id, agendado: true, ...(turma ? { classKey: turma.classKey } : {})
    };
    const quem = r();
    if (quem < 0.4) {
      stu.push({ id: 9000 + i, nm: `Agendado ${i}`, kg: r() < 0.2 ? 0 : 70, bl: [], extra: [], ...pedido });
      fixos[chaveDoVoo(9000 + i, 0)] = pino;
    } else if (quem < 0.8 || !stu.length) {
      const s = pick(stu);
      s.extra.push({ mid: 900 + i, ...pedido });
      fixos[chaveDoVoo(s.id, 900 + i)] = pino;
    } else {
      // O voo de hoje do aluno, movido (o pedido continua o dele)
      const s = pick(stu);
      if (s.mis.startsWith('Ground') === ground) fixos[chaveDoVoo(s.id, 0)] = pino;
    }
  });
  return { ...estado, stu, fixos };
}

// O estado do dia com os voos fixos do tipo pedido, para a semente. opcoes: as do motor que monta as escalas de antes (a
// gravação é de antes do F1h: { parearNoHorario: false })
export function diaComPinos(seed, tipo, opcoes = {}) {
  const r = mulberry32(seed * 3301 + TIPOS_DE_PINO.indexOf(tipo) * 17 + 5);
  const inicial = base(seed);
  const runAllocationEngine = estado => motor(estado, opcoes);
  const antes = runAllocationEngine(inicial);
  if (tipo === 'aprovada') return aprovada(inicial, antes, r);
  if (tipo === 'status') return peloStatus(inicial, antes, r);
  if (tipo === 'escolhido') return escolhido(inicial, antes, r);
  if (tipo === 'agendado') return agendado(inicial, antes, r, seed);
  // Os quatro juntos: aprovada, com status, escolhas e agendamentos depois da aprovação
  let estado = aprovada(inicial, antes, r);
  estado = peloStatus(estado, runAllocationEngine(estado), r);
  estado = escolhido(estado, runAllocationEngine(estado), r);
  return agendado(estado, runAllocationEngine(estado), r, seed);
}

const semIndefinidos = valor => JSON.parse(JSON.stringify(valor));
export const impressaoDaSaida = saida => createHash('sha256').update(JSON.stringify(semIndefinidos(saida))).digest('hex').slice(0, 24);

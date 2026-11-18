// Sugestões para um conflito na escala aprovada: sem refazer o dia, o que pode voar no lugar do voo fixo que
// ficou impossível. No mesmo horário: outro avião do mesmo tipo (um que já saiu, com a menor folga, e depois o da
// frente do hangar), outro instrutor (habilitado, disponível, livre, sem bloqueio do aluno, dentro do peso e da lei; o
// tanque cheio primeiro, depois quem tem menos horas no dia e menos habilitações) ou os dois. Sem nada no mesmo horário,
// o primeiro horário mais tarde no mesmo dia, dentro da disponibilidade do aluno. Depois, soltar o voo (o motor o escala
// de novo; quando o pedido mudou, é a única sugestão) e, por último, cancelar. Cada sugestão é uma mudança no voo fixo;
// na turma de Ground, em todos os alunos dela. Os aviões e os instrutores que servem vêm de js/candidatos.js, com os
// outros voos do dia no horário marcado de cada um.
import { GROUND_EQ_TYPE, T, NI } from './config.js';
import { HORARIOS_INICIAIS, horariosDaMissao, periodoDoMinuto, fimDaMissao } from './horarios.js';
import { STATUS_EM_ANDAMENTO } from './status.js';
import { disponibilidadeDoAluno, doesGroundGateFlight } from './rules.js';
import { nomeDoRecurso } from './categorias.js';
import { hm } from './format.js';
import { gruposDoConflito } from './conflitos.js';
import { statusDoVoo, pedidosDosVoos } from './voo.js';
import { ocupacaoDaEscala, problemaDoAluno, avioesQueServem, instrutoresQueServem } from './candidatos.js';

// A turma de Ground muda inteira; o voo, sozinho
const doGrupo = (resultado, voo) => (voo.isGround ? resultado.out.filter(o => o.classKey === voo.classKey) : [voo]);

export function sugerirReparos(estado, resultado, fKey, { maximo = 3, depoisDe = null } = {}) {
  const voo = resultado.out.find(o => o.fKey === fKey);
  if (!voo || !voo.conflito) return [];
  const grupo = doGrupo(resultado, voo);
  // Os outros voos do dia (sem o voo, ou a turma, e sem os cancelados), no horário marcado
  const ocupacao = ocupacaoDaEscala(resultado.out, { fStatus: estado.fStatus, exceto: grupo.map(o => o.fKey) });
  const alunos = new Map(estado.stu.map(s => [s.id, s]));
  const pedidoDo = pedidosDosVoos(estado.stu);
  const tipo = voo.isGround ? GROUND_EQ_TYPE : voo.eqType;
  // Os requisitos do voo: a missão, o tipo e o curso do aluno (o noturno do PC é IFR; js/frota.js)
  const curso = (alunos.get(voo.stuId) || {}).curso;

  // Os aviões que servem ao voo (o tipo, o "Só Parafuso" e o "Só VFR") e, com o instrutor, os em que ele voa
  const avioesPara = (a, b, instrutor = null) => avioesQueServem(estado, ocupacao, { tipo, mis: voo.mis, curso, a, b, ground: voo.isGround, instrutor })
    .filter(c => !c.problema).map(c => c.r);
  // Os instrutores que servem no avião r (o avião com habilitação própria exige a dele), cada um com o combustível a
  // menos com ele ({ x, problemas, reducao })
  const instrutoresPara = (a, b, r = voo.r) => instrutoresQueServem(estado, ocupacao,
    { mis: voo.mis, tipo, a, b, alunos: grupo.map(v => alunos.get(v.stuId)), stuKg: voo.stuKg, curso, r }).filter(c => !c.problemas.length);
  const comCombustivel = (texto, { reducao }) => (reducao > 0 ? `${texto} · reduzir ${reducao} gal` : texto);

  // O que o conflito pede, pelo código: o pedido mudou (só soltar), o horário não serve (outro
  // horário), ou o avião e o instrutor
  const grupos = gruposDoConflito(voo);
  const pedidoMudou = grupos.has('pedido');
  const problemaNoAviao = grupos.has('aviao');
  const problemaNoInstrutor = grupos.has('instrutor');
  const problemaNoAluno = grupos.has('horario');
  const atual = estado.ins.find(x => x.id === voo.insId);
  const opcoes = [];

  // No mesmo horário
  if (!problemaNoAluno && !pedidoMudou) {
    const { a, b } = voo;
    const avioes = avioesPara(a, b), instrutores = instrutoresPara(a, b);
    // Outro avião com o mesmo instrutor: um em que ele voa
    if (problemaNoAviao && !problemaNoInstrutor) avioesPara(a, b, atual).forEach(r => opcoes.push({ tipo: 'aviao', texto: `Trocar o avião: ${nomeDoRecurso(r)}`, mudancas: { r } }));
    if (problemaNoInstrutor && !problemaNoAviao) {
      instrutores.forEach(c => opcoes.push({ tipo: 'instrutor', texto: comCombustivel(`Trocar o instrutor: ${c.x.nm}`, c), mudancas: { insId: c.x.id } }));
    }
    // Os dois: o primeiro avião que tem um instrutor que serve (com a habilitação própria dele, quando o avião exige)
    const par = problemaNoAviao && problemaNoInstrutor ? avioes.map(r => [r, instrutoresPara(a, b, r)[0]]).find(([, c]) => c) : null;
    if (par) {
      const [r, c] = par;
      opcoes.push({ tipo: 'ambos', texto: comCombustivel(`Trocar o avião e o instrutor: ${nomeDoRecurso(r)}, com ${c.x.nm}`, c), mudancas: { r, insId: c.x.id } });
    }
  }

  // Sem nada no mesmo horário: o primeiro horário mais tarde, no mesmo dia, com o avião e o instrutor de antes quando
  // eles servem. Vale a disponibilidade de cada aluno, e o Ground termina antes dos voos que dependem dele
  if (!opcoes.length && !pedidoMudou) {
    const duracao = voo.b - voo.a;
    const inicios = voo.isGround ? T.slice(0, NI) : horariosDaMissao(estado.horarios || HORARIOS_INICIAIS, voo.mis, tipo);
    const fimDoDia = fimDaMissao(voo.mis, tipo);
    const voosDoAluno = v => ocupacao.alunos.get(v.stuId) || [];
    // (a volta do noturno de ontem não depende do Ground de hoje)
    const voosQueDependem = voo.isGround
      ? grupo.flatMap(voosDoAluno).filter(o => !o.isGround && !o.trecho && doesGroundGateFlight(voo.mis, { mis: o.mis, eq: o.eqType }))
      : [];
    const limite = Math.min(fimDoDia, ...voosQueDependem.map(o => o.a));
    const alunosPodem = (a, b) => grupo.every(v => {
      const permitidas = disponibilidadeDoAluno((pedidoDo(v) || {}).jan);
      return (!permitidas || permitidas(a)) && !problemaDoAluno(ocupacao, v.stuId, { a, b });
    });
    for (const m of inicios) {
      if (m <= Math.max(voo.a, depoisDe ?? -1) || m + duracao > limite || !estado.win[periodoDoMinuto(m)] || !alunosPodem(m, m + duracao)) continue;
      // O avião de antes, quando ele ainda serve ao voo e está livre; senão, um em que o instrutor de antes voa, ou outro
      const r = !voo.isGround && avioesPara(m, m + duracao).includes(voo.r) ? voo.r : avioesPara(m, m + duracao, atual)[0] || avioesPara(m, m + duracao)[0];
      const instrutores = r ? instrutoresPara(m, m + duracao, r) : [];
      const c = instrutores.find(i => i.x === atual) || instrutores[0];
      if (!r || !c) continue;
      opcoes.push({
        tipo: 'horario',
        texto: comCombustivel(`Passar para as ${hm(m)}, ${voo.isGround ? 'na' : 'no'} ${nomeDoRecurso(r)}, com ${c.x.nm}`, c),
        mudancas: { a: m, b: m + duracao, ...(voo.isGround ? {} : { r }), insId: c.x.id }
      });
      break;
    }
  }

  // Soltar: o voo deixa de ser fixo e o motor o escala de novo, em volta dos outros (não vale para o voo em andamento)
  const emAndamento = grupo.some(v => STATUS_EM_ANDAMENTO.includes(statusDoVoo(v, estado.fStatus)));
  const soltar = emAndamento ? [] : [{ tipo: 'soltar', texto: 'Soltar o voo: o app escolhe de novo o horário, o avião e o instrutor', mudancas: null, soltar: true }];
  return [...opcoes.slice(0, maximo), ...soltar, { tipo: 'cancelar', texto: 'Cancelar o voo (pede o motivo)', mudancas: null, motivo: motivoDoConflito(voo.conflito) }];
}

// O motivo de cancelamento que o conflito sugere (o diálogo do status já abre com ele marcado)
function motivoDoConflito(conflito) {
  if (conflito.some(c => /instrutor (saiu|não está disponível)/.test(c))) return 'Instrutor indisponível';
  if (conflito.includes('o avião está indisponível')) return 'Manutenção da aeronave';
  return null;
}

// A sugestão aplicada nos voos fixos (devolve os fixos novos): na turma de Ground, em todos os alunos fixos dela. Soltar
// tira o voo (ou a turma) dos fixos
export function aplicarReparo(fixos, resultado, fKey, opcao) {
  const voo = resultado.out.find(o => o.fKey === fKey);
  if (!voo || !opcao || !(opcao.mudancas || opcao.soltar)) return fixos;
  const chaves = doGrupo(resultado, voo).map(o => o.fKey).filter(k => fixos[k]);
  if (opcao.soltar) return Object.fromEntries(Object.entries(fixos).filter(([k]) => !chaves.includes(k)));
  return { ...fixos, ...Object.fromEntries(chaves.map(k => [k, { ...fixos[k], ...opcao.mudancas }])) };
}

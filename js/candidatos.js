// Os candidatos para um voo num horário: os recursos (o avião, o simulador ou a sala de Ground) e os instrutores, cada
// um com o que o impede de servir, na ordem de preferência. A ocupação vem da escala do dia (os outros voos): as
// Sugestões para um conflito (js/reparo.js) contam todos os que ficam, cada um no horário marcado.
import { AIRCRAFT_EQ_TYPES, GROUND_REG } from './config.js';
import { FROTA_INICIAL, matriculasDoTipo } from './frota.js';
import { sobrepoe, cabeNoSaldo, folgaAte, saldoAteARevisao, problemasDoInstrutor } from './viabilidade.js';
import { reducaoNecessaria } from './combustivel.js';
import { normalizarLimites } from './limites.js';
import { normalizarHangar, posicaoNoHangar } from './hangar.js';
import { intervaloEfetivo } from './status.js';
import { statusDoVoo, umPorUnidade } from './voo.js';
import { agrupar, menorPrimeiro, soma } from './util.js';

const intervalos = voos => voos.map(o => [o.a, o.b]);
const horas = voos => soma(voos.map(o => o.h));

// A ocupação do dia pelos voos da escala: por recurso e por instrutor, uma vez por unidade (a turma de Ground ocupa a
// sala e o instrutor uma vez só), e por aluno, cada um com os voos dele (Maps). O voo cancelado não ocupa nada.
// exceto: as chaves dos voos que não contam (o voo que vai mudar, ou a turma dele); efetivo: o voo atrasado ocupa o
// horário novo (sem ele, o marcado); soFixos: só os voos fixos (os outros, o motor encaixa de novo em volta)
export function ocupacaoDaEscala(out, { fStatus = {}, fObs = {}, efetivo = false, exceto = [], soFixos = false } = {}) {
  const fora = new Set(exceto);
  const voos = out.filter(o => !fora.has(o.fKey) && (!soFixos || o.fixo) && statusDoVoo(o, fStatus) !== 'Cancelado')
    .map(o => {
      if (!efetivo) return o;
      const { a, b } = intervaloEfetivo(o, statusDoVoo(o, fStatus), (fObs || {})[o.fKey]);
      return a === o.a ? o : { ...o, a, b };
    });
  const porUnidade = grupos => new Map([...grupos].map(([chave, lista]) => [chave, umPorUnidade(lista)]));
  return {
    recursos: porUnidade(agrupar(voos, o => o.r)),
    instrutores: porUnidade(agrupar(voos, o => o.insId)),
    alunos: agrupar(voos, o => o.stuId)
  };
}

// O que impede o recurso r de receber o voo [a, b), ou null: o avião em manutenção (a sala de Ground não entra), outro
// voo nele no mesmo horário (o problema traz o primeiro que se sobrepõe) ou a revisão de 50 horas
export function problemaDoRecurso(estado, ocupacao, r, { a, b, ground = false }) {
  if (!ground && !estado.av[r]) return { codigo: 'aviao-indisponivel' };
  const voos = ocupacao.recursos.get(r) || [];
  const voo = voos.find(o => sobrepoe(a, b, o.a, o.b));
  if (voo) return { codigo: ground ? 'sala-ocupada' : 'aviao-ocupado', voo };
  if (!cabeNoSaldo(horas(voos), (b - a) / 60, saldoAteARevisao(estado.horas, r))) return { codigo: 'revisao' };
  return null;
}

// Os recursos do tipo para o voo [a, b) (no Ground, a sala), cada um com o problema (null quando serve) e a folga até o
// voo mais perto dele (Infinity no avião que ainda está no hangar). O Parafuso só voa nos aviões "Só Parafuso", e eles
// só no Parafuso (o problema so-parafuso). Na ordem: os que servem; um que já saiu, com a menor folga, e depois o da
// frente do hangar
export function avioesQueServem(estado, ocupacao, { tipo, mis, a, b, ground = false }) {
  const frota = Array.isArray(estado.frota) ? estado.frota : FROTA_INICIAL;
  const hangar = normalizarHangar(estado.hangar, frota);
  const daMissao = ground ? [GROUND_REG] : matriculasDoTipo(frota, tipo, { parafuso: mis === 'Parafuso' });
  const doTipo = ground ? [GROUND_REG] : frota.filter(f => f.tipo === tipo).map(f => f.reg);
  return doTipo.map(r => ({
    r,
    problema: daMissao.includes(r) ? problemaDoRecurso(estado, ocupacao, r, { a, b, ground }) : { codigo: 'so-parafuso' },
    folga: folgaAte(intervalos(ocupacao.recursos.get(r) || []), a, b)
  })).sort((p, q) => Boolean(p.problema) - Boolean(q.problema) || menorPrimeiro(p.folga, q.folga)
    || posicaoNoHangar(hangar, p.r) - posicaoNoHangar(hangar, q.r));
}

// Os instrutores para o voo [a, b) com os alunos dele (o "Não escalar com" de cada um) e o peso do aluno, cada um com
// os problemas (todos os de js/viabilidade.js; vazio quando serve) e a redução de combustível com ele (0 com o tanque
// cheio ou sem um dos pesos; Infinity quando nem o mínimo dá). Na ordem: os que servem; o tanque cheio primeiro, depois
// quem tem menos horas no dia e menos habilitações (os mais versáteis ficam livres)
export function instrutoresQueServem(estado, ocupacao, { mis, tipo, a, b, alunos = [], stuKg = 0 }) {
  const limites = normalizarLimites(estado.limites);
  const horasPassadas = estado.horasDosInstrutores || {};
  const voosDo = x => ocupacao.instrutores.get(x.id) || [];
  const horasNoDia = new Map(estado.ins.map(x => [x, horas(voosDo(x))]));
  return estado.ins.map(x => ({
    x,
    problemas: problemasDoInstrutor(x, { mis, tipo, a, b, alunos, stuKg }, {
      compromissos: voosDo(x).map(o => ({ a: o.a, b: o.b, voo: AIRCRAFT_EQ_TYPES.includes(o.eqType) })),
      historico: horasPassadas[x.id] || null, limites, todos: true
    }),
    reducao: reducaoNecessaria({ stuKg, insKg: x.kg, tipo, minutos: b - a, mis })
  })).sort((p, q) => Boolean(p.problemas.length) - Boolean(q.problemas.length) || (p.reducao > 0) - (q.reducao > 0)
    || horasNoDia.get(p.x) - horasNoDia.get(q.x) || (p.x.hab || []).length - (q.x.hab || []).length || p.x.id - q.x.id);
}

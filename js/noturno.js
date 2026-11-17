// A missão noturna de dois dias (NOTURNO em js/config.js). No dia seguinte, o motor põe na escala a volta de BH de cada
// noturno da véspera (state.noturnosDaVespera). Os noturnos saem da escala gravada da véspera (a data de ontem, não a
// última data guardada), sem os cancelados e sem as voltas (que já são o dia seguinte de outro noturno).
//
// O repouso: a lei pede 12 h entre uma jornada e a seguinte, e o noturno termina às 21:30 em BH com a volta às 07:30. A
// decisão do aeroclube é avisar, não isentar: a volta é obrigatória (fixa) e o repouso dela fica num aviso (o motor
// avisa com fimDoNoturno). Os voos depois das 10:10 não mudam esse repouso, então a regra do repouso não barra o
// instrutor nos voos novos do dia (fimAnterior sai); a jornada de 11 h, contada da volta, continua valendo.
import { NOTURNO, MINUTOS_DO_DIA } from './config.js';
import { somarDias } from './format.js';
import { migrarDia } from './migracoes.js';
import { normalizarEscalaGravada } from './escala-gravada.js';
import { intervaloEfetivo } from './status.js';

// Os noturnos da véspera: anterior é { data, conteudo } do dia guardado antes da data (backend.diaAnterior)
export function noturnosDaVespera(anterior, data) {
  if (!anterior || anterior.data !== somarDias(data, -1) || !anterior.conteudo) return [];
  const dia = migrarDia(anterior.conteudo);
  const escala = normalizarEscalaGravada(dia.resultado);
  if (!escala) return [];
  const fStatus = dia.fStatus || {}, fObs = dia.fObs || {};
  return escala.out
    .filter(o => o.mis === 'Noturno' && !o.trecho && !o.isGround && Number.isInteger(o.insId) && typeof o.r === 'string' && (fStatus[o.fKey] || o.status) !== 'Cancelado')
    .map(o => ({
      stuId: o.stuId, mid: o.mid || 0, insId: o.insId, r: o.r, eqType: o.eqType, s: o.s, ins: o.ins, stuKg: o.stuKg || 0,
      // O fim do noturno (o atrasado, o novo): o repouso conta dele
      fim: intervaloEfetivo(o, fStatus[o.fKey] || o.status, fObs[o.fKey]).b
    }));
}

// As horas dos instrutores com o repouso do noturno: quem voltou de BH hoje fica sem fimAnterior (a regra do repouso
// não barra os voos novos) e com fimDoNoturno (o aviso do repouso)
export function comRepousoDoNoturno(horas, noturnos) {
  const resultado = { ...(horas || {}) };
  for (const n of noturnos || []) {
    const atual = resultado[n.insId] || { mes: 0, semestre: 0, ano: 0, fimAnterior: null };
    resultado[n.insId] = { ...atual, fimAnterior: null, fimDoNoturno: Math.max(atual.fimDoNoturno ?? 0, n.fim) };
  }
  return resultado;
}

// O repouso (minutos) entre o fim do noturno, na véspera, e a apresentação para a volta
export const repousoAntesDaVolta = (fimDoNoturno, limites) =>
  MINUTOS_DO_DIA - (fimDoNoturno + limites.encerramentoMin) + NOTURNO.voltaInicio - limites.apresentacaoMin;

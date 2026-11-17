// A missão noturna de dois dias (NOTURNO em js/config.js). No dia seguinte, o motor põe na escala a volta de BH de cada
// noturno da véspera (state.noturnosDaVespera). Os noturnos saem da escala gravada da véspera (a data de ontem, não a
// última data guardada), sem os cancelados e sem as voltas (que já são o dia seguinte de outro noturno).
//
// O repouso: a lei pede 12 h entre uma jornada e a seguinte, e o noturno termina às 21:30 em BH com a volta às 07:30. A
// decisão do aeroclube é avisar, não isentar: a volta é obrigatória (fixa) e o repouso dela fica num aviso (o motor
// avisa com fimDoNoturno). Os voos depois das 10:10 não mudam esse repouso, então a regra do repouso não barra o
// instrutor nos voos novos do dia (historicoDoDia tira o fimAnterior); a jornada de 11 h, contada da volta, continua
// valendo. Com a volta cancelada (mau tempo em BH), o instrutor não voltou às 07:30, e o repouso vale como sempre.
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

// As horas dos instrutores com o fim do noturno de ontem (fimDoNoturno: o aviso do repouso e a volta de hoje)
export function comRepousoDoNoturno(horas, noturnos) {
  const resultado = { ...(horas || {}) };
  for (const n of noturnos || []) {
    const atual = resultado[n.insId] || { mes: 0, semestre: 0, ano: 0, fimAnterior: null };
    resultado[n.insId] = { ...atual, fimDoNoturno: Math.max(atual.fimDoNoturno ?? 0, n.fim) };
  }
  return resultado;
}

// As horas de um instrutor no dia (o motor, as sugestões e as listas do instrutor usam esta): quem volta hoje de BH, com a
// volta não cancelada, fica sem fimAnterior (a regra do repouso não barra os voos novos; o repouso é um aviso)
export function historicoDoDia(estado) {
  const horas = estado.horasDosInstrutores || {};
  const voltam = new Set((Array.isArray(estado.noturnosDaVespera) ? estado.noturnosDaVespera : [])
    .filter(n => ((estado.fStatus || {})[`${n.stuId}_${n.mid}_2`]) !== 'Cancelado').map(n => n.insId));
  return id => {
    const h = horas[id] || null;
    return h && voltam.has(id) ? { ...h, fimAnterior: null } : h;
  };
}

// A escala gravada da data confere com os noturnos de ontem: as mesmas voltas (aluno, missão, instrutor e avião). Sem
// conferir (o noturno de ontem mudou depois que esta data foi gravada), a tela usa a escala calculada de novo
export function voltasConferem(escala, noturnos) {
  const chave = v => `${v.stuId}_${v.mid || 0}_${v.insId}_${v.r}`;
  const gravadas = (escala && Array.isArray(escala.out) ? escala.out : []).filter(o => o.trecho === 'volta').map(chave).sort();
  const esperadas = (noturnos || []).map(chave).sort();
  return gravadas.length === esperadas.length && gravadas.every((k, i) => k === esperadas[i]);
}

// O repouso (minutos) entre o fim do noturno, na véspera, e a apresentação para a volta
export const repousoAntesDaVolta = (fimDoNoturno, limites) =>
  MINUTOS_DO_DIA - (fimDoNoturno + limites.encerramentoMin) + NOTURNO.voltaInicio - limites.apresentacaoMin;

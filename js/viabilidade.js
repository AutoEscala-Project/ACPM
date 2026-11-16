// Regras de viabilidade da escala: o que torna possível pôr um voo num horário, num recurso e com um instrutor.
// O motor (com a divisão das horas e a troca de matrículas), a compactação e as sugestões de reparo usam as mesmas
// regras.
import { T, NI, MINUTOS_DO_DIA, REVISAO_H } from './config.js';

// Dois intervalos (em minutos) se sobrepõem quando um começa antes de o outro terminar; encostar não conta
export const sobrepoe = (a1, b1, a2, b2) => a1 < b2 && b1 > a2;

// Nenhum dos intervalos ocupados ([início, fim]) se sobrepõe ao voo
export const livre = (ocupados, a, b) => !(ocupados || []).some(([x, y]) => sobrepoe(a, b, x, y));

// O instrutor disponível durante todo o voo: em cada período do dia (as 9 janelas) que o voo toca
export const cobre = (aw, a, b) => T.every((inicio, k) => !sobrepoe(a, b, inicio, k < NI ? T[k + 1] : MINUTOS_DO_DIA) || aw[k]);

// Aluno + instrutor dentro do limite do avião. Sem o limite ou sem um dos pesos não há como conferir, e vale; na
// divisão das horas, o voo só passa para um instrutor com o peso informado (exigirPesoDoInstrutor)
export function pesoCabe(stuKg, insKg, limKg, { exigirPesoDoInstrutor = false } = {}) {
  if (!limKg || !stuKg) return true;
  if (!insKg) return !exigirPesoDoInstrutor;
  return stuKg + insKg <= limKg;
}

// O voo cabe no saldo de horas do avião até a revisão de 50 horas (sem o saldo informado, Infinity)
export const cabeNoSaldo = (horasNoDia, h, saldo) => horasNoDia + h <= saldo + 1e-9;

// As horas que o avião ainda pode voar até a revisão de 50 horas (sem as horas informadas, não há limite)
export const saldoAteARevisao = (horas, r) => (typeof (horas || {})[r] === 'number' ? REVISAO_H - horas[r] : Infinity);

// A folga entre um voo e o que o avião já voa: 0 se encosta ou se sobrepõe; Infinity se o avião ainda está no hangar
export const folgaAte = (ocupados, a, b) => ocupados.reduce((menor, [x, y]) => Math.min(menor, y <= a ? a - y : x >= b ? x - b : 0), Infinity);

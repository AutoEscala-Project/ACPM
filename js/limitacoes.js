// As limitações do aluno (L, formato 31; N3, N9): os tipos de recurso em que ele voa e os horários em que pode voar, em
// todas as datas ou só nos dias da semana nomeados. stu[].limitacoes = { recursos?: ['C172'], horarios?: [{ de, ate, dias? }] }
// (de e ate em minutos, [de, ate); dias, os dias da semana, 0 domingo a 6 sábado). Sem nenhuma, o campo não existe.
// Duras para o motor (Pedro, 2026-11-25: "Student limitations are hard stops"): o pedido em outro tipo é recusado, e um
// início fora dos horários não é início (a regra das faixas dos INVAs, R4: a missão começa dentro de um horário e pode
// terminar depois dele), para o Ground, o simulador e o voo. A limitação dos tipos vale para a espécie que ela nomeia: só
// no C172 limita os aviões, e os simuladores ficam livres (só no Sim. Multi, o contrário); a Sala Ground nunca é limitada.
// O motor lê as limitações da data (limitacoesNaData, pelo estado da escala: comLimitacoesDaData, js/state.js), já sem os
// dias: um horário com dias que chega a ele sem ser lido para a data não é início.
// Puro (só config): a leitura do cadastro (js/dias.js, js/storage.js) normaliza o que vem gravado
import { AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES, MINUTOS_DO_DIA } from './config.js';

// Os tipos que a limitação nomeia: os aviões e os simuladores, na ordem da frota
const TIPOS_LIMITAVEIS = [...AIRCRAFT_EQ_TYPES, ...SIM_EQ_TYPES];
export const MAXIMO_DE_HORARIOS = 8;
// Os horários vão das 06:00 (o primeiro horário que uma lista de decolagem aceita) à meia-noite
const INICIO_DOS_HORARIOS = 360;

const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const minutoValido = m => Number.isInteger(m) && m >= INICIO_DOS_HORARIOS && m <= MINUTOS_DO_DIA;

// Os dias de um horário: inteiros de 0 a 6, sem repetir, em ordem; os sete, todas as datas (undefined); fora disso, null
function diasDoHorario(dias) {
  if (dias === undefined) return undefined;
  if (!Array.isArray(dias) || !dias.length || !dias.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const lista = [...new Set(dias)].sort((a, b) => a - b);
  return lista.length === 7 ? undefined : lista;
}

// O que vem gravado (o cadastro pode ter sido escrito fora do app, pela API): os tipos conhecidos, sem repetir, na ordem da
// frota; os horários com o formato, em ordem, até o máximo. Sem nada que valha: null (o campo sai)
export function normalizarLimitacoes(valor) {
  if (!objeto(valor)) return null;
  const recursos = Array.isArray(valor.recursos) ? TIPOS_LIMITAVEIS.filter(t => valor.recursos.includes(t)) : [];
  const horarios = (Array.isArray(valor.horarios) ? valor.horarios : []).flatMap(h => {
    if (!objeto(h) || !minutoValido(h.de) || !minutoValido(h.ate) || h.de >= h.ate) return [];
    const dias = diasDoHorario(h.dias);
    return dias === null ? [] : [{ de: h.de, ate: h.ate, ...(dias ? { dias } : {}) }];
  }).sort((p, q) => p.de - q.de || p.ate - q.ate || String(p.dias || '').localeCompare(String(q.dias || ''))).slice(0, MAXIMO_DE_HORARIOS);
  if (!recursos.length && !horarios.length) return null;
  return { ...(recursos.length ? { recursos } : {}), ...(horarios.length ? { horarios } : {}) };
}

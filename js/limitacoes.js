// As limitações do aluno (L, formato 31; N3, N9): os tipos de recurso em que ele voa e os horários em que pode voar, em
// todas as datas ou só nos dias da semana nomeados. stu[].limitacoes = { recursos?: ['C172'], horarios?: [{ de, ate, dias? }] }
// (de e ate em minutos, [de, ate); dias, os dias da semana, 0 domingo a 6 sábado). Sem nenhuma, o campo não existe.
// Duras para o motor (Pedro, 2026-11-25: "Student limitations are hard stops"): o pedido em outro tipo é recusado, e um
// início fora dos horários não é início (a regra das faixas dos INVAs, R4: a missão começa dentro de um horário e pode
// terminar depois dele), para o Ground, o simulador e o voo. A limitação dos tipos vale para a espécie que ela nomeia: só
// no C172 limita os aviões, e os simuladores ficam livres (só no Sim. Multi, o contrário); a Sala Ground nunca é limitada.
// O motor lê as limitações da data (limitacoesNaData, pelo estado da escala: comLimitacoesDaData, js/state.js), já sem os
// dias: um horário com dias que chega a ele sem ser lido para a data não é início.
// Puro (config e format): a leitura do cadastro (js/dias.js, js/storage.js) normaliza o que vem gravado; o motor, a
// conferência dos voos fixos, a compactação e as Sugestões usam as mesmas regras
import { AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES, MINUTOS_DO_DIA } from './config.js';
import { hm } from './format.js';

// Os tipos que a limitação nomeia: os aviões e os simuladores, na ordem da frota
const TIPOS_LIMITAVEIS = [...AIRCRAFT_EQ_TYPES, ...SIM_EQ_TYPES];
const ESPECIES = [AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES];
const NOMES_DOS_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
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

// Os tipos que a limitação nomeia na espécie do tipo (os aviões, ou os simuladores); nenhum: a espécie não é limitada
function nomeadosNaEspecie(limitacoes, tipo) {
  const especie = ESPECIES.find(e => e.includes(tipo));
  const recursos = objeto(limitacoes) && Array.isArray(limitacoes.recursos) ? limitacoes.recursos : [];
  return especie ? recursos.filter(t => especie.includes(t)) : [];
}

// O aluno voa no tipo: sem limitação na espécie dele, sim; senão, só nos nomeados. A Sala Ground, sempre
export const tipoPermitido = (limitacoes, tipo) => { const nomeados = nomeadosNaEspecie(limitacoes, tipo); return !nomeados.length || nomeados.includes(tipo); };

const noTipo = tipos => tipos.map(t => `no ${t}`).join(' ou ');
// Por que o aluno não voa no tipo: "o aluno só voa no C172" ("no C152 ou no C172"); no tipo que ele voa, null
export const motivoDoTipo = (limitacoes, tipo) => (tipoPermitido(limitacoes, tipo) ? null : `o aluno só voa ${noTipo(nomeadosNaEspecie(limitacoes, tipo))}`);

// A limitação tem horários (também a lista vazia da data em que ele não voa)
export const limitadoNoHorario = limitacoes => objeto(limitacoes) && Array.isArray(limitacoes.horarios);

// O início é dos horários do aluno: a regra do início (R4), [de, ate). Sem horários, qualquer início; um horário com dias
// (não lido para a data) não vale
export const inicioPermitido = (limitacoes, minuto) => !limitadoNoHorario(limitacoes)
  || limitacoes.horarios.some(h => h && h.dias === undefined && h.de <= minuto && minuto < h.ate);

const diaDaSemana = data => (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00Z`).getUTCDay() : null);

// As limitações na data: os horários que valem no dia da semana dela, sem os dias ([]: nenhum, o aluno não voa nela). Sem
// limitação, null. Sem uma data, os horários com dias não valem
export function limitacoesNaData(limitacoes, data) {
  const l = normalizarLimitacoes(limitacoes);
  if (!l) return null;
  if (!l.horarios) return l;
  const dia = diaDaSemana(data);
  return { ...l, horarios: l.horarios.filter(h => !h.dias || (dia !== null && h.dias.includes(dia))).map(({ de, ate }) => ({ de, ate })) };
}

// O estado que o motor lê na data (js/state.js, estadoDaEscala): cada aluno com horários de dias, com os da data. Sem
// nenhum, o próprio estado; os outros alunos ficam os mesmos objetos
export function comLimitacoesDaData(estado, data) {
  const comDias = s => limitadoNoHorario(s.limitacoes) && s.limitacoes.horarios.some(h => h && h.dias !== undefined);
  if (!estado || !Array.isArray(estado.stu) || !estado.stu.some(comDias)) return estado;
  return { ...estado, stu: estado.stu.map(s => (comDias(s) ? { ...s, limitacoes: limitacoesNaData(s.limitacoes, data) } : s)) };
}

// "13:00–18:00 (seg, qua, sex); 07:00–09:00"; nenhum, "nenhum horário nesta data"
export const textoDosHorarios = horarios => (horarios.length
  ? horarios.map(h => `${hm(h.de)}–${hm(h.ate)}${h.dias ? ` (${h.dias.map(d => NOMES_DOS_DIAS[d]).join(', ')})` : ''}`).join('; ')
  : 'nenhum horário nesta data');

// O que o motor diz do quando, na recusa disponibilidade-do-aluno: o horário do pedido (o rótulo dele) e as limitações
export const quandoOAlunoVoa = (doPedido, limitacoes) => [doPedido, limitadoNoHorario(limitacoes) ? `Limitações: ${textoDosHorarios(limitacoes.horarios)}` : null]
  .filter(Boolean).join('; ');

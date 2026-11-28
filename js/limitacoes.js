// As limitações do aluno (L, formato 31; N3, N9): os tipos de recurso em que ele voa e os horários em que pode voar, em
// todas as datas ou só nos dias da semana nomeados. stu[].limitacoes = { recursos?: ['C172'], horarios?: [{ de, ate, dias? }] }
// (de e ate em minutos, [de, ate); dias, os dias da semana, 0 domingo a 6 sábado). Sem nenhuma, o campo não existe.
// Duras para o motor (Pedro, 2026-11-25: "Student limitations are hard stops"): o pedido em outro tipo é recusado, e um
// início fora dos horários não é início (a regra das faixas dos INVAs, R4: a missão começa dentro de um horário e pode
// terminar depois dele), para o Ground, o simulador e o voo. A limitação dos tipos vale para a espécie que ela nomeia: só
// no C172 limita os aviões, e os simuladores ficam livres (só no Sim. Multi, o contrário); a Sala Ground nunca é limitada.
// O motor lê as limitações da data (limitacoesNaData, pelo estado da escala: comLimitacoesDaData, js/state.js), já sem os
// dias: um horário com dias que chega a ele sem ser lido para a data não é início.
// Puro (config, format, horarios, habilitacoes e combustivel): a leitura do cadastro (js/dias.js, js/storage.js) normaliza o que vem
// gravado; o motor, a conferência dos voos fixos, a compactação, as Sugestões e a seção "Limitações" de Alunos usam as
// mesmas regras
import { AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES, DEFAULT_LIM, MINUTOS_DO_DIA } from './config.js';
import { hm } from './format.js';
import { PRIMEIRO_HORARIO, noInicioDoDia } from './horarios.js';
import { habilitadoNoTipo } from './habilitacoes.js';
import { reducaoNecessaria } from './combustivel.js';

// Os tipos que a limitação nomeia: os aviões e os simuladores, na ordem da frota (os que a tela oferece)
export const TIPOS_LIMITAVEIS = [...AIRCRAFT_EQ_TYPES, ...SIM_EQ_TYPES];
const ESPECIES = [AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES];
// Os dias que a tela oferece: segunda a sábado (o aeroclube não opera aos domingos); todos eles, todas as datas
export const DIAS_DAS_LIMITACOES = [1, 2, 3, 4, 5, 6];
const NOMES_DOS_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const nomeDoDia = d => NOMES_DOS_DIAS[d];
export const MAXIMO_DE_HORARIOS = 8;
// Os horários vão das 06:30 (o primeiro horário de decolagem, PRIMEIRO_HORARIO: Decisão do Pedro, 28/11, "yes, 06:30 for the
// limits too") à meia-noite; os campos De e Até, de 10 em 10 minutos
const INICIO_DOS_HORARIOS = PRIMEIRO_HORARIO;
export const MINUTOS_DOS_HORARIOS = Array.from({ length: (MINUTOS_DO_DIA - INICIO_DOS_HORARIOS) / 10 + 1 }, (_, i) => INICIO_DOS_HORARIOS + i * 10);

const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const minutoValido = m => Number.isInteger(m) && m >= INICIO_DOS_HORARIOS && m <= MINUTOS_DO_DIA;
// Até 28/11 o De começava às 06:00. O guardado das 06:00 às 06:29 começa às 06:30 (noInicioDoDia, a mesma conversão da lista
// de decolagem): nenhum início que a escala oferece é antes das 06:30, então ele cobre os mesmos. O que então termina até as
// 06:30 não cobre nenhum e sai; antes das 06:00, sai como sempre
const deGuardado = m => (Number.isInteger(m) ? noInicioDoDia(m) : m);
const mesmoHorario = (p, q) => p.de === q.de && p.ate === q.ate && String(p.dias || '') === String(q.dias || '');

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
  const lidos = (Array.isArray(valor.horarios) ? valor.horarios : []).flatMap(h => {
    if (!objeto(h)) return [];
    const de = deGuardado(h.de);
    if (!minutoValido(de) || !minutoValido(h.ate) || de >= h.ate) return [];
    const dias = diasDoHorario(h.dias);
    return dias === null ? [] : [{ de, ate: h.ate, ...(dias ? { dias } : {}), mudou: de !== h.de }];
  });
  // O que a mudança deixou igual a outro fica um só (os iguais gravados assim, que a tela deixa pôr, ficam como estão)
  const horarios = lidos.filter((h, i) => !h.mudou || !lidos.some((o, j) => j !== i && mesmoHorario(o, h) && (!o.mudou || j < i)))
    .map(({ mudou, ...h }) => h)
    .sort((p, q) => p.de - q.de || p.ate - q.ate || String(p.dias || '').localeCompare(String(q.dias || ''))).slice(0, MAXIMO_DE_HORARIOS);
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
  ? horarios.map(h => `${hm(h.de)}–${hm(h.ate)}${h.dias ? ` (${h.dias.map(nomeDoDia).join(', ')})` : ''}`).join('; ')
  : 'nenhum horário nesta data');

// Por que o horário está fora (com as limitações da data): "o aluno só voa das 13:00 às 18:00" ("… ou das …"); sem nenhum
// horário na data, "o aluno não voa nesta data". Sem horários, null
export function motivoDoHorario(limitacoes) {
  if (!limitadoNoHorario(limitacoes)) return null;
  const horarios = limitacoes.horarios.filter(h => h && h.dias === undefined);
  return horarios.length ? `o aluno só voa ${horarios.map(h => `das ${hm(h.de)} às ${hm(h.ate)}`).join(' ou ')}` : 'o aluno não voa nesta data';
}

// O que o motor diz do quando, na recusa disponibilidade-do-aluno: o horário do pedido (o rótulo dele) e as limitações
export const quandoOAlunoVoa = (doPedido, limitacoes) => [doPedido, limitadoNoHorario(limitacoes) ? `Limitações: ${textoDosHorarios(limitacoes.horarios)}` : null]
  .filter(Boolean).join('; ');

// O Histórico: "só no C172 e no Sim. Multi; 13:00–18:00 (seg)"; sem nada, "nenhuma"
export function textoDasLimitacoes(limitacoes) {
  const l = normalizarLimitacoes(limitacoes);
  if (!l) return 'nenhuma';
  return [l.recursos ? `só ${l.recursos.map(t => `no ${t}`).join(' e ')}` : null, l.horarios ? textoDosHorarios(l.horarios) : null].filter(Boolean).join('; ');
}

// O peso do aluno nos aviões (a linha das Limitações): os tipos de avião com limite de peso em que, num voo local de 1 h,
// nenhum INVA ativo, habilitado no tipo e com o peso informado cabe com ele, nem com o mínimo de combustível. Sem o peso do
// aluno, ou sem nenhum INVA assim no tipo, o tipo fica de fora (o limite não é conferido)
export function tiposQueNaoCabem(estado, aluno) {
  if (!aluno || !aluno.kg) return [];
  const ativos = (Array.isArray(estado.ins) ? estado.ins : []).filter(x => x && x.inativo !== true && x.kg > 0);
  return AIRCRAFT_EQ_TYPES.filter(tipo => {
    if (!DEFAULT_LIM[tipo]) return false;
    const habilitados = ativos.filter(x => habilitadoNoTipo(x, tipo));
    return habilitados.length > 0 && habilitados.every(x => reducaoNecessaria({ stuKg: aluno.kg, insKg: x.kg, tipo, minutos: 60, mis: 'Voo Local' }) === Infinity);
  });
}
// "Com o peso do aluno, nenhum INVA ativo habilitado cabe no C152." (sem nenhum número); sem tipo, ''
export const linhaDoPeso = tipos => (tipos.length ? `Com o peso do aluno, nenhum INVA ativo habilitado cabe ${tipos.map(t => `no ${t}`).join(' e ')}.` : '');

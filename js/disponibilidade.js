// A disponibilidade de um INVA numa data (C, formato 29): as faixas, { de, ate } em minutos, [de, ate), quando ele pode
// voar, e as pausas, { de, ate }, quando ele não voa de jeito nenhum (o almoço). Até o formato 28 ela era o aw, nove
// booleanos, um por tempo de antes (INICIOS_DOS_TEMPOS, congelados; o tempo k vai do início dele ao do seguinte, e o
// último até a meia-noite): o passo 29 converte cada sequência de tempos marcados numa faixa e cada intervalo entre duas
// sequências numa pausa, e o aw fica como a cópia de antes. Os estados sem faixas (os dias antes do 29, os goldens e os
// estados dos testes) são lidos pelo aw, como antes.
// A regra é a do início (o commit "regra", decisão 1 do Pedro): a missão começa dentro de uma faixa, [de, ate) (o fim não
// entra: até 17:30 não inclui o Noturno), e pode terminar depois dela, mas não toca nenhuma pausa; o que termina até as
// 06:30 (o início do 1º tempo de antes) não pede faixa, e o que começa antes delas começa às 06:30 para a regra. Até o
// "regra" (os commits "dados" e "tela"), o compromisso inteiro cabia numa faixa, como o aw pedia. O aw sem faixas é lido
// pelas faixas e pelas pausas dele, com a mesma regra: só o fim da última faixa do dia muda de sentido.
// A tela (o commit "tela"): os três turnos, cada um uma faixa em minutos (N12: nenhum precisa de um limite do dia), o que a
// linha e o detalhe do INVA dizem (o texto e a tira), a conferência de "Editar faixas" e o "Marcar disponível" do
// agendamento, que põem as faixas no lugar do aw: a tela não muda mais o aw.
// "O que cabe nestas faixas" (oQueCabe): em cada lista de decolagem, os horários em que a missão começa e até quando ela pode ir.
// Módulo puro (config, horarios e format, que já são da TV): o passo 29 de js/migracoes.js o leva para o grafo da TV.
import { MINUTOS_DO_DIA, MIS, GROUND_DURATION_H, GROUND_EQ_TYPE, DURACAO_MAXIMA_H } from './config.js';
import { INICIOS_DOS_TEMPOS, HORARIO_DO_NOTURNO, horariosDoTipo, fimDaMissao } from './horarios.js';
import { hm } from './format.js';

// As faixas e as pausas ficam entre as 06:30 e a meia-noite, no máximo 8 de cada por data
export const INICIO_DAS_FAIXAS = INICIOS_DOS_TEMPOS[0];
export const MAXIMO_DE_FAIXAS = 8;
export const MAXIMO_DE_PAUSAS = 8;

const TEMPOS = INICIOS_DOS_TEMPOS.length;
const fimDoTempo = k => (k < TEMPOS - 1 ? INICIOS_DOS_TEMPOS[k + 1] : MINUTOS_DO_DIA);
// Encostar não conta (como sobrepoe, js/viabilidade.js, que importa este módulo)
const sobrepoe = (a1, b1, a2, b2) => a1 < b2 && b1 > a2;

// O aw como o app o lia (normalizeAndMigrateState, js/storage.js, antes de o motor ver o estado): nas nove posições, só
// true marca o tempo; com outro tamanho, ou sem ele, o dia todo
export const awComoOAppLia = aw => (Array.isArray(aw) && aw.length === TEMPOS ? aw.map(v => v === true) : INICIOS_DOS_TEMPOS.map(() => true));

// As faixas e as pausas dos nove tempos de antes: cada sequência i..j de tempos marcados vira { de: início do i, ate: fim
// do j }, e cada intervalo entre duas sequências, uma pausa. Nenhum marcado: nenhuma faixa (o INVA não voa na data)
export function faixasDoAw(aw) {
  const faixas = [];
  for (let i = 0; i < TEMPOS; i++) {
    if (!aw[i]) continue;
    let j = i;
    while (j + 1 < TEMPOS && aw[j + 1]) j++;
    faixas.push({ de: INICIOS_DOS_TEMPOS[i], ate: fimDoTempo(j) });
    i = j;
  }
  const pausas = faixas.slice(1).map((f, k) => ({ de: faixas[k].ate, ate: f.de }));
  return { faixas, pausas };
}

const minutoValido = m => Number.isInteger(m) && m >= INICIO_DAS_FAIXAS && m <= MINUTOS_DO_DIA;

// Os intervalos válidos ({ de, ate } inteiros, 06:30 ≤ de < ate ≤ 24:00, nada além disso), em ordem, os que se tocam ou se
// cruzam juntos num só, até o máximo
function intervalos(lista, maximo) {
  if (!Array.isArray(lista)) return [];
  const itens = lista.filter(f => f && typeof f === 'object' && minutoValido(f.de) && minutoValido(f.ate) && f.de < f.ate)
    .map(f => ({ de: f.de, ate: f.ate })).sort((p, q) => p.de - q.de || p.ate - q.ate);
  const juntos = [];
  for (const f of itens) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && f.de <= ultimo.ate) ultimo.ate = Math.max(ultimo.ate, f.ate);
    else juntos.push(f);
  }
  return juntos.slice(0, maximo);
}

export const normalizarFaixas = lista => intervalos(lista, MAXIMO_DE_FAIXAS);
export const normalizarPausas = lista => intervalos(lista, MAXIMO_DE_PAUSAS);

// As faixas e as pausas que a regra lê: as da data, ou, sem elas, as do aw (o tempo marcado é o truthy, como o app lia)
const lidas = x => (Array.isArray(x.faixas) ? { faixas: x.faixas, pausas: Array.isArray(x.pausas) ? x.pausas : [] } : faixasDoAw(x.aw || []));

// O instrutor pode assumir o compromisso [a, b) (voo, simulador ou aula de Ground): ele vem na data (on), o compromisso
// começa dentro de uma faixa (o que começa antes das 06:30 começa às 06:30 para a regra) e não toca nenhuma pausa. O que
// termina até as 06:30, ou começa na meia-noite, não pede faixa (nenhum tempo de antes o cobria)
export function disponivelPara(x, a, b) {
  if (!x || !x.on) return false;
  const inicio = Math.max(a, INICIO_DAS_FAIXAS);
  if (b <= inicio || inicio >= MINUTOS_DO_DIA) return true;
  const { faixas, pausas } = lidas(x);
  return faixas.some(f => f.de <= inicio && inicio < f.ate) && !pausas.some(p => sobrepoe(a, b, p.de, p.ate));
}

// A reversão de um agendamento feito antes da tela do C, que guardou só o aw de antes: o instrutor que tem faixas fica com
// as desse aw (o que não tem continua lido pelo aw)
export function refazerFaixasDoAw(x) {
  if (x && Array.isArray(x.faixas)) Object.assign(x, faixasDoAw(x.aw));
  return x;
}

// ———————————————————————————————————————————————————————————————————————————————————————————————————————————————————————
// A tela (C, commit "tela")

// Os três turnos: cada um uma faixa, sem pausa. "Manhã" e "Tarde" saíram (N12, U4): o meio dia é uma faixa digitada
export const TURNOS = Object.freeze([
  Object.freeze({ id: 'dia', nome: 'Dia inteiro', de: 390, ate: 1050 }),
  Object.freeze({ id: 'noturno', nome: 'Noturno', de: 1050, ate: MINUTOS_DO_DIA }),
  Object.freeze({ id: 'dia-e-noturno', nome: 'Dia + noturno', de: 390, ate: MINUTOS_DO_DIA })
]);
// "Almoço", a pausa pronta de "Editar faixas"; "+ Pausa" começa com a meia hora das 15:00
export const ALMOCO = Object.freeze({ de: 12 * 60, ate: 13 * 60 });
export const PAUSA_NOVA = Object.freeze({ de: 15 * 60, ate: 15 * 60 + 30 });
// Os horários de "Editar faixas" (os campos de horário do J): de 10 em 10 minutos, das 06:30 à meia-noite
const PASSO = 10;
export const MINUTOS_DAS_FAIXAS = Object.freeze(Array.from({ length: (MINUTOS_DO_DIA - INICIO_DAS_FAIXAS) / PASSO + 1 }, (_, i) => INICIO_DAS_FAIXAS + PASSO * i));

export function faixasDoTurno(id) {
  const t = TURNOS.find(x => x.id === id);
  return t ? { faixas: [{ de: t.de, ate: t.ate }], pausas: [] } : null;
}

// As faixas e as pausas do instrutor na data, para a tela: as dele, ou as do aw (quem ainda não tem faixas)
export const faixasDe = x => (x && Array.isArray(x.faixas)
  ? { faixas: normalizarFaixas(x.faixas), pausas: normalizarPausas(x.pausas) }
  : faixasDoAw(awComoOAppLia(x && x.aw)));

const igual = (p, q) => p.length === q.length && p.every((f, i) => f.de === q[i].de && f.ate === q[i].ate);
export const mesmasFaixas = (p, q) => igual(normalizarFaixas(p.faixas), normalizarFaixas(q.faixas)) && igual(normalizarPausas(p.pausas), normalizarPausas(q.pausas));

// O turno que as faixas são (uma faixa só, a dele, sem pausa); senão nenhum
export const turnoDasFaixas = d => TURNOS.find(t => mesmasFaixas(d, faixasDoTurno(t.id))) || null;

// "06:30–12:40 e 13:40–24:00"
const lista = itens => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens.join(''));
const intervalo = f => `${hm(f.de)}–${hm(f.ate)}`;
export const textoDasFaixas = d => (d.faixas.length ? lista(d.faixas.map(intervalo)) : 'sem faixa');
export const textoDasPausas = d => lista((d.pausas || []).map(intervalo));

// "Salvar faixas": cada faixa e cada pausa com o De e o Até da lista e o Até depois do De, no máximo 8 de cada. Responde
// o erro (o primeiro), ou as faixas e as pausas normalizadas
export function conferirFaixas({ faixas = [], pausas = [] }) {
  const naLista = m => MINUTOS_DAS_FAIXAS.includes(m);
  const conferir = (itens, nome, maximo) => {
    if (itens.length > maximo) return `No máximo ${maximo} ${nome}s por data.`;
    for (const [i, f] of itens.entries()) {
      if (!naLista(f.de) || !naLista(f.ate)) return `Na ${i + 1}ª ${nome}, escolha o De e o Até da lista.`;
      if (f.ate <= f.de) return `Na ${i + 1}ª ${nome}, o Até vem depois do De.`;
    }
    return null;
  };
  const erro = conferir(faixas, 'faixa', MAXIMO_DE_FAIXAS) || conferir(pausas, 'pausa', MAXIMO_DE_PAUSAS);
  return erro ? { erro, faixas: [], pausas: [] } : { erro: null, faixas: normalizarFaixas(faixas), pausas: normalizarPausas(pausas) };
}

// "Marcar disponível" (o agendamento com o instrutor indisponível): o compromisso [a, b) passa a caber numa faixa (a parte
// dele entre as 06:30 e a meia-noite junta-se às faixas que toca) e as pausas perdem o pedaço que ele toca. Só aumenta a
// disponibilidade: com faixas demais, o menor intervalo entre duas é preenchido; com pausas demais, a menor sai
export function comOIntervalo(d, a, b) {
  const de = Math.max(a, INICIO_DAS_FAIXAS), ate = Math.min(b, MINUTOS_DO_DIA);
  let faixas = intervalos([...d.faixas, ...(de < ate ? [{ de, ate }] : [])], Infinity);
  while (faixas.length > MAXIMO_DE_FAIXAS) {
    const k = faixas.slice(1).reduce((menor, f, i) => (f.de - faixas[i].ate < faixas[menor + 1].de - faixas[menor].ate ? i : menor), 0);
    faixas = [...faixas.slice(0, k), { de: faixas[k].de, ate: faixas[k + 1].ate }, ...faixas.slice(k + 2)];
  }
  let pausas = intervalos((d.pausas || []).flatMap(p => (!sobrepoe(a, b, p.de, p.ate) ? [p]
    : [...(p.de < a ? [{ de: p.de, ate: a }] : []), ...(p.ate > b ? [{ de: b, ate: p.ate }] : [])])), Infinity);
  while (pausas.length > MAXIMO_DE_PAUSAS) {
    const menor = pausas.reduce((m, p, i) => (p.ate - p.de < pausas[m].ate - pausas[m].de ? i : m), 0);
    pausas = pausas.filter((_, i) => i !== menor);
  }
  return { faixas, pausas };
}

// "O que cabe nestas faixas" (o detalhe do INVA): em cada lista de decolagem da data (a do tipo; a do Noturno, as 17:30), os
// horários em que a missão da duração padrão começa (1 h; o Simulador 2 h, o Ground 01h30, o Noturno as 4 h fixas), sem
// passar do fim da missão (17:30 no avião de dia), e até quando pode ir a que começa no último deles: 5 h (a duração
// máxima) depois, sem tocar a pausa seguinte nem passar do fim da missão (o Noturno, as 4 h dele)
const LISTAS_DO_QUE_CABE = Object.freeze([
  { id: 'C152', nome: 'C152', mis: 'Voo Local', tipo: 'C152' },
  { id: 'C172', nome: 'C172', mis: 'Voo Local', tipo: 'C172' },
  { id: 'sim', nome: 'Simulador', mis: 'Simulador', tipo: MIS.Simulador.defEq, h: MIS.Simulador.duracaoPadrao },
  { id: 'PA-34', nome: 'PA-34', mis: 'Multimotor', tipo: 'PA-34' },
  { id: 'ground', nome: 'Ground', mis: 'Ground', tipo: GROUND_EQ_TYPE, h: GROUND_DURATION_H },
  { id: 'noturno', nome: 'Noturno', mis: 'Noturno', tipo: 'C172', h: MIS.Noturno.duracaoFixaH, fixa: true }
]);
export function oQueCabe(x, horarios) {
  const { pausas } = x ? lidas(x) : { pausas: [] };
  return LISTAS_DO_QUE_CABE.map(({ id, nome, mis, tipo, h = 1, fixa = false }) => {
    const minutos = Math.round(h * 60);
    const fim = fimDaMissao(mis, tipo);
    const lista = mis === 'Noturno' ? [HORARIO_DO_NOTURNO] : horariosDoTipo(horarios, tipo);
    const cabem = lista.filter(m => m + minutos <= fim && disponivelPara(x, m, m + minutos));
    if (!cabem.length) return { id, nome, horarios: [], ate: null };
    const ultimo = cabem.at(-1);
    const ate = fixa ? ultimo + minutos
      : Math.min(ultimo + DURACAO_MAXIMA_H * 60, fim, ...pausas.filter(p => p.de >= ultimo).map(p => p.de));
    return { id, nome, horarios: cabem, ate };
  });
}
// "C152: 06:30 a 11:30 (4 horários); termina até as 16:30"; sem nenhum, "Noturno: nenhum horário"
export function textoDoQueCabe({ nome, horarios, ate }) {
  if (!horarios.length) return `${nome}: nenhum horário`;
  const quando = horarios.length > 1 ? `${hm(horarios[0])} a ${hm(horarios.at(-1))}` : hm(horarios[0]);
  return `${nome}: ${quando} (${horarios.length} ${horarios.length === 1 ? 'horário' : 'horários'}); termina até as ${hm(ate)}`;
}

// A tira da linha: as faixas, as pausas e os voos, em porcentagem dela (das 06:30 à meia-noite); o que fica fora dela sai
const LARGURA_DA_TIRA = MINUTOS_DO_DIA - INICIO_DAS_FAIXAS;
const porCento = m => Math.round(m / LARGURA_DA_TIRA * 1e4) / 100;
export function trechosDaTira(d, voos = []) {
  const trecho = tipo => ({ de, ate }) => {
    const i = Math.max(de, INICIO_DAS_FAIXAS), f = Math.min(ate, MINUTOS_DO_DIA);
    return f > i ? [{ tipo, inicio: porCento(i - INICIO_DAS_FAIXAS), largura: porCento(f - i) }] : [];
  };
  return [...d.faixas.flatMap(trecho('faixa')), ...(d.pausas || []).flatMap(trecho('pausa')), ...voos.map(v => ({ de: v.a, ate: v.b })).flatMap(trecho('voo'))];
}

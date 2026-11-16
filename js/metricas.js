// Métricas de uma escala: o tempo parado dos aviões e dos instrutores, as saídas do hangar, os aviões usados
// contra o mínimo possível, o equilíbrio das horas, as preferências atendidas e as trocas de avião. Medem o efeito das
// regras do motor (scripts/medir-escalas.mjs); a Escala mostra o tempo parado e as saídas do hangar.
import { AIRCRAFT_EQ_TYPES } from './config.js';
import { unidadeDoVoo } from './voo.js';
import { soma, agrupar, paradasEntre } from './util.js';

// Parado por 2 h ou mais entre dois voos, o avião volta para o hangar (uma saída a mais no dia)
export const INTERVALO_DO_HANGAR = 120;
// O instrutor parado duas horas seguidas ou mais entra na contagem das paradas longas
const PARADA_LONGA_DO_INSTRUTOR = 2 * 60;

// As paradas de uma lista de voos (a turma de Ground, que se sobrepõe, conta como um intervalo só)
const paradas = voos => paradasEntre(voos.map(({ a, b }) => [a, b]));

// O pico de voos ao mesmo tempo (o mínimo de aviões para a escala de um tipo)
function pico(voos) {
  const eventos = voos.flatMap(o => [[o.a, 1], [o.b, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let agora = 0, maior = 0;
  for (const [, delta] of eventos) { agora += delta; maior = Math.max(maior, agora); }
  return maior;
}

// A distância média (minutos) entre a decolagem e a 1ª preferência, nos voos que têm uma
function distanciaMedia(out, preferenciaDe) {
  const distancias = out.map(o => [o, preferenciaDe(o)]).filter(([, p]) => Number.isInteger(p) && p >= 0).map(([o, p]) => Math.abs(o.a - p));
  return distancias.length ? Math.round(soma(distancias) / distancias.length) : 0;
}

// ativos: os ids dos instrutores que vêm no dia (quem não voou conta com 0 h no equilíbrio)
// preferenciaDe: o minuto da 1ª preferência de um voo (-1 sem ela), para a distância até ela
export function metricasDaEscala(out, { ativos = [], preferenciaDe = () => -1 } = {}) {
  const avioes = out.filter(o => AIRCRAFT_EQ_TYPES.includes(o.eqType));
  const porAviao = agrupar(avioes, o => o.r);
  const paradasDosAvioes = [...porAviao.values()].map(voos => paradas(voos));
  const avioesMinimo = soma([...agrupar(avioes, o => o.eqType).values()].map(pico));

  // Cada unidade conta uma vez (a turma de Ground tem um item por aluno)
  const unidades = [...agrupar(out, unidadeDoVoo).values()].map(itens => itens[0]);
  const porInstrutor = agrupar(unidades, o => o.insId);
  const paradasDosInstrutores = [...porInstrutor.values()].map(itens => soma(paradas(itens)));
  const horasPorInstrutor = Object.fromEntries([...new Set([...ativos, ...porInstrutor.keys()])]
    .map(id => [id, Math.round(soma((porInstrutor.get(id) || []).map(o => +o.h || 0)) * 10) / 10]));
  const horas = Object.values(horasPorInstrutor);

  const trocasDeAviao = soma([...agrupar(avioes, o => `${o.insId}:${o.eqType}`).values()].map(voos => new Set(voos.map(o => o.r)).size - 1));
  const preferencias = { p1: 0, p2: 0, outro: 0 };
  out.forEach(o => { preferencias[o.baseTag === 'Pref. 1' ? 'p1' : o.baseTag === 'Pref. 2' ? 'p2' : 'outro']++; });

  return {
    avioesUsados: porAviao.size,
    avioesMinimo,
    avioesParadoMin: soma(paradasDosAvioes.flat()),
    saidasDoHangar: soma(paradasDosAvioes.map(lista => 1 + lista.filter(p => p >= INTERVALO_DO_HANGAR).length)),
    instrutoresParadoMin: soma(paradasDosInstrutores),
    instrutoresComDuasHorasParado: paradasDosInstrutores.filter(p => p >= PARADA_LONGA_DO_INSTRUTOR).length,
    horasPorInstrutor,
    diferencaDeHoras: horas.length ? Math.round((Math.max(...horas) - Math.min(...horas)) * 10) / 10 : 0,
    somaDosQuadrados: Math.round(soma(horas.map(h => h * h)) * 100) / 100,
    preferencias,
    distanciaDaPreferenciaMin: distanciaMedia(out, preferenciaDe),
    trocasDeAviao
  };
}

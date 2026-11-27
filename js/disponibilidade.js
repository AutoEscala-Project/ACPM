// A disponibilidade de um INVA numa data (C, formato 29): as faixas, { de, ate } em minutos, [de, ate), quando ele pode
// voar, e as pausas, { de, ate }, quando ele não voa de jeito nenhum (o almoço). Até o formato 28 ela era o aw, nove
// booleanos, um por tempo de antes (INICIOS_DOS_TEMPOS, congelados; o tempo k vai do início dele ao do seguinte, e o
// último até a meia-noite): o passo 29 converte cada sequência de tempos marcados numa faixa e cada intervalo entre duas
// sequências numa pausa, e o aw fica como a cópia de antes. Os estados sem faixas (os dias antes do 29, os goldens e os
// estados dos testes) são lidos pelo aw, como antes.
// A regra é a de antes do C (os commits "dados" e "tela"): o compromisso inteiro dentro de uma faixa, sem tocar numa pausa;
// o que cai antes das 06:30 (o início do 1º tempo de antes) não pede faixa, como nenhum tempo o cobria. A regra do início
// (decisão 1 do Pedro: a missão começa dentro da faixa e pode terminar depois dela) é o commit "regra".
// Módulo puro (config e horarios, que já são da TV): o passo 29 de js/migracoes.js o leva para o grafo da TV.
import { MINUTOS_DO_DIA } from './config.js';
import { INICIOS_DOS_TEMPOS } from './horarios.js';

// As faixas e as pausas ficam entre as 06:30 e a meia-noite, no máximo 8 de cada por data
export const INICIO_DAS_FAIXAS = INICIOS_DOS_TEMPOS[0];
const MAXIMO_DE_FAIXAS = 8;
const MAXIMO_DE_PAUSAS = 8;

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

// A leitura de antes do C: o instrutor marcado em cada tempo que o compromisso toca
const cobreNoAw = (aw, a, b) => INICIOS_DOS_TEMPOS.every((inicio, k) => !sobrepoe(a, b, inicio, fimDoTempo(k)) || aw[k]);

// O instrutor disponível durante todo o compromisso [a, b) (voo, simulador ou aula de Ground): ele vem na data (on) e,
// com as faixas, a parte do compromisso entre as 06:30 e a meia-noite fica dentro de uma faixa e não toca nenhuma pausa;
// sem elas, ele está marcado em cada tempo de antes que o compromisso toca (o aw)
export function disponivelPara(x, a, b) {
  if (!x || !x.on) return false;
  if (!Array.isArray(x.faixas)) return cobreNoAw(x.aw || [], a, b);
  const de = Math.max(a, INICIO_DAS_FAIXAS);
  const ate = Math.min(b, MINUTOS_DO_DIA);
  if (de >= ate) return true;
  return x.faixas.some(f => f.de <= de && ate <= f.ate) && !(x.pausas || []).some(p => sobrepoe(a, b, p.de, p.ate));
}

// Até a tela do C, a grade de Instrutores ("Aplicar turno…" e as nove marcas), o "Marcar disponível" do agendamento e a
// reversão dele mudam o aw: o instrutor que tem faixas fica com as do aw novo (o que não tem continua lido pelo aw)
export function refazerFaixasDoAw(x) {
  if (x && Array.isArray(x.faixas)) Object.assign(x, faixasDoAw(x.aw));
  return x;
}

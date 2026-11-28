// Horários de decolagem por categoria. Cada categoria (C152, C172, Simulador e PA-34) tem a sua lista, em
// minutos, editada na aba Recursos; o padrão são os oito horários do dia (HORARIOS_PADRAO), e o PA-34 sai de 30 em 30
// minutos. O voo noturno sai sempre às 17:30 (HORARIO_DO_NOTURNO), e o Ground, nos oito horários padrão. Os nove inícios
// dos tempos de antes (js/tempos.js) ficam congelados só para o w da linha, as chaves das turmas de Ground e os dados
// antigos; enquanto o win existir, a janela de operação fechada fecha os horários que caem nela.
import { AIRCRAFT_EQ_TYPES, MINUTOS_DO_DIA } from './config.js';
import { INICIOS_DOS_TEMPOS } from './tempos.js';
import { categoriaDoTipo } from './categorias.js';
import { hm } from './format.js';

export { INICIOS_DOS_TEMPOS };
// A última janela de antes, a das 17:30 (a preferência antiga de 0 a 8, o "hN")
const ULTIMO_TEMPO = INICIOS_DOS_TEMPOS.length - 1;
// 17:30: o início do Noturno, o pouso mais tarde de um voo de dia no avião e a preferência mais tarde
export const HORARIO_DO_NOTURNO = INICIOS_DOS_TEMPOS[ULTIMO_TEMPO];
// 06:30: o Voo Solo sai sempre neste horário, e é o primeiro início do dia
export const HORARIO_DO_SOLO = INICIOS_DOS_TEMPOS[0];
// Os oito horários do dia, a lista padrão de cada categoria e a do Ground
export const HORARIOS_PADRAO = INICIOS_DOS_TEMPOS.slice(0, ULTIMO_TEMPO);
export const DE_30_EM_30 = Array.from({ length: 21 }, (_, i) => HORARIO_DO_SOLO + 30 * i);

// A Sala Ground (ground, a categoria dela em js/categorias.js) começa com os oito horários que o Ground usava (J, N11)
export const HORARIOS_INICIAIS = { C152: [...HORARIOS_PADRAO], C172: [...HORARIOS_PADRAO], sim: [...HORARIOS_PADRAO], 'PA-34': DE_30_EM_30, ground: [...HORARIOS_PADRAO] };
export const CATEGORIAS_COM_HORARIOS = Object.keys(HORARIOS_INICIAIS);

// O primeiro horário de decolagem do dia (06:30, Pedro em 2026-11-28: "booked times should start at 6:30"): o do Voo Solo,
// o mesmo limite do horário exato do pedido (js/rules.js), para a lista nunca oferecer um horário que o pedido perde
export const PRIMEIRO_HORARIO = HORARIO_DO_SOLO;
// Até 2026-11-28 o editor e a lista guardada aceitavam desde as 06:00. Um horário guardado das 06:00 às 06:29 não se
// perde: vira o primeiro do dia, na lista, na reversão dela e na preferência do pedido; antes das 06:00, sai como sempre
const INICIO_ACEITO_ANTES = 6 * 60;
const noInicioDoDia = m => (m >= INICIO_ACEITO_ANTES && m < PRIMEIRO_HORARIO ? PRIMEIRO_HORARIO : m);

// Um horário guardado na lista (06:30 às 17:00; o das 06:00 às 06:29, 06:30), ou null
const ULTIMO = 17 * 60;
export function horarioGuardado(m) {
  if (!Number.isInteger(m)) return null;
  const minuto = noInicioDoDia(m);
  return minuto >= PRIMEIRO_HORARIO && minuto <= ULTIMO ? minuto : null;
}

// Só horários do dia (06:30 às 17:00), em ordem e sem repetir; a categoria sem lista válida recebe a inicial
export function normalizarHorarios(horarios) {
  const dados = horarios && typeof horarios === 'object' ? horarios : {};
  return Object.fromEntries(CATEGORIAS_COM_HORARIOS.map(cat => {
    const lista = Array.isArray(dados[cat])
      ? [...new Set(dados[cat].map(horarioGuardado).filter(m => m !== null))].sort((a, b) => a - b)
      : [];
    return [cat, lista.length ? lista : [...HORARIOS_INICIAIS[cat]]];
  }));
}

// A lista de um tipo (pela categoria; a Sala Ground, a dela). O tipo sem categoria com lista, e a Sala Ground no
// cadastro gravado antes do formato 28 (sem a lista dela), usam os horários padrão. Sem os horários do cadastro, os
// iniciais (como no motor)
export function horariosDoTipo(horarios, tipo) {
  const lista = (horarios || HORARIOS_INICIAIS)[categoriaDoTipo(tipo)];
  return Array.isArray(lista) && lista.length ? lista : HORARIOS_PADRAO;
}

// Os horários de uma missão: o Noturno sai às 17:30 e o Voo Solo, sempre às 06:30 (local ou navegação); as demais,
// na lista do tipo pedido (o Ground, nos horários padrão)
// Até quando a missão pode ir: o voo de dia no avião pousa até as 17:30, quando começa a noite; o Noturno, o simulador
// e a aula de Ground, que não dependem da luz do dia, vão até o fim do dia
export const fimDaMissao = (mis, tipo) => (mis !== 'Noturno' && AIRCRAFT_EQ_TYPES.includes(tipo) ? HORARIO_DO_NOTURNO : MINUTOS_DO_DIA);
// Até quando a missão de cada aluno pode ir no dia (o motor, a compactação e as Sugestões usam esta): o Noturno só sai
// às 17:30, então o aluno que tem um na demanda do dia (o pedido ou uma missão extra marcados para voar, entre ou não o
// Noturno na escala) termina as outras missões (o simulador e a aula, que podem passar das 17:30) antes dele
export function fimDasMissoesDoDia(alunos) {
  const comNoturno = new Set(alunos.filter(s => [s, ...(Array.isArray(s.extra) ? s.extra : [])].some(p => p.fly && p.mis === 'Noturno')).map(s => s.id));
  return (stuId, mis, tipo) => (mis !== 'Noturno' && comNoturno.has(stuId) ? Math.min(HORARIO_DO_NOTURNO, fimDaMissao(mis, tipo)) : fimDaMissao(mis, tipo));
}

export const horariosDaMissao = (horarios, mis, tipo) => (mis === 'Noturno' ? [HORARIO_DO_NOTURNO] : mis === 'Voo Solo' ? [HORARIO_DO_SOLO] : horariosDoTipo(horarios, tipo));

// O período (janela de operação) em que um horário cai: a última janela que começa até ele
export function periodoDoMinuto(minuto) {
  let periodo = 0;
  INICIOS_DOS_TEMPOS.forEach((inicio, i) => { if (minuto >= inicio) periodo = i; });
  return periodo;
}

// Preferências em minutos; o número da janela (0 a 8) dos dados anteriores ao formato 12 vira o horário da janela
export const minutoDaPreferencia = p => (!Number.isInteger(p) || p < 0 ? -1 : p <= ULTIMO_TEMPO ? INICIOS_DOS_TEMPOS[p] : p);
// Uma preferência válida: um horário entre 06:30 e 17:30 (ou a janela antiga; a guardada das 06:00 às 06:29, 06:30); o
// resto vira "sem preferência"
export function preferenciaValida(p) {
  const minuto = noInicioDoDia(minutoDaPreferencia(p));
  return minuto >= PRIMEIRO_HORARIO && minuto <= HORARIO_DO_NOTURNO ? minuto : -1;
}

export function paraMinuto(texto) {
  const partes = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(texto || '');
  return partes ? +partes[1] * 60 + +partes[2] : null;
}

// As preferências de um pedido novo: os primeiros horários da lista a partir das 08:20 e das 10:10
export function preferenciasPadrao(lista) {
  const aPartirDe = minuto => lista.find(m => m >= minuto) ?? lista[lista.length - 1];
  return [aPartirDe(HORARIOS_PADRAO[1]), aPartirDe(HORARIOS_PADRAO[2])];
}

// Depois de trocar a missão ou o avião de um pedido: cada preferência vai para o horário mais próximo da lista nova,
// a partir dela (ao sair das 17:30 do Noturno, para as preferências padrão); o horário exato do pedido fica (N14)
export function ajustarPreferencias(pedido, lista) {
  const [padrao1, padrao2] = preferenciasPadrao(lista);
  const ajustar = (minuto, padrao) => {
    if (!Number.isInteger(minuto) || minuto < 0 || lista.includes(minuto)) return minuto;
    if (minuto === HORARIO_DO_NOTURNO) return padrao;
    return lista.find(m => m >= minuto) ?? lista[lista.length - 1];
  };
  pedido.p1 = ajustar(pedido.p1, padrao1);
  pedido.p2 = ajustar(pedido.p2, padrao2);
  // O horário exato do pedido fica, mesmo fora da lista nova (J, N14): o motor o recusa no horário dele até a lista ter o
  // minuto de novo ou o horário mudar (o efeito diz "fica fora da lista")
}


// A ordem dos horários a tentar: a 1ª e a 2ª preferência, depois os outros pela distância da 1ª (sem ela, da 2ª),
// o mais cedo no empate; sem preferência, em ordem. Só os horários da lista
export function ordenarPelaPreferencia(lista, p1, p2) {
  const ancora = p1 >= 0 ? p1 : p2 >= 0 ? p2 : null;
  const resto = ancora === null ? [...lista] : [...lista].sort((a, b) => Math.abs(a - ancora) - Math.abs(b - ancora) || a - b);
  return [...new Set([p1, p2, ...resto])].filter(m => lista.includes(m));
}

// O resumo dos horários e o efeito de uma lista nova. No editor, os horários vão das 06:30 às 16:30, o último em que
// cabe um voo de 1 h antes do noturno (a lista guardada continua aceitando até as 17:00)
export const ULTIMO_HORARIO = 16 * 60 + 30;

const emOrdem = lista => [...new Set(lista)].sort((a, b) => a - b);
const mesmaLista = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

export function modeloDosHorarios(lista) {
  const ordenada = emOrdem(lista);
  if (mesmaLista(ordenada, HORARIOS_PADRAO)) return 'padrao';
  if (mesmaLista(ordenada, DE_30_EM_30)) return 'de30';
  return 'personalizado';
}

const intervalo = passo => (passo % 60 === 0 ? `de ${passo / 60} em ${passo / 60} h` : `de ${passo} em ${passo} min`);

// O nome do modelo, ou a lista resumida: três ou mais horários com o mesmo intervalo viram "07:00–08:30 de 30 em 30 min"
export function descreverHorarios(lista) {
  const l = emOrdem(lista);
  const modelo = modeloDosHorarios(l);
  if (modelo === 'padrao') return 'Horários padrão';
  if (modelo === 'de30') return `De 30 em 30 min, ${hm(l[0])}–${hm(l[l.length - 1])}`;
  const partes = [];
  for (let i = 0; i < l.length;) {
    let fim = i;
    if (i + 2 < l.length) {
      const passo = l[i + 1] - l[i];
      while (fim + 1 < l.length && l[fim + 1] - l[fim] === passo) fim++;
      if (fim - i >= 2) { partes.push(`${hm(l[i])}–${hm(l[fim])} ${intervalo(passo)}`); i = fim + 1; continue; }
    }
    partes.push(hm(l[i]));
    i++;
  }
  return partes.join(', ');
}

// Manhã (antes das 12:00) e tarde
export const porPeriodo = lista => {
  const l = emOrdem(lista);
  return { manha: l.filter(m => m < 12 * 60), tarde: l.filter(m => m >= 12 * 60) };
};

// O que a lista nova de uma categoria faz com os pedidos dela (sem mudar os pedidos): quem muda de preferência e quem
// fica fora da lista (o horário exato do pedido, que a lista nova não tem: J, N14, o pedido fica com ele e o motor o
// recusa nesse horário). pedidos: [{ nome, pedido }]
export function impactoDosHorarios(pedidos, horarios, cat, lista) {
  const novos = { ...horarios, [cat]: emOrdem(lista) };
  const mudam = [], foraDaLista = [];
  for (const { nome, pedido } of pedidos) {
    if (categoriaDoTipo(pedido.eq) !== cat) continue;
    const depois = { ...pedido };
    const listaNova = horariosDaMissao(novos, pedido.mis, pedido.eq);
    ajustarPreferencias(depois, listaNova);
    if (depois.p1 !== pedido.p1 || depois.p2 !== pedido.p2) mudam.push(nome);
    // O horário exato do pedido (h<minuto>; com a 2ª preferência, U1, h<m1>|h<m2>): cada minuto que a lista nova não tem
    const exatos = typeof pedido.jan === 'string' && /^h\d+(\|h\d+)?$/.test(pedido.jan) ? pedido.jan.split('|').map(h => +h.slice(1)) : [];
    for (const exato of exatos) if (!listaNova.includes(exato)) foraDaLista.push({ nome, minuto: exato });
  }
  return { mudam, foraDaLista };
}

export function resumoDoImpacto({ mudam, foraDaLista }) {
  const partes = [];
  if (mudam.length) partes.push(`${mudam.length} ${mudam.length === 1 ? 'pedido muda' : 'pedidos mudam'} de preferência`);
  if (foraDaLista.length === 1) partes.push(`1 fica fora da lista (às ${hm(foraDaLista[0].minuto)})`);
  else if (foraDaLista.length > 1) partes.push(`${foraDaLista.length} ficam fora da lista`);
  return partes.length ? `${partes.join('; ')}.` : 'Nenhum pedido muda.';
}

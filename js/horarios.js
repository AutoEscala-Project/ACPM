// Horários de decolagem por categoria. Cada categoria (C152, C172, Simulador e PA-34) tem a sua lista, em
// minutos, editada na aba Recursos; o padrão são as 8 janelas diurnas, e o PA-34 sai de 30 em 30 minutos. O voo
// noturno sai sempre às 17:30, e o Ground, nas janelas do dia. As 9 janelas viram os períodos do dia: a janela de
// operação fechada fecha os horários que caem nela, e a disponibilidade dos instrutores e "manhã, tarde e noite"
// valem por período.
import { T, NI, DAY } from './config.js';
import { categoriaDoTipo } from './categorias.js';

export const HORARIOS_PADRAO = DAY.map(w => T[w]);
export const DE_30_EM_30 = Array.from({ length: 21 }, (_, i) => 390 + 30 * i);

export const HORARIOS_INICIAIS = { C152: [...HORARIOS_PADRAO], C172: [...HORARIOS_PADRAO], sim: [...HORARIOS_PADRAO], 'PA-34': DE_30_EM_30 };
export const CATEGORIAS_COM_HORARIOS = Object.keys(HORARIOS_INICIAIS);

// Só horários do dia (06:00 às 17:00), em ordem e sem repetir; a categoria sem lista válida recebe a inicial
const PRIMEIRO = 6 * 60, ULTIMO = 17 * 60;
export function normalizarHorarios(horarios) {
  const dados = horarios && typeof horarios === 'object' ? horarios : {};
  return Object.fromEntries(CATEGORIAS_COM_HORARIOS.map(cat => {
    const lista = Array.isArray(dados[cat])
      ? [...new Set(dados[cat].filter(m => Number.isInteger(m) && m >= PRIMEIRO && m <= ULTIMO))].sort((a, b) => a - b)
      : [];
    return [cat, lista.length ? lista : [...HORARIOS_INICIAIS[cat]]];
  }));
}

// A lista de um tipo (pela categoria); a sala de Ground (e um tipo sem categoria com lista) usa as janelas do dia.
// Sem os horários do cadastro, os iniciais (como no motor)
export function horariosDoTipo(horarios, tipo) {
  const lista = (horarios || HORARIOS_INICIAIS)[categoriaDoTipo(tipo)];
  return Array.isArray(lista) && lista.length ? lista : HORARIOS_PADRAO;
}

// Os horários de uma missão: o Noturno sai às 17:30 e o Voo Solo, sempre às 06:30 (local ou navegação); as demais,
// na lista do tipo pedido (o Ground, nas janelas do dia)
export const HORARIO_DO_SOLO = 390;
export const horariosDaMissao = (horarios, mis, tipo) => (mis === 'Noturno' ? [T[NI]] : mis === 'Voo Solo' ? [HORARIO_DO_SOLO] : horariosDoTipo(horarios, tipo));

// O período (janela de operação) em que um horário cai: a última janela que começa até ele
export function periodoDoMinuto(minuto) {
  let periodo = 0;
  T.forEach((inicio, i) => { if (minuto >= inicio) periodo = i; });
  return periodo;
}

// Preferências em minutos; o número da janela (0 a 8) dos dados anteriores ao formato 12 vira o horário da janela
export const minutoDaPreferencia = p => (!Number.isInteger(p) || p < 0 ? -1 : p <= NI ? T[p] : p);
// Uma preferência válida: um horário entre 06:00 e 17:30 (ou a janela antiga); o resto vira "sem preferência"
export function preferenciaValida(p) {
  const minuto = minutoDaPreferencia(p);
  return minuto >= PRIMEIRO && minuto <= T[NI] ? minuto : -1;
}

export function paraMinuto(texto) {
  const partes = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(texto || '');
  return partes ? +partes[1] * 60 + +partes[2] : null;
}

// As preferências de um pedido novo: os primeiros horários da lista a partir das 08:20 e das 10:10
export function preferenciasPadrao(lista) {
  const aPartirDe = minuto => lista.find(m => m >= minuto) ?? lista[lista.length - 1];
  return [aPartirDe(T[1]), aPartirDe(T[2])];
}

// Depois de trocar a missão ou o avião de um pedido: cada preferência vai para o horário mais próximo da lista nova,
// a partir dela (ao sair das 17:30 do Noturno, para as preferências padrão), e um horário exato que a lista nova não
// tem deixa de valer
export function ajustarPreferencias(pedido, lista) {
  const [padrao1, padrao2] = preferenciasPadrao(lista);
  const ajustar = (minuto, padrao) => {
    if (!Number.isInteger(minuto) || minuto < 0 || lista.includes(minuto)) return minuto;
    if (minuto === T[NI]) return padrao;
    return lista.find(m => m >= minuto) ?? lista[lista.length - 1];
  };
  pedido.p1 = ajustar(pedido.p1, padrao1);
  pedido.p2 = ajustar(pedido.p2, padrao2);
  if (typeof pedido.jan === 'string' && /^h\d+$/.test(pedido.jan) && !lista.includes(+pedido.jan.slice(1))) delete pedido.jan;
}


// A ordem dos horários a tentar: a 1ª e a 2ª preferência, depois os outros pela distância da 1ª (sem ela, da 2ª),
// o mais cedo no empate; sem preferência, em ordem. Só os horários da lista
export function ordenarPelaPreferencia(lista, p1, p2) {
  const ancora = p1 >= 0 ? p1 : p2 >= 0 ? p2 : null;
  const resto = ancora === null ? [...lista] : [...lista].sort((a, b) => Math.abs(a - ancora) - Math.abs(b - ancora) || a - b);
  return [...new Set([p1, p2, ...resto])].filter(m => lista.includes(m));
}

// O resumo dos horários e o efeito de uma lista nova. No editor, os horários vão das 06:00 às 16:30, o último em que
// cabe um voo de 1 h antes do noturno (a lista guardada continua aceitando até as 17:00)
export const PRIMEIRO_HORARIO = 6 * 60;
export const ULTIMO_HORARIO = 16 * 60 + 30;

const emOrdem = lista => [...new Set(lista)].sort((a, b) => a - b);
const mesmaLista = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

export function modeloDosHorarios(lista) {
  const ordenada = emOrdem(lista);
  if (mesmaLista(ordenada, HORARIOS_PADRAO)) return 'janelas';
  if (mesmaLista(ordenada, DE_30_EM_30)) return 'de30';
  return 'personalizado';
}

const doisDigitos = n => String(n).padStart(2, '0');
const hora = m => `${doisDigitos(Math.floor(m / 60))}:${doisDigitos(m % 60)}`;
const intervalo = passo => (passo % 60 === 0 ? `de ${passo / 60} em ${passo / 60} h` : `de ${passo} em ${passo} min`);

// O nome do modelo, ou a lista resumida: três ou mais horários com o mesmo intervalo viram "07:00–08:30 de 30 em 30 min"
export function descreverHorarios(lista) {
  const l = emOrdem(lista);
  const modelo = modeloDosHorarios(l);
  if (modelo === 'janelas') return 'Janelas do dia';
  if (modelo === 'de30') return `De 30 em 30 min, ${hora(l[0])}–${hora(l[l.length - 1])}`;
  const partes = [];
  for (let i = 0; i < l.length;) {
    let fim = i;
    if (i + 2 < l.length) {
      const passo = l[i + 1] - l[i];
      while (fim + 1 < l.length && l[fim + 1] - l[fim] === passo) fim++;
      if (fim - i >= 2) { partes.push(`${hora(l[i])}–${hora(l[fim])} ${intervalo(passo)}`); i = fim + 1; continue; }
    }
    partes.push(hora(l[i]));
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
// perde o "Só às" (o horário exato que a lista nova não tem). pedidos: [{ nome, pedido }]
export function impactoDosHorarios(pedidos, horarios, cat, lista) {
  const novos = { ...horarios, [cat]: emOrdem(lista) };
  const mudam = [], perdemSo = [];
  for (const { nome, pedido } of pedidos) {
    if (categoriaDoTipo(pedido.eq) !== cat) continue;
    const depois = { ...pedido };
    ajustarPreferencias(depois, horariosDaMissao(novos, pedido.mis, pedido.eq));
    if (depois.p1 !== pedido.p1 || depois.p2 !== pedido.p2 || depois.jan !== pedido.jan) mudam.push(nome);
    if (pedido.jan !== undefined && depois.jan === undefined) perdemSo.push({ nome, minuto: +pedido.jan.slice(1) });
  }
  return { mudam, perdemSo };
}

export function resumoDoImpacto({ mudam, perdemSo }) {
  if (!mudam.length) return 'Nenhum pedido muda.';
  const partes = [`${mudam.length} ${mudam.length === 1 ? 'pedido muda' : 'pedidos mudam'} de preferência`];
  if (perdemSo.length === 1) partes.push(`1 perde “Só às ${hora(perdemSo[0].minuto)}”`);
  else if (perdemSo.length > 1) partes.push(`${perdemSo.length} perdem o “Só às”`);
  return `${partes.join('; ')}.`;
}

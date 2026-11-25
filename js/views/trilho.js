// O trilho (aside#trilho): o calendário da data aberta, com os pedidos de cada dia, e a linha da data. Fica ao lado da tela
// (fixo: na largura larga, por padrão; na média, quando a pessoa escolhe) ou abre como painel entre a linha e a
// tela pelo botão da data (#btn-data). Só "Fixar ao lado" fica guardado, por classe de largura (acpm_trilho)
import { $, trocarConteudo } from '../dom.js';
import { esc, hojeISO, rotuloDaData } from '../format.js';
import { semanasDoMes, paradaDoTab, descricaoDoDia, linhaDaData, nomeDoMes } from '../calendario.js';
import { ehDomingo } from '../agenda.js';
import { DATA } from '../state.js';
import { ApiClient } from '../storage.js';
import { pedidosDaDataAberta } from './selos.js';

const ABREVIADOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CABECA = [['D', 'domingo'], ['S', 'segunda-feira'], ['T', 'terça-feira'], ['Q', 'quarta-feira'], ['Q', 'quinta-feira'], ['S', 'sexta-feira'], ['S', 'sábado']];

// O mês à vista (as setas do mês mudam só ele), o dia que está abrindo e os pedidos de cada dia das semanas à vista
let mesVisivel = null;
let abrindo = null;
let contagem = {};

export const mesDoTrilho = () => mesVisivel || (DATA || hojeISO()).slice(0, 7);
export function mostrarMes(mes) { mesVisivel = mes; }
export function marcarAbrindo(dia) { abrindo = dia; }
export const diaAbrindo = () => abrindo;
export const semanasAVista = () => semanasDoMes(mesDoTrilho());

// Os pedidos (não cancelados) de cada dia das semanas à vista, para todos os perfis: lidos com os dados da primeira data
// (antes deles, e da sessão, o app ainda lê deste navegador: nada é pedido), ao mudar o mês à vista, ao abrir o painel ou a
// Agenda e depois de registrar ou cancelar um pedido. Sem resposta, os dias ficam sem número
let dadosChegaram = false;
let mesContado = null;
let leituraDaContagem = 0;
export async function lerContagemDosDias() {
  if (!dadosChegaram) return;
  const vez = ++leituraDaContagem;
  const semanas = semanasAVista();
  mesContado = mesDoTrilho();
  let lidos = null;
  try {
    lidos = await ApiClient.contagemDaAgenda(semanas[0][0], semanas.at(-1).at(-1));
  } catch {
    // Sem a leitura, sem números (os dados da próxima data pedem de novo)
  }
  if (vez !== leituraDaContagem) return;
  if (!lidos) mesContado = null;
  contagem = lidos || {};
  rTrilho();
}
// Os dados de uma data chegaram: a contagem é lida se o mês à vista ainda não foi contado
export function contarComOsDados() {
  dadosChegaram = true;
  if (mesContado !== mesDoTrilho()) lerContagemDosDias();
}

// O estado do trilho: 'fixo' (ao lado), 'aberto' (o painel) ou 'fechado'
export const estadoDoTrilho = () => document.body.dataset.trilho || 'fechado';

export function mostrarTrilho(estado) {
  document.body.dataset.trilho = estado;
  const trilho = $('#trilho');
  if (trilho) trilho.hidden = estado === 'fechado';
  const botao = $('#btn-data');
  if (botao) {
    // Fixo, o botão leva o foco ao calendário; solto, ele abre e fecha o painel
    if (estado === 'fixo') botao.removeAttribute('aria-expanded');
    else botao.setAttribute('aria-expanded', String(estado === 'aberto'));
  }
  const fixar = $('#btn-fixar-trilho');
  if (fixar) fixar.setAttribute('aria-pressed', String(estado === 'fixo'));
  const fechar = $('#btn-fechar-trilho');
  if (fechar) fechar.hidden = estado !== 'aberto';
}

// O nome da data no botão do topo: "quarta-feira, 11/11" e "amanhã" (na tela estreita, "qua., 11/11")
export function rRotuloDaData() {
  if (!DATA) return;
  const { semana, semanaCurta, data: diaMes, relativo } = rotuloDaData(DATA, hojeISO());
  const parte = (classe, texto) => Object.assign(document.createElement('span'), { className: classe, textContent: texto });
  $('#dt-rotulo').replaceChildren(parte('dt-semana', semana), parte('dt-semana-curta', semanaCurta), `, ${diaMes}`);
  $('#dt-rel').textContent = relativo;
  $('#dt-rel').hidden = !relativo;
}

function botaoDoDia(dia, { mes, hoje, parada }) {
  const qtd = contagem[dia] || 0;
  const domingo = ehDomingo(dia);
  const classes = ['cal-dia', dia === hoje && 'hoje', dia === DATA && 'aberta', dia.slice(0, 7) !== mes && 'fora', domingo && 'domingo', dia === abrindo && 'abrindo'].filter(Boolean);
  const mesCurto = dia.slice(8, 10) === '01' && dia.slice(0, 7) !== mes ? `<small class="cal-mes-curto" aria-hidden="true">${ABREVIADOS[+dia.slice(5, 7) - 1]}</small>` : '';
  const atributos = [
    `data-dia="${dia}"`, `tabindex="${dia === parada ? 0 : -1}"`,
    `aria-label="${esc(descricaoDoDia(dia, { hoje, aberta: DATA, qtd, abrindo }))}"`,
    dia === DATA ? 'aria-current="date"' : '', domingo ? 'aria-disabled="true"' : '', dia === abrindo ? 'aria-busy="true"' : ''
  ].filter(Boolean).join(' ');
  const numero = qtd ? `<span class="cal-qtd" aria-hidden="true">${qtd > 99 ? '99+' : qtd}</span>` : '';
  return `<td role="gridcell"><button type="button" class="${classes.join(' ')}" ${atributos}>${+dia.slice(8, 10)}${mesCurto}${numero}</button></td>`;
}

// O calendário do mês à vista e a linha da data aberta (ou da que está abrindo)
export function rTrilho() {
  const trilho = $('#trilho');
  if (!trilho || !DATA) return;
  const mes = mesDoTrilho();
  const hoje = hojeISO();
  const semanas = semanasDoMes(mes);
  // O dia em foco continua a parada do Tab num redesenho
  const emFoco = document.activeElement && document.activeElement.closest('#cal .cal-dia');
  const parada = emFoco && semanas.flat().includes(emFoco.dataset.dia) ? emFoco.dataset.dia : paradaDoTab(semanas, { aberta: DATA, hoje });
  // O número da data aberta segue os pedidos dela já lidos
  const { lista, leitura } = pedidosDaDataAberta();
  if (leitura === 'lidos') contagem[DATA] = lista.filter(p => !p.cancelada_em).length;
  trilho.dataset.mes = mes;
  // O mês é dito quando muda (aria-live): o mesmo texto escrito de novo seria lido a cada redesenho
  if ($('#cal-mes').textContent !== nomeDoMes(mes)) $('#cal-mes').textContent = nomeDoMes(mes);
  const cabeca = `<thead><tr>${CABECA.map(([letra, nome]) => `<th scope="col" aria-label="${nome}"><span aria-hidden="true">${letra}</span></th>`).join('')}</tr></thead>`;
  const corpo = `<tbody>${semanas.map(semana => `<tr>${semana.map(dia => botaoDoDia(dia, { mes, hoje, parada })).join('')}</tr>`).join('')}</tbody>`;
  trocarConteudo($('#cal'), cabeca + corpo);
  $('#trilho-data').textContent = abrindo ? `Abrindo ${rotuloDaData(abrindo, hoje).dia}…` : linhaDaData(DATA, hoje);
}

// O dia do calendário que recebe o foco: o pedido ou a parada do Tab
export function focarNoCalendario(dia = null) {
  const alvo = (dia && $(`#cal .cal-dia[data-dia="${dia}"]`)) || $('#cal .cal-dia[tabindex="0"]');
  if (!alvo) return;
  $('#cal').querySelectorAll('.cal-dia').forEach(b => { b.tabIndex = b === alvo ? 0 : -1; });
  alvo.focus();
}

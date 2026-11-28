// Aba Demanda: pedidos de missão por aluno (inclusive missões extras) e filtros (só quem voa, o nome, o curso do aluno e a
// missão). Os campos são discretos (parecem texto até o mouse passar ou o foco chegar); o que a missão exige do instrutor
// fica na dica do campo da missão. O tipo de recurso, o instrutor, a prioridade, as preferências e a duração saíram para
// as restrições do pedido (G1, js/views/restricoes-do-voo.js): o "Restrições" da linha abre a gaveta delas
import { MIS, GROUND_EQ_TYPE } from '../config.js';
import { matriculasDoTipo } from '../frota.js';
import { esc, opts, hm, chaveDeBusca } from '../format.js';
import { isGroundMission } from '../rules.js';
import { descreverExigencias } from '../habilitacoes.js';
import { S, inativoNaDataAberta, programaLido } from '../state.js';
import { exigeDaMissaoDoPedido } from '../programa.js';
import { $, trocarConteudo } from '../dom.js';
import { renderAuditPanel } from './escala.js';
import { etapaNaDemanda } from './etapas.js';
import { chaveDoVoo } from '../voo.js';
import { nomeDoRecurso } from '../categorias.js';
import { criarFiltroDosCursos, cursoDaLinha } from './filtro-dos-cursos.js';
import { nenhumComOsFiltros } from './linhas-filtradas.js';

// O voo agendado na Escala (o voo fixo com a marca agendado): o horário e o recurso dele. Ele explica por que mudar a
// preferência do pedido não muda o voo
function tagDoAgendado(stu, mid) {
  const pino = (S.fixos || {})[chaveDoVoo(stu.id, mid)];
  if (!pino || !pino.agendado) return '';
  return ` <span class="tag" data-dica="voo-agendado"><svg class="ico" aria-hidden="true"><use href="#i-cadeado"/></svg>agendado ${hm(pino.a)} · ${esc(nomeDoRecurso(pino.r))}</span>`;
}

// As colunas da Demanda: Aluno, Voa e Missão (as outras estão nas restrições do pedido, G1)
const COLUNAS_DA_DEMANDA = 3;

export const singleDemandRowHTML = (stu, d, mid = 0) => {
  const isExtra = mid !== 0;
  const isGnd = isGroundMission(d.mis);
  const trCls = `${d.fly ? 'on' : 'off'}${isExtra ? ' extra-row' : ''}`;
  // A missão do curso do pedido e o voo agendado na Escala; as restrições (o que o app lê para encaixar o pedido) na gaveta
  const etapa = etapaNaDemanda(stu, d) + tagDoAgendado(stu, mid);
  const restricoes = ` <button type="button" class="btn quiet restricoes-btn" data-act="restricoes" data-id="${stu.id}" data-mid="${mid}" aria-label="Restrições de ${esc(stu.nm)}${isExtra ? ` (${esc(d.mis)})` : ''}" title="O tipo de recurso, o instrutor, os horários e a duração do pedido">Restrições</button>`;
  const firstCell = isExtra
    ? `<div class="stu-cell"><span class="sm">↳ missão extra</span>${etapa}${restricoes}<button class="x edit-only" data-act="del-mis" data-id="${stu.id}" data-mid="${mid}" aria-label="Tirar a missão extra de ${esc(stu.nm)}" title="Tirar esta missão extra">✕</button></div>`
    : `<div class="stu-cell"><span>${esc(stu.nm)}</span>${inativoNaDataAberta(stu) ? ' <span class="tag">inativo</span>' : ''}${etapa}${restricoes}<button class="btn-add-mis edit-only" data-act="add-mis" data-id="${stu.id}" title="Outra missão para este aluno no mesmo dia" aria-label="Mais uma missão para ${esc(stu.nm)}">+ missão</button></div>`;
  const soParafuso = d.mis === 'Parafuso' && d.eq === 'C152' ? matriculasDoTipo(S.frota || [], 'C152', { parafuso: true }) : [];
  // O que a missão exige do INVA: o tipo, o avião, o curso do aluno e a missão do curso do pedido
  const exige = `Exige ${descreverExigencias(d.mis, isGnd ? GROUND_EQ_TYPE : d.eq, { curso: stu.curso, exige: exigeDaMissaoDoPedido(programaLido(), d, stu) })}${soParafuso.length ? ` (no ${soParafuso.join(' ou ')})` : ''}`;
  const de = ` de ${esc(stu.nm)}`;

  return `<tr data-k="d" data-id="${stu.id}" data-mid="${mid}" data-nm="${esc(chaveDeBusca(stu.nm))}" data-curso="${esc(stu.curso || '')}" data-mis="${esc(d.mis)}" class="${trCls}">
    <td>${firstCell}</td>
    <td><label class="alvo"><input type="checkbox" class="sw" data-f="fly"${d.fly ? ' checked' : ''} aria-label="${esc(stu.nm)} vai voar"></label></td>
    <td><select data-f="mis" title="${esc(exige)}" aria-label="Missão${de}">${opts(Object.keys(MIS).map(m => [m, m]), d.mis)}</select></td>
  </tr>`;
};

const studentDemandRowsHTML = stu => {
  let html = singleDemandRowHTML(stu, stu, 0);
  if (Array.isArray(stu.extra) && stu.extra.length) {
    html += stu.extra.map(ex => singleDemandRowHTML(stu, ex, ex.mid)).join('');
  }
  return html;
};

export const cnt = () => {
  let activeMissions = 0;
  let activeStudents = 0;
  S.stu.forEach(s => {
    const extraActive = (s.extra || []).filter(ex => ex.fly).length;
    const totStu = (s.fly ? 1 : 0) + extraActive;
    if (totStu > 0) activeStudents++;
    activeMissions += totStu;
  });
  $('#cnt').textContent = `${activeStudents} / ${S.stu.length} aluno(s) · ${activeMissions} missão(ões) marcada(s)`;
  // "Pôr um aluno na demanda": os alunos ativos que ainda não voam na data
  const fora = S.stu.filter(s => !s.fly && !(s.extra || []).some(ex => ex.fly) && !inativoNaDataAberta(s));
  $('#alunos-fora').innerHTML = fora.map(s => `<option value="${esc(s.nm)}"></option>`).join('');
};

export const rDem = () => {
  // As opções do filtro dos cursos acompanham os programas e os cursos dos alunos
  if (filtroDosCursos) filtroDosCursos.desenhar();
  if (!S.stu.length) {
    trocarConteudo($('#dem'), `<tr class="empty-dem"><td colspan="${COLUNAS_DA_DEMANDA}" class="h" style="padding:16px">Nenhum aluno cadastrado. Cadastre os alunos em Alunos.</td></tr>`);
    cnt();
    renderAuditPanel();
    return;
  }
  trocarConteudo($('#dem'), S.stu.map(studentDemandRowsHTML).join(''));
  cnt();
  applyDemandFilters();
  renderAuditPanel();
};

// O filtro dos cursos na Demanda (js/views/filtro-dos-cursos.js), o mesmo de Alunos, com as mesmas marcas: o pedido
// aparece se o aluno está em algum dos cursos marcados, junto com os outros filtros da barra
let filtroDosCursos = null;
export function prepararFiltroDosCursos() {
  filtroDosCursos = criarFiltroDosCursos('flt-dem-cur', filtrarDemanda);
}

// O aluno posto agora na demanda ("Pôr um aluno na demanda") continua à vista mesmo fora dos filtros, até eles mudarem:
// as marcas dos cursos podem ter vindo de Alunos, e o pedido incluído não some na hora
const mantidosNaDemanda = new Set();
export const manterNaDemanda = id => mantidosNaDemanda.add(id);

// Um filtro da barra mudou (a busca, a missão, as marcas dos cursos, aqui ou em Alunos): vale para todos os pedidos
export function filtrarDemanda() {
  mantidosNaDemanda.clear();
  applyDemandFilters();
}

function applyDemandFilters() {
  // O nome sem acentos: "joao" acha "João"
  const q = chaveDeBusca($('#flt-dem') && $('#flt-dem').value);
  const mis = $('#flt-dem-mis') ? $('#flt-dem-mis').value : '';
  const noCurso = filtroDosCursos ? filtroDosCursos.quemPassa() : () => true;
  document.querySelectorAll('#dem tr[data-k="d"]').forEach(tr => {
    const matchName = !q || tr.dataset.nm.includes(q);
    const matchMis = !mis || tr.dataset.mis === mis;
    tr.hidden = !(mantidosNaDemanda.has(+tr.dataset.id) || (matchName && matchMis && noCurso(cursoDaLinha(tr))));
  });
  conferirNenhumNaDemanda();
}

// Com os filtros da barra escondendo todos os pedidos, a linha "Nenhum aluno com esses filtros", com "Limpar filtros"
// (como em Instrutores e Alunos). Ela conta só os pedidos que "Só quem voa" deixa: sem ninguém voando, nenhum filtro da
// barra esconde nada, e a contagem de cima já diz "0 missão(ões) marcada(s)". Vale de novo quando "Só quem voa" muda e
// quando o Voa de um pedido muda (a linha dele é refeita)
export function conferirNenhumNaDemanda() {
  const corpo = $('#dem');
  if (!corpo) return;
  const soQuemVoa = corpo.classList.contains('only');
  const restam = [...corpo.querySelectorAll(':scope > tr[data-k="d"]')].filter(tr => !(soQuemVoa && tr.classList.contains('off')));
  nenhumComOsFiltros(corpo, restam.length > 0 && restam.every(tr => tr.hidden), { nome: 'aluno' });
}

// "Limpar filtros" da Demanda: a busca, a missão e as marcas dos cursos (também as de Alunos, que são as mesmas) voltam a
// vazio, e o foco vai para a busca. "Só quem voa" fica como está
export function limparFiltrosDaDemanda() {
  $('#flt-dem').value = '';
  $('#flt-dem-mis').value = '';
  if (filtroDosCursos) filtroDosCursos.limpar();
  filtrarDemanda();
  $('#flt-dem').focus();
}

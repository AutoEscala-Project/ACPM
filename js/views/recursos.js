// Aba Recursos, em duas partes (revisão de 14/11). Nesta data: as janelas de operação, a tabela dos aviões e simuladores
// (disponível ou em manutenção, as horas até a revisão de 50 horas e o que o avião voa na escala do dia; uma categoria ou
// todas, e cada categoria recolhe e abre) e a ordem no hangar. Para todas as datas: os horários de decolagem
// (js/views/horarios.js) e a frota, com o Retirar.
import { WIN, NI, AIRCRAFT_EQ_TYPES, SIM_EQ_TYPES, REVISAO_H } from '../config.js';
import { normalizarHangar } from '../hangar.js';
import { FROTA_INICIAL } from '../frota.js';
import { S, RES, voosQueVoam } from '../state.js';
import { $ } from '../dom.js';
import { hm, fmtH, esc } from '../format.js';
import { rHorarios } from './horarios.js';

// Os grupos usam os ids das categorias do filtro (js/categorias.js)
const GRUPOS = [...AIRCRAFT_EQ_TYPES.map(tipo => ({ id: tipo, rotulo: tipo, tipos: [tipo] })), { id: 'sim', rotulo: 'Simuladores', tipos: SIM_EQ_TYPES }];

// Categorias recolhidas (continuam assim quando a escala é refeita, até recarregar a página)
const recolhidos = new Set();
export function alternarGrupoDaFrota(id) {
  const recolher = !recolhidos.has(id);
  if (recolher) recolhidos.add(id);
  else recolhidos.delete(id);
  document.querySelectorAll(`#revisao tr[data-r][data-grupo="${id}"]`).forEach(tr => { tr.hidden = recolher; });
  const botao = document.querySelector(`#revisao [data-recolher-grupo="${id}"]`);
  if (botao) botao.setAttribute('aria-expanded', String(!recolher));
}

function situacao(r, voadas, revisao) {
  if (!S.av[r]) return '<span class="tag">Em manutenção</span>';
  if (revisao && revisao.paraAs !== null) {
    return `<span class="tag er">Parou para revisão de 50 horas ${revisao.voadas ? 'às ' + hm(revisao.paraAs) : '(sem saldo hoje)'}</span>`;
  }
  if (!voadas) return '<span class="sm">—</span>';
  return `${fmtH(voadas)} na escala${revisao ? ` · termina com ${fmtH(horasDisponiveis(revisao.fim))} disponíveis` : ''}`;
}

// As horas disponíveis até a revisão (retorno da operação, 14/11: a operadora lança as disponíveis; o dia guarda as
// horas desde a revisão, 50 menos as disponíveis)
const horasDisponiveis = horas => Math.round(Math.max(0, REVISAO_H - horas) * 10) / 10;

// A barra das horas disponíveis: âmbar abaixo de 10 h e vermelha abaixo de 5 h
function barra(horas) {
  const resta = horasDisponiveis(horas);
  const cor = resta < 5 ? 'er' : resta < 10 ? 'wa' : '';
  const largura = Math.max(2, Math.min(100, (resta / REVISAO_H) * 100)).toFixed(0);
  return `<span class="barra ${cor}"><i style="width:${largura}%"></i></span>`;
}

function linha({ reg: r, tipo, soParafuso }, grupo, voadas, revisao) {
  const aviao = AIRCRAFT_EQ_TYPES.includes(tipo);
  const horas = S.horas[r];
  const temHoras = typeof horas === 'number';
  const parafuso = soParafuso ? ' <span class="tag fb" data-dica="so-parafuso">Só Parafuso</span>' : '';
  return `<tr data-r="${esc(r)}" data-grupo="${grupo}"${S.av[r] ? '' : ' class="manutencao"'}${recolhidos.has(grupo) ? ' hidden' : ''}>
    <td><label class="alvo"><input type="checkbox" class="sw" data-a="av" data-id="${esc(r)}"${S.av[r] ? ' checked' : ''} aria-label="${esc(r)} disponível"></label></td>
    <td><b>${esc(r)}</b>${aviao ? '' : ` <small class="sm">${tipo}</small>`}${parafuso}</td>
    <td>${aviao ? `<span class="horas-disp"><input type="number" class="horas" min="0" max="${REVISAO_H}" step="0.1" inputmode="decimal" data-a="horas" data-horas="${esc(r)}" value="${temHoras ? horasDisponiveis(horas) : ''}" placeholder="—" aria-label="Horas disponíveis do ${esc(r)} até a revisão"> h${temHoras ? barra(horas) : ''}</span>` : ''}</td>
    <td>${situacao(r, voadas, revisao)}</td>
    <td class="edit-only acoes-frota">${aviao ? `<button class="btn quiet rev" data-act="revisao" data-id="${esc(r)}">Revisão feita</button>` : ''}</td>
  </tr>`;
}

// A frota, por tipo: refeita junto com a escala (as horas voadas no dia e onde cada avião para)
export function rRevisao() {
  const resumo = (RES && RES.revisao) || {};
  const voadas = {};
  voosQueVoam().forEach(o => { voadas[o.r] = (voadas[o.r] || 0) + o.h; });
  const categoria = ($('#flt-rec-cat') && $('#flt-rec-cat').value) || '';
  $('#revisao').innerHTML = GRUPOS.filter(g => !categoria || g.id === categoria).map(({ id, rotulo, tipos }) => {
    // A frota do cadastro, na ordem de cada tipo (uma categoria sem recursos não aparece)
    const recursos = tipos.flatMap(tipo => (S.frota || []).filter(f => f.tipo === tipo));
    if (!recursos.length) return '';
    const disponiveis = recursos.filter(f => S.av[f.reg]).length;
    return `<tr class="grupo"><td colspan="5"><button type="button" class="grupo-btn" data-recolher-grupo="${id}" aria-expanded="${!recolhidos.has(id)}"><svg class="ico seta" aria-hidden="true"><use href="#i-baixo"/></svg>${rotulo} <small>${disponiveis} de ${recursos.length} disponíveis</small></button></td></tr>` +
      recursos.map(f => linha(f, id, voadas[f.reg] || 0, resumo[f.reg])).join('');
  }).join('');
}

// A frota (vale para todas as datas; revisão de 14/11): cada recurso uma vez, por categoria, com "Só Parafuso" e o
// Retirar. A disponibilidade e as horas ficam na tabela desta data
function rFrota() {
  const lista = $('#frota');
  if (!lista) return;
  lista.innerHTML = GRUPOS.map(({ rotulo, tipos }) => {
    const recursos = tipos.flatMap(tipo => (S.frota || []).filter(f => f.tipo === tipo));
    if (!recursos.length) return '';
    return `<li class="grupo"><h5>${rotulo} <small>${recursos.length} ${recursos.length === 1 ? 'recurso' : 'recursos'}</small></h5><ul class="frota-itens">` +
      recursos.map(({ reg, tipo, soParafuso }) => `<li class="frota-item" data-r="${esc(reg)}">
        <b>${esc(reg)}</b>${AIRCRAFT_EQ_TYPES.includes(tipo) ? '' : ` <small class="sm">${esc(tipo)}</small>`}${soParafuso ? ' <span class="tag fb" data-dica="so-parafuso">Só Parafuso</span>' : ''}
        <button class="btn quiet rev ret edit-only" data-act="retirar-recurso" data-id="${esc(reg)}" aria-label="Retirar ${esc(reg)} da frota">Retirar</button>
      </li>`).join('') + '</ul></li>';
  }).join('');
}

export function rRec() {
  $('#wins').innerHTML = WIN.map((w, i) => `<label class="janela${S.win[i] ? '' : ' off'}"><input type="checkbox" class="sw" data-a="win" data-i="${i}"${S.win[i] ? ' checked' : ''}><b>${w}</b> <small>${i == NI ? 'noturno' : (i + 1) + 'º'}</small></label>`).join('');
  rHorarios();
  rRevisao();
  rFrota();
  rHangar();
}

// A ordem dos aviões no hangar, da frente para o fundo, com o que cada um voa na escala da data; os botões aparecem com
// o mouse ou o foco (como no Rodízio)
export function rHangar() {
  const lista = $('#hangar');
  if (!lista) return;
  const frota = S.frota || FROTA_INICIAL;
  const hangar = normalizarHangar(S.hangar, frota);
  const voos = voosQueVoam();
  lista.innerHTML = hangar.map((r, i) => {
    const tipo = (frota.find(f => f.reg === r) || {}).tipo || '';
    const naEscala = voos.filter(o => o.r === r).length;
    const situacao = S.av[r] === false ? '<span class="tag fb">manutenção</span>'
      : naEscala ? `<span class="tag grp">${naEscala} ${naEscala === 1 ? 'voo' : 'voos'} nesta data</span>` : '';
    const botao = (acao, icone, rotulo, desligado) =>
      `<button class="x" data-act="hangar-${acao}" data-id="${esc(r)}" aria-label="${rotulo}" title="${rotulo}"${desligado ? ' disabled' : ''}><svg class="ico"><use href="#${icone}"/></svg></button>`;
    return `<li data-id="${esc(r)}">
        <span class="pos">${i + 1}º</span>
        <b>${esc(r)}</b> <small>${esc(tipo)}</small>
        ${situacao}
        <span class="acoes edit-only">
          ${botao('subir', 'i-cima', `Subir ${esc(r)}`, i === 0)}${botao('descer', 'i-baixo', `Descer ${esc(r)}`, i === hangar.length - 1)}${botao('frente', 'i-topo', `Pôr ${esc(r)} na frente do hangar`, i === 0)}
        </span>
      </li>`;
  }).join('');
}

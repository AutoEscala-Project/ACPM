// Horários de decolagem na aba Recursos (revisão de 14/11, decisão do Pedro: "Resumo + Editar"). Cada categoria mostra
// um resumo (o modelo, quantos horários e os horários da manhã e da tarde, com o da janela fechada nesta data apagado) e
// um botão "Editar". O editor abre na própria linha, com uma cópia da lista (o rascunho): o modelo, os horários com ✕,
// um campo em que Enter põe o horário e o efeito nos pedidos antes de salvar. Nada muda até "Salvar" (js/main.js);
// "Cancelar" e Esc descartam. O rascunho continua quando a tela é redesenhada por outra alteração.
import { WIN } from '../config.js';
import { S } from '../state.js';
import { $ } from '../dom.js';
import { hm, esc } from '../format.js';
import {
  CATEGORIAS_COM_HORARIOS, HORARIOS_PADRAO, DE_30_EM_30, PRIMEIRO_HORARIO, ULTIMO_HORARIO, periodoDoMinuto, paraMinuto,
  modeloDosHorarios, descreverHorarios, porPeriodo, impactoDosHorarios, resumoDoImpacto
} from '../horarios.js';

export const NOMES_DAS_CATEGORIAS = { C152: 'C152', C172: 'C172', sim: 'Simulador', 'PA-34': 'PA-34' };
const MODELOS = [['janelas', 'Janelas do dia'], ['de30', 'De 30 em 30 min'], ['personalizado', 'Personalizado']];
const PERIODOS = [['manha', 'Manhã'], ['tarde', 'Tarde']];

// O rascunho do editor aberto: { cat, lista, erro }, ou null
let rascunho = null;
export const editorDosHorariosAberto = () => Boolean(rascunho);
export const rascunhoDosHorarios = () => (rascunho ? { cat: rascunho.cat, lista: [...rascunho.lista] } : null);

const listaDe = cat => (S.horarios && S.horarios[cat]) || [];
const quantos = n => `${n} ${n === 1 ? 'horário' : 'horários'}`;
const janelaFechada = m => S.win && S.win[periodoDoMinuto(m)] === false;

// Os pedidos da demanda (os principais e as missões extras), com o nome do aluno
export const pedidosDaDemanda = () => (S.stu || []).flatMap(s => [{ nome: s.nm, pedido: s }, ...(s.extra || []).map(ex => ({ nome: s.nm, pedido: ex }))]);

function horarioNoResumo(m) {
  if (!janelaFechada(m)) return `<span class="hr">${hm(m)}</span>`;
  return `<span class="hr fechado" data-dica="horario-em-janela-fechada" data-dica-caso="A janela das ${WIN[periodoDoMinuto(m)]} está fechada nesta data.">${hm(m)}<span class="sr"> (janela fechada nesta data)</span></span>`;
}

function periodos(lista, celula) {
  const grupos = porPeriodo(lista);
  return `<div class="horarios-periodos">${PERIODOS.map(([id, rotulo]) => (grupos[id].length
    ? `<div class="horarios-periodo" data-periodo="${id}"><small>${rotulo}</small><span class="horarios-lista">${grupos[id].map(celula).join('')}</span></div>`
    : '')).join('')}</div>`;
}

function resumo(cat) {
  const nome = NOMES_DAS_CATEGORIAS[cat];
  const lista = listaDe(cat);
  return `<div class="horarios-cab">
      <b class="horarios-nome">${esc(nome)}</b>
      <span class="horarios-modelo">${esc(descreverHorarios(lista))}</span>
      <small class="horarios-qtd">${quantos(lista.length)}</small>
      <button type="button" class="btn quiet edit-only" data-act="editar-horarios" data-cat="${cat}" aria-expanded="false" aria-label="Editar os horários do ${esc(nome)}">Editar</button>
    </div>
    ${periodos(lista, horarioNoResumo)}`;
}

function editor(cat) {
  const nome = NOMES_DAS_CATEGORIAS[cat];
  const { lista, erro } = rascunho;
  const modelo = modeloDosHorarios(lista);
  const chip = m => `<span class="hr-chip">${hm(m)}<button type="button" data-act="rascunho-tirar" data-min="${m}" aria-label="Tirar ${hm(m)}"><svg class="ico" aria-hidden="true"><use href="#i-fechar"/></svg></button></span>`;
  return `<div class="horarios-cab">
      <b class="horarios-nome">${esc(nome)}</b>
      <button type="button" class="btn quiet edit-only" data-act="editar-horarios" data-cat="${cat}" aria-expanded="true" aria-label="Editar os horários do ${esc(nome)}" disabled>Editar</button>
    </div>
    <div class="horarios-editor" role="group" aria-label="Horários de decolagem do ${esc(nome)}">
      <fieldset class="horarios-modelos">
        <legend>Modelo</legend>
        ${MODELOS.map(([id, rotulo]) => `<label class="chk"><input type="radio" name="hr-modelo" value="${id}"${id === modelo ? ' checked' : ''}> ${rotulo}</label>`).join('')}
      </fieldset>
      ${periodos(lista, chip)}
      <div class="horarios-novo">
        <label>Novo horário <input type="time" class="hr-novo" step="300" min="${hm(PRIMEIRO_HORARIO)}" max="${hm(ULTIMO_HORARIO)}"></label>
        <button type="button" class="btn quiet" data-act="rascunho-por">Adicionar</button>
        <small class="h">Enter também adiciona. Das ${hm(PRIMEIRO_HORARIO)} às ${hm(ULTIMO_HORARIO)}.</small>
      </div>
      <p class="erro-campo" role="alert">${esc(erro || '')}</p>
      <p class="horarios-efeito" aria-live="polite">${esc(resumoDoImpacto(impactoDosHorarios(pedidosDaDemanda(), S.horarios, cat, lista)))}</p>
      <div class="horarios-botoes">
        <button type="button" class="btn" data-act="salvar-horarios">Salvar</button>
        <button type="button" class="btn quiet" data-act="cancelar-horarios">Cancelar</button>
      </div>
    </div>`;
}

export function rHorarios() {
  const caixa = $('#horarios');
  if (!caixa) return;
  // O foco no campo do horário novo continua depois de redesenhar (a lista muda a cada ✕ ou Enter)
  const comFoco = document.activeElement && document.activeElement.classList.contains('hr-novo');
  caixa.innerHTML = CATEGORIAS_COM_HORARIOS.map(cat =>
    `<div class="horarios-cat${rascunho && rascunho.cat === cat ? ' editando' : ''}" data-cat="${cat}">${rascunho && rascunho.cat === cat ? editor(cat) : resumo(cat)}</div>`).join('');
  if (comFoco && rascunho) caixa.querySelector('.hr-novo').focus();
}

export function abrirEditorDosHorarios(cat) {
  if (!CATEGORIAS_COM_HORARIOS.includes(cat)) return;
  rascunho = { cat, lista: [...listaDe(cat)], erro: '' };
  rHorarios();
  $('#horarios .hr-novo').focus();
}

// Fecha o editor (salvo ou descartado) e devolve o foco ao "Editar" da categoria
export function fecharEditorDosHorarios() {
  if (!rascunho) return;
  const { cat } = rascunho;
  rascunho = null;
  rHorarios();
  const botao = document.querySelector(`#horarios [data-act="editar-horarios"][data-cat="${cat}"]`);
  if (botao) botao.focus();
}

function mudar(lista, erro = '') {
  rascunho = { ...rascunho, lista, erro };
  rHorarios();
}

// As ações do rascunho: tirar um horário (✕), pôr o do campo (Adicionar ou Enter) e escolher o modelo
export function tirarDoRascunho(minuto) {
  if (!rascunho) return;
  if (rascunho.lista.length <= 1) mudar(rascunho.lista, 'Cada categoria precisa de pelo menos um horário.');
  else mudar(rascunho.lista.filter(m => m !== minuto));
  // O ✕ sumiu com o horário: o foco vai para o campo do horário novo
  $('#horarios .hr-novo').focus();
}

export function porNoRascunho() {
  if (!rascunho) return;
  const campo = $('#horarios .hr-novo');
  const minuto = paraMinuto(campo && campo.value);
  if (minuto === null || minuto < PRIMEIRO_HORARIO || minuto > ULTIMO_HORARIO) {
    mudar(rascunho.lista, `Escolha um horário entre ${hm(PRIMEIRO_HORARIO)} e ${hm(ULTIMO_HORARIO)}.`);
    $('#horarios .hr-novo').focus();
    return;
  }
  mudar([...new Set([...rascunho.lista, minuto])].sort((a, b) => a - b));
  $('#horarios .hr-novo').focus();
}

export function escolherModelo(modelo) {
  if (!rascunho) return;
  if (modelo === 'janelas') mudar([...HORARIOS_PADRAO]);
  else if (modelo === 'de30') mudar([...DE_30_EM_30]);
}

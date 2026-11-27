// "Horários fechados nesta data" (J, N11; Recursos › Disponibilidade do dia, no lugar das nove "Janelas de operação"): a
// lista dos intervalos fechados da data aberta ("12:40–17:30 · todos os recursos", com o ✕ que abre de novo) e "+ Fechar
// horários", que abre o formulário: De e Até (de 10 em 10 minutos, das 06:00 às 24:00), "O dia todo", as categorias
// (nenhuma marcada: todos os recursos) e a linha do que ele fecha. Nada é gravado antes de "Fechar" (js/eventos/fechamentos.js)
import { S, isGestor } from '../state.js';
import { $, trocarConteudo } from '../dom.js';
import { esc, hm } from '../format.js';
import { CATEGORIAS, categoriaDoTipo } from '../categorias.js';
import { fechamentosDoEstado, rotuloDosFechamentos, horarioAberto, normalizarFechamentos, MAXIMO_DE_FECHAMENTOS } from '../fechamentos.js';
import { horariosDaMissao, horariosDoTipo } from '../horarios.js';
import { GROUND_EQ_TYPE } from '../config.js';

const INICIO = 6 * 60, FIM = 24 * 60, PASSO = 10;
const MINUTOS = Array.from({ length: (FIM - INICIO) / PASSO + 1 }, (_, i) => INICIO + PASSO * i);

// O formulário aberto: { de, ate, categorias }, ou null
let form = null;
export const formularioAberto = () => form !== null;
export const formularioDosFechamentos = () => form;

export function abrirFormulario() { form = { de: 12 * 60 + 40, ate: 17 * 60 + 30, categorias: [] }; }
export function fecharFormulario() { form = null; }
export function mudarFormulario(mudanca) { if (form) form = { ...form, ...mudanca }; }

// Os horários de decolagem de cada categoria que o intervalo fecharia e que ainda estão abertos (a linha do formulário)
function oQueFecha({ de, ate, categorias }) {
  const atuais = fechamentosDoEstado(S);
  const cats = categorias.length ? CATEGORIAS.filter(c => categorias.includes(c.id)) : CATEGORIAS;
  return cats.map(c => {
    const lista = c.id === 'ground' ? horariosDoTipo(S.horarios, GROUND_EQ_TYPE) : horariosDaMissao(S.horarios, 'Voo Local', c.tipos[0]);
    return { c, n: lista.filter(m => m >= de && m < ate && horarioAberto(atuais, m, categoriaDoTipo(c.tipos[0]))).length };
  }).filter(x => x.n > 0);
}

const nomeNaFrase = c => (c.id === 'ground' ? `da ${c.nome}` : `do ${c.nome}`);
function fraseDoFormulario(f) {
  if (f.ate <= f.de) return 'O Até vem depois do De.';
  const partes = oQueFecha(f).map(({ c, n }, i) => (i === 0 ? `${n} ${n === 1 ? 'horário' : 'horários'} ${nomeNaFrase(c)}` : `${n} ${nomeNaFrase(c)}`));
  return partes.length ? `Fecha ${partes.join(', ')}.` : 'Nenhum horário de decolagem cai nesse intervalo.';
}
// O intervalo pode ser fechado: o Até depois do De, e a lista não passa do máximo
export const podeFechar = f => f.ate > f.de && normalizarFechamentos([...fechamentosDoEstado(S), { de: f.de, ate: f.ate, categorias: f.categorias }]).length <= MAXIMO_DE_FECHAMENTOS;

const opcoes = (lista, escolhido) => lista.map(m => `<option value="${m}"${m === escolhido ? ' selected' : ''}>${hm(m)}</option>`).join('');

function formulario() {
  const f = form;
  return `<form class="fechar-horarios" aria-label="Fechar horários nesta data">
    <div class="fch-campos">
      <label class="campo">De <select data-a="fch-de" id="fch-de">${opcoes(MINUTOS.slice(0, -1), f.de)}</select></label>
      <label class="campo">Até <select data-a="fch-ate" id="fch-ate">${opcoes(MINUTOS.slice(1), f.ate)}</select></label>
      <button type="button" class="btn sec" data-act="fch-dia-todo">O dia todo</button>
    </div>
    <fieldset class="fch-categorias"><legend>Recursos <small>(nenhum marcado: todos)</small></legend>
      ${CATEGORIAS.map(c => `<label class="chk"><input type="checkbox" data-a="fch-cat" data-cat="${c.id}"${f.categorias.includes(c.id) ? ' checked' : ''}> ${esc(c.nome)}</label>`).join('')}
    </fieldset>
    <p class="fch-efeito" role="status">${esc(f.ate > f.de && !podeFechar(f) ? `No máximo ${MAXIMO_DE_FECHAMENTOS} intervalos fechados por data.` : fraseDoFormulario(f))}</p>
    <div class="fch-acoes">
      <button type="button" class="btn" data-act="fch-fechar"${podeFechar(f) ? '' : ' disabled'}>Fechar</button>
      <button type="button" class="btn quiet" data-act="fch-cancelar">Cancelar</button>
    </div>
  </form>`;
}

export function rFechamentos() {
  const caixa = $('#fechamentos');
  if (!caixa) return;
  const lista = Array.isArray(S.fechamentos) ? S.fechamentos : fechamentosDoEstado(S);
  const rotulos = rotuloDosFechamentos(lista);
  const leitura = isGestor();
  trocarConteudo(caixa, `${rotulos.length
    ? `<ul class="fechamentos-lista">${rotulos.map((r, i) => `<li><span>${esc(r)}</span>${leitura ? '' : ` <button type="button" class="btn quiet edit-only" data-act="tirar-fechamento" data-i="${i}" aria-label="Abrir de novo ${esc(r)}">✕</button>`}</li>`).join('')}</ul>`
    : '<p class="h">Nenhum horário fechado nesta data.</p>'}
    ${leitura ? '' : `<button type="button" class="btn sec edit-only" data-act="fechar-horarios" aria-expanded="${formularioAberto()}">+ Fechar horários</button>`}
    ${form && !leitura ? formulario() : ''}`);
}

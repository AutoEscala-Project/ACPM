// Painel dos dados pessoais: nome completo, CPF, CANAC, nascimento, celular e e-mail de um instrutor, ao lado da tabela
// (até Instrutores virar lista e detalhe). Operadores, administradores e a secretaria veem (no modo local, fora do perfil
// Gestor); a secretaria lê em texto, sem "Salvar". Os dados ficam em js/views/dados-pessoais.js, fora do estado: nunca
// vão para o cadastro, o link compartilhado, o CSV, o PDF ou o BI.
import { CAMPOS_PESSOAIS, LIMITE_DO_NOME_COMPLETO, validarDadosPessoais, formatarCpf, formatarCelular, paraGravar } from '../dados-pessoais.js';
import { ApiClient } from '../storage.js';
import { insBy, stuBy, DATA } from '../state.js';
import { esc, hojeISO } from '../format.js';
import { $, abrirGaveta } from '../dom.js';
import { dadosDe, guardarDados, podeVerDadosPessoais, podeEditarDadosPessoais } from './dados-pessoais.js';
import { NOTA_DOS_DADOS } from './editor-de-dados-pessoais.js';

const pessoa = (tipo, id) => (tipo === 'aluno' ? stuBy(id) : insBy(id));

const VALOR = { cpf: formatarCpf, celular: formatarCelular };
const TIPOS = { nome_completo: ['text', '', ''], cpf: ['text', 'numeric', '000.000.000-00'], canac: ['text', 'numeric', '6 dígitos'], nascimento: ['date', '', ''], celular: ['tel', 'tel', '(37) 99999-9999'], email: ['email', 'email', 'nome@exemplo.com'] };

function campoHtml({ id, rotulo }, dados) {
  const [type, inputmode, placeholder] = TIPOS[id];
  const valor = VALOR[id] ? VALOR[id](dados[id]) : dados[id] || '';
  // Quem só lê (a secretaria): o texto
  if (!podeEditarDadosPessoais()) return `<div class="campo-dado"><span class="rotulo-dado" id="rotulo-${id}">${rotulo}</span><span class="valor-dado" aria-labelledby="rotulo-${id}">${esc(valor || '—')}</span></div>`;
  return `<div class="campo-dado">
      <label for="dado-${id}">${rotulo}</label>
      <input type="${type}" id="dado-${id}" name="${id}" value="${esc(valor)}"${inputmode ? ` inputmode="${inputmode}"` : ''}${placeholder ? ` placeholder="${placeholder}"` : ''}${id === 'nome_completo' ? ` maxlength="${LIMITE_DO_NOME_COMPLETO}"` : ''} autocomplete="off" aria-describedby="erro-${id}">
      <small class="erro-campo" id="erro-${id}" data-erro="${id}"></small>
    </div>`;
}

const quando = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// A leitura feita ao abrir o painel: a gravação leva de volta a versão lida (atualizado_em). Sem a leitura, o painel
// não deixa salvar (salvar a partir de dados velhos apagaria o que outra pessoa gravou)
let leitura = { pedido: 0, atualizadoEm: null, lida: false };

export async function abrirPainelDeDados(tipo, id, botao) {
  const p = pessoa(tipo, id);
  if (!p || !podeVerDadosPessoais()) return;
  const pedido = ++leitura.pedido;
  leitura = { pedido, atualizadoEm: null, lida: false };
  desenharPainel(tipo, id, botao, p, dadosDe(tipo, id) || {});
  // Por cima das outras gavetas abertas; redesenhado com os dados lidos, fica onde está
  abrirGaveta($('#painel-dados'));
  habilitarPainel(false, 'Lendo os dados…');
  let dados;
  try {
    dados = await ApiClient.lerDadosPessoais(tipo, id);
  } catch {
    if (pedido !== leitura.pedido) return;
    habilitarPainel(false, 'Não foi possível ler os dados pessoais. Feche e tente de novo.');
    return;
  }
  if (pedido !== leitura.pedido || $('#painel-dados').hidden) return;
  leitura = { pedido, atualizadoEm: dados.atualizado_em || null, lida: true };
  guardarDados(tipo, id, Object.keys(dados).length ? dados : null);
  desenharPainel(tipo, id, botao, p, dados);
  habilitarPainel(true, '');
  const primeiro = $('#dado-nome_completo') || $('#btn-cancelar-dados');
  if (primeiro) primeiro.focus();
}

function habilitarPainel(sim, mensagem) {
  document.querySelectorAll('#form-dados input, #form-dados button[type="submit"]').forEach(el => { el.disabled = !sim; });
  $('#dados-erro').textContent = mensagem;
}

function desenharPainel(tipo, id, botao, p, dados) {
  const painel = $('#painel-dados');
  const edita = podeEditarDadosPessoais();
  painel.dataset.tipo = tipo;
  painel.dataset.id = id;
  painel.dataset.botao = botao ? `[data-dados="${tipo}:${id}"]` : '';
  painel.innerHTML = `<div class="gaveta-cab">
      <h2 id="painel-dados-titulo">Dados pessoais <small>${esc(p.nm)}</small></h2>
      <button class="x" type="button" id="btn-fechar-dados" aria-label="Fechar o painel">✕</button>
    </div>
    <p class="h">${NOTA_DOS_DADOS}${edita ? '' : ' A secretaria consulta; quem altera são os operadores e os administradores.'}</p>
    <form id="form-dados" class="form-dados" novalidate>
      ${CAMPOS_PESSOAIS.map(c => campoHtml(c, dados)).join('')}
      <p class="erro-campo" id="dados-erro" role="alert"></p>
      <div class="dlg-acoes">
        <button type="button" class="btn sec" id="btn-cancelar-dados">${edita ? 'Cancelar' : 'Fechar'}</button>
        ${edita ? '<button type="submit" class="btn">Salvar</button>' : ''}
      </div>
      ${dados.atualizado_em ? `<p class="h">Atualizado em ${quando(dados.atualizado_em)}${dados.atualizado_por ? ` por ${esc(dados.atualizado_por)}` : ''}.</p>` : ''}
    </form>`;
}

export function fecharPainelDeDados(devolverFoco = false) {
  const painel = $('#painel-dados');
  if (painel.hidden) return;
  painel.hidden = true;
  const botao = painel.dataset.botao && document.querySelector(painel.dataset.botao);
  if (devolverFoco && botao) botao.focus();
}

const comoFrase = texto => (texto.charAt(0).toUpperCase() + texto.slice(1)).replace(/\.?$/, '.');

function mostrarErros(erros) {
  document.querySelectorAll('#form-dados [data-erro]').forEach(el => {
    el.textContent = erros[el.dataset.erro] || '';
    $(`#dado-${el.dataset.erro}`).setAttribute('aria-invalid', String(Boolean(erros[el.dataset.erro])));
  });
  const [primeiro] = Object.keys(erros);
  if (primeiro) $(`#dado-${primeiro}`).focus();
}

// Valida, grava e atualiza a tabela. Devolve o nome e os campos que mudaram (para o aviso e o histórico) ou null
export async function salvarPainelDeDados() {
  const painel = $('#painel-dados');
  const tipo = painel.dataset.tipo, id = +painel.dataset.id;
  const entrada = Object.fromEntries(CAMPOS_PESSOAIS.map(({ id: c }) => [c, $(`#dado-${c}`).value]));
  $('#dados-erro').textContent = '';
  const { dados, erros } = validarDadosPessoais(entrada, hojeISO());
  mostrarErros(erros);
  if (Object.keys(erros).length) return null;
  if (!leitura.lida || !podeEditarDadosPessoais()) return null;
  const data = DATA;
  let resposta;
  try {
    resposta = await ApiClient.salvarDadosPessoais(tipo, id, paraGravar(dados), { atualizadoEm: leitura.atualizadoEm, data });
  } catch (e) {
    if (e.campo) mostrarErros({ [e.campo]: comoFrase(e.message) });
    else if (e.code === 'PT409') $('#dados-erro').textContent = 'Outra pessoa alterou estes dados enquanto você editava. Feche e abra de novo para ver a versão atual.';
    else if (e.code === 'P0002') $('#dados-erro').textContent = 'Esta pessoa não está no cadastro gravado. Espere a alteração ser gravada e tente de novo.';
    else if (e.code === '42501') $('#dados-erro').textContent = 'A sua conta não pode alterar dados pessoais.';
    else $('#dados-erro').textContent = 'Não foi possível salvar. Verifique a conexão e tente de novo.';
    return null;
  }
  guardarDados(tipo, id, resposta.atualizado_em ? { ...dados, atualizado_em: resposta.atualizado_em, atualizado_por: resposta.atualizado_por || null } : null);
  leitura = { ...leitura, atualizadoEm: resposta.atualizado_em || null };
  // O histórico já foi registrado junto com a gravação (o servidor registra os campos que mudaram)
  return { nome: pessoa(tipo, id).nm, historico: resposta.historico || null, data };
}

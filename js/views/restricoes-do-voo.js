// A gaveta das restrições de um voo (G1, aside.gaveta#painel-restricoes): o que o motor lê para encaixar o pedido (a missão do
// curso, o tipo de recurso, o instrutor, a prioridade, o horário e a duração), aberta pelo "Restrições" do editor do voo
// (#dlg-voo), do item do trilho da missão que não entrou e do detalhe do pedido no Processamento (G2). As colunas da
// Demanda vieram para cá com os mesmos campos (data-f) e o mesmo dono (js/eventos/restricoes-do-voo.js); o voo tirado da
// escala tem aqui "Pôr de volta na escala" (G2). O voo já posto tem o
// lugar, o recurso e o INVA no editor do voo (F1g): aqui, só o pedido. O horário exato do pedido da agenda é mostrado, não
// editado (N14); o tipo e o horário contra as limitações do aluno ficam na lista, com o motivo, e escolhê-los avisa e pede a
// confirmação (o aviso numa linha role="status" ligada ao campo); o INVA de "Não escalar com" fica na lista, desligado.
// Quem só consulta lê o mesmo como texto
import { GROUND_EQ_TYPE, DURACAO_MAXIMA_H, GROUND_DURATION_H } from '../config.js';
import { esc, hm, fmtDurLabel, hojeISO } from '../format.js';
import { solicitacaoAprovada } from '../agenda.js';
import { podeVoltarAEscala, MOTIVO_PARA_NAO_VOLTAR } from '../processamento.js';
import { solicitacoesDaData } from '../solicitacoes-da-data.js';
import { isGroundMission, duracaoFixaDaMissao, prioridadeNaTela } from '../rules.js';
import { ligada } from '../funcionalidades.js';
import { horariosDaMissao } from '../horarios.js';
import { exigeDaMissaoDoPedido } from '../programa.js';
import { S, RES, DATA, isGestor, estadoDaEscala, programaLido, stuBy, getMissionTarget } from '../state.js';
import { chaveDoVoo } from '../voo.js';
import { nomeDoRecurso } from '../categorias.js';
import { rejeicoesDosPedidos } from '../rejeicoes.js';
import { opcoesDeTipoDoPedido, opcoesDeHorarioDoPedido, instrutoresDasRestricoes, horarioExatoDoPedido, pedidosDasRecusas } from '../restricoes.js';
import { missaoDoCursoNasRestricoes } from './etapas.js';
import { $, abrirGaveta, trocarConteudo, visivel } from '../dom.js';

// A gaveta aberta: o pedido (o aluno e a missão), a data e de onde ela abriu (o foco volta para lá). pendente: o tipo ou o
// horário contra as limitações, esperando a confirmação ({ campo, valor, aviso })
let aberta = null;
let pendente = null;

export const pendenteDasRestricoes = () => pendente;
export function marcarPendente(p) { pendente = p; }
// A gaveta aberta pela Escala (o editor do voo, o item do trilho), não pelo Processamento: na escala não aprovada, cada
// mudança dela pergunta antes de refazer (F1g, R6: #dlg-refazer)
export const perguntaAntesNaGaveta = () => Boolean(aberta && aberta.daEscala && !S.aprovacao);
// A gaveta aberta pelo Processamento (o "Restrições" do detalhe): a resposta de "Pôr de volta na escala" vai também para a
// linha de estado dele (N6)
export const abertaPeloProcessamento = () => Boolean(aberta && !aberta.daEscala);
// O foco na situação do voo, na gaveta redesenhada (o botão que a ação usou saiu com o desenho): o leitor de tela lê onde
// o voo ficou
export function focarNaSituacao() {
  const situacao = $('#painel-restricoes .restricoes-situacao');
  if (situacao && visivel(situacao)) situacao.focus();
}

const op = ({ valor, texto, desligada }, atual) => `<option value="${esc(valor)}"${String(valor) === String(atual) ? ' selected' : ''}${desligada ? ' disabled' : ''}>${esc(texto)}</option>`;
const dica = (nome, rotulo) => `<button type="button" class="dica-btn" data-dica="${nome}" aria-label="O que é ${esc(rotulo)}?" aria-expanded="false"></button>`;

// O voo do pedido na escala (a turma de Ground: o voo do aluno nela), a recusa dele ou nada
function situacaoDoPedido(stu, d, mid) {
  const fKey = chaveDoVoo(stu.id, mid);
  const voo = RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey && !o.trecho) : null;
  if (!d.fly) return foraDaEscala(stu, mid);
  if (voo) {
    const editar = isGestor() ? '' : ` <button type="button" class="btn quiet" data-act="editar-voo" data-fkey="${esc(voo.isGround && voo.classKey ? voo.classKey : voo.fKey)}" aria-haspopup="dialog">Editar o voo</button>`;
    return `<p class="restricoes-situacao" tabindex="-1"><b>Na escala: ${hm(voo.a)}–${hm(voo.b)}</b> · ${esc(nomeDoRecurso(voo.r))} · ${esc(voo.ins || '')}. `
      + `O que está aqui vale para o app encaixar o pedido; o lugar, o recurso e o INVA do voo mudam no editor do voo.${editar}</p>`;
  }
  const recusa = RES ? rejeicoesDosPedidos(estadoDaEscala(), RES).get(fKey) : null;
  return recusa ? `<p class="restricoes-situacao fora" tabindex="-1"><b>Fora da escala:</b> ${esc(recusa.m)}</p>` : '';
}

// O voo tirado da escala (G2): o app não lê as restrições; "Pôr de volta na escala" (quem edita), ou por que ele não volta
function foraDaEscala(stu, mid) {
  const pode = podeVoltarAEscala(S, solicitacoesDaData().lista, { stuId: stu.id, mid }, { aprovada: solicitacaoAprovada, data: DATA, hoje: hojeISO() });
  const volta = isGestor() ? '' : pode.ok
    ? ` <button type="button" class="btn quiet" data-act="por-de-volta" data-id="${esc(stu.id)}" data-mid="${esc(mid)}" aria-label="Pôr de volta na escala: ${esc(stu.nm)}">Pôr de volta na escala</button>`
    : ` ${esc(MOTIVO_PARA_NAO_VOLTAR[pode.motivo])}`;
  return `<p class="restricoes-situacao" tabindex="-1">Fora da escala nesta data (tirado da escala): o app não lê estas restrições.${volta}</p>`;
}

// O horário: o exato do pedido da agenda, mostrado (muda em Pedidos ou no editor do voo, N14); senão, as preferências
function campoDoHorario(stu, d, { leitura, horarios, valorDe, ligado }) {
  const exato = horarioExatoDoPedido(d);
  if (exato) {
    return `<div class="campo restricao-horario"><span class="rotulo-campo">Horário</span><b>${esc(exato.texto)}</b>`
      + '<small class="h">O horário do pedido da agenda: o app só o escala nele. Ele muda em Pedidos (cancele e registre de novo) ou no editor do voo, movendo o voo.</small></div>';
  }
  const preferencia = (f, rotulo, comDica) => {
    if (leitura) return `<div class="campo"><span class="rotulo-campo">${rotulo}</span><b>${d[f] >= 0 ? hm(d[f]) : '—'}</b></div>`;
    const valor = valorDe(f);
    return `<div class="campo"><span class="rotulo-campo">${rotulo}${comDica ? dica('preferencias', rotulo) : ''}</span><select data-f="${f}" aria-label="${rotulo} de ${esc(stu.nm)}"${ligado(f)}>`
      + `${opcoesDeHorarioDoPedido(stu, d, valor, horarios, DATA).map(o => op(o, valor)).join('')}</select></div>`;
  };
  return `<div class="campo-duplo">${preferencia('p1', '1ª preferência', true)}${preferencia('p2', '2ª preferência', false)}</div>`;
}

function campoDaDuracao(stu, d, { leitura, isGnd }) {
  const fixa = isGnd ? 'Ground School tem duração fixa de 01h30' : d.mis === 'Noturno' ? '1 h de translado para BH e 3 h de noturno em BH; a volta, 1 h, no dia seguinte às 07:30' : '';
  if (leitura) return `<div class="campo"><span class="rotulo-campo">Duração</span><b>${esc(fmtDurLabel(isGnd ? GROUND_DURATION_H : d.nb))}</b></div>`;
  if (fixa) {
    const horas = isGnd ? GROUND_DURATION_H : duracaoFixaDaMissao('Noturno');
    return `<div class="campo"><span class="rotulo-campo">Duração${dica('duracao', 'Duração')}</span><select data-f="nb" disabled title="${esc(fixa)}" aria-label="Duração de ${esc(stu.nm)}"><option value="${horas}" selected>${isGnd ? '1h30' : '4 h'}</option></select><small class="h">${esc(fixa)}.</small></div>`;
  }
  return `<div class="campo"><span class="rotulo-campo">Duração (h)${dica('duracao', 'Duração')}</span><input type="number" class="duracao" data-f="nb" min="0.1" max="${DURACAO_MAXIMA_H}" step="0.1" inputmode="decimal" value="${esc(d.nb)}" aria-label="Duração de ${esc(stu.nm)}, em horas"></div>`;
}

function corpoDasRestricoes(stu, d, mid) {
  const leitura = isGestor();
  const isGnd = isGroundMission(d.mis);
  const tipo = isGnd ? GROUND_EQ_TYPE : d.eq;
  const horarios = horariosDaMissao(S.horarios, d.mis, tipo);
  const espera = pendente && aberta && pendente.stuId === stu.id && pendente.mid === mid ? pendente : null;
  const valorDe = f => (espera && espera.campo === f ? (f === 'eq' ? espera.valor : Number(espera.valor)) : d[f]);
  const ligado = f => (espera && espera.campo === f ? ' aria-describedby="restricoes-avisos" aria-invalid="true"' : '');
  const estado = estadoDaEscala();
  const comExige = { ...d, exige: exigeDaMissaoDoPedido(programaLido(), d, stu) };
  const instrutores = instrutoresDasRestricoes(estado, stu, comExige);
  const partes = [];
  const curso = ligada('progresso') ? missaoDoCursoNasRestricoes(stu, d, mid, { leitura }) : '';
  if (curso) partes.push(curso);
  if (leitura) {
    const nomeDoInstrutor = (instrutores.find(o => o.valor === (d.insId || '')) || instrutores[0]).texto;
    partes.push(`<div class="campo"><span class="rotulo-campo">Tipo de recurso</span><b>${esc(tipo)}</b></div>`,
      `<div class="campo"><span class="rotulo-campo">Instrutor</span><b>${esc(nomeDoInstrutor)}</b></div>`,
      ligada('prioridade') ? `<div class="campo"><span class="rotulo-campo">Prioridade</span><b>${prioridadeNaTela(d.pr)}</b></div>` : '');
  } else {
    const valorDoTipo = valorDe('eq');
    partes.push(`<label class="campo">Tipo de recurso<select data-f="eq"${isGnd ? ' disabled' : ''} aria-label="Tipo de recurso de ${esc(stu.nm)}"${ligado('eq')}>`
      + `${opcoesDeTipoDoPedido(stu, d, DATA).map(o => op(o, valorDoTipo)).join('')}</select></label>`);
    partes.push(`<div class="campo"><span class="rotulo-campo">Instrutor${dica('instrutor-escolhido', 'Instrutor')}</span><select data-f="insId" class="${d.insId ? 'escolhido' : ''}" aria-label="Instrutor de ${esc(stu.nm)}">`
      + `${instrutores.map(o => op(o, d.insId || '')).join('')}</select></div>`);
    if (ligada('prioridade')) {
      partes.push(`<div class="campo"><span class="rotulo-campo">Prioridade${dica('prioridade', 'Prioridade')}</span><select data-f="pr" class="${d.pr === 5 ? 'prioridade-mais-alta' : ''}" aria-label="Prioridade de ${esc(stu.nm)}">`
        + `${[1, 2, 3, 4, 5].map(n => op({ valor: n, texto: String(n) }, prioridadeNaTela(d.pr))).join('')}</select></div>`);
    }
  }
  partes.push(campoDoHorario(stu, d, { leitura, horarios, valorDe, ligado }), campoDaDuracao(stu, d, { leitura, isGnd }));
  // O aviso das limitações e a confirmação (o primeiro botão grava; o outro volta como estava)
  const atual = espera ? (espera.campo === 'eq' ? d.eq : d[espera.campo] >= 0 ? hm(d[espera.campo]) : '—') : '';
  const novo = espera ? (espera.campo === 'eq' ? espera.valor : hm(Number(espera.valor))) : '';
  partes.push(`<p class="restricoes-aviso" id="restricoes-avisos" role="status">${espera ? esc(espera.aviso) : ''}</p>`);
  if (espera) {
    partes.push(`<div class="restricoes-confirmar"><button type="button" class="btn" data-act="confirmar-restricao">Usar ${esc(novo)} mesmo assim</button>`
      + `<button type="button" class="btn sec" data-act="desistir-restricao">Manter ${esc(atual)}</button></div>`);
  }
  return partes.filter(Boolean).join('');
}

// Desenha a gaveta aberta com o pedido de agora (o foco fica no mesmo campo); sem o pedido, ou em outra data, ela fecha
export function desenharRestricoes() {
  if (!aberta) return;
  const painel = $('#painel-restricoes');
  const stu = stuBy(aberta.stuId), d = stu ? getMissionTarget(aberta.stuId, aberta.mid) : null;
  if (!d || aberta.data !== DATA) { fecharRestricoes({ devolverFoco: false }); return; }
  const isGnd = isGroundMission(d.mis);
  const resumo = [d.mis, isGnd ? GROUND_EQ_TYPE : d.eq, fmtDurLabel(isGnd ? GROUND_DURATION_H : d.nb), d.etapa || ''].filter(Boolean).map(esc).join(' · ');
  const cabeca = `<div class="gaveta-cab">
      <div class="restricoes-titulo"><h2 id="painel-restricoes-titulo">Restrições <small>${esc(stu.nm)}</small></h2>${dica('restricoes-do-voo', 'Restrições')}</div>
      <button class="x" type="button" id="btn-fechar-restricoes" aria-label="Fechar as restrições">✕</button>
    </div>
    <p class="h">${resumo}${aberta.mid ? ' (missão extra)' : ''}</p>
    <p class="h">O que o app lê para encaixar o pedido na escala${isGestor() ? '' : `: cada mudança refaz a escala em volta dos voos fixos${perguntaAntesNaGaveta() ? ', depois da pergunta' : ''}`}.</p>`;
  const corpo = `${situacaoDoPedido(stu, d, aberta.mid)}<div class="restricoes-campos" data-k="d" data-id="${esc(stu.id)}" data-mid="${esc(aberta.mid)}">${corpoDasRestricoes(stu, d, aberta.mid)}</div>`;
  if (!painel.querySelector('.restricoes-corpo')) painel.innerHTML = `<div class="restricoes-cab"></div><div class="restricoes-corpo"></div>`;
  trocarConteudo(painel.querySelector('.restricoes-cab'), cabeca);
  trocarConteudo(painel.querySelector('.restricoes-corpo'), corpo);
}

// Abre a gaveta do pedido (o aluno e a missão) por cima das outras, com o foco no primeiro controle (as dicas "?" não
// contam). origem: o elemento de
// onde ela abriu (o foco volta para ele). Sem o pedido, nada
export function abrirRestricoes(stuId, mid, { origem = null } = {}) {
  if (!getMissionTarget(stuId, mid)) return false;
  if (!aberta || aberta.stuId !== stuId || aberta.mid !== mid) pendente = null;
  aberta = { stuId, mid, data: DATA, origem, daEscala: !(origem && origem.closest && origem.closest('#s-proc')) };
  const painel = $('#painel-restricoes');
  painel.innerHTML = '';
  desenharRestricoes();
  abrirGaveta(painel);
  const primeiro = [...painel.querySelectorAll('.restricoes-campos select:not(:disabled), .restricoes-campos input:not(:disabled), .restricoes-campos button:not(.dica-btn)')].find(visivel)
    || $('#btn-fechar-restricoes');
  primeiro.focus();
  return true;
}

// Fecha a gaveta (o que espera a confirmação não é gravado; o Esc é desistir: o campo digitado e ainda não gravado volta
// ao gravado antes de perder o foco, para não gravar ao sair). devolverFoco: para o elemento de onde ela abriu, quando ele
// ainda está à vista; redesenhado, para o equivalente (o "Restrições" do mesmo pedido, o "Editar" ou a barra do mesmo
// voo, na turma o do mesmo aluno); sem ele (o item do trilho que saiu porque o pedido entrou, o voo que saiu da escala),
// para o voo do pedido na Escala, ou para o trilho, sempre à vista (linha-fix-escala-sem-caixas: o topo não tem mais o
// botão da data): o "Restrições" do item do pedido que não entrou, o botão dos avisos ou o do alto do trilho
export function fecharRestricoes({ devolverFoco = true } = {}) {
  const painel = $('#painel-restricoes');
  if (!painel || painel.hidden) { aberta = null; pendente = null; return; }
  const { origem, stuId, mid } = aberta || {};
  aberta = null;
  pendente = null;
  const digitado = document.activeElement;
  if (digitado && painel.contains(digitado) && digitado.matches('input:not([type="checkbox"]):not([type="radio"])')) digitado.value = digitado.defaultValue;
  painel.hidden = true;
  if (!devolverFoco || !origem) return;
  const alvo = (origem.isConnected && visivel(origem) ? origem : null)
    || equivalente(seletorDaOrigem(origem, stuId, mid), origem.getAttribute('aria-label'))
    || vooDoPedidoNaEscala(stuId, mid)
    || noTrilho(stuId, mid);
  if (alvo) alvo.focus();
}
// O lugar do pedido no trilho: o "Restrições" do item da missão que não entrou; com os avisos recolhidos, o botão deles
// (o título dos avisos); com o calendário recolhido, o botão do alto do trilho
function noTrilho(stuId, mid) {
  return [`#avisos-da-data [data-act="restricoes"][data-id="${stuId}"][data-mid="${mid}"]`, '#btn-avisos', '#btn-recolher-trilho']
    .map(s => $(s)).find(b => b && visivel(b)) || null;
}
// O primeiro elemento à vista do seletor, fora da gaveta e dos diálogos; com o nome dado, o que tem o mesmo nome antes
function equivalente(seletor, nome) {
  const achados = seletor ? [...document.querySelectorAll(seletor)].filter(b => visivel(b) && !b.closest('#painel-restricoes, dialog')) : [];
  return achados.find(b => nome && b.getAttribute('aria-label') === nome) || achados[0] || null;
}
// O equivalente da origem redesenhada: o "Restrições" do pedido, o "Editar" do voo na Lista ou a barra dele no mapa
function seletorDaOrigem(origem, stuId, mid) {
  if (origem.matches('[data-act="restricoes"]')) return `[data-act="restricoes"][data-id="${stuId}"][data-mid="${mid}"]`;
  if (origem.matches('[data-act="editar-voo"][data-fkey]')) return `#out [data-act="editar-voo"][data-fkey="${CSS.escape(origem.dataset.fkey)}"]`;
  if (origem.matches('.tl-bar[data-pop]')) return `#out .tl-bar[data-pop="${CSS.escape(origem.dataset.pop)}"]`;
  return null;
}
// O voo do pedido na Escala: o "Editar" dele na Lista ou a barra no mapa (a turma de Ground pela chave dela; o "Editar" do
// aluno antes); fora da escala, nada
function vooDoPedidoNaEscala(stuId, mid) {
  const fKey = chaveDoVoo(stuId, mid);
  const voo = RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey && !o.trecho) : null;
  if (!voo) return null;
  const chave = CSS.escape(voo.isGround && voo.classKey ? voo.classKey : voo.fKey);
  const achados = [...document.querySelectorAll(`#out [data-act="editar-voo"][data-fkey="${chave}"], #out .tl-bar[data-pop="${chave}"]`)].filter(visivel);
  return achados.find(b => (b.getAttribute('aria-label') || '').endsWith(`(${voo.s})`)) || achados[0] || null;
}

// As recusas da escala da tela com o pedido de cada uma (o item do trilho da missão que não entrou leva às restrições
// dele): o alerta → { fKey, stuId, mid }. Sem recusa, nada é calculado
export function pedidosDasRecusasDaTela() {
  if (!RES || !(RES.al || []).some(a => a.t === 'err')) return new Map();
  return pedidosDasRecusas(estadoDaEscala(), RES);
}

// O "Restrições" de cada item do trilho que tem o pedido (avisosDaData, restricoes): ao lado das ações dele, quando o item
// as tem (.aviso-acoes, linha-fix-escala-sem-caixas), ou embaixo do item
export function acrescentarRestricoesNosAvisos(lista, avisos) {
  for (const a of avisos) {
    if (!a.restricoes) continue;
    const item = [...lista.querySelectorAll('[data-aviso]')].find(el => el.dataset.aviso === a.id);
    const li = item && item.closest('li');
    if (!li || li.querySelector('[data-act="restricoes"]')) continue;
    const botao = `<button type="button" class="btn quiet" data-act="restricoes" data-id="${esc(a.restricoes.stuId)}" data-mid="${esc(a.restricoes.mid)}" title="O que o app lê para encaixar este pedido" aria-label="${esc(`Restrições: ${a.titulo}`)}">Restrições</button>`;
    const acoes = li.querySelector('.aviso-acoes');
    if (acoes) acoes.insertAdjacentHTML('beforeend', botao);
    else li.insertAdjacentHTML('beforeend', `<div class="aviso-restricoes">${botao}</div>`);
  }
}

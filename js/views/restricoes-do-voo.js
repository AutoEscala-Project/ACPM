// A gaveta das restrições de um voo (G1, aside.gaveta#painel-restricoes): o que o motor lê para encaixar o pedido (a missão do
// curso, o tipo de recurso, o instrutor, a prioridade, o horário e a duração), aberta pelo "Restrições" do editor do voo
// (#dlg-voo), do item do trilho da missão que não entrou e da linha do pedido na Demanda (até o G2). As colunas da Demanda
// vieram para cá com os mesmos campos (data-f) e o mesmo dono (js/eventos/restricoes-do-voo.js). O voo já posto tem o
// lugar, o recurso e o INVA no editor do voo (F1g): aqui, só o pedido. O horário exato do pedido da agenda é mostrado, não
// editado (N14); o tipo e o horário contra as limitações do aluno ficam na lista, com o motivo, e escolhê-los avisa e pede a
// confirmação (o aviso numa linha role="status" ligada ao campo); o INVA de "Não escalar com" fica na lista, desligado.
// Quem só consulta lê o mesmo como texto
import { GROUND_EQ_TYPE, DURACAO_MAXIMA_H, GROUND_DURATION_H } from '../config.js';
import { esc, hm, fmtDurLabel } from '../format.js';
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

const op = ({ valor, texto, desligada }, atual) => `<option value="${esc(valor)}"${String(valor) === String(atual) ? ' selected' : ''}${desligada ? ' disabled' : ''}>${esc(texto)}</option>`;
const dica = (nome, rotulo) => `<button type="button" class="dica-btn" data-dica="${nome}" aria-label="O que é ${esc(rotulo)}?" aria-expanded="false"></button>`;

// O voo do pedido na escala (a turma de Ground: o voo do aluno nela), a recusa dele ou nada
function situacaoDoPedido(stu, d, mid) {
  const fKey = chaveDoVoo(stu.id, mid);
  const voo = RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey && !o.trecho) : null;
  if (!d.fly) return '<p class="restricoes-situacao">Não voa nesta data (o Voa da Demanda está desligado): o app não lê estas restrições.</p>';
  if (voo) {
    const editar = isGestor() ? '' : ` <button type="button" class="btn quiet" data-act="editar-voo" data-fkey="${esc(voo.isGround && voo.classKey ? voo.classKey : voo.fKey)}" aria-haspopup="dialog">Editar o voo</button>`;
    return `<p class="restricoes-situacao"><b>Na escala: ${hm(voo.a)}–${hm(voo.b)}</b> · ${esc(nomeDoRecurso(voo.r))} · ${esc(voo.ins || '')}. `
      + `O que está aqui vale para o app encaixar o pedido; o lugar, o recurso e o INVA do voo mudam no editor do voo.${editar}</p>`;
  }
  const recusa = RES ? rejeicoesDosPedidos(estadoDaEscala(), RES).get(fKey) : null;
  return recusa ? `<p class="restricoes-situacao fora"><b>Fora da escala:</b> ${esc(recusa.m)}</p>` : '';
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
    return `<label class="campo">${rotulo}${comDica ? dica('preferencias', rotulo) : ''}<select data-f="${f}" aria-label="${rotulo} de ${esc(stu.nm)}"${ligado(f)}>`
      + `${opcoesDeHorarioDoPedido(stu, d, valor, horarios, DATA).map(o => op(o, valor)).join('')}</select></label>`;
  };
  return `<div class="campo-duplo">${preferencia('p1', '1ª preferência', true)}${preferencia('p2', '2ª preferência', false)}</div>`;
}

function campoDaDuracao(stu, d, { leitura, isGnd }) {
  const fixa = isGnd ? 'Ground School tem duração fixa de 01h30' : d.mis === 'Noturno' ? '1 h de translado para BH e 3 h de noturno em BH; a volta, 1 h, no dia seguinte às 07:30' : '';
  if (leitura) return `<div class="campo"><span class="rotulo-campo">Duração</span><b>${esc(fmtDurLabel(isGnd ? GROUND_DURATION_H : d.nb))}</b></div>`;
  if (fixa) {
    const horas = isGnd ? GROUND_DURATION_H : duracaoFixaDaMissao('Noturno');
    return `<label class="campo">Duração${dica('duracao', 'Duração')}<select data-f="nb" disabled title="${esc(fixa)}" aria-label="Duração de ${esc(stu.nm)}"><option value="${horas}" selected>${isGnd ? '1h30' : '4 h'}</option></select><small class="h">${esc(fixa)}.</small></label>`;
  }
  return `<label class="campo">Duração (h)${dica('duracao', 'Duração')}<input type="number" class="duracao" data-f="nb" min="0.1" max="${DURACAO_MAXIMA_H}" step="0.1" inputmode="decimal" value="${esc(d.nb)}" aria-label="Duração de ${esc(stu.nm)}, em horas"></label>`;
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
    partes.push(`<label class="campo">Instrutor${dica('instrutor-escolhido', 'Instrutor')}<select data-f="insId" class="${d.insId ? 'escolhido' : ''}" aria-label="Instrutor de ${esc(stu.nm)}">`
      + `${instrutores.map(o => op(o, d.insId || '')).join('')}</select></label>`);
    if (ligada('prioridade')) {
      partes.push(`<label class="campo">Prioridade${dica('prioridade', 'Prioridade')}<select data-f="pr" class="${d.pr === 5 ? 'prioridade-mais-alta' : ''}" aria-label="Prioridade de ${esc(stu.nm)}">`
        + `${[1, 2, 3, 4, 5].map(n => op({ valor: n, texto: String(n) }, prioridadeNaTela(d.pr))).join('')}</select></label>`);
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
      <h2 id="painel-restricoes-titulo">Restrições <small>${esc(stu.nm)}</small>${dica('restricoes-do-voo', 'Restrições')}</h2>
      <button class="x" type="button" id="btn-fechar-restricoes" aria-label="Fechar as restrições">✕</button>
    </div>
    <p class="h">${resumo}${aberta.mid ? ' (missão extra)' : ''}</p>
    <p class="h">O que o app lê para encaixar o pedido na escala${isGestor() ? '' : ': cada mudança refaz a escala em volta dos voos fixos'}.</p>`;
  const corpo = `${situacaoDoPedido(stu, d, aberta.mid)}<div class="restricoes-campos" data-k="d" data-id="${esc(stu.id)}" data-mid="${esc(aberta.mid)}">${corpoDasRestricoes(stu, d, aberta.mid)}</div>`;
  if (!painel.querySelector('.restricoes-corpo')) painel.innerHTML = `<div class="restricoes-cab"></div><div class="restricoes-corpo"></div>`;
  trocarConteudo(painel.querySelector('.restricoes-cab'), cabeca);
  trocarConteudo(painel.querySelector('.restricoes-corpo'), corpo);
}

// Abre a gaveta do pedido (o aluno e a missão) por cima das outras, com o foco no primeiro campo. origem: o elemento de
// onde ela abriu (o foco volta para ele). Sem o pedido, nada
export function abrirRestricoes(stuId, mid, { origem = null } = {}) {
  if (!getMissionTarget(stuId, mid)) return false;
  if (!aberta || aberta.stuId !== stuId || aberta.mid !== mid) pendente = null;
  aberta = { stuId, mid, data: DATA, origem };
  const painel = $('#painel-restricoes');
  painel.innerHTML = '';
  desenharRestricoes();
  abrirGaveta(painel);
  const primeiro = [...painel.querySelectorAll('.restricoes-campos select:not(:disabled), .restricoes-campos input:not(:disabled), .restricoes-campos button')].find(visivel)
    || $('#btn-fechar-restricoes');
  primeiro.focus();
  return true;
}

// Fecha a gaveta (o que espera a confirmação não é gravado). devolverFoco: para o elemento de onde ela abriu, quando ele
// ainda está à vista; redesenhado (a linha da Demanda, o item do trilho), para o "Restrições" do mesmo pedido
export function fecharRestricoes({ devolverFoco = true } = {}) {
  const painel = $('#painel-restricoes');
  if (!painel || painel.hidden) { aberta = null; pendente = null; return; }
  const { origem, stuId, mid } = aberta || {};
  aberta = null;
  pendente = null;
  painel.hidden = true;
  if (!devolverFoco || !origem) return;
  const alvo = origem.isConnected && visivel(origem) ? origem
    : [...document.querySelectorAll(seletorDaOrigem(origem, stuId, mid) || ':not(*)')].find(b => visivel(b) && !b.closest('#painel-restricoes, dialog'));
  if (alvo) alvo.focus();
}
// O equivalente da origem redesenhada: o "Restrições" do pedido, o "Editar" do voo na Lista ou a barra dele no mapa
function seletorDaOrigem(origem, stuId, mid) {
  if (origem.matches('[data-act="restricoes"]')) return `[data-act="restricoes"][data-id="${stuId}"][data-mid="${mid}"]`;
  if (origem.matches('[data-act="editar-voo"][data-fkey]')) return `#out [data-act="editar-voo"][data-fkey="${CSS.escape(origem.dataset.fkey)}"]`;
  if (origem.matches('.tl-bar[data-pop]')) return `#out .tl-bar[data-pop="${CSS.escape(origem.dataset.pop)}"]`;
  return null;
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

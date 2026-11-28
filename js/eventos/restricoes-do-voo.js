// As restrições de um voo (G1): a gaveta aside#painel-restricoes (js/views/restricoes-do-voo.js), aberta pelo "Restrições"
// do editor do voo, do item do trilho da missão que não entrou e da linha do pedido na Demanda, e os campos de cada pedido,
// que vieram da Demanda com o mesmo dono: o tipo de recurso, o instrutor, a prioridade, as preferências e a duração (e,
// até o G2, o Voa e a missão da linha da Demanda), a missão do curso ("Usar a do programa", "Trocar…", com as mesmas
// confirmações armadas), o "✕" da Escala e a reversão do Voa (setFly). Cada mudança grava uma alteração (gravarAlteracao),
// e o motor refaz a escala em volta dos voos fixos, como na Demanda; o tipo e o horário contra as limitações do aluno
// avisam e esperam a confirmação, sem gravar nada antes
import { gravarAlteracao, fotoDaEscalaTravada, gravarNaEscala } from '../actions.js';
import { $, showToast, trocarElemento, gavetaDoEsc, algumDialogoAberto } from '../dom.js';
import { motivoParaNaoVoltarAVoar } from '../reversoes.js';
import { fixarNoLugar } from '../fixos.js';
import { fmtDurLabel } from '../format.js';
import { ligada } from '../funcionalidades.js';
import { horariosDaMissao, ajustarPreferencias } from '../horarios.js';
import { normalizeMissionFields } from '../rules.js';
import { S, RES, DATA, stuBy, insBy, getMissionTarget } from '../state.js';
import { chaveDoVoo } from '../voo.js';
import { escolherInstrutor } from '../instrutor-escolhido.js';
import { aplicarRestricao, avisoDaRestricao, fixosSemOAgendadoQueMudou } from '../restricoes.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { singleDemandRowHTML, cnt, conferirNenhumNaDemanda } from '../views/demanda.js';
import { proximaDoPedido, outraMissaoDoPedido, botaoForaDaOrdem, confirmacaoDaMissao } from '../views/etapas.js';
import {
  abrirRestricoes, fecharRestricoes, desenharRestricoes, pendenteDasRestricoes, marcarPendente
} from '../views/restricoes-do-voo.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { perguntarAntesDeRefazer } from '../views/dialogo-refazer.js';

// O desenho da gaveta (js/redesenho.js): com a escala refeita, os dados lidos de novo e o perfil, o pedido de agora
registrarDesenho('restricoes-do-voo', desenharRestricoes, { em: ['dados', 'consulta', 'releitura', 'escala', 'perfil'], ordem: 81 });

// "Restrições": abre a gaveta do pedido (o aluno e a missão do botão). Quem só consulta também (ela mostra o texto). Do
// editor do voo, que fecha antes (js/eventos/edicao-do-voo.js) e devolve o foco à barra ou ao "Editar", o foco volta para lá
aoAcionar('restricoes', (b, { id, mid }) => {
  const doEditor = Boolean(b.closest('#dlg-voo'));
  abrirRestricoes(id, mid, { origem: doEditor ? document.activeElement : b });
}, { confereAPermissao: true });

$('#painel-restricoes').addEventListener('click', e => {
  if (e.target.closest('#btn-fechar-restricoes')) fecharRestricoes();
});
// O Esc fecha a gaveta quando ela é a de cima ou tem o foco (js/dom.js); com um diálogo aberto por cima, só o diálogo
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-restricoes') && !algumDialogoAberto()) fecharRestricoes();
});

// A linha do pedido na Demanda (quando ela está na página) acompanha o pedido
function atualizarLinhaDaDemanda(s, target, mid) {
  const linha = document.querySelector(`#dem tr[data-k="d"][data-id="${s.id}"][data-mid="${mid}"]`);
  if (linha) trocarElemento(linha, singleDemandRowHTML(s, target, mid));
}
// Depois de uma mudança no pedido: a linha da Demanda, a contagem e o Histórico (a gaveta, pelo desenho da escala)
function depoisDeMudar(s, target, mid) {
  atualizarLinhaDaDemanda(s, target, mid);
  conferirNenhumNaDemanda();
  cnt();
  redesenharPorNome('historico');
}

// O voo agendado do pedido deixa de ser fixo só com outra missão, outro tipo ou outras horas (fixosSemOAgendadoQueMudou):
// o que o histórico diz
function soltarSeMudou(s, mid, antes, target) {
  const fKey = chaveDoVoo(s.id, mid);
  const fixos = fixosSemOAgendadoQueMudou(S, fKey, antes, target);
  if (fixos === S.fixos) return '';
  S.fixos = fixos;
  return S.fixos[fKey] ? '' : ' (deixa de ser fixo)';
}
const doVoo = d => ({ mis: d.mis, eq: d.eq, nb: d.nb });

// A missão do curso no pedido: ele vira a missão do programa (tipo, recurso e horas; a duração fixa da missão vale mais),
// com o código e o curso dela, e o aluno voa; o instrutor escolhido continua. Devolve o que o histórico diz do voo
// agendado do pedido (que deixa de ser fixo quando a missão, o tipo ou as horas mudam)
function usarMissaoDoCurso(s, target, mid, { codigo, curso, mis, eq, nb }) {
  const antes = doVoo(target);
  // A confirmação do 7º voo local (Q8) foi dada na Agenda para a missão e o recurso de antes: com outros, ela não vale
  if (target.etapa !== codigo || target.cursoDaEtapa !== curso || target.mis !== mis || target.eq !== eq) delete target.limiteConfirmado;
  Object.assign(target, { fly: true, mis, eq, nb, etapa: codigo, cursoDaEtapa: curso });
  // A missão que o operador usou não é a que o programa deu na entrada do pedido (formato 30)
  delete target.etapaDoPrograma;
  ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
  normalizeMissionFields(target);
  return soltarSeMudou(s, mid, antes, target);
}
// O pedido como ficou, para o histórico
const missaoDoPedido = d => `${d.mis} · ${d.eq} · ${fmtDurLabel(d.nb)}`;
// O curso encerrado no histórico (a missão foi confirmada assim)
const comOCursoEncerrado = (encerrado, sigla) => (encerrado ? `, com o curso ${sigla} encerrado` : '');

// "Usar a do programa": a próxima missão do curso no pedido (tipo, recurso e horas do programa), e o aluno voa. No curso
// encerrado, o primeiro acionamento arma o botão e o segundo confirma (como no agendamento, desenho §4.9), e o histórico
// diz que o curso estava encerrado. Com o progresso desligado (js/funcionalidades.js), nada acontece
aoAcionar('usar-proxima', (b, { id, mid }) => {
  if (!ligada('progresso')) return;
  const s = stuBy(id), target = getMissionTarget(id, mid);
  const m = s && target ? proximaDoPedido(s, mid) : null;
  if (!m) return;
  if (m.encerrado && !confirmado(b, `Confirmar: ${m.id} do curso encerrado`)) return;
  const solto = usarMissaoDoCurso(s, target, mid, { ...m, codigo: m.id });
  gravarAlteracao('inc', `${s.nm}: ${m.id} na demanda (${missaoDoPedido(target)})${comOCursoEncerrado(m.encerrado, m.curso)}${solto}`);
  depoisDeMudar(s, target, mid);
});

// "Trocar…" (as outras missões do curso): a liberada vale na hora, como "Usar a do programa". A fora da ordem (a missão
// bloqueada pelo programa, a já aprovada, a dispensada ou a que o aluno já tem em outro voo do dia) pede confirmação: o
// botão dela aparece armado, e o segundo acionamento põe a missão no pedido; o histórico diz por que ela estava fora da
// ordem. No curso encerrado, também a liberada pede confirmação, e o histórico diz que o curso estava encerrado
function escolherOutraMissao(t, c, s, target, mid) {
  const escolha = t.value && ligada('progresso') ? outraMissaoDoPedido(s, target, mid, t.value) : null;
  if (!escolha) { atualizarLinhaDaDemanda(s, target, mid); desenharRestricoes(); return; }
  const { missao: m } = escolha;
  if (escolha.liberada && !escolha.encerrado) {
    const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
    gravarAlteracao('inc', `${s.nm}: ${m.codigo} na demanda (${missaoDoPedido(target)})${solto}`);
    depoisDeMudar(s, target, mid);
    return;
  }
  c.querySelector('[data-act="usar-fora-da-ordem"]')?.remove();
  t.insertAdjacentHTML('afterend', botaoForaDaOrdem(s, escolha));
  const botao = t.nextElementSibling;
  confirmado(botao, confirmacaoDaMissao(escolha).armado);
  botao.focus();
}

aoAcionar('usar-fora-da-ordem', (b, { id, mid }) => {
  if (!ligada('progresso')) return;
  const s = stuBy(id), target = getMissionTarget(id, mid);
  const escolha = s && target ? outraMissaoDoPedido(s, target, mid, b.dataset.codigo) : null;
  // A missão já não é uma das outras do pedido (o programa ou os resultados mudaram): a gaveta volta a mostrar as de agora
  if (!escolha) { redesenharPorNome('pedidos-do-dia'); desenharRestricoes(); return; }
  const { missao: m } = escolha;
  if ((!escolha.liberada || escolha.encerrado) && !confirmado(b, confirmacaoDaMissao(escolha).armado)) return;
  const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
  const como = escolha.liberada ? ` (${missaoDoPedido(target)})` : `, fora da ordem (${escolha.motivo})`;
  gravarAlteracao('inc', `${s.nm}: ${m.codigo} na demanda${como}${comOCursoEncerrado(escolha.encerrado, escolha.curso)}${solto}`);
  depoisDeMudar(s, target, mid);
});

// O "✕" da Escala (a linha e o editor do voo) tira o voo da escala. Na escala aprovada, sem o motor (F1g): o voo fica fixo
// onde estava antes (o pino fica para "↶ Restaurar" o pôr de volta no mesmo lugar), e nenhum outro voo muda
aoAcionar('rm-fly', (b, { id, mid }) => {
  const s = stuBy(id);
  const target = getMissionTarget(id, mid);
  if (!s || !target || !target.fly) return;
  // Na escala não aprovada, a pergunta antes (R6); "Cancelar" não muda nada
  if (S.aprovacao) tirarDaEscala(s, target, mid);
  else perguntarAntesDeRefazer({ resumo: `${s.nm}: sai da escala`, aoConfirmar: () => tirarDaEscala(s, target, mid) });
});
function tirarDaEscala(s, target, mid) {
  const foto = fotoDaEscalaTravada();
  if (foto) S.fixos = fixarNoLugar(S.fixos, RES, [chaveDoVoo(s.id, mid)]);
  target.fly = false;
  if (!gravarNaEscala(foto, 'exc', `Tirado da escala: ${s.nm} (${target.mis} · ${target.eq})`, {
    kind: 'setFly', stuId: s.id, mid, val: true, label: '↶ Restaurar'
  })) return;
  redesenharPorNome('pedidos-do-dia');
  showToast(`Tirado da escala: ${s.nm} (${target.mis}).`, 'ok');
}

// Grava o campo no pedido (aplicarRestricao) com a entrada do histórico; o que não vale volta a ser mostrado como estava
function gravarCampo(s, target, mid, f, valor) {
  const antes = doVoo(target);
  const feito = aplicarRestricao(target, f, valor, { horarios: S.horarios });
  if (!feito.aplicada) {
    if (feito.motivo) showToast(feito.motivo);
    atualizarLinhaDaDemanda(s, target, mid);
    desenharRestricoes();
    return;
  }
  const solto = feito.mudouOVoo ? soltarSeMudou(s, mid, antes, target) : '';
  gravarAlteracao('mod', `Pedido ${s.nm}: ${missaoDoPedido(target)}${solto}`);
  depoisDeMudar(s, target, mid);
}

// Os campos de um pedido: os das restrições (a gaveta) e os da linha da Demanda (o Voa e a missão, até o G2)
aoMudarCampo('d', (t, { f, c, id, mid }) => {
  const s = stuBy(id);
  const target = getMissionTarget(id, mid);
  if (!s || !target) return;
  if (f === 'outra-missao') { escolherOutraMissao(t, c, s, target, mid); return; }
  // A prioridade desligada (js/funcionalidades.js): um campo que sobrou na tela não muda nada
  if (f === 'pr' && !ligada('prioridade')) return;
  // Outro campo mudado com uma confirmação esperando: ela deixa de valer
  if (pendenteDasRestricoes() && pendenteDasRestricoes().campo !== f) marcarPendente(null);
  if (f === 'insId') {
    // O instrutor escolhido: o app procura o horário e o avião com ele. O voo que já está fixo fica onde está, com o
    // instrutor novo (na turma de Ground, a turma inteira). O de "Não escalar com" está desligado na lista
    const x = t.value ? insBy(+t.value) : null;
    const { antes, alunos } = escolherInstrutor(S, RES, { stuId: s.id, mid }, x ? x.id : null);
    gravarAlteracao('mod', `Pedido ${s.nm}: instrutor ${x ? x.nm : 'automático'} (${target.mis})`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' });
    if (alunos > 1) showToast(`A turma de ${target.mis} passa inteira para ${x ? x.nm : 'a escolha do app'}.`, 'ok');
    depoisDeMudar(s, target, mid);
    return;
  }
  if (f === 'fly') {
    target.fly = t.checked;
    // O aluno que não vai voar não voa as missões extras; reverter volta todas
    const extras = !mid && !target.fly ? (s.extra || []).filter(ex => ex.fly) : [];
    extras.forEach(ex => { ex.fly = false; });
    gravarAlteracao(target.fly ? 'inc' : 'exc',
      `${s.nm} ${target.fly ? 'incluído' : 'retirado'} (${missaoDoPedido(target)})${extras.length ? `, com ${extras.length === 1 ? 'a missão extra' : `as ${extras.length} missões extras`}` : ''}`,
      { kind: 'setFly', stuId: s.id, mid, val: !target.fly, ...(extras.length ? { extras: extras.map(ex => ex.mid) } : {}), label: target.fly ? '✕ Excluir' : '↶ Restaurar' });
    if (extras.length) redesenharPorNome('pedidos-do-dia');
    else trocarElemento(c, singleDemandRowHTML(s, target, mid));
    // O pedido que deixa de voar some com "Só quem voa": sem outro à vista, a linha "Nenhum aluno com esses filtros"
    conferirNenhumNaDemanda();
    cnt();
    redesenharPorNome('historico');
    return;
  }
  // O tipo e o horário contra as limitações do aluno na data (L): o aviso e a confirmação, sem gravar nada antes
  const aviso = avisoDaRestricao(s, f, f === 'eq' ? t.value : +t.value, DATA);
  if (aviso) {
    marcarPendente({ stuId: s.id, mid, campo: f, valor: t.value, aviso });
    desenharRestricoes();
    return;
  }
  marcarPendente(null);
  gravarCampo(s, target, mid, f, t.value);
});

// "Usar … mesmo assim": o tipo ou o horário que esperava grava (o motor recusa o pedido assim, com o motivo); "Manter"
// volta ao de antes, sem gravar, com o foco no campo
aoAcionar('confirmar-restricao', (b, { id, mid }) => {
  const p = pendenteDasRestricoes(), s = stuBy(id), target = getMissionTarget(id, mid);
  if (!p || !s || !target || p.stuId !== id || p.mid !== mid) return;
  marcarPendente(null);
  gravarCampo(s, target, mid, p.campo, p.valor);
  const campo = document.querySelector(`#painel-restricoes [data-f="${p.campo}"]`);
  if (campo) campo.focus();
});
aoAcionar('desistir-restricao', () => {
  const p = pendenteDasRestricoes();
  marcarPendente(null);
  desenharRestricoes();
  const campo = p && document.querySelector(`#painel-restricoes [data-f="${p.campo}"]`);
  if (campo) campo.focus();
});

// "↶ Reverter" no histórico (js/eventos/historico.js): o Voa de um pedido (a Demanda, o "✕" e "Pôr um aluno na demanda").
// A reversão chega validada (js/reversoes.js). Na escala aprovada, sem o motor (F1g): o voo com pino volta para o pino; o
// pedido sem pino (tirado antes da aprovação) entra no dia, e o motor o encaixa em volta dos fixos (R5). O pedido da agenda
// que a conciliação tirou da demanda depois (cancelado ou sem a aprovação) não volta a voar (o E)
aoReverter('setFly', (rev, entry) => {
  const st = stuBy(rev.stuId);
  const target = getMissionTarget(rev.stuId, rev.mid || 0);
  const naoVolta = st && target && rev.val ? motivoParaNaoVoltarAVoar(S, [target, ...(rev.extras || []).map(m => getMissionTarget(rev.stuId, m))]) : '';
  if (naoVolta) { showToast(naoVolta); return; }
  if (st && target) {
    const foto = fotoDaEscalaTravada();
    target.fly = rev.val;
    (rev.extras || []).forEach(m => { const ex = getMissionTarget(rev.stuId, m); if (ex) ex.fly = rev.val; });
    gravarNaEscala(foto, rev.val ? 'inc' : 'exc', `Revertido: ${st.nm} (${target.mis})`, null, entry.id);
    redesenharPorNome('pedidos-do-dia');
  }
});

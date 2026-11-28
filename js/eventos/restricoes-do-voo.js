// As restrições de um voo (G1): a gaveta aside#painel-restricoes (js/views/restricoes-do-voo.js), aberta pelo "Restrições"
// do editor do voo, do item do trilho da missão que não entrou e do detalhe do pedido no Processamento (G2), e os campos de
// cada pedido, que vieram da Demanda com o mesmo dono: o tipo de recurso, o instrutor, a prioridade, as preferências e a
// duração, a missão do curso ("Usar a do programa", "Trocar…", com as mesmas confirmações armadas), o "✕" da Escala (e o
// "Tirar da escala" da linha sem aprovação, no Processamento), "Pôr de volta na escala" (G2: na gaveta e no Processamento)
// e a reversão do Voa (setFly). Cada mudança grava uma alteração (gravarAlteracao), e o motor refaz a escala em volta dos
// voos fixos; o tipo e o horário contra as limitações do aluno avisam e esperam a confirmação, sem gravar nada antes
import { gravarAlteracao, fotoDaEscalaTravada, gravarNaEscala } from '../actions.js';
import { $, showToast, gavetaDoEsc, algumDialogoAberto } from '../dom.js';
import { motivoParaNaoVoltarAVoar } from '../reversoes.js';
import { fixarNoLugar } from '../fixos.js';
import { fmtDurLabel, hm } from '../format.js';
import { ligada } from '../funcionalidades.js';
import { horariosDaMissao, ajustarPreferencias } from '../horarios.js';
import { normalizeMissionFields, prioridadeNaTela } from '../rules.js';
import { S, RES, DATA, stuBy, insBy, getMissionTarget } from '../state.js';
import { solicitacaoAprovada } from '../agenda.js';
import { hojeISO } from '../format.js';
import { podeVoltarAEscala, MOTIVO_PARA_NAO_VOLTAR } from '../processamento.js';
import { solicitacoesDaData } from '../solicitacoes-da-data.js';
import { chaveDoVoo } from '../voo.js';
import { escolherInstrutor } from '../instrutor-escolhido.js';
import { aplicarRestricao, avisoDaRestricao, fixosSemOAgendadoQueMudou, tipoDaMissaoDoCurso } from '../restricoes.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { responderNoProcessamento } from '../views/processamento.js';
import { dataCurta } from '../views/agenda.js';
import { proximaDoPedido, outraMissaoDoPedido, botaoForaDaOrdem, confirmacaoDaMissao } from '../views/etapas.js';
import {
  abrirRestricoes, fecharRestricoes, desenharRestricoes, pendenteDasRestricoes, marcarPendente, perguntaAntesNaGaveta
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

// Depois de uma mudança no pedido: o Histórico (a gaveta e o Processamento, pelo desenho da escala)
function depoisDeMudar() {
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
// com o código e o curso dela, e o aluno voa; o instrutor escolhido continua. O aluno que não voa no tipo do programa (as
// limitações, L) vai num que a missão permite e ele voa, e a missão continua a do curso (R7, como em Pedidos): o aviso
// diz. Devolve o que o histórico diz do voo agendado do pedido (que deixa de ser fixo quando a missão, o tipo ou as horas
// mudam)
function usarMissaoDoCurso(s, target, mid, { codigo, curso, mis, eq: doPrograma, nb }) {
  const antes = doVoo(target);
  const { eq } = tipoDaMissaoDoCurso(s, { codigo, mis, eq: doPrograma }, target, DATA);
  // A confirmação do 7º voo local (Q8) foi dada na Agenda para a missão e o recurso de antes: com outros, ela não vale
  if (target.etapa !== codigo || target.cursoDaEtapa !== curso || target.mis !== mis || target.eq !== eq) delete target.limiteConfirmado;
  Object.assign(target, { fly: true, mis, eq, nb, etapa: codigo, cursoDaEtapa: curso });
  // A missão que o operador usou não é a que o programa deu na entrada do pedido (formato 30)
  delete target.etapaDoPrograma;
  ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
  normalizeMissionFields(target);
  return soltarSeMudou(s, mid, antes, target);
}
// O aviso da missão do curso no pedido: o tipo que o aluno voa no lugar do do programa (R7), ou nenhum
const avisoDaMissao = (s, target, { codigo, mis, eq }) => tipoDaMissaoDoCurso(s, { codigo, mis, eq }, target, DATA).aviso;

// Na escala não aprovada, a mudança feita na gaveta aberta pela Escala (o editor do voo, o item do trilho) pergunta antes
// de refazer (F1g, R6: #dlg-refazer), com o aviso dela na pergunta (uma pergunta, não duas); "Cancelar" (e o Esc) redesenha
// a gaveta com o valor de antes, sem gravar. Aberta pelo Processamento e na escala aprovada, grava na hora (o aviso num
// toast). el: o campo ou o botão da mudança
function gravarOuPerguntar(el, { resumo, aviso = null }, gravar) {
  if (el.closest('#painel-restricoes') && perguntaAntesNaGaveta()) {
    perguntarAntesDeRefazer({ resumo, avisos: aviso ? [{ texto: aviso }] : [], aoConfirmar: gravar, aoDesistir: desenharRestricoes });
    return;
  }
  if (aviso) showToast(aviso);
  gravar();
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
  gravarOuPerguntar(b, { resumo: `${s.nm}: missão do curso ${m.id}`, aviso: avisoDaMissao(s, target, { ...m, codigo: m.id }) }, () => {
    const solto = usarMissaoDoCurso(s, target, mid, { ...m, codigo: m.id });
    gravarAlteracao('inc', `${s.nm}: ${m.id} no voo (${missaoDoPedido(target)})${comOCursoEncerrado(m.encerrado, m.curso)}${solto}`);
    depoisDeMudar();
  });
});

// "Trocar…" (as outras missões do curso): a liberada vale na hora, como "Usar a do programa". A fora da ordem (a missão
// bloqueada pelo programa, a já aprovada, a dispensada ou a que o aluno já tem em outro voo do dia) pede confirmação: o
// botão dela aparece armado, e o segundo acionamento põe a missão no pedido; o histórico diz por que ela estava fora da
// ordem. No curso encerrado, também a liberada pede confirmação, e o histórico diz que o curso estava encerrado
function escolherOutraMissao(t, c, s, target, mid) {
  const escolha = t.value && ligada('progresso') ? outraMissaoDoPedido(s, target, mid, t.value) : null;
  if (!escolha) { desenharRestricoes(); return; }
  const { missao: m } = escolha;
  if (escolha.liberada && !escolha.encerrado) {
    gravarOuPerguntar(t, { resumo: `${s.nm}: missão do curso ${m.codigo}`, aviso: avisoDaMissao(s, target, m) }, () => {
      const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
      gravarAlteracao('inc', `${s.nm}: ${m.codigo} no voo (${missaoDoPedido(target)})${solto}`);
      depoisDeMudar();
    });
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
  gravarOuPerguntar(b, { resumo: `${s.nm}: missão do curso ${m.codigo}`, aviso: avisoDaMissao(s, target, m) }, () => {
    const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
    const como = escolha.liberada ? ` (${missaoDoPedido(target)})` : `, fora da ordem (${escolha.motivo})`;
    gravarAlteracao('inc', `${s.nm}: ${m.codigo} no voo${como}${comOCursoEncerrado(escolha.encerrado, escolha.curso)}${solto}`);
    depoisDeMudar();
  });
});

// O "✕" da Escala (a linha e o editor do voo) tira o voo da escala. Na escala aprovada, sem o motor (F1g): o voo fica fixo
// onde estava antes (o pino fica para "↶ Restaurar" e "Pôr de volta na escala" o porem de volta no mesmo lugar), e nenhum
// outro voo muda. O "Tirar da escala" da linha sem aprovação, no Processamento, é o mesmo, sem a pergunta (ali se cuida
// dos pedidos, como era a Demanda) e com a resposta do N6
const doProcessamento = b => Boolean(b.closest('#s-proc'));
aoAcionar('rm-fly', (b, { id, mid }) => {
  const s = stuBy(id);
  const target = getMissionTarget(id, mid);
  if (!s || !target || !target.fly) return;
  // Na escala não aprovada, a pergunta antes (R6); "Cancelar" não muda nada
  // De onde veio: o botão sai da página com o redesenho da gravação
  const noProcessamento = doProcessamento(b);
  if (S.aprovacao || noProcessamento) tirarDaEscala(s, target, mid, noProcessamento);
  else perguntarAntesDeRefazer({ resumo: `${s.nm}: sai da escala`, aoConfirmar: () => tirarDaEscala(s, target, mid, false) });
});
function tirarDaEscala(s, target, mid, noProcessamento) {
  const foto = fotoDaEscalaTravada();
  if (foto) S.fixos = fixarNoLugar(S.fixos, RES, [chaveDoVoo(s.id, mid)]);
  target.fly = false;
  if (!gravarNaEscala(foto, 'exc', `Tirado da escala: ${s.nm} (${target.mis} · ${target.eq})`, {
    kind: 'setFly', stuId: s.id, mid, val: true, label: '↶ Restaurar'
  })) return;
  if (noProcessamento) { responderNoProcessamento({ chave: chaveDoVoo(s.id, mid), texto: `Tirado da escala: ${s.nm} (${target.mis})` }); return; }
  redesenharPorNome('pedidos-do-dia');
  showToast(`Tirado da escala: ${s.nm} (${target.mis}) · ${dataCurta(DATA)}.`, 'ok');
}

// "Pôr de volta na escala" (G2): o voo tirado da escala volta (o pedido da agenda só aprovado, lido e não cancelado; nada
// numa data passada: podeVoltarAEscala). Na escala aprovada, sem o motor (F1g): o voo com pino volta para o pino; sem pino,
// o motor o encaixa em volta dos fixos (R5). Na escala não aprovada, pela gaveta aberta na Escala, a pergunta antes (R6);
// pelo Processamento, na hora. A resposta: no Processamento, a do N6; na gaveta, o toast, e a gaveta mostra o voo
aoAcionar('por-de-volta', (b, { id, mid }) => {
  const s = stuBy(id), target = getMissionTarget(id, mid);
  if (!s || !target || target.fly) return;
  const noProcessamento = doProcessamento(b);
  const pode = podeVoltarAEscala(S, solicitacoesDaData().lista, { stuId: id, mid }, { aprovada: solicitacaoAprovada, data: DATA, hoje: hojeISO() });
  if (!pode.ok) {
    if (noProcessamento) responderNoProcessamento({ chave: chaveDoVoo(id, mid), texto: `${s.nm} não volta: ${MOTIVO_PARA_NAO_VOLTAR[pode.motivo].replace(/\.$/, '')}`, ok: false });
    else showToast(MOTIVO_PARA_NAO_VOLTAR[pode.motivo]);
    return;
  }
  const fazer = () => porDeVolta(s, target, mid, noProcessamento);
  if (!noProcessamento && b.closest('#painel-restricoes') && perguntaAntesNaGaveta()) {
    perguntarAntesDeRefazer({ resumo: `${s.nm}: volta à escala`, aoConfirmar: fazer, aoDesistir: desenharRestricoes });
  } else fazer();
});
function porDeVolta(s, target, mid, noProcessamento) {
  const foto = fotoDaEscalaTravada();
  target.fly = true;
  if (!gravarNaEscala(foto, 'inc', `De volta à escala: ${s.nm} (${target.mis})`, { kind: 'setFly', stuId: s.id, mid, val: false, label: '✕ Excluir' })) {
    target.fly = false;
    return;
  }
  const texto = `De volta à escala: ${s.nm} (${target.mis})`;
  if (noProcessamento) { responderNoProcessamento({ chave: chaveDoVoo(s.id, mid), texto }); return; }
  redesenharPorNome('pedidos-do-dia');
  showToast(`${texto} · ${dataCurta(DATA)}.`, 'ok');
}

// Grava o campo no pedido (aplicarRestricao) com a entrada do histórico; o que não vale volta a ser mostrado como estava
function gravarCampo(s, target, mid, f, valor) {
  const antes = doVoo(target);
  const feito = aplicarRestricao(target, f, valor, { horarios: S.horarios });
  if (!feito.aplicada) {
    if (feito.motivo) showToast(feito.motivo);
    desenharRestricoes();
    return;
  }
  const solto = feito.mudouOVoo ? soltarSeMudou(s, mid, antes, target) : '';
  gravarAlteracao('mod', `Pedido ${s.nm}: ${missaoDoPedido(target)}${solto}`);
  depoisDeMudar();
}

// O que a pergunta diz da mudança de um campo ("Aluno 1003: tipo de recurso C152 → C172"); o pedido como ficaria vem do
// ensaio de aplicarRestricao numa cópia
const ROTULO_DO_CAMPO = { eq: 'tipo de recurso', p1: '1ª preferência', p2: '2ª preferência', nb: 'duração', pr: 'prioridade', mis: 'missão' };
function valorNoResumo(f, d) {
  if (f === 'p1' || f === 'p2') return d[f] >= 0 ? hm(d[f]) : '—';
  if (f === 'nb') return fmtDurLabel(d.nb);
  if (f === 'pr') return String(prioridadeNaTela(d.pr));
  return String(d[f]);
}
// A mudança do campo, com a pergunta quando ela vale (gravarOuPerguntar): o valor que não vale ou não muda nada grava (ou
// recusa, com o motivo) sem perguntar
function mudarCampo(t, s, target, mid, f, valor, aviso) {
  const ensaio = structuredClone(target);
  const feito = aplicarRestricao(ensaio, f, valor, { horarios: S.horarios });
  const igual = feito.aplicada && JSON.stringify(ensaio) === JSON.stringify(target);
  if (!feito.aplicada || igual) { gravarCampo(s, target, mid, f, valor); return; }
  const resumo = `${s.nm}: ${ROTULO_DO_CAMPO[f]} ${valorNoResumo(f, target)} → ${valorNoResumo(f, ensaio)}`;
  gravarOuPerguntar(t, { resumo, aviso }, () => gravarCampo(s, target, mid, f, valor));
}

// Os campos de um pedido: os das restrições (a gaveta)
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
    const nomeDe = id => (id ? (insBy(id) || {}).nm || 'Instrutor fora do cadastro' : 'Automático');
    gravarOuPerguntar(t, { resumo: `${s.nm}: instrutor ${nomeDe(target.insId)} → ${nomeDe(x && x.id)}` }, () => {
      const { antes, alunos } = escolherInstrutor(S, RES, { stuId: s.id, mid }, x ? x.id : null);
      gravarAlteracao('mod', `Pedido ${s.nm}: instrutor ${x ? x.nm : 'automático'} (${target.mis})`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' });
      if (alunos > 1) showToast(`A turma de ${target.mis} passa inteira para ${x ? x.nm : 'a escolha do app'}.`, 'ok');
      depoisDeMudar();
    });
    return;
  }
  // O tipo e o horário contra as limitações do aluno na data (L): o aviso e a confirmação, sem gravar nada antes. Com a
  // pergunta antes de refazer (a gaveta aberta pela Escala, na escala não aprovada), o aviso vai nela: uma pergunta só
  const aviso = avisoDaRestricao(s, f, f === 'eq' ? t.value : +t.value, DATA);
  if (aviso && !(t.closest('#painel-restricoes') && perguntaAntesNaGaveta())) {
    marcarPendente({ stuId: s.id, mid, campo: f, valor: t.value, aviso });
    desenharRestricoes();
    return;
  }
  marcarPendente(null);
  mudarCampo(t, s, target, mid, f, t.value, aviso);
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

// "↶ Reverter" no histórico (js/eventos/historico.js): o Voa de um pedido (o "✕", "Pôr de volta na escala" e, de antes do
// G2, a Demanda: o Voa e "Pôr um aluno na demanda").
// A reversão chega validada (js/reversoes.js). Na escala aprovada, sem o motor (F1g): o voo com pino volta para o pino; o
// pedido sem pino (tirado antes da aprovação) entra no dia, e o motor o encaixa em volta dos fixos (R5). O pedido da agenda
// que a conciliação tirou da escala depois (cancelado ou sem a aprovação) não volta a voar (o E)
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

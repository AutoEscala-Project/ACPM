// O histórico do dia: a gaveta, limpar (só no modo local) e Reverter
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { $, showToast, algumDialogoAberto, abrirGaveta, gavetaDoEsc } from '../dom.js';
import { normalizarFixos } from '../fixos.js';
import { validarReversao, motivoParaNaoDesfazer, desfazerAgendamento, agendamentosEmVolta } from '../reversoes.js';
import { atributoVale } from '../frota.js';
import { reverterEscolha, reverterReparo } from '../instrutor-escolhido.js';
import { S, AUDIT_LOG, DATA, setAuditLog, isGestor, insBy, stuBy, getMissionTarget } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { rIns } from '../views/instrutores.js';
import { rDem } from '../views/demanda.js';
import { renderAuditPanel } from '../views/escala.js';
import { rRec } from '../views/recursos.js';

// Histórico: gaveta lateral sobre a aba aberta (por cima das outras gavetas abertas); o botão abre e fecha, ✕ e Esc
// fecham (o Esc, quando ela é a gaveta de cima ou tem o foco: js/dom.js). Com um diálogo aberto por cima (o do status de
// um voo da Escala), o Esc fecha só o diálogo, e a gaveta continua aberta
const gavetaDoHistorico = $('#historico');
function mostrarHistorico(abrir) {
  // Fechar com o foco dentro da gaveta devolve o foco ao botão do Histórico; com o foco fora dela (o Esc dado na busca
  // da escala, no popup do mapa), o foco fica onde está
  const focoDentro = gavetaDoHistorico.contains(document.activeElement);
  if (abrir) abrirGaveta(gavetaDoHistorico);
  else gavetaDoHistorico.hidden = true;
  $('#btn-open-log').setAttribute('aria-expanded', String(abrir));
  if (!abrir) { if (focoDentro) $('#btn-open-log').focus(); return; }
  $('#btn-fechar-historico').focus();
}
$('#btn-open-log').onclick = () => mostrarHistorico(gavetaDoHistorico.hidden);
$('#btn-fechar-historico').onclick = () => mostrarHistorico(false);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === gavetaDoHistorico && !algumDialogoAberto()) mostrarHistorico(false);
});

// Só no modo local: no modo compartilhado o histórico é permanente (o botão fica oculto)
$('#btn-clear-log').onclick = async () => {
  if (isGestor() || !ApiClient.backend.limparHistorico || aindaNaoAbriu()) return;
  await ApiClient.backend.limparHistorico(DATA);
  setAuditLog([]);
  renderAuditPanel();
  showToast('Histórico limpo.', 'ok');
};

// Reverter registra uma nova entrada que aponta a revertida (o histórico só cresce)
aoAcionar('rev-log', b => {
  const logId = +b.dataset.logid;
  const entry = AUDIT_LOG.find(x => x.id === logId);
  // A reversão gravada só vale no formato que o app produz
  const rev = entry ? validarReversao(entry.revert, S.frota) : null;
  if (!rev) return;

  if (rev.kind === 'setFly') {
    const st = stuBy(rev.stuId);
    const target = getMissionTarget(rev.stuId, rev.mid || 0);
    if (st && target) {
      target.fly = rev.val;
      (rev.extras || []).forEach(m => { const ex = getMissionTarget(rev.stuId, m); if (ex) ex.fly = rev.val; });
      gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${st.nm} (${target.mis})`, null, entry.id);
      rDem();
    }
  } else if (rev.kind === 'setAv') {
    S.av[rev.reg] = rev.val;
    gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${rev.reg} ${rev.val ? 'disponível' : 'em manutenção'}`, null, entry.id);
    rRec();
  } else if (rev.kind === 'setAtributo') {
    const recurso = (S.frota || []).find(f => f.reg === rev.reg);
    if (recurso && atributoVale(rev.atributo, recurso.tipo)) {
      if (rev.val) recurso[rev.atributo] = true;
      else delete recurso[rev.atributo];
      gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
      rRec(); rIns(); rDem();
    }
  } else if (rev.kind === 'setInsOn') {
    const ins = insBy(rev.insId);
    if (ins) {
      ins.on = rev.val;
      gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${ins.nm} ${rev.val ? 'disponível' : 'indisponível'}`, null, entry.id);
      rIns();
    }
  } else if (rev.kind === 'restaurarFixos') {
    // Um reparo desfeito: os voos voltam a ser fixos como antes dele, e o instrutor escolhido dos pedidos também. O voo
    // agendado volta só enquanto o agendamento continua: o histórico diz qual foi desfeito ou feito depois do reparo
    // (js/reversoes.js e js/instrutor-escolhido.js)
    reverterReparo(S, rev, agendamentosEmVolta(S, AUDIT_LOG, entry, S.frota));
    S.fixos = normalizarFixos(S.fixos);
    if (rev.pedidos) rDem();
    gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
  } else if (rev.kind === 'restaurarEscolha') {
    // O instrutor escolhido volta como estava, e os voos fixos também; o voo agendado, só enquanto o agendamento
    // continua (js/reversoes.js e js/instrutor-escolhido.js)
    reverterEscolha(S, rev, agendamentosEmVolta(S, AUDIT_LOG, entry, S.frota));
    S.fixos = normalizarFixos(S.fixos);
    gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
    rDem();
  } else if (rev.kind === 'restaurarHorarios') {
    // Os horários de uma categoria voltam como estavam, e os pedidos que mudaram com eles também
    S.horarios = { ...S.horarios, [rev.cat]: [...rev.lista] };
    rev.pedidos.forEach(({ stuId, mid, p1, p2, jan }) => {
      const alvo = getMissionTarget(stuId, mid);
      if (!alvo) return;
      Object.assign(alvo, { p1, p2 });
      if (jan !== undefined) alvo.jan = jan;
    });
    gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
    rRec(); rDem();
  } else if (rev.kind === 'readicionarRecurso') {
    // Um recurso retirado volta para a frota, como estava (com a habilitação própria, em Instrutores)
    S.frota.push({ ...rev.recurso });
    S.av[rev.recurso.reg] = rev.av !== false;
    gravarAlteracao('inc', `Revertido: ${rev.recurso.reg} de volta à frota`, null, entry.id);
    rRec(); rIns();
  } else if (rev.kind === 'desfazerAgendamento') {
    // Um voo agendado na Escala: o criado sai, o movido volta para onde estava, e o instrutor marcado disponível volta
    // como estava (js/reversoes.js). O voo já em andamento ou com resultado registrado fica, com o aviso; o movido cujo
    // pedido saiu da Demanda também (não há o que desfazer)
    const motivo = motivoParaNaoDesfazer(S, rev);
    if (motivo) { showToast(motivo); return; }
    if (desfazerAgendamento(S, rev)) {
      gravarAlteracao(rev.criado ? 'exc' : 'mod', `Revertido: ${entry.desc}`, null, entry.id);
      rDem(); rIns();
    }
  }
});

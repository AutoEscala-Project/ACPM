// O histórico do dia: a gaveta, limpar (só no modo local) e Reverter. Cada tela registra o que "↶ Reverter" faz com os
// tipos de reversão dela (aoReverter, js/eventos/registro.js); aqui a entrada é validada e passada para quem a registrou
import { aindaNaoAbriu } from '../actions.js';
import { $, showToast, algumDialogoAberto, abrirGaveta, gavetaDoEsc } from '../dom.js';
import { validarReversao } from '../reversoes.js';
import { S, AUDIT_LOG, DATA, setAuditLog, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar, desfazerDoTipo } from './registro.js';
import { renderAuditPanel } from '../views/escala.js';
import { registrarDesenho } from '../redesenho.js';

// O desenho do Histórico (js/redesenho.js): outra data, e a escala refeita (a entrada nova)
registrarDesenho('historico', renderAuditPanel, { em: ['dados', 'escala'], ordem: 85 });

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

  const desfazer = desfazerDoTipo(rev.kind);
  if (desfazer) desfazer(rev, entry);
});

// Dados pessoais de um aluno ou instrutor (o painel, js/views/painel-de-dados.js): o botão da linha abre o painel;
// Cancelar, ✕ e Esc fecham (o foco volta para o botão; o Esc, quando o painel é a gaveta de cima ou tem o foco: js/dom.js).
// Salvar valida e grava; o histórico registra só os nomes dos campos que mudaram
import { mostrarNoHistorico } from '../actions.js';
import { $, showToast, algumDialogoAberto, gavetaDoEsc } from '../dom.js';
import { DATA } from '../state.js';
import { abrirPainelDeDados, fecharPainelDeDados, salvarPainelDeDados } from '../views/painel-de-dados.js';

document.addEventListener('click', e => {
  const botao = e.target.closest('[data-dados]');
  if (botao) {
    const [tipo, id] = botao.dataset.dados.split(':');
    abrirPainelDeDados(tipo, +id, botao);
    return;
  }
  if (e.target.closest('#btn-fechar-dados, #btn-cancelar-dados')) fecharPainelDeDados(true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-dados') && !algumDialogoAberto()) fecharPainelDeDados(true);
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'form-dados') return;
  e.preventDefault();
  const salvo = await salvarPainelDeDados();
  if (!salvo) return;
  fecharPainelDeDados(true);
  showToast(`Dados pessoais de ${salvo.nome} salvos.`, 'ok');
  if (salvo.historico && salvo.data === DATA) mostrarNoHistorico(salvo.historico);
});

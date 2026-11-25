// A barra do topo: a data (o dia anterior e o seguinte, o domingo pulado), o perfil no modo local, o menu da conta (Minha
// conta, Usuários, o tema e o Manual) e o aviso dos dados que não foram lidos
import { setRole, carregarData, lerDadosDeNovo } from '../actions.js';
import { ehDomingo } from '../agenda.js';
import { $, showToast, ligarMenu, focarNoTitulo } from '../dom.js';
import { somarDias, dataIsoValida } from '../format.js';
import { DATA, isGestor, modoCompartilhado } from '../state.js';
import { ApiClient } from '../storage.js';
import { abrirConta } from '../views/conta.js';
import { rManual } from '../views/manual.js';
import { atualizarSelosDaEscala } from '../views/selos.js';
import { show } from '../views/tabs.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';

// Os selos das abas (js/redesenho.js): os dados de outra data e a escala refeita
registrarDesenho('selos', atualizarSelosDaEscala, { em: ['dados', 'escala'], ordem: 99 });

// O perfil (neste navegador). A aba Cursos é refeita: aberta, ela mostra ou tira na hora os controles de quem muda o
// programa
$('#role-sel').onchange = e => {
  setRole(e.target.value);
  redesenharPorNome('cursos', 'escala');
};

// O aviso do domingo (o app abre a segunda)
export const avisoDeDomingo = segunda => `O aeroclube não opera aos domingos: abrimos segunda-feira, ${segunda.slice(8, 10)}/${segunda.slice(5, 7)}.`;

// Cada data tem a sua escala: trocar a data abre a escala daquela data (o gestor do modo compartilhado também navega).
// Data vazia ou que não carregou: o campo volta para a data aberta
$('#dt').onchange = e => {
  let data = e.target.value;
  if ((isGestor() && !modoCompartilhado()) || !dataIsoValida(data)) {
    e.target.value = DATA;
    return;
  }
  // Domingo não tem escala: abre a segunda
  if (ehDomingo(data)) {
    data = somarDias(data, 1);
    e.target.value = data;
    showToast(avisoDeDomingo(data));
  }
  carregarData(data).catch(() => {
    if (e.target.value === data) e.target.value = DATA;
    showToast('Não foi possível abrir essa data. Verifique a conexão e tente de novo.');
  });
};
// ‹ e ›: o dia anterior e o seguinte. Um clique no rótulo da data abre o calendário do navegador
// O domingo fica de fora: o aeroclube não opera
const irParaDia = dias => {
  const dt = $('#dt');
  if (dt.disabled) return;
  let destino = somarDias(DATA, dias);
  if (ehDomingo(destino)) destino = somarDias(destino, dias);
  dt.value = destino;
  dt.dispatchEvent(new Event('change'));
};
$('#dt-ant').onclick = () => irParaDia(-1);
$('#dt-prox').onclick = () => irParaDia(1);
$('#dt').addEventListener('click', e => {
  try {
    e.target.showPicker();
  } catch {
    // Sem showPicker (navegador antigo) ou sem permissão: o campo da data abre do jeito normal
  }
});

ligarMenu($('#btn-menu-conta'), $('#menu-conta'));

// Tema: um interruptor (sol e lua) no menu da conta. Sem escolha gravada, vale o tema do sistema
const temaEscuro = () => {
  const escolhido = document.documentElement.getAttribute('data-theme');
  return escolhido ? escolhido === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const mostrarTema = () => $('#btn-theme').setAttribute('aria-checked', String(temaEscuro()));
$('#btn-theme').onclick = () => {
  const proximo = temaEscuro() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', proximo);
  try {
    localStorage.setItem(ApiClient.KEY_THEME, proximo);
  } catch {
    // Sem o armazenamento do navegador (navegação privada, por exemplo), o tema vale só nesta visita
  }
  mostrarTema();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mostrarTema);
// O tema gravado neste navegador (sem ele, o do sistema)
export function iniciarTema() {
  try {
    const savedTheme = localStorage.getItem(ApiClient.KEY_THEME);
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  } catch {
    // Sem o armazenamento do navegador, o tema segue o do sistema
  }
  mostrarTema();
}

// Manual: abre de qualquer aba (as tabelas de regras são montadas uma vez, a partir do código)
rManual();
$('#btn-manual').onclick = () => {
  show('manual');
  focarNoTitulo($('#s-manual'));
  window.scrollTo(0, 0);
};

// O foco vai para o título da página aberta pelo menu
$('#btn-conta').onclick = () => { show('conta'); abrirConta(); focarNoTitulo($('#s-conta')); };
// Usuários (administrador): a mesma página, direto na lista de contas
$('#btn-usuarios').onclick = async () => {
  show('conta');
  await abrirConta();
  $('#usuarios').scrollIntoView({ block: 'start' });
  focarNoTitulo($('#usuarios'));
};

// As horas dos instrutores ou os resultados dos cursos que não foram lidos: "Tentar de novo" lê outra vez
$('#btn-tentar-dados').onclick = async e => {
  e.target.disabled = true;
  try { await lerDadosDeNovo(); } finally { e.target.disabled = false; }
};

// Utilitários de DOM: seletor, avisos (notificação temporária e aviso fixo) e foco no último campo.

export const $ = s => document.querySelector(s);

// Notificação temporária. tipo 'ok': deu certo (verde, com o sinal de certo); sem tipo: aviso (amarelo)
export function showToast(text, tipo = '') {
  const box = $('#toast-box');
  if (!box) return;
  const el = document.createElement('div');
  el.className = tipo ? `toast ${tipo}` : 'toast';
  if (tipo === 'ok') el.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-ok"/></svg>';
  el.append(text);
  box.appendChild(el);
  setTimeout(() => { el.remove(); }, 2800);
}

// Aviso fixo no topo, com o botão "Recarregar". O conflito e a falha ao preparar os dados só saem recarregando;
// as alterações esperando a conexão saem quando uma gravação der certo (fecharAviso('espera')), e esse aviso vem sem o
// botão (recarregar perderia as alterações)
let avisoAtual = null;
export const avisoAberto = () => avisoAtual;
export function mostrarAviso(tipo, texto, { recarregar = true } = {}) {
  avisoAtual = tipo;
  $('#aviso-sync-texto').textContent = texto;
  $('#aviso-sync').hidden = false;
  $('#btn-recarregar').hidden = !recarregar;
  $('#btn-recarregar').onclick = () => window.location.reload();
}
export function fecharAviso(tipo) {
  if (avisoAtual !== tipo) return;
  avisoAtual = null;
  $('#aviso-sync').hidden = true;
}

// Aviso sobre o link que abriu o app (a volta da confirmação da troca de e-mail, um link antigo), com o botão "OK"
export function avisarDoLink(texto, tipo) {
  $('#aviso-link-texto').textContent = texto;
  $('#aviso-link').className = `aviso-link ${tipo}`;
  $('#aviso-link').hidden = false;
  $('#btn-fechar-aviso-link').onclick = () => { $('#aviso-link').hidden = true; };
}

export const focusLast = sel => {
  const e = [...document.querySelectorAll(sel)].pop();
  if (e) { e.scrollIntoView({ block: 'center' }); e.focus(); e.select(); }
};

// Um balão junto de um elemento (o popup do mapa da escala, a dica): acima dele (ou abaixo, quando não cabe), sempre
// inteiro na tela; a seta (--seta) aponta para o meio do elemento
const MARGEM = 8, DISTANCIA = 10;
export function posicionarJunto(balao, alvo) {
  const r = alvo.getBoundingClientRect();
  const { offsetWidth: largura, offsetHeight: altura } = balao;
  const acima = r.top - DISTANCIA - altura >= MARGEM || r.bottom + DISTANCIA + altura > innerHeight - MARGEM && r.top > innerHeight - r.bottom;
  const topo = Math.min(Math.max(acima ? r.top - DISTANCIA - altura : r.bottom + DISTANCIA, MARGEM), innerHeight - altura - MARGEM);
  const meio = r.left + r.width / 2;
  const esquerda = Math.min(Math.max(meio - largura / 2, MARGEM), innerWidth - largura - MARGEM);
  balao.style.top = `${Math.round(topo)}px`;
  balao.style.left = `${Math.round(esquerda)}px`;
  balao.style.setProperty('--seta', `${Math.round(Math.min(Math.max(meio - esquerda, 14), largura - 14))}px`);
  balao.classList.toggle('abaixo', !acima);
}

// Menus suspensos (conta e "Mais" da Demanda): abrem e fecham no botão; Esc ou um clique fora fecham
export function ligarMenu(botao, menu, { fecharAoEscolher = true } = {}) {
  const fechar = () => { menu.hidden = true; botao.setAttribute('aria-expanded', 'false'); };
  botao.onclick = () => {
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
    const primeiro = abrir && menu.querySelector('[role^="menuitem"]:not([hidden])');
    if (primeiro) primeiro.focus();
  };
  // O item escolhido faz o que faz antes daqui (o ouvinte dele é o do próprio botão): se ele não levou o foco a outro
  // lugar, o foco volta ao botão do menu
  if (fecharAoEscolher) {
    menu.addEventListener('click', e => {
      if (!e.target.closest('[role="menuitem"]')) return;
      const semDestino = menu.contains(document.activeElement) || document.activeElement === document.body;
      fechar();
      if (semDestino) botao.focus();
    });
  }
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !botao.contains(e.target)) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || menu.hidden) return;
    fechar();
    botao.focus();
  });
  return fechar;
}

// O foco de quem usa o teclado sobrevive a um redesenho: o elemento em foco é achado de novo no conteúdo novo pelos
// atributos que o identificam (os dele e os da linha em que está). Se o equivalente sumiu da vista (a linha escondida por
// um filtro) ou da tela (o voo tirado da escala), o foco vai para o campo do mesmo tipo que ficou na mesma posição (o da
// linha seguinte)
const QUEM_E = ['id', 'data-f', 'data-a', 'data-act', 'data-w', 'data-i', 'data-h', 'data-b', 'data-cat', 'data-min', 'data-cal',
  'data-dia', 'data-delta', 'data-criterio', 'data-valor', 'data-logid', 'data-horas', 'data-fkey', 'data-resultado',
  'data-reparo', 'data-dados', 'data-id', 'data-mid', 'data-recolher-tempo', 'data-recolher-grupo'];
const DA_LINHA = ['data-k', 'data-id', 'data-mid', 'data-fkey', 'data-cat'];
// O tipo do campo: os atributos que dizem o que ele é, sem os que dizem de quem (o voo, o aluno, o recurso)
const DO_TIPO = ['data-f', 'data-a', 'data-act', 'data-criterio', 'data-cal'];
const LINHA = '[data-k], [data-fkey], tr[data-id], li[data-id]';
const comAtributos = (el, lista) => el.tagName.toLowerCase() +
  lista.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
const aVista = el => el.checkVisibility() && !el.disabled;

function focoEm(lugar) {
  const el = document.activeElement;
  if (!el || el === lugar || !lugar.contains(el)) return null;
  const proprio = comAtributos(el, QUEM_E);
  if (proprio === el.tagName.toLowerCase()) return null;
  const linha = el.parentElement && el.parentElement.closest(LINHA);
  const tipo = comAtributos(el, DO_TIPO);
  return {
    seletor: linha && linha !== lugar && lugar.contains(linha) ? `${comAtributos(linha, DA_LINHA)} ${proprio}` : proprio,
    tipo,
    posicao: [...lugar.querySelectorAll(tipo)].filter(aVista).indexOf(el)
  };
}
function devolverFoco(lugar, foco) {
  if (!foco) return;
  const alvo = lugar.querySelector(foco.seletor);
  if (alvo && aVista(alvo)) { alvo.focus(); return; }
  // O equivalente sumiu: o campo do mesmo tipo na mesma posição (o da linha seguinte). Um elemento sem tipo (só a tag) não
  // tem com o que comparar
  if (!foco.tipo.includes('[') || foco.posicao < 0) return;
  const iguais = [...lugar.querySelectorAll(foco.tipo)].filter(aVista);
  if (iguais.length) iguais[Math.min(foco.posicao, iguais.length - 1)].focus();
}

// Troca o conteúdo de um lugar da tela mantendo o foco no elemento equivalente
export function trocarConteudo(lugar, html) {
  const foco = focoEm(lugar);
  lugar.innerHTML = html;
  devolverFoco(lugar, foco);
}

// Troca um elemento inteiro (a linha de uma tabela) mantendo o foco no equivalente da versão nova
export function trocarElemento(el, html) {
  const pai = el.parentElement;
  const foco = pai && focoEm(pai);
  el.outerHTML = html;
  if (pai) devolverFoco(pai, foco);
}

// Leva o foco ao título de um lugar da tela (uma aba aberta pelo menu, uma parte do Manual): quem usa o teclado ou o
// leitor de tela continua de onde a página foi
export function focarNoTitulo(lugar) {
  if (!lugar) return;
  const titulo = lugar.matches('h1, h2, h3, h4') ? lugar : lugar.querySelector('h1, h2, h3, h4') || lugar;
  if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

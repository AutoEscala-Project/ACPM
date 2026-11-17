// As dicas: um balão só (#dica, role="tooltip") que explica um termo do glossário. Ele aparece:
// - com o mouse parado sobre o termo por 400 ms;
// - na hora, quando o foco do teclado chega a um elemento com a dica (a etiqueta que não é um botão recebe o foco pelo
//   Tab, para quem não usa o mouse ler a explicação);
// - num toque ou clique no botão "?" (a dica de um rótulo) ou numa etiqueta com a dica (que não é um botão).
// Esc, um toque fora e sair do termo fecham o balão; o mouse pode passar do termo para o balão sem que ele feche (para ler
// ou selecionar o texto). Ele acompanha a rolagem e o tamanho da tela. O texto entra só como texto (nunca como HTML).
// Para os leitores de tela, cada elemento com a dica aponta (aria-describedby) para o texto do termo, num nó escondido do
// glossário, e para o caso dele (data-dica-caso), quando tem.
import { GLOSSARIO } from './glossario.js';
import { posicionarJunto } from './dom.js';

const ESPERA_DO_MOUSE = 400;
// O mouse que sai do termo ou do balão: o tempo de atravessar o espaço entre os dois
const ESPERA_PARA_FECHAR = 300;
let alvo = null, porToque = false, espera = null, saida = null;

const balao = () => document.getElementById('dica');
const idDoTexto = id => `glossario-${id}`;
// Elementos que fazem outra coisa no clique (o clique neles não abre a dica; o foco e o mouse, sim)
const temAcao = el => !el.classList.contains('dica-btn') && el.matches('button, a[href], input, select, textarea, summary, [role="button"]');
const recebeFoco = el => el.matches('button, a[href], input, select, textarea, summary, [tabindex]');

// O caso de um elemento (data-dica-caso) vira um nó escondido, um por texto, para entrar na descrição dele
const casos = new Map();
function idDoCaso(texto) {
  if (!casos.has(texto)) {
    const no = document.createElement('span');
    no.id = `dica-caso-${casos.size + 1}`;
    no.textContent = texto;
    document.getElementById('glossario-textos').append(no);
    casos.set(texto, no.id);
  }
  return casos.get(texto);
}

function criarNos() {
  if (balao()) return;
  const dica = document.createElement('div');
  dica.id = 'dica';
  dica.className = 'dica';
  dica.setAttribute('role', 'tooltip');
  dica.hidden = true;
  document.body.append(dica);
  const textos = document.createElement('div');
  textos.id = 'glossario-textos';
  textos.hidden = true;
  for (const [id, { texto }] of Object.entries(GLOSSARIO)) {
    const no = document.createElement('span');
    no.id = idDoTexto(id);
    no.textContent = texto;
    textos.append(no);
  }
  document.body.append(textos);
}

// Cada elemento com uma dica do glossário aponta para o texto dela (sem perder outra descrição que já tenha) e, se não
// recebe o foco por si, passa a receber
function descrever(raiz) {
  const elementos = raiz.matches && raiz.matches('[data-dica]') ? [raiz] : [];
  elementos.push(...(raiz.querySelectorAll ? raiz.querySelectorAll('[data-dica]') : []));
  for (const el of elementos) {
    const id = el.dataset.dica;
    if (!Object.hasOwn(GLOSSARIO, id)) continue;
    // As descrições de outra origem ficam; as das dicas são refeitas (a dica ou o caso podem ter mudado). Na ordem do
    // balão: o caso deste elemento, depois a explicação do termo
    const outras = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(i => i && !/^(glossario|dica-caso)-/.test(i));
    const descricao = [...outras, el.dataset.dicaCaso && idDoCaso(el.dataset.dicaCaso), idDoTexto(id)].filter(Boolean).join(' ');
    if (el.getAttribute('aria-describedby') !== descricao) el.setAttribute('aria-describedby', descricao);
    if (!recebeFoco(el)) el.tabIndex = 0;
  }
}

function abrirDica(el, { toque = false } = {}) {
  const termo = GLOSSARIO[el.dataset.dica];
  const dica = balao();
  if (!termo || !dica) return;
  clearTimeout(espera);
  clearTimeout(saida);
  if (alvo && alvo !== el) fecharDica();
  alvo = el;
  porToque = toque;
  dica.replaceChildren();
  const titulo = document.createElement('strong');
  // data-dica-termo: o título com o caso deste elemento ("Voo fixo: Em Voo", "Reduzir 5 gal"), também só texto
  titulo.textContent = el.dataset.dicaTermo || termo.termo;
  // data-dica-caso: o caso deste elemento antes da explicação geral ("Abastecer até 22 gal…"), só texto
  dica.append(titulo, ' ', ...(el.dataset.dicaCaso ? [el.dataset.dicaCaso, ' '] : []), termo.texto);
  dica.hidden = false;
  posicionarJunto(dica, el);
  if (el.classList.contains('dica-btn')) el.setAttribute('aria-expanded', 'true');
}

function fecharDica() {
  clearTimeout(espera);
  clearTimeout(saida);
  const dica = balao();
  if (dica) dica.hidden = true;
  if (alvo && alvo.classList.contains('dica-btn')) alvo.setAttribute('aria-expanded', 'false');
  alvo = null;
  porToque = false;
}

// O botão "?" ao lado de um rótulo (o id é um termo do glossário; o rótulo vai no nome acessível)
export const botaoDeDica = (id, rotulo) =>
  `<button type="button" class="dica-btn" data-dica="${id}" aria-label="O que é ${rotulo.replace(/[&<>"']/g, '')}?" aria-expanded="false"></button>`;

export function iniciarDicas() {
  criarNos();
  descrever(document.body);
  // Os elementos novos e os que ganharam uma dica depois (o selo da escala aprovada)
  new MutationObserver(mudancas => {
    for (const m of mudancas) {
      if (m.type === 'attributes') descrever(m.target);
      else for (const no of m.addedNodes) if (no.nodeType === 1) descrever(no);
    }
    // O termo saiu da tela (a lista foi refeita): o balão fecha
    if (alvo && !alvo.isConnected) fecharDica();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dica', 'data-dica-caso'] });

  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    // De volta ao termo aberto ou chegando ao balão: ele fica
    if (alvo && (alvo.contains(e.target) || e.target.closest('#dica'))) { clearTimeout(saida); return; }
    const el = e.target.closest('[data-dica]');
    if (!el) return;
    clearTimeout(espera);
    espera = setTimeout(() => abrirDica(el), ESPERA_DO_MOUSE);
  });
  document.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-dica], #dica');
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    clearTimeout(espera);
    const doAberto = el === alvo || el.id === 'dica';
    if (doAberto && alvo && !porToque && document.activeElement !== alvo) {
      clearTimeout(saida);
      saida = setTimeout(fecharDica, ESPERA_PARA_FECHAR);
    }
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-dica]');
    if (el && el.matches(':focus-visible')) abrirDica(el);
  });
  document.addEventListener('focusout', e => {
    if (alvo && e.target === alvo && !porToque) fecharDica();
  });
  // Toque ou clique: o "?" e a etiqueta abrem e fecham; fora do termo e do balão, fecha
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-dica]');
    if (el && !temAcao(el)) {
      if (alvo === el && porToque) fecharDica();
      else abrirDica(el, { toque: true });
      return;
    }
    if (alvo && !e.target.closest('#dica')) fecharDica();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && alvo) {
      // A dica fecha primeiro; o Esc não chega à gaveta ou ao diálogo de trás
      e.stopPropagation();
      fecharDica();
    }
  }, true);
  const reposicionar = () => { if (alvo) posicionarJunto(balao(), alvo); };
  addEventListener('scroll', reposicionar, true);
  addEventListener('resize', reposicionar);
}

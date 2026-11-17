// Confirmar com dois cliques no mesmo botão
import { $ } from '../dom.js';
import { isGestor } from '../state.js';

// O único jeito de confirmar uma ação no app: o primeiro clique arma o botão (o texto e o nome lido pelo leitor de
// tela viram o pedido de confirmação; o ✕ fica vermelho); o segundo, em até 3,5 s, confirma. Sem o segundo, o botão
// volta a ser o que era
const CONFIRMACAO_MS = 3500;
const temporizadores = new WeakMap();
function desarmar(b) {
  clearTimeout(temporizadores.get(b));
  temporizadores.delete(b);
  b.dataset.arm = '';
  b.classList.remove('arm');
  b.textContent = b.dataset.o;
  if (b.dataset.rotulo !== undefined) b.setAttribute('aria-label', b.dataset.rotulo);
}
export const confirmado = (b, txt) => {
  if (b.dataset.arm) {
    desarmar(b);
    return true;
  }
  b.dataset.o = b.textContent;
  if (b.hasAttribute('aria-label')) {
    b.dataset.rotulo = b.getAttribute('aria-label');
    b.setAttribute('aria-label', `${txt}: ${b.dataset.rotulo}`);
  }
  b.dataset.arm = '1';
  b.classList.add('arm');
  b.textContent = txt;
  temporizadores.set(b, setTimeout(() => desarmar(b), CONFIRMACAO_MS));
  return false;
};
// Um botão fixo da tela que pede confirmação (quem só consulta não aciona)
export const comConfirmacao = (seletor, txt, fazer) => {
  $(seletor).onclick = e => {
    if (isGestor()) return;
    if (confirmado(e.currentTarget, txt)) fazer();
  };
};

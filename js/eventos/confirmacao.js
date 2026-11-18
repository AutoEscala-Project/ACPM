// Confirmar com dois cliques no mesmo botão
import { aindaNaoAbriu } from '../actions.js';
import { $, anunciar } from '../dom.js';
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
  // O nome volta ao de antes, a não ser que a linha tenha sido atualizada enquanto o botão estava armado (o aluno
  // renomeado, por exemplo): aí fica o nome novo
  if (b.dataset.rotulo !== undefined && b.getAttribute('aria-label') === b.dataset.armado) b.setAttribute('aria-label', b.dataset.rotulo);
  delete b.dataset.rotulo;
  delete b.dataset.armado;
}
export const confirmado = (b, txt) => {
  if (b.dataset.arm) {
    desarmar(b);
    return true;
  }
  b.dataset.o = b.textContent;
  if (b.hasAttribute('aria-label')) {
    b.dataset.rotulo = b.getAttribute('aria-label');
    b.dataset.armado = `${txt}: ${b.dataset.rotulo}`;
    b.setAttribute('aria-label', b.dataset.armado);
  }
  b.dataset.arm = '1';
  b.classList.add('arm');
  b.textContent = txt;
  anunciar(`${b.dataset.armado || txt}. Para confirmar, acione o botão de novo.`);
  temporizadores.set(b, setTimeout(() => desarmar(b), CONFIRMACAO_MS));
  return false;
};
// Um botão fixo da tela que pede confirmação (quem só consulta não aciona, nem antes de a escala abrir)
export const comConfirmacao = (seletor, txt, fazer) => {
  $(seletor).onclick = e => {
    if (isGestor() || aindaNaoAbriu()) return;
    if (confirmado(e.currentTarget, txt)) fazer();
  };
};

// Navegação entre as abas.
import { rBI } from './bi.js';
import { rCursos } from './cursos.js';
import { rRodizio } from './rodizio.js';

// No celular, a faixa das abas rola para o lado: a aba aberta por um botão de outra aba ("Abrir a Demanda", em Alunos)
// ou só em parte à vista vem inteira para a parte à vista da faixa (sem isso, a marca da aba aberta ficava fora da tela)
function mostrarNaFaixa(botao) {
  const faixa = botao && botao.closest('#nav');
  if (!faixa) return;
  const b = botao.getBoundingClientRect(), f = faixa.getBoundingClientRect();
  if (b.left < f.left) faixa.scrollLeft -= f.left - b.left;
  else if (b.right > f.right) faixa.scrollLeft += b.right - f.right;
}

export function show(t) {
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === 's-' + t));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  // A aba aberta (e o Manual, que abre pelo botão do topo) é dita ao leitor de tela, não só mostrada pela cor
  document.querySelectorAll('#nav button[data-t], #btn-manual').forEach(b => {
    if ((b.dataset.t || 'manual') === t) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  mostrarNaFaixa(document.querySelector(`#nav button[data-t="${t}"]`));
  if (t === 'bi') rBI();
  if (t === 'cur') rCursos();
  if (t === 'rod') rRodizio();
}

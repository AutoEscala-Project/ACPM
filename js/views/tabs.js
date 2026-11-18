// Navegação entre as abas.
import { rBI } from './bi.js';
import { rCursos } from './cursos.js';
import { rRodizio } from './rodizio.js';

export function show(t) {
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === 's-' + t));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  // A aba aberta (e o Manual, que abre pelo botão do topo) é dita ao leitor de tela, não só mostrada pela cor
  document.querySelectorAll('#nav button[data-t], #btn-manual').forEach(b => {
    if ((b.dataset.t || 'manual') === t) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (t === 'bi') rBI();
  if (t === 'cur') rCursos();
  if (t === 'rod') rRodizio();
}

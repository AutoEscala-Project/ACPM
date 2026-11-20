// A navegação: as abas (também pelo botão de uma aba que leva a outra, data-go), as vistas de cada aba (lista, por
// recurso, por instrutor, painel; dia e cadastro), os grupos que recolhem e os links para o Manual
import { carregarBI } from '../actions.js';
import { $, focarNoTitulo } from '../dom.js';
import { setTLMode } from '../state.js';
import { abrirAgenda } from '../views/agenda.js';
import { alternarTodosDoBI } from '../views/bi.js';
import { rOut, alternarTempo } from '../views/escala.js';
import { acaoDoPainel } from '../views/painel-aeroporto.js';
import { alternarGrupoDaFrota } from '../views/recursos.js';
import { show } from '../views/tabs.js';
import { mostrarVista, vistaDoBotao } from '../views/vistas.js';

// Uma aba escolhida pela pessoa enquanto os dados carregam não é trocada pela aba inicial do perfil
let abaEscolhida = false;
export const abaFoiEscolhida = () => abaEscolhida;

document.addEventListener('click', e => {
  const g = e.target.closest('[data-t],[data-go]');
  if (g) {
    abaEscolhida = true;
    const aba = g.dataset.t || g.dataset.go;
    show(aba);
    if (aba === 'bi') carregarBI();
    if (aba === 'age') abrirAgenda();
    window.scrollTo(0, 0);
    // O botão de dentro de uma aba que leva a outra ("Abrir a Demanda", em Alunos) some com a aba dele: o foco vai para o
    // título da aba aberta (sem isso, ele ficaria num botão escondido)
    if (g.dataset.go) focarNoTitulo($(`#s-${aba}`));
    return;
  }
  const tlBtn = e.target.closest('[data-tl]');
  if (tlBtn) {
    setTLMode(tlBtn.dataset.tl);
    rOut();
    return;
  }
  // Painel: os dois quadros ou um só, pausar a troca e tela cheia
  const fidsBtn = e.target.closest('[data-fids]');
  if (fidsBtn) {
    acaoDoPainel(fidsBtn.dataset.fids);
    return;
  }
  // Recolher e abrir: os horários da Lista (Escala) e as categorias da frota (Recursos)
  const tempo = e.target.closest('[data-recolher-tempo]');
  if (tempo) { alternarTempo(+tempo.dataset.recolherTempo); return; }
  const grupo = e.target.closest('[data-recolher-grupo]');
  if (grupo) { alternarGrupoDaFrota(grupo.dataset.recolherGrupo); return; }
  // As vistas de uma aba (Instrutores: Disponibilidade do dia e Cadastro)
  const vista = vistaDoBotao(e.target);
  if (vista) { mostrarVista(vista.aba, vista.vista); return; }
  const todosDoBI = e.target.closest('[data-bi-todos]');
  if (todosDoBI) { alternarTodosDoBI(todosDoBI.dataset.biTodos); return; }
  // Links para uma parte do Manual
  const manual = e.target.closest('[data-manual]');
  if (manual) {
    e.preventDefault();
    show('manual');
    $('#' + manual.dataset.manual).scrollIntoView({ block: 'start' });
    focarNoTitulo($('#' + manual.dataset.manual));
  }
});

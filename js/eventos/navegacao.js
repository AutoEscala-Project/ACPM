// A navegação: as abas (também pelo botão de uma aba que leva a outra, data-go), as vistas da Escala (por recurso, por
// instrutor, lista, painel), o eixo invertido do mapa e os recursos indisponíveis fora dele, os horários que recolhem na Lista e os links para o Manual
import { carregarBI } from '../actions.js';
import { $, focarNoTitulo } from '../dom.js';
import { setTLMode, setEixoInvertido, EIXO_INVERTIDO, setOcultarIndisponiveis, OCULTAR_INDISPONIVEIS } from '../state.js';
import { abrirAgenda } from '../views/agenda.js';
import { alternarTodosDoBI } from '../views/bi.js';
import { abrirConfigDoPainel } from '../views/config-do-painel.js';
import { rOut, alternarTempo } from '../views/escala.js';
import { acaoDoPainel } from '../views/painel-aeroporto.js';
import { show } from '../views/tabs.js';

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
  // Inverter eixo X:Y: o mapa com os recursos (ou os instrutores) nas colunas e as horas nas linhas, e de volta
  if (e.target.closest('#btn-eixo')) {
    setEixoInvertido(!EIXO_INVERTIDO);
    rOut();
    return;
  }
  // Ocultar indisponíveis: o mapa Por recurso sem as linhas dos recursos desligados na data, e de volta
  if (e.target.closest('#btn-indisponiveis')) {
    setOcultarIndisponiveis(!OCULTAR_INDISPONIVEIS);
    rOut();
    return;
  }
  // Painel: o quadro (Missões, os dois do aeroporto ou um só), pausar a troca, tela cheia e a configuração do painel
  const fidsBtn = e.target.closest('[data-fids]');
  if (fidsBtn) {
    if (fidsBtn.dataset.fids === 'configurar') abrirConfigDoPainel();
    else acaoDoPainel(fidsBtn.dataset.fids);
    return;
  }
  // Recolher e abrir os horários da Lista (Escala); as categorias da frota e as vistas de Recursos e de Instrutores ficam
  // nos módulos delas (js/eventos/recursos.js, js/eventos/instrutores.js)
  const tempo = e.target.closest('[data-recolher-tempo]');
  if (tempo) { alternarTempo(+tempo.dataset.recolherTempo); return; }
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

// Os controles das telas que não são navegação (as telas, a linha e o endereço ficam em js/views/telas.js e
// js/eventos/linha.js): as vistas da Escala (por recurso, por
// instrutor, lista, painel), o eixo do mapa (Inverter eixo X:Y) e os recursos indisponíveis fora dele, os horários que recolhem na Lista e os botões de todos do BI
import { setTLMode, setHorasNasColunas, HORAS_NAS_COLUNAS, setOcultarIndisponiveis, OCULTAR_INDISPONIVEIS } from '../state.js';
import { alternarTodosDoBI } from '../views/bi.js';
import { abrirConfigDoPainel } from '../views/config-do-painel.js';
import { rOut, alternarTempo } from '../views/escala.js';
import { acaoDoPainel } from '../views/painel-aeroporto.js';

document.addEventListener('click', e => {
  const tlBtn = e.target.closest('[data-tl]');
  if (tlBtn) {
    setTLMode(tlBtn.dataset.tl);
    rOut();
    return;
  }
  // Inverter eixo X:Y: o mapa com as horas nas colunas e um recurso (ou instrutor) por linha, e de volta aos recursos nas
  // colunas (o padrão)
  if (e.target.closest('#btn-eixo')) {
    setHorasNasColunas(!HORAS_NAS_COLUNAS);
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
  if (todosDoBI) alternarTodosDoBI(todosDoBI.dataset.biTodos);
});

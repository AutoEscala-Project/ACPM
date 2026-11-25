// A linha de produção: o desenho dela (js/redesenho.js) e o botão que mostra e esconde as tarefas das etapas, com a escolha
// guardada neste navegador (sem nada guardado, aberta só quando cabe numa fileira e a janela é alta)
import { $ } from '../dom.js';
import { registrarDesenho } from '../redesenho.js';
import { linhaAbertaPorPadrao } from '../telas.js';
import { rLinha, mostrarEstadoDaLinha } from '../views/linha.js';

const CHAVE = 'acpm_linha';

registrarDesenho('linha', rLinha, { em: ['dados', 'consulta', 'releitura', 'escala', 'perfil', 'pedidos'], ordem: 96 });

function estadoGuardado() {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'aberta' || valor === 'recolhida' ? valor : null;
  } catch {
    return null;
  }
}

mostrarEstadoDaLinha(estadoGuardado() || (linhaAbertaPorPadrao($('#linha').clientWidth, window.innerHeight) ? 'aberta' : 'recolhida'));

$('#btn-linha').onclick = () => {
  const estado = $('#linha').dataset.estado === 'aberta' ? 'recolhida' : 'aberta';
  mostrarEstadoDaLinha(estado);
  try {
    localStorage.setItem(CHAVE, estado);
  } catch {
    // Sem o armazenamento do navegador, a escolha vale até recarregar
  }
};

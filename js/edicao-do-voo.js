// A alteração de um voo feita na Escala (F1g, N10): o que ela grava e a escala que ela deixa. Na escala aprovada o motor
// não roda: só aquele voo muda, e a escala da tela é conferida de novo (js/conferencia.js, conferirEscala), sem pôr, mover
// ou tirar nenhum outro voo. Fora dela, o motor refaz a escala inteira (depois da pergunta, js/eventos/edicao-do-voo.js).
// Funções puras: recebem o estado e a escala e não leem a tela
import { runAllocationEngine } from './engine.js';
import { conferirEscala } from './conferencia.js';

// A escala que a alteração deixa (estado: o estado da escala depois dela). Na escala aprovada (aprovada), a da tela
// (resultado) conferida de novo, sem o motor (antes: o estado que fez a escala da tela; recusas: as que a reversão devolve).
// O pedido que entra no dia (sem pino, linha nem recusa: a reversão de um "✕" feito antes da aprovação) e a escala não
// aprovada pedem o motor, em volta dos voos fixos (R5). { resultado, motor: se o motor rodou }
export function escalaDaAlteracao(estado, resultado, { aprovada, antes = estado, recusas = [], motor = runAllocationEngine } = {}) {
  const conferida = aprovada && resultado ? conferirEscala(estado, resultado, { antes, recusas }) : null;
  return conferida ? { resultado: conferida, motor: false } : { resultado: motor(estado), motor: true };
}

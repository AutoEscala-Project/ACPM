// Rodízio: a posição de cada instrutor na fila da categoria (na data aberta)
import { gravarAlteracao } from '../actions.js';
import { CATEGORIAS_DO_RODIZIO, ajustarFilas } from '../rodizio.js';
import { S, insBy } from '../state.js';
import { aoAcionar } from './registro.js';
import { rRodizio } from '../views/rodizio.js';
import { registrarDesenho } from '../redesenho.js';

// O desenho do Rodízio (js/redesenho.js): outra data mostra as filas dela
registrarDesenho('rodizio', rRodizio, { em: ['dados'], ordem: 50 });

aoAcionar(['fila-subir', 'fila-descer', 'fila-inicio'], b => {
  const a = b.dataset.act;
  const cat = b.dataset.cat, insId = +b.dataset.id;
  S.filas = ajustarFilas(S.filas, S.ins);
  const fila = S.filas[cat].filter(x => x !== insId);
  const antes = S.filas[cat].indexOf(insId);
  const depois = a === 'fila-inicio' ? 0 : Math.max(0, Math.min(fila.length, antes + (a === 'fila-subir' ? -1 : 1)));
  fila.splice(depois, 0, insId);
  S.filas[cat] = fila;
  const categoria = CATEGORIAS_DO_RODIZIO.find(c => c.id === cat);
  gravarAlteracao('mod', `Rodízio · ${categoria.nome}: ${insBy(insId).nm} passou para ${depois + 1}º`);
  rRodizio();
});

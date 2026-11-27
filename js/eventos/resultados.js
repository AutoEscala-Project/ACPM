// O resultado da missão do curso, na linha do voo da Escala e em Alunos (o seletor data-resultado): o registro no
// servidor e a situação do aluno (js/resultado-na-tela.js, o mesmo do resultado sem voo e da colocação no curso, em
// js/eventos/alunos.js). É parte da Escala, que importa este módulo (e vooDaChave)
import { aindaNaoAbriu } from '../actions.js';
import { showToast } from '../dom.js';
import { ligada } from '../funcionalidades.js';
import { redesenharPorNome } from '../redesenho.js';
import { RES, DATA, isGestor } from '../state.js';
import { registrarResultadoNaTela } from '../resultado-na-tela.js';
import { cursoDoResultado } from '../views/etapas.js';
import { rOut } from '../views/escala.js';

// O voo da escala da data pela chave (null sem escala ou sem o voo)
export const vooDaChave = fKey => (RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey) : null);

// O resultado da missão do curso, na linha do voo (na Escala e em Alunos, "Nesta data"): no curso da missão do pedido
// (o aluno pode ter trocado de curso no mesmo dia). Sem conexão, o seletor volta ao que estava
document.addEventListener('change', async e => {
  const sel = e.target.closest('[data-resultado]');
  if (!sel || isGestor() || !ligada('progresso')) return;
  if (aindaNaoAbriu()) { rOut(); redesenharPorNome('alunos'); return; }
  const o = vooDaChave(sel.dataset.resultado), curso = o ? cursoDoResultado(o) : null;
  if (!o || !o.etapa || !curso) return;
  const registro = { aluno: o.stuId, curso, missao: o.etapa, resultado: sel.value, data: DATA, voo: o.fKey };
  sel.disabled = true;
  if (!await registrarResultadoNaTela(registro, { descricao: `Resultado de ${o.s} em ${o.etapa}: ${registro.resultado}` })) {
    showToast('Não foi possível registrar o resultado. Verifique a conexão e tente de novo.');
  }
  rOut(); redesenharPorNome('alunos', 'pedidos-do-dia');
});

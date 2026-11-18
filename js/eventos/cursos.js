// O programa dos cursos, em Alunos › Cursos
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { normalizarCursos, novaMissaoDoCurso, codigoValido } from '../cursos.js';
import { $, showToast } from '../dom.js';
import { duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import { rCursos, podeEditarCursos, atualizarLinhaDoPrograma } from '../views/cursos.js';

// O programa dos cursos, em Alunos › Cursos: só o Administrador (neste navegador, o Operador) muda. Incluir,
// subir, descer e tirar (com confirmação) refazem a tabela; os campos mudam no lugar. O código vale uma vez por curso
const ondeNoPrograma = el => { const tr = el.closest('tr[data-curso]'); return { curso: tr.dataset.curso, i: +tr.dataset.i, tr }; };
const mudarPrograma = (curso, lista) => { S.cursos = normalizarCursos({ ...normalizarCursos(S.cursos), [curso]: lista }); };
aoAcionar(['curso-nova', 'curso-remover', 'curso-subir', 'curso-descer'], b => {
  if (!podeEditarCursos()) return;
  const a = b.dataset.act;
  if (a === 'curso-nova') {
    const curso = b.dataset.curso, lista = normalizarCursos(S.cursos)[curso];
    const nova = novaMissaoDoCurso(curso, lista);
    mudarPrograma(curso, [...lista, nova]);
    gravarAlteracao('inc', `Programa do ${curso}: ${nova.id} incluída`);
    rCursos();
    $(`#cursos tr[data-curso="${curso}"][data-i="${lista.length}"] [data-cf="nome"]`).focus();
    return;
  }
  const { curso, i } = ondeNoPrograma(b);
  const lista = normalizarCursos(S.cursos)[curso], m = lista[i];
  if (!m) return;
  if (a === 'curso-remover') {
    if (!confirmado(b, 'Confirmar')) return;
    mudarPrograma(curso, lista.filter((_, j) => j !== i));
    gravarAlteracao('exc', `Programa do ${curso}: ${m.id} removida`);
    rCursos();
    return;
  }
  const j = a === 'curso-subir' ? i - 1 : i + 1;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  mudarPrograma(curso, lista);
  gravarAlteracao('mod', `Programa do ${curso}: ${m.id} passou para ${j + 1}ª`);
  rCursos();
  const mesmo = $(`#cursos tr[data-curso="${curso}"][data-i="${j}"] [data-act="${a}"]`);
  (mesmo && !mesmo.disabled ? mesmo : $(`#cursos tr[data-curso="${curso}"][data-i="${j}"] [data-cf="id"]`)).focus();
});
document.addEventListener('change', e => {
  const campo = e.target.closest('#cursos [data-cf]');
  if (!campo || !podeEditarCursos()) return;
  if (aindaNaoAbriu()) { rCursos(); return; }
  const { curso, i, tr } = ondeNoPrograma(campo);
  const lista = normalizarCursos(S.cursos)[curso];
  if (!lista[i]) return;
  const m = { ...lista[i] }, cf = campo.dataset.cf;
  if (cf === 'id') {
    const id = campo.value.trim().toUpperCase();
    const erro = !codigoValido(id) ? 'O código da missão usa letras, números, ponto e hífen (até 15).'
      : lista.some((o, j) => j !== i && o.id === id) ? `O código ${id} já existe no ${curso}.` : '';
    if (erro) { showToast(erro); campo.value = m.id; return; }
    m.id = id;
  } else if (cf === 'nb') {
    // As horas: de 0,1 h a 5 h, em décimos; fora disso, não vale
    const h = duracaoDigitada(campo.value);
    if (h === null) { showToast(ERRO_DA_DURACAO); campo.value = m.nb; return; }
    m.nb = h;
  } else {
    m[cf] = campo.value;
  }
  lista[i] = m;
  mudarPrograma(curso, lista);
  const salvo = normalizarCursos(S.cursos)[curso][i];
  gravarAlteracao('mod', `Programa do ${curso}: ${salvo.id} alterada`);
  atualizarLinhaDoPrograma(tr, salvo);
});

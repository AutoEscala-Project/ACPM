// Alunos: incluir, excluir, os campos de cada linha, "Priorizar com", "Não escalar com" e os filtros
import { gravarAlteracao } from '../actions.js';
import { normalizarCursoDoAluno } from '../cursos.js';
import { showToast, focusLast } from '../dom.js';
import { nomeLimpo, numeroBr } from '../format.js';
import { blank, pesoDoTexto, ERRO_DO_PESO } from '../rules.js';
import { S, insBy, stuBy } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rAlu, prepararFiltrosDosAlunos, filtrarAlunos, limparFiltrosDosAlunos, manterAlunoAVista, atualizarLinhaDoAluno, atualizarCanacDosAlunos } from '../views/alunos.js';
import { aoMudarDadosPessoais } from '../views/dados-pessoais.js';
import { rDem } from '../views/demanda.js';
import { rIns } from '../views/instrutores.js';

// A coluna CANAC acompanha os dados pessoais
aoMudarDadosPessoais(atualizarCanacDosAlunos);

// Filtros: o nome e o curso; as marcas ficam no filtro de vários valores, que ouve as próprias caixas
// (js/views/filtro-dos-cursos.js). "Limpar filtros" aparece na linha que diz que nenhum passa; sem data-act, ele vale
// também para quem só consulta
document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.flt === 'alu') filtrarAlunos({ nome: e.target.value });
});
prepararFiltrosDosAlunos();
document.addEventListener('click', e => {
  if (e.target.closest('[data-limpar-filtros="alu"]')) limparFiltrosDosAlunos();
});

// O aluno novo, também: com o nome selecionado, à vista mesmo fora da busca (até ela mudar)
aoAcionar('adds', () => {
  const newStu = { id: S.nid++, nm: 'Novo aluno', kg: 0, bl: [], extra: [], ...blank() };
  S.stu.push(newStu);
  manterAlunoAVista(newStu.id);
  gravarAlteracao('inc', `Aluno cadastrado: ${newStu.nm}`);
  rAlu(); rDem(); focusLast('#alu .nm');
});

aoAcionar('unbl', (b, { id }) => {
  const s = stuBy(id);
  const blkIns = insBy(+b.dataset.b);
  s.bl = s.bl.filter(v => v !== +b.dataset.b);
  gravarAlteracao('mod', `${s.nm}: volta a ser escalado com ${blkIns ? blkIns.nm : ''}`);
  atualizarLinhaDoAluno(s, { naoEscalar: true });
  rDem();
});

aoAcionar('unvc', (b, { id }) => {
  const s = stuBy(id);
  const ins = insBy(+b.dataset.b);
  s.voaCom = (s.voaCom || []).filter(v => v !== +b.dataset.b);
  if (!s.voaCom.length) delete s.voaCom;
  gravarAlteracao('mod', `${s.nm}: deixa de priorizar ${ins ? ins.nm : ''}`);
  atualizarLinhaDoAluno(s, { voaComMudou: true });
  rDem();
});

aoAcionar('dels', (b, { id }) => {
  if (!confirmado(b, 'Confirmar')) return;
  const target = stuBy(id);
  S.stu = S.stu.filter(x => x.id !== id);
  gravarAlteracao('exc', `Aluno excluído: ${target ? target.nm : id}`);
  rIns(); rAlu(); rDem();
});

// Os campos de um aluno
aoMudarCampo('s', (t, { f, id }) => {
  const s = stuBy(id);
  let historico = [];
  if (f === 'nm') {
    const old = s.nm;
    s.nm = nomeLimpo(t.value, s.nm);
    historico = ['mod', `Aluno: ${old} → ${s.nm}`];
  } else if (f === 'kg') {
    const kg = pesoDoTexto(t.value, t.validity.badInput);
    if (kg === null) { showToast(ERRO_DO_PESO); t.value = s.kg || ''; return; }
    s.kg = kg;
    historico = ['mod', `Peso ${s.nm}: ${numeroBr(s.kg)} kg`];
  } else if (f === 'bl' && t.value) {
    s.bl.push(+t.value);
    // Quem não voa com o aluno sai do “Priorizar com” dele
    if (s.voaCom) s.voaCom = s.voaCom.filter(v => v !== +t.value);
    if (s.voaCom && !s.voaCom.length) delete s.voaCom;
    const ins = insBy(+t.value);
    historico = ['exc', `${s.nm}: não escalar com ${ins ? ins.nm : ''}`];
  } else if (f === 'voaCom' && t.value) {
    s.voaCom = [...(s.voaCom || []), +t.value];
    const ins = insBy(+t.value);
    historico = ['mod', `${s.nm}: priorizar com ${ins ? ins.nm : ''}`];
  } else if (f === 'curso') {
    // O curso do aluno: qualquer sigla no formato (também a de um curso que o Administrador criou na aba Cursos)
    const curso = normalizarCursoDoAluno(t.value);
    if (curso) s.curso = curso;
    else delete s.curso;
    historico = ['mod', `Curso de ${s.nm}: ${curso || 'nenhum'}`];
  }
  gravarAlteracao(...historico);
  atualizarLinhaDoAluno(s, { naoEscalar: f === 'bl', voaComMudou: f === 'voaCom' });
  // A Demanda mostra o nome do aluno, o “Priorizar com” dele (no Automático do instrutor) e as missões do curso dele
  if (['nm', 'voaCom', 'bl', 'curso'].includes(f)) rDem();
});

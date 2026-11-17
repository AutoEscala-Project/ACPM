// A missão do curso no dia: a próxima missão de cada aluno (para a Demanda), o progresso (para Alunos) e o resultado de
// cada voo (para a escala). Os resultados chegam com a data (S.resultados: a situação de cada missão e os registros da
// data) e não são gravados no dia. A próxima missão e o progresso seguem as regras do programa (js/progresso.js).
import { MIS } from '../config.js';
import { normalizarCursos } from '../cursos.js';
import { programaDoLegado, indiceDoPrograma, rotuloDaFase } from '../programa.js';
import { proximasMissoes, progressoNoCurso, missoesDoDia } from '../progresso.js';
import { situacaoPorMissao, resultadoDoVoo } from '../resultados.js';
import { S, isGestor, stuBy, dadoIndisponivel } from '../state.js';
import { esc, opts, fmtDurLabel } from '../format.js';

const resultados = () => S.resultados || { situacao: [], doDia: [] };
// A situação de cada missão, calculada uma vez por leitura dos resultados (registrar um resultado troca a lista)
const situacoes = new WeakMap();
function situacao() {
  const registros = resultados().situacao || [];
  if (!situacoes.has(registros)) situacoes.set(registros, situacaoPorMissao(registros));
  return situacoes.get(registros);
}

// O programa do cadastro (cada curso numa fase só, com as missões na ordem do voo), refeito só quando ele muda (a
// edição troca S.cursos)
let doCadastro = null;
function programaDoCadastro() {
  if (!doCadastro || doCadastro.cursos !== S.cursos) {
    doCadastro = { cursos: S.cursos, programa: programaDoLegado(normalizarCursos(S.cursos), (s, c) => s + ':' + c) };
  }
  return doCadastro.programa;
}

// O programa de onde saem a próxima missão, o progresso e a missão dos pedidos da agenda: nenhum quando faltam os
// resultados ou os programas (nada é inferido de uma situação vazia); até os cursos virem das tabelas, o do cadastro
export function programaParaInferir() {
  if (['resultados', 'cursos', 'cursos-pendentes'].some(parte => dadoIndisponivel(parte))) return [];
  return S.programa ?? programaDoCadastro();
}
const cursoDoAluno = stu => (stu.curso && indiceDoPrograma(programaParaInferir()).curso(stu.curso)) || null;

// A próxima missão para um pedido do aluno: a primeira liberada do programa. As missões dos outros pedidos dele no dia
// (que voam e não foram cancelados) contam como feitas e não voltam. O código vai como id: é a etapa do pedido
export function proximaDoPedido(stu, mid) {
  const curso = cursoDoAluno(stu);
  if (!curso) return null;
  const doDia = missoesDoDia(curso, stu, { fStatus: S.fStatus, mid: mid || 0 });
  const { padrao } = proximasMissoes(curso, situacao(), stu.id, { planejadas: doDia, exceto: doDia });
  return padrao && { id: padrao.codigo, nome: padrao.nome, mis: padrao.mis, eq: padrao.eq, nb: padrao.nb };
}

const descricaoDaMissao = m => `${m.id}: ${m.nome} · ${m.mis} · ${MIS[m.mis].isGround ? '1h30' : fmtDurLabel(m.nb)}${MIS[m.mis].isGround ? '' : ` · ${m.eq}`}`;

// Na Demanda: o código do pedido, ou o botão com a próxima missão do programa
export function etapaNaDemanda(stu, d, mid) {
  if (d.etapa) return ` <span class="etapa" title="Missão do curso ${esc(stu.curso || '')}">${esc(d.etapa)}</span>`;
  const proxima = proximaDoPedido(stu, mid);
  return proxima
    ? ` <button type="button" class="btn quiet edit-only usar-proxima" data-act="usar-proxima" data-id="${esc(stu.id)}" data-mid="${esc(mid)}" title="${esc(descricaoDaMissao(proxima))}">Próxima: ${esc(proxima.id)} · Usar</button>`
    : '';
}

// Em Alunos: as aprovadas sobre as missões que contam (a dispensada não conta), a fase em que o aluno está (quando o
// curso tem mais de uma) e a próxima missão
export function progressoDoAluno(stu) {
  const curso = cursoDoAluno(stu);
  if (!curso) return '';
  const { aprovadas, total, faseAtual, proxima } = progressoNoCurso(curso, situacao(), stu.id);
  if (!total) return '';
  const fase = faseAtual && indiceDoPrograma(programaParaInferir()).percurso(curso.sigla).fases.length > 1 ? ` · ${esc(rotuloDaFase(faseAtual))}` : '';
  return `<small class="progresso" data-dica="progresso">${aprovadas}/${total}${fase}${proxima ? ` · próxima ${esc(proxima.codigo)}` : ' · concluído'}</small>`;
}

// Na escala, com o status do aluno: o código da missão do curso e o resultado (o operador registra; os outros veem)
export function resultadoNaEscala(o) {
  if (!o.etapa) return '';
  const registrado = resultadoDoVoo(resultados().doDia, o.fKey);
  const atual = ['aprovado', 'reprovado'].includes(registrado) ? registrado : 'pendente';
  const stu = stuBy(o.stuId);
  const codigo = `<span class="etapa" data-dica="missao-do-curso">${esc(o.etapa)}</span>`;
  if (isGestor() || !stu || !stu.curso) {
    return `<span class="resultado">${codigo}${atual !== 'pendente' ? ` <span class="res res-${atual}">${atual === 'aprovado' ? 'Aprovado' : 'Reprovado'}</span>` : ''}</span>`;
  }
  return `<span class="resultado">${codigo} <select class="res-sel res-${atual}" data-resultado="${esc(o.fKey)}" aria-label="Resultado de ${esc(o.s)} em ${esc(o.etapa)}" data-dica="resultado"${dadoIndisponivel('resultados') ? ' disabled' : ''}>${opts([['pendente', 'Resultado'], ['aprovado', 'Aprovado'], ['reprovado', 'Reprovado']], atual)}</select></span>`;
}

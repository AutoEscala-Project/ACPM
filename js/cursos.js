// Cursos: o programa de cada curso (PP, PC e INVA), mantido no app pelo Administrador, e o curso de cada
// aluno. Cada missão do programa tem um código (PP-07), um nome, o tipo de missão do app, o recurso e as horas; a ordem
// do programa é a ordem em que o aluno voa.
import { MIS, GROUND_DURATION_H } from './config.js';
import { duracaoValida } from './rules.js';

export const CURSOS = [['PP', 'Piloto Privado'], ['PC', 'Piloto Comercial'], ['INVA', 'Instrutor de Voo']];
const CODIGO = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const SIGLA = /^[A-Z][A-Z0-9-]{0,8}[A-Z0-9]$/;
const LIMITE_DE_MISSOES = 200, LIMITE_DO_NOME = 80;

export const cursosVazios = () => Object.fromEntries(CURSOS.map(([id]) => [id, []]));
// O código de uma missão: letras maiúsculas, números, ponto e hífen, até 15
export const codigoValido = id => CODIGO.test(id);
// A sigla de um curso (PP, PC-IFR), como no servidor: de 2 a 10 letras maiúsculas, números e hífen, começando por letra
// e sem hífen no fim. Vale para os cursos que o Administrador cria também
export const siglaValida = sigla => typeof sigla === 'string' && SIGLA.test(sigla);

// Uma missão do programa, nos formatos certos; null quando não serve (sem código ou missão desconhecida)
function normalizarMissao(m) {
  if (!m || typeof m !== 'object') return null;
  const id = typeof m.id === 'string' ? m.id.trim().toUpperCase() : '';
  if (!CODIGO.test(id) || !Object.hasOwn(MIS, m.mis)) return null;
  const regra = MIS[m.mis];
  const nome = typeof m.nome === 'string' ? m.nome.trim().replace(/\s+/g, ' ').slice(0, LIMITE_DO_NOME) : '';
  // As horas fracionadas, até 5 h, como na Demanda
  const nb = regra.isGround ? GROUND_DURATION_H : duracaoValida(m.nb);
  return { id, nome: nome || id, mis: m.mis, eq: regra.eq.includes(m.eq) ? m.eq : regra.defEq, nb };
}

// Os três cursos, cada um com as missões válidas, sem código repetido
export function normalizarCursos(cursos) {
  const dados = cursos && typeof cursos === 'object' ? cursos : {};
  return Object.fromEntries(CURSOS.map(([curso]) => {
    const vistos = new Set();
    const missoes = (Array.isArray(dados[curso]) ? dados[curso] : []).map(normalizarMissao)
      .filter(m => m && !vistos.has(m.id) && vistos.add(m.id)).slice(0, LIMITE_DE_MISSOES);
    return [curso, missoes];
  }));
}

// O curso do aluno: a sigla, conferida só no formato. Um curso que não está em CURSOS (criado pelo Administrador nas
// tabelas dos cursos) continua valendo: a matrícula não se perde na próxima gravação
export const normalizarCursoDoAluno = c => (siglaValida(c) ? c : undefined);

// A missão nova do programa: o próximo número livre do curso (PP-01, PP-02…), um voo local de 1 h no C152
export function novaMissaoDoCurso(curso, missoes) {
  const numeros = missoes.map(m => new RegExp(`^${curso}-(\\d+)$`).exec(m.id)).filter(Boolean).map(r => +r[1]);
  const proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return { id: `${curso}-${String(proximo).padStart(2, '0')}`, nome: '', mis: 'Voo Local', eq: 'C152', nb: 1 };
}

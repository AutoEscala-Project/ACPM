// Resultados das missões dos cursos. O operador registra aprovado ou reprovado na linha do voo (pendente
// desfaz um engano); os registros só crescem, e a situação de cada missão é o último registro do aluno, curso e
// missão (a reprovada volta a faltar). A próxima missão e o progresso saem dela (js/progresso.js). As regras do
// registro são as do servidor (supabase/migrations/…_resultados_de_missao.sql e …_cursos_e_missoes.sql).
import { siglaValida, codigoValido } from './cursos.js';
import { CHAVE_DO_VOO } from './voo.js';
import { dataIsoValida } from './format.js';

const RESULTADOS = ['aprovado', 'reprovado', 'pendente'];
const chave = (aluno, curso, missao) => `${aluno}|${curso}|${missao}`;

// O último registro de cada aluno, curso e missão (a ordem dos registros é a ordem em que foram feitos)
export function situacaoPorMissao(registros) {
  const mapa = new Map();
  [...(registros || [])].sort((p, q) => (p.id || 0) - (q.id || 0)).forEach(r => mapa.set(chave(r.aluno, r.curso, r.missao), r));
  return mapa;
}
// O último registro do aluno, curso e missão (o resultado e a data do voo), ou null
export const registroDa = (mapa, aluno, curso, missao) => mapa.get(chave(aluno, curso, missao)) || null;
export const situacaoDa = (mapa, aluno, curso, missao) => {
  const r = mapa.get(chave(aluno, curso, missao));
  return r ? r.resultado : 'pendente';
};

// O resultado registrado para um voo da escala do dia (o último), ou null
export function resultadoDoVoo(registrosDoDia, voo) {
  const dele = (registrosDoDia || []).filter(r => r.voo === voo).sort((p, q) => (p.id || 0) - (q.id || 0));
  return dele.length ? dele.at(-1).resultado : null;
}

// O registro nos formatos do servidor (a sigla do curso, o código em maiúsculas); fora deles, o erro do servidor
// (23514). cursos: as siglas dos cursos que existem (o servidor recusa o curso desconhecido, também com 23514, antes de
// conferir o resto); sem a lista, só o formato
export function validarRegistro({ aluno, curso, missao, resultado, data, voo = null }, { cursos = null } = {}) {
  if (cursos && !cursos.includes(curso)) throw Object.assign(new Error('curso desconhecido'), { code: '23514' });
  const codigo = typeof missao === 'string' ? missao.trim().toUpperCase() : '';
  const certo = Number.isInteger(aluno) && aluno > 0 && siglaValida(curso) && codigoValido(codigo)
    && RESULTADOS.includes(resultado) && dataIsoValida(data) && (voo === null || CHAVE_DO_VOO.test(voo));
  if (!certo) throw Object.assign(new Error('resultado fora do formato'), { code: '23514' });
  return { aluno, curso, missao: codigo, resultado, data, voo };
}

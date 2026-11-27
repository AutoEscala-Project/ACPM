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

// O último resultado do aluno no curso que vale (aprovado ou reprovado: o pendente desfaz), entre os de cada missão
// (registros: a situação, o último registro de cada missão), pela data do resultado e depois pela hora do registro: a
// "Missão anterior" de Alunos. null: nenhum. A lista é indexada uma vez (a tela pergunta por cada aluno)
const indices = new WeakMap();
export function ultimoResultadoDoAluno(registros, aluno, curso) {
  if (!Array.isArray(registros)) return null;
  if (!indices.has(registros)) {
    const ultimo = new Map();
    const depois = (r, q) => r.data > q.data || (r.data === q.data && String(r.registrado_em || '') > String(q.registrado_em || ''));
    for (const r of registros) {
      if (!r || !['aprovado', 'reprovado'].includes(r.resultado)) continue;
      const k = `${r.aluno}|${r.curso}`;
      if (!ultimo.has(k) || depois(r, ultimo.get(k))) ultimo.set(k, r);
    }
    indices.set(registros, ultimo);
  }
  return indices.get(registros).get(`${aluno}|${curso}`) || null;
}

// "Registrar resultado sem voo" (Alunos): a data do registro começa na data aberta quando ela não é depois de hoje (o app
// abre em amanhã: um registro de amanhã passaria à frente de um voo de verdade de hoje), senão hoje. Datas AAAA-MM-DD
export const dataDoResultadoSemVoo = (aberta, hoje) => (aberta <= hoje ? aberta : hoje);
// O voo do aluno com a missão do curso na escala da data (o primeiro pelo horário), ou null: a missão com voo é
// registrada no voo (o resultado do voo é achado pelo voo)
export function vooDaMissao(out, aluno, codigo) {
  const voos = (Array.isArray(out) ? out : []).filter(o => o.stuId === aluno && o.etapa === codigo);
  return voos.length ? voos.reduce((p, o) => (o.a < p.a ? o : p)) : null;
}

// O ↶ de "Colocar no curso até…" (Alunos; mapa: situacaoPorMissao): cada missão volta ao resultado de antes (voltar) só
// se o último registro dela ainda é o aprovado sem voo da colocação (na data dela, quando a reversão a guardou). A que
// ganhou outro registro depois (o resultado do voo, outro sem voo) fica com o de agora (mudadas: desfazer apagaria esse
// resultado, como o status mudado depois de "Dar a vaga"); a que já está no resultado de antes (a reversão anterior que
// parou no meio) fica de fora
export function paraDesfazerColocacao(mapa, { aluno, curso, missoes, data = null }) {
  const voltar = [], mudadas = [];
  for (const m of missoes) {
    const r = registroDa(mapa, aluno, curso, m.missao);
    const atual = r ? r.resultado : 'pendente';
    if (atual === m.resultado) continue;
    if (r && r.resultado === 'aprovado' && !r.voo && (!data || r.data === data)) voltar.push(m);
    else mudadas.push({ missao: m.missao, resultado: atual });
  }
  return { voltar, mudadas };
}

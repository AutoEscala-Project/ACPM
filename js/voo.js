// O voo da escala: a chave (aluno_missão_1: um pedido é um voo só), o status em vigor e a unidade. Os alunos de uma
// turma de Ground têm uma linha cada, mas ocupam a sala e o instrutor uma vez só: a unidade é a turma.

export const CHAVE_DO_VOO = /^\d+_\d+_\d+$/;
export const chaveDoVoo = (stuId, mid) => `${stuId}_${mid}_1`;

// O status marcado no dia (fStatus) vale mais que o da linha da escala
export const statusDoVoo = (voo, fStatus) => (fStatus && fStatus[voo.fKey]) || voo.status || 'Confirmado';

export const unidadeDoVoo = voo => voo.classKey || voo.fKey;

// Uma linha por unidade (a última de cada), na ordem em que a unidade aparece
export const umPorUnidade = lista => [...new Map(lista.map(voo => [unidadeDoVoo(voo), voo])).values()];

// O pedido de um voo: o do próprio aluno (missão 0) ou uma das missões extras dele
export const pedidoDoAluno = (aluno, mid) => (mid ? (aluno.extra || []).find(ex => ex.mid === mid) : aluno);
export const pedidosDosVoos = alunos => {
  const porId = new Map(alunos.map(s => [s.id, s]));
  return voo => {
    const aluno = porId.get(voo.stuId);
    return aluno && pedidoDoAluno(aluno, voo.mid);
  };
};

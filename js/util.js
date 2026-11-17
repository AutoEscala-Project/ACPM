// Utilitários de listas
export const soma = lista => lista.reduce((total, v) => total + v, 0);
export const agrupar = (lista, chave) => lista.reduce((grupos, o) => grupos.set(chave(o), [...(grupos.get(chave(o)) || []), o]), new Map());
// Para o sort, do menor para o maior: a - b daria NaN com Infinity dos dois lados
export const menorPrimeiro = (a, b) => (a === b ? 0 : a - b);

// Os minutos parados entre os blocos de uma lista de intervalos [início, fim], em ordem; os intervalos que se encostam ou
// se sobrepõem formam um bloco só
export function paradasEntre(intervalos) {
  const lista = [];
  let fim = null;
  for (const [a, b] of [...intervalos].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
    if (fim !== null && a > fim) lista.push(a - fim);
    fim = fim === null ? b : Math.max(fim, b);
  }
  return lista;
}

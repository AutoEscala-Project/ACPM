// Utilitários de listas usados pelo motor, pela compactação, pelas métricas e pelas sugestões de conflito
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { soma, agrupar, menorPrimeiro, paradasEntre } from '../../js/util.js';

describe('Utilitários de listas', () => {
  it('soma: o total de uma lista de números (vazia, 0)', () => {
    assert.equal(soma([1, 2, 3.5]), 6.5);
    assert.equal(soma([]), 0);
  });

  it('agrupar: um Map da chave para os itens, na ordem em que aparecem', () => {
    const grupos = agrupar([{ i: 1, k: 'a' }, { i: 2, k: 'b' }, { i: 3, k: 'a' }], o => o.k);
    assert.deepEqual([...grupos.keys()], ['a', 'b']);
    assert.deepEqual(grupos.get('a').map(o => o.i), [1, 3]);
  });

  it('menorPrimeiro: ordena do menor para o maior, com Infinity empatando com Infinity', () => {
    assert.deepEqual([3, Infinity, 1, Infinity, 2].sort(menorPrimeiro), [1, 2, 3, Infinity, Infinity]);
    assert.equal(menorPrimeiro(Infinity, Infinity), 0);
  });

  it('paradasEntre: os minutos parados entre os blocos (os intervalos que se encostam ou se sobrepõem são um bloco só)', () => {
    const intervalos = [[600, 660], [390, 450], [450, 500], [480, 540], [700, 760]];
    assert.deepEqual(paradasEntre(intervalos), [60, 40]);
    assert.deepEqual(intervalos[0], [600, 660], 'a lista recebida fica como estava');
    assert.deepEqual(paradasEntre([]), []);
    assert.deepEqual(paradasEntre([[390, 450]]), []);
  });
});

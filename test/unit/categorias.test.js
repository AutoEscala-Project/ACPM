// Categorias de recurso dos filtros da Escala e de Recursos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, categoriaDoTipo } from '../../js/categorias.js';

describe('Categorias de recurso', () => {
  it('na ordem da operação: C152, C172, Simulador, PA-34 e Sala Ground', () => {
    assert.deepEqual(CATEGORIAS.map(c => c.nome), ['C152', 'C172', 'Simulador', 'PA-34', 'Sala Ground']);
  });

  it('a categoria de um tipo (vale também para um recurso que já saiu da frota)', () => {
    assert.deepEqual(['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi', 'Sala Ground', 'Boeing'].map(categoriaDoTipo),
      ['C152', 'C172', 'PA-34', 'sim', 'sim', 'ground', null]);
  });
});

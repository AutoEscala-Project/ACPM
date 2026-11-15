// O auxiliar de contraste dos testes de acessibilidade confere com os valores conhecidos da WCAG
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { razaoDeContraste } from '../helpers/contraste.js';

describe('Razão de contraste (WCAG)', () => {
  it('preto e branco: 21; a ordem não importa; cor igual: 1', () => {
    assert.equal(razaoDeContraste('rgb(0, 0, 0)', 'rgb(255, 255, 255)'), 21);
    assert.equal(razaoDeContraste('rgb(255, 255, 255)', 'rgb(0, 0, 0)'), 21);
    assert.equal(razaoDeContraste('rgb(18, 38, 58)', 'rgb(18, 38, 58)'), 1);
  });
  it('o cinza #767676 sobre o branco fica logo acima de 4,5', () => {
    assert.equal(razaoDeContraste('rgb(118, 118, 118)', 'rgba(255, 255, 255, 1)').toFixed(2), '4.54');
  });
  it('recusa uma cor fora do formato do navegador', () => {
    assert.throws(() => razaoDeContraste('#fff', 'rgb(0, 0, 0)'), /formato/);
  });
});

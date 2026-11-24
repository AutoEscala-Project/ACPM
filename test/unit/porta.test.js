// A porta de cada pasta (scripts/porta.mjs): duas pastas do mesmo repositório (worktrees) rodam o app e os testes E2E ao
// mesmo tempo, cada uma nas suas portas, sem que os testes de uma abram os arquivos da outra
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { portaDaPasta } from '../../scripts/porta.mjs';

describe('portaDaPasta', () => {
  it('4200 + 2 × (os seis primeiros dígitos do sha1 da pasta, módulo 350): par, de 4200 a 4898', () => {
    const pasta = '/Users/alguem/ACPM';
    const n = parseInt(createHash('sha1').update(pasta).digest('hex').slice(0, 6), 16);
    assert.equal(portaDaPasta(pasta), 4200 + 2 * (n % 350));
    for (const outra of ['/a', '/b/c', '/Users/alguem/ACPM/.redesenho/wt-f0a', 'C:\\ACPM']) {
      const porta = portaDaPasta(outra);
      assert.ok(porta >= 4200 && porta <= 4898 && porta % 2 === 0, `${outra}: ${porta}`);
    }
  });

  it('a mesma pasta dá sempre a mesma porta, com ou sem a barra no fim; pastas diferentes, em geral, outras', () => {
    assert.equal(portaDaPasta('/Users/alguem/ACPM/'), portaDaPasta('/Users/alguem/ACPM'));
    assert.equal(portaDaPasta('/Users/alguem/ACPM'), portaDaPasta('/Users/alguem/ACPM'));
    const portas = new Set(['/x/ACPM', '/x/wt-f0a', '/x/wt-f0b', '/x/wt-f0c', '/x/wt-f3'].map(portaDaPasta));
    assert.ok(portas.size >= 4);
  });

  it('a porta seguinte (a dos testes E2E) nunca é a de outra pasta', () => {
    // As portas das pastas são pares: a + 1 de uma é ímpar e não coincide com a porta do app de nenhuma
    for (const pasta of ['/a', '/b', '/c']) assert.equal((portaDaPasta(pasta) + 1) % 2, 1);
  });
});

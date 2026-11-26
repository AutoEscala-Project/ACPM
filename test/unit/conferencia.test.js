// A conferência dos voos fixos (js/conferencia.js). Nenhum golden tem voo fixo, então eles não guardam a saída da
// conferência do motor: test/fixtures/conferencia-do-motor.json foi gravado do motor antes de ela sair de js/engine.js (a
// escala aprovada, os fixos pelo status, o instrutor escolhido, os agendados e os quatro juntos, em 300 sementes), e o
// motor depois devolve a mesma saída, dia a dia
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAllocationEngine } from '../../js/engine.js';
import { TIPOS_DE_PINO, SEMENTES_DOS_PINOS, diaComPinos, impressaoDaSaida } from '../helpers/pinos.js';

const GRAVADA = JSON.parse(readFileSync(new URL('../fixtures/conferencia-do-motor.json', import.meta.url), 'utf8'));

describe('O motor com voos fixos: a mesma saída de antes da conferência sair dele', () => {
  it('a gravação tem voos fixos, conflitos, avisos e recusas (o teste não passa por falta deles)', () => {
    const { contagem } = GRAVADA;
    assert.ok(contagem.fixos > 10000 && contagem.conflitos > 3000 && contagem.avisos > 3000 && contagem.recusas > 5000, JSON.stringify(contagem));
  });

  for (const tipo of TIPOS_DE_PINO) {
    it(`${tipo}: em 300 sementes, a saída gravada`, () => {
      const diferentes = SEMENTES_DOS_PINOS.filter(seed => impressaoDaSaida(runAllocationEngine(diaComPinos(seed, tipo))) !== GRAVADA.dias[seed][tipo]);
      assert.deepEqual(diferentes, []);
    });
  }
});

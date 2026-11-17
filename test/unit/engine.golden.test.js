// O motor continua produzindo exatamente a escala aprovada de cada cenário (test/fixtures/goldens-do-motor/, gravada
// por scripts/capturar-goldens-motor.mjs). Uma mudança intencional no motor regrava os goldens, e o diff deles, um voo
// por linha, mostra no PR o que mudou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { runAllocationEngine } from '../../js/engine.js';
import { gerarCenario, hashEstado } from '../helpers/cenarios.js';
import { ARQUIVOS, PASTA, formatarGolden, lerArquivo, lerGoldens } from '../helpers/goldens.js';

const goldens = lerGoldens();
const semIndefinidos = valor => JSON.parse(JSON.stringify(valor));

test('cenário de exemplo mantém a escala aprovada', () => {
  assert.deepEqual(semIndefinidos(runAllocationEngine(goldens.exemplo.estado)), goldens.exemplo.saida);
});

for (const { seed, hash, saida } of goldens.cenarios) {
  test(`cenário aleatório #${seed} mantém a escala aprovada`, () => {
    const estado = gerarCenario(seed);
    assert.equal(hashEstado(estado), hash, 'o gerador de cenários mudou: recapture os goldens');
    assert.deepEqual(semIndefinidos(runAllocationEngine(estado)), saida);
  });
}

test('os goldens são os arquivos esperados, cada um no formato de revisão (um voo por linha)', () => {
  assert.deepEqual(readdirSync(PASTA).sort(), [...ARQUIVOS].sort());
  for (const nome of ARQUIVOS) {
    const texto = lerArquivo(nome);
    assert.equal(formatarGolden(JSON.parse(texto)), texto, `${nome} fora do formato: regrave com scripts/capturar-goldens-motor.mjs`);
  }
});

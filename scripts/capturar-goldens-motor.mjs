// Grava a saída APROVADA do motor de alocação (js/engine.js) para os cenários de test/unit/engine.golden.test.js.
// Rode somente depois de uma mudança intencional nas regras do motor e revise a diferença no PR.
// Uso: node scripts/capturar-goldens-motor.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { runAllocationEngine } from '../js/engine.js';
import { gerarCenario, hashEstado } from '../test/helpers/cenarios.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const DESTINO = new URL('../test/fixtures/motor-goldens.json', import.meta.url);
const semIndefinidos = valor => JSON.parse(JSON.stringify(valor));

// O estado do cenário de exemplo (roster sintético + um dia de demanda) não é gerado: fica só no arquivo de goldens
const { exemplo: { estado: estadoExemplo } } = JSON.parse(await readFile(DESTINO, 'utf8'));

const exemplo = { estado: estadoExemplo, saida: semIndefinidos(runAllocationEngine(estadoExemplo)) };
const cenarios = SEEDS.map(seed => {
  const estado = gerarCenario(seed);
  return { seed, hash: hashEstado(estado), saida: semIndefinidos(runAllocationEngine(estado)) };
});

await writeFile(DESTINO, JSON.stringify({ origem: 'js/engine.js', exemplo, cenarios }) + '\n');
const total = cenarios.reduce((n, c) => n + c.saida.out.length, 0);
console.log(`${cenarios.length} cenários + exemplo gravados (${total} lançamentos) em ${DESTINO.pathname}`);

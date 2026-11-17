// Grava a saída APROVADA do motor de alocação (js/engine.js) para os cenários de test/unit/engine.golden.test.js, em
// test/fixtures/goldens-do-motor/ (um arquivo por cenário, um voo por linha). Rode somente depois de uma mudança
// intencional nas regras do motor e revise a diferença no PR. O estado do exemplo não é regravado: é a entrada do cenário.
// Uso: node scripts/capturar-goldens-motor.mjs
import { writeFile } from 'node:fs/promises';
import { runAllocationEngine } from '../js/engine.js';
import { gerarCenario, hashEstado } from '../test/helpers/cenarios.js';
import { PASTA, SEEDS, ARQUIVO_DO_EXEMPLO, arquivoDoCenario, formatarGolden, lerGoldens } from '../test/helpers/goldens.js';

const semIndefinidos = valor => JSON.parse(JSON.stringify(valor));
const gravar = (nome, valor) => writeFile(new URL(nome, PASTA), formatarGolden(valor));

const { exemplo: { estado: estadoDoExemplo } } = lerGoldens();
await gravar(ARQUIVO_DO_EXEMPLO, semIndefinidos(runAllocationEngine(estadoDoExemplo)));
let total = 0;
for (const seed of SEEDS) {
  const estado = gerarCenario(seed);
  const saida = semIndefinidos(runAllocationEngine(estado));
  total += saida.out.length;
  await gravar(arquivoDoCenario(seed), { seed, hash: hashEstado(estado), ...saida });
}
console.log(`${SEEDS.length} cenários + exemplo gravados (${total} lançamentos nos cenários) em ${PASTA.pathname}`);

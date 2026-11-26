// Grava a saída do motor de alocação (js/engine.js) nos dias com voos fixos de test/helpers/pinos.js (a escala aprovada,
// os voos fixos pelo status, o instrutor escolhido na Escala, os agendados e os quatro juntos, em 300 sementes), em
// test/fixtures/conferencia-do-motor.json: uma impressão (sha-256) por dia. test/unit/conferencia.test.js confere que o
// motor devolve a mesma saída. Gravada antes de a conferência dos voos fixos sair do motor (js/conferencia.js); rode de
// novo somente depois de uma mudança intencional nas regras do motor e revise a diferença no PR.
// Uso: node scripts/capturar-conferencia-motor.mjs
import { writeFile } from 'node:fs/promises';
import { runAllocationEngine } from '../js/engine.js';
import { TIPOS_DE_PINO, SEMENTES_DOS_PINOS, diaComPinos, impressaoDaSaida } from '../test/helpers/pinos.js';

const dias = {};
const contagem = { voos: 0, fixos: 0, conflitos: 0, avisos: 0, recusas: 0 };
for (const seed of SEMENTES_DOS_PINOS) {
  dias[seed] = {};
  for (const tipo of TIPOS_DE_PINO) {
    const saida = runAllocationEngine(diaComPinos(seed, tipo));
    dias[seed][tipo] = impressaoDaSaida(saida);
    contagem.voos += saida.out.length;
    contagem.fixos += saida.out.filter(o => o.fixo).length;
    contagem.conflitos += saida.out.filter(o => o.conflito).length;
    contagem.avisos += saida.al.filter(a => a.t === 'warn').length;
    contagem.recusas += saida.al.filter(a => a.t === 'err').length;
  }
}
await writeFile(new URL('../test/fixtures/conferencia-do-motor.json', import.meta.url), `${JSON.stringify({ contagem, dias }, null, 1)}\n`);
console.log(`${SEMENTES_DOS_PINOS.length * TIPOS_DE_PINO.length} dias gravados: ${JSON.stringify(contagem)}`);

// Os goldens do motor: a escala aprovada de cada cenário, um arquivo por cenário em test/fixtures/goldens-do-motor/,
// com um voo, um alerta e um avião da revisão de 50 horas por linha. O diff de uma mudança intencional no motor mostra
// quais voos mudaram e em quê. Gravados por scripts/capturar-goldens-motor.mjs; o estado do exemplo (o roster
// sintético e um dia de demanda) não é gerado e fica num arquivo próprio
import { readFileSync } from 'node:fs';

export const PASTA = new URL('../fixtures/goldens-do-motor/', import.meta.url);
export const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
export const ARQUIVO_DO_ESTADO = 'exemplo-estado.json';
export const ARQUIVO_DO_EXEMPLO = 'exemplo.json';
export const arquivoDoCenario = seed => `cenario-${String(seed).padStart(2, '0')}.json`;
export const ARQUIVOS = [ARQUIVO_DO_ESTADO, ARQUIVO_DO_EXEMPLO, ...SEEDS.map(arquivoDoCenario)];

// O voo começa pelo que se lê primeiro (horário, recurso, aluno, instrutor, missão e status); o resto, na ordem do motor
const PRIMEIRO = ['a', 'b', 'r', 's', 'ins', 'mis', 'status'];
const comOQueSeLePrimeiro = voo => Object.fromEntries([
  ...PRIMEIRO.filter(k => k in voo).map(k => [k, voo[k]]),
  ...Object.entries(voo).filter(([k]) => !PRIMEIRO.includes(k))
]);

const primitivo = v => v === null || typeof v !== 'object';

// Uma lista de objetos ou um objeto de objetos fica com um item por linha; o resto, compacto numa linha
function valorDoPrimeiroNivel(chave, valor) {
  if (Array.isArray(valor) && !valor.every(primitivo)) {
    const itens = chave === 'out' ? valor.map(comOQueSeLePrimeiro) : valor;
    return `[\n${itens.map(x => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`;
  }
  if (!primitivo(valor) && !Array.isArray(valor) && !Object.values(valor).every(primitivo)) {
    return `{\n${Object.entries(valor).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n  }`;
  }
  return JSON.stringify(valor);
}

// O texto de um arquivo de golden (também o do estado do exemplo): JSON válido, no formato acima
export function formatarGolden(golden) {
  return `{\n${Object.entries(golden).map(([k, v]) => `  ${JSON.stringify(k)}: ${valorDoPrimeiroNivel(k, v)}`).join(',\n')}\n}\n`;
}

export const lerArquivo = nome => readFileSync(new URL(nome, PASTA), 'utf8');
const ler = nome => JSON.parse(lerArquivo(nome));

// Todos os goldens: { exemplo: { estado, saida }, cenarios: [{ seed, hash, saida }] }
export function lerGoldens() {
  return {
    exemplo: { estado: ler(ARQUIVO_DO_ESTADO), saida: ler(ARQUIVO_DO_EXEMPLO) },
    cenarios: SEEDS.map(seed => {
      const { seed: gravado, hash, ...saida } = ler(arquivoDoCenario(seed));
      return { seed: gravado, hash, saida };
    })
  };
}

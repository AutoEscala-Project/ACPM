// O registro das exportações da data (formato 30; o H o escreve, ao exportar em Aprovar): para cada arquivo (o CSV, o PDF
// e o Excel), quando, por quem e a impressão do que foi exportado (8 hexadecimais), para dizer se a escala mudou depois.
// Do E, só a normalização: o que vem gravado pode ter sido escrito fora do app (pela API), e só o que tem o formato fica.
// Puro
const TIPOS_DE_EXPORTACAO = ['csv', 'pdf', 'xlsx'];
const IMPRESSAO = /^[0-9a-f]{8}$/;
const LIMITE_DE_QUEM = 80;

// { csv?: { em, por, impressao }, pdf?: {…}, xlsx?: {…} }: só os três tipos, cada um com a data válida (ISO), quem (até 80
// letras; sem, '') e a impressão; o que não tem o formato sai. Sem nada: {}
export function normalizarExportacoes(valor) {
  const exportacoes = {};
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return exportacoes;
  for (const tipo of TIPOS_DE_EXPORTACAO) {
    if (!Object.hasOwn(valor, tipo)) continue;
    const registro = valor[tipo];
    if (!registro || typeof registro !== 'object' || Array.isArray(registro)) continue;
    const { em, por, impressao } = registro;
    if (typeof em !== 'string' || Number.isNaN(Date.parse(em)) || typeof impressao !== 'string' || !IMPRESSAO.test(impressao)) continue;
    exportacoes[tipo] = { em, por: typeof por === 'string' ? por.slice(0, LIMITE_DE_QUEM) : '', impressao };
  }
  return exportacoes;
}

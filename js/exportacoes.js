// O registro das exportações da data (formato 30; o H o escreve, ao exportar em Aprovar): para cada arquivo (o CSV, o PDF
// e o Excel), quando, por quem e a impressão do que foi exportado (8 hexadecimais), para dizer se a escala mudou depois.
// Do E, só a normalização: o que vem gravado pode ter sido escrito fora do app (pela API), e só o que tem o formato fica.
// Puro
import { statusDoVoo } from './voo.js';
import { intervaloEfetivo } from './status.js';
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

// A impressão da escala da data (H): 8 hexadecimais (FNV-1a de 32 bits) do que os arquivos exportados dizem e que, mudado,
// deixa a exportação desatualizada (d31): de cada linha (o voo e a volta do noturno), quem voa (o aluno), o quê (a
// missão), quando (o horário, o novo do atraso: intervaloEfetivo), onde (o avião ou a sala) e com quem (o instrutor), o
// status (Pendente e Confirmado contam como o padrão), os códigos dos conflitos e o avião parado na data (av[r] false).
// A ordem das linhas não conta. out: a escala da tela; dia: o fStatus, o fObs e o av da data
const STATUS_DO_PADRAO = ['Pendente', 'Confirmado'];
export function impressaoDaEscala(out, { fStatus = {}, fObs = {}, av = {} } = {}) {
  const linhas = (out || []).map(o => {
    const status = statusDoVoo(o, fStatus);
    const { a, b } = intervaloEfetivo(o, status, (fObs || {})[o.fKey]);
    const conflitos = Array.isArray(o.conflitoCodigos) && o.conflitoCodigos.length ? [...o.conflitoCodigos].sort() : [...(o.conflito || [])].sort();
    return JSON.stringify([o.fKey, o.trecho || '', o.stuId, o.mis || '', a, b, o.r || '', o.insId ?? '', STATUS_DO_PADRAO.includes(status) ? '' : status,
      conflitos, (av || {})[o.r] === false]);
  }).sort();
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(linhas.join('\n'))) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// O que a impressão de agora diz de cada exportação registrada: 'nenhuma', 'em-dia' (a escala exportada é a de agora) ou
// 'desatualizada'. A escala está exportada com ao menos uma registrada e nenhuma desatualizada (d31). exportacoes: o
// registro da data (normalizado aqui); impressao: impressaoDaEscala da escala de agora.
// { porTipo: [{ tipo, estado, em?, por? }], desatualizadas: [tipo], exportada }
export function situacaoDasExportacoes(exportacoes, impressao) {
  const registro = normalizarExportacoes(exportacoes);
  const porTipo = TIPOS_DE_EXPORTACAO.map(tipo => {
    const r = registro[tipo];
    return r ? { tipo, estado: r.impressao === impressao ? 'em-dia' : 'desatualizada', em: r.em, por: r.por } : { tipo, estado: 'nenhuma' };
  });
  const desatualizadas = porTipo.filter(t => t.estado === 'desatualizada').map(t => t.tipo);
  return { porTipo, desatualizadas, exportada: porTipo.some(t => t.estado === 'em-dia') && !desatualizadas.length };
}

// O registro com a exportação nova do tipo (o CSV, o PDF ou o Excel), no lugar da de antes do mesmo tipo; o de antes não
// muda. Outro tipo, ou o registro fora do formato, não grava nada (devolve o registro normalizado)
export function registrarExportacao(exportacoes, tipo, { em, por, impressao }) {
  const antes = normalizarExportacoes(exportacoes);
  if (!TIPOS_DE_EXPORTACAO.includes(tipo)) return antes;
  const depois = normalizarExportacoes({ ...antes, [tipo]: { em, por, impressao } });
  return Object.hasOwn(depois, tipo) ? depois : antes;
}

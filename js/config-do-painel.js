// A configuração do painel (a visão "Painel" da Escala e a TV da recepção): o quadro com que ele abre e as colunas, na
// ordem e ligadas ou não. Fica no cadastro (campo "painel", igual em todas as datas): o Operador e o Administrador mudam,
// em "Configurar painel"; sem ela, vale o padrão. O que vem gravado pode ter sido escrito fora do app (ou por uma
// versão anterior): normalizarPainel aceita só os quadros e as colunas conhecidos, e pelo menos uma coluna fica ligada.

// Os quadros, na ordem dos botões do painel. Missões: todos os voos do dia, sem partidas e chegadas (sem o status ao
// vivo, separar os dois não ajuda); os outros, como nos aeroportos
export const QUADROS_DO_PAINEL = [
  { id: 'missoes', rotulo: 'Missões' },
  { id: 'alternar', rotulo: 'Partidas e chegadas' },
  { id: 'partidas', rotulo: 'Partidas' },
  { id: 'chegadas', rotulo: 'Chegadas' }
];
const QUADRO_PADRAO = 'missoes';

// As colunas, na ordem padrão. Previsto e Observação dependem do status ao vivo: começam desligadas
export const COLUNAS_DO_PAINEL = [
  { id: 'horario', rotulo: 'Horário', ligada: true },
  { id: 'aeronave', rotulo: 'Aeronave', ligada: true },
  { id: 'modelo', rotulo: 'Modelo', ligada: true },
  { id: 'aluno', rotulo: 'Aluno', ligada: true },
  { id: 'instrutor', rotulo: 'Instrutor', ligada: true },
  { id: 'missao', rotulo: 'Missão', ligada: true },
  { id: 'previsto', rotulo: 'Previsto', ligada: false },
  { id: 'observacao', rotulo: 'Observação', ligada: false }
];

const COLUNA = new Map(COLUNAS_DO_PAINEL.map(c => [c.id, c]));
const QUADRO = new Map(QUADROS_DO_PAINEL.map(q => [q.id, q]));
export const rotuloDaColuna = id => COLUNA.get(id).rotulo;
export const rotuloDoQuadro = id => QUADRO.get(id).rotulo;
export const quadroValido = id => QUADRO.has(id);

export const painelPadrao = () => ({ quadro: QUADRO_PADRAO, colunas: COLUNAS_DO_PAINEL.map(c => ({ id: c.id, on: c.ligada })) });

// Só os quadros e as colunas conhecidos, cada coluna uma vez; a coluna que falta (uma coluna nova, numa configuração
// gravada antes dela) entra no fim, como no padrão. Nenhuma ligada: ligam as do padrão
export function normalizarPainel(painel) {
  const dado = painel && typeof painel === 'object' && !Array.isArray(painel) ? painel : {};
  const quadro = QUADRO.has(dado.quadro) ? dado.quadro : QUADRO_PADRAO;
  const vistas = new Set();
  const colunas = [];
  for (const c of Array.isArray(dado.colunas) ? dado.colunas : []) {
    if (!c || typeof c !== 'object' || !COLUNA.has(c.id) || vistas.has(c.id)) continue;
    vistas.add(c.id);
    colunas.push({ id: c.id, on: c.on === true });
  }
  for (const c of COLUNAS_DO_PAINEL) if (!vistas.has(c.id)) colunas.push({ id: c.id, on: c.ligada });
  if (!colunas.some(c => c.on)) for (const c of colunas) c.on = COLUNA.get(c.id).ligada;
  return { quadro, colunas };
}

// As colunas que o painel mostra, na ordem
export const colunasVisiveis = painel => normalizarPainel(painel).colunas.filter(c => c.on).map(c => c.id);

export const ehPadrao = painel => JSON.stringify(normalizarPainel(painel)) === JSON.stringify(painelPadrao());

// Liga ou desliga uma coluna. Desligar a última ligada não vale: devolve null
export function alternarColuna(painel, id, on) {
  const atual = normalizarPainel(painel);
  const colunas = atual.colunas.map(c => (c.id === id ? { ...c, on: Boolean(on) } : c));
  return colunas.some(c => c.on) ? { ...atual, colunas } : null;
}

// Uma posição para cima (-1) ou para baixo (+1). Na ponta, devolve null
export function moverColuna(painel, id, passo) {
  const atual = normalizarPainel(painel);
  const de = atual.colunas.findIndex(c => c.id === id);
  const para = de + passo;
  if (de < 0 || para < 0 || para >= atual.colunas.length) return null;
  const colunas = [...atual.colunas];
  [colunas[de], colunas[para]] = [colunas[para], colunas[de]];
  return { ...atual, colunas };
}

export const escolherQuadro = (painel, quadro) => (QUADRO.has(quadro) ? { ...normalizarPainel(painel), quadro } : null);

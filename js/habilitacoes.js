// Habilitações individuais dos instrutores. No aeroclube as funções não são cumulativas: há instrutor
// de C172 que não dá simulador e instrutor de PA-34 que não faz parafuso. Cada instrutor tem a lista do que pode
// fazer; uma missão exige a habilitação da missão e, no C152, no C172 e no PA-34, também a do avião. O voo pode exigir
// mais: pelo curso do aluno (o Noturno do PC exige IFR) e pelo próprio recurso (o avião com habilitação própria, como o
// PR-VOM, exige a habilitação "aviao:<matrícula>", que aparece na grade quando o recurso é marcado em Recursos).
import { MIS } from './config.js';
import { exigenciasDoAviao, PREFIXO_DA_HABILITACAO_DO_AVIAO, MATRICULA } from './frota.js';

// Ordem da grade na aba Instrutores (curto: rótulo da grade; nome: o nome completo, na dica e nas mensagens)
export const HABILITACOES = [
  { id: 'grounds', nome: 'Grounds (C152, C172 e Navegação)', curto: 'Grounds C152/C172/Nav.' },
  { id: 'ground_pa34', nome: 'Ground (PA-34)', curto: 'Ground PA-34' },
  { id: 'sim_mono', nome: 'Simulador (Mono)', curto: 'Sim. Mono' },
  { id: 'sim_multi', nome: 'Simulador (Multi)', curto: 'Sim. Multi' },
  { id: 'tgl', nome: 'TGL (TMA)', curto: 'TGL (TMA)' },
  { id: 'local', nome: 'Voo Local', curto: 'Local' },
  { id: 'navegacao', nome: 'Voo de Navegação', curto: 'Navegação' },
  { id: 'solo', nome: 'Voo para liberação de Solo', curto: 'Liberação de Solo' },
  { id: 'parafuso', nome: 'Voo de Parafuso (SPIN)', curto: 'Parafuso (SPIN)' },
  { id: 'ifr', nome: 'Voo IFR', curto: 'IFR' },
  { id: 'noturno', nome: 'Voo Noturno', curto: 'Noturno' },
  { id: 'c152', nome: 'C152', curto: 'C152' },
  { id: 'c172', nome: 'C172', curto: 'C172' },
  { id: 'mlte', nome: 'MLTE (PA-34)', curto: 'MLTE (PA-34)' },
  // O checador é credenciado por partes: o curso, o motor e as regras do voo
  { id: 'checa_pp', nome: 'Checador do curso PP', curto: 'Checador PP' },
  { id: 'checa_pc', nome: 'Checador do curso PC', curto: 'Checador PC' },
  { id: 'checa_inva', nome: 'Checador do curso INVA', curto: 'Checador INVA' },
  { id: 'checa_mnte', nome: 'Checador MNTE', curto: 'Checador MNTE' },
  { id: 'checa_mlte', nome: 'Checador MLTE', curto: 'Checador MLTE' },
  { id: 'checa_vfr', nome: 'Checador VFR', curto: 'Checador VFR' },
  { id: 'checa_ifr', nome: 'Checador IFR', curto: 'Checador IFR' }
];
const ORDEM = new Map(HABILITACOES.map((h, i) => [h.id, i]));
const NOME = new Map(HABILITACOES.map(h => [h.id, h.nome]));
// A habilitação própria de um recurso: "aviao:PR-VOM"
const ehDoAviao = id => typeof id === 'string' && id.startsWith(PREFIXO_DA_HABILITACAO_DO_AVIAO) && MATRICULA.test(id.slice(PREFIXO_DA_HABILITACAO_DO_AVIAO.length));
export const nomeDaHabilitacao = id => NOME.get(id) || (ehDoAviao(id) ? `Avião ${id.slice(PREFIXO_DA_HABILITACAO_DO_AVIAO.length)}` : id);

// Lista válida: só habilitações conhecidas, sem repetição, na ordem da grade
// (as habilitações próprias dos recursos vêm depois, na ordem das matrículas)
const posicao = h => (ORDEM.has(h) ? ORDEM.get(h) : HABILITACOES.length);
export const normalizarHabilitacoes = lista =>
  (Array.isArray(lista) ? [...new Set(lista.filter(h => ORDEM.has(h) || ehDoAviao(h)))] : [])
    .sort((a, b) => posicao(a) - posicao(b) || (a < b ? -1 : a > b ? 1 : 0));

// Habilitação de cada missão (o simulador depende do equipamento) e a exigida pelo avião
const DA_MISSAO = {
  'Ground C152': 'grounds',
  'Ground C172': 'grounds',
  'Ground Navegação': 'grounds',
  'Ground PA-34': 'ground_pa34',
  'Voo Local': 'local',
  'TGL (TMA)': 'tgl',
  'Navegação': 'navegacao',
  'Voo Solo': 'solo',
  'Parafuso': 'parafuso',
  'IFR': 'ifr',
  'Noturno': 'noturno',
  'Multimotor': 'mlte'
};
const DO_SIMULADOR = { 'Sim. Mono': 'sim_mono', 'Sim. Multi': 'sim_multi' };

// Voos de cheque: o checador precisa das três marcas do cheque (o curso, o motor e as regras), em qualquer avião permitido
const CHEQUES = {
  'Cheque PP': ['checa_pp', 'checa_mnte', 'checa_vfr'],
  'Cheque PC MNTE VFR': ['checa_pc', 'checa_mnte', 'checa_vfr'],
  'Cheque PC MNTE IFR': ['checa_pc', 'checa_mnte', 'checa_ifr'],
  'Cheque PC MLTE VFR': ['checa_pc', 'checa_mlte', 'checa_vfr'],
  'Cheque PC MLTE IFR': ['checa_pc', 'checa_mlte', 'checa_ifr']
};
export const ehCheque = mis => Object.hasOwn(CHEQUES, mis);
// Até o formato 19, três habilitações de checador; cada uma vira as marcas que davam exatamente os mesmos cheques
// (o INVA, que estava no nome de todas, também)
const CHECADOR_ANTIGO = {
  checador_vfr: ['checa_pp', 'checa_pc', 'checa_inva', 'checa_mnte', 'checa_vfr'],
  checador_ifr: ['checa_pp', 'checa_pc', 'checa_inva', 'checa_mnte', 'checa_vfr', 'checa_ifr'],
  checador_mlte: ['checa_pp', 'checa_pc', 'checa_inva', 'checa_mnte', 'checa_mlte', 'checa_vfr', 'checa_ifr']
};
export const marcasDoChecadorAntigo = hab => [...new Set(hab.flatMap(h => (Object.hasOwn(CHECADOR_ANTIGO, h) ? CHECADOR_ANTIGO[h] : [h])))];
// O C152 também exige a habilitação do avião (na migração para o formato 19, todo instrutor do cadastro a recebe)
const DO_AVIAO = { 'C152': 'c152', 'C172': 'c172', 'PA-34': 'mlte' };

// Só as chaves do próprio mapa (nomes como "constructor" ou "toString" não contam)
const doMapa = (mapa, chave, padrao) => (Object.hasOwn(mapa, chave) ? mapa[chave] : padrao);

// Exigências da missão no equipamento: todos os grupos, e em cada grupo basta uma das habilitações. Com o contexto do
// voo, também as do curso do aluno (MIS[mis].porCurso: o Noturno do PC exige IFR) e as do recurso (habilitação própria)
export function exigencias(mis, eq, { curso, recurso } = {}) {
  const grupos = ehCheque(mis) ? CHEQUES[mis].map(h => [h])
    : [[mis === 'Simulador' ? doMapa(DO_SIMULADOR, eq, 'sim_mono') : doMapa(DA_MISSAO, mis, 'local')]];
  if (!ehCheque(mis) && Object.hasOwn(DO_AVIAO, eq) && !grupos.some(g => g.includes(DO_AVIAO[eq]))) grupos.push([DO_AVIAO[eq]]);
  const regra = Object.hasOwn(MIS, mis) ? MIS[mis] : null;
  const doCurso = regra && regra.porCurso && typeof curso === 'string' && Object.hasOwn(regra.porCurso, curso) ? regra.porCurso[curso].habilitacoes || [] : [];
  for (const h of [...doCurso, ...exigenciasDoAviao(recurso)]) if (!grupos.some(g => g.length === 1 && g[0] === h)) grupos.push([h]);
  return grupos;
}

// contexto: { curso, recurso } do voo (sem ele, só a missão e o tipo)
export const podeFazer = (instrutor, mis, eq, contexto) => {
  const hab = Array.isArray(instrutor.hab) ? instrutor.hab : [];
  return exigencias(mis, eq, contexto).every(grupo => grupo.some(h => hab.includes(h)));
};

// Quem pode dar ao menos um dos voos de cheque (a fila do rodízio dos cheques)
export const podeAlgumCheque = instrutor => Object.keys(CHEQUES).some(mis => podeFazer(instrutor, mis));

export const descreverExigencias = (mis, eq, contexto) => exigencias(mis, eq, contexto).map(g => g.map(nomeDaHabilitacao).join(' ou ')).join(' + ');

// Migração dos níveis cumulativos A01–A09: o instrutor recebe exatamente o que o nível permitia
// (checadores não existiam: começam desmarcados)
const POR_NIVEL = [
  [1, ['grounds', 'ground_pa34', 'local', 'c152']],
  [2, ['sim_mono', 'sim_multi']],
  [3, ['tgl']],
  [4, ['navegacao']],
  [5, ['solo']],
  [6, ['parafuso']],
  [7, ['noturno', 'c172']],
  [8, ['ifr']],
  [9, ['mlte']]
];
export const habilitacoesDoNivel = lv => {
  const nivel = Number.isInteger(lv) && lv >= 1 && lv <= 9 ? lv : 1;
  return normalizarHabilitacoes(POR_NIVEL.filter(([n]) => nivel >= n).flatMap(([, h]) => h));
};

// Reinicia o ensaio da Onda 3 na PRÉVIA (o item 9 da lista da Onda 3 em docs/PLAN.md): as datas do ensaio (2098) saem
// inteiras (os dias, os pedidos e o Histórico delas), e o formato guardado volta ao 29, o do D3, quando um build do E ou
// do L (os formatos 30 e 31) abriu a prévia e o subiu (o cadastro e cada dia acima de 29). Depois dele, o build do D3
// semeia as datas de novo e exporta os CSVs; a migração do G2 (20261129100100_importados_ja_aprovados) roda uma vez por
// banco, e numa repetição do ensaio a regra (a) dela é chamada por este script (--converter), depois da semeadura e dos
// CSVs. Recusa a produção antes de qualquer consulta: o projeto é o da prévia de js/config-supabase.js, ou o dado em
// --ref, e nunca o de produção.
//
// Usa o Supabase CLI já autenticado (`supabase login`); não precisa da senha do banco.
// Uso: [SECO=1] node scripts/reiniciar-ensaio-previa.mjs [--ref <ref da prévia>] [--converter]
//   SECO=1: só mostra as consultas, sem rodar nenhuma
import { execFileSync } from 'node:child_process';
import { PROJETOS } from '../js/config-supabase.js';
import { refDaPrevia, REF_DA_PRODUCAO } from './pedidos-da-previa.mjs';

// O projeto: o da prévia (refDaPrevia recusa a prévia que aponta para a produção) ou o dado em --ref, que também não pode
// ser o de produção. Antes de qualquer consulta
const argumentos = process.argv.slice(2);
const indiceDoRef = argumentos.indexOf('--ref');
const pedido = indiceDoRef >= 0 ? argumentos[indiceDoRef + 1] : null;
const refDaProducao = new URL(PROJETOS.producao.url).hostname.split('.')[0];
if (pedido !== null && (!pedido || pedido === REF_DA_PRODUCAO || pedido === refDaProducao)) {
  console.error('O ensaio é só na prévia: o projeto pedido é o de produção (ou nenhum). Nada foi feito.');
  process.exit(2);
}
let PREVIA;
try {
  PREVIA = pedido || refDaPrevia(PROJETOS);
} catch (e) {
  console.error(`${e.message} Nada foi feito.`);
  process.exit(2);
}

// As datas do ensaio e o formato do D3, de onde o ensaio parte
const DE = '2098-01-01', ATE = '2098-12-31';
const FORMATO_DO_D3 = 29;
const converter = argumentos.includes('--converter');
const seco = Boolean(process.env.SECO);

// O Supabase CLI: o `supabase` do PATH; com SUPABASE_CLI_JS, um script que o node roda no lugar dele (o teste
// test/unit/reiniciar-ensaio-previa.test.js: assim ele nunca alcança o banco, também no Windows)
const CLI = process.env.SUPABASE_CLI_JS ? [process.execPath, [process.env.SUPABASE_CLI_JS]] : ['supabase', []];

function sql(consulta, { escrita = false } = {}) {
  if (seco) { console.log(`${consulta};`); return []; }
  const args = ['db', 'query', `--remote=${PREVIA}`, '-o', 'json', ...(escrita ? ['--yes'] : ['--read-only']), consulta];
  const saida = execFileSync(CLI[0], [...CLI[1], ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  return JSON.parse(saida.slice(saida.indexOf('{'))).rows || [];
}

// As consultas, numa ordem que pode ser repetida (cada uma sem efeito na segunda vez)
const CONSULTAS = [
  // As datas do ensaio: o Histórico, os pedidos e os dias delas
  `delete from public.historico where data between '${DE}' and '${ATE}'`,
  `delete from public.solicitacoes where data between '${DE}' and '${ATE}'`,
  `delete from public.dias where data between '${DE}' and '${ATE}'`,
  // O formato guardado de volta ao do D3 (um build do E ou do L subiu o cadastro e os dias que abriu)
  `update public.documentos set conteudo = jsonb_set(conteudo, '{esquema}', '${FORMATO_DO_D3}'::jsonb) where chave = 'cadastro' and public.esquema_do_conteudo(conteudo) > ${FORMATO_DO_D3}`,
  `update public.dias set conteudo = jsonb_set(conteudo, '{esquema}', '${FORMATO_DO_D3}'::jsonb) where public.esquema_do_conteudo(conteudo) > ${FORMATO_DO_D3}`
];
// A regra (a) de novo (a migração do G2), numa repetição do ensaio
const CONVERSAO = 'select public.aprovar_solicitacoes_de_antes_da_aprovacao(false) as aprovados';

// Antes de apagar, quanto há (uma consulta só de leitura): o que o ensaio deixou e o formato guardado
const [antes] = sql(`select (select count(*) from public.dias where data between '${DE}' and '${ATE}') as dias, (select count(*) from public.solicitacoes where data between '${DE}' and '${ATE}') as pedidos, (select public.esquema_do_conteudo(conteudo) from public.documentos where chave = 'cadastro') as formato`);
if (antes) console.log(`Na prévia (${PREVIA}): ${antes.dias} dias e ${antes.pedidos} pedidos do ensaio; o cadastro no formato ${antes.formato}.`);
if (converter) {
  const [r] = sql(CONVERSAO, { escrita: true });
  if (r) console.log(`A regra (a) de novo: ${r.aprovados} pedidos aprovados por "importação anterior".`);
} else {
  for (const consulta of CONSULTAS) sql(consulta, { escrita: true });
  console.log(seco ? 'SECO: nada foi feito.' : `O ensaio recomeça: as datas de ${DE.slice(0, 4)} saíram, e o formato guardado é no máximo o ${FORMATO_DO_D3}.`);
}

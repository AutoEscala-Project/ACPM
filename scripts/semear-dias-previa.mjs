// Coloca escalas fictícias no projeto de PRÉVIA para as próximas datas de operação (sem domingos), para quem abre a
// prévia (https://thephfernandes.github.io/ACPM/) ver a escala pronta. Cada data nova começa como o app começa uma data
// (diaParaCopiar do dia anterior: disponibilidade, horas até a revisão, filas do rodízio), recebe a demanda do dia de
// exemplo dos testes (test/helpers/exemplo.js, com os alunos em outra ordem a cada data) e a escala do motor, com a volta
// de BH dos noturnos de ontem (como o app abre a data: a volta no avião e com o INVA do Noturno, e o aviso do repouso antes
// dela) e o pino de cada Noturno (como o app grava): scripts/dia-semeado.mjs.
// Com cada data, os pedidos fictícios da agenda (scripts/pedidos-da-previa.mjs, o passo D1): um aprovado para cada aluno
// com voo, ligado ao registro dele e a "importadas", dois que aguardam a aprovação e um cancelado.
// Só grava datas que ainda não têm escala: o que alguém já editou na prévia fica como está. Cada data vai com os pedidos
// dela numa consulta só: a data que falhou fica sem eles, e rodar de novo grava só as que faltam. Recusa a produção.
//
// Usa o Supabase CLI já autenticado (`supabase login`); não precisa da senha do banco.
// Uso: [SECO=1] node scripts/semear-dias-previa.mjs [dias de operação, padrão 12] [data inicial AAAA-MM-DD, padrão amanhã]
import { execFileSync } from 'node:child_process';
import { juntar, separar, diaParaCopiar } from '../js/dias.js';
import { ESQUEMA, migrarCadastro, migrarDia } from '../js/migracoes.js';
import { PROJETOS } from '../js/config-supabase.js';
import { comExemplo } from '../test/helpers/exemplo.js';
import { somarDias } from '../js/format.js';
import { ehDomingo } from '../js/agenda.js';
import { refDaPrevia, pedidosDaPrevia, sqlDosIds, numerarPedidos, sqlDaData, ligarPedidos } from './pedidos-da-previa.mjs';
import { escalaSemeada } from './dia-semeado.mjs';

// Só a prévia: a produção é recusada antes de qualquer consulta
const PREVIA = refDaPrevia(PROJETOS);

const quantos = Number(process.argv[2] || 12);
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicio = process.argv[3] || somarDias(hojeSP, 1);

function sql(consulta, { escrita = false } = {}) {
  const args = ['db', 'query', `--remote=${PREVIA}`, '-o', 'json', ...(escrita ? ['--yes'] : ['--read-only']), consulta];
  // A API do Supabase às vezes falha no transporte: tenta de novo (as gravações daqui podem se repetir sem efeito: a da
  // data com os pedidos não grava a data que já existe, e os ids pedidos de novo só pulam números)
  for (let tentativa = 1; ; tentativa++) {
    try {
      const saida = execFileSync('supabase', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
      return JSON.parse(saida.slice(saida.indexOf('{'))).rows || [];
    } catch (e) {
      if (tentativa === 5 || !/Transport error/.test(e.stderr || '')) throw e;
      execFileSync('sleep', [String(tentativa * 2)]);
    }
  }
}

const [linhaCadastro] = sql("select conteudo::text as c, versao from public.documentos where chave = 'cadastro'");
if (!linhaCadastro) throw new Error('A prévia não tem cadastro: rode antes node scripts/semear-previa.mjs.');
const cadastro = migrarCadastro(JSON.parse(linhaCadastro.c));

const datas = [];
for (let d = inicio; datas.length < quantos; d = somarDias(d, 1)) if (!ehDomingo(d)) datas.push(d);
const existentes = new Set(sql(`select data::text as d from public.dias where data between '${datas[0]}' and '${datas.at(-1)}'`).map(l => l.d));

// O dia anterior à primeira data (o app copia dele a disponibilidade, as horas e as filas)
const [linhaAnterior] = sql(`select data::text as d, conteudo::text as c from public.dias where data < '${datas[0]}' order by data desc limit 1`);
let anterior = linhaAnterior ? migrarDia(JSON.parse(linhaAnterior.c)) : null;
// A data do dia anterior: os noturnos dele voltam de BH na data seguinte (só quando ela é o dia seguinte dele)
let dataAnterior = linhaAnterior ? linhaAnterior.d : null;
let nid = cadastro.nid;
const gravacoes = [];

for (const [k, data] of datas.entries()) {
  if (existentes.has(data)) {
    const [l] = sql(`select conteudo::text as c from public.dias where data = '${data}'`);
    anterior = migrarDia(JSON.parse(l.c));
    dataAnterior = data;
    console.log(`${data}: já tem escala, fica como está`);
    continue;
  }
  const base = juntar({ ...cadastro, nid }, diaParaCopiar(anterior, cadastro.ins));
  // Outra ordem dos alunos a cada data: a demanda de exemplo muda de aluno para aluno
  const giro = (k * 7) % base.stu.length;
  const ordem = base.stu.map(s => s.id);
  const estado = comExemplo({ ...base, stu: [...base.stu.slice(giro), ...base.stu.slice(0, giro)] });
  estado.stu.sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id));
  nid = estado.nid;
  // Os pedidos da agenda da data, com os ids tirados antes da escala (o registro de cada aprovado leva o id dele); a data e
  // os pedidos são gravados juntos no fim. SECO só conta
  const pedidos = pedidosDaPrevia(estado, data);
  const total = pedidos.aprovados.length + pedidos.aguardando.length + pedidos.cancelados.length;
  const numerados = process.env.SECO ? [] : numerarPedidos(pedidos, sql(sqlDosIds(total), { escrita: true }).map(l => l.id));
  ligarPedidos(estado, numerados);
  console.log(`${data}: pedidos ${pedidos.aprovados.length} aprovados, ${pedidos.aguardando.length} aguardando, ${pedidos.cancelados.length} cancelado`);

  // A volta de BH dos noturnos de ontem, o repouso antes dela e o pino de cada Noturno, como o app (scripts/dia-semeado.mjs)
  const { resultado, noturnos } = escalaSemeada(estado, { anterior, dataAnterior, data });
  const dia = { ...separar(estado).dia, esquema: ESQUEMA, resultado };
  gravacoes.push({ data, dia, numerados });
  anterior = dia;
  dataAnterior = data;
  console.log(`${data}: ${resultado.out.length} lançamentos, ${resultado.al.length} alertas, ${noturnos.length} voltas do noturno`, process.env.SECO ? resultado.out.slice(0, 4).map(o => `${o.s}/${o.mis}/${o.r}/${o.ins}`).join(" · ") : "");
}

if (!gravacoes.length || process.env.SECO) {
  console.log(gravacoes.length ? 'SECO: nada foi gravado.' : 'Nada a gravar.');
  process.exit(0);
}

// Os ids das missões extras saem do contador do cadastro: ele avança primeiro (sem regravar o resto do cadastro)
sql(`update public.documentos set conteudo = jsonb_set(conteudo, '{nid}', to_jsonb(${nid})), versao = versao + 1, atualizado_em = now()
  where chave = 'cadastro' and (conteudo ->> 'nid')::int < ${nid}`, { escrita: true });
// Uma data por consulta, com os pedidos dela (a API do Supabase recusa uma consulta muito grande)
let gravadas = 0, pedidosGravados = 0;
for (const { data, dia, numerados } of gravacoes) {
  const [linha] = sql(sqlDaData(data, dia, numerados), { escrita: true });
  gravadas += Number(linha.dias);
  pedidosGravados += Number(linha.pedidos);
}
console.log(`Gravado na prévia: ${gravadas} datas e ${pedidosGravados} pedidos; contador do cadastro em ${nid}.`);

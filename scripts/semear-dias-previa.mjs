// Coloca escalas fictícias no projeto de PRÉVIA para as próximas datas de operação (sem domingos), para quem abre a
// prévia (https://thephfernandes.github.io/ACPM/) ver a escala pronta. Cada data nova começa como o app começa uma data
// (diaParaCopiar do dia anterior: disponibilidade, horas até a revisão, filas do rodízio), recebe a demanda do dia de
// exemplo dos testes (test/helpers/exemplo.js, com os alunos em outra ordem a cada data) e a escala do motor.
// Só grava datas que ainda não têm escala: o que alguém já editou na prévia fica como está. Recusa a produção.
//
// Usa o Supabase CLI já autenticado (`supabase login`); não precisa da senha do banco.
// Uso: [SECO=1] node scripts/semear-dias-previa.mjs [dias de operação, padrão 12] [data inicial AAAA-MM-DD, padrão amanhã]
import { execFileSync } from 'node:child_process';
import { juntar, separar, diaParaCopiar } from '../js/dias.js';
import { ESQUEMA, migrarCadastro, migrarDia } from '../js/migracoes.js';
import { runAllocationEngine } from '../js/engine.js';
import { PROJETOS } from '../js/config-supabase.js';
import { comExemplo } from '../test/helpers/exemplo.js';
import { somarDias } from '../js/format.js';
import { ehDomingo } from '../js/agenda.js';

const PREVIA = new URL(PROJETOS.previa.url).hostname.split('.')[0];
const PRODUCAO = new URL(PROJETOS.producao.url).hostname.split('.')[0];
if (PREVIA === PRODUCAO) throw new Error('A prévia e a produção apontam para o mesmo projeto.');

const quantos = Number(process.argv[2] || 12);
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicio = process.argv[3] || somarDias(hojeSP, 1);

function sql(consulta, { escrita = false } = {}) {
  const args = ['db', 'query', `--remote=${PREVIA}`, '-o', 'json', ...(escrita ? ['--yes'] : ['--read-only']), consulta];
  // A API do Supabase às vezes falha no transporte: tenta de novo (as gravações daqui podem se repetir sem efeito)
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
const [linhaAnterior] = sql(`select conteudo::text as c from public.dias where data < '${datas[0]}' order by data desc limit 1`);
let anterior = linhaAnterior ? migrarDia(JSON.parse(linhaAnterior.c)) : null;
let nid = cadastro.nid;
const inserts = [];

for (const [k, data] of datas.entries()) {
  if (existentes.has(data)) {
    const [l] = sql(`select conteudo::text as c from public.dias where data = '${data}'`);
    anterior = migrarDia(JSON.parse(l.c));
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

  const resultado = { ...runAllocationEngine(estado), data };
  const dia = { ...separar(estado).dia, esquema: ESQUEMA, resultado };
  inserts.push(`('${data}', $dia$${JSON.stringify(dia)}$dia$::jsonb)`);
  anterior = dia;
  console.log(`${data}: ${resultado.out.length} lançamentos, ${resultado.al.length} alertas`, process.env.SECO ? resultado.out.slice(0, 4).map(o => `${o.s}/${o.mis}/${o.r}/${o.ins}`).join(" · ") : "");
}

if (!inserts.length || process.env.SECO) {
  console.log(inserts.length ? 'SECO: nada foi gravado.' : 'Nada a gravar.');
  process.exit(0);
}

// Os ids das missões extras saem do contador do cadastro: ele avança primeiro (sem regravar o resto do cadastro)
sql(`update public.documentos set conteudo = jsonb_set(conteudo, '{nid}', to_jsonb(${nid})), versao = versao + 1, atualizado_em = now()
  where chave = 'cadastro' and (conteudo ->> 'nid')::int < ${nid}`, { escrita: true });
// Uma data por consulta (a API do Supabase recusa uma consulta muito grande)
let gravadas = 0;
for (const insert of inserts) {
  gravadas += sql(`insert into public.dias (data, conteudo) values ${insert} on conflict (data) do nothing returning data`, { escrita: true }).length;
}
console.log(`Gravado na prévia: ${gravadas} datas; contador do cadastro em ${nid}.`);

// Os pedidos fictícios da agenda que scripts/semear-dias-previa.mjs grava na prévia com cada data nova (o passo D1): um
// pedido aprovado para cada aluno com voo na demanda do dia, ligado ao registro dele (solicitacao) e a "importadas", como a
// importação deixaria; dois pedidos que aguardam a aprovação e um cancelado, de alunos sem voo, fora da demanda. E o projeto
// em que o script grava: só a prévia (a produção é recusada).
import { MIS, GROUND_EQ_TYPE, GROUND_DURATION_H } from '../js/config.js';
import { HORARIOS_FIXOS } from '../js/agenda.js';
import { minutoDaPreferencia } from '../js/horarios.js';
import { hm } from '../js/format.js';

// O projeto de produção (como em scripts/testar-banco.mjs e scripts/semear-previa.mjs)
export const REF_DA_PRODUCAO = 'iszaomkinojwxymyglmh';
const QUEM = 'Prévia (semear-dias-previa)';

// O projeto da prévia (o ref do endereço dele); recusa a produção: a prévia apontando para o projeto de produção
export function refDaPrevia(projetos) {
  const ref = projeto => new URL(projeto.url).hostname.split('.')[0];
  const previa = ref(projetos.previa);
  if (previa === ref(projetos.producao) || previa === REF_DA_PRODUCAO) throw new Error('A prévia aponta para o projeto de produção: nada é gravado.');
  return previa;
}

// Os pedidos de uma data, a partir do estado com a demanda: { aprovados, aguardando, cancelados }, cada um a linha da
// tabela solicitacoes (sem o id). Aprovados: um por aluno com voo (fly), com a missão, o recurso, o 1º horário e as horas
// do pedido do dia; os outros, de alunos sem voo, num Voo Local às 08:20
export function pedidosDaPrevia(estado, data) {
  const linha = (s, extra) => ({
    data, aluno: s.id, aluno_nome: s.nm, janela: 'horario', registrado_por: QUEM, conta: QUEM, excecao: false, ...extra
  });
  const doPedido = s => {
    const ground = Boolean(MIS[s.mis] && MIS[s.mis].isGround);
    const minuto = minutoDaPreferencia(s.p1);
    return {
      missao: s.mis, recurso: ground ? GROUND_EQ_TYPE : s.eq, horas: ground ? GROUND_DURATION_H : s.nb,
      horario: HORARIOS_FIXOS[s.mis] || hm(minuto >= 0 ? minuto : 500)
    };
  };
  const semVoo = estado.stu.filter(s => !s.fly);
  const local = { missao: 'Voo Local', recurso: 'C152', horas: 1, horario: '08:20' };
  return {
    aprovados: estado.stu.filter(s => s.fly).map(s => linha(s, { ...doPedido(s), aprovada: true })),
    aguardando: semVoo.slice(0, 2).map(s => linha(s, local)),
    cancelados: semVoo.slice(2, 3).map(s => linha(s, { ...local, cancelada: true }))
  };
}

const texto = v => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// Os ids dos pedidos, tirados da sequência da tabela antes da gravação: o registro de cada aprovado leva o id dele, e a data
// e os pedidos dela vão juntos numa consulta só (sqlDaData). Pedir de novo só pula números
export const sqlDosIds = n => `select nextval(pg_get_serial_sequence('public.solicitacoes', 'id')) as id from generate_series(1, ${n})`;

// Os pedidos da data, cada um com um dos ids (na ordem: os aprovados, os que aguardam e os cancelados)
export function numerarPedidos({ aprovados, aguardando, cancelados }, ids) {
  const todos = [...aprovados, ...aguardando, ...cancelados];
  if (ids.length !== todos.length) throw new Error(`${todos.length} pedidos e ${ids.length} ids`);
  return todos.map((p, i) => ({ ...p, id: Number(ids[i]), aprovado: Boolean(p.aprovada) }));
}

// A data e os pedidos dela numa consulta só (tudo ou nada): o dia que já existe não é gravado, e os pedidos só entram com
// ele; repetida (o transporte falhou depois da gravação), não grava nada. Devolve quantos dias e pedidos gravou. Cada null
// leva o tipo (numa coluna só de null, o values não o adivinha)
const comTipo = v => (v === null || v === undefined ? 'null::text' : texto(v));
const momento = sim => (sim ? 'now()' : 'null::timestamptz');
export function sqlDaData(data, dia, numerados) {
  const valores = numerados.map(p => `(${[
    p.id, `${texto(p.data)}::date`, p.aluno, comTipo(p.aluno_nome), comTipo(p.missao), comTipo(p.janela), comTipo(p.horario), `${p.horas}::numeric`,
    comTipo(p.recurso), comTipo(p.registrado_por), comTipo(p.conta), p.excecao,
    momento(p.aprovada), p.aprovada ? texto(QUEM) : 'null::text', momento(p.cancelada), p.cancelada ? texto(QUEM) : 'null::text'
  ].join(', ')})`);
  return `with dia as (insert into public.dias (data, conteudo) values (${texto(data)}, $dia$${JSON.stringify(dia)}$dia$::jsonb) on conflict (data) do nothing returning data),
  pedidos as (insert into public.solicitacoes (id, data, aluno, aluno_nome, missao, janela, horario, horas, recurso, registrado_por, conta, excecao,
      aprovada_em, aprovada_por, cancelada_em, cancelada_por) overriding system value
    select * from (values ${valores.join(',\n      ')}) v
    where exists (select 1 from dia)
    on conflict (id) do nothing returning id)
  select (select count(*) from dia) as dias, (select count(*) from pedidos) as pedidos`;
}

// Liga cada pedido aprovado ao registro do aluno na demanda (solicitacao) e a "importadas", como a importação deixaria
export function ligarPedidos(estado, gravados) {
  const aprovados = gravados.filter(g => g.aprovado === true || g.aprovado === 't').map(g => ({ id: Number(g.id), aluno: Number(g.aluno) }));
  for (const { id, aluno } of aprovados) {
    const s = estado.stu.find(x => x.id === aluno);
    if (s) s.solicitacao = id;
  }
  estado.importadas = [...(estado.importadas || []), ...aprovados.map(g => g.id)];
  return estado;
}

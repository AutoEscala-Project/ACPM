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

// A gravação dos pedidos da data numa consulta: devolve o id e o aluno de cada pedido aprovado (para ligar ao registro)
const texto = v => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
export function sqlDosPedidos({ aprovados, aguardando, cancelados }) {
  const valores = [...aprovados, ...aguardando, ...cancelados].map(p => `(${[
    texto(p.data), p.aluno, texto(p.aluno_nome), texto(p.missao), texto(p.janela), texto(p.horario), p.horas, texto(p.recurso),
    texto(p.registrado_por), texto(p.conta), p.excecao,
    p.aprovada ? 'now()' : 'null', p.aprovada ? texto(QUEM) : 'null', p.cancelada ? 'now()' : 'null', p.cancelada ? texto(QUEM) : 'null'
  ].join(', ')})`);
  return `insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horas, recurso, registrado_por, conta, excecao,
    aprovada_em, aprovada_por, cancelada_em, cancelada_por)
  values ${valores.join(',\n    ')}
  returning id, aluno, aprovada_em is not null as aprovado`;
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

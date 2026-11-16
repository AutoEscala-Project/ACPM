// Agenda de solicitações da secretaria: a regra do prazo (a mesma do servidor, no horário de São Paulo) e o pedido
// da demanda que cada solicitação vira ao ser importada.
import { MIS, MISSOES_LOCAIS, LIMITE_DE_VOOS_LOCAIS } from './config.js';
import { disponibilidadeAtual, disponibilidadeDoAluno, normalizeMissionFields, proximoMid, duracaoValida } from './rules.js';
import { horariosDaMissao, preferenciasPadrao, paraMinuto } from './horarios.js';
import { hm, somarDias } from './format.js';
import { normalizarCursos } from './cursos.js';
import { situacaoPorMissao, proximaMissao } from './resultados.js';

export const FUSO_DO_AEROCLUBE = 'America/Sao_Paulo';

export const JANELAS_DA_AGENDA = [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['horario', 'Horário específico']];

// Data (AAAA-MM-DD) e hora (HH:MM) de um instante no horário de São Paulo
function emSaoPaulo(instante) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_DO_AEROCLUBE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instante).map(p => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export const hojeEmSaoPaulo = (agora = new Date()) => emSaoPaulo(agora).data;

// O aeroclube não opera aos domingos
export const ehDomingo = iso => new Date(iso + 'T12:00:00Z').getUTCDay() === 0;

// O prazo para os pedidos de uma data: até as 13:00 do dia de operação anterior; a segunda, até sábado às 10:00 (o
// domingo não opera). Domingo não recebe pedido. Devolve { dia, hora } (São Paulo) ou null (domingo)
export function prazoDaData(data) {
  if (ehDomingo(data)) return null;
  const anterior = somarDias(data, ehDomingo(somarDias(data, -1)) ? -2 : -1);
  return { dia: anterior, hora: new Date(anterior + 'T12:00:00Z').getUTCDay() === 6 ? '10:00' : '13:00' };
}

export function prazoDaAgendaPermite(data, agora = new Date()) {
  const prazo = prazoDaData(data);
  if (!prazo) return false;
  const { data: hoje, hora } = emSaoPaulo(agora);
  return hoje < prazo.dia || (hoje === prazo.dia && hora < prazo.hora);
}

export const primeiraDataAberta = (agora = new Date()) => {
  const { data: hoje } = emSaoPaulo(agora);
  let data = somarDias(hoje, 1);
  while (!prazoDaAgendaPermite(data, agora)) data = somarDias(data, 1);
  return data;
};

export function disponibilidadeDaSolicitacao({ janela, horario }) {
  if (janela !== 'horario') return disponibilidadeAtual(janela);
  const minuto = paraMinuto(horario);
  return minuto === null ? undefined : disponibilidadeAtual(`h${minuto}`);
}

// Pedido da demanda: a missão com o equipamento padrão; como preferências, os dois primeiros horários dela que a
// disponibilidade permite (sem disponibilidade, os primeiros a partir das 08:20 e das 10:10); 1 h (o Ground tem
// 01h30) e prioridade 3. Os horários são os da categoria do equipamento (o PA-34 tem os seus). eq: outro equipamento
// da missão (o do programa do curso)
export function pedidoDaSolicitacao(solicitacao, horarios, { eq } = {}) {
  const jan = disponibilidadeDaSolicitacao(solicitacao);
  const regra = Object.hasOwn(MIS, solicitacao.missao) ? MIS[solicitacao.missao] : MIS['Voo Local'];
  const equipamento = eq && regra.eq.includes(eq) ? eq : regra.defEq;
  const lista = horariosDaMissao(horarios, solicitacao.missao, equipamento);
  const permitida = disponibilidadeDoAluno(jan);
  const naDisponibilidade = permitida ? lista.filter(permitida) : [];
  const [p1, p2] = naDisponibilidade.length ? [naDisponibilidade[0], naDisponibilidade[Math.min(1, naDisponibilidade.length - 1)]] : preferenciasPadrao(lista);
  const pedido = {
    fly: true, mis: solicitacao.missao, eq: equipamento,
    p1, p2, nb: 1, ss: 1, pr: 3,
    ...(jan ? { jan } : {})
  };
  normalizeMissionFields(pedido);
  return pedido;
}

// Importa para a demanda da data as solicitações ativas ainda não importadas. Só acrescenta: o aluno sem voo no dia
// recebe o pedido como missão principal; a mesma missão copiada da data anterior dá lugar ao pedido; senão, o pedido
// entra como missão extra (cada pedido é um voo, marcado com o id dele em solicitacao). As solicitações vistas ficam
// anotadas no dia (estado.importadas) para não repetir.
// Aluno de um curso: quando a próxima missão dele no programa é do tipo pedido, o pedido entra como ela (o código, o
// recurso e as horas do programa); situacao: o último resultado de cada missão
export function importarSolicitacoes(estado, solicitacoes, { situacao = [] } = {}) {
  const programa = normalizarCursos(estado.cursos), mapa = situacaoPorMissao(situacao);
  const resumo = { novos: 0, atualizados: 0, semAluno: 0 };
  if (!Array.isArray(estado.importadas)) estado.importadas = [];
  for (const solicitacao of solicitacoes) {
    if (solicitacao.cancelada_em || estado.importadas.includes(solicitacao.id)) continue;
    // O pedido de quem não está no cadastro não conta como visto: entra quando o aluno for cadastrado
    const aluno = estado.stu.find(x => x.id === solicitacao.aluno);
    if (!aluno) { resumo.semAluno++; continue; }
    estado.importadas.push(solicitacao.id);
    const jaNoDia = [aluno, ...(aluno.extra || [])].filter(m => m.fly && m.etapa).map(m => m.etapa);
    const proxima = proximaMissao(programa, mapa, aluno.id, aluno.curso, { exceto: jaNoDia });
    const doCurso = proxima && proxima.mis === solicitacao.missao;
    // A missão do curso: o recurso do programa, com os horários e as preferências dele
    const pedido = pedidoDaSolicitacao(solicitacao, estado.horarios, doCurso ? { eq: proxima.eq } : {});
    if (doCurso) Object.assign(pedido, { etapa: proxima.id, nb: proxima.nb });
    // A duração registrada na agenda vale; o Ground continua com 01h30
    if (solicitacao.horas !== null && solicitacao.horas !== undefined && !MIS[pedido.mis]?.isGround) pedido.nb = duracaoValida(+solicitacao.horas);
    // Cada pedido da agenda vira um voo (dois pedidos da mesma missão são dois voos). Só a missão que veio da data
    // anterior (sem pedido da agenda) dá lugar ao pedido, para não duplicar
    pedido.solicitacao = solicitacao.id;
    const copiada = [aluno, ...(aluno.extra || [])].find(m => m.fly && m.mis === pedido.mis && m.solicitacao === undefined);
    if (copiada) {
      delete copiada.jan;
      delete copiada.etapa;
      Object.assign(copiada, pedido);
      resumo.atualizados++;
    } else if (!aluno.fly) {
      Object.assign(aluno, pedido);
      resumo.novos++;
    } else {
      aluno.extra = [...(aluno.extra || []), { mid: proximoMid(estado, aluno), ...pedido }];
      resumo.novos++;
    }
  }
  return resumo;
}

// No máximo 6 voos locais (Voo Local, Voo Solo e TGL) saindo no mesmo horário (determinação da diretoria). Ao agendar
// mais um local num horário que já tem 6 (pedidos não cancelados da data), não há vaga: o próximo horário possível é o
// primeiro mais tarde, entre os horários da missão, que ainda tem vaga (null: nenhum)
export function vagaDeVooLocal(pedidos, { data, horario, missao }, horarios) {
  if (!MISSOES_LOCAIS.includes(missao)) return { ok: true };
  const noHorario = h => pedidos.filter(p => p.data === data && !p.cancelada_em && p.janela === 'horario' && p.horario === h && MISSOES_LOCAIS.includes(p.missao)).length;
  if (noHorario(horario) < LIMITE_DE_VOOS_LOCAIS) return { ok: true };
  const regra = Object.hasOwn(MIS, missao) ? MIS[missao] : MIS['Voo Local'];
  const depois = horariosDaMissao(horarios, missao, regra.defEq).map(hm).filter(h => h > horario);
  return { ok: false, proximo: depois.find(h => noHorario(h) < LIMITE_DE_VOOS_LOCAIS) || null };
}

// Agenda de solicitações da secretaria: a regra do prazo (a mesma do servidor, no horário de São Paulo) e o pedido
// da demanda que cada solicitação vira ao ser importada.
import { MIS, MISSOES_LOCAIS, LIMITE_DE_VOOS_LOCAIS } from './config.js';
import { disponibilidadeAtual, disponibilidadeDoAluno, normalizeMissionFields, migrateLegacyMissionName, duracaoPadraoDaMissao, alvoDoNovoPedido } from './rules.js';
import { horariosDaMissao, preferenciasPadrao, paraMinuto } from './horarios.js';
import { hm, somarDias } from './format.js';
import { indiceDoPrograma } from './programa.js';
import { proximasMissoes, missoesDoDia } from './progresso.js';
import { situacaoPorMissao, resultadoDoVoo } from './resultados.js';
import { chaveDoVoo } from './voo.js';
import { fixoPeloStatus } from './fixos.js';

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
// disponibilidade permite (sem disponibilidade, os primeiros a partir das 08:20 e das 10:10); prioridade 3. Os horários
// são os da categoria do equipamento (o PA-34 tem os seus). As horas: as fixas da missão (o Ground, 01h30; o Noturno,
// 4 h); senão, as registradas na agenda; senão, as do programa do curso; senão, as padrão da missão (1 h; o simulador,
// 2 h). eq e nb: o recurso e as horas da missão do programa do curso
export function pedidoDaSolicitacao(solicitacao, horarios, { eq, nb } = {}) {
  const jan = disponibilidadeDaSolicitacao(solicitacao);
  const regra = Object.hasOwn(MIS, solicitacao.missao) ? MIS[solicitacao.missao] : MIS['Voo Local'];
  const equipamento = eq && regra.eq.includes(eq) ? eq : regra.defEq;
  const lista = horariosDaMissao(horarios, solicitacao.missao, equipamento);
  const permitida = disponibilidadeDoAluno(jan);
  const naDisponibilidade = permitida ? lista.filter(permitida) : [];
  const [p1, p2] = naDisponibilidade.length ? [naDisponibilidade[0], naDisponibilidade[Math.min(1, naDisponibilidade.length - 1)]] : preferenciasPadrao(lista);
  const registradas = solicitacao.horas === null || solicitacao.horas === undefined ? null : +solicitacao.horas;
  const pedido = {
    fly: true, mis: solicitacao.missao, eq: equipamento,
    p1, p2, nb: registradas ?? nb ?? duracaoPadraoDaMissao(solicitacao.missao), ss: 1, pr: 3,
    ...(jan ? { jan } : {})
  };
  // A duração fixa da missão vale mais que as outras (normalizeMissionFields a impõe)
  normalizeMissionFields(pedido);
  return pedido;
}

// O voo da mesma missão (mis) que está na demanda do aluno sem pedido da agenda (posto à mão: a demanda começa vazia a
// cada data): ele dá lugar ao pedido, para não duplicar. O voo fixo (agendado, aprovado ou com o instrutor escolhido na
// escala), o fixado pelo status (em andamento ou cancelado; também quando o cadeado saiu, como na aprovação com o Voa
// desligado) e o que já tem resultado na data ficam como estão. Nenhum: null
function vooQueDaLugar(estado, aluno, mis) {
  const doDia = estado.resultados ? estado.resultados.doDia : [];
  return [aluno, ...(aluno.extra || [])].find(p => {
    const chave = chaveDoVoo(aluno.id, p.mid || 0);
    return p.fly && p.mis === mis && p.solicitacao === undefined && !Object.hasOwn(estado.fixos || {}, chave)
      && !fixoPeloStatus(chave, estado.fStatus) && resultadoDoVoo(doDia, chave) === null;
  }) || null;
}

// Importa para a demanda da data as solicitações ativas ainda não importadas. Só acrescenta: cada pedido da agenda vira
// um voo, marcado com o id dele em solicitacao (dois pedidos da mesma missão são dois voos). O voo da mesma missão posto
// na demanda sem pedido da agenda dá lugar ao pedido (vooQueDaLugar); senão, o pedido vai para o pedido principal do
// aluno, quando ele não voa e o dia não guarda nada dele, ou para uma missão extra nova (alvoDoNovoPedido). As
// solicitações vistas ficam anotadas no dia (estado.importadas) para não repetir.
// Aluno de um curso: o pedido entra como a primeira missão liberada do programa que é do tipo pedido (o código, o
// recurso e as horas do programa); nenhuma, ele entra como veio. As missões dos outros voos do aluno no dia contam como
// feitas, como na Demanda; a do voo que dá lugar ao pedido, não (ela continua no dia, agora com o pedido). situacao: o
// último resultado de cada missão; programa: os cursos (vazio quando os resultados ou os programas não foram lidos:
// nenhum pedido entra como missão do curso)
export function importarSolicitacoes(estado, solicitacoes, { situacao = [], programa = [] } = {}) {
  const indice = indiceDoPrograma(programa), mapa = situacaoPorMissao(situacao);
  const resumo = { novos: 0, atualizados: 0, semAluno: 0 };
  if (!Array.isArray(estado.importadas)) estado.importadas = [];
  for (const solicitacao of solicitacoes) {
    if (solicitacao.cancelada_em || estado.importadas.includes(solicitacao.id)) continue;
    // O pedido de quem não está no cadastro não conta como visto: entra quando o aluno for cadastrado
    const aluno = estado.stu.find(x => x.id === solicitacao.aluno);
    if (!aluno) { resumo.semAluno++; continue; }
    estado.importadas.push(solicitacao.id);
    const copiada = vooQueDaLugar(estado, aluno, migrateLegacyMissionName(solicitacao.missao));
    const curso = aluno.curso ? indice.curso(aluno.curso) : null;
    const jaNoDia = curso && missoesDoDia(curso, aluno, { fStatus: estado.fStatus, mid: copiada ? copiada.mid || 0 : null });
    const missao = curso && proximasMissoes(curso, mapa, aluno.id, { planejadas: jaNoDia, exceto: jaNoDia }).candidatas
      .find(m => m.mis === solicitacao.missao);
    // A missão do curso: o recurso do programa, com os horários e as preferências dele, e as horas dele
    const pedido = pedidoDaSolicitacao(solicitacao, estado.horarios, missao ? { eq: missao.eq, nb: missao.nb } : {});
    if (missao) pedido.etapa = missao.codigo;
    pedido.solicitacao = solicitacao.id;
    if (copiada) {
      // O voo continua com o instrutor escolhido; a disponibilidade e a missão do curso passam a ser as do pedido
      for (const campo of ['jan', 'etapa', 'cursoDaEtapa']) delete copiada[campo];
      Object.assign(copiada, pedido);
      resumo.atualizados++;
    } else {
      Object.assign(alvoDoNovoPedido(estado, aluno), pedido);
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

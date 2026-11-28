// A conciliação dos pedidos com a demanda da data aberta (E, até o G2, que a leva para o Processamento): a de "Importar"
// (os pedidos da data: entram os aprovados, voltam os religados, saem os cancelados e os sem aprovação) e a de um pedido
// aprovado em Pedidos, na hora (só ele, e o religar, que também religa o registro desligado e põe de novo o que saiu da
// demanda). A conciliação em si é pura (js/processamento.js); aqui, as opções dela (a data, o hoje e o agora de São Paulo,
// os resultados, os programas, os inativos, a escala de antes e o motor da tela), a gravação e o Histórico
import { gravarAlteracao, logChange } from './actions.js';
import { disponibilidadeDaSolicitacao, solicitacaoAprovada, agoraEmSaoPaulo } from './agenda.js';
import { fmtH, hm, hojeISO } from './format.js';
import { HORARIO_DO_SOLO, HORARIO_DO_NOTURNO } from './horarios.js';
import { conciliarPedidos, aplicarConciliacao, resumoDaConciliacao, POR_QUE_FICA } from './processamento.js';
import { redesenharPorNome } from './redesenho.js';
import { rotuloDaDisponibilidade } from './rules.js';
import { S, DATA, RES, dadoIndisponivel, estadoDaEscala, escalaDoMotor } from './state.js';
import { programaParaInferir } from './views/etapas.js';
import { inativoValeEm } from './inativos.js';
import { emLista } from './views/agenda.js';

// O que o Histórico diz de cada pedido que entrou ("Pedidos: Maria incluído (Voo Local · às 08:20 · 1 h)")
const doPedido = s => `${s.missao} · ${rotuloDaDisponibilidade(disponibilidadeDaSolicitacao(s))}${s.horas ? ` · ${fmtH(+s.horas)}` : ''}`;
const textoDaEntrada = s => `Pedidos: ${s.aluno_nome} incluído (${doPedido(s)})`;

// Concilia os pedidos dados (as linhas lidas da data) com o dia e grava, numa gravação só: uma entrada do Histórico por
// pedido que entrou ou voltou ('inc') e uma por pedido que saiu ('exc', com quem entrou no lugar dele: a escala refeita em
// volta dos fixos dá a vaga ao 1º da lista de espera que cabe, N14, também na escala aprovada, sem fixar quem entra: o
// padrão do R5; quando a escala refeita a daria a um pedido de outro horário, o 1º da lista que cabe entra, fixo no lugar:
// Pedro, 2026-11-28). A gravação é a de sempre (gravarAlteracao), com o pino dele em S. religar: o aprovado guardado volta
// (a entrada na hora, D2: quem chama passa só as linhas aprovadas agora).
// Responde o resumo da conciliação, quantos entraram ou voltaram, quantos saíram (0 e 0: nada foi gravado) e se a gravação
// saiu
export function porNaDemanda(solicitacoes, { religar = false } = {}) {
  const importadasAntes = [...(S.importadas || [])];
  // A missão do curso escolhida no pedido vem dos programas lidos (S.programa), também com o progresso desligado; sem eles
  // lidos (null, como no formulário), o pedido que tem uma espera. A que o pedido não escolheu é inferida pelo programa da
  // próxima missão (programaParaInferir)
  const cursos = ['cursos', 'cursos-pendentes'].some(dadoIndisponivel) ? null : S.programa || [];
  const { data: hoje, minuto: agora } = agoraEmSaoPaulo();
  const plano = conciliarPedidos(S, solicitacoes, {
    data: DATA, hoje, agora, aprovada: solicitacaoAprovada, religar, cursos, semInativos: inativoValeEm(DATA, hojeISO())
  });
  // A escala de antes (a da tela: quem espera em cada horário) e o motor da tela, para a vaga de quem sai: do dia que a
  // conciliação lhe passa (S, ou a cópia dele com a escala de antes fixa, para a vez da lista de espera)
  const antes = RES && Array.isArray(RES.out) ? { estado: estadoDaEscala(), resultado: RES } : null;
  const escalar = (base = S) => { const estado = estadoDaEscala(base); return { estado, resultado: escalaDoMotor(estado) }; };
  const feito = aplicarConciliacao(S, plano, {
    programa: programaParaInferir(), situacao: (S.resultados && S.resultados.situacao) || [], cursos, antes, escalar
  });
  const resumo = resumoDaConciliacao(plano, feito);
  const linha = new Map(solicitacoes.map(s => [s.id, s]));
  const entradas = [
    ...feito.entraram.map(x => textoDaEntrada(linha.get(x.id))),
    ...feito.voltaram.map(x => `Pedidos: ${linha.get(x.id).aluno_nome} de volta à demanda (${doPedido(linha.get(x.id))})`)
  ];
  const saidas = feito.historico.map(([, texto]) => texto);
  // Nada entrou, voltou nem saiu: o dia fica como estava (os acertos das importadas também)
  if (!entradas.length && !saidas.length) { S.importadas = importadasAntes; return { resumo, entraram: 0, sairam: 0, gravou: false }; }
  // Uma gravação: as entradas com a dela e as saídas depois, no mesmo Histórico
  const gravou = entradas.length ? gravarAlteracao('inc', entradas) : gravarAlteracao('exc', saidas);
  if (gravou && entradas.length) for (const texto of saidas) logChange('exc', texto);
  redesenharPorNome('pedidos-do-dia', 'pedidos');
  return { resumo, entraram: entradas.length, sairam: feito.sairam.length, gravou };
}

// O que a entrada diz além de quantos entraram (" · 1 pedido de aluno inativo…"): os que esperam (fora do cadastro, de
// inativo, sem os programas lidos), a missão do curso de cada um (fora do programa, inferida ou nenhuma), o horário de
// cada um, os que saíram (de onde, e quem entrou no lugar), os que ficam até o operador conferir o status e os que ficam
// (em voo, pousados, com o status Cancelado, com resultado), com o porquê
const quantos = n => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
const entrou = lista => (lista.length === 1 ? 'entrou' : 'entraram');
// "nenhuma Navegação liberada é no PA-34": o pedido do aluno de um curso para o qual nenhuma missão liberada serve
const semMissao = ({ missao, recurso }) => `nenhuma ${missao} liberada${recurso ? ` é no ${recurso}` : ''}`;
// "Navegação às 08:20 no PA-34": o pedido de horário exato que a lista de decolagens do recurso não tem (o item 12 do plano),
// ou que entrou sem ele (fora dos horários exatos do dia: antes das 06:30 ou depois das 17:30)
const foraDaLista = ({ missao, horario, recurso }) => `${missao} às ${horario} no ${recurso}`;
// "Aluno 1000 (no lugar entrou Aluno 1001)": quem saiu e quem entrou na vaga (N14)
const saiu = ({ aluno, entrou: outro }) => `${aluno}${outro ? ` (no lugar entrou ${outro})` : ''}`;
// De onde saíram, como o Histórico diz: da escala, da lista de espera (o pedido que esperava, N14) ou dos pedidos da data
// (o que não estava na escala)
const DE_ONDE = { escala: 'da escala', espera: 'da lista de espera', pedidos: 'dos pedidos da data' };
const sairamDe = sairam => Object.entries(DE_ONDE).map(([de, texto]) => {
  const daqui = sairam.filter(x => (x.de || 'escala') === de);
  return daqui.length ? ` · ${quantos(daqui.length)} ${daqui.length === 1 ? 'cancelado ou sem aprovação saiu' : 'cancelados ou sem aprovação saíram'} ${texto}: ${daqui.map(saiu).join('; ')}` : '';
}).join('');
export function notasDaEntrada(resumo) {
  const [pelaMissao, peloTipo] = [resumo.foraDoPrograma.filter(f => f.entrouComo), resumo.foraDoPrograma.filter(f => !f.entrouComo)];
  return (resumo.semAluno ? ` · ${resumo.semAluno} de aluno que não está no cadastro (entra depois de cadastrado)` : '') +
    (resumo.deInativo ? ` · ${resumo.deInativo} de aluno inativo (entram quando ele voltar a ativo)` : '') +
    (peloTipo.length ? ` · ${quantos(peloTipo.length)} com a missão do curso fora do programa: ${entrou(peloTipo)} pelo tipo da missão` : '') +
    (pelaMissao.length ? ` · ${quantos(pelaMissao.length)} com a missão do curso fora do programa: ${entrou(pelaMissao)} como ${emLista([...new Set(pelaMissao.map(f => f.entrouComo))])}` : '') +
    (resumo.esperamOsProgramas ? ` · ${quantos(resumo.esperamOsProgramas)} com a missão do curso ${resumo.esperamOsProgramas === 1 ? 'espera' : 'esperam'} os programas dos cursos, que não foram lidos: importe de novo depois de lê-los` : '') +
    (resumo.semMissaoDoCurso.length ? ` · ${quantos(resumo.semMissaoDoCurso.length)} sem missão do curso: ${[...new Set(resumo.semMissaoDoCurso.map(semMissao))].join('; ')}` : '') +
    (resumo.foraDaLista.length ? ` · ${quantos(resumo.foraDaLista.length)} num horário fora da lista de decolagens do recurso (o horário fica): ${[...new Set(resumo.foraDaLista.map(foraDaLista))].join('; ')}` : '') +
    (resumo.semOHorario.length ? ` · ${quantos(resumo.semOHorario.length)} fora dos horários exatos do dia (das ${hm(HORARIO_DO_SOLO)} às ${hm(HORARIO_DO_NOTURNO)}), sem o horário exato (qualquer horário): ${[...new Set(resumo.semOHorario.map(foraDaLista))].join('; ')}` : '') +
    sairamDe(resumo.sairam) +
    (resumo.conferir.length ? ` · ${quantos(resumo.conferir.length)} ${resumo.conferir.length === 1 ? 'cancelado ou sem aprovação fica' : 'cancelados ou sem aprovação ficam'} na escala até o status ser conferido (Pousou ou Cancelado): ${resumo.conferir.map(c => `${c.aluno} (${POR_QUE_FICA[c.porque]})`).join('; ')}` : '') +
    ((resumo.ficam || []).length ? ` · ${quantos(resumo.ficam.length)} ${resumo.ficam.length === 1 ? 'cancelado ou sem aprovação fica' : 'cancelados ou sem aprovação ficam'} na escala: ${resumo.ficam.map(c => `${c.aluno} (${POR_QUE_FICA[c.porque]})`).join('; ')}` : '');
}

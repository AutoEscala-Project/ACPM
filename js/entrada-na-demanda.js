// A entrada dos pedidos aprovados na demanda da data aberta (até o G, que a concilia sozinho): a de "Importar" e a de um
// pedido aprovado em Pedidos, na hora (que também religa o registro desligado). A importação em si é pura
// (js/processamento.js); aqui, as opções dela (os resultados, os programas, os inativos), a gravação e o Histórico
import { gravarAlteracao } from './actions.js';
import { disponibilidadeDaSolicitacao, prepararEntradaNaDemanda } from './agenda.js';
import { fmtH, hojeISO } from './format.js';
import { importarSolicitacoes } from './processamento.js';
import { redesenharPorNome } from './redesenho.js';
import { rotuloDaDisponibilidade } from './rules.js';
import { S, DATA, dadoIndisponivel } from './state.js';
import { programaParaInferir } from './views/etapas.js';
import { inativoValeEm } from './inativos.js';
import { emLista } from './views/agenda.js';

// O que o Histórico diz de cada pedido que entrou ("Pedidos: Maria incluído (Voo Local · às 08:20 · 1 h)")
const doPedido = s => `${s.missao} · ${rotuloDaDisponibilidade(disponibilidadeDaSolicitacao(s))}${s.horas ? ` · ${fmtH(+s.horas)}` : ''}`;
const textoDaEntrada = s => `Pedidos: ${s.aluno_nome} incluído (${doPedido(s)})`;

// Põe na demanda os pedidos dados (os aprovados; religar: a entrada na hora, que também religa o registro que leva o pedido
// e estava desligado e põe de novo o que saiu da demanda) e grava, com uma entrada do Histórico por pedido. Responde o
// resumo da importação, quantos entraram ou voltaram (0: nada foi gravado) e se a gravação saiu
export function porNaDemanda(solicitacoes, { religar = false } = {}) {
  const importadasAntes = [...(S.importadas || [])];
  const { religados, paraImportar } = religar ? prepararEntradaNaDemanda(S, solicitacoes) : { religados: [], paraImportar: solicitacoes };
  // A missão do curso escolhida no pedido vem dos programas lidos (S.programa), também com o progresso desligado; sem eles
  // lidos (null, como no formulário), o pedido que tem uma espera. A que o pedido não escolheu é inferida pelo programa da
  // próxima missão (programaParaInferir)
  const cursos = ['cursos', 'cursos-pendentes'].some(dadoIndisponivel) ? null : S.programa || [];
  const resumo = importarSolicitacoes(S, paraImportar, {
    situacao: (S.resultados && S.resultados.situacao) || [], programa: programaParaInferir(), cursos, semInativos: inativoValeEm(DATA, hojeISO())
  });
  const entraram = paraImportar.filter(s => S.importadas.includes(s.id));
  // Nada entrou nem voltou: o dia fica como estava (o pedido esquecido nas importadas também volta)
  if (!entraram.length && !religados.length) { S.importadas = importadasAntes; return { resumo, entraram: 0, gravou: false }; }
  // No Histórico, só os que entraram (os que esperam, de fora do cadastro ou de inativo, não) e os que voltaram
  const gravou = gravarAlteracao('inc', [...entraram.map(textoDaEntrada), ...religados.map(s => `Pedidos: ${s.aluno_nome} de volta à demanda (${doPedido(s)})`)]);
  redesenharPorNome('pedidos-do-dia', 'pedidos');
  return { resumo, entraram: entraram.length + religados.length, gravou };
}

// O que a entrada diz além de quantos entraram (" · 1 pedido de aluno inativo…"): os que esperam (fora do cadastro, de
// inativo, sem os programas lidos) e a missão do curso de cada um (fora do programa, inferida ou nenhuma)
const quantos = n => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
const entrou = lista => (lista.length === 1 ? 'entrou' : 'entraram');
// "nenhuma Navegação liberada é no PA-34": o pedido do aluno de um curso para o qual nenhuma missão liberada serve
const semMissao = ({ missao, recurso }) => `nenhuma ${missao} liberada${recurso ? ` é no ${recurso}` : ''}`;
export function notasDaEntrada(resumo) {
  const [pelaMissao, peloTipo] = [resumo.foraDoPrograma.filter(f => f.entrouComo), resumo.foraDoPrograma.filter(f => !f.entrouComo)];
  return (resumo.semAluno ? ` · ${resumo.semAluno} de aluno que não está no cadastro (entra depois de cadastrado)` : '') +
    (resumo.deInativo ? ` · ${resumo.deInativo} de aluno inativo (entram quando ele voltar a ativo)` : '') +
    (peloTipo.length ? ` · ${quantos(peloTipo.length)} com a missão do curso fora do programa: ${entrou(peloTipo)} pelo tipo da missão` : '') +
    (pelaMissao.length ? ` · ${quantos(pelaMissao.length)} com a missão do curso fora do programa: ${entrou(pelaMissao)} como ${emLista([...new Set(pelaMissao.map(f => f.entrouComo))])}` : '') +
    (resumo.esperamOsProgramas ? ` · ${quantos(resumo.esperamOsProgramas)} com a missão do curso ${resumo.esperamOsProgramas === 1 ? 'espera' : 'esperam'} os programas dos cursos, que não foram lidos: importe de novo depois de lê-los` : '') +
    (resumo.semMissaoDoCurso.length ? ` · ${quantos(resumo.semMissaoDoCurso.length)} sem missão do curso: ${[...new Set(resumo.semMissaoDoCurso.map(semMissao))].join('; ')}` : '');
}

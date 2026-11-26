// "Importar da agenda" (na Demanda e na Agenda): traz os pedidos da agenda da data aberta para a demanda
// (js/processamento.js)
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { disponibilidadeDaSolicitacao } from '../agenda.js';
import { showToast } from '../dom.js';
import { fmtH, hojeISO } from '../format.js';
import { importarSolicitacoes } from '../processamento.js';
import { redesenharPorNome } from '../redesenho.js';
import { rotuloDaDisponibilidade } from '../rules.js';
import { S, DATA, isGestor, inativoNaDataAberta, stuBy } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { programaParaInferir } from '../views/etapas.js';
import { inativoValeEm } from '../inativos.js';

// Demanda e Agenda: traz os pedidos da agenda da secretaria para a data aberta (só acrescenta; não importa o mesmo
// pedido de novo)
async function importarDaAgenda() {
  if (isGestor() || aindaNaoAbriu()) return;
  const data = DATA;
  let solicitacoes;
  try {
    solicitacoes = await ApiClient.agenda(data, data);
  } catch {
    showToast('Não foi possível ler a agenda. Verifique a conexão e tente de novo.');
    return;
  }
  // A resposta chegou depois de trocar de data: os pedidos são de outra data
  if (DATA !== data) {
    showToast('A data mudou durante a importação da agenda: nada foi importado. Importe de novo na data certa.');
    return;
  }
  // Outra data começou a abrir enquanto a agenda era lida
  if (aindaNaoAbriu()) return;
  // O pedido do aluno inativo no cadastro fica de fora (entra quando ele voltar a ativo): não conta como novo
  const deInativo = s => inativoNaDataAberta(stuBy(s.aluno));
  const pendentes = solicitacoes.filter(s => !s.cancelada_em && !S.importadas.includes(s.id));
  const inativos = pendentes.filter(deInativo).length;
  if (pendentes.length === inativos) {
    showToast(`Nenhum pedido novo na agenda para ${DATA.slice(8, 10)}/${DATA.slice(5, 7)}${inativos ? ` (${inativos} de aluno inativo, que entram quando ele voltar a ativo)` : ''}.`);
    return;
  }
  // A missão do curso escolhida no pedido vem dos programas lidos (S.programa), também com o progresso desligado; a que o
  // pedido não escolheu é inferida pelo programa da próxima missão (programaParaInferir)
  const resumo = importarSolicitacoes(S, pendentes, {
    situacao: (S.resultados && S.resultados.situacao) || [], programa: programaParaInferir(), cursos: S.programa || [], semInativos: inativoValeEm(DATA, hojeISO())
  });
  gravarAlteracao('inc', pendentes.filter(s => S.stu.some(x => x.id === s.aluno) && !deInativo(s))
    .map(s => `Agenda: ${s.aluno_nome} incluído (${s.missao} · ${rotuloDaDisponibilidade(disponibilidadeDaSolicitacao(s))}${s.horas ? ` · ${fmtH(+s.horas)}` : ''})`));
  redesenharPorNome('pedidos-do-dia', 'pedidos');
  showToast(`${resumo.novos + resumo.atualizados} pedido(s) da agenda na demanda` +
    (resumo.semAluno ? ` · ${resumo.semAluno} de aluno que não está no cadastro (entra depois de cadastrado)` : '') +
    (resumo.deInativo ? ` · ${resumo.deInativo} de aluno inativo (entram quando ele voltar a ativo)` : '') +
    (resumo.foraDoPrograma.length ? ` · ${quantos(resumo.foraDoPrograma.length)} com a missão do curso fora do programa: ${resumo.foraDoPrograma.length === 1 ? 'entrou' : 'entraram'} pelo tipo da missão` : '') +
    (resumo.semMissaoDoCurso.length ? ` · ${quantos(resumo.semMissaoDoCurso.length)} sem missão do curso: ${[...new Set(resumo.semMissaoDoCurso.map(semMissao))].join('; ')}` : '') + '.', 'ok');
}
const quantos = n => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
// "nenhuma Navegação liberada é no PA-34": o pedido do aluno de um curso para o qual nenhuma missão liberada serve
const semMissao = ({ missao, recurso }) => `nenhuma ${missao} liberada${recurso ? ` é no ${recurso}` : ''}`;
// Os dois botões (o da Demanda e o da Agenda) são delegados: a importação não depende do lugar deles na página
aoAcionar('importar-agenda', importarDaAgenda);

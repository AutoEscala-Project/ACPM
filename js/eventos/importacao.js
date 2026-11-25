// "Importar da agenda" (na Demanda e na Agenda): traz os pedidos da agenda da data aberta para a demanda
// (js/processamento.js)
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { disponibilidadeDaSolicitacao } from '../agenda.js';
import { showToast } from '../dom.js';
import { fmtH } from '../format.js';
import { importarSolicitacoes } from '../processamento.js';
import { redesenharPorNome } from '../redesenho.js';
import { rotuloDaDisponibilidade } from '../rules.js';
import { S, DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { programaParaInferir } from '../views/etapas.js';

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
  const pendentes = solicitacoes.filter(s => !s.cancelada_em && !S.importadas.includes(s.id));
  if (!pendentes.length) {
    showToast(`Nenhum pedido novo na agenda para ${DATA.slice(8, 10)}/${DATA.slice(5, 7)}.`);
    return;
  }
  const resumo = importarSolicitacoes(S, pendentes, { situacao: (S.resultados && S.resultados.situacao) || [], programa: programaParaInferir() });
  gravarAlteracao('inc', pendentes.filter(s => S.stu.some(x => x.id === s.aluno))
    .map(s => `Agenda: ${s.aluno_nome} incluído (${s.missao} · ${rotuloDaDisponibilidade(disponibilidadeDaSolicitacao(s))}${s.horas ? ` · ${fmtH(+s.horas)}` : ''})`));
  redesenharPorNome('pedidos-do-dia', 'pedidos');
  showToast(`${resumo.novos + resumo.atualizados} pedido(s) da agenda na demanda` +
    (resumo.semAluno ? ` · ${resumo.semAluno} de aluno que não está no cadastro (entra depois de cadastrado)` : '') + '.', 'ok');
}
// Os dois botões (o da Demanda e o da Agenda) são delegados: a importação não depende do lugar deles na página
aoAcionar('importar-agenda', importarDaAgenda);

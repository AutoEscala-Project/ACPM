// "Importar pedidos aprovados" (na Demanda) e "Importar" (no aviso de Pedidos): os aprovados da data aberta que nunca
// entraram na demanda (até o G, que a concilia sozinho). A entrada em si (as opções da importação, a gravação e o Histórico)
// é js/entrada-na-demanda.js, a mesma da entrada na hora de um pedido aprovado em Pedidos (js/eventos/agenda.js)
import { aindaNaoAbriu, carregarData } from '../actions.js';
import { solicitacoesParaImportar } from '../agenda.js';
import { showToast } from '../dom.js';
import { porNaDemanda, notasDaEntrada } from '../entrada-na-demanda.js';
import { S, DATA, isGestor, inativoNaDataAberta, stuBy } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { lerSolicitacoesDaData } from '../solicitacoes-da-data.js';

// "Importar": os pedidos aprovados da data aberta que nunca entraram na demanda (só acrescenta; não importa o mesmo pedido
// de novo). A escala desta data mudou em outro computador: ela é lida de novo antes (a importação gravaria por cima)
async function importarDaAgenda() {
  if (isGestor() || aindaNaoAbriu()) return;
  const data = DATA;
  let solicitacoes;
  try {
    if (await ApiClient.diaMudou(data)) {
      await carregarData(data);
      if (DATA !== data || aindaNaoAbriu()) return;
    }
    solicitacoes = await ApiClient.agenda(data, data);
  } catch {
    showToast('Não foi possível ler os pedidos. Verifique a conexão e tente de novo.');
    return;
  }
  // A resposta chegou depois de trocar de data: os pedidos são de outra data
  if (DATA !== data) {
    showToast('A data mudou durante a importação dos pedidos: nada foi importado. Importe de novo na data certa.');
    return;
  }
  // Outra data começou a abrir enquanto os pedidos eram lidos
  if (aindaNaoAbriu()) return;
  // O pedido do aluno inativo no cadastro fica de fora (entra quando ele voltar a ativo): não conta como novo
  const deInativo = s => inativoNaDataAberta(stuBy(s.aluno));
  const pendentes = solicitacoesParaImportar(solicitacoes, S);
  const inativos = pendentes.filter(deInativo).length;
  if (pendentes.length === inativos) {
    showToast(`Nenhum pedido aprovado fora da demanda em ${DATA.slice(8, 10)}/${DATA.slice(5, 7)}${inativos ? ` (${inativos} de aluno inativo, que entram quando ele voltar a ativo)` : ''}.`);
    lerSolicitacoesDaData();
    return;
  }
  const { resumo } = porNaDemanda(pendentes);
  showToast(`${resumo.novos + resumo.atualizados} pedido(s) na demanda${notasDaEntrada(resumo)}.`, 'ok');
  lerSolicitacoesDaData();
}
// Os dois botões (o da Demanda e o do aviso de Pedidos) são delegados: a importação não depende do lugar deles na página
aoAcionar('importar-agenda', importarDaAgenda);


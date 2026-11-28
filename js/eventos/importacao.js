// "Importar pedidos aprovados" (na Demanda), "Importar" e "Tirar da escala" (nos avisos de Pedidos): a conciliação dos
// pedidos da data aberta com a demanda (E, até o G2, que a leva para o Processamento): entram os aprovados que nunca
// entraram, voltam os que o dia não guarda, saem os cancelados e os sem aprovação (a vaga ao 1º da lista de espera). A
// conciliação em si (as opções, a gravação e o Histórico) é js/entrada-na-demanda.js, a mesma da entrada na hora de um
// pedido aprovado em Pedidos (js/eventos/agenda.js)
import { aindaNaoAbriu, carregarData } from '../actions.js';
import { showToast } from '../dom.js';
import { porNaDemanda, notasDaEntrada } from '../entrada-na-demanda.js';
import { DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { lerSolicitacoesDaData } from '../solicitacoes-da-data.js';

// A conciliação: só acrescenta os aprovados (não importa o mesmo pedido de novo) e tira os que saíram. A escala desta data
// mudou em outro computador: ela é lida de novo antes (a conciliação gravaria por cima)
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
  const { resumo, entraram, sairam } = porNaDemanda(solicitacoes);
  // Nada entrou nem saiu: sem outra nota, nenhum aprovado está fora da demanda (o de aluno inativo espera, como D dizia);
  // com uma (o aprovado de aluno fora do cadastro, o que espera os programas, o voo do cancelado que fica), nenhum entrou,
  // e a nota diz por quê
  if (!entraram && !sairam) {
    const inativos = resumo.deInativo;
    const notas = notasDaEntrada({ ...resumo, deInativo: 0 });
    const data = `${DATA.slice(8, 10)}/${DATA.slice(5, 7)}`;
    showToast(`${notas ? `Nenhum pedido entrou na demanda em ${data}` : `Nenhum pedido aprovado fora da demanda em ${data}`}${inativos ? ` (${inativos} de aluno inativo, que entram quando ele voltar a ativo)` : ''}${notas}.`);
    lerSolicitacoesDaData();
    return;
  }
  const inicio = entraram || !sairam ? `${resumo.novos + resumo.atualizados} pedido(s) na demanda` : 'Demanda atualizada';
  showToast(`${inicio}${notasDaEntrada(resumo)}.`, 'ok');
  lerSolicitacoesDaData();
}
// Os botões (o da Demanda e os dos avisos de Pedidos) são delegados: a importação não depende do lugar deles na página
aoAcionar('importar-agenda', importarDaAgenda);


// O selo que ainda não é da linha: o número de pedidos aprovados no botão de importar, na Demanda. Os pedidos da data
// aberta são os do cache (js/solicitacoes-da-data.js); lerPedidosDaData é o nome de antes da leitura dele, que o
// js/main.js (congelado desde o F2) ainda chama: o G2 o apaga
import { $ } from '../dom.js';
import { S, isGestor, inativoNaDataAberta, stuBy } from '../state.js';
import { solicitacoesParaImportar } from '../agenda.js';
import { solicitacoesDaData, lerSolicitacoesDaData } from '../solicitacoes-da-data.js';

export const lerPedidosDaData = lerSolicitacoesDaData;

// Os aprovados que ainda não estão na demanda, só de alunos do cadastro ativos (o do inativo entra quando ele voltar a
// ativo; o de quem não está no cadastro, depois de cadastrado), como o aviso de Pedidos e o cartão contam
const paraImportar = () => solicitacoesParaImportar(solicitacoesDaData().lista, S).filter(s => { const aluno = stuBy(s.aluno); return Boolean(aluno) && !inativoNaDataAberta(aluno); });

// (O número dos aviões parados ou perto da revisão, que a Disponibilidade do dia de Recursos tinha, foi para os pontos das
// linhas de Recursos e para o trilho no B)
export function atualizarSelos() {
  // Na Demanda, o botão diz quantos pedidos aprovados há para importar (e só se destaca quando há). Quem consulta não importa
  const n = isGestor() ? 0 : paraImportar().length;
  const botao = $('#importar-agenda');
  if (!botao) return;
  botao.textContent = n ? `Importar ${n} ${n === 1 ? 'pedido aprovado' : 'pedidos aprovados'}` : 'Importar pedidos aprovados';
  botao.classList.toggle('sec', !n);
}

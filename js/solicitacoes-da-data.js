// Os pedidos da data aberta: um cache só, que a lista de Pedidos, o cartão da linha, o trilho, a Demanda e a importação
// leem. Lido ao abrir a data, ao abrir Pedidos e depois das ações deste navegador (registrar, aprovar, retirar a aprovação,
// cancelar, importar); o passo D3 o lê também a cada minuto. Só a leitura mais nova vale, e a resposta de uma data que não
// está mais aberta não entra. A leitura que falha guarda o erro e a lista da leitura de antes (a tela diz que ela não é a
// de agora). A escala da data que mudou em outro computador (ApiClient.diaMudou, na entrada de um pedido aprovado e na
// importação) fica marcada até a data ser lida de novo.
// solicitacoesDaData(): { data, lista (null: ainda não lida), leitura ('lendo', 'lidos' ou 'erro'), lidaEm, erro, diaMudou }
import { DATA } from './state.js';
import { ApiClient } from './storage.js';
import { redesenhar } from './redesenho.js';

// As dependências: a data aberta, a leitura dos pedidos de uma data, o que fazer depois de cada leitura (o redesenho) e o
// relógio (os testes injetam)
export function criarSolicitacoesDaData({ dataAberta, ler, aoLer, agora = () => new Date() }) {
  const vazio = data => ({ data, lista: null, leitura: 'lendo', lidaEm: null, erro: null, diaMudou: false });
  let atual = vazio(null);
  let vezes = 0;
  let emCurso = null;

  const solicitacoesDaData = () => (atual.data === dataAberta() ? atual : vazio(dataAberta()));

  // dataLida: a data acabou de ser lida de novo (a escala desta data é a de agora): a marca da escala que mudou sai
  function lerSolicitacoesDaData({ dataLida = false } = {}) {
    const leitura = { data: dataAberta(), vez: ++vezes, dataLida };
    emCurso = leitura;
    leitura.fim = executar(leitura);
    return leitura.fim;
  }

  async function executar({ data, vez, dataLida }) {
    let lista = null, erro = null;
    try {
      lista = await ler(data);
    } catch (e) {
      erro = e;
    }
    // Outra data aberta, ou uma leitura pedida depois desta (a resposta dela é a que vale)
    if (vez !== vezes) return;
    emCurso = null;
    if (data !== dataAberta()) return;
    const antes = atual.data === data ? atual : vazio(data);
    const diaMudou = !dataLida && antes.diaMudou;
    atual = erro ? { ...antes, leitura: 'erro', erro, diaMudou } : { data, lista, leitura: 'lidos', lidaEm: agora(), erro: null, diaMudou };
    aoLer();
  }

  // Os pedidos da data aberta depois da leitura em curso (a data que acabou de abrir, um pedido que acabou de ser
  // registrado); sem nenhuma lida, uma leitura
  async function solicitacoesDaDataLidas() {
    while (emCurso && emCurso.data === dataAberta()) await emCurso.fim;
    if (solicitacoesDaData().leitura === 'lendo') await lerSolicitacoesDaData();
    return solicitacoesDaData();
  }

  // A escala desta data mudou em outro computador (só a da data aberta): o aviso de Pedidos pede "Atualizar"
  function marcarDiaMudou(data) {
    if (data !== dataAberta() || atual.data !== data || atual.diaMudou) return;
    atual = { ...atual, diaMudou: true };
    aoLer();
  }

  return { solicitacoesDaData, lerSolicitacoesDaData, solicitacoesDaDataLidas, marcarDiaMudou };
}

// O cache do app: a data aberta do estado, os pedidos do servidor (ou deste navegador) e o redesenho 'pedidos'
const doApp = criarSolicitacoesDaData({ dataAberta: () => DATA, ler: data => ApiClient.agenda(data, data), aoLer: () => redesenhar('pedidos') });
export const solicitacoesDaData = doApp.solicitacoesDaData;
export const lerSolicitacoesDaData = doApp.lerSolicitacoesDaData;
export const solicitacoesDaDataLidas = doApp.solicitacoesDaDataLidas;
export const marcarDiaMudou = doApp.marcarDiaMudou;

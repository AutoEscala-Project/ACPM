// Os pedidos da data aberta: um cache só, que a lista de Pedidos, o cartão da linha, o trilho, a Demanda e a importação
// leem. Lido ao abrir a data, ao abrir Pedidos, depois das ações deste navegador (registrar, aprovar, retirar a aprovação,
// cancelar, importar) e pela vigia (D3): a cada minuto com a página à vista, na volta à página e na volta da conexão (com a
// última leitura de mais de 30 s) e quando outra aba deste navegador muda a agenda (o modo local); cada leitura da vigia
// pergunta também se a escala da data mudou em outro computador. Só a leitura mais nova vale, e a resposta de uma data que
// não está mais aberta não entra. A leitura que falha guarda o erro e a lista da leitura de antes (a tela diz que ela não é
// a de agora). A escala da data que mudou em outro computador (ApiClient.diaMudou: na vigia, na entrada de um pedido
// aprovado e na importação) fica marcada até a data ser lida de novo. Entre duas leituras da mesma data, o que mudou (os
// novos, os aprovados, os que voltaram a aguardar, os cancelados), menos o que este navegador acabou de mudar, vai para o
// aviso das novidades. A vigia só lê: nada é gravado, e nenhum voo muda de lugar.
// solicitacoesDaData(): { data, lista (null: ainda não lida), leitura ('lendo', 'lidos' ou 'erro'), lidaEm, erro, diaMudou }
import { DATA } from './state.js';
import { ApiClient } from './storage.js';
import { redesenhar } from './redesenho.js';
import { novidadesDasSolicitacoes, temNovidades } from './agenda.js';
import { CHAVE_AGENDA } from './backends/local.js';

// A vigia: a cada minuto; na volta à página e da conexão, quando a última leitura tem mais disso
const INTERVALO_DA_VIGIA_MS = 60000;
const LEITURA_RECENTE_MS = 30000;

// As dependências: a data aberta, a leitura dos pedidos de uma data, o que fazer depois de cada leitura (o redesenho), os
// relógios (a hora da leitura, para a tela; o relógio que só anda, para a idade da leitura) e a pergunta "a escala desta
// data mudou em outro computador?" (os testes injetam)
export function criarSolicitacoesDaData({
  dataAberta, ler, aoLer, agora = () => new Date(), relogio = () => performance.now(), diaMudou = async () => false
}) {
  const vazio = data => ({ data, lista: null, leitura: 'lendo', lidaEm: null, erro: null, diaMudou: false });
  let atual = vazio(null);
  let vezes = 0;
  let emCurso = null;
  // Quando foi a última leitura boa (o relógio que só anda) e quantas vezes a data foi lida de novo: a resposta da
  // pergunta feita antes de a data ser lida de novo é da escala de antes
  let lidaAs = -Infinity;
  let releituras = 0;
  // O aviso das novidades (a vigia o põe)
  let aoNovidades = () => {};

  const solicitacoesDaData = () => (atual.data === dataAberta() ? atual : vazio(dataAberta()));

  // dataLida: a data acabou de ser lida de novo (a escala desta data é a de agora): a marca da escala que mudou sai.
  // deste: os pedidos que este navegador acabou de mudar (não são novidade). conferirDia: a leitura da vigia, que pergunta
  // também pela escala da data
  function lerSolicitacoesDaData({ dataLida = false, deste = [], conferirDia = false } = {}) {
    if (dataLida) releituras++;
    const leitura = { data: dataAberta(), vez: ++vezes, dataLida, deste };
    emCurso = leitura;
    if (conferirDia && !solicitacoesDaData().diaMudou) perguntarPelaEscala(leitura.data);
    leitura.fim = executar(leitura);
    return leitura.fim;
  }

  // A pergunta não segura a lista: a resposta vem quando vier (o servidor espera as gravações deste navegador). A que falha
  // não diz nada (a leitura seguinte pergunta de novo)
  async function perguntarPelaEscala(data) {
    const vez = releituras;
    let mudou;
    try {
      mudou = await diaMudou(data);
    } catch {
      return;
    }
    if (mudou && vez === releituras) marcarDiaMudou(data);
  }

  async function executar({ data, vez, dataLida, deste }) {
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
    if (!erro) lidaAs = relogio();
    aoLer();
    // As novidades: só entre duas leituras boas da mesma data
    if (erro || !antes.lista) return;
    const novidades = novidadesDasSolicitacoes(antes.lista, lista, { deste });
    if (temNovidades(novidades)) aoNovidades(novidades, data);
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

  // A vigia (D3). Ela só lê depois da primeira leitura da data aberta (a abertura do app, o login: antes disso não há o que
  // vigiar) e nunca com outra leitura da data em curso. documento e janela: os eventos da página (visibilitychange; online
  // e storage, a chave da agenda deste navegador); agendar e desagendar: o temporizador. Devolve como parar
  function vigiar({ documento, janela, aoNovidades: avisar = () => {}, agendar = setInterval, desagendar = clearInterval, chave = CHAVE_AGENDA }) {
    aoNovidades = avisar;
    const podeLer = () => atual.data === dataAberta() && !(emCurso && emCurso.data === dataAberta());
    const ler = () => { if (podeLer()) lerSolicitacoesDaData({ conferirDia: true }); };
    const visivel = () => documento.visibilityState === 'visible';
    const antiga = () => relogio() - lidaAs >= LEITURA_RECENTE_MS;
    const aCadaMinuto = () => { if (visivel()) ler(); };
    const naVolta = () => { if (visivel() && antiga()) ler(); };
    const naConexao = () => { if (antiga()) ler(); };
    const deOutraAba = e => { if (e.key === chave) ler(); };
    const id = agendar(aCadaMinuto, INTERVALO_DA_VIGIA_MS);
    documento.addEventListener('visibilitychange', naVolta);
    janela.addEventListener('online', naConexao);
    janela.addEventListener('storage', deOutraAba);
    return () => {
      desagendar(id);
      documento.removeEventListener('visibilitychange', naVolta);
      janela.removeEventListener('online', naConexao);
      janela.removeEventListener('storage', deOutraAba);
    };
  }

  return { solicitacoesDaData, lerSolicitacoesDaData, solicitacoesDaDataLidas, marcarDiaMudou, vigiar };
}

// O cache do app: a data aberta do estado, os pedidos do servidor (ou deste navegador), o redesenho 'pedidos' e a pergunta
// da escala ao servidor
const doApp = criarSolicitacoesDaData({
  dataAberta: () => DATA, ler: data => ApiClient.agenda(data, data), aoLer: () => redesenhar('pedidos'), diaMudou: data => ApiClient.diaMudou(data)
});
export const solicitacoesDaData = doApp.solicitacoesDaData;
export const lerSolicitacoesDaData = doApp.lerSolicitacoesDaData;
export const solicitacoesDaDataLidas = doApp.solicitacoesDaDataLidas;
export const marcarDiaMudou = doApp.marcarDiaMudou;
// A vigia do app, na página (js/eventos/agenda.js a liga, com o aviso das novidades)
export const vigiarSolicitacoesDaData = aoNovidades => doApp.vigiar({ documento: document, janela: window, aoNovidades });

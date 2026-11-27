// Os dados pessoais (nome completo, CPF, CANAC, nascimento, celular e e-mail) de alunos e instrutores, guardados só aqui,
// fora do estado: nunca vão para o cadastro, o link compartilhado, o CSV, o PDF ou o BI. Operadores, administradores e a
// secretaria veem (no modo local, fora do perfil Gestor); só operadores e administradores alteram. A lista lida traz só
// o CANAC e o nome completo de cada um (as linhas e a busca); os outros campos chegam com a leitura da pessoa escolhida.
// Cada tela mostra a parte dela (o CANAC) e a refaz quando eles mudam (aoMudarDadosPessoais); quem os edita é a seção do
// detalhe (js/views/editor-de-dados-pessoais.js: Alunos) e o painel (js/views/painel-de-dados.js: Instrutores, até virar
// lista e detalhe)
import { ApiClient } from '../storage.js';
import { veDadosPessoais, editaDadosPessoais } from '../perfis.js';
import { juntarAListaLida } from '../dados-pessoais.js';
import { isGestor } from '../state.js';

const DADOS = { aluno: {}, instrutor: {} };

// No modo compartilhado, pelo perfil; no modo local, fora do perfil Gestor (e do link compartilhado)
export const podeVerDadosPessoais = () => (ApiClient.perfil ? veDadosPessoais(ApiClient.perfil) : !isGestor());
// Quem edita: no modo compartilhado, quem opera a escala (a secretaria só lê); no modo local, fora do perfil Gestor. Quem
// só consulta, também a tela travada depois de um conflito, não edita (a gravação seria recusada: js/storage.js)
export const podeEditarDadosPessoais = () => !isGestor() && (ApiClient.perfil ? editaDadosPessoais(ApiClient.perfil) : true);
export const canacDe = (tipo, id) => (DADOS[tipo][id] && DADOS[tipo][id].canac) || '';
export const nomeCompletoDe = (tipo, id) => (DADOS[tipo][id] && DADOS[tipo][id].nome_completo) || '';
// Os dados guardados de uma pessoa (undefined: nenhum)
export const dadosDe = (tipo, id) => DADOS[tipo][id];

// Quem mostra os dados (as colunas CANAC de Instrutores e de Alunos) e os refaz quando eles mudam
const aoMudar = [];
export function aoMudarDadosPessoais(fazer) {
  aoMudar.push(fazer);
}
const avisarQueMudaram = () => aoMudar.forEach(fazer => fazer());

// Guarda os dados de uma pessoa (null: ela não tem nenhum) e avisa quem os mostra
export function guardarDados(tipo, id, dados) {
  if (dados) DADOS[tipo][id] = dados;
  else delete DADOS[tipo][id];
  avisarQueMudaram();
}

export async function carregarDadosPessoais() {
  if (!podeVerDadosPessoais()) return;
  try {
    const [alunos, instrutores] = await Promise.all([ApiClient.listarDadosPessoais('aluno'), ApiClient.listarDadosPessoais('instrutor')]);
    // A pessoa já lida inteira não perde os campos que a lista não traz
    DADOS.aluno = juntarAListaLida(alunos, DADOS.aluno);
    DADOS.instrutor = juntarAListaLida(instrutores, DADOS.instrutor);
    avisarQueMudaram();
  } catch {
    // Sem os dados pessoais, as tabelas continuam funcionando (a coluna fica vazia)
  }
}

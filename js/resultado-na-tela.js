// O resultado da missão do curso registrado pela tela: o servidor (só acréscimo), a situação do aluno em S.resultados e a
// entrada do histórico. Sem ouvintes: a linha do voo (js/eventos/resultados.js) e Alunos (o resultado sem voo, a
// colocação no curso e a reversão dela, js/eventos/alunos.js) chamam
import { logChange, dadosLidos } from './actions.js';
import { S, DATA } from './state.js';
import { ApiClient } from './storage.js';

// Registra um resultado da missão do curso: vai para o servidor (só acréscimo) e entra na situação do aluno (o
// progresso e a próxima missão mudam); os registros do dia, só os da data aberta. descricao: a entrada do histórico
// (null: nenhuma), na data dataDoHistorico (a do voo, ou a aberta para o resultado sem voo; a resposta pode chegar
// depois de trocar de data: a entrada vai direto para aquela data). Responde se o servidor registrou
export async function registrarResultadoNaTela(registro, { descricao = null, dataDoHistorico = registro.data } = {}) {
  let id;
  try {
    id = await ApiClient.registrarResultado(registro);
  } catch {
    return false;
  }
  const novo = { id, ...registro, registrado_em: new Date().toISOString(), registrado_por: ApiClient.autorAtual || null };
  const atual = S.resultados || { situacao: [], doDia: [] };
  const mesmaMissao = r => r.aluno === novo.aluno && r.curso === novo.curso && r.missao === novo.missao;
  // A situação de cada missão vale para todas as datas; os registros do dia, só para a data deles
  const mesmaData = DATA === registro.data && dadosLidos;
  S.resultados = { situacao: [...atual.situacao.filter(r => !mesmaMissao(r)), novo], doDia: mesmaData ? [...atual.doDia, novo] : atual.doDia };
  // O resultado fica no servidor, não nos dados do dia: só a entrada do histórico, sem gravar o dia
  if (descricao) {
    if (DATA === dataDoHistorico && dadosLidos) logChange('mod', descricao);
    else ApiClient.registrarHistorico(dataDoHistorico, { tipo: 'mod', descricao });
  }
  return true;
}

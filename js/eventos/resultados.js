// O resultado da missão do curso, na linha do voo da Escala (o seletor data-resultado): o registro no servidor e a
// situação do aluno. É parte da Escala, que importa este módulo (e vooDaChave)
import { logChange, aindaNaoAbriu, dadosLidos } from '../actions.js';
import { showToast } from '../dom.js';
import { ligada } from '../funcionalidades.js';
import { redesenharPorNome } from '../redesenho.js';
import { S, RES, DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { cursoDoResultado } from '../views/etapas.js';
import { rOut } from '../views/escala.js';

// O voo da escala da data pela chave (null sem escala ou sem o voo)
export const vooDaChave = fKey => (RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey) : null);

// O resultado da missão do curso, na linha do voo: vai para o servidor (só acréscimo), no curso da missão do pedido (o
// aluno pode ter trocado de curso no mesmo dia), e entra na situação do aluno (o progresso e a próxima missão mudam).
// Sem conexão, o seletor volta ao que estava
document.addEventListener('change', async e => {
  const sel = e.target.closest('[data-resultado]');
  if (!sel || isGestor() || !ligada('progresso')) return;
  if (aindaNaoAbriu()) { rOut(); return; }
  const o = vooDaChave(sel.dataset.resultado), curso = o ? cursoDoResultado(o) : null;
  if (!o || !o.etapa || !curso) return;
  const registro = { aluno: o.stuId, curso, missao: o.etapa, resultado: sel.value, data: DATA, voo: o.fKey };
  sel.disabled = true;
  try {
    const id = await ApiClient.registrarResultado(registro);
    const novo = { id, ...registro, registrado_em: new Date().toISOString(), registrado_por: ApiClient.autorAtual || null };
    const atual = S.resultados || { situacao: [], doDia: [] };
    const mesmaMissao = r => r.aluno === novo.aluno && r.curso === novo.curso && r.missao === novo.missao;
    // A situação de cada missão vale para todas as datas; os registros do dia e o histórico, só para a data do voo (a
    // resposta pode chegar depois de trocar de data, ou com outra data abrindo: a entrada vai direto para a data do voo)
    const mesmaData = DATA === registro.data && dadosLidos;
    S.resultados = { situacao: [...atual.situacao.filter(r => !mesmaMissao(r)), novo], doDia: mesmaData ? [...atual.doDia, novo] : atual.doDia };
    const descricao = `Resultado de ${o.s} em ${o.etapa}: ${registro.resultado}`;
    // O resultado fica no servidor, não nos dados do dia: só a entrada do histórico, sem gravar o dia
    if (mesmaData) logChange('mod', descricao);
    else ApiClient.registrarHistorico(registro.data, { tipo: 'mod', descricao });
  } catch {
    showToast('Não foi possível registrar o resultado. Verifique a conexão e tente de novo.');
  }
  rOut(); redesenharPorNome('alunos', 'pedidos-do-dia');
});

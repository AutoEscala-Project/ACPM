// A Demanda: pôr um aluno, as missões extras, limpar a demanda e os filtros. Os campos de cada pedido (o tipo de recurso,
// o instrutor, a prioridade, as preferências, a duração e, até o G2, o Voa e a missão), a missão do curso, o "✕" da Escala
// e a reversão do Voa estão nas restrições do voo (G1, js/eventos/restricoes-do-voo.js)
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { MIS } from '../config.js';
import { $, showToast, ligarMenu } from '../dom.js';
import { semAgendados, limparDemanda } from '../fixos.js';
import { HORARIOS_PADRAO } from '../horarios.js';
import { proximoMid, PRIORIDADE_PADRAO } from '../rules.js';
import { S, isGestor, stuBy } from '../state.js';
import { chaveDoVoo } from '../voo.js';
import { confirmado, comConfirmacao } from './confirmacao.js';
import './importacao.js';
import './restricoes-do-voo.js';
import { aoAcionar } from './registro.js';
import { rDem, filtrarDemanda, manterNaDemanda, prepararFiltroDosCursos, conferirNenhumNaDemanda, limparFiltrosDaDemanda } from '../views/demanda.js';
import { registrarDesenho } from '../redesenho.js';

// O desenho da Demanda (js/redesenho.js), pelo papel: os pedidos do dia
registrarDesenho('pedidos-do-dia', rDem, { em: ['dados', 'consulta', 'releitura'], ordem: 60 });

// "Limpar demanda" pede confirmação no próprio menu (dois cliques): o menu só fecha depois
const fecharMenuMais = ligarMenu($('#btn-mais-dem'), $('#menu-mais-dem'), { fecharAoEscolher: false });

// "Pôr um aluno na demanda": quem ainda não voa passa a voar na data, com o pedido que já tinha
function incluirAluno() {
  const campo = $('#incluir-aluno');
  const nome = campo.value.trim().toLowerCase();
  if (!nome || isGestor() || aindaNaoAbriu()) return;
  const s = S.stu.find(x => x.nm.toLowerCase() === nome);
  if (!s) { showToast('Aluno não encontrado. Cadastre-o em Alunos.'); return; }
  campo.value = '';
  if (s.fly) { showToast(`${s.nm} já está na demanda.`); return; }
  s.fly = true;
  gravarAlteracao('inc', `${s.nm} incluído na demanda`, { kind: 'setFly', stuId: s.id, mid: 0, val: false, label: '↶ Reverter' });
  // Fora dos filtros da barra (as marcas dos cursos podem ter vindo de Alunos), o pedido incluído continua à vista
  manterNaDemanda(s.id);
  rDem();
  const linha = document.querySelector(`#dem tr[data-k="d"][data-id="${s.id}"][data-mid="0"]`);
  if (linha) linha.scrollIntoView({ block: 'center' });
}
$('#incluir-aluno').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  incluirAluno();
});
// Escolher um nome da lista inclui na hora
$('#incluir-aluno').addEventListener('input', e => { if (e.inputType === 'insertReplacementText') incluirAluno(); });

document.addEventListener('input', e => {
  if (e.target.id === 'flt-dem') filtrarDemanda();
});
// O curso do aluno: o filtro de vários valores, que ouve as próprias caixas (js/views/filtro-multiplo.js)
prepararFiltroDosCursos();
$('#flt-dem-mis').onchange = filtrarDemanda;
$('#flt-dem-mis').insertAdjacentHTML('beforeend', Object.keys(MIS).map(m => `<option value="${m}">${m}</option>`).join(''));
// "Só quem voa": a tabela mostra só os pedidos marcados (vale também para quem só consulta)
document.addEventListener('change', e => {
  if (e.target.id !== 'onlyfly') return;
  $('#dem').classList.toggle('only', e.target.checked);
  conferirNenhumNaDemanda();
});
// "Limpar filtros", na linha que diz que nenhum aluno passa nos filtros: sem data-act, ele vale também para quem só
// consulta
document.addEventListener('click', e => {
  if (e.target.closest('#limpar-filtros-dem')) limparFiltrosDaDemanda();
});

// "Limpar demanda": cada pedido fica em branco, sem nada do voo de antes, e o voo dele fica solto, sem o voo fixo (também
// o agendado na Escala) e sem o status (js/fixos.js). Assim o Voa religado à mão não traz a disponibilidade, o cadeado
// nem o status de antes, e o pedido da agenda da mesma missão toma este voo. O voo em andamento ou que já pousou fica
// como está (o agendado continua agendado), e a escala aprovada é reaberta; o histórico e o aviso dizem quantos voos
// ficaram
comConfirmacao('#clr', 'Confirmar limpeza', () => {
  if (isGestor()) return;
  const { ficam, reaberta } = limparDemanda(S);
  const texto = `Demanda limpa${reaberta ? ' e escala reaberta' : ''}${ficam ? ` (${ficam === 1 ? '1 voo em andamento fica' : `${ficam} voos em andamento ficam`})` : ''}`;
  gravarAlteracao('exc', texto);
  rDem();
  fecharMenuMais();
  showToast(`${texto}.`, 'ok');
});

aoAcionar('add-mis', (b, { id }) => {
  const s = stuBy(id);
  if (!s) return;
  if (!Array.isArray(s.extra)) s.extra = [];
  const newEx = {
    mid: proximoMid(S, s),
    fly: true,
    mis: 'Voo Local',
    eq: 'C152',
    p1: HORARIOS_PADRAO[4],
    p2: HORARIOS_PADRAO[6],
    nb: 1,
    ss: 1,
    pr: s.pr || PRIORIDADE_PADRAO
  };
  s.extra.push(newEx);
  gravarAlteracao('inc', `Missão extra adicionada para ${s.nm}`);
  rDem();
  showToast(`Nova missão adicionada para ${s.nm}.`, 'ok');
});

aoAcionar('del-mis', (b, { id, mid }) => {
  const s = stuBy(id);
  if (!s || !Array.isArray(s.extra) || !confirmado(b, 'Confirmar')) return;
  s.extra = s.extra.filter(ex => ex.mid !== mid);
  // O voo agendado da missão sai com ela (com um status que fixa, fica fixo pelo status, como os outros)
  S.fixos = semAgendados(S.fixos, [chaveDoVoo(s.id, mid)], S.fStatus);
  gravarAlteracao('exc', `Missão extra removida de ${s.nm}`);
  rDem();
});

// A Demanda: pôr um aluno, a próxima missão do curso, as missões extras, tirar da escala, limpar a demanda, os filtros e
// os campos de cada pedido
import { gravarAlteracao } from '../actions.js';
import { T, GROUND_EQ_TYPE, GROUND_DURATION_H, MIS } from '../config.js';
import { $, showToast, ligarMenu } from '../dom.js';
import { fmtDurLabel } from '../format.js';
import { horariosDaMissao, ajustarPreferencias } from '../horarios.js';
import { isGroundMission, blank, rotuloDaDisponibilidade, normalizeMissionFields, proximoMid, duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S, isGestor, stuBy, getMissionTarget } from '../state.js';
import { confirmado, comConfirmacao } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { singleDemandRowHTML, cnt, rDem, applyDemandFilters } from '../views/demanda.js';
import { renderAuditPanel } from '../views/escala.js';
import { proximaDoPedido } from '../views/etapas.js';

// "Limpar demanda" pede confirmação no próprio menu (dois cliques): o menu só fecha depois
const fecharMenuMais = ligarMenu($('#btn-mais-dem'), $('#menu-mais-dem'), { fecharAoEscolher: false });

// "Pôr um aluno na demanda": quem ainda não voa passa a voar na data, com o pedido que já tinha
function incluirAluno() {
  const campo = $('#incluir-aluno');
  const nome = campo.value.trim().toLowerCase();
  if (!nome || isGestor()) return;
  const s = S.stu.find(x => x.nm.toLowerCase() === nome);
  if (!s) { showToast('Aluno não encontrado. Cadastre-o na aba Alunos.'); return; }
  campo.value = '';
  if (s.fly) { showToast(`${s.nm} já está na demanda.`); return; }
  s.fly = true;
  gravarAlteracao('inc', `${s.nm} incluído na demanda`, { kind: 'setFly', stuId: s.id, mid: 0, val: false, label: '↶ Reverter' });
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
  if (e.target.id === 'flt-dem') applyDemandFilters();
});
$('#flt-dem-mis').onchange = applyDemandFilters;
$('#flt-dem-mis').insertAdjacentHTML('beforeend', Object.keys(MIS).map(m => `<option value="${m}">${m}</option>`).join(''));
// "Só quem voa": a tabela mostra só os pedidos marcados (vale também para quem só consulta)
document.addEventListener('change', e => {
  if (e.target.id === 'onlyfly') $('#dem').classList.toggle('only', e.target.checked);
});

comConfirmacao('#clr', 'Confirmar limpeza', () => {
  if (isGestor()) return;
  S.stu.forEach(d => { Object.assign(d, blank()); d.extra = []; });
  gravarAlteracao('exc', 'Demanda limpa');
  rDem();
  fecharMenuMais();
});

// A próxima missão do curso: o pedido vira a missão do programa (tipo, recurso e horas) e o aluno voa
aoAcionar('usar-proxima', (b, { id, mid }) => {
  const s = stuBy(id), target = getMissionTarget(id, mid);
  const m = s && target ? proximaDoPedido(s, mid) : null;
  if (!m) return;
  Object.assign(target, { fly: true, mis: m.mis, eq: m.eq, nb: m.nb, etapa: m.id });
  ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
  normalizeMissionFields(target);
  gravarAlteracao('inc', `${s.nm}: ${m.id} na demanda (${m.mis} · ${m.eq} · ${fmtDurLabel(m.nb)})`);
  rDem();
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
    p1: T[4],
    p2: T[6],
    nb: 1,
    ss: 1,
    pr: s.pr || 3
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
  gravarAlteracao('exc', `Missão extra removida de ${s.nm}`);
  rDem();
});

aoAcionar('rm-fly', (b, { id, mid }) => {
  const s = stuBy(id);
  const target = getMissionTarget(id, mid);
  if (!s || !target || !target.fly) return;
  target.fly = false;
  gravarAlteracao('exc', `Tirado da escala: ${s.nm} (${target.mis} · ${target.eq})`, {
    kind: 'setFly', stuId: s.id, mid, val: true, label: '↶ Restaurar'
  });
  rDem();
  showToast(`Tirado da escala: ${s.nm} (${target.mis}).`, 'ok');
});

// Os campos de um pedido da demanda
aoMudarCampo('d', (t, { f, c, id, mid }) => {
  const s = stuBy(id);
  const target = getMissionTarget(id, mid);
  if (!target) return;
  let historico;
  if (f === 'fly') {
    target.fly = t.checked;
    // O aluno que não vai voar não voa as missões extras; reverter volta todas
    const extras = !mid && !target.fly ? (s.extra || []).filter(ex => ex.fly) : [];
    extras.forEach(ex => { ex.fly = false; });
    historico = [
      target.fly ? 'inc' : 'exc',
      `${s.nm} ${target.fly ? 'incluído' : 'retirado'} (${target.mis} · ${target.eq} · ${fmtDurLabel(target.nb)})${extras.length ? `, com ${extras.length === 1 ? 'a missão extra' : `as ${extras.length} missões extras`}` : ''}`,
      { kind: 'setFly', stuId: s.id, mid, val: !target.fly, ...(extras.length ? { extras: extras.map(ex => ex.mid) } : {}), label: target.fly ? '✕ Excluir' : '↶ Restaurar' }
    ];
    if (extras.length) rDem();
  } else if (f === 'jan') {
    // Disponibilidade do aluno: o voo só começa nessas janelas (vazio: qualquer horário)
    if (t.value) target.jan = t.value;
    else delete target.jan;
    historico = ['mod', `Pedido ${s.nm}: disponibilidade ${rotuloDaDisponibilidade(target.jan)} (${target.mis})`];
  } else {
    // A duração digitada: de 0,1 h a 5 h, em décimos; fora disso, não vale
    if (f === 'nb') {
      const h = duracaoDigitada(t.value);
      if (h === null) {
        showToast(ERRO_DA_DURACAO);
        c.outerHTML = singleDemandRowHTML(s, target, mid);
        return;
      }
      t.value = h;
    }
    const eraGround = isGroundMission(target.mis);
    target[f] = (f === 'mis' || f === 'eq') ? t.value : +t.value;
    // Missão, recurso ou horas mudados à mão: o pedido deixa de ser a missão do curso
    if (['mis', 'eq', 'nb'].includes(f)) delete target.etapa;
    if (f === 'mis') {
      const mRule = MIS[target.mis] || MIS['Voo Local'];
      if (!mRule.eq.includes(target.eq)) {
        target.eq = mRule.defEq;
      }
      if (mRule.isGround) {
        target.eq = GROUND_EQ_TYPE;
        target.nb = GROUND_DURATION_H;
      } else if (eraGround) {
        target.nb = 1;
      }
    }
    // Os horários da missão e do avião novos (o Noturno sai às 17:30; o PA-34 tem os seus)
    if (f === 'mis' || f === 'eq') ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
    historico = ['mod', `Pedido ${s.nm}: ${target.mis} · ${target.eq} · ${fmtDurLabel(target.nb)}`];
  }
  gravarAlteracao(...historico);
  c.outerHTML = singleDemandRowHTML(s, target, mid);
  cnt();
  renderAuditPanel();
});

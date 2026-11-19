// A Demanda: pôr um aluno, a próxima missão do curso e as outras, as missões extras, tirar da escala, limpar a demanda,
// os filtros e os campos de cada pedido
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { T, GROUND_EQ_TYPE, GROUND_DURATION_H, MIS } from '../config.js';
import { $, showToast, ligarMenu, trocarElemento } from '../dom.js';
import { semAgendados } from '../fixos.js';
import { fmtDurLabel } from '../format.js';
import { horariosDaMissao, ajustarPreferencias } from '../horarios.js';
import { isGroundMission, blank, rotuloDaDisponibilidade, normalizeMissionFields, proximoMid, duracaoDigitada, ERRO_DA_DURACAO, duracaoPadraoDaMissao } from '../rules.js';
import { S, RES, isGestor, stuBy, insBy, getMissionTarget } from '../state.js';
import { chaveDoVoo } from '../voo.js';
import { escolherInstrutor } from '../instrutor-escolhido.js';
import { confirmado, comConfirmacao } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { singleDemandRowHTML, cnt, rDem, applyDemandFilters } from '../views/demanda.js';
import { renderAuditPanel } from '../views/escala.js';
import { proximaDoPedido, outraMissaoDoPedido, botaoForaDaOrdem, confirmacaoDaMissao } from '../views/etapas.js';

// "Limpar demanda" pede confirmação no próprio menu (dois cliques): o menu só fecha depois
const fecharMenuMais = ligarMenu($('#btn-mais-dem'), $('#menu-mais-dem'), { fecharAoEscolher: false });

// O voo agendado na Escala é do pedido como ele estava: com outra missão, outro recurso ou outras horas (à mão ou pela
// próxima missão do curso), ele deixa de ser fixo, e a escala encaixa o pedido de novo. O que está em andamento, pousou
// ou foi cancelado continua fixo pelo status, só sem a marca do agendamento. Devolve o que o histórico diz
function soltarAgendado(stuId, mid) {
  const fKey = chaveDoVoo(stuId, mid);
  if (!(S.fixos && S.fixos[fKey] && S.fixos[fKey].agendado)) return '';
  S.fixos = semAgendados(S.fixos, [fKey], S.fStatus);
  return S.fixos[fKey] ? '' : ' (deixa de ser fixo)';
}

// "Pôr um aluno na demanda": quem ainda não voa passa a voar na data, com o pedido que já tinha
function incluirAluno() {
  const campo = $('#incluir-aluno');
  const nome = campo.value.trim().toLowerCase();
  if (!nome || isGestor() || aindaNaoAbriu()) return;
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

// "Limpar demanda": cada pedido fica em branco, sem nada do voo de antes (como o pedido que a agenda reaproveita): saem
// a disponibilidade, a missão do curso, o pedido da agenda e o instrutor escolhido, e as missões extras. Assim o Voa
// religado à mão não traz a disponibilidade de antes, e o pedido da agenda da mesma missão toma este voo
comConfirmacao('#clr', 'Confirmar limpeza', () => {
  if (isGestor()) return;
  S.stu.forEach(d => { Object.assign(d, blank()); for (const campo of ['jan', 'etapa', 'cursoDaEtapa', 'solicitacao', 'insId']) delete d[campo]; d.extra = []; });
  // Os voos agendados na Escala saem com os pedidos (um agendamento não passa para o pedido que vier depois); o que tem um
  // status que fixa continua fixo pelo status, como os outros
  S.fixos = semAgendados(S.fixos, null, S.fStatus);
  gravarAlteracao('exc', 'Demanda limpa');
  rDem();
  fecharMenuMais();
});

// A missão do curso no pedido: ele vira a missão do programa (tipo, recurso e horas; a duração fixa da missão vale mais),
// com o código e o curso dela, e o aluno voa; o instrutor escolhido continua. Devolve o que o histórico diz do voo
// agendado do pedido (que deixa de ser fixo)
function usarMissaoDoCurso(s, target, mid, { codigo, curso, mis, eq, nb }) {
  Object.assign(target, { fly: true, mis, eq, nb, etapa: codigo, cursoDaEtapa: curso });
  ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
  normalizeMissionFields(target);
  return soltarAgendado(s.id, mid);
}
// O pedido como ficou, para o histórico
const missaoDoPedido = d => `${d.mis} · ${d.eq} · ${fmtDurLabel(d.nb)}`;

// O curso encerrado no histórico (a missão foi confirmada assim)
const comOCursoEncerrado = (encerrado, sigla) => (encerrado ? `, com o curso ${sigla} encerrado` : '');

// A próxima missão do curso: o pedido vira a missão do programa (tipo, recurso e horas) e o aluno voa. No curso
// encerrado, o primeiro acionamento arma o botão e o segundo confirma (como no agendamento, desenho §4.9), e o histórico
// diz que o curso estava encerrado
aoAcionar('usar-proxima', (b, { id, mid }) => {
  const s = stuBy(id), target = getMissionTarget(id, mid);
  const m = s && target ? proximaDoPedido(s, mid) : null;
  if (!m) return;
  if (m.encerrado && !confirmado(b, `Confirmar: ${m.id} do curso encerrado`)) return;
  const solto = usarMissaoDoCurso(s, target, mid, { ...m, codigo: m.id });
  gravarAlteracao('inc', `${s.nm}: ${m.id} na demanda (${missaoDoPedido(target)})${comOCursoEncerrado(m.encerrado, m.curso)}${solto}`);
  rDem();
});

// "Outra missão do curso": a liberada vale na hora, como o Usar. A fora da ordem (a missão bloqueada pelo programa, a já
// aprovada, a dispensada ou a que o aluno já tem em outro voo do dia) pede confirmação: o botão dela aparece armado, e
// o segundo acionamento põe a missão no pedido; o histórico diz por que ela estava fora da ordem. No curso encerrado,
// também a liberada pede confirmação, e o histórico diz que o curso estava encerrado
function escolherOutraMissao(t, c, s, target, mid) {
  const escolha = t.value ? outraMissaoDoPedido(s, target, mid, t.value) : null;
  if (!escolha) { trocarElemento(c, singleDemandRowHTML(s, target, mid)); return; }
  const { missao: m } = escolha;
  if (escolha.liberada && !escolha.encerrado) {
    const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
    gravarAlteracao('inc', `${s.nm}: ${m.codigo} na demanda (${missaoDoPedido(target)})${solto}`);
    rDem();
    return;
  }
  c.querySelector('[data-act="usar-fora-da-ordem"]')?.remove();
  t.insertAdjacentHTML('afterend', botaoForaDaOrdem(s, escolha));
  const botao = t.nextElementSibling;
  confirmado(botao, confirmacaoDaMissao(escolha).armado);
  botao.focus();
}

aoAcionar('usar-fora-da-ordem', (b, { id, mid }) => {
  const s = stuBy(id), target = getMissionTarget(id, mid);
  const escolha = s && target ? outraMissaoDoPedido(s, target, mid, b.dataset.codigo) : null;
  // A missão já não é uma das outras do pedido (o programa ou os resultados mudaram): a linha volta a mostrar as de agora
  if (!escolha) { rDem(); return; }
  const { missao: m } = escolha;
  if ((!escolha.liberada || escolha.encerrado) && !confirmado(b, confirmacaoDaMissao(escolha).armado)) return;
  const solto = usarMissaoDoCurso(s, target, mid, { ...m, curso: escolha.curso });
  const como = escolha.liberada ? ` (${missaoDoPedido(target)})` : `, fora da ordem (${escolha.motivo})`;
  gravarAlteracao('inc', `${s.nm}: ${m.codigo} na demanda${como}${comOCursoEncerrado(escolha.encerrado, escolha.curso)}${solto}`);
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
  // O voo agendado da missão sai com ela (com um status que fixa, fica fixo pelo status, como os outros)
  S.fixos = semAgendados(S.fixos, [chaveDoVoo(s.id, mid)], S.fStatus);
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
  if (f === 'outra-missao') { escolherOutraMissao(t, c, s, target, mid); return; }
  let historico;
  if (f === 'insId') {
    // O instrutor escolhido: o app procura o horário e o avião com ele. O voo que já está fixo fica onde está, com o
    // instrutor novo (na turma de Ground, a turma inteira)
    const x = t.value ? insBy(+t.value) : null;
    const { antes, alunos } = escolherInstrutor(S, RES, { stuId: s.id, mid }, x ? x.id : null);
    gravarAlteracao('mod', `Pedido ${s.nm}: instrutor ${x ? x.nm : 'automático'} (${target.mis})`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' });
    if (alunos > 1) showToast(`A turma de ${target.mis} passa inteira para ${x ? x.nm : 'a escolha do app'}.`, 'ok');
    rDem();
    return;
  }
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
        trocarElemento(c, singleDemandRowHTML(s, target, mid));
        return;
      }
      t.value = h;
    }
    const eraGround = isGroundMission(target.mis);
    // Saindo de uma missão com duração padrão ou fixa (o simulador, o Noturno), a missão nova começa com a dela
    const tinhaPadrao = Boolean((MIS[target.mis] || {}).duracaoPadrao || (MIS[target.mis] || {}).duracaoFixaH);
    const anterior = target[f];
    target[f] = (f === 'mis' || f === 'eq') ? t.value : +t.value;
    // Missão, recurso ou horas mudados à mão: o pedido deixa de ser a missão do curso (o código e o curso dela), e o voo
    // agendado dele na Escala deixa de ser fixo. A mesma duração digitada de outro jeito (1.0 no lugar de 1) não muda o voo
    const mudouOVoo = ['mis', 'eq', 'nb'].includes(f) && target[f] !== anterior;
    if (mudouOVoo) for (const campo of ['etapa', 'cursoDaEtapa']) delete target[campo];
    const solto = mudouOVoo ? soltarAgendado(s.id, mid) : '';
    if (f === 'mis') {
      const mRule = MIS[target.mis] || MIS['Voo Local'];
      if (!mRule.eq.includes(target.eq)) {
        target.eq = mRule.defEq;
      }
      if (mRule.isGround) {
        target.eq = GROUND_EQ_TYPE;
        target.nb = GROUND_DURATION_H;
      } else if (eraGround || tinhaPadrao || mRule.duracaoPadrao) {
        // A missão nova começa com a duração padrão dela (o simulador, 2 h); vindo do Ground ou do simulador, também
        target.nb = duracaoPadraoDaMissao(target.mis);
      }
    }
    // Os horários da missão e do avião novos (o Noturno sai às 17:30; o PA-34 tem os seus)
    if (f === 'mis' || f === 'eq') ajustarPreferencias(target, horariosDaMissao(S.horarios, target.mis, target.eq));
    historico = ['mod', `Pedido ${s.nm}: ${target.mis} · ${target.eq} · ${fmtDurLabel(target.nb)}${solto}`];
  }
  gravarAlteracao(...historico);
  trocarElemento(c, singleDemandRowHTML(s, target, mid));
  cnt();
  renderAuditPanel();
});

// Instrutores e Alunos: incluir, excluir, os campos de cada linha, "Não escalar com", as habilitações, os dados pessoais,
// os limites da lei e os filtros
import { gravarAlteracao, mostrarNoHistorico } from '../actions.js';
import { WIN, PRE } from '../config.js';
import { normalizarCursoDoAluno } from '../cursos.js';
import { $, showToast, focusLast } from '../dom.js';
import { nomeLimpo, numeroBr } from '../format.js';
import { habilitacoesDoNivel, normalizarHabilitacoes, nomeDaHabilitacao } from '../habilitacoes.js';
import { LIMITES_DA_LEI, normalizarLimites, comHorasExternas } from '../limites.js';
import { blank } from '../rules.js';
import { S, DATA, insBy, stuBy } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rIns, rAlu, applyInstructorFilters, preencherFiltroDeHabilitacoes, mostrarVistaDosInstrutores, abrirPainelDoInstrutor, fecharPainelDoInstrutor, atualizarLinhaDoCadastro, atualizarLinhaDoAluno, rPainelDoInstrutor, rLimites, podeEditarLimites } from '../views/cadastros.js';
import { abrirPainelDeDados, fecharPainelDeDados, salvarPainelDeDados } from '../views/dados-pessoais.js';
import { rDem } from '../views/demanda.js';
import { dialogoDeStatusAberto } from '../views/dialogo-status.js';

// Dados pessoais de um aluno ou instrutor: o botão da linha abre o painel; Cancelar, ✕ e Esc fecham (o foco volta para
// o botão). Salvar valida e grava; o histórico registra só os nomes dos campos que mudaram
document.addEventListener('click', e => {
  const botao = e.target.closest('[data-dados]');
  if (botao) {
    const [tipo, id] = botao.dataset.dados.split(':');
    abrirPainelDeDados(tipo, +id, botao);
    return;
  }
  if (e.target.closest('#btn-fechar-dados, #btn-cancelar-dados')) fecharPainelDeDados(true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#painel-dados').hidden && !dialogoDeStatusAberto()) fecharPainelDeDados(true);
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'form-dados') return;
  e.preventDefault();
  const salvo = await salvarPainelDeDados();
  if (!salvo) return;
  fecharPainelDeDados(true);
  showToast(`Dados pessoais de ${salvo.nome} salvos.`, 'ok');
  if (salvo.historico && salvo.data === DATA) mostrarNoHistorico(salvo.historico);
});

// Painel das habilitações de um instrutor: ✕ e Esc fecham (o foco volta para o botão que abriu)
document.addEventListener('click', e => {
  if (e.target.closest('#btn-fechar-painel-instrutor')) fecharPainelDoInstrutor(true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#painel-instrutor').hidden) fecharPainelDoInstrutor(true);
});

// Filtros: os instrutores (nome, habilitação) e os alunos (nome)
document.addEventListener('input', e => {
  if (e.target.dataset.flt === 'inst') { applyInstructorFilters(); return; }
  const f = e.target.dataset.flt;
  if (!f) return;
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#' + f + ' .cd').forEach(c => {
    c.hidden = !c.querySelector('.nm').value.toLowerCase().includes(q);
  });
});
preencherFiltroDeHabilitacoes();
$('#flt-ins-hab').onchange = applyInstructorFilters;

aoAcionar('editar-habs', b => abrirPainelDoInstrutor(+b.dataset.id));

// O instrutor novo aparece no cadastro, com o nome selecionado para digitar
aoAcionar('addi', () => {
  const newIns = { id: S.nid++, nm: 'Novo instrutor', on: true, hab: habilitacoesDoNivel(1), kg: 0, aw: WIN.map((_, i) => i < 8) };
  S.ins.push(newIns);
  mostrarVistaDosInstrutores('cadastro');
  gravarAlteracao('inc', `Instrutor adicionado: ${newIns.nm}`);
  rIns(); rAlu(); focusLast('#inst .nm');
});

aoAcionar('adds', () => {
  const newStu = { id: S.nid++, nm: 'Novo aluno', kg: 0, bl: [], extra: [], ...blank() };
  S.stu.push(newStu);
  gravarAlteracao('inc', `Aluno cadastrado: ${newStu.nm}`);
  rAlu(); rDem(); focusLast('#alu .nm');
});

aoAcionar('unbl', (b, { id }) => {
  const s = stuBy(id);
  const blkIns = insBy(+b.dataset.b);
  s.bl = s.bl.filter(v => v !== +b.dataset.b);
  gravarAlteracao('mod', `${s.nm}: volta a ser escalado com ${blkIns ? blkIns.nm : ''}`);
  atualizarLinhaDoAluno(s, { naoEscalar: true });
});

aoAcionar(['deli', 'dels'], (b, { id }) => {
  const a = b.dataset.act;
  if (!confirmado(b, 'Confirmar')) return;
  if (a === 'deli') {
    const target = insBy(id);
    if (+$('#painel-instrutor').dataset.id === id) fecharPainelDoInstrutor();
    S.ins = S.ins.filter(x => x.id !== id);
    S.stu.forEach(s => s.bl = s.bl.filter(v => v !== id));
    // Os pedidos do dia com o instrutor escolhido voltam para a escolha do app
    S.stu.forEach(s => [s, ...(s.extra || [])].forEach(p => { if (p.insId === id) delete p.insId; }));
    gravarAlteracao('exc', `Instrutor excluído: ${target ? target.nm : id}`);
  } else {
    const target = stuBy(id);
    S.stu = S.stu.filter(x => x.id !== id);
    gravarAlteracao('exc', `Aluno excluído: ${target ? target.nm : id}`);
  }
  rIns(); rAlu(); rDem();
});

// Os campos de um instrutor
aoMudarCampo('i', (t, { f, id }) => {
  const x = insBy(id);
  let historico = [];
  if (f === 'on') {
    x.on = t.checked;
    historico = [t.checked ? 'inc' : 'exc', `${x.nm}: ${t.checked ? 'Disponível' : 'Indisponível'}`, {
      kind: 'setInsOn', insId: x.id, val: !t.checked, label: '↶ Reverter'
    }];
  } else if (f === 'nm') {
    const old = x.nm;
    x.nm = nomeLimpo(t.value, x.nm);
    historico = ['mod', `Instrutor: ${old} → ${x.nm}`];
  } else if (f === 'kg') {
    x.kg = +t.value || 0;
    historico = ['mod', `Peso ${x.nm}: ${x.kg} kg`];
  } else if (f === 'hab') {
    const h = t.dataset.h;
    x.hab = normalizarHabilitacoes(t.checked ? [...x.hab, h] : x.hab.filter(k => k !== h));
    historico = ['mod', `Habilitação ${t.checked ? 'incluída' : 'retirada'}: ${x.nm} · ${nomeDaHabilitacao(h)}`];
  } else if (f === 'ext-mes' || f === 'ext-ano') {
    // Horas de voo fora do app (limites da lei): neste mês ou, no ano, antes deste mês
    const chave = f === 'ext-mes' ? DATA.slice(0, 7) : `${DATA.slice(0, 4)}-00`;
    const horas = Math.round(Math.min(2000, Math.max(0, +t.value || 0)) * 10) / 10;
    x.horasExternas = { ...(x.horasExternas || {}) };
    if (horas > 0) x.horasExternas[chave] = horas;
    else delete x.horasExternas[chave];
    if (!Object.keys(x.horasExternas).length) delete x.horasExternas;
    S.horasDosInstrutores = comHorasExternas(S.horasBase || {}, S.ins, DATA);
    gravarAlteracao('mod', `Horas de voo fora do app de ${x.nm} (${f === 'ext-mes' ? 'neste mês' : 'no ano, antes deste mês'}): ${numeroBr(horas)} h`);
    rPainelDoInstrutor();
    return;
  } else if (f === 'aw') {
    x.aw[+t.dataset.w] = t.checked;
  } else if (f === 'pre') {
    if (!t.value) return;
    x.aw = WIN.map((_, i) => PRE[t.value].includes(i));
  }
  // A grade do dia é refeita com a escala; a linha do cadastro é atualizada no lugar. As janelas e a predefinição do
  // instrutor gravam sem entrar no histórico
  gravarAlteracao(...historico);
  atualizarLinhaDoCadastro(x);
  if (f === 'nm') rAlu();
});

// Os campos de um aluno
aoMudarCampo('s', (t, { f, id }) => {
  const s = stuBy(id);
  let historico = [];
  if (f === 'nm') {
    const old = s.nm;
    s.nm = nomeLimpo(t.value, s.nm);
    historico = ['mod', `Aluno: ${old} → ${s.nm}`];
  } else if (f === 'kg') {
    s.kg = +t.value || 0;
    historico = ['mod', `Peso ${s.nm}: ${s.kg} kg`];
  } else if (f === 'bl' && t.value) {
    s.bl.push(+t.value);
    const ins = insBy(+t.value);
    historico = ['exc', `${s.nm}: não escalar com ${ins ? ins.nm : ''}`];
  } else if (f === 'curso') {
    // O curso do aluno
    const curso = normalizarCursoDoAluno(t.value);
    if (curso) s.curso = curso;
    else delete s.curso;
    historico = ['mod', `Curso de ${s.nm}: ${curso || 'nenhum'}`];
  }
  gravarAlteracao(...historico);
  atualizarLinhaDoAluno(s, { naoEscalar: f === 'bl' });
  if (f === 'nm') rDem();
});

// Limites da lei, no cadastro dos instrutores: só o Administrador muda (neste navegador, o Operador). Vazio é
// sem limite; os campos em horas viram minutos onde o limite é guardado em minutos
const ROTULOS_DOS_LIMITES = { vooPorJornadaMin: 'voo por jornada', jornadaMin: 'jornada', vooMesH: 'voo no mês', vooSemestreH: 'voo no semestre', vooAnoH: 'voo no ano', repousoMin: 'repouso' };
const emHoras = (chave, valor) => (valor === null ? 'sem limite' : `${numeroBr(chave.endsWith('Min') ? valor / 60 : valor)} h`);
document.addEventListener('change', e => {
  const campo = e.target.closest('[data-limite]');
  if (!campo || !podeEditarLimites()) return;
  const chave = campo.dataset.limite, divisor = +campo.dataset.divisor;
  const antes = normalizarLimites(S.limites);
  const valor = campo.value.trim() === '' ? null : +campo.value * divisor;
  if (valor !== null && !Number.isFinite(valor)) { rLimites(); return; }
  // O limite é maior que zero; vazio é sem limite
  if (valor !== null && valor <= 0) { showToast('O limite precisa ser maior que zero (vazio é sem limite).'); rLimites(); return; }
  S.limites = normalizarLimites({ ...antes, [chave]: valor });
  gravarAlteracao('mod', `Limites da lei: ${ROTULOS_DOS_LIMITES[chave]} ${emHoras(chave, antes[chave])} → ${emHoras(chave, S.limites[chave])}`);
  rLimites();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-limites-padrao]');
  if (!b || !podeEditarLimites() || !confirmado(b, 'Confirmar valores da lei')) return;
  S.limites = { ...LIMITES_DA_LEI };
  gravarAlteracao('mod', 'Limites da lei: de volta aos valores da lei');
  rLimites();
});

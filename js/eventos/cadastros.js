// Instrutores e Alunos: incluir, excluir, os campos de cada linha, "Não escalar com", as habilitações, os dados pessoais,
// os limites da lei e os filtros
import { gravarAlteracao, mostrarNoHistorico, aindaNaoAbriu } from '../actions.js';
import { WIN, PRE } from '../config.js';
import { normalizarCursoDoAluno } from '../cursos.js';
import { $, showToast, focusLast, algumDialogoAberto, gavetaDoEsc } from '../dom.js';
import { nomeLimpo, numeroBr } from '../format.js';
import { habilitacoesDoNivel, normalizarHabilitacoes, nomeDaHabilitacao } from '../habilitacoes.js';
import { LIMITES_DA_LEI, normalizarLimites, comHorasExternas } from '../limites.js';
import { comRepousoDoNoturno } from '../noturno.js';
import { blank, pesoDigitado, ERRO_DO_PESO } from '../rules.js';
import { fixoPeloStatus } from '../fixos.js';
import { S, DATA, insBy, stuBy } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rIns, rAlu, applyInstructorFilters, preencherFiltroDeHabilitacoes, mostrarVistaDosInstrutores, abrirPainelDoInstrutor, fecharPainelDoInstrutor, atualizarLinhaDoCadastro, atualizarLinhaDoAluno, rPainelDoInstrutor, rLimites, podeEditarLimites } from '../views/cadastros.js';
import { abrirPainelDeDados, fecharPainelDeDados, salvarPainelDeDados } from '../views/dados-pessoais.js';
import { rDem } from '../views/demanda.js';

// Dados pessoais de um aluno ou instrutor: o botão da linha abre o painel; Cancelar, ✕ e Esc fecham (o foco volta para
// o botão; o Esc, quando o painel é a gaveta de cima ou tem o foco: js/dom.js). Salvar valida e grava; o histórico
// registra só os nomes dos campos que mudaram
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
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-dados') && !algumDialogoAberto()) fecharPainelDeDados(true);
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

// Painel das habilitações de um instrutor: ✕ e Esc fecham (o foco volta para o botão que abriu; o Esc, quando o painel
// é a gaveta de cima ou tem o foco). Ele continua aberto nas outras abas: com um diálogo aberto por cima (o do status,
// na Escala), o Esc fecha só o diálogo
document.addEventListener('click', e => {
  if (e.target.closest('#btn-fechar-painel-instrutor')) fecharPainelDoInstrutor(true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-instrutor') && !algumDialogoAberto()) fecharPainelDoInstrutor(true);
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
  rIns(); rAlu(); rDem(); focusLast('#inst .nm');
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
  rDem();
});

aoAcionar('unvc', (b, { id }) => {
  const s = stuBy(id);
  const ins = insBy(+b.dataset.b);
  s.voaCom = (s.voaCom || []).filter(v => v !== +b.dataset.b);
  if (!s.voaCom.length) delete s.voaCom;
  gravarAlteracao('mod', `${s.nm}: deixa de priorizar ${ins ? ins.nm : ''}`);
  atualizarLinhaDoAluno(s, { voaComMudou: true });
  rDem();
});

aoAcionar(['deli', 'dels'], (b, { id }) => {
  const a = b.dataset.act;
  if (!confirmado(b, 'Confirmar')) return;
  if (a === 'deli') {
    const target = insBy(id);
    if (+$('#painel-instrutor').dataset.id === id) fecharPainelDoInstrutor();
    S.ins = S.ins.filter(x => x.id !== id);
    S.stu.forEach(s => s.bl = s.bl.filter(v => v !== id));
    S.stu.forEach(s => { if (s.voaCom) s.voaCom = s.voaCom.filter(v => v !== id); if (s.voaCom && !s.voaCom.length) delete s.voaCom; });
    // Os pedidos do dia com o instrutor escolhido voltam para a escolha do app, e os voos fixos pela escolha na Escala
    // são soltos (os da escala aprovada, os fixados pelo status e os agendados na Escala ficam, em conflito, com as
    // sugestões)
    S.stu.forEach(s => [s, ...(s.extra || [])].forEach(p => { if (p.insId === id) delete p.insId; }));
    S.fixos = Object.fromEntries(Object.entries(S.fixos || {}).filter(([k, p]) => !(p.escolhido && !p.agendado && p.insId === id && !S.aprovacao && !fixoPeloStatus(k, S.fStatus))));
    gravarAlteracao('exc', `Instrutor excluído: ${target ? target.nm : id}`);
  } else {
    const target = stuBy(id);
    S.stu = S.stu.filter(x => x.id !== id);
    gravarAlteracao('exc', `Aluno excluído: ${target ? target.nm : id}`);
  }
  rIns(); rAlu(); rDem();
});

// O peso digitado no cadastro (aluno ou instrutor): vazio é sem peso (0); zero, negativo, acima de 300 kg ou um texto
// que não é número não vale (null): o aviso aparece e o campo volta ao peso de antes. O texto que não é número chega
// vazio (o campo é type=number), mas com validity.badInput: ele não apaga o peso
const pesoDoCampo = campo => (campo.value.trim() === '' && !campo.validity.badInput ? 0 : pesoDigitado(campo.value));

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
    const kg = pesoDoCampo(t);
    if (kg === null) { showToast(ERRO_DO_PESO); t.value = x.kg || ''; return; }
    x.kg = kg;
    historico = ['mod', `Peso ${x.nm}: ${numeroBr(x.kg)} kg`];
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
    S.horasDosInstrutores = comRepousoDoNoturno(comHorasExternas(S.horasBase || {}, S.ins, DATA), S.noturnosDaVespera);
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
  // A Demanda mostra os instrutores de cada pedido: o nome, quem vem na data e quem tem a habilitação
  if (['nm', 'on', 'hab'].includes(f)) rDem();
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
    const kg = pesoDoCampo(t);
    if (kg === null) { showToast(ERRO_DO_PESO); t.value = s.kg || ''; return; }
    s.kg = kg;
    historico = ['mod', `Peso ${s.nm}: ${numeroBr(s.kg)} kg`];
  } else if (f === 'bl' && t.value) {
    s.bl.push(+t.value);
    // Quem não voa com o aluno sai do “Priorizar com” dele
    if (s.voaCom) s.voaCom = s.voaCom.filter(v => v !== +t.value);
    if (s.voaCom && !s.voaCom.length) delete s.voaCom;
    const ins = insBy(+t.value);
    historico = ['exc', `${s.nm}: não escalar com ${ins ? ins.nm : ''}`];
  } else if (f === 'voaCom' && t.value) {
    s.voaCom = [...(s.voaCom || []), +t.value];
    const ins = insBy(+t.value);
    historico = ['mod', `${s.nm}: priorizar com ${ins ? ins.nm : ''}`];
  } else if (f === 'curso') {
    // O curso do aluno: qualquer sigla no formato (também a de um curso que o Administrador criou na aba Cursos)
    const curso = normalizarCursoDoAluno(t.value);
    if (curso) s.curso = curso;
    else delete s.curso;
    historico = ['mod', `Curso de ${s.nm}: ${curso || 'nenhum'}`];
  }
  gravarAlteracao(...historico);
  atualizarLinhaDoAluno(s, { naoEscalar: f === 'bl', voaComMudou: f === 'voaCom' });
  // A Demanda mostra o nome do aluno, o “Priorizar com” dele (no Automático do instrutor) e as missões do curso dele
  if (['nm', 'voaCom', 'bl', 'curso'].includes(f)) rDem();
});

// Limites da lei, no cadastro dos instrutores: só o Administrador muda (neste navegador, o Operador). Vazio é
// sem limite; os campos em horas viram minutos onde o limite é guardado em minutos
const ROTULOS_DOS_LIMITES = { vooPorJornadaMin: 'voo por jornada', jornadaMin: 'jornada', vooMesH: 'voo no mês', vooSemestreH: 'voo no semestre', vooAnoH: 'voo no ano', repousoMin: 'repouso' };
const emHoras = (chave, valor) => (valor === null ? 'sem limite' : `${numeroBr(chave.endsWith('Min') ? valor / 60 : valor)} h`);
document.addEventListener('change', e => {
  const campo = e.target.closest('[data-limite]');
  if (!campo || !podeEditarLimites()) return;
  if (aindaNaoAbriu()) { rLimites(); return; }
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
  if (!b || !podeEditarLimites() || aindaNaoAbriu() || !confirmado(b, 'Confirmar valores da lei')) return;
  S.limites = { ...LIMITES_DA_LEI };
  gravarAlteracao('mod', 'Limites da lei: de volta aos valores da lei');
  rLimites();
});

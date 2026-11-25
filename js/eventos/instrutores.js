// Instrutores: incluir, excluir, os campos de cada linha (a grade do dia e o cadastro), as habilitações e os filtros. Os
// dados pessoais (js/eventos/painel-de-dados.js) e os limites da lei (js/eventos/limites.js) ligam os eventos deles daqui
import { gravarAlteracao } from '../actions.js';
import { WIN, PRE } from '../config.js';
import { $, showToast, focusLast, algumDialogoAberto, gavetaDoEsc } from '../dom.js';
import { nomeLimpo, numeroBr } from '../format.js';
import { habilitacoesDoNivel, normalizarHabilitacoes, nomeDaHabilitacao } from '../habilitacoes.js';
import { comHorasExternas } from '../limites.js';
import { comRepousoDoNoturno } from '../noturno.js';
import { pesoDoTexto, ERRO_DO_PESO } from '../rules.js';
import { fixoPeloStatus } from '../fixos.js';
import { S, DATA, insBy } from '../state.js';
import { confirmado } from './confirmacao.js';
import './limites.js';
import './painel-de-dados.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { aoMudarDadosPessoais } from '../views/dados-pessoais.js';
import { rIns, rInsDia, prepararFiltrosDosInstrutores, filtrarInstrutores, limparFiltrosDosInstrutores, manterInstrutorAVista, abrirPainelDoInstrutor, fecharPainelDoInstrutor, atualizarLinhaDoCadastro, rPainelDoInstrutor, atualizarCanacDosInstrutores } from '../views/instrutores.js';
import { mostrarVista } from '../views/vistas.js';

// Os desenhos de Instrutores (js/redesenho.js): a grade do dia acompanha a escala; o painel das habilitações é refeito
// pelo nome (Recursos, quando muda a habilitação própria de um recurso)
registrarDesenho('instrutores-dia', rInsDia, { em: ['escala'], ordem: 7 });
registrarDesenho('instrutores', rIns, { em: ['dados', 'consulta', 'releitura'], ordem: 20 });
registrarDesenho('habilitacoes-do-instrutor', rPainelDoInstrutor);

// A coluna CANAC acompanha os dados pessoais
aoMudarDadosPessoais(atualizarCanacDosInstrutores);

// Painel das habilitações de um instrutor: ✕ e Esc fecham (o foco volta para o botão que abriu; o Esc, quando o painel
// é a gaveta de cima ou tem o foco). Ele continua aberto nas outras abas: com um diálogo aberto por cima (o do status,
// na Escala), o Esc fecha só o diálogo
document.addEventListener('click', e => {
  if (e.target.closest('#btn-fechar-painel-instrutor')) fecharPainelDoInstrutor(true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-instrutor') && !algumDialogoAberto()) fecharPainelDoInstrutor(true);
});

// Filtros: o nome e as habilitações; as marcas ficam no filtro de vários valores, que ouve as próprias caixas
// (js/views/filtro-multiplo.js). "Limpar filtros" aparece na linha que diz que nenhum passa; sem data-act, ele vale
// também para quem só consulta
document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.flt === 'inst') filtrarInstrutores({ nome: e.target.value });
});
prepararFiltrosDosInstrutores();
document.addEventListener('click', e => {
  if (e.target.closest('[data-limpar-filtros="ins"]')) limparFiltrosDosInstrutores();
});

aoAcionar('editar-habs', b => abrirPainelDoInstrutor(+b.dataset.id));

// O instrutor novo aparece no cadastro, com o nome selecionado para digitar: os filtros continuam, e ele fica à vista
// mesmo fora deles (até eles mudarem)
aoAcionar('addi', () => {
  const newIns = { id: S.nid++, nm: 'Novo instrutor', on: true, hab: habilitacoesDoNivel(1), kg: 0, aw: WIN.map((_, i) => i < 8) };
  S.ins.push(newIns);
  mostrarVista('ins', 'cadastro');
  manterInstrutorAVista(newIns.id);
  gravarAlteracao('inc', `Instrutor adicionado: ${newIns.nm}`);
  rIns(); redesenharPorNome('alunos', 'pedidos-do-dia'); focusLast('#inst .nm');
});

aoAcionar('deli', (b, { id }) => {
  if (!confirmado(b, 'Confirmar')) return;
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
  rIns(); redesenharPorNome('alunos', 'pedidos-do-dia');
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
    const kg = pesoDoTexto(t.value, t.validity.badInput);
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
  if (f === 'nm') redesenharPorNome('alunos');
  // A Demanda mostra os instrutores de cada pedido: o nome, quem vem na data e quem tem a habilitação
  if (['nm', 'on', 'hab'].includes(f)) redesenharPorNome('pedidos-do-dia');
});

// "↶ Reverter" no histórico (js/eventos/historico.js): os tipos desta tela. A reversão chega validada (js/reversoes.js)
aoReverter('setInsOn', (rev, entry) => {
  const ins = insBy(rev.insId);
  if (ins) {
    ins.on = rev.val;
    gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${ins.nm} ${rev.val ? 'disponível' : 'indisponível'}`, null, entry.id);
    rIns();
  }
});

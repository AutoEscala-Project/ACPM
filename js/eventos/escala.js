// A Escala: o mapa e o popup do voo (e o clique no mapa que agenda), os filtros, exportar e compartilhar, o status do voo,
// aprovar e reabrir, os critérios da compactação, o resultado da missão do curso e as sugestões para um conflito
import { gravarAlteracao, logChange, gravarEscalaCalculada, aindaNaoAbriu, dadosLidos } from '../actions.js';
import { opcoesDeCategoria } from '../categorias.js';
import { OPCOES_DE_BURACOS, OPCOES_DE_HORARIOS, normalizarCriterios } from '../criterios.js';
import { $, showToast, anunciar, algumDialogoAberto } from '../dom.js';
import { exp, pdf, planilha } from '../export.js';
import { fixosAoMudarStatus, fixosAoReabrir, fixosAoAprovar } from '../fixos.js';
import { hm } from '../format.js';
import { aplicarReparo } from '../reparo.js';
import { S, RES, DATA, isGestor, modoCompartilhado, insBy } from '../state.js';
import { escolherInstrutor, escolhasDaUnidade, escolherNosPedidos } from '../instrutor-escolhido.js';
import { STATUS_COM_DETALHE, textoParaOHistorico, detalheAoMudarStatus, rotuloDoStatus } from '../status.js';
import { ApiClient } from '../storage.js';
import { agendarNoMapa } from './agendamento.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rAlu } from '../views/cadastros.js';
import { rDem } from '../views/demanda.js';
import { pedirDetalheDoStatus } from '../views/dialogo-status.js';
import { cursoDoResultado } from '../views/etapas.js';
import { rOut, botaoDoInstrutor, seletorDeInstrutor, abrirPopupDoMapa, fecharPopupDoMapa, popupDoMapaAberto, reposicionarPopupDoMapa, tabNoPopup } from '../views/escala.js';
import { abrirPainelDeReparo, fecharPainelDeReparo, opcaoDoPainel, painelDeReparoAberto } from '../views/reparo.js';

// O minuto de um clique na faixa de uma linha do mapa: a posição dele dentro da faixa (sem a borda), entre o início e o
// fim do mapa (data-inicio e data-fim), de 5 em 5 minutos
function minutoDoClique(faixa, clientX) {
  const { inicio, fim } = faixa.closest('.tl-wrap').dataset;
  const fracao = (clientX - faixa.getBoundingClientRect().left - faixa.clientLeft) / faixa.clientWidth;
  return Math.round((+inicio + Math.min(1, Math.max(0, fracao)) * (fim - inicio)) / 5) * 5;
}

// Popup do voo no mapa da escala: a barra abre e fecha; Esc (o foco volta para a barra) e um clique fora fecham, e ele
// acompanha a barra quando a página ou o mapa rolam. Um diálogo aberto por cima (o do status) fica com o Esc e com os
// cliques dentro dele: o popup continua aberto. Dentro ou fora é pelo caminho do clique, fixado quando ele começa: o
// nome do instrutor, já trocado pela lista (js/eventos/registro.js) e fora da página, continua dentro do popup.
// Sem popup aberto, um clique (ou toque) no espaço livre de uma linha do mapa agenda nela: o diálogo abre com o recurso
// ou o instrutor da linha e o horário da lista mais perto do clique (js/agendamento.js). Com o popup aberto, o clique só
// fecha o popup
document.addEventListener('click', e => {
  const barra = e.target.closest('#out .tl-bar');
  if (barra) {
    if (barra.getAttribute('aria-expanded') === 'true') fecharPopupDoMapa();
    else abrirPopupDoMapa(barra, { focar: true });
    return;
  }
  if (popupDoMapaAberto()) {
    const dentro = e.composedPath().some(el => el instanceof Element && el.matches('#tl-pop, dialog'));
    if (!dentro) fecharPopupDoMapa();
    return;
  }
  const faixa = e.target.closest('#out .tl-track:not(.inerte)');
  if (!faixa || isGestor()) return;
  const { r, ins } = faixa.dataset;
  agendarNoMapa({ ...(ins ? { insId: +ins } : { r }), minuto: minutoDoClique(faixa, e.clientX) });
});
// O Esc fecha só o popup, a camada de cima: ouvido na captura, ele para aqui e não chega às gavetas e aos painéis
// de trás (o Histórico, as Sugestões, as habilitações), que continuam abertos. O Esc na lista do instrutor é dela
// (volta ao nome, abaixo, com o popup aberto)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !popupDoMapaAberto() || algumDialogoAberto()) return;
  if (e.target.closest && e.target.closest('select[data-a="insVoo"]')) return;
  e.stopPropagation();
  fecharPopupDoMapa({ devolverFoco: true });
}, true);
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('#tl-pop')) tabNoPopup(e);
});
document.addEventListener('scroll', reposicionarPopupDoMapa, { capture: true, passive: true });
window.addEventListener('resize', reposicionarPopupDoMapa);

// Depois de um filtro, o leitor de tela ouve quantos voos ficaram (a lista muda sem o foco sair do filtro); na busca,
// quando a digitação para
let anuncioDoFiltro = null;
function filtrar(esperar = 0) {
  const voos = rOut();
  clearTimeout(anuncioDoFiltro);
  const texto = voos ? `${voos === 1 ? '1 voo' : `${voos} voos`} na escala com esses filtros.` : 'Nenhum voo na escala com esses filtros.';
  anuncioDoFiltro = setTimeout(() => anunciar(texto), esperar);
}
document.addEventListener('input', e => {
  if (e.target.id === 'flt-esc-q') filtrar(500);
});
$('#flt-esc-eq').onchange = () => filtrar();
// Categoria; o filtro de recurso mostra só os da categoria escolhida
$('#flt-esc-cat').innerHTML = opcoesDeCategoria();
$('#flt-esc-cat').onchange = () => filtrar();

// Exportar é usar a escala: a escala só calculada fica gravada (quem só consulta não grava)
$('#exp').onclick = () => { gravarEscalaCalculada(); exp(); };
$('#pdf').onclick = () => { gravarEscalaCalculada(); pdf(); };
$('#xlsx').onclick = () => { gravarEscalaCalculada(); planilha(); };

// No modo compartilhado o link leva só a data: quem abre entra com a própria conta e lê do servidor
function linkDaData(data) {
  const url = new URL(window.location.href);
  const projeto = url.searchParams.get('supabase');
  url.search = '';
  if (projeto) url.searchParams.set('supabase', projeto);
  url.searchParams.set('data', data);
  return url.toString();
}

// Sem o servidor, a escala fica só neste navegador: não há link que leve a escala inteira no endereço (exporia nomes,
// pesos e horas)
$('#btn-share-link').onclick = async () => {
  if (!modoCompartilhado()) {
    showToast('Sem o servidor, a escala fica só neste navegador: o link da escala é do app publicado, com login.');
    return;
  }
  const url = linkDaData(DATA);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link da escala copiado (quem abrir entra com a própria conta).', 'ok');
  } catch {
    prompt('Copie o link da escala:', url);
  }
};

// Status do voo: Atrasado e Cancelado pedem o detalhe (a nova decolagem ou o motivo) antes de valer; desistir deixa o
// status anterior. O histórico registra só a categoria do motivo
const vooDaChave = fKey => (RES && Array.isArray(RES.out) ? RES.out.find(o => o.fKey === fKey) : null);
function aplicarStatus(fKey, status, detalhe) {
  if (!S.fStatus) S.fStatus = {};
  if (!S.fObs) S.fObs = {};
  S.fStatus[fKey] = status;
  // Sem o diálogo, o novo horário do atraso segue no Em Voo e no Pousou; nos outros, o detalhe sai
  const novo = detalhe || detalheAoMudarStatus(S.fObs[fKey], status);
  if (novo) S.fObs[fKey] = novo;
  else delete S.fObs[fKey];
  const voo = vooDaChave(fKey);
  // Em Voo, Atrasado, Pousou e Cancelado fixam o voo: uma alteração na escala não o tira do lugar (o cancelado fica
  // onde estava, sem ocupar nada). Fora da escala aprovada, Pendente ou Confirmado o soltam, menos o fixo pelo operador
  // na Escala (o instrutor escolhido e o voo agendado)
  if (voo) S.fixos = fixosAoMudarStatus(S.fixos, voo, status, { aprovada: Boolean(S.aprovacao) });
  const textoDoStatus = status === 'Pousou' ? rotuloDoStatus(status, voo) : textoParaOHistorico(status, detalhe);
  gravarAlteracao('mod', `Status de ${voo ? `${voo.s} (${hm(voo.a)}–${hm(voo.b)})` : fKey}: ${textoDoStatus}`);
}
function mudarStatus(fKey, status) {
  const voo = vooDaChave(fKey);
  if (!voo || !STATUS_COM_DETALHE.includes(status)) { aplicarStatus(fKey, status, null); return; }
  pedirDetalheDoStatus({ voo, status, aoConfirmar: detalhe => aplicarStatus(fKey, status, detalhe), aoDesistir: () => rOut() });
}
aoMudarCampo('fstatus', t => mudarStatus(t.dataset.fkey, t.value));

// O nome do instrutor abre a lista no lugar dele; sair dela sem mudar (o foco sai, ou Esc) volta ao nome
const elementoDe = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; };
aoAcionar('trocar-instrutor', b => {
  const voo = vooDaChave(b.dataset.fkey);
  if (!voo || !RES) return;
  const lista = elementoDe(seletorDeInstrutor(voo, b.dataset.rotulo));
  b.replaceWith(lista);
  lista.focus();
  try { lista.showPicker(); } catch { /* sem showPicker (ou sem o gesto do usuário): a lista fica com o foco */ }
});
function voltarAoNome(lista, { focar = false } = {}) {
  const voo = vooDaChave(lista.dataset.fkey);
  if (!lista.isConnected || !voo) return;
  const botao = elementoDe(botaoDoInstrutor(voo, lista.dataset.rotulo));
  lista.replaceWith(botao);
  if (focar) botao.focus();
}
document.addEventListener('focusout', e => {
  const lista = e.target.closest && e.target.closest('select[data-a="insVoo"]');
  if (lista) setTimeout(() => voltarAoNome(lista));
});
document.addEventListener('keydown', e => {
  const lista = e.key === 'Escape' && e.target.closest && e.target.closest('select[data-a="insVoo"]');
  if (!lista) return;
  e.stopPropagation();
  voltarAoNome(lista, { focar: true });
}, true);

// O instrutor escolhido na Escala: o voo (na turma de Ground, a turma inteira) fica onde está, fixo, com ele, e o resto
// da escala é refeito em volta; o pedido também guarda a escolha. "Automático" devolve a escolha ao app (fora da escala
// aprovada, o voo deixa de ser fixo). O histórico desfaz
aoMudarCampo('insVoo', t => {
  const voo = vooDaChave(t.dataset.fkey);
  if (!voo) return;
  const x = t.value ? insBy(+t.value) : null;
  const { antes, alunos } = escolherInstrutor(S, RES, { stuId: voo.stuId, mid: voo.mid || 0 }, x ? x.id : null, { noLugar: true });
  const quem = alunos > 1 ? `turma de ${voo.mis}` : voo.s;
  gravarAlteracao('mod', `Instrutor de ${quem} (${hm(voo.a)}–${hm(voo.b)}): ${x ? x.nm : 'automático'}`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' });
  rDem();
  showToast(x ? `${x.nm} fica com o voo; o resto da escala foi refeito em volta.` : 'O app volta a escolher o instrutor deste voo.', 'ok');
});

// Um clique no detalhe do status (motivo ou nova decolagem) permite alterá-lo; o status continua o mesmo
aoAcionar('detalhe-status', b => {
  const fKey = b.dataset.fkey, status = S.fStatus && S.fStatus[fKey], voo = vooDaChave(fKey);
  if (!voo || !STATUS_COM_DETALHE.includes(status)) return;
  pedirDetalheDoStatus({ voo, status, detalhe: S.fObs && S.fObs[fKey], aoConfirmar: detalhe => aplicarStatus(fKey, status, detalhe) });
});

// Aprovar a escala: todos os voos ficam fixos e o selo diz quando e quem aprovou. Reabrir solta os voos: a
// escala volta a ser refeita inteira a cada alteração. Os dois pedem confirmação
document.addEventListener('click', e => {
  const aprovar = e.target.closest('#btn-aprovar'), reabrir = e.target.closest('#btn-reabrir');
  if ((!aprovar && !reabrir) || isGestor() || !RES || aindaNaoAbriu()) return;
  if (aprovar) {
    if (!confirmado(aprovar, 'Confirmar aprovação')) return;
    // O voo fixo pelo operador na Escala (o instrutor escolhido e o voo agendado) continua com a marca: reabrir a escala
    // não o solta. O agendado fora da escala (o pedido foi tirado dela) continua fixo, para o voo voltar ao lugar dele
    S.fixos = fixosAoAprovar(S.fixos, RES.out);
    S.aprovacao = { em: new Date().toISOString(), por: ApiClient.autorAtual || '' };
    gravarAlteracao('mod', `Escala aprovada: ${RES.out.length} ${RES.out.length === 1 ? 'voo fixado' : 'voos fixados'}`);
    showToast('Escala aprovada: os voos ficam fixos.', 'ok');
    // O botão virou "Reabrir": o foco vai para ele
    $('#btn-reabrir')?.focus();
  } else {
    if (!confirmado(reabrir, 'Confirmar reabertura')) return;
    // Os voos em andamento (Em Voo, Atrasado, Pousou, Cancelado) e os fixados pelo operador na Escala continuam fixos
    S.fixos = fixosAoReabrir(S.fixos, S.fStatus);
    S.aprovacao = null;
    gravarAlteracao('mod', 'Escala reaberta: volta a ser refeita a cada alteração');
    showToast('Escala reaberta.', 'ok');
    $('#btn-aprovar')?.focus();
  }
});

// Critérios da compactação: a escala é refeita com o critério novo (com a escala aprovada, não mudam)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-criterio]');
  if (!b || b.getAttribute('aria-disabled') === 'true' || isGestor() || S.aprovacao || aindaNaoAbriu()) return;
  const campo = b.dataset.criterio, antes = normalizarCriterios(S.criterios);
  if (antes[campo] === b.dataset.valor) return;
  S.criterios = normalizarCriterios({ ...antes, [campo]: b.dataset.valor });
  const opcoes = campo === 'buracos' ? OPCOES_DE_BURACOS : OPCOES_DE_HORARIOS;
  const nome = id => opcoes.find(([v]) => v === id)[1];
  gravarAlteracao('mod', `Compactação: ${campo === 'buracos' ? 'buracos' : 'horários'} ${nome(antes[campo])} → ${nome(S.criterios[campo])}`);
});

// O resultado da missão do curso, na linha do voo: vai para o servidor (só acréscimo), no curso da missão do pedido (o
// aluno pode ter trocado de curso no mesmo dia), e entra na situação do aluno (o progresso e a próxima missão mudam).
// Sem conexão, o seletor volta ao que estava
document.addEventListener('change', async e => {
  const sel = e.target.closest('[data-resultado]');
  if (!sel || isGestor()) return;
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
  rOut(); rAlu(); rDem();
});

// Sugestões para um conflito: a gaveta abre pelo botão do conflito. "Aplicar" muda o voo fixo (na turma de
// Ground, a turma inteira) e "Soltar" o tira dos fixos; o histórico guarda os fixos de antes, para reverter. Cancelar
// abre o diálogo do status, já com o motivo do conflito marcado
document.addEventListener('click', e => {
  const abrirSugestoes = e.target.closest('[data-reparo]');
  if (abrirSugestoes) { if (!isGestor()) abrirPainelDeReparo(abrirSugestoes.dataset.reparo); return; }
  if (e.target.closest('#btn-fechar-reparo')) { fecharPainelDeReparo(true); return; }
  const botao = e.target.closest('[data-reparo-aplicar]');
  if (!botao || isGestor() || aindaNaoAbriu()) return;
  const escolha = opcaoDoPainel(+botao.dataset.reparoAplicar);
  if (!escolha) return;
  const { fKey, voo, opcao } = escolha;
  fecharPainelDeReparo();
  if (!opcao.mudancas && !opcao.soltar) {
    pedirDetalheDoStatus({ voo, status: 'Cancelado', detalhe: opcao.motivo ? { motivo: opcao.motivo } : null, aoConfirmar: detalhe => aplicarStatus(fKey, 'Cancelado', detalhe) });
    return;
  }
  const antes = S.fixos || {};
  // O instrutor escolhido dos pedidos acompanha o reparo: trocar o instrutor passa a escolha para o novo; soltar o voo
  // devolve a escolha ao app
  const escolhas = escolhasDaUnidade(S, RES, fKey);
  if (opcao.soltar) escolherNosPedidos(S, escolhas, null);
  else if (opcao.mudancas.insId) escolherNosPedidos(S, escolhas, opcao.mudancas.insId);
  S.fixos = aplicarReparo(antes, RES, fKey, opcao);
  // Os voos que mudaram ou saíram dos fixos (soltar): o histórico guarda como estavam
  const mudados = Object.keys(antes).filter(k => S.fixos[k] !== antes[k]);
  gravarAlteracao('mod', `Reparo: ${voo.s} (${hm(voo.a)}–${hm(voo.b)}): ${opcao.soltar ? 'Soltar o voo' : opcao.texto}`, {
    kind: 'restaurarFixos', fixos: Object.fromEntries(mudados.map(k => [k, antes[k]])), ...(escolhas.length ? { pedidos: escolhas } : {}), label: '↶ Reverter'
  });
  if (escolhas.length) rDem();
  showToast(opcao.soltar ? 'Voo solto: o app escalou de novo.' : 'Sugestão aplicada: o voo continua fixo.', 'ok');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && painelDeReparoAberto() && !algumDialogoAberto()) fecharPainelDeReparo(true);
});

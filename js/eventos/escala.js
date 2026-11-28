// A Escala: o mapa e o popup do voo (e o clique no mapa que agenda), os filtros, exportar e compartilhar, o status do voo,
// aprovar e reabrir, os critérios da compactação e as sugestões para um conflito (o resultado da missão do curso:
// js/eventos/resultados.js)
import { gravarAlteracao, gravarEscalaCalculada, gravarSemOMotor, aindaNaoAbriu, fotoDaEscala, fotoDaEscalaTravada, gravarNaEscala } from '../actions.js';
import { aprovar as aprovarEscala, reabrir as reabrirEscala, voosNovos, fixarVoosNovos } from '../aprovacao.js';
import { impressaoDaEscala, registrarExportacao } from '../exportacoes.js';
import { operaEscala } from '../perfis.js';
import { opcoesDeCategoria } from '../categorias.js';
import { OPCOES_DE_BURACOS, OPCOES_DE_HORARIOS, normalizarCriterios } from '../criterios.js';
import { $, showToast, anunciar, algumDialogoAberto, gavetaDoEsc, focarNoTitulo, visivel } from '../dom.js';
import { exp, pdf, planilha } from '../export.js';
import { fixosAoMudarStatus, normalizarFixos, fixarNoLugar } from '../fixos.js';
import { hm, hojeISO } from '../format.js';
import { aplicarReparo, aproveitarCancelado, desfazerAproveitamento, repararComOPedido } from '../reparo.js';
import { S, RES, DATA, AUDIT_LOG, isGestor, modoCompartilhado, insBy, estadoDaEscala } from '../state.js';
import { rejeicoesDosPedidos } from '../rejeicoes.js';
import { escolherInstrutor, escolhasDaUnidade, escolherNosPedidos, reverterEscolha, reverterReparo, foraDoPriorizarNoVoo } from '../instrutor-escolhido.js';
import { agendamentosEmVolta, desfazerEdicao, motivoParaNaoDesfazerEdicao, VOO_COM_RESULTADO } from '../reversoes.js';
import { CAMPOS_DO_PEDIDO } from '../dias.js';
import { pedidoDoAluno } from '../voo.js';
import { STATUS_COM_DETALHE, textoParaOHistorico, detalheAoMudarStatus, rotuloDoStatus } from '../status.js';
import { ApiClient } from '../storage.js';
import { agendarNoMapa } from './agendamento.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { vooDaChave } from './resultados.js';
import { pedirDetalheDoStatus } from '../views/dialogo-status.js';
import { rOut, botaoDoInstrutor, seletorDeInstrutor } from '../views/escala.js';
import { abrirEditorDoVoo } from '../views/edicao-do-voo.js';
import { perguntarAntesDeRefazer } from '../views/dialogo-refazer.js';
import { statusDoVoo } from '../voo.js';
import './edicao-do-voo.js';
// Os horários fechados nesta data (J; o B os trouxe de Recursos): o bloco details#fechamentos, entre as duas barras
import './fechamentos.js';
import { abrirPainelDeReparo, abrirPainelDoRejeitado, fecharPainelDeReparo, opcaoDoPainel, focarNoVoo } from '../views/reparo.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { voosComInativos } from '../inativos.js';
import { registrarTela } from '../views/telas.js';
import { ligada } from '../funcionalidades.js';

// O desenho da Escala (js/redesenho.js): refeito em todos os momentos, quando há escala
registrarDesenho('escala', () => { if (RES) rOut(); }, { em: ['dados', 'consulta', 'releitura', 'escala'], ordem: 80 });

// O minuto de um clique na faixa de uma linha do mapa: a posição dele dentro da faixa (sem a borda), entre o início e o
// fim do mapa (data-inicio e data-fim), de 5 em 5 minutos; na altura da faixa (o mapa transposto, o padrão) ou, com as horas nas colunas, na largura
function minutoDoClique(faixa, { clientX, clientY }) {
  const mapa = faixa.closest('.tl-wrap');
  const { inicio, fim } = mapa.dataset;
  const caixa = faixa.getBoundingClientRect();
  // No mapa transposto (o padrão), as horas descem: a posição é a do clique na altura da faixa
  const fracao = mapa.classList.contains('transposto')
    ? (clientY - caixa.top - faixa.clientTop) / faixa.clientHeight
    : (clientX - caixa.left - faixa.clientLeft) / faixa.clientWidth;
  return Math.round((+inicio + Math.min(1, Math.max(0, fracao)) * (fim - inicio)) / 5) * 5;
}

// A barra do voo no mapa abre o editor do voo (js/eventos/edicao-do-voo.js; na turma de Ground, a turma inteira). Um clique
// (ou toque) no espaço livre de uma linha do mapa agenda nela: o diálogo abre com o recurso ou o instrutor da linha e o
// horário da lista mais perto do clique (js/agendamento.js)
document.addEventListener('click', e => {
  const barra = e.target.closest('#out .tl-bar');
  if (barra) {
    abrirEditorDoVoo(barra.dataset.pop, { origem: barra });
    return;
  }
  const faixa = e.target.closest('#out .tl-track:not(.inerte)');
  if (!faixa || isGestor()) return;
  const { r, ins } = faixa.dataset;
  agendarNoMapa({ ...(ins ? { insId: +ins } : { r }), minuto: minutoDoClique(faixa, e) });
});

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

// Exportar é usar a escala: a escala só calculada fica gravada (quem só consulta não grava). A exportação do Operador e do
// Administrador fica registrada na data (quando, quem e a impressão da escala exportada; d32), gravada sem o motor: a
// escala da tela é a exportada. Antes da aprovação também. Só a que entregou o arquivo ao navegador fica registrada (o
// PDF sem a biblioteca, o Excel sem o modelo: nada), com a impressão da escala do clique (a planilha lê a escala copiada
// no clique, e o modelo chega depois)
async function exportar(tipo, baixar) {
  const registra = Boolean(!isGestor() && RES && !aindaNaoAbriu() && (ApiClient.perfil ? operaEscala(ApiClient.perfil) : true));
  const impressao = registra ? impressaoDaEscala(RES, S) : null, por = ApiClient.autorAtual || '', data = DATA;
  const entregou = await baixar();
  // A data aberta mudou enquanto o Excel era montado: o registro seria de outra data. A mesma escala baixada de novo no
  // mesmo tipo, pela mesma pessoa, não registra outra vez: o registro continua dizendo quando ela foi exportada primeiro
  const antes = (S.exportacoes || {})[tipo];
  const novo = registra && entregou && DATA === data && !(antes && antes.impressao === impressao && antes.por === por);
  // Uma gravação só: a do registro leva também a escala só calculada
  if (!novo) { gravarEscalaCalculada(); return; }
  S.exportacoes = registrarExportacao(S.exportacoes, tipo, { em: new Date().toISOString(), por, impressao });
  gravarSemOMotor();
}
$('#exp').onclick = () => exportar('csv', exp);
$('#pdf').onclick = () => exportar('pdf', pdf);
$('#xlsx').onclick = () => exportar('xlsx', planilha);

// No modo compartilhado o link leva só a data: quem abre entra com a própria conta e lê do servidor
function linkDaData(data) {
  const url = new URL(window.location.href);
  const projeto = url.searchParams.get('supabase');
  // Só a data: sem a tela (o fragmento) e sem os outros parâmetros
  url.search = '';
  url.hash = '';
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
// Na escala aprovada, sem o motor (F1g): só o voo muda, e o voo sem pino fica fixo onde está antes
function aplicarStatus(fKey, status, detalhe) {
  const foto = fotoDaEscalaTravada();
  if (foto) S.fixos = fixarNoLugar(S.fixos, RES, [fKey]);
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
  gravarNaEscala(foto, 'mod', `Status de ${voo ? `${voo.s} (${hm(voo.a)}–${hm(voo.b)})` : fKey}: ${textoDoStatus}`);
}
// Na escala não aprovada, toda alteração feita na Escala pergunta antes (R6, js/views/dialogo-refazer.js): "Cancelar"
// redesenha o valor de antes, e nada muda; na aprovada, não pergunta (o motor não roda)
function perguntarSeAberta(resumo, fazer, { focar = null, avisos = [] } = {}) {
  if (S.aprovacao) { fazer(); return; }
  perguntarAntesDeRefazer({ resumo, avisos, aoConfirmar: fazer, aoDesistir: () => { rOut(); if (focar) focar(); } });
}
// O status (e o detalhe, depois do diálogo dele), com a pergunta
function statusComPergunta(fKey, status, detalhe) {
  const voo = vooDaChave(fKey);
  const antes = voo ? statusDoVoo(voo, S.fStatus) : '';
  perguntarSeAberta(`${voo ? voo.s : fKey}: ${antes === status ? 'detalhe do status' : `${antes} → ${status}`}`, () => aplicarStatus(fKey, status, detalhe));
}
function mudarStatus(fKey, status) {
  const voo = vooDaChave(fKey);
  if (!voo || !STATUS_COM_DETALHE.includes(status)) { statusComPergunta(fKey, status, null); return; }
  pedirDetalheDoStatus({ voo, status, aoConfirmar: detalhe => statusComPergunta(fKey, status, detalhe), aoDesistir: () => rOut() });
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
// Na escala aprovada, sem o motor (F1g): só o voo muda; "Automático" só tira a escolha do pedido (o voo fica com o
// instrutor e no lugar)
aoMudarCampo('insVoo', t => {
  const voo = vooDaChave(t.dataset.fkey);
  if (!voo) return;
  const x = t.value ? insBy(+t.value) : null;
  // Desistir: o foco volta ao nome do instrutor (a lista já voltou a ser o nome quando a pergunta abriu)
  const focar = () => { const nome = [...document.querySelectorAll(`#out [data-act="trocar-instrutor"][data-fkey="${CSS.escape(voo.fKey)}"]`)].find(visivel); if (nome) nome.focus(); };
  // O INVA fora do “Priorizar com” do aluno (N9, F1h): a opção já diz; na escala aberta, a pergunta também, e a Escala
  // guarda a observação
  const avisos = x ? foraDoPriorizarNoVoo(estadoDaEscala(), RES, voo.fKey, x.id).map(nm => ({ texto: `${x.nm} está fora do Priorizar com de ${nm}.` })) : [];
  perguntarSeAberta(`${voo.isGround ? `turma de ${voo.mis}` : voo.s}: ${voo.ins} → ${x ? x.nm : 'Automático'}`, () => trocarInstrutor(voo, x), { focar, avisos });
});
function trocarInstrutor(voo, x) {
  const foto = fotoDaEscalaTravada();
  if (foto) S.fixos = fixarNoLugar(S.fixos, RES, RES.out.filter(o => o.classKey === voo.classKey || o.fKey === voo.fKey).map(o => o.fKey));
  const { antes, alunos } = escolherInstrutor(S, RES, { stuId: voo.stuId, mid: voo.mid || 0 }, x ? x.id : null, { noLugar: true });
  const quem = alunos > 1 ? `turma de ${voo.mis}` : voo.s;
  if (!gravarNaEscala(foto, 'mod', `Instrutor de ${quem} (${hm(voo.a)}–${hm(voo.b)}): ${x ? x.nm : 'automático'}`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' })) return;
  redesenharPorNome('pedidos-do-dia');
  showToast(foto ? (x ? `${x.nm} fica com o voo; nenhum outro voo muda (a escala está aprovada).` : 'A escolha do instrutor saiu do pedido; o voo continua com ele (a escala está aprovada).')
    : x ? `${x.nm} fica com o voo; o resto da escala foi refeito em volta.` : 'O app volta a escolher o instrutor deste voo.', 'ok');
}

// Um clique no detalhe do status (motivo ou nova decolagem) permite alterá-lo; o status continua o mesmo
aoAcionar('detalhe-status', b => {
  const fKey = b.dataset.fkey, status = S.fStatus && S.fStatus[fKey], voo = vooDaChave(fKey);
  if (!voo || !STATUS_COM_DETALHE.includes(status)) return;
  pedirDetalheDoStatus({ voo, status, detalhe: S.fObs && S.fObs[fKey], aoConfirmar: detalhe => statusComPergunta(fKey, status, detalhe) });
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
    // A aprovação fixa o que a escala da tela deixa entrar, sem o motor (o caminho do F1g, gravarNaEscala): rodado de
    // novo, ele poderia pôr um pedido que não estava na tela, e esse voo ficaria sem pino. A foto é a de antes
    const foto = fotoDaEscala();
    const aprovada = aprovarEscala(S, RES.out, { em: new Date().toISOString(), por: ApiClient.autorAtual || '' });
    if (!aprovada) return;
    [S.fixos, S.aprovacao] = [aprovada.fixos, aprovada.aprovacao];
    gravarNaEscala(foto, 'mod', `Escala aprovada: ${RES.out.length} ${RES.out.length === 1 ? 'voo fixado' : 'voos fixados'}`);
    showToast('Escala aprovada: os voos ficam fixos.', 'ok');
    // O botão virou "Reabrir": o foco vai para ele
    $('#btn-reabrir')?.focus();
  } else {
    if (!confirmado(reabrir, 'Confirmar reabertura')) return;
    // Os voos em andamento (Em Voo, Atrasado, Pousou, Cancelado) e os fixados pelo operador na Escala continuam fixos
    // A reabertura fica registrada: quando e quem (d33)
    const reaberta = reabrirEscala(S, { em: new Date().toISOString(), por: ApiClient.autorAtual || '' });
    if (!reaberta) return;
    [S.fixos, S.aprovacao, S.reabertura] = [reaberta.fixos, reaberta.aprovacao, reaberta.reabertura];
    gravarAlteracao('mod', 'Escala reaberta: volta a ser refeita a cada alteração');
    showToast('Escala reaberta.', 'ok');
    $('#btn-aprovar')?.focus();
  }
});

// "Fixar os N voos novos" (escala aprovada): o voo que entrou depois da aprovação, sem pino (o da lista de espera que a
// conciliação pôs no lugar do cancelado, E), fica fixo onde está; os outros pinos não mudam
document.addEventListener('click', e => {
  const b = e.target.closest('#btn-fixar-novos');
  if (!b || isGestor() || !RES || !S.aprovacao || aindaNaoAbriu()) return;
  const novos = voosNovos(S.fixos, RES.out);
  if (!novos.length) return;
  // Sem o motor, como a aprovação: rodado de novo, ele poderia pôr um pedido que esperava, e o botão voltaria
  const foto = fotoDaEscalaTravada();
  S.fixos = fixarVoosNovos(S.fixos, RES.out);
  const texto = novos.length === 1 ? `Voo novo fixado: ${novos[0].s}` : `${novos.length} voos novos fixados: ${novos.map(o => o.s).join(', ')}`;
  gravarNaEscala(foto, 'mod', texto);
  showToast(`${texto}.`, 'ok');
  $('#btn-reabrir')?.focus();
});

// Critérios da compactação: a escala é refeita com o critério novo (com a escala aprovada, não mudam)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-criterio]');
  if (!b || b.getAttribute('aria-disabled') === 'true' || isGestor() || S.aprovacao || aindaNaoAbriu()) return;
  const campo = b.dataset.criterio, antes = normalizarCriterios(S.criterios);
  if (antes[campo] === b.dataset.valor) return;
  const opcoes = campo === 'buracos' ? OPCOES_DE_BURACOS : OPCOES_DE_HORARIOS;
  const nome = id => opcoes.find(([v]) => v === id)[1];
  const texto = `Compactação: ${campo === 'buracos' ? 'buracos' : 'horários'} ${nome(antes[campo])} → ${nome(b.dataset.valor)}`;
  perguntarSeAberta(texto, () => {
    S.criterios = normalizarCriterios({ ...antes, [campo]: b.dataset.valor });
    gravarAlteracao('mod', texto);
  });
});

// Sugestões para um conflito: a gaveta abre pelo botão do conflito. "Aplicar" muda o voo fixo (na turma de
// Ground, a turma inteira) e "Soltar" o tira dos fixos; o histórico guarda os fixos de antes, para reverter. Cancelar
// abre o diálogo do status, já com o motivo do conflito marcado
// Aberta do editor do voo, a gaveta fica no lugar dele (o editor fecha): o Esc fecha a gaveta e volta para o voo. Aplicada
// a sugestão, o foco vai para o voo (o botão "Sugestões" dele não existe mais)
document.addEventListener('click', e => {
  const abrirSugestoes = e.target.closest('[data-reparo]');
  const doRejeitado = !abrirSugestoes && e.target.closest('[data-rejeitado]');
  if (abrirSugestoes) { if (!isGestor()) abrirPainelDeReparo(abrirSugestoes.dataset.reparo); return; }
  if (doRejeitado) { if (!isGestor()) abrirPainelDoRejeitado(doRejeitado.dataset.rejeitado); return; }
  if (e.target.closest('#btn-fechar-reparo')) { fecharPainelDeReparo(true); return; }
  const botao = e.target.closest('[data-reparo-aplicar]');
  if (!botao || isGestor() || aindaNaoAbriu()) return;
  const escolha = opcaoDoPainel(+botao.dataset.reparoAplicar);
  if (!escolha) return;
  const { fKey, voo, opcao, cancelado, rejeitado } = escolha;
  // A sugestão fora da disponibilidade do pedido ou em outro tipo pede a confirmação com o aluno, e a que faz do voo o 7º
  // local do horário, a do operador (dois cliques)
  if (!rejeitado && opcao.confirmar && !confirmado(botao, opcao.armado || 'Confirmei com o aluno')) return;
  fecharPainelDeReparo();
  // "Cancelar o voo" pede o motivo antes (a pergunta vem depois dele, com o status)
  if (!rejeitado && !cancelado && !opcao.mudancas && !opcao.soltar) {
    pedirDetalheDoStatus({ voo, status: 'Cancelado', detalhe: opcao.motivo ? { motivo: opcao.motivo } : null, aoConfirmar: detalhe => statusComPergunta(fKey, 'Cancelado', detalhe) });
    return;
  }
  const quem = rejeitado ? (rejeicoesDosPedidos(estadoDaEscala(), RES).get(fKey) || {}).s || fKey : voo.s;
  perguntarSeAberta(`${quem}: ${opcao.soltar ? 'Soltar o voo' : opcao.texto}`, () => aplicarSugestao(escolha));
});
// A recusa que a reversão devolve (o pedido que a sugestão encaixou volta a ser recusado), com a espera da lista dele
const recusaDaReversao = (fKey, recusa) => ({ fKey, s: recusa.s, m: recusa.m, ...(recusa.codigo ? { codigo: recusa.codigo } : {}), ...(recusa.espera ? { espera: recusa.espera } : {}) });

// A sugestão aplicada (na escala aprovada, sem o motor: a escala da tela é conferida com ela, F1g)
function aplicarSugestao({ fKey, voo, opcao, cancelado, rejeitado }) {
  const foto = fotoDaEscalaTravada();
  // O pedido recusado: a escolha do instrutor muda (0: "Automático"), com a reversão da escolha de sempre. Na escala
  // aprovada, o pedido entra no lugar que a simulação achou (o pino agendado), sem mexer em outro voo, e a reversão
  // devolve o pedido e a recusa
  if (rejeitado) {
    const [stuId, mid] = fKey.split('_').map(Number);
    const x = opcao.insId ? insBy(opcao.insId) : null;
    if (foto && opcao.pino) {
      const aluno = S.stu.find(s => s.id === stuId);
      const pedido = aluno ? pedidoDoAluno(aluno, mid) : null;
      const recusa = rejeicoesDosPedidos(estadoDaEscala(), RES).get(fKey);
      if (!pedido) return;
      const rev = {
        kind: 'desfazerEdicao', voos: [{ fKey, fixo: (S.fixos || {})[fKey] || null, status: (S.fStatus || {})[fKey] || null, detalhe: (S.fObs || {})[fKey] || null, statusDepois: (S.fStatus || {})[fKey] || null }],
        pedidos: [{ stuId, mid, pedido: Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => pedido[c] !== undefined).map(c => [c, pedido[c]])) }],
        recusas: recusa ? [recusaDaReversao(fKey, recusa)] : [], label: '↶ Reverter'
      };
      if (x) pedido.insId = x.id;
      else delete pedido.insId;
      S.fixos = { ...(S.fixos || {}), [fKey]: { ...opcao.pino, agendado: true } };
      if (!gravarNaEscala(foto, 'mod', `Pedido recusado encaixado: ${opcao.texto}`, rev)) return;
    } else {
      const { antes } = escolherInstrutor(S, RES, { stuId, mid }, x ? x.id : null);
      gravarAlteracao('mod', `Pedido recusado encaixado: ${opcao.texto}`, { kind: 'restaurarEscolha', ...antes, label: '↶ Reverter' });
    }
    redesenharPorNome('pedidos-do-dia');
    focarNoVoo(fKey);
    showToast('Instrutor escolhido: o pedido entra na escala.', 'ok');
    return;
  }
  // A vaga do voo cancelado dada ao 1º da lista de espera do horário (F1h, N14): o pedido que espera entra no lugar que o
  // app achou (o pino agendado), sem mexer em outro voo, e a reversão devolve o pedido e a recusa (com a espera)
  if (cancelado && opcao.vaga) {
    const [stuId, mid] = opcao.vaga.split('_').map(Number);
    const aluno = S.stu.find(s => s.id === stuId);
    const pedido = aluno ? pedidoDoAluno(aluno, mid) : null;
    const recusa = rejeicoesDosPedidos(estadoDaEscala(), RES).get(opcao.vaga);
    if (!pedido || !recusa) return;
    const rev = {
      kind: 'desfazerEdicao', voos: [{ fKey: opcao.vaga, fixo: (S.fixos || {})[opcao.vaga] || null, status: (S.fStatus || {})[opcao.vaga] || null, detalhe: (S.fObs || {})[opcao.vaga] || null }],
      pedidos: [{ stuId, mid, pedido: Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => pedido[c] !== undefined).map(c => [c, pedido[c]])) }],
      recusas: [recusaDaReversao(opcao.vaga, recusa)], label: '↶ Reverter'
    };
    S.fixos = { ...(S.fixos || {}), [opcao.vaga]: { ...opcao.pino, agendado: true } };
    // O status que a vaga deixou (statusDepois): desfazer não troca o status mudado depois dela (F1g, #85)
    rev.voos[0].statusDepois = (S.fStatus || {})[opcao.vaga] || null;
    if (!gravarNaEscala(foto, 'mod', `Vaga do voo cancelado de ${voo.s} (${hm(voo.a)}–${hm(voo.b)}): ${opcao.texto}`, rev)) return;
    redesenharPorNome('pedidos-do-dia');
    focarNoVoo(opcao.vaga);
    showToast(`A vaga foi para ${recusa.s}.`, 'ok');
    return;
  }
  // O voo cancelado aproveitado: aplicada, a sugestão fixa o voo no lugar dela e o volta para Pendente, e o pedido muda
  // com ela
  if (cancelado) {
    const rev = aproveitarCancelado(S, RES, fKey, opcao);
    if (!rev || !gravarNaEscala(foto, 'mod', `Voo cancelado aproveitado: ${voo.s} (${hm(voo.a)}–${hm(voo.b)}): ${opcao.texto}`, { ...rev, label: '↶ Reverter' })) return;
    redesenharPorNome('pedidos-do-dia');
    focarNoVoo(fKey);
    showToast('Voo aproveitado: ele volta para Pendente, no lugar da sugestão.', 'ok');
    return;
  }
  // "Soltar" precisa do motor: na escala aprovada não vale (o botão fica desligado)
  if (opcao.soltar && foto) return;
  // A sugestão do conflito que muda também o pedido (a disponibilidade, o tipo): o voo fixo e o pedido mudam juntos, e o
  // histórico desfaz os dois (a reversão do aproveitamento)
  if (opcao.pedido) {
    const rev = repararComOPedido(S, RES, fKey, opcao);
    if (!rev || !gravarNaEscala(foto, 'mod', `Reparo: ${voo.s} (${hm(voo.a)}–${hm(voo.b)}): ${opcao.texto}`, { ...rev, label: '↶ Reverter' })) return;
    redesenharPorNome('pedidos-do-dia');
    focarNoVoo(fKey);
    showToast('Sugestão aplicada: o voo continua fixo, e o pedido muda com ela.', 'ok');
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
  if (!gravarNaEscala(foto, 'mod', `Reparo: ${voo.s} (${hm(voo.a)}–${hm(voo.b)}): ${opcao.soltar ? 'Soltar o voo' : opcao.texto}`, {
    kind: 'restaurarFixos', fixos: Object.fromEntries(mudados.map(k => [k, antes[k]])), ...(escolhas.length ? { pedidos: escolhas } : {}), ...(S.aprovacao ? { aprovada: true } : {}), label: '↶ Reverter'
  })) return;
  if (escolhas.length) redesenharPorNome('pedidos-do-dia');
  focarNoVoo(fKey);
  showToast(opcao.soltar ? 'Voo solto: o app escalou de novo.' : 'Sugestão aplicada: o voo continua fixo.', 'ok');
}
// O Esc fecha a gaveta quando ela é a de cima ou tem o foco (js/dom.js); com um diálogo aberto por cima (o do status, o
// do agendamento), o Esc fecha só o diálogo
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && gavetaDoEsc(e) === $('#painel-reparo') && !algumDialogoAberto()) fecharPainelDeReparo(true);
});

// "↶ Reverter" no histórico (js/eventos/historico.js): os tipos desta tela. A reversão chega validada (js/reversoes.js)
// O voo cancelado aproveitado, desfeito: o pino, o status, o motivo e o pedido de antes
// As reversões não perguntam (d47) e seguem a aprovação de agora: na escala aprovada, sem o motor (F1g)
aoReverter('aproveitarCancelado', (rev, entry) => {
  const foto = fotoDaEscalaTravada();
  desfazerAproveitamento(S, rev);
  S.fixos = normalizarFixos(S.fixos);
  redesenharPorNome('pedidos-do-dia');
  gravarNaEscala(foto, 'mod', `Revertido: ${entry.desc}`, null, entry.id);
});
aoReverter('restaurarFixos', (rev, entry) => {
  // Um reparo desfeito: os voos voltam a ser fixos como antes dele, e o instrutor escolhido dos pedidos também. O voo
  // agendado volta só enquanto o agendamento continua: o histórico diz qual foi desfeito ou feito depois do reparo
  // (js/reversoes.js e js/instrutor-escolhido.js)
  const foto = fotoDaEscalaTravada();
  reverterReparo(S, rev, agendamentosEmVolta(S, AUDIT_LOG, entry, S.frota));
  S.fixos = normalizarFixos(S.fixos);
  if (rev.pedidos) redesenharPorNome('pedidos-do-dia');
  gravarNaEscala(foto, 'mod', `Revertido: ${entry.desc}`, null, entry.id);
});

aoReverter('restaurarEscolha', (rev, entry) => {
  // O instrutor escolhido volta como estava, e os voos fixos também; o voo agendado, só enquanto o agendamento
  // continua (js/reversoes.js e js/instrutor-escolhido.js)
  const foto = fotoDaEscalaTravada();
  reverterEscolha(S, rev, agendamentosEmVolta(S, AUDIT_LOG, entry, S.frota));
  S.fixos = normalizarFixos(S.fixos);
  gravarNaEscala(foto, 'mod', `Revertido: ${entry.desc}`, null, entry.id);
  redesenharPorNome('pedidos-do-dia');
});

// A alteração de um voo feita na Escala, desfeita: os pedidos, os pinos, o status e o detalhe de antes, e as recusas que
// ela tirou (na escala aprovada, no lugar delas)
// O voo em andamento, com resultado ou com o status mudado depois dela fica, com o aviso (js/reversoes.js); com o progresso
// desligado, o resultado não aparece na Escala: o aviso diz como mudar o voo
aoReverter('desfazerEdicao', (rev, entry) => {
  const motivo = motivoParaNaoDesfazerEdicao(S, rev);
  if (motivo) {
    showToast(motivo === VOO_COM_RESULTADO && !ligada('progresso') ? `${motivo} Para mudar o voo, use Editar na Escala.` : motivo);
    return;
  }
  const foto = fotoDaEscalaTravada();
  desfazerEdicao(S, rev);
  S.fixos = normalizarFixos(S.fixos);
  const recusas = rev.recusas.map(({ fKey, ...r }) => [fKey, { t: 'err', ...r }]);
  gravarNaEscala(foto, 'mod', `Revertido: ${entry.desc}`, null, entry.id, { recusas });
  redesenharPorNome('pedidos-do-dia');
});

// "Refazer a escala" (o aviso dos voos com quem ficou inativo, no trilho): a escala é refeita sem o instrutor ou o recurso inativo e
// gravada, com a entrada no histórico; nada mais muda
aoAcionar('refazer-escala', () => {
  const nomes = voosComInativos(S, RES, { data: DATA, hoje: hojeISO() }).filter(i => i.de !== 'aluno').map(i => i.nome);
  gravarAlteracao('mod', nomes.length ? `Escala refeita: ${nomes.join(', ')} ${nomes.length > 1 ? 'estão inativos' : 'está inativo'}` : 'Escala refeita sem os inativos do cadastro');
});

// Aprovar (#/apr): até ter a tela dela, a aprovação fica na barra da compactação da Escala. Ela vem à vista, contornada por
// um instante, e o foco vai para o botão dela (Aprovar escala ou Reabrir), com o estado dito ao leitor de tela; sem botão
// (quem só consulta, a escala sem voo ou sem as horas dos instrutores), o foco vai para o título da Escala, com o porquê
const DESTAQUE_MS = 1200;
function mostrarAprovacao() {
  const barra = $('#compactacao');
  const alvo = S.aprovacao ? $('#selo-aprovada') : $('#aprovacao');
  const botao = [...document.querySelectorAll('#aprovacao button')].find(b => !b.disabled && b.getClientRects().length);
  const semVoo = !RES || !RES.out.length;
  let texto;
  if (S.aprovacao) {
    const em = new Date(S.aprovacao.em);
    texto = `Escala aprovada às ${hm(em.getHours() * 60 + em.getMinutes())}${S.aprovacao.por ? ` por ${S.aprovacao.por}` : ''}.`;
  } else if (semVoo) texto = 'Nenhum voo nesta data: não há escala para aprovar.';
  else if (!botao && isGestor()) texto = 'Escala ainda não aprovada. Quem só consulta não aprova.';
  else if (!botao) texto = 'Escala ainda não aprovada: as horas de voo dos instrutores não foram lidas.';
  else texto = 'Escala ainda não aprovada.';
  if (alvo && !alvo.hidden && alvo.getClientRects().length) {
    alvo.classList.add('destaque');
    setTimeout(() => alvo.classList.remove('destaque'), DESTAQUE_MS);
  }
  if (botao) botao.focus({ preventScroll: true });
  else focarNoTitulo($('#s-esc'));
  anunciar(texto);
  return { lugar: barra && !barra.hidden ? barra : null, focou: true };
}
registrarTela('apr', { aoMostrar: () => mostrarAprovacao() });

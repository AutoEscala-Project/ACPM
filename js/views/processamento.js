// O Processamento (G2): a lista dos pedidos da data e dos voos sem pedido (o quadro de js/processamento.js, uma linha por
// pedido ou voo, com a situação dele) e o detalhe de cada um, só de leitura, com as ações; o aviso do alto (#proc-atualizacao:
// "Atualizar a escala"), a contagem do alto (#proc-cnt) e o que a linha de um pedido diz em Pedidos (a mesma situação: "em
// espera às 08:20 · 1º", N14). Os modelos do componente de lista e detalhe (js/views/mestre-detalhe.js), sem eventos: eles
// ficam em js/eventos/processamento.js
import { quadroDoProcessamento } from '../processamento.js';
import { ambienteDaData } from '../conciliacao.js';
import { minutosExatos } from '../rules.js';
import { minutoDaPreferencia } from '../horarios.js';
import { esc, fmtH, hm } from '../format.js';
import { nomeDoRecurso } from '../categorias.js';
import { $, trocarConteudo, showToast } from '../dom.js';
import { redesenharPorNome } from '../redesenho.js';
import { dadosLidos, diaJaGravado } from '../actions.js';
import { S, RES, DATA, isGestor, estadoDaEscala, getMissionTarget } from '../state.js';
import { solicitacoesDaData } from '../solicitacoes-da-data.js';
import { missaoDoPedido, dataCurta, aprovaPedidos } from './agenda.js';

// O quadro da escala da tela, refeito só quando a escala, os pedidos lidos, a data ou o dia mudam (a lista e o detalhe o
// leem no mesmo desenho)
let memo = { res: undefined, lista: undefined, data: undefined, s: undefined, quadro: null };
function quadroDaTela() {
  const { lista } = solicitacoesDaData();
  if (memo.quadro && memo.res === RES && memo.lista === lista && memo.data === DATA && memo.s === S) return memo.quadro;
  const quadro = quadroDoProcessamento(S, lista, RES, { ...ambienteDaData(), estadoDoMotor: RES ? estadoDaEscala() : null });
  memo = { res: RES, lista, data: DATA, s: S, quadro };
  return quadro;
}
// A linha do quadro de um pedido (o id), para Pedidos; null sem ela (os pedidos ainda não lidos, outra data)
const linhaDoPedidoNoQuadro = id => quadroDaTela().linhas.find(l => l.pedido && l.pedido.id === id) || null;
// A linha de uma chave (o fKey do voo ou 'p:<id>')
const linhaDoQuadro = chave => quadroDaTela().linhas.find(l => l.chave === String(chave)) || null;

// O que a linha diz em Pedidos (a tag da linha e o campo "Na escala" do detalhe): a situação dela, curta
const EM_PEDIDOS = {
  'na-escala': l => `Na escala ${hm(l.voo.a)}`, 'em-espera': l => `Em espera às ${hm(l.espera.minuto)} · ${l.espera.lugar}º`,
  'nao-coube': () => 'Fora da escala (não coube)', 'para-entrar': () => 'Entra com Atualizar a escala', 'para-sair': () => 'Sai com Atualizar a escala',
  conferir: () => 'Na escala: conferir o status', fica: () => 'Fica na escala', 'sem-aprovacao': () => 'Na escala sem aprovação',
  'fora-pelo-operador': () => 'Tirado da escala', dispensado: () => 'Tirado desta data'
};
export function situacaoEmPedidos(id) {
  const l = dadosLidos ? linhaDoPedidoNoQuadro(id) : null;
  return l && EM_PEDIDOS[l.situacao] ? EM_PEDIDOS[l.situacao](l) : '';
}
// A chave da linha do pedido (id) no quadro, ou null (a resposta de "Aprovar pedido" no Processamento põe o foco nela)
export const chaveDoPedidoNoProcessamento = id => (dadosLidos ? (linhaDoPedidoNoQuadro(id) || {}).chave ?? null : null);

// O pedido da linha de uma chave (o id), ou null: a linha sem pedido, ou fora do quadro
export const pedidoDaChave = chave => { const l = chave === null || chave === undefined ? null : linhaDoQuadro(chave); return l && l.pedido ? l.pedido.id : null; };
// A linha escolhida que saiu do quadro porque o pedido dela mudou de chave (o pedido sem voo, "p:2", que ganhou um voo,
// "1001_0_1", e o contrário): a chave nova do mesmo pedido, para o detalhe seguir o pedido (e não dizer que ele saiu);
// null quando a chave continua no quadro ou o pedido não está mais nele
export function chaveQueSegueOPedido(chave, pedido) {
  if (!dadosLidos || chave === null || chave === undefined || pedido === null || pedido === undefined || linhaDoQuadro(chave)) return null;
  const l = linhaDoPedidoNoQuadro(pedido);
  return l ? l.chave : null;
}

// Onde o voo de uma chave ficou, quando não ficou na escala (a resposta de "Pôr de volta" e de "Atualizar a escala" diz,
// N6): 'espera' ("em espera às 08:20 · 2º") ou 'fora' ("fora da escala (não coube)"); na escala (ou fora do quadro): null
export function ondeOVooFicou(chave) {
  const l = dadosLidos && chave !== null && chave !== undefined ? linhaDoQuadro(chave) : null;
  if (!l || !['em-espera', 'nao-coube'].includes(l.situacao)) return null;
  const texto = EM_PEDIDOS[l.situacao](l);
  return { onde: l.situacao === 'em-espera' ? 'espera' : 'fora', texto: texto.charAt(0).toLowerCase() + texto.slice(1) };
}

// Os grupos da lista, nesta ordem, e as situações de cada um
const GRUPOS = [
  { id: 'atualizar', titulo: 'Para atualizar a escala', de: ['para-entrar', 'para-sair', 'conferir', 'sem-aprovacao'] },
  { id: 'fora', titulo: 'Fora da escala', de: ['nao-coube', 'em-espera', 'fora-pelo-operador', 'dispensado', 'sem-aluno', 'inativo', 'nao-entrou'] },
  { id: 'escala', titulo: 'Na escala', de: ['na-escala', 'fica'] },
  { id: 'aguardando', titulo: 'Aguardando aprovação', de: ['aguardando'] },
  { id: 'cancelados', titulo: 'Cancelados', de: ['cancelado'] }
];
const grupoDa = situacao => GRUPOS.find(g => g.de.includes(situacao)).id;
// O ponto da linha (a cor nunca é o único sinal: o rótulo vai ao leitor de tela, e a terceira linha diz)
const PONTO = {
  'nao-coube': ['erro', 'não coube na escala'], 'sem-aluno': ['erro', 'fora do cadastro'], inativo: ['erro', 'aluno inativo'],
  'em-espera': ['aviso', 'em espera'], 'para-entrar': ['aviso', 'para entrar'], 'para-sair': ['aviso', 'para sair'], conferir: ['aviso', 'conferir o status'],
  'sem-aprovacao': ['aviso', 'sem aprovação'], 'fora-pelo-operador': ['info', 'tirado da escala'], dispensado: ['info', 'tirado desta data'],
  'na-escala': ['ok', 'na escala']
};
// As situações do filtro (o valor de cada linha) e o rótulo de cada uma
export const SITUACOES_DO_FILTRO = [
  ['na-escala', 'Na escala'], ['em-espera', 'Em espera'], ['nao-coube', 'Não coube'], ['atualizar', 'Para atualizar'],
  ['fora-pelo-operador', 'Tirados da escala'], ['aguardando', 'Aguardando aprovação'], ['outros', 'Outros'], ['cancelado', 'Cancelados']
];
const valorDaSituacao = situacao => (['na-escala', 'em-espera', 'nao-coube', 'aguardando', 'cancelado'].includes(situacao) ? situacao
  : ['para-entrar', 'para-sair', 'conferir', 'sem-aprovacao'].includes(situacao) ? 'atualizar' : ['fora-pelo-operador', 'dispensado'].includes(situacao) ? 'fora-pelo-operador' : 'outros');

// O registro da linha no dia (o pedido do aluno ou a missão extra), ou null
const registroDa = l => (l.mid === null ? null : getMissionTarget(l.stuId, l.mid));
// O horário da linha: o do voo na escala; senão, o do pedido (o minuto exato, a 1ª preferência)
function horarioDa(l, r) {
  if (l.voo) return hm(l.voo.a);
  const [exato] = r ? minutosExatos(r.jan) : [];
  if (exato !== undefined) return hm(exato);
  if (l.pedido && l.pedido.horario) return l.pedido.horario;
  const p1 = r ? minutoDaPreferencia(r.p1) : -1;
  return p1 >= 0 ? hm(p1) : '—';
}
const duracaoDa = (l, r) => (r ? fmtH(+r.nb) : l.pedido ? fmtH(l.pedido.horas === null || l.pedido.horas === undefined ? 1 : +l.pedido.horas) : '');
const missaoDaLinha = (l, r) => (r && r.etapa ? r.mis : l.pedido ? missaoDoPedido(l.pedido) : l.missao);
// A missão do curso do voo, ao lado da missão (a etiqueta de sempre, com o curso na dica)
const etapaDaLinha = (l, r) => (r && r.etapa ? `<span class="etapa" title="Missão do curso ${esc(r.cursoDaEtapa || ((S.stu || []).find(s => s.id === l.stuId) || {}).curso || '')}">${esc(r.etapa)}</span>` : '');
const ORIGEM = { agendado: 'agendado na Escala', 'sem-pedido': 'sem pedido' };

// A ação da linha (só de quem edita): "Pôr de volta" no tirado da escala; "Trazer de volta" no tirado desta data
function acaoDaLinha(l) {
  if (isGestor()) return null;
  if (l.situacao === 'fora-pelo-operador') return { texto: 'Pôr de volta', rotulo: `Pôr de volta na escala: ${l.nome} (${l.missao})`, atributos: `data-act="por-de-volta" data-id="${l.stuId}" data-mid="${l.mid}"` };
  if (l.situacao === 'dispensado') return { texto: 'Trazer de volta', rotulo: `Trazer de volta: ${l.nome} (${l.missao})`, atributos: `data-act="trazer-pedido" data-pedido="${l.pedido.id}"` };
  return null;
}

// O que acabou de mudar por uma ação desta tela (a linha marcada e à vista, N6), na data da ação: a mesma chave em outra
// data é outro voo
let recente = null;
function marcarRecenteNoProcessamento(chave) { recente = chave === null ? null : { chave: String(chave), data: DATA }; }
const eRecente = chave => Boolean(recente && recente.data === DATA && recente.chave === chave);
// A data da resposta na linha de estado (#proc-status): em outra data, ela sai
let dataDoStatus = null;

function itemDaLinha(l) {
  const r = registroDa(l);
  // O voo agendado na Escala (o cadeado): "agendado 10:10"
  const pino = l.fKey ? (S.fixos || {})[l.fKey] : null;
  const agendado = pino && pino.agendado ? `agendado ${hm(pino.a)}` : '';
  const [ponto, pontoRotulo] = PONTO[l.situacao] || ['', ''];
  const acao = acaoDaLinha(l);
  return {
    id: l.chave,
    titulo: l.nome,
    // O recurso: o do voo na escala; fora dela, o tipo, que a missão do pedido já diz ("Voo Local · C152")
    linha2: [missaoDaLinha(l, r), l.voo ? nomeDoRecurso(l.voo.r) : l.pedido && !(r && r.etapa) ? '' : l.recurso || '', duracaoDa(l, r), agendado || ORIGEM[l.origem] || ''].filter(Boolean).join(' · '),
    meta: horarioDa(l, r),
    linha3: l.texto,
    ponto, pontoRotulo,
    ...(etapaDaLinha(l, r) ? { bloco: etapaDaLinha(l, r) } : {}),
    apagado: l.situacao === 'cancelado',
    grupo: grupoDa(l.situacao),
    ...(acao ? { acao } : {}),
    atributos: `data-proc="${esc(l.chave)}"${eRecente(l.chave) ? ' data-recente' : ''}`,
    busca: [l.nome, l.missao, r && r.etapa].filter(Boolean),
    valores: { situacao: [valorDaSituacao(l.situacao)], curso: [((S.stu || []).find(s => s.id === l.stuId) || {}).curso || 'sem-curso'], missao: [l.missao] }
  };
}

// O modelo da lista (js/lista.js): os grupos, com quantos tem cada um. Os pedidos não lidos: só os voos. Antes da primeira
// escala, a lista diz que lê; enquanto outra data abre, fica a da data de antes (a mudança é recusada, js/actions.js)
export function modeloDoProcessamento() {
  if (!dadosLidos && !RES) return { fixos: [], grupos: [], itens: [], estado: 'lendo', textoDoEstado: 'Lendo a escala desta data…' };
  const { linhas } = quadroDaTela();
  const itens = linhas.map(itemDaLinha);
  const grupos = GRUPOS.map(g => ({ id: g.id, titulo: g.titulo, resumo: String(itens.filter(i => i.grupo === g.id).length) })).filter(g => g.resumo !== '0');
  return { fixos: [], grupos, itens, estado: 'pronto' };
}

const leitura = (campo, rotulo, texto) => ({ id: campo, rotulo, tipo: 'leitura', texto: texto || '—' });
const textoDaFila = espera => espera.fila.map(f => `${f.lugar}º ${f.nome}`).join('; ');

// O detalhe de uma linha (null: não está no quadro), só de leitura: a situação nesta data (o voo, a espera com a lista do
// horário, o motivo e onde resolver), o pedido (ou o voo sem pedido) e as ações embaixo
export function detalheDoProcessamento(chave) {
  const l = linhaDoQuadro(chave);
  if (!l) return null;
  const r = registroDa(l), p = l.pedido;
  const situacao = [
    leitura('situacao', 'Situação', l.texto),
    ...(l.voo ? [leitura('voo', 'Voo', `${hm(l.voo.a)}–${hm(l.voo.b)} · ${nomeDoRecurso(l.voo.r)}${l.voo.ins ? ` · ${l.voo.ins}` : ''}`)] : []),
    ...(l.espera ? [leitura('espera', 'Lista de espera', `${hm(l.espera.minuto)}: ${textoDaFila(l.espera)}`)] : []),
    ...(l.motivo ? [leitura('motivo', 'Motivo', l.motivo.m), ...(l.motivo.onde ? [leitura('onde', 'Onde resolver', l.motivo.onde.rotulo)] : [])] : [])
  ];
  const pedido = p ? [
    leitura('missao', 'Missão', missaoDoPedido(p)),
    ...(r && r.etapa ? [leitura('missao-do-curso', 'Missão do curso no voo', `${r.etapa}${r.etapaDoPrograma ? ' · do programa' : ''}`)] : []),
    leitura('horario', '1ª preferência', p.horario), leitura('horario2', '2ª preferência', p.horario2),
    leitura('horas', 'Duração', fmtH(p.horas === null || p.horas === undefined ? 1 : +p.horas)),
    leitura('registrado', 'Registrado por', p.registrado_por),
    ...(p.aprovada_em ? [leitura('aprovado', 'Aprovado por', p.aprovada_por || 'Operador')] : []),
    ...(p.observacao ? [leitura('observacao', 'Observação', p.observacao)] : [])
  ] : [
    leitura('missao', 'Missão', missaoDaLinha(l, r)), leitura('recurso', 'Tipo de recurso', l.recurso), leitura('horas', 'Duração', duracaoDa(l, r)),
    leitura('origem', 'Origem', l.origem === 'agendado' ? 'Agendado na Escala (+ Agendar voo), sem pedido' : 'Posto à mão, sem pedido')
  ];
  const links = [
    ...(p ? [`<a class="btn quiet" href="#/age/${esc(p.id)}" data-proc-ir="age">Abrir em Pedidos</a>`] : []),
    ...(l.voo || l.motivo || l.espera ? ['<a class="btn quiet" href="#/esc" data-proc-ir="esc">Abrir na Escala</a>'] : []),
    ...(l.motivo && l.motivo.onde && !l.motivo.onde.restricoes && l.motivo.onde.tela !== 'esc' ? [`<a class="btn quiet" href="#/${esc(l.motivo.onde.tela)}" data-proc-ir="${esc(l.motivo.onde.tela)}">${esc(l.motivo.onde.rotulo.split(':')[0])}</a>`] : [])
  ].join(' ');
  const ids = r ? `data-id="${l.stuId}" data-mid="${l.mid}"` : '';
  const rodape = [
    ...(r ? [{ id: 'restricoes', texto: 'Restrições', rotulo: `Restrições do voo de ${l.nome}`, atributos: `data-act="restricoes" ${ids}` }] : []),
    ...(l.situacao === 'fora-pelo-operador' ? [{ id: 'por-de-volta', texto: 'Pôr de volta na escala', rotulo: `Pôr de volta na escala: ${l.nome}`, atributos: `data-act="por-de-volta" ${ids}`, soEdicao: true }] : []),
    ...(l.situacao === 'dispensado' ? [{ id: 'trazer', texto: 'Trazer de volta', rotulo: `Trazer de volta o pedido de ${l.nome}`, atributos: `data-act="trazer-pedido" data-pedido="${p.id}"`, soEdicao: true }] : []),
    ...(['sem-aprovacao', 'aguardando'].includes(l.situacao) && p && aprovaPedidos() ? [{ id: 'aprovar', texto: 'Aprovar pedido', rotulo: `Aprovar o pedido de ${l.nome}`, atributos: `data-act="aprovar-pedido" data-id="${p.id}"`, soEdicao: true }] : []),
    ...(l.situacao === 'sem-aprovacao' ? [{ id: 'tirar', texto: 'Tirar da escala', rotulo: `Tirar da escala: ${l.nome}`, atributos: `data-act="rm-fly" ${ids}`, soEdicao: true }] : [])
  ];
  return {
    id: l.chave,
    titulo: l.nome,
    subtitulo: [missaoDaLinha(l, r), r && r.etapa, horarioDa(l, r)].filter(Boolean).join(' · '),
    secoes: [
      { id: 'nesta-data', titulo: 'Nesta data', icone: 'i-andamento', escopo: dataCurta(DATA), campos: situacao, html: links ? `<p class="proc-links">${links}</p>` : '' },
      { id: 'pedido', titulo: p ? 'Pedido' : 'Voo sem pedido', icone: 'i-calendario', campos: pedido }
    ],
    rodape
  };
}

// A contagem do alto (#proc-cnt): na escala, fora (não coube, em espera, tirados), aguardando aprovação
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function textoDaContagem({ contagens: c }) {
  const fora = c.naoCouberam + c.emEspera + c.foraPeloOperador + c.dispensados;
  return [`${c.naEscala} na escala`, `${fora} fora`, ...(c.emEspera ? [`${c.emEspera} em espera`] : []), `${c.aguardando} aguardando aprovação`].join(' · ');
}

// O aviso do alto, nesta ordem: a leitura dos pedidos que falhou; a escala que mudou em outro computador ("Atualizar": nada
// mais é dito até lá); o que "Atualizar a escala" faria (os aprovados fora da escala, os cancelados e os sem aprovação que
// saem, as missões do curso que o programa passou), com o botão para quem opera a escala; os voos para conferir. Quem só
// consulta lê o mesmo, sem o botão
function avisoDoProcessamento() {
  const { lista, leitura: lido, diaMudou } = solicitacoesDaData();
  if (!dadosLidos) return '';
  if (lido === 'erro' && !lista) return '<p>Não foi possível ler os pedidos desta data: a escala fica como está. <button type="button" class="btn quiet" id="proc-tentar">Tentar de novo</button></p>';
  if (diaMudou) return '<p>A escala desta data mudou em outro computador. <button type="button" class="btn quiet" id="proc-atualizar-data">Atualizar</button></p>';
  if (!lista) return '';
  const { plano, linhas } = quadroDaTela();
  if (!plano) return '';
  const partes = [];
  const entram = plano.entram.length + plano.voltam.length, saem = plano.saem.length, missoes = plano.missoes.length;
  if (entram) partes.push(plural(entram, 'pedido aprovado fora da escala', 'pedidos aprovados fora da escala'));
  if (saem) partes.push(plural(saem, 'cancelado ou sem aprovação ainda na escala', 'cancelados ou sem aprovação ainda na escala'));
  if (missoes) partes.push(plural(missoes, 'missão do curso para trocar', 'missões do curso para trocar'));
  const html = [];
  if (partes.length) {
    const opera = !isGestor();
    const comeca = !diaJaGravado() ? ' Esta data ainda não tem escala gravada: Atualizar a escala a começa.' : '';
    html.push(`<p>${esc(partes.join(' · '))}${opera ? `.${comeca} <button type="button" class="btn" id="proc-atualizar" data-act="atualizar-escala">Atualizar a escala</button>` : ': um Operador atualiza a escala.'}</p>`);
  }
  const conferir = linhas.filter(l => l.situacao === 'conferir');
  if (conferir.length) html.push(`<p>${esc(plural(conferir.length, 'voo para conferir', 'voos para conferir'))}: pedido cancelado e o voo já começou (${esc(conferir.map(l => l.nome).join(', '))}). <a class="btn quiet" href="#/esc">Abrir a Escala</a></p>`);
  return html.join('');
}

// Desenha o aviso e a contagem do alto
export function desenharAvisoDoProcessamento() {
  const lugar = $('#proc-atualizacao');
  if (!lugar) return;
  // Outra data aberta: a marca e a resposta da ação da data de antes saem (voltar a ela não as traz de volta)
  if (recente && recente.data !== DATA) recente = null;
  const status = $('#proc-status');
  if (status && dataDoStatus !== DATA && status.textContent) { status.textContent = ''; dataDoStatus = null; }
  const html = avisoDoProcessamento();
  lugar.hidden = !html;
  if (lugar.innerHTML !== html) trocarConteudo(lugar, html);
  const cnt = $('#proc-cnt');
  const texto = dadosLidos ? textoDaContagem(quadroDaTela()) : '';
  if (cnt && cnt.textContent !== texto) cnt.textContent = texto;
}

// A resposta de uma ação do Processamento (N6): a linha de estado (#proc-status, role="status") e o toast, com o aluno e a
// data; a linha do pedido marcada (não só pela cor: a barra à esquerda e "agora" para o leitor de tela) e à vista, com o
// foco nela; sem a linha à vista (filtrada, ou o detalhe numa vista só), o foco vai para a linha de estado. ok: o toast de
// feito; senão, o de aviso. focar: false deixa o foco onde está (a gaveta das restrições aberta por cima da tela)
export function responderNoProcessamento({ chave, texto, ok = true, focar = true }) {
  const frase = `${texto} · ${dataCurta(DATA)}`;
  const status = $('#proc-status');
  if (status) { status.textContent = frase; dataDoStatus = DATA; }
  showToast(`${frase}.`, ok ? 'ok' : '');
  if (chave !== null && chave !== undefined) marcarRecenteNoProcessamento(chave);
  redesenharPorNome('pedidos-do-dia');
  const botao = chave !== null && chave !== undefined && document.querySelector(`#proc .lista-botao[data-item="${CSS.escape(String(chave))}"]`);
  const naTela = $('#s-proc') && !$('#s-proc').hidden && $('#s-proc').classList.contains('on');
  if (!naTela || !focar) return;
  if (botao && botao.getClientRects().length) {
    botao.focus({ preventScroll: true });
    botao.scrollIntoView({ block: 'nearest' });
  } else if (status && status.getClientRects().length) status.focus();
  // Numa vista só, com o detalhe por cima da lista (a linha e a de estado escondidas): o foco fica no detalhe do pedido, que
  // já mostra a situação nova (o toast diz o que a ação fez)
  else $('#det-proc')?.focus();
}

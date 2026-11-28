// O Processamento (G2): a tela (a lista e o detalhe, com os modelos de js/views/processamento.js) e as ações dela (a das
// ações de Pedidos, depoisDeMudarPedidos, está em js/conciliacao.js). As ações escrevem o dia por gravarAlteracao (pela conciliação,
// js/conciliacao.js) e respondem como o N6 pede: a linha de estado (#proc-status, role="status") e o toast com o aluno e a
// data, o foco na linha do pedido e a linha marcada (responderNoProcessamento):
// - "Atualizar a escala" (no aviso do alto): a conciliação dos pedidos da data (entram, voltam, saem, e as missões do curso
//   que o programa passou trocam), depois de conferir se a escala mudou em outro computador;
// - "Trazer de volta" (o pedido tirado desta data antes): ele sai de importadas e entra;
// - "Pôr de volta na escala" e o "Tirar da escala" da linha sem aprovação: em js/eventos/restricoes-do-voo.js, com o "✕"
//   da Escala (o mesmo dono);
// - "Recomeçar pelos pedidos" (no "Mais", com a confirmação armada).
// "Aprovar pedido" é o de Pedidos (js/eventos/agenda.js); "Restrições" abre a gaveta (js/eventos/restricoes-do-voo.js)
import { aindaNaoAbriu, carregarData, gravarAlteracao } from '../actions.js';
import { solicitacaoAprovada } from '../agenda.js';
import { MIS } from '../config.js';
import { conciliarADataAberta, notasDaConciliacao, ambienteDaData } from '../conciliacao.js';
import { $, showToast, ligarMenu } from '../dom.js';
import { recomecarPelosPedidos } from '../processamento.js';
import { registrarDesenho } from '../redesenho.js';
import { S, DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { solicitacoesDaData, lerSolicitacoesDaData, marcarDiaMudou } from '../solicitacoes-da-data.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import './restricoes-do-voo.js';
import { criarMestreDetalhe } from '../views/mestre-detalhe.js';
import { registrarTela } from '../views/telas.js';
import { criarFiltroDosCursos } from '../views/filtro-dos-cursos.js';
import { criarFiltroMultiplo } from '../views/filtro-multiplo.js';
import {
  modeloDoProcessamento, detalheDoProcessamento, desenharAvisoDoProcessamento, responderNoProcessamento, SITUACOES_DO_FILTRO,
  pedidoDaChave, chaveQueSegueOPedido, ondeOVooFicou
} from '../views/processamento.js';

// A situação: sem marca, todas menos os cancelados (que só aparecem marcados)
function filtroDaSituacao(aoMudar) {
  const filtro = criarFiltroMultiplo({
    id: 'flt-proc-sit', nome: 'Situação', todas: 'Situação: todas menos canceladas', regra: 'alguma', frase: 'Mostra os pedidos das situações marcadas.',
    grupos: () => [{ titulo: 'Situação', opcoes: SITUACOES_DO_FILTRO }], aoMudar
  });
  return { ...filtro, quemPassa: () => (filtro.valores().length ? filtro.quemPassa() : valores => !valores.includes('cancelado')) };
}

const tela = criarMestreDetalhe({
  id: 'proc',
  rotulo: 'Processamento',
  nomes: ['pedido', 'pedidos'],
  semItens: 'Nenhum pedido para esta data.',
  vazio: { texto: 'Escolha um pedido na lista.', icone: 'i-andamento', dica: '' },
  filtros: [
    { criar: filtroDaSituacao, valores: item => item.valores.situacao },
    { criar: aoMudar => criarFiltroDosCursos('flt-proc-cur', aoMudar), valores: item => item.valores.curso },
    {
      criar: aoMudar => criarFiltroMultiplo({
        id: 'flt-proc-mis', nome: 'Missão', todas: 'Todas as missões', regra: 'alguma', frase: 'Mostra os pedidos das missões marcadas.',
        grupos: () => [{ titulo: 'Missões', opcoes: Object.keys(MIS).map(m => [m, m]) }], aoMudar
      }),
      valores: item => item.valores.missao
    }
  ],
  modelo: modeloDoProcessamento,
  detalhe: detalheDoProcessamento,
  edita: () => !isGestor()
});

// O desenho do Processamento (js/redesenho.js), pelo papel: os pedidos do dia (o aviso, a contagem, a lista e o detalhe),
// com os dados, a escala refeita, os pedidos lidos de novo, quem só consulta e o perfil. A linha escolhida cujo pedido
// mudou de chave (o pedido sem voo que ganhou um, por uma ação desta tela ou de Pedidos) continua escolhida na chave nova:
// o detalhe segue o pedido, sem dizer que ele saiu
let escolhida = { chave: null, pedido: null };
function desenharProcessamento(momento) {
  desenharAvisoDoProcessamento();
  const sel = tela.selecionado();
  const nova = sel !== null && sel === escolhida.chave ? chaveQueSegueOPedido(sel, escolhida.pedido) : null;
  if (nova) tela.escolher(nova);
  tela.desenhar(momento);
  const agora = tela.selecionado();
  escolhida = { chave: agora, pedido: agora === null ? null : pedidoDaChave(agora) ?? (agora === escolhida.chave ? escolhida.pedido : null) };
}
registrarDesenho('pedidos-do-dia', desenharProcessamento, { em: ['dados', 'consulta', 'releitura', 'perfil', 'pedidos', 'escala'], ordem: 60, comMomento: true });
// Aberto, o Processamento lê de novo os pedidos da data. O endereço (#/proc/<chave>) escolhe a linha
registrarTela('proc', {
  aoMostrar: (item, opcoes) => {
    lerSolicitacoesDaData();
    desenharAvisoDoProcessamento();
    return tela.aoMostrar(item, opcoes);
  }
});

// "Mais" (o menu de "Recomeçar pelos pedidos"): fica aberto enquanto a confirmação está armada
const fecharMenuMais = ligarMenu($('#btn-mais-proc'), $('#menu-mais-proc'), { fecharAoEscolher: false });

// Os nomes de quem entrou, voltou, saiu ou trocou de missão (o toast e a linha de estado dizem o aluno, N6)
const nomeDo = stuId => ((S.stu || []).find(s => s.id === stuId) || {}).nm || '';
const listaDeNomes = nomes => (nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', '));
// Os que voltaram ao dia, pelo lugar que a escala refeita deu a cada um: na escala, na lista de espera ou fora (não coube)
function textoDoFeito({ feito, resumo }) {
  const voltaram = [...feito.entraram, ...feito.voltaram].map(x => ({ nome: nomeDo(x.stuId), onde: ondeOVooFicou(`${x.stuId}_${x.mid}_1`) })).filter(x => x.nome);
  const deOnde = onde => voltaram.filter(x => (x.onde ? x.onde.onde : 'escala') === onde).map(x => x.nome);
  const [entraram, esperam, fora] = [deOnde('escala'), deOnde('espera'), deOnde('fora')];
  const partes = [
    entraram.length ? `${entraram.length === 1 ? 'entrou' : 'entraram'} ${listaDeNomes(entraram)}` : '',
    esperam.length ? `${esperam.length === 1 ? 'ficou em espera' : 'ficaram em espera'} ${listaDeNomes(esperam)}` : '',
    fora.length ? `${fora.length === 1 ? 'não coube' : 'não couberam'} ${listaDeNomes(fora)}` : '',
    feito.sairam.length ? `${feito.sairam.length === 1 ? 'saiu' : 'saíram'} ${listaDeNomes(feito.sairam.map(x => x.nome))}` : '',
    feito.missoes.length ? `${feito.missoes.length === 1 ? 'trocou a missão do curso de' : 'trocaram a missão do curso'} ${listaDeNomes(feito.missoes.map(x => x.nome))}` : ''
  ].filter(Boolean);
  return `${partes.join('; ')}${notasDaConciliacao(resumo)}`;
}
// A linha que a ação mostra: a do primeiro que entrou, voltou ou saiu (o voo dele), ou a do primeiro com a missão trocada
const chaveDoFeito = ({ feito }) => {
  const x = feito.entraram[0] || feito.voltaram[0] || feito.sairam[0] || feito.missoes[0];
  return x ? `${x.stuId}_${x.mid}_1` : null;
};

// Uma ação de cada vez: o clique seguinte, enquanto a primeira espera o servidor, não faz nada
let ocupado = false;
async function umaDeCadaVez(b, fazer) {
  if (ocupado) return;
  ocupado = true;
  b.setAttribute('aria-busy', 'true');
  try {
    await fazer();
  } finally {
    ocupado = false;
    b.removeAttribute('aria-busy');
  }
}

// Os pedidos da data lidos agora (a lista de antes não serve para gravar). A escala desta data que mudou em outro
// computador é lida de novo primeiro, e nada é gravado desta vez. Outra data aberta durante a espera: nada
async function pedidosParaGravar(data) {
  if (await ApiClient.diaMudou(data)) {
    marcarDiaMudou(data);
    await carregarData(data);
    return { motivo: 'mudou' };
  }
  await lerSolicitacoesDaData();
  if (DATA !== data || aindaNaoAbriu()) return { motivo: 'outra-data' };
  const { lista, leitura } = solicitacoesDaData();
  return lista && leitura !== 'erro' ? { lista } : { motivo: 'nao-lidos' };
}
const RECUSA = {
  'outra-data': 'A data mudou durante a atualização da escala: nada foi gravado. Atualize de novo na data certa.',
  mudou: 'A escala desta data mudou em outro computador: ela foi lida de novo. Confira e acione de novo.',
  'nao-lidos': 'Não foi possível ler os pedidos desta data: a escala fica como está. Verifique a conexão e tente de novo.'
};

// "Atualizar a escala": a conciliação dos pedidos da data inteira
aoAcionar('atualizar-escala', b => umaDeCadaVez(b, async () => {
  const data = DATA;
  let lidos;
  try {
    lidos = await pedidosParaGravar(data);
  } catch {
    showToast('Não foi possível conferir a escala desta data. Verifique a conexão e tente de novo.');
    return;
  }
  if (lidos.motivo === 'outra-data') { showToast(RECUSA['outra-data']); return; }
  if (lidos.motivo) { responderNoProcessamento({ chave: null, texto: RECUSA[lidos.motivo], ok: false }); return; }
  const r = conciliarADataAberta(lidos.lista);
  if (!r.entraram && !r.sairam && !r.missoes) {
    responderNoProcessamento({ chave: null, texto: `Nada a atualizar na escala${notasDaConciliacao(r.resumo)}`, ok: false });
    return;
  }
  if (!r.gravou) return;
  responderNoProcessamento({ chave: chaveDoFeito(r), texto: `Escala atualizada: ${textoDoFeito(r)}` });
}));

// "Trazer de volta": o pedido aprovado tirado desta data antes (guardado, sem registro) sai de importadas e entra
aoAcionar('trazer-pedido', b => umaDeCadaVez(b, async () => {
  const id = +b.dataset.pedido, data = DATA;
  let lidos;
  try {
    lidos = await pedidosParaGravar(data);
  } catch {
    showToast('Não foi possível conferir a escala desta data. Verifique a conexão e tente de novo.');
    return;
  }
  if (lidos.motivo === 'outra-data') { showToast(RECUSA['outra-data']); return; }
  if (lidos.motivo) { responderNoProcessamento({ chave: `p:${id}`, texto: RECUSA[lidos.motivo], ok: false }); return; }
  const pedido = lidos.lista.find(s => s.id === id);
  if (!pedido || pedido.cancelada_em || !solicitacaoAprovada(pedido)) {
    responderNoProcessamento({ chave: `p:${id}`, texto: 'Este pedido não está mais aprovado: nada foi trazido de volta', ok: false });
    return;
  }
  const antes = [...(S.importadas || [])];
  S.importadas = antes.filter(x => x !== id);
  const r = conciliarADataAberta(lidos.lista, { so: [id] });
  if (!r.gravou) { S.importadas = antes; responderNoProcessamento({ chave: `p:${id}`, texto: `${pedido.aluno_nome} não pôde ser trazido de volta${notasDaConciliacao(r.resumo)}`, ok: false }); return; }
  responderNoProcessamento({ chave: chaveDoFeito(r), texto: `Trazido de volta: ${pedido.aluno_nome} (${pedido.missao})${notasDaConciliacao(r.resumo)}` });
}));

// "Recomeçar pelos pedidos" (no "Mais"): o primeiro acionamento arma o botão, com a frase do que vai acontecer ao lado; o
// segundo recomeça a data pelos pedidos (js/processamento.js), uma gravação, sem reversão. Não numa data passada nem com
// os pedidos não lidos
aoAcionar('recomecar', b => {
  const { lista } = solicitacoesDaData();
  const frase = $('#proc-recomecar-frase');
  const ensaio = recomecarPelosPedidos(structuredClone(S), lista, ambienteDaData());
  if (ensaio.recusa) {
    frase.textContent = ensaio.recusa === 'data-passada' ? 'Data passada: nada recomeça.' : 'Os pedidos desta data não foram lidos: tente de novo.';
    return;
  }
  if (!confirmado(b, 'Confirmar: recomeçar a data')) {
    frase.textContent = ensaio.texto.replace(/^Pedidos: escala recomeçada/, 'Recomeçar a data');
    return;
  }
  frase.textContent = '';
  const feito = recomecarPelosPedidos(S, lista, ambienteDaData());
  if (feito.recusa || !gravarAlteracao('exc', feito.texto)) return;
  fecharMenuMais();
  // Os alunos de cada grupo (N6: a resposta diz o aluno)
  const { voltaram, sairam, entraram } = feito.nomes;
  const quem = [
    voltaram.length ? `${voltaram.length === 1 ? 'voltou ao pedido' : 'voltaram ao pedido'} ${listaDeNomes(voltaram)}` : '',
    sairam.length ? `${sairam.length === 1 ? 'saiu' : 'saíram'} ${listaDeNomes(sairam)}` : '',
    entraram.length ? `${entraram.length === 1 ? 'entrou' : 'entraram'} ${listaDeNomes(entraram)}` : ''
  ].filter(Boolean).join('; ');
  responderNoProcessamento({ chave: null, texto: `${feito.texto.replace(/^Pedidos: /, '').replace(/^./, c => c.toUpperCase())}${quem ? `: ${quem}` : ''}` });
});

// "Atualizar" (a escala desta data mudou em outro computador) e "Tentar de novo" (a leitura dos pedidos que falhou)
document.addEventListener('click', e => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('#proc-atualizar-data')) carregarData(DATA);
  else if (e.target.closest('#proc-tentar')) lerSolicitacoesDaData();
});

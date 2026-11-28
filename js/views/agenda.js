// Pedidos: a agenda de papel da secretaria, digitalizada. A lista dos pedidos da data aberta por estado (aguardando
// aprovação, aprovados, cancelados; o componente de lista e detalhe: o modelo de cada linha e o detalhe só de leitura de
// cada pedido) e o registro de pedidos, cada um para a data dele ("Data do pedido"), com o prazo das 13:00 do dia anterior.
// O formulário vai do aluno à missão (as do curso dele), da missão ao recurso, e dos dois às duas preferências, cada uma um
// horário exato (docs/PLAN.md, as regras da Agenda; a 2ª, opcional, U1). O que o motor recusaria pelas limitações do aluno
// (L: os tipos em que ele não voa, os horários fora dos dele na data do pedido) vem na lista, desligado, com o porquê. Os avisos da lista: a leitura que falhou, a escala
// que mudou em outro computador, os aprovados fora da demanda (com "Importar") e os que ainda voam sem aprovação. O aviso
// das novidades que a vigia traz (D3): o que mudou em outro computador, e o 1º da lista de espera da vaga de um cancelado.
import { MIS, GROUND_EQ_TYPE } from '../config.js';
import { duracaoFixaDaMissao } from '../rules.js';
import { horariosDaMissao } from '../horarios.js';
import { indiceDoPrograma } from '../programa.js';
import { S, RES, DATA, isGestor, inativoNaDataAberta, stuBy, dadoIndisponivel, estadoDaEscala } from '../state.js';
import { inativo } from '../inativos.js';
import { ApiClient } from '../storage.js';
import { dadosLidos } from '../actions.js';
import { $, trocarConteudo, showToast } from '../dom.js';
import { esc, opts, hm, fmtH, somarDias, chaveDeBusca } from '../format.js';
import { registraNaAgenda, operaEscala } from '../perfis.js';
import {
  recursosDaMissao, recursoValido, missoesDoAluno, FUSO_DO_AEROCLUBE, prazoDaAgendaPermite, prazoDaData, datasParaRegistrar, hojeEmSaoPaulo, situacaoDaSolicitacao,
  situacaoNaDemanda, solicitacoesParaImportar, opcoesDaSegundaPreferencia, textoDasNovidades, solicitacaoAprovada, agoraEmSaoPaulo
} from '../agenda.js';
import { porQueOVooFica, POR_QUE_FICA, PEDEM_CONFERIR } from '../processamento.js';
import { primeiroDaListaDeEspera } from '../rejeicoes.js';
import { solicitacoesDaData, solicitacoesDaDataLidas, lerSolicitacoesDaData } from '../solicitacoes-da-data.js';
import { limitacoesNaData, motivoDoTipo, motivoDoHorario, inicioPermitido } from '../limitacoes.js';

const CHAVE_REGISTRADO_POR = 'acpm_agenda_registrado_por';

// Até a Agenda ser aberta uma vez, ela não é desenhada
let agendaAberta = false;
export function abrirAgenda() {
  agendaAberta = true;
  // Aberta de novo, os pedidos da data do formulário também são lidos de novo
  lidosPara = null;
}

// Quem pode registrar e cancelar: no modo local, quem não está no perfil Gestor; no compartilhado, operadores,
// administradores e a secretaria. A exceção da coordenação é de quem opera a escala (o servidor confere de novo)
export const podeEditarAgenda = () => (ApiClient.perfil ? registraNaAgenda(ApiClient.perfil) : !isGestor());
const podeUsarExcecao = () => (ApiClient.perfil ? operaEscala(ApiClient.perfil) : !isGestor());
// Quem aprova pedidos ("Aprovar", "Aprovar todos", "Retirar aprovação" e "Registrar e aprovar"): quem opera a escala. O da
// secretaria aguarda (o servidor confere de novo)
export const aprovaPedidos = podeUsarExcecao;
// Importar para a demanda também é de quem opera a escala
const podeImportar = podeUsarExcecao;

const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataPorExtenso = iso => {
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
  return `${semana}, ${ddmm(iso)}/${iso.slice(0, 4)}`;
};
const quando = instante => new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DO_AEROCLUBE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date(instante)).replace(',', '');
// O horário e a duração do pedido; o pedido de um período (registrado antes de 14/11, ou pela função de 9 argumentos)
// não tem horário (J, N13): "—"
const disponibilidade = p => (p.janela === 'horario'
  ? `${p.horario} · ${fmtH(p.horas === null || p.horas === undefined ? 1 : +p.horas)}`
  : '—');

// A missão com o recurso (o pedido de antes não o tem); com a missão do curso, o código dela no lugar do tipo
// ("NAV-150NM · C152"), quando os programas a têm (também a retirada depois)
const codigoDaMissaoDoCurso = p => (p.missao_do_curso && indiceDoPrograma(S.programa || []).missao(p.missao_do_curso)?.codigo) || null;
export const missaoDoPedido = p => {
  const codigo = codigoDaMissaoDoCurso(p);
  const recurso = recursoValido(p);
  return codigo ? `${codigo}${recurso ? ` · ${recurso}` : ''}` : recurso ? `${p.missao} · ${recurso}` : p.missao;
};
export const descreverPedido = p => `${missaoDoPedido(p)} às ${p.horario || disponibilidade(p)}`;
// Um pedido da lista (a da data aberta)
export const pedidoDaLista = id => (solicitacoesDaData().lista || []).find(p => String(p.id) === String(id));

// "Data do pedido": a data em que o pedido vai ser registrado, um campo dele (a tela continua na data aberta). Começa na data
// aberta, se ela aceita pedidos, ou na primeira que aceita; volta a isso quando a data aberta muda e fica entre um registro
// e outro
let dataDoPedido = null;
let abertaDoCampo = null;
let opcoesDesenhadas = null;
export const dataDoFormulario = () => dataDoPedido;
export function escolherDataDoPedido(data) {
  dataDoPedido = data;
  mudouADataDoPedido();
  desenharFormulario();
  // Os horários do aluno são os do dia da semana da data do pedido (as limitações, L): como uma escolha nova, os avisos da
  // data de antes saem
  escolherNaAgenda();
}
// Outra data: o que o formulário dizia da anterior (o erro, a confirmação armada) sai
function mudouADataDoPedido() {
  desarmarConfirmacaoDaAgenda();
  apagarErroDaAgenda();
}
// A confirmação armada (o aluno que já tem voo marcado, o 7º voo local no horário: js/eventos/agenda.js) fica em
// data-confirmado, com o botão que ela arma no fim ("…|registrar", "…|sem-aprovar" ou "…|excecao"): o botão em uso diz
// "Registrar mesmo assim". Com o 7º voo local entre as causas (data-espera), aparece também "Registrar na lista de
// espera". Desarmada, cada botão volta ao nome dele
export const botaoArmado = () => ($('#form-agenda').dataset.confirmado || '').split('|').at(-1);
export function desarmarConfirmacaoDaAgenda() {
  delete $('#form-agenda').dataset.confirmado;
  delete $('#form-agenda').dataset.espera;
  nomearRegistrar();
}
// O botão principal: "Registrar e aprovar" para quem aprova, "Registrar pedido" para a secretaria
const NOMES_DOS_BOTOES = { registrar: () => (aprovaPedidos() ? 'Registrar e aprovar' : 'Registrar pedido'), 'sem-aprovar': () => 'Registrar sem aprovar', excecao: () => 'Exceção da Coordenação' };
const BOTOES = { registrar: '#form-agenda [type="submit"]', 'sem-aprovar': '#ag-registrar', excecao: '#ag-excecao' };
// Enquanto um pedido é registrado (a leitura dos pedidos da data dele, a gravação), o botão clicado diz "Registrando…"
export function nomearRegistrar() {
  const form = $('#form-agenda');
  if (form.hasAttribute('aria-busy')) return;
  const armado = botaoArmado();
  for (const [botao, seletor] of Object.entries(BOTOES)) {
    const texto = armado === botao ? 'Registrar mesmo assim' : NOMES_DOS_BOTOES[botao]();
    if ($(seletor).textContent !== texto) $(seletor).textContent = texto;
  }
  $('#ag-esperar').hidden = !form.dataset.confirmado || !form.dataset.espera;
}
// Os campos do pedido com erro (aria-invalid): o leitor de tela diz qual campo e lê o motivo (#ag-erro é a descrição deles).
// O foco vai para o primeiro (focar: o campo do primeiro erro; sem ele, o foco fica onde está)
const CAMPOS_DO_PEDIDO = ['#ag-aluno', '#ag-missao', '#ag-recurso', '#ag-horario', '#ag-horario2', '#ag-horas', '#ag-por'];
export const marcarInvalidos = (...ids) => CAMPOS_DO_PEDIDO.forEach(id => $(id).setAttribute('aria-invalid', String(ids.includes(id))));
export function focarNoPrimeiroInvalido() {
  const primeiro = CAMPOS_DO_PEDIDO.find(id => $(id).getAttribute('aria-invalid') === 'true');
  if (primeiro) $(primeiro).focus();
}
export function apagarErroDaAgenda() {
  $('#ag-erro').textContent = '';
  marcarInvalidos();
}

// "sex 20/11 (amanhã) · prazo encerrado"
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const dataCurta = iso => `${DIAS_CURTOS[new Date(iso + 'T12:00:00Z').getUTCDay()]} ${ddmm(iso)}`;
function rotuloDaOpcao({ data, fechada }, hoje) {
  const relativo = data === hoje ? ' (hoje)' : data === somarDias(hoje, 1) ? ' (amanhã)' : '';
  return `${dataCurta(data)}${relativo}${fechada ? ' · prazo encerrado' : ''}`;
}

// Os pedidos da data do formulário, para o aviso de voo já marcado e o limite de voos locais: os da data aberta são os de
// js/solicitacoes-da-data.js; os de outra data são lidos uma vez para cada par de data aberta e data do campo (o que foi lido antes
// de a data aberta mudar pode ser de antes de um pedido), quando o perfil passa a registrar e ao abrir a Agenda. Quem
// registra espera pela leitura; se ela falhou (null), as duas conferências não são feitas (o servidor ainda recusa o 7º
// voo local)
let deOutraData = { data: null, leitura: null };
let lidosPara = null;
function lerDeOutraData(data) {
  deOutraData = { data, leitura: ApiClient.agenda(data, data).catch(() => null) };
}
function lerPedidosDoFormulario() {
  const para = podeEditarAgenda() && dataDoPedido !== DATA ? `${DATA} ${dataDoPedido}` : null;
  if (para === lidosPara) return;
  lidosPara = para;
  if (para) lerDeOutraData(dataDoPedido);
}
export async function pedidosDoFormulario(data) {
  if (data === DATA) {
    const daData = await solicitacoesDaDataLidas();
    // Outra data pode ter aberto durante a espera
    if (daData.data === data) return daData.lista;
  }
  if (deOutraData.data !== data) lerDeOutraData(data);
  return deOutraData.leitura;
}
// Depois de registrar: os pedidos da data em que ele entrou são lidos de novo (deste: o pedido registrado, que não é
// novidade)
export async function lerPedidosDaAgenda(data, deste = []) {
  if (data !== DATA && data === dataDoPedido) lerDeOutraData(data);
  else await lerSolicitacoesDaData({ deste });
}

// O aviso das novidades da data aberta (a vigia, js/solicitacoes-da-data.js), para todos que veem os pedidos: o que mudou
// em outro computador e, para cada pedido cancelado cujo voo ainda está na escala (ele vai deixar a vaga), o 1º da lista de
// espera do horário dele, como a escala diz (F1h), sem os que esperam com o pedido já cancelado ou sem aprovação na lista
// lida agora (a escala ainda não foi refeita). Nada é posto na escala: quem dá a vaga é a escala refeita (N14). O aviso
// vem sem ninguém pedir: fica o tempo de ler (60 ms por letra, de 2,8 s a 20 s)
const duracaoDasNovidades = texto => Math.min(20000, Math.max(2800, texto.length * 60));
export function avisarDasNovidades(novidades, data) {
  const daEscala = data === DATA && dadosLidos;
  const lista = solicitacoesDaData().lista || [];
  const naoEspera = id => { const s = lista.find(x => x.id === id); return Boolean(s) && !solicitacaoAprovada(s); };
  const vagas = daEscala ? novidades.canceladas.flatMap(s => {
    const primeiro = primeiroDaListaDeEspera(s, estadoDaEscala(), RES, { naoEspera });
    return primeiro ? [{ aluno: s.aluno_nome, minuto: primeiro.minuto, primeiro: primeiro.aluno }] : [];
  }) : [];
  const texto = textoDasNovidades(novidades, { data: dataCurta(data), vagas });
  if (texto) showToast(texto, '', { duracao: duracaoDasNovidades(texto) });
}

// O nome lembrado neste computador ("Registrado por" do último pedido): também é quem aprova, retira a aprovação e
// cancela no modo local (sem contas)
export function lembradoRegistradoPor() {
  try {
    return localStorage.getItem(CHAVE_REGISTRADO_POR) || '';
  } catch {
    return '';
  }
}
export function lembrarRegistradoPor(nome) {
  try {
    localStorage.setItem(CHAVE_REGISTRADO_POR, nome);
  } catch {
    // Sem o armazenamento do navegador, o nome só não fica lembrado para o próximo pedido
  }
}

// O prazo da data do pedido: até as 13:00 do dia de operação anterior; a segunda, até sábado às 10:00
const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaDaSemana = iso => DIAS_DA_SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()];
function textoDoPrazo() {
  const prazo = prazoDaData(dataDoPedido);
  if (!prazo) return 'O aeroclube não opera aos domingos: não há escala nem pedidos.';
  const hoje = hojeEmSaoPaulo();
  const quando = prazo.dia === hoje ? 'hoje' : prazo.dia === somarDias(hoje, 1) ? `amanhã (${ddmm(prazo.dia)})` : `${diaDaSemana(prazo.dia)} (${ddmm(prazo.dia)})`;
  const dia = dataDoPedido === somarDias(hoje, 1) ? `amanhã (${ddmm(dataDoPedido)})` : `${diaDaSemana(dataDoPedido)} (${ddmm(dataDoPedido)})`;
  if (!prazoDaAgendaPermite(dataDoPedido)) {
    return `Prazo encerrado para ${ddmm(dataDoPedido)}: os pedidos iam até ${quando} às ${prazo.hora}.` +
      (podeUsarExcecao() ? ' Se for estritamente necessário, use a Exceção da Coordenação.' : '');
  }
  return `Pedidos para ${dia} até ${quando} às ${prazo.hora}.`;
}

// ——— A lista e o detalhe (o componente: js/views/mestre-detalhe.js, criado em js/eventos/agenda.js) ———

// A data aberta já passou: nenhum pedido dela é aprovado, retirado nem pede atenção
const dataPassada = () => DATA < hojeEmSaoPaulo();
// "às 11:00" (hoje, em São Paulo); "em 09/11 11:00" (outro dia)
const aHora = instante => {
  const texto = quando(instante);
  return texto.slice(0, 5) === ddmm(hojeEmSaoPaulo()) ? `às ${texto.slice(6)}` : `em ${texto}`;
};
// O aluno do pedido no cadastro: null (fora do cadastro), ou inativo de hoje em diante
const alunoDoPedido = p => stuBy(p.aluno) || null;
const alunoAtivo = p => { const s = alunoDoPedido(p); return Boolean(s) && !inativoNaDataAberta(s); };
// O pedido que quem aprova pode aprovar agora: aguardando, numa data de hoje em diante, de um aluno ativo no cadastro
const aprovavel = p => situacaoDaSolicitacao(p) === 'aguardando' && aprovaPedidos() && !dataPassada() && alunoAtivo(p);

// Onde o pedido está na demanda da data aberta (até o G): só de hoje em diante, com os dados lidos. O aprovado: "Na demanda",
// "Tirado da demanda" (o Voa desligado ou "Limpar demanda") ou "Fora da demanda"; o que aguarda ou foi cancelado e ainda voa:
// "Ainda na demanda"
function naDemanda(p) {
  if (dataPassada() || !dadosLidos) return '';
  const onde = situacaoNaDemanda(p, S), situacao = situacaoDaSolicitacao(p);
  if (situacao !== 'aprovada') return onde === 'voa' ? 'Ainda na demanda' : '';
  return { voa: 'Na demanda', tirada: 'Tirado da demanda', fora: 'Fora da demanda' }[onde];
}
// Os aprovados fora da demanda que "Importar" traz (sem os de aluno fora do cadastro ou inativo, que esperam) e os que
// aguardam ou foram cancelados e ainda voam na demanda
const foraDaDemanda = lista => solicitacoesParaImportar(lista, S).filter(alunoAtivo);
const aindaNaDemanda = lista => lista.filter(p => situacaoDaSolicitacao(p) !== 'aprovada' && situacaoNaDemanda(p, S) === 'voa');
// O que a conciliação ("Tirar da escala", "Importar") faria agora com o voo do pedido cancelado ou sem a aprovação que ainda
// voa (js/processamento.js, porQueOVooFica, com a data aberta e o agora de São Paulo): null, ele sai; senão, por que fica
export function porQueOVooDoPedidoFica(p) {
  const { data: hoje, minuto: agora } = agoraEmSaoPaulo();
  return porQueOVooFica(S, p.id, { data: DATA, hoje, agora });
}
// "fica na escala: com o status Cancelado" ou "fica até o status ser conferido: atrasado"
export const comoOVooFica = porque => (PEDEM_CONFERIR.includes(porque) ? `fica até o status ser conferido: ${POR_QUE_FICA[porque]}` : `fica na escala: ${POR_QUE_FICA[porque]}`);

// O estado do pedido, com quem e quando (a lista: a hora; o detalhe: o dia e a hora)
function textoDaSituacao(p, comDia = false) {
  const em = instante => (comDia ? `em ${quando(instante)}` : aHora(instante));
  const situacao = situacaoDaSolicitacao(p);
  if (situacao === 'cancelada') return `Cancelado por ${p.cancelada_por} em ${quando(p.cancelada_em)}`;
  if (situacao === 'aprovada') return `Aprovado por ${p.aprovada_por || 'Operador'} ${em(p.aprovada_em)}`;
  if (dataPassada()) return 'Sem aprovação';
  return comDia ? 'Aguardando aprovação' : p.aprovacao_retirada_em
    ? `Aprovação retirada por ${p.aprovacao_retirada_por || 'Operador'} ${aHora(p.aprovacao_retirada_em)}` : `Registrado por ${p.registrado_por} ${aHora(p.registrado_em)}`;
}

const duracaoDoPedido = p => fmtH(p.horas === null || p.horas === undefined ? 1 : +p.horas);
const GRUPOS = [
  { id: 'aguardando', titulo: 'Aguardando aprovação', de: 'aguardando' },
  { id: 'aprovados', titulo: 'Aprovados', de: 'aprovada' },
  { id: 'cancelados', titulo: 'Cancelados', de: 'cancelada' }
];
// O pedido que acabou de ser registrado (a linha fica marcada e à vista)
let recente = null;
export function marcarRecente(id) { recente = id; }

// A linha de um pedido: o aluno; a missão (o código da missão do curso), o recurso, a duração e a 2ª preferência; a 1ª, à
// direita; quem registrou, aprovou ou cancelou, e onde ele está na demanda. O que aguarda tem o ponto e, para quem aprova,
// "Aprovar"; o cancelado fica esmaecido
function itemDoPedido(p) {
  const situacao = situacaoDaSolicitacao(p), aluno = alunoDoPedido(p);
  const extras = [p.excecao ? 'Exceção da Coordenação' : '', naDemanda(p), !aluno ? 'Aluno fora do cadastro' : inativoNaDataAberta(aluno) ? 'Aluno inativo' : ''];
  const espera = situacao === 'aguardando' && !dataPassada();
  return {
    id: p.id,
    titulo: p.aluno_nome,
    linha2: [missaoDoPedido(p), duracaoDoPedido(p), p.horario2 ? `2ª ${p.horario2}` : ''].filter(Boolean).join(' · '),
    meta: p.horario || '—',
    linha3: [textoDaSituacao(p), ...extras].filter(Boolean).join(' · '),
    ponto: espera ? 'aviso' : '', pontoRotulo: espera ? 'aguardando aprovação' : '',
    apagado: situacao === 'cancelada',
    grupo: GRUPOS.find(g => g.de === situacao).id,
    ...(aprovavel(p) ? { acao: { texto: 'Aprovar', rotulo: `Aprovar o pedido de ${p.aluno_nome} (${descreverPedido(p)})`, atributos: `data-act="aprovar-pedido" data-id="${p.id}"` } } : {}),
    atributos: `data-pedido="${p.id}"${recente === p.id ? ' data-recente' : ''}`,
    busca: [p.aluno_nome, p.missao, codigoDaMissaoDoCurso(p)].filter(Boolean)
  };
}
// Na ordem do dia: a 1ª preferência, depois a ordem do registro
const naOrdem = (a, b) => (a.horario || '').localeCompare(b.horario || '') || (a.registrado_em || '').localeCompare(b.registrado_em || '') || a.id - b.id;

// O modelo da lista (js/lista.js): os grupos por estado, com quantos tem cada um
export function modeloDosPedidos() {
  const { lista, leitura } = solicitacoesDaData();
  if (!lista) {
    const falhou = leitura === 'erro';
    return {
      fixos: [], grupos: [], itens: [], estado: falhou ? 'falhou' : 'lendo', tentar: () => lerSolicitacoesDaData(),
      textoDoEstado: falhou ? 'Não foi possível ler os pedidos desta data. Verifique a conexão.' : 'Lendo os pedidos desta data…'
    };
  }
  const itens = [...lista].sort(naOrdem).map(itemDoPedido);
  const grupos = GRUPOS.map(g => ({ id: g.id, titulo: g.titulo, resumo: String(itens.filter(i => i.grupo === g.id).length) }));
  return { fixos: [], grupos, itens, estado: 'pronto' };
}

// O detalhe de um pedido (null: não está na lista da data aberta), só de leitura: o pedido (a missão e a missão do curso, o
// recurso, as preferências, a duração e a observação), a situação (quem registrou, aprovou, retirou a aprovação ou
// cancelou, e quando) e, nesta data, onde ele está na demanda e os outros pedidos do aluno. As ações, embaixo
export function detalheDoPedido(id) {
  const p = pedidoDaLista(id);
  if (!p) return null;
  const situacao = situacaoDaSolicitacao(p);
  const leitura = (campo, rotulo, texto) => ({ id: campo, rotulo, tipo: 'leitura', texto: texto || '—' });
  const pedido = [
    leitura('data', 'Data', dataPorExtenso(p.data)),
    leitura('missao', 'Missão', p.missao),
    leitura('missao-do-curso', 'Missão do curso', codigoDaMissaoDoCurso(p)),
    leitura('recurso', 'Recurso', recursoValido(p) || p.recurso),
    leitura('horario', '1ª preferência', p.horario || disponibilidade(p)),
    leitura('horario2', '2ª preferência', p.horario2),
    leitura('horas', 'Duração', duracaoDoPedido(p)),
    leitura('observacao', 'Observação', p.observacao)
  ];
  const conta = p.conta && p.conta !== p.registrado_por ? ` (conta: ${p.conta})` : '';
  const quem = [
    leitura('situacao', 'Situação', textoDaSituacao(p, true)),
    leitura('registrado', 'Registrado por', `${p.registrado_por} em ${quando(p.registrado_em)}${conta}`),
    ...(p.excecao ? [leitura('excecao', 'Fora do prazo', 'Exceção da Coordenação')] : []),
    ...(p.limite_confirmado_por ? [leitura('limite', '7º voo local', `confirmado por ${p.limite_confirmado_por} em ${quando(p.limite_confirmado_em)}`)] : []),
    ...(p.aprovacao_retirada_em ? [leitura('retirada', 'Aprovação retirada', `por ${p.aprovacao_retirada_por || 'Operador'} em ${quando(p.aprovacao_retirada_em)}`)] : [])
  ];
  const outros = (solicitacoesDaData().lista || []).filter(o => o.id !== p.id && o.aluno === p.aluno && !o.cancelada_em);
  const demanda = naDemanda(p) || (dataPassada() || !dadosLidos ? '' : 'Fora da demanda');
  const nestaData = [
    ...(demanda ? [leitura('demanda', 'Demanda', demanda)] : []),
    leitura('outros', 'Outros pedidos', outros.map(descreverPedido).join('; ') || 'nenhum')
  ];
  const id_ = `data-id="${p.id}"`;
  const rodape = [
    ...(aprovavel(p) ? [{ id: 'aprovar', texto: 'Aprovar pedido', rotulo: `Aprovar o pedido de ${p.aluno_nome}`, atributos: `data-act="aprovar-pedido" ${id_}`, soEdicao: true }] : []),
    ...(situacao === 'aprovada' && aprovaPedidos() && !dataPassada()
      ? [{ id: 'retirar', texto: 'Retirar aprovação', rotulo: `Retirar a aprovação do pedido de ${p.aluno_nome}`, atributos: `data-act="retirar-aprovacao" ${id_}`, soEdicao: true }] : []),
    ...(situacao !== 'cancelada' && podeEditarAgenda() && !(situacao === 'aprovada' && dataPassada())
      ? [{ id: 'cancelar', texto: 'Cancelar pedido', rotulo: `Cancelar o pedido de ${p.aluno_nome}`, atributos: `data-act="cancelar-pedido" ${id_} data-agenda-acao` }] : []),
    ...(podeEditarAgenda() ? [{ id: 'repetir', texto: 'Registrar de novo…', rotulo: `Registrar de novo o pedido de ${p.aluno_nome}`, atributos: `${id_} data-agenda-acao` }] : [])
  ];
  // O voo do pedido já na escala de hoje, ou na escala aprovada: cancelar o pedido não é o caminho para o aluno que desistiu
  const comVoo = situacao !== 'cancelada' && situacaoNaDemanda(p, S) === 'voa' && (S.aprovacao || DATA === hojeEmSaoPaulo());
  return {
    id: p.id,
    titulo: p.aluno_nome,
    subtitulo: `${descreverPedido(p)} · ${{ aguardando: dataPassada() ? 'Sem aprovação' : 'Aguardando aprovação', aprovada: 'Aprovado', cancelada: 'Cancelado' }[situacao]}`,
    aviso: comVoo ? 'Este pedido tem voo na escala. Se o aluno desistiu ou o voo não vai sair, marque o voo como Cancelado na Escala: ele fica na escala, com o motivo. Cancelar o pedido é para um pedido registrado por engano.' : '',
    secoes: [
      { id: 'pedido', titulo: 'Pedido', icone: 'i-calendario', campos: pedido },
      { id: 'situacao', titulo: 'Situação', icone: 'i-certo', campos: quem },
      ...(dataPassada() ? [] : [{ id: 'nesta-data', titulo: 'Nesta data', icone: 'i-andamento', campos: nestaData }])
    ],
    rodape
  };
}

// "Aprovar todos (N)": os que aguardam e quem aprova pode aprovar, entre os que a busca mostra
export function aprovaveisNaBusca() {
  const busca = chaveDeBusca(($('[data-flt="age"]') || {}).value || '');
  const lista = (solicitacoesDaData().lista || []).filter(aprovavel);
  return { ids: lista.filter(p => !busca || itemDoPedido(p).busca.some(t => chaveDeBusca(t).includes(busca))).map(p => p.id), filtrando: Boolean(busca) };
}
function desenharAprovarTodos() {
  const botao = $('#agenda-aprovar-todos');
  const { ids, filtrando } = aprovaveisNaBusca();
  botao.hidden = !ids.length || !aprovaPedidos() || dataPassada();
  const texto = filtrando ? `Aprovar os filtrados (${ids.length})` : `Aprovar todos (${ids.length})`;
  if (botao.textContent !== texto) botao.textContent = texto;
}

// Os avisos da lista, nesta ordem: a leitura que falhou (com a lista da leitura de antes); a escala desta data que mudou em
// outro computador ("Atualizar": nada mais é dito da demanda até lá); os aprovados fora da demanda ("Importar", para quem
// importa); os que aguardam ou foram cancelados e ainda voam na demanda ("Tirar da escala", para quem importa: a conciliação)
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function desenharAvisos() {
  const { lista, leitura, lidaEm, diaMudou } = solicitacoesDaData();
  const partes = [];
  if (leitura === 'erro' && lista) {
    partes.push(`<p>Não foi possível ler os pedidos de novo: a lista é a lida ${esc(aHora(lidaEm))}. <button type="button" class="btn quiet" id="agenda-tentar">Tentar de novo</button></p>`);
  }
  if (diaMudou) {
    partes.push('<p>A escala desta data mudou em outro computador. <button type="button" class="btn quiet" id="agenda-atualizar-data">Atualizar</button></p>');
  } else if (lista && !dataPassada() && dadosLidos) {
    const fora = foraDaDemanda(lista).length;
    if (fora) {
      partes.push(`<p>${plural(fora, 'pedido aprovado', 'pedidos aprovados')} fora da demanda.${podeImportar()
        ? ` <button type="button" class="btn" id="agenda-importar" data-act="importar-agenda" aria-label="Importar ${plural(fora, 'pedido aprovado', 'pedidos aprovados')} para a demanda">Importar</button>` : ''}</p>`);
    }
    const ainda = aindaNaDemanda(lista);
    if (ainda.length) {
      // "Tirar da escala": a conciliação (E, a mesma de "Importar"), que tira o voo de quem saiu e dá a vaga ao 1º da lista de
      // espera do horário que couber nela. Só o cancelado e o de aprovação retirada saem: o que nunca foi aprovado e voa (de
      // antes da aprovação, D1) fica. O voo que a conciliação deixa (em voo, pousado, com o status Cancelado, com resultado;
      // o atrasado ou que já decolou, até o status ser conferido) não conta para o botão, que nada faria: o aviso diz por
      // que ele fica
      const fica = new Map(ainda.filter(p => p.cancelada_em || p.aprovacao_retirada_em).map(p => [p.id, porQueOVooDoPedidoFica(p)]));
      const saem = [...fica.values()].filter(porque => porque === null).length;
      const doPedido = p => `${p.aluno_nome} (${descreverPedido(p)}${fica.get(p.id) ? ` · ${comoOVooFica(fica.get(p.id))}` : ''})`;
      partes.push(`<p>${plural(ainda.length, 'pedido cancelado ou sem aprovação ainda está', 'pedidos cancelados ou sem aprovação ainda estão')} na demanda: ${esc(ainda.map(doPedido).join('; '))}.${podeImportar() && saem
        ? ` <button type="button" class="btn" id="agenda-conciliar" data-act="importar-agenda" aria-label="Tirar da escala ${saem === 1 ? 'o pedido cancelado ou sem aprovação' : `os ${saem} pedidos cancelados ou sem aprovação`}">Tirar da escala</button>` : ''}</p>`);
    }
  }
  const html = partes.join('');
  const lugar = $('#agenda-aviso');
  lugar.hidden = !html;
  if (lugar.innerHTML !== html) trocarConteudo(lugar, html);
}

// O formulário: o aluno decide as missões (as do curso dele; sem curso, os tipos de missão), a missão decide os recursos, e
// os dois, os horários. O campo com um valor só o recebe sozinho (data-sozinho): ele não é uma escolha da pessoa, e não
// fica para a missão seguinte. O horário escolhido que espera a lista (a missão ou o recurso ainda por escolher, ou a
// missão de um horário só) volta quando ela o tem; quando ela não o tem, o campo diz por que ele saiu. O campo diz também
// quando o horário posto pelo app sai ou dá lugar a outro, e quantos horários a lista tem
let horarioEscolhido = '';
let avisoDoHorario = '';
// A lista do campo "Fase / missão" (missoesDoAluno do aluno escolhido; null enquanto o aluno não é escolhido) e o que a
// pessoa tinha escolhido quando o aluno saiu do campo (a missão, o recurso, o horário e o nome da missão): o próximo aluno
// cuja lista tem a missão a recebe; o que não a tem a perde, e o campo diz (avisoDaMissao)
let missoesDoCampo = null;
let guardada = null;
let recursoQueEspera = '';
let avisoDaMissao = '';
// A missão cuja duração está no campo "Duração (h)": a duração só muda quando a missão muda de verdade
let missaoDaDuracao = '';

// Os programas dos cursos lidos com a data (S.programa); null quando não foram lidos ou esperam a conversão do cadastro
const programaDaAgenda = () => (['cursos', 'cursos-pendentes'].some(dadoIndisponivel) ? null : S.programa || []);
const missoesDaLista = lista => (lista ? lista.grupos.flatMap(g => g.missoes) : []);

// A missão do campo: o valor (o id da missão do curso ou o tipo), o tipo de missão e a missão do curso (null: um tipo)
export function missaoEscolhida() {
  const valor = $('#ag-missao').value;
  const doCurso = missoesDaLista(missoesDoCampo).find(m => m.id === valor) || null;
  return { valor, tipo: doCurso ? doCurso.mis : valor, doCurso };
}
// O nome da escolha num texto: o código da missão do curso, ou o tipo
const nomeDaEscolha = (lista, valor) => (missoesDaLista(lista).find(m => m.id === valor) || { codigo: valor }).codigo;

// As opções só mudam quando são outras: o redesenho não mexe no campo que a pessoa está usando. valores: os valores, ou
// [valor, texto] ou [valor, texto, desligada] (o que as limitações do aluno não deixam: na lista, sem poder escolher)
const opcoesComDesligadas = (opcoes, valor) => opcoes.map(([v, t, desligada]) => `<option value="${esc(v)}"${String(v) === String(valor) ? ' selected' : ''}${desligada ? ' disabled' : ''}>${esc(t)}</option>`).join('');
const opcoesDoCampo = campo => [...campo.options].map(o => [o.value, o.text, o.disabled]);
function preencher(campo, valores, vazio, valor, escolhido) {
  const opcoes = [...(vazio ? [['', vazio]] : []), ...valores.map(v => (Array.isArray(v) ? v : [v, v]))].map(([v, t, d]) => [v, t, Boolean(d)]);
  if (JSON.stringify(opcoes) !== JSON.stringify(opcoesDoCampo(campo))) campo.innerHTML = opcoesComDesligadas(opcoes, valor);
  campo.value = valor;
  if (valor && valor !== escolhido) campo.dataset.sozinho = '1';
  else delete campo.dataset.sozinho;
}
const escolhaDaPessoa = campo => (campo.dataset.sozinho ? '' : campo.value);
// O valor que fica: o escolhido, se a lista o tem; o único da lista; senão, nenhum
const valorNaLista = (lista, escolhido) => (lista.includes(escolhido) ? escolhido : lista.length === 1 ? lista[0] : '');
const mudarTexto = (el, texto) => { if (el.textContent !== texto) el.textContent = texto; };

// As opções do campo da missão: sem aluno, a espera; com as missões do curso, um grupo por fase; sem elas, os tipos
let missoesDesenhadas = null;
function opcoesDaMissao(campo, lista, valor) {
  const html = !lista ? '<option value="">Escolha antes o aluno…</option>'
    : '<option value="">Escolha a missão…</option>' + (lista.grupos.length
      ? lista.grupos.map(g => `<optgroup label="${esc(g.fase)}">${g.missoes.map(m => `<option value="${esc(m.id)}" data-codigo="${esc(m.codigo)}">${esc(m.texto)}</option>`).join('')}</optgroup>`).join('')
      : Object.keys(MIS).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''));
  if (missoesDesenhadas !== html || campo.options.length === 0) { campo.innerHTML = html; missoesDesenhadas = html; }
  campo.value = valor;
}

// A missão espera o aluno. Saindo o aluno, a escolha fica guardada para o próximo; trocando de aluno, ela fica quando a
// lista dele a tem, e sai (com o recurso e o horário) quando não tem, com o aviso
function atualizarMissao() {
  const campo = $('#ag-missao'), aluno = stuBy(+$('#ag-aluno').value) || null;
  if (!aluno) {
    if (missoesDoCampo) {
      guardada = { missao: campo.value, nome: nomeDaEscolha(missoesDoCampo, campo.value), recurso: escolhaDaPessoa($('#ag-recurso')),
        horario: escolhaDaPessoa($('#ag-horario')) || horarioEscolhido, horario2: $('#ag-horario2').value || segundaQueEspera };
      horarioEscolhido = '';
      missoesDoCampo = null;
    }
    opcoesDaMissao(campo, null, '');
    campo.disabled = true;
    mudarTexto($('#ag-missao-motivo'), '');
    return;
  }
  const lista = missoesDoAluno(aluno, programaDaAgenda());
  const antes = guardada ? guardada.missao : campo.value;
  const nomeAntes = guardada ? guardada.nome : nomeDaEscolha(missoesDoCampo, antes);
  const valores = lista.grupos.length ? missoesDaLista(lista).map(m => m.id) : Object.keys(MIS);
  const fica = valores.includes(antes) ? antes : '';
  opcoesDaMissao(campo, lista, fica);
  campo.disabled = false;
  if (antes && !fica) {
    avisoDaMissao = `${nomeAntes} não está entre as missões de ${aluno.nm}: escolha a missão.`;
    $('#ag-recurso').value = '';
    delete $('#ag-recurso').dataset.sozinho;
    $('#ag-horario').value = '';
    $('#ag-horario2').value = '';
    horarioEscolhido = '';
    recursoQueEspera = '';
    segundaQueEspera = '';
  } else if (guardada && fica) {
    recursoQueEspera = guardada.recurso;
    horarioEscolhido = guardada.horario;
    segundaQueEspera = guardada.horario2;
  }
  guardada = null;
  missoesDoCampo = lista;
  mudarTexto($('#ag-missao-motivo'), [avisoDaMissao, lista.motivo].filter(Boolean).join(' '));
  if (campo.value !== missaoDaDuracao) aplicarDuracaoDaMissao();
}

// As limitações do aluno escolhido na data do pedido (L: os horários do dia da semana dela), ou null
const limitacoesDoAluno = () => { const aluno = stuBy(+$('#ag-aluno').value); return aluno ? limitacoesNaData(aluno.limitacoes, dataDoPedido) : null; };

// Os recursos ativos de um tipo (a sala de Ground sempre está); o tipo sem nenhum é oferecido, com o aviso. O tipo em que o
// aluno não voa (L) vem desligado, com o porquê; a missão do curso num deles oferece os tipos que o tipo dela permite e o
// aluno voa, e continua a mesma (R7)
const temAtivo = tipo => tipo === GROUND_EQ_TYPE || (S.frota || []).some(f => f.tipo === tipo && !inativo(f));
function atualizarRecurso() {
  const campo = $('#ag-recurso'), { valor, tipo, doCurso } = missaoEscolhida();
  const limitacoes = limitacoesDoAluno();
  const fora = t => motivoDoTipo(limitacoes, t);
  const tipos = doCurso ? (fora(doCurso.eq) ? recursosDaMissao(doCurso.mis) : [doCurso.eq]) : recursosDaMissao(tipo), escolhido = escolhaDaPessoa(campo) || recursoQueEspera;
  const livres = tipos.filter(t => !fora(t));
  recursoQueEspera = '';
  preencher(campo, tipos.map(t => [t, `${temAtivo(t) ? t : `${t} (nenhum ativo)`}${fora(t) ? ` (${fora(t)})` : ''}`, Boolean(fora(t))]),
    livres.length === 1 ? null : !valor ? 'Escolha antes a missão…' : livres.length ? 'Escolha o recurso…' : 'Nenhum recurso em que o aluno voa',
    valorNaLista(livres, escolhido), escolhido);
  campo.disabled = !valor;
  const semAtivo = campo.value && !temAtivo(campo.value)
    ? `Nenhum ${campo.value} está ativo em Recursos: o pedido é registrado, e a escala só o põe num ${campo.value} ativo.` : '';
  const doPrograma = doCurso && campo.value && campo.value !== doCurso.eq && fora(doCurso.eq)
    ? `O programa faz ${doCurso.codigo} no ${doCurso.eq}, e ${fora(doCurso.eq)}: o pedido vai no ${campo.value}, e a missão continua ${doCurso.codigo}.` : '';
  mudarTexto($('#ag-recurso-motivo'), [doPrograma, semAtivo].filter(Boolean).join(' '));
}

// "8 horários do C152."; "Um horário só: 06:30."; com horários fora das limitações do aluno (L), "3 de 8 horários do C172: o
// aluno só voa das 13:00 às 18:00."
const doRecurso = recurso => (recurso === GROUND_EQ_TYPE ? `da ${recurso}` : `do ${recurso}`);
function contagemDosHorarios(lista, recurso, livres, motivo) {
  if (livres.length === lista.length) return lista.length === 1 ? `Um horário só: ${lista[0]}.` : `${lista.length} horários ${doRecurso(recurso)}.`;
  if (lista.length === 1) return `Um horário só, ${lista[0]}: ${motivo}.`;
  return `${livres.length ? `${livres.length} de` : 'Nenhum dos'} ${lista.length} horários ${doRecurso(recurso)}: ${motivo}.`;
}
// Os horários da lista (HH:MM) fora das limitações do aluno (L), com o porquê: { fora(h), motivo }
function horariosForaDoAluno() {
  const limitacoes = limitacoesDoAluno();
  const minutos = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  return { fora: h => !inicioPermitido(limitacoes, minutos(h)), motivo: motivoDoHorario(limitacoes) };
}

function atualizarHorario() {
  const campo = $('#ag-horario'), aluno = $('#ag-aluno').value, { tipo: missao, doCurso } = missaoEscolhida(), recurso = $('#ag-recurso').value;
  const lista = missao && recurso ? horariosDaMissao(S.horarios, missao, recurso).map(hm) : [];
  const { fora, motivo } = horariosForaDoAluno();
  const livres = lista.filter(h => !fora(h));
  const doApp = campo.dataset.sozinho ? campo.value : '';
  const escolhido = escolhaDaPessoa(campo) || horarioEscolhido;
  const valor = valorNaLista(livres, escolhido);
  horarioEscolhido = livres.length > 1 || valor === escolhido ? '' : escolhido;
  // O horário do app que continua no campo não é dito de novo. Sem nenhum horário que sirva ao aluno (as limitações, L), o
  // campo não pede uma escolha que não existe: diz por quê
  if (lista.length && !(doApp && valor === doApp)) {
    const nenhum = !livres.length ? contagemDosHorarios(lista, recurso, livres, motivo) : '';
    if (escolhido && valor !== escolhido) {
      avisoDoHorario = lista.includes(escolhido) && fora(escolhido)
        ? `O horário ${escolhido} está fora das limitações do aluno (${motivo})${nenhum ? `, e nenhum dos horários ${doRecurso(recurso)} está nelas.` : `. ${valor ? `Agora é ${valor}.` : 'Escolha outro.'}`}`
        : `O horário ${escolhido} não é um dos de ${doCurso ? doCurso.codigo : missao} (${recurso}). ${valor ? `Agora é ${valor}.` : nenhum || 'Escolha outro.'}`;
    } else if (doApp) avisoDoHorario = valor ? `O horário agora é ${valor}.` : `O horário ${doApp} era o único da escolha anterior. ${nenhum || 'Escolha o horário.'}`;
  }
  preencher(campo, lista.map(h => [h, fora(h) ? `${h} (${motivo})` : h, fora(h)]), livres.length === 1 ? null : 'Escolha o horário…', valor, escolhido);
  campo.disabled = !(aluno && missao && recurso);
  const faltam = [!aluno && 'o aluno', !missao && 'a missão', !recurso && 'o recurso'].filter(Boolean);
  const texto = avisoDoHorario || (faltam.length ? `Antes, escolha ${emLista(faltam)}.` : contagemDosHorarios(lista, recurso, livres, motivo));
  mudarTexto($('#ag-horario-motivo'), texto);
}
export const emLista = itens => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens.join(''));

// A 2ª preferência (U1): outro horário exato, da mesma lista do recurso, sem a 1ª; opcional. Ela espera o aluno, a missão e o
// recurso, como a 1ª; a missão de um horário só (o Noturno, o Voo Solo) não tem. A escolhida que a lista nova não tem (outro
// recurso, a 1ª que passou a ser ela) sai, e o campo diz; a que espera a lista (sem o aluno, entre um pedido e outro) volta
// quando ela a tem
let segundaQueEspera = '';
let avisoDaSegunda = '';
function atualizarSegundaPreferencia() {
  const campo = $('#ag-horario2'), aluno = $('#ag-aluno').value, { tipo: missao, doCurso } = missaoEscolhida(), recurso = $('#ag-recurso').value;
  const lista = missao && recurso ? horariosDaMissao(S.horarios, missao, recurso).map(hm) : [];
  const primeira = $('#ag-horario').value;
  const opcoes = opcoesDaSegundaPreferencia(lista, primeira, missao);
  // Os horários fora das limitações do aluno (L): na lista, desligados, com o porquê
  const { fora, motivo } = horariosForaDoAluno();
  const escolhida = campo.value || segundaQueEspera;
  const fica = opcoes.includes(escolhida) && !fora(escolhida) ? escolhida : '';
  // Nenhuma opção que sirva ao aluno (as limitações): o campo fica desligado, e diz por quê
  const algumaServe = opcoes.some(h => !fora(h));
  if (!lista.length) segundaQueEspera = escolhida;
  else {
    segundaQueEspera = '';
    if (escolhida && !fica && opcoes.length) {
      const depois = algumaServe ? 'escolha outra, se houver' : 'sem 2ª preferência nesta data';
      avisoDaSegunda = escolhida === primeira ? `A 2ª preferência era ${escolhida}, agora a 1ª: ${depois}.`
        : opcoes.includes(escolhida) && fora(escolhida) ? `A 2ª preferência ${escolhida} está fora das limitações do aluno (${motivo}): ${depois}.`
          : `A 2ª preferência ${escolhida} não é um dos horários de ${doCurso ? doCurso.codigo : missao} (${recurso}): ${depois}.`;
    }
  }
  const itens = [['', '—', false], ...opcoes.map(h => [h, fora(h) ? `${h} (${motivo})` : h, fora(h)])];
  if (JSON.stringify(itens) !== JSON.stringify(opcoesDoCampo(campo))) campo.innerHTML = opcoesComDesligadas(itens, fica);
  campo.value = fica;
  campo.disabled = !(aluno && missao && recurso) || !algumaServe;
  const texto = !(aluno && missao && recurso) ? '' : !opcoes.length ? 'Um horário só: sem 2ª preferência.'
    : avisoDaSegunda || (algumaServe ? 'Opcional: outro horário, se o da 1ª não couber.' : `Sem 2ª preferência: ${motivo}.`);
  mudarTexto($('#ag-horario2-motivo'), texto);
}

// As missões do aluno, os recursos e os horários do recurso escolhido, como estão agora no cadastro (o que ainda vale fica)
export function atualizarRecursoEHorario() {
  atualizarMissao();
  atualizarRecurso();
  atualizarHorario();
  atualizarSegundaPreferencia();
}

// Uma escolha nova (o aluno, a missão, o recurso ou um dos horários): os avisos da missão e dos horários que saíram eram da
// anterior
export function escolherNaAgenda() {
  avisoDoHorario = '';
  avisoDaMissao = '';
  avisoDaSegunda = '';
  atualizarRecursoEHorario();
}

// Os horários que mudaram no cadastro com a Agenda aberta (o "↶ Reverter" do Histórico, por exemplo): só eles são refeitos
export function rHorariosDoPedido() {
  if ($('#ag-missao').options.length) atualizarRecursoEHorario();
}

// Depois de registrar, saem o aluno e a observação; a missão, o recurso e o horário do pedido esperam o próximo aluno, e o
// horário escolhido antes dele não vale mais
export function esvaziarPedidoRegistrado() {
  $('#ag-obs').value = '';
  $('#ag-aluno').value = '';
  horarioEscolhido = '';
  escolherNaAgenda();
}

// A duração da missão: a fixa (o Ground, 01h30; o Noturno, 4 h no dia: o translado e o noturno em BH), sem edição; a da
// missão do curso; a padrão do tipo (o simulador, 2 h); saindo de uma delas, volta a 1 h
function aplicarDuracaoDaMissao() {
  const { valor, tipo, doCurso } = missaoEscolhida();
  missaoDaDuracao = valor;
  const padrao = doCurso ? doCurso.nb : Object.hasOwn(MIS, tipo) && MIS[tipo].duracaoPadrao;
  const horas = $('#ag-horas');
  const fixa = duracaoFixaDaMissao(tipo);
  if (fixa) { horas.dataset.antes = horas.dataset.antes || horas.value; horas.value = String(fixa); horas.disabled = true; }
  else if (horas.disabled) { horas.value = horas.dataset.antes || '1'; delete horas.dataset.antes; horas.disabled = false; }
  if (!fixa && padrao) { horas.value = String(padrao); horas.dataset.padrao = '1'; }
  else if (!fixa && horas.dataset.padrao) { horas.value = '1'; delete horas.dataset.padrao; }
}

// A missão nova: a duração dela, os recursos e os horários
export function escolherMissaoNaAgenda() {
  aplicarDuracaoDaMissao();
  escolherNaAgenda();
}

// A data do pedido, o prazo dela e os botões: registrar, até o prazo; a exceção, depois dele, de quem opera a escala
function desenharFormulario() {
  const hoje = hojeEmSaoPaulo();
  const { opcoes, padrao } = datasParaRegistrar(hoje, DATA, { excecao: podeUsarExcecao() });
  const antes = dataDoPedido;
  if (abertaDoCampo !== DATA || !opcoes.some(o => o.data === dataDoPedido)) dataDoPedido = padrao;
  abertaDoCampo = DATA;
  if (dataDoPedido !== antes) mudouADataDoPedido();
  lerPedidosDoFormulario();
  const campo = $('#ag-data');
  const html = opts(opcoes.map(o => [o.data, rotuloDaOpcao(o, hoje)]), dataDoPedido);
  // Iguais, as opções ficam (a lista pode estar aberta)
  if (opcoesDesenhadas !== html) { campo.innerHTML = html; opcoesDesenhadas = html; }
  campo.value = dataDoPedido;
  $('#agenda-prazo').textContent = textoDoPrazo();
  mudarTexto($('#agenda-titulo'), `Novo pedido para ${dataCurta(dataDoPedido)}`);
  // Até o prazo: "Registrar e aprovar" e "Registrar sem aprovar" (quem aprova) ou "Registrar pedido" (a secretaria); depois
  // dele, só a Exceção da Coordenação, de quem opera a escala (o pedido nasce aprovado)
  const aberto = prazoDaAgendaPermite(dataDoPedido);
  $('#form-agenda [type="submit"]').disabled = !aberto;
  $('#ag-registrar').hidden = !aprovaPedidos();
  $('#ag-registrar').disabled = !aberto;
  $('#ag-excecao').hidden = aberto || !podeUsarExcecao();
  nomearRegistrar();
}

// A data aberta da lista: outra data aberta, nada fica escolhido (o pedido escolhido é da data de antes)
let dataDaLista = null;
export function mudouADataDaLista() {
  const mudou = dataDaLista !== null && dataDaLista !== DATA;
  dataDaLista = DATA;
  return mudou;
}

// O desenho da tela fora do componente: a data, a barra, os avisos e o formulário
export function rAgenda() {
  if (!agendaAberta || !DATA) return;
  mudarTexto($('#agenda-data'), dataPorExtenso(DATA));
  desenharAprovarTodos();
  desenharAvisos();

  // Formulário: a data, os alunos do cadastro, as missões, as preferências e quem anotou (lembrado neste computador)
  desenharFormulario();
  const aluno = $('#ag-aluno').value;
  $('#ag-aluno').innerHTML = `<option value="">Escolha o aluno…</option>` +
    [...S.stu].filter(s => !inativo(s)).sort((a, b) => a.nm.localeCompare(b.nm)).map(s => `<option value="${s.id}">${esc(s.nm)}</option>`).join('');
  $('#ag-aluno').value = aluno;
  if (!$('#ag-missao').options.length) $('#ag-por').value = lembradoRegistradoPor();
  // O aluno que saiu do cadastro (ou ficou inativo) sai do campo; os horários acompanham o cadastro
  if ($('#ag-aluno').selectedIndex < 0) $('#ag-aluno').value = '';
  atualizarRecursoEHorario();
}

// "Registrar de novo…": o formulário com os campos do pedido (o aluno, a missão do curso ou o tipo, o recurso, as
// preferências, a duração e a observação) e com a data dele, quando ela ainda aceita pedidos; o pedido novo é outro pedido
// (outro id, sem o que o operador pôs no de antes). O que a lista de agora não tem fica de fora, como numa escolha da pessoa;
// as duas preferências que ela não tem saem com o aviso de cada campo, como quando a missão ou o recurso mudam
export function preencherComOPedido(p) {
  const { opcoes } = datasParaRegistrar(hojeEmSaoPaulo(), DATA, { excecao: podeUsarExcecao() });
  if (opcoes.some(o => o.data === p.data && !o.fechada) && p.data !== dataDoPedido) escolherDataDoPedido(p.data);
  const escolher = (id, valor) => { const campo = $(id); campo.value = valor ?? ''; delete campo.dataset.sozinho; escolherNaAgenda(); };
  escolher('#ag-aluno', String(p.aluno));
  const doCurso = p.missao_do_curso && [...$('#ag-missao').options].some(o => o.value === p.missao_do_curso);
  $('#ag-missao').value = doCurso ? p.missao_do_curso : p.missao;
  escolherMissaoNaAgenda();
  escolher('#ag-recurso', p.recurso);
  // As preferências esperam como a escolha da pessoa: a lista que as tem as recebe; a que não tem diz que saíram
  for (const id of ['#ag-horario', '#ag-horario2']) { $(id).value = ''; delete $(id).dataset.sozinho; }
  horarioEscolhido = p.horario || '';
  segundaQueEspera = p.horario2 || '';
  escolherNaAgenda();
  if (!$('#ag-horas').disabled && p.horas !== null && p.horas !== undefined) $('#ag-horas').value = String(+p.horas);
  $('#ag-obs').value = p.observacao || '';
  apagarErroDaAgenda();
}

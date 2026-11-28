// Agenda de solicitações da secretaria: a regra do prazo (a mesma do servidor, no horário de São Paulo), as datas em que um
// pedido pode ser registrado, as missões que o pedido do aluno pode ter (as do curso dele), as regras do registro, o limite
// de voos locais e o pedido da demanda que cada solicitação vira ao ser importada (a importação: js/processamento.js).
import { MIS, MISSOES_LOCAIS, LIMITE_DE_VOOS_LOCAIS, GROUND_DURATION_H, DURACAO_MAXIMA_H } from './config.js';
import { disponibilidadeAtual, minutosExatos, normalizeMissionFields, duracaoPadraoDaMissao, duracaoFixaDaMissao } from './rules.js';
import { horariosDaMissao, preferenciasPadrao, paraMinuto, HORARIO_DO_SOLO, HORARIO_DO_NOTURNO } from './horarios.js';
import { percursoDoCurso, noturnosDoCurso, rotuloDaMissao } from './programa.js';
import { hm, fmtH, somarDias } from './format.js';

export const FUSO_DO_AEROCLUBE = 'America/Sao_Paulo';


// Data (AAAA-MM-DD) e hora (HH:MM) de um instante no horário de São Paulo
function emSaoPaulo(instante) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_DO_AEROCLUBE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instante).map(p => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export const hojeEmSaoPaulo = (agora = new Date()) => emSaoPaulo(agora).data;
// A data e o minuto do dia em São Paulo ({ data, minuto }): o hoje e o agora com que a conciliação (E) decide se o voo do
// pedido que sai já decolou (js/processamento.js, ficaNaEscala)
export function agoraEmSaoPaulo(agora = new Date()) {
  const { data, hora } = emSaoPaulo(agora);
  return { data, minuto: Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) };
}

// O aeroclube não opera aos domingos
export const ehDomingo = iso => new Date(iso + 'T12:00:00Z').getUTCDay() === 0;

// O prazo para os pedidos de uma data: até as 13:00 do dia de operação anterior; a segunda, até sábado às 10:00 (o
// domingo não opera). Domingo não recebe pedido. Devolve { dia, hora } (São Paulo) ou null (domingo)
export function prazoDaData(data) {
  if (ehDomingo(data)) return null;
  const anterior = somarDias(data, ehDomingo(somarDias(data, -1)) ? -2 : -1);
  return { dia: anterior, hora: new Date(anterior + 'T12:00:00Z').getUTCDay() === 6 ? '10:00' : '13:00' };
}

export function prazoDaAgendaPermite(data, agora = new Date()) {
  const prazo = prazoDaData(data);
  if (!prazo) return false;
  const { data: hoje, hora } = emSaoPaulo(agora);
  return hoje < prazo.dia || (hoje === prazo.dia && hora < prazo.hora);
}

export const primeiraDataAberta = (agora = new Date()) => {
  const { data: hoje } = emSaoPaulo(agora);
  let data = somarDias(hoje, 1);
  while (!prazoDaAgendaPermite(data, agora)) data = somarDias(data, 1);
  return data;
};

// As datas em que um pedido pode ser registrado ("Data do pedido"): os dias de operação (sem domingo) de hoje (São Paulo) a
// 14 dias, e a data aberta, quando é mais adiante. Com a exceção da Coordenação, também as que já fecharam (fechada); sem
// ela, só as abertas. padrao: a data aberta, se ela está na lista e aceita pedidos; senão, a primeira que aceita
export function datasParaRegistrar(hoje, dataAberta, { excecao = false, agora = new Date() } = {}) {
  const datas = Array.from({ length: 15 }, (_, i) => somarDias(hoje, i));
  if (dataAberta && dataAberta > datas.at(-1)) datas.push(dataAberta);
  const opcoes = datas.filter(data => !ehDomingo(data)).map(data => ({ data, fechada: !prazoDaAgendaPermite(data, agora) })).filter(o => excecao || !o.fechada);
  const aberta = opcoes.find(o => o.data === dataAberta);
  return { opcoes, padrao: aberta && !aberta.fechada ? aberta.data : primeiraDataAberta(agora) };
}

// O horário exato do pedido (jan): o da linha ("horario"), e com a 2ª preferência (horario2, D1; U1), os dois
// ("h500|h610", o 1º primeiro). Sem o 1º (um período de antes, um horário fora dos exatos do dia), nenhum; o 2º que não
// vale (o mesmo, fora dos exatos do dia) fica de fora
export function disponibilidadeDaSolicitacao({ janela, horario, horario2 = null }) {
  if (janela !== 'horario') return disponibilidadeAtual(janela);
  const [m1, m2] = [paraMinuto(horario), paraMinuto(horario2)];
  if (m1 === null) return undefined;
  return (m2 !== null && disponibilidadeAtual(`h${m1}|h${m2}`)) || disponibilidadeAtual(`h${m1}`);
}

// O recurso do pedido (o tipo: C152, PA-34, Sim. Mono…): os que a missão permite, e o formato em que o servidor o guarda
// (a migração agenda_com_recurso). O pedido de antes não tem recurso, e o que a missão não permite não vale: null nos dois
export const RECURSO_DO_PEDIDO = /^[A-Za-z0-9]([A-Za-z0-9 .-]{0,28}[A-Za-z0-9])?$/;
export const recursosDaMissao = missao => (Object.hasOwn(MIS, missao) ? MIS[missao].eq : []);
export const recursoValido = ({ missao, recurso }) => (recursosDaMissao(missao).includes(recurso) ? recurso : null);

// As missões que o pedido do aluno pode ter (N8): as do programa do curso dele (programa: os cursos lidos, S.programa;
// null, quando não foram lidos), uma lista por fase, na ordem do programa: as que estão nele e não são dispensadas, e o
// Noturno de dois dias pela noite (os translados voam com ela). Nada da próxima missão conta (a ordem, a aprovação, o "já
// voada"): uma missão voada continua na lista, e o progresso desligado não muda nada. Cada missão: o id, o código, o
// tipo, o recurso, as horas (as fixas do tipo, no Ground e no Noturno) e o texto, "NAV-150NM · Navegação · C152 · 3 h".
// Sem curso, com o curso encerrado, fora dos programas ou sem missões, e sem os programas lidos, nenhuma (grupos vazio):
// o campo oferece os tipos de missão, e motivo diz por quê
export function missoesDoAluno(aluno, programa) {
  const tipos = motivo => ({ curso: null, grupos: [], motivo: `${motivo}: escolha o tipo da missão.` });
  const sigla = aluno && aluno.curso;
  if (!sigla) return tipos('Aluno sem curso');
  if (!Array.isArray(programa)) return tipos('Os programas dos cursos não foram lidos');
  const curso = programa.find(c => c.sigla === sigla);
  if (!curso) return tipos(`O curso ${sigla} não está nos programas dos cursos`);
  if (curso.ativo === false) return tipos(`O curso ${sigla} está encerrado`);
  const { fases, porFase } = percursoDoCurso(curso);
  const doNoturno = noturnosDoCurso(curso);
  const oferecida = m => !m.dispensada && (!doNoturno.has(m.id) || doNoturno.get(m.id).noite.id === m.id);
  const grupos = fases.map(f => ({
    fase: f.nome,
    missoes: porFase.get(f.id).filter(oferecida).map(m => {
      const nb = duracaoFixaDaMissao(m.mis) || m.nb;
      return { id: m.id, codigo: m.codigo, mis: m.mis, eq: m.eq, nb, texto: `${rotuloDaMissao(curso, m)} · ${m.mis} · ${m.eq} · ${fmtH(nb)}` };
    })
  })).filter(g => g.missoes.length);
  if (!grupos.length) return tipos(`O curso ${sigla} não tem missões no programa`);
  return { curso, grupos, motivo: null };
}

// As regras do pedido na função de 13 argumentos (a migração missao_do_curso_e_limite_do_pedido), depois de quem pode, do
// horário específico e da duração, e antes do limite de voos locais e do prazo. As três cópias delas (o modo local, o
// servidor falso e o cliente falso dos testes) passam pelos casos de test/helpers/casos-da-agenda.js, que o banco também
// tem. Os horários fixos: o Noturno sai às 17:30 e o Voo Solo, às 06:30 (os de horariosDaMissao)
export const HORARIOS_FIXOS = Object.freeze({ Noturno: hm(HORARIO_DO_NOTURNO), 'Voo Solo': hm(HORARIO_DO_SOLO) });

// A missão do curso pelo id, nos cursos guardados (o formato de programa_do_curso: as fases e as missões, também as
// retiradas): { curso, missao, retirada } (retirada: ela ou a fase dela saiu do programa); null, quando não há
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function missaoDoCursoGuardada(cursos, id) {
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  for (const curso of Array.isArray(cursos) ? cursos : []) {
    const missao = (curso.missoes || []).find(m => m.id === id);
    if (!missao) continue;
    const fase = (curso.fases || []).find(f => f.id === missao.fase);
    return { curso, missao, retirada: missao.removida === true || Boolean(fase && fase.removida === true) };
  }
  return null;
}

// A recusa do pedido (horas: as que o servidor guarda, o Ground já com 1,5 h), com o código, o campo (a dica do servidor)
// e a mensagem; null, quando passa:
// - o recurso é obrigatório e é um dos que a missão permite, com as horas (public.missao_e_recurso_validos);
// - o Noturno e o Voo Solo saem nos horários fixos deles;
// - a missão do curso, quando há uma, existe, está no programa e é do tipo do pedido (o recurso dela e o curso do aluno
//   não são comparados: são do cadastro, e uma limitação do aluno pode trocar o recurso)
export function recusaDoPedido({ missao, recurso, horario, horas, missaoDoCurso = null }, cursos = []) {
  const tipo = typeof recurso === 'string' ? recurso.trim() : '';
  const recusa = (campo, mensagem) => ({ code: '22023', campo, mensagem });
  if (!tipo) return recusa('recurso', 'o pedido precisa do recurso');
  const permitido = Object.hasOwn(MIS, missao) && MIS[missao].eq.includes(tipo) && (!MIS[missao].isGround || horas === GROUND_DURATION_H)
    && horas > 0 && horas <= DURACAO_MAXIMA_H;
  if (!permitido) return recusa('recurso', `a missão ${missao} não é feita no ${tipo} com essas horas`);
  if (Object.hasOwn(HORARIOS_FIXOS, missao) && horario !== HORARIOS_FIXOS[missao]) return recusa('horario', `${missao} sai sempre às ${HORARIOS_FIXOS[missao]}`);
  if (missaoDoCurso !== null && missaoDoCurso !== undefined) {
    const doCurso = missaoDoCursoGuardada(cursos, missaoDoCurso);
    if (!doCurso || doCurso.retirada || doCurso.missao.mis !== missao) {
      return recusa('missao', 'a missão do curso não existe, saiu do programa ou é de outro tipo');
    }
  }
  return null;
}

// A 2ª preferência do pedido (U1, a migração aprovacao_dos_pedidos): outro horário exato, HH:MM e diferente do 1º; o
// Noturno e o Voo Solo têm um horário só. A recusa (22023, horario2) ou null (sem 2ª preferência, ou válida)
export function recusaDaSegundaPreferencia({ missao, horario, horario2 = null }) {
  if (horario2 === null || horario2 === undefined) return null;
  if (typeof horario2 === 'string' && /^[0-2][0-9]:[0-5][0-9]$/.test(horario2) && horario2 !== horario && !Object.hasOwn(HORARIOS_FIXOS, missao)) return null;
  return { code: '22023', campo: 'horario2', mensagem: 'a 2ª preferência é outro horário específico (o Noturno e o Voo Solo têm um horário só)' };
}

// O domingo e a data que já passou (o dia de São Paulo) não recebem pedido, nem pela exceção da coordenação: a recusa
// (PT403, com o campo domingo ou passada) ou null
export function recusaDaData(data, agora = new Date()) {
  if (ehDomingo(data)) return { code: 'PT403', campo: 'domingo', mensagem: 'o aeroclube não opera aos domingos' };
  if (data < hojeEmSaoPaulo(agora)) return { code: 'PT403', campo: 'passada', mensagem: 'a data do pedido já passou' };
  return null;
}

// A conversão dos pedidos de antes da aprovação (a do banco, aprovar_solicitacoes_de_antes_da_aprovacao, para o modo local):
// cada pedido ganha as colunas da aprovação e da 2ª preferência (vazias), e fica aprovado o que não foi cancelado nem teve
// a aprovação retirada e (a) foi importado ("importadas" do dia dele: numa data que já passou, sempre; de hoje em diante, só
// quando um registro do aluno, o pedido principal ou uma missão extra, ainda o leva), por "importação anterior"; ou (b) de
// hoje em diante, não foi importado, por quem anotou (o modo local não tem contas: quem usa tem os direitos de operador).
// O pedido que já tem as colunas da aprovação foi registrado depois do passo D1 e fica como está.
// diaDe(data): o dia guardado (null: nenhum); hoje: a data de São Paulo; agora: o instante (ISO)
export function aprovarAsDeAntesDaAprovacao(lista, diaDe, { hoje, agora }) {
  const vazias = { horario2: null, aprovada_em: null, aprovada_por: null, aprovacao_retirada_em: null, aprovacao_retirada_por: null };
  return lista.map(s => {
    if (Object.hasOwn(s, 'aprovada_em')) return s;
    const linha = { ...vazias, ...s };
    if (linha.cancelada_em || linha.aprovada_em || linha.aprovacao_retirada_em) return linha;
    const { importada, regraA } = pelaImportacao(linha, diaDe, hoje);
    if (regraA) return { ...linha, aprovada_em: agora, aprovada_por: 'importação anterior' };
    if (!importada && linha.data >= hoje) return { ...linha, aprovada_em: agora, aprovada_por: linha.registrado_por };
    return linha;
  });
}

// A regra (a) da conversão: o pedido está em "importadas" do dia dele (importada) e conta como aprovado pela importação
// (regraA): numa data que já passou, sempre; de hoje em diante, só quando um registro do aluno (o pedido principal ou uma
// missão extra) ainda o leva
function pelaImportacao(linha, diaDe, hoje) {
  const dia = diaDe(linha.data);
  const importada = Boolean(dia) && Array.isArray(dia.importadas) && dia.importadas.includes(linha.id);
  const registro = importada && dia.pedidos && dia.pedidos[linha.aluno];
  const levada = Boolean(registro) && (registro.solicitacao === linha.id || (Array.isArray(registro.extra) && registro.extra.some(e => e && e.solicitacao === linha.id)));
  return { importada, regraA: importada && (linha.data < hoje || levada) };
}

// A regra (a) de novo (G2: a migração 20261129100100_importados_ja_aprovados, aprovar_solicitacoes_de_antes_da_aprovacao
// (false), para o modo local): o que uma aba de antes do D2 importou depois da conversão do D1 e ainda aguarda fica aprovado
// por "importação anterior", também com as colunas da aprovação; o cancelado, o aprovado e o de aprovação retirada ficam
export function aprovarOsImportadosDeNovo(lista, diaDe, { hoje, agora }) {
  return lista.map(s => {
    if (s.cancelada_em || s.aprovada_em || s.aprovacao_retirada_em) return s;
    return pelaImportacao(s, diaDe, hoje).regraA ? { ...s, aprovada_em: agora, aprovada_por: 'importação anterior' } : s;
  });
}

// O pedido na página Pedidos (D2). Três estados, das colunas: cancelado, aprovado ou aguardando aprovação (a aprovação
// retirada volta a aguardar)
export const situacaoDaSolicitacao = s => (s.cancelada_em ? 'cancelada' : s.aprovada_em ? 'aprovada' : 'aguardando');
export const solicitacaoAprovada = s => situacaoDaSolicitacao(s) === 'aprovada';

// O resumo da data (o cartão Pedidos): os registrados (sem os cancelados), os aprovados e os que aguardam e pedem atenção
// (pedeAtencao: o pedido que alguém pode aprovar; o do aluno inativo ou fora do cadastro, que Pedidos não aprova, não)
export function resumoDasSolicitacoes(lista, pedeAtencao = () => true) {
  const resumo = { registradas: 0, aguardando: 0, aprovadas: 0 };
  for (const s of lista || []) {
    const situacao = situacaoDaSolicitacao(s);
    if (situacao === 'cancelada') continue;
    resumo.registradas++;
    if (situacao === 'aprovada') resumo.aprovadas++;
    else if (pedeAtencao(s)) resumo.aguardando++;
  }
  return resumo;
}

// O registro do dia que leva o pedido (o principal do aluno ou uma missão extra dele, com solicitacao = o id): null
function registroDaSolicitacao(estado, s) {
  const aluno = (estado.stu || []).find(x => x.id === s.aluno);
  if (!aluno) return null;
  return [aluno, ...(aluno.extra || [])].find(p => p && p.solicitacao === s.id) || null;
}

// Onde o pedido está na demanda da data (até o G, que a concilia): 'fora' (nunca importado), 'voa' (importado, e um registro
// que voa o leva) ou 'tirada' (importado, sem registro que voe: o Voa desligado, ou o registro que "Limpar demanda" tirou)
export function situacaoNaDemanda(s, estado) {
  if (!(estado.importadas || []).includes(s.id)) return 'fora';
  const registro = registroDaSolicitacao(estado, s);
  return registro && registro.fly ? 'voa' : 'tirada';
}

// O que mudou nos pedidos da data entre duas leituras (D3): os novos (não cancelados), os aprovados, os que voltaram a
// aguardar (a aprovação retirada) e os cancelados, cada pedido uma vez, pelo estado dele agora. O que saiu da leitura (não
// acontece: um pedido não muda de data) não é novidade. deste: os ids que este navegador acabou de mudar (o aviso dele já
// disse), fora das novidades
export function novidadesDasSolicitacoes(antes, depois, { deste = [] } = {}) {
  const deAntes = new Map((antes || []).map(s => [s.id, situacaoDaSolicitacao(s)]));
  const novidades = { novas: [], aprovadas: [], semAprovacao: [], canceladas: [] };
  for (const s of depois || []) {
    if (deste.includes(s.id)) continue;
    const era = deAntes.get(s.id), e = situacaoDaSolicitacao(s);
    if (era === e) continue;
    if (era === undefined) { if (e !== 'cancelada') novidades.novas.push(s); }
    else if (e === 'cancelada') novidades.canceladas.push(s);
    else if (e === 'aprovada') novidades.aprovadas.push(s);
    else novidades.semAprovacao.push(s);
  }
  return novidades;
}
export const temNovidades = novidades => Object.values(novidades).some(l => l.length > 0);

// O aviso das novidades: "Pedidos de qua 11/11: 1 novo, 1 cancelado." (data: o rótulo curto da data) e, para cada voo de
// pedido cancelado que deixa a vaga com uma lista de espera (vagas: { aluno, minuto, primeiro }), o 1º dela, sem dizer que
// ele fica com a vaga: quem dá a vaga é a escala refeita (N14). Sem novidades, ''
export function textoDasNovidades({ novas, aprovadas, semAprovacao, canceladas }, { data, vagas = [] }) {
  const n = (lista, um, varios) => (lista.length ? [`${lista.length} ${lista.length === 1 ? um : varios}`] : []);
  const partes = [
    ...n(novas, 'novo', 'novos'), ...n(aprovadas, 'aprovado', 'aprovados'),
    ...n(semAprovacao, 'voltou a aguardar aprovação', 'voltaram a aguardar aprovação'), ...n(canceladas, 'cancelado', 'cancelados')
  ];
  if (!partes.length) return '';
  const espera = vagas.map(v => ` A vaga de ${v.aluno} às ${hm(v.minuto)} fica livre quando o voo sair da escala; 1º na lista de espera: ${v.primeiro}.`);
  return `Pedidos de ${data}: ${partes.join(', ')}.${espera.join('')}`;
}

// "Importar": os aprovados que nunca entraram na demanda da data
export const solicitacoesParaImportar = (lista, estado) => (lista || []).filter(s => solicitacaoAprovada(s) && situacaoNaDemanda(s, estado) === 'fora');

// Os pedidos de cada dia do trilho, da contagem do servidor (solicitacoes_por_dia: { data: { aguardando, aprovadas } }): os
// que aguardam e os aprovados; o domingo não tem número
export function contagemPorDia(resposta) {
  const contagem = {};
  for (const [data, n] of Object.entries(resposta || {})) {
    const total = ((n && n.aguardando) || 0) + ((n && n.aprovadas) || 0);
    if (total && !ehDomingo(data)) contagem[data] = total;
  }
  return contagem;
}

// O aprovado entra na demanda na hora só com as cinco condições: a data dele é a aberta; os dados dela foram lidos; ela já
// tem escala gravada (a aprovação nunca cria a data: as horas até a revisão e as filas do rodízio ficariam congeladas cedo
// demais); os resultados e os cursos foram lidos (sem eles a missão do curso não é ligada); a escala não mudou em outro
// computador. Sem uma delas, o motivo ('outra-data', 'nao-lida', 'nao-gravada', 'dados', 'mudou'), e "Importar" o traz
const SEM_ELES_NAO_ENTRA = ['resultados', 'cursos', 'cursos-pendentes'];
export function motivoSemEntrada({ data, aberta, lida, gravada, indisponiveis = [], mudou = false }) {
  if (data !== aberta) return 'outra-data';
  if (!lida) return 'nao-lida';
  if (!gravada) return 'nao-gravada';
  if (indisponiveis.some(d => SEM_ELES_NAO_ENTRA.includes(d))) return 'dados';
  if (mudou) return 'mudou';
  return null;
}

// A 2ª preferência do formulário: os outros horários da lista do recurso (sem a 1ª); a missão de um horário só (o Noturno, o
// Voo Solo) não tem
export const opcoesDaSegundaPreferencia = (lista, primeira, missao) =>
  (Object.hasOwn(HORARIOS_FIXOS, missao) ? [] : lista.filter(h => h !== primeira));

// As preferências e o horário exato do pedido, na lista de decolagens do recurso dele (lista): o jan da linha
// (disponibilidadeDaSolicitacao) e, como preferências, os horários exatos dele que a lista tem, na ordem do pedido (U1: a
// 1ª e a 2ª; com um só, ele duas vezes); sem nenhum na lista, as padrão dela (o horário exato fica: N14, o motor o recusa)
export function preferenciasDaSolicitacao(solicitacao, lista) {
  const jan = disponibilidadeDaSolicitacao(solicitacao);
  const naLista = minutosExatos(jan).filter(m => lista.includes(m));
  const [p1, p2] = naLista.length ? [naLista[0], naLista[naLista.length - 1]] : preferenciasPadrao(lista);
  return { p1, p2, ...(jan ? { jan } : {}) };
}

// Pedido da demanda: a missão com o recurso do pedido (sem ele, o padrão da missão); como preferências, os dois primeiros horários dela que a
// disponibilidade permite (sem disponibilidade, os primeiros a partir das 08:20 e das 10:10); prioridade 3. Os horários
// são os da categoria do equipamento (o PA-34 tem os seus). As horas: as fixas da missão (o Ground, 01h30; o Noturno,
// 4 h); senão, as registradas na agenda; senão, as do programa do curso; senão, as padrão da missão (1 h; o simulador,
// 2 h). eq e nb: o recurso e as horas da missão do programa do curso (o recurso dela vale mais que o do pedido)
export function pedidoDaSolicitacao(solicitacao, horarios, { eq, nb } = {}) {
  const jan = disponibilidadeDaSolicitacao(solicitacao);
  const regra = Object.hasOwn(MIS, solicitacao.missao) ? MIS[solicitacao.missao] : MIS['Voo Local'];
  const equipamento = eq && regra.eq.includes(eq) ? eq : recursoValido(solicitacao) || regra.defEq;
  const { p1, p2 } = preferenciasDaSolicitacao(solicitacao, horariosDaMissao(horarios, solicitacao.missao, equipamento));
  const registradas = solicitacao.horas === null || solicitacao.horas === undefined ? null : +solicitacao.horas;
  const pedido = {
    fly: true, mis: solicitacao.missao, eq: equipamento,
    p1, p2, nb: registradas ?? nb ?? duracaoPadraoDaMissao(solicitacao.missao), ss: 1, pr: 3,
    ...(jan ? { jan } : {}),
    // O 7º voo local no horário confirmado na Agenda ("Registrar mesmo assim"): o motor o deixa passar do limite no minuto dele
    ...(solicitacao.limite_confirmado_por && solicitacao.limite_confirmado_em ? { limiteConfirmado: true } : {})
  };
  // A duração fixa da missão vale mais que as outras (normalizeMissionFields a impõe)
  normalizeMissionFields(pedido);
  return pedido;
}

// No máximo 6 voos locais (Voo Local, Voo Solo e TGL) saindo no mesmo horário (determinação da diretoria). Ao agendar
// mais um local num horário que já tem 6 (pedidos não cancelados da data), não há vaga: quantos já há (locais: mais de 6
// com o 7º confirmado) e o próximo horário possível, o primeiro mais tarde, entre os horários da missão no recurso do
// pedido (sem ele, no padrão dela), que ainda tem vaga (null: nenhum)
export function vagaDeVooLocal(pedidos, { data, horario, missao, recurso }, horarios) {
  if (!MISSOES_LOCAIS.includes(missao)) return { ok: true };
  const noHorario = h => pedidos.filter(p => p.data === data && !p.cancelada_em && p.janela === 'horario' && p.horario === h && MISSOES_LOCAIS.includes(p.missao)).length;
  const locais = noHorario(horario);
  if (locais < LIMITE_DE_VOOS_LOCAIS) return { ok: true };
  const regra = Object.hasOwn(MIS, missao) ? MIS[missao] : MIS['Voo Local'];
  const depois = horariosDaMissao(horarios, missao, recursoValido({ missao, recurso }) || regra.defEq).map(hm).filter(h => h > horario);
  return { ok: false, locais, proximo: depois.find(h => noHorario(h) < LIMITE_DE_VOOS_LOCAIS) || null };
}

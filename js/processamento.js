// O processamento dos pedidos da agenda (E, G2): a conciliação dos pedidos da data com o dia (quem entra, quem volta, quem
// sai e quem fica, e as missões do curso que o programa passou), a missão do curso com que cada pedido entra, o resumo do
// que ela fez, o quadro do Processamento (a situação de cada pedido e de cada voo sem pedido), o "Pôr de volta na escala"
// e "Recomeçar pelos pedidos". Quem chama é js/conciliacao.js ("Atualizar a escala" e as ações de Pedidos) e a tela do
// Processamento. Puro: sem DOM, sem relógio, sem rede e sem S; recebe o estado da data e os pedidos e muda só o estado
import { migrateLegacyMissionName, alvoDoNovoPedido, proximoMid, blank, deixarEmBranco, PRIORIDADE_PADRAO, minutosExatos } from './rules.js';
import { pedidoDaSolicitacao, recursoValido, missaoDoCursoGuardada } from './agenda.js';
import { indiceDoPrograma } from './programa.js';
import { proximasMissoes, missoesDoDia } from './progresso.js';
import { situacaoPorMissao, situacaoDa, resultadoDoVoo } from './resultados.js';
import { chaveDoVoo, pedidoDoAluno } from './voo.js';
import { fixoPeloStatus, pinoDoVoo, fixosAoReabrir } from './fixos.js';
import { inativo } from './inativos.js';
import { intervaloEfetivo, STATUS_EM_ANDAMENTO } from './status.js';
import { minutoDaPreferencia, paraMinuto, horariosDaMissao } from './horarios.js';
import { rejeicoesDosPedidos } from './rejeicoes.js';
import { hm } from './format.js';
import { FORA_DA_ESCALA, ONDE_RESOLVER } from './conflitos.js';
import { nomeDoRecurso } from './categorias.js';

// Os pedidos de um aluno no dia: o principal (o próprio aluno, mid 0) e as missões extras
const pedidosDoAluno = aluno => [aluno, ...(Array.isArray(aluno.extra) ? aluno.extra : [])];

// O horário do pedido no dia, em minutos: o do voo fixo; senão, o 1º minuto exato do pedido; senão, a 1ª preferência;
// senão, null (desconhecido)
function horarioPedido(estado, stuId, registro) {
  const pino = (estado.fixos || {})[chaveDoVoo(stuId, registro.mid || 0)];
  if (pino && Number.isInteger(pino.a)) return pino.a;
  const [exato] = minutosExatos(registro.jan);
  if (exato !== undefined) return exato;
  const p1 = minutoDaPreferencia(registro.p1);
  return p1 >= 0 ? p1 : null;
}

// Por que o voo de um pedido que sai (cancelado ou sem a aprovação) fica na escala, nesta ordem; null: ele sai.
// 'data-passada' (a data já passou: nada sai de uma escala voada); 'sem-os-resultados' (sem eles, não se sabe se o voo tem
// resultado); 'atrasado'; 'em-voo-ou-pousou'; 'cancelado-na-escala' (o status Cancelado, com o motivo); 'com-resultado';
// 'ja-decolou' (hoje, o voo fixo cujo início já passou, agora em minutos do dia). 'atrasado' e 'ja-decolou' pedem que o
// operador confira (o status Pousou ou Cancelado); os outros ficam
export function ficaNaEscala(estado, { data = null, hoje = null, agora = null } = {}, stuId, mid) {
  const fKey = chaveDoVoo(stuId, mid);
  const status = (estado.fStatus || {})[fKey];
  if (data && hoje && data < hoje) return 'data-passada';
  if ((estado.indisponiveis || []).includes('resultados')) return 'sem-os-resultados';
  if (status === 'Atrasado') return 'atrasado';
  if (status === 'Em Voo' || status === 'Pousou') return 'em-voo-ou-pousou';
  if (status === 'Cancelado') return 'cancelado-na-escala';
  if (resultadoDoVoo((estado.resultados || {}).doDia, fKey) !== null) return 'com-resultado';
  const pino = (estado.fixos || {})[fKey];
  if (data && data === hoje && Number.isInteger(agora) && pino && intervaloEfetivo(pino, status, (estado.fObs || {})[fKey]).a <= agora) return 'ja-decolou';
  return null;
}

// O porquê de ficaNaEscala em palavras, para os avisos (o de Pedidos, o do cancelamento, o da retirada e o da conciliação)
export const POR_QUE_FICA = {
  'data-passada': 'a data já passou', 'sem-os-resultados': 'sem os resultados dos cursos lidos', atrasado: 'atrasado',
  'em-voo-ou-pousou': 'em voo ou pousado', 'cancelado-na-escala': 'com o status Cancelado', 'com-resultado': 'com o resultado registrado',
  'ja-decolou': 'já decolou'
};
// Os porquês que pedem que o operador confira o status (o voo fica até lá)
export const PEDEM_CONFERIR = ['atrasado', 'ja-decolou'];

// O que a conciliação faria com o voo do pedido (id) que sai, cancelado ou com a aprovação retirada, sem mudar nada:
// null, ele sai; senão, o porquê de ficaNaEscala (momento: { data, hoje, agora }). O pedido sem registro que voa: undefined
export function porQueOVooFica(estado, id, momento = {}) {
  const achado = registrosDosPedidos(estado).get(id);
  if (!achado || !achado.registro.fly) return undefined;
  return ficaNaEscala(estado, momento, achado.aluno.id, achado.mid);
}

// O registro de cada pedido no dia (o pedido do aluno com solicitacao: <id>): Map do id para { aluno, registro, mid }
function registrosDosPedidos(estado) {
  const mapa = new Map();
  for (const aluno of estado.stu || []) {
    for (const registro of pedidosDoAluno(aluno)) {
      if (Number.isInteger(registro.solicitacao) && !mapa.has(registro.solicitacao)) mapa.set(registro.solicitacao, { aluno, registro, mid: registro.mid || 0 });
    }
  }
  return mapa;
}

// O minuto pedido na Agenda (o horário exato da linha), para a ordem de entrada; sem ele, depois
const minutoDaLinha = s => (s.janela === 'horario' && paraMinuto(s.horario) !== null ? paraMinuto(s.horario) : Infinity);

// A conciliação dos pedidos da data com o dia: o plano, sem mudar nada. aprovada(linha) diz se o pedido está aprovado
// (obrigatório: o app passa solicitacaoAprovada, js/agenda.js). Para cada linha, com o
// registro do pedido no dia (o pedido do aluno com solicitacao: <id>), guardada (o id em estado.importadas):
// - aprovado, sem registro: entram (o aluno fora do cadastro: semAluno; inativo, com semInativos: inativos; guardado:
//   dispensados, tirado desta data; numa data passada: naoEntrou; com a missão do curso e os programas não lidos, cursos
//   null: esperamOsProgramas). Os que entram vão por aluno (a ordem do cadastro), pelo minuto pedido e pelo id: a missão
//   do curso de cada um é ligada nessa ordem (missaoDaEntrada), os com a que escolheram na Agenda primeiro;
// - aprovado, voando, não guardado: acertos.admitir (o id volta para importadas, sem linha no Histórico);
// - aprovado, sem voar, não guardado: voltam (o registro volta a voar); guardado, o operador o tirou da escala: nada;
// - cancelado ou com a aprovação retirada (aprovacao_retirada_em), voando: saem (motivo 'cancelado' ou 'sem-aprovacao'),
//   ou ficam / conferir com o porquê de ficaNaEscala; cancelado sem voar e guardado: acertos.esquecer;
// - esperando aprovação, voando: semAprovacao (nada muda); sem voar: nada.
// O registro de um pedido que não está nas linhas lidas nunca é tocado (faltar não é cancelar), nem o sem pedido.
// so: só estes ids (a ação feita agora neste navegador: o guardado, tirado pelo operador ou desta data, fica como está; o
// religar do D saiu no G2). data, hoje (AAAA-MM-DD) e agora (minutos do dia): os de ficaNaEscala; sem data, nenhuma regra
// de data passada. programa e situacao (os de missaoDaEntrada): sem o so, as missões do curso que o programa passou
// (missoes: missoesUltrapassadas). pendente: há o que aplicar (entram, voltam, saem ou missões para trocar)
export function conciliarPedidos(estado, solicitacoes, { data = null, hoje = null, agora = null, aprovada, so = null, cursos = [], semInativos = false, programa = [], situacao = [] } = {}) {
  if (typeof aprovada !== 'function') throw new Error('conciliarPedidos: falta aprovada, a regra do pedido aprovado');
  const plano = {
    entram: [], voltam: [], saem: [], ficam: [], conferir: [], semAprovacao: [], dispensados: [], semAluno: [], inativos: [], naoEntrou: [],
    esperamOsProgramas: [], missoes: [], acertos: { admitir: [], esquecer: [] }, pendente: false
  };
  const passada = Boolean(data && hoje && data < hoje);
  const guardadas = new Set(Array.isArray(estado.importadas) ? estado.importadas : []);
  const registros = registrosDosPedidos(estado);
  const vistos = new Set();
  for (const s of solicitacoes) {
    if (!s || !Number.isInteger(s.id) || vistos.has(s.id) || (so && !so.includes(s.id))) continue;
    vistos.add(s.id);
    const achado = registros.get(s.id) || null;
    const guardada = guardadas.has(s.id);
    const voa = Boolean(achado && achado.registro.fly);
    const cancelada = Boolean(s.cancelada_em);
    const doRegistro = achado ? { id: s.id, stuId: achado.aluno.id, mid: achado.mid } : null;
    if (!cancelada && aprovada(s)) {
      if (achado) {
        if (voa) { if (!guardada) plano.acertos.admitir.push(s.id); } else if (!guardada && !passada) plano.voltam.push(doRegistro);
        continue;
      }
      const aluno = (estado.stu || []).find(x => x.id === s.aluno);
      if (!aluno) plano.semAluno.push(s.id);
      else if (semInativos && inativo(aluno)) plano.inativos.push(s.id);
      else if (guardada) plano.dispensados.push(s.id);
      else if (passada) plano.naoEntrou.push(s.id);
      else if (cursos === null && s.missao_do_curso) plano.esperamOsProgramas.push(s.id);
      else plano.entram.push(s);
      continue;
    }
    const retirada = !cancelada && Boolean(s.aprovacao_retirada_em);
    if (cancelada || retirada) {
      if (voa) {
        const item = { ...doRegistro, motivo: cancelada ? 'cancelado' : 'sem-aprovacao' };
        const porque = ficaNaEscala(estado, { data, hoje, agora }, achado.aluno.id, achado.mid);
        if (PEDEM_CONFERIR.includes(porque)) plano.conferir.push({ ...item, porque });
        else if (porque) plano.ficam.push({ ...item, porque });
        else plano.saem.push(item);
      } else if (cancelada && guardada) plano.acertos.esquecer.push(s.id);
      continue;
    }
    if (voa) plano.semAprovacao.push(doRegistro);
  }
  const ordem = new Map((estado.stu || []).map((x, i) => [x.id, i]));
  plano.entram.sort((p, q) => (ordem.get(p.aluno) - ordem.get(q.aluno)) || (minutoDaLinha(p) - minutoDaLinha(q)) || (p.id - q.id));
  if (!so) plano.missoes = missoesUltrapassadas(estado, { programa, situacao, data, hoje });
  plano.pendente = plano.entram.length + plano.voltam.length + plano.saem.length + plano.missoes.length > 0;
  return plano;
}

// As missões do curso que o programa passou (G2): o voo de um pedido que entrou com a missão do programa (etapaDoPrograma,
// formato 30) e cuja missão já foi aprovada depois troca para a que o programa dá agora (missaoDaEntrada, no mesmo tipo e
// recurso). Fica o voo que já começou ou tem dono: com resultado na data, com o status Atrasado, Em Voo, Pousou ou
// Cancelado, agendado ou com o instrutor escolhido na Escala; e nada numa data passada ou sem os programas (programa
// vazio). As trocas de um aluno são vistas uma depois da outra, numa cópia dele com as de antes já feitas: dois voos dele
// nunca recebem a mesma missão (a regra 12). [{ stuId, mid, nome, de, para, curso }]
function missoesUltrapassadas(estado, { programa = [], situacao = [], data = null, hoje = null } = {}) {
  if (!programa.length || (data && hoje && data < hoje)) return [];
  const mapa = situacaoPorMissao(situacao);
  const doDia = (estado.resultados || {}).doDia || [];
  const trocas = [];
  for (const original of estado.stu || []) {
    if (!pedidosDoAluno(original).some(r => r.etapaDoPrograma === true)) continue;
    const aluno = structuredClone(original);
    for (const r of pedidosDoAluno(aluno)) {
      const mid = r.mid || 0, fKey = chaveDoVoo(aluno.id, mid);
      const pino = (estado.fixos || {})[fKey];
      if (!r.fly || r.etapaDoPrograma !== true || !r.etapa || resultadoDoVoo(doDia, fKey) !== null) continue;
      if ([...STATUS_EM_ANDAMENTO, 'Cancelado'].includes((estado.fStatus || {})[fKey]) || (pino && (pino.agendado || pino.escolhido))) continue;
      const curso = r.cursoDaEtapa || aluno.curso;
      if (situacaoDa(mapa, aluno.id, curso, r.etapa) !== 'aprovado') continue;
      const minuto = horarioPedido(estado, aluno.id, r);
      const comoPedido = { missao: r.mis, recurso: r.eq, janela: 'horario', horario: minuto === null ? null : hm(minuto) };
      const agora = missaoDaEntrada(estado, aluno, comoPedido, { programa, situacao, copiada: { ...r, etapa: null } });
      if (!agora.missao || agora.missao.codigo === r.etapa) continue;
      trocas.push({ stuId: aluno.id, mid, nome: aluno.nm, de: r.etapa, para: agora.missao.codigo, curso: agora.curso });
      Object.assign(r, { etapa: agora.missao.codigo }, agora.curso ? { cursoDaEtapa: agora.curso } : {});
    }
  }
  return trocas;
}

// O voo da mesma missão (mis) que está na demanda do aluno sem pedido da agenda (posto à mão: a demanda começa vazia a
// cada data): ele dá lugar ao pedido, para não duplicar. O voo fixo (agendado, aprovado ou com o instrutor escolhido na
// escala), o fixado pelo status (em andamento ou cancelado; também quando o cadeado saiu, como na aprovação com o Voa
// desligado) e o que já tem resultado na data ficam como estão. O Noturno fixo só pelo pino do Noturno (o que a gravação
// põe: js/fixos.js) dá lugar, e o pino fica com ele: o pedido da agenda passa a ser esse voo, na mesma chave, no avião e com
// o INVA dele. Com a missão do curso do pedido (vinculada: { codigo, sigla }), o voo com outra missão do curso também fica
// (o pedido entra como outro voo); o sem missão do curso dá lugar. Nenhum: null
const soPeloNoturno = (estado, pino) => Boolean(pino && pino.noturno && !pino.agendado && !pino.escolhido && !estado.aprovacao);
function vooQueDaLugar(estado, aluno, mis, vinculada = null) {
  const doDia = estado.resultados ? estado.resultados.doDia : [];
  const fixos = estado.fixos || {};
  const mesmaMissaoDoCurso = p => !vinculada || !p.etapa || (p.etapa === vinculada.codigo && (p.cursoDaEtapa || aluno.curso) === vinculada.sigla);
  return pedidosDoAluno(aluno).find(p => {
    const chave = chaveDoVoo(aluno.id, p.mid || 0);
    return p.fly && p.mis === mis && p.solicitacao === undefined && mesmaMissaoDoCurso(p)
      && (!Object.hasOwn(fixos, chave) || soPeloNoturno(estado, fixos[chave]))
      && !fixoPeloStatus(chave, estado.fStatus) && resultadoDoVoo(doDia, chave) === null;
  }) || null;
}

// A missão do curso que o pedido escolheu na Agenda (missao_do_curso), nos programas lidos (cursos: S.programa), quando ela
// continua no programa e é do tipo do pedido: { codigo, sigla, missao }. A que saiu do programa ou mudou de tipo depois do
// registro, ou que os programas lidos não têm, não vale (false); o pedido sem nenhuma: null
function missaoDoCursoDoPedido(cursos, solicitacao) {
  if (!solicitacao.missao_do_curso) return null;
  const achada = missaoDoCursoGuardada(cursos, solicitacao.missao_do_curso);
  if (!achada || achada.retirada || achada.missao.mis !== solicitacao.missao) return false;
  return { codigo: achada.missao.codigo, sigla: achada.curso.sigla, missao: achada.missao };
}

// A missão do curso com que o pedido entra no dia: { missao, curso, de, nota }, missao { codigo, eq, nb } (null: nenhuma),
// curso a sigla, de quem ela é ('pedido', 'operador', 'programa') e a nota de por que nenhuma:
// - a do pedido (missao_do_curso, a regra 8 da Agenda), qualquer que seja o progresso, nos programas lidos (cursos); a que
//   saiu do programa ou mudou de tipo não vale, e o pedido segue como o que não tem nenhuma (foraDoPrograma);
// - a que o operador pôs no voo que dá lugar ao pedido (copiada), com o recurso e as horas dele;
// - a do programa (programa: os cursos de onde inferir, vazio com o progresso desligado ou sem os resultados e os
//   programas lidos: 'sem-dados'): a primeira liberada do tipo do pedido e, com recurso, desse recurso (nenhuma:
//   'sem-missao-do-tipo'), pelo horário do dia: as missões dos outros voos do aluno no dia não são dadas de novo, e contam
//   como feitas só as dos que terminam até o início do pedido (feitasAntes). O curso encerrado não dá nenhuma
//   ('curso-encerrado'; a do operador e a do pedido, escolhas, ficam). Aluno sem curso:
//   'sem-curso'; o curso fora do programa: 'sem-programa'. situacao: o último resultado de cada missão
export function missaoDaEntrada(estado, aluno, solicitacao, { programa = [], situacao = [], cursos = [], copiada = null } = {}) {
  const vinculada = missaoDoCursoDoPedido(cursos || [], solicitacao);
  const foraDoPrograma = vinculada === false;
  if (vinculada) return { missao: { codigo: vinculada.codigo, eq: vinculada.missao.eq, nb: vinculada.missao.nb }, curso: vinculada.sigla, de: 'pedido', nota: null, foraDoPrograma };
  if (copiada && copiada.etapa) {
    return { missao: { codigo: copiada.etapa, eq: copiada.eq, nb: copiada.nb }, curso: copiada.cursoDaEtapa || null, de: 'operador', nota: null, foraDoPrograma };
  }
  const nenhuma = nota => ({ missao: null, curso: null, de: null, nota, foraDoPrograma });
  if (!aluno.curso) return nenhuma('sem-curso');
  if (!programa.length) return nenhuma('sem-dados');
  const curso = indiceDoPrograma(programa).curso(aluno.curso);
  if (!curso) return nenhuma('sem-programa');
  if (curso.ativo === false) return { ...nenhuma('curso-encerrado'), curso: curso.sigla };
  const mid = copiada ? copiada.mid || 0 : null;
  const exceto = missoesDoDia(curso, aluno, { fStatus: estado.fStatus, mid });
  const recurso = recursoValido(solicitacao);
  const m = proximasMissoes(curso, situacaoPorMissao(situacao), aluno.id, { planejadas: feitasAntes(estado, curso, aluno, mid, minutoDaLinha(solicitacao)), exceto })
    .candidatas.find(x => x.mis === solicitacao.missao && (!recurso || x.eq === recurso));
  if (!m) return { ...nenhuma('sem-missao-do-tipo'), curso: curso.sigla };
  return { missao: { codigo: m.codigo, eq: m.eq, nb: m.nb }, curso: curso.sigla, de: 'programa', nota: null, foraDoPrograma };
}

// As missões do curso dos outros voos do aluno no dia que contam como feitas para o pedido que começa em inicio (a regra
// 12 do desenho): as dos que voam, não cancelados, e terminam até esse minuto (o horário do voo: horarioPedido, mais a
// duração). O voo de horário desconhecido conta, e, sem o início do pedido, todos contam (a regra de antes). mid: o voo
// que dá lugar ao pedido (o dele não conta)
function feitasAntes(estado, curso, aluno, mid, inicio) {
  const todas = missoesDoDia(curso, aluno, { fStatus: estado.fStatus, mid });
  if (!Number.isFinite(inicio)) return todas;
  const porCodigo = new Map(curso.missoes.map(m => [m.codigo, m.id]));
  const depois = new Set(pedidosDoAluno(aluno).filter(p => {
    if (!p.fly || !p.etapa || (mid !== null && (p.mid || 0) === mid)) return false;
    const pino = (estado.fixos || {})[chaveDoVoo(aluno.id, p.mid || 0)];
    const a = horarioPedido(estado, aluno.id, p);
    const fim = pino && Number.isInteger(pino.b) ? pino.b : a === null ? null : a + Math.round((+p.nb || 0) * 60);
    return fim !== null && fim > inicio;
  }).map(p => porCodigo.get(p.etapa)));
  return new Set([...todas].filter(id => !depois.has(id)));
}

// O horário exato do pedido que a lista de decolagens do recurso com que ele entra não tem (o item 12 de "Left for
// Pedro"): o pedido sem recurso, com o da missão do programa, ou a lista mudada depois do registro. O minuto fica
function horarioForaDaLista(estado, solicitacao, eq) {
  const minuto = minutoDaLinha(solicitacao);
  return Number.isFinite(minuto) && !horariosDaMissao(estado.horarios, solicitacao.missao, eq).includes(minuto);
}

// O registro que recebe o pedido que entra, como alvoDoNovoPedido (js/rules.js), com a guarda da identidade (decisão 2
// do desenho): o principal que não voa mas é de outro pedido da agenda (solicitacao) não é dado a este, que vira uma
// missão extra nova; o registro de um pedido é o voo dele, também fora da escala
function alvoDaEntrada(estado, aluno) {
  if (aluno.fly || aluno.solicitacao === undefined) return alvoDoNovoPedido(estado, aluno);
  const extra = { mid: proximoMid(estado, aluno), ...blank(), pr: aluno.pr || PRIORIDADE_PADRAO };
  aluno.extra = [...(aluno.extra || []), extra];
  return extra;
}

// Um pedido entra no dia: o voo da mesma missão posto à mão dá lugar a ele (vooQueDaLugar); senão, ele vai para o pedido
// principal do aluno, quando ele não voa, não é de outro pedido e o dia não guarda nada dele, ou para uma missão extra
// nova (alvoDaEntrada).
// A missão do curso de missaoDaEntrada: a do pedido com o recurso e as horas do pedido (sem eles, os dela); a do operador
// e a do programa com o recurso dele (os horários e as preferências são os desse recurso) e as horas dele, as registradas
// na agenda valendo mais. O id do pedido vai para importadas. Devolve o que entrou
// alvo: o registro que recebe o pedido, no lugar de procurar um (o "Recomeçar pelos pedidos": o do próprio pedido, em
// branco, ou uma missão extra acima de todo número que o aluno tinha)
function entrar(estado, s, { programa, situacao, cursos }, alvo = null) {
  const aluno = estado.stu.find(x => x.id === s.aluno);
  if (!estado.importadas.includes(s.id)) estado.importadas.push(s.id);
  const vinculada = missaoDoCursoDoPedido(cursos || [], s) || null;
  const copiada = alvo ? null : vooQueDaLugar(estado, aluno, migrateLegacyMissionName(s.missao), vinculada);
  const entrada = missaoDaEntrada(estado, aluno, s, { programa, situacao, cursos, copiada });
  const recurso = recursoValido(s);
  const doCurso = !entrada.missao ? {} : entrada.de === 'pedido' ? { ...(recurso ? {} : { eq: entrada.missao.eq }), nb: entrada.missao.nb }
    : { eq: entrada.missao.eq, nb: entrada.missao.nb };
  const pedido = pedidoDaSolicitacao(s, estado.horarios, doCurso);
  // O horário exato da linha que o voo não guarda (fora dos horários exatos do dia, das 06:30 às 17:30: js/rules.js,
  // minutoExato; antes, as 06:00 que a lista de decolagens aceita, ou depois, as 18:00 que o servidor aceita): o pedido
  // entra sem ele, e o resumo diz; não está "fora da lista"
  const semOHorario = Number.isFinite(minutoDaLinha(s)) && !minutosExatos(pedido.jan).length;
  const foraDaLista = !semOHorario && horarioForaDaLista(estado, s, pedido.eq);
  // A missão do curso dada pelo programa leva a marca (etapaDoPrograma, formato 30): a do pedido e a do operador, não
  if (entrada.missao) Object.assign(pedido, { etapa: entrada.missao.codigo }, entrada.curso ? { cursoDaEtapa: entrada.curso } : {}, entrada.de === 'programa' ? { etapaDoPrograma: true } : {});
  pedido.solicitacao = s.id;
  let registro;
  if (copiada) {
    // O voo continua com o instrutor escolhido e a prioridade que o operador deu (com a prioridade desligada, o motor da
    // tela recebe a padrão: estadoDaEscala); a disponibilidade e a missão do curso passam a ser as do pedido
    const { pr } = copiada;
    for (const campo of ['jan', 'etapa', 'cursoDaEtapa', 'etapaDoPrograma', 'limiteConfirmado']) delete copiada[campo];
    registro = Object.assign(copiada, pedido, pr === undefined ? {} : { pr });
  } else registro = Object.assign(alvo || alvoDaEntrada(estado, aluno), pedido);
  return {
    id: s.id, stuId: aluno.id, mid: registro.mid || 0, novo: !copiada, etapa: registro.etapa || null,
    nota: entrada.nota || (foraDaLista ? 'horario-fora-da-lista' : semOHorario ? 'sem-o-horario' : null),
    ...(foraDaLista ? { foraDaLista: { missao: s.missao, recurso: registro.eq, horario: hm(minutoDaLinha(s)) } } : {}),
    ...(semOHorario ? { semOHorario: { missao: s.missao, recurso: registro.eq, horario: hm(minutoDaLinha(s)) } } : {}),
    ...(entrada.foraDoPrograma ? { foraDoPrograma: { missao: s.missao, entrouComo: registro.etapa || null } } : {}),
    ...(entrada.nota === 'sem-missao-do-tipo' ? { semMissao: { missao: s.missao, ...(recurso ? { recurso } : {}) } } : {})
  };
}

// Os pedidos que esperam um horário cheio, na escala de antes (estado: o que o motor leu; resultado: o que ele devolveu):
// os recusados só por lugar nesse horário (o limite de locais, os aviões ou os instrutores ocupados) que têm horário
// exato, na ordem do motor; o minuto é o 1º do pedido e o lugar, a posição entre os que esperam o mesmo minuto. A espera
// que o motor marca no alerta (espera: { minuto, lugar }, do F1h) vale mais
const RECUSAS_POR_LUGAR = ['limite-de-locais', 'avioes-ocupados', 'instrutores-ocupados'];
function listaDeEspera(estado, resultado) {
  const lista = [], porMinuto = new Map();
  for (const [fKey, alerta] of rejeicoesDosPedidos(estado, resultado)) {
    const [stuId, mid] = fKey.split('_').map(Number);
    const aluno = estado.stu.find(x => x.id === stuId);
    const registro = aluno ? pedidoDoAluno(aluno, mid) : null;
    if (!registro) continue;
    const marcada = alerta.espera && Number.isInteger(alerta.espera.minuto) ? alerta.espera : null;
    const minuto = marcada ? marcada.minuto : RECUSAS_POR_LUGAR.includes(alerta.codigo) ? minutosExatos(registro.jan)[0] : undefined;
    if (minuto === undefined) continue;
    const lugar = (porMinuto.get(minuto) || 0) + 1;
    porMinuto.set(minuto, lugar);
    lista.push({ fKey, nome: aluno.nm, minuto, lugar: marcada && Number.isInteger(marcada.lugar) ? marcada.lugar : lugar });
  }
  return lista;
}

// O nome do instrutor, para o Histórico
const nomeDoInstrutor = (estado, id) => ((estado.ins || []).find(x => x.id === id) || {}).nm || null;

// O pedido de uma linha da escala (aluno_missão, sem a sessão): as sessões de um pedido são dele
const pedidoDaChave = fKey => fKey.split('_').slice(0, 2).join('_');

// A vez da lista de espera (Pedro, 2026-11-28, a pergunta da revisão do E sobre N14: "sim"): quando a rodada do motor dá o
// lugar livre do minuto a um pedido que estava em outro horário (a 2ª preferência, U1, ou o horário flexível) ou fora
// da escala, e não a quem esperava por ele, o 1º da lista de espera desse minuto que cabe no lugar entra, depois o
// seguinte; na escala aprovada e na não aprovada (o padrão do R5, a rodada em volta dos fixos, cede neste caso). Cabe
// quem o motor põe nesse minuto com a escala de antes inteira fixa no lugar (menos quem saiu) e só ele entre os pedidos
// sem linha nela: assim nenhum voo de antes muda, nenhum outro pedido passa na frente dele, e o motor escolhe o avião e o
// instrutor com as regras dele. Quem entra fica fixo ali, com o pino de sempre ({ a, b, r, insId }, sem marca: nenhum
// formato novo): a escala é refeita pelo motor a cada gravação (js/actions.js, save), e sem o pino a rodada seguinte
// daria a vaga de volta ao pedido de antes na fila. O pino só fica se a rodada com ele, a da tela, mantém todos os que
// tinham linha, sem conflito novo; senão sai, e o seguinte da lista é tentado. Os da lista que já entraram nesta
// conciliação no lugar de outro que saiu (daLista: as chaves) ficam fixos com ele, onde estão: sem o pino, a rodada da tela
// daria o lugar deles ao pedido que mudaria de horário (a revisão: dois lugares livres no mesmo horário). A escala do motor
// continua a mesma (runAllocationEngine não muda). Responde quem entrou ({ ...espera, fixo }), os pinos dos da lista que
// já tinham entrado (fixados: { fKey: pino }) e as linhas da rodada, ou null
function vezDaListaDeEspera(estado, { minuto, espera, linhasDeAntes, entraram = [], daLista = [], saem, escalar }) {
  // Os que ficam: as linhas de antes, menos quem saiu, e as de quem já entrou no lugar de outro que saiu nesta conciliação
  const ficam = [...linhasDeAntes.values(), ...entraram].filter(o => !o.trecho && !saem.has(pedidoDaChave(o.fKey)));
  const comConflitoAntes = new Set(ficam.filter(o => o.conflito).map(o => o.fKey));
  const temLinha = new Set(ficam.map(o => pedidoDaChave(o.fKey)));
  const original = estado.fixos;
  const fixosDeAntes = { ...(original || {}) };
  for (const e of espera.filter(x => x.minuto === minuto)) {
    // A rodada de prova: a escala de antes fixa no lugar (o pino que já havia fica), e, dos pedidos sem linha nela, só ele
    const voa = chave => temLinha.has(chave) || chave === pedidoDaChave(e.fKey);
    const prova = {
      ...estado,
      fixos: { ...Object.fromEntries(ficam.map(o => [o.fKey, pinoDoVoo(o)])), ...fixosDeAntes },
      stu: estado.stu.map(s => ({
        ...s, fly: Boolean(s.fly) && voa(`${s.id}_0`),
        extra: (Array.isArray(s.extra) ? s.extra : []).map(ex => ({ ...ex, fly: Boolean(ex.fly) && voa(`${s.id}_${ex.mid}`) }))
      }))
    };
    const linha = (escalar(prova).resultado.out || []).find(o => o.fKey === e.fKey && !o.trecho);
    if (!linha || linha.a !== minuto || linha.conflito) continue;
    const fixo = pinoDoVoo(linha);
    const fixados = Object.fromEntries(entraram.filter(o => daLista.includes(o.fKey) && !Object.hasOwn(fixosDeAntes, o.fKey)).map(o => [o.fKey, pinoDoVoo(o)]));
    estado.fixos = { ...fixosDeAntes, ...fixados, [e.fKey]: fixo };
    // A rodada da tela com o pino: todos os que tinham linha continuam com uma, sem conflito novo, e ele no lugar
    const depois = escalar(estado).resultado.out || [];
    const linhaDepois = new Map(depois.map(o => [o.fKey, o]));
    const dele = linhaDepois.get(e.fKey);
    const mantem = ficam.every(o => linhaDepois.has(o.fKey)) && depois.every(o => !o.conflito || comConflitoAntes.has(o.fKey));
    if (dele && dele.a === minuto && !dele.conflito && mantem) return { entrou: { ...e, fixo }, fixados, linhaDepois };
    estado.fixos = original;
  }
  return null;
}

// O texto do Histórico de um pedido que saiu (só nomes, nenhum dado pessoal): de onde, o motivo, a missão, onde o voo
// estava e, quando a rodada do motor deu o lugar dele ao primeiro da lista de espera que cabia, quem entrou. Com a escala
// de antes, o pedido sem linha nela saiu da lista de espera (esperava: { minuto, lugar }) ou dos pedidos da data (não
// estava na escala); sem ela, não se sabe, e a linha diz "saiu da escala"
function textoDaSaida(estado, { nome, mis, motivo, linha, deixouDeSerFixo, entrou, esperava, semLinha }) {
  const onde = linha ? ` · estava às ${hm(linha.a)}–${hm(linha.b)} no ${linha.r}${nomeDoInstrutor(estado, linha.insId) ? ` com ${nomeDoInstrutor(estado, linha.insId)}` : ''}`
    : esperava ? ` · era o ${esperava.lugar}º` : semLinha ? ' · não estava na escala' : '';
  const deOnde = esperava ? `da lista de espera das ${hm(esperava.minuto)}` : semLinha ? 'dos pedidos da data' : 'da escala';
  const porque = motivo === 'cancelado' ? 'pedido cancelado' : 'aprovação retirada';
  // Quem entrou: o da lista de espera, com o lugar dele nela; o outro pedido que foi para o lugar livre (a rodada do motor,
  // quando ninguém da lista cabe nele: o que estava em outro horário, ou fora da escala), com de onde veio. O da lista que
  // entrou antes do pedido que mudaria de horário (vezDaListaDeEspera) fica fixo no lugar, e a linha diz onde
  const fixo = entrou && entrou.fixo ? ` · fica fixo às ${hm(entrou.fixo.a)} no ${entrou.fixo.r}${nomeDoInstrutor(estado, entrou.fixo.insId) ? ` com ${nomeDoInstrutor(estado, entrou.fixo.insId)}` : ''}` : '';
  const veio = !entrou ? '' : Number.isInteger(entrou.lugar) ? `${entrou.lugar}º da lista de espera das ${hm(entrou.minuto)}${fixo}`
    : entrou.de ? `estava às ${hm(entrou.de.a)} no ${entrou.de.r}` : 'estava fora da escala';
  const quem = entrou ? `; no lugar entrou ${entrou.nome} (${veio})` : '';
  return `Pedidos: ${nome} saiu ${deOnde}, ${porque} (${mis}${onde}${deixouDeSerFixo ? ' · deixa de ser fixo' : ''})${quem}`;
}

// Aplica o plano de conciliarPedidos ao estado (o único que muda estado.importadas):
// - acertos: o id admitido volta para importadas; o esquecido sai;
// - voltam: o registro volta a voar (fly), e o id volta para importadas; nada mais dele muda;
// - entram: cada pedido entra no dia (entrar), os com a missão do curso que escolheram na Agenda primeiro, cada grupo na
//   ordem do plano; o que já tem registro (o plano aplicado de novo) não;
// - saem: o registro deixa de voar e o id sai de importadas; o do pedido cancelado sai com a chave limpa (o voo fixo, o
//   status e o detalhe), e o fixo do pedido sem a aprovação dorme (volta com ela).
// Cada saída tem uma linha no Histórico (historico: [tipo, texto]). Com antes ({ estado, resultado }: a escala de antes,
// como a tela a calculou) e escalar(estado) → { estado, resultado } (o motor como a tela o roda: estadoDaEscala, com a
// prioridade desligada na padrão), a rodada do motor em volta dos fixos depois da saída dá o lugar livre ao primeiro da
// lista de espera daquele horário que cabe nele (N14; o padrão do R5: também na escala aprovada, sem fixar quem entra), e
// a linha da saída diz quem entrou. Quando a rodada o dá a um pedido de outro horário ou do horário flexível, a lista vem
// antes (Pedro, 2026-11-28): o 1º dela que cabe entra, fixo no lugar (vezDaListaDeEspera; o padrão do R5 cede aqui).
// programa, situacao, cursos: os de missaoDaEntrada
export function aplicarConciliacao(estado, plano, { programa = [], situacao = [], cursos = [], antes = null, escalar = null } = {}) {
  const feito = { entraram: [], voltaram: [], sairam: [], conferir: [], ficam: [], missoes: [], admitidas: [], esquecidas: [], historico: [] };
  if (!Array.isArray(estado.importadas)) estado.importadas = [];
  const guardar = id => { if (!estado.importadas.includes(id)) estado.importadas.push(id); };
  const tirar = id => { estado.importadas = estado.importadas.filter(x => x !== id); };
  // A espera e os voos de antes, lidos antes de mudar o estado (a escala de antes pode ser o próprio estado)
  const espera = antes ? listaDeEspera(antes.estado, antes.resultado) : [];
  const naEspera = new Map(espera.map(e => [e.fKey, e]));
  const linhasDeAntes = new Map(antes ? (antes.resultado.out || []).map(o => [o.fKey, o]) : []);
  const acertos = plano.acertos || { admitir: [], esquecer: [] };
  for (const id of acertos.admitir) { guardar(id); feito.admitidas.push(id); }
  for (const id of acertos.esquecer) { tirar(id); feito.esquecidas.push(id); }
  const doFKey = fKey => { const [stuId, mid] = fKey.split('_').map(Number); return { stuId, mid }; };
  const doRegistro = ({ stuId, mid }) => {
    const aluno = estado.stu.find(x => x.id === stuId);
    return aluno ? { aluno, registro: pedidoDoAluno(aluno, mid) } : {};
  };
  for (const v of plano.voltam || []) {
    const { registro } = doRegistro(v);
    if (!registro || registro.solicitacao !== v.id) continue;
    registro.fly = true;
    guardar(v.id);
    feito.voltaram.push(v);
  }
  // As missões do curso que o programa passou: a de agora no voo, se ele ainda tem a de antes e nenhum outro voo do aluno
  // a tem. Antes das entradas, para que o pedido novo do mesmo aluno não receba a mesma missão (a regra 12); a linha do
  // Histórico vai depois das saídas, como antes
  const historicoDasMissoes = [];
  for (const m of plano.missoes || []) {
    const { aluno, registro } = doRegistro(m);
    if (!registro || registro.etapa !== m.de) continue;
    if (pedidosDoAluno(aluno).some(p => p !== registro && p.fly && p.etapa === m.para && (p.cursoDaEtapa || aluno.curso) === (m.curso || aluno.curso))) continue;
    Object.assign(registro, { etapa: m.para }, m.curso ? { cursoDaEtapa: m.curso } : {});
    feito.missoes.push(m);
    historicoDasMissoes.push(['mod', `Pedidos: missão do curso de ${m.nome}: ${m.de} → ${m.para} (o programa andou)`]);
  }
  // Os pedidos com a missão do curso que escolheram na Agenda (a regra 8) entram antes dos sem uma, para que a missão de
  // cada um já esteja no dia quando a dos outros é inferida (a regra 12: não é dada de novo), na mesma importação ou em
  // duas; dentro de cada grupo, a ordem do plano. O pedido que já tem registro (um plano aplicado de novo) não entra
  const jaTem = registrosDosPedidos(estado);
  const entram = (plano.entram || []).filter(s => !jaTem.has(s.id));
  const escolheu = s => Boolean(missaoDoCursoDoPedido(cursos || [], s));
  for (const s of [...entram.filter(escolheu), ...entram.filter(s => !escolheu(s))]) feito.entraram.push(entrar(estado, s, { programa, situacao, cursos }));
  for (const x of plano.saem || []) {
    const { aluno, registro } = doRegistro(x);
    if (!registro || registro.solicitacao !== x.id) continue;
    const fKey = chaveDoVoo(x.stuId, x.mid);
    registro.fly = false;
    tirar(x.id);
    const deixouDeSerFixo = x.motivo === 'cancelado' && Object.hasOwn(estado.fixos || {}, fKey);
    if (x.motivo === 'cancelado') [estado.fixos, estado.fStatus, estado.fObs].forEach(mapa => { if (mapa) delete mapa[fKey]; });
    const linha = linhasDeAntes.get(fKey) || null;
    const esperava = !linha && naEspera.has(fKey) ? naEspera.get(fKey) : null;
    feito.sairam.push({ ...x, fKey, nome: aluno.nm, mis: registro.mis, linha, deixouDeSerFixo, esperava, semLinha: Boolean(antes) && !linha && !esperava });
  }
  // O lugar de cada voo que saiu vai, na rodada do motor, ao primeiro da lista de espera do horário dele que cabe
  const livres = feito.sairam.filter(x => x.linha);
  if (livres.length && escalar) {
    let linhaDepois = new Map((escalar(estado).resultado.out || []).map(o => [o.fKey, o]));
    const usados = new Set();
    const saem = new Set(feito.sairam.map(x => pedidoDaChave(x.fKey)));
    // Os da lista que entraram até aqui, com o lugar livre de cada um (para dizer, no Histórico, que ficaram fixos)
    const daLista = new Map();
    for (const x of livres) {
      // Entra pela lista só quem esperava esse horário: o da lista de outro horário que a rodada pôs aqui (a 2ª preferência)
      // muda de horário, como o pedido que estava em outro horário, e a lista deste vem antes dele (a revisão)
      const entrou = espera.filter(e => !usados.has(e.fKey) && e.minuto === x.linha.a && linhaDepois.has(e.fKey) && linhaDepois.get(e.fKey).a === x.linha.a)
        .sort((p, q) => p.lugar - q.lugar)[0];
      if (entrou) { usados.add(entrou.fKey); daLista.set(entrou.fKey, x); x.entrou = entrou; continue; }
      // Nenhum da lista de espera na rodada: a lista vem antes do pedido que o motor poria no lugar vindo de outro horário,
      // do horário flexível ou da lista de outro horário (Pedro, 2026-11-28): o 1º dela que cabe no lugar livre, depois o
      // seguinte, entra, fixo; os da lista que já entraram nesta conciliação ficam fixos com ele
      const entraram = [...usados].map(k => linhaDepois.get(k)).filter(Boolean);
      const daVez = vezDaListaDeEspera(estado, { minuto: x.linha.a, espera: espera.filter(e => !usados.has(e.fKey)), linhasDeAntes, entraram, daLista: [...daLista.keys()], saem, escalar });
      if (daVez) {
        usados.add(daVez.entrou.fKey);
        for (const [fKey, fixo] of Object.entries(daVez.fixados)) daLista.get(fKey).entrou = { ...daLista.get(fKey).entrou, fixo };
        daLista.set(daVez.entrou.fKey, x);
        x.entrou = daVez.entrou;
        linhaDepois = daVez.linhaDepois;
        continue;
      }
      // Nenhum da lista de espera cabe: o lugar pode ter ido a outro pedido, que a rodada pôs nesse horário: o de antes na
      // fila que estava em outro horário (a 2ª preferência, U1, ou o horário flexível), na lista de espera de outro horário
      // ou fora da escala; o do mesmo recurso primeiro. O Histórico diz quem é e de onde veio
      const outro = [...linhaDepois.values()]
        .filter(o => !usados.has(o.fKey) && o.a === x.linha.a && !(linhasDeAntes.has(o.fKey) && linhasDeAntes.get(o.fKey).a === o.a) && doRegistro(doFKey(o.fKey)).aluno)
        .sort((p, q) => (p.r === x.linha.r ? 0 : 1) - (q.r === x.linha.r ? 0 : 1))[0];
      if (outro) {
        usados.add(outro.fKey);
        const de = linhasDeAntes.get(outro.fKey) || null;
        x.entrou = naEspera.has(outro.fKey) ? naEspera.get(outro.fKey)
          : { fKey: outro.fKey, nome: doRegistro(doFKey(outro.fKey)).aluno.nm, de: de ? { a: de.a, r: de.r } : null };
      }
    }
  }
  for (const x of feito.sairam) feito.historico.push(['exc', textoDaSaida(estado, x)]);
  feito.historico.push(...historicoDasMissoes);
  // Os que ficam até o operador conferir o status e os que ficam (nada muda): o aluno, para o aviso
  for (const x of plano.conferir || []) { const { aluno } = doRegistro(x); if (aluno) feito.conferir.push({ ...x, nome: aluno.nm }); }
  for (const x of plano.ficam || []) { const { aluno } = doRegistro(x); if (aluno) feito.ficam.push({ ...x, nome: aluno.nm }); }
  return feito;
}

// O resumo da conciliação aplicada (o aviso do app, js/entrada-na-demanda.js): quantos entraram novos e quantos foram
// atualizados (o voo posto à mão que deu lugar ao pedido e o que voltou a voar); os que esperam (fora do cadastro, de
// inativo, sem os programas lidos); a missão do curso de cada um que entrou (a que saiu do programa, foraDoPrograma, com a
// missão como a qual ele entrou, entrouComo: a inferida ou a do operador; null, pelo tipo; nenhuma inferida,
// semMissaoDoCurso); o horário exato que a lista do recurso não tem (foraDaLista: a missão, o recurso e o horário) e o que
// entrou sem ele, fora dos horários exatos do dia, antes das 06:30 ou depois das 17:30 (semOHorario, os mesmos campos); os
// que saíram (sairam: o aluno, quem entrou no lugar, null: ninguém, e de onde saiu, de: 'escala', 'espera', da lista de
// espera, ou 'pedidos', dos pedidos da data, sem estar na escala), os que ficam até o operador conferir o status
// (conferir: o aluno e o porquê, 'atrasado' ou 'ja-decolou') e os que ficam (ficam: o aluno e o porquê de ficaNaEscala)
export function resumoDaConciliacao(plano, feito) {
  return {
    novos: feito.entraram.filter(x => x.novo).length, atualizados: feito.entraram.filter(x => !x.novo).length + feito.voltaram.length,
    semAluno: plano.semAluno.length, deInativo: plano.inativos.length,
    foraDoPrograma: feito.entraram.filter(x => x.foraDoPrograma).map(x => x.foraDoPrograma),
    semMissaoDoCurso: feito.entraram.filter(x => x.semMissao).map(x => x.semMissao), esperamOsProgramas: plano.esperamOsProgramas.length,
    foraDaLista: feito.entraram.filter(x => x.foraDaLista).map(x => x.foraDaLista),
    semOHorario: feito.entraram.filter(x => x.semOHorario).map(x => x.semOHorario),
    sairam: feito.sairam.map(x => ({ aluno: x.nome, entrou: x.entrou ? x.entrou.nome : null, de: x.esperava ? 'espera' : x.semLinha ? 'pedidos' : 'escala' })),
    conferir: feito.conferir.map(x => ({ aluno: x.nome, porque: x.porque })),
    ficam: (feito.ficam || []).map(x => ({ aluno: x.nome, porque: x.porque }))
  };
}

// ——— O quadro do Processamento (G2) ———

// Os textos dos que saem, ficam ou pedem a conferência, pelo motivo da saída
const QUEM_SAIU = { cancelado: 'Pedido cancelado', 'sem-aprovacao': 'Aprovação retirada' };
const porQuem = (linha, motivo) => {
  const quem = motivo === 'cancelado' ? linha && linha.cancelada_por : linha && linha.aprovacao_retirada_por;
  return `${QUEM_SAIU[motivo]}${quem ? ` por ${quem}` : ''}`;
};

// O que cada situação diz na terceira linha (o motivo, a espera e o voo, à parte)
const TEXTO_DA_SITUACAO = {
  'para-entrar': 'Aprovado: entra com Atualizar a escala',
  'espera-os-programas': 'Aprovado: entra com Atualizar a escala depois de lidos os programas dos cursos',
  'sem-aprovacao': 'Na escala sem aprovação: aprove em Pedidos ou tire da escala',
  'fora-pelo-operador': 'Tirado da escala nesta data',
  dispensado: 'Aprovado, tirado desta data antes: Trazer de volta',
  'nao-entrou': 'Aprovado, não entrou nesta data',
  aguardando: 'Aguardando aprovação',
  'sem-aluno': 'O aluno não está no cadastro: entra depois de cadastrado',
  inativo: 'Aluno inativo: o pedido entra quando ele voltar a ativo'
};

// A lista de espera de cada minuto (o 1º, o 2º…), na escala da tela: Map do fKey para { minuto, lugar, fila }
function esperasDaEscala(estadoDoMotor, resultado) {
  const lista = estadoDoMotor && resultado ? listaDeEspera(estadoDoMotor, resultado) : [];
  const porMinuto = new Map();
  for (const e of lista) porMinuto.set(e.minuto, [...(porMinuto.get(e.minuto) || []), { nome: e.nome, lugar: e.lugar }]);
  for (const fila of porMinuto.values()) fila.sort((p, q) => p.lugar - q.lugar);
  return new Map(lista.map(e => [e.fKey, { minuto: e.minuto, lugar: e.lugar, fila: porMinuto.get(e.minuto) }]));
}

// O quadro do Processamento: { plano, linhas, contagens }. Uma linha por registro do dia que voa (ou que o operador tirou
// da escala: o pedido guardado sem voar, o voo sem pedido com pino) e por pedido da data sem registro, nessa ordem (os
// registros na ordem do cadastro; os pedidos, na da lista). solicitacoes null: os pedidos não foram lidos (só os voos, sem
// o plano). resultado: a escala da tela; ambiente: os de conciliarPedidos (data, hoje, agora, aprovada, cursos,
// semInativos, programa, situacao) e estadoDoMotor (o estado que o motor leu, para as recusas e a lista de espera).
// Cada linha: { chave (o fKey do registro, ou 'p:<id>'), origem ('pedido', 'agendado', 'sem-pedido'), situacao, stuId,
// mid, fKey, nome, missao, recurso, pedido (a linha lida, ou null), voo ({ a, b, r, insId, ins } ou null), espera,
// motivo ({ codigo, m, curto, onde } ou null), porque (o de ficaNaEscala), texto }
export function quadroDoProcessamento(estado, solicitacoes, resultado, ambiente = {}) {
  const { estadoDoMotor = null, ...opcoes } = ambiente;
  const plano = Array.isArray(solicitacoes) ? conciliarPedidos(estado, solicitacoes, opcoes) : null;
  const porId = new Map((solicitacoes || []).filter(s => s && Number.isInteger(s.id)).map(s => [s.id, s]));
  const guardadas = new Set(Array.isArray(estado.importadas) ? estado.importadas : []);
  const naEscala = new Map(((resultado && resultado.out) || []).filter(o => !o.trecho).map(o => [o.fKey, o]));
  const recusas = estadoDoMotor && resultado ? rejeicoesDosPedidos(estadoDoMotor, resultado) : new Map();
  const esperas = esperasDaEscala(estadoDoMotor, resultado);
  const doPlano = (lista, id) => (plano ? (plano[lista] || []).find(x => (x.id ?? x) === id) : undefined);
  const linhas = [];
  // O registro que voa: na escala, em espera ou fora dela (o motivo do motor)
  const pelaEscala = fKey => {
    const o = naEscala.get(fKey);
    if (o) return { situacao: 'na-escala', voo: { a: o.a, b: o.b, r: o.r, insId: o.insId, ins: o.ins || nomeDoInstrutor(estado, o.insId) } };
    if (esperas.has(fKey)) return { situacao: 'em-espera', espera: esperas.get(fKey) };
    const a = recusas.get(fKey);
    return { situacao: 'nao-coube', motivo: a ? { codigo: a.codigo || null, m: a.m, curto: FORA_DA_ESCALA[a.codigo] || null, onde: ONDE_RESOLVER[a.codigo] || null } : null };
  };
  for (const aluno of estado.stu || []) {
    for (const r of pedidosDoAluno(aluno)) {
      const mid = r.mid || 0, fKey = chaveDoVoo(aluno.id, mid);
      const pino = (estado.fixos || {})[fKey];
      const base = { chave: fKey, stuId: aluno.id, mid, fKey, nome: aluno.nm, missao: r.mis, recurso: r.eq, pedido: null, voo: null, espera: null, motivo: null, porque: null };
      let linha = null;
      if (Number.isInteger(r.solicitacao)) {
        const s = porId.get(r.solicitacao) || null;
        const id = r.solicitacao;
        const sai = doPlano('saem', id), confere = doPlano('conferir', id), fica = doPlano('ficam', id);
        if (sai) linha = { situacao: 'para-sair', texto: `${porQuem(s, sai.motivo)}: sai com Atualizar a escala` };
        else if (confere) {
          const passou = confere.porque === 'atrasado' ? 'o voo está Atrasado' : 'o horário do voo já passou';
          linha = { situacao: 'conferir', porque: confere.porque, texto: `${QUEM_SAIU[confere.motivo]} e ${passou}: marque Pousou ou Cancelado na Escala` };
        } else if (fica) linha = { situacao: 'fica', porque: fica.porque, texto: `${porQuem(s, fica.motivo)}; o voo fica na escala: ${POR_QUE_FICA[fica.porque]}` };
        else if (doPlano('voltam', id)) linha = { situacao: 'para-entrar' };
        else if (doPlano('semAprovacao', id)) linha = { situacao: 'sem-aprovacao' };
        else if (r.fly) linha = pelaEscala(fKey);
        else if (guardadas.has(id) && (!s || (!s.cancelada_em && opcoes.aprovada && opcoes.aprovada(s)))) linha = { situacao: 'fora-pelo-operador' };
        // O registro sem voar de um pedido cancelado, ou que aguarda a aprovação (a linha do pedido, com o registro dele)
        else if (s && s.cancelada_em) linha = { situacao: 'cancelado', texto: `Cancelado${s.cancelada_por ? ` por ${s.cancelada_por}` : ''}` };
        else if (s && !(opcoes.aprovada && opcoes.aprovada(s))) linha = { situacao: 'aguardando' };
        if (linha) linhas.push({ ...base, origem: 'pedido', pedido: s, ...linha });
        continue;
      }
      if (r.fly) linha = pelaEscala(fKey);
      else if (pino) linha = { situacao: 'fora-pelo-operador' };
      if (linha) linhas.push({ ...base, origem: pino && pino.agendado ? 'agendado' : 'sem-pedido', ...linha });
    }
  }
  // Os pedidos da data sem registro: os do plano (entram, dispensados, sem aluno…), os que aguardam e os cancelados
  const comRegistro = new Set(linhas.filter(l => l.origem === 'pedido').map(l => l.pedido && l.pedido.id).filter(Number.isInteger));
  const registros = registrosDosPedidos(estado);
  for (const s of porId.values()) {
    if (comRegistro.has(s.id) || registros.has(s.id)) continue;
    const situacao = doPlano('entram', s.id) ? 'para-entrar' : doPlano('esperamOsProgramas', s.id) ? 'espera-os-programas' : doPlano('dispensados', s.id) ? 'dispensado'
      : doPlano('naoEntrou', s.id) ? 'nao-entrou' : doPlano('semAluno', s.id) ? 'sem-aluno' : doPlano('inativos', s.id) ? 'inativo' : s.cancelada_em ? 'cancelado' : 'aguardando';
    const aluno = (estado.stu || []).find(x => x.id === s.aluno);
    linhas.push({
      chave: `p:${s.id}`, origem: 'pedido', situacao: situacao === 'espera-os-programas' ? 'para-entrar' : situacao, stuId: s.aluno, mid: null, fKey: null,
      nome: aluno ? aluno.nm : s.aluno_nome, missao: s.missao, recurso: recursoValido(s) || null, pedido: s, voo: null, espera: null, motivo: null, porque: null,
      texto: situacao === 'cancelado' ? `Cancelado${s.cancelada_por ? ` por ${s.cancelada_por}` : ''}` : TEXTO_DA_SITUACAO[situacao]
    });
  }
  for (const l of linhas) if (!l.texto) l.texto = textoDaLinha(l);
  const conta = situacao => linhas.filter(l => l.situacao === situacao).length;
  const contagens = {
    naEscala: conta('na-escala'), emEspera: conta('em-espera'), naoCouberam: conta('nao-coube'), paraEntrar: conta('para-entrar'), paraSair: conta('para-sair'),
    conferir: conta('conferir'), semAprovacao: conta('sem-aprovacao'), foraPeloOperador: conta('fora-pelo-operador'), dispensados: conta('dispensado'),
    aguardando: conta('aguardando'), cancelados: conta('cancelado'), semPedido: linhas.filter(l => l.origem !== 'pedido').length,
    missoesParaTrocar: plano ? plano.missoes.length : 0
  };
  return { plano, linhas, contagens };
}

// A terceira linha das situações que dependem da escala: o voo, a espera ou o motivo
function textoDaLinha(l) {
  if (l.situacao === 'na-escala') return `Na escala ${hm(l.voo.a)}–${hm(l.voo.b)} · ${nomeDoRecurso(l.voo.r)}${l.voo.ins ? ` · ${l.voo.ins}` : ''}`;
  if (l.situacao === 'em-espera') return `Em espera às ${hm(l.espera.minuto)} · ${l.espera.lugar}º`;
  if (l.situacao === 'nao-coube') return `Não coube na escala${l.motivo ? `: ${l.motivo.curto || l.motivo.m}` : ''}`;
  return TEXTO_DA_SITUACAO[l.situacao] || '';
}

// ——— "Pôr de volta na escala" (G2) ———

// Por que o voo não volta (o aviso de "Pôr de volta na escala" e o da gaveta das restrições)
export const MOTIVO_PARA_NAO_VOLTAR = {
  'pedido-cancelado': 'O pedido deste voo foi cancelado.',
  'sem-aprovacao': 'O pedido deste voo está sem aprovação: aprove em Pedidos.',
  'data-passada': 'Data passada: nada volta para a escala.',
  'pedidos-nao-lidos': 'Os pedidos desta data não foram lidos: tente de novo.',
  'sem-voo': 'Este voo não está mais nesta data.'
};

// O voo tirado da escala (o registro do aluno e da missão) pode voltar? { ok: true } ou { ok: false, motivo }: o voo do
// pedido volta só com o pedido lido, aprovado e não cancelado; o sem pedido volta sempre; nada volta numa data passada.
// ambiente: { aprovada, data, hoje }
export function podeVoltarAEscala(estado, solicitacoes, { stuId, mid }, { aprovada, data = null, hoje = null } = {}) {
  const aluno = (estado.stu || []).find(x => x.id === stuId);
  const registro = aluno ? pedidoDoAluno(aluno, mid) : null;
  if (!registro) return { ok: false, motivo: 'sem-voo' };
  if (data && hoje && data < hoje) return { ok: false, motivo: 'data-passada' };
  if (!Number.isInteger(registro.solicitacao)) return { ok: true };
  const linha = Array.isArray(solicitacoes) ? solicitacoes.find(s => s && s.id === registro.solicitacao) : null;
  if (!linha) return { ok: false, motivo: 'pedidos-nao-lidos' };
  if (linha.cancelada_em) return { ok: false, motivo: 'pedido-cancelado' };
  if (!aprovada(linha)) return { ok: false, motivo: 'sem-aprovacao' };
  return { ok: true };
}

// ——— "Recomeçar pelos pedidos" (G2, no lugar de "Limpar demanda") ———

const quantosDe = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// A data recomeça pelos pedidos: o registro de cada pedido aprovado volta, no mesmo número, ao que o pedido dá (a missão do
// curso de novo, sem as restrições, com a chave limpa: o pino, o status e o detalhe); os voos sem pedido saem (a missão
// extra some; o principal fica em branco, sem voar); os voos dos pedidos que aguardam ou foram cancelados saem (o cancelado sai de
// importadas); fica o voo em andamento (Atrasado, Em Voo, Pousou) ou com resultado, e o registro de um pedido que não está
// nas linhas lidas; o tirado da escala pelo operador e o tirado desta data antes (dispensado) continuam fora; o pedido
// aprovado que não tinha registro entra numa missão extra acima de todo número que o aluno tinha (nunca no 0); a escala
// aprovada é reaberta. Muda o estado. Recusa, sem mudar nada, numa data passada e com os pedidos não lidos ({ recusa }).
// ambiente: os de conciliarPedidos (data, hoje, agora, aprovada, cursos, semInativos) e os de missaoDaEntrada
// (programa, situacao). { voltaramAoPedido, sairamSemPedido, sairam, ficam, continuamFora, entraram, reaberta, texto }
export function recomecarPelosPedidos(estado, solicitacoes, ambiente = {}) {
  const { data = null, hoje = null, aprovada, programa = [], situacao = [], cursos = [] } = ambiente;
  if (data && hoje && data < hoje) return { recusa: 'data-passada' };
  if (!Array.isArray(solicitacoes)) return { recusa: 'pedidos-nao-lidos' };
  const porId = new Map(solicitacoes.filter(s => s && Number.isInteger(s.id)).map(s => [s.id, s]));
  if (!Array.isArray(estado.importadas)) estado.importadas = [];
  const guardadas = new Set(estado.importadas);
  const doDia = (estado.resultados || {}).doDia || [];
  const feito = { voltaramAoPedido: 0, sairamSemPedido: 0, sairam: 0, ficam: 0, continuamFora: 0, entraram: 0, reaberta: Boolean(estado.aprovacao) };
  // Os nomes de quem voltou ao pedido, saiu e entrou (a resposta do N6 diz o aluno), cada um uma vez por grupo
  const nomes = { voltaram: new Set(), sairam: new Set(), entraram: new Set() };
  const limpar = new Set(), piso = new Map(), voltam = [];
  const tirar = id => { estado.importadas = estado.importadas.filter(x => x !== id); };
  for (const aluno of estado.stu || []) {
    const registros = pedidosDoAluno(aluno);
    piso.set(aluno.id, Math.max(0, ...registros.map(r => r.mid || 0)));
    const extras = [];
    for (const r of registros) {
      const mid = r.mid || 0, fKey = chaveDoVoo(aluno.id, mid);
      const fica = r.fly && (STATUS_EM_ANDAMENTO.includes((estado.fStatus || {})[fKey]) || resultadoDoVoo(doDia, fKey) !== null);
      const s = Number.isInteger(r.solicitacao) ? porId.get(r.solicitacao) : undefined;
      if (fica || s === null || (Number.isInteger(r.solicitacao) && !s)) {
        if (r.fly) feito.ficam++;
        if (mid) extras.push(r);
        continue;
      }
      limpar.add(fKey);
      if (!Number.isInteger(r.solicitacao)) {
        if (r.fly || Object.hasOwn(estado.fixos || {}, fKey)) { feito.sairamSemPedido++; nomes.sairam.add(aluno.nm); }
        // A missão extra sai do dia; o principal fica em branco, sem voar (nada do voo de antes: o instrutor escolhido, a
        // missão do curso)
        if (!mid) deixarEmBranco(r);
        continue;
      }
      if (mid) extras.push(r);
      if (!s.cancelada_em && aprovada(s)) {
        if (!r.fly && guardadas.has(s.id)) { feito.continuamFora++; limpar.delete(fKey); continue; }
        voltam.push({ aluno, r, s });
        continue;
      }
      if (r.fly) { feito.sairam++; nomes.sairam.add(aluno.nm); }
      r.fly = false;
      if (s.cancelada_em) tirar(s.id);
    }
    aluno.extra = extras;
  }
  const semOsLimpos = mapa => Object.fromEntries(Object.entries(mapa || {}).filter(([fKey]) => !limpar.has(fKey)));
  estado.fStatus = semOsLimpos(estado.fStatus);
  estado.fObs = semOsLimpos(estado.fObs);
  estado.fixos = feito.reaberta ? fixosAoReabrir(semOsLimpos(estado.fixos), estado.fStatus) : semOsLimpos(estado.fixos);
  estado.aprovacao = null;
  // Os registros dos pedidos aprovados voltam ao pedido, no mesmo número, na ordem da entrada (os com a missão do curso
  // escolhida na Agenda primeiro)
  const ordem = new Map((estado.stu || []).map((x, i) => [x.id, i]));
  const naOrdem = (p, q) => (ordem.get(p.aluno) - ordem.get(q.aluno)) || (minutoDaLinha(p) - minutoDaLinha(q)) || (p.id - q.id);
  const escolheu = s => Boolean(missaoDoCursoDoPedido(cursos || [], s));
  voltam.sort((p, q) => naOrdem(p.s, q.s));
  for (const { aluno, r, s } of [...voltam.filter(v => escolheu(v.s)), ...voltam.filter(v => !escolheu(v.s))]) {
    nomes.voltaram.add(aluno.nm);
    const mid = r.mid;
    deixarEmBranco(r);
    if (mid !== undefined) r.mid = mid;
    entrar(estado, s, { programa, situacao, cursos }, r);
    feito.voltaramAoPedido++;
  }
  // Os aprovados sem registro e não guardados entram, acima de todo número de antes
  const plano = conciliarPedidos(estado, solicitacoes, { ...ambiente, so: null });
  feito.continuamFora += plano.dispensados.length;
  const entram = plano.entram.filter(s => estado.stu.some(x => x.id === s.aluno));
  for (const s of [...entram.filter(escolheu), ...entram.filter(x => !escolheu(x))]) {
    const aluno = estado.stu.find(x => x.id === s.aluno);
    const extra = { mid: Math.max(proximoMid(estado, aluno), (piso.get(aluno.id) || 0) + 1), ...blank(), pr: aluno.pr || PRIORIDADE_PADRAO };
    aluno.extra = [...(aluno.extra || []), extra];
    entrar(estado, s, { programa, situacao, cursos }, extra);
    feito.entraram++;
    nomes.entraram.add(aluno.nm);
  }
  const partes = [
    feito.voltaramAoPedido && quantosDe(feito.voltaramAoPedido, 'voltou ao pedido', 'voltaram ao pedido'),
    feito.sairamSemPedido && quantosDe(feito.sairamSemPedido, 'sem pedido saiu', 'sem pedido saíram'),
    feito.sairam && quantosDe(feito.sairam, 'sem aprovação ou cancelado saiu', 'sem aprovação ou cancelados saíram'),
    feito.ficam && quantosDe(feito.ficam, 'fica', 'ficam'),
    feito.continuamFora && quantosDe(feito.continuamFora, 'continua fora', 'continuam fora'),
    feito.entraram && quantosDe(feito.entraram, 'entrou', 'entraram')
  ].filter(Boolean);
  return {
    ...feito, texto: `Pedidos: escala recomeçada${partes.length ? ` (${partes.join(', ')})` : ''}${feito.reaberta ? ' e escala reaberta' : ''}`,
    nomes: { voltaram: [...nomes.voltaram], sairam: [...nomes.sairam], entraram: [...nomes.entraram] }
  };
}

// O processamento dos pedidos da agenda (o módulo do E): a conciliação dos pedidos da data com o dia (quem entra, quem
// volta, quem sai e quem fica), a missão do curso com que cada pedido entra e o resumo do que ela fez. Quem a chama é
// js/entrada-na-demanda.js (os botões de importar e a aprovação em Pedidos, até o G2). Puro: sem DOM, sem relógio, sem
// rede e sem S; recebe o estado da data e os pedidos e muda só o estado
import { migrateLegacyMissionName, alvoDoNovoPedido, proximoMid, blank, PRIORIDADE_PADRAO, minutosExatos } from './rules.js';
import { pedidoDaSolicitacao, recursoValido, missaoDoCursoGuardada } from './agenda.js';
import { indiceDoPrograma } from './programa.js';
import { proximasMissoes, missoesDoDia } from './progresso.js';
import { situacaoPorMissao, resultadoDoVoo } from './resultados.js';
import { chaveDoVoo, pedidoDoAluno } from './voo.js';
import { fixoPeloStatus } from './fixos.js';
import { inativo } from './inativos.js';
import { intervaloEfetivo } from './status.js';
import { minutoDaPreferencia, paraMinuto, horariosDaMissao } from './horarios.js';
import { rejeicoesDosPedidos } from './rejeicoes.js';
import { hm } from './format.js';

// Os pedidos de um aluno no dia: o principal (o próprio aluno, mid 0) e as missões extras
const pedidosDoAluno = aluno => [aluno, ...(Array.isArray(aluno.extra) ? aluno.extra : [])];

// Os minutos exatos do pedido (jan): "h<minuto>" (o horário da Agenda; o "h5" dos dados antigos é a janela 5) ou, com a
// 2ª preferência (U1), "h<minuto1>|h<minuto2>", dois minutos diferentes, o 1º primeiro, entre as 06:30 e as 17:30
// (minutosExatos, js/rules.js, o que o motor e as outras telas leem). Sem horário exato (sem jan, um período de antes do J
// ou um valor fora do formato): nenhum
export const minutosDoPedido = jan => minutosExatos(jan);

// O horário do pedido no dia, em minutos: o do voo fixo; senão, o 1º minuto exato do pedido; senão, a 1ª preferência;
// senão, null (desconhecido)
function horarioPedido(estado, stuId, registro) {
  const pino = (estado.fixos || {})[chaveDoVoo(stuId, registro.mid || 0)];
  if (pino && Number.isInteger(pino.a)) return pino.a;
  const [exato] = minutosDoPedido(registro.jan);
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
// so: só estes ids (a ação feita agora neste navegador); religar: o aprovado guardado volta (sem registro, entra; sem voar,
// volta), como a aprovação do D. data, hoje (AAAA-MM-DD) e agora (minutos do dia): os de ficaNaEscala; sem data, nenhuma
// regra de data passada. pendente: há o que aplicar (entram, voltam ou saem)
export function conciliarPedidos(estado, solicitacoes, { data = null, hoje = null, agora = null, aprovada, so = null, religar = false, cursos = [], semInativos = false } = {}) {
  if (typeof aprovada !== 'function') throw new Error('conciliarPedidos: falta aprovada, a regra do pedido aprovado');
  const plano = {
    entram: [], voltam: [], saem: [], ficam: [], conferir: [], semAprovacao: [], dispensados: [], semAluno: [], inativos: [], naoEntrou: [],
    esperamOsProgramas: [], acertos: { admitir: [], esquecer: [] }, pendente: false
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
        if (voa) { if (!guardada) plano.acertos.admitir.push(s.id); } else if ((!guardada || religar) && !passada) plano.voltam.push(doRegistro);
        continue;
      }
      const aluno = (estado.stu || []).find(x => x.id === s.aluno);
      if (!aluno) plano.semAluno.push(s.id);
      else if (semInativos && inativo(aluno)) plano.inativos.push(s.id);
      else if (guardada && !religar) plano.dispensados.push(s.id);
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
        if (porque === 'atrasado' || porque === 'ja-decolou') plano.conferir.push({ ...item, porque });
        else if (porque) plano.ficam.push({ ...item, porque });
        else plano.saem.push(item);
      } else if (cancelada && guardada) plano.acertos.esquecer.push(s.id);
      continue;
    }
    if (voa) plano.semAprovacao.push(doRegistro);
  }
  const ordem = new Map((estado.stu || []).map((x, i) => [x.id, i]));
  plano.entram.sort((p, q) => (ordem.get(p.aluno) - ordem.get(q.aluno)) || (minutoDaLinha(p) - minutoDaLinha(q)) || (p.id - q.id));
  plano.pendente = plano.entram.length + plano.voltam.length + plano.saem.length > 0;
  return plano;
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
function entrar(estado, s, { programa, situacao, cursos }) {
  const aluno = estado.stu.find(x => x.id === s.aluno);
  if (!estado.importadas.includes(s.id)) estado.importadas.push(s.id);
  const vinculada = missaoDoCursoDoPedido(cursos || [], s) || null;
  const copiada = vooQueDaLugar(estado, aluno, migrateLegacyMissionName(s.missao), vinculada);
  const entrada = missaoDaEntrada(estado, aluno, s, { programa, situacao, cursos, copiada });
  const recurso = recursoValido(s);
  const doCurso = !entrada.missao ? {} : entrada.de === 'pedido' ? { ...(recurso ? {} : { eq: entrada.missao.eq }), nb: entrada.missao.nb }
    : { eq: entrada.missao.eq, nb: entrada.missao.nb };
  const pedido = pedidoDaSolicitacao(s, estado.horarios, doCurso);
  // O horário exato da linha que o voo não guarda (fora dos horários exatos do dia, das 06:30 às 17:30: js/rules.js,
  // minutoExato; antes, as 06:00 que a lista de decolagens aceita, ou depois, as 18:00 que o servidor aceita): o pedido
  // entra sem ele, e o resumo diz; não está "fora da lista"
  const semOHorario = Number.isFinite(minutoDaLinha(s)) && !minutosDoPedido(pedido.jan).length;
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
  } else registro = Object.assign(alvoDaEntrada(estado, aluno), pedido);
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
    const minuto = marcada ? marcada.minuto : RECUSAS_POR_LUGAR.includes(alerta.codigo) ? minutosDoPedido(registro.jan)[0] : undefined;
    if (minuto === undefined) continue;
    const lugar = (porMinuto.get(minuto) || 0) + 1;
    porMinuto.set(minuto, lugar);
    lista.push({ fKey, nome: aluno.nm, minuto, lugar: marcada && Number.isInteger(marcada.lugar) ? marcada.lugar : lugar });
  }
  return lista;
}

// O nome do instrutor, para o Histórico
const nomeDoInstrutor = (estado, id) => ((estado.ins || []).find(x => x.id === id) || {}).nm || null;

// O texto do Histórico de um pedido que saiu (só nomes, nenhum dado pessoal): de onde, o motivo, a missão, onde o voo
// estava e, quando a rodada do motor deu o lugar dele ao primeiro da lista de espera que cabia, quem entrou. Com a escala
// de antes, o pedido sem linha nela saiu da lista de espera (esperava: { minuto, lugar }) ou dos pedidos da data (não
// estava na escala); sem ela, não se sabe, e a linha diz "saiu da escala"
function textoDaSaida(estado, { nome, mis, motivo, linha, deixouDeSerFixo, entrou, esperava, semLinha }) {
  const onde = linha ? ` · estava às ${hm(linha.a)}–${hm(linha.b)} no ${linha.r}${nomeDoInstrutor(estado, linha.insId) ? ` com ${nomeDoInstrutor(estado, linha.insId)}` : ''}`
    : esperava ? ` · era o ${esperava.lugar}º` : semLinha ? ' · não estava na escala' : '';
  const deOnde = esperava ? `da lista de espera das ${hm(esperava.minuto)}` : semLinha ? 'dos pedidos da data' : 'da escala';
  const porque = motivo === 'cancelado' ? 'pedido cancelado' : 'aprovação retirada';
  const quem = entrou ? `; no lugar entrou ${entrou.nome} (${entrou.lugar}º da lista de espera das ${hm(entrou.minuto)})` : '';
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
// a linha da saída diz quem entrou. programa, situacao, cursos: os de missaoDaEntrada
export function aplicarConciliacao(estado, plano, { programa = [], situacao = [], cursos = [], antes = null, escalar = null } = {}) {
  const feito = { entraram: [], voltaram: [], sairam: [], conferir: [], admitidas: [], esquecidas: [], historico: [] };
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
  if (livres.length && espera.length && escalar) {
    const depois = escalar(estado);
    const linhaDepois = new Map((depois.resultado.out || []).map(o => [o.fKey, o]));
    const usados = new Set();
    for (const x of livres) {
      const entrou = espera.filter(e => !usados.has(e.fKey) && linhaDepois.has(e.fKey) && linhaDepois.get(e.fKey).a === x.linha.a)
        .sort((p, q) => (p.minuto === x.linha.a ? 0 : 1) - (q.minuto === x.linha.a ? 0 : 1) || p.lugar - q.lugar)[0];
      if (entrou) { usados.add(entrou.fKey); x.entrou = entrou; }
    }
  }
  for (const x of feito.sairam) feito.historico.push(['exc', textoDaSaida(estado, x)]);
  // Os que ficam até o operador conferir o status (nada muda): o aluno, para o aviso
  for (const x of plano.conferir || []) { const { aluno } = doRegistro(x); if (aluno) feito.conferir.push({ ...x, nome: aluno.nm }); }
  return feito;
}

// O resumo da conciliação aplicada (o aviso do app, js/entrada-na-demanda.js): quantos entraram novos e quantos foram
// atualizados (o voo posto à mão que deu lugar ao pedido e o que voltou a voar); os que esperam (fora do cadastro, de
// inativo, sem os programas lidos); a missão do curso de cada um que entrou (a que saiu do programa, foraDoPrograma, com a
// missão como a qual ele entrou, entrouComo: a inferida ou a do operador; null, pelo tipo; nenhuma inferida,
// semMissaoDoCurso); o horário exato que a lista do recurso não tem (foraDaLista: a missão, o recurso e o horário) e o que
// entrou sem ele, fora dos horários exatos do dia, antes das 06:30 ou depois das 17:30 (semOHorario, os mesmos campos); os
// que saíram (sairam: o aluno e quem entrou no lugar, null: ninguém) e os que ficam até o operador conferir o status
// (conferir: o aluno e o porquê, 'atrasado' ou 'ja-decolou')
export function resumoDaConciliacao(plano, feito) {
  return {
    novos: feito.entraram.filter(x => x.novo).length, atualizados: feito.entraram.filter(x => !x.novo).length + feito.voltaram.length,
    semAluno: plano.semAluno.length, deInativo: plano.inativos.length,
    foraDoPrograma: feito.entraram.filter(x => x.foraDoPrograma).map(x => x.foraDoPrograma),
    semMissaoDoCurso: feito.entraram.filter(x => x.semMissao).map(x => x.semMissao), esperamOsProgramas: plano.esperamOsProgramas.length,
    foraDaLista: feito.entraram.filter(x => x.foraDaLista).map(x => x.foraDaLista),
    semOHorario: feito.entraram.filter(x => x.semOHorario).map(x => x.semOHorario),
    sairam: feito.sairam.map(x => ({ aluno: x.nome, entrou: x.entrou ? x.entrou.nome : null })),
    conferir: feito.conferir.map(x => ({ aluno: x.nome, porque: x.porque }))
  };
}

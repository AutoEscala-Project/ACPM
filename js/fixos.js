// Escala aprovada: os voos fixos (horário, avião e instrutor de cada voo, pela chave aluno_missão_sessão) e quem
// aprovou. Os dados vêm do dia guardado, que pode ter sido gravado fora do app (pela API): só valem nos formatos certos.
// O operador também fixa um voo na Escala: pelo instrutor escolhido (a marca escolhido) e pelo agendamento (a marca
// agendado). As marcas acompanham o voo fixo na aprovação, no status e na reabertura
import { rotuloDoStatus, STATUS_EM_ANDAMENTO } from './status.js';
import { CHAVE_DO_VOO, chaveDoVoo, pedidoDoAluno } from './voo.js';
import { MATRICULA } from './frota.js';
import { MINUTOS_DO_DIA, GROUND_REG, T } from './config.js';
import { periodoDoMinuto } from './horarios.js';
import { deixarEmBranco } from './rules.js';

const minuto = v => Number.isInteger(v) && v >= 0 && v <= MINUTOS_DO_DIA;

export function normalizarFixos(fixos) {
  const dados = fixos && typeof fixos === 'object' ? fixos : {};
  return Object.fromEntries(Object.entries(dados).flatMap(([fKey, p]) => {
    if (!CHAVE_DO_VOO.test(fKey) || !p || typeof p !== 'object') return [];
    if (!minuto(p.a) || !minuto(p.b) || p.b <= p.a || typeof p.r !== 'string' || !MATRICULA.test(p.r) || !Number.isInteger(p.insId)) return [];
    return [[fKey, {
      a: p.a, b: p.b, r: p.r, insId: p.insId, ...(typeof p.classKey === 'string' && p.classKey.length <= 80 ? { classKey: p.classKey } : {}),
      // Fixo pelo instrutor escolhido na Escala
      ...(p.escolhido === true ? { escolhido: true } : {}),
      // Agendado na Escala: o operador marcou o voo no horário, no recurso e com o instrutor
      ...(p.agendado === true ? { agendado: true } : {})
    }]];
  }));
}

export function normalizarAprovacao(aprovacao) {
  if (!aprovacao || typeof aprovacao !== 'object' || typeof aprovacao.em !== 'string' || Number.isNaN(Date.parse(aprovacao.em))) return null;
  return { em: aprovacao.em, por: typeof aprovacao.por === 'string' ? aprovacao.por.slice(0, 80) : '' };
}

// O voo fixo como o motor o recebe: o horário, o avião e o instrutor (e a turma, no Ground); o voo agendado leva a marca
export const pinoDoVoo = o => ({ a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}), ...(o.agendado ? { agendado: true } : {}) });

// O ciclo do cadeado. Em Voo, Atrasado, Pousou e Cancelado fixam o voo onde ele está (o pino que já havia
// continua); fora da escala aprovada, Pendente ou Confirmado o soltam, menos o fixo pelo operador na Escala (pelo
// instrutor escolhido ou pelo agendamento). Reabrir a escala mantém os fixados pelo status e pelo operador na Escala
const STATUS_QUE_FIXAM = ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado'];
export const fixoPeloStatus = (fKey, fStatus) => STATUS_QUE_FIXAM.includes((fStatus || {})[fKey]);
const fixoPeloOperador = p => Boolean(p && (p.escolhido || p.agendado));

export function fixosAoMudarStatus(fixos, voo, status, { aprovada }) {
  const atuais = fixos || {};
  if (STATUS_QUE_FIXAM.includes(status)) return { ...atuais, [voo.fKey]: atuais[voo.fKey] || pinoDoVoo(voo) };
  if (aprovada || !atuais[voo.fKey] || fixoPeloOperador(atuais[voo.fKey])) return atuais;
  const { [voo.fKey]: _, ...resto } = atuais;
  return resto;
}

// A alteração de um voo na escala aprovada (F1g) fixa antes o voo que ela toca onde ele está (o voo sem pino, que entrou
// depois da aprovação): todo pedido que voa numa data aprovada continua com um pino, uma linha ou a recusa dele, e a
// reversão devolve a linha pelo pino. Os voos fixos com os das chaves (fKeys) que estão na escala (resultado)
export function fixarNoLugar(fixos, resultado, fKeys) {
  const novos = { ...(fixos || {}) };
  for (const fKey of fKeys) {
    const o = !novos[fKey] && resultado && Array.isArray(resultado.out) ? resultado.out.find(v => v.fKey === fKey && !v.trecho) : null;
    if (o) novos[fKey] = pinoDoVoo(o);
  }
  return novos;
}

export const fixosAoReabrir = (fixos, fStatus) =>
  Object.fromEntries(Object.entries(fixos || {}).filter(([fKey, p]) => fixoPeloOperador(p) || fixoPeloStatus(fKey, fStatus)));

// Aprovar a escala: cada voo dela fica fixo onde está (out: a escala da tela, calculada ou gravada). O fixo pelo
// operador na Escala continua com a marca (o instrutor escolhido, do pino; o agendado, do pino ou da linha da escala), e
// o agendado que não está na escala (o pedido tirado da escala) continua fixo: o voo volta para o lugar dele quando o
// pedido voltar
export function fixosAoAprovar(fixos, out) {
  const atuais = fixos || {};
  const daEscala = Object.fromEntries(out.map(o => {
    const atual = atuais[o.fKey];
    return [o.fKey, {
      ...pinoDoVoo(o), ...(atual && atual.escolhido ? { escolhido: true } : {}), ...(o.agendado || (atual && atual.agendado) ? { agendado: true } : {})
    }];
  }));
  const foraDaEscala = Object.entries(atuais).filter(([fKey, p]) => p.agendado && !Object.hasOwn(daEscala, fKey));
  return { ...Object.fromEntries(foraDaEscala), ...daEscala };
}

// Os voos fixos sem os agendados das chaves. Na Demanda, o voo agendado sai com o pedido que ele fixava: com a missão
// extra tirada, ou com outra missão, outro recurso ou outras horas no pedido (o agendamento era do pedido de antes; a
// demanda limpa solta o voo inteiro, em limparDemanda). O agendado que também tinha o instrutor escolhido sai inteiro (o
// pedido continua com o instrutor). O agendado com um status que fixa (fStatus: Em Voo, Atrasado, Pousou, Cancelado)
// continua fixo onde está, só sem a marca do agendamento, como os outros voos fixos pelo status (o voo em andamento, o
// que pousou e o cancelado não mudam de lugar). Os outros voos fixos (pela escala aprovada, pelo status ou só pelo
// instrutor escolhido) ficam
export function semAgendados(fixos, chaves, fStatus = null) {
  return Object.fromEntries(Object.entries(fixos || {}).flatMap(([fKey, p]) => {
    if (!p.agendado || !chaves.includes(fKey)) return [[fKey, p]];
    if (!fixoPeloStatus(fKey, fStatus)) return [];
    const { agendado: _, ...doStatus } = p;
    return [[fKey, doStatus]];
  }));
}

// "Limpar demanda" (a Demanda): cada pedido fica em branco, sem nada do voo de antes, e o voo dele fica solto. Do pedido
// saem a disponibilidade, a missão do curso, o pedido da agenda e o instrutor escolhido (como no pedido que a agenda
// reaproveita: deixarEmBranco, js/rules.js), e as missões extras; do dia, o voo fixo (pela escala aprovada, pelo
// instrutor escolhido, pelo agendamento na Escala ou pelo status), o status e o detalhe, que prenderiam o voo de novo ou
// voltariam com o Voa religado (o agendamento não passa para o pedido que vier depois). O voo em andamento ou que já
// pousou (Atrasado, Em Voo, Pousou) fica como está, com o pedido, o voo fixo (com as marcas: o agendado continua
// agendado), o status e o detalhe: a limpeza não apaga o registro de um voo que aconteceu. A escala aprovada é reaberta,
// como em Reabrir. Muda o estado; devolve quantos voos ficaram e se a escala foi reaberta
export function limparDemanda(estado) {
  const status = estado.fStatus || {};
  const limpos = new Set();
  let ficam = 0;
  // O voo do pedido fica (em andamento ou pousado) ou é limpo
  const fica = (stuId, mid) => {
    const fKey = chaveDoVoo(stuId, mid);
    if (STATUS_EM_ANDAMENTO.includes(status[fKey])) { ficam++; return true; }
    limpos.add(fKey);
    return false;
  };
  for (const s of estado.stu) {
    if (!fica(s.id, 0)) deixarEmBranco(s);
    s.extra = (Array.isArray(s.extra) ? s.extra : []).filter(ex => fica(s.id, ex.mid));
  }
  const semOsLimpos = dados => Object.fromEntries(Object.entries(dados || {}).filter(([fKey]) => !limpos.has(fKey)));
  const reaberta = Boolean(estado.aprovacao);
  estado.fStatus = semOsLimpos(estado.fStatus);
  estado.fObs = semOsLimpos(estado.fObs);
  estado.fixos = reaberta ? fixosAoReabrir(semOsLimpos(estado.fixos), estado.fStatus) : semOsLimpos(estado.fixos);
  estado.aprovacao = null;
  return { ficam, reaberta };
}

// O pedido do voo da chave voa: o aluno e o pedido estão na Demanda, com "Voa" ligado
function voaNaChave(estado, fKey) {
  const [stuId, mid] = fKey.split('_').map(Number);
  const aluno = (estado.stu || []).find(s => s.id === stuId);
  const pedido = aluno ? pedidoDoAluno(aluno, mid) : null;
  return Boolean(pedido && pedido.fly);
}

// Os voos fixos que a reversão de uma mudança nos voos fixos (a troca do instrutor, o reparo das Sugestões) devolve: os de
// antes dela, menos os das chaves que mudaram de agendamento depois dela (mudados, pelo histórico: js/reversoes.js; o
// voo fixo e o instrutor escolhido do pedido ficam como estão) e menos o voo agendado cujo agendamento não continua. De
// volta, ele prenderia o voo do aluno no horário, no recurso e com o instrutor de um agendamento que já não existe. O voo
// agendado de antes não volta:
// - com o pedido dele fora da Demanda ou com outra missão (soltos, pelo histórico: a Demanda soltou o voo agendado);
// - com o voo fixo de agora sem a marca do agendamento (o desfazer devolveu o voo fixo de antes do agendamento; a Demanda
//   tirou a marca do voo em andamento): o de agora fica;
// - com a chave sem voo fixo e o pedido fora da Demanda ou sem voar (a missão extra tirada, a demanda limpa, o
//   agendamento desfeito): nem o instrutor escolhido do pedido;
// - com a chave sem voo fixo, depois de uma mudança que não solta o voo agendado (soltaAgendado: false, a troca do
//   instrutor): o que o soltou depois dela continua valendo.
// O voo agendado que o próprio reparo soltou ("Soltar o voo"), com o pedido voando, volta. Devolve os voos fixos que
// voltam e as chaves dos pedidos que ficam com o instrutor escolhido de agora
export function fixosQueVoltam(estado, fixos, { mudados = new Set(), soltos = new Set(), soltaAgendado = true } = {}) {
  const atuais = estado.fixos || {};
  const semInstrutor = new Set(mudados);
  const voltam = {};
  for (const [fKey, p] of Object.entries(fixos || {})) {
    if (mudados.has(fKey)) continue;
    const atual = atuais[fKey];
    if (p.agendado && !atual && !voaNaChave(estado, fKey)) semInstrutor.add(fKey);
    else if (!p.agendado || !(soltos.has(fKey) || (atual ? !atual.agendado : !soltaAgendado))) voltam[fKey] = p;
  }
  return { fixos: voltam, semInstrutor };
}

// O voo fixo de antes que volta para a turma de Ground dele (desfazer o agendamento que o mudou de lugar:
// js/reversoes.js). A chave da turma volta só enquanto a turma continua como ele a deixou: os outros voos fixos dela no
// mesmo horário e com o mesmo instrutor. A turma que mudou de horário ou de instrutor depois do agendamento (pelas
// Sugestões) já não é a dele: ele volta numa turma só dele, sem chave (a turma fica com a chave do voo) ou, quando a chave
// do voo já é a de outra turma, com uma chave nova, como as do motor ("GND_<missão>_<período>_<instrutor>", com um número
// no fim quando repete). Duas turmas com a mesma chave seriam uma turma só para o motor: só o primeiro aluno que ele
// confere ocupa a sala e o instrutor, e a outra turma não ocuparia nada no horário dela
export function pinoDeVoltaNaTurma(fixos, fKey, pino, mis) {
  if (pino.r !== GROUND_REG) return pino;
  const chaveDe = (k, p) => p.classKey || k;
  const outros = Object.entries(fixos || {}).filter(([k, p]) => k !== fKey && p.r === GROUND_REG);
  const chave = chaveDe(fKey, pino);
  const comoEle = p => p.a === pino.a && p.b === pino.b && p.insId === pino.insId;
  if (outros.every(([k, p]) => chaveDe(k, p) !== chave || comoEle(p))) return pino;
  const { classKey: _, ...semChave } = pino;
  const usadas = new Set(outros.map(([k, p]) => chaveDe(k, p)));
  if (!usadas.has(fKey)) return semChave;
  const base = `GND_${mis}_${T.includes(pino.a) ? T.indexOf(pino.a) : periodoDoMinuto(pino.a)}_${pino.insId}`;
  let nova = base;
  for (let n = 2; usadas.has(nova); n++) nova = `${base}_${n}`;
  return { ...semChave, classKey: nova };
}

// Por que o voo está fixo (o texto do cadeado): o status de andamento (com o nome da tela), o agendamento na Escala, a
// escala aprovada ou o instrutor escolhido na Escala, nesta ordem
export function motivoDoFixo(fKey, { fStatus, aprovacao, voo, fixos }) {
  const status = (fStatus || {})[fKey];
  if (STATUS_QUE_FIXAM.includes(status)) return `Voo fixo: ${rotuloDoStatus(status, voo)}`;
  const pino = (fixos || {})[fKey];
  if (pino && pino.agendado) return 'Voo fixo: agendado na escala';
  if (aprovacao) return 'Voo fixo: escala aprovada';
  return pino && pino.escolhido ? 'Voo fixo: instrutor escolhido na escala' : 'Voo fixo';
}

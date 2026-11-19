// Escala aprovada: os voos fixos (horário, avião e instrutor de cada voo, pela chave aluno_missão_sessão) e quem
// aprovou. Os dados vêm do dia guardado, que pode ter sido gravado fora do app (pela API): só valem nos formatos certos.
import { rotuloDoStatus, STATUS_EM_ANDAMENTO } from './status.js';
import { CHAVE_DO_VOO, chaveDoVoo } from './voo.js';
import { MATRICULA } from './frota.js';
import { MINUTOS_DO_DIA } from './config.js';
import { blank } from './rules.js';

const minuto = v => Number.isInteger(v) && v >= 0 && v <= MINUTOS_DO_DIA;

export function normalizarFixos(fixos) {
  const dados = fixos && typeof fixos === 'object' ? fixos : {};
  return Object.fromEntries(Object.entries(dados).flatMap(([fKey, p]) => {
    if (!CHAVE_DO_VOO.test(fKey) || !p || typeof p !== 'object') return [];
    if (!minuto(p.a) || !minuto(p.b) || p.b <= p.a || typeof p.r !== 'string' || !MATRICULA.test(p.r) || !Number.isInteger(p.insId)) return [];
    return [[fKey, {
      a: p.a, b: p.b, r: p.r, insId: p.insId, ...(typeof p.classKey === 'string' && p.classKey.length <= 80 ? { classKey: p.classKey } : {}),
      // Fixo pelo instrutor escolhido na Escala
      ...(p.escolhido === true ? { escolhido: true } : {})
    }]];
  }));
}

export function normalizarAprovacao(aprovacao) {
  if (!aprovacao || typeof aprovacao !== 'object' || typeof aprovacao.em !== 'string' || Number.isNaN(Date.parse(aprovacao.em))) return null;
  return { em: aprovacao.em, por: typeof aprovacao.por === 'string' ? aprovacao.por.slice(0, 80) : '' };
}

// O voo fixo como o motor o recebe: o horário, o avião e o instrutor (e a turma, no Ground)
export const pinoDoVoo = o => ({ a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround ? { classKey: o.classKey } : {}) });

// O ciclo do cadeado. Em Voo, Atrasado, Pousou e Cancelado fixam o voo onde ele está (o pino que já havia
// continua); fora da escala aprovada, Pendente ou Confirmado o soltam, menos o fixo pelo instrutor escolhido na Escala.
// Reabrir a escala mantém os fixados pelo status e pela escolha do instrutor
const STATUS_QUE_FIXAM = ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado'];
export const fixoPeloStatus = (fKey, fStatus) => STATUS_QUE_FIXAM.includes((fStatus || {})[fKey]);

export function fixosAoMudarStatus(fixos, voo, status, { aprovada }) {
  const atuais = fixos || {};
  if (STATUS_QUE_FIXAM.includes(status)) return { ...atuais, [voo.fKey]: atuais[voo.fKey] || pinoDoVoo(voo) };
  if (aprovada || !atuais[voo.fKey] || atuais[voo.fKey].escolhido) return atuais;
  const { [voo.fKey]: _, ...resto } = atuais;
  return resto;
}

export const fixosAoReabrir = (fixos, fStatus) =>
  Object.fromEntries(Object.entries(fixos || {}).filter(([fKey, p]) => p.escolhido || STATUS_QUE_FIXAM.includes((fStatus || {})[fKey])));

// "Limpar demanda" (a Demanda): cada pedido fica em branco, sem nada do voo de antes, e o voo dele fica solto. Do pedido
// saem a disponibilidade, a missão do curso, o pedido da agenda e o instrutor escolhido (como no pedido que a agenda
// reaproveita), e as missões extras; do dia, o voo fixo (pela escala aprovada, pelo instrutor escolhido ou pelo status),
// o status e o detalhe, que prenderiam o voo de novo ou voltariam com o Voa religado. O voo em andamento ou que já
// pousou (Atrasado, Em Voo, Pousou) fica como está, com o pedido, o voo fixo, o status e o detalhe: a limpeza não apaga
// o registro de um voo que aconteceu. A escala aprovada é reaberta, como em Reabrir. Muda o estado; devolve quantos voos
// ficaram e se a escala foi reaberta
const CAMPOS_DO_VOO_DE_ANTES = ['jan', 'etapa', 'solicitacao', 'insId'];
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
    if (!fica(s.id, 0)) {
      Object.assign(s, blank());
      for (const campo of CAMPOS_DO_VOO_DE_ANTES) delete s[campo];
    }
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

// Por que o voo está fixo (o texto do cadeado): o status de andamento (com o nome da tela), a escala aprovada ou o
// instrutor escolhido na Escala
export function motivoDoFixo(fKey, { fStatus, aprovacao, voo, fixos }) {
  const status = (fStatus || {})[fKey];
  if (STATUS_QUE_FIXAM.includes(status)) return `Voo fixo: ${rotuloDoStatus(status, voo)}`;
  if (aprovacao) return 'Voo fixo: escala aprovada';
  return (fixos || {})[fKey] && fixos[fKey].escolhido ? 'Voo fixo: instrutor escolhido na escala' : 'Voo fixo';
}

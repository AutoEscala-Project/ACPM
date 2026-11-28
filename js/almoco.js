// O almoço do INVA (#104; Pedro, 28/11: "the operator uses common sense so that instructors have a 1 hour pause within
// [11AM, 2PM]"), branda, um passo próprio depois do C: para cada INVA que vem na data e voa perto do meio-dia, o motor tenta
// deixar uma hora livre seguida em algum lugar entre 11:00 e 14:00, e desiste dela quando não acha como mantê-la sem tirar
// um voo da escala, ou quando o operador pôs o voo ali (o fixo, o instrutor escolhido, o “Priorizar com”); então um aviso
// diz qual INVA ficou sem almoço. A pausa da data que já cobre 1 h dessa janela ("+ Pausa" ou
// "Almoço" em "Editar faixas", ou a que veio dos dados antigos: os dados não distinguem) substitui a do motor: ela é dura
// (js/disponibilidade.js), e o motor não reserva outra. A reserva do motor não é gravada (sem número de formato): só o
// aviso vai na escala.
// Livre quer dizer sem compromisso (voo, simulador ou aula de Ground; a turma conta uma vez, o cancelado não ocupa, o
// atrasado ocupa o horário novo, a volta do noturno até a hora em que ele fica livre): a pausa e o tempo fora das faixas
// são livres. "Voa perto do meio-dia": tem um compromisso que toca a janela; quem voa só de manhã ou só à tarde sempre
// tem a hora, então a regra só age quando um compromisso levaria a última hora livre (ou tocaria a hora reservada).
// Módulo puro: o motor (js/engine.js: as duas tentativas, a guarda e as horas para tentar), js/viabilidade.js (a regra), a
// compactação, a conferência da escala (o aviso, js/conferencia.js), o editor do voo e "+ Agendar voo" (o aviso antes de
// salvar) o usam.
import { faixasDe } from './disponibilidade.js';
import { statusDoVoo, unidadeDoVoo, ocupacaoDoVoo } from './voo.js';
import { intervaloEfetivo } from './status.js';
import { hm } from './format.js';

export const JANELA_DO_ALMOCO = Object.freeze({ de: 11 * 60, ate: 14 * 60 });
export const DURACAO_DO_ALMOCO = 60;

// Os intervalos ([a, b]) que tocam a janela, cortados nela, em ordem e juntos os que se tocam ou se cruzam
function naJanela(ocupados) {
  const { de, ate } = JANELA_DO_ALMOCO;
  const cortados = ocupados.map(([a, b]) => [Math.max(a, de), Math.min(b, ate)]).filter(([a, b]) => a < b).sort((p, q) => p[0] - q[0]);
  const juntos = [];
  for (const [a, b] of cortados) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else juntos.push([a, b]);
  }
  return juntos;
}

// Há uma hora seguida sem nenhum dos intervalos ocupados ([a, b], encostar não ocupa) entre 11:00 e 14:00
export function horaLivre(ocupados) {
  let inicio = JANELA_DO_ALMOCO.de;
  for (const [a, b] of naJanela(ocupados)) {
    if (a - inicio >= DURACAO_DO_ALMOCO) return true;
    inicio = b;
  }
  return JANELA_DO_ALMOCO.ate - inicio >= DURACAO_DO_ALMOCO;
}

// O compromisso [a, b) leva a última hora livre do INVA (ocupados: o que ele já tem). Quem já não tem a hora (um voo fixo,
// a volta do noturno, um voo que só cabia sem ela) não perde nada: a regra não o protege mais
export const tiraOAlmoco = (ocupados, a, b) => horaLivre(ocupados) && !horaLivre([...ocupados, [a, b]]);

// A pausa da data (as que se tocam juntas) que já cobre 1 h da janela: é o almoço do INVA
export function pausaDeAlmoco(x) {
  const { de, ate } = JANELA_DO_ALMOCO;
  return faixasDe(x).pausas.some(p => Math.min(p.ate, ate) - Math.max(p.de, de) >= DURACAO_DO_ALMOCO);
}

// O INVA tem o almoço do motor: vem na data e não tem a pausa que já é o almoço
export const comAlmocoDoMotor = x => Boolean(x && x.on) && !pausaDeAlmoco(x);

// O aviso, pelo começo do texto: ele não tem código (como os avisos do F1h, uma aba com a versão anterior continua lendo a
// escala gravada; um código novo a faria recusar a escala inteira)
export const INICIO_DO_SEM_ALMOCO = 'Sem almoço: ';
export const ehAvisoDoAlmoco = a => Boolean(a) && a.t === 'warn' && a.codigo === undefined && typeof a.m === 'string' && a.m.startsWith(INICIO_DO_SEM_ALMOCO);

// "das 10:10 às 12:10, das 12:40 às 13:40 e das 14:00 às 15:00"
const trechos = lista => {
  const itens = lista.map(([a, b]) => `das ${hm(a)} às ${hm(b)}`);
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens.join('');
};

// O que cada INVA ocupa na escala (out): cada unidade uma vez (a turma de Ground), sem as canceladas, o atrasado no horário
// novo, a volta do noturno até a hora em que ele fica livre; preso, o voo fixo (o motor não o move)
function compromissosNaEscala(state, out) {
  const unidades = new Map();
  for (const o of out) {
    const chave = unidadeDoVoo(o);
    (unidades.get(chave) || unidades.set(chave, []).get(chave)).push(o);
  }
  const porInstrutor = new Map();
  for (const voos of unidades.values()) {
    const v = voos.find(o => statusDoVoo(o, state.fStatus) !== 'Cancelado');
    if (!v) continue;
    const e = intervaloEfetivo(v, statusDoVoo(v, state.fStatus), (state.fObs || {})[v.fKey]);
    (porInstrutor.get(v.insId) || porInstrutor.set(v.insId, []).get(v.insId)).push({ intervalo: ocupacaoDoVoo(v, e.a, e.b), preso: voos.some(o => o.fixo) });
  }
  return porInstrutor;
}
const ocupadosNaEscala = (state, out) => new Map([...compromissosNaEscala(state, out)].map(([id, lista]) => [id, lista.map(c => c.intervalo)]));

// As horas que o motor tenta reservar para o INVA que ficou sem almoço (js/engine.js): a busca põe um pedido de cada vez, e
// o voo que veio antes pode ter levado a hora que outro pedido só deixava ali. Cada hora da janela que começa às 11:00,
// termina às 14:00, começa no fim de um compromisso dele ou termina no começo de um, sem tocar um voo fixo dele (o fixo
// fica onde está), em ordem; nenhuma quando os fixos sozinhos já tiram a hora
export function horasParaOAlmoco(state, out, insId) {
  const meus = compromissosNaEscala(state, out).get(insId) || [];
  const presos = meus.filter(c => c.preso).map(c => c.intervalo);
  if (!horaLivre(presos)) return [];
  const { de } = JANELA_DO_ALMOCO, ultimo = JANELA_DO_ALMOCO.ate - DURACAO_DO_ALMOCO;
  const inicios = [de, ultimo, ...meus.flatMap(({ intervalo: [a, b] }) => [b, a - DURACAO_DO_ALMOCO])].filter(m => m >= de && m <= ultimo);
  return [...new Set(inicios)].sort((p, q) => p - q).map(m => ({ de: m, ate: m + DURACAO_DO_ALMOCO }))
    .filter(h => !presos.some(([a, b]) => a < h.ate && h.de < b));
}

// Os avisos da escala pronta (o motor, a conferência sem o motor): cada INVA que vem e ficou sem a hora livre, na ordem
// do cadastro, com o que o ocupa na janela (o compromisso inteiro). Vale também para quem tem a pausa que é o almoço
// (só um voo fixo a ocupa)
export function avisosDoAlmoco(state, out) {
  const ocupados = ocupadosNaEscala(state, out);
  const avisos = [];
  for (const x of state.ins || []) {
    const meus = ocupados.get(x.id);
    if (!x.on || !meus || horaLivre(meus)) continue;
    const tocam = meus.filter(([a, b]) => a < JANELA_DO_ALMOCO.ate && b > JANELA_DO_ALMOCO.de).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    avisos.push({ t: 'warn', s: x.nm, m: `${INICIO_DO_SEM_ALMOCO}nenhuma hora livre seguida entre ${hm(JANELA_DO_ALMOCO.de)} e ${hm(JANELA_DO_ALMOCO.ate)} (ocupado ${trechos(tocam)}).`, insId: x.id });
  }
  return avisos;
}

// O aviso da mudança feita à mão (o editor do voo, "+ Agendar voo"): o INVA do voo que fica sem a hora livre com ela (o
// operador decide; a Escala avisa depois): "Sem almoço: Instrutor 01 fica sem nenhuma hora livre seguida entre …"
export function semAlmocoComAMudanca(state, antes, depois, insIds) {
  const tinham = new Set(avisosDoAlmoco(state, antes).map(a => a.insId));
  return depois.filter(a => ehAvisoDoAlmoco(a) && insIds.has(a.insId) && !tinham.has(a.insId))
    .map(a => `${INICIO_DO_SEM_ALMOCO}${a.s} fica sem ${a.m.slice(INICIO_DO_SEM_ALMOCO.length)}`);
}

// A frota (aviões e simuladores) fica no cadastro: cada recurso tem a matrícula, o tipo e os atributos dele. O
// operador acrescenta e retira recursos na aba Recursos e marca os atributos; o limite de peso e o controle das 50 horas
// vêm do tipo. A sala de Ground não faz parte da frota (é uma só, sempre disponível).
//
// Requisitos e atributos: cada voo tem requisitos (as regras, VFR ou IFR, que vêm da missão e do curso do aluno; o
// Parafuso), cada recurso tem atributos, e uma regra só diz se o recurso serve ao voo (aviaoServe) e o que ele exige do
// instrutor (exigenciasDoAviao). O motor, a compactação, a divisão das horas, a troca de matrículas e as sugestões usam
// estas regras, assim como o instrutor tem as habilitações dele (js/habilitacoes.js).
import { EQ, ACROBAT_REG, MIS, SO_VFR_INICIAL, HABILITACAO_PROPRIA_INICIAL, MATRICULA } from './config.js';
import { habilitacaoDoAviao, exigenciasDoRecurso, normalizarHabilitacoes } from './habilitacoes.js';

// A matrícula e a habilitação própria moram em js/config.js e js/habilitacoes.js; quem as importa daqui continua
export { MATRICULA, habilitacaoDoAviao };

export const TIPOS_DA_FROTA = ['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi'];

// Os atributos de um recurso e os tipos em que cada um vale: "Só Parafuso" (o C152 acrobático, que só voa Parafuso),
// "Só VFR" (o avião que voa missões IFR, mas não é homologado IFR) e "Habilitação própria" (o recurso exige do instrutor a
// habilitação dele, além da do tipo)
export const ATRIBUTOS_DO_RECURSO = {
  soParafuso: { nome: 'Só Parafuso', tipos: ['C152'] },
  soVfr: { nome: 'Só VFR', tipos: ['C172', 'PA-34'] },
  habilitacaoPropria: { nome: 'Habilitação própria', tipos: ['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi'] }
};
export const atributoVale = (atributo, tipo) => Object.hasOwn(ATRIBUTOS_DO_RECURSO, atributo) && ATRIBUTOS_DO_RECURSO[atributo].tipos.includes(tipo);

// As regras do voo: as da missão, ou as do curso do aluno (o Noturno do PC é IFR); sem nada, VFR
function regrasDoVoo({ mis, curso }) {
  const regra = Object.hasOwn(MIS, mis) ? MIS[mis] : null;
  if (!regra) return 'VFR';
  const doCurso = regra.porCurso && typeof curso === 'string' && Object.hasOwn(regra.porCurso, curso) ? regra.porCurso[curso] : null;
  return (doCurso && doCurso.regras) || regra.regras || 'VFR';
}

// Se o recurso serve ao voo ({ mis, eq, curso }): o tipo do voo; o Parafuso no C152 só no "Só Parafuso" (e ele só no
// Parafuso); o voo IFR só no avião homologado IFR
export const aviaoServe = (recurso, voo) => !motivoDoAviao(recurso, voo);
// Por que o recurso não serve ao voo: 'tipo-de-aviao', 'so-parafuso', 'so-vfr', ou null (serve)
export function motivoDoAviao(recurso, { mis, eq, curso }) {
  if (!recurso || recurso.tipo !== eq) return 'tipo-de-aviao';
  if (Boolean(recurso.soParafuso) !== (mis === 'Parafuso' && recurso.tipo === 'C152')) return 'so-parafuso';
  if (recurso.soVfr && regrasDoVoo({ mis, curso }) === 'IFR') return 'so-vfr';
  return null;
}

// O que o recurso exige do instrutor (a lista exige, js/habilitacoes.js) e se o instrutor tem tudo; a primeira que ele não
// tem é o motivo de ele não servir (nas Sugestões, no agendamento e no conflito do voo fixo)
export const exigenciasDoAviao = exigenciasDoRecurso;
export const instrutorVoaNoAviao = (instrutor, recurso) => exigenciasDoAviao(recurso).every(h => (instrutor.hab || []).includes(h));
export const habilitacaoQueFalta = (instrutor, recurso) => exigenciasDoAviao(recurso).find(h => !(instrutor.hab || []).includes(h)) || null;

// As matrículas que servem ao voo, na ordem da frota
export const matriculasParaOVoo = (frota, voo) => frota.filter(f => aviaoServe(f, voo)).map(f => f.reg);

// O recurso com os atributos que valem no tipo dele (marcados: true; os outros saem), o que ele exige do instrutor
// (exige: ids do registro, sem repetir, na ordem dele; sem a lista, a habilitação própria marcada vira a dele) e o inativo
// (só true fica). A habilitação própria é o espelho de exige: marcada quando exige tem a do próprio recurso
function recurso(f) {
  const propria = habilitacaoDoAviao(f.reg);
  const exige = Array.isArray(f.exige) ? normalizarHabilitacoes(f.exige) : f.habilitacaoPropria === true ? [propria] : [];
  const marcados = Object.keys(ATRIBUTOS_DO_RECURSO).filter(a => a !== 'habilitacaoPropria' && f[a] === true && atributoVale(a, f.tipo));
  return {
    reg: f.reg, tipo: f.tipo, ...Object.fromEntries(marcados.map(a => [a, true])),
    ...(exige.includes(propria) && atributoVale('habilitacaoPropria', f.tipo) ? { habilitacaoPropria: true } : {}),
    ...(exige.length ? { exige } : {}),
    ...(f.inativo === true ? { inativo: true } : {})
  };
}

// A frota com que o cadastro começa (passo 11 do formato dos dados), já no formato de agora (o PR-VOM com exige)
export const FROTA_INICIAL = Object.entries(EQ).flatMap(([tipo, regs]) =>
  regs.map(reg => recurso({
    reg, tipo, ...(reg === ACROBAT_REG ? { soParafuso: true } : {}), ...(SO_VFR_INICIAL.includes(reg) ? { soVfr: true } : {}),
    ...(HABILITACAO_PROPRIA_INICIAL.includes(reg) ? { habilitacaoPropria: true } : {})
  })));

// Um atributo marcado ou desmarcado (a caixa em Recursos › Frota e a reversão dela no histórico): a habilitação própria
// põe ou tira a do recurso de exige (o resto de exige fica); um atributo que não vale no tipo não muda nada
export function comAtributo(f, atributo, val) {
  if (!atributoVale(atributo, f.tipo)) return recurso(f);
  if (atributo !== 'habilitacaoPropria') return recurso({ ...f, [atributo]: val === true });
  const propria = habilitacaoDoAviao(f.reg);
  const exige = exigenciasDoRecurso(f).filter(h => h !== propria);
  return recurso({ ...f, exige: val ? [...exige, propria] : exige });
}

// Só recursos válidos (matrícula em maiúsculas, sem repetir, e um tipo conhecido); sem lista, a frota inicial
export function normalizarFrota(frota) {
  if (!Array.isArray(frota)) return FROTA_INICIAL.map(recurso);
  const vistas = new Set();
  return frota.filter(f => f && typeof f === 'object').map(f => ({ ...f, reg: typeof f.reg === 'string' ? f.reg.trim().toUpperCase() : '' }))
    .filter(f => MATRICULA.test(f.reg) && TIPOS_DA_FROTA.includes(f.tipo) && !vistas.has(f.reg) && vistas.add(f.reg))
    .map(recurso);
}

// As matrículas de um tipo. As que só voam Parafuso ficam para o Parafuso (e só para ele)
export const matriculasDoTipo = (frota, tipo, { parafuso = false } = {}) => frota
  .filter(f => f.tipo === tipo && Boolean(f.soParafuso) === (parafuso && tipo === 'C152'))
  .map(f => f.reg);

export const recursoDaFrota = (frota, r) => frota.find(f => f.reg === r) || null;

// Um recurso novo (aba Recursos): devolve o recurso pronto, ou o motivo para não aceitar e o campo dele (reg ou tipo)
export function novoRecurso(frota, { reg, tipo, ...atributos }) {
  const matricula = typeof reg === 'string' ? reg.trim().toUpperCase() : '';
  if (!matricula) return { erro: 'Informe a matrícula.', campo: 'reg' };
  if (!MATRICULA.test(matricula)) return { erro: 'Matrícula inválida: use letras, números e hífen (por exemplo, PR-ABC).', campo: 'reg' };
  if (!TIPOS_DA_FROTA.includes(tipo)) return { erro: 'Escolha a categoria.', campo: 'tipo' };
  if (recursoDaFrota(frota, matricula)) return { erro: `Já existe um recurso com a matrícula ${matricula}.`, campo: 'reg' };
  return { recurso: recurso({ ...atributos, reg: matricula, tipo }) };
}

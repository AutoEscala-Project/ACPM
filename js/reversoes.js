// As reversões do histórico. O que "Reverter" desfaz vem gravado no histórico (no servidor, por
// quem tem conta de operador), então só vale no formato que o próprio app produz: a reversão fora dele não vira botão
// nem é aplicada. Um recurso retirado volta pela mesma validação do "+ Novo recurso".
import { novoRecurso, MATRICULA, ATRIBUTOS_DO_RECURSO } from './frota.js';
import { normalizarFixos } from './fixos.js';
import { CATEGORIAS_COM_HORARIOS, normalizarHorarios } from './horarios.js';
import { disponibilidadeValida } from './rules.js';
import { MINUTOS_DO_DIA } from './config.js';
import { CHAVE_DO_VOO } from './voo.js';

const idValido = v => Number.isInteger(v) && v > 0;
const rotulo = v => (typeof v === 'string' && v.length <= 40 ? v : '↶ Reverter');

// A reversão limpa (só os campos dela), ou null
export function validarReversao(rev, frota) {
  if (!rev || typeof rev !== 'object' || Array.isArray(rev)) return null;
  const label = rotulo(rev.label);
  if (rev.kind === 'setFly') {
    const mid = rev.mid === undefined ? 0 : rev.mid;
    // extras: as missões extras que saíram junto com a principal
    const extras = Array.isArray(rev.extras) && rev.extras.length <= 20 && rev.extras.every(m => Number.isInteger(m) && m > 0) ? rev.extras : null;
    if (rev.extras !== undefined && !extras) return null;
    return idValido(rev.stuId) && Number.isInteger(mid) && mid >= 0 && typeof rev.val === 'boolean'
      ? { kind: 'setFly', stuId: rev.stuId, mid, val: rev.val, ...(extras ? { extras: [...extras] } : {}), label } : null;
  }
  if (rev.kind === 'setAv') {
    return typeof rev.reg === 'string' && MATRICULA.test(rev.reg) && typeof rev.val === 'boolean' ? { kind: 'setAv', reg: rev.reg, val: rev.val, label } : null;
  }
  // Um atributo de um recurso (Só Parafuso, Só VFR ou Habilitação própria)
  if (rev.kind === 'setAtributo') {
    return typeof rev.reg === 'string' && MATRICULA.test(rev.reg) && Object.hasOwn(ATRIBUTOS_DO_RECURSO, rev.atributo) && typeof rev.val === 'boolean'
      ? { kind: 'setAtributo', reg: rev.reg, atributo: rev.atributo, val: rev.val, label } : null;
  }
  if (rev.kind === 'setInsOn') return idValido(rev.insId) && typeof rev.val === 'boolean' ? { kind: 'setInsOn', insId: rev.insId, val: rev.val, label } : null;
  if (rev.kind === 'restaurarFixos') {
    const fixos = rev.fixos && typeof rev.fixos === 'object' ? normalizarFixos(rev.fixos) : {};
    // O reparo também muda o instrutor escolhido dos pedidos: como estavam
    const pedidos = rev.pedidos === undefined ? [] : rev.pedidos;
    if (!Array.isArray(pedidos) || pedidos.length > 100 || !pedidos.every(p => p && idValido(p.stuId) && Number.isInteger(p.mid) && p.mid >= 0 && idValido(p.insId))) return null;
    return Object.keys(fixos).length ? { kind: 'restaurarFixos', fixos, ...(pedidos.length ? { pedidos: pedidos.map(p => ({ stuId: p.stuId, mid: p.mid, insId: p.insId })) } : {}), label } : null;
  }
  // O instrutor escolhido de antes (insId 0: "Automático") nos pedidos, e os voos fixos como estavam (soltar: os que
  // não eram fixos)
  if (rev.kind === 'restaurarEscolha') {
    if (!Array.isArray(rev.pedidos) || !rev.pedidos.length || rev.pedidos.length > 100 || !Array.isArray(rev.soltar) || rev.soltar.length > 100) return null;
    const pedidos = rev.pedidos.map(p => (p && typeof p === 'object' && idValido(p.stuId) && Number.isInteger(p.mid) && p.mid >= 0
      && (p.insId === 0 || idValido(p.insId)) ? { stuId: p.stuId, mid: p.mid, insId: p.insId } : null));
    const fixos = rev.fixos && typeof rev.fixos === 'object' ? normalizarFixos(rev.fixos) : {};
    if (!pedidos.every(Boolean) || !rev.soltar.every(k => typeof k === 'string' && CHAVE_DO_VOO.test(k))) return null;
    return { kind: 'restaurarEscolha', pedidos, fixos, soltar: [...rev.soltar], label };
  }
  // Os horários de uma categoria e os pedidos que mudaram com eles
  if (rev.kind === 'restaurarHorarios') {
    if (!CATEGORIAS_COM_HORARIOS.includes(rev.cat) || !Array.isArray(rev.lista) || !Array.isArray(rev.pedidos) || rev.pedidos.length > 500) return null;
    const lista = normalizarHorarios({ [rev.cat]: rev.lista })[rev.cat];
    if (lista.length !== rev.lista.length) return null;
    const preferencia = v => Number.isInteger(v) && v >= -1 && v <= MINUTOS_DO_DIA;
    const pedidos = rev.pedidos.map(p => (p && typeof p === 'object' && idValido(p.stuId) && Number.isInteger(p.mid) && p.mid >= 0
      && preferencia(p.p1) && preferencia(p.p2) && (p.jan === undefined || disponibilidadeValida(p.jan))
      ? { stuId: p.stuId, mid: p.mid, p1: p.p1, p2: p.p2, ...(p.jan === undefined ? {} : { jan: p.jan }) } : null));
    return pedidos.every(Boolean) ? { kind: 'restaurarHorarios', cat: rev.cat, lista, pedidos, label } : null;
  }
  if (rev.kind === 'readicionarRecurso') {
    const { recurso } = novoRecurso(frota, rev.recurso && typeof rev.recurso === 'object' ? rev.recurso : {});
    return recurso ? { kind: 'readicionarRecurso', recurso, av: rev.av !== false, label } : null;
  }
  return null;
}

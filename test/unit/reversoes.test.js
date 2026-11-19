// O que "Reverter" desfaz no histórico: a reversão vem gravada no histórico, então só vale no
// formato que o próprio app produz; o resto não vira botão nem é aplicado.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validarReversao } from '../../js/reversoes.js';
import { FROTA_INICIAL } from '../../js/frota.js';

const ATAQUE = 'x"><img/src/onerror=window.__xss=1>';

// Uma reversão válida de cada tipo, com todos os campos que o app grava
const VALIDAS = [
  { kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [1001, 1002], label: '↶ Restaurar' },
  { kind: 'setAv', reg: 'PR-VOB', val: true, label: '↶ Reverter' },
  { kind: 'setAtributo', reg: 'PR-CPL', atributo: 'soVfr', val: false, label: '↶ Reverter' },
  { kind: 'setInsOn', insId: 3, val: true, label: '↶ Reverter' },
  { kind: 'restaurarFixos', fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1, classKey: 'g', escolhido: true } }, pedidos: [{ stuId: 1000, mid: 0, insId: 2 }], label: '↶ Reverter' },
  { kind: 'restaurarEscolha', pedidos: [{ stuId: 1000, mid: 0, insId: 0 }], fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, soltar: ['1001_2_1'], label: '↶ Reverter' },
  { kind: 'restaurarHorarios', cat: 'PA-34', lista: [390, 450], pedidos: [{ stuId: 1000, mid: 2, p1: 450, p2: -1, jan: 'h450' }], label: '↶ Reverter' },
  { kind: 'readicionarRecurso', recurso: { reg: 'PR-NEW', tipo: 'C172', soVfr: true }, av: false, label: '↶ Reverter' }
];
// O que o histórico adulterado pode trazer em qualquer campo (é JSON): objetos que não viram texto (sem um toString ou
// um valueOf que sirva), listas deles, os nomes do protótipo e os tipos trocados
const HOSTIS = [JSON.parse('{"toString":null}'), JSON.parse('{"toString":null,"valueOf":null}'), JSON.parse('{"toString":{}}'),
  JSON.parse('[{"toString":null}]'), JSON.parse('{"__proto__":{"toString":null}}'), {}, [], null, 1.5, -1, '', 'toString', '__proto__', 'constructor', true];
// Cada campo da reversão, e cada campo dos objetos e das listas dentro dela
const caminhos = (valor, prefixo = []) => (valor && typeof valor === 'object'
  ? Object.keys(valor).flatMap(k => [[...prefixo, k], ...caminhos(valor[k], [...prefixo, k])]) : []);
function trocar(valor, [campo, ...resto], novo) {
  const copia = Array.isArray(valor) ? [...valor] : { ...valor };
  copia[campo] = resto.length ? trocar(valor[campo], resto, novo) : novo;
  return copia;
}

describe('Reversões do histórico', () => {
  it('as que o app grava passam, com o rótulo', () => {
    assert.deepEqual(validarReversao({ kind: 'setFly', stuId: 1000, mid: 0, val: false, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setFly', stuId: 1000, mid: 0, val: false, label: '↶ Reverter' });
    // As missões extras que saíram com a principal
    assert.deepEqual(validarReversao({ kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [1001, 1002], label: '↶ Restaurar' }, FROTA_INICIAL),
      { kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [1001, 1002], label: '↶ Restaurar' });
    assert.deepEqual(validarReversao({ kind: 'setAv', reg: 'PR-VOB', val: true, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setAv', reg: 'PR-VOB', val: true, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'setInsOn', insId: 3, val: true, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setInsOn', insId: 3, val: true, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'restaurarFixos', fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'restaurarFixos', fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'readicionarRecurso', recurso: { reg: 'pr-new', tipo: 'C152' }, av: false, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'readicionarRecurso', recurso: { reg: 'PR-NEW', tipo: 'C152' }, av: false, label: '↶ Reverter' });
  });

  it('fora do formato, ou um recurso que já voltou à frota, não vale', () => {
    const ruins = [
      null, 'x', { kind: ATAQUE }, { kind: 'setFly', stuId: ATAQUE, val: true }, { kind: 'setFly', stuId: 1000, mid: 0, val: 'sim' }, { kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [ATAQUE] },
      { kind: 'setAv', reg: ATAQUE, val: true }, { kind: 'setAv', reg: '__proto__', val: true }, { kind: 'setInsOn', insId: 1.5, val: true },
      { kind: 'restaurarFixos', fixos: { [ATAQUE]: { a: 1 } } }, { kind: 'readicionarRecurso', recurso: { reg: ATAQUE, tipo: 'C152' } },
      { kind: 'readicionarRecurso', recurso: { reg: 'PR-VOB', tipo: 'C152' } }
    ];
    for (const rev of ruins) assert.equal(validarReversao(rev, FROTA_INICIAL), null, JSON.stringify(rev));
  });

  // A entrada adulterada só perde o botão: a validação nunca lança (o painel do Histórico, que a chama para cada entrada,
  // não seria desenhado), e o que ela devolve tem só os valores do formato do app
  it('qualquer campo adulterado, de qualquer tipo de reversão, não lança: a reversão vale limpa ou não vale', () => {
    for (const rev of VALIDAS) {
      assert.deepEqual(validarReversao(rev, FROTA_INICIAL), rev);
      for (const caminho of caminhos(rev)) {
        for (const hostil of HOSTIS) {
          const adulterada = trocar(rev, caminho, hostil);
          const onde = `${rev.kind}.${caminho.join('.')} = ${JSON.stringify(hostil)}`;
          let limpa;
          assert.doesNotThrow(() => { limpa = validarReversao(adulterada, FROTA_INICIAL); }, onde);
          if (limpa) assert.deepEqual(validarReversao(limpa, FROTA_INICIAL), limpa, onde);
        }
      }
    }
  });

  it('o atributo é o nome de um atributo, em texto (uma lista com o nome não vale)', () => {
    const rev = VALIDAS.find(r => r.kind === 'setAtributo');
    for (const atributo of [['soVfr'], JSON.parse('{"toString":null}'), 'toString', 'hasOwnProperty']) {
      assert.equal(validarReversao({ ...rev, atributo }, FROTA_INICIAL), null, JSON.stringify(atributo));
    }
  });

  it('o rótulo é um texto curto; fora disso, "↶ Reverter"', () => {
    assert.equal(validarReversao({ kind: 'setInsOn', insId: 3, val: true, label: 'x'.repeat(200) }, FROTA_INICIAL).label, '↶ Reverter');
    assert.equal(validarReversao({ kind: 'setInsOn', insId: 3, val: true }, FROTA_INICIAL).label, '↶ Reverter');
  });

  // Os horários de uma categoria e os pedidos que mudaram com eles
  it('os horários: a categoria da lista, horários do dia e os pedidos nos formatos do app', () => {
    const rev = { kind: 'restaurarHorarios', cat: 'PA-34', lista: [390, 450], pedidos: [{ stuId: 1000, mid: 0, p1: 450, p2: -1 }, { stuId: 1001, mid: 2, p1: 500, p2: 610, jan: 'h500' }], label: '↶ Reverter' };
    assert.deepEqual(validarReversao(rev, FROTA_INICIAL), rev);
    assert.deepEqual(validarReversao({ ...rev, pedidos: [] }, FROTA_INICIAL), { ...rev, pedidos: [] });
    for (const ruim of [{ cat: 'Sala' }, { lista: [390, 2000] }, { lista: 'x' }, { pedidos: [{ stuId: 0, mid: 0, p1: 1, p2: 1 }] },
      { pedidos: [{ stuId: 1, mid: 0, p1: 450, p2: -1, jan: '<img>' }] }, { pedidos: 'x' }]) {
      assert.equal(validarReversao({ ...rev, ...ruim }, FROTA_INICIAL), null, JSON.stringify(ruim));
    }
  });
});

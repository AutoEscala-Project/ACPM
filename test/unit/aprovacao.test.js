// O H em js/aprovacao.js: o que a Aprovação faz com os voos fixos. Aprovar fixa o que a escala deixa entrar (cada voo dela,
// fixosAoAprovar); reabrir solta o que não é do operador nem do status, e fica registrada (d33); na escala aprovada, os
// voos que entraram depois (sem pino: o da lista de espera que a conciliação pôs, E) são os "N voos novos", que um botão
// fixa onde estão, sem rodar o motor. Puro
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aprovar, reabrir, voosNovos, fixarVoosNovos } from '../../js/aprovacao.js';

const voo = (stuId, mid, extra = {}) => ({ fKey: `${stuId}_${mid}_1`, stuId, mid, a: 500, b: 560, r: 'PP-LJV', insId: 1, ...extra });
const quem = { em: '2026-11-28T12:00:00.000Z', por: 'Operador 01' };

describe('aprovar', () => {
  it('cada voo da escala fica fixo onde está, e a aprovação diz quando e quem', () => {
    const out = [voo(1000, 1), voo(1001, 1, { a: 520, b: 580, r: 'PR-BTB', insId: 2 })];
    const { fixos, aprovacao } = aprovar({ fixos: {} }, out, quem);
    assert.deepEqual(fixos, {
      '1000_1_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1 },
      '1001_1_1': { a: 520, b: 580, r: 'PR-BTB', insId: 2 }
    });
    assert.deepEqual(aprovacao, quem);
  });

  it('as marcas do operador continuam (o escolhido, o agendado, o Noturno), e o agendado fora da escala fica fixo', () => {
    const antes = { '1000_1_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1, escolhido: true }, '1002_1_1': { a: 600, b: 660, r: 'PP-LJV', insId: 1, agendado: true } };
    const { fixos } = aprovar({ fixos: antes }, [voo(1000, 1)], quem);
    assert.equal(fixos['1000_1_1'].escolhido, true);
    assert.deepEqual(fixos['1002_1_1'], antes['1002_1_1']);
  });

  it('o nome de quem aprova vai até 80 letras; sem a data válida, nada aprova', () => {
    assert.equal(aprovar({ fixos: {} }, [], { ...quem, por: 'x'.repeat(200) }).aprovacao.por, 'x'.repeat(80));
    assert.equal(aprovar({ fixos: {} }, [voo(1000, 1)], { em: 'agora', por: 'A' }), null);
  });
});

describe('reabrir', () => {
  it('solta os voos fixos pela aprovação, mantém os do operador e os do status que fixa, e registra a reabertura', () => {
    const fixos = {
      '1000_1_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1 },
      '1001_1_1': { a: 520, b: 580, r: 'PR-BTB', insId: 2, agendado: true },
      '1002_1_1': { a: 600, b: 660, r: 'PP-LJV', insId: 1 }
    };
    const r = reabrir({ fixos, fStatus: { '1002_1_1': 'Em Voo' } }, quem);
    assert.deepEqual(Object.keys(r.fixos).sort(), ['1001_1_1', '1002_1_1']);
    assert.equal(r.aprovacao, null);
    assert.deepEqual(r.reabertura, quem);
  });

  it('sem a data válida, nada reabre', () => {
    assert.equal(reabrir({ fixos: {}, fStatus: {} }, { em: '', por: 'A' }), null);
  });
});

describe('voosNovos e fixarVoosNovos', () => {
  const fixos = { '1000_1_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1 } };
  const out = [voo(1000, 1), voo(1001, 1, { a: 520, b: 580, r: 'PR-BTB', insId: 2 }), voo(1002, 1, { isGround: true, classKey: 'g1', r: 'SALA-GROUND', insId: 3 })];

  it('os voos da escala sem pino, na ordem dela; a volta do noturno não conta', () => {
    assert.deepEqual(voosNovos(fixos, out).map(o => o.fKey), ['1001_1_1', '1002_1_1']);
    assert.deepEqual(voosNovos(fixos, [...out, { ...voo(1003, 1), trecho: 'volta' }]).map(o => o.fKey), ['1001_1_1', '1002_1_1']);
    assert.deepEqual(voosNovos({}, []), []);
    assert.deepEqual(voosNovos(undefined, [voo(1000, 1)]).map(o => o.fKey), ['1000_1_1']);
  });

  it('fixa cada novo onde está (o Ground com a turma) e não mexe nos outros pinos', () => {
    const depois = fixarVoosNovos(fixos, out);
    assert.deepEqual(depois['1000_1_1'], fixos['1000_1_1']);
    assert.deepEqual(depois['1001_1_1'], { a: 520, b: 580, r: 'PR-BTB', insId: 2 });
    assert.deepEqual(depois['1002_1_1'], { a: 500, b: 560, r: 'SALA-GROUND', insId: 3, classKey: 'g1' });
    assert.deepEqual(voosNovos(depois, out), [], 'depois, nenhum novo');
    assert.deepEqual(fixos, { '1000_1_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1 } }, 'o de antes não muda');
  });
});

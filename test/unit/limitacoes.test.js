// As limitações do aluno (L, formato 31; N3, N9): os tipos de recurso em que ele voa e os horários em que pode voar (todas
// as datas, ou só nos dias da semana nomeados), duras para o motor. js/limitacoes.js, puro: a normalização do que vem
// gravado, as regras (o tipo, o início: a regra das faixas dos INVAs, R4) e os textos da tela e do motor
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAXIMO_DE_HORARIOS, normalizarLimitacoes } from '../../js/limitacoes.js';

describe('normalizarLimitacoes: só o que tem o formato fica; vazio, nada', () => {
  it('sem limitação (ausente, vazia, de outro tipo): null', () => {
    for (const v of [undefined, null, {}, [], 'C172', 3, { recursos: [] }, { horarios: [] }, { recursos: ['A320'] }, { horarios: [{ de: 9, ate: 3 }] }]) {
      assert.equal(normalizarLimitacoes(v), null, JSON.stringify(v));
    }
  });

  it('os tipos: só os de avião e de simulador, sem repetir, na ordem da frota; a Sala Ground não é um deles', () => {
    assert.deepEqual(normalizarLimitacoes({ recursos: ['Sim. Multi', 'C172', 'C172', 'Sala Ground', 'x', 7, null] }), { recursos: ['C172', 'Sim. Multi'] });
  });

  it('os horários: { de, ate } em minutos, [de, ate), de 06:00 à meia-noite, os dias da semana (0 a 6) ou nenhum', () => {
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 780, ate: 1080, dias: [5, 1, 3, 3], x: 1 }, { de: 420, ate: 720 }] }),
      { horarios: [{ de: 420, ate: 720 }, { de: 780, ate: 1080, dias: [1, 3, 5] }] });
    // Fora do formato: o fim antes do começo, fora do dia, não inteiro, os dias vazios ou fora de 0 a 6, de outro tipo
    for (const h of [{ de: 600, ate: 600 }, { de: 300, ate: 600 }, { de: 600, ate: 1450 }, { de: 600.5, ate: 700 }, { de: '600', ate: 700 },
      { de: 600, ate: 700, dias: [] }, { de: 600, ate: 700, dias: [7] }, { de: 600, ate: 700, dias: 'seg' }, null, 'x']) {
      assert.equal(normalizarLimitacoes({ horarios: [h] }), null, JSON.stringify(h));
    }
    // Todos os sete dias: o mesmo que todas as datas
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 600, ate: 700, dias: [0, 1, 2, 3, 4, 5, 6] }] }), { horarios: [{ de: 600, ate: 700 }] });
    // Das 06:00 (o primeiro horário que uma lista de decolagem aceita) à meia-noite
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 360, ate: 1440 }, { de: 350, ate: 400 }] }), { horarios: [{ de: 360, ate: 1440 }] });
  });

  it(`no máximo ${MAXIMO_DE_HORARIOS} horários, na ordem do começo; os dois juntos`, () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ de: 400 + i * 60, ate: 430 + i * 60 }));
    assert.equal(normalizarLimitacoes({ horarios: muitos }).horarios.length, MAXIMO_DE_HORARIOS);
    assert.deepEqual(normalizarLimitacoes({ recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }], outro: 1 }), { recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }] });
  });

  it('não muda o que recebe', () => {
    const v = { recursos: ['C172', 'C172'], horarios: [{ de: 780, ate: 1080, dias: [3, 1] }] };
    const copia = structuredClone(v);
    normalizarLimitacoes(v);
    assert.deepEqual(v, copia);
  });
});

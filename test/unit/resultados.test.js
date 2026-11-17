// Resultados das missões dos cursos: o operador registra aprovado ou reprovado (pendente desfaz um engano);
// os registros só crescem e a situação de cada missão é o último. A próxima missão e o progresso, que saem da
// situação, estão em progresso.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoPorMissao, situacaoDa, resultadoDoVoo, validarRegistro } from '../../js/resultados.js';

const reg = (id, aluno, curso, missao, resultado, extra = {}) => ({ id, aluno, curso, missao, resultado, data: '2026-11-10', voo: null, ...extra });

describe('Resultados das missões', () => {
  it('a situação de cada missão é o último registro; sem registro, pendente', () => {
    const mapa = situacaoPorMissao([
      reg(1, 1000, 'PP', 'PP-01', 'reprovado'), reg(2, 1000, 'PP', 'PP-01', 'aprovado'), reg(3, 1000, 'PP', 'PP-02', 'aprovado'),
      reg(4, 1000, 'PP', 'PP-02', 'pendente'), reg(5, 1001, 'PP', 'PP-01', 'reprovado')
    ]);
    assert.deepEqual(['PP-01', 'PP-02', 'PP-03'].map(m => situacaoDa(mapa, 1000, 'PP', m)), ['aprovado', 'pendente', 'pendente']);
    assert.equal(situacaoDa(mapa, 1001, 'PP', 'PP-01'), 'reprovado');
    assert.equal(situacaoDa(mapa, 1000, 'PC', 'PP-01'), 'pendente', 'cada curso tem a sua situação');
  });

  it('o resultado de um voo na escala do dia: o último registro dele', () => {
    const doDia = [reg(1, 1000, 'PP', 'PP-01', 'aprovado', { voo: '1000_0_1' }), reg(2, 1001, 'PP', 'PP-02', 'reprovado', { voo: '1001_0_1' }),
      reg(3, 1000, 'PP', 'PP-01', 'reprovado', { voo: '1000_0_1' })];
    assert.equal(resultadoDoVoo(doDia, '1000_0_1'), 'reprovado');
    assert.equal(resultadoDoVoo(doDia, '1002_0_1'), null);
  });

  it('o registro: curso, código, resultado, data e voo nos formatos do servidor', () => {
    const certo = { aluno: 1000, curso: 'PP', missao: ' pp-07 ', resultado: 'aprovado', data: '2026-11-10', voo: '1000_0_1' };
    assert.deepEqual(validarRegistro(certo), { ...certo, missao: 'PP-07' });
    assert.deepEqual(validarRegistro({ ...certo, voo: null }).voo, null);
    for (const errado of [{ aluno: 0 }, { curso: 'XX' }, { missao: 'PP 07' }, { resultado: 'talvez' }, { data: '10/11/2026' }, { data: '2026-02-30' }, { voo: 'x' }]) {
      assert.throws(() => validarRegistro({ ...certo, ...errado }), e => e.code === '23514', JSON.stringify(errado));
    }
  });
});

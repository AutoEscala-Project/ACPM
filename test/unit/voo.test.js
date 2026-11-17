// O voo da escala: a chave, o status em vigor e a unidade (a turma de Ground ocupa o recurso uma vez só)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE_DO_VOO, chaveDoVoo, statusDoVoo, unidadeDoVoo, umPorUnidade, pedidoDoAluno, pedidosDosVoos } from '../../js/voo.js';

describe('A chave do voo', () => {
  it('é aluno_missão_1 (um pedido é um voo só)', () => {
    assert.equal(chaveDoVoo(1000, 0), '1000_0_1');
    assert.equal(chaveDoVoo(1012, 2), '1012_2_1');
  });

  it('o formato aceita só três números separados por "_"', () => {
    for (const valida of ['1000_0_1', '1_2_3']) assert.ok(CHAVE_DO_VOO.test(valida), valida);
    for (const invalida of ['1000_0', '1000_0_1_2', 'a_0_1', '1000_0_1 ', '<b>_0_1', '']) assert.ok(!CHAVE_DO_VOO.test(invalida), invalida);
  });
});

describe('O status em vigor do voo', () => {
  it('o status marcado no dia vale mais que o da linha da escala', () => {
    assert.equal(statusDoVoo({ fKey: '1000_0_1', status: 'Pendente' }, { '1000_0_1': 'Em Voo' }), 'Em Voo');
  });

  it('sem status no dia, vale o da linha; sem nenhum, Confirmado', () => {
    assert.equal(statusDoVoo({ fKey: '1000_0_1', status: 'Pendente' }, { '1001_0_1': 'Cancelado' }), 'Pendente');
    assert.equal(statusDoVoo({ fKey: '1000_0_1' }, {}), 'Confirmado');
    assert.equal(statusDoVoo({ fKey: '1000_0_1' }, undefined), 'Confirmado');
  });
});

describe('A unidade do voo', () => {
  it('a turma de Ground é uma unidade só; o voo, a dele', () => {
    assert.equal(unidadeDoVoo({ fKey: '1000_0_1', classKey: 'turma_1' }), 'turma_1');
    assert.equal(unidadeDoVoo({ fKey: '1000_0_1' }), '1000_0_1');
  });

  it('umPorUnidade deixa uma linha por unidade, na ordem da primeira, com a última linha de cada', () => {
    const lista = [
      { fKey: '1000_0_1', classKey: 'g', n: 1 },
      { fKey: '1001_0_1', n: 2 },
      { fKey: '1002_0_1', classKey: 'g', n: 3 }
    ];
    assert.deepEqual(umPorUnidade(lista).map(o => o.n), [3, 2]);
  });
});

describe('O pedido de um voo', () => {
  const extra = { mid: 2, mis: 'Voo Local' };
  const aluno = { id: 1000, mis: 'Navegação', extra: [extra] };

  it('a missão 0 é o pedido do próprio aluno; as outras, as missões extras dele', () => {
    assert.equal(pedidoDoAluno(aluno, 0), aluno);
    assert.equal(pedidoDoAluno(aluno, 2), extra);
    assert.equal(pedidoDoAluno(aluno, 3), undefined);
    assert.equal(pedidoDoAluno({ id: 1001 }, 1), undefined);
  });

  it('pedidosDosVoos acha o pedido de cada voo pelos alunos do dia; aluno que não está, nenhum', () => {
    const pedidoDe = pedidosDosVoos([aluno]);
    assert.equal(pedidoDe({ stuId: 1000, mid: 0 }), aluno);
    assert.equal(pedidoDe({ stuId: 1000, mid: 2 }), extra);
    assert.equal(pedidoDe({ stuId: 9999, mid: 0 }), undefined);
  });
});

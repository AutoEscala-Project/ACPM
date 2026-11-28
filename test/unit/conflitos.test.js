// Os textos curtos de por que o pedido ficou fora da escala (FORA_DA_ESCALA, js/conflitos.js): um para cada código de
// rejeição do motor, lidos pelo agendamento (js/agendamento.js) e, do G em diante, pelo Processamento
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FORA_DA_ESCALA, CODIGOS_DE_REJEICAO } from '../../js/conflitos.js';

describe('FORA_DA_ESCALA: o motivo curto de cada rejeição', () => {
  it('cada código de rejeição tem o seu texto, e nenhum texto sobra', () => {
    assert.deepEqual(Object.keys(FORA_DA_ESCALA).sort(), [...CODIGOS_DE_REJEICAO].sort());
    for (const [codigo, texto] of Object.entries(FORA_DA_ESCALA)) assert.match(texto, /^[a-zà-ú]/, `${codigo}: começa em minúscula, vai depois de "ficou fora:"`);
  });

  it('os textos de antes da mudança de arquivo, os mesmos', () => {
    assert.equal(FORA_DA_ESCALA['avioes-ocupados'], 'sem avião livre');
    assert.equal(FORA_DA_ESCALA['limite-de-locais'], 'o limite de voos locais no horário');
    assert.equal(FORA_DA_ESCALA['habilitacao-do-aviao'], 'sem a habilitação própria do avião');
  });

  // O J (S4) pôs a Sala Ground indisponível no mapa quando ele ainda estava em js/agendamento.js: o texto dele vem junto
  it('a Sala Ground indisponível (o J), com o texto que o J deu', () => {
    assert.equal(FORA_DA_ESCALA['sala-indisponivel'], 'a Sala Ground indisponível');
  });
});

// ONDE_RESOLVER (G2): onde se resolve cada rejeição do motor (a tela e as palavras do detalhe do Processamento)
describe('ONDE_RESOLVER: onde resolver cada rejeição', () => {
  it('cada código de rejeição tem o seu lugar: uma tela do app e o texto; nenhum sobra', async () => {
    const { ONDE_RESOLVER } = await import('../../js/conflitos.js');
    const { TELAS } = await import('../../js/telas.js');
    assert.deepEqual(Object.keys(ONDE_RESOLVER).sort(), [...CODIGOS_DE_REJEICAO].sort());
    for (const [codigo, onde] of Object.entries(ONDE_RESOLVER)) {
      assert.ok(Object.hasOwn(TELAS, onde.tela), `${codigo}: ${onde.tela}`);
      assert.match(onde.rotulo, /^[A-ZÀ-Ú]/, codigo);
    }
    assert.deepEqual(ONDE_RESOLVER.bloqueio, { tela: 'alu', rotulo: 'Alunos: Não escalar com' });
    assert.equal(ONDE_RESOLVER['instrutor-escolhido'].restricoes, true);
  });
});

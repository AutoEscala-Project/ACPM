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
});

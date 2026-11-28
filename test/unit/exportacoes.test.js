// O registro das exportações da data (js/exportacoes.js, formato 30): o que o dia guarda de cada arquivo exportado (o CSV,
// o PDF e o Excel: quando, por quem e a impressão do que foi exportado), que o H escreve. Do E, só a normalização: o que
// vem gravado pode ter sido escrito fora do app (pela API), e só o que tem o formato fica
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarExportacoes } from '../../js/exportacoes.js';

const csv = { em: '2026-11-10T21:10:00.000Z', por: 'Operador 01', impressao: '0a1b2c3d' };

describe('normalizarExportacoes', () => {
  it('as três (csv, pdf e xlsx), cada uma com a data, quem e a impressão de 8 hexadecimais', () => {
    const tres = { csv, pdf: { ...csv, impressao: 'ffffffff' }, xlsx: { ...csv, por: '' } };
    assert.deepEqual(normalizarExportacoes(tres), tres);
    assert.deepEqual(normalizarExportacoes({ csv }), { csv });
  });

  it('sem nada, ou com o que não é um registro: {}', () => {
    for (const vazio of [undefined, null, 0, 'csv', [], [csv], true, {}]) assert.deepEqual(normalizarExportacoes(vazio), {}, JSON.stringify(vazio));
  });

  it('o que não tem o formato sai: outro tipo, a data inválida, a impressão fora do formato; o nome vai até 80 letras', () => {
    assert.deepEqual(normalizarExportacoes({ csv, txt: csv, html: csv, constructor: csv }), { csv });
    for (const em of [undefined, null, '', 'ontem', 12, {}]) assert.deepEqual(normalizarExportacoes({ csv: { ...csv, em } }), {}, JSON.stringify(em));
    for (const impressao of [undefined, '', '0A1B2C3D', '0a1b2c3', '0a1b2c3d4', 'zzzzzzzz', 12345678, ['0a1b2c3d']]) {
      assert.deepEqual(normalizarExportacoes({ csv: { ...csv, impressao } }), {}, JSON.stringify(impressao));
    }
    assert.equal(normalizarExportacoes({ csv: { ...csv, por: 'x'.repeat(200) } }).csv.por, 'x'.repeat(80));
    for (const por of [undefined, null, 7, {}]) assert.equal(normalizarExportacoes({ csv: { ...csv, por } }).csv.por, '', JSON.stringify(por));
    assert.deepEqual(normalizarExportacoes({ csv: { ...csv, extra: '<img src=x>' } }), { csv }, 'só os três campos');
  });

  it('o valor adulterado não lança exceção nem passa adiante', () => {
    const adulterado = JSON.parse('{"__proto__": {"csv": 1}, "csv": {"em": {"toString": null}, "por": "a", "impressao": "0a1b2c3d"}, "pdf": {"toString": null}}');
    assert.deepEqual(normalizarExportacoes(adulterado), {});
    assert.equal(Object.getPrototypeOf(normalizarExportacoes({ csv })), Object.prototype);
  });
});

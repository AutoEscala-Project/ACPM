// ZIP do .xlsx (js/zip.js): o que ele grava, conferido por um leitor de fora (o zlib do Node, em test/helpers/xlsx.js),
// e o que ele lê, inclusive ZIPs que ele não gerou e arquivos estragados
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerZip, montarZip } from '../../js/zip.js';
import { abrirZip, zipGuardado } from '../helpers/xlsx.js';

const MODELO = new Uint8Array(readFileSync(new URL('../../modelos/escala-cavok.xlsx', import.meta.url)));
const bytes = t => new TextEncoder().encode(t);
// Conteúdos variados: vazio, todos os bytes, texto grande e repetitivo (comprime muito) e nome com acento
const ARQUIVOS = {
  '[Content_Types].xml': bytes('<?xml version="1.0"?><Types/>'),
  'vazio.txt': new Uint8Array(0),
  'bin/todos.bin': Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256),
  'xl/grande.xml': bytes('<a>Ação ✈ 𝄞 </a>'.repeat(8000)),
  'pasta/ção.xml': bytes('ç')
};

describe('ZIP gravado (montarZip)', () => {
  it('um leitor de fora lê os mesmos arquivos, na mesma ordem, com CRC, tamanhos e cabeçalhos certos', async () => {
    const zip = await montarZip(ARQUIVOS);
    const lidos = abrirZip(zip);
    assert.deepEqual([...lidos.keys()], Object.keys(ARQUIVOS));
    for (const [nome, conteudo] of Object.entries(ARQUIVOS)) assert.deepEqual(new Uint8Array(lidos.get(nome)), conteudo, nome);
  });

  it('comprime (deflate), marca os nomes como UTF-8 e não usa descritor de dados nem comentário', async () => {
    const zip = Buffer.from(await montarZip(ARQUIVOS));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.equal(zip.readUInt16LE(6), 0x0800, 'flags: só o bit 11 (UTF-8)');
    assert.equal(zip.readUInt16LE(8), 8, 'método deflate');
    assert.equal(zip.readUInt16LE(zip.length - 2), 0, 'sem comentário');
    assert.ok(zip.length < 20000, `o texto repetido comprime (${zip.length} bytes)`);
  });

  it('lerZip lê de volta o que montarZip gravou', async () => {
    const lidos = await lerZip(await montarZip(ARQUIVOS));
    assert.deepEqual(Object.keys(lidos), Object.keys(ARQUIVOS));
    for (const [nome, conteudo] of Object.entries(ARQUIVOS)) assert.deepEqual(lidos[nome], conteudo, nome);
  });
});

describe('ZIP lido (lerZip)', () => {
  it('lê o modelo do aeroclube e os mesmos arquivos que o leitor de fora', async () => {
    const lidos = await lerZip(MODELO), deFora = abrirZip(MODELO);
    assert.deepEqual(Object.keys(lidos), [...deFora.keys()]);
    for (const [nome, conteudo] of deFora) assert.deepEqual(lidos[nome], new Uint8Array(conteudo), nome);
  });

  it('lê um ZIP sem compressão e um com os tamanhos depois dos dados (descritor)', async () => {
    for (const descritor of [false, true]) {
      const lidos = await lerZip(zipGuardado(ARQUIVOS, { descritor }));
      assert.deepEqual(Object.keys(lidos), Object.keys(ARQUIVOS));
      for (const [nome, conteudo] of Object.entries(ARQUIVOS)) assert.deepEqual(lidos[nome], conteudo, `${nome} (descritor: ${descritor})`);
    }
  });

  it('recusa o que não é ZIP, o ZIP cortado, o CRC errado, o criptografado e outra compressão', async () => {
    await assert.rejects(lerZip(bytes('<html>não é um zip</html>')), /não é um ZIP/);
    const zip = await montarZip(ARQUIVOS);
    await assert.rejects(lerZip(zip.slice(0, zip.length - 30)), /não é um ZIP|corrompido/);
    await assert.rejects(lerZip(zip.slice(200)), /corrompido|não é um ZIP/);

    const guardado = zipGuardado({ 'a.txt': bytes('conteúdo original') });
    const comCrcErrado = guardado.slice();
    comCrcErrado[30 + 'a.txt'.length] ^= 0xff;
    await assert.rejects(lerZip(comCrcErrado), /corrompido \(a\.txt\)/);

    const criptografado = guardado.slice();
    const central = Buffer.from(criptografado.buffer).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    criptografado[central + 8] |= 1;
    await assert.rejects(lerZip(criptografado), /criptografado/);

    const bzip2 = guardado.slice();
    bzip2[central + 10] = 12;
    await assert.rejects(lerZip(bzip2), /Compressão 12 não suportada/);
  });
});

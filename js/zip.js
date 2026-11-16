// ZIP mínimo para a planilha do Excel (um .xlsx é um ZIP de arquivos XML): lê os arquivos do modelo e monta o ZIP de
// volta. A compressão é a do próprio navegador (CompressionStream, "deflate-raw"), sem biblioteca. Só o que o .xlsx
// usa: sem ZIP64, sem criptografia, sem arquivos divididos.

const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, FIM = 0x06054b50;
const GUARDADO = 0, COMPRIMIDO = 8;

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const passarPor = async (bytes, transformacao) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transformacao)).arrayBuffer());

// Os arquivos do ZIP: { caminho: bytes }, na ordem em que estão nele. O tamanho e o CRC de cada arquivo são conferidos
// (um modelo corrompido para aqui, e não numa planilha estragada)
export async function lerZip(zip) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let fim = zip.length - 22;
  while (fim >= 0 && v.getUint32(fim, true) !== FIM) fim--;
  if (fim < 0) throw new Error('O arquivo não é um ZIP.');
  const total = v.getUint16(fim + 10, true);
  const nomes = new TextDecoder();
  const arquivos = {};
  for (let i = 0, p = v.getUint32(fim + 16, true); i < total; i++) {
    if (p + 46 > zip.length || v.getUint32(p, true) !== CENTRAL) throw new Error('ZIP corrompido.');
    const flags = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const comprimido = v.getUint32(p + 20, true), tamanho = v.getUint32(p + 24, true);
    const n = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = nomes.decode(zip.subarray(p + 46, p + 46 + n));
    if (flags & 1) throw new Error(`Arquivo criptografado no ZIP (${nome}).`);
    if (local + 30 > zip.length || v.getUint32(local, true) !== LOCAL) throw new Error('ZIP corrompido.');
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (inicio + comprimido > zip.length) throw new Error(`ZIP corrompido (${nome}).`);
    const dados = zip.subarray(inicio, inicio + comprimido);
    let conteudo;
    if (metodo === GUARDADO) conteudo = dados.slice();
    else if (metodo === COMPRIMIDO) conteudo = await passarPor(dados, new DecompressionStream('deflate-raw'));
    else throw new Error(`Compressão ${metodo} não suportada (${nome}).`);
    if (conteudo.length !== tamanho || crc32(conteudo) !== crc) throw new Error(`ZIP corrompido (${nome}).`);
    arquivos[nome] = conteudo;
    p += 46 + n + extra + comentario;
  }
  return arquivos;
}

// O ZIP dos arquivos ({ caminho: bytes }), comprimidos
export async function montarZip(arquivos) {
  const nomes = new TextEncoder();
  const partes = [], central = [];
  let posicao = 0;
  for (const [caminho, bytes] of Object.entries(arquivos)) {
    const nome = nomes.encode(caminho);
    const dados = await passarPor(bytes, new CompressionStream('deflate-raw'));
    const crc = crc32(bytes);
    // Cabeçalho local (30 bytes) e o do diretório central (46): versão 2.0, nomes em UTF-8 (bit 11), data de 1/1/1980
    const local = new DataView(new ArrayBuffer(30));
    [[0, LOCAL, 4], [4, 20, 2], [6, 0x0800, 2], [8, COMPRIMIDO, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4],
      [18, dados.length, 4], [22, bytes.length, 4], [26, nome.length, 2], [28, 0, 2]]
      .forEach(([o, valor, t]) => (t === 4 ? local.setUint32(o, valor, true) : local.setUint16(o, valor, true)));
    const dir = new DataView(new ArrayBuffer(46));
    [[0, CENTRAL, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, COMPRIMIDO, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4],
      [20, dados.length, 4], [24, bytes.length, 4], [28, nome.length, 2], [42, posicao, 4]]
      .forEach(([o, valor, t]) => (t === 4 ? dir.setUint32(o, valor, true) : dir.setUint16(o, valor, true)));
    partes.push(new Uint8Array(local.buffer), nome, dados);
    central.push(new Uint8Array(dir.buffer), nome);
    posicao += 30 + nome.length + dados.length;
  }
  const tamanhoCentral = central.reduce((t, b) => t + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  const total = Object.keys(arquivos).length;
  [[0, FIM, 4], [8, total, 2], [10, total, 2], [12, tamanhoCentral, 4], [16, posicao, 4]]
    .forEach(([o, valor, t]) => (t === 4 ? fim.setUint32(o, valor, true) : fim.setUint16(o, valor, true)));
  return new Uint8Array(await new Blob([...partes, ...central, new Uint8Array(fim.buffer)]).arrayBuffer());
}

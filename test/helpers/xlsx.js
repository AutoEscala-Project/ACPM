// Conferência independente da planilha do modelo do aeroclube (o .xlsx da exportação para o CAVOK). Nada aqui usa
// js/zip.js ou js/planilha.js: o ZIP é lido com o zlib do Node, as linhas e as colunas saem dos rótulos da própria
// planilha (a coluna A, a T do PA-34 e as linhas Aluno/Instrutor) e o resultado é comparado com os voos.
import { inflateRawSync, crc32 } from 'node:zlib';

const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, FIM = 0x06054b50, DESCRITOR = 0x08074b50;

// Os arquivos do ZIP ({ caminho: Buffer }, na ordem), conferindo o fim do diretório central (sem comentário), cada
// entrada do diretório contra o cabeçalho local dela, as entradas em sequência e sem buracos, o tamanho e o CRC
export function abrirZip(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const falha = msg => { throw new Error(`ZIP inválido: ${msg}`); };
  const fim = b.length - 22;
  if (fim < 0 || b.readUInt32LE(fim) !== FIM) falha('sem o fim do diretório central nos últimos 22 bytes');
  const total = b.readUInt16LE(fim + 10), tamanhoCentral = b.readUInt32LE(fim + 12), inicioCentral = b.readUInt32LE(fim + 16);
  if (b.readUInt16LE(fim + 4) || b.readUInt16LE(fim + 6) || b.readUInt16LE(fim + 8) !== total) falha('ZIP em mais de um disco');
  if (inicioCentral + tamanhoCentral !== fim) falha('o diretório central não termina onde começa o fim dele');
  const arquivos = new Map();
  let p = inicioCentral, esperado = 0;
  for (let i = 0; i < total; i++) {
    if (b.readUInt32LE(p) !== CENTRAL) falha(`entrada ${i} do diretório sem assinatura`);
    const flags = b.readUInt16LE(p + 8), metodo = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16);
    const comprimido = b.readUInt32LE(p + 20), tamanho = b.readUInt32LE(p + 24);
    const n = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comentario = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nome = b.toString('utf8', p + 46, p + 46 + n);
    if (local !== esperado) falha(`${nome}: o cabeçalho local está em ${local}, e não em ${esperado}`);
    if (b.readUInt32LE(local) !== LOCAL) falha(`${nome}: cabeçalho local sem assinatura`);
    if (b.readUInt16LE(local + 6) !== flags || b.readUInt16LE(local + 8) !== metodo) falha(`${nome}: flags ou método diferentes no cabeçalho local`);
    const nLocal = b.readUInt16LE(local + 26), extraLocal = b.readUInt16LE(local + 28);
    if (b.toString('utf8', local + 30, local + 30 + nLocal) !== nome) falha(`${nome}: nome diferente no cabeçalho local`);
    const descritor = Boolean(flags & 0x08);
    if (!descritor && (b.readUInt32LE(local + 14) !== crc || b.readUInt32LE(local + 18) !== comprimido || b.readUInt32LE(local + 22) !== tamanho)) {
      falha(`${nome}: CRC ou tamanhos diferentes no cabeçalho local`);
    }
    const inicio = local + 30 + nLocal + extraLocal;
    const dados = b.subarray(inicio, inicio + comprimido);
    const conteudo = metodo === 8 ? inflateRawSync(dados) : metodo === 0 ? Buffer.from(dados) : falha(`${nome}: método ${metodo}`);
    if (conteudo.length !== tamanho) falha(`${nome}: ${conteudo.length} bytes, e não ${tamanho}`);
    if (crc32(conteudo) !== crc) falha(`${nome}: CRC errado`);
    if (arquivos.has(nome)) falha(`${nome} repetido`);
    arquivos.set(nome, conteudo);
    esperado = inicio + comprimido + (descritor ? (b.readUInt32LE(inicio + comprimido) === DESCRITOR ? 16 : 12) : 0);
    p += 46 + n + extra + comentario;
  }
  if (p !== fim) falha('sobra depois das entradas do diretório central');
  if (esperado !== inicioCentral) falha('sobra entre os arquivos e o diretório central');
  return arquivos;
}

// Um ZIP sem compressão (método 0), montado sem js/zip.js; descritor: os tamanhos e o CRC depois dos dados (bit 3)
export function zipGuardado(arquivos, { descritor = false } = {}) {
  const partes = [], central = [];
  let posicao = 0;
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const nome = Buffer.from(caminho), dados = Buffer.from(conteudo), crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(descritor ? 0x0808 : 0x0800, 6);
    if (!descritor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); }
    local.writeUInt16LE(nome.length, 26);
    const fimDosDados = descritor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (descritor) { fimDosDados.writeUInt32LE(DESCRITOR, 0); fimDosDados.writeUInt32LE(crc, 4); fimDosDados.writeUInt32LE(dados.length, 8); fimDosDados.writeUInt32LE(dados.length, 12); }
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(CENTRAL, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(descritor ? 0x0808 : 0x0800, 8);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(dados.length, 20); dir.writeUInt32LE(dados.length, 24); dir.writeUInt16LE(nome.length, 28);
    dir.writeUInt32LE(posicao, 42);
    partes.push(local, nome, dados, fimDosDados);
    central.push(dir, nome);
    posicao += 30 + nome.length + dados.length + fimDosDados.length;
  }
  const tamanhoCentral = central.reduce((t, x) => t + x.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(FIM, 0); fim.writeUInt16LE(central.length / 2, 8); fim.writeUInt16LE(central.length / 2, 10);
  fim.writeUInt32LE(tamanhoCentral, 12); fim.writeUInt32LE(posicao, 16);
  return new Uint8Array(Buffer.concat([...partes, ...central, fim]));
}

// O XML é bem formado? Marcas equilibradas, atributos entre aspas e sem repetir, "&" só em entidades, nenhum "<" solto
// e só caracteres que o XML aceita. Devolve o problema (ou null)
export function problemaNoXml(xml) {
  if (/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(xml)) return 'caractere que o XML não aceita';
  const entidadeSolta = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
  const nomeXml = '[A-Za-z_][\\w:.-]*';
  const token = new RegExp(`<\\?[\\s\\S]*?\\?>|<!--[\\s\\S]*?-->|<(/?)(${nomeXml})((?:\\s+${nomeXml}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(/?)>|([^<]+)|(<)`, 'gu');
  const pilha = [];
  let raizes = 0;
  for (const m of xml.matchAll(token)) {
    const [, fecha, nome, atributos, vazia, texto, solto] = m;
    if (solto) return `"<" fora de uma marca na posição ${m.index}`;
    if (texto !== undefined) {
      if (entidadeSolta.test(texto)) return `"&" solto no texto: ${texto.slice(0, 40)}`;
      if (!pilha.length && texto.trim()) return 'texto fora do elemento raiz';
      continue;
    }
    if (!nome) continue;
    if (fecha) {
      if (atributos || vazia) return `</${nome}> com atributos`;
      if (pilha.pop() !== nome) return `</${nome}> fecha outra marca`;
      continue;
    }
    const nomes = [...atributos.matchAll(new RegExp(`(${nomeXml})\\s*=`, 'g'))].map(a => a[1]);
    if (new Set(nomes).size !== nomes.length) return `atributo repetido em <${nome}>`;
    if (entidadeSolta.test(atributos)) return `"&" solto num atributo de <${nome}>`;
    if (!pilha.length && ++raizes > 1) return 'mais de um elemento raiz';
    if (!vazia) pilha.push(nome);
  }
  return pilha.length ? `<${pilha.at(-1)}> sem fechar` : raizes ? null : 'sem elemento raiz';
}

const desescapar = t => t.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (_, e) =>
  ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e] ?? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)));
// O texto como o Excel mostra: as entidades do XML e as sequências "_xHHHH_" do Office (o caractere U+HHHH)
const doOffice = t => t.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const textoDe = xml => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => doOffice(desescapar(m[1]))).join('');
const texto = (arquivos, nome) => arquivos.get(nome).toString('utf8');

// As células da planilha: o texto (resolvido do sharedStrings ou da própria célula), o estilo e o tipo de cada uma, e a
// altura de cada linha
export function lerPlanilha(arquivos) {
  const sst = arquivos.has('xl/sharedStrings.xml')
    ? [...texto(arquivos, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textoDe(m[1]))
    : [];
  const celulas = {}, estilos = {}, tipos = {};
  for (const m of texto(arquivos, 'xl/worksheets/sheet1.xml').matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, atributos, corpo = ''] = m;
    const tipo = (/\st="([^"]*)"/.exec(atributos) || [])[1];
    estilos[ref] = +((/\ss="(\d+)"/.exec(atributos) || [])[1] || 0);
    tipos[ref] = tipo;
    const valor = (/<v>([\s\S]*?)<\/v>/.exec(corpo) || [])[1];
    celulas[ref] = tipo === 's' ? sst[+valor] : tipo === 'inlineStr' ? textoDe(corpo) : valor === undefined ? '' : desescapar(valor);
  }
  const alturas = Object.fromEntries([...texto(arquivos, 'xl/worksheets/sheet1.xml').matchAll(/<row r="(\d+)"[^>]*?\sht="([\d.]+)"/g)].map(m => [m[1], +m[2]]));
  const aba = desescapar(/<sheet name="([^"]*)"/.exec(texto(arquivos, 'xl/workbook.xml'))[1]);
  return { celulas, estilos, tipos, aba, sst, alturas };
}

const listaDe = (xml, lista, item) => (new RegExp(`<${lista}\\b[^>]*>([\\s\\S]*?)</${lista}>`).exec(xml) || [null, ''])[1]
  .match(new RegExp(`<${item}\\b[^>]*?(?:/>|>[\\s\\S]*?</${item}>)`, 'g')) || [];
const contagemDe = (xml, lista) => +(new RegExp(`<${lista}\\b[^>]*\\bcount="(\\d+)"`).exec(xml) || [])[1];

// O fundo de um estilo de célula: o atributo da cor (rgb="FFFF0000", theme="0") ou null
export function fundoDoEstilo(arquivos, estilo) {
  const styles = texto(arquivos, 'xl/styles.xml');
  const fillId = +/fillId="(\d+)"/.exec(listaDe(styles, 'cellXfs', 'xf')[estilo])[1];
  const fg = /<fgColor ([^>]*?)\s*\/>/.exec(listaDe(styles, 'fills', 'fill')[fillId] || '');
  return fg ? fg[1] : null;
}
export const VERMELHO = 'rgb="FFFF0000"';

// O estilo quebra o texto em linhas?
export function quebraLinhas(arquivos, estilo) {
  return /<alignment\b[^>]*\bwrapText="1"/.test(listaDe(texto(arquivos, 'xl/styles.xml'), 'cellXfs', 'xf')[estilo]);
}

// O arquivo gerado tem a mesma estrutura do modelo: os mesmos arquivos na mesma ordem, todos os XML bem formados, as
// mesmas células, linhas e mesclagens, as contagens do styles.xml e do sharedStrings.xml certas, todo estilo existente,
// nenhuma fórmula e o nome da aba válido para o Excel. Devolve a lista de problemas
export function conferirEstrutura(modelo, saida) {
  const problemas = [];
  const conferir = (ok, msg) => { if (!ok) problemas.push(msg); };
  conferir(JSON.stringify([...saida.keys()]) === JSON.stringify([...modelo.keys()]), 'os arquivos ou a ordem deles mudaram');
  for (const [nome, conteudo] of saida) {
    if (/\.(xml|rels)$/.test(nome)) {
      const problema = problemaNoXml(conteudo.toString('utf8'));
      conferir(!problema, `${nome}: ${problema}`);
    } else conferir(modelo.has(nome) && conteudo.equals(modelo.get(nome)), `${nome} mudou`);
  }
  const MUDAM = ['xl/worksheets/sheet1.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/workbook.xml', 'docProps/app.xml'];
  for (const nome of [...modelo.keys()].filter(n => !MUDAM.includes(n))) conferir(saida.get(nome)?.equals(modelo.get(nome)), `${nome} mudou`);

  const folhaModelo = texto(modelo, 'xl/worksheets/sheet1.xml'), folha = texto(saida, 'xl/worksheets/sheet1.xml');
  const semDados = x => x.replace(/<sheetData>[\s\S]*<\/sheetData>/, '');
  conferir(semDados(folha) === semDados(folhaModelo), 'a planilha mudou fora das células (colunas, mesclagens, margens, vista)');
  const refs = x => [...x.matchAll(/<c r="([A-Z]+\d+)"/g)].map(m => m[1]).join(',');
  conferir(refs(folha) === refs(folhaModelo), 'células acrescentadas, retiradas ou fora de ordem');
  // As linhas só podem crescer (a altura de uma linha com mais texto), com a altura fixa: o resto da linha não muda
  const linhas = x => (x.match(/<row [^>]*>/g) || []);
  const semAltura = tag => tag.replace(/\sht="[\d.]+"/, '');
  const [lidas, doModelo] = [linhas(folha), linhas(folhaModelo)];
  conferir(lidas.map(semAltura).join('') === doModelo.map(semAltura).join(''), 'as linhas mudaram (estilo, mesclagem, altura fixa)');
  lidas.forEach((tag, i) => {
    const altura = t => +((/\sht="([\d.]+)"/.exec(t) || [])[1] || 0);
    conferir(altura(tag) >= altura(doModelo[i] || ''), `linha mais baixa que no modelo: ${tag}`);
  });
  conferir(!/<f[\s>]/.test(folha), 'fórmula na planilha');
  for (const m of folha.matchAll(/<c r="([A-Z]+\d+)"[^>]*\bt="inlineStr"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    conferir(/^<is><t(?: xml:space="preserve")?>[\s\S]*<\/t><\/is>$/.test(m[2] || ''), `${m[1]}: texto na célula sem <is><t>`);
  }

  const styles = texto(saida, 'xl/styles.xml'), stylesModelo = texto(modelo, 'xl/styles.xml');
  const xfs = listaDe(styles, 'cellXfs', 'xf');
  const quantos = { fonts: listaDe(styles, 'fonts', 'font').length, fills: listaDe(styles, 'fills', 'fill').length,
    borders: listaDe(styles, 'borders', 'border').length, cellStyleXfs: listaDe(styles, 'cellStyleXfs', 'xf').length };
  for (const lista of ['fonts', 'fills', 'borders', 'cellStyleXfs']) conferir(contagemDe(styles, lista) === quantos[lista], `styles.xml: count de ${lista} errado`);
  conferir(contagemDe(styles, 'cellXfs') === xfs.length, 'styles.xml: count de cellXfs errado');
  conferir(listaDe(stylesModelo, 'cellXfs', 'xf').every((xf, i) => xfs[i] === xf), 'styles.xml: um estilo do modelo mudou');
  const formatos = new Set((styles.match(/<numFmt [^>]*numFmtId="(\d+)"/g) || []).map(f => +/numFmtId="(\d+)"/.exec(f)[1]));
  xfs.forEach((xf, i) => {
    const id = a => +(new RegExp(`\\b${a}="(\\d+)"`).exec(xf) || [null, 0])[1];
    conferir(id('fontId') < quantos.fonts && id('fillId') < quantos.fills && id('borderId') < quantos.borders && id('xfId') < quantos.cellStyleXfs,
      `styles.xml: o estilo ${i} aponta para fonte, fundo, borda ou estilo que não existe`);
    conferir(id('numFmtId') < 164 || formatos.has(id('numFmtId')), `styles.xml: o estilo ${i} usa um formato que não existe`);
  });
  for (const m of folha.matchAll(/<c r="([A-Z]+\d+)"[^>]*?\ss="(\d+)"/g)) conferir(+m[2] < xfs.length, `${m[1]}: estilo ${m[2]} não existe`);

  if (saida.has('xl/sharedStrings.xml')) {
    const sst = texto(saida, 'xl/sharedStrings.xml');
    const unicos = (sst.match(/<si>/g) || []).length;
    const usos = [...folha.matchAll(/<c [^>]*?\bt="s"[^>]*>\s*<v>(\d+)<\/v>/g)].map(m => +m[1]);
    conferir(contagemDe(sst, 'sst') === usos.length, `sharedStrings.xml: count ${contagemDe(sst, 'sst')}, e a planilha usa ${usos.length}`);
    conferir(+/uniqueCount="(\d+)"/.exec(sst)[1] === unicos, 'sharedStrings.xml: uniqueCount errado');
    conferir(usos.every(u => u < unicos), 'célula apontando para um texto compartilhado que não existe');
    conferir(sst.replace(/\bcount="\d+"/, '') === texto(modelo, 'xl/sharedStrings.xml').replace(/\bcount="\d+"/, ''), 'sharedStrings.xml: os textos mudaram');
  }
  const aba = /<sheet name="([^"]*)"/.exec(texto(saida, 'xl/workbook.xml'))[1];
  conferir(aba.length >= 1 && aba.length <= 31 && !/[:\\/?*[\]]/.test(aba) && !/^'|'$/.test(aba), `nome de aba inválido: ${aba}`);
  conferir(texto(saida, 'xl/workbook.xml').replace(/<sheet name="[^"]*"/, '') === texto(modelo, 'xl/workbook.xml').replace(/<sheet name="[^"]*"/, ''),
    'workbook.xml mudou além do nome da aba');
  return problemas;
}

// ---- O conteúdo: onde cada voo deveria estar, lido dos rótulos da planilha ----

const minutos = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const COLUNAS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'AA'];
const seguinte = c => COLUNAS[COLUNAS.indexOf(c) + 1];
const NOTURNO = 17 * 60 + 30;
const TEMAS = { 'CESSNA 152': 'Ground C152', 'CESSNA 172': 'Ground C172', SENECA: 'Ground PA-34', 'NAVEGAÇÃO': 'Ground Navegação' };
const rotuloDoSimulador = r => r.replace(/^SIM-(MONO|MLTE)-(\w+)$/, (_, t, l) => `SIM ${l} - ${t === 'MONO' ? 'MNTE' : 'MLTE'}`);

// O horário de uma linha pelo rótulo: "06:30 às 07:30", "07:00 ás 08:00" (PA-34), "ALMOÇO (11:30 - 12:30)" e
// "NOTURNO" (17:30). Outro texto (o lembrete "DECOLAR ATÉ 17:00", a linha vazia) termina o bloco
export function horarioDoRotulo(rotulo) {
  const t = (rotulo || '').trim();
  if (t === 'NOTURNO') return NOTURNO;
  const h = /^(?:ALMOÇO \()?(\d{2}:\d{2})(?: [àá]s | - )\d{2}:\d{2}\)?$/.exec(t);
  return h ? minutos(h[1]) : null;
}

// Os recursos da planilha: em cada linha de nomes (4, 17 e 32), cada par Aluno/Instrutor da linha de baixo, com o nome
// do cabeçalho e as linhas de horário abaixo dele (pelo rótulo da coluna A; no PA-34, da coluna T)
function recursosDaPlanilha(celulas) {
  const recursos = [];
  for (const cabecalho of [4, 17, 32]) {
    for (const col of COLUNAS.slice(1, -1)) {
      if ((celulas[`${col}${cabecalho + 1}`] || '').trim() !== 'Aluno' || (celulas[`${seguinte(col)}${cabecalho + 1}`] || '').trim() !== 'Instrutor') continue;
      const rotulo = cabecalho === 17 && COLUNAS.indexOf(col) >= COLUNAS.indexOf('V') ? 'T' : 'A';
      const linhas = [];
      for (let l = cabecalho + 2, h; (h = horarioDoRotulo(celulas[`${rotulo}${l}`])) !== null; l++) linhas.push({ linha: l, inicio: h });
      recursos.push({ col, cabecalho, rotulo, linhas, nome: (celulas[`${col}${cabecalho}`] || '').trim(),
        ground: cabecalho === 32 && COLUNAS.indexOf(col) >= COLUNAS.indexOf('L') });
    }
  }
  return recursos;
}

const ANOTACAO = / \((\d{2}:\d{2})–(\d{2}:\d{2})\)$/;
// As entradas de uma célula de Aluno ("Ana (13:40–14:40) / Bia, Caio"): os nomes e a anotação de horário de cada uma
const entradasDaCelula = texto => (texto ? texto.split(' / ') : []).map(e => {
  const a = ANOTACAO.exec(e);
  return { nomes: e.replace(ANOTACAO, '').split(', '), anotacao: a ? a[0] : '' };
});
const mesmos = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());

// Confere a planilha lida contra os voos que voam no dia ({ r, a, b, aluno, instrutor, mis, ground }, já no horário
// efetivo). dia: { data (AAAA-MM-DD), frota ([{ reg, tipo }]), av, revisao }. Devolve a lista de problemas
export function conferirConteudo({ celulas, estilos, alturas }, voos, { data, frota = [], av = {}, revisao = {}, arquivos = null }) {
  const problemas = [];
  const conferir = (ok, msg) => { if (!ok) problemas.push(msg); };
  const recursos = recursosDaPlanilha(celulas);
  conferir(recursos.length === 13 + 6 + 3 + 5 + 5, `${recursos.length} pares Aluno/Instrutor na planilha`);

  const [ano, mes, dia] = data.split('-');
  const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  conferir(celulas.V31 === MESES[+mes - 1] && celulas.V34 === dia && celulas.V39 === ano, `data no quadro: ${celulas.V31} ${celulas.V34} ${celulas.V39}`);

  // O recurso de cada matrícula: pelo nome no cabeçalho (os simuladores como no modelo, "SIM A - MNTE")
  const doRecurso = new Map(recursos.filter(x => !x.ground && x.nome !== '-').map(x => [x.nome, x]));
  conferir(doRecurso.size === recursos.filter(x => !x.ground && x.nome !== '-').length, 'o mesmo recurso em duas colunas');
  const recursoDoVoo = v => (v.ground ? recursos.find(x => x.ground && TEMAS[x.nome] === v.mis) : doRecurso.get(rotuloDoSimulador(v.r)));

  // O esperado em cada célula de Aluno: as entradas (nomes e anotação) e os instrutores
  const esperado = new Map();
  const anotar = (ref, nomes, instrutor, anotacao) => {
    if (!esperado.has(ref)) esperado.set(ref, { entradas: [] });
    esperado.get(ref).entradas.push({ nomes, anotacao, instrutor });
  };
  // A turma de Ground: os alunos do mesmo tema, horário e instrutor numa entrada só
  const unidades = new Map();
  for (const v of voos) {
    const chave = v.ground ? `${v.mis}|${v.a}|${v.b}|${v.instrutor}` : `${v.r}|${v.a}|${v.b}|${v.aluno}`;
    if (!unidades.has(chave)) unidades.set(chave, { ...v, nomes: [] });
    unidades.get(chave).nomes.push(v.aluno);
  }
  const foraDoModelo = [];
  const pa34 = recursos.filter(x => x.rotulo === 'T');
  for (const u of unidades.values()) {
    const x = recursoDoVoo(u);
    if (!x) { foraDoModelo.push(u); continue; }
    let i = 0;
    x.linhas.forEach((l, j) => { if (l.inicio <= u.a) i = j; });
    const linha = x.linhas[i];
    const anotacao = u.a !== linha.inicio || u.b - u.a !== (u.ground ? 90 : 60) ? ` (${hm(u.a)}–${hm(u.b)})` : '';
    anotar(`${x.col}${linha.linha}`, u.nomes, u.instrutor, anotacao);
    x.linhas.slice(i + 1).filter(l => l.inicio < u.b).forEach(l => anotar(`${x.col}${l.linha}`, u.nomes, u.instrutor, ''));
  }

  // PA-34: os rótulos em ordem; com até 9 decolagens diferentes, cada uma tem a linha dela
  const rotulosPA34 = pa34[0] ? pa34[0].linhas.map(l => l.inicio) : [];
  conferir(rotulosPA34.length === 9 && rotulosPA34.every((h, k) => !k || h > rotulosPA34[k - 1]), `rótulos do PA-34: ${rotulosPA34.map(hm)}`);
  const decolagensPA34 = new Set(voos.filter(v => pa34.includes(recursoDoVoo(v))).map(v => v.a));
  if (decolagensPA34.size <= 9) {
    for (const h of decolagensPA34) conferir(rotulosPA34.includes(h), `PA-34: a decolagem das ${hm(h)} não virou o rótulo de uma linha`);
  }
  for (let l = 19; l <= 27; l++) {
    const t = (celulas[`T${l}`] || '').trim();
    const h = horarioDoRotulo(t);
    conferir(h !== null && t === `${hm(h)} ás ${hm(h + 60)}`, `PA-34: rótulo T${l} fora do formato do modelo: "${t}"`);
  }

  // Cada célula de recurso com nome: o que está lá é exatamente o esperado (ou REVISÃO depois da parada)
  const regDoNome = new Map([...frota.map(f => f.reg), ...voos.map(v => v.r)].map(r => [rotuloDoSimulador(r), r]));
  for (const x of recursos.filter(y => y.nome !== '-')) {
    const reg = x.ground ? null : regDoNome.get(x.nome);
    const paraAs = reg && revisao[reg] && Number.isInteger(revisao[reg].paraAs) ? revisao[reg].paraAs : null;
    for (const l of x.linhas) {
      const ref = `${x.col}${l.linha}`, refInstrutor = `${seguinte(x.col)}${l.linha}`;
      const e = esperado.get(ref);
      if (!e) {
        const revisaoAqui = paraAs !== null && l.inicio >= paraAs;
        const vazio = revisaoAqui ? 'REVISÃO' : '';
        conferir((celulas[ref] || '') === vazio && (celulas[refInstrutor] || '') === vazio,
          `${ref}/${refInstrutor} (${x.nome}, ${hm(l.inicio)}): "${celulas[ref]}" / "${celulas[refInstrutor]}", esperado "${vazio}"`);
        continue;
      }
      const lidas = entradasDaCelula(celulas[ref]);
      conferir(mesmos(lidas.flatMap(y => y.nomes), e.entradas.flatMap(y => y.nomes)),
        `${ref} (${x.nome}, ${hm(l.inicio)}): "${celulas[ref]}", esperado ${JSON.stringify(e.entradas.flatMap(y => y.nomes))}`);
      for (const entrada of e.entradas) {
        const lida = lidas.find(y => y.nomes.includes(entrada.nomes[0]));
        conferir(lida && lida.anotacao === entrada.anotacao && mesmos(lida.nomes, entrada.nomes),
          `${ref} (${x.nome}): a entrada de ${entrada.nomes.join(', ')} deveria ter "${entrada.anotacao}" (está "${celulas[ref]}")`);
      }
      // O instrutor de cada entrada, na ordem dos alunos (o mesmo em todas: uma vez só)
      const instrutores = e.entradas.map(y => y.instrutor);
      const lidos = (celulas[refInstrutor] || '').split(' / ');
      if (new Set(instrutores).size === 1) conferir(lidos.length === 1 && lidos[0] === instrutores[0], `${refInstrutor} (${x.nome}): "${celulas[refInstrutor]}", esperado "${instrutores[0]}"`);
      else {
        conferir(lidos.length === lidas.length && lidas.every((y, k) => e.entradas.find(z => z.nomes.includes(y.nomes[0]))?.instrutor === lidos[k]),
          `${refInstrutor} (${x.nome}): "${celulas[refInstrutor]}" não acompanha os alunos "${celulas[ref]}"`);
      }
    }
    // O cabeçalho em vermelho só para o recurso indisponível no dia
    if (reg && arquivos) {
      const vermelho = c => fundoDoEstilo(arquivos, estilos[`${c}${x.cabecalho}`]) === VERMELHO;
      conferir(vermelho(x.col) === (av[reg] === false) && vermelho(seguinte(x.col)) === (av[reg] === false),
        `${x.col}${x.cabecalho} (${x.nome}): ${av[reg] === false ? 'indisponível sem' : 'disponível com'} o fundo vermelho`);
    }
  }
  for (const [ref] of esperado) conferir(recursos.some(x => x.nome !== '-' && x.linhas.some(l => `${x.col}${l.linha}` === ref)), `${ref}: voo numa coluna sem recurso`);

  // A altura de cada linha de horário comporta o texto dela: com 13 caracteres por linha (Calibri 10 negrito na largura
  // das colunas) e 12,75 pt por linha, nunca menos que as 2 linhas do modelo. Dividir pelos caracteres dá o mínimo de
  // linhas (a quebra por palavra só aumenta)
  for (const x of recursos) {
    for (const l of x.linhas) {
      for (const ref of [`${x.col}${l.linha}`, `${seguinte(x.col)}${l.linha}`]) {
        const minimo = 12.75 * Math.max(2, Math.ceil([...(celulas[ref] || '')].length / 13)) + 5.25;
        conferir((alturas || {})[l.linha] >= minimo, `linha ${l.linha}: ${(alturas || {})[l.linha]} pt para "${celulas[ref]}" (mínimo ${minimo})`);
      }
    }
  }

  // O voo sem coluna está na última linha
  for (const u of foraDoModelo) {
    conferir((celulas.A41 || '').includes(u.nomes[0]) && (celulas.A41 || '').includes(u.ground ? u.mis : u.r), `${u.r} ${hm(u.a)} ${u.nomes[0]}: fora do modelo e fora da linha 41`);
  }
  if (!foraDoModelo.length) conferir(!celulas.A41, `linha 41 com texto sem voo fora do modelo: ${celulas.A41}`);
  else if (arquivos) {
    conferir(quebraLinhas(arquivos, estilos.A41), 'a linha 41 sem quebra de linha');
    conferir(alturas[41] >= 18.75 * Math.ceil([...celulas.A41].length / 180), `linha 41 baixa demais para o texto (${alturas[41]} pt)`);
  }
  return problemas;
}

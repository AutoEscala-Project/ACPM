// Planilha da escala no modelo do aeroclube: o Excel que a operadora preenchia à mão para lançar os voos no CAVOK
// (modelos/escala-cavok.xlsx, o arquivo dela sem os dados de 13/11/2026). Cada bloco do modelo tem uma linha por horário
// e, para cada avião, as colunas Aluno e Instrutor; o app preenche as células e devolve o mesmo arquivo, com a
// formatação do modelo. Uma aba por dia, com o nome DD-MM-AAAA.
//
// Como a escala cabe no modelo:
// - O voo vai na linha do horário dele (o das 11:30, na linha do ALMOÇO, que é só a referência do almoço para a
//   operadora); o que sai fora dos horários do modelo (13:40 não tem linha) vai na última linha que começa antes dele,
//   com o horário real ao lado do nome. O horário real também aparece quando a duração não é a da linha (1 h; o
//   Ground, 1h30).
// - O PA-34 tem horários dinâmicos (a operadora escala de 30 em 30 min): como ela faz à mão, o horário da linha vira o
//   do voo que não está na tabela (a linha mais próxima sem decolagem).
// - O voo que passa da linha seguinte repete o aluno e o instrutor nas linhas até o pouso (a planilha é a visão
//   gráfica do dia para a operadora).
// - A linha NOTURNO do C172 é a das 17:30: o Noturno vai nela, e o voo do dia que ainda está no ar às 17:30 também
//   (a linha "DECOLAR ATÉ 17:00" é só o lembrete do horário e fica vazia). O cancelado não entra; o atrasado entra no
//   horário novo.
// - O avião indisponível no dia fica com a matrícula em vermelho; o que para para a revisão de 50 horas fica com
//   "REVISÃO" nas linhas depois da parada.
// - A frota é a do cadastro: os aviões do modelo ficam nas colunas deles, e um avião novo ocupa a coluna de um que saiu
//   (primeiro os que voam no dia). O bloco do voo é o do tipo do avião no cadastro. O que não couber (mais aviões que
//   colunas, Ground sem coluna) vai na última linha da planilha.
// - A linha com mais texto do que as 2 linhas que o modelo comporta fica mais alta (o Excel não aumenta sozinho uma
//   linha de altura fixa).
import { T, NI, GROUND_REG } from './config.js';
import { hm } from './format.js';
import { FROTA_INICIAL } from './frota.js';
import { intervaloEfetivo } from './status.js';
import { lerZip, montarZip } from './zip.js';

export const MODELO = 'modelos/escala-cavok.xlsx';
export const nomeDaPlanilha = data => `escala-acpm-${data}.xlsx`;

const minuto = h => +h.slice(0, 2) * 60 + +h.slice(3);
const JANELAS_DO_MODELO = ['06:30', '08:20', '10:10', '11:30', '12:40', '14:30', '16:20'];
const linhas = (primeira, horarios = JANELAS_DO_MODELO) => horarios.map((h, i) => ({ linha: primeira + i, inicio: minuto(h) }));

// Os blocos do modelo: as colunas de Aluno (a de Instrutor é a seguinte), a matrícula que o modelo traz em cada uma e
// as linhas dos horários. Os simuladores do modelo são A, (B), C, (D) e E: a coluna de cada um é a da letra
export const BLOCOS = [
  {
    tipos: ['C152'], linhaDaMatricula: 4, linhas: linhas(6),
    colunas: ['B', 'D', 'F', 'H', 'J', 'L', 'N', 'P', 'R', 'T', 'V', 'X', 'Z'],
    modelo: ['PP-LJV', 'PR-BTB', 'PR-IGU', 'PR-VOB', 'PR-VOC', 'PR-VOI', 'PR-VOP', 'PR-VOZ', 'PR-VOW', 'PR-TBT', 'PR-THI', 'PR-MLB', 'PR-JPL']
  },
  {
    tipos: ['C172'], linhaDaMatricula: 17, linhas: [...linhas(19), { linha: 26, inicio: T[NI] }],
    colunas: ['B', 'D', 'F', 'H', 'J', 'L'],
    modelo: ['PP-ABP', 'PP-AJS', 'PR-BUL', 'PR-CPL', 'PR-HAR', 'PR-VOY']
  },
  {
    tipos: ['PA-34'], linhaDaMatricula: 17, colunaDosHorarios: 'T',
    linhas: linhas(19, ['06:30', '07:30', '08:30', '10:00', '11:00', '12:00', '13:30', '14:30', '16:00']),
    colunas: ['V', 'X', 'Z'],
    modelo: ['PT-JOB', 'PT-KIW', 'PR-VOM']
  },
  {
    tipos: ['Sim. Mono', 'Sim. Multi'], linhaDaMatricula: 32, linhas: linhas(34),
    colunas: ['B', 'D', 'F', 'H', 'J'],
    modelo: ['SIM-MONO-A', 'SIM-MONO-B', 'SIM-MONO-C', 'SIM-MLTE-D', 'SIM-MLTE-E']
  }
];
// Ground School: uma coluna por tema (a de Convalidação, T, o app não usa)
export const GROUND = {
  linhas: linhas(34), duracao: 90,
  colunas: { 'Ground C152': 'L', 'Ground C172': 'N', 'Ground PA-34': 'P', 'Ground Navegação': 'R' }
};
const DATA = { mes: 'V31', dia: 'V34', ano: 'V39' };
const FORA_DO_MODELO = 'A41';
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const proximaColuna = c => {
  const n = [...c].reduce((t, l) => t * 26 + l.charCodeAt(0) - 64, 0) + 1;
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

// O nome do recurso no cabeçalho: os simuladores como no modelo ("SIM A - MNTE"), os aviões pela matrícula
export const rotuloDoRecurso = r => {
  const sim = /^SIM-(MONO|MLTE)-(\w+)$/.exec(r);
  return sim ? `SIM ${sim[2]} - ${sim[1] === 'MONO' ? 'MNTE' : 'MLTE'}` : r;
};

// A coluna de cada recurso do bloco: a do modelo, se ele está nela; os outros, nas colunas que sobraram, primeiro os que
// voam no dia (o que não voa não tira a coluna de quem voa), cada grupo pela matrícula
function colunasDoBloco(bloco, recursos, voam) {
  const coluna = new Map();
  bloco.modelo.forEach((r, i) => { if (recursos.includes(r)) coluna.set(r, bloco.colunas[i]); });
  const livres = bloco.colunas.filter((_, i) => !recursos.includes(bloco.modelo[i]));
  recursos.filter(r => !coluna.has(r))
    .sort((x, y) => Number(voam.has(y)) - Number(voam.has(x)) || (x < y ? -1 : x > y ? 1 : 0))
    .forEach(r => { if (livres.length) coluna.set(r, livres.shift()); });
  return coluna;
}

// Os horários do dia num bloco de horários dinâmicos (o PA-34): cada decolagem que a tabela não tem fica com a linha
// mais próxima que não tem decolagem (no empate, a mais cedo); com mais decolagens que linhas, as que sobram vão na
// linha anterior, com o horário real ao lado do nome. inicios: os horários do modelo, em minutos
export function horariosDoDia(inicios, partidas) {
  const lista = [...inicios];
  const ocupadas = new Set(partidas.filter(p => lista.includes(p)));
  for (const p of [...new Set(partidas)].sort((a, b) => a - b).filter(p => !lista.includes(p))) {
    const livres = lista.map((_, i) => i).filter(i => !ocupadas.has(lista[i]));
    if (!livres.length) break;
    const i = livres.reduce((melhor, j) => (Math.abs(lista[j] - p) < Math.abs(lista[melhor] - p) ? j : melhor));
    lista[i] = p;
    ocupadas.add(p);
  }
  return lista.sort((a, b) => a - b);
}

// A altura das linhas de horário: o modelo comporta 2 linhas de texto (30,75 pt; Calibri 10 negrito, uns 13 caracteres
// por linha na largura das colunas); cada linha a mais soma 12,75 pt. A última linha da planilha (o que não coube no
// modelo, Calibri 14 em A41:Y41) tem 18,75 pt por linha
const CARACTERES_POR_LINHA = 13, PONTOS_POR_LINHA = 12.75, MARGEM = 5.25;
const CARACTERES_NA_A41 = 180, PONTOS_NA_A41 = 18.75;

// Quantas linhas o texto ocupa numa célula com quebra de linha: a palavra vai inteira para a linha seguinte; só a maior
// que a linha se parte (como no Excel)
export function linhasDoTexto(texto, largura) {
  return String(texto).split('\n').reduce((total, paragrafo) => {
    let linhas = 1, atual = 0;
    for (const palavra of paragrafo.split(' ')) {
      const n = [...palavra].length;
      if (atual > 0 && atual + 1 + n > largura) { linhas++; atual = n; } else atual += (atual > 0 ? 1 : 0) + n;
      while (atual > largura) { linhas++; atual -= largura; }
    }
    return total + linhas;
  }, 0);
}

// A linha do voo: a última que começa até a decolagem (antes da primeira, a primeira)
function linhaDoVoo(linhasDoBloco, a) {
  let i = 0;
  linhasDoBloco.forEach((l, j) => { if (l.inicio <= a) i = j; });
  return i;
}

// As células da escala no modelo: { aba, celulas: { A1: texto }, vermelhas: [células], quebrar: [células], alturas:
// { linha: pontos }, foraDoModelo: [textos] }. estado: frota, av (disponibilidade), fStatus e fObs do dia; data: AAAA-MM-DD
export function planilhaDaEscala(res, estado, data) {
  const fStatus = estado.fStatus || {}, fObs = estado.fObs || {};
  const frota = Array.isArray(estado.frota) ? estado.frota : FROTA_INICIAL;
  // O bloco do voo é o do tipo do avião no cadastro (o tipo do pedido pode ter mudado depois que o voo foi fixado); a
  // sala de Ground é sempre do Ground
  const tipoNoCadastro = new Map(frota.map(f => [f.reg, f.tipo]));
  const ehGround = o => Boolean(o.isGround) || o.r === GROUND_REG;
  const tipoDoVoo = o => tipoNoCadastro.get(o.r) || o.eqType;
  const [ano, mes, dia] = data.split('-');
  const celulas = { [DATA.mes]: MESES[+mes - 1], [DATA.dia]: dia, [DATA.ano]: ano };
  const vermelhas = [];
  const foraDoModelo = [];
  // Entradas por célula de Aluno: { aluno, instrutor }; a de Instrutor é a coluna seguinte
  const entradas = new Map();
  const anotar = (col, linha, aluno, instrutor) => {
    const chave = `${col}${linha}`;
    if (!entradas.has(chave)) entradas.set(chave, []);
    entradas.get(chave).push({ aluno, instrutor });
  };
  // Põe o voo (ou a turma) nas linhas do bloco; nominal: a duração que a linha representa
  const colocar = (col, linhasDoBloco, { a, b, alunos, instrutor, nominal }) => {
    const i = linhaDoVoo(linhasDoBloco, a);
    const seguintes = linhasDoBloco.slice(i + 1).filter(l => l.inicio < b);
    const foraDaLinha = a !== linhasDoBloco[i].inicio || b - a !== nominal;
    anotar(col, linhasDoBloco[i].linha, foraDaLinha ? `${alunos} (${hm(a)}–${hm(b)})` : alunos, instrutor);
    seguintes.forEach(l => anotar(col, l.linha, alunos, instrutor));
  };
  const descricao = (v, alunos) => `${v.r === GROUND_REG ? v.mis : v.r} ${hm(v.a)}–${hm(v.b)} ${alunos} (${v.instrutor})`;

  const voos = res.out
    .filter(o => (fStatus[o.fKey] || o.status || 'Confirmado') !== 'Cancelado')
    .map(o => ({ ...o, ...intervaloEfetivo(o, fStatus[o.fKey] || o.status || 'Confirmado', fObs[o.fKey]), instrutor: o.ins }));

  for (const bloco of BLOCOS) {
    const doBloco = voos.filter(o => !ehGround(o) && bloco.tipos.includes(tipoDoVoo(o)));
    const recursos = [...new Set([...frota.filter(f => bloco.tipos.includes(f.tipo)).map(f => f.reg), ...doBloco.map(o => o.r)])];
    const colunas = colunasDoBloco(bloco, recursos, new Set(doBloco.map(o => o.r)));
    // No PA-34, o horário da linha que mudou é reescrito no formato do modelo ("07:00 ás 08:00")
    let linhasDoBloco = bloco.linhas;
    if (bloco.colunaDosHorarios) {
      const doDia = horariosDoDia(bloco.linhas.map(l => l.inicio), doBloco.filter(o => colunas.has(o.r)).map(o => o.a));
      linhasDoBloco = bloco.linhas.map((l, i) => ({ linha: l.linha, inicio: doDia[i] }));
      linhasDoBloco.forEach((l, i) => {
        if (l.inicio !== bloco.linhas[i].inicio) celulas[`${bloco.colunaDosHorarios}${l.linha}`] = `${hm(l.inicio)} ás ${hm(l.inicio + 60)}`;
      });
    }
    // A coluna com recurso leva o nome dele e as linhas limpas (o modelo traz "-" nos simuladores que não existem); a
    // coluna sem recurso, "-" no nome
    bloco.colunas.forEach(col => {
      const r = [...colunas].find(([, c]) => c === col)?.[0];
      celulas[`${col}${bloco.linhaDaMatricula}`] = r ? rotuloDoRecurso(r) : '-';
      if (!r) return;
      linhasDoBloco.forEach(l => { celulas[`${col}${l.linha}`] = ''; celulas[`${proximaColuna(col)}${l.linha}`] = ''; });
      if (estado.av && estado.av[r] === false) vermelhas.push(`${col}${bloco.linhaDaMatricula}`, `${proximaColuna(col)}${bloco.linhaDaMatricula}`);
    });
    for (const o of doBloco) {
      const col = colunas.get(o.r);
      if (!col) { foraDoModelo.push(descricao(o, o.s)); continue; }
      colocar(col, linhasDoBloco, { a: o.a, b: o.b, alunos: o.s, instrutor: o.instrutor, nominal: 60 });
    }
    // Revisão de 50 horas: as linhas a partir da parada (as livres)
    for (const [r, col] of colunas) {
      const paraAs = res.revisao && res.revisao[r] ? res.revisao[r].paraAs : null;
      if (paraAs === null || paraAs === undefined) continue;
      linhasDoBloco
        .filter(l => l.inicio >= paraAs && !entradas.has(`${col}${l.linha}`))
        .forEach(l => anotar(col, l.linha, 'REVISÃO', 'REVISÃO'));
    }
  }

  // Ground: a turma (os alunos na mesma sala e horário) numa célula só. O status é de cada aluno: o atrasado sai da
  // turma e vai no horário novo dele
  const turmas = new Map();
  voos.filter(ehGround).forEach(o => {
    const chave = `${o.classKey || o.fKey}|${o.a}|${o.b}`;
    if (!turmas.has(chave)) turmas.set(chave, { ...o, alunos: [] });
    turmas.get(chave).alunos.push(o.s);
  });
  for (const t of turmas.values()) {
    const col = GROUND.colunas[t.mis];
    const alunos = t.alunos.join(', ');
    if (!col) { foraDoModelo.push(descricao(t, alunos)); continue; }
    colocar(col, GROUND.linhas, { a: t.a, b: t.b, alunos, instrutor: t.instrutor, nominal: GROUND.duracao });
  }

  for (const [chave, lista] of entradas) {
    const [, col, linha] = /^([A-Z]+)(\d+)$/.exec(chave);
    celulas[chave] = lista.map(e => e.aluno).join(' / ');
    // O instrutor de cada entrada, na ordem dos alunos; o mesmo instrutor em todas aparece uma vez
    const instrutores = lista.map(e => e.instrutor);
    celulas[`${proximaColuna(col)}${linha}`] = (new Set(instrutores).size === 1 ? instrutores.slice(0, 1) : instrutores).join(' / ');
  }

  // A linha de horário com mais texto do que as 2 linhas do modelo fica mais alta
  const alturas = {};
  const linhasDeHorario = new Set([...BLOCOS.flatMap(b => b.linhas.map(l => l.linha)), ...GROUND.linhas.map(l => l.linha)]);
  for (const [ref, texto] of Object.entries(celulas)) {
    const [, col, linha] = /^([A-Z]+)(\d+)$/.exec(ref);
    if (col === 'A' || !texto || !linhasDeHorario.has(+linha)) continue;
    const n = linhasDoTexto(texto, CARACTERES_POR_LINHA);
    if (n > 2) alturas[linha] = Math.max(alturas[linha] || 0, PONTOS_POR_LINHA * n + MARGEM);
  }
  const quebrar = [];
  if (foraDoModelo.length) {
    celulas[FORA_DO_MODELO] = `Fora do modelo (sem coluna na planilha): ${foraDoModelo.join('; ')}`;
    quebrar.push(FORA_DO_MODELO);
    const n = linhasDoTexto(celulas[FORA_DO_MODELO], CARACTERES_NA_A41);
    if (n > 1) alturas[/\d+$/.exec(FORA_DO_MODELO)[0]] = PONTOS_NA_A41 * n;
  }
  return { aba: `${dia}-${mes}-${ano}`, celulas, vermelhas, quebrar, alturas, foraDoModelo };
}

// O texto vai como string na própria célula (inlineStr), com o estilo que a célula tem no modelo; o texto vazio limpa a
// célula. Os caracteres que o XML não aceita (de controle, U+FFFE, U+FFFF e a metade de um par substituto) saem. Uma
// string nunca vira fórmula no Excel: o texto que começa com "=" fica como está. O Excel lê "_x0041_" num texto como o
// caractere U+0041: todo "_" que abre uma sequência dessas vai escapado ("_x005F_"), mesmo quando ela se sobrepõe a outra
const FORA_DO_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const escaparXml = t => String(t).replace(FORA_DO_XML, '')
  .replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function trocarCelula(xml, ref, troca) {
  const padrao = new RegExp(`<c r="${ref}"((?: [a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>.*?</c>)`, 's');
  const achada = padrao.exec(xml);
  if (!achada) throw new Error(`A célula ${ref} não existe no modelo da planilha.`);
  const estilo = (/ s="(\d+)"/.exec(achada[1]) || [])[1];
  return xml.slice(0, achada.index) + troca(estilo, achada[0]) + xml.slice(achada.index + achada[0].length);
}

// O estilo com quebra de linha (o texto longo da última linha), no lugar certo do <xf>: o <alignment> vem antes do
// <protection>
function comQuebra(xf) {
  const aplica = xf.replace(/<xf (?![^>]*applyAlignment)/, '<xf applyAlignment="1" ');
  if (/<alignment\b[^>]*\bwrapText=/.test(aplica)) return aplica.replace(/(<alignment\b[^>]*\bwrapText=)"[^"]*"/, '$1"1"');
  if (/<alignment\b/.test(aplica)) return aplica.replace(/<alignment\b/, '<alignment wrapText="1"');
  return /\/>$/.test(aplica) ? aplica.replace(/\s*\/>$/, '><alignment wrapText="1"/></xf>') : aplica.replace(/^(<xf [^>]*>)/, '$1<alignment wrapText="1"/>');
}

// Um estilo derivado do da célula: 'vermelho' (o avião indisponível) ou 'quebra' (com quebra de linha). O fundo
// vermelho e os estilos novos vão no fim das listas do styles.xml, cada um uma vez só
function derivarEstilo(styles, estilo, tipo, criados) {
  const chave = `${tipo}:${estilo}`;
  if (criados.has(chave)) return { styles, id: criados.get(chave) };
  // As trocas usam função: no texto de troca de uma string, "$&" e "$1" seriam especiais
  if (tipo === 'vermelho' && !criados.has('fundo')) {
    const fills = /<fills count="(\d+)">/.exec(styles);
    styles = styles.replace(/<fills count="\d+">/, () => `<fills count="${+fills[1] + 1}">`)
      .replace('</fills>', () => '<fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor indexed="64"/></patternFill></fill></fills>');
    criados.set('fundo', +fills[1]);
  }
  const lista = /<cellXfs count="(\d+)">(.*?)<\/cellXfs>/s.exec(styles);
  const xf = lista[2].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs)[+estilo];
  const novo = tipo === 'vermelho'
    ? xf.replace(/fillId="\d+"/, `fillId="${criados.get('fundo')}"`).replace(/<xf (?![^>]*applyFill)/, '<xf applyFill="1" ')
    : comQuebra(xf);
  const id = +lista[1];
  styles = styles.replace(lista[0], () => `<cellXfs count="${id + 1}">${lista[2]}${novo}</cellXfs>`);
  criados.set(chave, id);
  return { styles, id };
}

// Os arquivos do modelo ({ caminho: texto }) com a planilha do dia
export function preencherModelo(arquivos, { aba, celulas, vermelhas = [], quebrar = [], alturas = {} }) {
  const saida = { ...arquivos };
  let folha = arquivos['xl/worksheets/sheet1.xml'];
  for (const [ref, texto] of Object.entries(celulas)) {
    folha = trocarCelula(folha, ref, estilo => {
      const s = estilo === undefined ? '' : ` s="${estilo}"`;
      return texto === '' ? `<c r="${ref}"${s}/>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
    });
  }
  let styles = arquivos['xl/styles.xml'];
  const criados = new Map();
  for (const [tipo, refs] of [['vermelho', vermelhas], ['quebra', quebrar]]) {
    for (const ref of refs) {
      folha = trocarCelula(folha, ref, (estilo, celula) => {
        const derivado = derivarEstilo(styles, estilo || '0', tipo, criados);
        styles = derivado.styles;
        return estilo === undefined
          ? celula.replace(`<c r="${ref}"`, `<c r="${ref}" s="${derivado.id}"`)
          : celula.replace(` s="${estilo}"`, ` s="${derivado.id}"`);
      });
    }
  }
  // A linha que precisa de mais altura (nunca menos que a do modelo), com altura fixa
  for (const [linha, altura] of Object.entries(alturas)) {
    const padrao = new RegExp(`<row r="${linha}"([^>]*)>`);
    if (!padrao.test(folha)) throw new Error(`A linha ${linha} não existe no modelo da planilha.`);
    folha = folha.replace(padrao, (tag, atributos) => {
      const atual = +((/\sht="([\d.]+)"/.exec(atributos) || [])[1] || 0);
      if (altura <= atual) return tag;
      let novos = /\sht="/.test(atributos) ? atributos.replace(/\sht="[\d.]+"/, ` ht="${altura}"`) : `${atributos} ht="${altura}"`;
      if (!/\scustomHeight="1"/.test(novos)) novos = `${novos.replace(/\scustomHeight="[^"]*"/, '')} customHeight="1"`;
      return `<row r="${linha}"${novos}>`;
    });
  }
  saida['xl/worksheets/sheet1.xml'] = folha;
  saida['xl/styles.xml'] = styles;
  // As células de texto compartilhado que viraram texto na célula saem da contagem de referências do sharedStrings
  if (arquivos['xl/sharedStrings.xml']) {
    const referencias = (folha.match(/<c [^>]*?\bt="s"/g) || []).length;
    saida['xl/sharedStrings.xml'] = arquivos['xl/sharedStrings.xml'].replace(/(<sst\b[^>]*?\bcount=")\d+"/, (_, antes) => `${antes}${referencias}"`);
  }
  saida['xl/workbook.xml'] = arquivos['xl/workbook.xml'].replace(/<sheet name="[^"]*"/, () => `<sheet name="${escaparXml(aba)}"`);
  if (arquivos['docProps/app.xml']) {
    saida['docProps/app.xml'] = arquivos['docProps/app.xml']
      .replace(/(<TitlesOfParts><vt:vector [^>]*><vt:lpstr>)[^<]*/, (_, antes) => `${antes}${escaparXml(aba)}`);
  }
  return saida;
}

const XML = /\.(xml|rels)$/;

// A planilha pronta (os bytes do .xlsx) e os voos que não couberam no modelo. modelo: os bytes do modelos/escala-cavok.xlsx
export async function montarPlanilha(modelo, res, estado, data) {
  const arquivos = await lerZip(modelo);
  const textos = new TextDecoder(), bytes = new TextEncoder();
  const comoTexto = Object.fromEntries(Object.entries(arquivos).filter(([n]) => XML.test(n)).map(([n, b]) => [n, textos.decode(b)]));
  const planilha = planilhaDaEscala(res, estado, data);
  const preenchidos = preencherModelo(comoTexto, planilha);
  const saida = Object.fromEntries(Object.entries(arquivos).map(([n, b]) => [n, XML.test(n) ? bytes.encode(preenchidos[n]) : b]));
  return { bytes: await montarZip(saida), foraDoModelo: planilha.foraDoModelo };
}

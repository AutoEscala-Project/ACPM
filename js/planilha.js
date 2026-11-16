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
// - O Noturno vai na linha NOTURNO do C172 (a linha "DECOLAR ATÉ 17:00" é só o lembrete do horário e fica vazia). O
//   cancelado não entra; o atrasado entra no horário novo.
// - O avião indisponível no dia fica com a matrícula em vermelho; o que para para a revisão de 50 horas fica com
//   "REVISÃO" nas linhas depois da parada.
// - A frota é a do cadastro: os aviões do modelo ficam nas colunas deles, e um avião novo ocupa a coluna de um que saiu.
//   O que não couber (mais aviões que colunas, Ground sem coluna) vai na última linha da planilha.
import { T, NI } from './config.js';
import { hm } from './format.js';
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
    tipos: ['C172'], linhaDaMatricula: 17, linhas: linhas(19), noturno: 26,
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

// A coluna de cada recurso do bloco: a do modelo, se ele está nela; os outros, nas colunas que sobraram, em ordem
function colunasDoBloco(bloco, recursos) {
  const coluna = new Map();
  bloco.modelo.forEach((r, i) => { if (recursos.includes(r)) coluna.set(r, bloco.colunas[i]); });
  const livres = bloco.colunas.filter((_, i) => !recursos.includes(bloco.modelo[i]));
  [...recursos].filter(r => !coluna.has(r)).sort().forEach(r => { if (livres.length) coluna.set(r, livres.shift()); });
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

// A linha do voo: a última que começa até a decolagem (antes da primeira, a primeira)
function linhaDoVoo(linhasDoBloco, a) {
  let i = 0;
  linhasDoBloco.forEach((l, j) => { if (l.inicio <= a) i = j; });
  return i;
}

// As células da escala no modelo: { aba, celulas: { A1: texto }, vermelhas: [células], foraDoModelo: [textos] }.
// estado: frota, av (disponibilidade), fStatus e fObs do dia; data: AAAA-MM-DD
export function planilhaDaEscala(res, estado, data) {
  const fStatus = estado.fStatus || {}, fObs = estado.fObs || {};
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
  const colocar = (col, linhasDoBloco, { a, b, alunos, instrutor, noturno, nominal }) => {
    if (noturno !== undefined) { anotar(col, noturno, alunos, instrutor); return; }
    const i = linhaDoVoo(linhasDoBloco, a);
    const seguintes = linhasDoBloco.slice(i + 1).filter(l => l.inicio < b);
    const foraDaLinha = a !== linhasDoBloco[i].inicio || b - a !== nominal;
    anotar(col, linhasDoBloco[i].linha, foraDaLinha ? `${alunos} (${hm(a)}–${hm(b)})` : alunos, instrutor);
    seguintes.forEach(l => anotar(col, l.linha, alunos, instrutor));
  };
  const descricao = (v, alunos) => `${v.r === 'SALA-GROUND' ? v.mis : v.r} ${hm(v.a)}–${hm(v.b)} ${alunos} (${v.instrutor})`;

  const voos = res.out
    .filter(o => (fStatus[o.fKey] || o.status || 'Confirmado') !== 'Cancelado')
    .map(o => ({ ...o, ...intervaloEfetivo(o, fStatus[o.fKey] || o.status || 'Confirmado', fObs[o.fKey]), instrutor: o.ins }));

  for (const bloco of BLOCOS) {
    const doBloco = voos.filter(o => !o.isGround && bloco.tipos.includes(o.eqType));
    const recursos = [...new Set([...(estado.frota || []).filter(f => bloco.tipos.includes(f.tipo)).map(f => f.reg), ...doBloco.map(o => o.r)])];
    const colunas = colunasDoBloco(bloco, recursos);
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
      const noturno = bloco.noturno && (o.mis === 'Noturno' || o.a >= T[NI]) ? bloco.noturno : undefined;
      colocar(col, linhasDoBloco, { a: o.a, b: o.b, alunos: o.s, instrutor: o.instrutor, noturno, nominal: 60 });
    }
    // Revisão de 50 horas: as linhas a partir da parada (as livres)
    for (const [r, col] of colunas) {
      const paraAs = res.revisao && res.revisao[r] ? res.revisao[r].paraAs : null;
      if (paraAs === null || paraAs === undefined) continue;
      [...linhasDoBloco, ...(bloco.noturno ? [{ linha: bloco.noturno, inicio: T[NI] }] : [])]
        .filter(l => l.inicio >= paraAs && !entradas.has(`${col}${l.linha}`))
        .forEach(l => anotar(col, l.linha, 'REVISÃO', 'REVISÃO'));
    }
  }

  // Ground: a turma (os alunos na mesma sala e horário) numa célula só
  const turmas = new Map();
  voos.filter(o => o.isGround).forEach(o => {
    const chave = o.classKey || o.fKey;
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
    celulas[`${proximaColuna(col)}${linha}`] = [...new Set(lista.map(e => e.instrutor))].join(' / ');
  }
  if (foraDoModelo.length) celulas[FORA_DO_MODELO] = `Fora do modelo (sem coluna na planilha): ${foraDoModelo.join('; ')}`;
  return { aba: `${dia}-${mes}-${ano}`, celulas, vermelhas, foraDoModelo };
}

// O texto vai como string na própria célula (inlineStr), com o estilo que a célula tem no modelo; o texto vazio limpa a
// célula. Caracteres que o XML não aceita saem
const escaparXml = t => String(t).replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function trocarCelula(xml, ref, troca) {
  const padrao = new RegExp(`<c r="${ref}"((?: [a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>.*?</c>)`, 's');
  const achada = padrao.exec(xml);
  if (!achada) throw new Error(`A célula ${ref} não existe no modelo da planilha.`);
  const estilo = (/ s="(\d+)"/.exec(achada[1]) || [])[1];
  return xml.slice(0, achada.index) + troca(estilo, achada[0]) + xml.slice(achada.index + achada[0].length);
}

// Um estilo igual ao da célula, com o fundo vermelho (o avião indisponível): o fundo e os estilos novos vão no fim das
// listas do styles.xml
function estiloVermelho(styles, estilo, criados) {
  if (criados.has(estilo)) return { styles, id: criados.get(estilo) };
  if (!criados.has('fundo')) {
    const fills = /<fills count="(\d+)">/.exec(styles);
    styles = styles.replace(/<fills count="\d+">/, `<fills count="${+fills[1] + 1}">`)
      .replace('</fills>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor indexed="64"/></patternFill></fill></fills>');
    criados.set('fundo', +fills[1]);
  }
  const lista = /<cellXfs count="(\d+)">(.*?)<\/cellXfs>/s.exec(styles);
  const xfs = lista[2].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs);
  const novo = xfs[+estilo].replace(/fillId="\d+"/, `fillId="${criados.get('fundo')}"`).replace(/<xf (?![^>]*applyFill)/, '<xf applyFill="1" ');
  const id = +lista[1];
  styles = styles.replace(lista[0], `<cellXfs count="${id + 1}">${lista[2]}${novo}</cellXfs>`);
  criados.set(estilo, id);
  return { styles, id };
}

// Os arquivos do modelo ({ caminho: texto }) com a planilha do dia
export function preencherModelo(arquivos, { aba, celulas, vermelhas }) {
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
  for (const ref of vermelhas) {
    folha = trocarCelula(folha, ref, (estilo, celula) => {
      const vermelho = estiloVermelho(styles, estilo || '0', criados);
      styles = vermelho.styles;
      return estilo === undefined
        ? celula.replace(`<c r="${ref}"`, `<c r="${ref}" s="${vermelho.id}"`)
        : celula.replace(` s="${estilo}"`, ` s="${vermelho.id}"`);
    });
  }
  saida['xl/worksheets/sheet1.xml'] = folha;
  saida['xl/styles.xml'] = styles;
  saida['xl/workbook.xml'] = arquivos['xl/workbook.xml'].replace(/<sheet name="[^"]*"/, `<sheet name="${escaparXml(aba)}"`);
  if (arquivos['docProps/app.xml']) {
    saida['docProps/app.xml'] = arquivos['docProps/app.xml'].replace(/(<TitlesOfParts><vt:vector [^>]*><vt:lpstr>)[^<]*/, `$1${escaparXml(aba)}`);
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

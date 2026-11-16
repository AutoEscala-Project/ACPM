// Planilha da escala no modelo do aeroclube (o Excel do lançamento no CAVOK): onde cada voo cai e o arquivo montado
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCOS, GROUND, horariosDoDia, planilhaDaEscala, preencherModelo, montarPlanilha, rotuloDoRecurso, nomeDaPlanilha } from '../../js/planilha.js';
import { lerZip, montarZip } from '../../js/zip.js';
import { FROTA_INICIAL } from '../../js/frota.js';

const MODELO = new Uint8Array(readFileSync(new URL('../../modelos/escala-cavok.xlsx', import.meta.url)));
const h = t => +t.slice(0, 2) * 60 + +t.slice(3);
const voo = (r, eqType, inicio, fim, extra = {}) => ({
  fKey: `${r}_${inicio}_${extra.s || 'Ana'}`, r, eqType, a: h(inicio), b: h(fim), s: 'Ana', ins: 'Bruno', mis: 'Voo Local',
  isGround: false, status: 'Confirmado', ...extra
});
const escala = (out, revisao = {}) => ({ out, al: [], tot: out.length, revisao });
const estado = (extra = {}) => ({ frota: FROTA_INICIAL, av: {}, fStatus: {}, fObs: {}, ...extra });
const celulas = (out, est = estado(), revisao) => planilhaDaEscala(escala(out, revisao), est, '2026-11-13').celulas;

async function textosDoModelo() {
  const arquivos = await lerZip(MODELO);
  return Object.fromEntries(Object.entries(arquivos).filter(([n]) => /\.(xml|rels)$/.test(n)).map(([n, b]) => [n, new TextDecoder().decode(b)]));
}

describe('ZIP do .xlsx', () => {
  it('o ZIP montado devolve os mesmos arquivos', async () => {
    const arquivos = { 'a.xml': new TextEncoder().encode('<a>ç ✈</a>'.repeat(50)), 'pasta/b.bin': new Uint8Array([0, 1, 2, 255]) };
    const lidos = await lerZip(await montarZip(arquivos));
    assert.deepEqual(Object.keys(lidos), Object.keys(arquivos));
    for (const n of Object.keys(arquivos)) assert.deepEqual(lidos[n], arquivos[n]);
  });

  it('lê o modelo do aeroclube (comprimido pelo Excel)', async () => {
    const arquivos = await lerZip(MODELO);
    assert.ok(arquivos['xl/worksheets/sheet1.xml'] && arquivos['xl/styles.xml'] && arquivos['xl/workbook.xml']);
  });
});

describe('O modelo da planilha', () => {
  it('traz, na coluna de cada avião, a matrícula que a exportação espera', async () => {
    const textos = await textosDoModelo();
    const compartilhados = [...textos['xl/sharedStrings.xml'].matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/gs)].map(m => m[1].trim());
    const folha = textos['xl/worksheets/sheet1.xml'];
    for (const bloco of BLOCOS.filter(b => !b.tipos.includes('Sim. Mono'))) {
      assert.equal(bloco.modelo.length, bloco.colunas.length);
      bloco.colunas.forEach((col, i) => {
        const indice = +new RegExp(`<c r="${col}${bloco.linhaDaMatricula}"[^>]* t="s"><v>(\\d+)</v>`).exec(folha)[1];
        assert.equal(compartilhados[indice], bloco.modelo[i]);
      });
    }
  });

  it('tem todas as células que a exportação preenche (nenhuma falta no XML)', async () => {
    const textos = await textosDoModelo();
    const todas = {};
    for (const b of BLOCOS) {
      for (const col of b.colunas) {
        todas[`${col}${b.linhaDaMatricula}`] = 'X';
        [...b.linhas.map(l => l.linha), ...(b.noturno ? [b.noturno] : [])].forEach(l => { todas[`${col}${l}`] = 'X'; });
      }
    }
    Object.values(GROUND.colunas).forEach(col => GROUND.linhas.forEach(l => { todas[`${col}${l.linha}`] = 'X'; }));
    Object.assign(todas, { V31: 'X', V34: 'X', V39: 'X', A41: 'X' });
    assert.doesNotThrow(() => preencherModelo(textos, { aba: 'x', celulas: todas, vermelhas: ['B4', 'C4', 'V17', 'W17'] }));
  });
});

describe('Onde cada voo cai na planilha', () => {
  it('o voo no horário da linha: aluno e instrutor na coluna do avião', () => {
    const c = celulas([voo('PR-VOB', 'C152', '08:20', '09:20')]);
    assert.equal(c.H7, 'Ana');
    assert.equal(c.I7, 'Bruno');
    assert.equal(c.H4, 'PR-VOB');
  });

  it('fora dos horários do modelo: na linha anterior, com o horário real; o das 11:30, na linha do almoço', () => {
    const c = celulas([voo('PP-LJV', 'C152', '13:40', '14:40'), voo('PR-VOB', 'C152', '11:30', '12:30')]);
    assert.equal(c.B10, 'Ana (13:40–14:40)', '13:40 na linha das 12:40');
    assert.equal(c.B11, 'Ana', 'passa das 14:30: o nome se repete');
    assert.equal(c.C11, 'Bruno');
    assert.equal(c.H9, 'Ana');
    assert.equal(c.A9, undefined, 'a linha do almoço continua com o rótulo do modelo');
  });

  it('PA-34: o horário da linha vira o do voo que a tabela não tem (a linha mais próxima sem decolagem)', () => {
    const c = celulas([voo('PR-VOM', 'PA-34', '08:00', '09:00'), voo('PT-KIW', 'PA-34', '08:30', '09:30'), voo('PT-JOB', 'PA-34', '06:30', '07:30')]);
    assert.equal(c.T20, '08:00 ás 09:00', 'a das 07:30 (livre) é a mais próxima das 08:00; a das 08:30 tem voo');
    assert.deepEqual([c.Z20, c.AA20], ['Ana', 'Bruno']);
    assert.equal(c.X21, 'Ana');
    assert.equal(c.V19, 'Ana');
    assert.equal(c.T19, undefined, 'as linhas que não mudam ficam como no modelo');
    assert.equal(c.T21, undefined);
  });

  it('PA-34: horários do dia de 30 em 30 min e mais decolagens que linhas', () => {
    const modelo = ['06:30', '07:30', '08:30', '10:00', '11:00', '12:00', '13:30', '14:30', '16:00'].map(h);
    assert.deepEqual(horariosDoDia(modelo, [h('07:00'), h('09:30'), h('15:00')]).map(m => String(m)),
      ['07:00', '07:30', '08:30', '09:30', '11:00', '12:00', '13:30', '15:00', '16:00'].map(h).map(String), '07:00 empata entre 06:30 e 07:30: fica a mais cedo');
    const dez = Array.from({ length: 10 }, (_, i) => h('06:30') + 30 * i);
    const doDia = horariosDoDia(modelo, dez);
    assert.equal(doDia.length, 9);
    assert.deepEqual(doDia, dez.filter(m => m !== h('10:30')), 'sem linha livre, a das 10:30 fica sem linha própria (a das 11:00 é do modelo)');
    const c = celulas(dez.map((m, i) => voo('PR-VOM', 'PA-34', `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, '17:00', { s: `A${i}` })).map(v => ({ ...v, b: v.a + 30 })));
    assert.equal(c.Z26, 'A7 (10:00–10:30) / A8 (10:30–11:00)', 'a das 10:30 na linha das 10:00');
    assert.equal(c.Z27, 'A9 (11:00–11:30)');
  });

  it('o voo longo ocupa as linhas até o pouso', () => {
    const c = celulas([voo('PR-VOC', 'C152', '10:10', '16:10', { s: 'Yuri', ins: 'Tulio', mis: 'Navegação' })]);
    assert.equal(c.J8, 'Yuri (10:10–16:10)');
    assert.deepEqual([c.J9, c.J10, c.J11, c.K11], ['Yuri', 'Yuri', 'Yuri', 'Tulio']);
    assert.equal(c.J12, '', '16:20 já está livre');
  });

  it('o Noturno vai na linha NOTURNO do C172', () => {
    const c = celulas([voo('PP-AJS', 'C172', '17:30', '18:30', { mis: 'Noturno' })]);
    assert.equal(c.D26, 'Ana');
    assert.equal(c.E26, 'Bruno');
  });

  it('o cancelado não entra; o atrasado entra no horário novo', () => {
    const atrasado = voo('PR-VOB', 'C152', '06:30', '07:30', { s: 'Caio' });
    const cancelado = voo('PR-VOB', 'C152', '10:10', '11:10', { s: 'Duda' });
    const c = celulas([atrasado, cancelado], estado({
      fStatus: { [atrasado.fKey]: 'Atrasado', [cancelado.fKey]: 'Cancelado' },
      fObs: { [atrasado.fKey]: { novoInicio: h('08:20') } }
    }));
    assert.equal(c.H6, '');
    assert.equal(c.H7, 'Caio');
    assert.equal(c.H8, '');
  });

  it('a turma de Ground numa célula só, na coluna do tema', () => {
    const turma = n => voo('SALA-GROUND', 'Sala Ground', '08:20', '09:50', { s: n, mis: 'Ground Navegação', isGround: true, classKey: 'g1' });
    const c = celulas([turma('Ana'), turma('Caio')]);
    assert.equal(c.R35, 'Ana, Caio');
    assert.equal(c.S35, 'Bruno');
  });

  it('dois voos na mesma célula ficam separados por "/"', () => {
    const c = celulas([voo('PP-LJV', 'C152', '12:40', '13:40', { s: 'Ana', ins: 'Bruno' }), voo('PP-LJV', 'C152', '13:40', '14:20', { s: 'Caio', ins: 'Bruno' })]);
    assert.equal(c.B10, 'Ana / Caio (13:40–14:20)');
    assert.equal(c.C10, 'Bruno');
  });

  it('o avião indisponível fica em vermelho; o que para na revisão, com REVISÃO depois da parada', () => {
    const { vermelhas, celulas: c } = planilhaDaEscala(escala([voo('PR-VOB', 'C152', '06:30', '07:30')], { 'PR-VOB': { paraAs: h('07:30') } }),
      estado({ av: { 'PR-BTB': false } }), '2026-11-13');
    assert.deepEqual(vermelhas, ['D4', 'E4']);
    assert.equal(c.H6, 'Ana');
    assert.deepEqual([c.H7, c.I7, c.H12], ['REVISÃO', 'REVISÃO', 'REVISÃO']);
  });

  it('a frota do cadastro: o avião novo ocupa a coluna de um que saiu; sem coluna livre, vai para a última linha', () => {
    const frota = FROTA_INICIAL.filter(f => f.reg !== 'PR-IGU').concat({ reg: 'PR-NEW', tipo: 'C152' }, { reg: 'PR-ZZZ', tipo: 'C152' });
    const p = planilhaDaEscala(escala([voo('PR-NEW', 'C152', '06:30', '07:30'), voo('PR-ZZZ', 'C152', '06:30', '07:30', { s: 'Caio' })]),
      estado({ frota }), '2026-11-13');
    assert.equal(p.celulas.F4, 'PR-NEW');
    assert.equal(p.celulas.F6, 'Ana');
    assert.deepEqual(p.foraDoModelo, ['PR-ZZZ 06:30–07:30 Caio (Bruno)']);
    assert.match(p.celulas.A41, /PR-ZZZ 06:30–07:30 Caio/);
  });

  it('os simuladores com o nome do modelo, cada um na coluna da letra dele', () => {
    assert.equal(rotuloDoRecurso('SIM-MONO-A'), 'SIM A - MNTE');
    assert.equal(rotuloDoRecurso('SIM-MLTE-E'), 'SIM E - MLTE');
    const c = celulas([voo('SIM-MLTE-D', 'Sim. Multi', '10:10', '11:10', { mis: 'Simulador' })]);
    assert.deepEqual([c.B32, c.D32, c.F32, c.H32, c.J32], ['SIM A - MNTE', '-', 'SIM C - MNTE', 'SIM D - MLTE', 'SIM E - MLTE']);
    assert.equal(c.H36, 'Ana');
    assert.equal(c.H34, '', 'o "-" do modelo sai da coluna do simulador que existe');
    assert.equal(c.D34, undefined, 'a coluna sem simulador fica como no modelo');
  });

  it('a data: aba DD-MM-AAAA e o mês, o dia e o ano no quadro', () => {
    const p = planilhaDaEscala(escala([]), estado(), '2026-03-05');
    assert.equal(p.aba, '05-03-2026');
    assert.deepEqual([p.celulas.V31, p.celulas.V34, p.celulas.V39], ['MARÇO', '05', '2026']);
    assert.equal(nomeDaPlanilha('2026-03-05'), 'escala-acpm-2026-03-05.xlsx');
  });
});

describe('O arquivo montado', () => {
  it('é o modelo com as células preenchidas, a aba do dia e o estilo vermelho novo', async () => {
    const res = escala([voo('PR-VOB', 'C152', '08:20', '09:20', { s: 'Ana & <Bia>' })]);
    const { bytes, foraDoModelo } = await montarPlanilha(MODELO, res, estado({ av: { 'PR-BTB': false } }), '2026-11-13');
    assert.deepEqual(foraDoModelo, []);
    const arquivos = await lerZip(bytes);
    const texto = n => new TextDecoder().decode(arquivos[n]);
    const folha = texto('xl/worksheets/sheet1.xml');
    assert.match(folha, /<c r="H7" s="\d+" t="inlineStr"><is><t xml:space="preserve">Ana &amp; &lt;Bia&gt;<\/t><\/is><\/c>/);
    assert.match(texto('xl/workbook.xml'), /<sheet name="13-11-2026"/);
    const estiloD4 = +/<c r="D4" s="(\d+)"/.exec(folha)[1];
    const styles = texto('xl/styles.xml');
    const xfs = /<cellXfs count="(\d+)">(.*?)<\/cellXfs>/s.exec(styles);
    assert.equal(estiloD4, +xfs[1] - 2, 'D4 e E4 com estilos novos, no fim da lista');
    const fills = /<fills count="(\d+)">/.exec(styles);
    assert.match(xfs[2].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs)[estiloD4], new RegExp(`fillId="${+fills[1] - 1}"`));
    assert.equal(Object.keys(arquivos).length, Object.keys(await lerZip(MODELO)).length);
  });
});

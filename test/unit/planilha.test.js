// Planilha da escala no modelo do aeroclube (o Excel do lançamento no CAVOK): o modelo, onde cada voo cai e o arquivo
// montado. O arquivo é conferido por um leitor de fora (test/helpers/xlsx.js), que não usa o código da exportação
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCOS, GROUND, horariosDoDia, linhasDoTexto, planilhaDaEscala, preencherModelo, montarPlanilha, rotuloDoRecurso, nomeDaPlanilha } from '../../js/planilha.js';
import { lerZip } from '../../js/zip.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { runAllocationEngine } from '../../js/engine.js';
import { intervaloEfetivo } from '../../js/status.js';
import { gerarCenario, mulberry32 } from '../helpers/cenarios.js';
import { comExemplo } from '../helpers/exemplo.js';
import { estadoSintetico } from '../helpers/estado.js';
import { abrirZip, lerPlanilha, problemaNoXml, conferirEstrutura, conferirConteudo, horarioDoRotulo, fundoDoEstilo, quebraLinhas, VERMELHO } from '../helpers/xlsx.js';

const MODELO = new Uint8Array(readFileSync(new URL('../../modelos/escala-cavok.xlsx', import.meta.url)));
const ARQUIVOS_DO_MODELO = abrirZip(MODELO);
const DO_MODELO = lerPlanilha(ARQUIVOS_DO_MODELO);
const h = t => +t.slice(0, 2) * 60 + +t.slice(3);
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const voo = (r, eqType, inicio, fim, extra = {}) => ({
  fKey: `${r}_${inicio}_${extra.s || 'Ana'}`, r, eqType, a: h(inicio), b: h(fim), s: 'Ana', ins: 'Bruno', mis: 'Voo Local',
  isGround: false, status: 'Confirmado', ...extra
});
const ground = (s, inicio, fim, extra = {}) => voo('SALA-GROUND', 'Sala Ground', inicio, fim, { s, mis: 'Ground C152', isGround: true, classKey: 'g1', ...extra });
const escala = (out, revisao = {}) => ({ out, al: [], tot: out.length, revisao });
const estado = (extra = {}) => ({ frota: FROTA_INICIAL, av: {}, fStatus: {}, fObs: {}, ...extra });
const celulas = (out, est = estado(), revisao) => planilhaDaEscala(escala(out, revisao), est, '2026-11-13').celulas;
const seguinte = c => (c === 'Z' ? 'AA' : String.fromCharCode(c.charCodeAt(0) + 1));
const textos = arquivos => Object.fromEntries([...arquivos].filter(([n]) => /\.(xml|rels)$/.test(n)).map(([n, b]) => [n, b.toString('utf8')]));
const mesclagens = [...ARQUIVOS_DO_MODELO.get('xl/worksheets/sheet1.xml').toString('utf8').matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)]
  .map(([, c1, l1, c2, l2]) => ({ c1, l1: +l1, c2, l2: +l2 }));
const numero = c => [...c].reduce((t, l) => t * 26 + l.charCodeAt(0) - 64, 0);
const dentroDeMesclagem = ref => {
  const [, c, l] = /^([A-Z]+)(\d+)$/.exec(ref);
  return mesclagens.find(m => numero(c) >= numero(m.c1) && numero(c) <= numero(m.c2) && +l >= m.l1 && +l <= m.l2);
};

describe('O modelo da planilha', () => {
  it('os blocos do código são os da planilha: matrículas, Aluno/Instrutor em cada par e os horários dos rótulos', () => {
    const c = DO_MODELO.celulas;
    for (const bloco of BLOCOS) {
      assert.equal(bloco.modelo.length, bloco.colunas.length);
      bloco.colunas.forEach((col, i) => {
        if (!bloco.tipos.includes('Sim. Mono')) assert.equal(c[`${col}${bloco.linhaDaMatricula}`].trim(), bloco.modelo[i], `${col}${bloco.linhaDaMatricula}`);
        assert.equal(c[`${col}${bloco.linhaDaMatricula + 1}`], 'Aluno', `${col}${bloco.linhaDaMatricula + 1}`);
        assert.equal(c[`${seguinte(col)}${bloco.linhaDaMatricula + 1}`], 'Instrutor', `${seguinte(col)}${bloco.linhaDaMatricula + 1}`);
      });
      const colunaDosRotulos = bloco.colunaDosHorarios || 'A';
      for (const l of bloco.linhas) assert.equal(horarioDoRotulo(c[`${colunaDosRotulos}${l.linha}`]), l.inicio, `${colunaDosRotulos}${l.linha}: "${c[`${colunaDosRotulos}${l.linha}`]}"`);
    }
    assert.deepEqual(['B32', 'F32', 'J32'].map(r => c[r]), ['SIM A - MNTE', 'SIM C - MNTE', 'SIM E - MLTE']);
    const temas = { 'Ground C152': 'CESSNA 152', 'Ground C172': 'CESSNA 172', 'Ground PA-34': 'SENECA', 'Ground Navegação': 'NAVEGAÇÃO' };
    for (const [mis, col] of Object.entries(GROUND.colunas)) {
      assert.equal(c[`${col}32`], temas[mis]);
      assert.deepEqual([c[`${col}33`], c[`${seguinte(col)}33`]], ['Aluno', 'Instrutor']);
    }
    for (const l of GROUND.linhas) assert.equal(horarioDoRotulo(c[`A${l.linha}`]), l.inicio, `A${l.linha}`);
    assert.equal(c.A27, 'DECOLAR ATÉ 17:00', 'o lembrete fica fora das linhas de horário');
  });

  it('as células que a exportação escreve são a primeira célula da mesclagem (o resto não aparece no Excel)', () => {
    const escritas = ['V31', 'V34', 'V39', 'A41', ...BLOCOS.flatMap(b => b.colunas.flatMap(col => [`${col}${b.linhaDaMatricula}`, ...b.linhas.map(l => `${col}${l.linha}`)])),
      ...BLOCOS.filter(b => b.colunaDosHorarios).flatMap(b => b.linhas.map(l => `${b.colunaDosHorarios}${l.linha}`)),
      ...Object.values(GROUND.colunas).flatMap(col => GROUND.linhas.map(l => `${col}${l.linha}`))];
    for (const ref of escritas) {
      const m = dentroDeMesclagem(ref);
      assert.ok(!m || `${m.c1}${m.l1}` === ref, `${ref} está no meio da mesclagem ${m && `${m.c1}${m.l1}:${m.c2}${m.l2}`}`);
      assert.ok(ref in DO_MODELO.celulas, `${ref} não existe no XML do modelo`);
    }
  });

  it('o modelo está limpo: sem nomes, sem REVISÃO, sem matrícula em vermelho, com os horários do PA-34 de sempre', () => {
    const c = DO_MODELO.celulas;
    for (const b of BLOCOS) {
      for (const col of b.colunas) {
        for (const l of b.linhas) for (const ref of [`${col}${l.linha}`, `${seguinte(col)}${l.linha}`]) assert.ok(['', '-'].includes(c[ref]), `${ref}: "${c[ref]}"`);
        for (const ref of [`${col}${b.linhaDaMatricula}`, `${seguinte(col)}${b.linhaDaMatricula}`]) {
          assert.notEqual(fundoDoEstilo(ARQUIVOS_DO_MODELO, DO_MODELO.estilos[ref]), VERMELHO, `${ref} em vermelho`);
        }
      }
    }
    for (const col of Object.values(GROUND.colunas)) for (const l of GROUND.linhas) assert.equal(c[`${col}${l.linha}`], '');
    assert.ok(!Object.values(c).includes('REVISÃO'));
    assert.equal(c.A41, '');
    assert.deepEqual(conferirEstrutura(ARQUIVOS_DO_MODELO, ARQUIVOS_DO_MODELO), [], 'o próprio modelo é consistente');
  });

  it('o preenchimento acha todas as células que pode escrever (nenhuma falta no XML)', () => {
    const todas = { V31: 'X', V34: 'X', V39: 'X', A41: 'X' };
    for (const b of BLOCOS) {
      for (const col of b.colunas) [b.linhaDaMatricula, ...b.linhas.map(l => l.linha)].forEach(l => { todas[`${col}${l}`] = 'X'; todas[`${seguinte(col)}${l}`] = 'X'; });
      if (b.colunaDosHorarios) b.linhas.forEach(l => { todas[`${b.colunaDosHorarios}${l.linha}`] = '07:00 ás 08:00'; });
    }
    Object.values(GROUND.colunas).forEach(col => GROUND.linhas.forEach(l => { todas[`${col}${l.linha}`] = 'X'; todas[`${seguinte(col)}${l.linha}`] = 'X'; }));
    const vermelhas = BLOCOS.flatMap(b => b.colunas.flatMap(col => [`${col}${b.linhaDaMatricula}`, `${seguinte(col)}${b.linhaDaMatricula}`]));
    assert.doesNotThrow(() => preencherModelo(textos(ARQUIVOS_DO_MODELO), { aba: 'x', celulas: todas, vermelhas }));
  });
});

describe('Onde cada voo cai na planilha', () => {
  it('o voo no horário da linha: aluno e instrutor na coluna do avião', () => {
    const c = celulas([voo('PR-VOB', 'C152', '08:20', '09:20')]);
    assert.deepEqual([c.H4, c.H7, c.I7], ['PR-VOB', 'Ana', 'Bruno']);
  });

  it('fora dos horários do modelo: na linha anterior, com o horário real; o das 11:30, na linha do almoço; antes da primeira, na primeira', () => {
    const c = celulas([voo('PP-LJV', 'C152', '13:40', '14:40'), voo('PR-VOB', 'C152', '11:30', '12:30'), voo('PR-VOC', 'C152', '06:00', '07:00', { s: 'Caio' })]);
    assert.equal(c.B10, 'Ana (13:40–14:40)', '13:40 na linha das 12:40');
    assert.deepEqual([c.B11, c.C11], ['Ana', 'Bruno'], 'passa das 14:30: o nome se repete');
    assert.equal(c.H9, 'Ana');
    assert.equal(c.A9, undefined, 'a linha do almoço continua com o rótulo do modelo');
    assert.equal(c.J6, 'Caio (06:00–07:00)');
  });

  it('a duração diferente da linha também mostra o horário (1 h no voo, 1h30 no Ground)', () => {
    const c = celulas([voo('PR-VOB', 'C152', '08:20', '09:50'), ground('Bia', '06:30', '08:00'), ground('Caio', '10:10', '11:10', { classKey: 'g2' })]);
    assert.equal(c.H7, 'Ana (08:20–09:50)');
    assert.equal(c.L34, 'Bia', 'o Ground de 1h30 na linha dele não leva horário');
    assert.equal(c.L36, 'Caio (10:10–11:10)');
  });

  it('PA-34: o horário da linha vira o do voo que a tabela não tem (a linha mais próxima sem decolagem)', () => {
    const c = celulas([voo('PR-VOM', 'PA-34', '08:00', '09:00'), voo('PT-KIW', 'PA-34', '08:30', '09:30'), voo('PT-JOB', 'PA-34', '06:30', '07:30')]);
    assert.equal(c.T20, '08:00 ás 09:00', 'a das 07:30 (livre) é a mais próxima das 08:00; a das 08:30 tem voo');
    assert.deepEqual([c.Z20, c.AA20, c.X21, c.V19], ['Ana', 'Bruno', 'Ana', 'Ana']);
    assert.equal(c.T19, undefined, 'as linhas que não mudam ficam como no modelo');
    assert.equal(c.T21, undefined);
  });

  it('PA-34: horários do dia de 30 em 30 min e mais decolagens que linhas', () => {
    const modelo = ['06:30', '07:30', '08:30', '10:00', '11:00', '12:00', '13:30', '14:30', '16:00'].map(h);
    assert.deepEqual(horariosDoDia(modelo, [h('07:00'), h('09:30'), h('15:00')]).map(hm),
      ['07:00', '07:30', '08:30', '09:30', '11:00', '12:00', '13:30', '15:00', '16:00'], '07:00 empata entre 06:30 e 07:30: fica a mais cedo');
    assert.deepEqual(horariosDoDia(modelo, []), modelo, 'sem voo, os horários do modelo');
    const dez = Array.from({ length: 10 }, (_, i) => h('06:30') + 30 * i);
    assert.deepEqual(horariosDoDia(modelo, dez), dez.filter(m => m !== h('10:30')), 'sem linha livre, a das 10:30 fica sem linha própria (a das 11:00 é do modelo)');
    const c = celulas(dez.map((m, i) => ({ ...voo('PR-VOM', 'PA-34', hm(m), hm(m + 30), { s: `A${i}` }) })));
    assert.equal(c.Z26, 'A7 (10:00–10:30) / A8 (10:30–11:00)', 'a das 10:30 na linha das 10:00');
    assert.equal(c.Z27, 'A9 (11:00–11:30)');
  });

  it('o voo longo repete o aluno e o instrutor nas linhas até o pouso', () => {
    const c = celulas([voo('PR-VOC', 'C152', '10:10', '16:10', { s: 'Yuri', ins: 'Tulio', mis: 'Navegação' })]);
    assert.equal(c.J8, 'Yuri (10:10–16:10)');
    assert.deepEqual([c.J9, c.J10, c.J11, c.K9, c.K11], ['Yuri', 'Yuri', 'Yuri', 'Tulio', 'Tulio']);
    assert.equal(c.J12, '', '16:20 já está livre');
  });

  it('a linha NOTURNO é a das 17:30 do C172: o Noturno vai nela, e o voo do dia ainda no ar às 17:30 também', () => {
    const c = celulas([
      voo('PP-AJS', 'C172', '17:30', '18:30', { mis: 'Noturno' }),
      voo('PR-BUL', 'C172', '17:30', '19:00', { mis: 'Noturno', s: 'Bia' }),
      voo('PR-CPL', 'C172', '16:20', '17:50', { mis: 'Navegação', s: 'Caio' })
    ]);
    assert.deepEqual([c.D26, c.E26], ['Ana', 'Bruno']);
    assert.equal(c.F26, 'Bia (17:30–19:00)');
    assert.deepEqual([c.H25, c.H26], ['Caio (16:20–17:50)', 'Caio']);
    assert.equal(c.B27, undefined, 'a linha "DECOLAR ATÉ 17:00" fica como no modelo');
  });

  it('o cancelado não entra (nem nas linhas seguintes); o atrasado entra no horário novo; os outros status entram', () => {
    const atrasado = voo('PR-VOB', 'C152', '06:30', '07:30', { s: 'Caio' });
    const cancelado = voo('PR-VOB', 'C152', '10:10', '14:10', { s: 'Duda' });
    const semNovoHorario = voo('PR-VOC', 'C152', '06:30', '07:30', { s: 'Eva' });
    const outros = ['Pendente', 'Em Voo', 'Pousou'].map((s, i) => voo('PR-VOP', 'C152', ['06:30', '08:20', '10:10'][i], ['07:30', '09:20', '11:10'][i], { s }));
    const c = celulas([atrasado, cancelado, semNovoHorario, ...outros], estado({
      fStatus: { [atrasado.fKey]: 'Atrasado', [cancelado.fKey]: 'Cancelado', [semNovoHorario.fKey]: 'Atrasado', ...Object.fromEntries(outros.map(o => [o.fKey, o.s])) },
      fObs: { [atrasado.fKey]: { novoInicio: h('08:20') }, [cancelado.fKey]: { motivo: 'Meteorologia' } }
    }));
    assert.deepEqual([c.H6, c.H7, c.H8, c.H9, c.H10], ['', 'Caio', '', '', '']);
    assert.equal(c.J6, 'Eva', 'atrasado sem a nova decolagem: no horário da escala');
    assert.deepEqual([c.N6, c.N7, c.N8], ['Pendente', 'Em Voo', 'Pousou']);
  });

  it('o Ground: a turma numa célula, na coluna do tema; o aluno atrasado sai da turma; o tema sem coluna vai para a última linha', () => {
    const turma = ['Ana', 'Caio', 'Duda'].map(n => ground(n, '08:20', '09:50', { mis: 'Ground Navegação' }));
    const c = celulas([...turma, ground('Eva', '06:30', '08:00', { mis: 'Ground XYZ', classKey: 'g9' })], estado({
      fStatus: { [turma[2].fKey]: 'Atrasado' }, fObs: { [turma[2].fKey]: { novoInicio: h('10:10') } }
    }));
    assert.deepEqual([c.R35, c.S35], ['Ana, Caio', 'Bruno']);
    assert.equal(c.R36, 'Duda', 'o atrasado no horário novo, sozinho (10:10–11:40 cabe na 1h30)');
    assert.match(c.A41, /Ground XYZ 06:30–08:00 Eva \(Bruno\)/);
  });

  it('dois voos na mesma célula ficam separados por "/"; o instrutor repetido aparece uma vez', () => {
    const c = celulas([voo('PP-LJV', 'C152', '12:40', '13:40'), voo('PP-LJV', 'C152', '13:40', '14:20', { s: 'Caio' })]);
    assert.equal(c.B10, 'Ana / Caio (13:40–14:20)');
    assert.equal(c.C10, 'Bruno');
  });

  it('indisponível em vermelho (avião e simulador); REVISÃO nas linhas livres depois da parada, inclusive a NOTURNO', () => {
    const p = planilhaDaEscala(escala([voo('PR-VOB', 'C152', '06:30', '07:30'), voo('PP-ABP', 'C172', '06:30', '07:30')],
      { 'PR-VOB': { paraAs: h('07:30') }, 'PP-ABP': { paraAs: h('07:30') }, 'PR-VOC': { paraAs: null } }),
    estado({ av: { 'PR-BTB': false, 'SIM-MONO-C': false } }), '2026-11-13');
    assert.deepEqual(p.vermelhas, ['D4', 'E4', 'F32', 'G32']);
    assert.equal(p.celulas.H6, 'Ana');
    assert.deepEqual([p.celulas.H7, p.celulas.I7, p.celulas.H12], ['REVISÃO', 'REVISÃO', 'REVISÃO']);
    assert.deepEqual([p.celulas.B19, p.celulas.B20, p.celulas.B26], ['Ana', 'REVISÃO', 'REVISÃO']);
    assert.equal(p.celulas.J6, '', 'sem parada, sem REVISÃO');
  });

  it('a frota do cadastro: o avião novo ocupa a coluna de um que saiu; a coluna sem avião fica com "-"; sem coluna, a última linha', () => {
    const frota = FROTA_INICIAL.filter(f => !['PR-IGU', 'PT-JOB'].includes(f.reg)).concat({ reg: 'PR-NEW', tipo: 'C152' }, { reg: 'PR-ZZZ', tipo: 'C152' });
    const p = planilhaDaEscala(escala([voo('PR-NEW', 'C152', '06:30', '07:30'), voo('PR-ZZZ', 'C152', '06:30', '07:30', { s: 'Caio' })]),
      estado({ frota }), '2026-11-13');
    assert.deepEqual([p.celulas.F4, p.celulas.F6, p.celulas.V17], ['PR-NEW', 'Ana', '-']);
    assert.deepEqual(p.foraDoModelo, ['PR-ZZZ 06:30–07:30 Caio (Bruno)']);
    assert.equal(p.celulas.A41, 'Fora do modelo (sem coluna na planilha): PR-ZZZ 06:30–07:30 Caio (Bruno)');
  });

  it('os simuladores com o nome do modelo, cada um na coluna da letra dele', () => {
    assert.equal(rotuloDoRecurso('SIM-MONO-A'), 'SIM A - MNTE');
    assert.equal(rotuloDoRecurso('SIM-MLTE-E'), 'SIM E - MLTE');
    assert.equal(rotuloDoRecurso('PR-VOB'), 'PR-VOB');
    const c = celulas([voo('SIM-MLTE-D', 'Sim. Multi', '10:10', '11:10', { mis: 'Simulador' })]);
    assert.deepEqual([c.B32, c.D32, c.F32, c.H32, c.J32], ['SIM A - MNTE', '-', 'SIM C - MNTE', 'SIM D - MLTE', 'SIM E - MLTE']);
    assert.equal(c.H36, 'Ana');
    assert.equal(c.H34, '', 'o "-" do modelo sai da coluna do simulador que existe');
    assert.equal(c.D34, undefined, 'a coluna sem simulador fica como no modelo');
  });

  it('o bloco é o do tipo do avião no cadastro, não o do pedido; a sala de Ground vai sempre para o Ground', () => {
    const p = planilhaDaEscala(escala([
      // O pedido mudou para C172 depois que o voo no PP-LJV (um C152) foi fixado
      voo('PP-LJV', 'C172', '08:20', '09:20'),
      // O Ground fixado cujo pedido virou um voo local
      voo('SALA-GROUND', 'C152', '08:20', '09:50', { s: 'Bia', mis: 'Voo Local', classKey: 'g1' })
    ]), estado({ frota: FROTA_INICIAL.filter(f => f.reg !== 'PR-IGU') }), '2026-11-13');
    assert.deepEqual([p.celulas.B4, p.celulas.B7], ['PP-LJV', 'Ana']);
    assert.equal(p.celulas.F4, '-', 'a sala não ocupa a coluna livre de um avião');
    assert.deepEqual(p.foraDoModelo, ['Voo Local 08:20–09:50 Bia (Bruno)']);
  });

  it('a coluna livre vai primeiro para o avião novo que voa no dia', () => {
    const frota = FROTA_INICIAL.filter(f => f.reg !== 'PR-HAR').concat({ reg: 'PR-AAA', tipo: 'C172' }, { reg: 'PR-BBB', tipo: 'C172' });
    const p = planilhaDaEscala(escala([voo('PR-BBB', 'C172', '08:20', '09:20')]), estado({ frota, av: { 'PR-AAA': false } }), '2026-11-13');
    assert.deepEqual([p.celulas.J17, p.celulas.J20], ['PR-BBB', 'Ana']);
    assert.deepEqual([p.foraDoModelo, p.vermelhas], [[], []]);
  });

  it('com três ou mais entradas na célula, os instrutores acompanham os alunos', () => {
    const c = celulas([
      voo('PP-LJV', 'C152', '12:40', '13:40', { s: 'Ana', ins: 'Bruno' }),
      voo('PP-LJV', 'C152', '13:40', '14:10', { s: 'Caio', ins: 'Carla' }),
      voo('PP-LJV', 'C152', '14:10', '14:30', { s: 'Duda', ins: 'Bruno' })
    ]);
    assert.equal(c.B10, 'Ana / Caio (13:40–14:10) / Duda (14:10–14:30)');
    assert.equal(c.C10, 'Bruno / Carla / Bruno');
  });

  it('sem a frota no estado, a frota inicial (como no motor)', () => {
    const p = planilhaDaEscala(escala([voo('PR-VOB', 'C152', '08:20', '09:20')]), { av: {}, fStatus: {}, fObs: {} }, '2026-11-13');
    assert.deepEqual([p.celulas.B4, p.celulas.H4, p.celulas.H7, p.celulas.B32], ['PP-LJV', 'PR-VOB', 'Ana', 'SIM A - MNTE']);
  });

  it('a linha com mais texto do que as 2 linhas do modelo fica mais alta; as outras ficam como no modelo', async () => {
    assert.deepEqual(['Ana', 'Maria Fernanda Souza (13:40–14:40)', 'Aluno 02, Aluno 03, Aluno 04', 'Pedro\nHenrique', 'Abcdefghijklmnopqrstuvwxyz0']
      .map(t => linhasDoTexto(t, 13)), [1, 4, 3, 2, 3]);
    const turma = ['Ana Clara Dias', 'Bruno Henrique Reis', 'Larissa Gomes'].map(n => ground(n, '08:20', '09:50'));
    const out = [voo('PP-LJV', 'C152', '13:40', '14:40', { s: 'Maria Fernanda Souza' }), voo('PR-VOB', 'C152', '06:30', '07:30'), ...turma];
    const p = planilhaDaEscala(escala(out), estado(), '2026-11-13');
    assert.equal(p.alturas[10], 12.75 * 4 + 5.25, 'Maria Fernanda Souza (13:40–14:40): 4 linhas');
    assert.equal(p.alturas[11], 12.75 * 3 + 5.25, 'Maria Fernanda Souza: 3 linhas');
    assert.equal(p.alturas[35], 12.75 * 5 + 5.25, 'a turma: 5 linhas');
    assert.equal(p.alturas[6], undefined, 'Ana cabe nas 2 linhas do modelo');
    const { alturas } = lerPlanilha(abrirZip((await montarPlanilha(MODELO, escala(out), estado(), '2026-11-13')).bytes));
    assert.deepEqual([alturas[10], alturas[11], alturas[35], alturas[6], alturas[7]], [56.25, 43.5, 69, 30.75, 30.75]);
  });

  it('a data: aba DD-MM-AAAA e o mês, o dia e o ano no quadro', () => {
    const p = planilhaDaEscala(escala([]), estado(), '2026-03-05');
    assert.equal(p.aba, '05-03-2026');
    assert.deepEqual([p.celulas.V31, p.celulas.V34, p.celulas.V39], ['MARÇO', '05', '2026']);
    assert.equal(nomeDaPlanilha('2026-03-05'), 'escala-acpm-2026-03-05.xlsx');
  });
});

describe('Texto vindo do cadastro no arquivo', () => {
  it('nomes com caracteres do XML, "$", emoji, fórmula e caracteres de controle: o arquivo continua válido e o texto aparece como texto', async () => {
    const nomes = {
      'Ana & <Bia> "Cia" \'x\'': 'Ana & <Bia> "Cia" \'x\'',
      'Caio $& $1 $` $\'': 'Caio $& $1 $` $\'',
      '=HYPERLINK("http://x","y")': '=HYPERLINK("http://x","y")',
      'Duda ✈ 𝄞': 'Duda ✈ 𝄞',
      'Eva\u0000\u0001\u0008\u000B\u001F\uFFFE\uFFFF\uD800 Lima': 'Eva Lima',
      'Fá\tbio\nSouza': 'Fá\tbio\nSouza',
      'Maria_x0041_Silva _x005f_ _x0041_x0042_': 'Maria_x0041_Silva _x005f_ _x0041_x0042_'
    };
    const out = Object.keys(nomes).map((s, i) => voo(['PP-LJV', 'PR-BTB', 'PR-IGU', 'PR-VOB', 'PR-VOC', 'PR-VOI', 'PR-VOP'][i], 'C152', '08:20', '09:20', { s, ins: `${s} (instrutor)` }));
    const { bytes } = await montarPlanilha(MODELO, escala(out), estado(), '2026-11-13');
    const saida = abrirZip(bytes);
    assert.deepEqual(conferirEstrutura(ARQUIVOS_DO_MODELO, saida), []);
    const { celulas: c } = lerPlanilha(saida);
    ['B', 'D', 'F', 'H', 'J', 'L', 'N'].forEach((col, i) => {
      const esperado = Object.values(nomes)[i];
      assert.equal(c[`${col}7`], esperado);
      assert.equal(c[`${seguinte(col)}7`], `${esperado} (instrutor)`);
    });
    assert.match(saida.get('xl/worksheets/sheet1.xml').toString('utf8'), /Maria_x005F_x0041_Silva _x005F_x005f_ _x005F_x0041_x005F_x0042_/,
      'todo "_" que abre "_xHHHH_" vai escapado, também na sequência sobreposta');
  });
});

// Os voos que voam (com o horário efetivo), para a conferência independente
const voosDoDia = (res, est) => res.out
  .map(o => ({ o, status: (est.fStatus || {})[o.fKey] || o.status || 'Confirmado' }))
  .filter(({ status }) => status !== 'Cancelado')
  .map(({ o, status }) => ({ ...intervaloEfetivo(o, status, (est.fObs || {})[o.fKey]), r: o.r, aluno: o.s, instrutor: o.ins, mis: o.mis,
    ground: Boolean(o.isGround) || o.r === 'SALA-GROUND' }));

// Um dia aleatório como o da operação: a frota do cadastro, aviões parados, voos cancelados, atrasados (alguns já em voo
// ou pousados) e aviões perto da revisão de 50 horas
function diaAleatorio(seed) {
  const r = mulberry32(seed * 7919);
  const est = { ...gerarCenario(seed), frota: FROTA_INICIAL.map(f => ({ ...f })) };
  const avioes = FROTA_INICIAL.filter(f => ['C152', 'C172', 'PA-34'].includes(f.tipo)).map(f => f.reg);
  est.horas = Object.fromEntries(avioes.filter(() => r() < 0.25).map(reg => [reg, 46 + Math.round(r() * 39) / 10]));
  const primeira = runAllocationEngine(est);
  est.fStatus = { ...est.fStatus };
  est.fObs = {};
  for (const o of primeira.out) {
    const x = r();
    if (x < 0.08) { est.fStatus[o.fKey] = 'Cancelado'; est.fObs[o.fKey] = { motivo: 'Meteorologia' }; }
    else if (x < 0.2) {
      est.fStatus[o.fKey] = ['Atrasado', 'Em Voo', 'Pousou'][Math.floor(r() * 3)];
      est.fObs[o.fKey] = { novoInicio: o.a + 10 * (1 + Math.floor(r() * 9)) };
    }
  }
  return { est, res: runAllocationEngine(est) };
}

async function conferirDia(res, est, data) {
  const { bytes, foraDoModelo } = await montarPlanilha(MODELO, res, est, data);
  const saida = abrirZip(bytes);
  const problemas = [...conferirEstrutura(ARQUIVOS_DO_MODELO, saida),
    ...conferirConteudoDoDia(saida, res, est, data)];
  // Com a frota de sempre, cada recurso tem a coluna dele
  if (est.frota === FROTA_INICIAL || est.frota.every((f, i) => f.reg === FROTA_INICIAL[i]?.reg)) {
    const { celulas: c } = lerPlanilha(saida);
    const nomes = new Set(Object.entries(c).filter(([ref]) => /^[A-Z]+(4|17|32)$/.test(ref)).map(([, t]) => t.trim()));
    for (const f of FROTA_INICIAL) if (!nomes.has(rotuloDoRecurso(f.reg))) problemas.push(`${f.reg} sem coluna`);
  }
  return { problemas, foraDoModelo, saida };
}
function conferirConteudoDoDia(saida, res, est, data) {
  return conferirConteudo(lerPlanilha(saida), voosDoDia(res, est), { data, frota: est.frota, av: est.av, revisao: res.revisao, arquivos: saida });
}

describe('O arquivo montado, conferido por fora', () => {
  it('o dia de exemplo: a estrutura do modelo e cada voo no lugar, conferidos pelos rótulos da planilha', async () => {
    const est = { ...comExemplo(estadoSintetico()), frota: FROTA_INICIAL };
    const res = runAllocationEngine(est);
    assert.ok(res.out.length > 20);
    const { problemas, foraDoModelo, saida } = await conferirDia(res, est, '2026-11-13');
    assert.deepEqual(problemas, []);
    assert.deepEqual(foraDoModelo, []);
    assert.equal(lerPlanilha(saida).aba, '13-11-2026');
  });

  it('60 dias aleatórios (cancelados, atrasados, aviões parados e revisão de 50 horas): estrutura e conteúdo certos', async () => {
    const falhas = [];
    const exercitado = { cancelados: 0, atrasados: 0, revisao: 0, vermelhos: 0, ground: 0, pa34ForaDaTabela: 0, continuacoes: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      const { est, res } = diaAleatorio(seed);
      const data = `2026-${String(1 + (seed % 12)).padStart(2, '0')}-${String(1 + (seed % 28)).padStart(2, '0')}`;
      const { problemas } = await conferirDia(res, est, data);
      if (problemas.length) falhas.push(`seed ${seed}: ${problemas.slice(0, 3).join(' | ')}`);
      const voos = voosDoDia(res, est);
      exercitado.cancelados += res.out.length - voos.length;
      exercitado.atrasados += Object.values(est.fObs).filter(d => Number.isInteger(d.novoInicio)).length;
      exercitado.revisao += Object.values(res.revisao || {}).filter(x => Number.isInteger(x.paraAs)).length;
      exercitado.vermelhos += Object.values(est.av).filter(d => d === false).length;
      exercitado.ground += voos.filter(v => v.ground).length;
      exercitado.pa34ForaDaTabela += voos.filter(v => v.r && /^(PR-VOM|PT-JOB|PT-KIW)$/.test(v.r) && ![390, 450, 510, 600, 660, 720, 810, 870, 960].includes(v.a)).length;
      exercitado.continuacoes += voos.filter(v => !v.ground && v.b - v.a > 110).length;
    }
    assert.deepEqual(falhas, []);
    // Os cenários exercitam de fato cada regra (senão o teste passaria sem conferir nada)
    for (const [regra, n] of Object.entries(exercitado)) assert.ok(n >= 5, `${regra}: só ${n} nos 60 dias`);
  });

  it('mais aviões que colunas: os que sobram vão para a última linha e o arquivo continua válido', async () => {
    const extras = Array.from({ length: 3 }, (_, i) => ({ reg: `PR-XT${i}`, tipo: 'C152' }));
    const est = estado({ frota: [...FROTA_INICIAL, ...extras] });
    const res = escala(extras.map((f, i) => voo(f.reg, 'C152', '08:20', '09:20', { s: `Aluno ${i}` })));
    const { problemas, foraDoModelo } = await conferirDia(res, est, '2026-11-13');
    assert.deepEqual(problemas, []);
    assert.equal(foraDoModelo.length, 3);
  });

  it('a última linha com muito texto quebra em linhas e fica mais alta', async () => {
    const extras = Array.from({ length: 8 }, (_, i) => ({ reg: `PR-XT${i}`, tipo: 'C152' }));
    const est = estado({ frota: [...FROTA_INICIAL, ...extras] });
    const res = escala(extras.map((f, i) => voo(f.reg, 'C152', '08:20', '09:20', { s: `Aluno Com Nome Comprido ${i}` })));
    const { problemas, foraDoModelo, saida } = await conferirDia(res, est, '2026-11-13');
    assert.deepEqual(problemas, []);
    assert.equal(foraDoModelo.length, 8);
    const lida = lerPlanilha(saida);
    assert.ok(lida.celulas.A41.length > 360, 'o texto passa de duas linhas');
    assert.ok(quebraLinhas(saida, lida.estilos.A41));
    assert.equal(lida.alturas[41], 18.75 * linhasDoTexto(lida.celulas.A41, 180));
  });

  it('as células de texto compartilhado que viram texto na célula saem da contagem do sharedStrings', async () => {
    const { bytes } = await montarPlanilha(MODELO, escala([voo('PR-VOB', 'C152', '08:20', '09:20')]), estado(), '2026-11-13');
    const saida = abrirZip(bytes);
    const contagem = arquivos => +/<sst [^>]*\bcount="(\d+)"/.exec(arquivos.get('xl/sharedStrings.xml').toString('utf8'))[1];
    const usos = arquivos => (arquivos.get('xl/worksheets/sheet1.xml').toString('utf8').match(/<c [^>]*?\bt="s"/g) || []).length;
    assert.equal(contagem(ARQUIVOS_DO_MODELO), usos(ARQUIVOS_DO_MODELO));
    assert.ok(usos(saida) < usos(ARQUIVOS_DO_MODELO), 'os cabeçalhos e a data viraram texto na célula');
    assert.equal(contagem(saida), usos(saida));
  });

  it('lerZip e o leitor de fora leem o mesmo arquivo montado; todo XML dele é bem formado', async () => {
    const { est, res } = diaAleatorio(7);
    const { bytes } = await montarPlanilha(MODELO, res, est, '2026-11-13');
    const nosso = await lerZip(bytes), deFora = abrirZip(bytes);
    assert.deepEqual(Object.keys(nosso), [...deFora.keys()]);
    for (const [nome, conteudo] of deFora) {
      assert.deepEqual(nosso[nome], new Uint8Array(conteudo), nome);
      if (/\.(xml|rels)$/.test(nome)) assert.equal(problemaNoXml(conteudo.toString('utf8')), null, nome);
    }
  });
});

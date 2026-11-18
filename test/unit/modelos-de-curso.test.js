// O modelo de curso do app (js/modelos-de-curso.js): o cronograma do Piloto Privado (P.I PPA 001A), como o desenho dos
// cursos o descreve (apêndice A, com os trechos do Noturno do adendo, §7). Ele entra num curso pela aba Cursos
// (novoCurso e aplicarModelo, em js/programa.js) e é o PP dos testes da próxima missão.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { novoCurso, percursoDoCurso, validarCurso, conteudoDoCurso, gravarCurso, cursosIniciais, normalizarProgramas, programaComResultados, noturnosDoCurso, rotuloDaMissao } from '../../js/programa.js';
import { codigoValido } from '../../js/cursos.js';
import { MIS } from '../../js/config.js';
import { FORMATO_DOS_CURSOS } from '../../js/migracoes.js';

const MODELO = MODELOS['pp-acpm'];
// O PP com o modelo, com os ids tirados da sigla e da chave (PP:F4, PP:TSL-01)
const PP = novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELO }, (s, c) => `${s}:${c}`).curso;
const { fases, missoes } = percursoDoCurso(PP);
const daFase = numero => missoes.filter(m => m.fase === `PP:F${numero}`).map(m => m.codigo);
const horas = lista => Math.round(lista.reduce((h, m) => h + m.nb, 0) * 10) / 10;

describe('O cronograma do PP (P.I PPA 001A)', () => {
  it('o nome, o documento e o curso para o qual foi feito', () => {
    assert.deepEqual([MODELO.nome, MODELO.documento, MODELO.curso], ['Cronograma do Piloto Privado', 'P.I PPA 001A', 'PP']);
    assert.deepEqual(Object.keys(MODELOS), ['pp-acpm']);
  });

  it('9 fases na ordem impressa, em 3 módulos: a Fase 6 (o voo noturno) entre a 8 e a 9, depois da Fase 4', () => {
    assert.deepEqual(fases.map(f => f.nome), [
      'Fase 1 – Introdução ao Voo', 'Fase 2 – O Controle da Aeronave', 'Fase 3 – A Coordenação de Atitude e Potência',
      'Fase 4 – Treinamento de Manobras e Aproximações', 'Fase 5 – Procedimentos Avançados e de Emergência', 'Fase 7 – Treinamento de Voo Solo',
      'Fase 8 – Procedimentos de Navegação Solo', 'Fase 6 – Treinamento de Voo Noturno', 'Fase 9 – Avaliação para Voo de Cheque'
    ]);
    assert.deepEqual(fases.map(f => f.modulo.slice(0, 9)), [...Array(5).fill('Módulo 01'), ...Array(3).fill('Módulo 02'), 'Módulo 03']);
    assert.deepEqual(fases.map(f => [f.regra, f.requer]), [...Array(7).fill(['ordem', []]), ['depois', ['PP:F4']], ['ordem', []]]);
  });

  it('47 missões, 46 contam (a ADAPTAÇÃO é dispensada), 45 h; a avaliação na CAP-04, na TMA-05 e na PE-03; a PE-04 (SPIN) livre na fase', () => {
    const contam = missoes.filter(m => !m.dispensada);
    assert.deepEqual([missoes.length, contam.length, horas(contam)], [47, 46, 45]);
    assert.deepEqual(missoes.filter(m => m.dispensada).map(m => m.codigo), ['ADAPT-C152']);
    assert.deepEqual(missoes.filter(m => m.avaliacao).map(m => m.codigo), ['CAP-04', 'TMA-05', 'PE-03']);
    assert.deepEqual(missoes.filter(m => m.regra !== 'ordem').map(m => [m.codigo, m.regra, m.requer]), [['PE-04', 'livre', []]]);
    // As horas de cada fase (as que contam): 2, 2, 4, 5, 10, 7,5, 7,5, 5 e 2
    assert.deepEqual([1, 2, 3, 4, 5, 7, 8, 6, 9].map(n => horas(contam.filter(m => m.fase === `PP:F${n}`))), [2, 2, 4, 5, 10, 7.5, 7.5, 5, 2]);
    // 10 h de solo (5 SOLO e 5 NAV SOLO), 3 h de noite e uma navegação de 150 NM
    assert.equal(horas(missoes.filter(m => m.mis === 'Voo Solo')), 10);
    assert.equal(missoes.find(m => m.trecho === 'noite').nb, 3);
    assert.deepEqual(missoes.find(m => m.codigo === 'NAV-150NM').nome, 'NAV – 150NM');
  });

  it('as missões de cada fase, na ordem impressa: o AV PROF. antes de cada SOLO e de cada NAV SOLO', () => {
    assert.deepEqual([1, 2, 3, 4].map(daFase), [['IN-01', 'IN-02'], ['CT-01', 'CT-02'], ['CAP-01', 'CAP-02', 'CAP-03', 'CAP-04'], ['TMA-01', 'TMA-02', 'TMA-03', 'TMA-04', 'TMA-05']]);
    assert.deepEqual(daFase(5), ['NAV-01', 'NAV-02', 'NAV-150NM', 'PE-01', 'PE-02', 'PE-03', 'PE-04']);
    const de1a5 = (a, b) => ['01', '02', '03', '04', '05'].flatMap(n => [`${a}-${n}`, `${b}-${n}`]);
    assert.deepEqual(daFase(7), ['ADAPT-C152', 'END-SOLO', ...de1a5('AVP-SOLO', 'SOLO')]);
    assert.deepEqual(daFase(8), ['END-SOLO-NAV', ...de1a5('AVP-NSOLO', 'NAV-SOLO')]);
    assert.deepEqual([daFase(6), daFase(9)], [['TSL-01', 'NOT', 'TSL-02'], ['AVX-CQ']]);
    assert.deepEqual(['SOLO-01', 'AVP-SOLO-01', 'NAV-SOLO-05', 'AVP-NSOLO-05', 'PE-04', 'AVX-CQ'].map(c => missoes.find(m => m.codigo === c)).map(m => [m.nome, m.mis, m.eq, m.nb]), [
      ['SOLO 01', 'Voo Solo', 'C152', 1], ['AV PROF. SOLO 01', 'Voo Local', 'C152', 0.3], ['NAV SOLO 05', 'Voo Solo', 'C152', 1],
      ['AV PROF. NAV SOLO 05', 'Voo Local', 'C152', 0.3], ['PE-04 – SPIN', 'Parafuso', 'C152', 1], ['AVX ENDOSSO CQ', 'Navegação', 'C152', 2]
    ]);
  });

  it('o Noturno em trechos: o TSL-01 (a ida), o NOT (a noite) e o TSL-02 (a volta), no C172, um voo só', () => {
    assert.deepEqual(missoes.filter(m => m.fase === 'PP:F6').map(m => [m.codigo, m.mis, m.eq, m.nb, m.trecho]),
      [['TSL-01', 'Noturno', 'C172', 1, 'ida'], ['NOT', 'Noturno', 'C172', 3, 'noite'], ['TSL-02', 'Noturno', 'C172', 1, 'volta']]);
    assert.equal(missoes.filter(m => m.trecho).length, 3, 'só as três');
    const noturno = noturnosDoCurso(PP).get('PP:NOT');
    assert.deepEqual([noturno.ida.codigo, noturno.noite.codigo, noturno.volta.codigo], ['TSL-01', 'NOT', 'TSL-02']);
    assert.equal(rotuloDaMissao(PP, noturno.noite), 'NOT (com TSL-01 e TSL-02)');
  });

  it('os códigos no formato e uma vez só; o tipo de missão com o recurso dele; o servidor aceita o programa', () => {
    assert.ok(missoes.every(m => codigoValido(m.codigo) && MIS[m.mis].eq.includes(m.eq) && m.nb > 0 && m.nb <= 5));
    assert.equal(new Set(missoes.map(m => m.codigo)).size, 47);
    // Num curso novo, com ids novos (uuid), conferido e gravado pela regra do servidor e lido de volta: o mesmo programa
    const { curso } = novoCurso(cursosIniciais(), { sigla: 'PP-A', nome: 'Piloto Privado (turma A)', modelo: MODELO });
    assert.equal(validarCurso(conteudoDoCurso(curso)), null);
    const estado = { cursos: cursosIniciais(), resultados: [], cadastro: { esquema: FORMATO_DOS_CURSOS, versao: 1 } };
    const gravado = gravarCurso(estado, { sigla: 'PP-A', versaoLida: 0, conteudo: conteudoDoCurso(curso), descricao: 'Curso PP-A criado: Piloto Privado (turma A)' });
    const lido = normalizarProgramas(programaComResultados({ cursos: gravado.cursos })).find(c => c.sigla === 'PP-A');
    assert.deepEqual(conteudoDoCurso(lido), conteudoDoCurso(curso));
    assert.deepEqual([lido.versao, lido.ordem, percursoDoCurso(lido).fases.length, percursoDoCurso(lido).missoes.length], [1, 3, 9, 47]);
  });

  it('o modelo não muda: quem o usa recebe cópias', () => {
    assert.ok(Object.isFrozen(MODELO) && Object.isFrozen(MODELO.fases[7]) && Object.isFrozen(MODELO.fases[7].missoes[1]));
    const curso = novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELO }).curso;
    curso.missoes[0].nome = 'Mudada';
    assert.equal(MODELO.fases[0].missoes[0].nome, 'IN-01');
  });
});

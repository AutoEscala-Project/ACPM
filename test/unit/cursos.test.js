// Cursos: o programa de cada curso (PP, PC e INVA), mantido no app pelo Administrador, e o curso de cada
// aluno. Cada missão do programa tem um código (PP-07), um nome, o tipo de missão do app, o recurso e as horas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CURSOS, cursosVazios, normalizarCursos, normalizarCursoDoAluno, novaMissaoDoCurso, siglaValida, SEM_CURSO, opcoesDoFiltroDosCursos } from '../../js/cursos.js';
import { passaNoFiltro, resumoDoFiltro } from '../../js/filtro-multiplo.js';

const missao = (id, extra = {}) => ({ id, nome: `Missão ${id}`, mis: 'Voo Local', eq: 'C152', nb: 1, ...extra });

describe('Programa dos cursos', () => {
  it('os três cursos, nesta ordem; sem programa, cada um começa vazio', () => {
    assert.deepEqual(CURSOS.map(([id]) => id), ['PP', 'PC', 'INVA']);
    assert.deepEqual(cursosVazios(), { PP: [], PC: [], INVA: [] });
    assert.deepEqual(normalizarCursos(undefined), cursosVazios());
  });

  it('só missões válidas: código curto e único no curso, missão do app, recurso da missão e horas de 0,1 a 5 (em décimos)', () => {
    const cursos = normalizarCursos({
      PP: [missao('PP-01'), missao('pp-02 ', { nome: '  Navegação  ', mis: 'Navegação', nb: 2 }), missao('PP-01'), missao('', {}), missao('PP 03'),
        missao('PP-04', { mis: 'Inexistente' }), missao('PP-05', { eq: 'PA-34', mis: 'Noturno' }), missao('PP-06', { nb: 40 }), missao('PP-07', { nb: 1.2 })],
      PC: 'x',
      XYZ: [missao('X-1')]
    });
    assert.deepEqual(cursos.PP.map(m => [m.id, m.nome, m.mis, m.eq, m.nb]), [
      ['PP-01', 'Missão PP-01', 'Voo Local', 'C152', 1],
      ['PP-02', 'Navegação', 'Navegação', 'C152', 2],
      ['PP-05', 'Missão PP-05', 'Noturno', 'C172', 1],
      // As horas fracionadas, até 5 h
      ['PP-06', 'Missão PP-06', 'Voo Local', 'C152', 5],
      ['PP-07', 'Missão PP-07', 'Voo Local', 'C152', 1.2]
    ]);
    assert.deepEqual([cursos.PC, cursos.INVA, Object.keys(cursos)], [[], [], ['PP', 'PC', 'INVA']]);
  });

  it('o Ground é na sala, com 1h30; sem nome, o nome é o código', () => {
    const [ground] = normalizarCursos({ PP: [missao('PP-G1', { mis: 'Ground C152', eq: 'C152', nb: 3, nome: '' })] }).PP;
    assert.deepEqual(ground, { id: 'PP-G1', nome: 'PP-G1', mis: 'Ground C152', eq: 'Sala Ground', nb: 1.5 });
  });

  it('a missão nova recebe o próximo número livre do curso', () => {
    assert.deepEqual(novaMissaoDoCurso('PP', []), { id: 'PP-01', nome: '', mis: 'Voo Local', eq: 'C152', nb: 1 });
    assert.equal(novaMissaoDoCurso('INVA', [missao('INVA-01'), missao('INVA-07'), missao('INVA-X')]).id, 'INVA-08');
  });

  it('a sigla do curso, como no servidor: de 2 a 10 letras maiúsculas, números e hífen, começando por letra e sem hífen no fim', () => {
    for (const certa of ['PP', 'PC', 'INVA', 'IFR', 'PC-IFR', 'MLTE2', 'ABCDEFGHIJ']) assert.equal(siglaValida(certa), true, certa);
    for (const errada of ['P', 'pp', 'Pp', '2PP', 'PP-', '-PP', 'PP 2', 'ABCDEFGHIJK', '<b>PP</b>', '', null, undefined, 12, ['PP']]) {
      assert.equal(siglaValida(errada), false, String(errada));
    }
  });

  it('o curso do aluno: a sigla conferida só no formato (um curso fora de PP, PC e INVA também fica)', () => {
    assert.deepEqual(['PC', 'IFR', 'PC-IFR'].map(normalizarCursoDoAluno), ['PC', 'IFR', 'PC-IFR']);
    for (const errado of ['pc', 'pp', '<b>PP</b>', 'PP ', '', undefined, null, 7]) assert.equal(normalizarCursoDoAluno(errado), undefined, String(errado));
  });
});

// O filtro dos cursos, em Alunos e na Demanda: as opções ([valor, rótulo no botão, texto da caixa]) e a regra "alguma"
// (um curso só por aluno), com "Sem curso" para quem não tem
describe('O filtro dos cursos', () => {
  const programa = [
    { sigla: 'PP', nome: 'Piloto Privado', ativo: true }, { sigla: 'MLTE', nome: 'Multimotor', ativo: false },
    { sigla: 'PC', nome: 'Piloto Comercial', ativo: true }, { sigla: 'INVA', nome: 'Instrutor de Voo', ativo: true }
  ];

  it('os ativos na ordem do programa, os encerrados marcados, o curso desconhecido de um aluno e "Sem curso" no fim', () => {
    const opcoes = opcoesDoFiltroDosCursos(programa, ['PP', 'ZZ9', undefined, 'PP', 'AB1', 'ZZ9', ''], { semProgramas: false });
    assert.deepEqual(opcoes, [
      ['PP', 'PP', 'PP · Piloto Privado'], ['PC', 'PC', 'PC · Piloto Comercial'], ['INVA', 'INVA', 'INVA · Instrutor de Voo'],
      ['MLTE', 'MLTE', 'MLTE · Multimotor (encerrado)'],
      // Uma vez cada, em ordem
      ['AB1', 'AB1', 'AB1 (curso desconhecido)'], ['ZZ9', 'ZZ9', 'ZZ9 (curso desconhecido)'],
      [SEM_CURSO, 'sem curso', 'Sem curso']
    ]);
    // "Sem curso" não é uma sigla: nenhum curso tem esse valor
    assert.equal(siglaValida(SEM_CURSO), false);
  });

  it('sem os programas lidos, o curso de fora fica só pela sigla (nada é dito sobre ele); sem aluno de fora, só os do programa', () => {
    const tres = CURSOS.map(([sigla, nome]) => ({ sigla, nome, ativo: true }));
    assert.deepEqual(opcoesDoFiltroDosCursos(tres, ['MLTE'], { semProgramas: true }).map(o => o[2]),
      ['PP · Piloto Privado', 'PC · Piloto Comercial', 'INVA · Instrutor de Voo', 'MLTE', 'Sem curso']);
    assert.deepEqual(opcoesDoFiltroDosCursos(tres, ['PP', undefined]).map(o => o[0]), ['PP', 'PC', 'INVA', SEM_CURSO]);
  });

  it('o aluno aparece se está em algum dos marcados ("alguma"); "Sem curso" acha quem não tem; o botão junta com "ou"', () => {
    assert.equal(passaNoFiltro(['PP'], ['PP', 'PC'], 'alguma'), true);
    assert.equal(passaNoFiltro(['INVA'], ['PP', 'PC'], 'alguma'), false);
    assert.equal(passaNoFiltro([SEM_CURSO], ['PP', SEM_CURSO], 'alguma'), true);
    assert.equal(passaNoFiltro([SEM_CURSO], ['PP'], 'alguma'), false);
    assert.equal(passaNoFiltro(['PP'], [], 'alguma'), true);
    const rotulos = new Map(opcoesDoFiltroDosCursos(programa, []).map(([valor, rotulo]) => [valor, rotulo]));
    assert.equal(resumoDoFiltro(['PP', SEM_CURSO].map(v => rotulos.get(v)), { nome: 'Curso', todas: 'Todos os cursos', regra: 'alguma' }), 'Curso: PP ou sem curso');
    assert.equal(resumoDoFiltro([], { nome: 'Curso', todas: 'Todos os cursos', regra: 'alguma' }), 'Todos os cursos');
  });
});

describe('A missão do curso no pedido e na escala', async () => {
  const { normalizeMissionFields } = await import('../../js/rules.js');
  const { runAllocationEngine } = await import('../../js/engine.js');
  const { aluno, cenario, instrutor, missaoExtra, GROUND_C152 } = await import('../helpers/montar.js');

  it('o pedido guarda o código da missão do curso; um código fora do formato sai', () => {
    const certo = { mis: 'Navegação', eq: 'C152', p1: 500, p2: -1, nb: 2, etapa: 'PP-07' };
    normalizeMissionFields(certo);
    assert.equal(certo.etapa, 'PP-07');
    const errado = { mis: 'Navegação', eq: 'C152', p1: 500, p2: -1, nb: 2, etapa: 'PP 07' };
    normalizeMissionFields(errado);
    assert.equal(Object.hasOwn(errado, 'etapa'), false);
  });

  it('o voo, a missão extra e o Ground levam o código para a escala', () => {
    const { out } = runAllocationEngine(cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 390, p2: -1, etapa: 'PP-07' }, { extra: [missaoExtra(1001, { p1: 610, p2: -1, etapa: 'PP-08' })] }),
        aluno(1002, { ...GROUND_C152, p1: 500, p2: -1, etapa: 'PP-G1' }), aluno(1003, { p1: 870, p2: -1 })]
    }));
    const porPedido = Object.fromEntries(out.map(o => [`${o.stuId}_${o.mid}`, o.etapa]));
    assert.deepEqual(porPedido, { '1000_0': 'PP-07', '1000_1001': 'PP-08', '1002_0': 'PP-G1', '1003_0': undefined });
  });
});

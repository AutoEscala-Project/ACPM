// Resultados das missões dos cursos: o operador registra aprovado ou reprovado (pendente desfaz um engano);
// os registros só crescem e a situação de cada missão é o último. A próxima missão e o progresso, que saem da
// situação, estão em progresso.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoPorMissao, situacaoDa, registroDa, resultadoDoVoo, validarRegistro, ultimoResultadoDoAluno, dataDoResultadoSemVoo, vooDaMissao } from '../../js/resultados.js';

const reg = (id, aluno, curso, missao, resultado, extra = {}) => ({ id, aluno, curso, missao, resultado, data: '2026-11-10', voo: null, ...extra });

describe('Resultados das missões', () => {
  it('a situação de cada missão é o último registro; sem registro, pendente', () => {
    const mapa = situacaoPorMissao([
      reg(1, 1000, 'PP', 'PP-01', 'reprovado'), reg(2, 1000, 'PP', 'PP-01', 'aprovado'), reg(3, 1000, 'PP', 'PP-02', 'aprovado'),
      reg(4, 1000, 'PP', 'PP-02', 'pendente'), reg(5, 1001, 'PP', 'PP-01', 'reprovado')
    ]);
    assert.deepEqual(['PP-01', 'PP-02', 'PP-03'].map(m => situacaoDa(mapa, 1000, 'PP', m)), ['aprovado', 'pendente', 'pendente']);
    assert.equal(situacaoDa(mapa, 1001, 'PP', 'PP-01'), 'reprovado');
    assert.equal(situacaoDa(mapa, 1000, 'PC', 'PP-01'), 'pendente', 'cada curso tem a sua situação');
    // O último registro inteiro (o motivo da missão fora da ordem diz a data da reprovada)
    assert.deepEqual([registroDa(mapa, 1001, 'PP', 'PP-01').id, registroDa(mapa, 1000, 'PP', 'PP-02').id, registroDa(mapa, 1000, 'PP', 'PP-03')], [5, 4, null]);
  });

  it('o resultado de um voo na escala do dia: o último registro dele', () => {
    const doDia = [reg(1, 1000, 'PP', 'PP-01', 'aprovado', { voo: '1000_0_1' }), reg(2, 1001, 'PP', 'PP-02', 'reprovado', { voo: '1001_0_1' }),
      reg(3, 1000, 'PP', 'PP-01', 'reprovado', { voo: '1000_0_1' })];
    assert.equal(resultadoDoVoo(doDia, '1000_0_1'), 'reprovado');
    assert.equal(resultadoDoVoo(doDia, '1002_0_1'), null);
  });

  it('o registro: curso, código, resultado, data e voo nos formatos do servidor', () => {
    const certo = { aluno: 1000, curso: 'PP', missao: ' pp-07 ', resultado: 'aprovado', data: '2026-11-10', voo: '1000_0_1' };
    assert.deepEqual(validarRegistro(certo), { ...certo, missao: 'PP-07' });
    assert.deepEqual(validarRegistro({ ...certo, voo: null }).voo, null);
    // Sem a lista dos cursos, só o formato da sigla: o curso que o Administrador criou também vale
    assert.equal(validarRegistro({ ...certo, curso: 'PC-IFR' }).curso, 'PC-IFR');
    for (const errado of [{ aluno: 0 }, { curso: 'pp' }, { curso: 'X' }, { curso: 'PP-' }, { curso: null }, { missao: 'PP 07' }, { resultado: 'talvez' },
      { data: '10/11/2026' }, { data: '2026-02-30' }, { voo: 'x' }]) {
      assert.throws(() => validarRegistro({ ...certo, ...errado }), { code: '23514', message: 'resultado fora do formato' }, JSON.stringify(errado));
    }
  });

  it('com a lista dos cursos, o curso desconhecido é recusado antes do resto, como no servidor (23514)', () => {
    const certo = { aluno: 1000, curso: 'ZZ9', missao: 'ZZ9-01', resultado: 'aprovado', data: '2026-11-10', voo: null };
    const cursos = ['PP', 'PC', 'INVA', 'ZZ9'];
    assert.equal(validarRegistro(certo, { cursos }).curso, 'ZZ9');
    for (const curso of ['XX', 'pp']) {
      assert.throws(() => validarRegistro({ ...certo, curso, resultado: 'talvez' }, { cursos }), { code: '23514', message: 'curso desconhecido' }, curso);
    }
    assert.throws(() => validarRegistro({ ...certo, resultado: 'talvez' }, { cursos }), { code: '23514', message: 'resultado fora do formato' });
  });
});

// A "Missão anterior" de Alunos (passo A): o último resultado do aluno no curso que não é pendente (o pendente desfaz),
// pela data e depois pela hora do registro; sem voo quando o registro não tem voo
describe('O último resultado do aluno no curso', () => {
  const sit = (missao, resultado, data, registrado_em, extra = {}) => ({ aluno: 1000, curso: 'PP', missao, resultado, data, voo: null, registrado_em, registrado_por: 'Maria', ...extra });

  it('o mais recente pela data e, na mesma data, pela hora do registro; o pendente não conta', () => {
    const registros = [
      sit('IN-01', 'aprovado', '2026-11-10', '2026-11-10T12:00:00Z', { voo: '1000_0_1' }),
      sit('IN-02', 'reprovado', '2026-11-12', '2026-11-12T09:00:00Z'),
      sit('CT-01', 'aprovado', '2026-11-12', '2026-11-12T08:00:00Z'),
      sit('CT-02', 'pendente', '2026-11-13', '2026-11-13T08:00:00Z'),
      sit('CAP-01', 'aprovado', '2026-11-20', '2026-11-20T08:00:00Z', { curso: 'PC' }),
      sit('CAP-02', 'aprovado', '2026-11-20', '2026-11-20T08:00:00Z', { aluno: 1001 })
    ];
    assert.deepEqual(ultimoResultadoDoAluno(registros, 1000, 'PP'), registros[1]);
    assert.equal(ultimoResultadoDoAluno(registros, 1000, 'PC').missao, 'CAP-01', 'cada curso, o seu');
    assert.equal(ultimoResultadoDoAluno(registros, 1002, 'PP'), null);
    assert.equal(ultimoResultadoDoAluno([], 1000, 'PP'), null);
  });

  it('a lista é indexada uma vez: a mesma lista responde de novo sem percorrer tudo, e uma lista nova vale na hora', () => {
    const registros = [sit('IN-01', 'aprovado', '2026-11-10', '2026-11-10T12:00:00Z')];
    assert.equal(ultimoResultadoDoAluno(registros, 1000, 'PP').missao, 'IN-01');
    const novos = [...registros, sit('IN-02', 'aprovado', '2026-11-11', '2026-11-11T12:00:00Z')];
    assert.equal(ultimoResultadoDoAluno(novos, 1000, 'PP').missao, 'IN-02');
  });
});

// "Registrar resultado sem voo" (Alunos): a data começa na data aberta quando ela não é depois de hoje (o app abre em
// amanhã), senão hoje; a missão que tem voo na data aberta é registrada no voo (o resultado do voo é pelo voo)
describe('O resultado sem voo', () => {
  it('a data: a aberta até hoje; depois de hoje, hoje', () => {
    assert.equal(dataDoResultadoSemVoo('2026-11-10', '2026-11-12'), '2026-11-10');
    assert.equal(dataDoResultadoSemVoo('2026-11-12', '2026-11-12'), '2026-11-12');
    assert.equal(dataDoResultadoSemVoo('2026-11-13', '2026-11-12'), '2026-11-12');
  });

  it('o voo do aluno na data com a missão (o primeiro pelo horário); o cancelado também conta; outro aluno ou missão, nenhum', () => {
    const out = [
      { fKey: '1000_1_1', stuId: 1000, etapa: 'PE-03', a: 620, r: 'PR-VOB' }, { fKey: '1000_0_1', stuId: 1000, etapa: 'PE-03', a: 500, r: 'PR-VOC' },
      { fKey: '1001_0_1', stuId: 1001, etapa: 'PE-04', a: 500, r: 'PR-VOD' }
    ];
    assert.equal(vooDaMissao(out, 1000, 'PE-03').fKey, '1000_0_1');
    assert.equal(vooDaMissao(out, 1000, 'PE-04'), null);
    assert.equal(vooDaMissao(null, 1000, 'PE-03'), null);
  });
});

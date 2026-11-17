// O programa dos cursos em fases: o programa de antes (o do cadastro) no formato novo, uma fase por curso com as missões
// na mesma ordem, e o índice do programa (o curso, o caminho dele, a missão pelo id e pelo código).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { programaDoLegado, percursoDoCurso, indiceDoPrograma, rotuloDaFase } from '../../js/programa.js';
import { normalizarCursos } from '../../js/cursos.js';
import { cursoPP } from '../helpers/programa-pp.js';

const gerarId = (sigla, codigo) => `${sigla}:${codigo}`;
const missao = (id, extra = {}) => ({ id, nome: `Missão ${id}`, mis: 'Voo Local', eq: 'C152', nb: 1, ...extra });

describe('O programa de antes no formato novo', () => {
  it('os três cursos, na ordem, cada um numa fase "Programa" com as missões na mesma ordem, todas depois das anteriores', () => {
    const cursos = normalizarCursos({ PP: [missao('PP-01'), missao('PP-02', { nome: 'Navegação', mis: 'Navegação', nb: 2 })], PC: [missao('PC-01', { mis: 'IFR', eq: 'C172' })] });
    const programa = programaDoLegado(cursos, gerarId);
    assert.deepEqual(programa.map(({ sigla, nome, ordem, ativo }) => ({ sigla, nome, ordem, ativo })), [
      { sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true },
      { sigla: 'PC', nome: 'Piloto Comercial', ordem: 1, ativo: true },
      { sigla: 'INVA', nome: 'Instrutor de Voo', ordem: 2, ativo: true }
    ]);
    const [pp, pc, inva] = programa;
    assert.deepEqual(pp.fases, [{ id: 'PP:Programa', nome: 'Programa', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false }]);
    assert.deepEqual(pp.missoes, [
      { id: 'PP:PP-01', fase: 'PP:Programa', codigo: 'PP-01', nome: 'Missão PP-01', mis: 'Voo Local', eq: 'C152', nb: 1, ordem: 0, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false },
      { id: 'PP:PP-02', fase: 'PP:Programa', codigo: 'PP-02', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2, ordem: 1, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false }
    ]);
    assert.deepEqual(pc.missoes.map(m => [m.id, m.codigo, m.mis, m.eq]), [['PC:PC-01', 'PC-01', 'IFR', 'C172']]);
    // O curso sem missões também vai (a conversão espelha o cadastro)
    assert.deepEqual([inva.fases.length, inva.missoes], [1, []]);
  });

  it('os ids vêm de quem converte (o servidor recebe ids novos; a tela, ids fixos)', () => {
    let n = 0;
    const programa = programaDoLegado(normalizarCursos({ PP: [missao('PP-01')] }), () => `id-${++n}`);
    assert.deepEqual([programa[0].fases[0].id, programa[0].missoes[0].id, programa[0].missoes[0].fase], ['id-1', 'id-2', 'id-1']);
    assert.equal(new Set(programa.flatMap(c => [...c.fases, ...c.missoes].map(x => x.id))).size, n, 'um id para cada fase e missão');
  });
});

describe('O índice do programa', () => {
  // O PP com a NAV-02 tirada do programa e uma fase tirada (sem missões), na mesma ordem da Fase 2
  const comRetiradas = () => {
    const curso = cursoPP();
    curso.missoes.find(m => m.codigo === 'NAV-02').removida = true;
    curso.fases.push({ id: 'PP:velha', nome: 'Fase velha', modulo: null, ordem: 1, regra: 'ordem', requer: [], removida: true });
    // Fora da ordem na lista: o caminho segue a ordem
    curso.fases.reverse();
    curso.missoes.reverse();
    return curso;
  };

  it('o curso pela sigla; o caminho: as fases e as missões do programa na ordem do curso, com a posição de cada missão', () => {
    const programa = [comRetiradas()];
    const indice = indiceDoPrograma(programa);
    assert.equal(indice.curso('PP'), programa[0]);
    assert.equal(indice.curso('PC'), null);
    assert.equal(indice.percurso('PC'), null);
    const { fases, porFase, missoes, posicao } = indice.percurso('PP');
    assert.deepEqual(fases.map(rotuloDaFase), ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 7', 'Fase 8', 'Fase 6', 'Fase 9']);
    assert.deepEqual(porFase.get('PP:F5').map(m => m.codigo), ['NAV-01', 'NAV-150NM', 'PE-01', 'PE-02', 'PE-03', 'PE-04'], 'a NAV-02 saiu');
    assert.equal(missoes.length, 46);
    assert.deepEqual(missoes.slice(-5).map(m => m.codigo), ['NAV-SOLO-05', 'TSL-01', 'NOT', 'TSL-02', 'AVX-CQ'], 'a Fase 6 depois da 8');
    assert.deepEqual([posicao.get('PP:IN-01'), posicao.get('PP:TSL-01'), posicao.get('PP:AVX-CQ'), posicao.has('PP:NAV-02')], [0, 42, 45, false]);
  });

  it('a missão pelo id e pelo código, também a tirada do programa (o código antigo continua com nome)', () => {
    const indice = indiceDoPrograma([comRetiradas(), ...programaDoLegado(normalizarCursos({ PC: [missao('PC-01')] }), gerarId).slice(1)]);
    assert.equal(indice.missao('PP:NAV-02').nome, 'NAV 02');
    assert.equal(indice.missaoPorCodigo('PP', 'NAV-02').removida, true);
    assert.equal(indice.missaoPorCodigo('PC', 'PC-01').id, 'PC:PC-01');
    assert.equal(indice.missaoPorCodigo('PC', 'NAV-02'), null, 'o código é do curso');
    assert.equal(indice.missao('PP:XX'), null);
  });

  it('calculado uma vez por lista de cursos e uma vez por curso', () => {
    const programa = [cursoPP()];
    assert.equal(indiceDoPrograma(programa), indiceDoPrograma(programa));
    assert.notEqual(indiceDoPrograma(programa), indiceDoPrograma([...programa]));
    assert.equal(indiceDoPrograma(programa).percurso('PP'), percursoDoCurso(programa[0]));
    assert.equal(percursoDoCurso(programa[0]), percursoDoCurso(programa[0]));
  });

  it('o nome curto da fase: o que vem antes do travessão', () => {
    assert.deepEqual(['Fase 6 – Treinamento de Voo Noturno', 'Fase 3 — Coordenação', 'Fase 2 - Navegação', 'Pré-solo', 'Programa', 'Fase 10'].map(nome => rotuloDaFase({ nome })),
      ['Fase 6', 'Fase 3', 'Fase 2', 'Pré-solo', 'Programa', 'Fase 10']);
  });
});

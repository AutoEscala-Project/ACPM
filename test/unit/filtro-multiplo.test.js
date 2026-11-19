// O filtro de vários valores: a regra de cada uso ("todas" nas habilitações dos instrutores, "alguma" num valor só por
// linha) e o texto do botão
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REGRAS_DO_FILTRO, passaNoFiltro, resumoDoFiltro } from '../../js/filtro-multiplo.js';

// As habilitações de um instrutor, como na linha da tabela (data-hab), com a habilitação própria do PR-VOM
const noturnoNoC172 = ['local', 'c152', 'c172', 'noturno'];
const soNoturno = ['local', 'c152', 'noturno'];
const comOVom = ['local', 'c172', 'noturno', 'aviao:PR-VOM'];

describe('Filtro de vários valores', () => {
  it('"todas": passa quem tem todas as marcadas (Noturno e C172), em qualquer ordem', () => {
    assert.equal(passaNoFiltro(noturnoNoC172, ['noturno', 'c172'], 'todas'), true);
    assert.equal(passaNoFiltro(noturnoNoC172, ['c172', 'noturno'], 'todas'), true);
    assert.equal(passaNoFiltro(soNoturno, ['noturno', 'c172'], 'todas'), false);
    assert.equal(passaNoFiltro(['c172'], ['noturno', 'c172'], 'todas'), false);
    // Uma só: basta ela
    assert.equal(passaNoFiltro(soNoturno, ['noturno'], 'todas'), true);
  });

  it('"todas" é a regra sem regra dita', () => {
    assert.equal(passaNoFiltro(soNoturno, ['noturno', 'c172']), false);
    assert.equal(passaNoFiltro(noturnoNoC172, ['noturno', 'c172']), true);
  });

  it('a habilitação própria do recurso (aviao:PR-VOM) é uma marca como as outras', () => {
    assert.equal(passaNoFiltro(comOVom, ['aviao:PR-VOM', 'noturno'], 'todas'), true);
    assert.equal(passaNoFiltro(noturnoNoC172, ['aviao:PR-VOM', 'noturno'], 'todas'), false);
    // O nome parecido não conta: a marca inteira
    assert.equal(passaNoFiltro(['aviao:PR-VOMX'], ['aviao:PR-VOM'], 'todas'), false);
  });

  it('sem nenhuma marcada, todos passam (também quem não tem nenhuma habilitação), nas duas regras', () => {
    for (const regra of ['todas', 'alguma']) {
      assert.equal(passaNoFiltro(noturnoNoC172, [], regra), true);
      assert.equal(passaNoFiltro([], [], regra), true);
      // A linha sem habilitação (data-hab vazio: [''])
      assert.equal(passaNoFiltro([''], [], regra), true);
    }
    assert.equal(passaNoFiltro([''], ['noturno'], 'todas'), false);
  });

  it('"alguma": passa quem tem pelo menos uma das marcadas (o curso, um só por aluno)', () => {
    assert.equal(passaNoFiltro(['PP'], ['PP', 'PC'], 'alguma'), true);
    assert.equal(passaNoFiltro(['PC'], ['PP', 'PC'], 'alguma'), true);
    assert.equal(passaNoFiltro(['INVA'], ['PP', 'PC'], 'alguma'), false);
    assert.equal(passaNoFiltro(soNoturno, ['noturno', 'c172'], 'alguma'), true);
  });

  it('o texto do botão: sem marca, "Todas as…"; com marcas, o nome e os rótulos juntados pela regra', () => {
    const habilitacoes = { nome: 'Habilitações', todas: 'Todas as habilitações', regra: 'todas' };
    assert.equal(resumoDoFiltro([], habilitacoes), 'Todas as habilitações');
    assert.equal(resumoDoFiltro(['Noturno'], habilitacoes), 'Habilitações: Noturno');
    assert.equal(resumoDoFiltro(['Noturno', 'C172'], habilitacoes), 'Habilitações: Noturno + C172');
    assert.equal(resumoDoFiltro(['PP', 'PC'], { nome: 'Curso', todas: 'Todos os cursos', regra: 'alguma' }), 'Curso: PP ou PC');
  });

  it('a frase de cada regra diz qual é (quem só consulta não lê um resultado vazio como "ninguém")', () => {
    assert.equal(REGRAS_DO_FILTRO.todas.frase, 'Mostra quem tem todas as marcadas.');
    assert.equal(REGRAS_DO_FILTRO.alguma.frase, 'Mostra quem tem alguma das marcadas.');
  });
});

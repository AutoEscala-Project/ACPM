// O driver de Alunos (donos: F2, depois A): a aba, o filtro dos cursos (o mesmo na Demanda) e as telas que os testes do
// celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irPara, marcarNoFiltro, nenhumComOsFiltros } from './casca.js';

export const abrirAlunos = page => irPara(page, 'alu');

// O filtro dos cursos de Alunos ('alu') ou da Demanda ('dem'): os valores são as siglas ('PP', 'PC'…) e 'sem-curso'
export const filtrarCursos = (page, aba, valores, opcoes) => marcarNoFiltro(page, `flt-${aba}-cur`, valores, opcoes);

// As telas de Alunos que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): a tabela sem nenhum com
// os filtros e o filtro dos cursos aberto, com duas marcas. No fim, a busca e as marcas voltam a vazias. nome null: só o
// passo, sem conferir a tela
export const ESTADOS = [
  {
    nome: 'alunos: nenhum com os filtros',
    preparar: async page => {
      await abrirAlunos(page);
      await page.locator('[data-flt="alu"]').fill('nenhum assim');
      await nenhumComOsFiltros(page, 'alu', 'alu');
    }
  },
  {
    nome: 'alunos: o filtro dos cursos aberto, com duas marcas',
    preparar: async page => {
      await page.locator('[data-flt="alu"]').fill('');
      await abrirAlunos(page);
      await filtrarCursos(page, 'alu', ['PP', 'sem-curso'], { fechar: false });
      await expect(page.locator('#flt-alu-cur')).toHaveText('Curso: PP ou sem curso');
    }
  },
  { nome: null, preparar: page => filtrarCursos(page, 'alu', []) }
];

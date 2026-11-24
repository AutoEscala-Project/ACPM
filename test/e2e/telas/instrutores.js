// O driver de Instrutores (dono: C): a grade da disponibilidade do dia (o "Vem" de cada instrutor), o filtro das
// habilitações e as telas que os testes do celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irParaVista, marcarNoFiltro, nenhumComOsFiltros } from './casca.js';

// Instrutores numa vista ('dia': a Disponibilidade do dia; 'cadastro')
export const abrirInstrutores = (page, vista = 'dia') => irParaVista(page, 'ins', vista);

// A grade da Disponibilidade do dia (uma linha por instrutor, data-id) e o cabeçalho dela
export const gradeDoDia = page => page.locator('#inst-dia');
export const cabecalhoDaGrade = page => page.locator('#inst-dia-cab');
export const linhaDoInstrutor = (page, id) => page.locator(`#inst-dia tr[data-id="${id}"]`);
// O "Vem" de uma linha da grade (ou de um trecho dela)
export const caixaVem = linha => linha.locator('[data-f="on"]');
export async function alternarVem(page, id, vem) {
  if (vem) await caixaVem(linhaDoInstrutor(page, id)).check();
  else await caixaVem(linhaDoInstrutor(page, id)).uncheck();
}

// O filtro das habilitações de Instrutores: os valores são as habilitações ('mlte', 'aviao:PR-VOM'…)
export const filtrarHabilitacoes = (page, valores, opcoes) => marcarNoFiltro(page, 'flt-ins-hab', valores, opcoes);

// As telas de Instrutores que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): o cadastro, as
// duas tabelas sem nenhum com os filtros e o filtro das habilitações aberto, com duas marcas. No fim, a busca e as
// marcas voltam a vazias. nome null: só o passo, sem conferir a tela
export const ESTADOS = [
  { nome: 'instrutores: cadastro', preparar: page => abrirInstrutores(page, 'cadastro') },
  {
    nome: 'instrutores: cadastro, nenhum com os filtros',
    preparar: async page => {
      await page.locator('[data-flt="inst"]').fill('nenhum assim');
      await nenhumComOsFiltros(page, 'inst', 'ins');
    }
  },
  {
    nome: 'instrutores: disponibilidade do dia, nenhum com os filtros',
    preparar: async page => {
      await abrirInstrutores(page, 'dia');
      await nenhumComOsFiltros(page, 'inst-dia', 'ins');
    }
  },
  {
    nome: 'instrutores: o filtro das habilitações aberto, com duas marcas',
    preparar: async page => {
      await page.locator('[data-flt="inst"]').fill('');
      await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
      await expect(page.locator('#flt-ins-hab')).toHaveText('Habilitações: Noturno + C172');
    }
  },
  { nome: null, preparar: page => filtrarHabilitacoes(page, []) }
];

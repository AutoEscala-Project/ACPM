// O driver da Demanda (donos: G1, que troca campoDoPedido pelo editor das restrições do voo, e G2, que troca a Demanda
// pelo Processamento): as linhas dos pedidos, o "Voa" de cada um, "Importar da agenda" e as telas que os testes do
// celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irPara, nenhumComOsFiltros } from './casca.js';
import { filtrarCursos } from './alunos.js';

// A linha de um pedido: o aluno (data-id) e a missão (mid: 0 é a do pedido; as extras, 1, 2…)
export const linhaDoPedido = (page, id, mid = 0) => page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="${mid}"]`);
// Um campo do pedido (data-f): o Voa e a missão, na linha da Demanda; os outros ('eq', 'insId', 'pr', 'p1', 'p2', 'nb'), nas
// restrições do pedido (G1), que precisam estar abertas (abrirRestricoes, telas/restricoes.js)
export const campoDoPedido = (page, id, campo, { mid = 0 } = {}) => (['fly', 'mis'].includes(campo)
  ? linhaDoPedido(page, id, mid).locator(`[data-f="${campo}"]`)
  : page.locator(`#painel-restricoes .restricoes-campos[data-id="${id}"][data-mid="${mid}"] [data-f="${campo}"]`));
// O "Voa" de uma linha da Demanda (ou de um trecho dela)
export const caixaVoa = linha => linha.locator('[data-f="fly"]');
// Marca (sim) ou desmarca o "Voa" do pedido do aluno; sem mid, o de todas as linhas dele (que precisam ser uma só)
export async function voar(page, id, sim, { mid } = {}) {
  const linha = mid === undefined ? page.locator(`#dem tr[data-k="d"][data-id="${id}"]`) : linhaDoPedido(page, id, mid);
  if (sim) await caixaVoa(linha).check();
  else await caixaVoa(linha).uncheck();
}

// "Importar da agenda" (o botão diz quantos pedidos há para importar)
export const botaoImportarDaAgenda = page => page.locator('#importar-agenda');
export async function importarDaAgenda(page) {
  await botaoImportarDaAgenda(page).click();
}

// As telas da Demanda que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): o filtro dos cursos
// aberto, com duas marcas, e a tabela sem nenhum com os filtros. No fim, as marcas e a busca voltam a vazias. nome
// null: só o passo, sem conferir a tela
export const ESTADOS = [
  {
    nome: 'demanda: o filtro dos cursos aberto, com duas marcas',
    preparar: async page => {
      await irPara(page, 'dem');
      await filtrarCursos(page, 'dem', ['PP', 'sem-curso'], { fechar: false });
      await expect(page.locator('#flt-dem-cur')).toHaveText('Curso: PP ou sem curso');
    }
  },
  {
    nome: 'demanda: nenhum com os filtros',
    preparar: async page => {
      await filtrarCursos(page, 'dem', []);
      await page.locator('#flt-dem').fill('nenhum assim');
      await nenhumComOsFiltros(page, 'dem');
    }
  },
  { nome: null, preparar: page => page.locator('#flt-dem').fill('') }
];

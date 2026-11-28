// O driver do Processamento (dono: G2; no lugar do da Demanda): a lista dos pedidos da data e dos voos sem pedido (ul#proc,
// uma linha por chave: o fKey do voo, "1000_0_1", ou "p:<id>" do pedido sem voo), o detalhe (#det-proc) e as ações dele, o
// aviso do alto com "Atualizar a escala", a linha de estado das ações (#proc-status), "Recomeçar pelos pedidos" (no "Mais") e
// as telas que os testes do celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irPara, marcarNoFiltro } from './casca.js';
import { registrarPedido } from './pedidos.js';

const CHAVE = /^(p:\d+|\d+_\d+_\d+)$/;
export const linhasDoProcessamento = page => page.locator('#proc > li.lista-linha');
// A linha de uma chave, ou a que tem o texto
export const linhaDoProcessamento = (page, chave) => (CHAVE.test(String(chave))
  ? page.locator(`#proc > li.lista-linha[data-proc="${chave}"]`)
  : linhasDoProcessamento(page).filter({ hasText: chave }));
// A terceira linha (a situação) da linha de uma chave
export const situacaoNoProcessamento = (page, chave) => linhaDoProcessamento(page, chave).locator('.lista-l3');
// Escolhe a linha: o detalhe dela aparece
export async function escolherNoProcessamento(page, chave) {
  await linhaDoProcessamento(page, chave).locator('.lista-botao').click();
  await expect(page.locator('#det-proc .det-titulo')).toBeVisible();
}
// O detalhe: uma linha dele ("Situação", "Lista de espera das 08:20"…) e as ações ('restricoes', 'por-de-volta',
// 'trazer', 'aprovar', 'tirar')
export const campoDoProcessamento = (page, rotulo) => page.locator('#det-proc .det-campo').filter({ has: page.locator('.det-rotulo', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('.det-valor');
export const acaoDoProcessamento = (page, acao) => page.locator(`#det-proc-${acao}`);
// A ação da linha ("Pôr de volta", "Trazer de volta")
export const acaoNaLinha = (page, chave) => linhaDoProcessamento(page, chave).locator('.lista-acao');

// O aviso do alto, "Atualizar a escala" e a linha de estado das ações
export const avisoDoProcessamento = page => page.locator('#proc-atualizacao');
export const botaoAtualizarAEscala = page => page.locator('#proc-atualizar');
export const estadoDoProcessamento = page => page.locator('#proc-status');
export const contagemDoProcessamento = page => page.locator('#proc-cnt');
// "Atualizar a escala" (no Processamento, que ele abre): a conciliação dos pedidos da data; espera a resposta (a linha de
// estado, N6)
export async function atualizarAEscala(page) {
  if (!(await page.locator('#s-proc').isVisible())) await irPara(page, 'proc');
  await botaoAtualizarAEscala(page).click();
  await expect(estadoDoProcessamento(page)).not.toBeEmpty();
}

// Um aluno que voa na data aberta, pelo caminho do app (G2: a Demanda saiu): o pedido registrado e aprovado em Pedidos
// (registrarPedido) e, quando a escala da data ainda não o tem (a data sem escala gravada), "Atualizar a escala"
export async function voarPeloPedido(page, pedido = {}) {
  await irPara(page, 'age');
  await registrarPedido(page, pedido);
  await expect(page.locator('#agenda-status')).toContainText(pedido.aluno || 'Aluno 1000');
  await irPara(page, 'proc');
  if (await botaoAtualizarAEscala(page).isVisible()) await atualizarAEscala(page);
}

// "Recomeçar pelos pedidos" (no "Mais"): o primeiro clique arma, com a frase do que vai acontecer; o segundo recomeça
export async function recomecarPelosPedidos(page) {
  await page.locator('#btn-mais-proc').click();
  const botao = page.locator('#proc-recomecar');
  await botao.click();
  await expect(botao).toHaveText('Confirmar: recomeçar a data');
  await botao.click();
}

// As restrições do voo pelo Processamento: a linha do voo (o aluno e a missão), o detalhe dela e o "Restrições" dele (a tela
// precisa estar aberta; numa vista só, o detalhe abre por cima da lista)
export async function restricoesPeloProcessamento(page, id, mid = 0) {
  await escolherNoProcessamento(page, `${id}_${mid}_1`);
  await acaoDoProcessamento(page, 'restricoes').click();
}

// As telas do Processamento que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): o filtro dos cursos
// aberto, com duas marcas, e a lista sem nenhum com os filtros. No fim, as marcas e a busca voltam a vazias. nome null: só
// o passo, sem conferir a tela
export const ESTADOS = [
  {
    nome: 'processamento: o filtro dos cursos aberto, com duas marcas',
    preparar: async page => {
      await irPara(page, 'proc');
      await marcarNoFiltro(page, 'flt-proc-cur', ['PP', 'sem-curso'], { fechar: false });
      await expect(page.locator('#flt-proc-cur')).toHaveText('Curso: PP ou sem curso');
    }
  },
  {
    nome: 'processamento: nenhum com os filtros',
    preparar: async page => {
      await marcarNoFiltro(page, 'flt-proc-cur', []);
      await page.locator('#flt-proc').fill('nenhum assim');
      await expect(page.locator('#limpar-filtros-proc')).toBeVisible();
    }
  },
  { nome: null, preparar: page => page.locator('#flt-proc').fill('') }
];

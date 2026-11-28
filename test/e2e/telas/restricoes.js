// O driver das restrições do voo (G1, dono; aside.gaveta#painel-restricoes): a gaveta, aberta pelo "Restrições" do editor do
// voo (#dlg-voo), do item do trilho da missão que não entrou e do detalhe do pedido no Processamento (G2), e os campos dela
import { expect } from '@playwright/test';
import { mostrarAvisos } from './casca.js';

export const gavetaDasRestricoes = page => page.locator('#painel-restricoes');
// Os campos da gaveta aberta para o pedido do aluno (id) e da missão (mid)
export const restricoesDoPedido = (page, id, mid = 0) => page.locator(`#painel-restricoes .restricoes-campos[data-id="${id}"][data-mid="${mid}"]`);
// Um campo da gaveta (data-f: 'eq', 'insId', 'pr', 'p1', 'p2', 'nb', 'outra-missao')
export const campoDasRestricoes = (page, campo) => page.locator(`#painel-restricoes [data-f="${campo}"]`);
// O aviso das limitações (o tipo, o horário) e o botão que confirma
export const avisoDasRestricoes = page => page.locator('#restricoes-avisos');
export const confirmarRestricao = page => page.locator('#painel-restricoes [data-act="confirmar-restricao"]');
export const desistirDaRestricao = page => page.locator('#painel-restricoes [data-act="desistir-restricao"]');

// Abre as restrições do pedido pelo detalhe dele no Processamento (a tela precisa estar aberta: a linha do voo, o detalhe
// e o "Restrições" dele) e espera a gaveta dele
export async function abrirRestricoes(page, id, mid = 0) {
  await page.locator(`#proc > li.lista-linha[data-proc="${id}_${mid}_1"] .lista-botao`).click();
  await page.locator(`#det-proc [data-act="restricoes"][data-id="${id}"][data-mid="${mid}"]`).click();
  await expect(restricoesDoPedido(page, id, mid)).toBeVisible();
  return restricoesDoPedido(page, id, mid);
}

// Pelo editor do voo aberto: o "Restrições" do voo (na turma, o do aluno)
export async function restricoesPeloEditor(page, id, mid = 0) {
  await page.locator(`#dlg-voo [data-act="restricoes"][data-id="${id}"][data-mid="${mid}"]`).click();
  await expect(restricoesDoPedido(page, id, mid)).toBeVisible();
  return restricoesDoPedido(page, id, mid);
}

// Pelo item do trilho da missão que não entrou (o texto acha o item)
export const botaoDasRestricoesNoTrilho = (page, texto) => page.locator('#avisos-da-data > li', { hasText: texto }).locator('[data-act="restricoes"]');
// (o trilho está sempre à vista, linha-fix-escala-sem-caixas; com o calendário ou os avisos recolhidos, eles abrem antes)
export async function restricoesPeloTrilho(page, texto, id, mid = 0) {
  await mostrarAvisos(page);
  await botaoDasRestricoesNoTrilho(page, texto).click();
  await expect(restricoesDoPedido(page, id, mid)).toBeVisible();
  return restricoesDoPedido(page, id, mid);
}

export async function fecharRestricoes(page) {
  await page.locator('#btn-fechar-restricoes').click();
  await expect(gavetaDasRestricoes(page)).toBeHidden();
}

// A próxima missão do programa nas restrições do pedido (abre a gaveta pelo Processamento): o texto "Próxima do
// programa: …"; e o botão "Usar a do programa" da gaveta aberta
export async function proximaDoPrograma(page, id, mid = 0) {
  await abrirRestricoes(page, id, mid);
  return restricoesDoPedido(page, id, mid).locator('.restricao-proxima');
}
export const usarADoPrograma = (page, id, mid = 0) => restricoesDoPedido(page, id, mid).locator('[data-act="usar-proxima"]');

// O driver da Escala (donos: G1, que abre as restrições do voo, e H, que traz Aprovar e as exportações): abrir a aba, ler
// a escala desenhada, aprovar e reabrir, e baixar os arquivos
import { expect } from '@playwright/test';
import { irPara, confirmar } from './casca.js';

// A escala é refeita a cada alteração: basta abrir a aba. A Escala abre em Por recurso; os testes da Lista (a tabela, o
// status, o ✕, o "+" de cada horário) pedem a Lista, o padrão daqui; { vista: null } deixa a vista como está
export async function abrirEscala(page, { vista = 'lista' } = {}) {
  await irPara(page, 'esc');
  await expect(page.locator('#out .st')).toBeVisible();
  if (vista) {
    const botao = page.locator(`#s-esc [data-tl="${vista}"]`);
    if (await botao.getAttribute('aria-pressed') !== 'true') await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
  }
}

// Uma caixa do resumo (erros, conflitos, avisos, inativos), aberta: elas abrem recolhidas, e a aberta continua aberta
// nos redesenhos
export async function abrirCaixa(page, nome) {
  const caixa = page.locator(`#out details.caixa[data-caixa="${nome}"]`);
  if (await caixa.getAttribute('open') === null) await caixa.locator('summary').click();
  await expect(caixa).toHaveAttribute('open', '');
  return caixa;
}

// Leitura estruturada da escala renderizada (resumo, alertas, tabela oficial e mapa de ocupação)
export function lerEscala(page) {
  return page.locator('#out').evaluate(out => {
    const txt = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
    const tabela = out.querySelector('table');
    return {
      resumo: [...out.querySelectorAll('.st > div')].map(txt),
      alertas: [...out.querySelectorAll('.al')].map(txt),
      linhas: tabela
        ? [...tabela.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => {
            const sel = td.querySelector('select');
            return sel ? `[${sel.value}]` : txt(td);
          }).join(' | '))
        : [],
      mapa: [...out.querySelectorAll('.tl-row')].map(row => ({
        rotulo: txt(row.querySelector('.tl-lbl')),
        barras: [...row.querySelectorAll('.tl-bar')].map(b => `${txt(b.querySelector('.tl-bar-t1'))} / ${txt(b.querySelector('.tl-bar-t2'))}`)
      }))
    };
  });
}

// Aprovar e reabrir a escala da data (botões armados: dois cliques)
export const botaoAprovar = page => page.locator('#btn-aprovar');
export const botaoReabrir = page => page.locator('#btn-reabrir');
export const aprovar = page => confirmar(page, '#btn-aprovar');
export const reabrir = page => confirmar(page, '#btn-reabrir');

// O botão que exporta a escala ('csv', 'pdf' ou 'xlsx'), para o clique que não espera o download (o modelo da planilha
// que não chega, o segundo clique)
const BOTOES_DE_EXPORTAR = { csv: '#exp', pdf: '#pdf', xlsx: '#xlsx' };
export const botaoExportar = (page, tipo) => page.locator(BOTOES_DE_EXPORTAR[tipo]);
// Baixa um arquivo da escala: devolve [o download], como o Promise.all do clique
export const exportar = (page, tipo) => Promise.all([page.waitForEvent('download'), botaoExportar(page, tipo).click()]);

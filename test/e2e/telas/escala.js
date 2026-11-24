// O driver da Escala (donos: G1, que abre as restrições do voo, e H, que traz Aprovar e as exportações): abrir a aba, ler
// a escala desenhada, aprovar e reabrir, e baixar os arquivos
import { expect } from '@playwright/test';
import { irPara, confirmar } from './casca.js';

// A escala é refeita a cada alteração: basta abrir a aba
export async function abrirEscala(page) {
  await irPara(page, 'esc');
  await expect(page.locator('#out .st')).toBeVisible();
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

// Baixa um arquivo da escala ('csv', 'pdf' ou 'xlsx'): devolve [o download], como o Promise.all do clique
const BOTOES_DE_EXPORTAR = { csv: '#exp', pdf: '#pdf', xlsx: '#xlsx' };
export const exportar = (page, tipo) => Promise.all([page.waitForEvent('download'), page.locator(BOTOES_DE_EXPORTAR[tipo]).click()]);

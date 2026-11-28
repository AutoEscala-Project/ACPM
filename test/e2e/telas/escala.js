// O driver da Escala (donos: G1, que abre as restrições do voo, e H, que traz Aprovar e as exportações): abrir a aba, ler
// a escala desenhada, aprovar e reabrir, e baixar os arquivos
import { expect } from '@playwright/test';
import { irPara, confirmar, mostrarAvisos } from './casca.js';

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

// Os alertas da escala ficam no trilho, com os outros avisos da data (as caixas do resumo saíram:
// linha-fix-escala-sem-caixas): os itens de um grupo ('erros', 'conflitos', 'avisos', 'inativos', 'habilitacoes'), com as
// ações deles ("Sugestões", "Refazer a escala"); o texto de cada um, o nome e o porquê ("Aluno 1000 Rejeitado: …"). Abrir:
// o trilho e os avisos à vista, para o clique
export const itensDaEscala = (page, grupo) => page.locator(`#avisos-da-data > li[data-grupo="${grupo}"]`);
export const textosDaEscala = (page, grupo) => itensDaEscala(page, grupo).locator('.aviso-corpo');
export async function abrirAvisosDaEscala(page, grupo) {
  await mostrarAvisos(page);
  return itensDaEscala(page, grupo);
}

// Leitura estruturada da escala renderizada (resumo, alertas, tabela oficial e mapa de ocupação). Os alertas ficam no
// trilho (os itens dos grupos da escala: o nome e o porquê), também com ele recolhido
export function lerEscala(page) {
  return page.locator('#out').evaluate(out => {
    const txt = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
    const tabela = out.querySelector('table');
    return {
      resumo: [...out.querySelectorAll('.st > div')].map(txt),
      alertas: [...document.querySelectorAll('#avisos-da-data > li[data-grupo] .aviso-corpo')].map(el => el.textContent.replace(/\s+/g, ' ').trim()),
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

// O editor do voo (F1g): a barra do mapa ou o "Editar" da Lista o abre (na turma de Ground, pela chave da turma)
export const editorDoVoo = page => page.locator('#dlg-voo');
export const botaoEditar = (page, fKey) => page.locator(`#out [data-act="editar-voo"][data-fkey="${fKey}"]`);
export async function editarPelaLista(page, fKey) {
  await botaoEditar(page, fKey).click();
  await expect(editorDoVoo(page)).toBeVisible();
}
export const barraDoVoo = (page, chave) => page.locator(`#out .tl-bar[data-pop="${chave}"]`);
export async function editarPeloMapa(page, chave) {
  await barraDoVoo(page, chave).click();
  await expect(editorDoVoo(page)).toBeVisible();
}
export const salvarVoo = page => page.locator('#voo-salvar').click();

// A pergunta antes de refazer a escala não aprovada (F1g, R6): "Salvar e refazer" grava e roda o motor; "Cancelar" não
// muda nada
export const perguntaDoRefazer = page => page.locator('#dlg-refazer');
export async function refazer(page) {
  await expect(perguntaDoRefazer(page)).toBeVisible();
  await page.locator('#refazer-salvar').click();
  await expect(perguntaDoRefazer(page)).toBeHidden();
}
export async function naoRefazer(page) {
  await expect(perguntaDoRefazer(page)).toBeVisible();
  await page.locator('#refazer-cancelar').click();
  await expect(perguntaDoRefazer(page)).toBeHidden();
}

// "Agendar" no diálogo do agendamento: fora da escala aprovada, a confirmação diz que a escala inteira será refeita (F1g)
// e pede o segundo clique, "Agendar mesmo assim"; na aprovada, um clique basta (sem outros avisos)
export async function confirmarAgendamento(page) {
  const botao = page.locator('#agd-confirmar');
  await botao.click();
  if (await page.locator('#dlg-agendar').isVisible() && (await botao.textContent()) === 'Agendar mesmo assim') await botao.click();
  await expect(page.locator('#dlg-agendar')).toBeHidden();
}

// O driver de Recursos (dono: B): a disponibilidade do dia (a tabela dos recursos e os horários fechados), o filtro
// das categorias e as telas que os testes do celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irParaVista, marcarNoFiltro, nenhumComOsFiltros } from './casca.js';
import { abrirEscala, perguntaDoRefazer, refazer } from './escala.js';

// Recursos numa vista ('dia': a Disponibilidade do dia; 'cadastro')
export const abrirRecursos = (page, vista = 'dia') => irParaVista(page, 'rec', vista);

// A tabela da Disponibilidade do dia (os recursos por categoria) e o "Disponível" de um recurso, pela matrícula
export const tabelaDoDia = page => page.locator('#eqs');
export const caixaDisponivel = (page, id) => page.locator(`#eqs input[data-id="${id}"]`);
export async function alternarDisponivel(page, id, disponivel) {
  if (disponivel) await caixaDisponivel(page, id).check();
  else await caixaDisponivel(page, id).uncheck();
}

// Os horários fechados da data (B: na Escala, o bloco details#fechamentos; o J os pôs em Recursos, no lugar das janelas de
// operação), o resumo dele ("nenhum", "12:40–17:30 · todos os recursos") e a lista dos intervalos
export const horariosFechados = page => page.locator('#fechamentos');
export const resumoDosFechamentos = page => page.locator('#fechamentos-resumo');
export const intervalosFechados = page => page.locator('#fechamentos .fechamentos-lista li > span');
// Abre o bloco na Escala (de outra tela, a Escala abre antes); aberto, ele fica
export async function abrirFechamentos(page) {
  const bloco = horariosFechados(page);
  if (!await bloco.isVisible()) await abrirEscala(page);
  if (!await bloco.evaluate(d => d.open)) await bloco.locator('summary').click();
  await expect(bloco).toHaveJSProperty('open', true);
}
// A pergunta do F1g (#dlg-refazer) que a mudança faz na escala não aprovada: respondida com "Salvar e refazer"; na
// aprovada, ela não vem
async function responderSeAberta(page) {
  if (await perguntaDoRefazer(page).isVisible()) await refazer(page);
}
// "+ Fechar horários": de e ate como na tela ('12:40', '17:30'), ou diaTodo; categorias pelos ids ('C152', 'ground'…);
// nenhuma, todos os recursos. Confere que o formulário fecha
export async function fecharHorarios(page, { de, ate, diaTodo = false, categorias = [] } = {}) {
  await abrirFechamentos(page);
  const secao = horariosFechados(page);
  await secao.locator('[data-act="fechar-horarios"]').click();
  const form = secao.locator('.fechar-horarios');
  await expect(form).toBeVisible();
  if (diaTodo) await form.locator('[data-act="fch-dia-todo"]').click();
  else {
    await form.locator('#fch-de').selectOption({ label: de });
    await form.locator('#fch-ate').selectOption({ label: ate });
  }
  for (const c of categorias) await form.locator(`input[data-cat="${c}"]`).check();
  await form.locator('[data-act="fch-fechar"]').click();
  await responderSeAberta(page);
  await expect(form).toBeHidden();
}
// O ✕ de um intervalo (o i-ésimo da lista), que o abre de novo
export async function abrirDeNovo(page, i = 0) {
  await abrirFechamentos(page);
  await horariosFechados(page).locator('[data-act="tirar-fechamento"]').nth(i).click();
  await responderSeAberta(page);
}

// O filtro das categorias de Recursos: os valores são os ids das categorias ('C152', 'C172', 'sim', 'PA-34')
export const filtrarCategorias = (page, valores, opcoes) => marcarNoFiltro(page, 'flt-rec-cat', valores, opcoes);

// As telas de Recursos que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): o cadastro, o filtro
// das categorias aberto com duas marcas e as duas tabelas sem nenhum com os filtros. No fim, as marcas e a busca voltam
// a vazias e Recursos, à Disponibilidade do dia. nome null: só o passo, sem conferir a tela
export const ESTADOS = [
  { nome: 'recursos: cadastro', preparar: page => abrirRecursos(page, 'cadastro') },
  {
    nome: 'recursos: cadastro, o filtro das categorias aberto, com duas marcas',
    preparar: async page => {
      await filtrarCategorias(page, ['sim', 'PA-34'], { fechar: false });
      await expect(page.locator('#flt-rec-cat')).toHaveText('Categoria: Simulador ou PA-34');
      await expect(page.locator('#rec-contagem')).toHaveText(/^\d+ de \d+ recursos$/);
    }
  },
  {
    nome: 'recursos: cadastro, nenhum com os filtros',
    preparar: async page => {
      await page.locator('#flt-rec-cat').click();
      await page.locator('#flt-rec-mat').fill('nenhum assim');
      await expect(page.locator('#frota li.sem-resultado')).toBeVisible();
      await expect(page.locator('#rec-contagem')).toHaveText(/^0 de \d+ /);
    }
  },
  {
    nome: 'recursos: disponibilidade do dia, nenhum com os filtros',
    preparar: async page => {
      await abrirRecursos(page, 'dia');
      await nenhumComOsFiltros(page, 'revisao', 'rec');
    }
  },
  {
    nome: null,
    preparar: async page => {
      await page.locator('#limpar-filtros-revisao').click();
      await expect(page.locator('#flt-rec-cat-painel input:checked')).toHaveCount(0);
      await expect(page.locator('#flt-rec-cat')).toHaveText('Todas as categorias');
      await expect(page.locator('#flt-rec-mat')).toHaveValue('');
    }
  }
];

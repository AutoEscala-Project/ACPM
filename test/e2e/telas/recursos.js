// O driver de Recursos (dono: B): a lista por categoria (os cabeçalhos com o detalhe da categoria, o item fixo "Ordem no
// hangar", as linhas com o "Disponível" desta data e o "Ativo" do cadastro), o detalhe de um recurso, os horários fechados
// da data (na Escala, details#fechamentos, que o B trouxe de Recursos) e as telas que os testes do celular e da
// acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irPara, confirmar } from './casca.js';
import { abrirNaLista, linhaNaLista, detalheDa, nenhumNaLista } from './alunos.js';
import { perguntaDoRefazer, refazer } from './escala.js';

export const abrirRecursos = page => irPara(page, 'rec');

// A lista: as linhas dos recursos (pela matrícula; a Sala Ground é SALA-GROUND), os cabeçalhos das categorias (pelos ids:
// 'C152', 'C172', 'sim', 'PA-34', 'ground'), a busca e a contagem
export const listaDosRecursos = page => page.locator('#rec');
export const linhaDoRecurso = (page, reg) => linhaNaLista(page, 'rec', reg);
export const linhasDosRecursos = page => page.locator('#rec > li.lista-linha');
export const gruposDosRecursos = page => page.locator('#rec > li.lista-grupo');
export const cabecalhoDaCategoria = (page, cat) => page.locator(`#rec > li[data-chave="g:${cat}"]`);
export const buscaDosRecursos = page => page.locator('[data-flt="rec"]');
export const contagemDosRecursos = page => page.locator('#rec-contagem');
export const detalheDoRecurso = page => detalheDa(page, 'rec');
// O item fixo "Ordem no hangar" (só com o hangar ligado) e a primeira parte da lista
export const itemDoHangar = page => page.locator('#rec > li[data-chave="f:hangar"]');
export const primeiraDaLista = page => page.locator('#rec > li').first();

// A lista de Recursos à vista: de outra tela, Recursos abre antes; numa vista só (o celular), com o detalhe aberto,
// "‹ Recursos" volta à lista
async function naTela(page) {
  if (!await page.locator('#s-rec').isVisible()) await abrirRecursos(page);
  const voltar = page.locator('#det-rec-voltar');
  if (await listaDosRecursos(page).isHidden()) {
    // O detalhe vazio (o formulário do recurso novo) não tem "‹ Recursos": Voltar
    if (await voltar.isVisible()) await voltar.click();
    else await page.goBack();
  }
  await expect(listaDosRecursos(page)).toBeVisible();
}
// Abre no detalhe um recurso, uma categoria (o cabeçalho dela) ou o item fixo do hangar
export async function abrirRecurso(page, reg) {
  await naTela(page);
  await abrirNaLista(page, 'rec', reg);
}
export async function abrirCategoria(page, cat) {
  await naTela(page);
  await cabecalhoDaCategoria(page, cat).locator('.lista-botao').click();
  await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', `cat:${cat}`);
}
export async function abrirHangar(page) {
  await naTela(page);
  await itemDoHangar(page).locator('.lista-botao').click();
  await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'hangar');
}

// O "Disponível" desta data de um recurso, na linha dele (o mesmo campo está no detalhe)
export const caixaDisponivel = (page, id) => page.locator(`#rec > li[data-chave="i:${id}"] input[data-a="av"]`);
export async function alternarDisponivel(page, id, disponivel) {
  const caixa = caixaDisponivel(page, id);
  if (!await caixa.isVisible()) await abrirRecursos(page);
  if (disponivel) await caixa.check();
  else await caixa.uncheck();
}
// No detalhe do recurso aberto: um campo (o data-campo dele: 'av', 'horas', 'escala', 'atributos', 'exige'…), as horas
// disponíveis até a revisão, um atributo ("Só Parafuso", "Só VFR", "Habilitação própria") e "Retirar da frota…"
export const campoDoRecurso = (page, campo) => page.locator(`#det-rec .det [data-campo="${campo}"]`);
export async function horasDoRecurso(page, reg) {
  await abrirRecurso(page, reg);
  return page.locator(`#det-rec input[data-a="horas"][data-horas="${reg}"]`);
}
export async function marcarAtributo(page, reg, atributo, marcar) {
  await abrirRecurso(page, reg);
  await page.locator(`#det-rec input[data-a="atributo"][data-r="${reg}"][data-atributo="${atributo}"]`).setChecked(marcar);
}
export async function retirarRecurso(page, reg) {
  await abrirRecurso(page, reg);
  await confirmar(page, '#det-rec-retirar');
}
// A ordem no hangar (o detalhe do item fixo; com o hangar ligado): as posições, da frente para o fundo
export const ordemNoHangar = page => page.locator('#hangar li');
// Os horários de decolagem da categoria aberta (o detalhe dela)
export const horariosDaCategoria = page => page.locator('#horarios');

// Os horários fechados da data (B: na Escala, o bloco details#fechamentos; o J os pôs em Recursos, no lugar das janelas de
// operação), o resumo dele ("nenhum", "12:40–17:30 · todos os recursos") e a lista dos intervalos
export const horariosFechados = page => page.locator('#fechamentos');
export const resumoDosFechamentos = page => page.locator('#fechamentos-resumo');
export const intervalosFechados = page => page.locator('#fechamentos .fechamentos-lista li > span');
// Abre o bloco na Escala (de outra tela, a Escala abre antes, também sem voos); aberto, ele fica
export async function abrirFechamentos(page) {
  const bloco = horariosFechados(page);
  if (!await bloco.isVisible()) await irPara(page, 'esc');
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

// As telas de Recursos que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): um recurso aberto, uma
// categoria aberta (os horários de decolagem), o formulário do recurso novo e a lista sem nenhum com a busca. No fim, a
// busca volta a vazia e a lista, à vista. nome null: só o passo, sem conferir a tela
export const ESTADOS = [
  { nome: 'recursos: um recurso aberto no detalhe', preparar: page => abrirRecurso(page, 'PR-VOM') },
  { nome: 'recursos: uma categoria aberta, com os horários de decolagem', preparar: page => abrirCategoria(page, 'C152') },
  {
    nome: 'recursos: o formulário do recurso novo',
    preparar: async page => {
      await naTela(page);
      await page.locator('#btn-novo-recurso').click();
      await expect(page.locator('#form-recurso')).toBeVisible();
    }
  },
  {
    nome: 'recursos: nenhum com a busca',
    preparar: async page => {
      await naTela(page);
      await buscaDosRecursos(page).fill('nenhum assim');
      await nenhumNaLista(page, 'rec');
    }
  },
  {
    nome: null,
    preparar: async page => {
      await page.locator('#limpar-filtros-rec').click();
      await expect(buscaDosRecursos(page)).toHaveValue('');
    }
  }
];

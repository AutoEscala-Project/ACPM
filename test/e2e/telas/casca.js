// O driver da casca (dono: F1): abrir o app e entrar, as abas, a data em uso, o Histórico, o menu da conta e os
// controles que todas as telas usam (o botão armado, o filtro de vários valores, a tabela sem nenhum com os filtros).
// Os testes chegam a estes controles só por aqui (test/unit/donos-dos-seletores.test.js): quando a casca muda, muda
// este arquivo
import { expect } from '@playwright/test';
import { estadoSintetico } from '../../helpers/estado.js';
import { comExemplo } from '../../helpers/exemplo.js';

// As abas, na ordem do app (o Operador e o Administrador veem todas), e as da Secretaria
export const ABAS = ['esc', 'dem', 'age', 'rec', 'ins', 'alu', 'cur', 'rod', 'bi'];
export const ABAS_DA_SECRETARIA = ['esc', 'age', 'ins', 'alu', 'cur'];

// O app terminou de abrir: os dados da data foram lidos e as telas desenhadas (js/main.js marca body[data-pronto]).
// Antes disso, a tela ainda pode mudar sozinha (a Secretaria, por exemplo, vai para a Agenda). timeout: o do site publicado,
// que pode regravar todos os dias antes de abrir
export async function appPronto(page, { timeout } = {}) {
  await expect(page.locator('body[data-pronto]')).toBeAttached({ timeout });
}

// Abre a aplicação. Com `estado`, grava-o no localStorage antes do primeiro carregamento
// (recarregamentos posteriores mantêm o que a aplicação salvou).
export async function abrir(page, { estado = null, url = './' } = {}) {
  if (estado) {
    await page.addInitScript(json => {
      if (!localStorage.getItem('acpm3')) localStorage.setItem('acpm3', json);
    }, JSON.stringify(estado));
  }
  await page.goto(url);
  await appPronto(page);
}

export const abrirSintetico = (page, opts = {}) => abrir(page, { estado: estadoSintetico(), ...opts });

// Cadastro sintético com a demanda do dia de exemplo
export const abrirComExemplo = (page, opts = {}) => abrir(page, { estado: comExemplo(estadoSintetico()), ...opts });

// O app no modo compartilhado (o servidor falso dos testes, test/e2e/supabase-falso.js)
export const URL_APP = './?supabase=teste';

// Preenche e envia o login, sem esperar o app carregar
export async function preencherLogin(page, conta, senha = conta.senha) {
  await page.locator('#login-email').fill(conta.email);
  await page.locator('#login-senha').fill(senha);
  await page.locator('#btn-entrar').click();
}

// Abre o app no modo compartilhado e entra com a conta. Volta quando o app terminou de carregar os dados da data
export async function entrar(page, conta, { url = URL_APP } = {}) {
  await page.goto(url);
  await preencherLogin(page, conta);
  await appPronto(page);
}

// O botão de uma aba no alto ('esc', 'dem'…)
export const botaoDaAba = (page, aba) => page.locator(`#nav button[data-t="${aba}"]`);
// Os botões das abas (com visiveis, só os que aparecem para o perfil)
export const botoesDasAbas = (page, { visiveis = false } = {}) => page.locator(`#nav button[data-t]${visiveis ? ':visible' : ''}`);
// Os nomes das abas, na ordem (com visiveis, só os das abas que aparecem)
export const rotulosDasAbas = (page, { visiveis = false } = {}) => page.locator(`#nav button${visiveis ? ':visible' : ''} .aba-rotulo`);
// As abas que aparecem, pelo id ('esc', 'dem'…)
export const abasVisiveis = page => botoesDasAbas(page, { visiveis: true }).evaluateAll(bs => bs.map(b => b.dataset.t));

export async function irPara(page, aba) {
  await botaoDaAba(page, aba).click();
  await expect(page.locator(`#s-${aba}`)).toBeVisible();
}

// Abre uma vista de uma aba (Instrutores e Recursos: 'dia' ou 'cadastro'): a aba e o botão da vista no controle
// segmentado do alto dela. O Playwright só age no que está à vista: o que fica na outra vista pede a troca antes
export async function irParaVista(page, aba, vista) {
  await irPara(page, aba);
  await page.locator(`#s-${aba} [data-vista-${aba}="${vista}"]`).click();
  await expect(page.locator(`#s-${aba}`)).toHaveAttribute('data-vista', vista);
}

// A data em uso, no topo: o campo (o valor é a data ISO), o rótulo ("quarta-feira, 11/11"), o "amanhã"/"hoje" ao lado
// e as setas ‹ e ›
export const campoDaData = page => page.locator('#dt');
export const rotuloDaData = page => page.locator('#dt-rotulo');
export const relativoDaData = page => page.locator('#dt-rel');
export const botaoDiaAnterior = page => page.locator('#dt-ant');
export const botaoDiaSeguinte = page => page.locator('#dt-prox');
// Os seletores das setas, para o que roda dentro da página (as caixas da barra do topo)
export const SETAS_DA_DATA = ['#dt-ant', '#dt-prox'];

export async function diaSeguinte(page) {
  await botaoDiaSeguinte(page).click();
}

export async function diaAnterior(page) {
  await botaoDiaAnterior(page).click();
}

// Escreve uma data no campo, como quem escolhe no calendário (sem esperar a data abrir)
export async function escreverData(page, data) {
  await campoDaData(page).fill(data);
  await campoDaData(page).dispatchEvent('change');
}

// Na Escala, troca a data em uso e espera o campo mostrar a nova
export async function mudarData(page, data) {
  await botaoDaAba(page, 'esc').click();
  await escreverData(page, data);
  await expect(campoDaData(page)).toHaveValue(data);
}

// O Histórico da data: o botão no topo e a lista das entradas (com texto, só as que o têm)
export const botaoDoHistorico = page => page.locator('#btn-open-log');
export async function abrirHistorico(page) {
  await botaoDoHistorico(page).click();
}
export const entradasDoHistorico = (page, texto) => page.locator('#audit-log-list .audit-item', texto === undefined ? {} : { hasText: texto });

// Minha conta, Usuários, Tema e Sair ficam no menu da conta, no topo
export const botaoDoMenuDaConta = page => page.locator('#btn-menu-conta');
export async function abrirMenuDaConta(page) {
  await botaoDoMenuDaConta(page).click();
  await expect(page.locator('#menu-conta')).toBeVisible();
}

// Botões "armados" exigem dois cliques (o primeiro muda o texto para "Confirmar …")
export async function confirmar(page, seletor) {
  const botao = page.locator(seletor);
  await botao.click();
  await expect(botao).toHaveText(/^Confirmar/);
  await botao.click();
}

// Um filtro de vários valores (js/views/filtro-multiplo.js; id: o do botão): abre o painel, deixa marcados só os valores
// dados e fecha o painel pelo botão (com fechar: false, ele fica aberto). Sem nenhum, todos desmarcados
export async function marcarNoFiltro(page, id, valores, { fechar = true } = {}) {
  const botao = page.locator(`#${id}`), painel = page.locator(`#${id}-painel`);
  if (await botao.getAttribute('aria-expanded') !== 'true') await botao.click();
  await expect(painel).toBeVisible();
  const mudar = await painel.locator('input[data-filtro]').evaluateAll((caixas, marcar) =>
    caixas.filter(c => c.checked !== marcar.includes(c.dataset.valor)).map(c => c.dataset.valor), valores);
  for (const valor of mudar) await painel.locator(`input[data-valor="${valor}"]`).click();
  await expect(painel.locator('input[data-filtro]:checked')).toHaveCount(valores.length);
  if (!fechar) return;
  await botao.click();
  await expect(painel).toBeHidden();
}

// A tabela que os filtros deixam sem nenhuma linha: a linha que diz por quê; a contagem já escrita (ela espera a
// digitação parar: a tela é conferida com o texto mais longo, "0 de 40 instrutores"; a Demanda, sem aba, não tem); e o
// "Limpar filtros" inteiro na parte à vista da tabela e da tela (a grade do dia e a Demanda, mais largas que o celular,
// rolam para o lado)
export async function nenhumComOsFiltros(page, corpo, aba) {
  await expect(page.locator(`#${corpo} tr.sem-resultado`)).toBeVisible();
  if (aba) await expect(page.locator(`#${aba}-contagem`)).toHaveText(/^0 de \d+ /);
  const fora = await page.locator(`#limpar-filtros-${corpo}`).evaluate(botao => {
    const caixa = botao.getBoundingClientRect(), tabela = botao.closest('.tw');
    const esquerda = tabela.getBoundingClientRect().left + tabela.clientLeft, direita = esquerda + tabela.clientWidth;
    return caixa.left < esquerda || caixa.right > direita || caixa.right > document.documentElement.clientWidth;
  });
  expect(fora, `"Limpar filtros" fora da parte à vista de #${corpo}`).toBe(false);
}

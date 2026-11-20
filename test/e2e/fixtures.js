// Fixtures e utilitários compartilhados pelos testes E2E.
// - Relógio fixo (amanhã = 2026-11-11) para datas determinísticas na escala, no PDF e no BI
// - jsPDF e supabase-js servidos de node_modules e Google Fonts neutralizado: os testes não dependem da rede
// - Qualquer erro de página ou de console falha o teste
import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';

export { expect };

export const AGORA = new Date('2026-11-10T12:00:00-03:00');
export const AMANHA = '2026-11-11';

const LIBS = {
  'jspdf.umd.min.js': fileURLToPath(new URL('../../node_modules/jspdf/dist/jspdf.umd.min.js', import.meta.url)),
  'jspdf.plugin.autotable.min.js': fileURLToPath(new URL('../../node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js', import.meta.url)),
  'supabase.js': fileURLToPath(new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url))
};

export async function prepararContexto(context) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.clock.setFixedTime(AGORA);
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, r => {
    const arquivo = LIBS[new URL(r.request().url()).pathname.split('/').pop()];
    // As tags <script> usam integrity + crossorigin: a resposta precisa do cabeçalho CORS, como no cdnjs
    return arquivo
      ? r.fulfill({ path: arquivo, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' } })
      : r.abort();
  });
}

// Respostas HTTP de erro que um teste provoca de propósito (ex.: 400 da senha errada) não contam como erro
export function vigiarErros(page, { statusEsperados = [], ignorar = [] } = {}) {
  const erros = [];
  const esperado = texto => statusEsperados.some(st => texto.includes(`status of ${st}`)) || ignorar.some(r => r.test(texto));
  page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !esperado(m.text())) erros.push(`console: ${m.text()}`); });
  return erros;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await prepararContexto(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    const erros = vigiarErros(page);
    await use(page);
    expect(erros, 'a página não deve registrar erros').toEqual([]);
  }
});

// Abre a aplicação. Com `estado`, grava-o no localStorage antes do primeiro carregamento
// (recarregamentos posteriores mantêm o que a aplicação salvou).
export async function abrir(page, { estado = null, url = './' } = {}) {
  if (estado) {
    await page.addInitScript(json => {
      if (!localStorage.getItem('acpm3')) localStorage.setItem('acpm3', json);
    }, JSON.stringify(estado));
  }
  await page.goto(url);
  // As janelas de operação são desenhadas depois de carregar os dados (mesmo sem nenhum cadastro)
  await expect(page.locator('#wins input[data-a="win"]').first()).toBeAttached();
}

export const abrirSintetico = (page, opts = {}) => abrir(page, { estado: estadoSintetico(), ...opts });

// O app no modo compartilhado (o servidor falso dos testes, test/e2e/supabase-falso.js)
export const URL_APP = './?supabase=teste';

// Preenche e envia o login, sem esperar o app carregar
export async function preencherLogin(page, conta, senha = conta.senha) {
  await page.locator('#login-email').fill(conta.email);
  await page.locator('#login-senha').fill(senha);
  await page.locator('#btn-entrar').click();
}

// Abre o app no modo compartilhado e entra com a conta. Volta quando o app terminou de carregar os dados da data
// (body[data-pronto]): antes disso, a tela ainda pode mudar sozinha (a Secretaria, por exemplo, vai para a Agenda)
export async function entrar(page, conta, { url = URL_APP } = {}) {
  await page.goto(url);
  await preencherLogin(page, conta);
  await expect(page.locator('body[data-pronto]')).toBeAttached();
}

export async function irPara(page, aba) {
  await page.locator(`#nav button[data-t="${aba}"]`).click();
  await expect(page.locator(`#s-${aba}`)).toBeVisible();
}

// Abre uma vista de uma aba (Instrutores: 'dia' ou 'cadastro'): a aba e o botão da vista no controle segmentado do alto
// dela. O Playwright só age no que está à vista: o que fica na outra vista pede a troca antes
export async function irParaVista(page, aba, vista) {
  await irPara(page, aba);
  await page.locator(`#s-${aba} [data-vista-${aba}="${vista}"]`).click();
  await expect(page.locator(`#s-${aba}`)).toHaveAttribute('data-vista', vista);
}

// Um filtro de vários valores (js/views/filtro-multiplo.js; id: o do botão): abre o painel, deixa marcados só os valores
// dados e fecha o painel pelo botão (com fechar: false, ele fica aberto). Sem nenhum, todos desmarcados
async function marcarNoFiltro(page, id, valores, { fechar = true } = {}) {
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

// O filtro das habilitações de Instrutores: os valores são as habilitações ('mlte', 'aviao:PR-VOM'…)
export const filtrarHabilitacoes = (page, valores, opcoes) => marcarNoFiltro(page, 'flt-ins-hab', valores, opcoes);
// O filtro dos cursos de Alunos ('alu') ou da Demanda ('dem'): os valores são as siglas ('PP', 'PC'…) e 'sem-curso'
export const filtrarCursos = (page, aba, valores, opcoes) => marcarNoFiltro(page, `flt-${aba}-cur`, valores, opcoes);

// As telas que não são a de abertura de uma aba: as outras vistas (Instrutores › Cadastro), os painéis abertos dos filtros
// de vários valores (o das habilitações, em Instrutores, e o dos cursos, em Alunos e na Demanda, com duas marcas: o botão
// diz as duas) e as tabelas que os filtros deixam sem nenhuma linha (com "Limpar filtros"; também a da Demanda). Os
// testes do celular e da acessibilidade, que conferem cada aba como ela abre, conferem também estas: conferir(nome) roda
// em cada uma. No fim, a busca e as marcas voltam a vazias
export async function percorrerVistasEFiltros(page, conferir) {
  await irParaVista(page, 'ins', 'cadastro');
  await conferir('instrutores: cadastro');
  await page.locator('[data-flt="inst"]').fill('nenhum assim');
  await nenhumComOsFiltros(page, 'inst', 'ins');
  await conferir('instrutores: cadastro, nenhum com os filtros');
  await irParaVista(page, 'ins', 'dia');
  await nenhumComOsFiltros(page, 'inst-dia', 'ins');
  await conferir('instrutores: disponibilidade do dia, nenhum com os filtros');
  await page.locator('[data-flt="inst"]').fill('');
  await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
  await expect(page.locator('#flt-ins-hab')).toHaveText('Habilitações: Noturno + C172');
  await conferir('instrutores: o filtro das habilitações aberto, com duas marcas');
  await filtrarHabilitacoes(page, []);
  await irPara(page, 'alu');
  await page.locator('[data-flt="alu"]').fill('nenhum assim');
  await nenhumComOsFiltros(page, 'alu', 'alu');
  await conferir('alunos: nenhum com os filtros');
  await page.locator('[data-flt="alu"]').fill('');
  for (const [aba, nome] of [['alu', 'alunos'], ['dem', 'demanda']]) {
    await irPara(page, aba);
    await filtrarCursos(page, aba, ['PP', 'sem-curso'], { fechar: false });
    await expect(page.locator(`#flt-${aba}-cur`)).toHaveText('Curso: PP ou sem curso');
    await conferir(`${nome}: o filtro dos cursos aberto, com duas marcas`);
    await filtrarCursos(page, aba, []);
  }
  await page.locator('#flt-dem').fill('nenhum assim');
  await nenhumComOsFiltros(page, 'dem');
  await conferir('demanda: nenhum com os filtros');
  await page.locator('#flt-dem').fill('');
}

// A tabela que os filtros deixam sem nenhuma linha: a linha que diz por quê; a contagem já escrita (ela espera a
// digitação parar: a tela é conferida com o texto mais longo, "0 de 40 instrutores"; a Demanda, sem aba, não tem); e o
// "Limpar filtros" inteiro na parte à vista da tabela e da tela (a grade do dia e a Demanda, mais largas que o celular,
// rolam para o lado)
async function nenhumComOsFiltros(page, corpo, aba) {
  await expect(page.locator(`#${corpo} tr.sem-resultado`)).toBeVisible();
  if (aba) await expect(page.locator(`#${aba}-contagem`)).toHaveText(/^0 de \d+ /);
  const fora = await page.locator(`#limpar-filtros-${corpo}`).evaluate(botao => {
    const caixa = botao.getBoundingClientRect(), tabela = botao.closest('.tw');
    const esquerda = tabela.getBoundingClientRect().left + tabela.clientLeft, direita = esquerda + tabela.clientWidth;
    return caixa.left < esquerda || caixa.right > direita || caixa.right > document.documentElement.clientWidth;
  });
  expect(fora, `"Limpar filtros" fora da parte à vista de #${corpo}`).toBe(false);
}

// Minha conta, Usuários, Tema e Sair ficam no menu da conta, no topo
export async function abrirMenuDaConta(page) {
  await page.locator('#btn-menu-conta').click();
  await expect(page.locator('#menu-conta')).toBeVisible();
}

// Botões "armados" exigem dois cliques (o primeiro muda o texto para "Confirmar …")
export async function confirmar(page, seletor) {
  const botao = page.locator(seletor);
  await botao.click();
  await expect(botao).toHaveText(/^Confirmar/);
  await botao.click();
}

// Cadastro sintético com a demanda do dia de exemplo
export const abrirComExemplo = (page, opts = {}) => abrir(page, { estado: comExemplo(estadoSintetico()), ...opts });

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

export const json = valor => JSON.stringify(valor, null, 2) + '\n';

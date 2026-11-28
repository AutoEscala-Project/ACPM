// O driver de INVAs (dono: C): a lista (cada instrutor uma linha, com o "Vem" desta data, o "Ativo" e a tira do dia), o
// instrutor aberto no detalhe (os campos, as habilitações, os turnos e "Editar faixas"), o item fixo dos limites da lei, o
// filtro das habilitações e as telas que os testes do celular e da acessibilidade percorrem (ESTADOS)
import { expect } from '@playwright/test';
import { irPara, marcarNoFiltro } from './casca.js';
import { abrirNaLista, linhaNaLista, nenhumNaLista } from './alunos.js';

export const abrirInstrutores = page => irPara(page, 'ins');

// A lista: as linhas dos instrutores (sem o item fixo dos limites), a de um instrutor, os nomes à vista, na ordem, a busca
// e a contagem
export const linhasDosInstrutores = page => page.locator('#ins > li.lista-linha[data-chave^="i:"]');
export const linhaDoInstrutor = (page, id) => linhaNaLista(page, 'ins', id);
export const nomesDosInstrutores = page => page.locator('#ins > li.lista-linha[data-chave^="i:"] .lista-titulo').allTextContents();
export const buscaDosInstrutores = page => page.locator('[data-flt="ins"]');
export const contagemDosInstrutores = page => page.locator('#ins-contagem');
// O que a linha diz das faixas (a 2ª linha), quantos voos, as habilitações (a 3ª) e a tira do dia
export const faixasNaLinha = (page, id) => linhaDoInstrutor(page, id).locator('.lista-l2-texto');
export const voosNaLinha = (page, id) => linhaDoInstrutor(page, id).locator('.lista-meta');
export const habilitacoesNaLinha = (page, id) => linhaDoInstrutor(page, id).locator('.lista-l3');
export const tiraDaLinha = (page, id) => linhaDoInstrutor(page, id).locator('.tira');

// O "Vem" desta data: o da linha (a caixa) ou o do detalhe (o mesmo data-f). alternarVem abre INVAs antes
export const caixaVem = linha => linha.locator('[data-f="on"]');
export async function alternarVem(page, id, vem) {
  if (!await page.locator('#s-ins').isVisible()) await abrirInstrutores(page);
  const caixa = caixaVem(linhaDoInstrutor(page, id));
  if (vem) await caixa.check();
  else await caixa.uncheck();
}

// O instrutor aberto no detalhe: abrir (INVAs antes, quando não está aberto), o detalhe, um campo dele ('nm', 'kg',
// 'ext-mes', 'ext-ano', 'on'), uma habilitação (a caixa) e uma seção
export const detalheDoInstrutor = page => page.locator('#det-ins .det');
export async function abrirInstrutor(page, id) {
  if (!await page.locator('#s-ins').isVisible()) await abrirInstrutores(page);
  if (await page.locator(`#det-ins .det[data-id="${id}"]`).count() && await page.locator('#det-ins-titulo').isVisible()) return;
  await abrirNaLista(page, 'ins', id);
}
// A região do detalhe (para as conferências de toda a página: os nomes dos controles)
export const DETALHE_DOS_INSTRUTORES = '#det-ins';
// "Excluir instrutor…", no rodapé do detalhe: dois cliques
export async function excluirInstrutor(page, id) {
  await abrirInstrutor(page, id);
  const botao = page.locator('#det-ins-excluir');
  await botao.click();
  await expect(botao).toHaveText(/^Confirmar/);
  await botao.click();
}
// Os dados pessoais do instrutor aberto (a seção do detalhe): a seção, um campo pelo rótulo, "Salvar" e o texto que quem
// só lê vê (o do campo c)
export const dadosDoInstrutor = page => page.locator('#det-ins [data-pessoa]');
export const campoDosDadosDoInstrutor = (page, rotulo) => dadosDoInstrutor(page).getByLabel(rotulo, { exact: true });
export const salvarDadosDoInstrutor = page => page.locator('#det-ins-dados-salvar').click();
export const textoDoDadoDoInstrutor = (page, c) => page.locator(`#det-ins [aria-labelledby="det-ins-${c}-rotulo"]`);
export const campoDoInstrutor = (page, campo) => page.locator(`#det-ins .det [data-f="${campo}"]`);
export const habilitacaoDoInstrutor = (page, h) => page.locator(`#det-ins .det [data-f="hab"][data-h="${h}"]`);
export const secaoDoInstrutor = (page, secao) => page.locator(`#det-ins [data-chave="s:${secao}"]`);

// As faixas do instrutor aberto: o texto de "Pode decolar" e de "Pausas", os turnos, "Editar faixas" e o rascunho
export const faixasDoAberto = page => page.locator('#det-ins [data-campo="faixas"] .det-valor');
export const pausasDoAberto = page => page.locator('#det-ins [data-campo="pausas"] .det-valor');
export const botoesDosTurnos = page => page.locator('#det-ins [data-act="turno"]');
// "Agendar voo com <nome>", no alto do detalhe
export const agendarComOInstrutor = page => page.locator('#det-ins [data-act="agendar"]');
export const botaoDoTurno = (page, turno) => page.locator(`#det-ins-turno-${turno}`);
export async function aplicarTurno(page, id, turno) {
  await abrirInstrutor(page, id);
  await botaoDoTurno(page, turno).click();
  await expect(botaoDoTurno(page, turno)).toHaveAttribute('aria-pressed', 'true');
}
export const campoDaFaixa = (page, tipo, i, ponta) => page.locator(`#det-ins-${tipo}-${i}-${ponta}`);
// "Editar faixas" com as faixas e as pausas dadas ({ de, ate } em 'HH:MM'), e "Salvar faixas"
export async function editarFaixas(page, id, { faixas = [], pausas = [] }) {
  await abrirInstrutor(page, id);
  await page.locator('#det-ins-editar-faixas').click();
  for (const [tipo, lista] of [['faixa', faixas], ['pausa', pausas]]) {
    while (await page.locator(`[id^="det-ins-${tipo}-"][id$="-tirar"]`).count() > lista.length) await page.locator(`#det-ins-${tipo}-0-tirar`).click();
    while (await page.locator(`[id^="det-ins-${tipo}-"][id$="-tirar"]`).count() < lista.length) await page.locator(`#det-ins-mais-${tipo}`).click();
    for (const [i, f] of lista.entries()) {
      await campoDaFaixa(page, tipo, i, 'de').selectOption({ label: f.de });
      await campoDaFaixa(page, tipo, i, 'ate').selectOption({ label: f.ate });
    }
  }
  await page.locator('#det-ins-salvar-faixas').click();
}

// O item fixo dos limites da lei (o detalhe dele, com os campos)
export async function abrirLimitesDaLei(page) {
  if (!await page.locator('#s-ins').isVisible()) await abrirInstrutores(page);
  await page.locator('#ins > li[data-chave="f:limites"] .lista-botao').click();
  await expect(page.locator('#det-ins-titulo')).toHaveText('Limites da Lei do Aeronauta');
}
export const campoDoLimite = (page, rotulo) => page.locator('#limites-lei').getByLabel(rotulo);

// O filtro das habilitações de INVAs: os valores são as habilitações ('mlte', 'aviao:PR-VOM'…)
export const filtrarHabilitacoes = (page, valores, opcoes) => marcarNoFiltro(page, 'flt-ins-hab', valores, opcoes);

// As telas de INVAs que não são a de abertura (test/e2e/telas/invariantes.js, percorrerTelas): um instrutor aberto, com
// "Editar faixas" aberto; os limites da lei; a lista sem nenhum com os filtros; o filtro das habilitações aberto, com duas
// marcas. No fim, a busca e as marcas voltam a vazias. nome null: só o passo, sem conferir a tela
export const ESTADOS = [
  {
    nome: 'instrutores: um instrutor aberto, com Editar faixas',
    preparar: async page => {
      await abrirInstrutores(page);
      await page.locator('#ins > li.lista-linha[data-chave^="i:"] .lista-botao').first().click();
      await expect(page.locator('#det-ins-titulo')).toBeVisible();
      if (await page.locator('#det-ins-editar-faixas').isVisible()) await page.locator('#det-ins-editar-faixas').click();
    }
  },
  { nome: null, preparar: async page => { if (await page.locator('#det-ins-cancelar-faixas').isVisible()) await page.locator('#det-ins-cancelar-faixas').click(); } },
  {
    nome: 'instrutores: os limites da lei',
    preparar: async page => {
      await abrirInstrutores(page);
      await page.locator('#ins > li[data-chave="f:limites"] .lista-botao').click();
      await expect(page.locator('#det-ins-titulo')).toHaveText('Limites da Lei do Aeronauta');
    }
  },
  {
    nome: 'instrutores: nenhum com os filtros',
    preparar: async page => {
      await abrirInstrutores(page);
      await page.locator('[data-flt="ins"]').fill('nenhum assim');
      await nenhumNaLista(page, 'ins');
    }
  },
  {
    nome: 'instrutores: o filtro das habilitações aberto, com duas marcas',
    preparar: async page => {
      await page.locator('[data-flt="ins"]').fill('');
      await abrirInstrutores(page);
      await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
      await expect(page.locator('#flt-ins-hab')).toHaveText('Habilitações: Noturno + C172');
    }
  },
  { nome: null, preparar: page => filtrarHabilitacoes(page, []) }
];

// O Processamento (G2; modo local): a lista dos pedidos da data e dos voos sem pedido, com a situação de cada um ("em
// espera às 08:20 · 1º", N14), o detalhe só de leitura e as cinco ações ("Atualizar a escala", "Trazer de volta", "Pôr de
// volta na escala", "Tirar da escala" na linha sem aprovação, "Recomeçar pelos pedidos"), cada uma respondendo como o N6
// pede: a linha de estado role="status" e o toast com o aluno e a data, o foco na linha, a linha marcada não só pela cor, 44
// px no toque. E as ações de Pedidos que mudam a escala na hora (o cancelado sai sozinho), o Gestor que só lê. O relógio dos
// testes está em 10/11/2026, 12:00 em São Paulo; a data aberta é amanhã, qua 11/11
import {
  test, expect, irPara, appPronto, AMANHA, abrirEscala, abrirHistorico, editarPelaLista, refazer, linhaDaLista, escolherPedido, confirmar, abrir, lerEscala, mudarData,
  linhaDoProcessamento, linhasDoProcessamento, situacaoNoProcessamento, escolherNoProcessamento, campoDoProcessamento, acaoDoProcessamento, acaoNaLinha, avisoDoProcessamento,
  botaoAtualizarAEscala, estadoDoProcessamento, contagemDoProcessamento
} from './fixtures.js';
import { documentosAtuais } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { gavetaDasRestricoes, restricoesPeloEditor } from './telas/restricoes.js';

const DATA = 'qua 11/11';
// Um pedido aprovado na agenda deste navegador (um Voo Local às 08:20 de amanhã, por padrão), do aluno dado
const pedido = (id, alunoId, extra = {}) => ({
  id, data: AMANHA, aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', horario2: null, horas: 1, recurso: 'C152',
  observacao: null, registrado_por: 'Maria', registrado_em: `2026-11-10T1${id % 10}:00:00.000Z`, conta: null, excecao: false, cancelada_em: null, cancelada_por: null,
  aprovada_em: '2026-11-10T15:00:00.000Z', aprovada_por: 'Operador', aprovacao_retirada_em: null, aprovacao_retirada_por: null, ...extra
});
const aguardando = { aprovada_em: null, aprovada_por: null };
// O registro do dia de um pedido: o aluno voa (ou não) com o pedido dele (solicitacao), às 08:20
const comPedido = (id, sol, extra = {}) => aluno(id, { p1: 500, p2: -1, jan: 'h500', solicitacao: sol, ...extra });

// Abre o app com o dia (os alunos, os instrutores e o que já está no dia: importadas) e os pedidos da agenda deste navegador
async function abrirComPedidos(page, { stu, ins = [instrutor(1, 9), instrutor(2, 9)], importadas = [], agenda = [], aprovacao = null, url = './', outrosDias = {} }) {
  const estado = cenario({ ins, stu });
  estado.importadas = importadas;
  if (aprovacao) estado.aprovacao = aprovacao;
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_agenda: agenda, acpm4_agenda_aprovacoes: '1', acpm4_agenda_aprovacoes_g: '1' };
  // Outra data com o dia dela (os mesmos instrutores): { '2026-11-12': [alunos] }
  for (const [data, alunos] of Object.entries(outrosDias)) docs[`acpm4_dia_${data}`] = documentosAtuais(cenario({ ins, stu: alunos }), data).dias[data];
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
  }, JSON.stringify(docs));
  await page.goto(url);
  await appPronto(page);
}
const diaGuardado = page => page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`) || '{}'), AMANHA);
// O foco está no botão da linha da chave
const focoNaLinha = (page, chave) => expect(linhaDoProcessamento(page, chave).locator('.lista-botao')).toBeFocused();
// A resposta do N6: a linha de estado e o toast, com o aluno e a data
async function respondeu(page, texto) {
  await expect(estadoDoProcessamento(page)).toHaveText(`${texto} · ${DATA}`);
  await expect(estadoDoProcessamento(page)).toHaveAttribute('role', 'status');
  await expect(page.locator('#toast-box')).toContainText(`${texto} · ${DATA}.`);
}
// O botão tem 44 px no toque (o celular, 390 px)
async function alvoDeToque(locator) {
  const caixa = await locator.boundingBox();
  expect(caixa.height).toBeGreaterThanOrEqual(44);
  expect(caixa.width).toBeGreaterThanOrEqual(44);
}

test.describe('O Processamento', () => {
  test('a lista, a contagem e "Atualizar a escala": os aprovados entram, com a linha de estado, o toast e o foco na linha marcada', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false }), aluno(1002, { fly: false })],
      agenda: [pedido(1, 1000), pedido(2, 1001, { horario: '10:10' }), pedido(3, 1002, aguardando), pedido(4, 1002, { cancelada_em: '2026-11-10T16:00:00.000Z', cancelada_por: 'Maria' })]
    });
    await irPara(page, 'proc');
    await expect(situacaoNoProcessamento(page, 'p:1')).toHaveText('Aprovado: entra com Atualizar a escala');
    await expect(situacaoNoProcessamento(page, 'p:3')).toHaveText('Aguardando aprovação');
    // Sem marca no filtro da situação, os cancelados não aparecem
    await expect(linhaDoProcessamento(page, 'p:4')).toHaveCount(0);
    await expect(avisoDoProcessamento(page)).toContainText('2 pedidos aprovados fora da escala.');
    await expect(contagemDoProcessamento(page)).toHaveText('0 na escala · 0 fora · 1 aguardando aprovação');
    await botaoAtualizarAEscala(page).click();
    await respondeu(page, 'Escala atualizada: entraram Aluno 1000, Aluno 1001');
    await focoNaLinha(page, '1000_0_1');
    await expect(linhaDoProcessamento(page, '1000_0_1')).toHaveAttribute('data-recente', '');
    // Não só a cor: a barra à esquerda e "agora" depois do nome
    expect(await linhaDoProcessamento(page, '1000_0_1').locator('.lista-titulo').evaluate(el => getComputedStyle(el, '::after').content)).toBe('" · agora"');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText(/^Na escala 08:20–09:20 · .+ · Instrutor 0\d$/);
    await expect(contagemDoProcessamento(page)).toHaveText('2 na escala · 0 fora · 1 aguardando aprovação');
    await expect(avisoDoProcessamento(page)).toBeHidden();
    await expect.poll(async () => (await diaGuardado(page)).importadas).toEqual([1, 2]);
    // O Histórico diz quem entrou
    await abrirHistorico(page);
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Pedidos: Aluno 1000 entrou na escala' })).toHaveCount(1);
  });

  test('o pedido que espera o horário cheio: "em espera às 08:20 · 1º", com a lista do horário no detalhe e a mesma situação em Pedidos', async ({ page }) => {
    // Seis locais às 08:20 e o 7º registrado na lista de espera (U3): sem a confirmação, ele espera
    const stu = [1, 2, 3, 4, 5, 6, 7].map(n => comPedido(1000 + n, n));
    await abrirComPedidos(page, {
      stu, ins: [1, 2, 3, 4, 5, 6, 7].map(id => instrutor(id, 9)), importadas: [1, 2, 3, 4, 5, 6, 7],
      agenda: [1, 2, 3, 4, 5, 6, 7].map(n => pedido(n, 1000 + n))
    });
    await irPara(page, 'proc');
    await expect(situacaoNoProcessamento(page, '1007_0_1')).toHaveText('Em espera às 08:20 · 1º');
    await expect(situacaoNoProcessamento(page, '1007_0_1')).not.toContainText('Não coube');
    await escolherNoProcessamento(page, '1007_0_1');
    await expect(campoDoProcessamento(page, 'Lista de espera')).toHaveText('08:20: 1º Aluno 1007');
    await expect(contagemDoProcessamento(page)).toHaveText('6 na escala · 1 fora · 1 em espera · 0 aguardando aprovação');
    await irPara(page, 'age');
    await expect(linhaDaLista(page, 7)).toContainText('Em espera às 08:20 · 1º');
    await escolherPedido(page, 7);
    await expect(page.locator('#det-age')).toContainText('Em espera às 08:20 · 1º');
  });

  test('"Pôr de volta na escala" e "Trazer de volta" na linha: o voo volta, com a resposta do N6; 44 px no toque', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirComPedidos(page, {
      stu: [comPedido(1000, 1, { fly: false }), aluno(1001, { fly: false })], importadas: [1, 2],
      agenda: [pedido(1, 1000), pedido(2, 1001, { horario: '10:10' })]
    });
    await irPara(page, 'proc');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText('Tirado da escala nesta data');
    await expect(situacaoNoProcessamento(page, 'p:2')).toHaveText('Aprovado, tirado desta data antes: Trazer de volta');
    await alvoDeToque(acaoNaLinha(page, '1000_0_1'));
    await alvoDeToque(acaoNaLinha(page, 'p:2'));
    await alvoDeToque(page.locator('#btn-mais-proc'));
    await acaoNaLinha(page, '1000_0_1').click();
    await respondeu(page, 'De volta à escala: Aluno 1000 (Voo Local)');
    await focoNaLinha(page, '1000_0_1');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText(/^Na escala 08:20/);
    await acaoNaLinha(page, 'p:2').click();
    await respondeu(page, 'Trazido de volta: Aluno 1001 (Voo Local)');
    await focoNaLinha(page, '1001_0_1');
    await expect(situacaoNoProcessamento(page, '1001_0_1')).toHaveText(/^Na escala 10:10/);
    await expect.poll(async () => { const d = await diaGuardado(page); return [d.pedidos[1000].fly, d.pedidos[1001].solicitacao, [...d.importadas].sort()]; }).toEqual([true, 2, [1, 2]]);
  });

  test('a linha sem aprovação: "Aprovar pedido" e "Tirar da escala" no detalhe; tirar responde e põe o foco na linha', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirComPedidos(page, { stu: [comPedido(1000, 1)], importadas: [1], agenda: [pedido(1, 1000, aguardando)] });
    await irPara(page, 'proc');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText('Na escala sem aprovação: aprove em Pedidos ou tire da escala');
    await escolherNoProcessamento(page, '1000_0_1');
    await expect(acaoDoProcessamento(page, 'aprovar')).toBeVisible();
    await alvoDeToque(acaoDoProcessamento(page, 'tirar'));
    await acaoDoProcessamento(page, 'tirar').click();
    await respondeu(page, 'Tirado da escala: Aluno 1000 (Voo Local)');
    // Numa vista só (390 px), o detalhe está por cima da lista (a linha e a de estado escondidas): o foco fica no detalhe,
    // que já diz a situação nova (o pedido aguarda a aprovação, fora da escala)
    await expect(page.locator('#det-proc')).toBeFocused();
    await expect(campoDoProcessamento(page, 'Situação')).toHaveText('Aguardando aprovação');
    await expect.poll(async () => (await diaGuardado(page)).pedidos[1000].fly).toBe(false);
  });

  test('"Recomeçar pelos pedidos": a frase do que vai acontecer, a confirmação e a resposta', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [aluno(1000, { mis: 'IFR', eq: 'C172', p1: 610 }), aluno(1001, { fly: false })],
      agenda: [pedido(1, 1001)]
    });
    await irPara(page, 'proc');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText(/^Na escala/);
    await page.locator('#btn-mais-proc').click();
    await page.locator('#proc-recomecar').click();
    await expect(page.locator('#proc-recomecar-frase')).toHaveText('Recomeçar a data (1 sem pedido saiu, 1 entrou)');
    await page.locator('#proc-recomecar').click();
    await respondeu(page, 'Escala recomeçada (1 sem pedido saiu, 1 entrou): saiu Aluno 1000; entrou Aluno 1001');
    await expect(linhaDoProcessamento(page, '1000_0_1')).toHaveCount(0);
    await expect(situacaoNoProcessamento(page, '1001_1_1')).toHaveText(/^Na escala 08:20/);
  });

  test('Pedidos: aprovar põe na escala na hora; cancelar o aprovado tira o voo sozinho (−1 passo)', async ({ page }) => {
    await abrirComPedidos(page, { stu: [aluno(1000, { fly: false })], agenda: [pedido(1, 1000, aguardando)] });
    await irPara(page, 'age');
    await linhaDaLista(page, 1).locator('[data-act="aprovar-pedido"]').click();
    await expect(page.locator('#toast-box')).toContainText(`Pedido aprovado: Aluno 1000 na escala 08:20 · ${DATA}.`);
    await expect.poll(async () => (await diaGuardado(page)).pedidos[1000].fly).toBe(true);
    await escolherPedido(page, 1);
    await confirmar(page, '#det-age-cancelar');
    await expect(page.locator('#toast-box')).toContainText('Pedido cancelado. Aluno 1000 saiu da escala.');
    await expect.poll(async () => { const d = await diaGuardado(page); return [d.pedidos[1000].fly, d.importadas]; }).toEqual([false, []]);
    await irPara(page, 'proc');
    await expect(avisoDoProcessamento(page)).toBeHidden();
  });

  test('o Gestor lê a lista, o aviso e o detalhe como texto, sem as ações', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [comPedido(1000, 1, { fly: false }), aluno(1001, { fly: false })], importadas: [1], agenda: [pedido(1, 1000), pedido(2, 1001)], url: './?role=gestor'
    });
    await irPara(page, 'proc');
    await expect(avisoDoProcessamento(page)).toHaveText('1 pedido aprovado fora da escala: um Operador atualiza a escala.');
    await expect(botaoAtualizarAEscala(page)).toHaveCount(0);
    await expect(acaoNaLinha(page, '1000_0_1')).toHaveCount(0);
    await escolherNoProcessamento(page, '1000_0_1');
    await expect(acaoDoProcessamento(page, 'por-de-volta')).toHaveCount(0);
    await expect(campoDoProcessamento(page, 'Situação')).toHaveText('Tirado da escala nesta data');
  });

  test('"Pôr de volta" também pela Escala: o "✕" tira o voo, e a gaveta das restrições aberta pela Escala o põe de volta depois da pergunta', async ({ page }) => {
    await abrirComPedidos(page, { stu: [comPedido(1000, 1)], importadas: [1], agenda: [pedido(1, 1000)] });
    await abrirEscala(page);
    await editarPelaLista(page, '1000_0_1');
    await restricoesPeloEditor(page, 1000);
    // O "✕" do voo, na Lista: a pergunta da escala não aprovada (R6)
    await page.locator('#out button.x[data-act="rm-fly"][data-id="1000"]').dispatchEvent('click');
    await refazer(page);
    await expect(gavetaDasRestricoes(page)).toContainText('Fora da escala nesta data (tirado da escala)');
    await gavetaDasRestricoes(page).locator('[data-act="por-de-volta"]').click();
    await refazer(page);
    await expect(page.locator('#toast-box')).toContainText(`De volta à escala: Aluno 1000 (Voo Local) · ${DATA}.`);
    await expect.poll(async () => (await diaGuardado(page)).pedidos[1000].fly).toBe(true);
    // O botão sai com a gaveta redesenhada: o foco vai para a situação nova do voo na gaveta, não para o body (a revisão)
    await expect(gavetaDasRestricoes(page).locator('.restricoes-situacao')).toBeFocused();
    await expect(gavetaDasRestricoes(page).locator('.restricoes-situacao')).toContainText('Na escala:');
  });

  test('na escala aprovada, "Pôr de volta" devolve o voo ao pino dele, sem o motor e sem pergunta', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [comPedido(1000, 1, { fly: false })], importadas: [1], agenda: [pedido(1, 1000)],
      aprovacao: { em: '2026-11-10T18:00:00.000Z', por: 'Operador' }
    });
    await page.evaluate(d => {
      const dia = JSON.parse(localStorage.getItem(`acpm4_dia_${d}`));
      dia.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PP-LJV', insId: 2 } };
      localStorage.setItem(`acpm4_dia_${d}`, JSON.stringify(dia));
    }, AMANHA);
    await page.reload();
    await appPronto(page);
    await irPara(page, 'proc');
    await acaoNaLinha(page, '1000_0_1').click();
    await respondeu(page, 'De volta à escala: Aluno 1000 (Voo Local)');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText('Na escala 10:10–11:10 · PP-LJV · Instrutor 02');
  });
});

// A revisão do G2: o detalhe aberto segue o pedido que mudou de chave; o "Mais" à vista; a marca e a linha de estado de uma
// data não passam para outra; a resposta diz onde o voo ficou (em espera); a gaveta não perde o foco; as buscas sem acentos
test.describe('O Processamento: a revisão', () => {
  for (const largura of [1280, 390]) {
    test(`${largura} px: "Trazer de volta" no detalhe: o detalhe segue o pedido, que ganhou um voo (nada de "saiu do cadastro")`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      await abrirComPedidos(page, { stu: [aluno(1001, { fly: false })], importadas: [2], agenda: [pedido(2, 1001, { horario: '10:10' })] });
      await irPara(page, 'proc');
      await escolherNoProcessamento(page, 'p:2');
      await acaoDoProcessamento(page, 'trazer').click();
      await expect(page.locator('#toast-box')).toContainText(`Trazido de volta: Aluno 1001 (Voo Local) · ${DATA}.`);
      await expect(campoDoProcessamento(page, 'Situação')).toHaveText(/^Na escala 10:10/);
      await expect(page.locator('#det-proc')).not.toContainText('saiu do cadastro');
      await expect(page.locator('#anuncio')).not.toContainText('saiu do cadastro');
      await expect(page).toHaveURL(/#\/proc\/1001_0_1$/);
      if (largura === 1280) await focoNaLinha(page, '1001_0_1');
      else {
        await expect(page.locator('#s-proc')).toHaveAttribute('data-vendo', 'detalhe');
        await expect(page.locator('#det-proc')).toBeFocused();
      }
    });
  }

  test('"Atualizar a escala" com o detalhe do pedido aberto: o detalhe segue o pedido', async ({ page }) => {
    await abrirComPedidos(page, { stu: [aluno(1000, { fly: false })], agenda: [pedido(1, 1000)] });
    await irPara(page, 'proc');
    await escolherNoProcessamento(page, 'p:1');
    await botaoAtualizarAEscala(page).click();
    await respondeu(page, 'Escala atualizada: entrou Aluno 1000');
    await expect(campoDoProcessamento(page, 'Situação')).toHaveText(/^Na escala 08:20/);
    await expect(page.locator('#det-proc')).not.toContainText('saiu do cadastro');
    await expect(page.locator('#anuncio')).not.toContainText('saiu do cadastro');
  });

  test('"Aprovar pedido" no detalhe: a resposta do N6 (a linha de estado, o foco na linha) e o detalhe segue o pedido', async ({ page }) => {
    await abrirComPedidos(page, { stu: [aluno(1000, { fly: false })], agenda: [pedido(1, 1000, aguardando)] });
    await irPara(page, 'proc');
    await escolherNoProcessamento(page, 'p:1');
    await acaoDoProcessamento(page, 'aprovar').click();
    await respondeu(page, 'Pedido aprovado: Aluno 1000 na escala 08:20');
    await focoNaLinha(page, '1000_0_1');
    await expect(campoDoProcessamento(page, 'Situação')).toHaveText(/^Na escala 08:20/);
    await expect(page.locator('#det-proc')).not.toContainText('saiu do cadastro');
  });

  for (const [largura, altura] of [[1280, 800], [390, 844], [375, 812]]) {
    test(`${largura} px: o "Mais" abre à vista, com a frase de "Recomeçar pelos pedidos"`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await abrirComPedidos(page, { stu: [aluno(1000, { fly: false })], agenda: [pedido(1, 1000)] });
      await irPara(page, 'proc');
      await page.locator('#btn-mais-proc').click();
      await page.locator('#proc-recomecar').click();
      await expect(page.locator('#proc-recomecar-frase')).not.toBeEmpty();
      for (const el of ['#menu-mais-proc', '#proc-recomecar', '#proc-recomecar-frase']) {
        const caixa = await page.locator(el).boundingBox();
        expect(caixa.x, el).toBeGreaterThanOrEqual(0);
        expect(caixa.x + caixa.width, el).toBeLessThanOrEqual(largura);
      }
    });
  }

  test('a marca "agora" e a linha de estado ficam na data da ação: em outra data, a linha da mesma chave não é marcada', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [comPedido(1000, 1, { fly: false })], importadas: [1], agenda: [pedido(1, 1000)], outrosDias: { '2026-11-12': [aluno(1000)] }
    });
    await irPara(page, 'proc');
    await acaoNaLinha(page, '1000_0_1').click();
    await respondeu(page, 'De volta à escala: Aluno 1000 (Voo Local)');
    await expect(linhaDoProcessamento(page, '1000_0_1')).toHaveAttribute('data-recente', '');
    await mudarData(page, '2026-11-12');
    await expect(situacaoNoProcessamento(page, '1000_0_1')).toHaveText(/^Na escala/);
    await expect(linhaDoProcessamento(page, '1000_0_1')).not.toHaveAttribute('data-recente', '');
    await expect(estadoDoProcessamento(page)).toBeEmpty();
    await mudarData(page, AMANHA);
    await expect(linhaDoProcessamento(page, '1000_0_1')).not.toHaveAttribute('data-recente', '');
  });

  // Seis locais às 08:20 (o limite) e um 7º que espera
  const sete = [1, 2, 3, 4, 5, 6, 7];
  test('"Pôr de volta" de um voo que o motor deixa na lista de espera: a resposta diz "em espera às 08:20 · 2º"', async ({ page }) => {
    await abrirComPedidos(page, {
      stu: [...sete.map(n => comPedido(1000 + n, n)), comPedido(1010, 10, { fly: false })], ins: sete.map(id => instrutor(id, 9)),
      importadas: [...sete, 10], agenda: [...sete.map(n => pedido(n, 1000 + n)), pedido(10, 1010)]
    });
    await irPara(page, 'proc');
    await acaoNaLinha(page, '1010_0_1').click();
    await respondeu(page, 'Posto de volta: Aluno 1010 (Voo Local), em espera às 08:20 · 2º');
    await expect(situacaoNoProcessamento(page, '1010_0_1')).toHaveText('Em espera às 08:20 · 2º');
  });

  test('"Atualizar a escala" com sete locais aprovados às 08:20: a resposta separa os que entraram do que ficou em espera', async ({ page }) => {
    await abrirComPedidos(page, { stu: sete.map(n => aluno(1000 + n, { fly: false })), ins: sete.map(id => instrutor(id, 9)), agenda: sete.map(n => pedido(n, 1000 + n)) });
    await irPara(page, 'proc');
    await botaoAtualizarAEscala(page).click();
    await respondeu(page, 'Escala atualizada: entraram Aluno 1001, Aluno 1002, Aluno 1003 e mais 3; ficou em espera Aluno 1007');
    await expect(situacaoNoProcessamento(page, '1007_0_1')).toHaveText('Em espera às 08:20 · 1º');
  });

  test('"Pôr de volta na escala" na gaveta aberta pelo Processamento: a linha de estado responde e o foco fica na gaveta', async ({ page }) => {
    await abrirComPedidos(page, { stu: [comPedido(1000, 1, { fly: false })], importadas: [1], agenda: [pedido(1, 1000)] });
    await irPara(page, 'proc');
    await escolherNoProcessamento(page, '1000_0_1');
    await acaoDoProcessamento(page, 'restricoes').click();
    await gavetaDasRestricoes(page).locator('[data-act="por-de-volta"]').focus();
    await page.keyboard.press('Enter');
    await respondeu(page, 'De volta à escala: Aluno 1000 (Voo Local)');
    await expect(gavetaDasRestricoes(page).locator('.restricoes-situacao')).toBeFocused();
    await expect(gavetaDasRestricoes(page).locator('.restricoes-situacao')).toContainText('Na escala:');
  });

  // As buscas do Processamento, da Escala (o aluno, o instrutor ou a missão) e do BI acham o nome sem os acentos e sem
  // diferença de maiúsculas (eram testadas pela Demanda)
  test('as buscas do Processamento, da Escala e do BI acham o nome sem acentos', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9, { nm: 'Ângelo Brandão' }), instrutor(2, 9)], stu: [aluno(1000, {}, { nm: 'João Conceição' }), aluno(1001)] });
    await abrir(page, { estado });
    await irPara(page, 'proc');
    await expect(linhasDoProcessamento(page)).toHaveCount(2);
    await page.locator('#flt-proc').fill('joao conceicao');
    await expect(linhasDoProcessamento(page)).toHaveCount(1);
    await expect(linhasDoProcessamento(page)).toHaveAttribute('data-proc', '1000_0_1');
    await page.locator('#flt-proc').fill('JOÃO');
    await expect(linhasDoProcessamento(page)).toHaveCount(1);
    await page.locator('#flt-proc').fill('');

    // As linhas dos voos (sem a do horário)
    await abrirEscala(page);
    const voos = async () => (await lerEscala(page)).linhas.filter(l => l.includes(' | '));
    expect(await voos()).toHaveLength(2);
    await page.locator('#flt-esc-q').fill('conceicao');
    await expect.poll(async () => (await voos()).map(l => l.includes('| João Conceição |'))).toEqual([true]);
    await page.locator('#flt-esc-q').fill('angelo brandao');
    await expect.poll(async () => (await voos()).map(l => l.includes('| Ângelo Brandão |'))).toEqual([true]);
    await page.locator('#flt-esc-q').fill('');

    await irPara(page, 'bi');
    const noBI = page.locator('#bi-content [data-bi="ins"] tbody tr');
    await expect(noBI).toHaveCount(2);
    await page.locator('#bi-flt-ins').fill('angelo');
    await expect(noBI).toHaveCount(1);
    await expect(noBI).toContainText('Ângelo Brandão');
  });
});

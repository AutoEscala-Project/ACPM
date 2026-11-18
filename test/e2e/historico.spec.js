// Histórico da data numa gaveta lateral, que abre sobre a aba aberta (sem trocar de aba).
import { test, expect, abrirSintetico, irPara, abrirEscala, AMANHA, prepararContexto, vigiarErros, entrar } from './fixtures.js';
import { documentosAtuais, instalarSupabaseFalso, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor, missaoExtra } from '../helpers/montar.js';

// Abre o app com os documentos deste navegador já gravados: o cadastro, o dia de amanhã e o histórico dele
async function abrirComHistorico(page, estado, historico) {
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_historico: historico };
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
  }, JSON.stringify(docs));
  await page.goto('./');
  await expect(page.locator('#wins input[data-a="win"]').first()).toBeAttached();
}

// Uma entrada de amanhã com a reversão de um voo agendado na Escala (a que o diálogo do agendamento grava)
const agendamento = (id, descricao, reverter) => ({
  id, data: AMANHA, registrado_em: `2026-11-10T14:0${id}:00.000Z`, autor: null, tipo: reverter.criado ? 'inc' : 'mod', descricao,
  reverter: { kind: 'desfazerAgendamento', pedido: null, fixo: null, disponibilidade: null, label: '↶ Desfazer', ...reverter }, reverte: null, importado: false
});

test.describe('Histórico', () => {
  test('abre numa gaveta sobre a aba aberta, sem trocar de aba; Esc e ✕ fecham', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await expect(page.locator('#log-cnt')).toHaveText('1');

    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    await expect(page.locator('#s-rec')).toBeVisible();
    await expect(page.locator('#historico-data')).toHaveText('quarta-feira, 11/11');
    await expect(page.locator('#audit-log-list')).toContainText('PR-BTB: Manutenção');

    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
    await page.locator('#btn-open-log').click();
    await page.locator('#btn-fechar-historico').click();
    await expect(page.locator('#historico')).toBeHidden();
  });

  test('com o histórico aberto, trocar a data troca também a data do histórico', async ({ page }) => {
    await abrirSintetico(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico-data')).toHaveText('quarta-feira, 11/11');
    await page.locator('#dt-prox').click();
    await expect(page.locator('#dt')).toHaveValue('2026-11-12');
    await expect(page.locator('#historico-data')).toHaveText('quinta-feira, 12/11');
  });

  test('desfazer um voo agendado na Escala: o voo criado sai, sem o cadeado, e o instrutor volta a não vir', async ({ page }) => {
    // O agendamento criou a missão extra 1 do Aluno 1000 às 10:10, fixa no PR-VOB com o Instrutor 02, que não vinha
    // nesta data e foi marcado disponível
    const estado = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 500, p2: -1 }, { extra: [missaoExtra(1, { p1: 610, p2: -1, insId: 2 })] })],
      fStatus: { '1000_1_1': 'Confirmado' }
    });
    estado.fixos = { '1000_1_1': { a: 610, b: 670, r: 'PR-VOB', insId: 2 } };
    const descricao = 'Agendado na escala: Aluno 1000 · Voo Local · 10:10–11:10 · PR-VOB · Instrutor 02 · Instrutor 02 marcado disponível às 10:10';
    await abrirComHistorico(page, estado, [agendamento(1, descricao, {
      stuId: 1000, mid: 1, criado: true, disponibilidade: { insId: 2, on: false, aw: Array(9).fill(true) }
    })]);
    await irPara(page, 'ins');
    await expect(page.locator('#inst-dia tr[data-id="2"] [data-f="on"]')).toBeChecked();
    await abrirEscala(page);
    const voos = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(voos).toHaveCount(2);
    await expect(voos.filter({ hasText: '10:10–11:10' }).locator('.fixo')).toHaveCount(1);
    await expect(voos.filter({ hasText: '10:10–11:10' }).locator('.c-instr')).toHaveText('Instrutor 02');

    await page.locator('#btn-open-log').click();
    const desfazer = page.locator('#audit-log-list [data-act="rev-log"]');
    await expect(desfazer).toHaveText('↶ Desfazer');
    await desfazer.click();
    const revertido = page.locator('#audit-log-list .audit-item', { hasText: `Revertido: ${descricao}` });
    await expect(revertido.locator('.audit-badge')).toHaveText('Exclusão');
    await expect(desfazer).toHaveCount(0);
    await page.keyboard.press('Escape');

    await expect(voos).toHaveCount(1);
    await expect(voos.locator('.c-hr')).toContainText('08:20–09:20');
    await expect(page.locator('#out .fixo')).toHaveCount(0);
    await irPara(page, 'dem');
    await expect(page.locator('#dem tr[data-k="d"][data-id="1000"]')).toHaveCount(1);
    await irPara(page, 'ins');
    await expect(page.locator('#inst-dia tr[data-id="2"] [data-f="on"]')).not.toBeChecked();

    // Gravado: depois de recarregar, continua desfeito (o instrutor também), e a entrada desfeita não volta
    await page.reload();
    await abrirEscala(page);
    await expect(voos).toHaveCount(1);
    await page.locator('#btn-open-log').click();
    await expect(revertido).toHaveCount(1);
    await expect(desfazer).toHaveCount(0);
    await page.keyboard.press('Escape');
    await irPara(page, 'ins');
    await expect(page.locator('#inst-dia tr[data-id="2"] [data-f="on"]')).not.toBeChecked();
  });

  // A reversão vem gravada no histórico (no servidor, por quem tem conta de operador): adulterada, ela não vira botão, e a
  // data abre com a escala e o resto do histórico. Um campo do pedido de antes que nem vira texto (um objeto com
  // "toString": null) lançava uma exceção ao desenhar o histórico, e a escala da data não aparecia
  test('a reversão de um agendamento adulterada não vira botão nem impede a data de abrir', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 500, p2: -1 })] });
    const pedido = { fly: true, mis: 'Voo Local', eq: 'C152', p1: 610, p2: -1, nb: 1, ss: 1, pr: 3 };
    await abrirComHistorico(page, estado, [
      agendamento(1, 'Agendado na escala: prioridade adulterada', { stuId: 1000, mid: 0, criado: false, pedido: { ...pedido, pr: { toString: null } } }),
      agendamento(2, 'Agendado na escala: missão numa lista', { stuId: 1000, mid: 0, criado: false, pedido: { ...pedido, mis: ['Noturno'] } }),
      agendamento(3, 'Agendado na escala: no formato do app', { stuId: 1000, mid: 0, criado: false, pedido })
    ]);
    await abrirEscala(page);
    await expect(page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' }).locator('.c-hr')).toContainText('08:20–09:20');
    await page.locator('#btn-open-log').click();
    const entrada = texto => page.locator('#audit-log-list .audit-item', { hasText: texto });
    await expect(entrada('prioridade adulterada')).toHaveCount(1);
    await expect(entrada('prioridade adulterada').locator('[data-act="rev-log"]')).toHaveCount(0);
    await expect(entrada('missão numa lista').locator('[data-act="rev-log"]')).toHaveCount(0);
    await expect(entrada('no formato do app').locator('[data-act="rev-log"]')).toHaveText('↶ Desfazer');
  });

  // Modo compartilhado: sem os resultados dos cursos (a leitura falhou), os registros do dia vêm vazios e não dá para
  // conferir se o voo tem resultado; desfazer espera "Tentar de novo", e o voo com resultado continua
  test('sem os resultados dos cursos, o voo agendado não é desfeito; lidos, o voo com resultado também não', async ({ browser }) => {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    const estado = cenario({
      ins: [instrutor(1, 9)],
      stu: [aluno(1000, { p1: 500, p2: -1 }, { curso: 'PP', extra: [missaoExtra(1, { p1: 610, p2: -1, etapa: 'PP-07' })] })]
    });
    estado.fixos = { '1000_1_1': { a: 610, b: 670, r: 'PR-VOB', insId: 1 } };
    const servidor = await instalarSupabaseFalso(contexto, {
      ...documentosAtuais(estado, AMANHA),
      historico: [agendamento(1, 'Agendado na escala: Aluno 1000 · PP-07 (Voo Local) · 10:10–11:10 · PR-VOB · Instrutor 01', { stuId: 1000, mid: 1, criado: true })]
    });
    servidor.resultados.push({ id: 1, aluno: 1000, curso: 'PP', missao: 'PP-07', resultado: 'aprovado', data: AMANHA, voo: '1000_1_1', registrado_em: '2026-11-11T13:30:00.000Z', registrado_por: 'Operador' });
    servidor.falhar('/rpc/situacao_das_missoes');
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [503] });
    await entrar(page, CONTAS.operador);
    await expect(page.locator('#aviso-dados')).toBeVisible();
    await abrirEscala(page);
    const voos = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(voos).toHaveCount(2);

    const desfazer = page.locator('#audit-log-list [data-act="rev-log"]');
    await page.locator('#btn-open-log').click();
    await desfazer.click();
    await expect(page.locator('#toast-box')).toContainText('Sem os resultados dos cursos, o app não confere se o voo já tem resultado: clique em "Tentar de novo" no aviso e desfaça depois.');
    await expect(desfazer).toHaveText('↶ Desfazer');
    await page.keyboard.press('Escape');

    await page.locator('#btn-tentar-dados').click();
    await expect(page.locator('#aviso-dados')).toBeHidden();
    await page.locator('#btn-open-log').click();
    await desfazer.click();
    await expect(page.locator('#toast-box')).toContainText('O voo já tem resultado registrado.');
    await expect(desfazer).toHaveText('↶ Desfazer');
    await page.keyboard.press('Escape');
    await expect(voos).toHaveCount(2);
    // Nada desfeito: o histórico do servidor só tem o agendamento
    expect(servidor.historico).toHaveLength(1);
    expect(erros).toEqual([]);
    await contexto.close();
  });

  test('desfazer um voo movido: o pedido, o instrutor escolhido e o voo fixo voltam como estavam; o voo em andamento fica', async ({ page }) => {
    // O agendamento moveu o Aluno 1000 das 08:20 no PR-VOC, com o Instrutor 02 escolhido na Escala, para as 10:10 no
    // PR-VOB com o Instrutor 01. O Aluno 1001, agendado às 06:30, já está em voo
    const estado = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 610, p2: -1, insId: 1 }), aluno(1001, { p1: 390, p2: -1 })],
      fStatus: { '1000_0_1': 'Confirmado', '1001_0_1': 'Em Voo' }
    });
    estado.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PR-VOB', insId: 1 }, '1001_0_1': { a: 390, b: 450, r: 'PR-VOI', insId: 1 } };
    await abrirComHistorico(page, estado, [
      agendamento(1, 'Agendado na escala: Aluno 1001 · Voo Local · 06:30–07:30 · PR-VOI · Instrutor 01', {
        stuId: 1001, mid: 0, criado: true, pedido: { fly: false, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 3 }
      }),
      agendamento(2, 'Agendado na escala: Aluno 1000 · Voo Local · 10:10–11:10 · PR-VOB · Instrutor 01 (era 08:20 no PR-VOC)', {
        stuId: 1000, mid: 0, criado: false, pedido: { fly: true, mis: 'Voo Local', eq: 'C152', p1: 500, p2: -1, nb: 1, ss: 1, pr: 3, insId: 2 },
        fixo: { a: 500, b: 560, r: 'PR-VOC', insId: 2, escolhido: true }
      })
    ]);
    await abrirEscala(page);
    const voo = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(voo.locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo.locator('.c-instr')).toHaveText('Instrutor 01');

    await page.locator('#btn-open-log').click();
    const entrada = texto => page.locator('#audit-log-list .audit-item', { hasText: texto });
    // O voo em andamento não é desfeito: o aviso diz por quê, e a entrada continua com o botão
    await entrada('Agendado na escala: Aluno 1001').locator('[data-act="rev-log"]').click();
    await expect(page.locator('#toast-box')).toContainText('O voo já está em andamento: mude o status em vez de desfazer.');
    await expect(entrada('Agendado na escala: Aluno 1001').locator('[data-act="rev-log"]')).toHaveText('↶ Desfazer');

    await entrada('Agendado na escala: Aluno 1000').locator('[data-act="rev-log"]').click();
    await expect(entrada('Revertido: Agendado na escala: Aluno 1000').locator('.audit-badge')).toHaveText('Edição');
    await page.keyboard.press('Escape');
    await expect(voo.locator('.c-hr')).toContainText('08:20–09:20');
    await expect(voo.locator('.c-aviao')).toContainText('PR-VOC');
    await expect(voo.locator('.c-instr')).toHaveText('Instrutor 02');
    await expect(voo.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
    await irPara(page, 'dem');
    await expect(page.locator('#dem tr[data-k="d"][data-id="1000"][data-mid="0"] [data-f="insId"]')).toHaveValue('2');
  });
});

// Atributos dos recursos em Recursos (no detalhe do recurso, "Cadastro · todas as datas": Só VFR, Só Parafuso; a
// habilitação própria em "Habilitações que o INVA precisa"), a habilitação própria nas habilitações do instrutor (em INVAs)
// e o simulador com 2 h na Demanda e na Agenda
import { test, expect, abrir, irPara, abrirEscala, abrirHistorico, campoDaAgenda, abrirInstrutor, secaoDoInstrutor, habilitacaoDoInstrutor, abrirRecursos, linhaDoRecurso, marcarAtributo, campoDoRecurso, textosDaEscala } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { abrirRestricoes, campoDasRestricoes, fecharRestricoes } from './telas/restricoes.js';

const linha = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });

test.describe('Atributos dos recursos', () => {
  test('a frota começa com o PR-CPL "Só VFR" e o PR-VOM com habilitação própria; um atributo marcado vale na escala, e o histórico desfaz', async ({ page }) => {
    // Um voo IFR no C172, com todos os C172 em manutenção menos o PR-HAR e o PR-CPL
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'IFR', eq: 'C172' })], semAeronaves: ['PP-ABP', 'PP-AJS', 'PR-BUL', 'PR-VOY'] });
    await abrir(page, { estado });
    // Os atributos aparecem na linha de cada recurso, em Recursos
    await abrirRecursos(page);
    await expect(linhaDoRecurso(page, 'PR-CPL').locator('.lista-l2')).toContainText('Só VFR');
    await expect(linhaDoRecurso(page, 'PR-VOM').locator('.lista-l2')).toContainText('Exige Avião PR-VOM');
    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000').locator('.c-aviao')).toContainText('PR-HAR');

    // O PR-HAR também passa a "Só VFR" (no detalhe dele): o voo IFR fica sem avião; o foco fica na caixa
    await marcarAtributo(page, 'PR-HAR', 'soVfr', true);
    await expect(linhaDoRecurso(page, 'PR-HAR').locator('.lista-l2')).toContainText('Só VFR');
    await expect(campoDoRecurso(page, 'atributos').locator('[data-atributo="soVfr"]')).toBeFocused();
    await abrirEscala(page);
    await expect(textosDaEscala(page, 'erros').filter({ hasText: 'nenhum C172 homologado IFR disponível' })).toHaveCount(1);

    await abrirHistorico(page);
    await expect(page.locator('#audit-log-list')).toContainText('PR-HAR: Só VFR marcado');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await expect(linha(page, 'Aluno 1000').locator('.c-aviao')).toContainText('PR-HAR');
  });

  test('a habilitação própria do PR-VOM aparece nas habilitações do instrutor e vale na escala', async ({ page }) => {
    const mlte = ['mlte', 'local'];
    const estado = cenario({ ins: [instrutor(1, 1, { hab: mlte })], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' })], semAeronaves: ['PT-JOB', 'PT-KIW'] });
    await abrir(page, { estado });
    await abrirEscala(page);
    await expect(textosDaEscala(page, 'erros').filter({ hasText: 'exigem do instrutor uma habilitação que nenhum instrutor livre tem (marque no INVA, em Habilitações)' })).toHaveCount(1);

    await abrirInstrutor(page, 1);
    await expect(secaoDoInstrutor(page, 'habilitacoes').locator('fieldset', { hasText: 'Habilitação própria do recurso' })).toContainText('Avião PR-VOM');
    await habilitacaoDoInstrutor(page, 'aviao:PR-VOM').check();
    await abrirEscala(page);
    await expect(linha(page, 'Aluno 1000').locator('.c-aviao')).toContainText('PR-VOM');
  });

  test('o simulador começa com 2 h na Demanda e na Agenda', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await irPara(page, 'dem');
    const pedido = page.locator('#dem tr[data-k="d"][data-id="1000"][data-mid="0"]');
    // A duração, nas restrições do pedido (G1), acompanha a missão mudada na linha
    await abrirRestricoes(page, 1000);
    await pedido.locator('[data-f="mis"]').selectOption('Simulador');
    await expect(campoDasRestricoes(page, 'nb')).toHaveValue('2');
    await page.locator('#dem tr[data-k="d"][data-id="1000"][data-mid="0"] [data-f="mis"]').selectOption('Voo Local');
    await expect(campoDasRestricoes(page, 'nb')).toHaveValue('1');
    await fecharRestricoes(page);

    await irPara(page, 'age');
    // A missão espera o aluno (F1c)
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Simulador');
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('2');
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('1');
  });
});

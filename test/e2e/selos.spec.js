// Selos de atenção nas abas: avisos da escala, aviões parados ou perto da revisão de 50 horas e pedidos da agenda
// que ainda não estão na demanda.
import { test, expect, abrir, irPara, irParaVista, AMANHA, entrar } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';

const pedido = (id, data = AMANHA) => ({
  id, data, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'manha', horario: null, observacao: null,
  registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null
});

test.describe('Selos nas abas', () => {
  test('Escala: o número de avisos, em âmbar', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, {}, { kg: 0 })] }) });
    await expect(page.locator('#selo-esc')).toHaveText('1');
    await expect(page.locator('#selo-esc')).toHaveClass(/\baviso\b/);
  });

  test('Escala: missões que não entraram vêm primeiro, em vermelho; sem nada a avisar, sem selo', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' })] }) });
    await expect(page.locator('#selo-esc')).toHaveText('1');
    await expect(page.locator('#selo-esc')).toHaveClass(/\berro\b/);

    await irPara(page, 'dem');
    await page.locator('#dem tr[data-k="d"] [data-f="fly"]').uncheck();
    await expect(page.locator('#selo-esc')).toBeHidden();
  });

  // A tabela dos aviões fica na Disponibilidade do dia: o selo diz onde e aparece também no botão dela (quem está no
  // Cadastro vê onde olhar)
  test('Recursos: aviões parados ou com menos de 5 h até a revisão de 50 horas, também no botão da Disponibilidade do dia', async ({ page }) => {
    await abrir(page, { estado: cenario({ horas: { 'PR-BTB': 47, 'PR-IGU': 10 } }) });
    await expect(page.locator('#selo-rec')).toHaveText('1');
    await expect(page.locator('#selo-rec')).toHaveAttribute('title', '1 avião parado ou perto da revisão de 50 horas (Recursos › Disponibilidade do dia)');
    await expect(page.locator('#selo-esc')).toBeHidden();
    await irParaVista(page, 'rec', 'cadastro');
    const doDia = page.locator('#s-rec [data-vista-rec="dia"] #selo-rec-dia');
    await expect(doDia).toBeVisible();
    await expect(doDia).toHaveText('1');
    await expect(doDia).toHaveClass(/\baviso\b/);
    await expect(doDia).toHaveAttribute('title', '1 avião parado ou perto da revisão de 50 horas');
    // A revisão feita: os dois somem
    await irParaVista(page, 'rec', 'dia');
    await page.locator('#eqs tr[data-r="PR-BTB"] [data-act="revisao"]').click();
    await page.locator('#eqs tr[data-r="PR-BTB"] [data-act="revisao"]').click();
    await expect(page.locator('#selo-rec')).toBeHidden();
    await expect(doDia).toBeHidden();
  });

  test('Agenda: pedidos da data que ainda não estão na demanda; somem depois de importar', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000), aluno(1001)] }, AMANHA));
    servidor.solicitacoes.push(pedido(1), pedido(2, '2026-11-12'));
    await entrar(page, CONTAS.operador);
    await expect(page.locator('#selo-age')).toHaveText('1');

    await irPara(page, 'dem');
    await expect(page.locator('#importar-agenda')).toHaveText('Importar 1 pedido da agenda');
    await expect(page.locator('#importar-agenda')).not.toHaveClass(/\bsec\b/);
    await page.locator('#importar-agenda').click();
    await expect(page.locator('#selo-age')).toBeHidden();
    await expect(page.locator('#importar-agenda')).toHaveText('Importar da agenda');
    await expect(page.locator('#importar-agenda')).toHaveClass(/\bsec\b/);
  });

  test('o Gestor não vê o selo da agenda (ele não importa pedidos)', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000)] }, AMANHA));
    servidor.solicitacoes.push(pedido(1));
    await entrar(page, CONTAS.gestor);
    await expect(page.locator('#nav button[data-t="esc"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#selo-age')).toBeHidden();
  });
});

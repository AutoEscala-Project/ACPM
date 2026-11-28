// O que pede atenção, na linha (os antigos selos das abas): o estado e o valor de cada cartão e das tarefas dele (os avisos
// e as missões que não entraram na Escala; os pedidos que aguardam aprovação e os aprovados fora da escala, no Processamento) e o selo do link Recursos
// (aviões parados ou perto da revisão de 50 horas), que aparece também no botão da Disponibilidade do dia
import { test, expect, abrir, irPara, AMANHA, entrar, botaoDaAba, avisoDoProcessamento, recomecarPelosPedidos, atualizarAEscala, abrirRecursos, abrirRecurso, linhaDoRecurso } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';

const pedido = (id, data = AMANHA, extra = {}) => ({
  id, data, aluno: 1000, aluno_nome: 'Aluno 1000', missao: 'Voo Local', janela: 'manha', horario: null, observacao: null,
  registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: 'Secretaria de Teste', excecao: false, cancelada_em: null, cancelada_por: null, ...extra
});
// O pedido aprovado (D2: só o aprovado entra na escala)
const APROVADO = { aprovada_em: '2026-11-10T14:30:00.000Z', aprovada_por: 'Operador de Teste' };
const cartao = (page, id) => page.locator(`#linha li.estagio[data-estagio="${id}"]`);
const tarefa = (page, id) => page.locator(`#linha a.tarefa[data-tarefa="${id}"]`);
const seloDeRecursos = page => page.locator('#linha .linha-mais a[href="#/rec"] .linha-selo');

test.describe('O que pede atenção, na linha', () => {
  test('Escala: um aviso deixa o cartão e a tarefa "conflitos e avisos" em atenção', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, {}, { kg: 0 })] }) });
    await expect(cartao(page, 'escala')).toHaveAttribute('data-estado', 'atencao');
    await expect(tarefa(page, 'conflitos')).toHaveAttribute('data-estado', 'atencao');
    await expect(tarefa(page, 'conflitos').locator('.tarefa-valor')).toHaveText('1');
    await expect(cartao(page, 'escala').locator('.estagio-valor')).toHaveText('1 de 1');
  });

  test('Escala: a missão que não entrou faz o cartão falhar; sem missões pedidas, ele fica pendente', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' })] }) });
    await expect(cartao(page, 'escala')).toHaveAttribute('data-estado', 'falhou');
    await expect(tarefa(page, 'montada')).toHaveAttribute('data-estado', 'falhou');
    await expect(tarefa(page, 'montada').locator('.tarefa-valor')).toHaveText('0 de 1');
    await expect(cartao(page, 'escala').locator('.estagio-titulo .sr')).toHaveText(': 0 de 1 missão na escala, falhou: 0 de 1 escala montada');

    // Sem o voo (sem pedido, ele sai com "Recomeçar pelos pedidos", G2), nenhuma missão pedida: pendente
    await irPara(page, 'proc');
    await recomecarPelosPedidos(page);
    await expect(cartao(page, 'escala')).toHaveAttribute('data-estado', 'pendente');
  });

  // A tabela dos aviões fica na Disponibilidade do dia: o selo do link Recursos diz quantos, e aparece também no botão dela
  // (quem está no Cadastro vê onde olhar)
  // B: o número da Disponibilidade do dia vai para os pontos das linhas de Recursos (e o trilho)
  test('Recursos: aviões parados ou com menos de 5 h até a revisão de 50 horas, também no ponto da linha do avião', async ({ page }) => {
    await abrir(page, { estado: cenario({ horas: { 'PR-BTB': 47, 'PR-IGU': 10 } }) });
    await expect(seloDeRecursos(page)).toHaveText('1');
    await expect(seloDeRecursos(page)).toHaveClass(/\batencao\b/);
    await expect(botaoDaAba(page, 'rec')).toHaveAccessibleName(/^Recursos ?, 1 avião parado ou perto da revisão de 50 horas$/);
    await expect(tarefa(page, 'recursos')).toHaveAttribute('data-estado', 'atencao');
    await abrirRecursos(page);
    const ponto = linhaDoRecurso(page, 'PR-BTB').locator('.lista-ponto.aviso');
    await expect(ponto).toHaveAttribute('title', 'perto da revisão de 50 horas');
    await expect(linhaDoRecurso(page, 'PR-IGU').locator('.lista-ponto.aviso, .lista-ponto.erro')).toHaveCount(0);
    // A revisão feita: os dois somem
    await abrirRecurso(page, 'PR-BTB');
    await page.locator('#det-rec [data-act="revisao"]').click();
    await page.locator('#det-rec [data-act="revisao"]').click();
    await expect(seloDeRecursos(page)).toBeHidden();
    await expect(ponto).toHaveCount(0);
    await expect(tarefa(page, 'recursos')).toHaveAttribute('data-estado', 'feito');
  });

  // Pedidos (D2): os que aguardam aprovação pedem atenção a todos; os aprovados fora da escala, a quem opera a escala (G2:
  // a tarefa leva ao Processamento, onde "Atualizar a escala" os põe)
  test('Pedidos: os aprovados que ainda não estão na escala pedem atenção; com "Atualizar a escala", a tarefa fica feita', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000), aluno(1001)] }, AMANHA));
    servidor.solicitacoes.push(pedido(1, AMANHA, APROVADO), pedido(2, '2026-11-12', APROVADO));
    await entrar(page, CONTAS.operador);
    await expect(cartao(page, 'pedidos').locator('.estagio-valor')).toHaveText('1');
    await expect(tarefa(page, 'fora-da-escala')).toHaveAttribute('data-estado', 'atencao');
    await expect(tarefa(page, 'fora-da-escala').locator('.tarefa-valor')).toHaveText('1');
    await expect(tarefa(page, 'fora-da-escala')).toHaveAttribute('href', '#/proc');
    await expect(tarefa(page, 'aguardando')).toHaveAttribute('data-estado', 'feito');

    await irPara(page, 'proc');
    await expect(avisoDoProcessamento(page)).toContainText('1 pedido aprovado fora da escala.');
    await atualizarAEscala(page);
    await expect(tarefa(page, 'fora-da-escala')).toHaveAttribute('data-estado', 'feito');
    await expect(tarefa(page, 'fora-da-escala').locator('.tarefa-valor')).toHaveText('0');
    await expect(avisoDoProcessamento(page)).toBeHidden();
  });

  test('o Gestor não vê "aprovados fora da escala" (ele não atualiza a escala); o que aguarda aprovação pede atenção a ele também', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000)] }, AMANHA));
    servidor.solicitacoes.push(pedido(1));
    await entrar(page, CONTAS.gestor);
    await expect(botaoDaAba(page, 'esc')).toHaveAttribute('aria-current', 'page');
    await expect(tarefa(page, 'registrados')).toHaveCount(1);
    await expect(tarefa(page, 'fora-da-escala')).toHaveCount(0);
    await expect(tarefa(page, 'aguardando')).toHaveAttribute('data-estado', 'atencao');
    await expect(cartao(page, 'pedidos')).toHaveAttribute('data-estado', 'atencao');
  });
});

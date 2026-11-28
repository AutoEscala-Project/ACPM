import { test, expect, abrir, abrirSintetico, abrirComExemplo, irPara, abrirEscala, filtrarHabilitacoes, filtrarCursos, AMANHA, caixaVem, dataAberta, botaoDoTrilho, linhasDosAlunos, linhaDoInstrutor, abrirInstrutor, secaoDoInstrutor, nomesDosInstrutores, buscaDosInstrutores, nenhumNaLista, agendarComOInstrutor, botoesDosTurnos, abrirRecursos, abrirRecurso, abrirCategoria, buscaDosRecursos, linhasDosRecursos, contagemDosRecursos, cabecalhoDaCategoria, horariosDaCategoria } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

test.describe('Perfis de acesso', () => {
  test('perfil Gestor oculta a edição e o Operador a restaura', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);

    await page.locator('#role-sel').selectOption('gestor');
    await expect(page.locator('body')).toHaveAttribute('data-role', 'gestor');
    await expect(page.locator('#out [data-act="rm-fly"]').first()).toBeHidden();
    // O Gestor não agenda voos na Escala
    await expect(page.locator('#btn-agendar')).toBeHidden();
    // A data o Gestor também muda: abrir uma data não grava nada
    await expect(botaoDoTrilho(page)).toBeEnabled();
    await expect(page.locator('#out .st-sel').first()).toBeDisabled();
    await irPara(page, 'ins');
    await expect(page.locator('[data-act="addi"]')).toBeHidden();
    // INVAs só para ler: sem o "Vem" e o "Ativo" da linha; o detalhe em texto (sem os turnos, "Editar faixas", as caixas das
    // habilitações e "Agendar voo com…"), com o resumo das habilitações
    await expect(caixaVem(linhaDoInstrutor(page, 1))).toBeHidden();
    await expect(linhaDoInstrutor(page, 1).locator('[data-act="ativo"]')).toBeHidden();
    await abrirInstrutor(page, 1);
    await expect(secaoDoInstrutor(page, 'data')).toContainText('vem nesta data');
    await expect(secaoDoInstrutor(page, 'data').locator('[data-act="turno"], [data-act="editar-faixas"], input')).toHaveCount(0);
    await expect(secaoDoInstrutor(page, 'habilitacoes').locator('input')).toHaveCount(0);
    await expect(secaoDoInstrutor(page, 'habilitacoes')).toContainText('Local');
    await expect(agendarComOInstrutor(page)).toBeHidden();

    await page.locator('#role-sel').selectOption('operador');
    await expect(page.locator('[data-act="addi"]')).toBeVisible();
    await irPara(page, 'esc');
    await expect(page.locator('#btn-agendar')).toBeVisible();
    await abrirInstrutor(page, 1);
    await expect(caixaVem(linhaDoInstrutor(page, 1))).toBeEnabled();
    await expect(botoesDosTurnos(page)).toHaveCount(3);
    await expect(botaoDoTrilho(page)).toBeEnabled();
  });

  test('?role=gestor abre no Gestor sem travar o seletor', async ({ page }) => {
    await abrirSintetico(page, { url: './?role=gestor' });
    await expect(page.locator('body')).toHaveAttribute('data-role', 'gestor');
    await expect(page.locator('#btn-agendar')).toBeHidden();
    await expect(page.locator('#role-sel')).toBeEnabled();
    await expect(page.locator('#role-sel')).toHaveValue('gestor');
  });

  // Quem só consulta usa os filtros como o Operador: a busca e as caixas das habilitações e dos cursos (.flt-ctrl, que
  // js/somente-leitura.js não desliga), as vistas, o botão e o "Limpar" do filtro e o "Limpar filtros" (sem data-act, que
  // js/eventos/registro.js não deixa passar para ele)
  test('o Gestor busca, filtra pelas habilitações e pelos cursos e troca de vista em INVAs, Alunos e no Processamento; "Limpar filtros" mostra todos de novo', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { nm: 'Ângelo Brandão' }), instrutor(2, 9), instrutor(3, 1), instrutor(4, 1, { hab: ['local', 'c172'] })],
      stu: [aluno(1000, {}, { nm: 'João Silva', curso: 'PP' }), aluno(1001)]
    });
    await abrir(page, { estado, url: './?role=gestor' });
    await expect(page.locator('body')).toHaveAttribute('data-role', 'gestor');
    await irPara(page, 'ins');
    const busca = buscaDosInstrutores(page), botao = page.locator('#flt-ins-hab'), painel = page.locator('#flt-ins-hab-painel');
    const quantos = async () => (await nomesDosInstrutores(page)).length;
    await busca.fill('angelo');
    await expect.poll(quantos).toBe(1);
    await expect(page.locator('#ins-contagem')).toHaveText('1 de 4 instrutores');
    await busca.fill('');
    // As habilitações, com duas marcas: quem tem as duas (o Instrutor 04 tem só o C172)
    await botao.click();
    await expect(painel).toBeVisible();
    await expect(painel.locator('input[data-filtro]:disabled')).toHaveCount(0);
    await painel.locator('input[data-valor="noturno"]').check();
    await painel.locator('input[data-valor="c172"]').check();
    await expect.poll(quantos).toBe(2);
    await expect(botao).toHaveText('Habilitações: Noturno + C172');
    await expect(page.locator('#ins-contagem')).toHaveText('2 de 4 instrutores');
    // O "Limpar" do filtro, e o Esc fecha o painel (o foco volta ao botão)
    await painel.getByRole('button', { name: 'Limpar' }).click();
    await expect.poll(quantos).toBe(4);
    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
    await expect(botao).toBeFocused();
    await filtrarHabilitacoes(page, ['mlte']);
    await expect.poll(quantos).toBe(2);
    await busca.fill('nenhum assim');
    await nenhumNaLista(page, 'ins');
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(busca).toBeFocused();
    await expect(botao).toHaveText('Todas as habilitações');
    await expect(painel.locator('input[data-filtro]:checked')).toHaveCount(0);
    await expect.poll(quantos).toBe(4);
    await expect(page.locator('#ins-contagem')).toHaveText('4 instrutores');

    await irPara(page, 'alu');
    const buscaAlu = page.locator('[data-flt="alu"]');
    await buscaAlu.fill('joao');
    await expect(linhasDosAlunos(page)).toHaveCount(1);
    await buscaAlu.fill('nenhum assim');
    await page.locator('#limpar-filtros-alu').click();
    await expect(buscaAlu).toHaveValue('');
    await expect(linhasDosAlunos(page)).toHaveCount(2);
    await expect(page.locator('#alu-contagem')).toHaveText('2 alunos');
    // O filtro dos cursos, em Alunos e no Processamento (cada um com as marcas dele, G2)
    await page.locator('#flt-alu-cur').click();
    await expect(page.locator('#flt-alu-cur-painel input[data-filtro]:disabled')).toHaveCount(0);
    await filtrarCursos(page, 'alu', ['PP']);
    await expect(linhasDosAlunos(page)).toHaveCount(1);
    await expect(page.locator('#alu-contagem')).toHaveText('1 de 2 alunos');
    await irPara(page, 'proc');
    await expect(page.locator('#s-proc')).toBeVisible();
    const visiveis = page.locator('#proc > li.lista-linha:visible');
    await expect(page.locator('#flt-proc-cur')).toHaveText('Todos os cursos');
    await expect(visiveis).toHaveCount(2);
    await page.locator('#flt-proc-cur').click();
    await expect(page.locator('#flt-proc-cur-painel input[data-filtro]:disabled')).toHaveCount(0);
    await filtrarCursos(page, 'proc', ['PP']);
    await expect(visiveis).toHaveCount(1);
    await expect(visiveis).toHaveAttribute('data-proc', '1000_0_1');
    await filtrarCursos(page, 'proc', ['sem-curso']);
    await expect(visiveis).toHaveAttribute('data-proc', '1001_0_1');
    // O "Limpar filtros" do Processamento: a busca e as marcas
    await page.locator('#flt-proc').fill('nenhum assim');
    await page.locator('#limpar-filtros-proc').click();
    await expect(page.locator('#flt-proc')).toBeFocused();
    await expect(page.locator('#flt-proc')).toHaveValue('');
    await expect(page.locator('#flt-proc-cur')).toHaveText('Todos os cursos');
    await expect(visiveis).toHaveCount(2);
  });

  // Em Recursos também (B, lista e detalhe): a busca pela matrícula (com .flt-ctrl, sem data-f nem data-a), os grupos que
  // recolhem, a escolha de um recurso e de uma categoria e o "Limpar filtros"; "+ Novo recurso" não aparece
  test('o Gestor busca a matrícula, recolhe as categorias e abre um recurso em Recursos; "Limpar filtros" mostra todos de novo', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }), url: './?role=gestor' });
    await expect(page.locator('body')).toHaveAttribute('data-role', 'gestor');
    await abrirRecursos(page);
    await expect(page.locator('#btn-novo-recurso')).toBeHidden();
    const busca = buscaDosRecursos(page);
    await expect(busca).toBeEnabled();
    await expect(busca).toHaveClass(/\bflt-ctrl\b/);
    await busca.fill('vob');
    await expect(linhasDosRecursos(page)).toHaveCount(1);
    await expect(contagemDosRecursos(page)).toHaveText('1 de 27 recursos');
    await busca.fill('');
    const seta = cabecalhoDaCategoria(page, 'C152').locator('.lista-seta');
    await seta.click();
    await expect(seta).toHaveAttribute('aria-expanded', 'false');
    await expect(linhasDosRecursos(page)).toHaveCount(14);
    await abrirRecurso(page, 'PR-VOM');
    await expect(page.locator('#det-rec-titulo')).toHaveText('PR-VOM');
    await abrirCategoria(page, 'PA-34');
    await expect(horariosDaCategoria(page).locator('[data-act="editar-horarios"]')).toBeHidden();
    await busca.fill('nenhum assim');
    await page.locator('#limpar-filtros-rec').click();
    await expect(busca).toBeFocused();
    await expect(busca).toHaveValue('');
    await expect(contagemDosRecursos(page)).toHaveText('27 recursos');
  });

  // O link não leva a escala no endereço (nomes, pesos e horas). Sem o servidor, a escala fica só neste navegador;
  // no app publicado, o link leva só a data (test/e2e/compartilhado.spec.js)
  test('neste navegador (sem servidor), Compartilhar explica que o link da escala é do app publicado', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await page.evaluate(() => navigator.clipboard.writeText('nada copiado'));
    await page.locator('#btn-share-link').click();
    await expect(page.locator('#toast-box')).toContainText('Sem o servidor, a escala fica só neste navegador: o link da escala é do app publicado, com login.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('nada copiado');
  });

  test('um link antigo com a escala no endereço (share=) avisa que não vale mais; o app abre com os dados deste navegador', async ({ page }) => {
    const payload = { d: '2026-11-12', fly: [[1000, 'Aluno do Link', 70, [], 1, 'Voo Local', 'C152', 1, 2, 1, 1, 3, []]] };
    const share = encodeURIComponent(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
    await abrirComExemplo(page, { url: `./?role=gestor&share=${share}` });
    await expect(page.locator('#aviso-link-texto')).toHaveText(AVISO_DO_LINK_ANTIGO);
    await expect(page.locator('#role-sel')).toBeEnabled();
    await expect(dataAberta(page)).toHaveAttribute('data-data', AMANHA);
    await abrirEscala(page);
    await expect(page.locator('#out')).not.toContainText('Aluno do Link');
    expect(new URL(page.url()).searchParams.has('share')).toBe(false);
    await page.locator('#btn-fechar-aviso-link').click();
    await expect(page.locator('#aviso-link')).toBeHidden();
  });
});

const AVISO_DO_LINK_ANTIGO = 'Este link antigo levava a escala no próprio endereço e não vale mais. Peça um link novo a quem compartilhou.';

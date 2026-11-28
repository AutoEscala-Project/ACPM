// Alunos como lista e detalhe (F2): o cadastro no detalhe, a busca, o filtro dos cursos, "Excluir aluno…" armado e o
// celular (a lista, depois o detalhe). O componente em si (as teclas, o clique, a bancada) fica em lista.spec.js. Do
// passo A: "Nesta data", "Curso e missões" (a missão anterior e a atual, o resultado sem voo, "Colocar no curso até…" e o
// ↶ dela), a busca pelo nome completo e o "Apagar os dados pessoais" do aluno inativo
import {
  test, comProgresso, expect, abrir, abrirSintetico, abrirComExemplo, irPara, irParaVista, filtrarCursos, confirmar, AGORA, AMANHA, alvosPequenos,
  appPronto, dataAberta, diaSeguinte, larguraDaPagina, abrirAluno, campoDoAberto, linhaDoAluno, linhasDosAlunos, nomesNaLista,
  etiquetasDoAberto, nenhumNaLista, abrirHistorico, campoDaAgenda, prepararContexto, vigiarErros, entrar, abrirEscala, entradasDoHistorico
} from './fixtures.js';
import { documentosAtuais, criarSupabaseFalso, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { cursosIniciais, novoCurso, percursoDoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { GLOSSARIO } from '../../js/glossario.js';

test.describe('Alunos', () => {
  test('cadastra, bloqueia instrutor e exclui aluno com confirmação, no detalhe', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'alu');
    await expect(page.locator('#alu')).toHaveText('Nenhum aluno cadastrado. Clique em “+ Novo aluno” acima para cadastrar.');
    await expect(page.locator('#det-alu')).toHaveText('Escolha um aluno na lista.');
    await page.locator('[data-act="adds"]').click();
    await expect(linhasDosAlunos(page)).toHaveCount(1);
    // O aluno novo abre escolhido, com o nome em foco (selecionado, para digitar por cima)
    await expect(campoDoAberto(page, 'nm')).toHaveValue('Novo aluno');
    await expect(campoDoAberto(page, 'nm')).toBeFocused();
    await expect(campoDoAberto(page, 'kg')).toHaveClass(/\bfalta\b/);
    // Sem peso: o ponto da linha diz
    await expect(linhasDosAlunos(page).first().locator('.lista-ponto.aviso')).toHaveAttribute('title', 'sem peso');

    const naoEscalar = campoDoAberto(page, 'bl');
    await expect(naoEscalar.locator('option').first()).toHaveText('Não escalar com…');
    await naoEscalar.selectOption({ label: 'Instrutor 03' });
    await expect(etiquetasDoAberto(page, 'bl')).toHaveText(/Instrutor 03/);
    // O foco continua no campo, para bloquear outro em seguida
    await expect(campoDoAberto(page, 'bl')).toBeFocused();
    await page.locator('#det-alu [data-act="unbl"]').click();
    await expect(etiquetasDoAberto(page, 'bl')).toHaveCount(0);
    await expect(campoDoAberto(page, 'bl')).toBeFocused();

    await irPara(page, 'dem');
    await expect(page.locator('#dem tr[data-k="d"]')).toHaveCount(1);

    // De volta, o aluno continua aberto; "Excluir aluno…", no rodapé, pede o segundo clique
    await irPara(page, 'alu');
    const excluir = page.locator('#det-alu-excluir');
    await excluir.click();
    await expect(excluir).toHaveText('Confirmar exclusão');
    await excluir.click();
    await expect(page.locator('#alu')).toContainText('Nenhum aluno cadastrado');
    await expect(page.locator('#det-alu')).toHaveText('Escolha um aluno na lista.');
    await expect(page).toHaveURL(/#\/alu$/);
  });

  test('o nome tem até 80 caracteres, nos alunos e nos instrutores', async ({ page }) => {
    await abrirSintetico(page);
    const longo = 'Maria '.repeat(20);
    await irPara(page, 'alu');
    await page.locator('[data-act="adds"]').click();
    await expect(campoDoAberto(page, 'nm')).toHaveAttribute('maxlength', '80');
    await campoDoAberto(page, 'nm').fill(longo);
    await campoDoAberto(page, 'nm').blur();
    await expect(campoDoAberto(page, 'nm')).toHaveValue(longo.slice(0, 80).trim());
    await expect(page.locator('#det-alu-titulo')).toHaveText(longo.slice(0, 80).trim());
    await irPara(page, 'ins');
    await page.locator('[data-act="addi"]').click();
    const nome = page.locator('#inst .cd').last().locator('.nm');
    await expect(nome).toHaveAttribute('maxlength', '80');
    await nome.fill(longo);
    await nome.blur();
    await expect(page.locator('#inst .cd').last().locator('.nm')).toHaveValue(longo.slice(0, 80).trim());
  });

  // Em Alunos, o peso recusado fica no campo, com a mensagem embaixo dele (o Esc devolve o gravado); em Instrutores (até C),
  // o aviso e o campo de volta ao peso de antes
  test('o peso vai até 300 kg, nos alunos e nos instrutores: acima disso, não vale', async ({ page }) => {
    await abrirSintetico(page);
    const historico = page.locator('#audit-log-list');
    await irPara(page, 'alu');
    await page.locator('[data-act="adds"]').click();
    const peso = campoDoAberto(page, 'kg');
    const erro = page.locator('#det-alu-kg-erro');
    await expect(peso).toHaveAttribute('min', '1');
    await expect(peso).toHaveAttribute('max', '300');
    await peso.fill('250');
    await peso.blur();
    await expect(historico).toContainText('Peso Novo aluno: 250 kg');
    await expect(peso).not.toHaveClass(/\bfalta\b/);
    // Acima de 300 kg: o valor fica no campo, marcado, com a mensagem; nada é gravado
    await peso.fill('350');
    await peso.press('Tab');
    await expect(erro).toHaveText('O peso vai de 1 a 300 kg.');
    await expect(peso).toHaveValue('350');
    await expect(peso).toHaveAttribute('aria-invalid', 'true');
    await expect(peso).toHaveAccessibleDescription('O peso vai de 1 a 300 kg.');
    // O Esc no campo devolve o peso gravado, e a mensagem sai
    await peso.focus();
    await page.keyboard.press('Escape');
    await expect(peso).toHaveValue('250');
    await expect(erro).toHaveText('');
    await expect(peso).not.toHaveAttribute('aria-invalid', 'true');
    // Um texto que não é número também não vale
    await peso.fill('');
    await peso.pressSequentially('1-2');
    await peso.blur();
    await expect(erro).toHaveText('O peso vai de 1 a 300 kg.');
    // O peso certo grava e tira a mensagem
    await peso.fill('72.5');
    await peso.blur();
    await expect(historico).toContainText('Peso Novo aluno: 72,5 kg');
    await expect(erro).toHaveText('');
    await expect(historico).not.toContainText('Peso Novo aluno: 350');

    // Instrutores (a tabela, até C): o aviso e o peso de antes
    await irPara(page, 'ins');
    await page.locator('[data-act="addi"]').click();
    const pesoIns = page.locator('#inst .cd').last().locator('[data-f="kg"]');
    await pesoIns.fill('250');
    await pesoIns.blur();
    await expect(historico).toContainText('Peso Novo instrutor: 250 kg');
    await pesoIns.fill('350');
    await pesoIns.blur();
    await expect(page.locator('.toast')).toHaveText('O peso vai de 1 a 300 kg.');
    await expect(pesoIns).toHaveValue('250');

    // O peso digitado fica gravado; vazio, a pessoa fica sem peso
    await page.reload();
    await appPronto(page);
    await irPara(page, 'alu');
    await abrirAluno(page, await linhasDosAlunos(page).last().getAttribute('data-id'));
    await expect(campoDoAberto(page, 'kg')).toHaveValue('72.5');
    await campoDoAberto(page, 'kg').fill('');
    await campoDoAberto(page, 'kg').blur();
    await expect(campoDoAberto(page, 'kg')).toHaveClass(/\bfalta\b/);
    await expect(campoDoAberto(page, 'kg')).toHaveValue('');
  });

  // A busca acha o nome sem os acentos e continua depois de cada redesenho: outra data, um instrutor renomeado, o aluno
  // renomeado e o aluno novo, que ficam à vista mesmo fora da busca, até ela mudar. A contagem diz quantos aparecem; sem
  // nenhum, "Limpar filtros"
  test('a busca acha o nome sem acentos e continua depois de cada redesenho: outra data, um instrutor renomeado, o aluno renomeado, + Novo aluno', async ({ page }) => {
    const estado = { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { nm: 'João Silva' }), aluno(1001, {}, { nm: 'Maria da Conceição' }), aluno(1002)] }), nid: 1003 };
    await abrir(page, { estado });
    await irPara(page, 'alu');
    const busca = page.locator('[data-flt="alu"]');
    const contagem = page.locator('#alu-contagem');
    await expect(contagem).toHaveAttribute('role', 'status');
    await expect(contagem).toHaveText('3 alunos');
    await busca.fill('joao');
    await expect.poll(() => nomesNaLista(page)).toEqual(['João Silva']);
    await expect(contagem).toHaveText('1 de 3 alunos');
    await busca.fill('CONCEICAO');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Maria da Conceição']);
    await busca.fill('  maria   da ');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Maria da Conceição']);
    await busca.fill('joão');
    await expect.poll(() => nomesNaLista(page)).toEqual(['João Silva']);

    // Outra data: a lista é refeita só no que mudou (a linha do João continua a mesma, com a marca que lhe foi posta)
    await linhaDoAluno(page, 1000).evaluate(li => { li.dataset.antes = ''; });
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect.poll(() => nomesNaLista(page)).toEqual(['João Silva']);
    await expect(linhaDoAluno(page, 1000)).toHaveAttribute('data-antes', '');
    await expect(busca).toHaveValue('joão');
    await expect(contagem).toHaveText('1 de 3 alunos');

    // Um instrutor renomeado
    await irParaVista(page, 'ins', 'cadastro');
    await page.locator('#inst .cd[data-id="1"] .nm').fill('Instrutor Um');
    await page.locator('#inst .cd[data-id="1"] .nm').blur();
    await expect(page.locator('#audit-log-list')).toContainText('Instrutor: Instrutor 01 → Instrutor Um');
    await irPara(page, 'alu');
    await expect.poll(() => nomesNaLista(page)).toEqual(['João Silva']);

    // O aluno renomeado no detalhe, pelo teclado: a linha continua à vista, mesmo fora da busca, e o Tab leva ao campo
    // seguinte, o peso. Mudada a busca, ela vale para o nome novo
    await abrirAluno(page, 1000);
    await campoDoAberto(page, 'nm').fill('Joaquim Silva');
    await page.keyboard.press('Tab');
    await expect(page.locator('#audit-log-list')).toContainText('Aluno: João Silva → Joaquim Silva');
    await expect(campoDoAberto(page, 'kg')).toBeFocused();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Joaquim Silva']);
    await expect(contagem).toHaveText('1 de 3 alunos');
    await busca.fill('joao');
    await expect(page.locator('#alu > li.lista-vazia')).toBeVisible();
    await expect.poll(() => nomesNaLista(page)).toEqual([]);
    await expect(contagem).toHaveText('0 de 3 alunos');
    // O filtro nunca tira a escolha: o detalhe continua aberto
    await expect(page.locator('#det-alu-titulo')).toHaveText('Joaquim Silva');
    await busca.fill('joaquim');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Joaquim Silva']);

    // O aluno novo aparece, escolhido, com o nome em foco; os outros continuam filtrados. Renomeado, ele continua à vista
    await page.locator('[data-act="adds"]').click();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Joaquim Silva', 'Novo aluno']);
    await expect(campoDoAberto(page, 'nm')).toBeFocused();
    await expect(busca).toHaveValue('joaquim');
    await expect(contagem).toHaveText('2 de 4 alunos');
    await campoDoAberto(page, 'nm').fill('Pedro Álvares');
    await campoDoAberto(page, 'nm').blur();
    await expect(page.locator('#audit-log-list')).toContainText('Aluno: Novo aluno → Pedro Álvares');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Joaquim Silva', 'Pedro Álvares']);
    await busca.fill('alvares');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Pedro Álvares']);

    // Nenhum com esses filtros: a lista diz por quê; "Limpar filtros" mostra todos de novo, com o foco na busca
    await busca.fill('xyz');
    await expect(page.locator('#alu > li.lista-vazia')).toHaveText('Nenhum aluno com esses filtros. Limpar filtros');
    await expect(contagem).toHaveText('0 de 4 alunos');
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(busca).toHaveValue('');
    await expect(busca).toBeFocused();
    await expect(linhasDosAlunos(page)).toHaveCount(4);
    await expect(page.locator('#alu > li.lista-vazia')).toHaveCount(0);
    await expect(contagem).toHaveText('4 alunos');
  });
});

// O "Ativo" do cadastro (F2): a chave da linha, um clique em cada sentido, o aviso, o Histórico e "Mostrar inativos"
test.describe('Alunos: Ativo e Mostrar inativos', () => {
  const estado = () => ({ ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { nm: 'Ana' }), aluno(1001, {}, { nm: 'Bruno' }), aluno(1002, {}, { nm: 'Carla' })] }), nid: 1003 });
  const chave = (page, id) => linhaDoAluno(page, id).locator('.lista-chave');

  test('um clique desliga: a linha fica, discreta, com "inativo"; o aviso diz o que muda; o Histórico reverte; outro clique liga', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'alu');
    await expect(chave(page, 1000)).toHaveAttribute('role', 'switch');
    await expect(chave(page, 1000)).toHaveAttribute('aria-checked', 'true');
    await expect(chave(page, 1000)).toHaveAccessibleName('Ana ativo no cadastro');
    await expect(page.locator('#alu-inativos')).toBeHidden();
    await chave(page, 1000).click();
    await expect(chave(page, 1000)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#toast-box')).toContainText('Ana inativo de hoje em diante. Os voos dele nesta data continuam; os pedidos ficam registrados e só entram quando ele voltar a ativo. As datas passadas não mudam.');
    // A linha continua à vista (até um filtro mudar), discreta e com a etiqueta
    await expect(linhaDoAluno(page, 1000)).toHaveClass(/\binativo\b/);
    await expect(linhaDoAluno(page, 1000).locator('.lista-inativo')).toHaveText('inativo');
    await expect(page.locator('#alu-inativos')).toHaveText('Mostrar inativos (1)');
    await expect(page.locator('#alu-contagem')).toHaveText('2 alunos');
    // O detalhe dele diz o que o inativo quer dizer
    await abrirAluno(page, 1000);
    await expect(page.locator('#det-alu-aviso')).toContainText('Inativo no cadastro');
    // Gravado no cadastro, com a entrada do Histórico, que reverte
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).stu.find(s => s.id === 1000).inativo)).toBe(true);
    await abrirHistorico(page);
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Ana: inativo no cadastro' });
    await entrada.locator('[data-act="rev-log"]').click();
    await expect(chave(page, 1000)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#audit-log-list')).toContainText('Revertido: Ana: ativo no cadastro');
    await page.locator('#btn-fechar-historico').click();
    // Um clique liga de novo, e outro desliga
    await chave(page, 1001).click();
    await expect(chave(page, 1001)).toHaveAttribute('aria-checked', 'false');
    await chave(page, 1001).click();
    await expect(chave(page, 1001)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#toast-box')).toContainText('Bruno ativo de novo, de hoje em diante.');
    await expect.poll(() => page.evaluate(() => 'inativo' in JSON.parse(localStorage.getItem('acpm4_cadastro')).stu.find(s => s.id === 1001))).toBe(false);
  });

  test('"Mostrar inativos": o inativo sai da lista quando um filtro muda e volta com o botão; a busca vazia diz quantos inativos passam', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'alu');
    await chave(page, 1002).click();
    await expect(chave(page, 1002)).toHaveAttribute('aria-checked', 'false');
    await page.locator('[data-flt="alu"]').fill('carla');
    await expect(page.locator('#alu > li.lista-vazia')).toHaveText('Nenhum aluno ativo com esses filtros; 1 inativo passa. Mostrar inativos Limpar filtros');
    await page.locator('#alu [data-lista-inativos="alu"]').click();
    await expect(page.locator('#alu-inativos')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Carla']);
    await expect(page.locator('#alu-contagem')).toHaveText('1 de 3 alunos');
    await page.locator('[data-flt="alu"]').fill('');
    await page.locator('#alu-inativos').click();
    await expect(page.locator('#alu-inativos')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Bruno']);
    await expect(page.locator('#alu-contagem')).toHaveText('2 alunos');
    // O aluno inativo não entra num pedido novo (a lista de alunos do formulário da Agenda fica sem ele)
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'aluno').locator('option', { hasText: 'Carla' })).toHaveCount(0);
    // Quem só consulta não vê a chave
    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'alu');
    await expect(chave(page, 1000)).toBeHidden();
  });
});

// O filtro dos cursos de Alunos (o filtro de vários valores, com a regra "alguma": um curso só por aluno), a barra e o link
// para a Demanda
test.describe('Alunos: o filtro dos cursos e a barra', () => {
  // O cadastro e o dia, com os cursos como as tabelas dos cursos os guardam, neste navegador
  async function abrirComCursos(page, { estado, cursos = cursosIniciais() }) {
    const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
    const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_cursos: { cursos, alteracoes: [] } };
    await page.addInitScript(json => {
      if (localStorage.getItem('acpm4_cadastro')) return;
      for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
    }, JSON.stringify(docs));
    await page.goto('./');
    await appPronto(page);
  }

  // A barra fica no painel da lista, inteira: a busca, o filtro, "+ Novo aluno" e a contagem, nada para fora dele
  test('a barra de Alunos: a busca, o filtro, "+ Novo aluno" e a contagem, dentro do painel da lista', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await irPara(page, 'alu');
    const caixas = await page.locator('#s-alu .lista-barra').evaluate(bar => {
      const painel = bar.closest('[data-regiao="lista"]').getBoundingClientRect();
      return ['input[type="search"]', '.filtro-botao', '[data-act="adds"]', '.contagem'].map(s => {
        const r = bar.querySelector(s).getBoundingClientRect();
        return r.left >= painel.left && r.right <= painel.right + 0.5;
      });
    });
    expect(caixas).toEqual([true, true, true, true]);
    await expect(page.locator('#alu')).toHaveAttribute('role', 'list');
    await expect(page.locator('#alu')).toHaveAccessibleName('Alunos');
  });

  test('o filtro dos cursos: os ativos, o encerrado e o desconhecido marcados e "Sem curso"; aparece quem está em algum dos marcados', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9)],
      stu: [aluno(1000, {}, { nm: 'Ana', curso: 'PP' }), aluno(1001, {}, { nm: 'Bruno', curso: 'PC' }), aluno(1002, {}, { nm: 'Carla', curso: 'ZZ9' }),
        aluno(1003, {}, { nm: 'Davi' }), aluno(1004, {}, { nm: 'Elisa', curso: 'INVA' })]
    });
    await abrirComCursos(page, { estado, cursos: cursosIniciais().map(c => (c.sigla === 'PC' ? { ...c, ativo: false } : c)) });
    await irPara(page, 'alu');
    const botao = page.locator('#flt-alu-cur'), painel = page.locator('#flt-alu-cur-painel'), contagem = page.locator('#alu-contagem');
    const caixa = valor => painel.locator(`input[data-valor="${valor}"]`);
    await expect(botao).toHaveText('Todos os cursos');
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(botao).toHaveAttribute('aria-controls', 'flt-alu-cur-painel');
    await botao.click();
    await expect(painel).toBeVisible();
    await expect(painel).toHaveAccessibleName('Filtrar por curso');
    await expect(painel.locator('.filtro-regra')).toHaveText('Mostra os alunos de algum dos cursos marcados.');
    await expect(painel.locator('.filtro-regra [data-dica="filtro-dos-cursos"]')).toHaveAccessibleName('O que é Filtro dos cursos?');
    await expect(painel.locator('.filtro-regra [data-dica="filtro-dos-cursos"]')).toHaveAccessibleDescription(GLOSSARIO['filtro-dos-cursos'].texto);
    await expect(painel.locator('legend')).toHaveText(['Cursos']);
    await expect(painel.locator('label')).toHaveText(['PP · Piloto Privado', 'INVA · Instrutor de Voo', 'PC · Piloto Comercial (encerrado)', 'ZZ9 (curso desconhecido)', 'Sem curso']);
    // Cada linha diz o curso do aluno, na segunda linha
    await expect(linhaDoAluno(page, 1000).locator('.lista-l2')).toHaveText('PP');
    await expect(linhaDoAluno(page, 1003).locator('.lista-l2')).toHaveText('sem curso');

    await caixa('PP').check();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana']);
    await expect(botao).toHaveText('Curso: PP');
    await expect(botao).toHaveClass(/\bcom-marcas\b/);
    await expect(contagem).toHaveText('1 de 5 alunos');
    await caixa('PC').check();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Bruno']);
    await expect(botao).toHaveText('Curso: PP ou PC');
    await expect(contagem).toHaveText('2 de 5 alunos');
    await caixa('sem-curso').check();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Bruno', 'Davi']);
    await expect(botao).toHaveText('Curso: PP ou PC ou sem curso');
    await page.locator('[data-flt="alu"]').fill('bru');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Bruno']);
    await expect(contagem).toHaveText('1 de 5 alunos');
    await page.locator('[data-flt="alu"]').fill('');
    await painel.getByRole('button', { name: 'Limpar' }).click();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Bruno', 'Carla', 'Davi', 'Elisa']);
    await expect(botao).toHaveText('Todos os cursos');
    await expect(contagem).toHaveText('5 alunos');
    await caixa('ZZ9').check();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Carla']);
    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
    await expect(botao).toBeFocused();
    await expect(botao).toHaveText('Curso: ZZ9');
    await page.locator('[data-flt="alu"]').fill('ana');
    await nenhumNaLista(page, 'alu');
    await expect(contagem).toHaveText('0 de 5 alunos');
    await page.locator('#limpar-filtros-alu').click();
    await expect(page.locator('[data-flt="alu"]')).toHaveValue('');
    await expect(botao).toHaveText('Todos os cursos');
    await expect(painel.locator('input[data-filtro]:checked')).toHaveCount(0);
    await expect(linhasDosAlunos(page)).toHaveCount(5);
    await expect(contagem).toHaveText('5 alunos');
  });

  // As marcas duram aos redesenhos (outra data, + Novo aluno); o aluno com o curso mudado no detalhe continua à vista, até os
  // filtros mudarem. As opções acompanham os programas e os cursos dos alunos
  test('o filtro dos cursos dura aos redesenhos e acompanha os programas e o curso de cada aluno', async ({ page }) => {
    const estado = { ...cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { nm: 'Ana', curso: 'PP' }), aluno(1001, {}, { nm: 'Bruno' }), aluno(1002, {}, { nm: 'Carla', curso: 'ZZ9' })] }), nid: 1003 };
    await abrirComCursos(page, { estado });
    await irPara(page, 'alu');
    const botao = page.locator('#flt-alu-cur'), painel = page.locator('#flt-alu-cur-painel'), contagem = page.locator('#alu-contagem');
    await filtrarCursos(page, 'alu', ['PP']);
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana']);
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana']);
    await expect(botao).toHaveText('Curso: PP');
    await expect(contagem).toHaveText('1 de 3 alunos');
    await page.locator('[data-act="adds"]').click();
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Novo aluno']);
    await expect(contagem).toHaveText('2 de 4 alunos');
    // O curso mudado no detalhe: a Ana passa para o INVA e continua à vista; a linha diz o curso novo
    await abrirAluno(page, 1000);
    await campoDoAberto(page, 'curso').selectOption('INVA');
    await expect(page.locator('#audit-log-list')).toContainText('Curso de Ana: INVA');
    await expect(linhaDoAluno(page, 1000).locator('.lista-l2')).toHaveText('INVA');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Novo aluno']);
    await filtrarCursos(page, 'alu', ['PP', 'INVA']);
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana']);
    await expect(botao).toHaveText('Curso: PP ou INVA');

    const rotulos = () => painel.locator('label').allTextContents();
    await irPara(page, 'cur');
    await page.locator('#cur-novo').click();
    await page.locator('#cur-sigla').fill('MLTE');
    await page.locator('#cur-nome').fill('Multimotor');
    await page.locator('#cur-nome').press('Enter');
    await expect(page.locator('#cursos .curso[data-curso="MLTE"]')).toBeVisible();
    await irPara(page, 'alu');
    await botao.click();
    await expect.poll(rotulos).toEqual(['PP · Piloto Privado', 'PC · Piloto Comercial', 'INVA · Instrutor de Voo', 'MLTE · Multimotor', 'ZZ9 (curso desconhecido)', 'Sem curso']);
    await expect(painel.locator('input[data-filtro]:checked')).toHaveCount(2);
    await irPara(page, 'cur');
    await confirmar(page, '#cursos .curso[data-curso="MLTE"] [data-act="curso-encerrar"]');
    await expect(page.locator('#toast-box')).toContainText('MLTE encerrado');
    await irPara(page, 'alu');
    await botao.click();
    await expect.poll(rotulos).toEqual(['PP · Piloto Privado', 'PC · Piloto Comercial', 'INVA · Instrutor de Voo', 'MLTE · Multimotor (encerrado)', 'ZZ9 (curso desconhecido)', 'Sem curso']);
    await expect(botao).toHaveText('Curso: PP ou INVA');

    // O curso desconhecido marcado: o último aluno dele sai dele, e a opção some, com a marca (o filtro fica sem marcas)
    await filtrarCursos(page, 'alu', ['ZZ9'], { fechar: false });
    await expect.poll(() => nomesNaLista(page)).toEqual(['Carla']);
    await abrirAluno(page, 1002);
    await campoDoAberto(page, 'curso').selectOption('PP');
    await expect(painel.locator('input[data-valor="ZZ9"]')).toHaveCount(0);
    await expect(botao).toHaveText('Todos os cursos');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Bruno', 'Carla', 'Novo aluno']);
    await expect(contagem).toHaveText('4 alunos');
  });

  test('o filtro dos cursos é o mesmo em Alunos e na Demanda: a Demanda mostra os pedidos dos alunos marcados', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, {}, { nm: 'Ana', curso: 'PP' }), aluno(1001, {}, { nm: 'Bruno', curso: 'PC' }), aluno(1002, {}, { nm: 'Carla' })] }) });
    const pedidos = () => page.locator('#dem tr[data-k="d"]:visible').evaluateAll(linhas => linhas.map(l => l.dataset.id));
    await irPara(page, 'alu');
    await filtrarCursos(page, 'alu', ['PP']);
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana']);
    await irPara(page, 'dem');
    await expect(page.locator('#flt-dem-cur')).toHaveText('Curso: PP');
    await expect.poll(pedidos).toEqual(['1000']);
    await filtrarCursos(page, 'dem', ['PP', 'sem-curso']);
    await expect.poll(pedidos).toEqual(['1000', '1002']);
    await irPara(page, 'alu');
    await expect(page.locator('#flt-alu-cur')).toHaveText('Curso: PP ou sem curso');
    await expect(page.locator('#flt-alu-cur-painel input[data-filtro]:checked')).toHaveCount(2);
    await expect.poll(() => nomesNaLista(page)).toEqual(['Ana', 'Carla']);
    await expect(page.locator('#alu-contagem')).toHaveText('2 de 3 alunos');
    await page.locator('[data-flt="alu"]').fill('bruno');
    await page.locator('#limpar-filtros-alu').click();
    await expect(page.locator('#flt-alu-cur')).toHaveText('Todos os cursos');
    await irPara(page, 'dem');
    await expect(page.locator('#flt-dem-cur')).toHaveText('Todos os cursos');
    await expect(page.locator('#flt-dem-cur-painel input[data-filtro]:checked')).toHaveCount(0);
    await expect.poll(pedidos).toEqual(['1000', '1001', '1002']);
  });
});

test.describe('Confirmação', () => {
  test('um padrão só: "Excluir aluno…" armado fica vermelho e diz o que confirma; sem o segundo clique, volta ao que era', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    await page.clock.install({ time: AGORA });
    const total = await linhasDosAlunos(page).count();
    const excluir = page.locator('#det-alu-excluir');
    const nome = await excluir.getAttribute('aria-label');
    expect(nome).toMatch(/^Excluir /);
    await excluir.click();
    await expect(excluir).toHaveText('Confirmar exclusão');
    await expect(excluir).toHaveClass(/\barm\b/);
    await expect(excluir).toHaveAccessibleName(`Confirmar exclusão: ${nome}`);
    await page.clock.runFor(3500);
    await expect(excluir).toHaveText('Excluir aluno…');
    await expect(excluir).not.toHaveClass(/\barm\b/);
    await expect(excluir).toHaveAccessibleName(nome);
    await expect(linhasDosAlunos(page)).toHaveCount(total);
  });

  // O rodapé armado fica como está enquanto o aluno é renomeado (o segundo clique não se perde); desarmado, ele é refeito
  // com o nome novo
  test('o aluno renomeado com "Excluir aluno…" armado: depois que ele desarma, o nome lido é o novo', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    await page.clock.install({ time: AGORA });
    const excluir = page.locator('#det-alu-excluir');
    await excluir.click();
    await campoDoAberto(page, 'nm').fill('Maria Nova');
    await campoDoAberto(page, 'nm').press('Tab');
    await expect(excluir).toHaveText('Confirmar exclusão');
    await page.clock.runFor(3500);
    await page.clock.runFor(700);
    await expect(page.locator('#det-alu-excluir')).toHaveText('Excluir aluno…');
    await expect(page.locator('#det-alu-excluir')).toHaveAccessibleName('Excluir Maria Nova');
  });
});

// No celular: a lista, depois o detalhe; o filtro dos cursos cabe
test.describe('Celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('o filtro dos cursos cabe no celular (390 e 320 px), em Alunos e na Demanda: o painel empurra a lista, com alvos de 44 px', async ({ page }) => {
    await abrirComExemplo(page);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      for (const [aba, abaixoDele] of [['alu', '#alu'], ['dem', '#s-dem .tw']]) {
        await irPara(page, aba);
        await filtrarCursos(page, aba, ['PP', 'sem-curso'], { fechar: false });
        const [botao, painel, abaixo] = await Promise.all([`#flt-${aba}-cur`, `#flt-${aba}-cur-painel`, abaixoDele].map(seletor => page.locator(seletor).boundingBox()));
        expect(botao.x + botao.width, `${largura} ${aba}: o botão na tela`).toBeLessThanOrEqual(largura);
        expect(painel.x, `${largura} ${aba}: o painel na tela`).toBeGreaterThanOrEqual(0);
        expect(painel.x + painel.width, `${largura} ${aba}: o painel na tela`).toBeLessThanOrEqual(largura);
        expect(abaixo.y, `${largura} ${aba}: a lista embaixo do painel`).toBeGreaterThanOrEqual(painel.y + painel.height);
        expect(await larguraDaPagina(page), `${largura} ${aba}: a página não rola para o lado`).toBeLessThanOrEqual(largura);
        expect(await alvosPequenos(page), `${largura} ${aba}: alvos de 44 px`).toEqual([]);
        await filtrarCursos(page, aba, []);
      }
    }
  });

  // No celular (390 e 320 px): a lista, e o aluno aberto no lugar dela; o detalhe com cada rótulo em cima do valor, tudo
  // dentro da tela, sem rolar para o lado, alvos de 44 px; "‹ Alunos" devolve a lista. Quem só consulta lê o texto
  comProgresso('o aluno no celular: a lista, depois o detalhe, com os rótulos em cima dos valores (390 e 320 px)', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { nm: 'Maria Fernanda dos Santos Oliveira' }), instrutor(2, 1)],
      stu: [aluno(1000, {}, { nm: 'João Pedro de Alcântara Albuquerque', curso: 'PP', voaCom: [1], bl: [2] }), aluno(1001)]
    });
    await page.addInitScript(dados => {
      if (!localStorage.getItem('acpm4_dados_pessoais')) localStorage.setItem('acpm4_dados_pessoais', dados);
    }, JSON.stringify({ 'aluno:1000': { canac: '123456' }, 'instrutor:1': { canac: '654321' } }));
    await abrir(page, { estado });
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await irPara(page, 'alu');
      await expect(page.locator('#det-alu')).toBeHidden();
      await expect(linhaDoAluno(page, 1000).locator('.lista-l2')).toContainText('CANAC 123456 · PP');
      await abrirAluno(page, 1000);
      await expect(page.locator('#alu')).toBeHidden();
      await expect(page.locator('#det-alu-titulo')).toBeFocused();
      // Cada rótulo em cima do valor (o painel é estreito); nada para fora da tela
      const fora = await page.locator('#det-alu .det').evaluate((det, largura) => [...det.querySelectorAll('button, input, select, .tg, .det-rotulo')]
        .filter(el => el.checkVisibility()).filter(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > largura + 0.5; })
        .map(el => el.id || el.className), largura);
      expect(fora, `${largura}: fora da tela`).toEqual([]);
      await expect(campoDoAberto(page, 'kg')).toBeVisible();
      const embaixo = await page.locator('#det-alu [data-campo="kg"]').evaluate(campo => campo.querySelector('input').getBoundingClientRect().top
        >= campo.querySelector('.det-rotulo').getBoundingClientRect().bottom - 1);
      expect(embaixo, `${largura}: o peso embaixo do rótulo`).toBe(true);
      expect(await larguraDaPagina(page), `${largura}: a página`).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page), `${largura}: alvos`).toEqual([]);
      await page.locator('#det-alu-voltar').click();
      await expect(page.locator('#alu')).toBeVisible();
      await expect(linhaDoAluno(page, 1000).locator('.lista-botao')).toBeFocused();
    }
    // Quem só consulta: o texto, as etiquetas sem ✕, sem "Excluir aluno…"
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    await expect(page.locator('#det-alu [data-campo="voaCom"] .tg')).toHaveText('Maria Fernanda dos Santos Oliveira');
    await expect(page.locator('#det-alu [data-campo="bl"] .tg')).toHaveText('Instrutor 02');
    await expect(page.locator('#det-alu input, #det-alu select')).toHaveCount(0);
    await expect(page.locator('#det-alu-excluir')).toHaveCount(0);
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
  });
});

// O passo A: o detalhe do aluno com "Nesta data" (os voos dele na data aberta) e "Curso e missões". O cronograma do PP (o
// modelo do app) nas tabelas dos cursos deste navegador; a Maria (PP) voa a IN-01 na data aberta, o Aluno 1001 não voa
function programaPP() {
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  return { ...novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, uuid).curso, versao: 1 };
}
const ORDEM_DO_PP = percursoDoCurso(programaPP()).missoes.map(m => m.codigo);
async function abrirComOPP(page, { resultados = [], dados = null } = {}) {
  const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { etapa: 'IN-01', cursoDaEtapa: 'PP' }, { nm: 'Maria', curso: 'PP' }), aluno(1001, { fly: false })] });
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  const docs = {
    acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA],
    acpm4_cursos: { cursos: cursosIniciais().map(c => (c.sigla === 'PP' ? programaPP() : c)), alteracoes: [] },
    acpm4_resultados: resultados, ...(dados ? { acpm4_dados_pessoais: dados } : {})
  };
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
  }, JSON.stringify(docs));
  await page.goto('./');
  await appPronto(page);
  await irPara(page, 'alu');
  await abrirAluno(page, 1000);
}
const valorDo = (page, campo) => page.locator(`#det-alu [data-campo="${campo}"] .det-valor`);
const resultadosGuardados = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_resultados') || '[]'));

comProgresso.describe('Alunos: Nesta data e Curso e missões', () => {
  comProgresso('"Nesta data" mostra o voo com o resultado; a missão anterior e a atual acompanham o resultado registrado nele', async ({ page }) => {
    await abrirComOPP(page);
    await expect(page.locator('#sec-alu-data')).toHaveText(/^Nesta data qua 11\/11/);
    const voo = page.locator('#det-alu .voos-do-aluno > li');
    await expect(voo).toHaveCount(1);
    await expect(voo.locator('.voo-quando')).toHaveText('08:20–09:20');
    await expect(voo.locator('.voo-oque')).toHaveText(/^Voo Local · P[PR]-\w+ · Instrutor 01 · Confirmado$/);
    await expect(valorDo(page, 'missao-anterior')).toHaveText('Nenhum resultado no PP');
    await expect(valorDo(page, 'missao-atual')).toHaveText('IN-01 · IN-01');
    await expect(page.locator('#det-alu [data-campo="curso"] select')).toHaveValue('PP');
    await voo.locator('[data-resultado]').selectOption('aprovado');
    await expect(valorDo(page, 'missao-anterior')).toHaveText('IN-01 · aprovado em 11/11/2026');
    await expect(valorDo(page, 'missao-atual')).toHaveText('IN-02 · IN-02');
    await expect(page.locator('#det-alu [data-campo="progresso"] .det-valor')).toHaveText(/^1\/\d+ · Fase 1 · próxima IN-02$/);
    // O aluno sem voo na data, e sem curso: só o curso (vazio)
    await abrirAluno(page, 1001);
    await expect(page.locator('#det-alu .det-sem-voo')).toHaveText('Sem voo nesta data.');
    await expect(page.locator('#det-alu [data-campo="missao-atual"]')).toHaveCount(0);
    await expect(page.locator('#det-alu .det-forms')).toHaveCount(0);
  });

  comProgresso('"Registrar resultado sem voo": a data vai até hoje, a missão com voo nesta data é recusada e a fora da ordem pede o segundo clique', async ({ page }) => {
    await abrirComOPP(page);
    // A data aberta (amanhã) é depois de hoje: a data começa em hoje, e vai até hoje
    await expect(page.locator('#det-alu-sv-data')).toHaveValue('2026-11-10');
    await expect(page.locator('#det-alu-sv-data')).toHaveAttribute('max', '2026-11-10');
    await expect(page.locator('#det-alu-sv-missao optgroup[label="Liberadas"] option')).toHaveText(['IN-01 · IN-01']);
    // A IN-01 tem voo nesta data: registre no voo
    await page.locator('#det-alu-sv-missao').selectOption('IN-01');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#det-alu-sv-erro')).toHaveText(/^IN-01 tem voo nesta data, às 08:20 no P[PR]-\w+: registre no voo, acima\.$/);
    await expect(page.locator('#det-alu-sv-missao')).toBeFocused();
    expect(await resultadosGuardados(page)).toEqual([]);
    // A CT-01 está fora da ordem (faltam as duas primeiras): o primeiro clique arma, o segundo registra
    await page.locator('#det-alu-sv-missao').selectOption('CT-01');
    await expect(page.locator('#det-alu-sv-erro')).toHaveText('');
    await page.locator('#det-alu-sv-resultado').selectOption('reprovado');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#det-alu-sv-registrar')).toHaveText('Confirmar: CT-01 fora da ordem');
    expect(await resultadosGuardados(page)).toEqual([]);
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Resultado de Maria em CT-01 registrado: reprovado (sem voo).');
    expect((await resultadosGuardados(page)).map(r => [r.missao, r.resultado, r.data, r.voo])).toEqual([['CT-01', 'reprovado', '2026-11-10', null]]);
    await expect(valorDo(page, 'missao-anterior')).toHaveText('CT-01 · reprovado em 10/11/2026 · sem voo');
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Resultado de Maria em CT-01: reprovado (sem voo)');
  });

  // A data depois de hoje é recusada e fica no campo, com a mensagem; a data corrigida registra
  comProgresso('"Registrar resultado sem voo": a data depois de hoje fica no campo, recusada, até ser corrigida', async ({ page }) => {
    await abrirComOPP(page);
    await page.locator('#det-alu-sv-missao').selectOption('IN-02');
    await page.locator('#det-alu-sv-data').fill('2026-12-01');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#det-alu-sv-erro')).toHaveText('A data do resultado vai até hoje.');
    await expect(page.locator('#det-alu-sv-data')).toHaveValue('2026-12-01');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#det-alu-sv-erro')).toHaveText('A data do resultado vai até hoje.');
    expect(await resultadosGuardados(page)).toEqual([]);
    await page.locator('#det-alu-sv-data').fill('2026-11-09');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#det-alu-sv-registrar')).toHaveText('Confirmar: IN-02 fora da ordem');
    await page.locator('#det-alu-sv-registrar').click();
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Resultado de Maria em IN-02 registrado: aprovado (sem voo).');
    expect((await resultadosGuardados(page)).map(r => [r.missao, r.resultado, r.data])).toEqual([['IN-02', 'aprovado', '2026-11-09']]);
  });

  // A IN-01 tem voo na data aberta: o botão armado avisa; o ↶ não desfaz o resultado registrado no voo depois da
  // colocação (desfazer trocaria o resultado do voo pelo de antes dela), e diz que a missão ficou
  comProgresso('"Colocar no curso até…" avisa da missão com voo nesta data; o ↶ deixa a missão com resultado registrado depois', async ({ page }) => {
    await abrirComOPP(page);
    await page.locator('#det-alu-colocar').selectOption('CT-01');
    const botao = page.locator('#det-alu-colocar-confirmar');
    await botao.click();
    await expect(botao).toHaveText('Confirmar: aprovar 2 missões sem voo (IN-01 e IN-02); IN-01 tem voo nesta data');
    await botao.click();
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Maria colocado no curso até CT-01: 2 missões aprovadas sem voo. O voo da IN-01 nesta data continua na escala.');
    await page.locator('#det-alu .voos-do-aluno [data-resultado]').selectOption('reprovado');
    await expect(valorDo(page, 'missao-anterior')).toHaveText('IN-01 · reprovado em 11/11/2026');
    await abrirHistorico(page);
    await page.locator('#audit-log-list .audit-item', { hasText: 'Maria colocado no curso PP até CT-01' }).locator('[data-act="rev-log"]').click();
    await expect(page.locator('#toast-box .toast').last()).toHaveText('IN-01 ficou com o resultado de agora (reprovado): ele mudou depois da colocação.');
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Revertido: Maria colocado no curso PP até CT-01' })).toHaveCount(1);
    // A IN-02 voltou (pendente); a IN-01 continua reprovada no voo, e a seção diz o mesmo que a linha do voo
    const guardados = await resultadosGuardados(page);
    expect(guardados.map(r => [r.missao, r.resultado, r.voo])).toEqual([['IN-01', 'aprovado', null], ['IN-02', 'aprovado', null], ['IN-01', 'reprovado', '1000_0_1'], ['IN-02', 'pendente', null]]);
    await expect(valorDo(page, 'missao-anterior')).toHaveText('IN-01 · reprovado em 11/11/2026');
    await expect(page.locator('#det-alu .voos-do-aluno [data-resultado]')).toHaveValue('reprovado');
  });

  // Todas as missões mudaram depois da colocação: nada a desfazer, e o ↶ fica (como "Dar a vaga" com o status mudado)
  comProgresso('o ↶ da colocação com todas as missões mudadas depois não registra nada e fica no Histórico', async ({ page }) => {
    await abrirComOPP(page);
    await page.locator('#det-alu-colocar').selectOption('IN-02');
    await confirmar(page, '#det-alu-colocar-confirmar');
    await expect(page.locator('#toast-box .toast.ok')).toContainText('Maria colocado no curso até IN-02: 1 missão aprovada sem voo.');
    await page.locator('#det-alu .voos-do-aluno [data-resultado]').selectOption('reprovado');
    await abrirHistorico(page);
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Maria colocado no curso PP até IN-02' });
    await entrada.locator('[data-act="rev-log"]').click();
    await expect(page.locator('#toast-box .toast').last()).toHaveText('Nada a desfazer: IN-01 ficou com o resultado de agora (reprovado): ele mudou depois da colocação.');
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Revertido:' })).toHaveCount(0);
    await expect(entrada.locator('[data-act="rev-log"]')).toHaveCount(1);
    expect((await resultadosGuardados(page)).map(r => [r.missao, r.resultado])).toEqual([['IN-01', 'aprovado'], ['IN-01', 'reprovado']]);
  });

  comProgresso('"Colocar no curso até…": as missões antes da escolhida ficam aprovadas sem voo, e o ↶ do Histórico as devolve', async ({ page }) => {
    await abrirComOPP(page, { resultados: [{ id: 1, aluno: 1000, curso: 'PP', missao: 'IN-02', resultado: 'aprovado', data: '2026-11-09', voo: null, registrado_em: '2026-11-09T12:00:00.000Z', registrado_por: 'Operador 01' }] });
    await expect(page.locator('#det-alu-colocar optgroup')).toHaveCount(9);
    await expect(page.locator('#det-alu-colocar option[value="TSL-01"]')).toHaveCount(0);
    await page.locator('#det-alu-colocar').selectOption('NAV-01');
    const botao = page.locator('#det-alu-colocar-confirmar');
    await botao.click();
    // As 13 antes da NAV-01, menos a IN-02 já aprovada (a IN-01 tem voo na data aberta: o botão avisa)
    await expect(botao).toHaveText('Confirmar: aprovar 12 missões sem voo (IN-01 … TMA-05); IN-01 tem voo nesta data');
    await botao.click();
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Maria colocado no curso até NAV-01: 12 missões aprovadas sem voo. O voo da IN-01 nesta data continua na escala.');
    await expect(valorDo(page, 'missao-atual')).toHaveText('NAV-01 · NAV 01');
    const guardados = await resultadosGuardados(page);
    expect(guardados.slice(1).map(r => r.missao)).toEqual(ORDEM_DO_PP.slice(0, ORDEM_DO_PP.indexOf('NAV-01')).filter(c => c !== 'IN-02'));
    expect(guardados.slice(1).every(r => r.resultado === 'aprovado' && r.voo === null && r.data === '2026-11-10')).toBe(true);
    await abrirHistorico(page);
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Maria colocado no curso PP até NAV-01' });
    await expect(entrada).toContainText('12 missões aprovadas sem voo (IN-01 … TMA-05)');
    await entrada.locator('[data-act="rev-log"]').click();
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Revertido: Maria colocado no curso PP até NAV-01' })).toHaveCount(1);
    await expect(valorDo(page, 'missao-atual')).toHaveText('IN-01 · IN-01');
    // Cada missão volta ao resultado de antes (pendente); a IN-02 continua aprovada
    const depois = await resultadosGuardados(page);
    expect(depois.slice(13).map(r => r.resultado)).toEqual(Array(12).fill('pendente'));
  });

  comProgresso('o Gestor lê o curso e as missões, sem os formulários; o resultado do voo em texto', async ({ page }) => {
    await abrirComOPP(page, { resultados: [{ id: 1, aluno: 1000, curso: 'PP', missao: 'IN-01', resultado: 'aprovado', data: '2026-11-11', voo: '1000_0_1', registrado_em: '2026-11-10T12:00:00.000Z', registrado_por: 'Operador 01' }] });
    await page.locator('#role-sel').selectOption('gestor');
    await expect(valorDo(page, 'missao-anterior')).toHaveText('IN-01 · aprovado em 11/11/2026 · por Operador 01');
    await expect(page.locator('#det-alu .det-forms')).toHaveCount(0);
    await expect(page.locator('#det-alu [data-act]')).toHaveCount(0);
    await expect(page.locator('#det-alu .voos-do-aluno .res-aprovado')).toHaveText('Aprovado');
    await expect(page.locator('#det-alu [data-campo="curso"] .det-valor')).toHaveText('PP · Piloto Privado');
  });

  comProgresso('no celular (390 px), "Nesta data" e os formulários cabem, com alvos de 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirComOPP(page);
    // Depois da leitura dos dados pessoais (o detalhe redesenhado)
    await expect(page.locator('#det-alu-nome_completo')).toBeEnabled();
    for (const alvo of ['#det-alu-sv-registrar', '#det-alu-colocar-confirmar', '#det-alu-sv-missao', '#det-alu-colocar']) {
      await expect(page.locator(alvo)).toBeVisible();
      const caixa = await page.locator(alvo).boundingBox();
      expect(caixa.height, alvo).toBeGreaterThanOrEqual(44);
      expect(caixa.x + caixa.width, alvo).toBeLessThanOrEqual(390);
    }
    // O botão armado (o texto mais longo) quebra a linha e fica inteiro na tela, também em 320 px
    await page.locator('#det-alu-colocar').selectOption('NAV-01');
    const armado = page.locator('#det-alu-colocar-confirmar');
    await armado.click();
    await expect(armado).toHaveText(/^Confirmar: aprovar 13 missões sem voo \(IN-01 … TMA-05\); IN-01 tem voo nesta data$/);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 844 });
      const caixa = await armado.boundingBox();
      expect(caixa.x, `${largura}`).toBeGreaterThanOrEqual(0);
      expect(caixa.x + caixa.width, `${largura}`).toBeLessThanOrEqual(largura);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
    }
  });
});

test.describe('Alunos: Curso e missões com o progresso desligado', () => {
  test('só o curso matriculado; "Nesta data" mostra o código da missão do curso, sem o resultado', async ({ page }) => {
    await abrirComOPP(page);
    await expect(page.locator('#sec-alu-curso')).toContainText('Curso e missões');
    await expect(page.locator('#det-alu [data-campo]')).toHaveText([/^Curso matriculado/, /^Nome \(na escala\)/, /^Peso/, /^Só voa no/, /^Pode voar/, /^Priorizar com/, /^Não escalar com/]);
    await expect(page.locator('#det-alu .det-secao')).toHaveText([/^Nesta data/, /^Curso e missões/, /^Cadastro/, /^Limitações/, /^Dados pessoais/]);
    await expect(page.locator('#det-alu [data-pessoa] .det-campo label')).toHaveText(['Nome completo', 'CPF', 'CANAC', 'Nascimento', 'Celular', 'E-mail']);
    await expect(page.locator('#det-alu .det-forms')).toHaveCount(0);
    await expect(page.locator('#det-alu .voos-do-aluno .etapa')).toHaveText('IN-01');
    await expect(page.locator('#det-alu .voos-do-aluno [data-resultado]')).toHaveCount(0);
  });
});

test.describe('Alunos: o nome completo e "Apagar os dados pessoais"', () => {
  test('a busca acha o nome completo e o CANAC de quem vê os dados pessoais; o Gestor, só o nome', async ({ page }) => {
    await abrirComOPP(page, { dados: { 'aluno:1001': { nome_completo: 'Bruno Carvalho Lima', canac: '654321', atualizado_em: '2026-11-09T12:00:00.000Z' } } });
    const busca = page.locator('[data-flt="alu"]');
    await busca.fill('carvalho lima');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Aluno 1001']);
    await busca.fill('654321');
    await expect.poll(() => nomesNaLista(page)).toEqual(['Aluno 1001']);
    await busca.fill('');
    await page.locator('#role-sel').selectOption('gestor');
    await busca.fill('carvalho');
    await nenhumNaLista(page, 'alu');
    await expect(page.locator('#s-alu')).not.toContainText('Carvalho');
  });

  test('do aluno inativo, "Apagar os dados pessoais" (dois cliques) tira os dados e deixa o aluno no cadastro', async ({ page }) => {
    await abrirComOPP(page, { dados: { 'aluno:1001': { nome_completo: 'Bruno Carvalho Lima', canac: '654321', atualizado_em: '2026-11-09T12:00:00.000Z' } } });
    await abrirAluno(page, 1001);
    await expect(page.locator('#det-alu-apagar-dados')).toHaveCount(0);
    await linhaDoAluno(page, 1001).locator('[data-act="ativo"]').click();
    await expect(page.locator('#det-alu-apagar-dados')).toHaveText('Apagar os dados pessoais');
    await confirmar(page, '#det-alu-apagar-dados');
    await expect(page.locator('#toast-box .toast.ok').last()).toHaveText('Dados pessoais de Aluno 1001 apagados.');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_dados_pessoais') || '{}'))).toEqual({});
    await expect(linhaDoAluno(page, 1001)).toHaveCount(1);
    await expect(page.locator('#det-alu-apagar-dados')).toHaveCount(0);
    // O botão saiu com os dados: o foco fica no rodapé, em "Excluir aluno…"
    await expect(page.locator('#det-alu-excluir')).toBeFocused();
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Dados pessoais de Aluno 1001 atualizados: Nome completo, CANAC');
    await expect(page.locator('#historico')).not.toContainText('Carvalho');
  });
});

// O ↶ da colocação que falha no meio (modo compartilhado): o que voltou fica, a entrada não vira "Revertido" e o ↶ continua;
// a nova tentativa devolve só o que faltou
comProgresso.describe('Alunos: o ↶ da colocação que falha no meio', () => {
  comProgresso('a entrada fica com o ↶, e a nova tentativa termina', async ({ browser }) => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }, { nm: 'Maria', curso: 'PP' })] });
    const servidor = criarSupabaseFalso({ ...documentosAtuais(estado, AMANHA), cursos: cursosIniciais().map(c => (c.sigla === 'PP' ? programaPP() : c)) });
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(context);
    await servidor.instalar(context);
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await entrar(page, CONTAS.operador);
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    await page.locator('#det-alu-colocar').selectOption('CT-02');
    await confirmar(page, '#det-alu-colocar-confirmar');
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Maria colocado no curso até CT-02: 3 missões aprovadas sem voo.');
    // O segundo registro da reversão falha
    let chamadas = 0;
    await page.route(/rpc\/registrar_resultado/, rota => (++chamadas === 2 ? rota.fulfill({ status: 400, contentType: 'application/json', body: '{"code":"XX000","message":"falha"}' }) : rota.fallback()));
    await abrirHistorico(page);
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Maria colocado no curso PP até CT-02' });
    await entrada.locator('[data-act="rev-log"]').click();
    await expect(page.locator('#toast-box .toast').last()).toHaveText('Não foi possível desfazer tudo: 1 de 3 missões voltaram. Verifique a conexão e tente de novo.');
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Revertido:' })).toHaveCount(0);
    await expect(entrada.locator('[data-act="rev-log"]')).toHaveCount(1);
    // A nova tentativa devolve as duas que faltaram (a que já voltou não é registrada de novo)
    await entrada.locator('[data-act="rev-log"]').click();
    await expect(page.locator('#audit-log-list .audit-item', { hasText: 'Revertido: Maria colocado no curso PP até CT-02' })).toHaveCount(1);
    expect(servidor.resultados.map(r => [r.missao, r.resultado])).toEqual([
      ['IN-01', 'aprovado'], ['IN-02', 'aprovado'], ['CT-01', 'aprovado'], ['IN-01', 'pendente'], ['IN-02', 'pendente'], ['CT-01', 'pendente']
    ]);
    expect(erros.filter(e => !e.includes('400'))).toEqual([]);
    await context.close();
  });
});

// L (N9): as limitações do aluno, duras para o motor, na seção "Limitações" do detalhe: "Só voa no" (os tipos de avião ou de
// simulador), "Pode voar" (os horários, [de, ate), em todas as datas ou nos dias marcados), "Priorizar com" e "Não escalar
// com" (como o F1h os deixou) e a linha do peso (sem nenhum número). Cada mudança é gravada ao mudar o campo, com uma entrada
// do Histórico que reverte (setLimitacoes)
test.describe('As limitações do aluno', () => {
  const dia = (extra = {}) => ({ ...cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 500, p2: -1 }, { nm: 'Ana', ...extra })] }), nid: 1001 });
  const guardadas = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).stu.find(s => s.id === 1000).limitacoes ?? null);
  const erroDosHorarios = page => page.locator('#det-alu-limHorarios-erro');

  test('"Só voa no" e "Pode voar": gravados ao mudar; o Até antes do De e o último dia não valem; o Histórico reverte; a Escala recusa o pedido no outro tipo', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    await expect(page.locator('#det-alu .det-secao')).toHaveText([/^Nesta data/, /^Curso e missões/, /^Cadastro/, /^Limitações/, /^Dados pessoais/]);
    await expect(page.locator('#sec-alu-limitacoes-corpo [data-campo]')).toHaveText([/^Só voa no/, /^Pode voar/, /^Priorizar com/, /^Não escalar com/]);
    await expect(page.locator('#sec-alu-cadastro-corpo [data-campo]')).toHaveText([/^Nome \(na escala\)/, /^Peso/]);
    await expect(page.locator('#det-alu [data-campo="limHorarios"]')).toContainText('Em qualquer horário.');
    // "Só voa no": o C172
    await campoDoAberto(page, 'limRecurso').selectOption('C172');
    await expect(etiquetasDoAberto(page, 'limRecursos')).toHaveText([/^C172/]);
    await expect(campoDoAberto(page, 'limRecurso')).toBeFocused();
    await expect.poll(() => guardadas(page)).toEqual({ recursos: ['C172'] });
    await expect(page.locator('#sec-alu-limitacoes')).toContainText('só no C172');
    // A Escala: o pedido no C152 é recusado, com o motivo
    await abrirEscala(page);
    await expect(page.locator('#s-esc [data-caixa="erros"] li', { hasText: 'Ana' })).toHaveText('Ana Rejeitado: o aluno só voa no C172 (o pedido está no C152).');
    // "Pode voar": "+ Horário" põe um das 06:00 à meia-noite, em todas as datas, e o foco no De dele
    await irPara(page, 'alu');
    await page.locator('#det-alu-lim-mais').click();
    await expect(page.locator('#det-alu-lim-de-0')).toBeFocused();
    await expect(page.locator('#det-alu-lim-de-0')).toHaveValue('360');
    await expect(page.locator('#det-alu-lim-ate-0')).toHaveValue('1440');
    for (const d of [1, 2, 3, 4, 5, 6]) await expect(page.locator(`#det-alu-lim-dia-0-${d}`)).toBeChecked();
    await page.locator('#det-alu-lim-de-0').selectOption('780');
    await expect(page.locator('#det-alu-lim-de-0')).toBeFocused();
    await page.locator('#det-alu-lim-ate-0').selectOption('1080');
    await page.locator('#det-alu-lim-dia-0-6').uncheck();
    await expect(page.locator('#det-alu-lim-dia-0-6')).toBeFocused();
    await expect.poll(() => guardadas(page)).toEqual({ recursos: ['C172'], horarios: [{ de: 780, ate: 1080, dias: [1, 2, 3, 4, 5] }] });
    await expect(page.locator('#sec-alu-limitacoes')).toContainText('só no C172; 13:00–18:00 (seg, ter, qua, qui, sex)');
    // O Até antes do De não vale: a mensagem, ligada ao campo, e nada muda
    await page.locator('#det-alu-lim-de-0').selectOption('1100');
    await expect(erroDosHorarios(page)).toHaveText('O horário precisa terminar depois de começar (o Até depois do De).');
    await expect(page.locator('#det-alu-lim-de-0')).toHaveValue('780');
    await expect(page.locator('#det-alu-lim-de-0')).toHaveAttribute('aria-invalid', 'true');
    // Os dias: o último não sai
    for (const d of [1, 2, 3, 4]) await page.locator(`#det-alu-lim-dia-0-${d}`).uncheck();
    await expect(erroDosHorarios(page)).toHaveText('');
    // (um clique: o uncheck do Playwright espera a caixa desmarcada, e ela volta marcada)
    await page.locator('#det-alu-lim-dia-0-5').click();
    await expect(erroDosHorarios(page)).toHaveText('Marque ao menos um dia: com todos marcados, o horário vale em todas as datas.');
    await expect(page.locator('#det-alu-lim-dia-0-5')).toBeChecked();
    await expect.poll(() => guardadas(page)).toEqual({ recursos: ['C172'], horarios: [{ de: 780, ate: 1080, dias: [5] }] });
    // O Histórico: uma entrada por mudança; o ↶ da última devolve a de antes
    await abrirHistorico(page);
    await expect(entradasDoHistorico(page, 'Limitações de Ana:')).toHaveCount(9);
    await expect(entradasDoHistorico(page, 'Limitações de Ana:').first()).toContainText('Limitações de Ana: só no C172; 13:00–18:00 (sex)');
    await entradasDoHistorico(page, 'Limitações de Ana:').first().locator('[data-act="rev-log"]').click();
    await expect(entradasDoHistorico(page, 'Revertido: limitações de Ana: só no C172; 13:00–18:00 (qui, sex)')).toHaveCount(1);
    await expect.poll(() => guardadas(page)).toEqual({ recursos: ['C172'], horarios: [{ de: 780, ate: 1080, dias: [4, 5] }] });
    await page.locator('#btn-fechar-historico').click();
    // O ✕ do horário e o da etiqueta: sem nenhuma, o campo sai do cadastro
    await page.locator('#det-alu-lim-tirar-0').click();
    await expect(page.locator('#det-alu-lim-mais')).toBeFocused();
    await page.locator('#det-alu [data-act="unlr"][data-t="C172"]').click();
    await expect(campoDoAberto(page, 'limRecurso')).toBeFocused();
    await expect.poll(() => guardadas(page)).toBe(null);
    await expect(page.locator('#det-alu [data-campo="limHorarios"]')).toContainText('Em qualquer horário.');
  });

  test('a linha do peso diz em que avião nenhum INVA cabe, sem nenhum número; quem só consulta lê as limitações como texto', async ({ page }) => {
    const estado = dia({ kg: 130, limitacoes: { recursos: ['C172', 'Sim. Multi'], horarios: [{ de: 780, ate: 1080, dias: [1, 3] }, { de: 420, ate: 540 }] } });
    estado.ins = [instrutor(1, 9, { kg: 95 }), instrutor(2, 9, { kg: 90 })];
    await abrir(page, { estado });
    await irPara(page, 'alu');
    await abrirAluno(page, 1000);
    const peso = page.locator('#det-alu [data-campo="limPeso"]');
    await expect(peso).toHaveText(/^Peso nos aviões\s*Com o peso do aluno, nenhum INVA ativo habilitado cabe no C152\.$/);
    await expect(etiquetasDoAberto(page, 'limRecursos')).toHaveText([/^C172/, /^Sim\. Multi/]);
    // Os horários na ordem do começo
    await expect(page.locator('#det-alu-lim-de-0')).toHaveValue('420');
    await expect(page.locator('#det-alu-lim-de-1')).toHaveValue('780');
    await expect(page.locator('#det-alu-lim-dia-1-2')).not.toBeChecked();
    await page.locator('#role-sel').selectOption('gestor');
    await expect(page.locator('#det-alu [data-campo="limRecursos"] .det-valor')).toHaveText('C172, Sim. Multi');
    await expect(page.locator('#det-alu [data-campo="limHorarios"] .det-valor')).toHaveText('07:00–09:00; 13:00–18:00 (seg, qua)');
    await expect(page.locator('#sec-alu-limitacoes-corpo select, #sec-alu-limitacoes-corpo input, #sec-alu-limitacoes-corpo [data-act]')).toHaveCount(0);
    await expect(peso).toContainText('nenhum INVA ativo habilitado cabe no C152');
  });

  for (const largura of [390, 320]) {
    test(`no celular (${largura} px): "Pode voar" cabe na tela, com 44 px para o dedo`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await abrir(page, { estado: dia({ limitacoes: { recursos: ['C172'], horarios: [{ de: 780, ate: 1080, dias: [1, 3] }] } }) });
      await irPara(page, 'alu');
      await abrirAluno(page, 1000);
      await page.locator('#sec-alu-limitacoes').scrollIntoViewIfNeeded();
      const fora = await page.locator('#det-alu .det').evaluate((det, l) => [...det.querySelectorAll('button, input, select, label, .tg')]
        .filter(el => el.checkVisibility()).filter(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > l + 0.5; })
        .map(el => el.id || el.className), largura);
      expect(fora).toEqual([]);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page)).toEqual([]);
    });
  }
});

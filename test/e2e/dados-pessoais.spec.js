// Dados pessoais de alunos e instrutores: CPF, CANAC, nascimento, celular e e-mail, num painel ao lado da tabela.
// Ficam fora do cadastro; o histórico registra só os campos que mudaram. No modo compartilhado, operadores,
// administradores e a secretaria veem e editam; o gestor não vê.
import { test, expect, abrir, irPara, irParaVista, prepararContexto, vigiarErros, filtrarHabilitacoes, filtrarCursos, AMANHA, entrar as entrarNoApp, abrirHistorico, rotulosDasAbas, gradeDoDia, linhaDoInstrutor } from './fixtures.js';
import { criarSupabaseFalso, instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const estado = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000), aluno(1001)] });
const painel = page => page.locator('#painel-dados');
const campo = (page, rotulo) => painel(page).getByLabel(rotulo, { exact: true });
const salvar = page => painel(page).getByRole('button', { name: 'Salvar' }).click();

async function abrirDadosDoAluno(page, id) {
  await irPara(page, 'alu');
  await page.locator(`#alu tr[data-id="${id}"] [data-dados]`).click();
  await expect(painel(page)).toBeVisible();
}

test.describe('Dados pessoais (neste navegador)', () => {
  test('Alunos: o painel valida e salva; a tabela mostra o CANAC; o histórico registra só os campos', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'alu');
    await expect(page.locator('#s-alu thead th')).toHaveText(['Nome', 'CANAC', 'Peso (kg)', 'Curso', 'Priorizar com', 'Não escalar com', '']);
    await abrirDadosDoAluno(page, 1000);
    await expect(painel(page).locator('h2')).toHaveText('Dados pessoais Aluno 1000');
    await campo(page, 'CPF').fill('529.982.247-24');
    await campo(page, 'CANAC').fill('12345');
    await salvar(page);
    await expect(painel(page).locator('[data-erro="cpf"]')).toHaveText('CPF inválido.');
    await expect(painel(page).locator('[data-erro="canac"]')).toHaveText('O CANAC tem 6 dígitos.');
    await expect(painel(page)).toBeVisible();

    await campo(page, 'CPF').fill('529.982.247-25');
    await campo(page, 'CANAC').fill('123456');
    await campo(page, 'Celular').fill('37991234567');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    await expect(page.locator('#toast-box .toast.ok')).toHaveText('Dados pessoais de Aluno 1000 salvos.');
    await expect(page.locator('#alu tr[data-id="1000"] .c-canac')).toHaveText('123456');

    // De novo: os dados vêm formatados
    await page.locator('#alu tr[data-id="1000"] [data-dados]').click();
    await expect(campo(page, 'CPF')).toHaveValue('529.982.247-25');
    await expect(campo(page, 'Celular')).toHaveValue('(37) 99123-4567');
    await page.keyboard.press('Escape');
    await expect(painel(page)).toBeHidden();
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Dados pessoais de Aluno 1000 atualizados: CPF, CANAC, Celular');
    await expect(page.locator('#historico')).not.toContainText('529');
  });

  test('o CPF ou o CANAC de outro aluno é recusado; deixar tudo vazio apaga os dados', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirDadosDoAluno(page, 1000);
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    await abrirDadosDoAluno(page, 1001);
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page).locator('[data-erro="canac"]')).toHaveText('CANAC já cadastrado para outro aluno.');
    await painel(page).getByRole('button', { name: 'Cancelar' }).click();

    await abrirDadosDoAluno(page, 1000);
    await campo(page, 'CANAC').fill('');
    await salvar(page);
    await expect(page.locator('#alu tr[data-id="1000"] .c-canac')).toHaveText('');
  });

  test('Instrutores: os mesmos dados pessoais, no cadastro dos instrutores', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await expect(page.locator('#s-ins table:has(#inst) thead th')).toHaveText(['Nome', 'CANAC', 'Peso (kg)', 'Habilitações', '']);
    await page.locator('#inst tr[data-id="2"] [data-dados]').click();
    await expect(painel(page).locator('h2')).toHaveText('Dados pessoais Instrutor 02');
    await campo(page, 'CANAC').fill('654321');
    await campo(page, 'E-mail').fill('instrutor@exemplo.com');
    await salvar(page);
    await expect(page.locator('#inst tr[data-id="2"] .c-canac')).toHaveText('654321');
  });

  test('ficam fora do cadastro; no perfil Gestor não aparecem', async ({ page }) => {
    await abrir(page, { estado: estado() });
    await abrirDadosDoAluno(page, 1000);
    await campo(page, 'CPF').fill('52998224725');
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    const guardado = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'acpm4_dados_pessoais').map(k => localStorage.getItem(k)).join('|'));
    expect(guardado).not.toContain('52998224725');
    expect(guardado).not.toContain('123456');

    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'alu');
    await expect(page.locator('#alu [data-dados]').first()).toBeHidden();
    await expect(page.locator('#s-alu thead th', { hasText: 'CANAC' })).toBeHidden();
  });
});

test.describe('Dados pessoais (modo compartilhado)', () => {
  // Cada conta no seu navegador; com servidor, os navegadores dividem o mesmo servidor. viewport: a tela (o celular)
  async function entrar(browser, conta, servidorComum = null, { viewport } = {}) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...(viewport ? { viewport } : {}) });
    await prepararContexto(context);
    const servidor = servidorComum || await instalarSupabaseFalso(context, documentosAtuais(estado(), AMANHA));
    if (servidorComum) await servidorComum.instalar(context);
    const page = await context.newPage();
    const erros = vigiarErros(page);
    await entrarNoApp(page, conta);
    return { context, servidor, page, erros };
  }

  test('a Secretaria vê Alunos e Instrutores e edita só os dados pessoais', async ({ browser }) => {
    const { context, servidor, page, erros } = await entrar(browser, CONTAS.secretaria);
    await expect(rotulosDasAbas(page, { visiveis: true })).toHaveText(['Agenda', 'Escala', 'Aprovar', 'Alunos', 'Instrutores', 'Cursos']);
    await irPara(page, 'alu');
    // Sem a Demanda, também sem o link para ela; o filtro dos cursos vale para ela (as caixas não ficam desligadas)
    await expect(page.locator('#s-alu .ir-para-demanda')).toBeHidden();
    await page.locator('#flt-alu-cur').click();
    await expect(page.locator('#flt-alu-cur-painel input[data-filtro]:disabled')).toHaveCount(0);
    await filtrarCursos(page, 'alu', ['PP']);
    await expect(page.locator('#alu tr.sem-resultado')).toBeVisible();
    await filtrarCursos(page, 'alu', ['sem-curso']);
    await expect(page.locator('#alu tr.cd:visible')).toHaveCount(2);
    await filtrarCursos(page, 'alu', []);
    await expect(page.locator('#alu tr[data-id="1000"] [data-f="kg"]')).toBeDisabled();
    await page.locator('#alu tr[data-id="1000"] [data-dados]').click();
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    await expect(page.locator('#alu tr[data-id="1000"] .c-canac')).toHaveText('123456');
    expect(servidor.dadosPessoais.get('aluno:1000')).toMatchObject({ canac: '123456', atualizado_por: 'Secretaria de Teste' });
    expect(erros).toEqual([]);
    await context.close();
  });

  // No celular (390 px), o trabalho da Secretaria em Instrutores e Alunos fica no cartão de cada pessoa: a parte dos
  // botões aparece para ela (só com o "Dados pessoais", dentro do cartão e com 44 px para o dedo; para o Gestor, ela some),
  // e "Priorizar com" e "Não escalar com" sem ninguém não aparecem. O toque abre o painel, e o Esc devolve o foco ao botão
  test('no celular, o cartão de cada pessoa tem o "Dados pessoais" da Secretaria, em Instrutores e em Alunos', async ({ browser }) => {
    const { context, page, erros } = await entrar(browser, CONTAS.secretaria, null, { viewport: { width: 390, height: 844 } });
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vista', 'cadastro');
    for (const [aba, corpo, id, nome] of [['ins', 'inst', 1, 'Instrutor 01'], ['alu', 'alu', 1000, 'Aluno 1000']]) {
      await irPara(page, aba);
      const linha = page.locator(`#${corpo} tr.cd[data-id="${id}"]`);
      await expect(linha.locator('td.acoes')).toBeVisible();
      const botoes = linha.locator('td.acoes button:visible');
      await expect(botoes).toHaveText(['Dados pessoais']);
      const [cartao, botao] = await Promise.all([linha.boundingBox(), botoes.first().boundingBox()]);
      expect(botao.height, nome).toBeGreaterThanOrEqual(44);
      expect(botao.x >= cartao.x && botao.x + botao.width <= cartao.x + cartao.width, `${nome}: o botão dentro do cartão`).toBe(true);
      if (corpo === 'alu') {
        await expect(linha.locator('td.c-voa-com, td.c-nao-escalar')).toHaveCount(2);
        await expect(linha.locator('td.c-voa-com:visible, td.c-nao-escalar:visible')).toHaveCount(0);
      }
      await botoes.first().click();
      await expect(painel(page).locator('h2')).toHaveText(`Dados pessoais ${nome}`);
      await page.keyboard.press('Escape');
      await expect(painel(page)).toBeHidden();
      await expect(botoes.first()).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(erros).toEqual([]);
    await context.close();
  });

  // A vista de cada aba fica na memória até a página recarregar; antes de a pessoa escolher, vale a do perfil: a Secretaria
  // abre Instrutores no Cadastro (o trabalho dela ali são os dados pessoais), o Operador na Disponibilidade do dia
  test('Instrutores abre no Cadastro para a Secretaria e na Disponibilidade do dia para o Operador; a vista escolhida fica até recarregar', async ({ browser }) => {
    const secretaria = await entrar(browser, CONTAS.secretaria);
    const page = secretaria.page;
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vista', 'cadastro');
    await expect(page.locator('#s-ins [data-vista-ins="cadastro"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#s-ins [data-vista-ins="dia"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#inst tr[data-id="1"] [data-dados]')).toBeVisible();
    await expect(gradeDoDia(page)).toBeHidden();
    // Ela busca, filtra pelas habilitações (as caixas não ficam desligadas para quem só consulta) e usa o "Limpar
    // filtros" (sem data-act: vale também para quem só consulta)
    const busca = page.locator('[data-flt="inst"]');
    await busca.fill('instrutor 02');
    await expect(page.locator('#inst .cd:visible')).toHaveCount(1);
    await busca.fill('');
    await page.locator('#flt-ins-hab').click();
    await expect(page.locator('#flt-ins-hab-painel input[data-filtro]:disabled')).toHaveCount(0);
    await filtrarHabilitacoes(page, ['noturno', 'c172']);
    await expect(page.locator('#inst .cd:visible')).toHaveCount(2);
    await expect(page.locator('#ins-contagem')).toHaveText('2 de 2 instrutores');
    await filtrarHabilitacoes(page, ['noturno', 'checa_pp']);
    await expect(page.locator('#inst tr.sem-resultado')).toBeVisible();
    await page.locator('#limpar-filtros-inst').click();
    await expect(busca).toHaveValue('');
    await expect(page.locator('#flt-ins-hab')).toHaveText('Todas as habilitações');
    await expect(page.locator('#inst .cd:visible')).toHaveCount(2);
    // A vista escolhida fica ao voltar à aba
    await irParaVista(page, 'ins', 'dia');
    await irPara(page, 'alu');
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vista', 'dia');
    await expect(linhaDoInstrutor(page, '1')).toBeVisible();
    // Recarregada a página, vale de novo a do perfil
    await page.reload();
    await expect(page.locator('body[data-pronto]')).toBeAttached();
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vista', 'cadastro');
    expect(secretaria.erros).toEqual([]);
    await secretaria.context.close();

    const operador = await entrar(browser, CONTAS.operador);
    await irPara(operador.page, 'ins');
    await expect(operador.page.locator('#s-ins')).toHaveAttribute('data-vista', 'dia');
    await expect(operador.page.locator('#s-ins [data-vista-ins="dia"]')).toHaveAttribute('aria-pressed', 'true');
    expect(operador.erros).toEqual([]);
    await operador.context.close();
  });

  test('o operador grava pelo servidor; o gestor não vê os dados pessoais', async ({ browser }) => {
    const operador = await entrar(browser, CONTAS.operador);
    await abrirDadosDoAluno(operador.page, 1001);
    await campo(operador.page, 'E-mail').fill('bia@exemplo.com');
    await salvar(operador.page);
    await expect(painel(operador.page)).toBeHidden();
    expect(operador.servidor.dadosPessoais.get('aluno:1001')).toMatchObject({ email: 'bia@exemplo.com' });
    await operador.context.close();

    const gestor = await entrar(browser, CONTAS.gestor);
    await irPara(gestor.page, 'alu');
    await expect(gestor.page.locator('#alu [data-dados]').first()).toBeHidden();
    await expect(gestor.page.locator('#s-alu thead th', { hasText: 'CANAC' })).toBeHidden();
    expect(gestor.erros).toEqual([]);
    await gestor.context.close();
  });

  test('duas pessoas editam a mesma pessoa: a segunda é avisada e não apaga o que a primeira gravou', async ({ browser }) => {
    const servidor = criarSupabaseFalso(documentosAtuais(estado(), AMANHA));
    const a = await entrar(browser, CONTAS.operador, servidor);
    const b = await entrar(browser, CONTAS.administrador, servidor);
    await abrirDadosDoAluno(a.page, 1000);
    await abrirDadosDoAluno(b.page, 1000);
    await campo(a.page, 'CANAC').fill('123456');
    await salvar(a.page);
    await expect(painel(a.page)).toBeHidden();

    await campo(b.page, 'Celular').fill('37991234567');
    await salvar(b.page);
    await expect(painel(b.page).locator('#dados-erro')).toHaveText('Outra pessoa alterou estes dados enquanto você editava. Feche e abra de novo para ver a versão atual.');
    expect(servidor.dadosPessoais.get('aluno:1000')).toMatchObject({ canac: '123456' });
    expect(servidor.dadosPessoais.get('aluno:1000').celular).toBeUndefined();
    // Abrindo de novo, vem o que a outra pessoa gravou
    await painel(b.page).getByRole('button', { name: 'Cancelar' }).click();
    await abrirDadosDoAluno(b.page, 1000);
    await expect(campo(b.page, 'CANAC')).toHaveValue('123456');
    for (const x of [a, b]) { expect(x.erros.filter(e => !e.includes('409'))).toEqual([]); await x.context.close(); }
  });

  test('o painel lê a pessoa ao abrir; sem resposta, não deixa salvar', async ({ browser }) => {
    const { context, servidor, page, erros } = await entrar(browser, CONTAS.operador);
    // Outra pessoa grava depois do login: o painel mostra o que está no servidor
    servidor.dadosPessoais.set('aluno:1001', { canac: '777777', atualizado_em: '2026-11-10T13:00:00.000Z', atualizado_por: 'Operador 01' });
    await abrirDadosDoAluno(page, 1001);
    await expect(campo(page, 'CANAC')).toHaveValue('777777');
    await painel(page).getByRole('button', { name: 'Cancelar' }).click();

    servidor.falhar('/rest/v1/dados_pessoais', 20);
    await abrirDadosDoAluno(page, 1000);
    // (o supabase-js tenta a leitura de novo algumas vezes antes de desistir)
    await expect(painel(page).locator('#dados-erro')).toHaveText('Não foi possível ler os dados pessoais. Feche e tente de novo.', { timeout: 20000 });
    await expect(campo(page, 'CPF')).toBeDisabled();
    await expect(painel(page).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(erros.filter(e => !e.includes('503'))).toEqual([]);
    await context.close();
  });

  test('a alteração da secretaria vai para o histórico (só os nomes dos campos)', async ({ browser }) => {
    const { context, servidor, page, erros } = await entrar(browser, CONTAS.secretaria);
    await abrirDadosDoAluno(page, 1000);
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    expect(servidor.historico.map(h => [h.data, h.descricao, h.autor])).toContainEqual([AMANHA, 'Dados pessoais de Aluno 1000 atualizados: CANAC', 'Secretaria de Teste']);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('excluir um aluno apaga os dados pessoais dele', async ({ browser }) => {
    const { context, servidor, page, erros } = await entrar(browser, CONTAS.operador);
    await abrirDadosDoAluno(page, 1001);
    await campo(page, 'CANAC').fill('123456');
    await salvar(page);
    await expect(painel(page)).toBeHidden();
    expect(servidor.dadosPessoais.has('aluno:1001')).toBe(true);
    const excluir = page.locator('#alu tr[data-id="1001"] [data-act="dels"]');
    await excluir.click();
    await excluir.click();
    await expect.poll(() => servidor.dadosPessoais.has('aluno:1001')).toBe(false);
    expect(erros).toEqual([]);
    await context.close();
  });
});

import { test, expect, abrir, abrirSintetico, abrirComExemplo, irPara, abrirEscala, lerEscala, AGORA } from './fixtures.js';
import { aluno, apenas, cenario, instrutor } from '../helpers/montar.js';

test.describe('Recursos', () => {
  test('estado inicial: 9 janelas, 26 recursos, nenhum instrutor e nenhum aluno', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#wins input[data-a="win"]')).toHaveCount(9);
    await expect(page.locator('#wins label').last()).toHaveText('17:30 noturno');
    await expect(page.locator('#eqs input[data-a="av"]')).toHaveCount(26);
    await expect(page.locator('#eqs tr.grupo')).toHaveText([/^C152/, /^C172/, /^PA-34/, /^Simuladores/]);
    await expect(page.locator('#eqs tr[data-r="PR-JPL"]')).toContainText('Só Parafuso');
    await expect(page.locator('#inst .cd')).toHaveCount(0);
    await expect(page.locator('#inst')).toContainText('Nenhum instrutor cadastrado');
    await irPara(page, 'alu');
    await expect(page.locator('#alu')).toContainText('Nenhum aluno cadastrado');
  });

  test('aeronave em manutenção fica registrada no histórico e persiste', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const linha = page.locator('#eqs tr[data-r="PR-BTB"]');
    await linha.locator('input[data-a="av"]').uncheck();
    await expect(linha).toHaveClass(/\bmanutencao\b/);
    await expect(linha).toContainText('Em manutenção');
    await expect(page.locator('#log-cnt')).toHaveText('1');
    await expect(page.locator('#audit-log-list')).toContainText('PR-BTB: Manutenção');
    await page.reload();
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).not.toBeChecked();
    await expect(page.locator('#log-cnt')).toHaveText('1');
  });

  test('uma tabela da frota: as horas disponíveis até a revisão de 50 horas e o que o avião voa no dia', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { p1: 1, p2: 1 })], semAeronaves: apenas('C152', 'PP-LJV'), horas: { 'PP-LJV': 42 } }) });
    await irPara(page, 'rec');
    const linha = page.locator('#eqs tr[data-r="PP-LJV"]');
    await expect(linha.locator('input[data-a="horas"]')).toHaveValue('8');
    await expect(linha.locator('.barra')).toHaveClass(/\bwa\b/);
    await expect(linha).toContainText('1 h na escala · termina com 7 h disponíveis');
    await expect(page.locator('#eqs tr.grupo').first()).toContainText('1 de 13 disponíveis');
    await expect(page.locator('#eqs tr[data-r="SIM-MONO-A"] input[data-a="horas"]')).toHaveCount(0);
  });

  test('desativa uma janela de operação', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const janela = page.locator('#wins label').nth(3);
    await janela.locator('input').uncheck();
    await expect(janela).toHaveClass(/\boff\b/);
    await expect(page.locator('#audit-log-list')).toContainText('Janela 11:30 inativa');
  });
});

test.describe('Recursos: acrescentar e retirar', () => {
  test('acrescenta um C152: aparece na categoria, disponível, entra na escala e fica gravado', async ({ page }) => {
    // Todos os C152 em manutenção: o voo só entra com o avião novo
    await abrir(page, { estado: cenario({ stu: [aluno(1000)], semAeronaves: apenas('C152') }) });
    await irPara(page, 'rec');
    await expect(page.locator('#form-recurso')).toBeHidden();
    await page.locator('#btn-novo-recurso').click();
    await page.locator('#rec-reg').fill('pr-new');
    await page.locator('#rec-tipo').selectOption('C152');
    await page.locator('#form-recurso [type="submit"]').click();
    const linha = page.locator('#revisao tr[data-r="PR-NEW"]');
    await expect(linha).toBeVisible();
    await expect(linha.locator('[data-a="av"]')).toBeChecked();
    await expect(page.locator('#revisao tr.grupo', { hasText: 'C152' })).toContainText('1 de 14 disponíveis');
    await expect(page.locator('#toast-box .toast.ok')).toContainText('PR-NEW');
    await expect(page.locator('#form-recurso')).toBeHidden();
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.some(l => l.includes('PR-NEW'))).toBe(true);

    await page.reload();
    await irPara(page, 'rec');
    await expect(page.locator('#revisao tr[data-r="PR-NEW"]')).toBeVisible();
  });

  test('não aceita matrícula repetida nem sem categoria; "Só Parafuso" só no C152', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    await page.locator('#btn-novo-recurso').click();
    await page.locator('#rec-reg').fill('PP-LJV');
    await page.locator('#rec-tipo').selectOption('C152');
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(page.locator('#rec-erro')).toHaveText('Já existe um recurso com a matrícula PP-LJV.');
    // O campo do erro fica marcado (e só ele), com o motivo como descrição
    await expect(page.locator('#rec-reg')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rec-reg')).toHaveAccessibleDescription('Já existe um recurso com a matrícula PP-LJV.');
    await expect(page.locator('#rec-tipo')).not.toHaveAttribute('aria-invalid');
    await page.locator('#rec-reg').fill('PR-ZZZ');
    await page.locator('#rec-tipo').selectOption('');
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(page.locator('#rec-erro')).toHaveText('Escolha a categoria.');
    await expect(page.locator('#rec-tipo')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rec-reg')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('#rec-parafuso')).toBeHidden();
    await page.locator('#rec-tipo').selectOption('C152');
    await expect(page.locator('#rec-parafuso')).toBeVisible();
    await page.locator('#rec-parafuso').check();
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(page.locator('#frota [data-r="PR-ZZZ"]')).toContainText('Só Parafuso');
  });

  test('retira um recurso com confirmação; o histórico desfaz', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const retirar = page.locator('#frota [data-r="PT-KIW"] [data-act="retirar-recurso"]');
    await retirar.click();
    await expect(retirar).toHaveText('Confirmar retirada');
    await retirar.click();
    await expect(page.locator('#frota [data-r="PT-KIW"]')).toHaveCount(0);
    await expect(page.locator('#revisao tr[data-r="PT-KIW"]')).toHaveCount(0);
    await expect(page.locator('#revisao tr.grupo', { hasText: 'PA-34' })).toContainText('2 de 2 disponíveis');
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#audit-log-list')).toContainText('Recurso retirado: PT-KIW (PA-34)');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await expect(page.locator('#revisao tr[data-r="PT-KIW"]')).toHaveCount(1);
    await expect(page.locator('#frota [data-r="PT-KIW"]')).toHaveCount(1);
  });

  test('o Gestor não acrescenta nem retira recursos', async ({ page }) => {
    await abrirSintetico(page);
    await page.locator('#role-sel').selectOption('gestor');
    await irPara(page, 'rec');
    await expect(page.locator('#btn-novo-recurso')).toBeHidden();
    await expect(page.locator('#frota [data-act="retirar-recurso"]').first()).toBeHidden();
  });

  test('Recursos em duas partes: nesta data (janelas, disponibilidade e horas, hangar) e para todas as datas (horários e frota)', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const nestaData = page.locator('#s-rec .rec-parte[data-parte="data"]');
    const todas = page.locator('#s-rec .rec-parte[data-parte="todas"]');
    await expect(nestaData.locator('h3').first()).toContainText('Nesta data');
    await expect(todas.locator('h3').first()).toContainText('Vale para todas as datas');
    for (const id of ['#wins', '#eqs', '#hangar']) await expect(nestaData.locator(id)).toHaveCount(1);
    for (const id of ['#horarios', '#frota', '#btn-novo-recurso']) await expect(todas.locator(id)).toHaveCount(1);
    // A frota: cada recurso uma vez, por categoria; o Retirar fica só nela
    await expect(page.locator('#frota [data-r]')).toHaveCount(26);
    await expect(page.locator('#frota .grupo h5')).toHaveText([/^C152/, /^C172/, /^PA-34/, /^Simuladores/]);
    await expect(page.locator('#revisao [data-act="retirar-recurso"]')).toHaveCount(0);
  });
});

// Cada categoria mostra um resumo; um botão abre o editor da lista
test.describe('Recursos: horários de decolagem por categoria', () => {
  const editor = page => page.locator('#horarios .horarios-editor');

  test('o resumo: o modelo, quantos horários e os horários da manhã e da tarde; o da janela fechada fica apagado', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await irPara(page, 'rec');
    const c152 = page.locator('#horarios [data-cat="C152"]');
    await expect(c152.locator('.horarios-modelo')).toHaveText('Janelas do dia');
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');
    await expect(c152.locator('[data-periodo="manha"] .hr')).toHaveText(['06:30', '08:20', '10:10', '11:30']);
    await expect(c152.locator('[data-periodo="tarde"] .hr')).toHaveText(['12:40', '13:40', '14:30', '16:20']);
    const pa34 = page.locator('#horarios [data-cat="PA-34"]');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('De 30 em 30 min, 06:30–16:30');
    await expect(pa34.locator('.horarios-qtd')).toHaveText('21 horários');
    // No resumo, só um botão por categoria (C152, C172, simuladores e PA-34)
    await expect(page.locator('#horarios .horarios-cat')).toHaveCount(4);
    await expect(page.locator('#horarios button')).toHaveCount(4);
    await expect(page.locator('#horarios .horarios-editor')).toHaveCount(0);

    // A janela das 10:10 fechada nesta data: o horário dela fica apagado, e a dica diz por quê
    await page.locator('#wins input[data-a="win"][data-i="2"]').uncheck();
    await expect(c152.locator('.hr.fechado')).toHaveText(['10:10 (janela fechada nesta data)']);
    await expect(c152.locator('.hr.fechado')).toHaveAttribute('data-dica', 'horario-em-janela-fechada');
  });

  test('editar: tirar, pôr com Enter, o efeito antes de salvar; Salvar muda a escala, e o histórico desfaz a lista e os pedidos', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34', p1: 450, p2: -1 })] }) });
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:30/);
    await irPara(page, 'rec');
    const pa34 = page.locator('#horarios [data-cat="PA-34"]');
    const editar = pa34.locator('[data-act="editar-horarios"]');
    await editar.click();
    await expect(editar).toHaveAttribute('aria-expanded', 'true');
    await expect(editor(page)).toBeVisible();
    await expect(editor(page).locator('.hr-novo')).toBeFocused();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(21);
    await expect(editor(page).locator('.horarios-efeito')).toHaveText('Nenhum pedido muda.');

    await editor(page).locator('[data-act="rascunho-tirar"][data-min="450"]').click();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(20);
    await expect(editor(page).locator('.horarios-efeito')).toHaveText('1 pedido muda de preferência.');
    await editor(page).locator('.hr-novo').fill('17:00');
    await editor(page).locator('.hr-novo').press('Enter');
    await expect(editor(page).locator('[role="alert"]')).toHaveText('Escolha um horário entre 06:00 e 16:30.');
    await editor(page).locator('.hr-novo').fill('07:45');
    await editor(page).locator('.hr-novo').press('Enter');
    await expect(editor(page).locator('.hr-chip', { hasText: '07:45' })).toHaveCount(1);
    await expect(editor(page).locator('[role="alert"]')).toHaveText('');
    // Nada muda antes de salvar
    await expect(pa34.locator('.horarios-modelo')).toHaveCount(0);
    await editor(page).locator('[data-act="salvar-horarios"]').click();
    await expect(editor(page)).toHaveCount(0);
    await expect(editar).toBeFocused();
    await expect(pa34.locator('.horarios-qtd')).toHaveText('21 horários');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('06:30, 07:00, 07:45, 08:00–16:30 de 30 em 30 min');
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:45/);

    // Uma entrada no histórico; Reverter volta a lista e a preferência do pedido
    await page.locator('#btn-open-log').click();
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Horários de decolagem do PA-34' });
    await expect(entrada).toHaveCount(1);
    await entrada.locator('[data-act="rev-log"]').click();
    await page.keyboard.press('Escape');
    await irPara(page, 'rec');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('De 30 em 30 min, 06:30–16:30');
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:30/);
  });

  test('os modelos; Cancelar descarta; não tira o último horário; o Gestor não edita', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const c152 = page.locator('#horarios [data-cat="C152"]');
    await c152.locator('[data-act="editar-horarios"]').click();
    await editor(page).getByLabel('De 30 em 30 min').check();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(21);
    await editor(page).locator('[data-act="cancelar-horarios"]').click();
    await expect(c152.locator('.horarios-modelo')).toHaveText('Janelas do dia');
    await expect(c152.locator('[data-act="editar-horarios"]')).toBeFocused();

    await c152.locator('[data-act="editar-horarios"]').click();
    for (let i = 0; i < 7; i++) await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await expect(editor(page).getByLabel('Personalizado')).toBeChecked();
    await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(1);
    await expect(editor(page).locator('[role="alert"]')).toHaveText('Cada categoria precisa de pelo menos um horário.');
    // O erro não é do campo do horário novo: ele não fica marcado como inválido
    await expect(editor(page).locator('.hr-novo')).toHaveAttribute('aria-invalid', 'false');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');

    await page.locator('#role-sel').selectOption('gestor');
    await expect(page.locator('#horarios [data-act="editar-horarios"]').first()).toBeHidden();
  });
});

test.describe('Recursos: o editor dos horários pelo teclado e no leitor de tela', () => {
  test('as setas no modelo mantêm o foco; o efeito e o erro continuam no mesmo lugar e o erro fica ligado ao campo', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    await page.locator('#horarios [data-cat="C152"] [data-act="editar-horarios"]').click();
    const editor = page.locator('#horarios .horarios-editor');
    await editor.getByLabel('Janelas do dia').focus();
    await page.keyboard.press('ArrowRight');
    await expect(editor.getByLabel('De 30 em 30 min')).toBeFocused();
    await expect(editor.getByLabel('De 30 em 30 min')).toBeChecked();
    await expect(editor.locator('.hr-chip')).toHaveCount(21);

    // O efeito é uma região viva: o mesmo elemento recebe o texto novo (um elemento novo não seria anunciado)
    await editor.locator('.horarios-efeito').evaluate(el => { el.dataset.marca = '1'; });
    await page.keyboard.press('ArrowLeft');
    await expect(editor.getByLabel('Janelas do dia')).toBeFocused();
    await expect(editor.locator('.horarios-efeito[data-marca="1"]')).toHaveText('Nenhum pedido muda.');

    const campo = editor.locator('.hr-novo');
    const erro = editor.locator('[role="alert"]');
    await erro.evaluate(el => { el.dataset.marca = '1'; });
    await campo.fill('17:00');
    await campo.press('Enter');
    await expect(editor.locator('[role="alert"][data-marca="1"]')).toHaveText('Escolha um horário entre 06:00 e 16:30.');
    await expect(campo).toBeFocused();
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAttribute('aria-describedby', new RegExp(`\\b${await erro.getAttribute('id')}\\b`));
    // O mesmo erro de novo também é anunciado: o alerta é escrito outra vez
    const escritas = await erro.evaluate(el => {
      window.__escritasNoAlerta = 0;
      new MutationObserver(m => { window.__escritasNoAlerta += m.length; }).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await campo.press('Enter');
    await expect(erro).toHaveText('Escolha um horário entre 06:00 e 16:30.');
    await expect.poll(() => page.evaluate(() => window.__escritasNoAlerta)).toBeGreaterThan(0);
    expect(escritas).toBeUndefined();
    await campo.fill('07:15');
    await campo.press('Enter');
    await expect(campo).toHaveAttribute('aria-invalid', 'false');
    await expect(campo).toHaveValue('');
    await expect(erro).toHaveText('');
    // Vazio, o alerta continua na árvore de acessibilidade (escondido, não seria anunciado quando aparecer), sem ocupar
    // espaço: entre o campo e o efeito fica só o espaço normal do editor
    expect(await erro.evaluate(el => getComputedStyle(el).display)).not.toBe('none');
    const espaco = await editor.evaluate(ed => {
      const campo = ed.querySelector('.horarios-novo').getBoundingClientRect();
      const efeito = ed.querySelector('.horarios-efeito').getBoundingClientRect();
      return { entre: efeito.top - campo.bottom, normal: parseFloat(getComputedStyle(ed).rowGap) };
    });
    expect(Math.abs(espaco.entre - espaco.normal)).toBeLessThan(1);

    // Um horário digitado (sem pôr) continua no campo quando a aba é redesenhada por outra alteração
    await campo.fill('09:15');
    await page.locator('#wins input[data-a="win"][data-i="1"]').uncheck();
    await expect(editor.locator('.hr-novo')).toHaveValue('09:15');
    // e não passa para o editor de outra categoria
    await page.locator('#horarios [data-cat="PA-34"] [data-act="editar-horarios"]').click();
    await expect(page.locator('#horarios [data-cat="PA-34"] .hr-novo')).toHaveValue('');
    await page.locator('#horarios [data-cat="PA-34"] [data-act="cancelar-horarios"]').click();
    await page.locator('#horarios [data-cat="C152"] [data-act="editar-horarios"]').click();

    // O ✕ de um horário leva o foco para o horário seguinte (tirar vários em sequência). O editor reaberto começa da
    // lista salva: o 07:15 do rascunho anterior não está nela
    await editor.locator('[data-act="rascunho-tirar"][data-min="390"]').focus();
    await page.keyboard.press('Enter');
    await expect(editor.locator('[data-act="rascunho-tirar"][data-min="500"]')).toBeFocused();
  });
});

test.describe('Recursos: horários de decolagem no celular', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('o editor ocupa a largura e a página não rola de lado', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    await page.locator('#horarios [data-cat="PA-34"] [data-act="editar-horarios"]').click();
    const caixa = await page.locator('#horarios .horarios-editor').boundingBox();
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

test.describe('Recursos: categoria e grupos recolhíveis', () => {
  test('a categoria mostra só a frota dela; cada categoria recolhe e abre, e continua assim quando a escala é refeita', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'rec');
    const categoria = page.locator('#flt-rec-cat');
    const linhasVisiveis = page.locator('#revisao tr[data-r]:visible');
    await expect(categoria.locator('option')).toHaveText(['Todos', 'C152', 'C172', 'Simulador', 'PA-34']);
    await expect(linhasVisiveis).toHaveCount(26);

    await categoria.selectOption({ label: 'PA-34' });
    await expect(linhasVisiveis).toHaveCount(3);
    await expect(page.locator('#revisao tr.grupo:visible')).toHaveText([/^PA-34/]);
    await categoria.selectOption({ label: 'Simulador' });
    await expect(linhasVisiveis).toHaveCount(4);
    await categoria.selectOption({ label: 'Todos' });
    await expect(linhasVisiveis).toHaveCount(26);

    const grupoC152 = () => page.locator('#revisao tr.grupo', { hasText: 'C152' }).locator('button');
    await expect(grupoC152()).toHaveAttribute('aria-expanded', 'true');
    await grupoC152().click();
    await expect(grupoC152()).toHaveAttribute('aria-expanded', 'false');
    await expect(linhasVisiveis).toHaveCount(13);
    await page.locator('#eqs input[data-id="PR-VOM"]').uncheck();
    await expect(grupoC152()).toHaveAttribute('aria-expanded', 'false');
    await expect(linhasVisiveis).toHaveCount(13);
    await grupoC152().click();
    await expect(linhasVisiveis).toHaveCount(26);
  });
});

test.describe('Instrutores', () => {
  test('filtra por nome e por habilitação, nas duas visões', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    const dia = page.locator('#inst-dia tr[data-k="i"]:visible');
    await page.locator('[data-flt="inst"]').fill('instrutor 1');
    await expect(dia).toHaveCount(10);
    await page.locator('[data-flt="inst"]').fill('');
    await page.locator('#flt-ins-hab').selectOption('mlte');
    await expect(dia).toHaveCount(4);
    await expect(dia.first()).toContainText('Instrutor 09');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await expect(page.locator('#inst .cd:visible')).toHaveCount(4);
    await expect(page.locator('#inst .cd:visible .nm').first()).toHaveValue('Instrutor 09');
  });

  test('disponibilidade do dia: a grade mostra as janelas e os voos de cada instrutor', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const linhasDaEscala = (await lerEscala(page)).linhas;
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins [data-vista-ins="dia"]')).toHaveClass(/\bon\b/);
    // A grade bate com a escala: o número de voos e aulas do instrutor (a turma de Ground conta uma vez)
    const comVoos = page.locator('#inst-dia tr[data-k="i"]').filter({ has: page.locator('.voos:not(:empty)') }).first();
    const id = await comVoos.getAttribute('data-id');
    const nome = (await comVoos.locator('.nome').innerText()).trim();
    await expect(comVoos.locator('.voos')).toHaveText(String(linhasDaEscala.filter(l => l.includes(`| ${nome} |`)).length));
    expect(await comVoos.locator('.cel.voo').count()).toBeGreaterThanOrEqual(1);
    const celula = () => page.locator(`#inst-dia tr[data-k="i"][data-id="${id}"] .cel`).nth(7);
    await comVoos.locator('[data-f="aw"][data-w="7"]').uncheck();
    await expect(celula()).not.toHaveClass(/\bon\b/);
    // Pelo teclado: a grade é refeita e o foco continua na mesma janela
    await page.locator(`#inst-dia tr[data-id="${id}"] [data-f="aw"][data-w="7"]`).focus();
    await page.keyboard.press('Space');
    await expect(celula()).toHaveClass(/\bon\b/);
    await expect(page.locator(`#inst-dia tr[data-id="${id}"] [data-f="aw"][data-w="7"]`)).toBeFocused();
  });

  test('o checador por partes: o curso, o motor e as regras; o cheque vai para quem tem as três', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { hab: ['local', 'c152', 'checa_pp', 'checa_mnte'] }), instrutor(2, 9, { hab: ['local', 'c152'] })],
      stu: [aluno(1000, { mis: 'Cheque PP', eq: 'C152' })]
    });
    await abrir(page, { estado });
    await irPara(page, 'ins');
    // Na grade do dia, as marcas de checador contam como uma
    await expect(page.locator('#inst-dia tr[data-k="i"][data-id="1"] .habs-resumo')).toHaveText('Checador · Local');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    const linha = page.locator('#inst .cd[data-id="1"]');
    await linha.locator('[data-act="editar-habs"]').click();
    const painel = page.locator('#painel-instrutor');
    const grupo = nome => painel.locator('fieldset', { has: page.locator('legend', { hasText: nome }) }).locator('label');
    await expect(grupo('Checador: curso')).toHaveText(['Checador do curso PP', 'Checador do curso PC', 'Checador do curso INVA']);
    await expect(grupo('Checador: motor')).toHaveText(['Checador MNTE', 'Checador MLTE']);
    await expect(grupo('Checador: regras')).toHaveText(['Checador VFR', 'Checador IFR']);
    await expect(painel.locator('.dica-btn[data-dica="checador"]')).toHaveCount(1);
    // Sem as regras (VFR), o instrutor ainda não dá o Cheque PP
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'))).toHaveLength(0);
    await irPara(page, 'ins');
    await painel.locator('[data-f="hab"][data-h="checa_vfr"]').check();
    await expect(linha).toHaveAttribute('data-hab', 'local c152 checa_pp checa_mnte checa_vfr');
    await page.locator('#btn-fechar-painel-instrutor').click();
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos).toHaveLength(1);
    expect(voos[0]).toContain('| Instrutor 01 |');
  });

  test('cadastra instrutor e altera habilitações (no painel), peso e turno', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await page.locator('[data-act="addi"]').click();
    // O instrutor novo aparece no cadastro, com o peso em destaque enquanto falta
    await expect(page.locator('#s-ins [data-vista-ins="cadastro"]')).toHaveClass(/\bon\b/);
    const linha = page.locator('#inst .cd').last();
    await expect(page.locator('#inst .cd')).toHaveCount(41);
    await expect(linha.locator('.nm')).toHaveValue('Novo instrutor');
    await expect(linha).toHaveAttribute('data-hab', 'grounds ground_pa34 local c152');
    await expect(linha.locator('[data-f="kg"]')).toHaveClass(/\bfalta\b/);

    await linha.locator('[data-act="editar-habs"]').click();
    const painel = page.locator('#painel-instrutor');
    await expect(painel).toBeVisible();
    await expect(painel.locator('h2')).toContainText('Novo instrutor');
    await expect(painel.locator('fieldset', { hasText: 'Aviões' }).locator('label')).toHaveText(['C152', 'C172', 'MLTE (PA-34)']);
    await expect(painel.locator('[data-f="hab"][data-h="c152"]')).toBeChecked();
    await painel.locator('[data-f="hab"][data-h="c172"]').check();
    await painel.locator('[data-f="hab"][data-h="local"]').uncheck();
    await expect(page.locator('#inst .cd').last()).toHaveAttribute('data-hab', 'grounds ground_pa34 c152 c172');
    await page.locator('#btn-fechar-painel-instrutor').click();
    await expect(painel).toBeHidden();

    await page.locator('#inst .cd').last().locator('[data-f="kg"]').fill('80');
    await page.locator('#inst .cd').last().locator('[data-f="kg"]').blur();
    await expect(page.locator('#inst .cd').last().locator('[data-f="kg"]')).not.toHaveClass(/\bfalta\b/);

    await page.locator('#s-ins [data-vista-ins="dia"]').click();
    await page.locator('#inst-dia tr[data-k="i"]').last().locator('[data-f="pre"]').selectOption('Manhã');
    const janelas = page.locator('#inst-dia tr[data-k="i"]').last().locator('[data-f="aw"]');
    await expect(janelas).toHaveCount(9);
    for (let i = 0; i < 9; i++) {
      if (i < 4) await expect(janelas.nth(i)).toBeChecked();
      else await expect(janelas.nth(i)).not.toBeChecked();
    }
    await expect(page.locator('#audit-log-list')).toContainText('Peso Novo instrutor: 80 kg');
    await expect(page.locator('#audit-log-list')).toContainText('Habilitação incluída: Novo instrutor · C172');
    await expect(page.locator('#audit-log-list')).toContainText('Habilitação retirada: Novo instrutor · Voo Local');
  });

  test('as habilitações não são cumulativas e valem na escala', async ({ page }) => {
    // Instrutor 01 é de C172 e não dá simulador; o Instrutor 02 só dá simulador (Mono)
    const estado = cenario({
      ins: [instrutor(1, 9, { hab: ['local', 'noturno', 'c172'] }), instrutor(2, 1, { hab: ['sim_mono'] })],
      stu: [aluno(1000, { mis: 'Simulador', eq: 'Sim. Mono' })]
    });
    await abrir(page, { estado });
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos).toHaveLength(1);
    expect(voos[0]).toContain('| Instrutor 02 |');

    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await page.locator('#inst .cd[data-id="2"] [data-act="editar-habs"]').click();
    await page.locator('#painel-instrutor [data-f="hab"][data-h="sim_mono"]').uncheck();
    await irPara(page, 'esc');
    await expect(page.locator('#out')).toContainText('nenhum instrutor ativo tem a habilitação de Simulador no Sim. Mono (Simulador (Mono))');
  });

  test('instrutor indisponível pode ser revertido pelo histórico', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await page.locator('#inst-dia tr[data-k="i"]').first().locator('[data-f="on"]').uncheck();
    await expect(page.locator('#inst-dia tr[data-k="i"]').first()).toHaveClass(/\boff\b/);
    await page.locator('#btn-open-log').click();
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await irPara(page, 'ins');
    await expect(page.locator('#inst-dia tr[data-k="i"]').first()).not.toHaveClass(/\boff\b/);
  });
});

test.describe('Alunos', () => {
  test('cadastra, bloqueia instrutor e exclui aluno com confirmação', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'alu');
    await expect(page.locator('#s-alu thead th')).toHaveText(['Nome', 'CANAC', 'Curso', 'Peso (kg)', 'Priorizar com', 'Não escalar com', '']);
    await page.locator('[data-act="adds"]').click();
    const linha = page.locator('#alu .cd');
    await expect(linha).toHaveCount(1);
    await expect(linha.locator('.nm')).toHaveValue('Novo aluno');
    await expect(linha.locator('[data-f="kg"]')).toHaveClass(/\bfalta\b/);

    const naoEscalar = linha.locator('[data-f="bl"]');
    await expect(naoEscalar.locator('option').first()).toHaveText('Não escalar com…');
    await naoEscalar.selectOption({ label: 'Instrutor 03' });
    await expect(page.locator('#alu .cd .tg')).toHaveText(/Instrutor 03/);
    // O foco continua no campo, para bloquear outro em seguida
    await expect(page.locator('#alu .cd [data-f="bl"]')).toBeFocused();
    await page.locator('#alu .cd [data-act="unbl"]').click();
    await expect(page.locator('#alu .cd .tg')).toHaveCount(0);

    await irPara(page, 'dem');
    await expect(page.locator('#dem tr[data-k="d"]')).toHaveCount(1);

    await irPara(page, 'alu');
    const excluir = page.locator('#alu .cd [data-act="dels"]');
    await excluir.click();
    await expect(excluir).toHaveText('Confirmar');
    await excluir.click();
    await expect(page.locator('#alu')).toContainText('Nenhum aluno cadastrado');
  });

  test('o nome tem até 80 caracteres, nos alunos e nos instrutores', async ({ page }) => {
    await abrirSintetico(page);
    const longo = 'Maria '.repeat(20);
    for (const [aba, botao, lista] of [['alu', 'adds', '#alu'], ['ins', 'addi', '#inst']]) {
      await irPara(page, aba);
      await page.locator(`[data-act="${botao}"]`).click();
      const nome = page.locator(`${lista} .cd`).last().locator('.nm');
      await expect(nome).toHaveAttribute('maxlength', '80');
      await nome.fill(longo);
      await nome.blur();
      await expect(page.locator(`${lista} .cd`).last().locator('.nm')).toHaveValue(longo.slice(0, 80).trim());
    }
  });

  test('o peso vai até 300 kg, nos alunos e nos instrutores: acima disso, não vale', async ({ page }) => {
    await abrirSintetico(page);
    const historico = page.locator('#audit-log-list');
    const aviso = page.locator('.toast');
    for (const [aba, botao, lista, nome] of [['alu', 'adds', '#alu', 'Novo aluno'], ['ins', 'addi', '#inst', 'Novo instrutor']]) {
      await irPara(page, aba);
      await page.locator(`[data-act="${botao}"]`).click();
      const peso = page.locator(`${lista} .cd`).last().locator('[data-f="kg"]');
      // O campo vai de 1 a 300 kg, como o aviso: as setas não chegam a 0, que não vale
      await expect(peso).toHaveAttribute('min', '1');
      await expect(peso).toHaveAttribute('max', '300');
      // Acima do limite de antes (200 kg), vale
      await peso.fill('250');
      await peso.blur();
      await expect(historico).toContainText(`Peso ${nome}: 250 kg`);
      await expect(peso).not.toHaveClass(/\bfalta\b/);
      // Acima de 300 kg, não: o aviso aparece e o campo volta ao peso de antes. Cada recusa espera o aviso da anterior
      // sair, para conferir o dela
      await expect(aviso).toHaveCount(0);
      await peso.fill('350');
      await peso.blur();
      await expect(aviso).toHaveText('O peso vai de 1 a 300 kg.');
      await expect(peso).toHaveValue('250');
      // Um texto que não é número também não vale: o campo (type=number) chega vazio, mas o peso não some
      await expect(aviso).toHaveCount(0);
      await peso.fill('');
      await peso.pressSequentially('1-2');
      await peso.blur();
      await expect(aviso).toHaveText('O peso vai de 1 a 300 kg.');
      await expect(peso).toHaveValue('250');
      await expect(peso).not.toHaveClass(/\bfalta\b/);
      // Em décimos: o histórico mostra a vírgula. As recusas não entraram nele
      await peso.fill('72.5');
      await peso.blur();
      await expect(historico).toContainText(`Peso ${nome}: 72,5 kg`);
      await expect(historico).not.toContainText(`Peso ${nome}: 350`);
      await expect(historico).not.toContainText(`Peso ${nome}: 0 kg`);
    }
    // O peso digitado fica gravado; vazio, a pessoa fica sem peso
    await page.reload();
    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await expect(page.locator('#inst .cd').last().locator('[data-f="kg"]')).toHaveValue('72.5');
    await irPara(page, 'alu');
    const peso = page.locator('#alu .cd').last().locator('[data-f="kg"]');
    await expect(peso).toHaveValue('72.5');
    await peso.fill('');
    await peso.blur();
    await expect(peso).toHaveClass(/\bfalta\b/);
    await expect(peso).toHaveValue('');
  });

  test('busca alunos pelo nome', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'alu');
    for (let i = 0; i < 3; i++) await page.locator('[data-act="adds"]').click();
    await page.locator('#alu .cd').nth(1).locator('.nm').fill('Carla');
    await page.locator('#alu .cd').nth(1).locator('.nm').blur();
    await page.locator('[data-flt="alu"]').fill('carla');
    await expect(page.locator('#alu .cd:visible')).toHaveCount(1);
  });
});

test.describe('Confirmação', () => {
  test('um padrão só: o ✕ armado fica vermelho e diz o que confirma; sem o segundo clique, volta ao que era', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    await page.clock.install({ time: AGORA });
    const alunos = page.locator('#alu .cd');
    const total = await alunos.count();
    const excluir = page.locator('#alu .cd [data-act="dels"]').first();
    const nome = await excluir.getAttribute('aria-label');
    expect(nome).toMatch(/^Excluir /);
    await excluir.click();
    await expect(excluir).toHaveText('Confirmar');
    await expect(excluir).toHaveClass(/\barm\b/);
    await expect(excluir).toHaveAccessibleName(`Confirmar: ${nome}`);
    await page.clock.runFor(3500);
    await expect(excluir).toHaveText('✕');
    await expect(excluir).not.toHaveClass(/\barm\b/);
    await expect(excluir).toHaveAccessibleName(nome);
    await expect(alunos).toHaveCount(total);
  });

  test('o aluno renomeado com o ✕ armado: depois que ele desarma, o nome lido é o novo', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'alu');
    await page.clock.install({ time: AGORA });
    const linha = page.locator('#alu .cd').first();
    const excluir = linha.locator('[data-act="dels"]');
    await excluir.click();
    await linha.locator('.nm').fill('Maria Nova');
    await linha.locator('.nm').press('Tab');
    await expect(excluir).toHaveAccessibleName('Excluir Maria Nova');
    await page.clock.runFor(3500);
    await expect(excluir).toHaveText('✕');
    await expect(excluir).toHaveAccessibleName('Excluir Maria Nova');
  });
});

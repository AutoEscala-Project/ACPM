import { test, expect, abrir, abrirSintetico, abrirComExemplo, irPara, abrirEscala, lerEscala, confirmar, AMANHA } from './fixtures.js';
import { aluno, cenario, instrutor, missaoExtra } from '../helpers/montar.js';

const linhaDoAluno = (page, nome) => page.locator(`#dem tr[data-k="d"][data-mid="0"][data-nm="${nome.toLowerCase()}"]`);

test.describe('Demanda', () => {
  test('os horários do pedido são os da categoria: o PA-34 de 30 em 30 minutos; trocar de avião ajusta as preferências', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34', p1: 450, p2: 510 })] }) });
    await irPara(page, 'dem');
    const linha = page.locator('#dem tr[data-k="d"][data-id="1000"]');
    await expect(linha.locator('[data-f="p1"] option[value="420"]')).toHaveText('07:00');
    await expect(linha.locator('[data-f="p1"] option:checked')).toHaveText('07:30');
    await expect(linha.locator('[data-f="jan"] option[value="h450"]')).toHaveText('Só às 07:30');
    await linha.locator('[data-f="mis"]').selectOption('Voo Local');
    await linha.locator('[data-f="eq"]').selectOption('C152');
    const nova = page.locator('#dem tr[data-k="d"][data-id="1000"]');
    await expect(nova.locator('[data-f="p1"] option:checked')).toHaveText('08:20');
    await expect(nova.locator('[data-f="p1"] option[value="450"]')).toHaveCount(0);
  });

  test('"Pôr um aluno na demanda" inclui quem ainda não voa (com "Só quem voa" ligado)', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    const fora = page.locator('#dem tr[data-k="d"][data-mid="0"].off').first();
    const nome = await fora.getAttribute('data-nm');
    await expect(fora).toBeHidden();
    await expect(page.locator(`#alunos-fora option[value="${nome.replace(/^a/, 'A')}"]`)).toHaveCount(1);

    await page.locator('#incluir-aluno').fill(nome);
    await page.locator('#incluir-aluno').press('Enter');
    const linha = page.locator(`#dem tr[data-k="d"][data-mid="0"][data-nm="${nome}"]`);
    await expect(linha).toHaveClass(/\bon\b/);
    await expect(linha).toBeVisible();
    await expect(page.locator('#incluir-aluno')).toHaveValue('');
    await expect(page.locator('#audit-log-list')).toContainText(`${nome.replace(/^a/, 'A')} incluído na demanda`);
  });

  test('10 colunas que cabem na tela (sem Sessões); "Limpar demanda" fica no menu Mais', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    await expect(page.locator('#s-dem thead th')).toHaveText(['Aluno', 'Voa', 'Missão', 'Recurso', 'Instrutor', '1ª preferência', '2ª preferência', 'Disponibilidade', 'Duração', 'Prioridade']);
    await expect(page.locator('#dem [data-f="ss"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('#s-dem .tw').scrollWidth <= document.querySelector('#s-dem .tw').clientWidth)).toBe(true);
    await expect(page.locator('#clr')).toBeHidden();
    await page.locator('#btn-mais-dem').click();
    await expect(page.locator('#clr')).toBeVisible();
    await page.locator('#clr').click();
    await expect(page.locator('#clr')).toHaveText('Confirmar limpeza');
    await page.locator('#clr').click();
    await expect(page.locator('#dem tr[data-k="d"].on')).toHaveCount(0);
  });

  // O pedido limpo fica em branco, sem nada do voo de antes (como o pedido que a agenda reaproveita): a disponibilidade, a
  // missão do curso, o pedido da agenda e o instrutor escolhido
  test('"Limpar demanda" deixa o pedido sem nada do voo de antes: o Voa religado e o pedido da agenda da mesma missão não trazem o antigo', async ({ page }) => {
    const antes = { p1: 390, p2: -1, jan: 'manha', solicitacao: 7, etapa: 'PP-01', insId: 1 };
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, antes, { curso: 'PP' })] }) });
    await irPara(page, 'dem');
    await page.locator('#btn-mais-dem').click();
    await page.locator('#clr').click();
    await page.locator('#clr').click();
    await expect(page.locator('#dem tr[data-k="d"].on')).toHaveCount(0);
    const guardado = () => page.evaluate(data => JSON.parse(localStorage.getItem(`acpm4_dia_${data}`)).pedidos[1000], AMANHA);
    await expect.poll(async () => Object.keys(await guardado()).filter(c => ['jan', 'etapa', 'solicitacao', 'insId'].includes(c))).toEqual([]);

    // O Voa religado à mão: qualquer horário, no automático
    await page.locator('#onlyfly').uncheck();
    const linha = page.locator('#dem tr[data-k="d"][data-id="1000"][data-mid="0"]');
    await linha.locator('[data-f="fly"]').check();
    await expect(linha.locator('[data-f="jan"]')).toHaveValue('');
    await expect(linha.locator('[data-f="insId"]')).toHaveValue('');

    // O pedido da agenda para a mesma missão (Voo Local) toma este voo, em vez de virar um segundo
    await irPara(page, 'age');
    await page.locator('#ag-aluno').selectOption({ label: 'Aluno 1000' });
    await page.locator('#ag-missao').selectOption('Voo Local');
    await page.locator('#ag-horario').selectOption('10:10');
    await page.locator('#ag-por').fill('Maria');
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(page.locator('#agenda-lista tbody tr')).toHaveCount(1);
    await irPara(page, 'dem');
    await page.locator('#importar-agenda').click();
    await expect(page.locator('#dem tr[data-k="d"][data-id="1000"]')).toHaveCount(1);
    await expect(linha.locator('[data-f="jan"]')).toHaveValue('h610');
  });

  // A limpeza também solta os voos que limpa, seja qual for o motivo do cadeado (a escala aprovada, o instrutor escolhido
  // na Escala, o status), e reabre a escala aprovada. O voo que já pousou fica como está: o pedido, o cadeado e o status
  test('"Limpar demanda" solta os voos que limpa (o cadeado e o status de antes) e reabre a escala; o voo que pousou fica', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 }), aluno(1002, { p1: 610, p2: -1 })],
      fStatus: { '1001_0_1': 'Confirmado' }
    });
    await abrir(page, { estado });
    await abrirEscala(page);
    const voo = nome => page.locator('#out tbody tr:not(.win)', { hasText: nome });
    await confirmar(page, '#btn-aprovar');
    // O Aluno 1000 com o outro instrutor, escolhido na Escala; o Aluno 1002 já pousou
    const doApp = (await voo('Aluno 1000').locator('.c-instr').innerText()).trim();
    await voo('Aluno 1000').locator('[data-act="trocar-instrutor"]').click();
    await voo('Aluno 1000').locator('select[data-a="insVoo"]').selectOption(doApp === 'Instrutor 01' ? '2' : '1');
    await expect(voo('Aluno 1000').locator('.ins-btn')).toHaveClass(/\bescolhido\b/);
    await voo('Aluno 1002').locator('.st-sel').selectOption('Pousou');
    await expect(voo('Aluno 1002').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Pousou');
    await expect(page.locator('#out tbody tr:not(.win) .fixo')).toHaveCount(3);
    const pousou = (await lerEscala(page)).linhas.find(l => l.includes('Aluno 1002'));
    // O dia guardado: os três voos fixos, o Confirmado do Aluno 1001, o Pousou do 1002 e a aprovação
    const guardado = () => page.evaluate(data => {
      const { fixos, fStatus, aprovacao } = JSON.parse(localStorage.getItem(`acpm4_dia_${data}`));
      return { fixos: Object.keys(fixos).sort(), fStatus, aprovada: Boolean(aprovacao) };
    }, AMANHA);
    await expect.poll(guardado).toEqual({ fixos: ['1000_0_1', '1001_0_1', '1002_0_1'], fStatus: { '1001_0_1': 'Confirmado', '1002_0_1': 'Pousou' }, aprovada: true });

    await irPara(page, 'dem');
    await page.locator('#btn-mais-dem').click();
    await confirmar(page, '#clr');
    await expect(page.locator('#toast-box .toast').last()).toHaveText('Demanda limpa e escala reaberta (1 voo em andamento fica).');
    await expect(page.locator('#audit-log-list')).toContainText('Demanda limpa e escala reaberta (1 voo em andamento fica)');
    // Só o pedido do voo que pousou continua; o dia guardado não tem mais o cadeado, o status nem a aprovação dos outros
    await expect(page.locator('#dem tr[data-k="d"].on')).toHaveAttribute('data-id', '1002');
    await expect.poll(guardado).toEqual({ fixos: ['1002_0_1'], fStatus: { '1002_0_1': 'Pousou' }, aprovada: false });

    // O Voa religado: o app escala o pedido em branco de novo (na 1ª preferência dele, 08:20), solto e Confirmado
    await page.locator('#onlyfly').uncheck();
    for (const id of [1000, 1001]) await page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="0"] [data-f="fly"]`).check();
    await abrirEscala(page);
    await expect(page.locator('#selo-aprovada')).toBeHidden();
    await expect(page.locator('#btn-aprovar')).toBeVisible();
    for (const nome of ['Aluno 1000', 'Aluno 1001']) {
      await expect(voo(nome).locator('.c-hr')).toContainText('08:20–09:20');
      await expect(voo(nome).locator('.fixo')).toHaveCount(0);
      await expect(voo(nome).locator('.ins-btn')).not.toHaveClass(/\bescolhido\b/);
      await expect(voo(nome).locator('.st-sel')).toHaveValue('Confirmado');
    }
    await expect.poll(async () => (await guardado()).fStatus).toEqual({ '1002_0_1': 'Pousou' });
    // O voo que pousou não mudou: o mesmo horário, avião e instrutor, com o status e o cadeado
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1002'))).toBe(pousou);
    await expect(voo('Aluno 1002').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Pousou');
  });

  test('"+ Missão" adiciona e remove uma missão extra do aluno', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    // O Aluno 09 não voa no dia de exemplo: mostra todos os alunos
    await page.locator('#onlyfly').uncheck();
    await linhaDoAluno(page, 'Aluno 09').locator('[data-act="add-mis"]').click();
    const extra = page.locator('#dem tr.extra-row[data-nm="aluno 09"]');
    await expect(extra).toHaveCount(1);
    await expect(extra.locator('td').first()).toContainText('↳ missão extra');
    await expect(extra.locator('[data-f="mis"]')).toHaveValue('Voo Local');
    await expect(extra.locator('[data-f="p1"]')).toHaveValue('760');
    // Tirar a missão extra pede confirmação, como os outros ✕
    const tirar = extra.locator('[data-act="del-mis"]');
    await tirar.click();
    await expect(tirar).toHaveText('Confirmar');
    await expect(tirar).toHaveAccessibleName('Confirmar: Tirar a missão extra de Aluno 09');
    await tirar.click();
    await expect(extra).toHaveCount(0);
    await expect(page.locator('#audit-log-list')).toContainText('Missão extra removida de Aluno 09');
  });

  // O aluno que não vai voar não voa nem as missões extras
  test('tirar o "Voa" do aluno tira também as missões extras; reverter volta todas', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    const extras = page.locator('#dem tr.extra-row[data-nm="aluno 01"] [data-f="fly"]');
    await expect(extras).toHaveCount(2);
    for (const caixa of await extras.all()) await expect(caixa).toBeChecked();
    await linhaDoAluno(page, 'Aluno 01').locator('[data-f="fly"]').uncheck();
    // As extras continuam na demanda, só desmarcadas (sem elas, reverter não teria o que voltar)
    await expect(extras).toHaveCount(2);
    for (const caixa of await extras.all()) await expect(caixa).not.toBeChecked();
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#audit-log-list')).toContainText('Aluno 01 retirado (Ground PA-34 · Sala Ground · 01h30 (1,5 h)), com as 2 missões extras');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await expect(linhaDoAluno(page, 'Aluno 01').locator('[data-f="fly"]')).toBeChecked();
    await expect(extras).toHaveCount(2);
    for (const caixa of await extras.all()) await expect(caixa).toBeChecked();
  });

  test('a duração é um número de horas, fracionado, até 5 h; acima disso, não vale', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    const duracao = page.locator('#dem tr[data-k="d"][data-id="1011"] [data-f="nb"]');
    await expect(duracao).toHaveAttribute('type', 'number');
    await duracao.fill('2.6');
    await duracao.press('Enter');
    await expect(page.locator('#audit-log-list')).toContainText('2,6 h');
    await abrirEscala(page);
    await expect(page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 12' }).locator('.c-hr')).toContainText('2,6 h');
    await irPara(page, 'dem');
    await duracao.fill('6');
    await duracao.press('Enter');
    await expect(page.locator('.toast').last()).toHaveText('A duração vai de 0,1 h a 5 h.');
    await expect(duracao).toHaveValue('2.6');
  });

  test('trocar a missão ajusta equipamento, duração e horários', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'alu');
    await page.locator('[data-act="adds"]').click();
    await irPara(page, 'dem');
    await page.locator('#onlyfly').uncheck();
    const linha = page.locator('#dem tr[data-k="d"]');
    const valores = async () => Object.fromEntries(await Promise.all(
      ['eq', 'p1', 'p2', 'nb'].map(async f => [f, await linha.locator(`[data-f="${f}"]`).inputValue()])
    ));

    await linha.locator('[data-f="mis"]').selectOption('Noturno');
    // Horários em minutos: o Noturno sai às 17:30 (1050), com 4 h no dia (o translado e o noturno em BH)
    expect(await valores()).toEqual({ eq: 'C172', p1: '1050', p2: '1050', nb: '4' });

    await linha.locator('[data-f="mis"]').selectOption('Ground C152');
    expect(await valores()).toEqual({ eq: 'Sala Ground', p1: '500', p2: '610', nb: '1.5' });
    await expect(linha.locator('[data-f="eq"]')).toBeDisabled();
    // O que a missão exige do instrutor aparece na dica do campo
    await expect(linha.locator('[data-f="mis"]')).toHaveAttribute('title', 'Exige Grounds (C152, C172 e Navegação)');

    await linha.locator('[data-f="mis"]').selectOption('Voo Local');
    expect(await valores()).toEqual({ eq: 'C152', p1: '500', p2: '610', nb: '1' });
  });

  test('TGL (TMA) e voos de cheque na demanda: equipamentos do cheque e o checador credenciado', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { hab: ['local', 'c172', 'checa_pp', 'checa_pc', 'checa_mnte', 'checa_vfr'] }), instrutor(2, 9, { hab: ['local', 'c172', 'checa_pc', 'checa_mnte', 'checa_ifr'] })],
      stu: [aluno(1000)]
    });
    await abrir(page, { estado });
    await irPara(page, 'dem');
    const linha = page.locator('#dem tr[data-k="d"]').first();
    const opcoes = await linha.locator('[data-f="mis"] option').allTextContents();
    expect(opcoes).toEqual(expect.arrayContaining(['TGL (TMA)', 'Cheque PP', 'Cheque PC MNTE VFR', 'Cheque PC MNTE IFR', 'Cheque PC MLTE VFR', 'Cheque PC MLTE IFR']));

    await linha.locator('[data-f="mis"]').selectOption('Cheque PC MNTE IFR');
    expect(await linha.locator('[data-f="eq"] option').allTextContents()).toEqual(['C172']);
    await expect(linha.locator('[data-f="mis"]')).toHaveAttribute('title', 'Exige Checador do curso PC + Checador MNTE + Checador IFR');
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos).toHaveLength(1);
    expect(voos[0]).toContain('| Cheque PC MNTE IFR |');
    expect(voos[0]).toContain('| Instrutor 02 |');
  });

  test('disponibilidade do aluno: o voo só começa nas janelas escolhidas', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { p1: 1, p2: 2 })] }) });
    await irPara(page, 'dem');
    const linha = page.locator('#dem tr[data-k="d"]').first();
    await linha.locator('[data-f="jan"]').selectOption('tarde');
    await expect(page.locator('#audit-log-list')).toContainText('Pedido Aluno 1000: disponibilidade Tarde (Voo Local)');
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos[0]).toMatch(/^12:40–13:40 1 h[^|]* \| Aluno 1000 \|/);
  });

  test('filtros "Só quem voa", nome e missão', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'dem');
    const visiveis = page.locator('#dem tr[data-k="d"]:visible');

    // "Só quem voa" já vem ligado
    await expect(page.locator('#onlyfly')).toBeChecked();
    await expect(page.locator('#dem')).toHaveClass(/\bonly\b/);
    await expect(visiveis).toHaveCount(await page.locator('#dem tr[data-k="d"].on').count());

    await page.locator('#flt-dem').fill('aluno 01');
    await expect(visiveis).toHaveCount(3);

    await page.locator('#flt-dem').fill('');
    await page.locator('#flt-dem-mis').selectOption('Ground C152');
    await expect(visiveis).toHaveCount(6);
  });

});

// O voo agendado na Escala (o voo fixo com a marca agendado) é do pedido como ele estava. Tirar da escala e pôr de volta
// o mantém no lugar; outra missão no pedido (à mão ou pela próxima missão do curso) o solta, e o histórico diz; a missão
// extra tirada e a demanda limpa levam os agendados delas (a demanda limpa deixa como está o voo em andamento ou
// pousado, agendado). O status, Aprovar e Reabrir não o soltam, e o voo em andamento, pousado ou cancelado continua fixo
// pelo status
test.describe('Voo agendado na Escala', () => {
  // O Aluno 1000 está agendado às 10:10 no PR-VOB com o Instrutor 02 (o pedido dele prefere as 06:30)
  const AGENDADO = { a: 610, b: 670, r: 'PR-VOB', insId: 2, agendado: true };
  const dia = ({ pedido1000 = {}, aluno1000 = {}, ...extra } = {}) => ({
    ...cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1, ...pedido1000 }, aluno1000), aluno(1001, { p1: 500, p2: -1 })] }),
    fixos: { '1000_0_1': AGENDADO }, ...extra
  });
  const voo = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });
  const pedido = (page, id, mid = 0) => page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="${mid}"]`);
  // Os voos fixos da data gravados neste navegador (a gravação sai logo depois da alteração)
  const fixosGravados = page => page.evaluate(d => {
    const dia = JSON.parse(localStorage.getItem(`acpm4_dia_${d}`) || 'null');
    return dia ? Object.keys(dia.fixos || {}).sort() : null;
  }, AMANHA);
  const pinosGravados = page => page.evaluate(d => {
    const dia = JSON.parse(localStorage.getItem(`acpm4_dia_${d}`) || 'null');
    return dia ? dia.fixos || {} : null;
  }, AMANHA);
  const naDemanda = async page => {
    await irPara(page, 'dem');
    if (await page.locator('#onlyfly').isChecked()) await page.locator('#onlyfly').uncheck();
  };

  test('tirar da escala e pôr de volta mantém o voo no lugar; outra missão no pedido o solta, e o histórico diz', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');

    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="fly"]').uncheck();
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000')).toHaveCount(0);
    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="fly"]').check();
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');

    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="mis"]').selectOption('Navegação');
    await expect(page.locator('#audit-log-list')).toContainText('Pedido Aluno 1000: Navegação · C152 · 1 h (deixa de ser fixo)');
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveCount(0);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('06:30–07:30');
    await expect.poll(() => fixosGravados(page)).toEqual([]);
  });

  test('a próxima missão do curso (Usar) também solta o voo agendado do pedido', async ({ page }) => {
    const cursos = { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }], PC: [], INVA: [] };
    await abrir(page, { estado: dia({ pedido1000: { mis: 'Navegação' }, aluno1000: { curso: 'PP' }, cursos }) });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await naDemanda(page);
    await pedido(page, 1000).locator('[data-act="usar-proxima"]').click();
    await expect(pedido(page, 1000).locator('.etapa')).toHaveText('PP-01');
    await expect(page.locator('#audit-log-list')).toContainText('Aluno 1000: PP-01 na demanda (Voo Local · C152 · 1 h) (deixa de ser fixo)');
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveCount(0);
  });

  test('a mesma duração digitada de outro jeito (1.0 no lugar de 1) não muda o pedido: o voo continua agendado', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await naDemanda(page);
    const duracao = pedido(page, 1000).locator('[data-f="nb"]');
    await expect(duracao).toHaveValue('1');
    await duracao.fill('1.0');
    await duracao.press('Tab');
    await expect(page.locator('#audit-log-list')).toContainText('Pedido Aluno 1000: Voo Local · C152 · 1 h');
    await expect(page.locator('#audit-log-list')).not.toContainText('deixa de ser fixo');
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect.poll(() => pinosGravados(page)).toEqual({ '1000_0_1': AGENDADO });
  });

  test('o voo agendado em andamento ou pousado continua fixo pelo status: outra missão só tira a marca, e a demanda limpa o deixa como está', async ({ page }) => {
    // O Aluno 1000 (agendado às 10:10) está em voo; o Aluno 1001, agendado às 08:20, já pousou
    const { agendado: _, ...EM_VOO } = AGENDADO;
    const POUSOU = { a: 500, b: 560, r: 'PR-VOC', insId: 1 };
    const estado = dia({ fStatus: { '1000_0_1': 'Em Voo', '1001_0_1': 'Pousou' } });
    estado.fixos = { ...estado.fixos, '1001_0_1': { ...POUSOU, agendado: true } };
    await abrir(page, { estado });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');

    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="mis"]').selectOption('Navegação');
    await expect(page.locator('#audit-log-list')).toContainText('Pedido Aluno 1000: Navegação · C152 · 1 h');
    await expect(page.locator('#audit-log-list')).not.toContainText('deixa de ser fixo');
    await expect.poll(() => pinosGravados(page)).toEqual({ '1000_0_1': EM_VOO, '1001_0_1': { ...POUSOU, agendado: true } });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');

    // A demanda limpa não mexe nos dois: os pedidos, os voos fixos (o do 1001 continua agendado) e os status ficam
    await naDemanda(page);
    await page.locator('#btn-mais-dem').click();
    await confirmar(page, '#clr');
    await expect(page.locator('#toast-box .toast').last()).toHaveText('Demanda limpa (2 voos em andamento ficam).');
    await expect(page.locator('#dem tr[data-k="d"].on')).toHaveCount(2);
    await expect(pedido(page, 1000).locator('[data-f="mis"]')).toHaveValue('Navegação');
    await expect(pedido(page, 1001).locator('[data-dica="voo-agendado"]')).toHaveText('agendado 08:20 · PR-VOC');
    await expect.poll(() => pinosGravados(page)).toEqual({ '1000_0_1': EM_VOO, '1001_0_1': { ...POUSOU, agendado: true } });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');
    await expect(voo(page, 'Aluno 1001').locator('.c-hr')).toContainText('08:20–09:20');
    await expect(voo(page, 'Aluno 1001').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Pousou');
  });

  test('a missão extra tirada e a demanda limpa levam os voos agendados delas; o voo em andamento fica', async ({ page }) => {
    const estado = dia({ fStatus: { '1001_0_1': 'Em Voo' } });
    estado.stu[1].extra = [missaoExtra(1, { p1: 760, p2: -1 })];
    estado.fixos = { ...estado.fixos, '1001_0_1': { a: 500, b: 560, r: 'PR-VOC', insId: 1 }, '1001_1_1': { a: 760, b: 820, r: 'PR-VOC', insId: 1, agendado: true } };
    await abrir(page, { estado });
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1001').filter({ hasText: '12:40' }).locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');

    await naDemanda(page);
    await confirmar(page, '#dem tr[data-k="d"][data-id="1001"][data-mid="1"] [data-act="del-mis"]');
    await expect(page.locator('#audit-log-list')).toContainText('Missão extra removida de Aluno 1001');
    await expect.poll(() => fixosGravados(page)).toEqual(['1000_0_1', '1001_0_1']);

    // A demanda limpa leva o voo agendado do Aluno 1000; o 1001, em voo, fica com o pedido e o voo fixo
    await page.locator('#btn-mais-dem').click();
    await confirmar(page, '#clr');
    await expect(page.locator('#toast-box .toast').last()).toHaveText('Demanda limpa (1 voo em andamento fica).');
    await expect(page.locator('#dem tr[data-k="d"].on')).toHaveAttribute('data-id', '1001');
    await expect(pedido(page, 1000).locator('[data-dica="voo-agendado"]')).toHaveCount(0);
    await expect.poll(() => fixosGravados(page)).toEqual(['1001_0_1']);
    // O Voa religado: o pedido em branco vai para a 1ª preferência dele (08:20), solto, não para o lugar do agendamento
    await pedido(page, 1000).locator('[data-f="fly"]').check();
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('08:20–09:20');
    await expect(voo(page, 'Aluno 1000').locator('.fixo')).toHaveCount(0);
    await expect(voo(page, 'Aluno 1001').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: Em Voo');
  });

  test('Pendente, Confirmado, Aprovar e Reabrir mantêm o voo agendado; tirado da escala antes de aprovar, ele volta ao lugar dele', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const cadeado = voo(page, 'Aluno 1000').locator('.fixo');
    for (const status of ['Pendente', 'Confirmado']) {
      await voo(page, 'Aluno 1000').locator('.st-sel').selectOption(status);
      await expect(voo(page, 'Aluno 1000').locator('.st-sel')).toHaveValue(status);
      await expect(cadeado).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    }

    // Fora da escala quando ela é aprovada: de volta, ele fica no lugar do agendamento
    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="fly"]').uncheck();
    await abrirEscala(page);
    await confirmar(page, '#btn-aprovar');
    await expect(page.locator('#selo-aprovada')).toBeVisible();
    await naDemanda(page);
    await pedido(page, 1000).locator('[data-f="fly"]').check();
    await abrirEscala(page);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('10:10–11:10');
    await expect(cadeado).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect(voo(page, 'Aluno 1001').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: escala aprovada');

    await confirmar(page, '#btn-reabrir');
    await expect(page.locator('#selo-aprovada')).toBeHidden();
    await expect(cadeado).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect(voo(page, 'Aluno 1001').locator('.fixo')).toHaveCount(0);
  });
});

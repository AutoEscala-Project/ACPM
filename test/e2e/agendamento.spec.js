// Agendar um voo na Escala ("+ Agendar voo"): o diálogo sugere a missão do curso, o recurso, o instrutor, o horário e o
// peso; a conferência roda o motor numa cópia da escala (o conflito não deixa agendar; a regra do curso pede "Agendar
// mesmo assim"). O voo agendado fica fixo (o cadeado), o pedido aparece na Demanda com a missão do curso, o peso
// digitado vai para o cadastro e o Histórico desfaz
import { test, expect, abrir, irPara, abrirEscala, confirmar, entrar, AMANHA } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { normalizarHorarios } from '../../js/horarios.js';
import { normalizarLimites } from '../../js/limites.js';

// O programa do PP (no cadastro, como antes do formato dos cursos: a conversão leva para as tabelas dos cursos)
const PROGRAMA = {
  PP: [
    { id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 },
    { id: 'PP-02', nome: 'Manobras', mis: 'Voo Local', eq: 'C152', nb: 1 },
    { id: 'PP-03', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 1.5 }
  ],
  PC: [],
  INVA: []
};
// A Maria Silva já aprovou a PP-01
const RESULTADOS = [{ id: 1, aluno: 1001, curso: 'PP', missao: 'PP-01', resultado: 'aprovado', data: '2026-11-04', voo: null, registrado_em: '2026-11-04T15:00:00.000Z', registrado_por: null }];

// O Aluno 1000 voa às 06:30 (o app escolhe o avião e o instrutor); a Maria Silva, do PP, não voa nesta data
const dia = ({ ins = [instrutor(1, 9), instrutor(2, 9)], ...extra } = {}) => ({
  ...cenario({ ins, stu: [aluno(1000, { p1: 390, p2: -1 }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP', nm: 'Maria Silva' })] }),
  cursos: PROGRAMA, ...extra
});

async function abrirComCurso(page, estado = dia()) {
  await page.addInitScript(json => { if (!localStorage.getItem('acpm4_resultados')) localStorage.setItem('acpm4_resultados', json); }, JSON.stringify(RESULTADOS));
  await abrir(page, { estado });
  await abrirEscala(page);
}

const dialogo = page => page.locator('#dlg-agendar');
const voo = (page, nome) => page.locator('#out tbody tr:not(.win)', { hasText: nome });
const pedido = (page, id, mid = 0) => page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="${mid}"]`);
// A conferência terminou: a prévia diz o voo que entra
const conferido = page => expect(page.locator('#agd-previa ul')).toContainText('Entra:');

async function abrirDialogo(page, stuId = 1001) {
  await page.locator('#btn-agendar').click();
  await expect(dialogo(page)).toBeVisible();
  await expect(page.locator('#agd-aluno')).toBeFocused();
  if (stuId) {
    await page.locator('#agd-aluno').selectOption(String(stuId));
    await conferido(page);
  }
}

async function agendar(page) {
  await page.locator('#agd-confirmar').click();
  await expect(dialogo(page)).toBeHidden();
}

const historico = async page => {
  if (await page.locator('#historico').isHidden()) await page.locator('#btn-open-log').click();
  return page.locator('#audit-log-list');
};

test.describe('Agendar um voo na Escala', () => {
  test('pela barra: a próxima missão do curso, o recurso e o instrutor livres e o primeiro horário; o voo fica fixo, vai para a Demanda e o Histórico desfaz', async ({ page }) => {
    await abrirComCurso(page);
    await abrirDialogo(page);
    await expect(dialogo(page)).toHaveAccessibleName('Agendar voo');
    await expect(page.locator('#agd-missao option:checked')).toHaveText('PP-02 · Voo Local · C152 · 1 h');
    await expect(page.locator('#agd-missao-nota')).toHaveText('Próxima do PP: PP-02.');
    await expect(page.locator('#agd-aluno-info')).toHaveText('PP · 1/3 · próxima PP-02');
    await expect(page.locator('#agd-horario')).toHaveValue('390');
    await expect(page.locator('#agd-instrutor option:checked')).toHaveText('Instrutor 02');
    await expect(page.locator('#agd-kg-aluno')).toHaveValue('70');
    await expect(page.locator('#agd-peso-resumo')).toHaveText('140 kg de 170 kg no C152: tanque cheio.');
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveCount(0);
    const recurso = await page.locator('#agd-recurso').inputValue();
    await agendar(page);
    await expect(page.locator('#toast-box')).toContainText(`Voo agendado: Maria Silva às 06:30 no ${recurso}.`);

    // O voo agendado: fixo, com o cadeado; o foco vai para ele
    const linha = voo(page, 'Maria Silva');
    await expect(linha.locator('.c-hr')).toContainText('06:30–07:30');
    await expect(linha.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect(linha.locator('select[data-f="fstatus"]')).toBeFocused();
    await expect(linha).toContainText(recurso);
    await expect(linha).toContainText('PP-02');

    // Na Demanda: o pedido voa, com a missão do curso e o instrutor escolhido
    await irPara(page, 'dem');
    await expect(pedido(page, 1001).locator('[data-f="fly"]')).toBeChecked();
    await expect(pedido(page, 1001).locator('.etapa')).toHaveText('PP-02');
    await expect(pedido(page, 1001).locator('[data-f="insId"]')).toHaveValue('2');

    // O Histórico desfaz: o pedido volta a não voar, e o cadeado sai com o voo
    const lista = await historico(page);
    const entrada = lista.locator('.audit-item', { hasText: 'Agendado na escala' });
    await expect(entrada.locator('.audit-desc')).toHaveText(`Agendado na escala: Maria Silva · PP-02 (Voo Local) · 06:30–07:30 · ${recurso} · Instrutor 02`);
    await entrada.getByRole('button', { name: '↶ Desfazer' }).click();
    await expect(lista).toContainText(`Revertido: Agendado na escala: Maria Silva`);
    await expect(pedido(page, 1001).locator('[data-f="fly"]')).not.toBeChecked();
    await page.locator('#btn-fechar-historico').click();
    await abrirEscala(page);
    await expect(voo(page, 'Maria Silva')).toHaveCount(0);
  });

  test('a missão fora da ordem pede "Agendar mesmo assim", e o histórico diz o que foi confirmado', async ({ page }) => {
    await abrirComCurso(page);
    await abrirDialogo(page);
    const fora = page.locator('#agd-missao option', { hasText: 'PP-03' });
    await expect(fora).toHaveText('PP-03 · Navegação · C152 · 1,5 h — falta PP-02');
    await page.locator('#agd-missao').selectOption(await fora.getAttribute('value'));
    await expect(page.locator('#agd-horas')).toHaveValue('1.5');
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveText(['PP-03 fora da ordem: falta PP-02.']);
    await page.locator('#agd-confirmar').click();
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar mesmo assim');
    await expect(page.locator('#agd-erro')).toHaveText('Confira o aviso acima; para agendar assim mesmo, clique em “Agendar mesmo assim”.');
    await expect(dialogo(page)).toBeVisible();
    // Outra missão (liberada) desarma a confirmação; de volta à fora da ordem, pede de novo
    await page.locator('#agd-missao').selectOption({ label: 'PP-02 · Voo Local · C152 · 1 h' });
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar');
    await page.locator('#agd-missao').selectOption(await fora.getAttribute('value'));
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveCount(1);
    await page.locator('#agd-confirmar').click();
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar mesmo assim');
    await agendar(page);
    await expect(voo(page, 'Maria Silva').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado na escala' })).toContainText('PP-03 (Navegação) · 06:30–08:00 · ');
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado na escala' })).toContainText('· confirmado: fora da ordem (falta PP-02)');
  });

  test('o 7º voo local do horário pede "Agendar mesmo assim", também quando a aluna vem antes no cadastro', async ({ page }) => {
    // Seis voos locais agendados às 08:20; a Maria é a primeira do cadastro: o motor confere o agendado dela antes dos
    // outros, e o aviso dele fica no último dos seis
    const outros = [1002, 1003, 1004, 1005, 1006, 1007];
    const regs = ['PP-LJV', 'PR-BTB', 'PR-IGU', 'PR-MLB', 'PR-TBT', 'PR-THI'];
    const estado = {
      ...cenario({ ins: [1, 2, 3, 4, 5, 6, 7].map(id => instrutor(id, 9)), stu: [aluno(1001, { fly: false }, { curso: 'PP', nm: 'Maria Silva' }), ...outros.map(id => aluno(id, { p1: 500, p2: -1 }))] }),
      cursos: PROGRAMA, fixos: Object.fromEntries(outros.map((id, i) => [`${id}_0_1`, { a: 500, b: 560, r: regs[i], insId: i + 1, agendado: true }]))
    };
    await abrirComCurso(page, estado);
    await abrirDialogo(page);
    await page.locator('#agd-horario').selectOption('500');
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveText(['Agendado às 08:20 como o 7º voo local do horário: no máximo 6 voos locais saem no mesmo horário.']);
    await page.locator('#agd-confirmar').click();
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar mesmo assim');
    await expect(dialogo(page)).toBeVisible();
    await agendar(page);
    await expect(voo(page, 'Maria Silva').locator('.c-hr')).toContainText('08:20–09:20');
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado na escala' })).toContainText('· confirmado: acima do limite de voos locais no horário');
  });

  test('o avião com um voo fixo no horário não serve: a opção diz por quê, e escolhido mesmo assim, não deixa agendar', async ({ page }) => {
    // O Aluno 1000 está em voo no PR-VOB às 06:30
    await abrirComCurso(page, dia({ fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, fStatus: { '1000_0_1': 'Em Voo' } }));
    await abrirDialogo(page);
    const vob = page.locator('#agd-recurso option[value="PR-VOB"]');
    await expect(vob).toHaveText('PR-VOB · C152 — voo fixo 06:30–07:30 (Aluno 1000)');
    await expect(vob).toBeDisabled();
    // Às 08:20 o PR-VOB está livre: escolhido, ele fica quando o horário volta para as 06:30
    await page.locator('#agd-horario').selectOption('500');
    await expect(vob).toBeEnabled();
    await page.locator('#agd-recurso').selectOption('PR-VOB');
    await page.locator('#agd-horario').selectOption('390');
    await expect(page.locator('#agd-recurso')).toHaveValue('PR-VOB');
    // O bloqueio, com as alternativas livres
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(1);
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toContainText('O avião já está ocupado neste horário.');
    await page.locator('#agd-confirmar').click();
    await expect(page.locator('#agd-erro')).toHaveText('O avião já está ocupado neste horário.');
    await expect(page.locator('#agd-recurso')).toBeFocused();
    await expect(page.locator('#agd-recurso')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialogo(page)).toBeVisible();
    await page.locator('#agd-voltar').click();
    await expect(dialogo(page)).toBeHidden();
    await expect(voo(page, 'Maria Silva')).toHaveCount(0);
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  test('o instrutor indisponível: "Marcar disponível" deixa agendar, e desfazer devolve a disponibilidade', async ({ page }) => {
    await abrirComCurso(page, dia({ ins: [instrutor(1, 9), instrutor(2, 9, { on: false })] }));
    await abrirDialogo(page);
    await expect(page.locator('#agd-instrutor option[value="2"]')).toHaveText('Instrutor 02 — indisponível');
    await page.locator('#agd-instrutor').selectOption('2');
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toContainText('O instrutor não está disponível.');
    await page.locator('#agd-conferencia').getByRole('button', { name: 'Marcar Instrutor 02 disponível às 06:30' }).click();
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
    await expect(page.locator('#agd-conferencia .agd-notas')).toContainText('Instrutor 02 fica disponível às 06:30 com o agendamento.');
    await expect(page.locator('#agd-confirmar')).toBeFocused();
    await agendar(page);
    const entrada = (await historico(page)).locator('.audit-item', { hasText: 'Agendado na escala' });
    await expect(entrada.locator('.audit-desc')).toContainText('· Instrutor 02 · Instrutor 02 marcado disponível às 06:30');
    await page.locator('#btn-fechar-historico').click();
    await irPara(page, 'ins');
    await expect(page.locator('#inst-dia tr[data-id="2"] [data-f="on"]')).toBeChecked();
    await (await historico(page)).locator('.audit-item', { hasText: 'Agendado na escala' }).getByRole('button', { name: '↶ Desfazer' }).click();
    await expect(page.locator('#inst-dia tr[data-id="2"] [data-f="on"]')).not.toBeChecked();
  });

  test('o peso digitado vai para o cadastro (Alunos e Instrutores), com uma entrada no histórico cada; sem peso, o envio para no campo', async ({ page }) => {
    await abrirComCurso(page);
    await abrirDialogo(page);
    await page.locator('#agd-kg-aluno').fill('');
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toContainText('Peso do aluno não informado');
    await expect(page.locator('#agd-peso-resumo')).toHaveText('Sem um dos pesos, o limite de 170 kg do C152 não é conferido.');
    // O primeiro envio para no peso que falta
    await page.locator('#agd-confirmar').click();
    await expect(page.locator('#agd-kg-aluno')).toBeFocused();
    await expect(page.locator('#agd-kg-aluno')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar mesmo assim');
    await page.locator('#agd-kg-aluno').fill('82.5');
    await page.locator('#agd-kg-instrutor').fill('91');
    await expect(page.locator('#agd-peso-resumo')).toHaveText('173,5 kg de 170 kg no C152: abastecer até 24 gal (2 a menos que o tanque cheio); o voo, o táxi e a reserva pedem 11 gal; autonomia de 3h41.');
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveCount(0);
    await expect(page.locator('#agd-confirmar')).toHaveText('Agendar');
    await agendar(page);
    const lista = await historico(page);
    await expect(lista.locator('.audit-desc', { hasText: '(agendamento)' })).toHaveText(['Peso Instrutor 02: 91 kg (agendamento)', 'Peso Maria Silva: 82,5 kg (agendamento)']);
    await page.locator('#btn-fechar-historico').click();
    await irPara(page, 'alu');
    await expect(page.locator('#alu tr[data-id="1001"] [data-f="kg"]')).toHaveValue('82.5');
    await irPara(page, 'ins');
    await page.locator('#s-ins [data-vista-ins="cadastro"]').click();
    await expect(page.locator('#inst tr[data-id="2"] [data-f="kg"]')).toHaveValue('91');
  });

  test('Confirmado, Aprovar e Reabrir mantêm o voo agendado no lugar', async ({ page }) => {
    await abrirComCurso(page);
    await abrirDialogo(page);
    await page.locator('#agd-horario').selectOption('610');
    await agendar(page);
    const linha = () => voo(page, 'Maria Silva');
    await expect(linha().locator('.c-hr')).toContainText('10:10–11:10');
    await linha().locator('select[data-f="fstatus"]').selectOption('Confirmado');
    await expect(linha().locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await confirmar(page, '#btn-aprovar');
    await expect(page.locator('#selo-aprovada')).toBeVisible();
    await expect(linha().locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await confirmar(page, '#btn-reabrir');
    await expect(page.locator('#selo-aprovada')).toBeHidden();
    await expect(linha().locator('.c-hr')).toContainText('10:10–11:10');
    await expect(linha().locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
  });

  test('na escala aprovada, o voo novo entra fixo e nenhum outro voo muda', async ({ page }) => {
    await abrirComCurso(page);
    await confirmar(page, '#btn-aprovar');
    const antes = await voo(page, 'Aluno 1000').innerText();
    await abrirDialogo(page);
    await expect(page.locator('#agd-conferencia .agd-notas')).toContainText('A escala está aprovada: o voo novo entra fixo e os outros não mudam.');
    await expect(page.locator('#agd-previa ul')).toContainText('Nenhum outro voo muda.');
    await agendar(page);
    await expect(voo(page, 'Maria Silva').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    expect(await voo(page, 'Aluno 1000').innerText()).toBe(antes);
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado' })).toContainText('Agendado na escala aprovada: Maria Silva · PP-02');
  });

  test('só com o teclado: Enter no botão, o aluno pela primeira letra, Tab até Agendar e Enter; o foco vai para o voo novo', async ({ page }) => {
    await abrirComCurso(page);
    await page.locator('#btn-agendar').focus();
    await page.keyboard.press('Enter');
    await expect(dialogo(page)).toBeVisible();
    await expect(page.locator('#agd-aluno')).toBeFocused();
    await page.keyboard.type('M');
    await expect(page.locator('#agd-aluno')).toHaveValue('1001');
    await conferido(page);
    for (let i = 0; i < 20 && !(await page.locator('#agd-confirmar').evaluate(b => b === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(page.locator('#agd-confirmar')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialogo(page)).toBeHidden();
    await expect(voo(page, 'Maria Silva').locator('select[data-f="fstatus"]')).toBeFocused();
  });

  test('Esc com o Histórico aberto fecha só o diálogo; o segundo fecha a gaveta', async ({ page }) => {
    await abrirComCurso(page);
    await page.locator('#btn-open-log').click();
    await expect(page.locator('#historico')).toBeVisible();
    await page.locator('#btn-agendar').focus();
    await page.keyboard.press('Enter');
    await expect(dialogo(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(page.locator('#historico')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#historico')).toBeHidden();
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  test('no celular (390 px), o diálogo cabe na tela e os campos e botões têm 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirComCurso(page);
    await expect(page.locator('#btn-agendar')).toBeVisible();
    expect((await page.locator('#btn-agendar').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await abrirDialogo(page);
    const medidas = await dialogo(page).evaluate(dlg => ({
      cabe: dlg.getBoundingClientRect().right <= innerWidth && dlg.getBoundingClientRect().left >= 0 && dlg.scrollWidth <= dlg.clientWidth,
      pequenos: [...dlg.querySelectorAll('select, input, button, summary')].filter(el => el.checkVisibility() && el.getBoundingClientRect().height < 44).map(el => el.id || el.textContent)
    }));
    expect(medidas).toEqual({ cabe: true, pequenos: [] });
    await agendar(page);
    await expect(voo(page, 'Maria Silva')).toHaveCount(1);
  });

  test('no celular (390 px), "O que muda na escala" e as alternativas de um bloqueio também têm 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // O Aluno 1000 está em voo no PR-VOB às 06:30: escolhido às 06:30, o PR-VOB é um bloqueio com as alternativas
    await abrirComCurso(page, dia({ fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, fStatus: { '1000_0_1': 'Em Voo' } }));
    await abrirDialogo(page);
    await page.locator('#agd-horario').selectOption('500');
    await page.locator('#agd-recurso').selectOption('PR-VOB');
    await page.locator('#agd-horario').selectOption('390');
    await expect(page.locator('#agd-conferencia .agd-chips')).toHaveCount(2);
    const pequenos = await dialogo(page).evaluate(dlg => [...dlg.querySelectorAll('select, input, button, summary')]
      .filter(el => el.checkVisibility() && el.getBoundingClientRect().height < 44).map(el => `${el.id || el.textContent.trim()} ${Math.round(el.getBoundingClientRect().height)} px`));
    expect(pequenos).toEqual([]);
    expect((await page.locator('#agd-previa summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  // O operador costuma montar a escala de amanhã (a data que abre): o diálogo chama os voos dela de amanhã, nunca de hoje
  test('na data de amanhã, o diálogo não chama de "hoje" os voos da data: diz amanhã', async ({ page }) => {
    const estado = dia();
    Object.assign(estado.stu[0], { etapa: 'PP-01', cursoDaEtapa: 'PP' });
    await abrirComCurso(page, estado);
    await expect(page.locator('#dt-rel')).toHaveText('amanhã');
    await page.locator('#btn-agendar').click();
    const grupos = id => page.locator(id).evaluate(s => [...s.querySelectorAll('optgroup')].map(g => `${g.label}: ${[...g.children].map(o => o.textContent).join(' | ')}`).join(' / '));
    expect(await grupos('#agd-aluno')).toMatch(/^Na demanda de amanhã: Aluno 1000 — PP · próxima PP-02 · voa amanhã às 06:30 \/ /);
    await page.locator('#agd-aluno').selectOption('1000');
    await expect(page.locator('#agd-aluno-info')).toHaveText(/ · já voa amanhã às 06:30 \(PP-01, [A-Z0-9-]+\)$/);
    await expect(page.locator('#agd-missao optgroup').first()).toHaveAttribute('label', 'Voos de amanhã do aluno');
    await expect(page.locator('#agd-missao option:checked')).toHaveText(/^Mover PP-01 · Voo Local \(amanhã 06:30, /);
    expect(await grupos('#agd-missao')).not.toMatch(/hoje/);
    expect(await grupos('#agd-aluno')).not.toMatch(/hoje/);
    await expect(page.locator('#agd-aluno-info')).not.toContainText('hoje');
  });
});

test.describe('Mover e encaixar o voo de hoje do aluno, as turmas de Ground e as alternativas', () => {
  // O diálogo aberto pela barra, com a aluna escolhida (sem esperar a prévia de um voo novo)
  async function abrirPara(page, stuId) {
    await page.locator('#btn-agendar').click();
    await expect(dialogo(page)).toBeVisible();
    await page.locator('#agd-aluno').selectOption(String(stuId));
  }

  test('mover o voo de hoje: fica fixo no horário novo, a Demanda diz "agendado", e desfazer devolve o voo fixo de antes', async ({ page }) => {
    // A Maria Silva voa a PP-02 às 08:20 no PR-VOB, fixa pelo Instrutor 02 escolhido na Escala
    const estado = dia({ fixos: { '1001_0_1': { a: 500, b: 560, r: 'PR-VOB', insId: 2, escolhido: true } } });
    Object.assign(estado.stu[1], { fly: true, p1: 500, p2: -1, etapa: 'PP-02', cursoDaEtapa: 'PP', insId: 2 });
    await abrirComCurso(page, estado);
    await expect(voo(page, 'Maria Silva').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
    await abrirPara(page, 1001);
    // O padrão é mover o pedido que já tem a próxima missão (nunca a PP-03 por cima dele), com o instrutor escolhido dele
    await expect(dialogo(page)).toHaveAccessibleName('Mover o voo');
    await expect(page.locator('#agd-missao option:checked')).toHaveText('Mover PP-02 · Voo Local (amanhã 08:20, PR-VOB)');
    await expect(page.locator('#agd-instrutor')).toHaveValue('2');
    await page.locator('#agd-horario').selectOption('610');
    await expect(page.locator('#agd-recurso')).toHaveValue('PR-VOB');
    await expect(page.locator('#agd-previa ul li').first()).toHaveText('Muda: Maria Silva · Voo Local · 10:10–11:10 · PR-VOB · Instrutor 02 (era 08:20 no PR-VOB)');
    await agendar(page);
    await expect(page.locator('#toast-box')).toContainText('Voo movido: Maria Silva às 10:10 no PR-VOB.');
    const linha = voo(page, 'Maria Silva');
    await expect(linha.locator('.c-hr')).toContainText('10:10–11:10');
    await expect(linha.locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect(linha.locator('select[data-f="fstatus"]')).toBeFocused();

    // Na Demanda: o mesmo pedido (nenhuma missão extra), com a missão do curso e a etiqueta do voo agendado
    await irPara(page, 'dem');
    await expect(pedido(page, 1001).locator('.tag[data-dica="voo-agendado"]')).toHaveText('agendado 10:10 · PR-VOB');
    await expect(pedido(page, 1001).locator('.etapa')).toHaveText('PP-02');
    await expect(pedido(page, 1001, 1)).toHaveCount(0);

    // O Histórico: uma edição que diz de onde o voo saiu; desfazer devolve o voo fixo pelo instrutor escolhido
    const lista = await historico(page);
    const entrada = lista.locator('.audit-item', { hasText: 'Agendado na escala' });
    await expect(entrada.locator('.audit-desc')).toHaveText('Agendado na escala: Maria Silva · PP-02 (Voo Local) · 10:10–11:10 · PR-VOB · Instrutor 02 (era 08:20 no PR-VOB)');
    await expect(entrada.locator('.audit-badge')).toHaveText('Edição');
    await entrada.getByRole('button', { name: '↶ Desfazer' }).click();
    await expect(lista).toContainText('Revertido: Agendado na escala: Maria Silva');
    await expect(pedido(page, 1001).locator('.tag[data-dica="voo-agendado"]')).toHaveCount(0);
    await expect(pedido(page, 1001).locator('[data-f="fly"]')).toBeChecked();
    await page.locator('#btn-fechar-historico').click();
    await abrirEscala(page);
    await expect(voo(page, 'Maria Silva').locator('.c-hr')).toContainText('08:20–09:20');
    await expect(voo(page, 'Maria Silva').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: instrutor escolhido na escala');
  });

  test('encaixar o pedido que ficou fora: entra na escala sem outra missão extra, e a prévia diz o voo que muda de lugar', async ({ page }) => {
    // Um instrutor só: o Aluno 1000 voa às 06:30; a Maria Silva só pode às 06:30 e fica fora da escala
    const estado = dia({ ins: [instrutor(1, 9)] });
    Object.assign(estado.stu[1], { fly: true, p1: 390, p2: -1, jan: 'h390' });
    await abrirComCurso(page, estado);
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).toContainText('06:30–07:30');
    await expect(voo(page, 'Maria Silva')).toHaveCount(0);
    await abrirPara(page, 1001);
    await expect(dialogo(page)).toHaveAccessibleName('Encaixar o voo');
    await expect(page.locator('#agd-missao option:checked')).toHaveText('Encaixar Voo Local (ficou fora: sem instrutor livre)');
    await expect(page.locator('#agd-horario')).toHaveValue('390');
    // A prévia (fora da escala aprovada, os outros voos mudam): a Maria entra, e o Aluno 1000 sai das 06:30
    await page.locator('#agd-previa summary').click();
    await expect(page.locator('#agd-previa ul li').first()).toContainText('Entra: Maria Silva · Voo Local · 06:30–07:30 · ');
    await expect(page.locator('#agd-previa ul li').first()).toContainText('(estava fora da escala)');
    await expect(page.locator('#agd-previa ul')).toContainText('Aluno 1000: 06:30 → ');
    await agendar(page);
    await expect(page.locator('#toast-box')).toContainText('Voo encaixado: Maria Silva às 06:30 no ');
    await expect(voo(page, 'Maria Silva').locator('.c-hr')).toContainText('06:30–07:30');
    await expect(voo(page, 'Maria Silva').locator('.fixo')).toHaveAttribute('aria-label', 'Voo fixo: agendado na escala');
    await expect(voo(page, 'Aluno 1000').locator('.c-hr')).not.toContainText('06:30');
    // O mesmo pedido: nenhuma missão extra
    await irPara(page, 'dem');
    await expect(pedido(page, 1001).locator('[data-f="fly"]')).toBeChecked();
    await expect(pedido(page, 1001, 1)).toHaveCount(0);
    await expect(pedido(page, 1001).locator('.tag[data-dica="voo-agendado"]')).toContainText('agendado 06:30 · ');
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado na escala' })).toContainText('(estava fora da escala)');
  });

  test('no Ground, a aluna entra na turma do dia: o horário e o instrutor são os da turma', async ({ page }) => {
    // A turma das 08:20 (Aluno 1000 e Aluno 1002)
    const estado = dia();
    estado.stu = [aluno(1000, { ...GROUND_C152, p1: 500, p2: -1 }, { curso: 'PP' }), estado.stu[1], aluno(1002, { ...GROUND_C152, p1: 500, p2: -1 })];
    await abrirComCurso(page, estado);
    await expect(page.locator('#out')).toContainText('Turma de 2 alunos');
    await abrirPara(page, 1001);
    // Pela barra (o recurso é um avião), o Ground vem por "Outro tipo de missão…"
    await page.locator('#agd-missao').selectOption({ label: 'Outro tipo de missão…' });
    await page.locator('#agd-tipo').selectOption('Ground C152');
    const turma = page.locator('#agd-instrutor optgroup[label="Turmas de amanhã"] option');
    await expect(turma).toHaveText(['Entrar na turma das 08:20 com Instrutor 01 (2 alunos)']);
    await page.locator('#agd-instrutor').selectOption({ label: 'Entrar na turma das 08:20 com Instrutor 01 (2 alunos)' });
    await expect(page.locator('#agd-horario')).toHaveValue('500');
    await expect(page.locator('#agd-horario option:checked')).toHaveText('08:20 (turma)');
    await expect(page.locator('#agd-recurso option:checked')).toHaveText('Sala Ground · turma das 08:20');
    await conferido(page);
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
    await agendar(page);
    await expect(page.locator('#toast-box')).toContainText('Voo agendado: Maria Silva às 08:20 na sala de Ground.');
    await expect(page.locator('#out')).toContainText('Turma de 3 alunos');
    await expect(page.locator('#out tr.membro', { hasText: 'Maria Silva' })).toHaveCount(1);
    await expect((await historico(page)).locator('.audit-desc', { hasText: 'Agendado na escala' }))
      .toHaveText('Agendado na escala: Maria Silva · Ground C152 · 08:20–09:50 · Sala Ground · Instrutor 01 · entrou na turma');
  });

  test('o bloqueio traz as alternativas livres: um clique escolhe outro avião, e o voo é agendado', async ({ page }) => {
    // O Aluno 1000 está em voo no PR-VOB às 06:30
    await abrirComCurso(page, dia({ fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, fStatus: { '1000_0_1': 'Em Voo' } }));
    await abrirDialogo(page);
    await page.locator('#agd-horario').selectOption('500');
    await page.locator('#agd-recurso').selectOption('PR-VOB');
    await page.locator('#agd-horario').selectOption('390');
    const bloqueio = page.locator('#agd-conferencia .agd-bloqueios li');
    await expect(bloqueio).toContainText('O avião já está ocupado neste horário.');
    await expect(bloqueio.locator('.agd-chips')).toHaveText([/^Recursos livres: /, 'Horários livres: 08:20 10:10 11:30']);
    const chip = bloqueio.locator('.agd-chips').first().getByRole('button').first();
    const reg = (await chip.textContent()).trim();
    await chip.click();
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
    await expect(page.locator('#agd-confirmar')).toBeFocused();
    await expect(page.locator('#agd-recurso')).toHaveValue(reg);
    await expect(page.locator('#agd-horario')).toHaveValue('390');
    await agendar(page);
    await expect(voo(page, 'Maria Silva')).toContainText(reg);
    await expect(voo(page, 'Maria Silva').locator('.c-hr')).toContainText('06:30–07:30');
  });
});

test.describe('Agendar um voo no modo compartilhado', () => {
  test('grava só o dia; com um peso digitado, também o cadastro', async ({ page, context }) => {
    // O cadastro guardado como o app grava (com a frota, os horários e os limites): a gravação seguinte não o regrava
    const estado = { frota: FROTA_INICIAL, horarios: normalizarHorarios(null), limites: normalizarLimites(null), ...dia() };
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(estado, AMANHA));
    await entrar(page, CONTAS.operador);
    await abrirEscala(page);
    const gravadas = () => servidor.gravacoes.map(g => g.chave);
    await abrirDialogo(page);
    await agendar(page);
    await expect.poll(gravadas).toEqual([`dia:${AMANHA}`]);
    await expect.poll(() => servidor.historico.map(h => h.descricao)).toEqual([expect.stringMatching(/^Agendado na escala: Maria Silva · PP-01 \(Voo Local\) · 06:30–07:30 · /)]);
    await abrirDialogo(page, 1000);
    await page.locator('#agd-kg-aluno').fill('75');
    await agendar(page);
    await expect.poll(gravadas).toEqual([`dia:${AMANHA}`, 'cadastro', `dia:${AMANHA}`]);
    await expect.poll(() => servidor.historico.map(h => h.descricao).filter(d => d.includes('(agendamento)'))).toEqual(['Peso Aluno 1000: 75 kg (agendamento)']);
    expect(servidor.banco.get('cadastro').conteudo.stu.find(s => s.id === 1000).kg).toBe(75);
  });
});

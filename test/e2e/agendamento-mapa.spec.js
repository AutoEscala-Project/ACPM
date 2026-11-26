// Agendar pelo mapa e pela lista: o "+" de cada linha do mapa (o recurso ou o instrutor) e de cada horário da lista, o
// clique (ou toque) no espaço livre de uma linha (o horário da lista do recurso mais perto do clique) e "+ Aluno na turma"
// no popup da turma de Ground abrem o diálogo "Agendar voo" (test/e2e/agendamento.spec.js). O mapa mostra também as
// linhas livres: todos os recursos (o avião em manutenção, riscado e sem o "+") e os instrutores disponíveis no dia
import { test, expect, abrir, abrirEscala, alternarDisponivel, irPara, AMANHA, diaSeguinte, rotuloDaData } from './fixtures.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';
import { FROTA } from '../helpers/estado.js';

// O Aluno 1000 voa às 06:30 no C152 (o app escolhe o avião e o instrutor); a Maria Silva, sem curso, não voa nesta data
const dia = ({ ins = [instrutor(1, 9), instrutor(2, 9), instrutor(7, 9)], stu = [], ...extra } = {}) => ({
  ...cenario({ ins, stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { fly: false }, { nm: 'Maria Silva' }), ...stu], ...extra })
});

const dialogo = page => page.locator('#dlg-agendar');
const linha = (page, r) => page.locator(`#out .tl-row[data-r="${r}"]`);
const linhaDoInstrutor = (page, id) => page.locator(`#out .tl-row[data-ins="${id}"]`);
const faixa = (page, r) => linha(page, r).locator('.tl-track');
const popup = page => page.locator('#tl-pop');

async function abrirMapa(page, vista = 'eq') {
  await page.locator(`#s-esc [data-tl="${vista}"]`).click();
  await expect(page.locator('#out .mapa')).toBeVisible();
}

// Um clique na faixa no ponto do minuto (o ponto é contado da borda de dentro da faixa, como o app conta o clique): na
// altura dela no mapa transposto (o padrão, as horas descendo) e na largura com as horas nas colunas
async function clicarNoMinuto(trilha, minuto) {
  const ponto = await trilha.evaluate((el, m) => {
    const mapa = el.closest('.tl-wrap');
    const fracao = (m - mapa.dataset.inicio) / (mapa.dataset.fim - mapa.dataset.inicio);
    return mapa.classList.contains('transposto')
      ? { x: el.clientWidth / 2, y: fracao * el.clientHeight }
      : { x: fracao * el.clientWidth, y: el.clientHeight / 2 };
  }, minuto);
  await trilha.click({ position: ponto });
}

async function escolherAluno(page, stuId = 1001) {
  await expect(dialogo(page)).toBeVisible();
  await expect(page.locator('#agd-aluno')).toBeFocused();
  await page.locator('#agd-aluno').selectOption(String(stuId));
  await expect(page.locator('#agd-previa ul')).toContainText('Entra:');
}

async function agendar(page) {
  await page.locator('#agd-confirmar').click();
  await expect(dialogo(page)).toBeHidden();
}

test.describe('Agendar pelo mapa', () => {
  test('um clique na linha livre do PR-VOB, perto das 10:25, agenda no PR-VOB às 10:10 (os horários do C152); o foco vai para o voo novo', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await abrirMapa(page);
    await expect(linha(page, 'PR-VOB').locator('.tl-bar')).toHaveCount(0);
    await expect(linha(page, 'PR-VOB').locator('.tl-lbl')).toHaveText('PR-VOB C152 · 0 h');
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 625);
    // A descrição do diálogo diz o clique desde antes do aluno; depois, o horário escolhido
    await expect(dialogo(page)).toHaveAccessibleDescription('PR-VOB · C152 · clique perto das 10:25');
    await escolherAluno(page);
    await expect(page.locator('#agd-recurso')).toHaveValue('PR-VOB');
    await expect(page.locator('#agd-horario')).toHaveValue('610');
    await expect(page.locator('#agd-contexto')).toHaveText('PR-VOB · C152 · clique perto das 10:25 → 10:10 (horários do C152)');
    await expect(dialogo(page)).toHaveAccessibleDescription('PR-VOB · C152 · clique perto das 10:25 → 10:10 (horários do C152)');
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveCount(0);
    await agendar(page);
    // A escala é refeita em volta do voo agendado (o Aluno 1000 pode ir para o PR-VOB)
    const barra = linha(page, 'PR-VOB').locator('.tl-bar', { hasText: 'Maria Silva' });
    await expect(barra.locator('.tl-bar-t1')).toHaveText('10:10–11:10 · Maria Silva');
    await expect(barra).toBeFocused();
    await expect(page.locator('#toast-box')).toContainText('Voo agendado: Maria Silva às 10:10 no PR-VOB.');
  });

  test('no C172, o Noturno sai às 17:30, longe do clique; no PA-34, o horário é o da grade de 30 em 30 minutos', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await abrirMapa(page);
    await clicarNoMinuto(faixa(page, 'PP-ABP'), 840);
    await escolherAluno(page);
    // O voo local fica nos horários do C172 (13:40, o mais perto das 14:00); o Noturno, às 17:30
    await expect(page.locator('#agd-horario')).toHaveValue('820');
    await page.locator('#agd-missao').selectOption('tipo:Noturno');
    await expect(page.locator('#agd-recurso')).toHaveValue('PP-ABP');
    await expect(page.locator('#agd-horario')).toHaveValue('1050');
    await expect(page.locator('#agd-contexto')).toHaveText('PP-ABP · C172 · clique perto das 14:00 → 17:30 (horários do C172)');
    await expect(page.locator('#agd-conferencia .agd-notas')).toContainText('O Noturno sai às 17:30.');
    // A volta no dia seguinte (a data aberta é amanhã) e o repouso do instrutor até ela, abaixo das 12 h da lei
    await expect(page.locator('#agd-conferencia .agd-notas li[data-codigo="noturno"]')).toHaveText('O Noturno volta em 12/11 às 07:30; o instrutor, o aluno e o avião ficam livres às 10:10.');
    await expect(page.locator('#agd-conferencia .agd-notas li[data-codigo="repouso-do-noturno"]'))
      .toHaveText(/^Limite da lei: Instrutor \d\d fica com 9h00 de repouso entre o noturno \(até 21:30\) e o translado de volta \(07:30\), menos que as 12h00 da lei; a escala de 12\/11 avisa\.$/);
    await expect(page.locator('#agd-conferencia .agd-avisos li')).toHaveCount(0);
    await page.locator('#agd-voltar').click();
    await expect(dialogo(page)).toBeHidden();

    await clicarNoMinuto(faixa(page, 'PT-JOB'), 550);
    await escolherAluno(page);
    await expect(page.locator('#agd-recurso')).toHaveValue('PT-JOB');
    await expect(page.locator('#agd-horario')).toHaveValue('540');
    await expect(page.locator('#agd-contexto')).toHaveText('PT-JOB · PA-34 · clique perto das 09:10 → 09:00 (horários do PA-34)');
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(page.locator('#log-cnt')).toHaveText('0');
  });

  test('o "+" da linha pelo teclado: o diálogo abre no recurso; o Esc devolve o foco ao "+", e ele volta ao "+" depois de a escala ser redesenhada', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await page.locator('#flt-esc-cat').selectOption('C152');
    await abrirMapa(page);
    const mais = linha(page, 'PR-VOB').locator('.tl-agendar');
    await expect(mais).toHaveAccessibleName('Agendar no PR-VOB');
    await mais.focus();
    await page.keyboard.press('Enter');
    await expect(dialogo(page)).toBeVisible();
    await expect(page.locator('#agd-aluno')).toBeFocused();
    // A descrição do diálogo diz a linha de onde ele abriu, antes do aluno
    await expect(dialogo(page)).toHaveAccessibleDescription('PR-VOB · C152 · o primeiro horário livre');
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(mais).toBeFocused();

    // De novo, e o voo vai para um C172: fora do filtro (C152), o foco volta ao "+" da linha, já redesenhada
    await page.keyboard.press('Enter');
    await expect(page.locator('#agd-aluno')).toBeFocused();
    await page.keyboard.type('M');
    await expect(page.locator('#agd-aluno')).toHaveValue('1001');
    await expect(page.locator('#agd-recurso')).toHaveValue('PR-VOB');
    await expect(page.locator('#agd-horario')).toHaveValue('390');
    await expect(page.locator('#agd-contexto')).toHaveText('PR-VOB · C152 · o primeiro horário livre: 06:30');
    await expect(dialogo(page)).toHaveAccessibleDescription('PR-VOB · C152 · o primeiro horário livre: 06:30');
    await page.locator('#agd-recurso').selectOption('PP-AJS');
    await expect(page.locator('#agd-previa ul')).toContainText('Entra: Maria Silva · Voo Local · 06:30–07:30 · PP-AJS');
    await page.locator('#agd-confirmar').focus();
    await page.keyboard.press('Enter');
    await expect(dialogo(page)).toBeHidden();
    await expect(page.locator('#toast-box')).toContainText('Voo agendado: Maria Silva às 06:30 no PP-AJS.');
    await expect(linha(page, 'PP-AJS')).toHaveCount(0);
    await expect(mais).toBeFocused();
  });

  test('a linha livre de um instrutor disponível: o "+" e o clique agendam com ele; quem está indisponível não tem linha livre', async ({ page }) => {
    await abrir(page, { estado: dia({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(7, 9), instrutor(9, 9, { on: false })] }) });
    await abrirEscala(page);
    await abrirMapa(page, 'ins');
    const livre = linhaDoInstrutor(page, 7);
    await expect(livre.locator('.tl-lbl')).toHaveText('Instrutor 07 0 h');
    await expect(livre.locator('.tl-bar')).toHaveCount(0);
    await expect(livre.locator('.tl-agendar')).toHaveAccessibleName('Agendar com Instrutor 07');
    await expect(linhaDoInstrutor(page, 9)).toHaveCount(0);
    // As linhas na ordem do nome
    await expect(page.locator('#out .tl-row .tl-lbl > span')).toHaveText(['Instrutor 01', 'Instrutor 02', 'Instrutor 07']);
    // O "+" da linha: a descrição do diálogo diz o instrutor dela, antes e depois do aluno
    await livre.locator('.tl-agendar').click();
    await expect(dialogo(page)).toHaveAccessibleDescription('Com Instrutor 07 · o primeiro horário livre');
    await escolherAluno(page);
    await expect(page.locator('#agd-instrutor')).toHaveValue('7');
    await expect(dialogo(page)).toHaveAccessibleDescription(/^Com Instrutor 07 · o primeiro horário livre: \d\d:\d\d$/);
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await clicarNoMinuto(livre.locator('.tl-track'), 500);
    await expect(dialogo(page)).toHaveAccessibleDescription('Com Instrutor 07 · clique perto das 08:20');
    await escolherAluno(page);
    await expect(page.locator('#agd-instrutor')).toHaveValue('7');
    await expect(page.locator('#agd-horario')).toHaveValue('500');
    await expect(page.locator('#agd-contexto')).toHaveText(/^Com Instrutor 07 · [A-Z0-9-]+ · C152 · clique perto das 08:20 → 08:20 \(horários do C152\)$/);
    await agendar(page);
    await expect(linhaDoInstrutor(page, 7).locator('.tl-bar .tl-bar-t2')).toHaveText('Maria Silva · Voo Local');
    await expect(linhaDoInstrutor(page, 7).locator('.tl-lbl')).toHaveText('Instrutor 07 1 h');
  });

  test('sem voos na data, o aviso continua e o mapa mostra embaixo dele a grade das linhas livres, que agenda com um clique', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1001, { fly: false }, { nm: 'Maria Silva' })] }) });
    await irPara(page, 'esc');
    const aviso = page.locator('#out > p.h');
    await expect(aviso).toHaveText('Nenhum voo nesta data. Marque quem vai voar na Demanda: a escala é montada automaticamente.');
    // A Escala abre em Por recurso, com a grade; na Lista, só o aviso
    await expect(page.locator('#out .mapa')).toBeVisible();
    await page.locator('#s-esc [data-tl="lista"]').click();
    await expect(page.locator('#out .mapa')).toHaveCount(0);
    await abrirMapa(page);
    await expect(aviso).toBeVisible();
    // Todos os recursos e a sala de Ground, sem a legenda (não há voo nenhum)
    await expect(page.locator('#out .mapa .tl-row')).toHaveCount(FROTA.length + 1);
    await expect(page.locator('#out .mapa .tl-legend')).toHaveCount(0);
    await expect(linha(page, 'SALA-GROUND').locator('.tl-agendar')).toHaveAccessibleName('Agendar na Sala Ground');
    await abrirMapa(page, 'ins');
    await expect(page.locator('#out .mapa .tl-row .tl-lbl')).toHaveText(['Instrutor 01 0 h']);
    await abrirMapa(page);
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 610);
    await escolherAluno(page);
    await expect(page.locator('#agd-horario')).toHaveValue('610');
    await agendar(page);
    await expect(linha(page, 'PR-VOB').locator('.tl-bar .tl-bar-t1')).toHaveText('10:10–11:10 · Maria Silva');
    await expect(page.locator('#out .st > div').first()).toHaveText('1 missões pedidas');
  });

  test('com o popup de um voo aberto, um clique na linha livre só fecha o popup; o clique seguinte agenda', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await abrirMapa(page);
    await page.locator('#out .tl-bar').first().click();
    await expect(popup(page)).toBeVisible();
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 610);
    await expect(popup(page)).toBeHidden();
    await expect(dialogo(page)).toBeHidden();
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 610);
    await expect(dialogo(page)).toBeVisible();
  });

  test('o avião em manutenção fica riscado, sem o "+", e o clique na linha dele não agenda', async ({ page }) => {
    await abrir(page, { estado: dia({ semAeronaves: ['PR-VOB'] }) });
    await abrirEscala(page);
    await abrirMapa(page);
    const vob = linha(page, 'PR-VOB');
    await expect(vob).toHaveClass(/\btl-manutencao\b/);
    await expect(vob.locator('.tl-lbl')).toHaveText('PR-VOB C152 · 0 h · em manutenção');
    await expect(vob.locator('.tl-agendar')).toHaveCount(0);
    await expect(vob.locator('.tl-track')).toHaveClass(/\binerte\b/);
    await clicarNoMinuto(vob.locator('.tl-track'), 610);
    await expect(dialogo(page)).toBeHidden();
    await expect(linha(page, 'PR-VOC').locator('.tl-agendar')).toHaveCount(1);
  });

  test('Ocultar indisponíveis tira do mapa Por recurso as linhas dos recursos desligados, e outro clique as mostra', async ({ page }) => {
    await abrir(page, { estado: dia({ semAeronaves: ['PR-VOB'] }) });
    await abrirEscala(page);
    const ocultar = page.locator('#btn-indisponiveis');
    await expect(ocultar).toBeHidden(); // a Lista
    await abrirMapa(page);
    await expect(ocultar).toBeVisible();
    await expect(ocultar).toHaveAttribute('aria-pressed', 'false');
    const linhas = page.locator('#out .mapa .tl-row');
    const todas = await linhas.count();
    await expect(linha(page, 'PR-VOB')).toHaveCount(1);

    await ocultar.click();
    await expect(ocultar).toHaveAttribute('aria-pressed', 'true');
    await expect(linha(page, 'PR-VOB')).toHaveCount(0);
    await expect(linhas).toHaveCount(todas - 1);
    await expect(linha(page, 'PR-VOC')).toHaveCount(1);
    await expect(page.locator('#out .tl-bar')).toHaveCount(1);

    // Por instrutor não tem recursos para esconder; de volta, continua oculto, nas colunas (o padrão) e com as horas nas
    // colunas (Inverter eixo X:Y)
    await abrirMapa(page, 'ins');
    await expect(ocultar).toBeHidden();
    await expect(page.locator('#out .tl-row[data-ins]')).toHaveCount(3);
    await abrirMapa(page);
    await expect(page.locator('#out .tl-wrap')).toHaveClass(/\btransposto\b/);
    await expect(linha(page, 'PR-VOB')).toHaveCount(0);
    await page.locator('#btn-eixo').click();
    await expect(page.locator('#out .tl-wrap')).not.toHaveClass(/transposto/);
    await expect(linha(page, 'PR-VOB')).toHaveCount(0);

    await ocultar.click();
    await expect(ocultar).toHaveAttribute('aria-pressed', 'false');
    await expect(linha(page, 'PR-VOB')).toHaveCount(1);
    await expect(linhas).toHaveCount(todas);
  });

  // O voo fixo num recurso que ficou indisponível está em conflito: escondê-lo tiraria o voo da tela
  test('Ocultar indisponíveis deixa no mapa o recurso desligado que ainda tem voo', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await abrirMapa(page);
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 625);
    await escolherAluno(page);
    await agendar(page);
    await expect(linha(page, 'PR-VOB').locator('.tl-bar')).not.toHaveCount(0);
    await irPara(page, 'rec');
    await alternarDisponivel(page, 'PR-VOB', false);
    await abrirEscala(page, { vista: null });
    await page.locator('#btn-indisponiveis').click();
    await expect(linha(page, 'PR-VOB').locator('.tl-bar')).not.toHaveCount(0);
    await expect(linha(page, 'PR-VOB')).toHaveClass(/\btl-manutencao\b/);
  });

  test('os filtros: a categoria mostra as linhas livres dela; o recurso e a busca, só as linhas com voos', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await abrirMapa(page);
    await page.locator('#flt-esc-cat').selectOption('PA-34');
    await expect(page.locator('#out > p.h')).toHaveText('Nenhum voo na escala com esses filtros.');
    await expect(page.locator('#out .mapa .tl-row .tl-lbl > span')).toHaveText(['PR-VOM', 'PT-JOB', 'PT-KIW']);
    await page.locator('#flt-esc-cat').selectOption('');
    await page.locator('#flt-esc-q').fill('Aluno 1000');
    await expect(page.locator('#out .mapa .tl-row')).toHaveCount(1);
    await expect(page.locator('#out .mapa .tl-row .tl-bar')).toHaveCount(1);
    // Por instrutor, a categoria também deixa só as linhas com voos (o instrutor com voos só de outra categoria pareceria
    // livre)
    await page.locator('#flt-esc-q').fill('');
    await abrirMapa(page, 'ins');
    await expect(page.locator('#out .mapa .tl-row')).toHaveCount(3);
    await page.locator('#flt-esc-cat').selectOption('C152');
    await expect(page.locator('#out .mapa .tl-row')).toHaveCount(1);
  });

  test('no Gestor, nem o "+" nem o clique na linha livre agendam', async ({ page }) => {
    await abrir(page, { estado: dia(), url: './?role=gestor' });
    await abrirEscala(page);
    await abrirMapa(page);
    await expect(page.locator('#out .tl-agendar').first()).toBeHidden();
    await clicarNoMinuto(faixa(page, 'PR-VOB'), 610);
    await expect(dialogo(page)).toBeHidden();
    await page.locator('#s-esc [data-tl="lista"]').click();
    await expect(page.locator('#out .win-agendar').first()).toBeHidden();
  });

  // O noturno de dois dias (js/noturno.js): no dia seguinte, a volta de BH (07:30–08:30) está no mapa, na linha do avião e
  // na do instrutor; o avião, o instrutor e o aluno dela só ficam livres às 10:10, e o clique na linha do avião antes disso
  // agenda às 10:10
  test('no dia seguinte ao Noturno, a volta de BH está no mapa; o clique na linha do avião às 09:00 agenda às 10:10', async ({ page }) => {
    const noturnoHoje = aluno(1000, { mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1 });
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [noturnoHoje, aluno(1001, { fly: false }, { nm: 'Maria Silva' })] }) });
    await abrirEscala(page);
    const noturno = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(noturno.locator('.c-hr')).toContainText('17:30–21:30');
    // Uma alteração grava a escala do dia (o dia seguinte lê a escala gravada)
    await noturno.locator('select[data-f="fstatus"]').selectOption('Pendente');
    await diaSeguinte(page);
    await expect(rotuloDaData(page)).toContainText('12/11');
    await abrirEscala(page);
    await abrirMapa(page);
    const volta = page.locator('#out .tl-row:has(.tl-bar)');
    await expect(volta).toHaveCount(1);
    await expect(volta.locator('.tl-bar-t1')).toHaveText('07:30–08:30 · Aluno 1000');
    const r = await volta.getAttribute('data-r');
    await abrirMapa(page, 'ins');
    await expect(linhaDoInstrutor(page, 1).locator('.tl-bar-t1')).toHaveText(`07:30–08:30 · ${r}`);
    await abrirMapa(page);
    await clicarNoMinuto(faixa(page, r), 540);
    await escolherAluno(page);
    await expect(page.locator('#agd-recurso')).toHaveValue(r);
    await expect(page.locator('#agd-instrutor')).toHaveValue('1');
    await expect(page.locator('#agd-horario')).toHaveValue('610');
    await expect(page.locator('#agd-contexto')).toHaveText(`${r} · C172 · clique perto das 09:00 → 10:10 (horários do C172)`);
    await expect(page.locator('#agd-conferencia .agd-bloqueios li')).toHaveCount(0);
  });

  // A escala gravada só exige a chave do voo (js/escala-gravada.js): os voos gravados sem o nome do instrutor ficam na
  // linha dele (pelo id), com o nome do cadastro; o voo sem o nome e sem o id fica numa linha que não agenda
  test('a escala gravada sem o nome do instrutor nos voos: o mapa Por instrutor continua, pelo id do instrutor', async ({ page }) => {
    await abrir(page, { estado: dia({ stu: [aluno(1002, { p1: 390, p2: -1 }), aluno(1003, { p1: 390, p2: -1 })] }) });
    await abrirEscala(page);
    await page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' }).locator('select[data-f="fstatus"]').selectOption('Pendente');
    const chave = `acpm4_dia_${AMANHA}`;
    await expect.poll(() => page.evaluate(c => (JSON.parse(localStorage.getItem(c) || 'null')?.resultado?.out || []).length, chave)).toBe(3);
    await page.evaluate(c => {
      const gravado = JSON.parse(localStorage.getItem(c));
      gravado.resultado.out = gravado.resultado.out.map(({ ins, insId, ...o }) => (o.stuId === 1000 ? o : { ...o, insId }));
      localStorage.setItem(c, JSON.stringify(gravado));
    }, chave);
    await page.reload();
    await abrirEscala(page);
    await abrirMapa(page, 'ins');
    const comVoo = page.locator('#out .tl-row:has(.tl-bar)');
    await expect(comVoo).toHaveCount(3);
    const semInstrutor = comVoo.filter({ hasText: 'Aluno 1000' });
    await expect(semInstrutor.locator('.tl-lbl > span')).toHaveText('');
    await expect(semInstrutor.locator('.tl-agendar')).toHaveCount(0);
    await expect(semInstrutor.locator('.tl-track')).toHaveClass(/\binerte\b/);
    // Os três instrutores, cada um com o "+" (os dois com voo e o que ficou livre)
    await expect(page.locator('#out .tl-row:not(:has(.tl-track.inerte)) .tl-lbl > span')).toHaveText(['Instrutor 01', 'Instrutor 02', 'Instrutor 07']);
    await expect(page.locator('#out .tl-row .tl-agendar')).toHaveCount(3);
    await expect(comVoo.filter({ hasText: 'Aluno 1002' }).locator('.tl-lbl > span')).toHaveText(/^Instrutor \d\d$/);
  });
});

test.describe('Agendar pela lista e pela turma de Ground', () => {
  test('o "+" de cada horário da lista agenda a partir dele: às 10:10, o primeiro horário livre é 10:10', async ({ page }) => {
    await abrir(page, { estado: dia({ stu: [aluno(1002, { p1: 610, p2: -1 })] }) });
    await abrirEscala(page);
    const periodo = page.locator('#out tr.win[data-w="2"]');
    await expect(periodo).toHaveText('10:10 · 3º tempo 1 decolagem ou aula');
    const mais = periodo.locator('.win-agendar');
    await expect(mais).toHaveAccessibleName('Agendar às 10:10');
    await mais.click();
    await expect(dialogo(page)).toHaveAccessibleDescription('O primeiro horário livre a partir das 10:10');
    await escolherAluno(page);
    await expect(page.locator('#agd-horario')).toHaveValue('610');
    await expect(page.locator('#agd-contexto')).toHaveText(/^[A-Z0-9-]+ · C152 · o primeiro horário livre a partir das 10:10: 10:10$/);
    await agendar(page);
    const voo = page.locator('#out tbody tr:not(.win)', { hasText: 'Maria Silva' });
    await expect(voo.locator('.c-hr')).toContainText('10:10–11:10');
    await expect(voo.locator('select[data-f="fstatus"]')).toBeFocused();
    await expect(page.locator('#out tr.win[data-w="2"]')).toHaveText('10:10 · 3º tempo 2 decolagens e aulas');
  });

  test('"+ Aluno na turma", no popup da turma de Ground, abre o diálogo; o Esc fecha só ele, e o foco volta ao botão', async ({ page }) => {
    await abrir(page, { estado: dia({ stu: [1002, 1003].map(id => aluno(id, { ...GROUND_C152, p1: 500, p2: -1 })) }) });
    await abrirEscala(page);
    await abrirMapa(page);
    await linha(page, 'SALA-GROUND').locator('.tl-bar').click();
    await expect(popup(page)).toBeVisible();
    const naTurma = popup(page).getByRole('button', { name: '+ Aluno na turma' });
    await expect(naTurma).toHaveAttribute('data-agendar', /^t:GND_/);
    await naTurma.click();
    await expect(dialogo(page)).toBeVisible();
    await expect(page.locator('#agd-aluno')).toBeFocused();
    // A descrição do diálogo diz a turma desde antes do aluno
    await expect(dialogo(page)).toHaveAccessibleDescription(/^Turma de Ground C152 das 08:20 com Instrutor \d\d$/);
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
    await expect(popup(page)).toBeVisible();
    await expect(naTurma).toBeFocused();
    await expect(page.locator('#log-cnt')).toHaveText('0');
    // Um voo que não é de Ground não tem o botão
    await page.keyboard.press('Escape');
    await expect(popup(page)).toBeHidden();
    await page.locator('#out .tl-bar', { hasText: 'Aluno 1000' }).click();
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).locator('[data-act="agendar"]')).toHaveCount(0);
  });
});

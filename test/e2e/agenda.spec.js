// A Agenda de Solicitações (modo local): a lista da data aberta, a "Data do pedido" e o prazo das 13:00, o registro com
// "Registrado por", a exceção da coordenação e o cancelamento. O relógio dos testes está em 10/11/2026, 12:00 em São Paulo.
import { test, comProgresso, expect, abrir, irPara, abrirEscala, lerEscala, caixaVoa, campoDaAgenda, contagemDoDia, dataAberta, diaAnterior, diaSeguinte, importarDaAgenda, mudarData, registrarPedido,
  escolherMissaoDoCurso, missaoDoCursoNaAgenda, appPronto, exportar, AMANHA, linhaDoPedido, entradasDoHistorico, linhasDosPedidos, linhaDaLista, grupoDosPedidos, buscaDosPedidos, aprovarNaLinha,
  escolherPedido, campoDoDetalhe, acaoDoPedido, botaoDosPedidos, avisoDosPedidos, estadoDoFormulario, botaoDoFormulario, botaoImportarDaAgenda } from './fixtures.js';
import { readFileSync } from 'node:fs';
import { documentosAtuais } from './supabase-falso.js';
import { aluno, cenario } from '../helpers/montar.js';
import { abrirRestricoes, campoDasRestricoes, fecharRestricoes } from './telas/restricoes.js';
import { cursosIniciais, novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { FROTA_INICIAL } from '../../js/frota.js';

const comAlunos = () => cenario({ stu: [aluno(1000), aluno(1001)] });
// Os horários do PA-34, de 30 em 30 minutos
const DE_30_EM_30_DO_PA34 = ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

test.describe('Agenda de Solicitações', () => {
  test('registra pedidos para amanhã (antes das 13:00) com quem anotou e a hora', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(page.locator('#agenda-data')).toHaveText('quarta-feira, 11/11/2026');
    await expect(page.locator('#agenda-prazo')).toContainText('Pedidos para amanhã (11/11) até hoje às 13:00');

    await registrarPedido(page, { obs: 'Prefere o PR-BTB' });
    const pedidos = linhasDosPedidos(page);
    await expect(pedidos).toHaveCount(1);
    await expect(pedidos.first()).toContainText('Aluno 1000');
    await expect(pedidos.first()).toContainText('Voo Local · C152 · 1 h');
    await expect(pedidos.first().locator('.lista-meta')).toHaveText('06:30');
    await expect(pedidos.first()).toContainText('Aprovado por Maria às 12:00 · Na demanda');
    // A observação e quem registrou, no detalhe
    await escolherPedido(page, 'Aluno 1000');
    await expect(campoDoDetalhe(page, 'Observação')).toHaveText('Prefere o PR-BTB');
    await expect(campoDoDetalhe(page, 'Registrado por')).toHaveText('Maria em 10/11 12:00');
    await botaoDosPedidos(page, 'novo').click();
    await expect(contagemDoDia(page, '2026-11-11')).toHaveText('1');
    await expect(campoDaAgenda(page, 'por')).toHaveValue('Maria', { timeout: 1000 });

    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'IFR', horario: '14:30', horas: 2.6, por: 'João' });
    await expect(pedidos).toHaveCount(2);
    await expect(pedidos.nth(1)).toContainText('IFR · C172 · 2,6 h');
    await expect(pedidos.nth(1).locator('.lista-meta')).toHaveText('14:30');
    await expect(contagemDoDia(page, '2026-11-11')).toHaveText('2');
  });

  test('o horário oferece os horários da missão: o Multimotor (PA-34), de 30 em 30 minutos; sem períodos', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'horario').locator('option')).toHaveText(['Escolha o horário…']);
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Multimotor');
    await expect(campoDaAgenda(page, 'horario').locator('option')).toHaveCount(22);
    await registrarPedido(page, { missao: 'Multimotor', horario: '07:30' });
    await expect(linhasDosPedidos(page).first()).toContainText('07:30');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Noturno');
    await expect(campoDaAgenda(page, 'horario').locator('option')).toHaveText(['17:30']);
    // O Voo Solo sai sempre às 06:30
    await campoDaAgenda(page, 'missao').selectOption('Voo Solo');
    await campoDaAgenda(page, 'recurso').selectOption('C172');
    await expect(campoDaAgenda(page, 'horario').locator('option')).toHaveText(['06:30']);
  });

  const horarios = page => campoDaAgenda(page, 'horario').locator('option');
  const DE_30_EM_30 = DE_30_EM_30_DO_PA34;
  const JANELAS = ['06:30', '08:20', '10:10', '11:30', '12:40', '13:40', '14:30', '16:20'];

  // O aluno, depois a missão, que decide o recurso, e os dois, os horários: o pedido no PA-34 nunca sai num horário do C152
  test('a missão espera o aluno e decide os recursos; o horário só abre com os três, e são os do recurso, contados', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const [aluno, missao, motivoDaMissao, recurso, horario, motivo] = ['aluno', 'missao', 'missao-motivo', 'recurso', 'horario', 'horario-motivo'].map(c => campoDaAgenda(page, c));
    await expect(missao).toBeDisabled();
    await expect(missao.locator('option')).toHaveText(['Escolha antes o aluno…']);
    await expect(recurso).toBeDisabled();
    await expect(recurso.locator('option')).toHaveText(['Escolha antes a missão…']);
    await expect(horario).toBeDisabled();
    await expect(motivo).toHaveText('Antes, escolha o aluno, a missão e o recurso.');
    await expect(motivo).toBeVisible();
    await expect(motivo).toHaveAttribute('aria-live', 'polite');
    await expect(horario).toHaveAccessibleDescription(/Antes, escolha o aluno, a missão e o recurso\./);

    // O aluno sem curso: os tipos de missão, com o motivo
    await aluno.selectOption({ label: 'Aluno 1000' });
    await expect(missao).toBeEnabled();
    await expect(missao).toHaveValue('');
    await expect(missao.locator('option:checked')).toHaveText('Escolha a missão…');
    await expect(missao.locator('option')).toHaveCount(19);
    await expect(motivoDaMissao).toHaveText('Aluno sem curso: escolha o tipo da missão.');
    await expect(motivoDaMissao).toHaveAttribute('aria-live', 'polite');
    await expect(missao).toHaveAccessibleDescription(/Aluno sem curso: escolha o tipo da missão\./);
    await expect(motivo).toHaveText('Antes, escolha a missão e o recurso.');

    // Vários recursos permitidos: nenhum escolhido
    await missao.selectOption('Navegação');
    await expect(recurso).toBeEnabled();
    await expect(recurso.locator('option')).toHaveText(['Escolha o recurso…', 'C152', 'C172', 'PA-34']);
    await expect(recurso).toHaveValue('');
    await expect(motivo).toHaveText('Antes, escolha o recurso.');
    await recurso.selectOption('PA-34');
    await expect(horario).toBeEnabled();
    await expect(motivo).toHaveText('21 horários do PA-34.');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', ...DE_30_EM_30]);
    await expect(horario).toHaveValue('');
    await recurso.selectOption('C152');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', ...JANELAS]);
    await expect(motivo).toHaveText('8 horários do C152.');

    // Um recurso só permitido: escolhido sozinho; ao sair da missão, ele não fica para a próxima
    await missao.selectOption('Multimotor');
    await expect(recurso.locator('option')).toHaveText(['PA-34']);
    await expect(recurso).toHaveValue('PA-34');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', ...DE_30_EM_30]);
    await missao.selectOption('Simulador');
    await expect(recurso.locator('option')).toHaveText(['Escolha o recurso…', 'Sim. Mono', 'Sim. Multi']);
    await expect(recurso).toHaveValue('');
    await expect(horario).toBeDisabled();
    await missao.selectOption('Ground PA-34');
    await expect(recurso).toHaveValue('Sala Ground');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', ...JANELAS]);
    await expect(motivo).toHaveText('8 horários da Sala Ground.');

    // Sem missão de novo: tudo volta a esperar
    await missao.selectOption('');
    await expect(recurso).toBeDisabled();
    await expect(horario).toBeDisabled();
    await expect(motivo).toHaveText('Antes, escolha a missão e o recurso.');
  });

  test('trocar a missão ou o recurso mantém o horário que a lista nova tem; o outro sai, e o app diz', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const [missao, recurso, horario, motivo] = ['missao', 'recurso', 'horario', 'horario-motivo'].map(c => campoDaAgenda(page, c));
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await missao.selectOption('Voo Local');
    await recurso.selectOption('C152');
    await horario.selectOption('11:30');
    // O recurso escolhido pela pessoa continua na missão que o permite, e o horário também
    await missao.selectOption('Navegação');
    await expect(recurso).toHaveValue('C152');
    await expect(horario).toHaveValue('11:30');
    await recurso.selectOption('PA-34');
    await expect(horario).toHaveValue('11:30');
    await expect(motivo).toHaveText('21 horários do PA-34.');
    await horario.selectOption('12:00');
    await recurso.selectOption('C172');
    await expect(horario).toHaveValue('');
    await expect(motivo).toHaveText('O horário 12:00 não é um dos de Navegação (C172). Escolha outro.');
    await horario.selectOption('08:20');
    await expect(motivo).toHaveText('8 horários do C172.');
    // Enquanto o recurso não é escolhido, o horário espera a lista
    await recurso.selectOption('');
    await expect(horario).toBeDisabled();
    await recurso.selectOption('C152');
    await expect(horario).toHaveValue('08:20');
    await missao.selectOption('Noturno');
    await expect(horario).toHaveValue('17:30');
    await expect(motivo).toHaveText('O horário 08:20 não é um dos de Noturno (C172). Agora é 17:30.');
    // O Voo Solo tem um horário só; o escolhido antes volta na missão que o tem, e o app diz
    await missao.selectOption('Voo Solo');
    await expect(recurso).toHaveValue('');
    await recurso.selectOption('C152');
    await expect(horario).toHaveValue('06:30');
    await expect(motivo).toHaveText('O horário 08:20 não é um dos de Voo Solo (C152). Agora é 06:30.');
    await missao.selectOption('Parafuso');
    await expect(horario).toHaveValue('08:20');
    await expect(motivo).toHaveText('O horário agora é 08:20.');
    await horario.selectOption('10:10');
    await expect(motivo).toHaveText('8 horários do C152.');
  });

  test('o horário posto pelo app (o único da missão) não fica para a seguinte, e o app diz', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const [missao, horario, motivo] = ['missao', 'horario', 'horario-motivo'].map(c => campoDaAgenda(page, c));
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await missao.selectOption('Voo Solo');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await expect(horario).toHaveValue('06:30');
    await expect(motivo).toHaveText('Um horário só: 06:30.');
    await missao.selectOption('Voo Local');
    await expect(horario).toHaveValue('');
    await expect(motivo).toHaveText('O horário 06:30 era o único da escolha anterior. Escolha o horário.');
    // O teclado, que passa por cada missão da lista: o horário escolhido não se perde no Voo Solo
    await horario.selectOption('11:30');
    await expect(motivo).toHaveText('8 horários do C152.');
    for (const m of ['TGL (TMA)', 'Navegação', 'Voo Solo']) await missao.selectOption(m);
    await expect(motivo).toHaveText('O horário 11:30 não é um dos de Voo Solo (C152). Agora é 06:30.');
    // Outro aluno (também sem curso): a missão e o horário ficam, sem o aviso de novo
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await expect(missao).toHaveValue('Voo Solo');
    await expect(horario).toHaveValue('06:30');
    await expect(motivo).toHaveText('Um horário só: 06:30.');
    await missao.selectOption('Parafuso');
    await expect(horario).toHaveValue('11:30');
    await expect(motivo).toHaveText('O horário agora é 11:30.');
    // Registrado no Voo Solo, o horário escolhido antes não vale mais: o próximo aluno recebe o Voo Solo, e o Parafuso fica sem horário
    await missao.selectOption('Voo Solo');
    await campoDaAgenda(page, 'por').fill('Maria');
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(linhasDosPedidos(page)).toContainText(['06:30']);
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await expect(missao).toHaveValue('Voo Solo');
    await missao.selectOption('Parafuso');
    await expect(horario).toHaveValue('');
  });

  test('a missão, o recurso e o horário são obrigatórios, com o erro e o foco no campo certo', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const enviar = () => page.locator('#form-agenda [type="submit"]').click();
    const [missao, recurso, horario, erro] = ['missao', 'recurso', 'horario', 'erro'].map(c => campoDaAgenda(page, c));
    const invalidos = async (...campos) => {
      for (const campo of ['aluno', 'missao', 'recurso', 'horario', 'horas', 'por']) await expect(campoDaAgenda(page, campo), campo).toHaveAttribute('aria-invalid', String(campos.includes(campo)));
    };
    // A missão espera o aluno: só falta o que já pode ser escolhido
    await enviar();
    await expect(erro).toHaveText('Escolha o aluno. Informe quem anotou o pedido (“Registrado por”).');
    await invalidos('aluno', 'por');
    await expect(campoDaAgenda(page, 'aluno')).toBeFocused();
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'por').fill('Maria');
    await enviar();
    await expect(erro).toHaveText('Escolha a missão.');
    await invalidos('missao');
    await expect(missao).toBeFocused();
    await missao.selectOption('IFR');
    await expect(erro).toBeEmpty();
    await enviar();
    await expect(erro).toHaveText('Escolha o recurso.');
    await invalidos('recurso');
    await expect(recurso).toBeFocused();
    await expect(recurso).toHaveAccessibleDescription('Escolha o recurso.');
    await recurso.selectOption('PA-34');
    await enviar();
    await expect(erro).toHaveText('Escolha o horário.');
    await invalidos('horario');
    await expect(horario).toBeFocused();
    await expect(horario).toHaveAccessibleDescription(/Escolha o horário\./);
    await horario.selectOption('07:00');
    await invalidos();
    await expect(erro).toBeEmpty();
    await enviar();
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(linhasDosPedidos(page).first()).toContainText('IFR · PA-34');

    // Depois de registrar, saem o aluno e a observação; a missão, o recurso e o horário esperam o próximo aluno
    await expect(campoDaAgenda(page, 'aluno')).toHaveValue('');
    await expect(missao).toBeDisabled();
    await expect(missao.locator('option:checked')).toHaveText('Escolha antes o aluno…');
    await expect(recurso).toBeDisabled();
    await expect(horario).toBeDisabled();
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('Antes, escolha o aluno, a missão e o recurso.');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await expect(missao).toHaveValue('IFR');
    await expect(recurso).toHaveValue('PA-34');
    await expect(horario).toBeEnabled();
    await expect(horario).toHaveValue('07:00');
  });

  // Antes, a lista era feita uma vez só: o horário tirado do cadastro continuava sendo oferecido
  test('os horários acompanham o cadastro no redesenho, sem tirar o foco nem o que foi digitado', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const [horario, motivo, obs] = ['horario', 'horario-motivo', 'obs'].map(c => campoDaAgenda(page, c));
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Navegação');
    await campoDaAgenda(page, 'recurso').selectOption('PA-34');
    await horario.selectOption('07:30');
    await campoDaAgenda(page, 'horas').fill('2.4');
    await obs.fill('Prefere o PT-JOB');
    const trocar = lista => page.evaluate(async novos => {
      const { S } = await import('/js/state.js');
      S.horarios = { ...S.horarios, 'PA-34': novos };
      (await import('/js/redesenho.js')).redesenhar('dados');
    }, lista);
    await obs.focus();
    await trocar([390, 450, 540]);
    await expect(horarios(page)).toHaveText(['Escolha o horário…', '06:30', '07:30', '09:00']);
    await expect(horario).toHaveValue('07:30');
    await expect(motivo).toHaveText('3 horários do PA-34.');
    await expect(obs).toBeFocused();
    await horario.focus();
    await trocar([390, 540]);
    await expect(horario).toHaveValue('');
    await expect(horario).toBeFocused();
    await expect(motivo).toHaveText('O horário 07:30 não é um dos de Navegação (PA-34). Escolha outro.');
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('2.4');
    await expect(obs).toHaveValue('Prefere o PT-JOB');
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('PA-34');
    // O cadastro que mudou sem redesenhar: o envio confere a lista
    await horario.selectOption('09:00');
    await campoDaAgenda(page, 'por').fill('Maria');
    await page.evaluate(async () => { const { S } = await import('/js/state.js'); S.horarios = { ...S.horarios, 'PA-34': [390] }; });
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    await expect(motivo).toHaveText('O horário 09:00 não é um dos de Navegação (PA-34). Agora é 06:30.');
  });

  test('o pedido no PA-34 entra na demanda e na escala no PA-34, no horário dele', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { fly: false })] }) });
    await irPara(page, 'age');
    await registrarPedido(page, { missao: 'Navegação', recurso: 'PA-34', horario: '07:30' });
    await expect(linhasDosPedidos(page).first()).toContainText('Navegação · PA-34');
    // Registrado e aprovado na data já gravada, o pedido já está na demanda
    await irPara(page, 'dem');
    const linha = page.locator('#dem tr[data-k="d"][data-id="1000"][data-mid="0"]');
    await expect(linha).toHaveCount(1);
    // O tipo, nas restrições do pedido (G1); o horário exato fica no dia guardado e aparece nelas, sem as preferências (N14)
    await abrirRestricoes(page, 1000);
    await expect(campoDasRestricoes(page, 'eq')).toHaveValue('PA-34');
    await expect(page.locator('#painel-restricoes .restricao-horario')).toContainText('às 07:30');
    await fecharRestricoes(page);
    await expect.poll(() => page.evaluate(data => JSON.parse(localStorage.getItem(`acpm4_dia_${data}`)).pedidos[1000].jan, AMANHA)).toBe('h450');
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:30/);
  });

  test('o 7º voo local no PA-34: o próximo horário possível é um do PA-34', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: Array.from({ length: 8 }, (_, i) => aluno(1000 + i)) }) });
    await irPara(page, 'age');
    for (let i = 0; i < 6; i++) await registrarPedido(page, { aluno: `Aluno ${1000 + i}`, horario: '06:30' });
    await expect(linhasDosPedidos(page)).toHaveCount(6);
    await registrarPedido(page, { aluno: 'Aluno 1006', recurso: 'PA-34', horario: '06:30' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Próximo horário com vaga: 07:00.');
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar mesmo assim');
    await expect(linhasDosPedidos(page)).toHaveCount(6);
  });

  test('escolher o aluno apaga o erro e a marca de erro dos campos', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await campoDaAgenda(page, 'por').fill('');
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(campoDaAgenda(page, 'erro')).toContainText('Escolha o aluno');
    await expect(campoDaAgenda(page, 'por')).toHaveAttribute('aria-invalid', 'true');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await expect(campoDaAgenda(page, 'erro')).toBeEmpty();
    for (const campo of ['#ag-aluno', '#ag-por']) await expect(page.locator(campo)).toHaveAttribute('aria-invalid', 'false');
  });

  test('a duração: fracionada, até 5 h; o Ground tem 01h30', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('1');
    await registrarPedido(page, { horas: 6 });
    await expect(campoDaAgenda(page, 'erro')).toHaveText('A duração vai de 0,1 h a 5 h.');
    // O campo errado é o marcado, e o motivo é a descrição dele (o que o leitor de tela diz no campo)
    await expect(campoDaAgenda(page, 'horas')).toHaveAttribute('aria-invalid', 'true');
    await expect(campoDaAgenda(page, 'horas')).toHaveAccessibleDescription('A duração vai de 0,1 h a 5 h.');
    await expect(campoDaAgenda(page, 'aluno')).toHaveAttribute('aria-invalid', 'false');
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    await campoDaAgenda(page, 'missao').selectOption('Ground C152');
    await expect(campoDaAgenda(page, 'horas')).toBeDisabled();
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('1.5');
  });

  // Duas operadoras podem marcar o mesmo aluno sem saber uma da outra
  test('o aluno que já tem voo marcado na data: o app avisa e pede para confirmar', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await registrarPedido(page, { horario: '06:30' });
    await registrarPedido(page, { horario: '10:10', por: 'Júlia' });
    await expect(campoDaAgenda(page, 'erro')).toHaveText('Aluno 1000 já tem voo marcado em 11/11: Voo Local · C152 às 06:30. É um reagendamento ou mais um voo? Para registrar mais este, clique em “Registrar mesmo assim”.');
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar mesmo assim');
    await page.locator('#form-agenda [type="submit"]').click();
    await expect(linhasDosPedidos(page)).toHaveCount(2);
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar e aprovar');
  });

  // A confirmação armada vale para o aluno, a data, a missão, o recurso, o horário e o botão: trocar qualquer um a desfaz.
  // Com ela armada, um erro de outro campo substitui o aviso, e o botão continua armado
  test('"Registrar mesmo assim" vale para aquele pedido: trocar o recurso, o horário ou a data desfaz a confirmação', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const [recurso, horario, horas, erro] = ['recurso', 'horario', 'horas', 'erro'].map(c => campoDaAgenda(page, c));
    const enviar = page.locator('#form-agenda [type="submit"]');
    const aviso = 'Aluno 1000 já tem voo marcado em 11/11: Voo Local · C152 às 06:30. É um reagendamento ou mais um voo? Para registrar mais este, clique em “Registrar mesmo assim”.';
    await registrarPedido(page, { horario: '06:30' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await registrarPedido(page, { missao: 'Navegação', recurso: 'PA-34', horario: '07:00' });
    await expect(erro).toHaveText(aviso);
    await expect(enviar).toHaveText('Registrar mesmo assim');
    // A duração errada: o erro no lugar do aviso, com o botão ainda armado
    await horas.fill('6');
    await enviar.click();
    await expect(erro).toHaveText('A duração vai de 0,1 h a 5 h.');
    await expect(enviar).toHaveText('Registrar mesmo assim');
    await horas.fill('1');
    // Outro recurso: a confirmação sai; de volta ao mesmo pedido, ela é pedida de novo
    await recurso.selectOption('C152');
    await expect(erro).toBeEmpty();
    await expect(enviar).toHaveText('Registrar e aprovar');
    await recurso.selectOption('PA-34');
    await horario.selectOption('07:00');
    await expect(enviar).toHaveText('Registrar e aprovar');
    await enviar.click();
    await expect(erro).toHaveText(aviso);
    await horario.selectOption('08:00');
    await expect(erro).toBeEmpty();
    await expect(enviar).toHaveText('Registrar e aprovar');
    // Noutra data, o aviso e o botão armado não valem
    await enviar.click();
    await expect(enviar).toHaveText('Registrar mesmo assim');
    await mudarData(page, '2026-11-12');
    await expect(erro).toBeEmpty();
    await expect(enviar).toHaveText('Registrar e aprovar');
    await enviar.click();
    await expect(linhasDosPedidos(page)).toContainText(['Navegação · PA-34']);
  });

  // No máximo 6 voos locais (Voo Local, Voo Solo e TGL) no mesmo horário
  test('o 7º voo local no mesmo horário: o aviso, com o motivo e o próximo horário com vaga, pede a confirmação', async ({ page }) => {
    const alunos = Array.from({ length: 8 }, (_, i) => aluno(1000 + i));
    await abrir(page, { estado: cenario({ stu: alunos }) });
    await irPara(page, 'age');
    for (let i = 0; i < 6; i++) await registrarPedido(page, { aluno: `Aluno ${1000 + i}`, missao: ['Voo Local', 'TGL (TMA)'][i % 2], horario: '08:20' });
    await expect(linhasDosPedidos(page)).toHaveCount(6);
    await registrarPedido(page, { aluno: 'Aluno 1006', horario: '08:20' });
    await expect(campoDaAgenda(page, 'erro')).toHaveText('Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar mesmo assim');
    await expect(linhasDosPedidos(page)).toHaveCount(6);
    // Outra missão no mesmo horário não tem o limite
    await registrarPedido(page, { aluno: 'Aluno 1006', missao: 'Navegação', horario: '08:20' });
    await expect(linhasDosPedidos(page)).toHaveCount(7);
  });

  test('"Registrado por" é obrigatório', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await registrarPedido(page, { por: '' });
    await expect(linhasDosPedidos(page)).toHaveCount(0);
  });

  test('fora do prazo não registra; a exceção da coordenação registra marcado', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await campoDaAgenda(page, 'data').selectOption('2026-11-10');
    await expect(page.locator('#agenda-prazo')).toContainText('Prazo encerrado para 10/11');
    await expect(page.locator('#form-agenda [type="submit"]')).toBeDisabled();
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await campoDaAgenda(page, 'por').fill('Coordenação');
    await campoDaAgenda(page, 'excecao').click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para ter 10/11 pela Exceção da Coordenação.');
    // A lista é a da data aberta: o pedido está no dia 10
    await expect(linhasDosPedidos(page)).toHaveCount(0);
    await expect(contagemDoDia(page, '2026-11-10')).toHaveText('1');
    await mudarData(page, '2026-11-10');
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(linhasDosPedidos(page).first()).toContainText('Exceção da Coordenação');
  });

  // A data do pedido é um campo dele: a data aberta no app não muda, e o campo volta a ela quando ela muda
  test('a data do pedido não muda a data aberta; fica entre um registro e outro e volta quando outra data abre', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const data = campoDaAgenda(page, 'data');
    await expect(data).toHaveValue('2026-11-11');
    await expect(data.locator('option')).toHaveCount(13);
    await data.selectOption('2026-11-13');
    await expect(page.locator('#agenda-prazo')).toHaveText('Pedidos para sexta-feira (13/11) até quinta-feira (12/11) às 13:00.');
    await expect(data).toHaveAccessibleDescription('Pedidos para sexta-feira (13/11) até quinta-feira (12/11) às 13:00.');
    await expect(page.locator('#agenda-data')).toHaveText('quarta-feira, 11/11/2026');
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-11');
    await registrarPedido(page, { horario: '08:20' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para sex 13/11.');
    await expect(contagemDoDia(page, '2026-11-13')).toHaveText('1');
    await expect(data).toHaveValue('2026-11-13');
    // Os pedidos da data do campo valem para o aviso de voo já marcado; trocar a data desfaz a confirmação
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 13/11: Voo Local · C152 às 08:20.');
    await data.selectOption('2026-11-12');
    await expect(campoDaAgenda(page, 'erro')).toBeEmpty();
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar e aprovar');
    await mudarData(page, '2026-11-14');
    await expect(data).toHaveValue('2026-11-14');
  });

  // A data do campo pode ser a mesma enquanto a data aberta muda: os pedidos dela, lidos antes, podem ter mudado
  test('a data do pedido que continua a mesma: o aviso do voo já marcado vê o pedido registrado com ela aberta', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date('2026-11-10T13:30:00-03:00'));
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-12');
    await mudarData(page, '2026-11-12');
    await registrarPedido(page, { horario: '08:20' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await mudarData(page, '2026-11-11');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-12');
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 12/11: Voo Local · C152 às 08:20.');
    await expect(contagemDoDia(page, '2026-11-12')).toHaveText('1');
  });

  test('a data de hoje, já fechada, aberta: o pedido continua o de amanhã, com o aviso do voo já marcado', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await registrarPedido(page, { horario: '06:30' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await mudarData(page, '2026-11-10');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-11');
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 11/11: Voo Local · C152 às 06:30.');
    await expect(contagemDoDia(page, '2026-11-11')).toHaveText('1');
  });

  // O Gestor (deste navegador) não registra: os pedidos da data do campo são lidos quando o perfil passa a registrar, e as
  // datas seguem o perfil
  test('trocar o perfil para o Operador com a Agenda aberta: as datas da exceção e o aviso do voo já marcado', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date('2026-11-10T13:30:00-03:00'));
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await registrarPedido(page, { horario: '08:20' });
    await expect(contagemDoDia(page, '2026-11-12')).toHaveText('1');
    await abrir(page, { url: './?role=gestor' });
    await irPara(page, 'age');
    const primeira = campoDaAgenda(page, 'data').locator('option').first();
    await expect(primeira).toHaveText('qui 12/11');
    await page.locator('#role-sel').selectOption('operador');
    await expect(primeira).toHaveText('ter 10/11 (hoje) · prazo encerrado');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-12');
    await registrarPedido(page, { horario: '10:10' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 12/11: Voo Local · C152 às 08:20.');
    await expect(contagemDoDia(page, '2026-11-12')).toHaveText('1');
  });

  test('a data aberta além de duas semanas também está na data do pedido', async ({ page }) => {
    await abrir(page, { estado: comAlunos(), url: './?data=2026-12-18' });
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-12-18');
    await expect(campoDaAgenda(page, 'data').locator('option').last()).toHaveText('sex 18/12');
  });

  test('cancelar pede confirmação e o pedido continua na lista como cancelado', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await registrarPedido(page);
    await escolherPedido(page, 'Aluno 1000');
    const cancelar = acaoDoPedido(page, 'cancelar');
    await cancelar.click();
    await expect(cancelar).toHaveText('Confirmar cancelamento');
    await cancelar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido cancelado. O voo continua na demanda: “Tirar da escala”, no aviso, o tira.');
    const linha = linhasDosPedidos(page).first();
    await expect(linha).toContainText('Cancelado por Maria em 10/11 12:00 · Ainda na demanda');
    await expect(grupoDosPedidos(page, 'cancelados')).toBeVisible();
    await expect(contagemDoDia(page, '2026-11-11')).toHaveCount(0);
    // Esmaecido
    await expect(linha).toHaveClass(/\bapagado\b/);
    await expect(avisoDosPedidos(page)).toContainText('1 pedido cancelado ou sem aprovação ainda está na demanda: Aluno 1000 (Voo Local · C152 às 06:30).');
    // E: "Tirar da escala" é a conciliação: o voo do cancelado sai (ninguém espera a vaga), com a linha no Histórico
    await botaoDosPedidos(page, 'conciliar').click();
    await expect(page.locator('#toast-box')).toContainText('Demanda atualizada · 1 pedido cancelado ou sem aprovação saiu da escala: Aluno 1000.');
    await expect(avisoDosPedidos(page)).not.toContainText('ainda está na demanda');
    await expect(linha).not.toContainText('Ainda na demanda');
  });

  test('a linha diz se o aprovado está na demanda; na data sem escala gravada, "Importar", no aviso, o põe lá', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false })] }), url: './?data=2026-11-12' });
    await irPara(page, 'age');
    await registrarPedido(page, { aluno: 'Aluno 1000' });
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '12:40' });
    await expect(linhasDosPedidos(page)).toContainText(['· Fora da demanda', '· Fora da demanda']);
    await expect(avisoDosPedidos(page)).toContainText('2 pedidos aprovados fora da demanda.');
    await expect(page.locator('#linha a.tarefa[data-tarefa="fora-da-demanda"]')).toHaveAttribute('data-estado', 'atencao');
    await botaoDosPedidos(page, 'importar').click();
    await expect(linhasDosPedidos(page)).toContainText(['· Na demanda', '· Na demanda']);
    await expect(avisoDosPedidos(page)).toBeHidden();
    await expect(page.locator('#linha a.tarefa[data-tarefa="fora-da-demanda"]')).toHaveAttribute('data-estado', 'feito');
    await irPara(page, 'dem');
    await expect(caixaVoa(page.locator('#dem tr[data-k="d"][data-id="1001"]'))).toBeChecked();

    // Outra data aberta (também sem escala gravada): a linha e o aviso são dela
    await irPara(page, 'age');
    await mudarData(page, '2026-11-13');
    await registrarPedido(page, { aluno: 'Aluno 1000' });
    await expect(linhasDosPedidos(page)).toContainText(['· Fora da demanda']);
    await expect(avisoDosPedidos(page)).toContainText('1 pedido aprovado fora da demanda.');
    // De volta à data importada (já gravada), o aprovado entra na hora
    await mudarData(page, '2026-11-12');
    await registrarPedido(page, { aluno: 'Aluno 1000', horario: '14:30' });
    await expect(campoDaAgenda(page, 'erro')).toContainText('Aluno 1000 já tem voo marcado em 12/11');
    await botaoDoFormulario(page, 'aprovar').click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
  });

  test('"Importar pedidos aprovados", na Demanda, põe os aprovados da data na demanda, prontos para a escala', async ({ page }) => {
    const DATA = '2026-11-12';
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false })] }), url: `./?data=${DATA}` });
    await irPara(page, 'age');
    await registrarPedido(page, { aluno: 'Aluno 1000', horario: '08:20', horas: 2.5 });
    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'IFR', horario: '14:30' });
    // O que aguarda a aprovação não entra
    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'Navegação', horario: '16:20', botao: 'sem-aprovar' });

    await irPara(page, 'dem');
    await expect(botaoImportarDaAgenda(page)).toHaveText('Importar 2 pedidos aprovados');
    await importarDaAgenda(page);
    const linha = id => page.locator(`#dem tr[data-k="d"][data-id="${id}"][data-mid="0"]`);
    await expect(caixaVoa(linha(1000))).toBeChecked();
    await expect.poll(() => page.evaluate(data => JSON.parse(localStorage.getItem(`acpm4_dia_${data}`)).pedidos[1000].jan, DATA)).toBe('h500');
    await abrirRestricoes(page, 1000);
    await expect(campoDasRestricoes(page, 'nb')).toHaveValue('2.5');
    await fecharRestricoes(page);
    await expect(linha(1001).locator('[data-f="mis"]')).toHaveValue('IFR');
    await expect.poll(() => page.evaluate(data => JSON.parse(localStorage.getItem(`acpm4_dia_${data}`)).pedidos[1001].jan, DATA)).toBe('h870');
    await expect(page.locator('#audit-log-list')).toContainText('Pedidos: Aluno 1000 incluído (Voo Local · às 08:20 · 2,5 h)');
    expect(await page.evaluate(data => JSON.parse(localStorage.getItem(`acpm4_dia_${data}`)).importadas.length, DATA)).toBe(2);

    await importarDaAgenda(page);
    await expect(page.locator('#toast-box')).toContainText('Nenhum pedido aprovado fora da demanda em 12/11.');

    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => /Aluno 100[01]/.test(l));
    expect(voos.find(l => l.includes('Aluno 1000'))).toMatch(/^08:20–10:50/);
    expect(voos.find(l => l.includes('Aluno 1001'))).toMatch(/^14:30/);
  });

  test('depois das 13:00, a lista é a da data aberta, amanhã, e o pedido começa no dia seguinte', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date('2026-11-10T13:30:00-03:00'));
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(page.locator('#agenda-data')).toHaveText('quarta-feira, 11/11/2026');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-12');
    await expect(campoDaAgenda(page, 'data').locator('option').nth(0)).toHaveText('ter 10/11 (hoje) · prazo encerrado');
    await expect(campoDaAgenda(page, 'data').locator('option').nth(1)).toHaveText('qua 11/11 (amanhã) · prazo encerrado');
    await expect(campoDaAgenda(page, 'data').locator('option').nth(2)).toHaveText('qui 12/11');
    await expect(page.locator('#agenda-prazo')).toHaveText('Pedidos para quinta-feira (12/11) até amanhã (11/11) às 13:00.');
  });

  // Trabalhando numa data à frente, a agenda e as outras abas ficam nela
  test('a agenda segue a data aberta, e a data do pedido também', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await diaSeguinte(page);
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-13');
    await irPara(page, 'age');
    await expect(page.locator('#agenda-data')).toContainText('13/11/2026');
    await irPara(page, 'dem');
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-13');
    await irPara(page, 'age');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-13');
    await mudarData(page, '2026-11-16');
    await expect(page.locator('#agenda-data')).toContainText('16/11/2026');
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-16');
    await irPara(page, 'esc');
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-16');
  });

  test('recarregar a página continua na data aberta', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect(page).toHaveURL(/[?&]data=2026-11-12/);
    await page.reload();
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
  });

  // O aeroclube não opera aos domingos; os voos de segunda são agendados até sábado às 10:00
  test('sábado: o app abre na segunda; a agenda aceita pedidos para segunda até as 10:00; domingo não existe', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date('2026-11-14T09:00:00-03:00'));
    await abrir(page, { estado: comAlunos() });
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-16');
    await irPara(page, 'age');
    await expect(page.locator('#agenda-prazo')).toHaveText('Pedidos para segunda-feira (16/11) até hoje às 10:00.');
    await expect(campoDaAgenda(page, 'data').locator('option[value="2026-11-15"]')).toHaveCount(0);
    await expect(campoDaAgenda(page, 'data')).toHaveValue('2026-11-16');
    // Da segunda para o dia de operação anterior, o sábado
    await diaAnterior(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-14');
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-16');
  });

  test('um link para um domingo abre a segunda, com o aviso', async ({ page }) => {
    await abrir(page, { estado: comAlunos(), url: './?data=2026-11-15' });
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-16');
    await expect(page.locator('#toast-box')).toContainText('O aeroclube não opera aos domingos: abrimos segunda-feira, 16/11.');
  });
});

// O cronograma do PP (o modelo do app) e um PC com duas missões no PA-34, como as tabelas dos cursos os guardam (neste
// navegador, acpm4_cursos), com ids uuid
function cursoPP() {
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  return { ...novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, uuid).curso, versao: 1 };
}
const FASE_PC = '00000000-0000-4000-8100-000000000001';
const missaoPC = (n, codigo, mis, nb) => ({
  id: `00000000-0000-4000-8200-00000000000${n}`, fase: FASE_PC, codigo, nome: codigo, mis, eq: 'PA-34', nb, ordem: n, regra: 'ordem', requer: [],
  dispensada: false, avaliacao: false, removida: false
});
const CURSO_PC = {
  sigla: 'PC', nome: 'Piloto Comercial', ordem: 1, ativo: true, versao: 1, alteracoes: [],
  fases: [{ id: FASE_PC, nome: 'Fase 1 – Multimotor', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false }],
  missoes: [missaoPC(1, 'MLTE-01', 'Multimotor', 1.5), missaoPC(2, 'NAV-PA34', 'Navegação', 2)]
};
// A Maria e a Ana no PP, o Bruno no PC e o Aluno 1001 sem curso, nenhum voando; o cadastro e o dia no formato atual, os cursos e a agenda
// (pedidos já registrados) neste navegador
// limitacoes: as do aluno, pelo id (L)
async function abrirComOsCursos(page, { frota = null, agenda = [], url = './', limitacoes = {} } = {}) {
  const estado = cenario({ stu: [aluno(1000, { fly: false }, { nm: 'Maria', curso: 'PP' }), aluno(1001, { fly: false }), aluno(1002, { fly: false }, { nm: 'Ana', curso: 'PP' }),
    aluno(1003, { fly: false }, { nm: 'Bruno', curso: 'PC' })] });
  if (frota) estado.frota = frota;
  for (const s of estado.stu) if (limitacoes[s.id]) s.limitacoes = limitacoes[s.id];
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  const docs = {
    acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA], acpm4_agenda: agenda,
    acpm4_cursos: { cursos: cursosIniciais().map(c => (c.sigla === 'PP' ? cursoPP() : c.sigla === 'PC' ? CURSO_PC : c)), alteracoes: [] }
  };
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
  }, JSON.stringify(docs));
  await page.goto(url);
  await appPronto(page);
  await irPara(page, 'age');
}
// Um pedido já na agenda deste navegador (um voo local às 08:20 de amanhã, por padrão)
const pedidoGuardado = (id, extra = {}) => ({
  id, data: AMANHA, aluno: 2000 + id, aluno_nome: `Aluno ${2000 + id}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', horas: 1, recurso: 'C152',
  observacao: null, registrado_por: 'Maria', registrado_em: '2026-11-10T14:00:00.000Z', conta: null, excecao: false, cancelada_em: null, cancelada_por: null, ...extra
});
const seisLocais = (extra = {}) => Array.from({ length: 6 }, (_, i) => pedidoGuardado(i + 1, extra));
const agendaGuardada = page => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_agenda') || '[]'));

test.describe('A Agenda pelo curso do aluno', () => {
  const horarios = page => campoDaAgenda(page, 'horario').locator('option');

  test('o aluno de um curso: as missões do curso, por fase; a missão escolhe o recurso, a duração e os horários', async ({ page }) => {
    await abrirComOsCursos(page);
    const [missao, motivoDaMissao, recurso, horas, motivo] = ['missao', 'missao-motivo', 'recurso', 'horas', 'horario-motivo'].map(c => campoDaAgenda(page, c));
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Maria' });
    await expect(motivoDaMissao).toBeEmpty();
    await expect(missao.locator('optgroup')).toHaveCount(9);
    await expect(missao.locator('optgroup').first()).toHaveAttribute('label', 'Fase 1 – Introdução ao Voo');
    await expect(missao.locator('optgroup').nth(7)).toHaveAttribute('label', 'Fase 6 – Treinamento de Voo Noturno');
    await expect(missao.locator('optgroup').nth(7).locator('option')).toHaveText(['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h']);
    await expect(missaoDoCursoNaAgenda(page, 'NAV-150NM')).toHaveText('NAV-150NM · Navegação · C152 · 3 h');
    await expect(missaoDoCursoNaAgenda(page, 'ADAPT-C152')).toHaveCount(0);
    await expect(missao.locator('option', { hasText: 'Voo Local ·' })).not.toHaveCount(0);
    await expect(missao.locator('option[value="Voo Local"]')).toHaveCount(0);
    // A missão do curso tem um recurso: ele vem escolhido, e os horários e as horas são os dela
    await escolherMissaoDoCurso(page, 'NAV-150NM');
    await expect(recurso.locator('option')).toHaveText(['C152']);
    await expect(recurso).toHaveValue('C152');
    await expect(horas).toHaveValue('3');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', '06:30', '08:20', '10:10', '11:30', '12:40', '13:40', '14:30', '16:20']);
    await expect(motivo).toHaveText('8 horários do C152.');
    // O Noturno: o C172, as 4 h fixas e as 17:30
    await escolherMissaoDoCurso(page, 'NOT');
    await expect(recurso).toHaveValue('C172');
    await expect(horas).toHaveValue('4');
    await expect(horas).toBeDisabled();
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('17:30');
    // Registrado: a lista diz o código e o recurso, e o pedido guarda a missão do curso
    await escolherMissaoDoCurso(page, 'NAV-150NM');
    await expect(horas).toBeEnabled();
    await expect(horas).toHaveValue('3');
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '08:20', horas: 2.5 });
    await expect(linhasDosPedidos(page).first()).toContainText('NAV-150NM · C152');
    const [guardado] = await agendaGuardada(page);
    expect([guardado.missao, guardado.recurso, guardado.horas, guardado.missao_do_curso]).toEqual(['Navegação', 'C152', 2.5, cursoPP().missoes.find(m => m.codigo === 'NAV-150NM').id]);
  });

  test('a missão do curso no PA-34: os horários do PA-34', async ({ page }) => {
    await abrirComOsCursos(page);
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Bruno' });
    await expect(campoDaAgenda(page, 'missao').locator('optgroup option')).toHaveText(['MLTE-01 · Multimotor · PA-34 · 1,5 h', 'NAV-PA34 · Navegação · PA-34 · 2 h']);
    await escolherMissaoDoCurso(page, 'NAV-PA34');
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('PA-34');
    await expect(horarios(page)).toHaveText(['Escolha o horário…', ...DE_30_EM_30_DO_PA34]);
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('21 horários do PA-34.');
    await registrarPedido(page, { aluno: 'Bruno', codigo: 'NAV-PA34', horario: '07:30' });
    await expect(linhasDosPedidos(page).first()).toContainText('NAV-PA34 · PA-34');
    await expect(linhasDosPedidos(page).first()).toContainText('NAV-PA34 · PA-34 · 2 h');
    await expect(linhasDosPedidos(page).first().locator('.lista-meta')).toHaveText('07:30');
  });

  test('outro aluno do mesmo curso fica com a escolha; o de outro curso a perde, e o app diz', async ({ page }) => {
    await abrirComOsCursos(page);
    const [aluno, missao, motivoDaMissao, recurso, horario] = ['aluno', 'missao', 'missao-motivo', 'recurso', 'horario'].map(c => campoDaAgenda(page, c));
    await aluno.selectOption({ label: 'Maria' });
    await escolherMissaoDoCurso(page, 'NAV-150NM');
    await horario.selectOption('10:10');
    await aluno.selectOption({ label: 'Ana' });
    await expect(missao.locator('option:checked')).toHaveText('NAV-150NM · Navegação · C152 · 3 h');
    await expect(horario).toHaveValue('10:10');
    await expect(motivoDaMissao).toBeEmpty();
    // O aluno sem curso: a missão, o recurso e o horário saem, e o campo diz por quê
    await aluno.selectOption({ label: 'Aluno 1001' });
    await expect(missao).toHaveValue('');
    await expect(recurso).toBeDisabled();
    await expect(horario).toBeDisabled();
    await expect(motivoDaMissao).toHaveText('NAV-150NM não está entre as missões de Aluno 1001: escolha a missão. Aluno sem curso: escolha o tipo da missão.');
    await missao.selectOption('Voo Local');
    await expect(motivoDaMissao).toHaveText('Aluno sem curso: escolha o tipo da missão.');
    // Depois de registrar, a missão do curso espera o próximo aluno: o do mesmo curso a recebe
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '08:20' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(missao).toBeDisabled();
    await aluno.selectOption({ label: 'Ana' });
    await expect(missao.locator('option:checked')).toHaveText('NAV-150NM · Navegação · C152 · 3 h');
    await expect(horario).toHaveValue('08:20');
    await aluno.selectOption({ label: 'Bruno' });
    await expect(missao).toHaveValue('');
    await expect(motivoDaMissao).toHaveText('NAV-150NM não está entre as missões de Bruno: escolha a missão.');
  });

  test('o tipo sem nenhum recurso ativo é oferecido com "(nenhum ativo)", avisa e registra', async ({ page }) => {
    await abrirComOsCursos(page, { frota: FROTA_INICIAL.map(f => (f.tipo === 'PA-34' ? { ...f, inativo: true } : f)) });
    const recurso = campoDaAgenda(page, 'recurso');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Navegação');
    await expect(recurso.locator('option')).toHaveText(['Escolha o recurso…', 'C152', 'C172', 'PA-34 (nenhum ativo)']);
    await expect(campoDaAgenda(page, 'recurso-motivo')).toBeEmpty();
    await recurso.selectOption('PA-34');
    await expect(campoDaAgenda(page, 'recurso-motivo')).toHaveText('Nenhum PA-34 está ativo em Recursos: o pedido é registrado, e a escala só o põe num PA-34 ativo.');
    await expect(recurso).toHaveAccessibleDescription(/Nenhum PA-34 está ativo em Recursos/);
    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'Navegação', recurso: 'PA-34', horario: '07:30' });
    await expect(linhasDosPedidos(page).first()).toContainText('Navegação · PA-34');
  });

  test('o 7º voo local: o aviso arma "Registrar mesmo assim", e o pedido fica com quem confirmou', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: seisLocais() });
    const [erro, registrar] = [campoDaAgenda(page, 'erro'), page.locator('#form-agenda [type="submit"]')];
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20' });
    await expect(erro).toHaveText('Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    await registrar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect(registrar).toHaveText('Registrar e aprovar');
    const setimo = (await agendaGuardada(page)).at(-1);
    expect([setimo.aluno, setimo.limite_confirmado_por, Boolean(setimo.limite_confirmado_em)]).toEqual([1001, 'Maria', true]);
    // O voo já marcado confirmado sozinho não registra a confirmação do limite
    await registrarPedido(page, { aluno: 'Aluno 1001', missao: 'Navegação', horario: '10:10' });
    await expect(erro).toContainText('Aluno 1001 já tem voo marcado em 11/11');
    await registrar.click();
    await expect(linhasDosPedidos(page)).toHaveCount(8);
    const outro = (await agendaGuardada(page)).at(-1);
    expect([outro.missao, outro.limite_confirmado_por, outro.limite_confirmado_em]).toEqual(['Navegação', null, null]);
    // Com o 7º registrado, o aviso do seguinte conta os 7
    await registrarPedido(page, { aluno: 'Ana', codigo: 'IN-01', horario: '08:20' });
    await expect(erro).toHaveText('Horário cheio: já há 7 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 8º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
  });

  // O duplo clique arma a confirmação com o primeiro clique; o segundo, do mesmo duplo clique, não confirma o que o aviso
  // ainda nem disse. Também na Exceção da Coordenação, e no voo já marcado
  test('o duplo clique no botão arma a confirmação e não registra: confirma só um clique depois do aviso', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [...seisLocais(), ...seisLocais({ data: '2026-11-10' }).map((p, i) => ({ ...p, id: 20 + i }))] });
    const [erro, registrar, excecao] = [campoDaAgenda(page, 'erro'), page.locator('#form-agenda [type="submit"]'), campoDaAgenda(page, 'excecao')];
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await campoDaAgenda(page, 'por').fill('Maria');
    await registrar.dblclick();
    await expect(erro).toContainText('Horário cheio: já há 6 voos locais');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    await expect(linhasDosPedidos(page)).toHaveCount(6);
    expect(await agendaGuardada(page)).toHaveLength(12);
    await registrar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    expect((await agendaGuardada(page)).at(-1).limite_confirmado_por).toBe('Maria');
    // O voo já marcado: o duplo clique também só arma
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Navegação');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('10:10');
    await registrar.dblclick();
    await expect(erro).toContainText('Aluno 1001 já tem voo marcado em 11/11');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    expect(await agendaGuardada(page)).toHaveLength(13);
    // Depois do prazo, a Exceção da Coordenação
    await campoDaAgenda(page, 'data').selectOption('2026-11-10');
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('TGL (TMA)');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await excecao.dblclick();
    await expect(erro).toContainText('Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(excecao).toHaveText('Registrar mesmo assim');
    expect(await agendaGuardada(page)).toHaveLength(13);
    await excecao.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para ter 10/11 pela Exceção da Coordenação.');
    expect((await agendaGuardada(page)).at(-1).limite_confirmado_por).toBe('Maria');
  });

  test('as duas causas numa confirmação só; a que aparece depois (o 7º registrado enquanto isso) pede de novo', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [...seisLocais().slice(0, 5), pedidoGuardado(9, { aluno: 1001, aluno_nome: 'Aluno 1001', missao: 'Navegação', horario: '10:10' })] });
    const [erro, registrar] = [campoDaAgenda(page, 'erro'), page.locator('#form-agenda [type="submit"]')];
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20' });
    await expect(erro).toHaveText('Aluno 1001 já tem voo marcado em 11/11: Navegação · C152 às 10:10. É um reagendamento ou mais um voo? Para registrar mais este, clique em “Registrar mesmo assim”.');
    // Outra pessoa registra o 6º local às 08:20 (este navegador não lê de novo): quem recusa é a regra do registro, e o
    // aviso passa a dizer as duas causas
    await page.evaluate(p => localStorage.setItem('acpm4_agenda', JSON.stringify([...JSON.parse(localStorage.getItem('acpm4_agenda')), p])), pedidoGuardado(6));
    await registrar.click();
    await expect(erro).toHaveText('Aluno 1001 já tem voo marcado em 11/11: Navegação · C152 às 10:10. É um reagendamento ou mais um voo? Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar mesmo assim, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    await registrar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    expect((await agendaGuardada(page)).at(-1).limite_confirmado_por).toBe('Maria');
  });

  test('depois do prazo, pela Exceção da Coordenação: é ela que vira "Registrar mesmo assim"', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: seisLocais({ data: '2026-11-10' }) });
    const excecao = campoDaAgenda(page, 'excecao');
    await campoDaAgenda(page, 'data').selectOption('2026-11-10');
    await expect(page.locator('#form-agenda [type="submit"]')).toBeDisabled();
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('TGL (TMA)');
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await campoDaAgenda(page, 'por').fill('Coordenação');
    await excecao.click();
    await expect(campoDaAgenda(page, 'erro')).toContainText('Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(excecao).toHaveText('Registrar mesmo assim');
    await expect(page.locator('#form-agenda [type="submit"]')).toHaveText('Registrar e aprovar');
    await expect(page.locator('#form-agenda [type="submit"]')).toBeDisabled();
    // Desarmada (outro horário), ela volta a ser a Exceção da Coordenação
    await campoDaAgenda(page, 'horario').selectOption('10:10');
    await expect(excecao).toHaveText('Exceção da Coordenação');
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await excecao.click();
    await excecao.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado para ter 10/11 pela Exceção da Coordenação.');
    await expect(excecao).toHaveText('Exceção da Coordenação');
    const setimo = (await agendaGuardada(page)).at(-1);
    expect([setimo.data, setimo.excecao, setimo.limite_confirmado_por]).toEqual(['2026-11-10', true, 'Coordenação']);
  });
});

// Na entrada do dia (a importação), a missão do curso do pedido é a etapa do voo, com o curso dela: a escala e a Lista
// mostram o código, também com o progresso desligado (o padrão do app)
test.describe('A missão do curso do pedido na demanda e na escala', () => {
  const diaGuardado = page => page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)), AMANHA);

  test('com o progresso desligado, o pedido entra com a missão do curso dele, e a Lista mostra o código', async ({ page }) => {
    await abrirComOsCursos(page);
    // Registrado e aprovado na data já gravada, ele entra na demanda na hora
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '08:20' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect(page.locator('#toast-box')).not.toContainText('sem missão do curso');
    await expect.poll(async () => { const p = (await diaGuardado(page)).pedidos[1000]; return p && [p.mis, p.etapa, p.cursoDaEtapa, p.eq, p.nb]; })
      .toEqual(['Navegação', 'NAV-150NM', 'PP', 'C152', 3]);
    // A Lista mostra o código ao lado do status, e o CSV, "NAV-150NM · Navegação" (como antes de o progresso ser desligado)
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Maria'))).toMatch(/^08:20–11:20 3 h \| Maria \| Navegação \| PP-LJV C152/);
    await expect(page.locator('#out tbody tr', { hasText: 'Maria' }).locator('.etapa')).toHaveText('NAV-150NM');
    const [download] = await exportar(page, 'csv');
    expect(readFileSync(await download.path(), 'utf8')).toContain('NAV-150NM · Navegação');
  });

  test('o pedido de antes, sem missão do curso: com o progresso desligado, nada é inferido nem dito', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [pedidoGuardado(1, { aluno: 1000, aluno_nome: 'Maria', missao: 'Navegação', recurso: 'PA-34', horario: '07:30' })] });
    await page.locator('#agenda-importar').click();
    await expect(page.locator('#toast-box')).toContainText('1 pedido(s) na demanda.');
    await expect(page.locator('#toast-box')).not.toContainText('sem missão do curso');
    await expect.poll(async () => { const p = (await diaGuardado(page)).pedidos[1000]; return p && [p.mis, p.etapa ?? null, p.eq]; }).toEqual(['Navegação', null, 'PA-34']);
  });
});

comProgresso.describe('A missão do curso do pedido, com o progresso ligado', () => {
  comProgresso('o pedido de antes sem missão do curso, num recurso que nenhuma liberada tem: entra como veio, e o app diz', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [pedidoGuardado(1, { aluno: 1000, aluno_nome: 'Maria', missao: 'Navegação', recurso: 'PA-34', horario: '07:30' })] });
    await page.locator('#agenda-importar').click();
    await expect(page.locator('#toast-box')).toContainText('1 pedido(s) na demanda · 1 pedido sem missão do curso: nenhuma Navegação liberada é no PA-34.');
  });

  // A missão do curso que saiu do programa depois do registro não entra; com o progresso ligado, a próxima do programa entra
  // no lugar dela, e o app diz qual (não "pelo tipo da missão")
  comProgresso('a missão do curso do pedido que saiu do programa: entra a próxima do programa, e o app diz qual', async ({ page }) => {
    await abrirComOsCursos(page);
    // Registrado sem aprovar: a missão do curso sai do programa antes da aprovação
    await registrarPedido(page, { aluno: 'Maria', codigo: 'IN-01', horario: '08:20', botao: 'sem-aprovar' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await page.evaluate(() => {
      const guardado = JSON.parse(localStorage.getItem('acpm4_cursos'));
      guardado.cursos.find(c => c.sigla === 'PP').missoes.find(m => m.codigo === 'IN-01').removida = true;
      localStorage.setItem('acpm4_cursos', JSON.stringify(guardado));
    });
    await page.reload();
    await appPronto(page);
    await irPara(page, 'age');
    await aprovarNaLinha(page, 'Maria').click();
    await expect.poll(() => page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)).pedidos[1000]?.etapa, AMANHA)).toMatch(/^IN-/);
    const etapa = await page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)).pedidos[1000].etapa, AMANHA);
    await expect(page.locator('#toast-box')).toContainText(`Pedido aprovado: já está na demanda · 1 pedido com a missão do curso fora do programa: entrou como ${etapa}.`);
    await expect(page.locator('#toast-box')).not.toContainText('pelo tipo da missão');
  });

  comProgresso('a missão do curso do pedido vale mais que a próxima do programa', async ({ page }) => {
    await abrirComOsCursos(page);
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '08:20' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect.poll(() => page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)).pedidos[1000]?.etapa, AMANHA)).toBe('NAV-150NM');
  });
});

// A página dos pedidos (D2): a lista da data aberta por estado (o componente de lista e detalhe), "Aprovar" na linha do que
// aguarda, "Aprovar todos", o detalhe só de leitura com "Retirar aprovação", "Cancelar pedido" e "Registrar de novo…", o
// formulário com a 2ª preferência e os dois botões do 7º voo local, e a entrada do aprovado na demanda: na hora, só na data
// aberta já gravada; senão, "Importar"
test.describe('A página dos pedidos', () => {
  // Os pedidos guardados com as colunas da aprovação (a conversão de antes da aprovação não mexe neles)
  const comAprovacao = (id, extra = {}) => pedidoGuardado(id, { aprovada_em: null, aprovada_por: null, aprovacao_retirada_em: null, aprovacao_retirada_por: null, horario2: null, ...extra });
  const aprovadoGuardado = (id, extra = {}) => comAprovacao(id, { aprovada_em: '2026-11-10T14:30:00.000Z', aprovada_por: 'Operador', ...extra });
  const daMaria = { aluno: 1000, aluno_nome: 'Maria' }, doAluno1001 = { aluno: 1001, aluno_nome: 'Aluno 1001' }, daAna = { aluno: 1002, aluno_nome: 'Ana' };
  const diaGuardadoDe = (page, data = AMANHA) => page.evaluate(d => JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)), data);

  test('a lista por estado: os que aguardam, com "Aprovar"; os aprovados; os cancelados esmaecidos; o cartão', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [
      comAprovacao(1, daMaria), aprovadoGuardado(2, { ...doAluno1001, horario: '10:10' }),
      comAprovacao(3, { ...daAna, cancelada_em: '2026-11-10T14:40:00.000Z', cancelada_por: 'Ana' })
    ] });
    await expect(page.locator('#s-age h2')).toHaveText('Pedidos');
    await expect(grupoDosPedidos(page, 'aguardando')).toContainText('Aguardando aprovação');
    await expect(grupoDosPedidos(page, 'aprovados')).toContainText('Aprovados');
    await expect(grupoDosPedidos(page, 'cancelados')).toContainText('Cancelados');
    await expect(linhasDosPedidos(page)).toHaveCount(3);
    await expect(linhasDosPedidos(page).locator('.lista-titulo')).toHaveText(['Maria', 'Aluno 1001', 'Ana']);
    await expect(linhaDaLista(page, 1)).toContainText('Maria');
    await expect(linhaDaLista(page, 1)).toContainText('Voo Local · C152 · 1 h');
    await expect(linhaDaLista(page, 1)).toContainText('08:20');
    await expect(linhaDaLista(page, 1)).toContainText('Registrado por Maria às 11:00');
    await expect(aprovarNaLinha(page, 1)).toHaveAccessibleName('Aprovar o pedido de Maria (Voo Local · C152 às 08:20)');
    await expect(aprovarNaLinha(page, 2)).toHaveCount(0);
    await expect(linhaDaLista(page, 2)).toContainText('Aprovado por Operador às 11:30 · Fora da demanda');
    await expect(linhaDaLista(page, 3)).toHaveClass(/\bapagado\b/);
    // Recolhido, o grupo fica só com o cabeçalho
    await grupoDosPedidos(page, 'cancelados').click();
    await expect(linhaDaLista(page, 3)).toHaveCount(0);
    await grupoDosPedidos(page, 'cancelados').click();
    await expect(linhaDaLista(page, 3)).toContainText('Cancelado por Ana em 10/11 11:40');
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toHaveText('Aprovar todos (1)');
    // O cartão Pedidos: os registrados, os que aguardam (pedem atenção), os aprovados e os aprovados fora da demanda
    await expect(page.locator('#linha a.tarefa[data-tarefa="aguardando"]')).toHaveAttribute('data-estado', 'atencao');
    await expect(page.locator('#linha a.tarefa[data-tarefa="aprovados"] .tarefa-valor')).toHaveText('1 de 2');
    await expect(page.locator('#linha a.tarefa[data-tarefa="fora-da-demanda"] .tarefa-valor')).toHaveText('1');
    await expect(avisoDosPedidos(page)).toContainText('1 pedido aprovado fora da demanda');
  });

  test('"Aprovar" na linha: na data aberta já gravada, o pedido entra na demanda na hora, e o Histórico diz', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, doAluno1001)] });
    await aprovarNaLinha(page, 1).click();
    await expect(page.locator('#toast-box')).toContainText('Pedido aprovado: já está na demanda.');
    await expect(linhaDaLista(page, 1)).toContainText('Aprovado por Operador às 12:00 · Na demanda');
    await expect(grupoDosPedidos(page, 'aguardando')).toHaveCount(0);
    await expect.poll(async () => (await diaGuardadoDe(page)).importadas).toEqual([1]);
    await expect(entradasDoHistorico(page, 'Pedidos: Aluno 1001 incluído (Voo Local · às 08:20 · 1 h)')).toHaveCount(1);
    await irPara(page, 'dem');
    await expect(caixaVoa(linhaDoPedido(page, 1001))).toBeChecked();
  });

  test('"Aprovar todos" aprova só os que a busca mostra', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, daMaria), comAprovacao(2, { ...daAna, horario: '10:10' }), comAprovacao(3, { ...doAluno1001, horario: '12:40' })] });
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toHaveText('Aprovar todos (3)');
    await buscaDosPedidos(page).fill('ana');
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toHaveText('Aprovar os filtrados (1)');
    await botaoDosPedidos(page, 'aprovar-todos').click();
    await expect(page.locator('#toast-box')).toContainText('1 pedido aprovado: já está na demanda.');
    await buscaDosPedidos(page).fill('');
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toHaveText('Aprovar todos (2)');
    expect((await agendaGuardada(page)).filter(s => s.aprovada_em).map(s => s.id)).toEqual([2]);
  });

  test('o detalhe, só de leitura: a missão do curso e o recurso; "Retirar aprovação" pede o segundo clique; "Registrar de novo…" preenche o formulário; "Cancelar pedido"', async ({ page }) => {
    await abrirComOsCursos(page);
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', horario: '08:20', horario2: '10:10', obs: 'Leva o fone' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    const { id } = (await agendaGuardada(page)).at(-1);
    await escolherPedido(page, id);
    await expect(page.locator('#form-agenda')).toBeHidden();
    await expect(page.locator('#det-age-titulo')).toHaveText('Maria');
    await expect(campoDoDetalhe(page, 'Missão')).toHaveText('Navegação');
    await expect(campoDoDetalhe(page, 'Missão do curso')).toHaveText('NAV-150NM');
    await expect(campoDoDetalhe(page, 'Recurso')).toHaveText('C152');
    await expect(campoDoDetalhe(page, '1ª preferência')).toHaveText('08:20');
    await expect(campoDoDetalhe(page, '2ª preferência')).toHaveText('10:10');
    await expect(campoDoDetalhe(page, 'Duração')).toHaveText('3 h');
    await expect(campoDoDetalhe(page, 'Observação')).toHaveText('Leva o fone');
    await expect(campoDoDetalhe(page, 'Situação')).toHaveText('Aprovado por Maria em 10/11 12:00');
    await expect(campoDoDetalhe(page, 'Demanda')).toHaveText('Na demanda');
    // Nada se edita no detalhe
    await expect(page.locator('#det-age .det input, #det-age .det select')).toHaveCount(0);

    await acaoDoPedido(page, 'retirar').click();
    await expect(acaoDoPedido(page, 'retirar')).toHaveText('Confirmar retirada');
    await acaoDoPedido(page, 'retirar').click();
    await expect(page.locator('#toast-box')).toContainText('Aprovação retirada: o pedido volta a aguardar. O voo continua na demanda: “Tirar da escala”, no aviso, o tira.');
    await expect(campoDoDetalhe(page, 'Situação')).toHaveText('Aguardando aprovação');
    await expect(campoDoDetalhe(page, 'Aprovação retirada')).toHaveText('por Maria em 10/11 12:00');
    await expect(campoDoDetalhe(page, 'Demanda')).toHaveText('Ainda na demanda');

    await acaoDoPedido(page, 'repetir').click();
    await expect(page.locator('#form-agenda')).toBeVisible();
    await expect(campoDaAgenda(page, 'aluno')).toBeFocused();
    await expect(campoDaAgenda(page, 'aluno')).toHaveValue('1000');
    await expect(campoDaAgenda(page, 'missao')).toHaveValue(await missaoDoCursoNaAgenda(page, 'NAV-150NM').getAttribute('value'));
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('C152');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('08:20');
    await expect(campoDaAgenda(page, 'horario2')).toHaveValue('10:10');
    await expect(campoDaAgenda(page, 'horas')).toHaveValue('3');
    await expect(campoDaAgenda(page, 'obs')).toHaveValue('Leva o fone');

    await escolherPedido(page, id);
    await acaoDoPedido(page, 'cancelar').click();
    await expect(acaoDoPedido(page, 'cancelar')).toHaveText('Confirmar cancelamento');
    await acaoDoPedido(page, 'cancelar').click();
    await expect(page.locator('#toast-box')).toContainText('Pedido cancelado.');
    await expect(campoDoDetalhe(page, 'Situação')).toHaveText('Cancelado por Maria em 10/11 12:00');
    await expect(acaoDoPedido(page, 'cancelar')).toHaveCount(0);
    await expect(acaoDoPedido(page, 'repetir')).toBeVisible();
  });

  test('registrar e aprovar numa data sem escala gravada não grava a data; "Importar" põe o pedido na demanda', async ({ page }) => {
    await abrir(page, { estado: comAlunos(), url: './?data=2026-11-12' });
    await irPara(page, 'age');
    await registrarPedido(page);
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado. A escala desta data ainda não foi gravada: “Importar” o põe na demanda.');
    expect(await page.evaluate(() => localStorage.getItem('acpm4_dia_2026-11-12'))).toBeNull();
    await expect(avisoDosPedidos(page)).toContainText('1 pedido aprovado fora da demanda');
    await expect(linhaDaLista(page, 'Aluno 1000')).toContainText('· Fora da demanda');
    await botaoDosPedidos(page, 'importar').click();
    await expect(page.locator('#toast-box')).toContainText('1 pedido(s) na demanda.');
    await expect.poll(async () => (await diaGuardadoDe(page, '2026-11-12'))?.importadas).toHaveLength(1);
    await expect(avisoDosPedidos(page)).toBeHidden();
    await expect(linhaDaLista(page, 'Aluno 1000')).toContainText('· Na demanda');
    // O Histórico diz o que entrou, com "Pedidos:"
    await expect(entradasDoHistorico(page, 'Pedidos: Aluno 1000 incluído (Voo Local · às 06:30 · 1 h)')).toHaveCount(1);
  });

  test('"Registrar sem aprovar": o pedido aguarda aprovação, fora da demanda; o aviso, a linha de estado e a linha à vista', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    await expect(botaoDoFormulario(page, 'aprovar')).toHaveText('Registrar e aprovar');
    await expect(botaoDoFormulario(page, 'sem-aprovar')).toHaveText('Registrar sem aprovar');
    await registrarPedido(page, { botao: 'sem-aprovar', horario: '12:40' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado: aguardando aprovação.');
    await expect(estadoDoFormulario(page)).toHaveText('Último pedido: Aluno 1000 · Voo Local · C152 às 12:40 · aguardando aprovação.');
    const { id } = (await agendaGuardada(page)).at(-1);
    await expect(linhaDaLista(page, id)).toHaveAttribute('data-recente', '');
    await expect(linhaDaLista(page, id)).toBeInViewport();
    await expect(linhaDaLista(page, id)).toContainText('Registrado por Maria às 12:00');
    expect((await diaGuardadoDe(page)).importadas || []).toEqual([]);
    // Aprovado depois, entra
    await aprovarNaLinha(page, id).click();
    await expect(page.locator('#toast-box')).toContainText('Pedido aprovado: já está na demanda.');
    await expect.poll(async () => (await diaGuardadoDe(page)).importadas).toEqual([id]);
  });

  test('a 2ª preferência: desligada até a missão e o recurso; os horários do recurso, sem a 1ª; a que deixa de valer sai, e o app diz', async ({ page }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const segunda = campoDaAgenda(page, 'horario2'), motivo = campoDaAgenda(page, 'horario2-motivo');
    await expect(segunda).toBeDisabled();
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await expect(segunda).toBeDisabled();
    await campoDaAgenda(page, 'recurso').selectOption('C152');
    await expect(segunda).toBeEnabled();
    await expect(segunda.locator('option')).toHaveText(['—', '06:30', '08:20', '10:10', '11:30', '12:40', '13:40', '14:30', '16:20']);
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await expect(segunda.locator('option')).toHaveText(['—', '06:30', '10:10', '11:30', '12:40', '13:40', '14:30', '16:20']);
    await segunda.selectOption('10:10');
    // A 1ª passa a ser a 2ª: a 2ª sai, e o app diz
    await campoDaAgenda(page, 'horario').selectOption('10:10');
    await expect(segunda).toHaveValue('');
    await expect(motivo).toHaveText('A 2ª preferência era 10:10, agora a 1ª: escolha outra, se houver.');
    // O PA-34 tem outros horários: a 2ª que ele não tem sai
    await segunda.selectOption('16:20');
    await campoDaAgenda(page, 'recurso').selectOption('PA-34');
    await expect(segunda).toHaveValue('');
    await expect(motivo).toHaveText('A 2ª preferência 16:20 não é um dos horários de Voo Local (PA-34): escolha outra, se houver.');
    // O Noturno sai sempre às 17:30: sem 2ª preferência
    await campoDaAgenda(page, 'missao').selectOption('Noturno');
    await expect(segunda).toBeDisabled();
    await expect(motivo).toHaveText('Um horário só: sem 2ª preferência.');
    // Registrada, fica no pedido
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20', horario2: '12:40' });
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado');
    expect((await agendaGuardada(page)).at(-1).horario2).toBe('12:40');
    await expect(linhaDaLista(page, 'Aluno 1001')).toContainText('Voo Local · C152 · 1 h · 2ª 12:40');
  });

  test('o 7º voo local: "Registrar na lista de espera" registra sem a confirmação; "Registrar mesmo assim" continua registrando quem confirmou', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: seisLocais() });
    const [erro, registrar, esperar] = [campoDaAgenda(page, 'erro'), botaoDoFormulario(page, 'aprovar'), botaoDoFormulario(page, 'esperar')];
    await expect(esperar).toBeHidden();
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20' });
    await expect(erro).toHaveText('Horário cheio: já há 6 voos locais (Voo Local, Voo Solo e TGL) às 08:20, o máximo no mesmo horário (determinação da diretoria). Próximo horário com vaga: 10:10. Para registrar este como o 7º, clique em “Registrar mesmo assim”; para ele esperar uma vaga às 08:20, em “Registrar na lista de espera”.');
    await expect(registrar).toHaveText('Registrar mesmo assim');
    await expect(esperar).toBeVisible();
    await esperar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado na lista de espera das 08:20: já há 6 voos locais.');
    await expect(estadoDoFormulario(page)).toHaveText('Último pedido: Aluno 1001 · Voo Local · C152 às 08:20 · na lista de espera, aprovado, na demanda.');
    await expect(esperar).toBeHidden();
    // O botão saiu: o foco fica no formulário, no envio
    await expect(registrar).toBeFocused();
    await expect(registrar).toHaveText('Registrar e aprovar');
    const espera = (await agendaGuardada(page)).at(-1);
    expect([espera.aluno, espera.limite_confirmado_por, espera.limite_confirmado_em, Boolean(espera.aprovada_em)]).toEqual([1001, null, null, true]);
    // A lista de espera é do pedido armado: outro horário a desarma
    await registrarPedido(page, { aluno: 'Ana', codigo: 'IN-01', horario: '08:20' });
    await expect(esperar).toBeVisible();
    await campoDaAgenda(page, 'horario').selectOption('10:10');
    await expect(esperar).toBeHidden();
    await campoDaAgenda(page, 'horario').selectOption('08:20');
    await registrar.click();
    await expect(erro).toContainText('já há 7 voos locais');
    await registrar.click();
    await expect(page.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    const setimo = (await agendaGuardada(page)).at(-1);
    expect([setimo.aluno, setimo.limite_confirmado_por, Boolean(setimo.limite_confirmado_em)]).toEqual([1002, 'Maria', true]);
  });

  test('numa data que já passou: nenhum "Aprovar", e o que aguarda fica "Sem aprovação"', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, { ...doAluno1001, data: '2026-11-09' })], url: './?data=2026-11-09' });
    await expect(linhaDaLista(page, 1)).toContainText('Sem aprovação');
    await expect(aprovarNaLinha(page, 1)).toHaveCount(0);
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toBeHidden();
    await expect(page.locator('#linha a.tarefa[data-tarefa="aguardando"]')).toHaveAttribute('data-estado', 'nenhum');
  });

  // O último aviso (os de antes ainda podem estar na caixa)
  const ultimoAviso = page => page.locator('#toast-box .toast').last();

  test('aprovar de novo depois de "Retirar aprovação": o voo continuou na demanda, e o aviso diz que ele já está lá', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, doAluno1001)] });
    await aprovarNaLinha(page, 1).click();
    await expect(ultimoAviso(page)).toHaveText('Pedido aprovado: já está na demanda.');
    await escolherPedido(page, 1);
    await acaoDoPedido(page, 'retirar').click();
    await acaoDoPedido(page, 'retirar').click();
    await expect(ultimoAviso(page)).toContainText('Aprovação retirada');
    await expect(campoDoDetalhe(page, 'Demanda')).toHaveText('Ainda na demanda');
    await acaoDoPedido(page, 'aprovar').click();
    await expect(campoDoDetalhe(page, 'Demanda')).toHaveText('Na demanda');
    await expect(ultimoAviso(page)).toHaveText('Pedido aprovado: já está na demanda.');
    await expect(page.locator('#toast-box')).not.toContainText('não está ativo');
    // Nada entrou de novo: o Histórico tem a entrada da primeira aprovação só
    await expect(entradasDoHistorico(page, 'Pedidos: Aluno 1001 incluído (Voo Local · às 08:20 · 1 h)')).toHaveCount(1);
  });

  test('cancelar o pedido que já foi cancelado em outro computador: o aviso diz, e a lista mostra o cancelamento', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, doAluno1001)] });
    await escolherPedido(page, 1);
    // Em outra janela, alguém já o cancelou: esta ainda não leu de novo
    await page.evaluate(() => {
      const lista = JSON.parse(localStorage.getItem('acpm4_agenda'));
      Object.assign(lista[0], { cancelada_em: '2026-11-10T14:50:00.000Z', cancelada_por: 'Ana' });
      localStorage.setItem('acpm4_agenda', JSON.stringify(lista));
    });
    await acaoDoPedido(page, 'cancelar').click();
    await acaoDoPedido(page, 'cancelar').click();
    await expect(ultimoAviso(page)).toHaveText('O pedido já tinha sido cancelado em outro computador.');
    await expect(campoDoDetalhe(page, 'Situação')).toHaveText('Cancelado por Ana em 10/11 11:50');
  });

  test('pelo teclado, o foco fica na tela depois de cada ação: "Aprovar" na linha, "Aprovar todos" e, no detalhe, "Retirar aprovação", "Aprovar pedido" e "Cancelar pedido"', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: [comAprovacao(1, daMaria), comAprovacao(2, { ...daAna, horario: '10:10' }), comAprovacao(3, { ...doAluno1001, horario: '12:40' })] });
    // O foco num elemento à vista, dentro de um lugar da tela (nunca no body)
    const focoEm = lugar => page.evaluate(sel => {
      const a = document.activeElement;
      return Boolean(a) && a !== document.body && a.getClientRects().length > 0 && Boolean(a.closest(sel));
    }, lugar);
    // "Aprovar" na linha: o botão sai com a linha (ela vai para os aprovados), e o foco fica na linha que tomou o lugar dela
    // (o componente de lista: a do pedido seguinte, que aguarda)
    await aprovarNaLinha(page, 1).focus();
    await page.keyboard.press('Enter');
    await expect(ultimoAviso(page)).toHaveText('Pedido aprovado: já está na demanda.');
    await expect(linhaDaLista(page, 2)).toBeFocused();
    // "Aprovar todos": aprovados os dois que aguardavam, o botão sai, e o foco vai para a lista
    await botaoDosPedidos(page, 'aprovar-todos').focus();
    await page.keyboard.press('Enter');
    await expect(ultimoAviso(page)).toHaveText('2 pedidos aprovados: já estão na demanda.');
    await expect(botaoDosPedidos(page, 'aprovar-todos')).toBeHidden();
    await expect.poll(() => focoEm('#age')).toBe(true);
    // No detalhe: cada ação troca o rodapé, e o foco fica no detalhe
    await escolherPedido(page, 1);
    await acaoDoPedido(page, 'retirar').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(ultimoAviso(page)).toContainText('Aprovação retirada');
    await expect(acaoDoPedido(page, 'retirar')).toHaveCount(0);
    await expect.poll(() => focoEm('#det-age')).toBe(true);
    await acaoDoPedido(page, 'aprovar').focus();
    await page.keyboard.press('Enter');
    await expect(ultimoAviso(page)).toHaveText('Pedido aprovado: já está na demanda.');
    await expect(acaoDoPedido(page, 'aprovar')).toHaveCount(0);
    await expect.poll(() => focoEm('#det-age')).toBe(true);
    await acaoDoPedido(page, 'cancelar').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(ultimoAviso(page)).toContainText('Pedido cancelado.');
    await expect(acaoDoPedido(page, 'cancelar')).toHaveCount(0);
    await expect.poll(() => focoEm('#det-age')).toBe(true);
  });

  test('"Registrar de novo…" com horários que a lista de agora não tem: os dois saem, e o app diz', async ({ page }) => {
    // 07:30 e 07:45 não são horários do C152 (a lista mudou depois do registro)
    await abrirComOsCursos(page, { agenda: [aprovadoGuardado(1, { ...doAluno1001, horario: '07:30', horario2: '07:45' })] });
    await escolherPedido(page, 1);
    await acaoDoPedido(page, 'repetir').click();
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('C152');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('O horário 07:30 não é um dos de Voo Local (C152). Escolha outro.');
    await expect(campoDaAgenda(page, 'horario2')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario2-motivo')).toHaveText('A 2ª preferência 07:45 não é um dos horários de Voo Local (C152): escolha outra, se houver.');
  });

  test('a lista de espera diz também se o pedido aguarda aprovação, na linha de estado', async ({ page }) => {
    await abrirComOsCursos(page, { agenda: seisLocais() });
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20', botao: 'sem-aprovar' });
    await expect(botaoDoFormulario(page, 'esperar')).toBeVisible();
    await botaoDoFormulario(page, 'esperar').click();
    await expect(ultimoAviso(page)).toHaveText('Pedido registrado na lista de espera das 08:20: já há 6 voos locais.');
    await expect(estadoDoFormulario(page)).toHaveText('Último pedido: Aluno 1001 · Voo Local · C152 às 08:20 · na lista de espera, aguardando aprovação.');
    expect(Boolean((await agendaGuardada(page)).at(-1).aprovada_em)).toBe(false);
  });

  test('no celular, a linha do pedido registrado fica à vista na volta para a lista, com o foco nela', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirComOsCursos(page, { agenda: Array.from({ length: 12 }, (_, i) => aprovadoGuardado(i + 1, { horario: '06:30' })) });
    await botaoDosPedidos(page, 'novo').click();
    await expect(page.locator('#s-age')).toHaveAttribute('data-vendo', 'detalhe');
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '16:20' });
    await expect(ultimoAviso(page)).toContainText('Pedido registrado e aprovado');
    const { id } = (await agendaGuardada(page)).at(-1);
    await page.goBack();
    await expect(page.locator('#s-age')).toHaveAttribute('data-vendo', 'lista');
    await expect(linhaDaLista(page, id)).toHaveAttribute('data-recente', '');
    await expect(linhaDaLista(page, id)).toBeInViewport();
    await expect(linhaDaLista(page, id).locator('.lista-botao')).toBeFocused();
  });
});

// D3: no modo local, outra aba deste navegador que registra um pedido: esta aba o lê na hora (o evento storage), com o
// aviso das novidades; o pedido que esta aba registra não é novidade para ela
test.describe('Os pedidos em dia (modo local)', () => {
  test('o pedido registrado em outra aba aparece nesta, com o aviso; o desta aba, sem aviso de novidade', async ({ page, context }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const outra = await context.newPage();
    await abrir(outra, { estado: comAlunos() });
    await irPara(outra, 'age');
    await registrarPedido(outra, { horario: '08:20' });
    await expect(outra.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(page.locator('#toast-box')).toContainText('Pedidos de qua 11/11: 1 novo.');
    // Os avisos de agora da outra aba (o "não contém" do expect esperaria o aviso sair sozinho)
    expect((await outra.locator('#toast-box .toast').allTextContents()).join(' ')).not.toContain('Pedidos de qua 11/11');
    await outra.close();
  });

  // A revisão do D3: a outra aba pôs o pedido na demanda e gravou a escala da data; a escala desta aba é a de antes. O aviso
  // pede "Atualizar" (não "Importar", que gravaria a escala de antes por cima e importaria o pedido de novo)
  test('o pedido que outra aba pôs na demanda: esta aba pede "Atualizar", e depois dele nada fica fora da demanda', async ({ page, context }) => {
    await abrir(page, { estado: comAlunos() });
    await irPara(page, 'age');
    const outra = await context.newPage();
    await abrir(outra, { estado: comAlunos() });
    await irPara(outra, 'age');
    await registrarPedido(outra, { horario: '08:20' });
    await expect(outra.locator('#toast-box')).toContainText('Pedido registrado e aprovado: já está na demanda.');
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await expect(avisoDosPedidos(page)).toContainText('A escala desta data mudou em outro computador.');
    await expect(avisoDosPedidos(page)).not.toContainText('fora da demanda');
    await botaoDosPedidos(page, 'atualizar-data').click();
    await expect(avisoDosPedidos(page)).not.toContainText('mudou em outro computador');
    await expect(avisoDosPedidos(page)).not.toContainText('fora da demanda');
    await outra.close();
  });
});

// L (N9): o formulário dos pedidos diz o que o motor recusaria. Os tipos e os horários fora das limitações do aluno vêm na
// lista, desligados, com o porquê ("(o aluno só voa no C172)"), para todo perfil; os horários são os da data do pedido (os
// dias da semana). A missão do curso no C152 de quem só voa no C172 oferece os tipos que o tipo da missão permite e o aluno
// voa, e continua ligada (R7). O pedido registrado antes da limitação fica, e a Escala o recusa com o motivo
test.describe('Os pedidos e as limitações do aluno', () => {
  const opcoes = (page, campo) => campoDaAgenda(page, campo).locator('option');
  const desligadas = (page, campo) => campoDaAgenda(page, campo).locator('option:disabled');
  // 11/11/2026 é uma quarta-feira; 12/11, quinta; 13/11, sexta
  const LIMITADO = { recursos: ['C172'], horarios: [{ de: 780, ate: 1080, dias: [3] }, { de: 420, ate: 540, dias: [4] }] };
  const fora = (lista, motivo) => lista.map(h => `${h} (${motivo})`);

  test('os tipos e os horários de fora vêm desligados, com o porquê; os horários são os do dia da semana do pedido', async ({ page }) => {
    await abrirComOsCursos(page, { limitacoes: { 1001: LIMITADO } });
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await expect(opcoes(page, 'recurso')).toHaveText(['C152 (o aluno só voa no C172)', 'C172', 'PA-34 (o aluno só voa no C172)']);
    await expect(desligadas(page, 'recurso')).toHaveText(['C152 (o aluno só voa no C172)', 'PA-34 (o aluno só voa no C172)']);
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('C172');
    const tarde = 'o aluno só voa das 13:00 às 18:00';
    await expect(opcoes(page, 'horario')).toHaveText(['Escolha o horário…', ...fora(['06:30', '08:20', '10:10', '11:30', '12:40'], tarde), '13:40', '14:30', '16:20']);
    await expect(desligadas(page, 'horario')).toHaveCount(5);
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText(`3 de 8 horários do C172: ${tarde}.`);
    // Sexta: nenhum; quinta: das 07:00 às 09:00, um horário só, escolhido sozinho
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await expect(desligadas(page, 'horario')).toHaveCount(8);
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('Nenhum dos 8 horários do C172: o aluno não voa nesta data.');
    await campoDaAgenda(page, 'data').selectOption('2026-11-12');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('08:20');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('1 de 8 horários do C172: o aluno só voa das 07:00 às 09:00.');
    // A escolha que o dia da semana não tem sai, e o campo diz por quê; ela volta no dia que a tem
    await campoDaAgenda(page, 'data').selectOption(AMANHA);
    await campoDaAgenda(page, 'horario').selectOption('13:40');
    await expect(desligadas(page, 'horario2')).toHaveCount(5);
    await campoDaAgenda(page, 'data').selectOption('2026-11-12');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('O horário 13:40 está fora das limitações do aluno (o aluno só voa das 07:00 às 09:00). Agora é 08:20.');
    await campoDaAgenda(page, 'data').selectOption(AMANHA);
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('13:40');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('O horário agora é 13:40.');
    // Na quarta, registrado às 13:40 no C172
    await registrarPedido(page, { aluno: 'Aluno 1001', recurso: 'C172', horario: '13:40' });
    const [guardado] = await agendaGuardada(page);
    expect([guardado.recurso, guardado.horario]).toEqual(['C172', '13:40']);
  });

  // Revisão: a 2ª preferência que sai pelas limitações diz o porquê dela; na data em que nenhum horário serve ao aluno, o
  // campo não pede uma escolha que não existe, e a 2ª preferência fica desligada
  test('a 2ª preferência que sai pelas limitações diz por quê; sem nenhum horário que sirva, nada de "Escolha", e a 2ª desligada', async ({ page }) => {
    await abrirComOsCursos(page, { limitacoes: { 1001: LIMITADO } });
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1001' });
    // Quinta: das 07:00 às 09:00, o 08:20 escolhido pelo app; nenhuma 2ª que sirva: desligada, com o porquê
    await campoDaAgenda(page, 'data').selectOption('2026-11-12');
    await campoDaAgenda(page, 'missao').selectOption('Voo Local');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('08:20');
    await expect(campoDaAgenda(page, 'horario2')).toBeDisabled();
    await expect(campoDaAgenda(page, 'horario2-motivo')).toHaveText('Sem 2ª preferência: o aluno só voa das 07:00 às 09:00.');
    // Sexta: nenhum horário; o 08:20 que o app escolheu sai, e o campo diz por que não há outro
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('O horário 08:20 era o único da escolha anterior. Nenhum dos 8 horários do C172: o aluno não voa nesta data.');
    await expect(campoDaAgenda(page, 'horario2')).toBeDisabled();
    // Quarta, 13:40 e 14:30; quinta: a 1ª vai para 08:20, a 2ª sai pelas limitações, e nenhuma outra serve
    await campoDaAgenda(page, 'data').selectOption(AMANHA);
    await campoDaAgenda(page, 'horario').selectOption('13:40');
    await expect(campoDaAgenda(page, 'horario2')).toBeEnabled();
    await expect(campoDaAgenda(page, 'horario2-motivo')).toHaveText('Opcional: outro horário, se o da 1ª não couber.');
    await campoDaAgenda(page, 'horario2').selectOption('14:30');
    await campoDaAgenda(page, 'data').selectOption('2026-11-12');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('08:20');
    await expect(campoDaAgenda(page, 'horario2')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario2-motivo')).toHaveText('A 2ª preferência 14:30 está fora das limitações do aluno (o aluno só voa das 07:00 às 09:00): sem 2ª preferência nesta data.');
    await expect(campoDaAgenda(page, 'horario2')).toBeDisabled();
    // Sexta: o 13:40 da pessoa, fora das limitações, e nenhum outro serve (nada de "Escolha outro")
    await campoDaAgenda(page, 'data').selectOption('2026-11-13');
    await expect(campoDaAgenda(page, 'horario')).toHaveValue('');
    await expect(campoDaAgenda(page, 'horario-motivo')).toHaveText('O horário 13:40 está fora das limitações do aluno (o aluno não voa nesta data), e nenhum dos horários do C172 está nelas.');
    await expect(campoDaAgenda(page, 'horario2')).toBeDisabled();
  });

  test('a missão do curso no C152 de quem só voa no C172: os tipos da missão que ele voa, e ela continua ligada (R7)', async ({ page }) => {
    await abrirComOsCursos(page, { limitacoes: { 1000: { recursos: ['C172'] } } });
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Maria' });
    await escolherMissaoDoCurso(page, 'NAV-150NM');
    await expect(opcoes(page, 'recurso')).toHaveText(['C152 (o aluno só voa no C172)', 'C172', 'PA-34 (o aluno só voa no C172)']);
    await expect(campoDaAgenda(page, 'recurso')).toHaveValue('C172');
    await expect(campoDaAgenda(page, 'recurso-motivo')).toHaveText('O programa faz NAV-150NM no C152, e o aluno só voa no C172: o pedido vai no C172, e a missão continua NAV-150NM.');
    await registrarPedido(page, { aluno: 'Maria', codigo: 'NAV-150NM', recurso: 'C172', horario: '08:20' });
    await expect(linhasDosPedidos(page).first()).toContainText('NAV-150NM · C172');
    const [guardado] = await agendaGuardada(page);
    expect([guardado.missao, guardado.recurso, guardado.missao_do_curso]).toEqual(['Navegação', 'C172', cursoPP().missoes.find(m => m.codigo === 'NAV-150NM').id]);
    // Na demanda, o voo é a missão do curso, no C172
    await expect.poll(() => page.evaluate(d => { const p = JSON.parse(localStorage.getItem(`acpm4_dia_${d}`)).pedidos[1000]; return p && [p.fly, p.eq, p.etapa]; }, AMANHA))
      .toEqual([true, 'C172', 'NAV-150NM']);
  });

  test('o pedido registrado antes da limitação fica registrado, e a Escala o recusa com o motivo', async ({ page }) => {
    await abrirComOsCursos(page);
    await registrarPedido(page, { aluno: 'Aluno 1001', horario: '08:20' });
    await expect(linhasDosPedidos(page)).toHaveCount(1);
    await irPara(page, 'alu');
    await page.locator('#alu > li[data-chave="i:1001"] .lista-botao').click();
    await page.locator('#det-alu [data-f="limRecurso"]').selectOption('C172');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('acpm4_cadastro')).stu.find(s => s.id === 1001).limitacoes)).toEqual({ recursos: ['C172'] });
    await abrirEscala(page);
    await expect(page.locator('#s-esc [data-caixa="erros"] li', { hasText: 'Aluno 1001' })).toHaveText('Aluno 1001 Rejeitado: o aluno só voa no C172 (o pedido está no C152).');
    const [guardado] = await agendaGuardada(page);
    expect(guardado.cancelada_em).toBe(null);
    await irPara(page, 'age');
    await expect(linhasDosPedidos(page).first()).toContainText('Aluno 1001');
    await expect(grupoDosPedidos(page, 'cancelados')).toHaveCount(0);
  });
});

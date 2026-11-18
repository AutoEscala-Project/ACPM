// Tela da Escala: Lista, Por recurso ou Por instrutor; resumo com erros e avisos agrupados; uma linha por voo.
import { test, expect, abrir, abrirComExemplo, abrirEscala, irPara, lerEscala } from './fixtures.js';
import { aluno, cenario, instrutor, GROUND_C152 } from '../helpers/montar.js';
import { GLOSSARIO } from '../../js/glossario.js';

test.describe('Tela da Escala', () => {
  test('a barra troca entre Lista, Por recurso, Por instrutor e Painel', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await expect(page.locator('#s-esc [data-tl]')).toHaveText(['Lista', 'Por recurso', 'Por instrutor', 'Painel']);
    await expect(page.locator('#s-esc [data-tl="lista"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#out table')).toBeVisible();
    await expect(page.locator('#out .mapa')).toBeHidden();

    await page.locator('#s-esc [data-tl="eq"]').click();
    await expect(page.locator('#out .mapa')).toBeVisible();
    await expect(page.locator('#out table')).toBeHidden();
    await expect(page.locator('#out .tl-row .tl-lbl').first()).toContainText(/^P[PRT]-|^SIM-|^Sala Ground/);

    await page.locator('#s-esc [data-tl="ins"]').click();
    await expect(page.locator('#out .tl-row .tl-lbl').first()).toContainText('Instrutor');
    await page.locator('#s-esc [data-tl="painel"]').click();
    await expect(page.locator('#out .painel-dia')).toBeVisible();
    await expect(page.locator('#out .mapa')).toBeHidden();
    await expect(page.locator('#out .tabela-escala')).toBeHidden();
    await page.locator('#s-esc [data-tl="lista"]').click();
    await expect(page.locator('#out .tabela-escala table')).toBeVisible();
    await expect(page.locator('#out .painel-dia')).toBeHidden();
  });

  test('resumo: os números numa linha; o que não entrou numa caixa vermelha aberta; os avisos agrupados numa caixa fechada', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 1)], stu: [
      aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }),
      aluno(1001, {}, { kg: 0 }),
      aluno(1002, {}, { kg: 0 })
    ] }) });
    await abrirEscala(page);
    await expect(page.locator('#out .st > div')).toHaveText(['3 missões pedidas', '2 escaladas', '2 h de voo e aula']);
    const erros = page.locator('#out details.caixa.erros');
    await expect(erros).toHaveAttribute('open', '');
    await expect(erros.locator('summary')).toHaveText('1 missão não entrou na escala: Aluno 1000');
    await expect(erros.locator('.al.err')).toContainText('nenhum instrutor ativo tem a habilitação');
    const avisos = page.locator('#out details.caixa.avisos');
    await expect(avisos).not.toHaveAttribute('open', '');
    await expect(avisos.locator('summary')).toHaveText('2 avisos: 2 alunos sem peso');
    await expect(avisos.locator('.al.warn')).toHaveCount(2);
  });

  // O aviso de peso diz de quem é o peso que falta; o resumo conta alunos e instrutores
  test('resumo dos avisos: alunos e instrutores sem peso', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 1, { kg: 0 })], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 }, { kg: 0 })] }) });
    await abrirEscala(page);
    await expect(page.locator('#out details.caixa.avisos summary')).toHaveText('2 avisos: 1 aluno sem peso · 1 instrutor sem peso');
  });

  // O voo agendado na Escala fora das regras que a escala segue sozinha (o operador confirmou ao agendar): a etiqueta
  // ao lado do horário, com o caso na dica, e o resumo conta os agendamentos (um por voo)
  test('o voo agendado fora das regras: a etiqueta "fora da regra" com o caso na dica, e o resumo conta os agendamentos', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 980, p2: -1, nb: 2 }), aluno(1002, { p1: 500, p2: -1 })] });
    // Às 07:00 (fora dos horários do C152) e das 16:20 às 18:20 (o voo de dia pousa até as 17:30)
    estado.fixos = { '1000_0_1': { a: 420, b: 480, r: 'PR-VOB', insId: 1, agendado: true }, '1001_0_1': { a: 980, b: 1100, r: 'PR-VOC', insId: 2, agendado: true } };
    await abrir(page, { estado });
    await abrirEscala(page);
    await expect(page.locator('#out details.caixa.avisos summary')).toHaveText('2 avisos: 2 agendamentos fora da regra');
    const etiqueta = nome => page.locator('#out tbody tr:not(.win)', { hasText: nome }).locator('.c-hr .tag[data-dica="fora-da-regra"]');
    await expect(etiqueta('Aluno 1000')).toHaveText('fora da regra');
    await expect(etiqueta('Aluno 1002')).toHaveCount(0);
    await etiqueta('Aluno 1000').click();
    await expect(page.locator('#dica')).toHaveText(`Fora da regra Agendado às 07:00, fora dos horários de decolagem do C152. ${GLOSSARIO['fora-da-regra'].texto}`);
    await expect(etiqueta('Aluno 1001')).toHaveAccessibleDescription(`Agendado até as 18:20: o voo de dia pousa até as 17:30. ${GLOSSARIO['fora-da-regra'].texto}`);
  });

  // Fora da escala aprovada, o voo fixo em conflito é de um agendamento, do instrutor escolhido na Escala ou de um status
  test('o voo fixo em conflito sem a escala aprovada: "voo fixo em conflito", com o conflito do agendado', async ({ page }) => {
    const estado = cenario({ ins: [instrutor(1, 9, { on: false }), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 })] });
    estado.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PR-VOB', insId: 1, agendado: true } };
    await abrir(page, { estado });
    await abrirEscala(page);
    const conflitos = page.locator('#out details.caixa.conflitos');
    await expect(conflitos.locator('summary')).toHaveText('1 voo fixo em conflito');
    await expect(conflitos.locator('.al.conf')).toHaveText('Aluno 1000 Conflito no voo agendado: o instrutor não está disponível. Sugestões');
  });

  test('uma linha por voo: duração junto do horário, preferência só quando não é a 1ª, peso com o limite e status discreto', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [
      aluno(1000, { mis: 'Voo Local', eq: 'C152', p1: 0, p2: 1 }),
      aluno(1001, { mis: 'Voo Local', eq: 'C152', p1: 0, p2: 1 })
    ] }) });
    await abrirEscala(page);
    await expect(page.locator('#out thead th')).toHaveText(['Horário', 'Aluno', 'Missão', 'Recurso', 'Instrutor', 'Peso', 'Status', '']);
    await expect(page.locator('#out tr.win').first()).toHaveText('06:30 · 1º tempo 1 decolagem ou aula');
    const primeiro = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(primeiro.locator('td').nth(0)).toHaveText('06:30–07:30 1 h');
    await expect(primeiro.locator('td').nth(5)).toHaveText('140 / 170 kg');
    await expect(primeiro.locator('.st-sel')).toHaveValue('Confirmado');
    await expect(primeiro.locator('[data-act="rm-fly"]')).toHaveAttribute('aria-label', 'Tirar Aluno 1000 da escala');
    const segundo = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1001' });
    await expect(segundo.locator('td').nth(0)).toContainText('2ª preferência');
  });

  test('acima do limite com os tanques cheios, o voo sai com menos combustível: a coluna Peso diz quanto reduzir', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9, { kg: 80 })], stu: [aluno(1000, { p1: 500, p2: -1 }, { kg: 100 })] }) });
    await abrirEscala(page);
    const linha = page.locator('#out tbody tr:not(.win)', { hasText: 'Aluno 1000' });
    await expect(linha.locator('.c-peso')).toContainText('180 / 170 kg');
    const selo = linha.locator('.c-peso .tag.comb');
    await expect(selo).toHaveText('reduzir 4 gal');
    // A dica diz o caso deste voo antes da explicação
    await selo.click();
    await expect(page.locator('#dica')).toContainText('Reduzir combustível Abastecer até 22 gal (4 a menos que o tanque cheio); o voo, o táxi e a reserva pedem 11 gal; autonomia de 3h23.');
    // Para o leitor de tela, o mesmo texto: o caso deste voo, depois a explicação do termo
    await expect(selo).toHaveAccessibleDescription(`Abastecer até 22 gal (4 a menos que o tanque cheio); o voo, o táxi e a reserva pedem 11 gal; autonomia de 3h23. ${GLOSSARIO['reduzir-combustivel'].texto}`);
  });

  test('turma de Ground: horário, missão, sala e instrutor uma vez só; cada aluno com o seu status e a sua ação', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [1000, 1001, 1002].map(id => aluno(id, { ...GROUND_C152, p1: 0, p2: 1 })) }) });
    await abrirEscala(page);
    const linhas = page.locator('#out tbody tr:not(.win)');
    await expect(linhas).toHaveCount(3);
    await expect(linhas.nth(0).locator('td')).toHaveCount(8);
    await expect(linhas.nth(0).locator('td').first()).toHaveAttribute('rowspan', '3');
    await expect(linhas.nth(0).locator('td').nth(2)).toContainText('Turma de 3 alunos');
    await expect(linhas.nth(1).locator('td')).toHaveCount(3);
    await expect(linhas.nth(1).locator('.st-sel')).toHaveCount(1);
    await expect(linhas.nth(1).locator('td').nth(0)).toHaveText('Aluno 1001');
  });

  test('Categoria e Recurso: os dois começam em "Todos", e o segundo mostra só os da categoria escolhida', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    await expect(page.locator('#s-esc label.flt-rotulo > span')).toHaveText(['Categoria', 'Recurso']);
    const categoria = page.locator('#flt-esc-cat'), recurso = page.locator('#flt-esc-eq');
    await expect(categoria.locator('option')).toHaveText(['Todos', 'C152', 'C172', 'Simulador', 'PA-34', 'Sala Ground']);
    await expect(categoria).toHaveValue('');
    await expect(recurso).toHaveValue('');
    await expect(recurso.locator('option').first()).toHaveText('Todos');
    const avioesDasLinhas = async () => (await lerEscala(page)).linhas.map(l => l.split(' | ')).filter(c => c.length >= 5).map(c => c[3]);

    await categoria.selectOption({ label: 'PA-34' });
    const opcoes = await recurso.locator('option').allTextContents();
    expect(opcoes[0]).toBe('Todos');
    expect(opcoes.length).toBeGreaterThan(1);
    expect(opcoes.slice(1).every(r => ['PR-VOM', 'PT-JOB', 'PT-KIW'].includes(r)), opcoes.join(', ')).toBe(true);
    const pa34 = await avioesDasLinhas();
    expect(pa34.length).toBeGreaterThan(0);
    expect(pa34.every(a => a.endsWith(' PA-34')), pa34.join(', ')).toBe(true);

    // Um avião da categoria; trocar de categoria volta o segundo filtro para "Todos"
    await recurso.selectOption(opcoes[1]);
    const doAviao = await avioesDasLinhas();
    expect(doAviao.length).toBeGreaterThan(0);
    expect(doAviao.every(a => a.startsWith(opcoes[1] + ' ')), doAviao.join(', ')).toBe(true);
    await categoria.selectOption({ label: 'Sala Ground' });
    await expect(recurso).toHaveValue('');
    await expect(recurso.locator('option')).toHaveText(['Todos', 'Sala Ground']);
    expect(new Set(await avioesDasLinhas())).toEqual(new Set(['Sala Ground']));
    await categoria.selectOption({ label: 'Todos' });
    expect((await avioesDasLinhas()).length).toBeGreaterThan(pa34.length);
  });

  test('na Lista, cada horário recolhe e abre os voos dele (e continua assim quando a escala é refeita)', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const botao = page.locator('#out tr.win').first().locator('button');
    const voos = w => page.locator(`#out tbody tr[data-w="${w}"]:not(.win)`);
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(await voos(0).count()).toBeGreaterThan(0);
    await botao.click();
    await expect(page.locator('#out tr.win').first().locator('button')).toHaveAttribute('aria-expanded', 'false');
    await expect(voos(0).first()).toBeHidden();
    expect(await voos(0).evaluateAll(trs => trs.every(tr => tr.hidden))).toBe(true);
    await expect(voos(1).first()).toBeVisible();

    await page.locator('#s-esc [data-tl="eq"]').click();
    await page.locator('#s-esc [data-tl="lista"]').click();
    await expect(page.locator('#out tr.win').first().locator('button')).toHaveAttribute('aria-expanded', 'false');
    await expect(voos(0).first()).toBeHidden();
    await page.locator('#out tr.win').first().locator('button').click();
    await expect(voos(0).first()).toBeVisible();
  });

  test('cada alteração mostra a hora em que a escala foi refeita', async ({ page }) => {
    await abrirComExemplo(page);
    await expect(page.locator('#escala-atualizada')).toBeHidden();
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await irPara(page, 'esc');
    // Discreta, com um relógio, ao lado do título (e não na barra)
    const atualizada = page.locator('#s-esc h2 #escala-atualizada');
    await expect(atualizada).toHaveText('Atualizada às 12:00');
    await expect(atualizada.locator('use')).toHaveAttribute('href', '#i-relogio');
    await expect(page.locator('#s-esc .bar #escala-atualizada')).toHaveCount(0);
    expect(await atualizada.evaluate(el => getComputedStyle(el).fontSize)).toBe('13px');
  });
});

// O popup do mapa fica fora do painel que rola (dentro dele, seria cortado e, nas primeiras linhas, sumiria sob os
// filtros e o cabeçalho): abre com um clique (ou Enter) na barra e fecha com Esc ou com um clique fora
test.describe('Mapa: o popup do voo', () => {
  const pop = page => page.locator('#tl-pop');
  const abrirMapa = async page => {
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="eq"]').click();
    await expect(page.locator('#out .mapa')).toBeVisible();
  };
  // A caixa inteira na tela e por cima de tudo: o ponto no centro e perto de cada canto é do próprio popup
  const inteiroNaTela = page => page.evaluate(() => {
    const el = document.getElementById('tl-pop');
    if (!el || el.hidden) return 'fechado';
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return `fora da tela: ${JSON.stringify(r)}`;
    const pontos = [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6],
      [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
    const cobertos = pontos.filter(([x, y]) => !el.contains(document.elementFromPoint(x, y)));
    return cobertos.length ? `coberto em ${JSON.stringify(cobertos)}` : 'ok';
  });
  // Opacidade efetiva (a do elemento vezes a de quem o contém)
  const opacidade = locator => locator.evaluate(el => {
    let total = 1;
    for (let n = el; n; n = n.parentElement) total *= +getComputedStyle(n).opacity;
    return total;
  });

  test('o voo da primeira linha abre o popup inteiro, por cima dos filtros e do cabeçalho', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirMapa(page);
    const barra = page.locator('#out .tl-row').first().locator('.tl-bar').first();
    await expect(barra).toHaveAttribute('aria-expanded', 'false');
    await barra.click();
    await expect(pop(page)).toBeVisible();
    await expect(barra).toHaveAttribute('aria-expanded', 'true');
    expect(await inteiroNaTela(page)).toBe('ok');
    // É o voo da barra: o mesmo horário
    const [inicio, fim] = (await barra.locator('.tl-bar-t1').innerText()).split(' · ')[0].split('–');
    await expect(pop(page).locator('.tl-pop-hd')).toContainText(`${inicio} – ${fim}`);
  });

  test('Esc fecha o popup e devolve o foco à barra; Enter abre de novo; um clique fora fecha', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirMapa(page);
    const barra = page.locator('#out .tl-bar').first();
    await barra.click();
    await expect(pop(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop(page)).toBeHidden();
    await expect(barra).toBeFocused();
    await expect(barra).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(pop(page)).toBeVisible();
    await page.locator('#s-esc h2').click();
    await expect(pop(page)).toBeHidden();
  });

  test('o popup de um voo cancelado não fica apagado como a barra', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 0 })], fStatus: { '1000_0_1': 'Cancelado' } }) });
    await abrirMapa(page);
    const barra = page.locator('#out .tl-bar.tl-st-Cancelado');
    await barra.click();
    await expect(pop(page)).toBeVisible();
    expect(await opacidade(barra)).toBeLessThan(1);
    expect(await opacidade(pop(page))).toBe(1);
  });

  test('mudar o status no popup atualiza a barra, e o popup continua aberto com o status novo', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 0 })] }) });
    await abrirMapa(page);
    await page.locator('#out .tl-bar').click();
    await pop(page).locator('.st-sel').selectOption('Em Voo');
    await expect(page.locator('#out .tl-bar')).toHaveClass(/\btl-st-EmVoo\b/);
    await expect(pop(page)).toBeVisible();
    await expect(pop(page).locator('.st-sel')).toHaveValue('Em Voo');
  });

  test('no Gestor, o status do popup fica travado e não há "Excluir da escala"', async ({ page }) => {
    await abrirComExemplo(page, { url: './?role=gestor' });
    await abrirMapa(page);
    await page.locator('#out .tl-bar').first().click();
    await expect(pop(page).locator('.st-sel')).toBeDisabled();
    await expect(pop(page).locator('[data-act="rm-fly"]')).toBeHidden();
  });
});

// O Painel no estilo dos aeroportos (os painéis da INFRAERO): Partidas (todas as do dia) e Chegadas (as que ainda não
// pousaram) se alternam página a página, com o relógio no canto. Ground aparece sem os nomes dos alunos
test.describe('Painel: partidas e chegadas como no aeroporto', () => {
  // 06:30 atrasado para 11:00; 10:10 confirmado; 11:30 cancelado; turma de Ground às 08:20
  const dia = () => ({
    ...cenario({
      ins: [instrutor(1, 9), instrutor(2, 9)],
      stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 610, p2: -1 }), aluno(1002, { p1: 690, p2: -1, eq: 'C172' }),
        aluno(1003, { ...GROUND_C152, p1: 500, p2: -1 }), aluno(1004, { ...GROUND_C152, p1: 500, p2: -1 })],
      fStatus: { '1000_0_1': 'Atrasado', '1002_0_1': 'Cancelado' }
    }),
    fObs: { '1000_0_1': { novoInicio: 660 }, '1002_0_1': { motivo: 'Meteorologia' } },
    // O teste é do quadro: os horários ficam onde a escala pôs (sem a compactação mudar)
    criterios: { buracos: 'inva', horarios: 'fixos' }
  });
  const abrirPainel = async page => {
    await abrirEscala(page);
    await page.locator('#s-esc [data-tl="painel"]').click();
    await expect(page.locator('#out .fids')).toBeVisible();
  };
  const titulo = page => page.locator('#out .fids .fids-titulo');
  const linhas = page => page.locator('#out .fids tbody tr:not(.fids-vazia)');

  // O quadro só é refeito quando muda: na troca de página, na virada do minuto e com dados novos. Refazê-lo a cada
  // segundo reinicia a animação do embarque e tira o leitor de tela do lugar
  test('o quadro muda só com a página ou o minuto; Pausar para a troca e o pisca, e o quadro continua seguindo a hora', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34', p1: 750, p2: -1 })] }) });
    // A data aberta (amanhã, 11/11) vira hoje, ao meio-dia: o PA-34 das 12:30 está em embarque
    await page.clock.install({ time: new Date('2026-11-11T12:00:00-03:00') });
    await abrirPainel(page);
    const chamada = page.locator('#out .fids .fids-Embarque .f-obs');
    const marcar = () => page.locator('#out .fids-tabela').evaluate(el => { el.dataset.marca = '1'; });
    const marcada = page.locator('#out .fids-tabela[data-marca="1"]');
    await expect(chamada).toHaveText('EMBARQUE IMEDIATO · Sala de briefing');
    expect(await chamada.evaluate(el => getComputedStyle(el).animationName)).toBe('fids-embarque');

    await marcar();
    await page.clock.runFor(2000);
    await expect(marcada).toHaveCount(1);
    // A troca de página (Partidas e Chegadas se alternam a cada 10 s) refaz o quadro
    await page.clock.runFor(8000);
    await expect(titulo(page)).toHaveText('Chegadas');
    await expect(marcada).toHaveCount(0);

    // Um quadro só, de uma página: nada para trocar
    await page.locator('#out [data-fids="partidas"]').click();
    await marcar();
    await page.clock.runFor(11000);
    await expect(marcada).toHaveCount(1);

    await page.locator('#out [data-fids="pausar"]').click();
    await expect(page.locator('#out .fids')).toHaveClass(/\bpausado\b/);
    expect(await chamada.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    // A pausa continua quando a escala é redesenhada (outra visão e de volta ao painel)
    await page.locator('#s-esc [data-tl="lista"]').click();
    await page.locator('#s-esc [data-tl="painel"]').click();
    await expect(page.locator('#out .fids')).toHaveClass(/\bpausado\b/);
    expect(await chamada.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    // Pausado, o quadro continua seguindo a hora: às 12:31 o PA-34 já saiu do embarque
    await page.clock.fastForward('31:00');
    await expect(page.locator('#out .fids .fids-relogio b')).toHaveText('12:31');
    await expect(page.locator('#out .fids .fids-Embarque')).toHaveCount(0);
  });

  test('a página que aparece fica os 10 s inteiros, mesmo depois de um tempo com uma página só', async ({ page }) => {
    await abrirComExemplo(page);
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await abrirPainel(page);
    await page.locator('#out [data-fids="partidas"]').click();
    const pagina = page.locator('#out .fids .fids-relogio small').first();
    await expect(pagina).toHaveText(/^página 1\/[2-9]/);
    // Um filtro deixa uma página só por um tempo; sem ele, a página 1 aparece e fica os 10 s
    await page.locator('#flt-esc-q').fill('Instrutor 01');
    await expect(pagina).toHaveText('página 1/1');
    await page.clock.runFor(30000);
    await page.locator('#flt-esc-q').fill('');
    await expect(pagina).toHaveText(/^página 1\/[2-9]/);
    await page.clock.runFor(8000);
    await expect(pagina).toHaveText(/^página 1\//);
    await page.clock.runFor(3000);
    await expect(pagina).toHaveText(/^página 2\//);
  });

  test('pausado e sem mudança, o quadro não é tocado; na virada do minuto, só a hora muda', async ({ page }) => {
    await abrirComExemplo(page);
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await abrirPainel(page);
    await page.locator('#out [data-fids="pausar"]').click();
    const contar = () => page.locator('#out .fids').evaluate(el => {
      window.__mudancas = [];
      new MutationObserver(m => window.__mudancas.push(...m.map(x => (x.target.closest ? x.target.closest('b, small, table, div')?.className || x.target.tagName : x.target.parentElement?.tagName)))).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await contar();
    await page.clock.runFor(30000);
    expect(await page.evaluate(() => window.__mudancas)).toEqual([]);
    await page.locator('#out .fids-tabela').evaluate(el => { el.dataset.marca = '1'; });
    await page.clock.runFor(31000);
    await expect(page.locator('#out .fids .fids-relogio b')).toHaveText('12:01');
    await expect(page.locator('#out .fids-tabela[data-marca="1"]')).toHaveCount(1);
  });

  test('como na TV da recepção: o aluno abreviado e, no cancelamento, só a categoria do motivo', async ({ page }) => {
    const estado = { ...dia(), fObs: { '1000_0_1': { novoInicio: 660 }, '1002_0_1': { motivo: 'Outro', texto: 'Aluno com febre' } } };
    estado.stu = estado.stu.map(s => (s.id === 1001 ? { ...s, nm: 'Maria Silva Santos' } : s));
    await abrir(page, { estado });
    await abrirPainel(page);
    await page.locator('#out [data-fids="partidas"]').click();
    await expect(page.locator('#out .fids')).toContainText('Maria S.');
    await expect(page.locator('#out .fids')).not.toContainText('Silva Santos');
    await expect(page.locator('#out .fids')).toContainText('Cancelado · Outro');
    await expect(page.locator('#out .fids')).not.toContainText('febre');
  });
  const coluna = (page, classe) => linhas(page).locator(classe);

  test('Partidas: o quadro do aeroporto com todas as partidas, pelo horário previsto; atraso, cancelamento e Ground sem nomes', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await page.locator('#out [data-fids="partidas"]').click();
    await expect(titulo(page)).toHaveText('Partidas');
    await expect(page.locator('#out .fids .fids-relogio b')).toHaveText('12:00');
    await expect(page.locator('#out .fids thead th')).toHaveText(['Horário', 'Missão', 'Modelo', 'Aeronave', 'Aluno', 'Instrutor', 'Previsto', 'Observação']);
    await expect(coluna(page, '.f-hora')).toHaveText(['08:20', '10:10', '06:30', '11:30']);
    await expect(coluna(page, '.f-prev')).toHaveText(['', '', '11:00', '']);
    await expect(coluna(page, '.f-missao')).toHaveText(['Ground C152', 'Voo Local', 'Voo Local', 'Voo Local']);
    await expect(coluna(page, '.f-modelo')).toHaveText(['Ground', 'C152', 'C152', 'C172']);
    await expect(coluna(page, '.f-aluno')).toHaveText(['2 alunos', 'Aluno 1001', 'Aluno 1000', 'Aluno 1002']);
    await expect(coluna(page, '.f-obs')).toHaveText(['Confirmado', 'Confirmado', 'Atrasado', 'Cancelado · Meteorologia']);
    await expect(coluna(page, '.f-aeronave').first()).toHaveText('Sala Ground');
    await expect(linhas(page).nth(3)).toHaveClass(/\bfids-Cancelado\b/);
    // O quadro tem sempre a mesma altura: linhas vazias completam a página de 12 linhas (aqui, 4 voos e 8 vazias)
    await expect(page.locator('#out .fids tbody tr')).toHaveCount(12);
  });

  test('Chegadas: as pendentes, pelo pouso previsto; num dia que ainda não começou, todas', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await page.locator('#out [data-fids="chegadas"]').click();
    await expect(titulo(page)).toHaveText('Chegadas');
    await expect(coluna(page, '.f-hora')).toHaveText(['09:50', '11:10', '07:30', '12:30']);
    await expect(coluna(page, '.f-prev')).toHaveText(['', '', '12:00', '']);
    await expect(coluna(page, '.f-aluno')).toHaveText(['2 alunos', 'Aluno 1001', 'Aluno 1000', 'Aluno 1002']);
  });

  test('alterna entre Partidas e Chegadas como no aeroporto; "Pausar" para a troca', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await expect(page.locator('#out [data-fids="alternar"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(titulo(page)).toHaveText('Partidas');
    await page.clock.runFor(10_000);
    await expect(titulo(page)).toHaveText('Chegadas');
    await page.clock.runFor(10_000);
    await expect(titulo(page)).toHaveText('Partidas');
    // Um botão de alternar mantém o nome: o leitor de tela anuncia "Pausar, pressionado" (o nome que muda não é anunciado)
    const pausar = page.locator('#out [data-fids="pausar"]');
    await pausar.click();
    await expect(pausar).toHaveAttribute('aria-pressed', 'true');
    await expect(pausar).toHaveAccessibleName('Pausar');
    const fundoSolto = await page.locator('#out [data-fids="tela-cheia"]').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await pausar.evaluate(el => getComputedStyle(el).backgroundColor), 'pressionado aparece na tela').not.toBe(fundoSolto);
    // Além da cor, uma marca (✓) ao lado do nome, escondida do leitor de tela; com as cores forçadas do sistema, o
    // botão pressionado usa a cor de destaque do sistema
    await expect(pausar.locator('.ico')).toBeVisible();
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await pausar.evaluate(el => getComputedStyle(el).backgroundColor), 'cores forçadas').not.toBe(
      await page.locator('#out [data-fids="tela-cheia"]').evaluate(el => getComputedStyle(el).backgroundColor));
    await page.emulateMedia({ forcedColors: 'none' });
    await page.clock.runFor(30_000);
    await expect(titulo(page)).toHaveText('Partidas');
    await pausar.click();
    await expect(pausar).toHaveAttribute('aria-pressed', 'false');
    await expect(pausar).toHaveAccessibleName('Pausar');
    await expect(pausar.locator('.ico')).toBeHidden();
  });

  test('um quadro fixo continua só com ele; a página aparece junto do relógio', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    await abrir(page, { estado: dia() });
    await abrirPainel(page);
    await page.locator('#out [data-fids="chegadas"]').click();
    await expect(page.locator('#out [data-fids="chegadas"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#out .fids .fids-relogio small')).toHaveText('página 1/1');
    await page.clock.runFor(30_000);
    await expect(titulo(page)).toHaveText('Chegadas');
  });

  test('no Gestor, o mesmo painel', async ({ page }) => {
    await abrir(page, { estado: dia(), url: './?role=gestor' });
    await abrirPainel(page);
    await expect(linhas(page)).toHaveCount(4);
  });
});

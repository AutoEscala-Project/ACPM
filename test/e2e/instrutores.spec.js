// INVAs (C, "tela"): a lista e o detalhe. A linha (as faixas da data, a tira do dia, os voos, o "Vem" e o "Ativo"), os
// filtros, o detalhe (os três turnos, "Editar faixas" com "Pode decolar de … até …", "+ Pausa" e "Almoço", "Salvar faixas"
// e o ↶ dele, o "Vem", o cadastro, as habilitações, as horas de voo), "Agendar voo com <nome>", "Excluir instrutor…", o
// item fixo dos limites da lei e o celular. A grade, as duas gavetas e as duas vistas saíram
import {
  test, expect, abrir, abrirSintetico, abrirComExemplo, irPara, irParaVista, abrirEscala, lerEscala, filtrarHabilitacoes, confirmar, abrirHistorico,
  caixaVem, dataAberta, diaSeguinte, linhaDoInstrutor, linhasDosInstrutores, nomesDosInstrutores, buscaDosInstrutores, contagemDosInstrutores,
  faixasNaLinha, voosNaLinha, habilitacoesNaLinha, tiraDaLinha, abrirInstrutor, campoDoInstrutor, habilitacaoDoInstrutor, secaoDoInstrutor,
  faixasDoAberto, pausasDoAberto, botaoDoTurno, aplicarTurno, campoDaFaixa, editarFaixas, abrirLimitesDaLei, nenhumNaLista, alvosPequenos,
  larguraDaPagina, entradasDoHistorico, botaoDaAba
} from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

// O ↶ da entrada do Histórico que tem o texto
async function reverter(page, texto) {
  await abrirHistorico(page);
  await entradasDoHistorico(page, texto).first().locator('[data-act="rev-log"]').click();
  await page.keyboard.press('Escape');
}

test.describe('INVAs: a lista', () => {
  test('a tela se chama INVAs: o link da linha, o título, a lista e o item fixo dos limites da lei no alto', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await expect(botaoDaAba(page, 'ins')).toHaveText('INVAs');
    await expect(page.locator('#s-ins h2')).toHaveText('INVAs');
    await expect(page.locator('#ins')).toHaveAccessibleName('INVAs');
    await expect(linhasDosInstrutores(page)).toHaveCount(40);
    await expect(contagemDosInstrutores(page)).toHaveText('40 instrutores');
    const fixo = page.locator('#ins > li[data-chave="f:limites"]');
    await expect(fixo).toContainText('Limites da Lei do Aeronauta');
    await expect(fixo).toContainText('100 h no mês · 960 h no ano');
    // Nada escolhido: o detalhe diz o que fazer; a grade, as vistas e as gavetas saíram
    await expect(page.locator('#det-ins')).toHaveText('Escolha um instrutor na lista.');
    await expect(page.locator('#s-ins table, #s-ins [data-vista-ins], #painel-instrutor, #painel-dados')).toHaveCount(0);
  });

  test('a linha: as faixas da data (com a pausa), quantos voos, as habilitações, a tira do dia, o "Vem" e o "Ativo"', async ({ page }) => {
    const ins = [
      instrutor(1, 9, { faixas: [{ de: 390, ate: 720 }, { de: 780, ate: 1050 }], pausas: [{ de: 720, ate: 780 }] }),
      instrutor(2, 9, { on: false }),
      instrutor(3, 1, { aw: [false, false, false, false, true, true, true, true, true] })
    ];
    await abrir(page, { estado: cenario({ ins, stu: [aluno(1000, { p1: 1, p2: -1 }, { voaCom: [1] })] }) });
    await abrirEscala(page);
    const linhas = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(linhas).toHaveLength(1);
    await irPara(page, 'ins');
    await expect(faixasNaLinha(page, 1)).toHaveText('06:30–12:00 e 13:00–17:30 · pausa 12:00–13:00');
    await expect(voosNaLinha(page, 1)).toHaveText('1 voo');
    await expect(faixasNaLinha(page, 2)).toHaveText('não vem nesta data');
    await expect(voosNaLinha(page, 2)).toHaveCount(0);
    // Quem ainda não tem faixas (lido pelo aw) mostra as do aw
    await expect(faixasNaLinha(page, 3)).toHaveText('12:40–24:00');
    // A tira: as faixas, a pausa e o voo; só para os olhos (a linha diz o mesmo em texto)
    await expect(tiraDaLinha(page, 1)).toHaveAttribute('aria-hidden', 'true');
    await expect(tiraDaLinha(page, 1).locator('.tira-faixa')).toHaveCount(2);
    await expect(tiraDaLinha(page, 1).locator('.tira-pausa')).toHaveCount(1);
    await expect(tiraDaLinha(page, 1).locator('.tira-voo')).toHaveCount(1);
    await expect(tiraDaLinha(page, 2)).toHaveClass(/\bnao-vem\b/);
    // Na linha, as habilitações que mais distinguem o instrutor, três e quantas mais
    await expect(habilitacoesNaLinha(page, 1)).toHaveText(/^MLTE \(PA-34\) · C172 · IFR · \+\d+$/);
    // O "Vem" e o "Ativo", com os nomes
    await expect(caixaVem(linhaDoInstrutor(page, 1))).toHaveAccessibleName('Instrutor 01 vem em 11/11');
    await expect(linhaDoInstrutor(page, 1).locator('[data-act="ativo"]')).toHaveAccessibleName('Instrutor 01 ativo no cadastro');
  });

  test('filtra por nome e por habilitação; sem nenhum, "Limpar filtros"', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await buscaDosInstrutores(page).fill('instrutor 1');
    await expect(linhasDosInstrutores(page)).toHaveCount(10);
    await expect(contagemDosInstrutores(page)).toHaveText('10 de 40 instrutores');
    await buscaDosInstrutores(page).fill('');
    await filtrarHabilitacoes(page, ['mlte']);
    await expect(linhasDosInstrutores(page)).toHaveCount(4);
    await expect(linhasDosInstrutores(page).first()).toContainText('Instrutor 09');
    // O item fixo fica, fora dos filtros e da contagem
    await expect(page.locator('#ins > li[data-chave="f:limites"]')).toBeVisible();
    await buscaDosInstrutores(page).fill('xyz');
    await nenhumNaLista(page, 'ins');
    await page.locator('#ins [data-lista-limpar="ins"]').click();
    await expect(buscaDosInstrutores(page)).toHaveValue('');
    await expect(buscaDosInstrutores(page)).toBeFocused();
    await expect(page.locator('#flt-ins-hab')).toHaveText('Todas as habilitações');
    await expect(contagemDosInstrutores(page)).toHaveText('40 instrutores');
  });

  // A busca acha o nome sem os acentos. O instrutor novo aparece mesmo fora da busca, escolhido, com o nome selecionado
  // (é nele que se digita), até a busca mudar
  test('a busca acha o nome sem acentos; o instrutor novo abre escolhido, à vista fora da busca', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9, { nm: 'Ângelo Brandão' }), instrutor(2, 9), instrutor(3, 1)] }) });
    await irPara(page, 'ins');
    await expect(contagemDosInstrutores(page)).toHaveAttribute('role', 'status');
    await buscaDosInstrutores(page).fill('  BRANDÃO ');
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ângelo Brandão']);
    await expect(contagemDosInstrutores(page)).toHaveText('1 de 3 instrutores');
    // O "Vem" muda a linha (e a escala), e ela continua filtrada
    await caixaVem(linhaDoInstrutor(page, 1)).uncheck();
    await expect(faixasNaLinha(page, 1)).toHaveText('não vem nesta data');
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ângelo Brandão']);

    await page.locator('[data-act="addi"]').click();
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ângelo Brandão', 'Novo instrutor']);
    await expect(campoDoInstrutor(page, 'nm')).toHaveValue('Novo instrutor');
    await expect(campoDoInstrutor(page, 'nm')).toBeFocused();
    await expect(contagemDosInstrutores(page)).toHaveText('2 de 4 instrutores');
    await page.keyboard.type('Carlos Antônio');
    await page.keyboard.press('Tab');
    await expect(entradasDoHistorico(page, 'Instrutor: Novo instrutor → Carlos Antônio')).toHaveCount(1);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ângelo Brandão', 'Carlos Antônio']);
    await buscaDosInstrutores(page).fill('antonio');
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Carlos Antônio']);
  });

  // A habilitação tirada no detalhe, com o filtro dela: a linha continua à vista, até o filtro mudar
  test('a linha alterada continua à vista fora dos filtros, até eles mudarem', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9, { nm: 'Ângelo Brandão' }), instrutor(2, 9), instrutor(3, 1)] }) });
    await irPara(page, 'ins');
    await filtrarHabilitacoes(page, ['mlte']);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ângelo Brandão', 'Instrutor 02']);
    await abrirInstrutor(page, 1);
    await habilitacaoDoInstrutor(page, 'mlte').focus();
    await page.keyboard.press('Space');
    await expect(entradasDoHistorico(page, 'Habilitação retirada: Ângelo Brandão')).toHaveCount(1);
    await expect(linhaDoInstrutor(page, 1)).toBeVisible();
    await expect(habilitacaoDoInstrutor(page, 'mlte')).toBeFocused();
    await filtrarHabilitacoes(page, []);
    await filtrarHabilitacoes(page, ['mlte']);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Instrutor 02']);
    // O instrutor aberto continua no detalhe, mesmo fora da lista
    await expect(page.locator('#det-ins-titulo')).toHaveText('Ângelo Brandão');
  });

  // O filtro das habilitações tem várias marcas, e aparece quem tem todas as marcadas: uma missão pede várias juntas (o
  // Noturno no C172 pede Noturno e C172). As opções são as do detalhe (Habilitações), nos mesmos grupos, com a habilitação
  // própria do recurso (o PR-VOM); o botão diz o que está marcado, e "Limpar" desmarca todas
  test('o filtro das habilitações: várias marcas mostram quem tem todas, nos grupos das Habilitações do detalhe', async ({ page }) => {
    const ins = [
      instrutor(1, 1, { nm: 'Ana', hab: ['local', 'c152', 'c172', 'noturno'] }),
      instrutor(2, 1, { nm: 'Bruno', hab: ['local', 'c152', 'noturno'] }),
      instrutor(3, 1, { nm: 'Carla', hab: ['local', 'c172'] }),
      instrutor(4, 1, { nm: 'Davi', hab: ['local', 'c172', 'noturno', 'aviao:PR-VOM'] })
    ];
    await abrir(page, { estado: cenario({ ins }) });
    await irPara(page, 'ins');
    const botao = page.locator('#flt-ins-hab'), painel = page.locator('#flt-ins-hab-painel');
    const caixa = valor => painel.locator(`input[data-valor="${valor}"]`);
    await expect(botao).toHaveText('Todas as habilitações');
    await expect(botao).toHaveAttribute('aria-controls', 'flt-ins-hab-painel');
    await botao.click();
    await expect(painel).toHaveAccessibleName('Filtrar por habilitação');
    await expect(painel.locator('.filtro-regra')).toHaveText('Mostra quem tem todas as marcadas.');
    await expect(painel.locator('.filtro-regra [data-dica="filtro-das-habilitacoes"]')).toHaveAccessibleName('O que é Filtro das habilitações?');
    const grupos = ['Ground e simulador', 'Voo', 'Aviões', 'Checador: curso', 'Checador: motor', 'Checador: regras', 'Habilitação própria do recurso'];
    await expect(painel.locator('legend')).toHaveText(grupos);
    await expect(painel.locator('input[data-filtro]')).toHaveCount(24);
    await caixa('noturno').check();
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Bruno', 'Davi']);
    await caixa('c172').check();
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Davi']);
    await expect(botao).toHaveText('Habilitações: Noturno + C172');
    await expect(page.locator('#ins-contagem')).toHaveText('2 de 4 instrutores');
    await caixa('aviao:PR-VOM').check();
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Davi']);
    await caixa('aviao:PR-VOM').uncheck();
    const limpar = painel.getByRole('button', { name: 'Limpar' });
    await limpar.click();
    await expect(botao).toHaveText('Todas as habilitações');
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Bruno', 'Carla', 'Davi']);
    await expect(limpar).toBeFocused();
    // Os grupos são os das Habilitações do detalhe
    await page.keyboard.press('Escape');
    await abrirInstrutor(page, 1);
    await expect(secaoDoInstrutor(page, 'habilitacoes').locator('.habs-painel > fieldset > legend')).toHaveText(grupos);
  });

  // As opções acompanham a frota: a habilitação própria que sai de Recursos sai do filtro, também marcada
  test('as opções do filtro das habilitações acompanham a frota: a habilitação própria que sai de Recursos sai do filtro', async ({ page }) => {
    const ins = [instrutor(1, 1, { nm: 'Ana', hab: ['local', 'c172', 'aviao:PR-HAR', 'aviao:PR-VOM'] }), instrutor(2, 1, { nm: 'Bruno', hab: ['local', 'c172'] })];
    await abrir(page, { estado: cenario({ ins }) });
    const botao = page.locator('#flt-ins-hab'), painel = page.locator('#flt-ins-hab-painel');
    const propria = painel.locator('fieldset', { has: page.locator('legend', { hasText: 'Habilitação própria do recurso' }) }).locator('label');
    const atributo = async (reg, marcar) => {
      await irParaVista(page, 'rec', 'cadastro');
      await page.locator(`#frota li.frota-item[data-r="${reg}"] [data-act="atributos-recurso"]`).click();
      await page.locator(`#frota li.frota-item[data-r="${reg}"] [data-atributo="habilitacaoPropria"]`).setChecked(marcar);
      await expect(entradasDoHistorico(page, `${reg}: Habilitação própria ${marcar ? 'marcado' : 'desmarcado'}`)).toHaveCount(1);
      await irPara(page, 'ins');
    };
    await atributo('PR-HAR', true);
    await filtrarHabilitacoes(page, ['aviao:PR-HAR', 'aviao:PR-VOM'], { fechar: false });
    await expect(propria).toHaveText(['Avião PR-HAR', 'Avião PR-VOM']);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana']);
    await atributo('PR-VOM', false);
    await expect(botao).toHaveText('Habilitações: Avião PR-HAR');
    await expect(painel.locator('input[data-valor="aviao:PR-VOM"]')).toHaveCount(0);
    // As Habilitações do detalhe também acompanham
    await abrirInstrutor(page, 1);
    await expect(habilitacaoDoInstrutor(page, 'aviao:PR-VOM')).toHaveCount(0);
    await expect(habilitacaoDoInstrutor(page, 'aviao:PR-HAR')).toBeChecked();
  });

  // As marcas e o painel aberto duram aos redesenhos: a lista refeita com a escala (o turno aplicado), outra data e o
  // instrutor novo
  test('o filtro das habilitações dura aos redesenhos: o painel aberto, as marcas e o foco na caixa', async ({ page }) => {
    const ins = [instrutor(1, 1, { nm: 'Ana', hab: ['local', 'c172', 'noturno'] }), instrutor(2, 1, { nm: 'Bruno', hab: ['local', 'noturno'] }),
      instrutor(3, 1, { nm: 'Carla', hab: ['local', 'c172', 'noturno'] })];
    await abrir(page, { estado: { ...cenario({ ins }), nid: 4 } });
    await abrirInstrutor(page, 1);
    const botao = page.locator('#flt-ins-hab'), painel = page.locator('#flt-ins-hab-painel');
    await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Carla']);
    // O redesenho com o foco numa caixa do filtro (como o da escala refeita por baixo): o foco fica nela
    const c172 = painel.locator('input[data-valor="c172"]');
    await c172.focus();
    await page.evaluate(async () => { const { redesenharPorNome } = await import('./js/redesenho.js'); redesenharPorNome('instrutores'); });
    await expect(c172).toBeFocused();
    await expect(painel).toBeVisible();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    // Outra data (o clique na seta fecha o painel): as marcas continuam
    await diaSeguinte(page);
    await expect(dataAberta(page)).toHaveAttribute('data-data', '2026-11-12');
    await expect(botao).toHaveText('Habilitações: Noturno + C172');
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Carla']);
    await page.locator('[data-act="addi"]').click();
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Ana', 'Carla', 'Novo instrutor']);
    await expect(page.locator('#ins-contagem')).toHaveText('3 de 4 instrutores');
  });
});

test.describe('INVAs: o detalhe', () => {
  test('"Nesta data": o "Vem", as faixas e as pausas, a tira, os três turnos e os voos dele na escala', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirEscala(page);
    const linhasDaEscala = (await lerEscala(page)).linhas;
    await irPara(page, 'ins');
    const comVoos = linhasDosInstrutores(page).filter({ has: page.locator('.lista-meta') }).first();
    const id = (await comVoos.getAttribute('data-chave')).slice(2);
    const nome = (await comVoos.locator('.lista-titulo').innerText()).trim();
    const n = linhasDaEscala.filter(l => l.includes(`| ${nome} |`)).length;
    await expect(comVoos.locator('.lista-meta')).toHaveText(`${n} ${n === 1 ? 'voo' : 'voos'}`);
    await abrirInstrutor(page, id);
    const nestaData = secaoDoInstrutor(page, 'data');
    await expect(nestaData.locator('.det-secao-btn')).toContainText('Nesta data');
    await expect(nestaData.locator('.det-escopo')).toHaveText('qua 11/11');
    await expect(nestaData.locator('.voos-do-instrutor > li')).toHaveCount(n);
    await expect(campoDoInstrutor(page, 'on')).toBeChecked();
    await expect(campoDoInstrutor(page, 'on')).toHaveAccessibleName(/^Vem\b.*vem nesta data$/);
    await expect(nestaData.locator('[data-dica="vem-nesta-data"]')).toHaveAccessibleName('O que é Vem?');
    await expect(faixasDoAberto(page)).toHaveText('06:30–24:00');
    await expect(pausasDoAberto(page)).toHaveText('nenhuma');
    await expect(nestaData.locator('[data-dica="faixas"]')).toHaveAccessibleName('O que é Pode decolar?');
    await expect(nestaData.locator('.tira.grande .tira-voo')).toHaveCount(n);
    // Os três turnos (sem Manhã nem Tarde), cada um com a faixa dele; "Editar faixas"
    await expect(nestaData.locator('[data-act="turno"]')).toHaveText(['Dia inteiro 06:30–17:30', 'Noturno 17:30–24:00', 'Dia + noturno 06:30–24:00']);
    await expect(botaoDoTurno(page, 'dia-e-noturno')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#det-ins-editar-faixas')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Manhã|Tarde)/ })).toHaveCount(0);
    // "O que cabe nestas faixas" (C, "regra"): em cada lista, os horários em que a missão começa e até quando pode ir
    const cabe = nestaData.locator('details.faixas-cabe');
    await expect(cabe.locator('summary')).toHaveText('O que cabe nestas faixas');
    await cabe.locator('summary').click();
    await expect(cabe.locator('li')).toHaveText([
      'C152: 06:30 a 16:20 (8 horários); termina até as 17:30', 'C172: 06:30 a 16:20 (8 horários); termina até as 17:30',
      'Simulador: 06:30 a 16:20 (8 horários); termina até as 21:20', 'PA-34: 06:30 a 16:30 (21 horários); termina até as 17:30',
      'Ground: 06:30 a 16:20 (8 horários); termina até as 21:20', 'Noturno: 17:30 (1 horário); termina até as 21:30'
    ]);
  });

  // A regra do início (C, "regra"; decisão 1 do Pedro): o voo começa dentro da faixa e pode terminar depois dela; a pausa,
  // nenhum voo a toca. "Editar faixas" diz a regra
  test('a regra do início: o voo das 11:30 de 2 h fica com o INVA da manhã, que não recebe nada na pausa', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 690, p2: -1, nb: 2 })] }) });
    await abrirInstrutor(page, 1);
    await page.locator('#det-ins-editar-faixas').click();
    await expect(page.locator('#det-ins-faixas-dica')).toHaveText('O voo começa dentro de uma faixa (o Até não entra: até 17:30 não inclui o Noturno) e pode terminar depois dela; nenhum voo toca uma pausa.');
    await page.locator('#det-ins-cancelar-faixas').click();
    await editarFaixas(page, 1, { faixas: [{ de: '06:30', ate: '12:40' }] });
    await expect(faixasDoAberto(page)).toHaveText('06:30–12:40');
    await expect(secaoDoInstrutor(page, 'data').locator('.voo-quando')).toHaveText(['11:30–13:30']);
    const cabe = secaoDoInstrutor(page, 'data').locator('details.faixas-cabe');
    await cabe.locator('summary').click();
    await expect(cabe.locator('li').first()).toHaveText('C152: 06:30 a 11:30 (4 horários); termina até as 16:30');
    // Com a pausa das 12:00 às 13:00, o voo não começa às 11:30 (passaria por ela)
    await editarFaixas(page, 1, { faixas: [{ de: '06:30', ate: '12:40' }], pausas: [{ de: '12:00', ate: '13:00' }] });
    await expect(pausasDoAberto(page)).toHaveText('12:00–13:00');
    await expect(secaoDoInstrutor(page, 'data').locator('.voo-quando')).not.toHaveText(['11:30–13:30']);
    const [quando] = await secaoDoInstrutor(page, 'data').locator('.voo-quando').allTextContents();
    expect(quando.split('–')[1] <= '12:00', quando).toBe(true);
  });

  // Um turno troca as faixas da data pela dele, sem pausa; o ↶ do Histórico devolve as de antes (setFaixas)
  test('um turno: a faixa dele na linha, na escala e no Histórico; o ↶ devolve as faixas de antes', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 1, p2: 2 })] }) });
    await aplicarTurno(page, 1, 'noturno');
    await expect(faixasNaLinha(page, 1)).toHaveText('17:30–24:00');
    await expect(faixasDoAberto(page)).toHaveText('17:30–24:00');
    await expect(botaoDoTurno(page, 'noturno')).toBeFocused();
    await expect(entradasDoHistorico(page, 'Turno de Instrutor 01 nesta data: Noturno (17:30–24:00)')).toHaveCount(1);
    // O Voo Local das 08:20 sai da escala: o único instrutor só voa no noturno
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'))).toHaveLength(0);
    await reverter(page, 'Turno de Instrutor 01');
    await expect(entradasDoHistorico(page, 'Revertido: faixas de Instrutor 01 nesta data: 06:30–24:00')).toHaveCount(1);
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'))).toHaveLength(1);
    await irPara(page, 'ins');
    await expect(faixasNaLinha(page, 1)).toHaveText('06:30–24:00');
  });

  // U4: meio dia é uma faixa digitada ("Editar faixas", o Até, "Salvar faixas"); "Almoço" é uma pausa pronta. O voo
  // inteiro cabe numa faixa, fora das pausas (a regra de antes do C)
  test('"Editar faixas": meio dia digitado, o almoço, o Até antes do De recusado, "Cancelar"; vale na escala e no dia seguinte', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 2, p2: 3 })] }) });
    await abrirInstrutor(page, 1);
    await page.locator('#det-ins-editar-faixas').click();
    await expect(campoDaFaixa(page, 'faixa', 0, 'de')).toBeFocused();
    await expect(campoDaFaixa(page, 'faixa', 0, 'de')).toHaveAccessibleName('1ª faixa: de');
    await expect(page.locator('#det-ins .faixas-form .fx-rotulo').first()).toHaveText('Pode decolar de');
    // A lista de horários: de 10 em 10 minutos, das 06:30 à meia-noite
    await expect(campoDaFaixa(page, 'faixa', 0, 'de').locator('option').first()).toHaveText('06:30');
    await expect(campoDaFaixa(page, 'faixa', 0, 'ate').locator('option').last()).toHaveText('24:00');
    // O Até antes do De: a mensagem, e nada gravado
    await campoDaFaixa(page, 'faixa', 0, 'de').selectOption({ label: '13:00' });
    await campoDaFaixa(page, 'faixa', 0, 'ate').selectOption({ label: '12:00' });
    await page.locator('#det-ins-salvar-faixas').click();
    await expect(page.locator('#det-ins-faixas-erro')).toHaveText('Na 1ª faixa, o Até vem depois do De.');
    await expect(faixasNaLinha(page, 1)).toHaveText('06:30–24:00');
    // "Cancelar" joga o rascunho fora
    await page.locator('#det-ins-cancelar-faixas').click();
    await expect(page.locator('#det-ins .faixas-form')).toHaveCount(0);
    await expect(page.locator('#det-ins-editar-faixas')).toBeFocused();

    // Meio dia, à tarde, com o almoço: a linha, o detalhe e o Histórico
    await page.locator('#det-ins-editar-faixas').click();
    await campoDaFaixa(page, 'faixa', 0, 'de').selectOption({ label: '10:00' });
    await campoDaFaixa(page, 'faixa', 0, 'ate').selectOption({ label: '17:30' });
    await page.locator('#det-ins-almoco').click();
    await expect(campoDaFaixa(page, 'pausa', 0, 'de')).toBeFocused();
    await expect(campoDaFaixa(page, 'pausa', 0, 'ate')).toHaveValue('780');
    await expect(page.locator('#det-ins-almoco')).toBeDisabled();
    await page.locator('#det-ins-salvar-faixas').click();
    await expect(page.locator('#det-ins-editar-faixas')).toBeFocused();
    await expect(faixasNaLinha(page, 1)).toHaveText('10:00–17:30 · pausa 12:00–13:00');
    await expect(faixasDoAberto(page)).toHaveText('10:00–17:30');
    await expect(pausasDoAberto(page)).toHaveText('12:00–13:00');
    await expect(entradasDoHistorico(page, 'Faixas de Instrutor 01 nesta data: 10:00–17:30; pausa 12:00–13:00')).toHaveCount(1);
    // Nenhum turno é estas faixas
    await expect(page.locator('#det-ins [data-act="turno"][aria-pressed="true"]')).toHaveCount(0);
    // O voo do aluno (10:10 ou 11:30, 1 h) cabe inteiro na faixa e fora da pausa
    const quando = await secaoDoInstrutor(page, 'data').locator('.voo-quando').allTextContents();
    expect(quando).toHaveLength(1);
    const [inicio, fim] = quando[0].split('–');
    expect(inicio >= '10:00' && fim <= '17:30' && (fim <= '12:00' || inicio >= '13:00'), quando[0]).toBe(true);
    // A data seguinte começa com as faixas desta
    await diaSeguinte(page);
    await expect(faixasNaLinha(page, 1)).toHaveText('10:00–17:30 · pausa 12:00–13:00');
  });

  test('"+ Faixa", "+ Pausa" e o ✕: duas faixas e uma pausa, e o ↶ devolve as de antes', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9), instrutor(2, 9)] }) });
    await editarFaixas(page, 1, { faixas: [{ de: '06:30', ate: '11:00' }, { de: '14:00', ate: '17:30' }], pausas: [{ de: '15:00', ate: '15:30' }] });
    await expect(faixasNaLinha(page, 1)).toHaveText('06:30–11:00 e 14:00–17:30 · pausa 15:00–15:30');
    await expect(tiraDaLinha(page, 1).locator('.tira-faixa')).toHaveCount(2);
    // Sem faixa nenhuma: o instrutor não voa na data
    await editarFaixas(page, 2, { faixas: [], pausas: [] });
    await expect(faixasNaLinha(page, 2)).toHaveText('sem faixa');
    await reverter(page, 'Faixas de Instrutor 01');
    await expect(faixasNaLinha(page, 1)).toHaveText('06:30–24:00');
  });

  test('o "Vem" do detalhe e o da linha são o mesmo; o ↶ do Histórico devolve', async ({ page }) => {
    await abrirSintetico(page);
    await abrirInstrutor(page, 1);
    await campoDoInstrutor(page, 'on').uncheck();
    await expect(faixasNaLinha(page, 1)).toHaveText('não vem nesta data');
    await expect(caixaVem(linhaDoInstrutor(page, 1))).not.toBeChecked();
    await expect(secaoDoInstrutor(page, 'data')).toContainText('não vem nesta data');
    await reverter(page, 'Instrutor 01: Indisponível');
    await expect(caixaVem(linhaDoInstrutor(page, 1))).toBeChecked();
    await expect(campoDoInstrutor(page, 'on')).toBeChecked();
  });

  test('o instrutor novo: o dia inteiro, as habilitações do nível 1, o peso em destaque; habilitações e peso no detalhe', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await page.locator('[data-act="addi"]').click();
    await expect(linhasDosInstrutores(page)).toHaveCount(41);
    await expect(page.locator('#det-ins-titulo')).toHaveText('Novo instrutor');
    await expect(faixasDoAberto(page)).toHaveText('06:30–17:30');
    await expect(botaoDoTurno(page, 'dia')).toHaveAttribute('aria-pressed', 'true');
    await expect(campoDoInstrutor(page, 'kg')).toHaveClass(/\bfalta\b/);
    await expect(habilitacaoDoInstrutor(page, 'c152')).toBeChecked();
    await habilitacaoDoInstrutor(page, 'c172').check();
    await habilitacaoDoInstrutor(page, 'local').uncheck();
    await campoDoInstrutor(page, 'kg').fill('80');
    await campoDoInstrutor(page, 'kg').blur();
    await expect(campoDoInstrutor(page, 'kg')).not.toHaveClass(/\bfalta\b/);
    await expect(entradasDoHistorico(page, 'Peso Novo instrutor: 80 kg')).toHaveCount(1);
    await expect(entradasDoHistorico(page, 'Habilitação incluída: Novo instrutor · C172')).toHaveCount(1);
    await expect(entradasDoHistorico(page, 'Habilitação retirada: Novo instrutor · Voo Local')).toHaveCount(1);
    // O peso que não vale fica no campo, com a mensagem
    await campoDoInstrutor(page, 'kg').fill('400');
    await campoDoInstrutor(page, 'kg').blur();
    await expect(campoDoInstrutor(page, 'kg')).toHaveAttribute('aria-invalid', 'true');
  });

  test('o checador por partes: o curso, o motor e as regras; o cheque vai para quem tem as três', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { hab: ['local', 'c152', 'checa_pp', 'checa_mnte'] }), instrutor(2, 9, { hab: ['local', 'c152'] })],
      stu: [aluno(1000, { mis: 'Cheque PP', eq: 'C152' })]
    });
    await abrir(page, { estado });
    await irPara(page, 'ins');
    await expect(habilitacoesNaLinha(page, 1)).toHaveText('Checador · Local');
    await abrirInstrutor(page, 1);
    const habs = secaoDoInstrutor(page, 'habilitacoes');
    const grupo = nome => habs.locator('fieldset', { has: page.locator('legend', { hasText: nome }) }).locator('label');
    await expect(grupo('Checador: curso')).toHaveText(['Checador do curso PP', 'Checador do curso PC', 'Checador do curso INVA']);
    await expect(grupo('Checador: motor')).toHaveText(['Checador MNTE', 'Checador MLTE']);
    await expect(grupo('Checador: regras')).toHaveText(['Checador VFR', 'Checador IFR']);
    await expect(habs.locator('.dica-btn[data-dica="checador"]')).toHaveCount(1);
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'))).toHaveLength(0);
    await abrirInstrutor(page, 1);
    await habilitacaoDoInstrutor(page, 'checa_vfr').check();
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos).toHaveLength(1);
    expect(voos[0]).toContain('| Instrutor 01 |');
  });

  // N5 (F1d): Endosso Solo e Nav. ≥ 150 NM no grupo Voo das Habilitações, desmarcadas para todos; marcar grava
  test('as Habilitações têm Endosso Solo e Nav. ≥ 150 NM, desmarcadas para todos, e marcar grava', async ({ page }) => {
    await abrirSintetico(page);
    await abrirInstrutor(page, 9);
    const voo = secaoDoInstrutor(page, 'habilitacoes').locator('fieldset', { has: page.locator('legend', { hasText: /^Voo$/ }) }).locator('label');
    await expect(voo).toHaveText(['TGL (TMA)', 'Voo Local', 'Voo de Navegação', 'Voo de Navegação ≥ 150 NM', 'Voo para liberação de Solo',
      'Endosso Solo', 'Voo de Parafuso (SPIN)', 'Voo IFR', 'Voo Noturno']);
    await expect(habilitacaoDoInstrutor(page, 'navegacao_150')).not.toBeChecked();
    await habilitacaoDoInstrutor(page, 'endosso_solo').check();
    await expect(entradasDoHistorico(page, 'Habilitação incluída: Instrutor 09 · Endosso Solo')).toHaveCount(1);
    await filtrarHabilitacoes(page, ['endosso_solo']);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Instrutor 09']);
  });

  test('as habilitações não são cumulativas e valem na escala', async ({ page }) => {
    const estado = cenario({
      ins: [instrutor(1, 9, { hab: ['local', 'noturno', 'c172'] }), instrutor(2, 1, { hab: ['sim_mono'] })],
      stu: [aluno(1000, { mis: 'Simulador', eq: 'Sim. Mono' })]
    });
    await abrir(page, { estado });
    await abrirEscala(page);
    const voos = (await lerEscala(page)).linhas.filter(l => l.includes('Aluno 1000'));
    expect(voos[0]).toContain('| Instrutor 02 |');
    await abrirInstrutor(page, 2);
    await habilitacaoDoInstrutor(page, 'sim_mono').uncheck();
    await irPara(page, 'esc');
    await expect(page.locator('#out')).toContainText('nenhum instrutor ativo tem a habilitação de Simulador no Sim. Mono (Simulador (Mono))');
  });

  // "Agendar voo com <nome>", no alto do detalhe: o diálogo do agendamento com o instrutor
  test('"Agendar voo com <nome>" abre o agendamento com o instrutor escolhido', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000), aluno(1001, { fly: false })] }) });
    await abrirEscala(page);
    await abrirInstrutor(page, 2);
    const agendar = page.locator('#det-ins [data-act="agendar"]');
    await expect(agendar).toHaveAccessibleName('Agendar voo com Instrutor 02');
    await expect(agendar).toHaveAttribute('data-agendar', 'i:2');
    await agendar.click();
    await expect(page.locator('#dlg-agendar')).toBeVisible();
    await expect(page.locator('#agd-contexto')).toContainText('Com Instrutor 02');
    await page.keyboard.press('Escape');
    await expect(agendar).toBeFocused();
  });

  test('"Excluir instrutor…" pede o segundo clique; o "Ativo" desligado deixa a linha discreta e tira "Agendar voo"', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)] }) });
    await abrirInstrutor(page, 2);
    await confirmar(page, '#det-ins-excluir');
    await expect(entradasDoHistorico(page, 'Instrutor excluído: Instrutor 02')).toHaveCount(1);
    await expect.poll(() => nomesDosInstrutores(page)).toEqual(['Instrutor 01', 'Instrutor 03']);
    await expect(page.locator('#det-ins')).toHaveText('Escolha um instrutor na lista.');
    await abrirInstrutor(page, 3);
    await linhaDoInstrutor(page, 3).locator('[data-act="ativo"]').click();
    await expect(linhaDoInstrutor(page, 3)).toHaveClass(/\binativo\b/);
    await expect(caixaVem(linhaDoInstrutor(page, 3))).toHaveCount(0);
    await expect(page.locator('#det-ins-aviso')).toContainText('Inativo no cadastro');
    await expect(page.locator('#det-ins [data-act="agendar"]')).toHaveCount(0);
  });

  test('os limites da lei: o item fixo do alto, com os campos e o "?"', async ({ page }) => {
    await abrirSintetico(page);
    await abrirLimitesDaLei(page);
    await expect(page).toHaveURL(/#\/ins\/limites$/);
    await expect(page.locator('#limites-lei [data-limite="vooMesH"]')).toHaveValue('100');
    await expect(page.locator('#limites-lei [data-dica="limites-da-lei"]')).toHaveCount(1);
    await expect(page.locator('#det-ins-excluir')).toHaveCount(0);
  });
});

// No celular (390 px; os testes que mudam a largura dizem qual)
test.describe('INVAs no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // O filtro das habilitações no celular (390 e 320 px): o painel abre no fluxo da página, inteiro na largura da tela (a
  // lista desce para baixo dele), com alvos de 44 px
  test('o filtro das habilitações cabe no celular (390 e 320 px): o painel empurra a lista, com alvos de 44 px', async ({ page }) => {
    await abrirComExemplo(page);
    for (const largura of [390, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await irPara(page, 'ins');
      await filtrarHabilitacoes(page, ['noturno', 'c172'], { fechar: false });
      const [painel, lista] = await Promise.all(['#flt-ins-hab-painel', '#ins'].map(seletor => page.locator(seletor).boundingBox()));
      expect(painel.x, `${largura}: o painel na tela`).toBeGreaterThanOrEqual(0);
      expect(painel.x + painel.width, `${largura}: o painel na tela`).toBeLessThanOrEqual(largura);
      expect(lista.y, `${largura}: a lista embaixo do painel`).toBeGreaterThanOrEqual(painel.y + painel.height);
      expect(await larguraDaPagina(page), `${largura}: a página não rola para o lado`).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page), `${largura}: alvos de 44 px`).toEqual([]);
      await filtrarHabilitacoes(page, []);
    }
  });

  // A lista, depois o detalhe ("‹ INVAs" volta); "Editar faixas" cabe na tela, com alvos de 44 px
  test('a lista, depois o detalhe; "Editar faixas" cabe na tela, com alvos de 44 px', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'ins');
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vendo', 'lista');
    await abrirInstrutor(page, 1);
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vendo', 'detalhe');
    await page.locator('#det-ins-editar-faixas').click();
    await page.locator('#det-ins-almoco').click();
    expect(await larguraDaPagina(page)).toBeLessThanOrEqual(390);
    expect(await alvosPequenos(page)).toEqual([]);
    await page.locator('#det-ins-voltar').click();
    await expect(page.locator('#s-ins')).toHaveAttribute('data-vendo', 'lista');
  });
});

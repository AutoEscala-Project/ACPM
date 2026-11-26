// O editor do voo na Escala (F1g, N10): todos os campos de um voo, pela barra do mapa ou pelo "Editar" da Lista. Na escala
// aprovada, só aquele voo muda e o motor não roda; fora dela, a pergunta (#dlg-refazer) vem antes, e "Salvar e refazer"
// roda o motor. Nada é gravado antes de "Salvar"; "Cancelar" e o Esc deixam o dia gravado igual
import { test, expect, abrir, abrirEscala, aprovar, reabrir, lerEscala, abrirHistorico, entradasDoHistorico, abrirCaixa, larguraDaPagina, AMANHA, vigiarErros,
  editorDoVoo, editarPelaLista, editarPeloMapa, barraDoVoo, botaoEditar, salvarVoo, perguntaDoRefazer, refazer, naoRefazer } from './fixtures.js';
import { aluno, cenario, instrutor, apenas } from '../helpers/montar.js';

// Um C152 só (PP-LJV): o Aluno 1000 às 06:30, o 1001 às 08:20 e o 1002 às 10:10; o 1003 só às 06:30 (o minuto exato), que
// fica fora: o avião já está com o 1000
const dia = () => cenario({
  ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)],
  semAeronaves: apenas('C152', 'PP-LJV'),
  stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 500, p2: -1 }), aluno(1002, { p1: 610, p2: -1 }), aluno(1003, { p1: 390, p2: -1, jan: 'h390' })]
});
const diaGuardado = page => page.evaluate(d => localStorage.getItem(`acpm4_dia_${d}`), AMANHA);
const linhaDe = (escala, nome) => escala.linhas.find(l => l.includes(`| ${nome} |`));
const naoEntrou = page => page.locator('#out details.caixa.erros summary');

test.describe('O editor do voo', () => {
  test('na escala aprovada: o horário muda só naquele voo, sem refazer a escala (o pedido que ficou fora continua fora) e sem a pergunta', async ({ page }) => {
    const erros = vigiarErros(page);
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await expect(naoEntrou(page)).toHaveText('1 missão não entrou na escala: Aluno 1003');
    await aprovar(page);
    const antes = await lerEscala(page);
    await editarPelaLista(page, '1000_0_1');
    await expect(page.locator('#voo-contexto')).toContainText('escala aprovada: só este voo muda');
    await page.locator('#voo-horario').selectOption('760');
    await salvarVoo(page);
    await expect(editorDoVoo(page)).toBeHidden();
    await expect(perguntaDoRefazer(page)).toBeHidden();
    const depois = await lerEscala(page);
    expect(linhaDe(depois, 'Aluno 1000')).toContain('12:40–13:40');
    expect(linhaDe(depois, 'Aluno 1001')).toBe(linhaDe(antes, 'Aluno 1001'));
    expect(linhaDe(depois, 'Aluno 1002')).toBe(linhaDe(antes, 'Aluno 1002'));
    // O lugar das 06:30 ficou livre, mas o motor não rodou: o 1003 continua fora
    await expect(naoEntrou(page)).toHaveText('1 missão não entrou na escala: Aluno 1003');
    await abrirHistorico(page);
    await expect(entradasDoHistorico(page, 'Voo editado: Aluno 1000: 06:30 → 12:40')).toHaveCount(1);
    expect(erros).toEqual([]);
  });

  test('fora da escala aprovada: a pergunta vem antes, com o que muda; "Cancelar" não grava nada; "Salvar e refazer" roda o motor', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const guardado = await diaGuardado(page);
    await editarPelaLista(page, '1000_0_1');
    await expect(page.locator('#voo-contexto')).toContainText('escala não aprovada: Salvar refaz a escala inteira');
    await page.locator('#voo-horario').selectOption('760');
    await salvarVoo(page);
    await expect(perguntaDoRefazer(page)).toBeVisible();
    await expect(perguntaDoRefazer(page)).toHaveAttribute('role', 'alertdialog');
    await expect(page.locator('#refazer-texto')).toHaveText('A escala de qua 11/11 não está aprovada. Com esta alteração (Aluno 1000: 06:30 → 12:40), a escala inteira será refeita, e outros voos podem mudar de horário, de recurso ou de INVA.');
    await expect(page.locator('#refazer-cancelar')).toBeFocused();
    // "Cancelar": de volta ao editor, como estava, e nada gravado
    await naoRefazer(page);
    await expect(editorDoVoo(page)).toBeVisible();
    await expect(page.locator('#voo-horario')).toHaveValue('760');
    await page.locator('#voo-cancelar').click();
    await expect(editorDoVoo(page)).toBeHidden();
    expect(await diaGuardado(page)).toBe(guardado);
    // De novo, agora "Salvar e refazer": o motor encaixa o 1003 no lugar das 06:30
    await editarPelaLista(page, '1000_0_1');
    await page.locator('#voo-horario').selectOption('760');
    await salvarVoo(page);
    await refazer(page);
    await expect(naoEntrou(page)).toHaveCount(0);
    expect(linhaDe(await lerEscala(page), 'Aluno 1003')).toContain('06:30–07:30');
  });

  test('Esc e "Cancelar" não mudam nada: o dia gravado fica igual, byte a byte, e o foco volta para a barra ou o botão', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    const guardado = await diaGuardado(page);
    await editarPelaLista(page, '1001_0_1');
    await page.locator('#voo-horario').selectOption('760');
    await page.keyboard.press('Escape');
    await expect(editorDoVoo(page)).toBeHidden();
    await expect(botaoEditar(page, '1001_0_1')).toBeFocused();
    await abrirEscala(page, { vista: 'eq' });
    await editarPeloMapa(page, '1001_0_1');
    await page.locator('#voo-instrutor').selectOption({ index: 1 });
    await page.locator('#voo-cancelar').click();
    await expect(barraDoVoo(page, '1001_0_1')).toBeFocused();
    expect(await diaGuardado(page)).toBe(guardado);
  });

  test('só pelo teclado: Enter na barra abre o editor com o foco no primeiro campo; o Tab fica dentro dele; Esc volta à barra', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page, { vista: 'eq' });
    await barraDoVoo(page, '1002_0_1').focus();
    await page.keyboard.press('Enter');
    await expect(editorDoVoo(page)).toBeVisible();
    await expect(page.locator('#voo-aluno')).toBeFocused();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement.closest('#dlg-voo')))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(editorDoVoo(page)).toBeHidden();
    await expect(barraDoVoo(page, '1002_0_1')).toBeFocused();
  });

  test('um conflito avisa e pede "Salvar mesmo assim"; salvo, o voo fica em conflito na Escala (na aprovada)', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await editarPelaLista(page, '1001_0_1');
    // O 1001 às 06:30, no avião do 1000
    await page.locator('#voo-horario').selectOption('390');
    await expect(page.locator('#voo-avisos li.conflito')).toContainText(['O avião já está ocupado neste horário.']);
    // O aviso fica ligado ao campo do conflito (o avião ocupado: o recurso)
    await expect(page.locator('#voo-recurso')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#voo-recurso')).toHaveAttribute('aria-describedby', /voo-aviso-/);
    await salvarVoo(page);
    await expect(page.locator('#voo-salvar')).toHaveText('Salvar mesmo assim');
    await expect(page.locator('#voo-erro')).toContainText('para salvar assim mesmo');
    await salvarVoo(page);
    await expect(editorDoVoo(page)).toBeHidden();
    const conflitos = await abrirCaixa(page, 'conflitos');
    await expect(conflitos).toContainText('Aluno 1001 Conflito no voo agendado: o avião já está ocupado neste horário.');
  });

  test('na escala aprovada, a alteração fica depois de reabrir (o voo posto à mão), e o Histórico a desfaz sem o motor', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await editarPelaLista(page, '1002_0_1');
    await page.locator('#voo-horario').selectOption('870');
    await salvarVoo(page);
    await expect(editorDoVoo(page)).toBeHidden();
    // O voo posto à mão: o "Automático" do instrutor fica desligado, com o porquê
    await editarPelaLista(page, '1002_0_1');
    await expect(page.locator('#voo-instrutor option[value="0"]')).toBeDisabled();
    await expect(page.locator('#voo-trava-automatico')).toHaveText('Automático: o voo foi posto à mão: reverta no Histórico para o app escolher.');
    await page.keyboard.press('Escape');
    await reabrir(page);
    expect(linhaDe(await lerEscala(page), 'Aluno 1002')).toContain('14:30–15:30');
    await aprovar(page);
    await abrirHistorico(page);
    await entradasDoHistorico(page, 'Voo editado: Aluno 1002').getByRole('button', { name: '↶ Reverter' }).click();
    await page.keyboard.press('Escape');
    await expect.poll(async () => linhaDe(await lerEscala(page), 'Aluno 1002')).toContain('10:10–11:10');
    await expect(naoEntrou(page)).toHaveText('1 missão não entrou na escala: Aluno 1003');
  });

  test('o aluno: o voo passa para outro aluno, e o de antes deixa de voar', async ({ page }) => {
    const estado = dia();
    estado.stu.push(aluno(1004, { fly: false }));
    await abrir(page, { estado });
    await abrirEscala(page);
    await aprovar(page);
    await editarPelaLista(page, '1001_0_1');
    await page.locator('#voo-aluno').selectOption('1004');
    await expect(page.locator('#voo-titulo')).toHaveText('Voo de Aluno 1004');
    await salvarVoo(page);
    await expect(editorDoVoo(page)).toBeHidden();
    const escala = await lerEscala(page);
    expect(linhaDe(escala, 'Aluno 1004')).toContain('08:20–09:20');
    expect(linhaDe(escala, 'Aluno 1001')).toBeUndefined();
  });

  test('o status no editor, como na Lista: Cancelado pede o motivo; salvo, sem refazer a escala aprovada', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await editarPelaLista(page, '1000_0_1');
    await page.locator('#voo-status').selectOption('Cancelado');
    await expect(page.locator('#dlg-status')).toBeVisible();
    await page.locator('#dlg-status input[name="motivo"][value="Meteorologia"]').check();
    await page.locator('#st-confirmar').click();
    await expect(page.locator('#voo-status')).toHaveValue('Cancelado');
    await salvarVoo(page);
    await expect(editorDoVoo(page)).toBeHidden();
    expect(linhaDe(await lerEscala(page), 'Aluno 1000')).toContain('[Cancelado]');
    // O motor não rodou: o 1003 continua fora (o cancelado não ocupa o avião, mas nada entra sem o motor)
    await expect(naoEntrou(page)).toHaveText('1 missão não entrou na escala: Aluno 1003');
  });

  test('o Gestor vê os campos como texto, sem "Salvar"', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page, { vista: 'eq' });
    await page.locator('#role-sel').selectOption('gestor');
    await editarPeloMapa(page, '1000_0_1');
    await expect(page.locator('#voo-campos select, #voo-campos input')).toHaveCount(0);
    await expect(page.locator('#voo-campos')).toContainText('Aluno 1000');
    await expect(page.locator('#voo-salvar')).toBeHidden();
    await expect(page.locator('#voo-cancelar')).toHaveText('Fechar');
    await page.keyboard.press('Escape');
    await expect(editorDoVoo(page)).toBeHidden();
  });

  for (const largura of [390, 320]) {
    test(`no celular (${largura} px): o editor ocupa a tela, sem rolar para o lado, com 44 px para o dedo`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 780 });
      await abrir(page, { estado: dia() });
      await abrirEscala(page);
      await editarPelaLista(page, '1000_0_1');
      const caixa = await editorDoVoo(page).boundingBox();
      expect(Math.round(caixa.width)).toBe(largura);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      const pequenos = await page.evaluate(() => [...document.querySelectorAll('#dlg-voo select, #dlg-voo input, #dlg-voo button, #dlg-voo a[href]')]
        .filter(el => el.checkVisibility() && el.getBoundingClientRect().height < 44).map(el => el.id || el.textContent.trim()));
      expect(pequenos).toEqual([]);
      const dentro = await page.evaluate(() => [...document.querySelectorAll('#dlg-voo *')].filter(el => el.checkVisibility() && el.getBoundingClientRect().right > window.innerWidth + 1).map(el => el.id || el.tagName));
      expect(dentro).toEqual([]);
    });
  }
});

test.describe('A pergunta antes de refazer a escala (R6) e a escala aprovada sem o motor', () => {
  test('o status na Lista: fora da escala aprovada pergunta toda vez, e "Cancelar" volta o status de antes; na aprovada não pergunta', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    const status = page.locator('#out select[data-f="fstatus"][data-fkey="1000_0_1"]');
    await status.selectOption('Em Voo');
    await naoRefazer(page);
    await expect(status).toHaveValue('Confirmado');
    await status.selectOption('Em Voo');
    await refazer(page);
    await expect(status).toHaveValue('Em Voo');
    await aprovar(page);
    await status.selectOption('Pousou');
    await expect(perguntaDoRefazer(page)).toBeHidden();
    await expect(status).toHaveValue('Pousou');
  });

  test('o "✕" na escala aprovada: só o voo sai, e "↶ Restaurar" o devolve ao mesmo lugar', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    const antes = linhaDe(await lerEscala(page), 'Aluno 1002');
    await page.locator('#out [data-act="rm-fly"][data-id="1002"]').click();
    await expect(perguntaDoRefazer(page)).toBeHidden();
    expect(linhaDe(await lerEscala(page), 'Aluno 1002')).toBeUndefined();
    await expect(naoEntrou(page)).toHaveText('1 missão não entrou na escala: Aluno 1003');
    await abrirHistorico(page);
    await entradasDoHistorico(page, 'Tirado da escala: Aluno 1002').getByRole('button', { name: '↶ Restaurar' }).click();
    await page.keyboard.press('Escape');
    await expect.poll(async () => linhaDe(await lerEscala(page), 'Aluno 1002')).toBe(antes);
  });

  test('"Soltar" fica desligado na escala aprovada, com o porquê', async ({ page }) => {
    await abrir(page, { estado: dia() });
    await abrirEscala(page);
    await aprovar(page);
    await editarPelaLista(page, '1001_0_1');
    await page.locator('#voo-horario').selectOption('390');
    await salvarVoo(page);
    await salvarVoo(page);
    const conflitos = await abrirCaixa(page, 'conflitos');
    await conflitos.getByRole('button', { name: 'Sugestões' }).click();
    const soltar = page.locator('#painel-reparo button', { hasText: 'Soltar' });
    await expect(soltar).toBeDisabled();
    await expect(page.locator('#soltar-travado')).toHaveText('Reabra a escala para soltar o voo.');
  });
});

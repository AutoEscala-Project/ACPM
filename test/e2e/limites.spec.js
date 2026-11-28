// Limites dos instrutores pela Lei do Aeronauta: as horas de voo do instrutor (a seção "Horas de voo" do detalhe dele, com
// as de fora do app, e o ponto da linha perto do limite) e os limites, no item fixo do alto de INVAs (só o Administrador
// muda; neste navegador, o Operador).
import { test, expect, abrir, abrirEscala, abrirHistorico, abrirInstrutor, campoDoInstrutor, secaoDoInstrutor, linhaDoInstrutor, abrirLimitesDaLei, campoDoLimite } from './fixtures.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const umInstrutorDoisVoos = () => cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 610, p2: -1 })] });

test.describe('Limites da lei', () => {
  test('o detalhe mostra as horas de voo do mês; as de fora do app entram por ele; perto do limite, o ponto da linha', async ({ page }) => {
    await abrir(page, { estado: umInstrutorDoisVoos() });
    await abrirInstrutor(page, 1);
    const horas = secaoDoInstrutor(page, 'horas');
    await expect(horas).toContainText('No mês: 2 h de 100 h');
    await expect(linhaDoInstrutor(page, 1).locator('.lista-ponto.aviso')).toHaveCount(0);
    await campoDoInstrutor(page, 'ext-mes').fill('88');
    await campoDoInstrutor(page, 'ext-mes').dispatchEvent('change');
    await expect(horas).toContainText('No mês: 90 h de 100 h');
    await expect(horas).toContainText('Perto do limite: 90 h de voo no mês (limite 100 h).');
    await expect(campoDoInstrutor(page, 'ext-mes')).toBeFocused();
    await expect(linhaDoInstrutor(page, 1).locator('.lista-ponto.aviso')).toHaveAttribute('title', '90 h de voo no mês (limite 100 h)');

    await abrirEscala(page);
    await expect(page.locator('#out details.caixa.avisos summary')).toContainText('1 instrutor perto do limite da lei');
  });

  test('o limite do mês mudado vale na hora: a segunda missão do instrutor fica de fora', async ({ page }) => {
    await abrir(page, { estado: umInstrutorDoisVoos() });
    await abrirLimitesDaLei(page);
    await expect(campoDoLimite(page, 'Voo no mês (h)')).toHaveValue('100');
    await expect(campoDoLimite(page, 'Voo no semestre (h)')).toHaveValue('');
    await campoDoLimite(page, 'Voo no mês (h)').fill('1');
    await campoDoLimite(page, 'Voo no mês (h)').dispatchEvent('change');
    await abrirEscala(page);
    await expect(page.locator('#out details.caixa.erros')).toContainText('nenhum instrutor dentro dos limites da Lei do Aeronauta');
    await abrirHistorico(page);
    await expect(page.locator('#historico')).toContainText('Limites da lei: voo no mês 100 h → 1 h');
    await page.keyboard.press('Escape');

    await abrirLimitesDaLei(page);
    // A linha do item fixo diz o limite novo
    await expect(page.locator('#limites-lei')).toBeVisible();
    // Voltar aos valores da lei pede confirmação (os limites mudados se perdem)
    const padrao = page.locator('#limites-lei [data-limites-padrao]');
    await expect(padrao).toHaveText('Voltar aos valores da lei');
    await padrao.click();
    await expect(campoDoLimite(page, 'Voo no mês (h)')).toHaveValue('1');
    await expect(padrao).toHaveText('Confirmar valores da lei');
    await padrao.click();
    await expect(campoDoLimite(page, 'Voo no mês (h)')).toHaveValue('100');
  });

  test('zero não vale como limite: o valor continua o de antes, com o aviso', async ({ page }) => {
    await abrir(page, { estado: umInstrutorDoisVoos() });
    await abrirLimitesDaLei(page);
    const mes = campoDoLimite(page, 'Voo no mês (h)');
    await mes.fill('0');
    await mes.dispatchEvent('change');
    await expect(page.locator('.toast').last()).toHaveText('O limite precisa ser maior que zero (vazio é sem limite).');
    await expect(mes).toHaveValue('100');
    await expect(page.locator('#historico')).not.toContainText('Limites da lei');
  });

  test('no Gestor, os limites e as horas de fora do app só se leem', async ({ page }) => {
    await abrir(page, { estado: umInstrutorDoisVoos(), url: './?role=gestor' });
    await abrirLimitesDaLei(page);
    await expect(campoDoLimite(page, 'Voo no mês (h)')).toBeDisabled();
    await abrirInstrutor(page, 1);
    await expect(campoDoInstrutor(page, 'ext-mes')).toHaveCount(0);
    await expect(secaoDoInstrutor(page, 'horas')).toContainText('No mês: 2 h de 100 h');
  });
});

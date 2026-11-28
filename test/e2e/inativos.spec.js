// O inativo no cadastro (formato 26; a chave que inativa chega no F2): na data aberta de hoje em diante, o instrutor e o
// recurso inativos não são escolhidos nem oferecidos; a escala gravada antes, com voos dele, avisa e se refaz com "Refazer a
// escala"; o pedido do aluno inativo fica registrado, "Aluno inativo", fora dos pendentes
import { test, expect, appPronto, irPara, abrirEscala, abrirAvisosDaEscala, abrirHistorico, entradasDoHistorico, campoDaAgenda, AMANHA, linhasDosPedidos, aprovarNaLinha, botaoDosPedidos } from './fixtures.js';
import { documentosAtuais } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';
import { aluno } from '../helpers/montar.js';
import { runAllocationEngine } from '../../js/engine.js';

// O estado de exemplo com a escala de amanhã feita antes: depois, um instrutor com voos nela, um recurso e um aluno sem voo
// ficam inativos no cadastro (a escala gravada continua com os voos de antes)
function cenarioComInativos() {
  const estado = comExemplo(estadoSintetico());
  estado.stu.push(aluno(1999, { fly: false }, { nm: 'Aluno Fictício Inativo', inativo: true }));
  const resultado = runAllocationEngine(estado);
  const insId = resultado.out.find(o => !o.isGround).insId;
  const instrutor = estado.ins.find(x => x.id === insId);
  const voos = resultado.out.filter(o => o.insId === insId).length;
  instrutor.inativo = true;
  const reg = resultado.out.find(o => !o.isGround && o.insId !== insId).r;
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  cadastro.frota = cadastro.frota.map(f => (f.reg === reg ? { ...f, inativo: true } : f));
  const pedido = { id: 7001, data: AMANHA, aluno: 1999, aluno_nome: 'Aluno Fictício Inativo', missao: 'Voo Local', janela: 'manha', horario: null, horas: null, registrado_por: 'Secretaria Fictícia', registrado_em: '2026-11-10T10:00:00.000Z', cancelada_em: null, cancelada_por: null, obs: '' };
  const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: { ...dias[AMANHA], resultado: { ...resultado, data: AMANHA } }, acpm4_agenda: [pedido] };
  return { docs, nome: instrutor.nm, voos, reg };
}

async function abrirComInativos(page) {
  const cenario = cenarioComInativos();
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
  }, JSON.stringify(cenario.docs));
  await page.goto('./');
  await appPronto(page);
  return cenario;
}

test.describe('O inativo no cadastro', () => {
  test('a escala gravada com os voos do instrutor que ficou inativo avisa; "Refazer a escala" a refaz sem ele, com a entrada no histórico', async ({ page }) => {
    const { nome, voos } = await abrirComInativos(page);
    await abrirEscala(page);
    const dele = (await abrirAvisosDaEscala(page, 'inativos')).filter({ hasText: nome });
    await expect(dele.locator('.aviso-corpo')).toHaveText(`${voos} ${voos === 1 ? 'voo' : 'voos'} com ${nome} (inativo) na escala desta data`);
    await dele.locator('[data-act="refazer-escala"]').click();
    await expect(dele).toHaveCount(0);
    await abrirHistorico(page);
    await expect(entradasDoHistorico(page, `Escala refeita: ${nome}`)).toHaveCount(1);
  });

  test('o instrutor e o recurso inativos não são oferecidos: no Rodízio, nas linhas livres do mapa e no "Agendar voo"', async ({ page }) => {
    const { nome, reg } = await abrirComInativos(page);
    // Refeita, a escala não tem mais os voos dele
    await abrirEscala(page);
    await (await abrirAvisosDaEscala(page, 'inativos')).filter({ hasText: nome }).locator('[data-act="refazer-escala"]').click();
    await irPara(page, 'rod');
    await expect(page.locator('#rodizio')).not.toContainText(nome);
    await irPara(page, 'esc');
    await page.locator('#s-esc [data-tl="ins"]').click();
    await expect(page.locator('#out .tl-row', { hasText: nome })).toHaveCount(0);
    await page.locator('#s-esc [data-tl="eq"]').click();
    await expect(page.locator('#out .tl-row', { hasText: reg })).toHaveCount(0);
    await page.locator('#btn-agendar').click();
    await expect(page.locator('#dlg-agendar')).toBeVisible();
    await expect(page.locator('#agd-instrutor option', { hasText: nome })).toHaveCount(0);
    await expect(page.locator('#agd-recurso option', { hasText: reg })).toHaveCount(0);
  });

  test('o aluno inativo: o pedido dele fica "Aluno inativo", fora dos pendentes; no Processamento, ele espera o aluno voltar', async ({ page }) => {
    await abrirComInativos(page);
    await irPara(page, 'age');
    await expect(linhasDosPedidos(page)).toContainText(['Aluno inativo']);
    await expect(aprovarNaLinha(page, 'Aluno inativo')).toHaveCount(0);
    await expect(botaoDosPedidos(page, 'importar')).toHaveCount(0);
    await expect(campoDaAgenda(page, 'aluno').locator('option', { hasText: 'Aluno Fictício Inativo' })).toHaveCount(0);
    await irPara(page, 'proc');
    await expect(page.locator('#proc > li.lista-linha', { hasText: 'Aluno Fictício Inativo' }).locator('.lista-l3')).toHaveText(/^(Aluno inativo: o pedido entra quando ele voltar a ativo|Aguardando aprovação)$/);
  });
});

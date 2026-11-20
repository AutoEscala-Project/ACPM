// A sessão da TV da recepção (js/sessao-da-tv.js e js/painel.js), com o servidor falso: a TV fica ligada dias seguidos
// e nunca mostra um quadro velho como se fosse o de agora (Pedro, 2026-11-20). A sessão é renovada antes de expirar; com
// "Manter esta TV conectada" (só a conta da TV), a TV entra de novo sozinha quando a sessão é revogada; sem isso, ou com
// a senha trocada, ela pede o login, com o aviso. Sem uma busca boa há mais de 3 minutos, o quadro sai da tela, e volta
// sozinho. Todas as TVs seguem o "Configurar painel" em até um minuto.
import { test, expect, prepararContexto, vigiarErros, preencherLogin } from './fixtures.js';
import { criarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { runAllocationEngine } from '../../js/engine.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const HOJE = '2026-11-10';
const MANHA = new Date('2026-11-10T08:00:00-03:00');
const MINUTO = 60_000;
const ENTRADA = 'acpm-teste-painel-entrada';
const SESSAO = 'acpm-teste-painel';
const AVISO_DA_SESSAO = 'Sessão expirada: entre de novo nesta TV';

// Hoje: Maria às 08:20 e João às 10:10
function documentosDeHoje() {
  const e = cenario({
    ins: [instrutor(1, 9), instrutor(2, 9)],
    stu: [aluno(1000, { p1: 500, p2: -1 }, { nm: 'Maria Silva Santos' }), aluno(1001, { p1: 610, p2: -1 }, { nm: 'João' })]
  });
  const docs = documentosAtuais(e, HOJE);
  docs.dias[HOJE] = { ...docs.dias[HOJE], resultado: runAllocationEngine(e) };
  return docs;
}
const linhas = page => page.locator('.fids tbody tr:not(.fids-vazia):not(.fids-nada)');

// Uma TV (um contexto do navegador) no servidor dado, às 08:00, com o relógio da página controlado pelo teste
async function abrirTV(browser, servidor) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await prepararContexto(context);
  await servidor.instalar(context);
  const page = await context.newPage();
  // As recusas do Auth e do PostgREST que os testes provocam (o refresh token revogado, a senha trocada, o JWT recusado) e
  // a conexão que cai
  const erros = vigiarErros(page, { statusEsperados: [400, 401], ignorar: [/ERR_INTERNET_DISCONNECTED/] });
  await page.clock.install({ time: MANHA });
  return { context, page, erros };
}
async function novaTV(browser, opcoes = {}) {
  const servidor = criarSupabaseFalso({ ...documentosDeHoje(), ...opcoes });
  return { servidor, ...await abrirTV(browser, servidor) };
}
// O login da TV, com "Manter esta TV conectada" marcado ou não
async function entrarNaTV(page, conta, { manter = false, senha = conta.senha } = {}) {
  await expect(page.locator('#form-login')).toBeVisible();
  await page.locator('#login-manter').setChecked(manter);
  await preencherLogin(page, conta, senha);
}
const guardada = page => page.evaluate(chave => localStorage.getItem(chave), ENTRADA);
// O operador muda um status: o quadro da TV muda na busca seguinte (a prova de que ela buscou de novo)
function cancelarJoao(servidor) {
  const dia = structuredClone(servidor.dias.get(HOJE).conteudo);
  dia.fStatus = { ...dia.fStatus, '1001_0_1': 'Cancelado' };
  servidor.alterarDiaPorOutraPessoa(HOJE, dia);
}
async function quadroNaTela(page) {
  await expect(page.locator('#quadro')).toBeVisible();
  await expect(page.locator('#aviso-da-tv')).toBeHidden();
  await expect(page.locator('#form-login')).toBeHidden();
}

test.describe('A sessão da TV da recepção', () => {
  test('a sessão perto de expirar é renovada antes (faltando menos de 10 minutos), e a TV segue com a sessão nova', async ({ browser }) => {
    // A sessão vale 15 minutos
    const { servidor, context, page, erros } = await novaTV(browser, { validadeDaSessao: 15 * 60 });
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page).locator('.f-aluno')).toHaveText(['Maria S.', 'João']);
    const expira = () => page.evaluate(chave => JSON.parse(localStorage.getItem(chave)).expires_at, SESSAO);
    const primeira = await expira();
    // 08:04: faltam 11 minutos, nada a renovar
    await page.clock.runFor(4 * MINUTO);
    expect(servidor.renovacoes).toEqual([]);
    // 08:06: faltaram menos de 10 minutos, e a TV renovou (o supabase-js sozinho só renovaria a 90 segundos do fim)
    await page.clock.runFor(2 * MINUTO);
    await expect.poll(() => servidor.renovacoes.length).toBeGreaterThan(0);
    expect(servidor.renovacoes.every(r => r.aceita && r.perfil === 'painel')).toBe(true);
    await expect.poll(expira).toBeGreaterThan(primeira);
    // O token anterior expira no servidor: a TV já usa o novo, e o quadro segue atualizado
    servidor.expirarTokensAnteriores();
    cancelarJoao(servidor);
    await page.clock.runFor(MINUTO);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    // Passada a validade da primeira sessão (08:15), e da segunda, a TV continua conectada, sem o login e sem o aviso
    await page.clock.runFor(20 * MINUTO);
    await quadroNaTela(page);
    expect(servidor.renovacoes.length).toBeGreaterThan(1);
    expect(servidor.renovacoes.every(r => r.aceita)).toBe(true);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a sessão revogada, com "Manter esta TV conectada": a TV entra de novo sozinha e o quadro fica', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel, { manter: true });
    await expect(linhas(page)).toHaveCount(2);
    expect(JSON.parse(await guardada(page))).toEqual({ email: CONTAS.painel.email, senha: CONTAS.painel.senha });
    // As sessões da TV são revogadas (o token e o refresh token deixam de valer)
    servidor.revogarSessoes();
    cancelarJoao(servidor);
    await page.clock.runFor(MINUTO);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    await quadroNaTela(page);
    // A renovação foi recusada, e a TV entrou com o e-mail e a senha guardados (que continuam lá)
    expect(servidor.renovacoes.some(r => !r.aceita)).toBe(true);
    expect(await guardada(page)).not.toBeNull();
    // Recarregada, a TV continua conectada, sem pedir nada
    await page.reload();
    await expect(linhas(page)).toHaveCount(2);
    await expect(page.locator('#form-login')).toBeHidden();
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a sessão revogada, sem nada guardado: o quadro sai e o login aparece, com o aviso; depois do login, o quadro volta', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    expect(await guardada(page)).toBeNull();
    servidor.revogarSessoes();
    await page.clock.runFor(MINUTO);
    await expect(page.locator('#form-login')).toBeVisible();
    await expect(page.locator('#login-aviso')).toHaveText(AVISO_DA_SESSAO);
    await expect(page.locator('#quadro')).toBeHidden();
    // O e-mail da TV já vem preenchido; a sessão que sobrou saiu deste navegador
    await expect(page.locator('#login-email')).toHaveValue(CONTAS.painel.email);
    expect(await page.evaluate(chave => localStorage.getItem(chave), SESSAO)).toBeNull();
    cancelarJoao(servidor);
    await preencherLogin(page, CONTAS.painel);
    await quadroNaTela(page);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a senha da TV mudou: o e-mail e a senha guardados saem, e o login aparece, com o aviso', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel, { manter: true });
    await expect(linhas(page)).toHaveCount(2);
    expect(await guardada(page)).not.toBeNull();
    // O administrador troca a senha da TV e encerra as sessões dela
    servidor.trocarSenha(CONTAS.painel, 'senha-nova-da-tv');
    servidor.revogarSessoes();
    await page.clock.runFor(MINUTO);
    await expect(page.locator('#login-aviso')).toHaveText(AVISO_DA_SESSAO);
    await expect(page.locator('#quadro')).toBeHidden();
    expect(await guardada(page)).toBeNull();
    // Com a senha nova, e "Manter esta TV conectada" de novo, fica guardada a senha nova
    await entrarNaTV(page, CONTAS.painel, { manter: true, senha: 'senha-nova-da-tv' });
    await quadroNaTela(page);
    await expect(linhas(page)).toHaveCount(2);
    expect(JSON.parse(await guardada(page))).toEqual({ email: CONTAS.painel.email, senha: 'senha-nova-da-tv' });
    expect(erros).toEqual([]);
    await context.close();
  });

  test('outra conta nunca fica guardada na TV, e o que estava guardado dela sai', async ({ browser }) => {
    const { context, page, erros } = await novaTV(browser);
    // Guardado (fora do app) o e-mail e a senha do operador: a TV entra com eles, vê que a conta não é a da TV, e eles saem
    await page.goto('./painel.html?supabase=teste');
    await page.evaluate(([chave, valor]) => localStorage.setItem(chave, valor), [ENTRADA, JSON.stringify({ email: CONTAS.operador.email, senha: CONTAS.operador.senha })]);
    await page.reload();
    await expect(page.locator('#form-login')).toBeVisible();
    expect(await guardada(page)).toBeNull();
    expect(await page.evaluate(chave => localStorage.getItem(chave), SESSAO)).toBeNull();
    // O operador entra na TV com "Manter esta TV conectada": recusado, e nada fica guardado
    await entrarNaTV(page, CONTAS.operador, { manter: true });
    await expect(page.locator('#login-erro')).toHaveText('Esta conta não é a da TV. Entre com a conta da TV (perfil Painel).');
    expect(await guardada(page)).toBeNull();
    // Sem marcar, a conta da TV entra, e nada fica guardado
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    expect(await guardada(page)).toBeNull();
    expect(erros).toEqual([]);
    await context.close();
  });

  test('Sair desta TV apaga a sessão e o e-mail e a senha guardados, e a página pede o login', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel, { manter: true });
    await expect(linhas(page)).toHaveCount(2);
    expect(await guardada(page)).not.toBeNull();
    // O botão aparece com o mouse
    const sair = page.locator('#btn-sair-tv');
    await expect(sair).toHaveCSS('opacity', '0');
    await page.mouse.move(400, 300);
    await expect(sair).toHaveCSS('opacity', '1');
    await sair.click();
    await expect(page.locator('#form-login')).toBeVisible();
    await expect(page.locator('#login-aviso')).toBeHidden();
    expect(await guardada(page)).toBeNull();
    expect(await page.evaluate(chave => localStorage.getItem(chave), SESSAO)).toBeNull();
    expect(servidor.saidas).toEqual(['local']);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('sem conexão por mais de 3 minutos, o quadro sai da tela e o aviso diz desde quando; com a conexão, ele volta sozinho', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    servidor.desconectar();
    // 2 minutos sem resposta: o quadro fica
    await page.clock.runFor(2 * MINUTO);
    await quadroNaTela(page);
    // Mais de 3: o quadro sai, e o aviso fica na tela toda
    await page.clock.runFor(2 * MINUTO);
    await expect(page.locator('#aviso-da-tv-texto')).toHaveText('Painel sem atualização desde 08:00: tentando de novo…');
    await expect(page.locator('#quadro')).toBeHidden();
    const [aviso, tela] = [await page.locator('#aviso-da-tv').boundingBox(), page.viewportSize()];
    expect(aviso).toEqual({ x: 0, y: 0, width: tela.width, height: tela.height });
    // A sessão continua (sem conexão não é sessão expirada)
    await expect(page.locator('#form-login')).toBeHidden();
    // A conexão volta: na busca seguinte, o quadro volta, já com o que mudou
    servidor.reconectar();
    cancelarJoao(servidor);
    await page.clock.runFor(MINUTO);
    await quadroNaTela(page);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a TV que abre sem conexão mostra o aviso, não um quadro vazio, e o quadro aparece quando a conexão volta', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser);
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel, { manter: true });
    await expect(linhas(page)).toHaveCount(2);
    // A TV é religada (a página recarrega) sem conexão: nenhuma busca boa, e o aviso desde que a página abriu
    servidor.desconectar();
    await page.reload();
    // A leitura do perfil tenta de novo por uns 7 segundos (o supabase-js), e então a primeira busca falha: o relógio da
    // página anda aos poucos, para as novas tentativas acontecerem
    const aviso = page.locator('#aviso-da-tv');
    await expect.poll(async () => {
      await page.clock.runFor(1000);
      return aviso.isVisible();
    }).toBe(true);
    await expect(page.locator('#form-login')).toBeHidden();
    await expect(page.locator('#aviso-da-tv-texto')).toHaveText(/^Painel sem atualização desde 08:0\d: tentando de novo…$/);
    await expect(page.locator('#quadro')).toBeHidden();
    await expect(page.locator('.fids .fids-nada')).toBeHidden();
    servidor.reconectar();
    await page.clock.runFor(MINUTO);
    await quadroNaTela(page);
    await expect(linhas(page)).toHaveCount(2);
    expect(erros).toEqual([]);
    await context.close();
  });

  test('a TV que volta à vista (ou acorda) busca na hora, com a sessão renovada', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser, { validadeDaSessao: 15 * 60 });
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    // A TV dorme 30 minutos (nenhum tique nesse tempo): a sessão de 15 minutos passou da validade
    servidor.expirarTokensAnteriores();
    await page.clock.fastForward(30 * MINUTO);
    cancelarJoao(servidor);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    await quadroNaTela(page);
    expect(servidor.renovacoes.length).toBeGreaterThan(0);
    expect(servidor.renovacoes.every(r => r.aceita)).toBe(true);
    expect(erros).toEqual([]);
    await context.close();
  });

  // Todas as contas de TV seguem o "Configurar painel": a configuração vem a cada busca de painel_do_dia, e a mudança
  // chega a cada TV em até um minuto, também na TV que acabou de entrar de novo sozinha
  test('duas TVs, com contas diferentes, seguem a mudança do "Configurar painel" em até um minuto', async ({ browser }) => {
    const servidor = criarSupabaseFalso(documentosDeHoje());
    const outraTV = { email: 'tv2@teste.acpm', senha: 'senha-da-outra-tv', id: '00000000-0000-4000-b000-000000000099', perfil: 'painel', nome: 'TV do hangar' };
    servidor.contasCriadas.push(outraTV);
    const a = await abrirTV(browser, servidor), b = await abrirTV(browser, servidor);
    const chamadas = [];
    for (const tv of [a, b]) tv.page.on('request', r => { if (r.url().includes('/rpc/painel_do_dia')) chamadas.push(r.headers().authorization); });
    await a.page.goto('./painel.html?supabase=teste');
    await entrarNaTV(a.page, CONTAS.painel, { manter: true });
    await b.page.goto('./painel.html?supabase=teste');
    await entrarNaTV(b.page, outraTV);
    for (const { page } of [a, b]) {
      await expect(page.locator('.fids .fids-titulo')).toHaveText('Missões');
      await expect(page.locator('.fids thead th')).toHaveText(['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor', 'Missão']);
    }
    // A primeira TV teve a sessão revogada; o operador muda o painel para Partidas, com o aluno e o horário primeiro
    servidor.revogarSessoes();
    const cadastro = structuredClone(servidor.banco.get('cadastro').conteudo);
    cadastro.painel = { quadro: 'partidas', colunas: [{ id: 'aluno', on: true }, { id: 'horario', on: true }] };
    servidor.alterarPorOutraPessoa('cadastro', cadastro);
    await Promise.all([a.page.clock.runFor(MINUTO), b.page.clock.runFor(MINUTO)]);
    // A primeira entra de novo sozinha; a segunda, sem nada guardado, pede o login (e segue depois dele)
    await expect(a.page.locator('.fids .fids-titulo')).toHaveText('Partidas');
    await expect(a.page.locator('.fids thead th')).toHaveText(['Aluno', 'Horário', 'Aeronave', 'Modelo', 'Instrutor', 'Missão']);
    await expect(b.page.locator('#login-aviso')).toHaveText(AVISO_DA_SESSAO);
    await preencherLogin(b.page, outraTV);
    await expect(b.page.locator('.fids .fids-titulo')).toHaveText('Partidas');
    // E a mudança seguinte chega às duas na busca seguinte
    cadastro.painel = { quadro: 'chegadas', colunas: [] };
    servidor.alterarPorOutraPessoa('cadastro', cadastro);
    await Promise.all([a.page.clock.runFor(MINUTO), b.page.clock.runFor(MINUTO)]);
    for (const { page } of [a, b]) await expect(page.locator('.fids .fids-titulo')).toHaveText('Chegadas');
    // Cada TV com a sessão da conta dela
    expect(new Set(chamadas).size).toBeGreaterThan(2);
    expect([...a.erros, ...b.erros]).toEqual([]);
    await a.context.close();
    await b.context.close();
  });

  // A conexão que cai no meio de uma renovação: o pedido fica sem resposta e sem erro (até o navegador desistir, muitos
  // minutos depois). As buscas não esperam por ela: seguem com a sessão que ainda vale. Quando o navegador desiste, a
  // renovação seguinte dá certo, e a TV passa da validade da primeira sessão sem o aviso
  test('uma renovação sem resposta não prende as buscas, e a seguinte dá certo', async ({ browser }) => {
    const { servidor, context, page, erros } = await novaTV(browser, { validadeDaSessao: 15 * 60 });
    // O primeiro pedido de renovação fica sem resposta (até desistir); os outros chegam ao servidor
    let presa = null;
    await context.route(/\/auth\/v1\/token\?grant_type=refresh_token/, route => {
      if (presa) return route.fallback();
      presa = route;
    });
    await page.goto('./painel.html?supabase=teste');
    await entrarNaTV(page, CONTAS.painel);
    await expect(linhas(page)).toHaveCount(2);
    // 08:06: a renovação começou e ficou sem resposta
    await page.clock.runFor(6 * MINUTO);
    await expect.poll(() => presa).not.toBeNull();
    // As buscas seguintes não esperam por ela: o quadro segue atualizado com a sessão que ainda vale (até 08:15)
    cancelarJoao(servidor);
    await page.clock.runFor(MINUTO);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    const dia = structuredClone(servidor.dias.get(HOJE).conteudo);
    dia.fStatus = { ...dia.fStatus, '1001_0_1': 'Confirmado' };
    servidor.alterarDiaPorOutraPessoa(HOJE, dia);
    await page.clock.runFor(2 * MINUTO);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Confirmado\b/);
    await quadroNaTela(page);
    // O navegador desiste do pedido: a renovação seguinte (passado o minuto em que o supabase-js não repete a que falhou)
    // dá certo, e a TV passa das 08:15 com o quadro
    await presa.abort('timedout');
    await page.clock.runFor(2 * MINUTO);
    await expect.poll(() => servidor.renovacoes.filter(r => r.aceita).length).toBeGreaterThan(0);
    servidor.expirarTokensAnteriores();
    cancelarJoao(servidor);
    await page.clock.runFor(10 * MINUTO);
    await quadroNaTela(page);
    await expect(linhas(page).nth(1)).toHaveClass(/\bfids-Cancelado\b/);
    // O pedido de que o navegador desistiu
    expect(erros.filter(e => !/ERR_TIMED_OUT/.test(e))).toEqual([]);
    await context.close();
  });
});

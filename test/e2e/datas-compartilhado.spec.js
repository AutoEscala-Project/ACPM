// Escala por data no modo compartilhado: migração dos documentos antigos no servidor, gestor navegando
// entre as datas sem gravar e autor das alterações no histórico.
import { test, expect, prepararContexto, vigiarErros, irPara, AMANHA, entrar, preencherLogin, URL_APP } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, documentosFase3, CONTAS } from './supabase-falso.js';
import { comNomesAntigos } from '../helpers/formato.js';
import { ESQUEMA } from '../../js/migracoes.js';
import { estadoSintetico } from '../helpers/estado.js';
import { aluno } from '../helpers/montar.js';
import { runAllocationEngine } from '../../js/engine.js';
import { ApiClient } from '../../js/storage.js';
import { separar } from '../../js/dias.js';

const DEPOIS = '2026-11-12';

async function mudarData(page, data) {
  await page.locator('#nav button[data-t="esc"]').click();
  await page.locator('#dt').fill(data);
  await page.locator('#dt').dispatchEvent('change');
  await expect(page.locator('#dt')).toHaveValue(data);
}

test.describe('Escala por data (modo compartilhado)', () => {
  test('no primeiro acesso de um operador, os documentos antigos viram o formato por data', async ({ page, context }) => {
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000), aluno(1001, { p1: 2 })] });
    const escala = runAllocationEngine(estado);
    const servidor = await instalarSupabaseFalso(context, {
      documentos: {
        estado,
        escala,
        historico: [{ id: Date.UTC(2026, 10, 10, 13), ts: '10:00:00', type: 'mod', desc: 'Alteração antiga', revert: null }],
        bi: { '2026-11-03': { out: escala.out, tot: 2, rej: 0 }, [AMANHA]: { out: escala.out, tot: 2, rej: 0 } }
      }
    });
    await entrar(page, CONTAS.operador);

    await expect(page.locator('#dt')).toHaveValue(AMANHA);
    await irPara(page, 'esc');
    await expect(page.locator('#out table tbody tr')).not.toHaveCount(0);
    await expect(page.locator('#audit-log-list')).toContainText('Alteração antiga');
    await expect(page.locator('#audit-log-list')).toContainText('importado');
    expect(servidor.banco.get('cadastro').conteudo).toEqual({ ...separar(estado).cadastro, esquema: ESQUEMA });
    expect([...servidor.dias.keys()].sort()).toEqual(['2026-11-03', AMANHA]);
    expect(servidor.historico.map(h => [h.descricao, h.importado])).toEqual([['Alteração antiga', true]]);
    expect(servidor.banco.has('estado'), 'os documentos da fase 2 ficam como cópia').toBe(true);
  });

  test('se o servidor recusar uma gravação da conversão, o app pede para recarregar em vez de abrir o cadastro vazio', async ({ browser }) => {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000)] });
    const servidor = await instalarSupabaseFalso(contexto, { documentos: { estado, escala: runAllocationEngine(estado) } });
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [400] });
    servidor.falharGravacoes(1, 400);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#aviso-sync-texto')).toContainText('Não foi possível preparar os dados');
    await expect(page.locator('#inst .cd')).toHaveCount(0);
    expect(servidor.banco.has('cadastro')).toBe(false);

    await page.locator('#btn-recarregar').click();
    await expect(page.locator('#inst .cd').first()).toBeAttached();
    await expect(page.locator('#aviso-sync')).toBeHidden();
    expect(servidor.banco.get('cadastro').conteudo).toEqual({ ...separar(estado).cadastro, esquema: ESQUEMA });
    expect(erros).toEqual([]);
    await contexto.close();
  });

  test('com o servidor fora do ar por um instante, a conversão espera e termina sozinha', async ({ browser }) => {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await prepararContexto(contexto);
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000)] });
    const servidor = await instalarSupabaseFalso(contexto, { documentos: { estado, escala: runAllocationEngine(estado) } });
    const page = await contexto.newPage();
    const erros = vigiarErros(page, { statusEsperados: [503] });
    servidor.falharGravacoes(1);
    await page.goto(URL_APP);
    await preencherLogin(page, CONTAS.operador);
    await expect(page.locator('#aviso-sync-texto')).toHaveText('Sem conexão com o servidor: gravando de novo assim que a conexão voltar; não feche esta página.');
    await expect(page.locator('#inst .cd').first()).toBeAttached({ timeout: 10000 });
    await expect(page.locator('#aviso-sync')).toBeHidden();
    expect(servidor.banco.get('cadastro').conteudo).toEqual({ ...separar(estado).cadastro, esquema: ESQUEMA });
    expect(erros).toEqual([]);
    await contexto.close();
  });

  // Dados no formato anterior (sem versão, simuladores com os nomes antigos): o dia de amanhã com o SIM-MULTI-2 em
  // manutenção e um dia importado do BI com voo no SIM-MONO-1
  function servidorNoFormatoAnterior() {
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000, { mis: 'Simulador', eq: 'Sim. Mono' })] });
    const { documentos, dias } = documentosFase3(estado, AMANHA);
    const escala = runAllocationEngine(estado);
    return comNomesAntigos({
      documentos,
      dias: {
        [AMANHA]: { ...dias[AMANHA], av: { ...dias[AMANHA].av, 'SIM-MLTE-D': false } },
        '2026-11-03': { importado: true, resultado: { ...escala, rej: 0, data: '2026-11-03' } }
      }
    });
  }

  test('no primeiro acesso de um operador, os dados no formato anterior são regravados no formato atual', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, servidorNoFormatoAnterior());
    expect(servidor.dias.get('2026-11-03').conteudo.resultado.out[0].r).toBe('SIM-MONO-1');
    await entrar(page, CONTAS.operador);
    await expect(page.locator('#eqs input[data-id="SIM-MLTE-D"]')).not.toBeChecked();
    await expect(page.locator('#eqs input[data-id="SIM-MULTI-2"]')).toHaveCount(0);
    expect(servidor.gravacoes.map(g => g.chave)).toEqual(['dia:2026-11-03', `dia:${AMANHA}`, 'cadastro']);
    const amanha = servidor.dias.get(AMANHA).conteudo;
    expect([amanha.esquema, amanha.av['SIM-MLTE-D'], amanha.av['SIM-MONO-A']]).toEqual([ESQUEMA, false, true]);
    expect(Object.keys(amanha.av).filter(r => /^SIM-(MONO|MULTI)-\d$/.test(r))).toEqual([]);
    expect(servidor.dias.get('2026-11-03').conteudo.resultado.out[0].r).toBe('SIM-MONO-A');
    expect(servidor.banco.get('cadastro').conteudo.esquema).toBe(ESQUEMA);
  });

  test('gestor vê os dados no formato atual antes da atualização, sem gravar nada', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, servidorNoFormatoAnterior());
    await entrar(page, CONTAS.gestor);
    await expect(page.locator('#eqs input[data-id="SIM-MLTE-D"]')).not.toBeChecked();
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.dias.get(AMANHA).conteudo.esquema).toBeUndefined();
  });

  test('gestor navega entre as datas, sem gravar nada', async ({ page, context }) => {
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000)] });
    const { documentos, dias } = documentosAtuais(estado, AMANHA);
    const outroDia = structuredClone(dias[AMANHA]);
    outroDia.av['PR-BTB'] = false;
    const servidor = await instalarSupabaseFalso(context, { documentos, dias: { ...dias, [DEPOIS]: outroDia } });

    await entrar(page, CONTAS.gestor);
    await expect(page.locator('#dt')).toBeEnabled();
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).toBeChecked();
    await mudarData(page, DEPOIS);
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).not.toBeChecked();
    expect(servidor.gravacoes).toEqual([]);
    expect(servidor.historico).toEqual([]);
  });

  // Enquanto outra data abre, a tela ainda é a da data anterior, mas o cadastro já foi lido de novo, com a versão atual:
  // gravar nessa hora levaria o cadastro velho por cima do que outra pessoa mudou (o aluno que ela incluiu sumiria). A
  // alteração é recusada, em nenhuma das datas; com a data nova aberta, vale de novo
  test('alteração feita enquanto outra data carrega é recusada: nada é gravado, e o aluno que outra pessoa incluiu fica', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais({ ...estadoSintetico(), stu: [aluno(1000)], nid: 1001 }, AMANHA));
    await entrar(page, CONTAS.operador);
    const { conteudo } = servidor.banco.get('cadastro');
    servidor.alterarPorOutraPessoa('cadastro', { ...conteudo, nid: 1002, stu: [...conteudo.stu, { ...conteudo.stu[0], id: 1001, nm: 'Aluno da colega' }] });
    const liberar = servidor.segurarLeiturasDeDias();
    await mudarData(page, DEPOIS);
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-id="PR-BTB"]').click();
    await expect(page.locator('#toast-box')).toContainText('A escala ainda não abriu: nada foi mudado.');
    await expect(page.locator('#eqs input[data-id="PR-BTB"]')).toBeChecked();
    liberar();
    await expect(page.locator('#dt-rotulo')).toContainText('12/11');
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await expect.poll(() => servidor.dias.get(DEPOIS)?.conteudo.av['PR-BTB']).toBe(false);
    expect(servidor.gravacoes.map(g => g.chave)).not.toContain(`dia:${AMANHA}`);
    expect(servidor.dias.get(AMANHA).conteudo.av['PR-BTB']).toBe(true);
    expect(servidor.banco.get('cadastro').conteudo.stu.map(s => s.nm)).toEqual(['Aluno 1000', 'Aluno da colega']);
    await expect.poll(() => servidor.historico.map(h => [h.data, h.descricao])).toEqual([[DEPOIS, 'PR-BTB: Manutenção']]);
  });

  test('o histórico mostra quem fez cada alteração', async ({ page, context }) => {
    await instalarSupabaseFalso(context, documentosAtuais(estadoSintetico(), AMANHA));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'rec');
    await page.locator('#eqs input[data-id="PR-BTB"]').uncheck();
    await page.reload();
    await expect(page.locator('#wins input[data-a="win"]').first()).toBeAttached();
    await expect(page.locator('#audit-log-list')).toContainText('Operador de Teste');
    await expect(page.locator('#audit-log-list')).toContainText('PR-BTB: Manutenção');
  });
});

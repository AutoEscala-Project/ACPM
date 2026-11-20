// A função meteorologia do Supabase (supabase/functions/meteorologia): a leitura das respostas do aviationweather.gov
// (mensagens.js), com as respostas de verdade de 20/11/2026 (test/fixtures/meteorologia), e o atendimento
// (atendimento.js): CORS, OPTIONS, a sessão, o cache de 5 minutos, o tempo máximo e os erros. O Deno do Supabase roda os
// mesmos módulos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESTACOES, ENDERECOS, limparMensagem, lerLista, horaDaMensagem, montarResposta } from '../../supabase/functions/meteorologia/mensagens.js';
import { criarAtendimento, conferirNoAuth, origemPermitida } from '../../supabase/functions/meteorologia/atendimento.js';

const amostra = nome => readFileSync(new URL(`../fixtures/meteorologia/${nome}`, import.meta.url), 'utf8');
const METAR = amostra('metar.json'), METAR_6H = amostra('metar-6h.json'), TAF = amostra('taf.json');
const AGORA = new Date('2026-11-20T14:05:00Z');

describe('meteorologia: as mensagens do aviationweather.gov', () => {
  it('pede as duas estações, em JSON, à API do aviationweather.gov', () => {
    assert.deepEqual(ESTACOES, [{ icao: 'SBBH', nome: 'Pampulha' }, { icao: 'SBCF', nome: 'Confins' }]);
    assert.equal(ENDERECOS.metar, 'https://aviationweather.gov/api/data/metar?ids=SBBH,SBCF&format=json');
    assert.equal(ENDERECOS.taf, 'https://aviationweather.gov/api/data/taf?ids=SBBH,SBCF&format=json');
  });

  it('as respostas de verdade: o METAR de cada estação, o TAF de Confins (Pampulha estava sem TAF) e a hora da observação', () => {
    assert.deepEqual(montarResposta(lerLista(METAR), lerLista(TAF), AGORA), {
      gerado: '2026-11-20T14:05:00.000Z',
      estacoes: [
        { icao: 'SBBH', nome: 'Pampulha', metar: 'METAR SBBH 201300Z 30005KT 9999 BKN025 FEW035TCU SCT090 26/01 Q1017', taf: null, observado: '2026-11-20T13:00:00.000Z' },
        {
          icao: 'SBCF', nome: 'Confins', metar: 'METAR SBCF 201400Z 36007KT 9999 BKN023 SCT100 27/22 Q1016',
          taf: 'TAF SBCF 200800Z 2012/2112 34005KT 7000 SCT016 TX28/2018Z TN19/2109Z BECMG 2015/2017 9999 SCT035 TEMPO 2018/2021 TS SCT035 FEW040CB PROB30 2107/2111 2000 BR SCT002 RMK PGM',
          observado: '2026-11-20T14:00:00.000Z'
        }
      ]
    });
  });

  it('com as últimas 6 horas (METAR e SPECI misturados, fora de ordem), fica a mensagem mais recente de cada estação', () => {
    const lista = lerLista(METAR_6H).reverse();
    const r = montarResposta(lista, [], AGORA);
    assert.deepEqual(r.estacoes.map(e => [e.metar.slice(0, 24), e.observado]), [
      ['METAR SBBH 201300Z 30005', '2026-11-20T13:00:00.000Z'],
      ['METAR SBCF 201400Z 36007', '2026-11-20T14:00:00.000Z']
    ]);
    // Só os SPECI: o mais recente
    const speci = montarResposta(lista.filter(m => m.metarType === 'SPECI'), [], AGORA).estacoes[1];
    assert.equal(speci.metar, 'SPECI SBCF 201236Z 35008KT 9999 BKN015 26/21 Q1017');
    assert.equal(speci.observado, '2026-11-20T12:36:00.000Z');
  });

  it('sem mensagens (204, a resposta vazia), as duas estações vêm sem METAR e sem TAF', () => {
    assert.deepEqual(lerLista(''), []);
    assert.deepEqual(montarResposta(lerLista(''), lerLista(''), AGORA).estacoes, [
      { icao: 'SBBH', nome: 'Pampulha', metar: null, taf: null, observado: null },
      { icao: 'SBCF', nome: 'Confins', metar: null, taf: null, observado: null }
    ]);
  });

  it('uma resposta que não é a lista: erro', () => {
    assert.throws(() => lerLista('{"status":"error","error":"Unexpected query parameter provided"}'), /não é uma lista/);
    assert.throws(() => lerLista('<html>'), SyntaxError);
  });

  it('o TAF vencido sai; entre dois TAF, o mais recente (mostRecent, senão a emissão mais nova)', () => {
    const [taf] = lerLista(TAF);
    const vencido = { ...taf, validTimeTo: Date.parse('2026-11-20T12:00:00Z') / 1000 };
    assert.equal(montarResposta([], [vencido], AGORA).estacoes[1].taf, null);
    const antigo = { ...taf, mostRecent: 0, rawTAF: 'TAF SBCF 200200Z 2006/2106 VRB02KT CAVOK', issueTime: '2026-11-20T02:00:00.000Z' };
    assert.match(montarResposta([], [antigo, taf], AGORA).estacoes[1].taf, /^TAF SBCF 200800Z/);
    const semMaisRecente = [{ ...antigo }, { ...taf, mostRecent: 0 }];
    assert.match(montarResposta([], semMaisRecente, AGORA).estacoes[1].taf, /^TAF SBCF 200800Z/);
  });

  it('o formato "raw" (com quebras e recuos) vira uma linha; os caracteres de controle e as estações de fora não entram', () => {
    assert.equal(limparMensagem('TAF SBCF 200800Z 2012/2112 34005KT\n  BECMG 2015/2017 9999 SCT035 \n'), 'TAF SBCF 200800Z 2012/2112 34005KT BECMG 2015/2017 9999 SCT035');
    assert.equal(limparMensagem('METAR\u0000 SBBH\u001b[31m 201300Z'), 'METAR SBBH [31m 201300Z');
    assert.equal(limparMensagem('   '), null);
    assert.equal(limparMensagem(42), null);
    assert.equal(limparMensagem('A'.repeat(5000)).length, 1500);
    const [sbbh] = lerLista(METAR);
    const lista = [{ ...sbbh, icaoId: 'SBGR', rawOb: 'METAR SBGR 201300Z 00000KT CAVOK 25/15 Q1015' }, { ...sbbh, rawOb: null }, null, 'METAR'];
    assert.deepEqual(montarResposta(lista, [], AGORA).estacoes.map(e => e.metar), [null, null]);
  });

  it('a hora da mensagem pelo grupo DDHHMMZ (quando a API não manda a hora): no mês da referência, ou no anterior', () => {
    assert.equal(horaDaMensagem('METAR SBBH 201300Z 30005KT', AGORA).toISOString(), '2026-11-20T13:00:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 312350Z 30005KT', new Date('2026-11-01T00:10:00Z')).toISOString(), '2026-10-31T23:50:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 312350Z 30005KT', new Date('2026-01-01T00:10:00Z')).toISOString(), '2025-12-31T23:50:00.000Z');
    // O relógio da estação um pouco à frente (a virada do dia)
    assert.equal(horaDaMensagem('METAR SBBH 210000Z 30005KT', new Date('2026-11-20T23:59:00Z')).toISOString(), '2026-11-21T00:00:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 31120Z', AGORA), null);
    assert.equal(horaDaMensagem('METAR SBBH 202460Z', AGORA), null);
    assert.equal(horaDaMensagem(null, AGORA), null);
    const [sbbh] = lerLista(METAR);
    const semHora = { ...sbbh, obsTime: null, reportTime: null };
    assert.equal(montarResposta([semHora], [], AGORA).estacoes[0].observado, '2026-11-20T13:00:00.000Z');
  });
});

// Um fetch falso: as respostas do aviationweather.gov por endereço, contando as chamadas
function aviationweatherFalso({ metar = METAR, taf = TAF, status = 200, demora = null } = {}) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, agente: opcoes.headers['User-Agent'] });
    if (demora) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, demora);
        opcoes.signal.addEventListener('abort', () => { clearTimeout(t); reject(opcoes.signal.reason); });
      });
    }
    if (status !== 200) return new Response('erro', { status });
    return new Response(url.includes('/metar') ? metar : taf, { status: 200 });
  };
  return { buscar, chamadas };
}
const pedido = (metodo = 'GET', origem = 'https://gdruumond.github.io', cabecalhos = {}) =>
  new Request('https://projeto.supabase.co/functions/v1/meteorologia', { method: metodo, headers: { origin: origem, authorization: 'Bearer a.b.c', ...cabecalhos } });

describe('meteorologia: o atendimento da função', () => {
  it('CORS só para as origens do app (o GitHub Pages da produção e da prévia, e o localhost)', async () => {
    for (const origem of ['https://gdruumond.github.io', 'https://thephfernandes.github.io', 'http://localhost:4173', 'http://127.0.0.1:8080', 'http://localhost']) {
      assert.ok(origemPermitida(origem), origem);
    }
    for (const origem of ['https://evil.github.io', 'https://gdruumond.github.io.evil.com', 'http://localhost.evil.com', 'null', null]) {
      assert.ok(!origemPermitida(origem), String(origem));
    }
    const atender = criarAtendimento({ conferirSessao: async () => true, buscar: aviationweatherFalso().buscar });
    const preflight = await atender(pedido('OPTIONS', 'https://thephfernandes.github.io'));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://thephfernandes.github.io');
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization.*apikey/);
    assert.match(preflight.headers.get('vary'), /Origin/);
    const estranha = await atender(pedido('OPTIONS', 'https://evil.example'));
    assert.equal(estranha.headers.get('access-control-allow-origin'), null);
  });

  it('com a sessão, a resposta: as duas estações, em JSON, sem cache no navegador; o User-Agent sem dados pessoais', async () => {
    const aw = aviationweatherFalso();
    const atender = criarAtendimento({ conferirSessao: async () => true, buscar: aw.buscar, agora: () => AGORA.getTime() });
    const r = await atender(pedido('GET', 'http://localhost:4173'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:4173');
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const corpo = await r.json();
    assert.deepEqual(corpo.estacoes.map(e => [e.icao, e.nome, Boolean(e.metar), Boolean(e.taf)]), [['SBBH', 'Pampulha', true, false], ['SBCF', 'Confins', true, true]]);
    assert.deepEqual(aw.chamadas.map(c => c.agente), ['ACPM-AutoEscala/1.0', 'ACPM-AutoEscala/1.0']);
    // O supabase-js chama com POST por padrão: vale também
    assert.equal((await atender(pedido('POST'))).status, 200);
    assert.equal((await atender(pedido('DELETE'))).status, 405);
  });

  it('sem sessão válida: 401, sem consultar o aviationweather.gov; o Auth fora do ar: 503', async () => {
    const aw = aviationweatherFalso();
    const recusa = criarAtendimento({ conferirSessao: async () => false, buscar: aw.buscar });
    const r = await recusa(pedido());
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { erro: 'Entre no app para ver a meteorologia.' });
    assert.equal(aw.chamadas.length, 0);
    const semAuth = criarAtendimento({ conferirSessao: async () => { throw new Error('rede'); }, buscar: aw.buscar });
    assert.equal((await semAuth(pedido())).status, 503);
  });

  it('as mensagens ficam 5 minutos na memória; duas chamadas juntas fazem uma consulta só', async () => {
    const aw = aviationweatherFalso();
    let agora = AGORA.getTime();
    const atender = criarAtendimento({ conferirSessao: async () => true, buscar: aw.buscar, agora: () => agora });
    await Promise.all([atender(pedido()), atender(pedido())]);
    assert.equal(aw.chamadas.length, 2);
    agora += 4 * 60000;
    await atender(pedido());
    assert.equal(aw.chamadas.length, 2);
    agora += 61000;
    const r = await atender(pedido());
    assert.equal(aw.chamadas.length, 4);
    assert.equal((await r.json()).gerado, new Date(agora).toISOString());
  });

  it('o aviationweather.gov fora do ar: as últimas mensagens (até 3 horas), senão 502 com a mensagem em português', async () => {
    const bom = aviationweatherFalso(), fora = aviationweatherFalso({ status: 503 });
    let buscar = bom.buscar, agora = AGORA.getTime();
    const atender = criarAtendimento({ conferirSessao: async () => true, buscar: (...a) => buscar(...a), agora: () => agora });
    await atender(pedido());
    buscar = fora.buscar;
    agora += 60 * 60000;
    const velha = await atender(pedido());
    assert.equal(velha.status, 200);
    assert.equal((await velha.json()).gerado, AGORA.toISOString());
    agora += 3 * 60 * 60000;
    const erro = await atender(pedido());
    assert.equal(erro.status, 502);
    assert.deepEqual(await erro.json(), { erro: 'Não foi possível buscar o METAR e o TAF no aviationweather.gov.', detalhe: 'o aviationweather.gov respondeu 503' });
    // Uma resposta fora do formato também
    const estranho = criarAtendimento({ conferirSessao: async () => true, buscar: aviationweatherFalso({ metar: '<html>' }).buscar });
    assert.equal((await estranho(pedido())).status, 502);
  });

  it('o aviationweather.gov que não responde a tempo (12 segundos; aqui, 200 ms): 502', async () => {
    const lento = aviationweatherFalso({ demora: 60000 });
    const atender = criarAtendimento({ conferirSessao: async () => true, buscar: lento.buscar, tempoMaximo: 200 });
    const inicio = Date.now();
    const r = await atender(pedido());
    assert.equal(r.status, 502);
    assert.equal((await r.json()).erro, 'O aviationweather.gov não respondeu a tempo.');
    assert.ok(Date.now() - inicio < 5000);
  });

  it('a sessão pelo Auth do projeto: só um JWT de uma conta (200 do /auth/v1/user), lembrado por 5 minutos', async () => {
    const chamadas = [];
    let status = 200, agora = 0;
    const buscar = async (url, opcoes) => {
      chamadas.push({ url, auth: opcoes.headers.Authorization, apikey: opcoes.headers.apikey });
      return new Response('{}', { status });
    };
    const conferir = conferirNoAuth('https://projeto.supabase.co/', 'chave-padrao', buscar, () => agora);
    const req = (auth, apikey) => new Request('https://x/', { headers: { ...(auth ? { authorization: auth } : {}), ...(apikey ? { apikey } : {}) } });
    assert.equal(await conferir(req('Bearer a.b.c', 'sb_publishable_x')), true);
    assert.deepEqual(chamadas, [{ url: 'https://projeto.supabase.co/auth/v1/user', auth: 'Bearer a.b.c', apikey: 'sb_publishable_x' }]);
    assert.equal(await conferir(req('Bearer a.b.c')), true);
    assert.equal(chamadas.length, 1);
    agora += 5 * 60000 + 1;
    status = 401;
    assert.equal(await conferir(req('Bearer a.b.c')), false);
    assert.equal(chamadas[1].apikey, 'chave-padrao');
    // A chave publicável sozinha (sem sessão) e nenhum token: recusados, sem chamar o Auth
    assert.equal(await conferir(req('Bearer sb_publishable_x')), false);
    assert.equal(await conferir(req(null)), false);
    assert.equal(chamadas.length, 2);
  });
});

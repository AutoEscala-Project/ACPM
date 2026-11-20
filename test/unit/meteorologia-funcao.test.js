// A função meteorologia do Supabase (supabase/functions/meteorologia): a leitura das respostas da REDEMET
// (mensagens.js), com as respostas de verdade de 20/11/2026 por volta das 16:00Z (test/fixtures/meteorologia: o METAR
// com a janela das 3 horas e sem ela, e o TAF sem janela e com ela), e o atendimento (atendimento.js): a chave, CORS,
// OPTIONS, a sessão, o cache de 5 minutos, o tempo máximo e os erros. O Deno do Supabase roda os mesmos módulos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESTACOES, enderecos, limparMensagem, lerMensagens, horaDaMensagem, instante, montarResposta } from '../../supabase/functions/meteorologia/mensagens.js';
import { criarAtendimento, conferirNoAuth, origemPermitida } from '../../supabase/functions/meteorologia/atendimento.js';

const amostra = nome => readFileSync(new URL(`../fixtures/meteorologia/${nome}`, import.meta.url), 'utf8');
// metar-janela: data_ini 2026112013 e data_fim 2026112016 (quatro METAR de cada estação); metar-padrao: sem a janela (só
// a hora 16, e o METAR das 16:00Z de Pampulha ainda não tinha chegado); taf-padrao: sem a janela (os TAF em vigor das
// duas estações); taf-janela: com a janela das 13 às 16 (nenhum TAF)
const METAR_JANELA = amostra('metar-janela.json'), METAR_PADRAO = amostra('metar-padrao.json');
const TAF_PADRAO = amostra('taf-padrao.json'), TAF_JANELA = amostra('taf-janela.json');
const AGORA = new Date('2026-11-20T16:05:00Z');
const TAF_SBBH = 'TAF SBBH 200800Z 2012/2024 06005KT 8000 BKN016 TN20/2012Z TX28/2017Z BECMG 2013/2015 34005KT 9999 BKN025 PROB30 2016/2018 VCSH RMK PGM';
const TAF_SBCF = 'TAF SBCF 200800Z 2012/2112 34005KT 7000 SCT016 TX28/2018Z TN19/2109Z BECMG 2015/2017 9999 SCT035 TEMPO 2018/2021 TS SCT035 FEW040CB PROB30 2107/2111 2000 BR SCT002 RMK PGM';

describe('meteorologia: as mensagens da REDEMET', () => {
  it('pede as duas estações à REDEMET: o METAR com a janela das 3 horas antes (UTC), o TAF sem janela', () => {
    assert.deepEqual(ESTACOES, [{ icao: 'SBBH', nome: 'Pampulha' }, { icao: 'SBCF', nome: 'Confins' }]);
    assert.deepEqual(enderecos(AGORA), {
      metar: 'https://api-redemet.decea.mil.br/mensagens/metar/SBBH,SBCF?data_ini=2026112013&data_fim=2026112016',
      taf: 'https://api-redemet.decea.mil.br/mensagens/taf/SBBH,SBCF'
    });
    // A virada do dia (e do mês), em UTC
    assert.match(enderecos(new Date('2026-12-01T01:30:00Z')).metar, /\?data_ini=2026113022&data_fim=2026120101$/);
    // A chave nunca vai no endereço
    for (const endereco of Object.values(enderecos(AGORA))) assert.ok(!/api_key|chave|key/i.test(endereco), endereco);
  });

  it('as respostas de verdade: o METAR mais recente de cada estação (sem o "="), o TAF em vigor e a hora da observação', () => {
    assert.deepEqual(montarResposta(lerMensagens(METAR_JANELA), lerMensagens(TAF_PADRAO), AGORA), {
      gerado: '2026-11-20T16:05:00.000Z',
      estacoes: [
        { icao: 'SBBH', nome: 'Pampulha', metar: 'METAR SBBH 201600Z 26006KT 9999 BKN030 FEW035TCU SCT090 27/21 Q1014', taf: TAF_SBBH, observado: '2026-11-20T16:00:00.000Z' },
        { icao: 'SBCF', nome: 'Confins', metar: 'METAR SBCF 201600Z 35006KT 9999 BKN030 FEW035TCU 29/20 Q1014', taf: TAF_SBCF, observado: '2026-11-20T16:00:00.000Z' }
      ]
    });
  });

  it('sem a janela, a REDEMET só manda a hora de agora: o METAR de Pampulha que ainda não chegou fica de fora', () => {
    const r = montarResposta(lerMensagens(METAR_PADRAO), [], AGORA);
    assert.deepEqual(r.estacoes.map(e => [e.icao, e.metar && e.metar.slice(0, 24)]), [['SBBH', null], ['SBCF', 'METAR SBCF 201600Z 35006']]);
    // Com a janela, os quatro METAR de cada estação vêm, e Pampulha aparece
    const janela = lerMensagens(METAR_JANELA);
    assert.deepEqual(['SBBH', 'SBCF'].map(icao => janela.filter(m => m.id_localidade === icao).length), [4, 4]);
  });

  it('vários METAR de cada estação, fora de ordem: fica o da validade_inicial mais nova; o SPECI da hora também conta', () => {
    const lista = lerMensagens(METAR_JANELA).reverse();
    lista.push(lista.shift(), lista.shift());
    assert.deepEqual(montarResposta(lista, [], AGORA).estacoes.map(e => [e.metar.slice(0, 18), e.observado]), [
      ['METAR SBBH 201600Z', '2026-11-20T16:00:00.000Z'],
      ['METAR SBCF 201600Z', '2026-11-20T16:00:00.000Z']
    ]);
    // Um SPECI depois do METAR da hora: com a validade_inicial dele, ou com a da hora (o desempate é a observação)
    for (const validade of ['2026-11-20 16:23:00', '2026-11-20 16:00:00']) {
      const speci = { id_localidade: 'SBCF', validade_inicial: validade, mens: 'SPECI SBCF 201623Z 34012KT 4000 TSRA BKN015 FEW030CB 22/20 Q1015=', recebimento: '2026-11-20 16:24:10' };
      const sbcf = montarResposta([...lista, speci], [], AGORA).estacoes[1];
      assert.equal(sbcf.metar, 'SPECI SBCF 201623Z 34012KT 4000 TSRA BKN015 FEW030CB 22/20 Q1015', validade);
      assert.equal(sbcf.observado, '2026-11-20T16:23:00.000Z');
    }
    // Sem o grupo DDHHMMZ, a hora da observação é a validade_inicial
    const semHora = { id_localidade: 'SBBH', validade_inicial: '2026-11-20 17:00:00', mens: 'METAR SBBH NIL=' };
    assert.equal(montarResposta([...lista, semHora], [], AGORA).estacoes[0].observado, '2026-11-20T17:00:00.000Z');
  });

  it('o TAF em vigor: o que cobre agora (da validade_inicial à validade_final), o emitido por último', () => {
    const [sbbh] = lerMensagens(TAF_PADRAO);
    const taf = extra => ({ ...sbbh, ...extra });
    const so = (lista, agora = AGORA) => montarResposta([], lista, agora).estacoes[0].taf;
    assert.equal(so([sbbh]), TAF_SBBH);
    // Vencido (o fim é agora ou antes) ou ainda não em vigor: fora
    assert.equal(so([sbbh], new Date('2026-11-21T00:00:00Z')), null);
    assert.equal(so([sbbh], new Date('2026-11-20T11:59:00Z')), null);
    assert.equal(so([sbbh], new Date('2026-11-20T12:00:00Z')), TAF_SBBH);
    // Sem a validade: não dá para saber, fora
    assert.equal(so([taf({ validade_final: null })]), null);
    assert.equal(so([taf({ validade_inicial: 'ontem' })]), null);
    // O TAF emendado (AMD), emitido depois, ganha do original; o próximo TAF, que só vale às 18:00Z, não entra
    const amd = taf({ validade_inicial: '2026-11-20 14:00:00', mens: 'TAF AMD SBBH 201410Z 2014/2024 VRB03KT 9999 SCT030 TEMPO 2016/2019 TSRA BKN030 FEW040CB=', recebimento: '2026-11-20 14:12:00' });
    const proximo = taf({ validade_inicial: '2026-11-20 18:00:00', validade_final: '2026-11-21 18:00:00', mens: 'TAF SBBH 201400Z 2018/2118 VRB02KT CAVOK=', recebimento: '2026-11-20 14:50:00' });
    assert.equal(so([amd, sbbh, proximo]), 'TAF AMD SBBH 201410Z 2014/2024 VRB03KT 9999 SCT030 TEMPO 2016/2019 TSRA BKN030 FEW040CB');
    assert.equal(so([sbbh, proximo]), TAF_SBBH);
    assert.equal(so([sbbh, proximo], new Date('2026-11-20T18:00:00Z')), 'TAF SBBH 201400Z 2018/2118 VRB02KT CAVOK');
  });

  it('com a janela, a REDEMET não manda o TAF em vigor (que começou antes dela): sem TAF, as duas estações ficam sem', () => {
    assert.deepEqual(lerMensagens(TAF_JANELA), []);
    assert.deepEqual(montarResposta(lerMensagens(METAR_JANELA), lerMensagens(TAF_JANELA), AGORA).estacoes.map(e => e.taf), [null, null]);
  });

  it('sem mensagens, as duas estações vêm sem METAR e sem TAF', () => {
    assert.deepEqual(montarResposta([], [], AGORA).estacoes, [
      { icao: 'SBBH', nome: 'Pampulha', metar: null, taf: null, observado: null },
      { icao: 'SBCF', nome: 'Confins', metar: null, taf: null, observado: null }
    ]);
  });

  it('uma resposta fora do formato (o status false, o erro da chave, HTML): erro', () => {
    assert.throws(() => lerMensagens('{"status":false,"message":"Erro","data":{"data":[]}}'), /fora do formato/);
    assert.throws(() => lerMensagens('{"message":"Unauthorized"}'), /fora do formato/);
    assert.throws(() => lerMensagens('{"status":true,"data":{"data":"SBBH"}}'), /fora do formato/);
    assert.throws(() => lerMensagens('null'), /fora do formato/);
    assert.throws(() => lerMensagens('<html>'), SyntaxError);
    assert.throws(() => lerMensagens(''), SyntaxError);
  });

  it('a mensagem numa linha, sem o "=" do fim; os caracteres de controle e as estações de fora não entram', () => {
    assert.equal(limparMensagem('METAR SBBH 201600Z 26006KT 9999 BKN030 27/21 Q1014='), 'METAR SBBH 201600Z 26006KT 9999 BKN030 27/21 Q1014');
    assert.equal(limparMensagem('TAF SBCF 200800Z 2012/2112 34005KT\n  BECMG 2015/2017 9999 SCT035 = \n'), 'TAF SBCF 200800Z 2012/2112 34005KT BECMG 2015/2017 9999 SCT035');
    assert.equal(limparMensagem('METAR\u0000 SBBH\u001b[31m 201300Z'), 'METAR SBBH [31m 201300Z');
    assert.equal(limparMensagem('   '), null);
    assert.equal(limparMensagem('='), null);
    assert.equal(limparMensagem(42), null);
    assert.equal(limparMensagem('A'.repeat(5000)).length, 1500);
    const [sbbh] = lerMensagens(METAR_JANELA);
    const lista = [{ ...sbbh, id_localidade: 'SBGR', mens: 'METAR SBGR 201300Z 00000KT CAVOK 25/15 Q1015=' }, { ...sbbh, mens: null }, null, 'METAR'];
    assert.deepEqual(montarResposta(lista, [], AGORA).estacoes.map(e => e.metar), [null, null]);
  });

  it('os instantes da REDEMET, em UTC; fora do formato: null', () => {
    assert.equal(instante('2026-11-20 16:00:00').toISOString(), '2026-11-20T16:00:00.000Z');
    assert.equal(instante('2026-11-20T16:05').toISOString(), '2026-11-20T16:05:00.000Z');
    for (const fora of ['2026-11-31 10:00:00', '2026-11-20 24:00:00', '20/11/2026 16:00', '', null, 1763654400]) assert.equal(instante(fora), null, String(fora));
  });

  it('a hora da mensagem pelo grupo DDHHMMZ: no mês da referência, ou no anterior', () => {
    assert.equal(horaDaMensagem('METAR SBBH 201300Z 30005KT', AGORA).toISOString(), '2026-11-20T13:00:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 312350Z 30005KT', new Date('2026-11-01T00:10:00Z')).toISOString(), '2026-10-31T23:50:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 312350Z 30005KT', new Date('2026-01-01T00:10:00Z')).toISOString(), '2025-12-31T23:50:00.000Z');
    // O relógio da estação um pouco à frente (a virada do dia)
    assert.equal(horaDaMensagem('METAR SBBH 210000Z 30005KT', new Date('2026-11-20T23:59:00Z')).toISOString(), '2026-11-21T00:00:00.000Z');
    assert.equal(horaDaMensagem('TAF AMD SBBH 201410Z 2014/2024', AGORA).toISOString(), '2026-11-20T14:10:00.000Z');
    assert.equal(horaDaMensagem('METAR SBBH 31120Z', AGORA), null);
    assert.equal(horaDaMensagem('METAR SBBH 202460Z', AGORA), null);
    assert.equal(horaDaMensagem(null, AGORA), null);
  });
});

// Um fetch falso: as respostas da REDEMET por endereço, contando as chamadas (o endereço e a chave do cabeçalho)
const CHAVE = 'chave-de-teste';
function redemetFalsa({ metar = METAR_JANELA, taf = TAF_PADRAO, status = 200, demora = null } = {}) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, chave: opcoes.headers['x-api-key'] });
    if (demora) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, demora);
        opcoes.signal.addEventListener('abort', () => { clearTimeout(t); reject(opcoes.signal.reason); });
      });
    }
    if (status !== 200) return new Response('{"message":"erro"}', { status });
    return new Response(url.includes('/metar/') ? metar : taf, { status: 200 });
  };
  return { buscar, chamadas };
}
const pedido = (metodo = 'GET', origem = 'https://gdruumond.github.io', cabecalhos = {}) =>
  new Request('https://projeto.supabase.co/functions/v1/meteorologia', { method: metodo, headers: { origin: origem, authorization: 'Bearer a.b.c', ...cabecalhos } });

describe('meteorologia: o atendimento da função', () => {
  const comChave = (opcoes = {}) => criarAtendimento({ conferirSessao: async () => true, chave: CHAVE, ...opcoes });

  it('CORS só para as origens do app (o GitHub Pages da produção e da prévia, e o localhost)', async () => {
    for (const origem of ['https://gdruumond.github.io', 'https://thephfernandes.github.io', 'http://localhost:4173', 'http://127.0.0.1:8080', 'http://localhost']) {
      assert.ok(origemPermitida(origem), origem);
    }
    for (const origem of ['https://evil.github.io', 'https://gdruumond.github.io.evil.com', 'http://localhost.evil.com', 'null', null]) {
      assert.ok(!origemPermitida(origem), String(origem));
    }
    const atender = comChave({ buscar: redemetFalsa().buscar });
    const preflight = await atender(pedido('OPTIONS', 'https://thephfernandes.github.io'));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://thephfernandes.github.io');
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization.*apikey/);
    assert.match(preflight.headers.get('vary'), /Origin/);
    const estranha = await atender(pedido('OPTIONS', 'https://evil.example'));
    assert.equal(estranha.headers.get('access-control-allow-origin'), null);
  });

  it('com a sessão, a resposta: as duas estações, em JSON, sem cache no navegador; a chave só no cabeçalho x-api-key', async () => {
    const redemet = redemetFalsa();
    const atender = comChave({ buscar: redemet.buscar, agora: () => AGORA.getTime() });
    const r = await atender(pedido('GET', 'http://localhost:4173'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:4173');
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const corpo = await r.json();
    assert.deepEqual(corpo.estacoes.map(e => [e.icao, e.nome, e.metar.slice(0, 18), e.taf.slice(0, 16), e.observado]), [
      ['SBBH', 'Pampulha', 'METAR SBBH 201600Z', 'TAF SBBH 200800Z', '2026-11-20T16:00:00.000Z'],
      ['SBCF', 'Confins', 'METAR SBCF 201600Z', 'TAF SBCF 200800Z', '2026-11-20T16:00:00.000Z']
    ]);
    assert.deepEqual(redemet.chamadas, [
      { url: 'https://api-redemet.decea.mil.br/mensagens/metar/SBBH,SBCF?data_ini=2026112013&data_fim=2026112016', chave: CHAVE },
      { url: 'https://api-redemet.decea.mil.br/mensagens/taf/SBBH,SBCF', chave: CHAVE }
    ]);
    assert.ok(!JSON.stringify(corpo).includes(CHAVE));
    // O supabase-js chama com POST por padrão: vale também
    assert.equal((await atender(pedido('POST'))).status, 200);
    assert.equal((await atender(pedido('DELETE'))).status, 405);
  });

  it('sem a chave da REDEMET (o segredo REDEMET_API_KEY): 503 com a mensagem em português, sem consultar nada', async () => {
    const redemet = redemetFalsa();
    for (const chave of [undefined, '']) {
      const atender = criarAtendimento({ conferirSessao: async () => true, buscar: redemet.buscar, ...(chave === undefined ? {} : { chave }) });
      const r = await atender(pedido());
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('access-control-allow-origin'), 'https://gdruumond.github.io');
      assert.deepEqual(await r.json(), { erro: 'A meteorologia não está configurada no servidor: falta a chave da REDEMET (o segredo REDEMET_API_KEY).' });
    }
    assert.equal(redemet.chamadas.length, 0);
    // Sem a sessão, continua o 401 (quem não entrou não fica sabendo da configuração)
    const semSessao = criarAtendimento({ conferirSessao: async () => false, buscar: redemet.buscar });
    assert.equal((await semSessao(pedido())).status, 401);
  });

  it('sem sessão válida: 401, sem consultar a REDEMET; o Auth fora do ar: 503', async () => {
    const redemet = redemetFalsa();
    const recusa = criarAtendimento({ conferirSessao: async () => false, chave: CHAVE, buscar: redemet.buscar });
    const r = await recusa(pedido());
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { erro: 'Entre no app para ver a meteorologia.' });
    assert.equal(redemet.chamadas.length, 0);
    const semAuth = criarAtendimento({ conferirSessao: async () => { throw new Error('rede'); }, chave: CHAVE, buscar: redemet.buscar });
    assert.equal((await semAuth(pedido())).status, 503);
  });

  it('as mensagens ficam 5 minutos na memória; duas chamadas juntas fazem uma consulta só; a janela anda com o relógio', async () => {
    const redemet = redemetFalsa();
    let agora = AGORA.getTime();
    const atender = comChave({ buscar: redemet.buscar, agora: () => agora });
    await Promise.all([atender(pedido()), atender(pedido())]);
    assert.equal(redemet.chamadas.length, 2);
    agora += 4 * 60000;
    await atender(pedido());
    assert.equal(redemet.chamadas.length, 2);
    agora += 61000;
    const r = await atender(pedido());
    assert.equal(redemet.chamadas.length, 4);
    assert.equal((await r.json()).gerado, new Date(agora).toISOString());
    agora += 60 * 60000;
    await atender(pedido());
    assert.match(redemet.chamadas[4].url, /\?data_ini=2026112014&data_fim=2026112017$/);
  });

  it('a REDEMET fora do ar (ou recusando a chave): as últimas mensagens (até 3 horas), senão 502 com a mensagem em português', async () => {
    const boa = redemetFalsa(), fora = redemetFalsa({ status: 503 });
    let buscar = boa.buscar, agora = AGORA.getTime();
    const atender = comChave({ buscar: (...a) => buscar(...a), agora: () => agora });
    await atender(pedido());
    buscar = fora.buscar;
    agora += 60 * 60000;
    const velha = await atender(pedido());
    assert.equal(velha.status, 200);
    assert.equal((await velha.json()).gerado, AGORA.toISOString());
    agora += 3 * 60 * 60000;
    const erro = await atender(pedido());
    assert.equal(erro.status, 502);
    assert.deepEqual(await erro.json(), { erro: 'Não foi possível buscar o METAR e o TAF na REDEMET.', detalhe: 'a REDEMET respondeu 503' });
    // A chave recusada (401) e uma resposta fora do formato também; o erro nunca traz a chave
    const recusada = await comChave({ buscar: redemetFalsa({ status: 401 }).buscar })(pedido());
    assert.equal(recusada.status, 502);
    const texto = await recusada.text();
    assert.match(texto, /a REDEMET respondeu 401/);
    assert.ok(!texto.includes(CHAVE));
    for (const metar of ['<html>', '{"status":false,"message":"Erro"}']) {
      assert.equal((await comChave({ buscar: redemetFalsa({ metar }).buscar })(pedido())).status, 502, metar);
    }
  });

  it('a REDEMET que não responde a tempo (12 segundos; aqui, 200 ms): 502', async () => {
    const lenta = redemetFalsa({ demora: 60000 });
    const atender = comChave({ buscar: lenta.buscar, tempoMaximo: 200 });
    const inicio = Date.now();
    const r = await atender(pedido());
    assert.equal(r.status, 502);
    assert.equal((await r.json()).erro, 'A REDEMET não respondeu a tempo.');
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

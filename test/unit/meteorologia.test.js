// A meteorologia do painel no app e na TV (js/meteorologia.js e a faixa, js/views/meteorologia.js): a resposta da função
// conferida, o TAF em linhas, a busca a cada 10 minutos que guarda as últimas
// mensagens boas quando falha, e "Meteorologia indisponível" sem servidor (este navegador) ou sem a função publicada (o
// backend do Supabase e o ApiClient).
process.env.TZ = 'America/Sao_Paulo';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ATUALIZAR_MS, criarMeteorologia, normalizarMeteorologia, linhasDoTaf } from '../../js/meteorologia.js';
import { faixaDaMeteorologia } from '../../js/views/meteorologia.js';
import { criarBackendSupabase } from '../../js/backends/supabase.js';
import { ApiClient } from '../../js/storage.js';
import { backendLocal } from '../../js/backends/local.js';

const RESPOSTA = {
  gerado: '2026-11-10T15:00:00.000Z',
  estacoes: [
    { icao: 'SBBH', nome: 'Pampulha', metar: 'METAR SBBH 101400Z 30005KT 9999 BKN025 26/16 Q1017', taf: null, observado: '2026-11-10T14:00:00.000Z' },
    { icao: 'SBCF', nome: 'Confins', metar: 'METAR SBCF 101500Z 36007KT 9999 BKN023 27/22 Q1016', taf: 'TAF SBCF 100800Z 1012/1112 34005KT 7000 SCT016 BECMG 1015/1017 9999 SCT035', observado: '2026-11-10T15:00:00.000Z' }
  ]
};
const AGORA = Date.parse('2026-11-10T15:05:00Z');
const MIN = 60000;

describe('meteorologia: a resposta e o TAF', () => {
  it('as duas estações, sempre na ordem SBBH e SBCF; a que não veio fica sem mensagens; fora do formato: null', () => {
    const r = normalizarMeteorologia({ ...RESPOSTA, estacoes: [...RESPOSTA.estacoes].reverse() });
    assert.deepEqual(r.estacoes.map(e => e.icao), ['SBBH', 'SBCF']);
    assert.equal(r.gerado, Date.parse('2026-11-10T15:00:00Z'));
    assert.equal(r.estacoes[0].observado, Date.parse('2026-11-10T14:00:00Z'));
    const so = normalizarMeteorologia({ gerado: 'ontem', estacoes: [{ icao: 'SBCF', metar: '  METAR   SBCF  ', taf: 7, observado: 'x' }, { icao: 'SBGR', metar: 'METAR SBGR' }] });
    assert.deepEqual(so, {
      gerado: null,
      estacoes: [
        { icao: 'SBBH', nome: 'Pampulha', metar: null, taf: null, observado: null },
        { icao: 'SBCF', nome: 'Confins', metar: 'METAR SBCF', taf: null, observado: null }
      ]
    });
    for (const fora of [null, 'texto', [], {}, { estacoes: 'SBBH' }]) assert.equal(normalizarMeteorologia(fora), null);
  });

  it('o TAF em linhas: cada BECMG, TEMPO, FM e PROB começa uma linha (PROB30 TEMPO junto)', () => {
    assert.deepEqual(linhasDoTaf('TAF SBCF 200800Z 2012/2112 34005KT 7000 SCT016 TX28/2018Z TN19/2109Z BECMG 2015/2017 9999 SCT035 TEMPO 2018/2021 TS SCT035 FEW040CB PROB30 2107/2111 2000 BR SCT002 RMK PGM'), [
      'TAF SBCF 200800Z 2012/2112 34005KT 7000 SCT016 TX28/2018Z TN19/2109Z',
      'BECMG 2015/2017 9999 SCT035',
      'TEMPO 2018/2021 TS SCT035 FEW040CB',
      'PROB30 2107/2111 2000 BR SCT002 RMK PGM'
    ]);
    assert.deepEqual(linhasDoTaf('TAF SBBH 201100Z 2012/2024 FM201500 10005KT CAVOK PROB40 TEMPO 2018/2020 TSRA'), [
      'TAF SBBH 201100Z 2012/2024', 'FM201500 10005KT CAVOK', 'PROB40 TEMPO 2018/2020 TSRA'
    ]);
  });
});

// Uma busca que a gente resolve na mão
function buscaManual() {
  const pedidos = [];
  const buscar = () => new Promise((resolve, reject) => pedidos.push({ resolve, reject }));
  return { buscar, pedidos };
}

describe('meteorologia: a busca a cada 10 minutos', () => {
  it('sem servidor (este navegador): indisponível, sem busca', async () => {
    const m = criarMeteorologia({ agora: () => AGORA });
    m.configurar(null);
    await m.pedir();
    assert.deepEqual(m.estado(), { indisponivel: true, dados: null, recebidoEm: null, falhou: false, buscando: false });
    // O app sem servidor: o ApiClient devolve null (nenhuma busca)
    let avisos = 0;
    m.configurar(() => null);
    m.aoMudar(() => avisos++);
    await m.pedir();
    assert.equal(m.estado().indisponivel, true);
    assert.equal(avisos, 1);
  });

  it('busca na primeira vez e de novo só 10 minutos depois; a busca que falha guarda as últimas mensagens boas', async () => {
    let agora = AGORA;
    const { buscar, pedidos } = buscaManual();
    const m = criarMeteorologia({ agora: () => agora });
    let avisos = 0;
    m.aoMudar(() => avisos++);
    m.configurar(buscar);
    assert.equal(m.estado().indisponivel, false);
    const primeira = m.pedir();
    assert.equal(m.pedir(), primeira, 'duas chamadas juntas fazem uma busca só');
    assert.equal(m.estado().buscando, true);
    pedidos[0].resolve(RESPOSTA);
    await primeira;
    assert.equal(avisos, 1);
    assert.deepEqual(m.estado().dados.estacoes.map(e => e.icao), ['SBBH', 'SBCF']);
    assert.equal(m.estado().recebidoEm, AGORA);

    // A virada do minuto pede alguns segundos antes dos 10 minutos: até 30 s antes, vale
    agora += ATUALIZAR_MS - 30001;
    await m.pedir();
    assert.equal(pedidos.length, 1, 'antes dos 10 minutos, não busca');
    agora += 1;
    const segunda = m.pedir();
    pedidos[1].reject(Object.assign(new Error('meteorologia indisponível (502)'), { code: '502' }));
    await segunda;
    const depois = m.estado();
    assert.equal(depois.falhou, true);
    assert.equal(depois.indisponivel, false);
    assert.equal(depois.recebidoEm, AGORA, 'as mensagens de antes continuam');
    assert.equal(depois.dados.estacoes[1].metar, RESPOSTA.estacoes[1].metar);

    // A resposta fora do formato também conta como falha
    agora += ATUALIZAR_MS;
    const terceira = m.pedir();
    pedidos[2].resolve('<html>');
    await terceira;
    assert.equal(m.estado().falhou, true);
    // E a busca seguinte que dá certo volta ao normal
    agora += ATUALIZAR_MS;
    const quarta = m.pedir();
    pedidos[3].resolve(RESPOSTA);
    await quarta;
    assert.equal(m.estado().falhou, false);
    assert.equal(m.estado().recebidoEm, agora);
  });

  it('sem a função publicada (o erro já na primeira busca): indisponível, e tenta de novo 10 minutos depois', async () => {
    let agora = AGORA;
    const m = criarMeteorologia({ agora: () => agora });
    let chamadas = 0;
    m.configurar(async () => { chamadas++; throw Object.assign(new Error('meteorologia indisponível (404)'), { code: '404' }); });
    await m.pedir();
    assert.deepEqual(m.estado(), { indisponivel: true, dados: null, recebidoEm: null, falhou: true, buscando: false });
    await m.pedir();
    assert.equal(chamadas, 1);
    agora += ATUALIZAR_MS;
    await m.pedir();
    assert.equal(chamadas, 2);
    // Uma busca que quebra antes da promessa também
    m.configurar(() => { throw new Error('quebrou'); });
    await m.pedir();
    assert.equal(m.estado().indisponivel, true);
  });
});

describe('meteorologia: a faixa do painel', () => {
  const estado = (extra = {}) => ({ indisponivel: false, dados: normalizarMeteorologia(RESPOSTA), recebidoEm: AGORA, falhou: false, buscando: false, ...extra });

  it('sem mensagens: "Meteorologia indisponível" (e, na primeira busca, que ela está a caminho)', () => {
    assert.equal(faixaDaMeteorologia({ indisponivel: true, dados: null, recebidoEm: null, falhou: false, buscando: false }), '<p class="meteo-aviso">Meteorologia indisponível</p>');
    assert.equal(faixaDaMeteorologia({ indisponivel: true, dados: null, recebidoEm: null, falhou: true, buscando: false }), '<p class="meteo-aviso">Meteorologia indisponível</p>');
    assert.equal(faixaDaMeteorologia({ indisponivel: false, dados: null, recebidoEm: null, falhou: false, buscando: true }), '<p class="meteo-aviso">Buscando o METAR e o TAF…</p>');
  });

  it('as duas caixas, cada uma com "Atualizado às" a hora da observação do METAR (a local e a Z), o METAR e o TAF em linhas; sem TAF, o aviso; nada de HTML das mensagens', () => {
    const html = faixaDaMeteorologia(estado());
    assert.match(html, /<div class="meteo-topo"><span class="meteo-titulo">METAR e TAF<\/span><\/div>/);
    assert.match(html, /<div class="meteo-estacao" role="group" aria-labelledby="meteo-SBBH" data-icao="SBBH">/);
    assert.match(html, /id="meteo-SBBH">SBBH · Pampulha<\/h4><span class="meteo-hora">Atualizado às 11:00 \(14:00Z\)<\/span><\/div>/);
    assert.match(html, /id="meteo-SBCF">SBCF · Confins<\/h4><span class="meteo-hora">Atualizado às 12:00 \(15:00Z\)<\/span><\/div>/);
    assert.equal((html.match(/Atualizado às/g) || []).length, 2, 'só nas caixas');
    assert.match(html, /<p class="meteo-msg meteo-sem">Sem TAF em vigor<\/p>/);
    assert.match(html, /TAF SBCF 100800Z 1012\/1112 34005KT 7000 SCT016<br>BECMG 1015\/1017 9999 SCT035/);
    const injetado = { ...RESPOSTA, estacoes: [{ ...RESPOSTA.estacoes[0], metar: 'METAR <img src=x onerror=alert(1)>' }] };
    assert.ok(!faixaDaMeteorologia(estado({ dados: normalizarMeteorologia(injetado) })).includes('<img'));
  });

  it('o METAR velho e a busca que falhou: só a hora da atualização de cada caixa, sem marca nem idade', () => {
    const html = faixaDaMeteorologia(estado({ falhou: true, recebidoEm: AGORA - 3 * 60 * MIN }));
    assert.match(html, /<span class="meteo-hora">Atualizado às 11:00 \(14:00Z\)<\/span>/);
    assert.match(html, /METAR SBCF 101500Z/);
    assert.ok(!/antigo|desatualizada|Sem atualização|há \d/.test(html), html);
    // Sem METAR, a caixa fica sem a hora (e com o aviso)
    const semMetar = { ...RESPOSTA, estacoes: [{ ...RESPOSTA.estacoes[0], metar: null, observado: null }, RESPOSTA.estacoes[1]] };
    const so = faixaDaMeteorologia(estado({ dados: normalizarMeteorologia(semMetar) }));
    assert.match(so, /id="meteo-SBBH">SBBH · Pampulha<\/h4><\/div>\s*<p class="meteo-msg meteo-sem">Sem METAR<\/p>/);
  });
});

describe('meteorologia: o backend e o ApiClient', () => {
  const cliente = resposta => {
    const chamadas = [];
    return { chamadas, functions: { invoke: async (nome, opcoes) => { chamadas.push({ nome, ...opcoes }); return resposta; } } };
  };

  it('o backend do Supabase chama a função meteorologia (GET, com o tempo máximo) e devolve a resposta', async () => {
    const c = cliente({ data: RESPOSTA, error: null });
    assert.deepEqual(await criarBackendSupabase(c).meteorologia(), RESPOSTA);
    assert.deepEqual(c.chamadas, [{ nome: 'meteorologia', method: 'GET', timeout: 25000 }]);
  });

  it('sem a função publicada (404) ou sem conexão: o erro, com o status', async () => {
    const semFuncao = cliente({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 404 } }) });
    await assert.rejects(criarBackendSupabase(semFuncao).meteorologia(), e => e.code === '404' && /indisponível \(404\)/.test(e.message));
    const semRede = cliente({ data: null, error: Object.assign(new Error('Failed to send a request to the Edge Function'), { context: new TypeError('fetch') }) });
    await assert.rejects(criarBackendSupabase(semRede).meteorologia(), e => e.code === '' && e.message === 'meteorologia indisponível');
  });

  it('o ApiClient: neste navegador (backend local), null, sem busca; com o servidor, a função', async () => {
    const antes = ApiClient.backend;
    try {
      ApiClient.backend = backendLocal;
      assert.equal(ApiClient.meteorologia(), null);
      ApiClient.backend = criarBackendSupabase(cliente({ data: RESPOSTA, error: null }));
      assert.deepEqual(await ApiClient.meteorologia(), RESPOSTA);
    } finally {
      ApiClient.backend = antes;
    }
  });
});

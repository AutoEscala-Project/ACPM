// A sessão da TV da recepção (js/sessao-da-tv.js): quando renovar, quando a TV acordou, o que a tela mostra, o que é
// falha passageira e o que recusa a sessão, o e-mail e a senha guardados e a renovação com o auth do supabase-js (aqui um
// auth falso, que responde como o supabase-js 2.119).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENOVAR_ANTES_MS, SEM_ATUALIZACAO_MS, TIQUE_MS, acordou, criarSessaoDaTV, erroDeSessao, falhaPassageira, guardaDaEntrada,
  precisaRenovar, telaDaTV
} from '../../js/sessao-da-tv.js';

const AGORA = Date.parse('2026-11-10T11:00:00Z');
const MINUTO = 60000;

describe('Quando a TV renova a sessão', () => {
  it('faltando menos de 10 minutos, renova; com 10 ou mais, não', () => {
    assert.equal(RENOVAR_ANTES_MS, 10 * MINUTO);
    const expira = ms => (AGORA + ms) / 1000;
    assert.equal(precisaRenovar(expira(10 * MINUTO + 1000), AGORA), false);
    assert.equal(precisaRenovar(expira(10 * MINUTO), AGORA), false);
    assert.equal(precisaRenovar(expira(10 * MINUTO - 1000), AGORA), true);
    assert.equal(precisaRenovar(expira(60 * MINUTO), AGORA), false);
  });

  it('a sessão que já expirou renova; sem a data da expiração, não', () => {
    assert.equal(precisaRenovar((AGORA - MINUTO) / 1000, AGORA), true);
    assert.equal(precisaRenovar(undefined, AGORA), false);
    assert.equal(precisaRenovar(null, AGORA), false);
  });
});

describe('A TV que acordou', () => {
  it('o tique que chega com mais de três intervalos de atraso é a TV acordando', () => {
    assert.equal(TIQUE_MS, 30000);
    assert.equal(acordou(AGORA - TIQUE_MS, AGORA), false);
    assert.equal(acordou(AGORA - 3 * TIQUE_MS, AGORA), false);
    assert.equal(acordou(AGORA - 3 * TIQUE_MS - 1, AGORA), true);
    assert.equal(acordou(AGORA - 8 * 3600e3, AGORA), true);
  });
});

describe('O que a TV mostra', () => {
  const inicio = AGORA - 10 * MINUTO;
  const tela = (ultimaBusca, { falhou = false, sessaoExpirada = false, agora = AGORA } = {}) => telaDaTV({ agora, inicio, ultimaBusca, falhou, sessaoExpirada });

  it('com uma busca boa nos últimos 3 minutos, o quadro', () => {
    assert.equal(SEM_ATUALIZACAO_MS, 3 * MINUTO);
    assert.deepEqual(tela(AGORA), { tela: 'quadro' });
    assert.deepEqual(tela(AGORA - 3 * MINUTO, { falhou: true }), { tela: 'quadro' });
  });

  it('sem uma busca boa há mais de 3 minutos, o aviso, desde a última busca boa', () => {
    const ultima = AGORA - 3 * MINUTO - 1;
    assert.deepEqual(tela(ultima, { falhou: true }), { tela: 'sem-atualizacao', desde: ultima });
    assert.deepEqual(tela(AGORA - 2 * 3600e3, { falhou: true }), { tela: 'sem-atualizacao', desde: AGORA - 2 * 3600e3 });
  });

  it('o quadro volta na busca boa seguinte', () => {
    assert.deepEqual(tela(AGORA), { tela: 'quadro' });
  });

  it('sem nenhuma busca boa: o aviso já na primeira que falhou (não há quadro), desde que a página abriu', () => {
    assert.deepEqual(tela(null), { tela: 'quadro' });
    assert.deepEqual(tela(null, { falhou: true }), { tela: 'sem-atualizacao', desde: inicio });
  });

  it('a sessão expirada vale mais que tudo: o login', () => {
    assert.deepEqual(tela(AGORA, { sessaoExpirada: true }), { tela: 'sessao-expirada' });
    assert.deepEqual(tela(null, { falhou: true, sessaoExpirada: true }), { tela: 'sessao-expirada' });
  });
});

// Os erros como o supabase-js os devolve
const semConexao = () => Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true });
const foraDoAr = () => Object.assign(new Error('Service Unavailable'), { name: 'AuthRetryableFetchError', status: 503, __isAuthError: true });
const revogada = () => Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' });
const senhaErrada = () => Object.assign(new Error('Invalid login credentials'), { name: 'AuthApiError', status: 400, code: 'invalid_credentials' });

describe('Falha passageira e sessão recusada', () => {
  it('sem conexão, o servidor fora do ar ou ocupado: passageira; o refresh token revogado e a senha errada, não', () => {
    assert.equal(falhaPassageira(semConexao()), true);
    assert.equal(falhaPassageira(foraDoAr()), true);
    assert.equal(falhaPassageira(Object.assign(new Error('Too many requests'), { name: 'AuthApiError', status: 429 })), true);
    assert.equal(falhaPassageira(revogada()), false);
    assert.equal(falhaPassageira(senhaErrada()), false);
    assert.equal(falhaPassageira(null), false);
  });

  it('o 401 do PostgREST ou da função recusa a sessão; o 403, o 404 e a falha da rede, não', () => {
    assert.equal(erroDeSessao({ status: 401, code: 'PGRST301', message: 'JWT expired' }), true);
    assert.equal(erroDeSessao({ code: 'PGRST303', message: 'JWT claims invalid' }), true);
    assert.equal(erroDeSessao(Object.assign(new Error('meteorologia indisponível (401)'), { code: '401' })), true);
    assert.equal(erroDeSessao(Object.assign(new Error('meteorologia indisponível (404)'), { code: '404' })), false);
    assert.equal(erroDeSessao({ status: 403, code: '42501', message: 'sem acesso ao painel' }), false);
    assert.equal(erroDeSessao(new TypeError('Failed to fetch')), false);
    assert.equal(erroDeSessao(null), false);
  });
});

// Um localStorage na memória
function armazenamento() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

describe('O e-mail e a senha guardados', () => {
  it('guarda, lê e limpa na chave dada', () => {
    const a = armazenamento(), entrada = guardaDaEntrada('acpm-teste-painel-entrada', a);
    assert.equal(entrada.ler(), null);
    entrada.guardar('tv@teste.acpm', 'senha-da-tv');
    assert.deepEqual(JSON.parse(a.m.get('acpm-teste-painel-entrada')), { email: 'tv@teste.acpm', senha: 'senha-da-tv' });
    assert.deepEqual(entrada.ler(), { email: 'tv@teste.acpm', senha: 'senha-da-tv' });
    entrada.limpar();
    assert.equal(a.m.has('acpm-teste-painel-entrada'), false);
  });

  it('o valor fora do formato vale como nada guardado', () => {
    const a = armazenamento(), entrada = guardaDaEntrada('k', a);
    for (const valor of ['{', 'null', '[]', '{"email":"a@b"}', '{"email":"","senha":"x"}', '{"email":1,"senha":"x"}']) {
      a.setItem('k', valor);
      assert.equal(entrada.ler(), null, valor);
    }
  });

  it('sem o localStorage (bloqueado), nada quebra e nada fica guardado', () => {
    const quebra = () => { throw new Error('SecurityError'); };
    const entrada = guardaDaEntrada('k', { getItem: quebra, setItem: quebra, removeItem: quebra });
    entrada.guardar('tv@teste.acpm', 'senha');
    entrada.limpar();
    assert.equal(entrada.ler(), null);
  });
});

// O auth do supabase-js, falso: a sessão guardada (expires_at em segundos), o que refreshSession e signInWithPassword
// respondem, e as chamadas
function authFalso({ sessao = { expires_at: (AGORA + 60 * MINUTO) / 1000 }, renovar = () => null, entrar = () => null } = {}) {
  const chamadas = [];
  const auth = {
    async getSession() { chamadas.push('getSession'); return { data: { session: sessao }, error: null }; },
    async refreshSession() {
      chamadas.push('refreshSession');
      const error = renovar();
      if (!error) sessao = { expires_at: (AGORA + 60 * MINUTO) / 1000 };
      return { data: { session: error ? null : sessao }, error };
    },
    async signInWithPassword(credenciais) {
      chamadas.push(['signInWithPassword', credenciais]);
      const error = entrar(credenciais);
      if (!error) sessao = { expires_at: (AGORA + 60 * MINUTO) / 1000 };
      return { data: { session: error ? null : sessao }, error };
    },
    async signOut(opcoes) { chamadas.push(['signOut', opcoes]); sessao = null; return { error: null }; },
    get sessao() { return sessao; }
  };
  return { auth, chamadas };
}
const TV = { email: 'tv@teste.acpm', senha: 'senha-da-tv' };
function montar({ guardada = null, perfil = 'painel', ...opcoes } = {}) {
  const { auth, chamadas } = authFalso(opcoes);
  const a = armazenamento(), entrada = guardaDaEntrada('k', a);
  if (guardada) entrada.guardar(guardada.email, guardada.senha);
  const sessao = criarSessaoDaTV({ auth, entrada, perfil: async () => perfil, agora: () => AGORA });
  return { sessao, auth, chamadas, entrada };
}
const nomes = chamadas => chamadas.map(c => (Array.isArray(c) ? c[0] : c));

describe('A renovação da sessão da TV', () => {
  it('com mais de 10 minutos pela frente, nada a fazer', async () => {
    const { sessao, chamadas } = montar();
    assert.equal(await sessao.renovar(), 'ok');
    assert.deepEqual(nomes(chamadas), ['getSession']);
  });

  it('faltando menos de 10 minutos, renova', async () => {
    const { sessao, chamadas, auth } = montar({ sessao: { expires_at: (AGORA + 9 * MINUTO) / 1000 } });
    assert.equal(await sessao.renovar(), 'ok');
    assert.deepEqual(nomes(chamadas), ['getSession', 'refreshSession']);
    assert.equal(auth.sessao.expires_at, (AGORA + 60 * MINUTO) / 1000);
  });

  it('sem conexão, a sessão fica (sem entrar de novo e sem apagar nada)', async () => {
    const { sessao, chamadas, entrada } = montar({ sessao: { expires_at: (AGORA + MINUTO) / 1000 }, renovar: semConexao, guardada: TV });
    assert.equal(await sessao.renovar(), 'rede');
    assert.deepEqual(nomes(chamadas), ['getSession', 'refreshSession']);
    assert.deepEqual(entrada.ler(), TV);
  });

  it('a renovação recusada (revogada), com o e-mail e a senha guardados: entra de novo sozinha', async () => {
    const { sessao, chamadas, entrada } = montar({ renovar: revogada, guardada: TV });
    assert.equal(await sessao.renovar({ forcar: true }), 'ok');
    assert.deepEqual(chamadas, ['getSession', 'refreshSession', ['signInWithPassword', { email: TV.email, password: TV.senha }]]);
    assert.deepEqual(entrada.ler(), TV);
  });

  it('a renovação recusada, sem nada guardado: a sessão sai deste navegador e falta o login', async () => {
    const { sessao, chamadas, auth } = montar({ renovar: revogada });
    assert.equal(await sessao.renovar({ forcar: true }), 'expirada');
    assert.deepEqual(chamadas, ['getSession', 'refreshSession', ['signOut', { scope: 'local' }]]);
    assert.equal(auth.sessao, null);
  });

  it('a senha mudou: o e-mail e a senha guardados saem, e falta o login', async () => {
    const { sessao, entrada } = montar({ renovar: revogada, entrar: senhaErrada, guardada: TV });
    assert.equal(await sessao.renovar({ forcar: true }), 'expirada');
    assert.equal(entrada.ler(), null);
  });

  it('sem conexão para entrar de novo: o que está guardado fica, e a TV tenta de novo', async () => {
    const { sessao, entrada, chamadas } = montar({ renovar: revogada, entrar: semConexao, guardada: TV });
    assert.equal(await sessao.renovar({ forcar: true }), 'rede');
    assert.deepEqual(entrada.ler(), TV);
    assert.equal(nomes(chamadas).includes('signOut'), false);
  });

  it('a conta guardada que deixou de ser a da TV: sai, e o que estava guardado também', async () => {
    const { sessao, entrada, auth } = montar({ renovar: revogada, guardada: TV, perfil: 'operador' });
    assert.equal(await sessao.renovar({ forcar: true }), 'expirada');
    assert.equal(entrada.ler(), null);
    assert.equal(auth.sessao, null);
  });

  it('sem sessão neste navegador: entra com o que está guardado; sem nada, falta o login', async () => {
    const comEntrada = montar({ sessao: null, guardada: TV });
    assert.equal(await comEntrada.sessao.renovar(), 'ok');
    assert.equal(nomes(comEntrada.chamadas).includes('signInWithPassword'), true);
    const semEntrada = montar({ sessao: null });
    assert.equal(await semEntrada.sessao.renovar(), 'expirada');
    // Sem sessão, nada a tirar (um login feito na tela enquanto isso corria continua)
    assert.deepEqual(semEntrada.chamadas, ['getSession']);
  });

  it('uma renovação por vez: a segunda espera a primeira (e já encontra a sessão nova)', async () => {
    const { sessao, chamadas } = montar({ sessao: { expires_at: (AGORA + 5 * MINUTO) / 1000 } });
    assert.deepEqual(await Promise.all([sessao.renovar(), sessao.renovar()]), ['ok', 'ok']);
    assert.deepEqual(nomes(chamadas), ['getSession', 'refreshSession', 'getSession']);
  });
});

describe('A chamada com a sessão (painel_do_dia e a meteorologia)', () => {
  const jwtExpirado = () => Object.assign(new Error('JWT expired'), { status: 401, code: 'PGRST301' });

  it('o 401: renova e tenta mais uma vez', async () => {
    const { sessao, chamadas } = montar();
    let n = 0;
    const resposta = await sessao.comSessao(async () => { if (n++ === 0) throw jwtExpirado(); return 'quadro'; });
    assert.equal(resposta, 'quadro');
    assert.equal(n, 2);
    assert.deepEqual(nomes(chamadas), ['getSession', 'getSession', 'refreshSession']);
  });

  it('só uma vez: o segundo 401 vai para quem chamou', async () => {
    const { sessao } = montar();
    let n = 0;
    await assert.rejects(sessao.comSessao(async () => { n++; throw jwtExpirado(); }), /JWT expired/);
    assert.equal(n, 2);
  });

  it('outro erro não renova nem tenta de novo', async () => {
    const { sessao, chamadas } = montar();
    let n = 0;
    await assert.rejects(sessao.comSessao(async () => { n++; throw new TypeError('Failed to fetch'); }), /Failed to fetch/);
    assert.equal(n, 1);
    assert.deepEqual(nomes(chamadas), ['getSession']);
  });

  it('a sessão que não volta: avisa (aoExpirar) e não chama de novo', async () => {
    const { sessao } = montar({ renovar: revogada });
    let n = 0, expirou = 0;
    await assert.rejects(sessao.comSessao(async () => { n++; throw jwtExpirado(); }, () => { expirou++; }));
    assert.equal(n, 1);
    assert.equal(expirou, 1);
    // Sem sessão e sem nada guardado: nem chama
    await assert.rejects(sessao.comSessao(async () => { n++; return 'quadro'; }, () => { expirou++; }));
    assert.equal(n, 1);
    assert.equal(expirou, 2);
  });
});

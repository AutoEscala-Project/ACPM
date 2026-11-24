// O atendimento da função meteorologia (index.ts): JavaScript puro, que o Deno do Supabase roda e os testes de unidade
// (Node) importam, com a rede e o relógio trocáveis.
// - CORS só para as origens do app (o GitHub Pages da produção e da prévia, e o localhost do desenvolvimento), com o
//   OPTIONS da verificação prévia do navegador
// - Só uma sessão válida do app: o gateway do Supabase confere o JWT (verify_jwt, o padrão; supabase/config.toml) e,
//   aqui, o Auth do projeto confere que a sessão é de uma conta (a chave publicável sozinha não serve)
// - A REDEMET (a API do DECEA) pede a chave, o segredo REDEMET_API_KEY do projeto, que vai só no cabeçalho x-api-key
//   (nunca no endereço, nos logs nem nas respostas). Sem a chave, a função responde 503, com a mensagem em português
// - As mensagens ficam 5 minutos na memória: as TVs e os navegadores juntos fazem no máximo duas consultas à REDEMET a
//   cada 5 minutos (o METAR sai de hora em hora; o SPECI, quando o tempo muda)
// - A REDEMET que não responde em 12 segundos conta como fora do ar; fora do ar, a função devolve as últimas mensagens
//   que tem (até 3 horas: quem lê vê a hora da observação; o TAF, só o que ainda cobre agora) ou o erro 502, com a
//   mensagem em português (e o detalhe com o texto nosso: nunca a chave nem o que a REDEMET mandou)
import { enderecos, lerMensagens, montarResposta } from './mensagens.js';

const CACHE_MS = 5 * 60000;
const VELHO_DEMAIS_MS = 3 * 3600000;
const TEMPO_MAXIMO_MS = 12000;
const SESSAO_MS = 5 * 60000;

const ORIGENS = [
  'https://autoescala.autoescala-acpm.workers.dev',
  'https://autoescala-previa.autoescala-acpm.workers.dev',
  'https://gdruumond.github.io',
  'https://thephfernandes.github.io'
];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
export const origemPermitida = origem => typeof origem === 'string' && (ORIGENS.includes(origem) || LOCAL.test(origem));

function cabecalhosCors(req) {
  const origem = req.headers.get('origin');
  return {
    ...(origemPermitida(origem) ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const responder = (req, status, corpo) => new Response(JSON.stringify(corpo), {
  status, headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

// A sessão pelo Auth do projeto (GET /auth/v1/user com o token de quem chama): 200 é uma conta conectada. Cada token
// confirmado vale 5 minutos na memória (as chamadas seguintes não voltam ao Auth)
export function conferirNoAuth(urlDoProjeto, chavePadrao, buscar = fetch, agora = Date.now) {
  const confirmados = new Map();
  return async req => {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    // Um JWT tem três partes; a chave publicável (sb_publishable_…) não é uma sessão
    if (token.split('.').length !== 3) return false;
    const validade = confirmados.get(token);
    if (validade && validade > agora()) return true;
    if (!urlDoProjeto) return false;
    const resposta = await buscar(`${urlDoProjeto.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: req.headers.get('apikey') || chavePadrao || '' },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS)
    });
    if (resposta.body) await resposta.body.cancel().catch(() => {});
    if (resposta.status !== 200) return false;
    if (confirmados.size > 500) confirmados.clear();
    confirmados.set(token, agora() + SESSAO_MS);
    return true;
  };
}

// O erro de uma consulta, com o texto nosso: o do fetch pode trazer o valor do cabeçalho (o Deno, com um cabeçalho
// inválido: 'Invalid header value: "<a chave>"'), e o do JSON.parse, o começo da resposta (que pode repetir a chave)
const erroSeguro = (e, texto) => {
  const tempo = Boolean(e) && (e.name === 'TimeoutError' || e.name === 'AbortError');
  return Object.assign(new Error(tempo ? 'a REDEMET não respondeu a tempo' : texto), { name: tempo ? 'TimeoutError' : 'Error' });
};

// Uma consulta à REDEMET, com a chave no cabeçalho e o tempo máximo. O erro diz só o status ou o que falhou, com o
// texto nosso (nunca a chave nem o que a REDEMET mandou)
async function consultar(buscar, endereco, chave, tempoMaximo) {
  let resposta, texto;
  try {
    resposta = await buscar(endereco, { headers: { 'x-api-key': chave, Accept: 'application/json' }, signal: AbortSignal.timeout(tempoMaximo) });
  } catch (e) {
    throw erroSeguro(e, 'a conexão com a REDEMET falhou');
  }
  if (!resposta.ok) {
    if (resposta.body) await resposta.body.cancel().catch(() => {});
    throw new Error(`a REDEMET respondeu ${resposta.status}`);
  }
  try {
    texto = await resposta.text();
  } catch (e) {
    throw erroSeguro(e, 'a resposta da REDEMET não chegou inteira');
  }
  try {
    return lerMensagens(texto);
  } catch {
    throw new Error('a resposta da REDEMET veio fora do formato');
  }
}

// conferirSessao(req): true para uma sessão válida do app (sem ela, ninguém entra); chave: a chave da REDEMET (o segredo
// REDEMET_API_KEY; vazia, a função responde 503); buscar: o fetch; agora: o relógio (ms); tempoMaximo: a espera pela
// REDEMET (ms). O tipo em JSDoc é o que o Deno lê ao conferir o index.ts (deno check): sem ele, o Deno deduz os tipos dos
// valores padrão, e conferirSessao, sem padrão, ficaria de fora
/**
 * @param {{ conferirSessao: (req: Request) => Promise<boolean>, chave?: string, buscar?: typeof fetch, agora?: () => number, tempoMaximo?: number }} opcoes
 */
export function criarAtendimento({ conferirSessao, chave = '', buscar = fetch, agora = Date.now, tempoMaximo = TEMPO_MAXIMO_MS }) {
  let guardado = null;   // { em, metars, tafs }: as listas da REDEMET, como vieram
  let emAndamento = null;

  // As mensagens guardadas, escolhidas agora: o TAF em vigor é o que cobre agora (o que venceu desde a consulta sai);
  // gerado é a hora da consulta
  const responderCom = g => ({ ...montarResposta(g.metars, g.tafs, new Date(agora())), gerado: new Date(g.em).toISOString() });

  async function mensagens() {
    if (guardado && agora() - guardado.em < CACHE_MS) return responderCom(guardado);
    // Duas chamadas juntas fazem uma consulta só
    if (!emAndamento) {
      const endereco = enderecos(new Date(agora()));
      emAndamento = Promise.all([consultar(buscar, endereco.metar, chave, tempoMaximo), consultar(buscar, endereco.taf, chave, tempoMaximo)])
        .then(([metars, tafs]) => {
          guardado = { em: agora(), metars, tafs };
        })
        .finally(() => { emAndamento = null; });
    }
    try {
      await emAndamento;
    } catch (e) {
      if (!(guardado && agora() - guardado.em < VELHO_DEMAIS_MS)) throw e;
    }
    return responderCom(guardado);
  }

  return async req => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhosCors(req) });
    if (req.method !== 'GET' && req.method !== 'POST') return responder(req, 405, { erro: 'Use GET.' });
    let valida;
    try {
      valida = await conferirSessao(req);
    } catch {
      return responder(req, 503, { erro: 'Não foi possível conferir a sessão. Tente de novo em instantes.' });
    }
    if (!valida) return responder(req, 401, { erro: 'Entre no app para ver a meteorologia.' });
    if (!chave) return responder(req, 503, { erro: 'A meteorologia não está configurada no servidor: falta a chave da REDEMET (o segredo REDEMET_API_KEY).' });
    try {
      return responder(req, 200, await mensagens());
    } catch (e) {
      const tempo = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return responder(req, 502, {
        erro: tempo ? 'A REDEMET não respondeu a tempo.' : 'Não foi possível buscar o METAR e o TAF na REDEMET.',
        detalhe: String((e && e.message) || e).slice(0, 200)
      });
    }
  };
}

// O METAR e o TAF de Pampulha (SBBH) e de Confins (SBCF), das respostas da API do aviationweather.gov (o centro de dados
// da NOAA, que traz as mensagens oficiais do DECEA). JavaScript puro, sem nada do Deno nem do Node: a função
// meteorologia (index.ts) e os testes de unidade (test/unit/meteorologia-funcao.test.js) usam o mesmo módulo.
// O que chega da rede não é confiável: só os textos das estações conhecidas, sem caracteres de controle e com tamanho
// limitado; o que não vem no formato fica de fora (a estação aparece sem a mensagem).

export const ESTACOES = [
  { icao: 'SBBH', nome: 'Pampulha' },
  { icao: 'SBCF', nome: 'Confins' }
];

const BASE = 'https://aviationweather.gov/api/data';
const IDS = ESTACOES.map(e => e.icao).join(',');
// A última mensagem de cada estação, em JSON (o texto oficial vem em rawOb e rawTAF)
export const ENDERECOS = {
  metar: `${BASE}/metar?ids=${IDS}&format=json`,
  taf: `${BASE}/taf?ids=${IDS}&format=json`
};

const TAMANHO_MAXIMO = 1500;

// O texto oficial numa linha: sem caracteres de controle, os espaços (e as quebras de linha do formato "raw") juntados
// num só. Vazio ou fora do formato: null
export function limparMensagem(texto) {
  if (typeof texto !== 'string') return null;
  const semControle = Array.from(texto, c => {
    const codigo = c.charCodeAt(0);
    return codigo < 32 || (codigo >= 127 && codigo < 160) ? ' ' : c;
  }).join('');
  const limpo = semControle.replace(/\s+/g, ' ').trim();
  return limpo ? limpo.slice(0, TAMANHO_MAXIMO) : null;
}

// A resposta da API: um JSON com a lista das mensagens. 204 (nenhuma mensagem) chega como texto vazio
export function lerLista(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  const dados = JSON.parse(texto);
  if (!Array.isArray(dados)) throw new Error('a resposta do aviationweather.gov não é uma lista');
  return dados;
}

// O dia e a hora do grupo DDHHMMZ logo depois do indicativo ("METAR SBBH 201300Z ..."), no mês da referência (ou no
// anterior, quando o dia ainda não chegou: a mensagem do dia 31 lida no dia 1º). Sem o grupo: null
export function horaDaMensagem(texto, referencia = new Date()) {
  const m = /\b[A-Z]{4} (\d{2})(\d{2})(\d{2})Z\b/.exec(typeof texto === 'string' ? texto : '');
  if (!m) return null;
  const [dia, hora, minuto] = m.slice(1).map(Number);
  if (dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const ref = new Date(referencia);
  let ano = ref.getUTCFullYear(), mes = ref.getUTCMonth();
  // Um dia depois do de hoje (com uma folga para o relógio adiantado da estação) é do mês anterior
  if (dia > ref.getUTCDate() + 1) {
    mes -= 1;
    if (mes < 0) { mes = 11; ano -= 1; }
  }
  const data = new Date(Date.UTC(ano, mes, dia, hora, minuto));
  // O dia 31 num mês de 30 dias vira o dia 1º do seguinte: fora do formato
  return data.getUTCDate() === dia ? data : null;
}

// Um instante da API: segundos desde 1970 (obsTime, validTimeTo) ou texto ISO (reportTime, issueTime)
function instante(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return new Date(valor * 1000);
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  return null;
}

const daEstacao = (lista, icao) => lista.filter(m => m && typeof m === 'object' && m.icaoId === icao);

// O METAR (ou SPECI) mais recente da estação e a hora da observação
function ultimoMetar(lista, icao, agora) {
  let melhor = null;
  for (const m of daEstacao(lista, icao)) {
    const texto = limparMensagem(m.rawOb);
    if (!texto) continue;
    const observado = instante(m.obsTime) || instante(m.reportTime) || horaDaMensagem(texto, agora);
    if (!observado) continue;
    if (!melhor || observado > melhor.observado) melhor = { texto, observado };
  }
  return melhor;
}

// O TAF em vigor da estação: o mais recente (mostRecent, senão a emissão mais nova), se a validade não acabou
function ultimoTaf(lista, icao, agora) {
  let melhor = null;
  for (const t of daEstacao(lista, icao)) {
    const texto = limparMensagem(t.rawTAF);
    if (!texto) continue;
    const fim = instante(t.validTimeTo);
    if (fim && fim < agora) continue;
    const emitido = instante(t.issueTime) || horaDaMensagem(texto, agora) || new Date(0);
    const candidato = { texto, emitido, maisRecente: t.mostRecent === 1 };
    if (!melhor || (candidato.maisRecente && !melhor.maisRecente) || (candidato.maisRecente === melhor.maisRecente && emitido > melhor.emitido)) {
      melhor = candidato;
    }
  }
  return melhor;
}

// A resposta da função: as duas estações, sempre nesta ordem, cada uma com o METAR, o TAF (null quando não há) e a hora
// da observação do METAR (ISO)
export function montarResposta(metars, tafs, agora = new Date()) {
  const listaM = Array.isArray(metars) ? metars : [], listaT = Array.isArray(tafs) ? tafs : [];
  return {
    gerado: agora.toISOString(),
    estacoes: ESTACOES.map(({ icao, nome }) => {
      const metar = ultimoMetar(listaM, icao, agora);
      const taf = ultimoTaf(listaT, icao, agora);
      return { icao, nome, metar: metar ? metar.texto : null, taf: taf ? taf.texto : null, observado: metar ? metar.observado.toISOString() : null };
    })
  };
}

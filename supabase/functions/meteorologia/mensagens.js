// O METAR e o TAF de Pampulha (SBBH) e de Confins (SBCF), das respostas da API da REDEMET (a rede de meteorologia do
// DECEA, a fonte oficial). JavaScript puro, sem nada do Deno nem do Node: a função meteorologia (index.ts) e os testes
// de unidade (test/unit/meteorologia-funcao.test.js) usam o mesmo módulo.
// O que chega da rede não é confiável: só os textos das estações conhecidas, sem caracteres de controle e com tamanho
// limitado; o que não vem no formato fica de fora (a estação aparece sem a mensagem).

export const ESTACOES = [
  { icao: 'SBBH', nome: 'Pampulha' },
  { icao: 'SBCF', nome: 'Confins' }
];

const BASE = 'https://api-redemet.decea.mil.br/mensagens';
const IDS = ESTACOES.map(e => e.icao).join(',');
// A janela do METAR: sem data_ini e data_fim, a REDEMET devolve só a hora UTC de agora, e a estação cujo METAR da hora
// ainda não chegou fica de fora. Com as 3 horas antes (a hora UTC, AAAAMMDDHH), vêm os METAR e SPECI delas, de cada
// estação, e fica o mais recente
const JANELA_DO_METAR_H = 3;
const horaUtc = data => data.toISOString().slice(0, 13).replace(/\D/g, '');

// Os endereços das consultas, com a janela do METAR contada de agora. O TAF vai sem janela: assim a REDEMET devolve os
// TAF em vigor (com data_ini e data_fim, ela devolveu só os que começam a valer dentro da janela: o TAF em vigor, que
// começou antes, ficou de fora). A chave vai no cabeçalho x-api-key, nunca no endereço
export function enderecos(agora = new Date()) {
  const inicio = new Date(agora.getTime() - JANELA_DO_METAR_H * 3600000);
  return {
    metar: `${BASE}/metar/${IDS}?data_ini=${horaUtc(inicio)}&data_fim=${horaUtc(agora)}`,
    taf: `${BASE}/taf/${IDS}`
  };
}

const TAMANHO_MAXIMO = 1500;

// O texto oficial numa linha: sem caracteres de controle, os espaços (e as quebras de linha) juntados num só, sem o "="
// que fecha a mensagem. Vazio ou fora do formato: null
export function limparMensagem(texto) {
  if (typeof texto !== 'string') return null;
  const semControle = Array.from(texto, c => {
    const codigo = c.charCodeAt(0);
    return codigo < 32 || (codigo >= 127 && codigo < 160) ? ' ' : c;
  }).join('');
  const limpo = semControle.replace(/\s+/g, ' ').replace(/[\s=]+$/, '').trim();
  return limpo ? limpo.slice(0, TAMANHO_MAXIMO) : null;
}

// A resposta da REDEMET: { status, message, data: { data: [mensagens], ... } }. Outra coisa (o status false, um erro):
// erro
export function lerMensagens(texto) {
  const dados = JSON.parse(typeof texto === 'string' ? texto : '');
  const pagina = dados && typeof dados === 'object' && dados.status !== false ? dados.data : null;
  const lista = pagina && typeof pagina === 'object' ? pagina.data : null;
  if (!Array.isArray(lista)) throw new Error('a resposta da REDEMET veio fora do formato');
  return lista;
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

// Um instante da REDEMET ("2026-11-20 16:00:00", em UTC). Fora do formato: null
export function instante(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(typeof valor === 'string' ? valor.trim() : '');
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1).map(v => Number(v || 0));
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
  return data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? data : null;
}

const daEstacao = (lista, icao) => lista.filter(m => m && typeof m === 'object' && m.id_localidade === icao);
const ms = data => (data ? data.getTime() : -Infinity);
// a vem depois de b: pela primeira chave que difere
const depois = (a, b) => {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] > b[i];
};

// O METAR (ou SPECI) mais recente da estação: o da validade_inicial mais nova (no empate, o da observação mais nova, e
// então o recebido por último), com a hora da observação (a do grupo DDHHMMZ; sem ele, a validade_inicial)
function ultimoMetar(lista, icao, agora) {
  let melhor = null;
  for (const m of daEstacao(lista, icao)) {
    const texto = limparMensagem(m.mens);
    if (!texto) continue;
    const inicio = instante(m.validade_inicial);
    const observado = horaDaMensagem(texto, agora) || inicio;
    if (!observado) continue;
    const ordem = [ms(inicio), ms(observado), ms(instante(m.recebimento))];
    if (!melhor || depois(ordem, melhor.ordem)) melhor = { texto, observado, ordem };
  }
  return melhor;
}

// O TAF em vigor da estação: um cuja validade (da validade_inicial à validade_final) cobre agora; entre dois, o emitido
// por último (o grupo DDHHMMZ; sem ele, o recebimento). Sem a validade, não dá para saber se está em vigor: fica de fora
function ultimoTaf(lista, icao, agora) {
  let melhor = null;
  for (const t of daEstacao(lista, icao)) {
    const texto = limparMensagem(t.mens);
    if (!texto) continue;
    const inicio = instante(t.validade_inicial), fim = instante(t.validade_final);
    if (!inicio || !fim || inicio > agora || fim <= agora) continue;
    const recebido = instante(t.recebimento);
    const ordem = [ms(horaDaMensagem(texto, agora) || recebido), ms(recebido), ms(inicio)];
    if (!melhor || depois(ordem, melhor.ordem)) melhor = { texto, ordem };
  }
  return melhor;
}

// A resposta da função: as duas estações, sempre nesta ordem, cada uma com o METAR, o TAF (null quando nenhum está em
// vigor) e a hora da observação do METAR (ISO)
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

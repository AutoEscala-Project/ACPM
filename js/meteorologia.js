// A meteorologia do painel (a vista Painel da Escala e a TV da recepção): o METAR e o TAF oficiais de Pampulha (SBBH) e
// de Confins (SBCF), da função meteorologia do servidor (supabase/functions/meteorologia, que os busca na REDEMET, a
// API do DECEA). O painel pede as mensagens quando aparece e, enquanto está na tela, a cada 10 minutos; uma busca que
// falha não apaga as últimas mensagens boas (cada caixa diz a hora da observação do METAR dela). Sem servidor (este
// navegador) ou sem a função publicada, o painel diz "Meteorologia indisponível", e nada mais muda.

export const ATUALIZAR_MS = 10 * 60000;
// O painel pede a cada virada do minuto: a tentativa de 10 minutos atrás, por alguns segundos, já vale (senão a busca
// ficaria para o minuto seguinte, a cada 11 minutos)
const FOLGA_MS = 30000;
const TAMANHO_MAXIMO = 1500;

const ESTACOES = [
  { icao: 'SBBH', nome: 'Pampulha' },
  { icao: 'SBCF', nome: 'Confins' }
];

const texto = valor => (typeof valor === 'string' && valor.trim() ? valor.replace(/\s+/g, ' ').trim().slice(0, TAMANHO_MAXIMO) : null);
const instante = valor => {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

// A resposta da função, conferida: as duas estações, sempre nesta ordem (a que não veio fica sem mensagens), com a hora
// da observação em ms. Fora do formato: null
export function normalizarMeteorologia(dados) {
  if (!dados || typeof dados !== 'object' || !Array.isArray(dados.estacoes)) return null;
  return {
    gerado: instante(dados.gerado),
    estacoes: ESTACOES.map(({ icao, nome }) => {
      const e = dados.estacoes.find(x => x && typeof x === 'object' && x.icao === icao) || {};
      return { icao, nome, metar: texto(e.metar), taf: texto(e.taf), observado: instante(e.observado) };
    })
  };
}

// O TAF em linhas, como se lê: cada mudança (BECMG, TEMPO, FM…, PROB30, PROB40 e PROB30 TEMPO) começa uma linha
const MUDANCA = /^(BECMG|TEMPO|PROB\d{2}|FM\d{6})$/;
export function linhasDoTaf(taf) {
  const linhas = [];
  for (const grupo of taf.split(' ')) {
    const atual = linhas.length ? linhas[linhas.length - 1] : null;
    const muda = MUDANCA.test(grupo) && !(grupo === 'TEMPO' && /\bPROB\d{2}$/.test(atual));
    if (atual === null || muda) linhas.push(grupo);
    else linhas[linhas.length - 1] = `${atual} ${grupo}`;
  }
  return linhas;
}

// O estado das mensagens e a busca. buscar(): uma promessa com a resposta da função, ou null quando não há servidor
// (nem busca). agora: o relógio (ms)
export function criarMeteorologia({ agora = () => Date.now() } = {}) {
  let buscar = null;
  let dados = null, recebidoEm = null, falhou = false, indisponivel = true, tentouEm = null, buscando = null;
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach(fn => fn());

  return {
    // Troca a origem das mensagens (o app e a TV, ao abrir): o que havia sai
    configurar(novo) {
      buscar = novo;
      dados = null; recebidoEm = null; falhou = false; tentouEm = null; buscando = null;
      indisponivel = !buscar;
    },
    estado: () => ({ indisponivel, dados, recebidoEm, falhou, buscando: Boolean(buscando) }),
    aoMudar(fn) { ouvintes.add(fn); },
    // Busca as mensagens se ainda não buscou, ou se a última tentativa foi há 10 minutos ou mais. Devolve a busca
    // (a mesma, se já houver uma em andamento)
    pedir() {
      if (buscando) return buscando;
      if (!buscar || (tentouEm !== null && agora() - tentouEm < ATUALIZAR_MS - FOLGA_MS)) return Promise.resolve();
      tentouEm = agora();
      let pedido;
      try {
        pedido = buscar();
      } catch (e) {
        pedido = Promise.reject(e);
      }
      // Sem servidor: indisponível, sem busca
      if (pedido === null) {
        if (!indisponivel) { indisponivel = true; avisar(); }
        return Promise.resolve();
      }
      buscando = Promise.resolve(pedido).then(resposta => {
        const lidos = normalizarMeteorologia(resposta);
        if (!lidos) throw new Error('a resposta da meteorologia veio fora do formato');
        dados = lidos;
        recebidoEm = agora();
        falhou = false;
        indisponivel = false;
      }).catch(() => {
        // As últimas mensagens boas continuam; sem nenhuma, a meteorologia está indisponível
        falhou = true;
        indisponivel = !dados;
      }).finally(() => {
        buscando = null;
        avisar();
      });
      return buscando;
    }
  };
}

// A meteorologia das páginas (o app e a TV): uma só
const meteorologia = criarMeteorologia();
export const configurarMeteorologia = buscar => meteorologia.configurar(buscar);
export const estadoDaMeteorologia = () => meteorologia.estado();
export const pedirMeteorologia = () => meteorologia.pedir();
export const aoMudarMeteorologia = fn => meteorologia.aoMudar(fn);

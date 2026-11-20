// A faixa da meteorologia, embaixo do painel (a vista Painel da Escala, em tela cheia também, e a TV da recepção): duas
// caixas lado a lado, sempre as duas (sem alternar), "SBBH · Pampulha" e "SBCF · Confins", cada uma com o METAR e o TAF
// oficiais, em letra de máquina de escrever e quebrando a linha, a hora da observação (a local e a Z) e, com o METAR de
// mais de 90 minutos, a marca "METAR antigo". No celular, uma caixa embaixo da outra. A faixa é uma região com nome, sem
// aria-live: a atualização a cada 10 minutos não é anunciada pelo leitor de tela.
import { esc, hm, minutoDoDia } from '../format.js';
import { linhasDoTaf, metarAntigo } from '../meteorologia.js';

// "há 25 min", "há 2 h 05 min"
function idade(ms) {
  const minutos = Math.max(0, Math.floor(ms / 60000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}
const horaLocal = ms => hm(minutoDoDia(new Date(ms)));
const horaZ = ms => `${new Date(ms).toISOString().slice(11, 16)}Z`;

function caixa(e, agora) {
  const antigo = e.metar !== null && metarAntigo(e.observado, agora);
  const hora = e.observado === null ? ''
    : `<span class="meteo-hora">Observado às ${horaLocal(e.observado)} (${horaZ(e.observado)})</span>`;
  const marca = antigo ? `<span class="meteo-antigo">METAR antigo · ${idade(agora - e.observado)}</span>` : '';
  const metar = e.metar === null ? '<p class="meteo-msg meteo-sem">Sem METAR</p>' : `<p class="meteo-msg meteo-metar">${esc(e.metar)}</p>`;
  const taf = e.taf === null ? '<p class="meteo-msg meteo-sem">Sem TAF em vigor</p>'
    : `<p class="meteo-msg meteo-taf">${linhasDoTaf(e.taf).map(esc).join('<br>')}</p>`;
  return `<div class="meteo-estacao${antigo ? ' meteo-desatualizada' : ''}" role="group" aria-labelledby="meteo-${e.icao}" data-icao="${e.icao}">
      <div class="meteo-cab"><h4 class="meteo-nome" id="meteo-${e.icao}">${e.icao} · ${esc(e.nome)}</h4>${hora}${marca}</div>
      ${metar}${taf}
    </div>`;
}

// O conteúdo da faixa: as duas estações e, quando a última busca falhou, desde quando as mensagens estão sem
// atualização. Sem mensagens: "Meteorologia indisponível" (ou, na primeira busca, que ela está a caminho)
export function faixaDaMeteorologia({ indisponivel, dados, recebidoEm, falhou, buscando }, agora = Date.now()) {
  if (!dados) {
    const aviso = !indisponivel && buscando ? 'Buscando o METAR e o TAF…' : 'Meteorologia indisponível';
    return `<p class="meteo-aviso">${aviso}</p>`;
  }
  // A idade das mensagens: de quando a função as buscou no aviationweather.gov (sem essa hora, de quando chegaram aqui)
  const desde = dados.gerado !== null && dados.gerado <= agora ? dados.gerado : recebidoEm;
  const situacao = falhou
    ? `<span class="meteo-falha">Sem atualização desde ${horaLocal(desde)} (${idade(agora - desde)})</span>`
    : `<span class="meteo-atualizada">Atualizado às ${horaLocal(desde)}</span>`;
  return `<div class="meteo-topo"><span class="meteo-titulo">METAR e TAF</span>${situacao}</div>
    <div class="meteo-estacoes">${dados.estacoes.map(e => caixa(e, agora)).join('')}</div>`;
}

// A faixa inteira, para entrar no painel: uma região com nome (um div: as seções do app são as abas)
export const secaoDaMeteorologia = (estado, agora) =>
  `<div class="fids-meteo" role="region" aria-label="Meteorologia: METAR e TAF de Pampulha e Confins">${faixaDaMeteorologia(estado, agora)}</div>`;

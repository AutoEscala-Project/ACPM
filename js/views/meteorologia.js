// A faixa da meteorologia, embaixo do painel (a vista Painel da Escala, em tela cheia também, e a TV da recepção): duas
// caixas lado a lado, sempre as duas (sem alternar), "SBBH · Pampulha" e "SBCF · Confins", cada uma com o METAR e o TAF
// oficiais, em letra de máquina de escrever e quebrando a linha, e a hora em que os dados dela foram atualizados (a da
// observação do METAR, a local e a Z). No celular, uma caixa embaixo da outra. A faixa é uma região com nome, sem
// aria-live: a atualização a cada 10 minutos não é anunciada pelo leitor de tela.
import { esc, hm, minutoDoDia } from '../format.js';
import { linhasDoTaf } from '../meteorologia.js';

const horaLocal = ms => hm(minutoDoDia(new Date(ms)));
const horaZ = ms => `${new Date(ms).toISOString().slice(11, 16)}Z`;

// Uma estação: o nome, a hora da atualização (a da observação do METAR; sem METAR, nenhuma), o METAR e o TAF
function caixa(e) {
  const hora = e.metar === null || e.observado === null ? ''
    : `<span class="meteo-hora">Atualizado às ${horaLocal(e.observado)} (${horaZ(e.observado)})</span>`;
  const metar = e.metar === null ? '<p class="meteo-msg meteo-sem">Sem METAR</p>' : `<p class="meteo-msg meteo-metar">${esc(e.metar)}</p>`;
  const taf = e.taf === null ? '<p class="meteo-msg meteo-sem">Sem TAF em vigor</p>'
    : `<p class="meteo-msg meteo-taf">${linhasDoTaf(e.taf).map(esc).join('<br>')}</p>`;
  return `<div class="meteo-estacao" role="group" aria-labelledby="meteo-${e.icao}" data-icao="${e.icao}">
      <div class="meteo-cab"><h4 class="meteo-nome" id="meteo-${e.icao}">${e.icao} · ${esc(e.nome)}</h4>${hora}</div>
      ${metar}${taf}
    </div>`;
}

// O conteúdo da faixa: as duas estações, cada uma com a hora da atualização dela. Sem mensagens: "Meteorologia
// indisponível" (ou, na primeira busca, que ela está a caminho)
export function faixaDaMeteorologia({ indisponivel, dados, buscando }) {
  if (!dados) {
    const aviso = !indisponivel && buscando ? 'Buscando o METAR e o TAF…' : 'Meteorologia indisponível';
    return `<p class="meteo-aviso">${aviso}</p>`;
  }
  return `<div class="meteo-topo"><span class="meteo-titulo">METAR e TAF</span></div>
    <div class="meteo-estacoes">${dados.estacoes.map(caixa).join('')}</div>`;
}

// A faixa inteira, para entrar no painel: uma região com nome (um div: as seções do app são as abas)
export const secaoDaMeteorologia = estado =>
  `<div class="fids-meteo" role="region" aria-label="Meteorologia: METAR e TAF de Pampulha e Confins">${faixaDaMeteorologia(estado)}</div>`;

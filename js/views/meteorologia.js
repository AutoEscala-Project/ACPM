// A faixa da meteorologia, embaixo do painel (a vista Painel da Escala, em tela cheia também, e a TV da recepção): duas
// caixas lado a lado, sempre as duas (sem alternar), Pampulha e Confins (o código, SBBH e SBCF, vem nas mensagens e só o
// leitor de tela o ouve no nome), cada uma com o METAR e o TAF oficiais, em letra de máquina de escrever e quebrando a
// linha. A hora da observação já vem no METAR; "Atualizado às" só aparece quando os dados podem estar velhos (a última
// busca falhou, ou a observação passou de 90 minutos). No celular, uma caixa embaixo da outra. A faixa é uma região com
// nome, sem aria-live: a atualização a cada 10 minutos não é anunciada pelo leitor de tela.
import { esc, hm, minutoDoDia } from '../format.js';
import { linhasDoTaf } from '../meteorologia.js';

const horaLocal = ms => hm(minutoDoDia(new Date(ms)));
const horaZ = ms => `${new Date(ms).toISOString().slice(11, 16)}Z`;

// O METAR sai de hora em hora e chega ao painel em até uns 25 minutos (a publicação, os 5 minutos guardados na função e
// os 10 entre as buscas): com mais de 90 minutos, o da hora seguinte não veio
const VELHO_MS = 90 * 60000;

// O texto de uma mensagem: o tempo leve (-RA, -TSRA) não quebra a linha depois do sinal (o "RA" sozinho na linha seguinte
// seria chuva moderada)
const texto = mensagem => esc(mensagem).replace(/(^| )(-\S+)/g, '$1<span class="meteo-junto">$2</span>');

// Uma estação: o nome, o METAR e o TAF e, só quando os dados podem estar velhos (a última busca falhou, ou a observação
// passou de 90 minutos), a hora da atualização (a da observação do METAR, a local e a Z; sem METAR, nenhuma)
function caixa(e, falhou, agora) {
  const hora = e.metar === null || e.observado === null || !(falhou || agora - e.observado > VELHO_MS) ? ''
    : `<span class="meteo-hora">Atualizado às ${horaLocal(e.observado)} (${horaZ(e.observado)})</span>`;
  const metar = e.metar === null ? '<p class="meteo-msg meteo-sem">Sem METAR</p>' : `<p class="meteo-msg meteo-metar">${texto(e.metar)}</p>`;
  const taf = e.taf === null ? '<p class="meteo-msg meteo-sem">Sem TAF em vigor</p>'
    : `<p class="meteo-msg meteo-taf">${linhasDoTaf(e.taf).map(texto).join('<br>')}</p>`;
  return `<div class="meteo-estacao" role="group" aria-labelledby="meteo-${e.icao}" data-icao="${e.icao}">
      <div class="meteo-cab"><h4 class="meteo-nome" id="meteo-${e.icao}"><span class="sr">${e.icao} · </span>${esc(e.nome)}</h4>${hora}</div>
      ${metar}${taf}
    </div>`;
}

// O conteúdo da faixa: as duas estações. Sem mensagens: "Meteorologia indisponível" (ou, na primeira busca, que ela está a
// caminho). agora: o relógio (ms)
export function faixaDaMeteorologia({ indisponivel, dados, falhou, buscando }, agora = Date.now()) {
  if (!dados) {
    const aviso = !indisponivel && buscando ? 'Buscando o METAR e o TAF…' : 'Meteorologia indisponível';
    return `<p class="meteo-aviso">${aviso}</p>`;
  }
  return `<div class="meteo-estacoes">${dados.estacoes.map(e => caixa(e, falhou, agora)).join('')}</div>`;
}

// A faixa inteira, para entrar no painel: uma região com nome (um div: as seções do app são as abas)
export const secaoDaMeteorologia = estado =>
  `<div class="fids-meteo" role="region" aria-label="Meteorologia: METAR e TAF de Pampulha e Confins">${faixaDaMeteorologia(estado)}</div>`;

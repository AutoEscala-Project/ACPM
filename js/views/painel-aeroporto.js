// O painel do dia. O quadro de Missões mostra todos os voos do dia, na ordem do horário; no estilo dos aeroportos, como
// os painéis da INFRAERO, o quadro de Partidas (todas as do dia) e o de Chegadas (as que ainda não pousaram) se alternam
// página a página a cada 10 segundos, com o relógio e a página no canto. O quadro com que o painel abre e as colunas
// (quais e em que ordem) e as listas (uma, ou duas lado a lado na tela grande) vêm da configuração do painel
// (js/config-do-painel.js); o operador pode ver outro quadro na hora, pausar a troca e abrir em tela cheia (para um
// monitor ou TV). Só mostra: o status muda na Lista e no mapa. A TV da recepção (painel.html) usa o mesmo painel, na
// tela toda e sem os botões. Embaixo do quadro (das duas listas, quando são duas), a faixa da meteorologia
// (js/views/meteorologia.js): o METAR e o TAF de Pampulha e de Confins, as duas caixas sempre à vista; o quadro fica em
// .fids-quadro, e a faixa, em .fids-meteo, ao lado dele (trocar o quadro não refaz a faixa, nem o contrário).
import { hm, esc, hojeISO, rotuloDaData, minutoDoDia } from '../format.js';
import { quadroDeMissoes, quadroDePartidas, quadroDeChegadas, minutoDoQuadro, telasDosQuadros } from '../quadro.js';
import { QUADROS_DO_PAINEL, normalizarPainel, colunasVisiveis, rotuloDaColuna, quadroValido, listasNaLargura } from '../config-do-painel.js';
import { estadoDaMeteorologia, pedirMeteorologia, aoMudarMeteorologia } from '../meteorologia.js';
import { faixaDaMeteorologia, secaoDaMeteorologia } from './meteorologia.js';

const TROCA_MS = 10000;
const POR_PAGINA = 12;
const QUADROS = {
  missoes: { titulo: 'Missões', icone: 'i-aviao', vazio: 'Nenhuma missão' },
  partidas: { titulo: 'Partidas', icone: 'i-decolagem', vazio: 'Nenhuma partida' },
  chegadas: { titulo: 'Chegadas', icone: 'i-pouso', vazio: 'Nenhuma chegada pendente' }
};

// modo: o quadro escolhido nos botões ('missoes', 'alternar' ou um quadro só); null segue a configuração do painel.
// tela: a posição na sequência; fonte: de onde vêm as linhas (e a configuração); seletor: onde está o painel; inteiro: na
// tela toda (a TV), com as linhas que couberem
const estado = { modo: null, tela: 0, telas: 0, pausado: false, fonte: null, relogio: null, ultimaTroca: 0, minuto: null, chave: null, seletor: '#out .fids', inteiro: false };

const MODELOS = { 'Sim. Mono': 'SIM MONO', 'Sim. Multi': 'SIM MULTI' };
const classeDoModelo = modelo => modelo.replace(/[^A-Za-z0-9]/g, '');

// Cada coluna: a classe da célula (a cor e o alinhamento vêm dela) e o conteúdo
const CELULAS = {
  horario: { classe: 'f-hora', html: l => hm(l.horario) },
  aeronave: { classe: 'f-aeronave', html: l => esc(l.aeronave) },
  modelo: { classe: 'f-modelo', html: l => `<span class="fids-cia fids-cia-${classeDoModelo(l.modelo)}">${esc(MODELOS[l.modelo] || l.modelo)}</span>` },
  aluno: { classe: 'f-aluno', html: l => esc(l.aluno) },
  instrutor: { classe: 'f-instr', html: l => esc(l.instrutor) },
  missao: { classe: 'f-missao', html: l => esc(l.missao) },
  previsto: { classe: 'f-prev', html: l => (l.previsto === null ? '' : hm(l.previsto)) },
  observacao: { classe: 'f-obs', html: l => esc(l.observacao) }
};

const linhaHtml = (l, colunas) => `<tr class="fids-${l.classe}">${colunas.map(id => `<td class="${CELULAS[id].classe}">${CELULAS[id].html(l)}</td>`).join('')}</tr>`;
const cabecalhoHtml = colunas => `<tr>${colunas.map(id => `<th scope="col">${rotuloDaColuna(id)}</th>`).join('')}</tr>`;

// A configuração do painel que a fonte entrega (sem ela, o padrão)
const configuracao = () => normalizarPainel(estado.fonte && estado.fonte().painel);
const modoAtual = () => (estado.modo && quadroValido(estado.modo) ? estado.modo : configuracao().quadro);

// Um tamanho do CSS em px. A variável do CSS vem como foi escrita: na tela toda, em vh ou vw (parseFloat sozinho leria
// 5.4 px, e a página teria dez vezes as linhas que cabem: as de baixo ficariam fora da tela, sem nunca aparecer)
const emPixels = valor => parseFloat(valor) * (/vh\s*$/.test(valor) ? innerHeight / 100 : /vw\s*$/.test(valor) ? innerWidth / 100 : 1);

// O quadro na tela toda (a tela cheia da Escala ou a TV), ou null
const telaCheia = () => (document.fullscreenElement && document.fullscreenElement.classList.contains('fids') ? document.fullscreenElement : null);
const naTelaToda = () => telaCheia() || (estado.inteiro && document.querySelector(estado.seletor)) || null;

// Quantas linhas cabem em cada lista: na página, 12; em tela cheia, as que couberem na altura da tela, tirados o topo, o
// cabeçalho da tabela e a faixa da meteorologia, que fica embaixo das duas listas (as linhas que não cabem vão para a
// página seguinte). Antes do primeiro desenho (sem o topo e o cabeçalho para medir), as linhas de 80% da tela.
// O topo e o cabeçalho são medidos com as letras inteiras, sem o ajuste da largura: o ajuste é o da página que está na
// tela, e a página seguinte pode não precisar dele (as letras voltam a crescer, o topo e o cabeçalho também, e a última
// linha de cada lista ficaria atrás da faixa). Assim cada lista tem as mesmas linhas em todas as páginas
const FOLGA = 4;
function porLista() {
  const quadro = naTelaToda();
  if (!quadro) return POR_PAGINA;
  const linha = emPixels(getComputedStyle(quadro).getPropertyValue('--fids-linha')) || 48;
  const altura = seletor => { const el = quadro.querySelector(seletor); return el ? el.offsetHeight : 0; };
  const ajuste = quadro.style.getPropertyValue('--fids-ajuste');
  if (ajuste) quadro.style.removeProperty('--fids-ajuste');
  const topo = altura('.fids-topo') + altura('.fids-tabela thead');
  if (ajuste) quadro.style.setProperty('--fids-ajuste', ajuste);
  const livre = topo ? innerHeight - topo - FOLGA : innerHeight * 0.8;
  return Math.max(4, Math.floor((livre - altura('.fids-meteo')) / linha));
}

// A largura do quadro (px CSS). Antes de a Escala desenhar o painel, a da área da escala, que ele ocupa inteira
function larguraDoQuadro() {
  const quadro = telaCheia() || document.querySelector(estado.seletor);
  const largura = quadro ? quadro.getBoundingClientRect().width : 0;
  if (largura) return largura;
  const area = document.querySelector('#out');
  if (!area) return innerWidth;
  const estilo = getComputedStyle(area);
  return area.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
}

// O preenchimento das células (10 px de cada lado), que não diminui com as letras
const PREENCHIMENTO = 20;

// No Automático, as duas listas valem só quando cabem: uma tabela com todas as linhas do quadro (de todas as páginas, para
// as listas não irem e voltarem a cada página), fora da vista e nas letras do painel sem o ajuste, diz a largura de que
// elas precisam; na tela toda, as letras podem diminuir até o mínimo (AJUSTE_MINIMO), e na página, não
function duasListasCabem(colunas, todas, largura) {
  const telaToda = Boolean(naTelaToda());
  const medida = document.createElement('div');
  medida.className = `fids fids-medida${telaToda ? ' inteiro' : ''}`;
  medida.setAttribute('aria-hidden', 'true');
  medida.innerHTML = `<table class="fids-tabela"><thead>${cabecalhoHtml(colunas)}</thead><tbody>${todas.map(l => linhaHtml(l, colunas)).join('')}</tbody></table>`;
  document.body.append(medida);
  const precisa = medida.firstElementChild.getBoundingClientRect().width;
  const vao = emPixels(getComputedStyle(medida).getPropertyValue('--fids-vao')) || 0;
  medida.remove();
  const preenchimento = PREENCHIMENTO * colunas.length;
  const cabe = (largura - vao) / 2 - preenchimento;
  return cabe >= (precisa - preenchimento) * (telaToda ? AJUSTE_MINIMO : 1);
}

function telasAgora() {
  const { linhas, data } = estado.fonte();
  const agora = new Date();
  const minuto = minutoDoQuadro(data, hojeISO(), minutoDoDia(agora));
  const modo = modoAtual();
  const quadros = modo === 'missoes' ? [['missoes', quadroDeMissoes(linhas, minuto)]]
    : [['partidas', quadroDePartidas], ['chegadas', quadroDeChegadas]].filter(([quadro]) => modo === 'alternar' || modo === quadro)
      .map(([quadro, montar]) => [quadro, montar(linhas, minuto)]);
  const painel = configuracao();
  const colunas = colunasVisiveis(painel);
  const largura = larguraDoQuadro();
  let listas = listasNaLargura(painel, largura);
  if (listas === 2 && painel.listas === 'auto' && !duasListasCabem(colunas, quadros.flatMap(([, lista]) => lista), largura)) listas = 1;
  const linhasPorLista = porLista();
  return { telas: telasDosQuadros(quadros, linhasPorLista, listas), colunas, linhasPorLista };
}

// Uma lista da página: as linhas e as vazias que a completam (o quadro tem sempre a mesma altura, como no aeroporto). A
// primeira diz quando não há nada; a segunda, sem nada, fica fora do leitor de tela
function listaHtml(tela, n, { titulo, vazio, colunas, linhasPorLista }) {
  const itens = tela.listas[n];
  const duas = tela.listas.length > 1;
  const nada = !itens.length && n === 0;
  const corpo = nada ? `<tr class="fids-nada"><td colspan="${colunas.length}">${vazio}</td></tr>` : itens.map(l => linhaHtml(l, colunas)).join('');
  const vazias = `<tr class="fids-vazia" aria-hidden="true"><td colspan="${colunas.length}">&nbsp;</td></tr>`.repeat(Math.max(0, linhasPorLista - (nada ? 1 : itens.length)));
  const legenda = `${titulo}${tela.paginas > 1 ? `, página ${tela.pagina} de ${tela.paginas}` : ''}${duas ? `, lista ${n + 1} de ${tela.listas.length}` : ''}`;
  return `<div class="fids-lista"${duas && n > 0 && !itens.length ? ' aria-hidden="true"' : ''}><table class="fids-tabela">
      <caption class="sr">${legenda}</caption>
      <thead>${cabecalhoHtml(colunas)}</thead>
      <tbody>${corpo}${vazias}</tbody>
    </table></div>`;
}

function quadroHtml() {
  const { telas, colunas, linhasPorLista } = telasAgora();
  estado.telas = telas.length;
  estado.tela = estado.tela % telas.length;
  const tela = telas[estado.tela];
  const { titulo, icone } = QUADROS[tela.quadro];
  const { data, semEscala = false, aviso = null } = estado.fonte();
  const vazio = semEscala ? 'A escala de hoje ainda não foi publicada.' : QUADROS[tela.quadro].vazio;
  const hoje = hojeISO();
  const agora = new Date();
  const listas = tela.listas.map((_, n) => listaHtml(tela, n, { titulo, vazio, colunas, linhasPorLista })).join('');
  return `<div class="fids-topo">
      <img class="fids-logo" src="img/acpm-aguia.png" alt="ACPM">
      <div class="fids-nome"><h3 class="fids-titulo">${titulo}</h3>${data === hoje ? '' : `<small class="fids-data">${esc(rotuloDaData(data, hoje).dia)}</small>`}</div>
      <svg class="fids-aviao" aria-hidden="true"><use href="#${icone}"/></svg>
      <div class="fids-relogio"><b class="fids-hora">${hm(minutoDoDia(agora))}</b><small>página ${tela.pagina}/${tela.paginas}</small>${aviso === null ? '' : `<small class="fids-aviso">${esc(aviso)}</small>`}</div>
    </div>
    <div class="fids-listas${tela.listas.length > 1 ? ' duas' : ''}">${listas}</div>`;
}

// O que o quadro mostra, sem a hora: um quadro igual ao que está na tela não é trocado (a hora muda à parte)
const semHora = html => html.replace(/<b class="fids-hora">[^<]*<\/b>/, '');
function quadroNovo() {
  const html = quadroHtml();
  estado.chave = semHora(html);
  return html;
}

const botaoDoModo = (modo, rotulo, atual) => `<button type="button" data-fids="${modo}" aria-pressed="${atual === modo}"${atual === modo ? ' class="on"' : ''}>${rotulo}</button>`;

// O painel da Escala: os botões (Missões, os dois quadros do aeroporto ou um só; pausar, tela cheia e a configuração do
// painel) e o quadro. dica: o botão "?" ao lado dos quadros (as dicas são do app: a TV não as carrega)
export function painelDaEscala(fonte, dica = '') {
  estado.fonte = fonte;
  estado.seletor = '#out .fids';
  estado.inteiro = false;
  ligarRelogio();
  pedirMeteorologia();
  const atual = modoAtual();
  return `<div class="fids-controles">
      <div class="seg" role="group" aria-label="Quadros do painel">
        ${QUADROS_DO_PAINEL.map(q => botaoDoModo(q.id, q.rotulo, atual)).join('')}
      </div>${dica}
      <button type="button" class="btn sec" data-fids="pausar" aria-pressed="${estado.pausado}"><svg class="ico" aria-hidden="true"><use href="#i-ok"/></svg>Pausar</button>
      <button type="button" class="btn sec" data-fids="tela-cheia">Tela cheia</button>
      <button type="button" class="btn sec" data-fids="configurar" aria-haspopup="dialog">Configurar painel</button>
    </div>
    <div class="fids${estado.pausado ? ' pausado' : ''}" role="region" aria-label="Painel do dia"><div class="fids-quadro">${quadroNovo()}</div>${secaoDaMeteorologia(estadoDaMeteorologia())}</div>`;
}

// A configuração mudou o quadro com que o painel abre: o painel passa a mostrar esse quadro (o escolhido nos botões
// antes dela deixa de valer)
export function seguirConfiguracaoDoPainel() {
  estado.modo = null;
  estado.tela = 0;
  estado.ultimaTroca = Date.now();
}

function redesenhar() {
  const quadro = document.querySelector(`${estado.seletor} > .fids-quadro`);
  if (!quadro || !estado.fonte) return;
  const html = quadroHtml();
  if (semHora(html) === estado.chave) {
    atualizarRelogio();
    return;
  }
  estado.chave = semHora(html);
  quadro.innerHTML = html;
  caberNaLargura();
}

// Na tela toda, o quadro cabe na largura: com muitas colunas e textos longos (um nome comprido, o embarque), as letras
// diminuem até cada lista caber (até 60%, o mínimo também com duas listas), em vez de as colunas da direita ficarem
// cortadas fora da tela. O preenchimento das células não diminui com as letras
const AJUSTE_MINIMO = 0.6;
function caberNaLargura() {
  const quadro = document.querySelector(estado.seletor);
  if (!quadro) return;
  quadro.style.removeProperty('--fids-ajuste');
  if (!estado.inteiro && document.fullscreenElement !== quadro) return;
  let ajuste = 1;
  for (const tabela of quadro.querySelectorAll('.fids-tabela')) {
    const largura = tabela.scrollWidth, lugar = tabela.parentElement.clientWidth;
    if (largura <= lugar) continue;
    const preenchimento = PREENCHIMENTO * (tabela.rows[0] ? tabela.rows[0].cells.length : 0);
    ajuste = Math.min(ajuste, (lugar - preenchimento) / (largura - preenchimento));
  }
  if (ajuste < 1) quadro.style.setProperty('--fids-ajuste', String(Math.max(AJUSTE_MINIMO, Math.floor(ajuste * 100) / 100)));
}

// A TV da recepção: o painel na tela toda, sem os botões, no quadro e com as colunas da configuração do painel.
// atualizarPainel redesenha na hora (dados novos)
export function painelNaTela(elemento, fonte) {
  estado.fonte = fonte;
  estado.seletor = `#${elemento.id}`;
  estado.inteiro = true;
  elemento.classList.add('fids', 'inteiro');
  elemento.setAttribute('role', 'region');
  elemento.setAttribute('aria-label', 'Painel do dia');
  // A faixa entra antes do quadro: as linhas da página contam com a altura dela
  pedirMeteorologia();
  elemento.innerHTML = `<div class="fids-quadro"></div>${secaoDaMeteorologia(estadoDaMeteorologia())}`;
  const quadro = elemento.querySelector('.fids-quadro');
  quadro.innerHTML = quadroNovo();
  caberNaLargura();
  // Com o topo e o cabeçalho na tela, as linhas da página saem da altura medida
  redesenhar();
  ligarRelogio();
}
export const atualizarPainel = redesenhar;

// A faixa da meteorologia com o que há agora (mensagens novas, a busca a caminho): só é trocada quando muda.
// Quando a altura dela muda, na tela toda, a página passa a ter outras tantas linhas
const faixasEscritas = new WeakMap();
function atualizarFaixa() {
  const faixa = document.querySelector(`${estado.seletor} > .fids-meteo`);
  if (!faixa) return;
  const html = faixaDaMeteorologia(estadoDaMeteorologia());
  if (faixasEscritas.get(faixa) === html) return;
  const altura = faixa.offsetHeight;
  faixa.innerHTML = html;
  faixasEscritas.set(faixa, html);
  if (faixa.offsetHeight !== altura) redesenhar();
}
aoMudarMeteorologia(atualizarFaixa);

function atualizarRelogio() {
  const relogio = document.querySelector(`${estado.seletor} .fids-hora`);
  const hora = hm(minutoDoDia());
  if (relogio && relogio.textContent !== hora) relogio.textContent = hora;
}

// O relógio do painel, a cada segundo. O quadro é conferido na troca de página (a cada 10 segundos, fora da pausa e só
// quando há outra página) e na virada do minuto, pausado ou não (as chegadas e o embarque dependem da hora), e só é
// trocado se o que ele mostra mudou: refazê-lo sem mudança reiniciaria a animação do embarque e tiraria o leitor de
// tela do lugar. Para sozinho quando o painel sai da tela
function ligarRelogio() {
  if (estado.relogio) return;
  estado.ultimaTroca = Date.now();
  estado.minuto = minutoDoDia();
  estado.relogio = setInterval(() => {
    if (!document.querySelector(estado.seletor) || !estado.fonte) {
      clearInterval(estado.relogio);
      estado.relogio = null;
      return;
    }
    const trocar = !estado.pausado && estado.telas > 1 && Date.now() - estado.ultimaTroca >= TROCA_MS;
    // Com uma página só, o tempo da página recomeça: quando o quadro passa a ter duas, a primeira fica os 10 s inteiros
    if (trocar || estado.telas <= 1) estado.ultimaTroca = Date.now();
    if (trocar) estado.tela += 1;
    const minuto = minutoDoDia();
    // A cada 10 minutos, as mensagens novas (pedirMeteorologia, conferida a cada minuto, conta o tempo; a faixa muda
    // quando a busca termina)
    if (minuto !== estado.minuto) pedirMeteorologia();
    if (trocar || minuto !== estado.minuto) {
      estado.minuto = minuto;
      redesenhar();
    }
  }, 1000);
}

// Os botões do painel: o quadro (Missões, os dois do aeroporto ou um só), pausar e tela cheia
export function acaoDoPainel(acao) {
  if (acao === 'pausar') {
    estado.pausado = !estado.pausado;
    estado.ultimaTroca = Date.now();
    // Um botão de alternar: o nome fica, e o estado vai no aria-pressed (o leitor de tela anuncia "pressionado")
    document.querySelector('#out [data-fids="pausar"]').setAttribute('aria-pressed', String(estado.pausado));
    // Na pausa, o pisca do embarque também para (WCAG 2.2.2)
    const quadro = document.querySelector('#out .fids');
    if (quadro) quadro.classList.toggle('pausado', estado.pausado);
    return;
  }
  if (acao === 'tela-cheia') {
    const quadro = document.querySelector('#out .fids');
    if (quadro && quadro.requestFullscreen) quadro.requestFullscreen().then(redesenhar, () => {});
    return;
  }
  if (!quadroValido(acao)) return;
  estado.modo = acao;
  estado.tela = 0;
  estado.ultimaTroca = Date.now();
  document.querySelectorAll('#out [data-fids]').forEach(b => {
    if (!quadroValido(b.dataset.fids)) return;
    const ativo = b.dataset.fids === acao;
    b.setAttribute('aria-pressed', String(ativo));
    b.classList.toggle('on', ativo);
  });
  redesenhar();
}

// Ao entrar e sair da tela cheia e quando a janela muda de tamanho, o número de linhas por página, as listas (uma ou duas)
// e o tamanho das letras mudam (as linhas que cabem acima da faixa da meteorologia não dependem do ajuste das letras:
// porLista mede o topo e o cabeçalho sem ele)
const refazerNoTamanhoNovo = () => {
  redesenhar();
  caberNaLargura();
};
document.addEventListener('fullscreenchange', refazerNoTamanhoNovo);
let esperaDoTamanho = null;
addEventListener('resize', () => {
  clearTimeout(esperaDoTamanho);
  esperaDoTamanho = setTimeout(refazerNoTamanhoNovo, 150);
});

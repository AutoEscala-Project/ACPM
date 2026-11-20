// O painel do dia. O quadro de Missões mostra todos os voos do dia, na ordem do horário; no estilo dos aeroportos, como
// os painéis da INFRAERO, o quadro de Partidas (todas as do dia) e o de Chegadas (as que ainda não pousaram) se alternam
// página a página a cada 10 segundos, com o relógio e a página no canto. O quadro com que o painel abre e as colunas
// (quais e em que ordem) vêm da configuração do painel (js/config-do-painel.js); o operador pode ver outro quadro na
// hora, pausar a troca e abrir em tela cheia (para um monitor ou TV). Só mostra: o status muda na Lista e no mapa. A TV
// da recepção (painel.html) usa o mesmo painel, na tela toda e sem os botões.
import { hm, esc, hojeISO, rotuloDaData, minutoDoDia } from '../format.js';
import { quadroDeMissoes, quadroDePartidas, quadroDeChegadas, minutoDoQuadro, telasDosQuadros } from '../quadro.js';
import { QUADROS_DO_PAINEL, normalizarPainel, colunasVisiveis, rotuloDaColuna, quadroValido } from '../config-do-painel.js';

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

// A configuração do painel que a fonte entrega (sem ela, o padrão)
const configuracao = () => normalizarPainel(estado.fonte && estado.fonte().painel);
const modoAtual = () => (estado.modo && quadroValido(estado.modo) ? estado.modo : configuracao().quadro);

// A altura da linha em px. A variável do CSS vem como foi escrita: na tela toda, em vh (parseFloat sozinho leria 5.4 px, e
// a página teria dez vezes as linhas que cabem: as de baixo ficariam fora da tela, sem nunca aparecer)
const emPixels = valor => parseFloat(valor) * (/vh\s*$/.test(valor) ? innerHeight / 100 : 1);

// Quantas linhas cabem: na página, 12; em tela cheia, as que couberem na altura da tela
function porPagina() {
  const cheia = document.fullscreenElement && document.fullscreenElement.classList.contains('fids') ? document.fullscreenElement : null;
  const quadro = cheia || (estado.inteiro && document.querySelector(estado.seletor));
  if (!quadro) return POR_PAGINA;
  const linha = emPixels(getComputedStyle(quadro).getPropertyValue('--fids-linha')) || 48;
  return Math.max(8, Math.floor((innerHeight * 0.8) / linha));
}

function telasAgora() {
  const { linhas, data } = estado.fonte();
  const agora = new Date();
  const minuto = minutoDoQuadro(data, hojeISO(), minutoDoDia(agora));
  const modo = modoAtual();
  const quadros = modo === 'missoes' ? [['missoes', quadroDeMissoes(linhas)]]
    : [['partidas', quadroDePartidas], ['chegadas', quadroDeChegadas]].filter(([quadro]) => modo === 'alternar' || modo === quadro)
      .map(([quadro, montar]) => [quadro, montar(linhas, minuto)]);
  return telasDosQuadros(quadros, porPagina());
}

function quadroHtml() {
  const telas = telasAgora();
  estado.telas = telas.length;
  estado.tela = estado.tela % telas.length;
  const tela = telas[estado.tela];
  const { titulo, icone } = QUADROS[tela.quadro];
  const { data, semEscala = false, aviso = null } = estado.fonte();
  const vazio = semEscala ? 'A escala de hoje ainda não foi publicada.' : QUADROS[tela.quadro].vazio;
  const hoje = hojeISO();
  const agora = new Date();
  const colunas = colunasVisiveis(configuracao());
  const linhas = tela.linhas.length
    ? tela.linhas.map(l => linhaHtml(l, colunas)).join('')
    : `<tr class="fids-nada"><td colspan="${colunas.length}">${vazio}</td></tr>`;
  // Linhas vazias completam a página: o quadro tem sempre a mesma altura, como no aeroporto
  const vazias = `<tr class="fids-vazia" aria-hidden="true"><td colspan="${colunas.length}">&nbsp;</td></tr>`.repeat(Math.max(0, porPagina() - Math.max(1, tela.linhas.length)));
  return `<div class="fids-topo">
      <img class="fids-logo" src="img/acpm-aguia.png" alt="ACPM">
      <div class="fids-nome"><h3 class="fids-titulo">${titulo}</h3>${data === hoje ? '' : `<small class="fids-data">${esc(rotuloDaData(data, hoje).dia)}</small>`}</div>
      <svg class="fids-aviao" aria-hidden="true"><use href="#${icone}"/></svg>
      <div class="fids-relogio"><b class="fids-hora">${hm(minutoDoDia(agora))}</b><small>página ${tela.pagina}/${tela.paginas}</small>${aviso === null ? '' : `<small class="fids-aviso">${esc(aviso)}</small>`}</div>
    </div>
    <table class="fids-tabela">
      <caption class="sr">${titulo}${tela.paginas > 1 ? `, página ${tela.pagina} de ${tela.paginas}` : ''}</caption>
      <thead><tr>${colunas.map(id => `<th scope="col">${rotuloDaColuna(id)}</th>`).join('')}</tr></thead>
      <tbody>${linhas}${vazias}</tbody>
    </table>`;
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
  const atual = modoAtual();
  return `<div class="fids-controles">
      <div class="seg" role="group" aria-label="Quadros do painel">
        ${QUADROS_DO_PAINEL.map(q => botaoDoModo(q.id, q.rotulo, atual)).join('')}
      </div>${dica}
      <button type="button" class="btn sec" data-fids="pausar" aria-pressed="${estado.pausado}"><svg class="ico" aria-hidden="true"><use href="#i-ok"/></svg>Pausar</button>
      <button type="button" class="btn sec" data-fids="tela-cheia">Tela cheia</button>
      <button type="button" class="btn sec" data-fids="configurar" aria-haspopup="dialog">Configurar painel</button>
    </div>
    <div class="fids${estado.pausado ? ' pausado' : ''}" role="region" aria-label="Painel do dia">${quadroNovo()}</div>`;
}

// A configuração mudou o quadro com que o painel abre: o painel passa a mostrar esse quadro (o escolhido nos botões
// antes dela deixa de valer)
export function seguirConfiguracaoDoPainel() {
  estado.modo = null;
  estado.tela = 0;
  estado.ultimaTroca = Date.now();
}

function redesenhar() {
  const quadro = document.querySelector(estado.seletor);
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
// diminuem até a tabela caber (até 60%), em vez de as colunas da direita ficarem cortadas fora da tela. O preenchimento
// das células (10 px de cada lado) não diminui com as letras
const AJUSTE_MINIMO = 0.6;
function caberNaLargura() {
  const quadro = document.querySelector(estado.seletor);
  if (!quadro) return;
  quadro.style.removeProperty('--fids-ajuste');
  const tabela = quadro.querySelector('.fids-tabela');
  if (!tabela || (!estado.inteiro && document.fullscreenElement !== quadro)) return;
  const largura = tabela.scrollWidth;
  if (largura <= quadro.clientWidth) return;
  const preenchimento = 20 * (tabela.rows[0] ? tabela.rows[0].cells.length : 0);
  const ajuste = (quadro.clientWidth - preenchimento) / (largura - preenchimento);
  quadro.style.setProperty('--fids-ajuste', String(Math.max(AJUSTE_MINIMO, Math.floor(ajuste * 100) / 100)));
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
  elemento.innerHTML = quadroNovo();
  caberNaLargura();
  ligarRelogio();
}
export const atualizarPainel = redesenhar;

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

// Ao entrar e sair da tela cheia, o número de linhas por página e o tamanho das letras mudam
document.addEventListener('fullscreenchange', () => {
  redesenhar();
  caberNaLargura();
});

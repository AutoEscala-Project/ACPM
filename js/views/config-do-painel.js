// "Configurar painel" (o botão ao lado dos quadros do Painel, na Escala): o quadro com que o painel abre (e a TV da
// recepção mostra) e as colunas, cada uma ligada ou não e na ordem escolhida (↑ e ↓, pelo teclado também). Cada mudança
// vale na hora: vai para o cadastro (js/config-do-painel.js) e para o Histórico, por gravarAlteracao. O Operador e o
// Administrador mudam; quem só consulta vê a configuração, com os campos desligados. Fechar e Esc fecham; o foco volta
// para o botão que abriu.
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { $ } from '../dom.js';
import { esc } from '../format.js';
import { S, isGestor } from '../state.js';
import {
  QUADROS_DO_PAINEL, COLUNAS_DO_PAINEL, normalizarPainel, painelPadrao, ehPadrao, alternarColuna, moverColuna, escolherQuadro,
  rotuloDaColuna, rotuloDoQuadro
} from '../config-do-painel.js';
import { seguirConfiguracaoDoPainel } from './painel-aeroporto.js';

const PADRAO = painelPadrao();
const PADRAO_EM_TEXTO = `${rotuloDoQuadro(PADRAO.quadro)}; ${PADRAO.colunas.filter(c => c.on).map(c => rotuloDaColuna(c.id)).join(', ')}`;

const podeMudar = () => !isGestor();

function camposHtml() {
  const painel = normalizarPainel(S.painel);
  const desligado = podeMudar() ? '' : ' disabled';
  const ultima = painel.colunas.length - 1;
  const quadros = QUADROS_DO_PAINEL.map(q => `<label class="chk"><input type="radio" name="pn-quadro" value="${q.id}"${q.id === painel.quadro ? ' checked' : ''}${desligado}> ${esc(q.rotulo)}</label>`).join('');
  const colunas = painel.colunas.map((c, i) => {
    const rotulo = esc(rotuloDaColuna(c.id));
    const mover = (passo, icone, verbo, naPonta) => `<button type="button" class="btn sec pn-mover" data-pn-mover="${passo}" data-pn-coluna="${c.id}" aria-label="${verbo} ${rotulo}"${naPonta || !podeMudar() ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#${icone}"/></svg></button>`;
    return `<li class="pn-coluna${c.on ? '' : ' desligada'}">
        <label class="chk"><input type="checkbox" data-pn-coluna="${c.id}"${c.on ? ' checked' : ''}${desligado}> ${rotulo}</label>
        ${mover(-1, 'i-cima', 'Subir', i === 0)}${mover(1, 'i-baixo', 'Descer', i === ultima)}
      </li>`;
  }).join('');
  return `<fieldset class="pn-grupo">
      <legend>O painel abre em</legend>
      ${quadros}
    </fieldset>
    <fieldset class="pn-grupo">
      <legend>Colunas, na ordem do painel</legend>
      <ol class="pn-colunas">${colunas}</ol>
    </fieldset>`;
}

// Desenha os campos e devolve o foco ao equivalente (o mesmo campo; o botão de mover que ficou desligado na ponta passa
// o foco para o outro da mesma coluna)
function desenhar(foco = null) {
  $('#dlg-painel-campos').innerHTML = camposHtml();
  $('#pn-padrao').disabled = !podeMudar() || ehPadrao(S.painel);
  if (!foco) return;
  const alvo = $(`#dlg-painel-campos ${foco}`);
  if (alvo && !alvo.disabled) { alvo.focus(); return; }
  const coluna = /data-pn-coluna="([a-z]+)"/.exec(foco);
  const outro = coluna && $(`#dlg-painel-campos .pn-mover[data-pn-coluna="${coluna[1]}"]:not(:disabled)`);
  (outro || $('#dlg-painel-campos input:not(:disabled)') || $('#pn-fechar')).focus();
}

const anunciarNoDialogo = texto => {
  const lugar = $('#pn-anuncio');
  lugar.textContent = '';
  requestAnimationFrame(() => { lugar.textContent = texto; });
};

// Grava a configuração nova (o painel redesenha com a escala) e registra no Histórico
function mudar(novo, descricao, { quadro = false } = {}) {
  if (ehPadrao(novo)) delete S.painel;
  else S.painel = novo;
  if (quadro) seguirConfiguracaoDoPainel();
  $('#pn-erro').textContent = '';
  gravarAlteracao('mod', `Painel: ${descricao}`);
}

function ligar() {
  const dlg = $('#dlg-painel');
  if (dlg.dataset.ligado) return;
  dlg.dataset.ligado = '1';
  dlg.addEventListener('change', e => {
    const campo = e.target;
    if (!podeMudar() || aindaNaoAbriu()) { desenhar(); return; }
    if (campo.name === 'pn-quadro') {
      const antes = normalizarPainel(S.painel).quadro;
      const novo = escolherQuadro(S.painel, campo.value);
      if (!novo || novo.quadro === antes) return;
      mudar(novo, `abre em ${rotuloDoQuadro(novo.quadro)} (antes: ${rotuloDoQuadro(antes)})`, { quadro: true });
      desenhar(`input[name="pn-quadro"][value="${novo.quadro}"]`);
      return;
    }
    const id = campo.dataset.pnColuna;
    if (!id) return;
    const novo = alternarColuna(S.painel, id, campo.checked);
    if (!novo) {
      campo.checked = true;
      $('#pn-erro').textContent = 'Pelo menos uma coluna fica no painel.';
      return;
    }
    mudar(novo, `coluna ${rotuloDaColuna(id)} ${campo.checked ? 'ligada' : 'desligada'}`);
    desenhar(`input[data-pn-coluna="${id}"]`);
  });
  dlg.addEventListener('click', e => {
    const botao = e.target.closest('[data-pn-mover]');
    if (botao) {
      if (!podeMudar() || aindaNaoAbriu()) return;
      const id = botao.dataset.pnColuna, passo = +botao.dataset.pnMover;
      const novo = moverColuna(S.painel, id, passo);
      if (!novo) return;
      const posicao = novo.colunas.findIndex(c => c.id === id) + 1;
      mudar(novo, `coluna ${rotuloDaColuna(id)} na ${posicao}ª posição`);
      desenhar(`.pn-mover[data-pn-coluna="${id}"][data-pn-mover="${passo}"]`);
      anunciarNoDialogo(`${rotuloDaColuna(id)}: posição ${posicao} de ${COLUNAS_DO_PAINEL.length}`);
      return;
    }
    if (e.target.closest('#pn-padrao')) {
      if (!podeMudar() || aindaNaoAbriu() || ehPadrao(S.painel)) return;
      const quadroMudou = normalizarPainel(S.painel).quadro !== PADRAO.quadro;
      mudar(painelPadrao(), `de volta ao padrão (${PADRAO_EM_TEXTO})`, { quadro: quadroMudou });
      desenhar();
      $('#pn-fechar').focus();
      anunciarNoDialogo('O painel voltou ao padrão.');
      return;
    }
    if (e.target.closest('#pn-fechar')) dlg.close();
  });
  // O botão que abriu foi redesenhado com o painel (a cada mudança): o foco vai para o equivalente
  dlg.addEventListener('close', () => {
    const botao = $('#out [data-fids="configurar"]');
    if (botao) botao.focus();
  });
}

export function abrirConfigDoPainel() {
  ligar();
  const dlg = $('#dlg-painel');
  $('#dlg-painel-nota').textContent = podeMudar()
    ? 'Vale para o painel de todos e para a TV da recepção. Cada mudança vale na hora e fica no Histórico.'
    : 'Só o Operador e o Administrador mudam o painel.';
  $('#pn-erro').textContent = '';
  desenhar();
  dlg.showModal();
  (dlg.querySelector('input[name="pn-quadro"]:checked:not(:disabled)') || $('#pn-fechar')).focus();
}

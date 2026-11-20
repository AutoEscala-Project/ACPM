// O filtro de vários valores, sem biblioteca: um botão que abre e fecha um painel com as opções em caixas de seleção
// (em grupos, cada um com a sua legenda), a frase da regra ("Mostra quem tem todas as marcadas") e "Limpar". O botão
// diz o que está marcado ("Habilitações: Noturno + C172"; sem nenhuma, "Todas as habilitações"). A regra é de cada uso
// (js/filtro-multiplo.js): "todas" nas habilitações de Instrutores (js/views/cadastros.js), "alguma" num valor só por
// linha (o curso do aluno, em Alunos e na Demanda: js/views/filtro-dos-cursos.js; a categoria).
// - O painel fica no fluxo da página, na linha de baixo da barra: ele empurra a tabela em vez de cobri-la, e no celular
//   não sai da tela. No HTML, ele vem logo depois do botão (o Tab e o leitor de tela passam do botão para as caixas).
// - Quem só consulta (o Gestor, a Secretaria) usa o filtro como o Operador: as caixas têm a classe flt-ctrl (js/somente-
//   leitura.js não as desliga), e nada no filtro tem data-act (js/eventos/registro.js não deixaria passar o clique),
//   data-f ou data-a (a mudança seria tratada como uma alteração dos dados).
// - As marcas ficam aqui, e não só nas caixas: elas valem de novo quando as opções são refeitas (desenhar, quando a frota
//   muda), e a marcada que sumiu das opções sai do filtro. As caixas refeitas guardam o foco de quem usa o teclado
//   (trocarConteudo: cada uma é achada pelo filtro e pelo valor, data-filtro e data-valor, js/dom.js). Dois filtros podem
//   dividir as mesmas marcas (o dos cursos, em Alunos e na Demanda: js/views/filtro-dos-cursos.js).
// - O Esc com o foco no filtro (ou em lugar nenhum, sem gaveta aberta) fecha o painel e leva o foco ao botão: ouvido na
//   captura, ele para ali, e as gavetas abertas continuam abertas. Um clique fora também fecha o painel.
import { $, trocarConteudo, fecharNoEsc } from '../dom.js';
import { esc } from '../format.js';
import { botaoDeDica } from '../dicas.js';
import { REGRAS_DO_FILTRO, passaNoFiltro, resumoDoFiltro } from '../filtro-multiplo.js';

// id: o do botão, que já está na página (o painel é "<id>-painel"); nome e todas: o texto do botão, com e sem marcas;
// regra: 'todas' ou 'alguma'; grupos(): as opções agora, [{ titulo, opcoes: [[valor, rotulo, naCaixa], …] }] (o rótulo vai
// no botão; naCaixa, quando há, é o texto mais longo da caixa: "PP · Piloto Privado" no lugar de "PP"); frase: a regra
// com as palavras do uso ("Mostra os alunos de algum dos cursos marcados."; sem ela, a frase da regra); dica: [termo do
// glossário, rótulo] do "?" ao lado da regra; marcados: as marcas (um Set), quando o filtro as divide com outro (sem ele,
// as marcas são só deste); aoMudar(): as marcas mudaram (marcar, desmarcar, Limpar, a marcada que sumiu das opções)
export function criarFiltroMultiplo({ id, nome, todas, regra = 'todas', grupos, frase = REGRAS_DO_FILTRO[regra].frase, dica = null, marcados = new Set(), aoMudar }) {
  const botao = $(`#${id}`), painel = $(`#${id}-painel`);
  let opcoes = [], assinatura = null;
  // A frase da regra, com o "?" junto da última palavra (a quebra da linha não deixa o "?" sozinho embaixo)
  const corte = frase.lastIndexOf(' ') + 1;
  const regraComDica = dica ? `${frase.slice(0, corte)}<span class="filtro-fim">${frase.slice(corte)}${botaoDeDica(...dica)}</span>` : frase;
  painel.innerHTML = `<div class="filtro-cab"><p class="filtro-regra">${regraComDica}</p>` +
    `<button type="button" class="btn quiet" id="${id}-limpar" data-limpar-filtro="${id}">Limpar</button></div><div class="filtro-grupos"></div>`;
  const lugarDasOpcoes = painel.querySelector('.filtro-grupos');

  // As marcadas, na ordem das opções (e não na ordem em que foram marcadas)
  const marcadas = () => opcoes.flatMap(g => g.opcoes).filter(([valor]) => marcados.has(valor));
  const valores = () => marcadas().map(([valor]) => valor);

  function atualizarBotao() {
    botao.querySelector('.filtro-resumo').textContent = resumoDoFiltro(marcadas().map(([, rotulo]) => rotulo), { nome, todas, regra });
    botao.classList.toggle('com-marcas', marcados.size > 0);
  }

  const caixa = ([valor, rotulo, naCaixa]) => `<label class="filtro-opcao"><input type="checkbox" class="flt-ctrl" data-filtro="${id}" data-valor="${esc(valor)}"${marcados.has(valor) ? ' checked' : ''}>${esc(naCaixa || rotulo)}</label>`;

  // As opções de agora: as caixas são refeitas só quando elas mudam; a marcada que sumiu sai do filtro
  function desenhar() {
    opcoes = grupos();
    const existem = new Set(opcoes.flatMap(g => g.opcoes.map(([valor]) => valor)));
    const sumiram = [...marcados].filter(valor => !existem.has(valor));
    sumiram.forEach(valor => marcados.delete(valor));
    const nova = JSON.stringify(opcoes);
    if (nova !== assinatura) {
      assinatura = nova;
      trocarConteudo(lugarDasOpcoes, opcoes.map(g => `<fieldset><legend>${esc(g.titulo)}</legend>${g.opcoes.map(caixa).join('')}</fieldset>`).join(''));
    } else {
      for (const el of lugarDasOpcoes.querySelectorAll('input[data-filtro]')) el.checked = marcados.has(el.dataset.valor);
    }
    atualizarBotao();
    if (sumiram.length) aoMudar();
  }

  function limpar() {
    marcados.clear();
    for (const el of lugarDasOpcoes.querySelectorAll('input[data-filtro]')) el.checked = false;
    atualizarBotao();
  }

  // Abre ou fecha. O painel que fecha com o foco dentro dele o devolve ao botão (o foco não fica num lugar escondido)
  function mostrar(abrir, { focoNoBotao = false } = {}) {
    const focoDentro = painel.contains(document.activeElement);
    painel.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
    if (!abrir && (focoNoBotao || focoDentro)) botao.focus();
  }

  botao.addEventListener('click', () => mostrar(painel.hidden));
  painel.addEventListener('change', e => {
    const el = e.target.closest('input[data-filtro]');
    if (!el) return;
    if (el.checked) marcados.add(el.dataset.valor);
    else marcados.delete(el.dataset.valor);
    atualizarBotao();
    aoMudar();
  });
  painel.addEventListener('click', e => {
    if (!e.target.closest('[data-limpar-filtro]') || !marcados.size) return;
    limpar();
    aoMudar();
  });
  // O clique fora fecha. O caminho do clique é o da hora do clique: uma caixa refeita depois dele ainda conta como dentro.
  // O balão da dica (o "?" da regra) fica por cima do painel e conta como dentro
  document.addEventListener('click', e => {
    if (painel.hidden) return;
    const caminho = e.composedPath();
    if (caminho.includes(botao) || caminho.includes(painel) || caminho.includes(document.getElementById('dica'))) return;
    mostrar(false);
  });
  fecharNoEsc(() => (painel.hidden ? null : [botao, painel]), () => mostrar(false, { focoNoBotao: true }), { semFoco: true });

  desenhar();
  return {
    desenhar,
    // Esvazia as marcas sem avisar (quem chama aplica os filtros: "Limpar filtros")
    limpar,
    valores,
    // A regra com as marcas de agora, para conferir as linhas de uma vez: recebe os valores de uma linha
    quemPassa() {
      const agora = valores();
      return valoresDaLinha => passaNoFiltro(valoresDaLinha, agora, regra);
    }
  };
}

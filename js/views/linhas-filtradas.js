// As linhas que os filtros escondem, nas tabelas de Instrutores e de Alunos (e a linha "Nenhum … com esses filtros", que
// a Demanda também usa): cada tela tem os próprios filtros (js/views/instrutores.js, js/views/alunos.js) e passa aqui a
// regra de quem passa, os nomes ("instrutor", "instrutores") e se algum filtro está valendo
import { $ } from '../dom.js';

// Esconde as linhas (data-k) que não passam nos filtros; a de "Nenhum … cadastrado" fica. Com todas escondidas, uma linha
// diz que nenhuma passa, com "Limpar filtros" (data-limpar-filtros="<aba>"). A contagem (#<aba>-contagem) é a da primeira
// tabela (as duas vistas dos instrutores mostram as mesmas linhas)
export function filtrarLinhas(corpos, passa, { aba, nomes, filtrando, esperar = 0 }) {
  let contagem = null;
  for (const seletor of corpos) {
    const corpo = $(seletor);
    if (!corpo) continue;
    const linhas = [...corpo.querySelectorAll(':scope > tr[data-k]')];
    for (const linha of linhas) linha.hidden = !passa(linha);
    const aVista = linhas.filter(l => !l.hidden).length;
    nenhumComOsFiltros(corpo, linhas.length > 0 && aVista === 0, { nome: nomes[0], botao: `data-limpar-filtros="${aba}"` });
    if (!contagem) contagem = { aVista, total: linhas.length };
  }
  if (contagem) contar(aba, nomes, filtrando, contagem, esperar);
}

// A linha "Nenhum … com esses filtros", no fim da tabela, só enquanto os filtros escondem todas as linhas. Ela continua a
// mesma enquanto vale (o foco no "Limpar filtros" fica nele). O texto e o botão ficam na parte à vista da tabela que
// rola para o lado (a grade do dia, no celular: css/componentes.css). nome: "instrutor", "aluno"; botao: o atributo de quem ouve
// o "Limpar filtros" (o id dele é limpar-filtros-<id da tabela>). A Demanda usa a mesma linha (js/views/demanda.js)
export function nenhumComOsFiltros(corpo, mostrar, { nome, botao = '' }) {
  const atual = corpo.querySelector(':scope > tr.sem-resultado');
  if (!mostrar) { if (atual) atual.remove(); return; }
  if (atual) return;
  const cabecalho = corpo.parentElement.tHead;
  const colunas = cabecalho && cabecalho.rows.length ? cabecalho.rows[0].cells.length : 1;
  corpo.insertAdjacentHTML('beforeend', `<tr class="sem-resultado"><td colspan="${colunas}" class="h"><div class="sem-resultado-texto">Nenhum ${nome} com esses filtros. <button type="button" class="btn quiet" id="limpar-filtros-${corpo.id}"${botao ? ` ${botao}` : ''}>Limpar filtros</button></div></td></tr>`);
}

// Quantos aparecem: "12 de 40 instrutores" com algum filtro, "40 instrutores" sem nenhum. A região é de status (o leitor de
// tela dita quando o texto muda). Na digitação, a contagem espera a pessoa parar (esperar, em ms)
const esperasDaContagem = {};
function contar(aba, [um, varios], filtrando, { aVista, total }, esperar) {
  const nome = total === 1 ? um : varios;
  const texto = !total ? '' : filtrando ? `${aVista} de ${total} ${nome}` : `${total} ${nome}`;
  clearTimeout(esperasDaContagem[aba]);
  const escrever = () => {
    const lugar = $(`#${aba}-contagem`);
    if (lugar && lugar.textContent !== texto) lugar.textContent = texto;
  };
  if (esperar) esperasDaContagem[aba] = setTimeout(escrever, esperar);
  else escrever();
}

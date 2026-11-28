// A linha "Nenhum … com esses filtros", no fim da tabela, só enquanto os filtros escondem todas as linhas. Ela continua a
// mesma enquanto vale (o foco no "Limpar filtros" fica nele). O texto e o botão ficam na parte à vista da tabela que
// rola para o lado (no celular: css/componentes.css). nome: "aluno"; botao: o atributo de quem ouve
// o "Limpar filtros" (o id dele é limpar-filtros-<id da tabela>). Só a Demanda a usa (js/views/demanda.js): INVAs e Alunos são lista e detalhe, e a lista diz o mesmo
export function nenhumComOsFiltros(corpo, mostrar, { nome, botao = '' }) {
  const atual = corpo.querySelector(':scope > tr.sem-resultado');
  if (!mostrar) { if (atual) atual.remove(); return; }
  if (atual) return;
  const cabecalho = corpo.parentElement.tHead;
  const colunas = cabecalho && cabecalho.rows.length ? cabecalho.rows[0].cells.length : 1;
  corpo.insertAdjacentHTML('beforeend', `<tr class="sem-resultado"><td colspan="${colunas}" class="h"><div class="sem-resultado-texto">Nenhum ${nome} com esses filtros. <button type="button" class="btn quiet" id="limpar-filtros-${corpo.id}"${botao ? ` ${botao}` : ''}>Limpar filtros</button></div></td></tr>`);
}

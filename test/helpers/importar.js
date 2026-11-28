// A importação dos testes: a conciliação dos pedidos dados com o dia (js/processamento.js), aplicada inteira, e o resumo
// dela, como o app faz em js/entrada-na-demanda.js. Os pedidos dos testes não têm as colunas da aprovação (D1): aqui, todo
// pedido que não foi cancelado conta como aprovado (a regra de antes da aprovação, a da importação do E antes da junção)
import { conciliarPedidos, aplicarConciliacao, resumoDaConciliacao } from '../../js/processamento.js';

export function importar(estado, solicitacoes, { situacao = [], programa = [], cursos = [], semInativos = false, religar = false } = {}) {
  if (!Array.isArray(estado.importadas)) estado.importadas = [];
  const plano = conciliarPedidos(estado, solicitacoes, { aprovada: s => !s.cancelada_em, cursos, semInativos, religar });
  return resumoDaConciliacao(plano, aplicarConciliacao(estado, plano, { programa, situacao, cursos }));
}

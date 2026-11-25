// As funcionalidades que podem ficar desligadas, e o único lugar onde se ligam. Desligada é só não aparecer: nada é apagado
// nem deixa de ser gravado (S.hangar, a etapa dos pedidos, os resultados e os programas continuam como estão), e ligar de
// novo traz tudo de volta. Os módulos puros (o motor, a compactação, os candidatos, o progresso, o agendamento) não
// conhecem as funcionalidades: quem decide são as telas, os eventos e o estado que o motor recebe (estadoDaEscala, em
// js/state.js).
//   hangar:    a ordem dos aviões no hangar (Recursos), que o motor passa a não ler (vale a ordem da frota), e as saídas do
//              hangar no tempo parado
//   progresso: a próxima missão e as outras missões do curso, o progresso, a fase de cada aluno e os resultados. A aba
//              Cursos, o curso do aluno e o código da missão que o pedido já tem continuam
import { LOCAIS } from './config-supabase.js';

// true liga a funcionalidade em todos os endereços
const LIGADAS = Object.freeze({ hangar: false, progresso: false });

// Só no localhost (o desenvolvimento e os testes): a lista das ligadas, separadas por vírgula, no lugar das de cima, em
// ?funcionalidades=hangar,progresso ou em FUNCIONALIDADES_LIGADAS, na janela (os testes, test/e2e/fixtures.js); vazia,
// nenhuma. Nos outros endereços, e sem endereço (o Node), null: valem as de cima
export function escolhidasNoLocalhost(janela = globalThis) {
  try {
    if (!LOCAIS.includes(janela.location.hostname)) return null;
    const lista = janela.FUNCIONALIDADES_LIGADAS ?? new URLSearchParams(janela.location.search).get('funcionalidades');
    return typeof lista === 'string' ? lista.split(',').map(nome => nome.trim()) : null;
  } catch {
    return null;
  }
}

export function ligada(nome) {
  const escolhidas = escolhidasNoLocalhost();
  return escolhidas ? escolhidas.includes(nome) : LIGADAS[nome];
}

// O texto da página (o Manual e o painel do hangar, em index.html): sai da página, também para o leitor de tela, o bloco
// de uma funcionalidade desligada (data-funcionalidade) e o que só vale sem ela, quando está ligada
// (data-sem-funcionalidade)
export function aplicarFuncionalidades(raiz) {
  for (const el of raiz.querySelectorAll('[data-funcionalidade]')) if (!ligada(el.dataset.funcionalidade)) el.remove();
  for (const el of raiz.querySelectorAll('[data-sem-funcionalidade]')) if (ligada(el.dataset.semFuncionalidade)) el.remove();
}

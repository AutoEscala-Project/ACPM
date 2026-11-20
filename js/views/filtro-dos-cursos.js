// O filtro dos cursos, em Alunos e na Demanda (o filtro de vários valores: js/views/filtro-multiplo.js): aparecem os alunos
// de algum dos cursos marcados (um curso só por aluno: a regra "alguma"). As opções (js/cursos.js) são os cursos ativos,
// na ordem da aba Cursos; os encerrados, marcados "(encerrado)"; o curso de um aluno que não está nos programas (como na
// lista do curso do aluno, em Alunos); e "Sem curso". O filtro é um só nas duas abas, com um botão em cada uma: Alunos
// leva à Demanda, onde ficam os pedidos de cada data, e os alunos marcados lá são os mesmos (o plano das abas). As opções
// são refeitas a cada redesenho das linhas (os programas mudam na aba Cursos ou chegam depois, quando são lidos), e a
// marcada que some sai do filtro. Na caixa, a sigla e o nome do curso; no botão, só a sigla ("Curso: PP ou PC")
import { CURSOS, SEM_CURSO, opcoesDoFiltroDosCursos } from '../cursos.js';
import { S, dadoIndisponivel } from '../state.js';
import { criarFiltroMultiplo } from './filtro-multiplo.js';

// Os cursos dos programas; sem eles lidos, os três com que o app começa (o servidor sempre os tem: nenhum curso é
// apagado). semProgramas: os programas não foram lidos (o curso de um aluno que não é um dos três fica só pela sigla:
// nada é dito sobre ele)
export function cursosConhecidos() {
  const semProgramas = dadoIndisponivel('cursos') || !(S.programa || []).length;
  return { semProgramas, programa: semProgramas ? CURSOS.map(([sigla, nome]) => ({ sigla, nome, ativo: true })) : S.programa };
}

function opcoesDosCursos() {
  const { semProgramas, programa } = cursosConhecidos();
  return [{ titulo: 'Cursos', opcoes: opcoesDoFiltroDosCursos(programa, S.stu.map(s => s.curso), { semProgramas }) }];
}

// As marcas, as mesmas nos dois botões, e cada uso: o filtro (o botão e o painel da aba) e os filtros da aba a aplicar
const marcados = new Set();
const usos = [];
let acompanhando = false;

// As marcas mudaram num dos botões (marcar, desmarcar, "Limpar", a marcada que sumiu das opções): os dois mostram as de
// agora (as caixas e o texto do botão, com as opções refeitas), e as duas abas aplicam os filtros. A marcada que some ao
// refazer as opções chega aqui de novo, no meio da volta: ela já está na volta
function marcasMudaram() {
  if (acompanhando) return;
  acompanhando = true;
  try {
    for (const { filtro } of usos) filtro.desenhar();
  } finally {
    acompanhando = false;
  }
  for (const { aplicar } of usos) aplicar();
}

// O filtro dos cursos no botão id (o painel é "<id>-painel"); aplicar(): aplica os filtros da aba (as marcas mudaram,
// nela ou na outra)
export function criarFiltroDosCursos(id, aplicar) {
  const filtro = criarFiltroMultiplo({
    id, nome: 'Curso', todas: 'Todos os cursos', regra: 'alguma', frase: 'Mostra os alunos de algum dos cursos marcados.',
    dica: ['filtro-dos-cursos', 'Filtro dos cursos'], grupos: opcoesDosCursos, marcados, aoMudar: marcasMudaram
  });
  usos.push({ filtro, aplicar });
  return {
    ...filtro,
    // "Limpar filtros" (Alunos): as marcas saem também da outra aba (quem chama aplica os filtros da aba dele)
    limpar() {
      filtro.limpar();
      for (const uso of usos) if (uso.filtro !== filtro) { uso.filtro.desenhar(); uso.aplicar(); }
    }
  };
}

// O que a linha (do aluno, em Alunos, ou de um pedido dele, na Demanda) mostra ao filtro: o curso do aluno (data-curso)
// ou "Sem curso"
export const cursoDaLinha = linha => [linha.dataset.curso || SEM_CURSO];

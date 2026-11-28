// O filtro dos cursos, em Alunos e no Processamento (o filtro de vários valores: js/views/filtro-multiplo.js): aparecem os
// alunos de algum dos cursos marcados (um curso só por aluno: a regra "alguma"). As opções (js/cursos.js) são os cursos
// ativos, na ordem da aba Cursos; os encerrados, marcados "(encerrado)"; o curso de um aluno que não está nos programas
// (como na lista do curso do aluno, em Alunos); e "Sem curso". O de Alunos e o do Processamento têm marcas próprias (G2:
// a Demanda dividia as de Alunos). As opções são refeitas a cada redesenho das linhas (os programas mudam na aba Cursos ou
// chegam depois, quando são lidos), e a marcada que some sai do filtro. Na caixa, a sigla e o nome do curso; no botão, só
// a sigla ("Curso: PP ou PC")
import { CURSOS, opcoesDoFiltroDosCursos } from '../cursos.js';
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

// O filtro dos cursos no botão id (o painel é "<id>-painel"), com as marcas dele; aoMudar(): as marcas mudaram
export function criarFiltroDosCursos(id, aoMudar) {
  return criarFiltroMultiplo({
    id, nome: 'Curso', todas: 'Todos os cursos', regra: 'alguma', frase: 'Mostra os alunos de algum dos cursos marcados.',
    dica: ['filtro-dos-cursos', 'Filtro dos cursos'], grupos: opcoesDosCursos, aoMudar
  });
}

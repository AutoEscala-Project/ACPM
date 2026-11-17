// A próxima missão de cada aluno pelas regras do programa (js/programa.js), e o progresso dele no curso. Só contam as
// fases e as missões que estão no programa. A missão está feita quando foi aprovada (vale o último resultado) ou é
// dispensada; a de um voo do dia que termina antes (planejada) conta como feita sob condição: depende do resultado.
// Cada fase espera as fases anteriores que não são livres ("ordem"), nenhuma ("livre") ou as da lista ("depois"), e
// está completa com todas as missões dela feitas, as livres também; dentro dela, cada missão espera, do mesmo jeito, as
// missões anteriores da fase, nenhuma ou as da lista (que podem ser de fases anteriores). Tudo o que uma missão espera
// vem antes dela no curso: fora as missões do dia, sempre há uma liberada enquanto falta alguma.
import { situacaoDa } from './resultados.js';
import { percursoDoCurso } from './programa.js';
import { chaveDoVoo } from './voo.js';

// curso: um curso do programa; mapa: a situação de cada missão (situacaoPorMissao); aluno: o id dele; planejadas: as
// missões (ids) que contam como feitas sob condição; exceto: as que o aluno já tem em outro pedido do dia (não são
// sugeridas de novo). Para cada missão (porMissao, pelo id): o estado ('dispensada', 'aprovada', 'no-dia', 'liberada',
// 'condicional' ou 'bloqueada'), as missões que faltam e as planejadas de que ela depende (ids, na ordem do curso) e as
// fases que ela espera e ainda não estão completas. candidatas: as liberadas e as condicionais, na ordem do curso
export function estadoDoAluno(curso, mapa, aluno, { planejadas = new Set(), exceto = new Set() } = {}) {
  const { porMissao, candidatas } = avaliar(curso, mapa, aluno, planejadas, exceto);
  return { porMissao, candidatas };
}

function avaliar(curso, mapa, aluno, planejadas, exceto) {
  const percurso = percursoDoCurso(curso), { fases, porFase, missoes, posicao } = percurso;
  // 2: feita (aprovada ou dispensada); 1: planejada (feita sob condição); 0: falta
  const nivel = new Map(missoes.map(m => [m.id,
    m.dispensada || situacaoDa(mapa, aluno, curso.sigla, m.codigo) === 'aprovado' ? 2 : planejadas.has(m.id) ? 1 : 0]));
  const posicaoDaFase = new Map(fases.map((f, i) => [f.id, i]));
  const comNivel = (ids, n) => ids.filter(id => nivel.get(id) === n);
  const naOrdem = ids => [...new Set(ids)].sort((x, y) => posicao.get(x) - posicao.get(y));
  // As fases que cada fase espera, na ordem do curso
  const fasesDaLista = ids => ids.filter(id => posicaoDaFase.has(id)).map(id => posicaoDaFase.get(id)).sort((x, y) => x - y).map(i => fases[i]);
  const esperaDaFase = new Map(fases.map((f, i) => [f.id,
    f.regra === 'livre' ? [] : f.regra === 'depois' ? fasesDaLista(f.requer) : fases.slice(0, i).filter(g => g.regra !== 'livre')]));
  const porMissao = new Map(), candidatas = [];
  for (const f of fases) {
    // O que falta e o que está planejado nas fases que esta espera (as missões, na ordem do curso, e as fases incompletas)
    const fasesEsperadas = esperaDaFase.get(f.id), dasFases = fasesEsperadas.flatMap(g => porFase.get(g.id).map(m => m.id));
    const faltamDasFases = comNivel(dasFases, 0), dependeDasFases = comNivel(dasFases, 1);
    const fasesFechadas = fasesEsperadas.filter(g => porFase.get(g.id).some(m => nivel.get(m.id) === 0)).map(g => g.id);
    // As missões anteriores da fase que não são livres e ainda faltam ou estão planejadas (as "depois das anteriores"
    // esperam por elas)
    const faltamNaFase = [], dependeNaFase = [];
    for (const m of porFase.get(f.id)) {
      const n = nivel.get(m.id);
      if (n === 2 || exceto.has(m.id)) {
        porMissao.set(m.id, { estado: m.dispensada ? 'dispensada' : n === 2 ? 'aprovada' : 'no-dia', faltam: [], fasesFechadas: [], dependeDe: [] });
      } else {
        const requer = m.regra === 'depois' ? m.requer.filter(id => posicao.has(id)) : [];
        const faltam = m.regra === 'depois' ? naOrdem([...faltamDasFases, ...comNivel(requer, 0)])
          : [...faltamDasFases, ...(m.regra === 'livre' ? [] : faltamNaFase)];
        const dependeDe = m.regra === 'depois' ? naOrdem([...dependeDasFases, ...comNivel(requer, 1)])
          : [...dependeDasFases, ...(m.regra === 'livre' ? [] : dependeNaFase)];
        const estado = faltam.length ? 'bloqueada' : dependeDe.length ? 'condicional' : 'liberada';
        porMissao.set(m.id, { estado, faltam, fasesFechadas, dependeDe });
        if (estado !== 'bloqueada') candidatas.push(m);
      }
      if (m.regra !== 'livre' && n < 2) (n === 0 ? faltamNaFase : dependeNaFase).push(m.id);
    }
  }
  return { percurso, nivel, esperaDaFase, porMissao, candidatas };
}

// A missão padrão e as outras candidatas. preferencia(m), para o contexto (o recurso ou o instrutor escolhido): 2 (serve
// bem), 1 (serve) ou 0 (não serve). padrao: a primeira candidata com a maior preferência acima de 0; nenhuma acima de 0,
// a primeira candidata. Sem preferência, a primeira candidata (no programa de antes, a primeira missão não aprovada)
export function proximasMissoes(curso, mapa, aluno, { planejadas, exceto, preferencia = () => 2 } = {}) {
  const { candidatas } = estadoDoAluno(curso, mapa, aluno, { planejadas, exceto });
  let padrao = candidatas[0] || null, melhor = 0;
  for (const m of candidatas) {
    const p = preferencia(m);
    if (p > melhor) { padrao = m; melhor = p; }
  }
  return { padrao, candidatas };
}

// O progresso do aluno no curso: as aprovadas sobre as que contam (as do programa, menos as dispensadas), a fase em que
// ele está (a primeira aberta e incompleta), a próxima missão e se concluiu
export function progressoNoCurso(curso, mapa, aluno) {
  const { percurso: { fases, porFase, missoes }, nivel, esperaDaFase, porMissao, candidatas } = avaliar(curso, mapa, aluno, new Set(), new Set());
  const contam = missoes.filter(m => !m.dispensada);
  const aprovadas = contam.filter(m => porMissao.get(m.id).estado === 'aprovada').length;
  const completa = f => porFase.get(f.id).every(m => nivel.get(m.id) === 2);
  const faseAtual = fases.find(f => !completa(f) && esperaDaFase.get(f.id).every(completa)) || null;
  return { aprovadas, total: contam.length, faseAtual, proxima: candidatas[0] || null, concluido: aprovadas === contam.length };
}

// As missões do curso (ids) que o aluno já tem no dia: as etapas dos pedidos dele que voam, menos os cancelados e o
// pedido que vai receber a missão (mid; null: nenhum). Elas contam como feitas para a seguinte (o aluno encadeia
// missões no mesmo dia; o resultado vem depois) e não são sugeridas de novo
export function missoesDoDia(curso, aluno, { fStatus, mid = null } = {}) {
  const porCodigo = new Map(curso.missoes.map(m => [m.codigo, m.id]));
  return new Set([aluno, ...(aluno.extra || [])]
    .filter(p => p.fly && p.etapa && (mid === null || (p.mid || 0) !== mid) && (fStatus || {})[chaveDoVoo(aluno.id, p.mid || 0)] !== 'Cancelado')
    .map(p => porCodigo.get(p.etapa)).filter(Boolean));
}

// O programa dos cursos em fases: cada curso (a sigla, PP) tem fases e missões, cada uma com a regra de quando pode ser
// voada ("ordem": depois das anteriores; "livre"; "depois": depois das da lista, sempre anteriores). As fases e as
// missões têm um id próprio; o código da missão (PP-07) é o que os resultados e os pedidos guardam. Uma fase ou missão
// tirada do programa fica marcada (removida) para o código continuar valendo no histórico.
import { CURSOS } from './cursos.js';

// O programa de antes (o do cadastro: em cada curso, a lista das missões, na ordem do voo) no formato novo: cada curso
// numa fase só, "Programa", com as missões na mesma ordem e todas "depois das anteriores" (a próxima missão continua a
// mesma). gerarId(sigla, código da missão, ou 'Programa' para a fase) dá os ids
export function programaDoLegado(cursos, gerarId) {
  return CURSOS.map(([sigla, nome], ordem) => {
    const fase = { id: gerarId(sigla, 'Programa'), nome: 'Programa', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false };
    const missoes = (cursos[sigla] || []).map((m, i) => ({
      id: gerarId(sigla, m.id), fase: fase.id, codigo: m.id, nome: m.nome, mis: m.mis, eq: m.eq, nb: m.nb, ordem: i,
      regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false
    }));
    return { sigla, nome, ordem, ativo: true, fases: [fase], missoes };
  });
}

const naOrdem = (x, y) => x.ordem - y.ordem;

// O caminho do curso: as fases que estão no programa, na ordem, as missões de cada uma (porFase), também na ordem, todas
// as missões na ordem do curso (a da fase, depois a da missão) e a posição de cada uma nessa ordem. Calculado uma vez
// por curso (o curso alterado é outro objeto)
const percursos = new WeakMap();
export function percursoDoCurso(curso) {
  if (!percursos.has(curso)) {
    const fases = curso.fases.filter(f => !f.removida).sort(naOrdem);
    const porFase = new Map(fases.map(f => [f.id, curso.missoes.filter(m => m.fase === f.id && !m.removida).sort(naOrdem)]));
    const missoes = fases.flatMap(f => porFase.get(f.id));
    percursos.set(curso, { fases, porFase, missoes, posicao: new Map(missoes.map((m, i) => [m.id, i])) });
  }
  return percursos.get(curso);
}

// O índice do programa (a lista dos cursos): o curso pela sigla, o caminho dele, a missão pelo id e pelo código (estas
// duas também acham as tiradas do programa, para o código antigo continuar com nome). Calculado uma vez por lista
const indices = new WeakMap();
export function indiceDoPrograma(programa) {
  if (!indices.has(programa)) {
    const cursos = new Map(), missoes = new Map(), porCodigo = new Map();
    const guardar = (mapa, chave, valor) => { if (!mapa.has(chave)) mapa.set(chave, valor); };
    for (const curso of programa) {
      guardar(cursos, curso.sigla, curso);
      for (const m of curso.missoes) {
        guardar(missoes, m.id, m);
        guardar(porCodigo, `${curso.sigla}|${m.codigo}`, m);
      }
    }
    indices.set(programa, {
      curso: sigla => cursos.get(sigla) || null,
      percurso: sigla => (cursos.has(sigla) ? percursoDoCurso(cursos.get(sigla)) : null),
      missao: id => missoes.get(id) || null,
      missaoPorCodigo: (sigla, codigo) => porCodigo.get(`${sigla}|${codigo}`) || null
    });
  }
  return indices.get(programa);
}

// O nome curto da fase: o que vem antes do travessão ("Fase 6 – Treinamento de Voo Noturno" é a "Fase 6"; também com o
// travessão longo ou o hífen); sem travessão, o nome inteiro
export const rotuloDaFase = fase => fase.nome.split(/\s+[–—-]\s+/)[0];

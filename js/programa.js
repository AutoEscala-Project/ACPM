// O programa dos cursos em fases: cada curso (a sigla, PP) tem fases e missões, cada uma com a regra de quando pode ser
// voada ("ordem": depois das anteriores; "livre"; "depois": depois das da lista, sempre anteriores). As fases e as
// missões têm um id próprio; o código da missão (PP-07) é o que os resultados e os pedidos guardam. Uma fase ou missão
// tirada do programa fica marcada (removida) para o código continuar valendo no histórico.
// A gravação de um curso (gravarCurso) e a conversão única do programa guardado no cadastro (importarProgramas) são as
// do servidor (public.salvar_curso e public.importar_cursos, na migração 20261117200000_cursos_e_missoes), com os mesmos
// erros, na mesma ordem: o modo local grava por elas, e os casos de test/helpers/casos-do-programa.js valem para as duas
// pontas.
import { CURSOS, siglaValida, codigoValido, novaMissaoDoCurso } from './cursos.js';
import { MIS, GROUND_DURATION_H, DURACAO_MAXIMA_H, NOTURNO } from './config.js';
import { duracaoValida } from './rules.js';
import { FORMATO_DOS_CURSOS } from './migracoes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REGRAS = ['ordem', 'livre', 'depois'];
const LIMITE_DE_FASES = 50, LIMITE_DE_MISSOES = 200, LIMITE_DO_NOME = 80, LIMITE_DA_DESCRICAO = 500, ALTERACOES_POR_CURSO = 20;

// Um id novo para uma fase ou uma missão: quem cria os ids é o app (a fase nova já pode ser exigida por outra antes de
// ir para o servidor)
export const novoId = () => crypto.randomUUID();

// Os cursos com que o servidor começa: PP, PC e INVA, sem programa, na versão 1
export const cursosIniciais = () => CURSOS.map(([sigla, nome], ordem) => ({ sigla, nome, ordem, ativo: true, versao: 1, fases: [], missoes: [] }));

// O programa de antes (o do cadastro: em cada curso, a lista das missões, na ordem do voo) no formato novo: cada curso
// numa fase só, "Programa", com as missões na mesma ordem e todas "depois das anteriores" (a próxima missão continua a
// mesma). gerarId(sigla, código da missão, ou 'Programa' para a fase) dá os ids; sem ele, ids novos (os do servidor)
export function programaDoLegado(cursos, gerarId = novoId) {
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

// O Noturno em trechos ------------------------------------------------------------------------------------------------
// O Noturno de dois dias é um voo só na escala (NOTURNO, em js/config.js), e o programa pode trazê-lo em missões, uma
// por trecho: a ida (o translado para BH), a noite (o noturno em BH) e a volta (o translado do dia seguinte), todas do
// tipo Noturno. Na fase, as missões com trecho que vêm uma logo depois da outra são um Noturno só: a ida (se houver), a
// noite e a volta (se houver), nesta ordem. A próxima missão oferece o Noturno uma vez, pela noite: o pedido leva o
// código dela, o resultado é dela e vale para os translados
const TRECHOS = Object.keys(NOTURNO.trechos);
const FORMAS_DO_NOTURNO = ['noite', 'ida noite', 'noite volta', 'ida noite volta'];
// O trecho no formato: um dos trechos, numa missão Noturno
const temTrecho = m => TRECHOS.includes(m.trecho) && m.mis === 'Noturno';
const semTrecho = ({ trecho, ...m }) => m;

// As missões de cada fase, na ordem em que vêm
function porFaseNaOrdem(missoes) {
  const grupos = new Map();
  for (const m of missoes) {
    if (!grupos.has(m.fase)) grupos.set(m.fase, []);
    grupos.get(m.fase).push(m);
  }
  return [...grupos.values()];
}

// As sequências de missões com trecho de uma fase (missoesDaFase: as do programa, na ordem): as que vêm uma logo depois
// da outra ficam juntas
function sequenciasComTrecho(missoesDaFase) {
  const sequencias = [];
  let atual = null;
  for (const m of missoesDaFase) {
    if (!temTrecho(m)) atual = null;
    else if (atual) atual.push(m);
    else sequencias.push(atual = [m]);
  }
  return sequencias;
}
const formaDoNoturno = sequencia => FORMAS_DO_NOTURNO.includes(sequencia.map(m => m.trecho).join(' '));

// Os ids das missões com trecho que não formam um Noturno (missoes: as do programa, na ordem do curso): o trecho delas
// não vale
const trechosSoltos = missoes => new Set(porFaseNaOrdem(missoes).flatMap(sequenciasComTrecho).filter(s => !formaDoNoturno(s)).flat().map(m => m.id));

// Os Noturnos do programa do curso: para cada missão de um Noturno, o Noturno dela ({ ida, noite, volta }; sem a ida ou
// sem a volta, null). A sequência que não forma um Noturno não conta (as missões dela são como as outras). Calculado uma
// vez por curso
const noturnos = new WeakMap();
export function noturnosDoCurso(curso) {
  if (!noturnos.has(curso)) {
    const { fases, porFase } = percursoDoCurso(curso);
    const doNoturno = new Map();
    for (const sequencia of fases.flatMap(f => sequenciasComTrecho(porFase.get(f.id))).filter(formaDoNoturno)) {
      const trecho = nome => sequencia.find(m => m.trecho === nome) || null;
      const noturno = { ida: trecho('ida'), noite: trecho('noite'), volta: trecho('volta') };
      for (const m of sequencia) doNoturno.set(m.id, noturno);
    }
    noturnos.set(curso, doNoturno);
  }
  return noturnos.get(curso);
}

// O nome da missão como a próxima missão: o código; a noite de um Noturno, com os translados dele, que voam junto
// ("NOT (com TSL-01 e TSL-02)"; o translado dispensado não vai)
export function rotuloDaMissao(curso, missao) {
  const noturno = noturnosDoCurso(curso).get(missao.id);
  const translados = noturno && noturno.noite.id === missao.id ? [noturno.ida, noturno.volta].filter(m => m && !m.dispensada) : [];
  return translados.length ? `${missao.codigo} (com ${translados.map(m => m.codigo).join(' e ')})` : missao.codigo;
}

// O trecho do Noturno, como public.gravar_programa: "ida", "noite" ou "volta", só numa missão Noturno; e, em cada fase,
// cada sequência de missões com trecho é um Noturno (missoes: as do programa, na ordem das listas)
function conferirTrechos(missoes) {
  if (!missoes.every(m => m.trecho === undefined || m.trecho === null || temTrecho(m))) {
    return recusa('22023', 'trecho', 'o trecho do Noturno é "ida", "noite" ou "volta", e só numa missão Noturno');
  }
  if (trechosSoltos(missoes).size) {
    return recusa('22023', 'trecho', 'cada Noturno fica junto na fase: a ida (se houver), uma noite e a volta (se houver), nesta ordem, sem outra missão no meio');
  }
  return null;
}

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const comoLista = v => (Array.isArray(v) ? v : []);

// A posição de cada fase do programa (a da lista) e de cada missão (um número que cresce na ordem do curso: a posição da
// fase dela, depois a dela na fase), e a ordem de cada missão na fase. fases e missoes: as do programa, na ordem
function posicoes(fases, missoes) {
  const daFase = new Map(fases.map((f, i) => [f.id, i]));
  const naFase = new Map(), daMissao = new Map(), ordemNaFase = new Map();
  for (const m of missoes) {
    const i = naFase.get(m.fase) || 0;
    naFase.set(m.fase, i + 1);
    ordemNaFase.set(m.id, i);
    daMissao.set(m.id, daFase.get(m.fase) * (LIMITE_DE_MISSOES + 1) + i);
  }
  return { daFase, daMissao, ordemNaFase };
}

// Os programas lidos (das tabelas dos cursos, ou deste navegador) -----------------------------------------------------

// O nome para a tela: sem os espaços das pontas nem os repetidos, até 80 caracteres contados como o banco conta (um
// emoji é um caractere só): o nome que o servidor aceita volta inteiro, e nenhum emoji fica pela metade (o meio emoji
// faria o servidor recusar a gravação seguinte do curso)
const nomeCurto = v => (typeof v === 'string' ? [...v.trim().replace(/\s+/g, ' ')].slice(0, LIMITE_DO_NOME).join('').trimEnd() : '');
const inteiro = v => (Number.isInteger(v) ? v : 0);
const textoOuNulo = v => (typeof v === 'string' ? v : null);
const regraConhecida = v => (REGRAS.includes(v) ? v : 'ordem');
const retiradasNoFim = (a, b) => a.removida - b.removida || a.ordem - b.ordem;

// O programa lido do servidor (programa_dos_cursos) ou deste navegador, nos formatos certos, para a tela e a próxima
// missão: os cursos com a sigla no formato (o primeiro de cada sigla), na ordem; as fases e as missões com id (uuid,
// uma vez cada), em ordem, as retiradas no fim; cada missão numa fase do curso, com código e o tipo de missão do app (o
// recurso entre os do tipo, senão o padrão; o Ground com 1,5 h), sem código repetido (vale a primeira) e, sem nome, com
// o código. No programa, no máximo 50 fases e 200 missões (as retiradas ficam todas: o código delas continua valendo).
// Os requisitos só apontam para itens anteriores do programa: "depois de…" sem nenhum vira "depois das anteriores", e a
// fase ou a missão retirada fica sem nenhum
export function normalizarProgramas(programa) {
  const siglas = new Set();
  return comoLista(programa).filter(c => ehObjeto(c) && siglaValida(c.sigla) && !siglas.has(c.sigla) && siglas.add(c.sigla))
    .map(normalizarCurso).sort(naOrdem);
}

function normalizarCurso(c) {
  // Cada id uma vez no curso, nas fases e nas missões
  const ids = new Set();
  const idNovo = x => typeof x.id === 'string' && UUID.test(x.id) && !ids.has(x.id) && ids.add(x.id);
  const fases = comoLista(c.fases).filter(f => ehObjeto(f) && idNovo(f)).map(f => ({
    id: f.id, nome: nomeCurto(f.nome) || `Fase ${inteiro(f.ordem) + 1}`, modulo: nomeCurto(f.modulo) || null, ordem: inteiro(f.ordem),
    regra: regraConhecida(f.regra), requer: comoLista(f.requer), removida: f.removida === true
  })).sort(retiradasNoFim);
  const fasesDoPrograma = fases.filter(f => !f.removida).slice(0, LIMITE_DE_FASES);
  const fasesQueFicam = [...fasesDoPrograma, ...fases.filter(f => f.removida)];
  const daFase = new Map(fasesQueFicam.map(f => [f.id, f]));
  const codigos = new Set();
  const missoes = comoLista(c.missoes)
    .filter(m => ehObjeto(m) && daFase.has(m.fase) && typeof m.codigo === 'string' && codigoValido(m.codigo)
      && typeof m.mis === 'string' && Object.hasOwn(MIS, m.mis) && idNovo(m))
    .map(m => {
      const tipo = MIS[m.mis];
      return {
        id: m.id, fase: m.fase, codigo: m.codigo, nome: nomeCurto(m.nome) || m.codigo, mis: m.mis,
        eq: tipo.eq.includes(m.eq) ? m.eq : tipo.defEq, nb: tipo.isGround ? GROUND_DURATION_H : duracaoValida(m.nb),
        ordem: inteiro(m.ordem), regra: regraConhecida(m.regra), requer: comoLista(m.requer), dispensada: m.dispensada === true,
        avaliacao: m.avaliacao === true, removida: m.removida === true, comResultados: m.comResultados === true,
        ...(temTrecho(m) ? { trecho: m.trecho } : {})
      };
    })
    .sort((a, b) => a.removida - b.removida || daFase.get(a.fase).ordem - daFase.get(b.fase).ordem || a.ordem - b.ordem)
    .filter(m => !codigos.has(m.codigo) && codigos.add(m.codigo));
  const missoesDoPrograma = missoes.filter(m => !m.removida).slice(0, LIMITE_DE_MISSOES);
  // O trecho do Noturno vale só no Noturno inteiro, junto na fase (o da missão fora do programa fica, para a volta dela)
  const soltos = trechosSoltos(missoesDoPrograma.filter(m => !daFase.get(m.fase).removida));
  const { daFase: posicaoDaFase, daMissao } = posicoes(fasesDoPrograma, missoesDoPrograma.filter(m => !daFase.get(m.fase).removida));
  const soAnteriores = (x, posicao) => {
    const p = posicao.get(x.id);
    const requer = x.regra === 'depois' && p !== undefined ? [...new Set(x.requer)].filter(id => posicao.get(id) < p) : [];
    return { ...x, regra: x.regra === 'depois' && !requer.length ? 'ordem' : x.regra, requer };
  };
  return {
    sigla: c.sigla, nome: nomeCurto(c.nome) || c.sigla, ordem: inteiro(c.ordem), ativo: c.ativo !== false,
    versao: Number.isInteger(c.versao) && c.versao > 0 ? c.versao : 1,
    fases: fasesQueFicam.map(f => soAnteriores(f, posicaoDaFase)),
    missoes: [...missoesDoPrograma, ...missoes.filter(m => m.removida)].map(m => soAnteriores(soltos.has(m.id) ? semTrecho(m) : m, daMissao)),
    alteracoes: comoLista(c.alteracoes).filter(a => ehObjeto(a) && Number.isInteger(a.versao) && typeof a.descricao === 'string')
      .slice(0, ALTERACOES_POR_CURSO)
      .map(a => ({ versao: a.versao, descricao: a.descricao, registrado_em: textoOuNulo(a.registrado_em), registrado_por: textoOuNulo(a.registrado_por) }))
  };
}

// A gravação, como no servidor ----------------------------------------------------------------------------------------
// Os cursos guardados ficam no formato do banco (programa_do_curso sem comResultados e sem alteracoes); os resultados,
// em [{ curso, missao }]; o cadastro, em { esquema, versao } (null: sem cadastro).

// A recusa, com o código do servidor e o campo (a dica do servidor; null quando não há)
const recusa = (code, campo, mensagem) => Object.assign(new Error(mensagem), { code, campo });
// O valor como chega ao servidor, em JSON (o que o JSON não tem, como undefined, fica de fora)
const comoJson = v => {
  const texto = JSON.stringify(v);
  return texto === undefined ? null : JSON.parse(texto);
};
// O formato do cadastro, como public.esquema_do_conteudo: o número inteiro do campo "esquema"; sem ele, 0
const formatoDoCadastro = cadastro => (typeof cadastro.esquema === 'number' ? Math.floor(cadastro.esquema) : 0);
// Um texto como o banco o mede: em caracteres (char_length), sem os espaços das pontas (btrim tira só o espaço)
const tamanho = texto => [...texto.replace(/^ +| +$/g, '')].length;
const nomeValido = v => typeof v === 'string' && tamanho(v) >= 1 && tamanho(v) <= LIMITE_DO_NOME;
const regraValida = x => REGRAS.includes(x.regra ?? 'ordem');
const simOuNao = v => v === undefined || v === null || typeof v === 'boolean';

// As horas como o banco guarda (numeric com uma casa, pelo round() do Postgres): na faixa das horas, a mesma conta de
// duracaoValida (a metade vai para cima: 1,15 h é 1,2 h; test/unit/programa.test.js confere de 0,01 a 6 h)
const horasDoBanco = nb => Math.round(nb * 10) / 10;

// O tipo de missão, o recurso e as horas, como public.missao_e_recurso_validos (a lista do banco é a de MIS:
// test/unit/espelho-do-banco.test.js confere): o Ground é na Sala Ground, com 1,5 h; as horas vão até 5
const missaoERecursoValidos = (mis, eq, nb) => typeof mis === 'string' && Object.hasOwn(MIS, mis) && MIS[mis].eq.includes(eq)
  && (!MIS[mis].isGround || nb === GROUND_DURATION_H) && nb > 0 && nb <= DURACAO_MAXIMA_H;

// As fases e as missões do conteúdo que estão no programa: a marcada como retirada (removida: true) fica de fora, como a
// que não vem
const noPrograma = conteudo => ({ fases: conteudo.fases.filter(f => f.removida !== true), missoes: conteudo.missoes.filter(m => m.removida !== true) });

// A lista "depois de…" de uma fase ou de uma missão: nada ou uma lista, só de itens anteriores (anterior(id)), sem
// repetir, com pelo menos um na regra "depois" e nenhum nas outras
function requerConfere(item, anterior) {
  if (item.requer !== undefined && item.requer !== null && !Array.isArray(item.requer)) return false;
  const requer = item.requer || [];
  return ((item.regra ?? 'ordem') === 'depois') === (requer.length > 0) && requer.every(anterior) && new Set(requer).size === requer.length;
}

// Confere o curso (o nome, se está ativo, as fases e as missões) como o servidor, na ordem dele: devolve o erro que o
// servidor daria primeiro (com code, campo e a mensagem), ou null. Com o contexto (a sigla, a versão lida e o que está
// guardado: os cursos e os resultados), confere também o que depende dele: a sigla nova ou a versão lida, os ids de
// outro curso, o código de uma missão retirada e o código que já tem resultados. A aba Cursos confere cada alteração
// antes de gravar (sem contexto: o conteúdo)
export function validarCurso(conteudo, contexto = null) {
  if (!ehObjeto(conteudo)) return recusa('22023', 'limite', 'o curso vai num objeto');
  if (!nomeValido(conteudo.nome)) return recusa('22023', 'nome', 'o nome do curso vai de 1 a 80 caracteres');
  if (typeof conteudo.ativo !== 'boolean') return recusa('22023', 'ativo', 'o curso está ativo ou encerrado (sim ou não)');
  return (contexto && conferirVersao(contexto)) || conferirPrograma(conteudo, contexto);
}

// A sigla do curso novo (versão lida 0) ou a versão lida do curso guardado, como public.salvar_curso
function conferirVersao({ sigla, versaoLida, cursos }) {
  const guardado = cursos.find(c => c.sigla === sigla);
  if (versaoLida === 0) {
    if (!siglaValida(sigla)) {
      return recusa('22023', 'sigla', 'a sigla do curso tem de 2 a 10 caracteres: letras maiúsculas, números e hífen, começando por letra');
    }
    return guardado ? recusa('PT409', 'sigla', `o curso ${sigla} já existe`) : null;
  }
  if (!guardado) return recusa('P0002', null, `o curso ${sigla} não existe`);
  return guardado.versao === versaoLida ? null : recusa('PT409', null, `o programa do curso ${sigla} foi alterado por outra pessoa`);
}

// O programa do curso (as fases e as missões), como public.gravar_programa, na mesma ordem: as listas e o limite, os ids
// (também os de outro curso), os campos (das fases: nome, módulo e regra; das missões: fase, código, nome, tipo com
// recurso e horas, regra, "dispensada", "avaliação" e o trecho do Noturno, com a sequência dele na fase), os códigos, os
// requisitos e o código travado por um resultado.
// contexto: null (só o conteúdo) ou o que está guardado ({ sigla, cursos, resultados, substituir }). Na conversão
// (substituir), o programa guardado sai inteiro: o código de uma missão retirada e o código com resultados não contam
function conferirPrograma(conteudo, contexto) {
  const deObjetos = v => Array.isArray(v) && v.every(ehObjeto);
  if (!deObjetos(conteudo.fases) || !deObjetos(conteudo.missoes)) return recusa('22023', 'limite', 'as fases e as missões do programa vão em listas');
  const { fases, missoes } = noPrograma(conteudo);
  if (fases.length > LIMITE_DE_FASES || missoes.length > LIMITE_DE_MISSOES) return recusa('22023', 'limite', 'o programa tem no máximo 50 fases e 200 missões');

  // Os ids: uuid em minúsculas, sem repetir no programa e de nenhum outro curso
  const ids = [...fases, ...missoes].map(x => x.id);
  if (!ids.every(id => typeof id === 'string' && UUID.test(id))) return recusa('22023', 'id', 'cada fase e cada missão do programa têm um id (uuid)');
  if (new Set(ids).size !== ids.length) return recusa('22023', 'id', 'o mesmo id aparece mais de uma vez no programa');
  if (contexto) {
    const outros = contexto.cursos.filter(c => c.sigla !== contexto.sigla);
    const fasesDeOutros = new Set(outros.flatMap(c => c.fases.map(f => f.id)));
    const missoesDeOutros = new Set(outros.flatMap(c => c.missoes.map(m => m.id)));
    if (fases.some(f => fasesDeOutros.has(f.id)) || missoes.some(m => missoesDeOutros.has(m.id))) {
      return recusa('22023', 'id', `o programa do curso ${contexto.sigla} traz uma fase ou uma missão de outro curso`);
    }
  }

  // Os campos, um de cada vez (o módulo, a regra, os requisitos, "dispensada" e "avaliação" podem faltar)
  if (!fases.every(f => nomeValido(f.nome))) return recusa('22023', 'nome', 'o nome da fase vai de 1 a 80 caracteres');
  if (!fases.every(f => f.modulo === undefined || f.modulo === null || nomeValido(f.modulo))) {
    return recusa('22023', 'modulo', 'o módulo da fase vai de 1 a 80 caracteres');
  }
  if (!fases.every(regraValida)) return recusa('22023', 'regra', 'a regra da fase é "ordem", "livre" ou "depois"');
  const idsDasFases = new Set(fases.map(f => f.id));
  if (!missoes.every(m => idsDasFases.has(m.fase))) return recusa('22023', 'fase', 'cada missão fica numa fase do programa');
  const semCodigo = missoes.find(m => typeof m.codigo !== 'string' || !codigoValido(m.codigo));
  if (semCodigo) {
    const { codigo } = semCodigo, texto = typeof codigo === 'string' ? codigo : codigo === undefined || codigo === null ? '' : JSON.stringify(codigo);
    return recusa('22023', 'codigo', `código de missão inválido: "${texto}" (letras maiúsculas, números, ponto e hífen, até 15)`);
  }
  if (!missoes.every(m => nomeValido(m.nome))) return recusa('22023', 'nome', 'o nome da missão vai de 1 a 80 caracteres');
  const foraDoTipo = missoes.find(m => typeof m.nb !== 'number' || !missaoERecursoValidos(m.mis, m.eq, horasDoBanco(m.nb)));
  if (foraDoTipo) {
    return recusa('22023', 'mis', `a missão ${foraDoTipo.codigo} não serve com esse recurso ou essas horas (o Ground é na Sala Ground, com 1,5 h; até 5 h)`);
  }
  if (!missoes.every(regraValida)) return recusa('22023', 'regra', 'a regra da missão é "ordem", "livre" ou "depois"');
  if (!missoes.every(m => simOuNao(m.dispensada))) return recusa('22023', 'dispensada', '"dispensada" é sim ou não');
  if (!missoes.every(m => simOuNao(m.avaliacao))) return recusa('22023', 'avaliacao', '"avaliação" é sim ou não');
  const erroDoTrecho = conferirTrechos(missoes);
  if (erroDoTrecho) return erroDoTrecho;

  // Os códigos não se repetem no programa nem com os das missões do curso que ficam fora dele (a retirada guarda o código)
  const codigos = missoes.map(m => m.codigo);
  const [repetido] = codigos.filter((codigo, i) => codigos.indexOf(codigo) !== i).sort();
  if (repetido !== undefined) return recusa('23505', 'codigo', `o código ${repetido} aparece mais de uma vez no programa`);
  const guardado = contexto && !contexto.substituir ? contexto.cursos.find(c => c.sigla === contexto.sigla) : null;
  const idsDasMissoes = new Set(missoes.map(m => m.id)), codigosDoPrograma = new Set(codigos);
  const [reservado] = (guardado ? guardado.missoes : []).filter(m => !idsDasMissoes.has(m.id) && codigosDoPrograma.has(m.codigo)).map(m => m.codigo).sort();
  if (reservado !== undefined) {
    return recusa('23505', 'codigo', `o código ${reservado} já é de outra missão do curso (a missão retirada guarda o código: volte com ela ao programa)`);
  }

  // "Depois de…": itens do programa, do mesmo tipo, sem repetir e sempre anteriores (nunca o próprio item); a regra
  // "depois" tem pelo menos um, as outras nenhum
  const { daFase, daMissao } = posicoes(fases, missoes);
  const antesDe = (posicao, p) => id => posicao.has(id) && posicao.get(id) < p;
  if (!fases.every(f => requerConfere(f, antesDe(daFase, daFase.get(f.id))))) {
    return recusa('22023', 'requer', 'uma fase "depois de…" espera fases anteriores do programa (e só ela espera)');
  }
  if (!missoes.every(m => requerConfere(m, antesDe(daMissao, daMissao.get(m.id))))) {
    return recusa('22023', 'requer', 'uma missão "depois de…" espera missões anteriores do programa (e só ela espera)');
  }

  // O código de uma missão com resultados não muda (o nome muda)
  const comResultados = new Set((guardado ? contexto.resultados : []).filter(r => r.curso === contexto.sigla).map(r => r.missao));
  const doConteudo = new Map(missoes.map(m => [m.id, m]));
  const [travado] = (guardado ? guardado.missoes : [])
    .filter(m => doConteudo.has(m.id) && doConteudo.get(m.id).codigo !== m.codigo && comResultados.has(m.codigo)).map(m => m.codigo).sort();
  if (travado !== undefined) return recusa('23514', 'codigo', `a missão ${travado} já tem resultados: o código não muda (o nome muda)`);
  return null;
}

// O programa como fica gravado (o que public.gravar_programa grava): as fases e as missões do conteúdo, na ordem das
// listas (a ordem é a posição: das fases, no programa; das missões, na fase), com os requisitos na ordem do curso. O que
// estava guardado e não veio fica, fora do programa (removida) e sem requisitos, com o resto como estava; na conversão
// (substituir), o guardado sai inteiro
function programaGravado(guardado, conteudo, substituir) {
  const { fases, missoes } = noPrograma(conteudo);
  const { daFase, daMissao, ordemNaFase } = posicoes(fases, missoes);
  const naOrdemDoCurso = (requer, posicao) => [...(requer || [])].sort((a, b) => posicao.get(a) - posicao.get(b));
  const novas = {
    fases: fases.map((f, i) => ({
      id: f.id, nome: f.nome, modulo: f.modulo ?? null, ordem: i, regra: f.regra ?? 'ordem', requer: naOrdemDoCurso(f.requer, daFase), removida: false
    })),
    missoes: missoes.map(m => ({
      id: m.id, fase: m.fase, codigo: m.codigo, nome: m.nome, mis: m.mis, eq: m.eq, nb: horasDoBanco(m.nb), ordem: ordemNaFase.get(m.id),
      regra: m.regra ?? 'ordem', requer: naOrdemDoCurso(m.requer, daMissao), dispensada: m.dispensada ?? false, avaliacao: m.avaliacao ?? false,
      removida: false, ...(m.trecho ? { trecho: m.trecho } : {})
    }))
  };
  if (substituir || !guardado) return novas;
  const ficamFora = (guardados, vieram) => {
    const ids = new Set(vieram.map(x => x.id));
    return guardados.filter(x => !ids.has(x.id)).map(x => ({ ...x, requer: [], removida: true }));
  };
  return { fases: [...novas.fases, ...ficamFora(guardado.fases, fases)], missoes: [...novas.missoes, ...ficamFora(guardado.missoes, missoes)] };
}

const porId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// O curso na ordem em que o banco devolve (public.programa_do_curso): as fases do programa, depois as retiradas, cada
// grupo pela ordem e pelo id; as missões do mesmo jeito, pela ordem da fase delas, depois pela própria
function naOrdemDoBanco(curso) {
  const ordemDaFase = new Map(curso.fases.map(f => [f.id, f.ordem]));
  return {
    ...curso,
    fases: [...curso.fases].sort((a, b) => retiradasNoFim(a, b) || porId(a, b)),
    missoes: [...curso.missoes].sort((a, b) => a.removida - b.removida || ordemDaFase.get(a.fase) - ordemDaFase.get(b.fase) || a.ordem - b.ordem
      || porId(a, b))
  };
}

// Grava o curso inteiro como public.salvar_curso: a sigla, a versão lida (0 cria o curso), o conteúdo (o nome, se está
// ativo, as fases e as missões, na ordem) e a descrição da alteração, de quem gravou (autor) e quando (agora, em ISO).
// estado: o que está guardado ({ cursos, resultados, cadastro }). Recusa (lança um erro com code e campo) como o
// servidor, na ordem dele: o formato do cadastro (antes do formato dos cursos, os programas esperam a conversão), a
// descrição, o curso, a sigla ou a versão lida e o programa. Não muda o estado: devolve os cursos como ficam, a versão
// registrada (alteracao) e o que o servidor responde (retorno: a versão nova e a hora)
export function gravarCurso(estado, { sigla, versaoLida, conteudo, descricao, autor = null, agora = new Date().toISOString() }) {
  const { cursos = [], resultados = [], cadastro = null } = estado;
  if (cadastro && formatoDoCadastro(cadastro) < FORMATO_DOS_CURSOS) {
    throw recusa('PT409', 'formato', 'os programas ainda estão sendo trazidos do cadastro; recarregue a página');
  }
  const texto = String(descricao ?? '');
  if ([...texto].length < 1 || [...texto].length > LIMITE_DA_DESCRICAO) throw recusa('22023', 'descricao', 'a descrição da alteração vai de 1 a 500 caracteres');
  const curso = comoJson(conteudo);
  const erro = validarCurso(curso, { sigla, versaoLida, cursos, resultados });
  if (erro) throw erro;
  const guardado = cursos.find(c => c.sigla === sigla) || null;
  const versao = guardado ? guardado.versao + 1 : 1;
  // O curso novo vai para o fim da lista dos cursos
  const ordem = guardado ? guardado.ordem : Math.min(Math.max(-1, ...cursos.map(c => c.ordem)) + 1, 999);
  const novo = naOrdemDoBanco({ sigla, nome: curso.nome, ordem, ativo: curso.ativo, versao, ...programaGravado(guardado, curso, false) });
  return {
    cursos: guardado ? cursos.map(c => (c === guardado ? novo : c)) : [...cursos, novo],
    alteracao: { curso: sigla, versao, descricao: texto, registrado_em: agora, registrado_por: autor },
    retorno: { versao, atualizado_em: agora }
  };
}

// O texto único de um valor JSON (as chaves dos objetos em ordem): os valores que o banco acha iguais (jsonb) dão o mesmo
const canonico = v => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : ehObjeto(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
    : JSON.stringify(v));

// As missões do programa (código, nome, tipo, recurso e horas), na ordem do curso, sem as retiradas, como
// public.assinatura_do_programa: compara o programa trazido do cadastro com o guardado
function assinatura(curso) {
  const doPrograma = v => comoLista(v).filter(x => !(ehObjeto(x) && x.removida === true));
  const missoes = doPrograma(curso.missoes);
  const daFase = (m, f) => ehObjeto(m) && ehObjeto(f) && m.fase !== undefined && f.id !== undefined && canonico(m.fase) === canonico(f.id);
  return canonico(doPrograma(curso.fases).flatMap(f => missoes.filter(m => daFase(m, f))
    .map(m => [m.codigo ?? null, m.nome ?? null, m.mis ?? null, m.eq ?? null, typeof m.nb === 'number' ? horasDoBanco(m.nb) : m.nb ?? null])));
}

// A conversão única do programa guardado no cadastro, como public.importar_cursos: programas é o que o app manda (os
// cursos de programaDoLegado); versaoDoCadastro, a versão do cadastro que o app leu (0 sem cadastro). Com o cadastro já
// no formato dos cursos, não grava nada, nunca mais (0); com o cadastro alterado depois da leitura, PT409. Cada curso que
// existe, na ordem da lista, recebe o programa inteiro no lugar do guardado (que é apagado), menos o que já é igual ao
// guardado; o curso que não existe fica de fora. Uma recusa desfaz tudo. Devolve os cursos como ficam, as versões
// registradas e quantas missões vieram
export function importarProgramas(estado, { programas, versaoDoCadastro, autor = null, agora = new Date().toISOString() }) {
  const { cursos = [], cadastro = null } = estado;
  if (cadastro && formatoDoCadastro(cadastro) >= FORMATO_DOS_CURSOS) return { cursos, alteracoes: [], retorno: 0 };
  if ((cadastro ? cadastro.versao ?? 0 : 0) !== versaoDoCadastro) throw recusa('PT409', null, 'o cadastro foi alterado depois da leitura; recarregue a página');
  const recebidos = comoJson(programas);
  if (!Array.isArray(recebidos)) throw recusa('22023', 'limite', 'os programas vão numa lista');
  let atuais = cursos, trazidas = 0;
  const alteracoes = [];
  for (const programa of recebidos) {
    const guardado = ehObjeto(programa) ? atuais.find(c => c.sigla === programa.sigla) : null;
    if (!guardado || assinatura(programa) === assinatura(naOrdemDoBanco(guardado))) continue;
    const erro = conferirPrograma(programa, { sigla: guardado.sigla, cursos: atuais, substituir: true });
    if (erro) throw erro;
    const novo = naOrdemDoBanco({ ...guardado, versao: guardado.versao + 1, ...programaGravado(guardado, programa, true) });
    const n = novo.missoes.length;
    atuais = atuais.map(c => (c === guardado ? novo : c));
    alteracoes.push({
      curso: novo.sigla, versao: novo.versao, descricao: `Programa trazido do cadastro (${n} ${n === 1 ? 'missão' : 'missões'})`, registrado_em: agora,
      registrado_por: autor
    });
    trazidas += n;
  }
  return { cursos: atuais, alteracoes, retorno: trazidas };
}

// Os programas como o servidor devolve (public.programa_dos_cursos): os cursos na ordem, cada um com as fases e as
// missões na ordem do banco, se cada missão já tem resultados (algum registro do código no curso) e as últimas 20
// alterações do programa, a mais recente primeiro. alteracoes: as versões registradas ({ curso, versao, descricao,
// registrado_em, registrado_por }), na ordem em que foram registradas
export function programaComResultados({ cursos, resultados = [], alteracoes = [] }) {
  const comResultados = new Set(resultados.map(r => `${r.curso}|${r.missao}`));
  return [...cursos].sort((a, b) => a.ordem - b.ordem || (a.sigla < b.sigla ? -1 : a.sigla > b.sigla ? 1 : 0)).map(c => {
    const curso = naOrdemDoBanco(c);
    return {
      ...curso,
      missoes: curso.missoes.map(m => ({ ...m, comResultados: comResultados.has(`${c.sigla}|${m.codigo}`) })),
      alteracoes: alteracoes.filter(a => a.curso === c.sigla).slice(-ALTERACOES_POR_CURSO).reverse()
        .map(a => ({ versao: a.versao, descricao: a.descricao, registrado_em: a.registrado_em, registrado_por: a.registrado_por }))
    };
  });
}

// A edição do programa na aba Cursos ----------------------------------------------------------------------------------
// Cada operação recebe o curso como a tela o tem (o de S.programa: as fases e as missões, também as tiradas do programa)
// e devolve o curso como fica, num objeto novo (o recebido não muda), ou null quando não há o que mudar. As ordens vêm
// renumeradas como o servidor grava (a da fase no programa; a da missão na fase), e conteudoDoCurso dá o que vai para a
// gravação do curso inteiro (salvar_curso)

// As fases e as missões do programa (sem as tiradas), na ordem do curso
function programaDoCurso(curso) {
  const { fases, porFase } = percursoDoCurso(curso);
  return { fases: [...fases], missoes: fases.flatMap(f => porFase.get(f.id)) };
}

// O curso com estas fases e estas missões no programa, nesta ordem; as tiradas do programa (as de antes e as que saem
// agora) ficam fora dele, como estavam
function comPrograma(curso, fases, missoes, saem = []) {
  const { ordemNaFase } = posicoes(fases, missoes);
  return {
    ...curso,
    fases: [...fases.map((f, i) => ({ ...f, ordem: i })), ...curso.fases.filter(f => f.removida)],
    missoes: [...missoes.map(m => ({ ...m, ordem: ordemNaFase.get(m.id) })), ...saem, ...curso.missoes.filter(m => m.removida)]
  };
}

// O que vai para a gravação do curso inteiro (salvar_curso): o nome, se está ativo, as fases e as missões do programa, na
// ordem (a posição na lista é a ordem); as tiradas do programa não vão (o servidor as mantém fora dele)
export function conteudoDoCurso(curso) {
  const { fases, missoes } = programaDoCurso(curso);
  return {
    nome: curso.nome,
    ativo: curso.ativo,
    fases: fases.map(({ id, nome, modulo, regra, requer }) => ({ id, nome, modulo, regra, requer: [...requer] })),
    missoes: missoes.map(({ id, fase, codigo, nome, mis, eq, nb, regra, requer, dispensada, avaliacao, trecho }) => ({
      id, fase, codigo, nome, mis, eq, nb, regra, requer: [...requer], dispensada, avaliacao, ...(trecho ? { trecho } : {})
    }))
  };
}

// O código da missão nova: o seguinte ao da missão anterior da fase, no mesmo formato (TMA-05 → TMA-06, AVP-SOLO-05 →
// AVP-SOLO-06), quando ele está livre no curso; senão, o próximo número livre do curso (PP-01, PP-02…). As missões
// tiradas do programa contam: o código delas continua reservado
function codigoNovo(curso, anterior) {
  const r = anterior && /^(.*?)(\d+)$/.exec(anterior.codigo);
  const seguinte = r && `${r[1]}${String(Number(r[2]) + 1).padStart(r[2].length, '0')}`;
  if (seguinte && codigoValido(seguinte) && !curso.missoes.some(m => m.codigo === seguinte)) return seguinte;
  return novaMissaoDoCurso(curso.sigla, curso.missoes.map(m => ({ id: m.codigo }))).id;
}

// "+ Missão": a missão nova entra no fim da fase (sem fase, na última; o curso sem nenhuma ganha a "Fase 1"), depois das
// anteriores, com o tipo de missão, o recurso e as horas da missão anterior da fase (senão, um voo local de 1 h no C152)
// e, como nome, o código. Devolve o curso e a missão nova; null quando a fase não está no programa
export function incluirMissao(curso, faseId = null, gerarId = novoId) {
  const programa = programaDoCurso(curso);
  let fase = faseId ? programa.fases.find(f => f.id === faseId) : programa.fases.at(-1);
  if (faseId && !fase) return null;
  const fases = [...programa.fases];
  if (!fase) {
    fase = { id: gerarId(), nome: `Fase ${fases.length + 1}`, modulo: null, ordem: fases.length, regra: 'ordem', requer: [], removida: false };
    fases.push(fase);
  }
  const daFase = f => programa.missoes.filter(m => m.fase === f.id);
  const anterior = daFase(fase).at(-1) || null;
  const codigo = codigoNovo(curso, anterior);
  const { mis, eq, nb } = anterior || novaMissaoDoCurso(curso.sigla, []);
  const missao = {
    id: gerarId(), fase: fase.id, codigo, nome: codigo, mis, eq, nb, ordem: 0, regra: 'ordem', requer: [], dispensada: false,
    avaliacao: false, removida: false, comResultados: false
  };
  const novo = comPrograma(curso, fases, fases.flatMap(f => (f.id === fase.id ? [...daFase(f), missao] : daFase(f))));
  return { curso: novo, missao: novo.missoes.find(m => m.id === missao.id) };
}

// Um campo de uma missão do programa: o código (em maiúsculas; o nome que era o código acompanha), o nome (sem os
// espaços a mais, até 80 caracteres; vazio, vale o código), o tipo de missão (o recurso fica, se o tipo o aceita, senão
// vai para o padrão dele; o Ground fica com 1,5 h), o recurso ou as horas. null quando nada muda
export function mudarMissao(curso, id, campo, valor) {
  const m = curso.missoes.find(x => x.id === id && !x.removida);
  if (!m) return null;
  let novo;
  if (campo === 'codigo') {
    const codigo = String(valor).trim().toUpperCase();
    novo = { ...m, codigo, nome: m.nome === m.codigo ? codigo : m.nome };
  } else if (campo === 'nome') {
    novo = { ...m, nome: nomeCurto(valor) || m.codigo };
  } else if (campo === 'mis') {
    if (typeof valor !== 'string' || !Object.hasOwn(MIS, valor)) return null;
    const tipo = MIS[valor];
    // O trecho do Noturno sai com o tipo Noturno
    novo = { ...(valor === 'Noturno' ? m : semTrecho(m)), mis: valor, eq: tipo.eq.includes(m.eq) ? m.eq : tipo.defEq, nb: tipo.isGround ? GROUND_DURATION_H : m.nb };
  } else if (campo === 'eq' || campo === 'nb') {
    novo = { ...m, [campo]: valor };
  } else {
    return null;
  }
  if (['codigo', 'nome', 'mis', 'eq', 'nb'].every(c => novo[c] === m[c])) return null;
  return { ...curso, missoes: curso.missoes.map(x => (x === m ? novo : x)) };
}

// ↑ e ↓: a missão troca de lugar com a vizinha da mesma fase (passo -1 sobe, 1 desce); null na ponta da fase
export function moverMissao(curso, id, passo) {
  const { fases, missoes } = programaDoCurso(curso);
  const m = missoes.find(x => x.id === id);
  if (!m) return null;
  const daFase = missoes.filter(x => x.fase === m.fase);
  const i = daFase.indexOf(m), j = i + passo;
  if (j < 0 || j >= daFase.length) return null;
  [daFase[i], daFase[j]] = [daFase[j], daFase[i]];
  return comPrograma(curso, fases, fases.flatMap(f => (f.id === m.fase ? daFase : missoes.filter(x => x.fase === f.id))));
}

// "Tirar do programa": a missão sai do programa e da próxima missão, mas fica no curso (os resultados continuam com o
// código dela, que segue reservado), sem requisitos, como o servidor a guarda. Quem esperava por ela ("depois de…")
// deixa de esperar; sem mais nenhuma, volta a "depois das anteriores"
export function retirarMissao(curso, id) {
  const { fases, missoes } = programaDoCurso(curso);
  const m = missoes.find(x => x.id === id);
  if (!m) return null;
  const semEla = x => {
    if (!x.requer.includes(id)) return x;
    const requer = x.requer.filter(r => r !== id);
    return { ...x, requer, regra: x.regra === 'depois' && !requer.length ? 'ordem' : x.regra };
  };
  return comPrograma(curso, fases, missoes.filter(x => x !== m).map(semEla),
    [{ ...m, regra: m.regra === 'depois' ? 'ordem' : m.regra, requer: [], removida: true }]);
}

// A próxima missão pelas regras do programa (js/progresso.js): os exemplos do cronograma do PP (o desenho dos cursos,
// §4.8 e apêndice A), as regras de cada fase e missão, o progresso, as missões do dia, o que a Demanda e Alunos mostram
// (js/views/etapas.js) e a paridade com a próxima missão de antes (o programa do cadastro numa fase só, todas as missões
// depois das anteriores).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDoAluno, proximasMissoes, progressoNoCurso, missoesDoDia } from '../../js/progresso.js';
import { programaDoLegado, percursoDoCurso, indiceDoPrograma } from '../../js/programa.js';
import { situacaoPorMissao, situacaoDa } from '../../js/resultados.js';
import { normalizarCursos, codigoValido } from '../../js/cursos.js';
import { MIS } from '../../js/config.js';
import { setS } from '../../js/state.js';
import { etapaNaDemanda, progressoDoAluno } from '../../js/views/etapas.js';
import { cursoPP } from '../helpers/programa-pp.js';
import { mulberry32 } from '../helpers/cenarios.js';

const ALUNO = 1000;
const PP = cursoPP();
const ORDEM = percursoDoCurso(PP).missoes.map(m => m.codigo);
const id = codigo => PP.missoes.find(m => m.codigo === codigo).id;
const faseId = numero => PP.fases.find(f => f.nome.startsWith(`Fase ${numero} `)).id;
// As missões do curso até esta (inclusive), na ordem do curso; as das fases (pelo número impresso)
const ate = codigo => ORDEM.slice(0, ORDEM.indexOf(codigo) + 1);
const dasFases = (...numeros) => ORDEM.filter(c => numeros.map(faseId).includes(PP.missoes.find(m => m.codigo === c).fase));

let ultimoRegistro = 0;
const reg = (missao, resultado = 'aprovado', aluno = ALUNO, curso = 'PP') => ({ id: ++ultimoRegistro, aluno, curso, missao, resultado, data: '2026-11-14', voo: null });
const aprovadas = codigos => situacaoPorMissao(codigos.map(c => reg(c)));
const ids = codigos => new Set(codigos.map(id));
const candidatas = (mapa, opcoes, curso = PP) => estadoDoAluno(curso, mapa, ALUNO, opcoes).candidatas.map(m => m.codigo);
const estado = (mapa, codigo, opcoes) => estadoDoAluno(PP, mapa, ALUNO, opcoes).porMissao.get(id(codigo));
const padrao = (mapa, opcoes) => proximasMissoes(PP, mapa, ALUNO, opcoes).padrao.codigo;

// A preferência do recurso escolhido (o desenho, §4.4): 2 quando o programa faz a missão no tipo dele; 1 quando a
// missão também serve nele; 0 quando não serve. O PR-JPL (o A152 Aerobat, só Parafuso) só serve para a SPIN
const naLinha = tipo => m => (m.eq === tipo ? 2 : MIS[m.mis].eq.includes(tipo) ? 1 : 0);
const noPrJpl = m => (m.mis === 'Parafuso' ? 2 : 0);

describe('A próxima missão no cronograma do PP', () => {
  it('o cronograma (apêndice A): 9 fases na ordem impressa, 47 missões (46 contam), 45 h, códigos e missões válidos', () => {
    assert.deepEqual(PP.fases.map(f => f.nome.slice(0, 6)), ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 7', 'Fase 8', 'Fase 6', 'Fase 9']);
    assert.deepEqual(PP.fases.filter(f => f.regra !== 'ordem').map(f => [f.regra, f.requer]), [['depois', [faseId(4)]]]);
    const contam = PP.missoes.filter(m => !m.dispensada);
    assert.deepEqual([PP.missoes.length, contam.length, Math.round(contam.reduce((h, m) => h + m.nb, 0) * 10) / 10], [47, 46, 45]);
    assert.deepEqual(PP.missoes.filter(m => m.regra !== 'ordem' || m.dispensada || m.avaliacao).map(m => [m.codigo, m.regra, m.dispensada, m.avaliacao]),
      [['CAP-04', 'ordem', false, true], ['TMA-05', 'ordem', false, true], ['PE-03', 'ordem', false, true], ['PE-04', 'livre', false, false], ['ADAPT-C152', 'ordem', true, false]]);
    assert.ok(PP.missoes.every(m => codigoValido(m.codigo) && MIS[m.mis].eq.includes(m.eq)));
    assert.deepEqual(ORDEM.slice(ORDEM.indexOf('END-SOLO'), ORDEM.indexOf('END-SOLO') + 5), ['END-SOLO', 'AVP-SOLO-01', 'SOLO-01', 'AVP-SOLO-02', 'SOLO-02'], 'o AV PROF. antes de cada SOLO');
  });

  it('nada aprovado: só a IN-01; o voo noturno espera a Fase 4', () => {
    const mapa = aprovadas([]);
    assert.deepEqual(candidatas(mapa), ['IN-01']);
    assert.equal(padrao(mapa), 'IN-01');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'IN-01', 'no C172: a IN-01, que também serve nele');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'IN-01', 'no PR-JPL nenhuma serve: a primeira');
    assert.deepEqual(estado(mapa, 'TSL-01'), { estado: 'bloqueada', faltam: dasFases(4).map(id), fasesFechadas: [faseId(4)], dependeDe: [] });
    assert.deepEqual(estado(mapa, 'IN-02'), { estado: 'bloqueada', faltam: [id('IN-01')], fasesFechadas: [], dependeDe: [] });
  });

  it('Fases 1 a 4 aprovadas: a NAV-01, a SPIN (livre na Fase 5) e o noturno (depois da Fase 4, impresso depois da 8)', () => {
    const mapa = aprovadas(dasFases(1, 2, 3, 4));
    assert.deepEqual(candidatas(mapa), ['NAV-01', 'PE-04', 'TSL-01']);
    assert.equal(padrao(mapa), 'NAV-01');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'TSL-01', 'no C172: o noturno, que o programa faz nele');
    assert.equal(padrao(mapa, { preferencia: naLinha('C152') }), 'NAV-01', 'num C152 comum: a primeira');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'PE-04', 'no PR-JPL: a SPIN');
    // A Fase 7 espera a Fase 5 inteira
    assert.deepEqual(estado(mapa, 'END-SOLO'), { estado: 'bloqueada', faltam: dasFases(5).map(id), fasesFechadas: [faseId(5)], dependeDe: [] });
    assert.deepEqual(estado(mapa, 'NAV-02').faltam, [id('NAV-01')], 'a SPIN não esperou ninguém; a NAV-02 espera a NAV-01');
  });

  it('a Fase 5 sem a SPIN: a SPIN e o noturno; a Fase 7 espera a Fase 5 completa, com a SPIN', () => {
    const mapa = aprovadas(ate('PE-03'));
    assert.deepEqual(candidatas(mapa), ['PE-04', 'TSL-01']);
    assert.equal(padrao(mapa), 'PE-04');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'TSL-01');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'PE-04');
    assert.deepEqual(estado(mapa, 'END-SOLO'), { estado: 'bloqueada', faltam: [id('PE-04')], fasesFechadas: [faseId(5)], dependeDe: [] });
  });

  it('a ADAPTAÇÃO (dispensada) conta como feita e nunca é sugerida: a Fase 7 começa pelo ENDOSSO SOLO', () => {
    const mapa = aprovadas(dasFases(1, 2, 3, 4, 5));
    assert.deepEqual(candidatas(mapa), ['END-SOLO', 'TSL-01']);
    assert.equal(estado(mapa, 'ADAPT-C152').estado, 'dispensada');
    // Com a Fase 7 aprovada (sem a ADAPTAÇÃO), a Fase 8 abre
    const comA7 = aprovadas(dasFases(1, 2, 3, 4, 5, 7).filter(c => c !== 'ADAPT-C152'));
    assert.deepEqual(candidatas(comA7), ['END-SOLO-NAV', 'TSL-01']);
    assert.equal(padrao(comA7), 'END-SOLO-NAV');
    assert.equal(padrao(comA7, { preferencia: naLinha('C172') }), 'TSL-01');
    assert.equal(padrao(comA7, { preferencia: noPrJpl }), 'END-SOLO-NAV', 'no PR-JPL nenhuma serve: a primeira');
  });

  it('a Fase 9 espera a Fase 6 (o noturno) e a Fase 8', () => {
    const semNoturno = aprovadas(dasFases(1, 2, 3, 4, 5, 7, 8));
    assert.deepEqual(candidatas(semNoturno), ['TSL-01']);
    assert.equal(padrao(semNoturno, { preferencia: naLinha('C172') }), 'TSL-01');
    assert.deepEqual(estado(semNoturno, 'AVX-CQ'), { estado: 'bloqueada', faltam: dasFases(6).map(id), fasesFechadas: [faseId(6)], dependeDe: [] });
    const semANav = aprovadas(dasFases(1, 2, 3, 4, 5, 7, 6));
    assert.deepEqual(candidatas(semANav), ['END-SOLO-NAV']);
    assert.deepEqual(estado(semANav, 'AVX-CQ').fasesFechadas, [faseId(8)]);
    assert.deepEqual(estado(aprovadas(dasFases(1, 2, 3, 4, 5, 7)), 'AVX-CQ').fasesFechadas, [faseId(8), faseId(6)]);
    assert.deepEqual(candidatas(aprovadas(dasFases(1, 2, 3, 4, 5, 7, 8, 6))), ['AVX-CQ']);
  });

  it('a reprovada volta a ser a próxima e as seguintes esperam por ela; vale o último resultado', () => {
    const reprovada = situacaoPorMissao([...ate('TMA-02').map(c => reg(c)), reg('TMA-03', 'reprovado')]);
    assert.deepEqual(candidatas(reprovada), ['TMA-03']);
    assert.deepEqual(estado(reprovada, 'TMA-04'), { estado: 'bloqueada', faltam: [id('TMA-03')], fasesFechadas: [], dependeDe: [] });
    // Aprovada e depois reprovada; aprovada por engano e desfeita (pendente): ela volta
    assert.deepEqual(candidatas(situacaoPorMissao([...ate('TMA-03').map(c => reg(c)), reg('TMA-03', 'reprovado')])), ['TMA-03']);
    assert.deepEqual(candidatas(situacaoPorMissao([...ate('TMA-03').map(c => reg(c)), reg('TMA-03', 'pendente')])), ['TMA-03']);
    // Os resultados de outro aluno ou de outro curso não contam
    assert.deepEqual(candidatas(situacaoPorMissao([reg('IN-01', 'aprovado', 1001), reg('IN-01', 'aprovado', ALUNO, 'PC')])), ['IN-01']);
  });
});

describe('Encadear missões no mesmo dia', () => {
  it('a missão de um voo que termina antes libera a seguinte sob condição; a de um voo depois, não', () => {
    const mapa = aprovadas(ate('TMA-03'));
    // A TMA-04 hoje às 08:20, o voo novo às 10:10: a TMA-05 depende do resultado da TMA-04
    const antes = estadoDoAluno(PP, mapa, ALUNO, { planejadas: ids(['TMA-04']), exceto: ids(['TMA-04']) });
    assert.deepEqual(antes.candidatas.map(m => m.codigo), ['TMA-05']);
    assert.deepEqual(antes.porMissao.get(id('TMA-05')), { estado: 'condicional', faltam: [], fasesFechadas: [], dependeDe: [id('TMA-04')] });
    assert.equal(antes.porMissao.get(id('TMA-04')).estado, 'no-dia');
    // A TMA-04 voa depois (ou ao mesmo tempo) do voo novo: a TMA-05 fica bloqueada
    const depois = estadoDoAluno(PP, mapa, ALUNO, { exceto: ids(['TMA-04']) });
    assert.deepEqual(depois.candidatas, []);
    assert.deepEqual(depois.porMissao.get(id('TMA-05')), { estado: 'bloqueada', faltam: [id('TMA-04')], fasesFechadas: [], dependeDe: [] });
    // Aprovada ou dispensada vale mais que "no dia" (repetir uma aprovada não a desfaz)
    const repetidas = estadoDoAluno(PP, mapa, ALUNO, { planejadas: ids(['TMA-03', 'ADAPT-C152']), exceto: ids(['TMA-03', 'ADAPT-C152']) }).porMissao;
    assert.deepEqual([repetidas.get(id('TMA-03')).estado, repetidas.get(id('ADAPT-C152')).estado], ['aprovada', 'dispensada']);
  });

  it('a fase completa sob condição abre as que esperam por ela, também sob condição', () => {
    const mapa = aprovadas(ate('TMA-04'));
    const { porMissao, candidatas: lista } = estadoDoAluno(PP, mapa, ALUNO, { planejadas: ids(['TMA-05']), exceto: ids(['TMA-05']) });
    assert.deepEqual(lista.map(m => m.codigo), ['NAV-01', 'PE-04', 'TSL-01']);
    assert.deepEqual(porMissao.get(id('TSL-01')), { estado: 'condicional', faltam: [], fasesFechadas: [], dependeDe: [id('TMA-05')] });
    assert.equal(porMissao.get(id('NAV-01')).estado, 'condicional');
  });
});

describe('As regras de cada fase e missão', () => {
  // F1 (depois das anteriores): A1, A2 (livre na fase) e A3; F2 (desde o início do curso): B1 e B2; F3 (depois das
  // anteriores): C1 e C2 (depois de B1, de outra fase)
  const fase = (id, ordem, regra = 'ordem') => ({ id, nome: id, modulo: null, ordem, regra, requer: [], removida: false });
  const missao = (fase, codigo, ordem, regra = 'ordem', requer = []) => ({ id: `XX:${codigo}`, fase, codigo, nome: codigo, mis: 'Voo Local', eq: 'C152', nb: 1, ordem, regra, requer, dispensada: false, avaliacao: false, removida: false });
  const XX = { sigla: 'XX', nome: 'Teste', ordem: 3, ativo: true, fases: [fase('F1', 0), fase('F2', 1, 'livre'), fase('F3', 2)],
    missoes: [missao('F1', 'A1', 0), missao('F1', 'A2', 1, 'livre'), missao('F1', 'A3', 2), missao('F2', 'B1', 0), missao('F2', 'B2', 1), missao('F3', 'C1', 0), missao('F3', 'C2', 1, 'depois', ['XX:B1'])] };
  const doXX = codigos => situacaoPorMissao(codigos.map(c => reg(c, 'aprovado', ALUNO, 'XX')));

  it('a fase livre abre desde o início, e as seguintes não esperam por ela; a missão livre não espera nem é esperada na fase', () => {
    assert.deepEqual(candidatas(doXX([]), {}, XX), ['A1', 'A2', 'B1']);
    // A A3 espera só a A1: a livre, antes dela, não é esperada
    assert.deepEqual(candidatas(doXX(['A1']), {}, XX), ['A2', 'A3', 'B1']);
    // A fase termina com a livre também: a F3 espera a A2
    assert.deepEqual(candidatas(doXX(['A1', 'A3']), {}, XX), ['A2', 'B1']);
    assert.deepEqual(candidatas(doXX(['A1', 'A2', 'A3']), {}, XX), ['B1', 'C1']);
  });

  it('a missão "depois de" espera só as da lista, que podem ser de outra fase, e a fase dela aberta', () => {
    const { porMissao } = estadoDoAluno(XX, doXX(['A1', 'A2', 'A3']), ALUNO);
    assert.deepEqual(porMissao.get('XX:C2'), { estado: 'bloqueada', faltam: ['XX:B1'], fasesFechadas: [], dependeDe: [] });
    assert.deepEqual(candidatas(doXX(['A1', 'A2', 'A3', 'B1']), {}, XX), ['B2', 'C1', 'C2']);
    // A B1 aprovada não basta: a F3 ainda espera a F1
    assert.deepEqual(estadoDoAluno(XX, doXX(['A1', 'B1']), ALUNO).porMissao.get('XX:C2'),
      { estado: 'bloqueada', faltam: ['XX:A2', 'XX:A3'], fasesFechadas: ['F1'], dependeDe: [] });
  });

  it('a fase e a missão tiradas do programa não contam: nada espera por elas e elas nunca são sugeridas', () => {
    const curso = cursoPP();
    curso.missoes.find(m => m.codigo === 'NAV-01').removida = true;
    curso.fases.find(f => f.nome.startsWith('Fase 9 ')).removida = true;
    curso.missoes.find(m => m.codigo === 'AVX-CQ').removida = true;
    assert.deepEqual(candidatas(aprovadas(dasFases(1, 2, 3, 4)), {}, curso), ['NAV-02', 'PE-04', 'TSL-01']);
    const tudo = aprovadas(ORDEM.filter(c => !['NAV-01', 'AVX-CQ'].includes(c)));
    assert.deepEqual(candidatas(tudo, {}, curso), []);
    assert.deepEqual(progressoNoCurso(curso, tudo, ALUNO), { aprovadas: 44, total: 44, faseAtual: null, proxima: null, concluido: true });
    // Nem a lista "depois de…" espera por elas: a C2 (depois da B1, tirada) só espera a F3 abrir; a Fase 6 (depois da
    // Fase 4, tirada com as missões dela) abre desde o início
    const semB1 = { ...XX, missoes: XX.missoes.map(m => (m.codigo === 'B1' ? { ...m, removida: true } : m)) };
    assert.deepEqual(candidatas(doXX(['A1', 'A2', 'A3']), {}, semB1), ['B2', 'C1', 'C2']);
    const semF4 = cursoPP();
    semF4.fases.find(f => f.id === faseId(4)).removida = true;
    semF4.missoes.filter(m => m.fase === faseId(4)).forEach(m => { m.removida = true; });
    assert.deepEqual(candidatas(aprovadas([]), {}, semF4), ['IN-01', 'TSL-01']);
  });
});

describe('O progresso no curso', () => {
  it('as aprovadas sobre as que contam (a dispensada não conta), a fase em que o aluno está e a próxima', () => {
    const fase = numero => PP.fases.find(f => f.id === faseId(numero));
    assert.deepEqual(progressoNoCurso(PP, aprovadas([]), ALUNO), { aprovadas: 0, total: 46, faseAtual: fase(1), proxima: PP.missoes.find(m => m.codigo === 'IN-01'), concluido: false });
    const ate4 = progressoNoCurso(PP, aprovadas(dasFases(1, 2, 3, 4)), ALUNO);
    assert.deepEqual([ate4.aprovadas, ate4.faseAtual, ate4.proxima.codigo], [13, fase(5), 'NAV-01']);
    // O noturno aprovado antes da Fase 5: a fase continua a 5; o noturno conta
    const comNoturno = progressoNoCurso(PP, aprovadas([...dasFases(1, 2, 3, 4), ...dasFases(6)]), ALUNO);
    assert.deepEqual([comNoturno.aprovadas, comNoturno.faseAtual, comNoturno.proxima.codigo], [16, fase(5), 'NAV-01']);
    // Uma aprovada fora do programa (PP-99) e a dispensada aprovada não mudam a conta
    const tudo = progressoNoCurso(PP, aprovadas([...ORDEM, 'PP-99']), ALUNO);
    assert.deepEqual(tudo, { aprovadas: 46, total: 46, faseAtual: null, proxima: null, concluido: true });
  });
});

describe('As missões do dia (Demanda e agenda)', () => {
  it('as etapas dos pedidos do aluno que voam; o cancelado, o que não voa e o pedido que recebe a missão não contam', () => {
    const aluno = {
      id: ALUNO, fly: true, mis: 'Voo Local', etapa: 'TMA-01',
      extra: [{ mid: 1, fly: true, etapa: 'TMA-02' }, { mid: 2, fly: false, etapa: 'TMA-03' }, { mid: 3, fly: true, etapa: 'XX-99' }, { mid: 4, fly: true }, { mid: 5, fly: true, etapa: 'NOT' }]
    };
    const fStatus = { '1000_1_1': 'Cancelado', '1000_5_1': 'Atrasado' };
    assert.deepEqual(missoesDoDia(PP, aluno, { fStatus }), ids(['TMA-01', 'NOT']));
    assert.deepEqual(missoesDoDia(PP, aluno, { fStatus, mid: 0 }), ids(['NOT']), 'o pedido principal recebe a missão');
    assert.deepEqual(missoesDoDia(PP, aluno, { mid: 5 }), ids(['TMA-01', 'TMA-02']), 'sem status, nenhum cancelado');
    assert.deepEqual(missoesDoDia(PP, { id: ALUNO, fly: false }), new Set());
  });
});

// Na tela (js/views/etapas.js), com o programa em S.programa: o botão da próxima missão na Demanda e o progresso em
// Alunos. Sem os resultados ou os programas, nada é inferido: nem Usar, nem progresso (antes, 0/N)
describe('Na Demanda e em Alunos', () => {
  const texto = html => html.replace(/<[^>]+>/g, '').trim();
  const pedido = (extra = {}) => ({ fly: true, mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: -1, pr: 3, ss: 1, ...extra });
  const aluno = (extra = {}) => ({ id: ALUNO, nm: 'Aluno 1000', curso: 'PP', ...pedido(), extra: [], ...extra });
  const abrir = (estado = {}) => setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [cursoPP()], ...estado });
  const usar = (stu, mid = 0) => texto(etapaNaDemanda(stu, mid ? stu.extra.find(x => x.mid === mid) : stu, mid));

  it('o progresso: as aprovadas sobre as que contam, a fase (quando o curso tem mais de uma) e a próxima', () => {
    abrir({ resultados: { situacao: dasFases(1, 2, 3, 4).map(c => reg(c)), doDia: [] } });
    assert.equal(texto(progressoDoAluno(aluno())), '13/46 · Fase 5 · próxima NAV-01');
    assert.equal(usar(aluno()), 'Próxima: NAV-01 · Usar');
    const plano = programaDoLegado(normalizarCursos({ PP: ['PP-01', 'PP-02'].map(c => ({ id: c, mis: 'Voo Local' })) }), (s, c) => `${s}:${c}`);
    abrir({ programa: plano, resultados: { situacao: [reg('PP-01')], doDia: [] } });
    assert.equal(texto(progressoDoAluno(aluno())), '1/2 · próxima PP-02', 'numa fase só, sem a fase');
    assert.equal(progressoDoAluno(aluno({ curso: 'INVA' })), '', 'o curso sem missões');
  });

  it('sem os resultados ou os programas, nem Usar nem progresso', () => {
    for (const parte of ['resultados', 'cursos', 'cursos-pendentes']) {
      abrir({ indisponiveis: [parte] });
      assert.deepEqual([progressoDoAluno(aluno()), usar(aluno())], ['', ''], parte);
    }
    abrir({ indisponiveis: ['horas'] });
    assert.deepEqual([texto(progressoDoAluno(aluno())), usar(aluno())], ['0/46 · Fase 1 · próxima IN-01', 'Próxima: IN-01 · Usar']);
  });

  it('na missão extra, a missão do pedido principal conta como feita; cancelado o voo, ela volta', () => {
    const comExtra = aluno({ etapa: 'IN-01', extra: [pedido({ mid: 1 })] });
    abrir();
    assert.equal(usar(comExtra, 1), 'Próxima: IN-02 · Usar');
    abrir({ fStatus: { '1000_0_1': 'Cancelado' } });
    assert.equal(usar(comExtra, 1), 'Próxima: IN-01 · Usar');
  });
});

// A referência: a próxima missão e o progresso de antes das fases (js/resultados.js até esta mudança), copiados como
// eram. O programa do cadastro convertido (uma fase, todas as missões depois das anteriores) dá sempre a mesma resposta
function proximaMissao(programa, mapa, aluno, curso, { exceto = [] } = {}) {
  const missoes = (programa && curso && programa[curso]) || [];
  return missoes.find(m => situacaoDa(mapa, aluno, curso, m.id) !== 'aprovado' && !exceto.includes(m.id)) || null;
}

function progresso(programa, mapa, aluno, curso) {
  const missoes = (programa && curso && programa[curso]) || [];
  return { aprovadas: missoes.filter(m => situacaoDa(mapa, aluno, curso, m.id) === 'aprovado').length, total: missoes.length };
}

describe('A paridade com a próxima missão de antes', () => {
  it('o programa do cadastro: a primeira ainda não aprovada (a reprovada volta), menos as do dia; o progresso conta as aprovadas', () => {
    const missao = id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 });
    const programa = programaDoLegado(normalizarCursos({ PP: ['PP-01', 'PP-02', 'PP-03'].map(missao) }), (s, c) => `${s}:${c}`);
    const [pp, , inva] = programa;
    const mapa = situacaoPorMissao([reg('PP-01'), reg('PP-02', 'reprovado'), reg('PP-03'), reg('PP-99')]);
    const proxima = (aluno, doDia = []) => {
      const ids = new Set(doDia.map(c => `PP:${c}`));
      const { padrao } = proximasMissoes(pp, mapa, aluno, { planejadas: ids, exceto: ids });
      return padrao && padrao.codigo;
    };
    assert.equal(proxima(ALUNO), 'PP-02', 'a reprovada volta');
    assert.equal(proxima(1001), 'PP-01');
    assert.equal(proxima(ALUNO, ['PP-02']), null, 'pula as missões que o aluno já tem no dia');
    assert.equal(proxima(1001, ['PP-01']), 'PP-02');
    assert.equal(proximasMissoes(pp, situacaoPorMissao(['PP-01', 'PP-02', 'PP-03'].map(c => reg(c))), ALUNO).padrao, null, 'tudo aprovado');
    assert.equal(proximasMissoes(inva, mapa, ALUNO).padrao, null, 'sem programa');
    const { aprovadas: a, total } = progressoNoCurso(pp, mapa, ALUNO);
    assert.deepEqual([a, total], [2, 3], 'a PP-99, fora do programa, não conta');
    assert.deepEqual(progressoNoCurso(inva, mapa, ALUNO), { aprovadas: 0, total: 0, faseAtual: null, proxima: null, concluido: true });
  });

  it('200 históricos e missões do dia sorteados: a mesma próxima missão e o mesmo progresso', () => {
    const MISSOES = ['Voo Local', 'Navegação', 'Noturno', 'Ground C152', 'Simulador'];
    const falhas = [];
    for (let semente = 1; semente <= 200; semente++) {
      const r = mulberry32(semente);
      const int = (a, b) => a + Math.floor(r() * (b - a + 1));
      const codigos = Array.from({ length: int(0, 12) }, (_, i) => `PP-${String(i + 1).padStart(2, '0')}`);
      const cursos = normalizarCursos({ PP: codigos.map(c => ({ id: c, nome: c, mis: MISSOES[int(0, MISSOES.length - 1)], eq: 'C152', nb: int(1, 3) })), PC: [{ id: 'PP-01', mis: 'Voo Local' }] });
      const algum = () => [...codigos, 'PP-99'][int(0, codigos.length)];
      // O aluno avança na ordem (as primeiras aprovadas), com reprovações, enganos desfeitos e resultados fora de ordem,
      // de outro aluno e de outro curso no meio
      const avancou = codigos.slice(0, int(0, codigos.length)).map(c => reg(c));
      const ruido = Array.from({ length: int(0, 12) }, () => reg(algum(), ['aprovado', 'reprovado', 'pendente'][int(0, 2)], int(0, 4) ? ALUNO : 1001, int(0, 5) ? 'PP' : 'PC'));
      const mapa = situacaoPorMissao([...avancou, ...ruido]);
      const exceto = [...new Set(Array.from({ length: int(0, 3) }, algum))];

      const programa = programaDoLegado(cursos, (s, c) => `${s}:${c}`);
      const indice = indiceDoPrograma(programa), curso = indice.curso('PP');
      const doDia = new Set(exceto.map(c => indice.missaoPorCodigo('PP', c)).filter(Boolean).map(m => m.id));
      const antes = proximaMissao(cursos, mapa, ALUNO, 'PP', { exceto });
      const agora = proximasMissoes(curso, mapa, ALUNO, { planejadas: doDia, exceto: doDia });
      const semDia = proximaMissao(cursos, mapa, ALUNO, 'PP'), contaAntes = progresso(cursos, mapa, ALUNO, 'PP');
      const conta = progressoNoCurso(curso, mapa, ALUNO);
      try {
        assert.equal(agora.padrao && agora.padrao.codigo, antes && antes.id, 'a próxima');
        assert.deepEqual(agora.candidatas.map(m => m.codigo), antes ? [antes.id] : [], 'as candidatas');
        assert.deepEqual([conta.aprovadas, conta.total, conta.proxima && conta.proxima.codigo, conta.concluido],
          [contaAntes.aprovadas, contaAntes.total, semDia && semDia.id, !semDia], 'o progresso');
      } catch (e) {
        falhas.push(`semente ${semente}: ${e.message}`);
      }
    }
    assert.deepEqual(falhas, []);
  });
});

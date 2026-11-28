// A próxima missão pelas regras do programa (js/progresso.js): os exemplos do cronograma do PP (o modelo do app, em
// js/modelos-de-curso.js: o desenho dos cursos, §4.8 e apêndice A, com o Noturno em trechos), as regras de cada fase e
// missão, o progresso, o motivo de uma missão estar fora da ordem, as missões do dia, o que a Demanda, Alunos e a escala
// mostram (js/views/etapas.js) e a paridade com a próxima missão de antes (o programa do cadastro numa fase só, todas as
// missões depois das anteriores).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDoAluno, proximasMissoes, progressoNoCurso, missoesDoDia, motivoDoBloqueio, paraColocarNoCurso, alvosDaColocacao } from '../../js/progresso.js';
import { programaDoLegado, percursoDoCurso, indiceDoPrograma, novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { situacaoPorMissao, situacaoDa } from '../../js/resultados.js';
import { normalizarCursos, codigoValido } from '../../js/cursos.js';
import { MIS } from '../../js/config.js';
import { setS } from '../../js/state.js';
import { etapaNaDemanda, progressoDoAluno, outraMissaoDoPedido, cursoDoResultado, confirmacaoDaMissao, botaoForaDaOrdem } from '../../js/views/etapas.js';
import { mulberry32 } from '../helpers/cenarios.js';
import { importar } from '../helpers/importar.js';
import { aluno as alunoDoCenario } from '../helpers/montar.js';
import { ligarFuncionalidades } from '../helpers/funcionalidades.js';

// O que a Demanda, Alunos e a escala mostram com o progresso ligado (desligado: funcionalidades.test.js)
before(() => ligarFuncionalidades('progresso'));
after(() => ligarFuncionalidades());

const ALUNO = 1000;
// O cronograma do PP como o curso PP, com os ids tirados da sigla e da chave (PP:F4, PP:TSL-01), novo a cada chamada (os
// testes podem mudá-lo)
const cursoPP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, (s, c) => `${s}:${c}`).curso;
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
  it('o cronograma (o modelo do app, conferido em modelos-de-curso.test.js): o AV PROF. antes de cada SOLO; o Noturno em trechos', () => {
    assert.deepEqual(PP.fases.map(f => f.nome.slice(0, 6)), ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 7', 'Fase 8', 'Fase 6', 'Fase 9']);
    assert.ok(PP.missoes.every(m => codigoValido(m.codigo) && MIS[m.mis].eq.includes(m.eq)));
    assert.deepEqual(ORDEM.slice(ORDEM.indexOf('END-SOLO'), ORDEM.indexOf('END-SOLO') + 5), ['END-SOLO', 'AVP-SOLO-01', 'SOLO-01', 'AVP-SOLO-02', 'SOLO-02'], 'o AV PROF. antes de cada SOLO');
    assert.deepEqual(dasFases(6).map(c => [c, PP.missoes.find(m => m.codigo === c).trecho]), [['TSL-01', 'ida'], ['NOT', 'noite'], ['TSL-02', 'volta']]);
  });

  it('nada aprovado: só a IN-01; o voo noturno espera a Fase 4 (pela noite; os translados vão com ela)', () => {
    const mapa = aprovadas([]);
    assert.deepEqual(candidatas(mapa), ['IN-01']);
    assert.equal(padrao(mapa), 'IN-01');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'IN-01', 'no C172: a IN-01, que também serve nele');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'IN-01', 'no PR-JPL nenhuma serve: a primeira');
    assert.deepEqual(estado(mapa, 'NOT'), { estado: 'bloqueada', faltam: dasFases(4).map(id), fasesFechadas: [faseId(4)], dependeDe: [] });
    assert.deepEqual(estado(mapa, 'TSL-01'), { estado: 'no-noturno', noturno: id('NOT'), faltam: [], fasesFechadas: [], dependeDe: [] });
    assert.deepEqual(estado(mapa, 'IN-02'), { estado: 'bloqueada', faltam: [id('IN-01')], fasesFechadas: [], dependeDe: [] });
  });

  it('Fases 1 a 4 aprovadas: a NAV-01, a SPIN (livre na Fase 5) e o noturno (depois da Fase 4, impresso depois da 8)', () => {
    const mapa = aprovadas(dasFases(1, 2, 3, 4));
    assert.deepEqual(candidatas(mapa), ['NAV-01', 'PE-04', 'NOT']);
    assert.equal(padrao(mapa), 'NAV-01');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'NOT', 'no C172: o noturno, que o programa faz nele');
    assert.equal(padrao(mapa, { preferencia: naLinha('C152') }), 'NAV-01', 'num C152 comum: a primeira');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'PE-04', 'no PR-JPL: a SPIN');
    // A Fase 7 espera a Fase 5 inteira
    assert.deepEqual(estado(mapa, 'END-SOLO'), { estado: 'bloqueada', faltam: dasFases(5).map(id), fasesFechadas: [faseId(5)], dependeDe: [] });
    assert.deepEqual(estado(mapa, 'NAV-02').faltam, [id('NAV-01')], 'a SPIN não esperou ninguém; a NAV-02 espera a NAV-01');
  });

  it('a Fase 5 sem a SPIN: a SPIN e o noturno; a Fase 7 espera a Fase 5 completa, com a SPIN', () => {
    const mapa = aprovadas(ate('PE-03'));
    assert.deepEqual(candidatas(mapa), ['PE-04', 'NOT']);
    assert.equal(padrao(mapa), 'PE-04');
    assert.equal(padrao(mapa, { preferencia: naLinha('C172') }), 'NOT');
    assert.equal(padrao(mapa, { preferencia: noPrJpl }), 'PE-04');
    assert.deepEqual(estado(mapa, 'END-SOLO'), { estado: 'bloqueada', faltam: [id('PE-04')], fasesFechadas: [faseId(5)], dependeDe: [] });
  });

  it('a ADAPTAÇÃO (dispensada) conta como feita e nunca é sugerida: a Fase 7 começa pelo ENDOSSO SOLO', () => {
    const mapa = aprovadas(dasFases(1, 2, 3, 4, 5));
    assert.deepEqual(candidatas(mapa), ['END-SOLO', 'NOT']);
    assert.equal(estado(mapa, 'ADAPT-C152').estado, 'dispensada');
    // Com a Fase 7 aprovada (sem a ADAPTAÇÃO), a Fase 8 abre
    const comA7 = aprovadas(dasFases(1, 2, 3, 4, 5, 7).filter(c => c !== 'ADAPT-C152'));
    assert.deepEqual(candidatas(comA7), ['END-SOLO-NAV', 'NOT']);
    assert.equal(padrao(comA7), 'END-SOLO-NAV');
    assert.equal(padrao(comA7, { preferencia: naLinha('C172') }), 'NOT');
    assert.equal(padrao(comA7, { preferencia: noPrJpl }), 'END-SOLO-NAV', 'no PR-JPL nenhuma serve: a primeira');
  });

  it('a Fase 9 espera a Fase 6 (o noturno: a noite, com os translados) e a Fase 8', () => {
    const semNoturno = aprovadas(dasFases(1, 2, 3, 4, 5, 7, 8));
    assert.deepEqual(candidatas(semNoturno), ['NOT']);
    assert.equal(padrao(semNoturno, { preferencia: naLinha('C172') }), 'NOT');
    assert.deepEqual(estado(semNoturno, 'AVX-CQ'), { estado: 'bloqueada', faltam: [id('NOT')], fasesFechadas: [faseId(6)], dependeDe: [] });
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
    assert.deepEqual(lista.map(m => m.codigo), ['NAV-01', 'PE-04', 'NOT']);
    assert.deepEqual(porMissao.get(id('NOT')), { estado: 'condicional', faltam: [], fasesFechadas: [], dependeDe: [id('TMA-05')] });
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
    assert.deepEqual(candidatas(aprovadas(dasFases(1, 2, 3, 4)), {}, curso), ['NAV-02', 'PE-04', 'NOT']);
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
    assert.deepEqual(candidatas(aprovadas([]), {}, semF4), ['IN-01', 'NOT']);
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

// O motivo de uma missão estar fora da ordem (a escolha dela pede confirmação; o histórico registra): a Demanda o mostra
// em "Outra missão do curso"
describe('Por que a missão está fora da ordem', () => {
  const motivo = (mapa, codigo, opcoes, curso = PP) => {
    const m = curso.missoes.find(x => x.codigo === codigo);
    return motivoDoBloqueio(curso, m, estadoDoAluno(curso, mapa, ALUNO, opcoes).porMissao.get(m.id), { mapa, aluno: ALUNO });
  };

  it('a bloqueada: as missões que faltam, até três; mais que isso, as duas primeiras e quantas mais', () => {
    const nada = aprovadas([]);
    assert.deepEqual(['IN-02', 'CT-01', 'IN-01'].map(c => motivo(nada, c)), ['falta IN-01', 'faltam IN-01 e IN-02', '']);
    // A Fase 5 (depois das anteriores) espera a Fase 4: a SPIN, livre na fase, só espera a TMA-05
    const semTMA05 = aprovadas(ate('TMA-04'));
    assert.deepEqual(['PE-04', 'NAV-02', 'CAP-01'].map(c => motivo(semTMA05, c)), ['falta TMA-05', 'faltam TMA-05 e NAV-01', 'já aprovada']);
    assert.equal(motivo(aprovadas(ate('CAP-01')), 'CAP-04'), 'faltam CAP-02 e CAP-03');
    assert.equal(motivo(aprovadas(ate('IN-02')), 'CAP-04'), 'faltam CT-01, CT-02 e mais 3');
    // A Fase 9 espera a Fase 8 e a Fase 6, na ordem do curso: as 11 missões da 8 e o Noturno (pela noite)
    assert.equal(motivo(aprovadas(dasFases(1, 2, 3, 4, 5, 7)), 'AVX-CQ'), 'faltam END-SOLO-NAV, AVP-NSOLO-01 e mais 10');
  });

  it('na fase que abre depois de outras escolhidas ("depois de…"), a fase fechada e o que falta nela', () => {
    assert.equal(motivo(aprovadas([]), 'NOT'), 'a Fase 6 abre depois da Fase 4: faltam TMA-01, TMA-02 e mais 3');
    assert.equal(motivo(aprovadas(ate('TMA-03')), 'NOT'), 'a Fase 6 abre depois da Fase 4: faltam TMA-04 e TMA-05');
    assert.equal(motivo(aprovadas(ate('TMA-04')), 'NOT'), 'a Fase 6 abre depois da Fase 4: falta TMA-05');
    // Com a Fase 4 completa, a fase abriu e o Noturno está liberado (a noite espera o que a ida espera); os translados
    // nunca vão sozinhos: nenhum motivo para eles
    assert.deepEqual(['NOT', 'TSL-01', 'TSL-02'].map(c => motivo(aprovadas(dasFases(1, 2, 3, 4)), c)), ['', '', '']);
    // Duas fases fechadas na lista: as duas, na ordem do curso
    const fase = (id, ordem, nome, regra = 'ordem', requer = []) => ({ id, nome, modulo: null, ordem, regra, requer, removida: false });
    const missao = (fase, codigo, ordem) => ({ id: `YY:${codigo}`, fase, codigo, nome: codigo, mis: 'Voo Local', eq: 'C152', nb: 1, ordem, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false });
    const YY = { sigla: 'YY', nome: 'Teste', ordem: 3, ativo: true, fases: [fase('F1', 0, 'Fase 1 – A'), fase('F2', 1, 'Fase 2 – B', 'livre'), fase('F3', 2, 'Fase 3 – C', 'depois', ['F1', 'F2'])],
      missoes: [missao('F1', 'A1', 0), missao('F2', 'B1', 0), missao('F3', 'C1', 0)] };
    assert.equal(motivo(situacaoPorMissao([]), 'C1', {}, YY), 'a Fase 3 abre depois da Fase 1 e da Fase 2: faltam A1 e B1');
  });

  it('a reprovada, com a data do último resultado; a já aprovada, a dispensada, a do outro voo do dia; a condicional, nenhum', () => {
    const reprovada = situacaoPorMissao([...ate('TMA-02').map(c => reg(c)), reg('TMA-03', 'reprovado')]);
    assert.equal(motivo(reprovada, 'TMA-04'), 'falta TMA-03 (reprovada em 14/11)');
    assert.equal(motivo(reprovada, 'TMA-05'), 'faltam TMA-03 (reprovada em 14/11) e TMA-04');
    const mapa = aprovadas(ate('TMA-03'));
    assert.deepEqual(['TMA-01', 'ADAPT-C152'].map(c => motivo(mapa, c)), ['já aprovada', 'dispensada']);
    const noDia = { planejadas: ids(['TMA-04']), exceto: ids(['TMA-04']) };
    assert.deepEqual(['TMA-04', 'TMA-05'].map(c => motivo(mapa, c, noDia)), ['já em outro voo do dia', ''], 'a TMA-05 depende do resultado da TMA-04');
  });

  // Os resultados de todos os alunos só crescem: a data da reprovada vem do registro do aluno, achado pela chave. Antes, a
  // lista da Demanda percorria os resultados de todos a cada missão de cada aluno (o tempo crescia com o quadrado deles)
  it('a data da reprovada é a do registro do aluno no curso, achado sem percorrer os resultados dos outros', () => {
    const percorrer = () => { throw new Error('percorreu os resultados de todos os alunos'); };
    class SoPelaChave extends Map {}
    for (const metodo of ['values', 'entries', 'keys', 'forEach', Symbol.iterator]) SoPelaChave.prototype[metodo] = percorrer;
    const mapa = new SoPelaChave(situacaoPorMissao([...ate('TMA-02').map(c => reg(c)), { ...reg('TMA-03', 'reprovado', 1001), data: '2026-11-12' },
      { ...reg('TMA-03', 'reprovado', ALUNO, 'PC'), data: '2026-11-13' }, { ...reg('TMA-03', 'reprovado'), data: '2026-11-16' }]));
    assert.equal(motivo(mapa, 'TMA-04'), 'falta TMA-03 (reprovada em 16/11)');
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

// Na tela (js/views/etapas.js), com o programa em S.programa: o botão da próxima missão e a lista das outras missões do
// curso na Demanda, o progresso em Alunos e o curso do resultado na escala. Sem os resultados ou os programas, nada é
// inferido: nem Usar, nem outra missão, nem progresso (antes, 0/N)
describe('Na Demanda e em Alunos', () => {
  const texto = html => html.replace(/<[^>]+>/g, '').trim();
  const pedido = (extra = {}) => ({ fly: true, mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: -1, pr: 3, ss: 1, ...extra });
  const aluno = (extra = {}) => ({ id: ALUNO, nm: 'Aluno 1000', curso: 'PP', ...pedido(), extra: [], ...extra });
  const abrir = (estado = {}) => setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [cursoPP()], ...estado });
  const naDemanda = (stu, mid) => etapaNaDemanda(stu, mid ? stu.extra.find(x => x.mid === mid) : stu, mid);
  // O texto do botão Usar do pedido ('' sem ele)
  const usar = (stu, mid = 0) => texto((/<button[^>]*data-act="usar-proxima".*?<\/button>/.exec(naDemanda(stu, mid)) || [''])[0]);
  // A lista "Outra missão do curso" do pedido: cada grupo com o texto dos itens (sem a lista, null)
  const outras = (stu, mid = 0) => {
    const lista = /<select[^>]*data-f="outra-missao"[^>]*>(.*?)<\/select>/.exec(naDemanda(stu, mid));
    return lista && Object.fromEntries([...lista[1].matchAll(/<optgroup label="([^"]*)">(.*?)<\/optgroup>/g)]
      .map(([, rotulo, itens]) => [rotulo, [...itens.matchAll(/<option value="[^"]*">([^<]*)<\/option>/g)].map(o => o[1])]));
  };
  const FORA = 'Fora da ordem (pede confirmação)';

  it('o progresso: as aprovadas sobre as que contam, a fase (quando o curso tem mais de uma) e a próxima', () => {
    abrir({ resultados: { situacao: dasFases(1, 2, 3, 4).map(c => reg(c)), doDia: [] } });
    assert.equal(texto(progressoDoAluno(aluno())), '13/46 · Fase 5 · próxima NAV-01');
    assert.equal(usar(aluno()), 'Próxima: NAV-01 · Usar');
    const plano = programaDoLegado(normalizarCursos({ PP: ['PP-01', 'PP-02'].map(c => ({ id: c, mis: 'Voo Local' })) }), (s, c) => `${s}:${c}`);
    abrir({ programa: plano, resultados: { situacao: [reg('PP-01')], doDia: [] } });
    assert.equal(texto(progressoDoAluno(aluno())), '1/2 · próxima PP-02', 'numa fase só, sem a fase');
    assert.equal(progressoDoAluno(aluno({ curso: 'INVA' })), '', 'o curso sem missões');
  });

  it('sem os resultados ou os programas, nem Usar, nem outra missão, nem progresso', () => {
    for (const parte of ['resultados', 'cursos', 'cursos-pendentes']) {
      abrir({ indisponiveis: [parte] });
      assert.deepEqual([progressoDoAluno(aluno()), naDemanda(aluno())], ['', ''], parte);
      assert.equal(outraMissaoDoPedido(aluno(), aluno(), 0, 'IN-01'), null, parte);
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

  it('outra missão do curso: as liberadas, que valem na hora, e as fora da ordem, com o motivo; a do próprio pedido não volta', () => {
    abrir({ resultados: { situacao: ate('TMA-04').map(c => reg(c)), doDia: [] } });
    const lista = outras(aluno());
    assert.deepEqual(Object.keys(lista), ['Liberadas no PP', FORA]);
    assert.deepEqual(lista['Liberadas no PP'], ['TMA-05 · Voo Local · C152 · 1 h']);
    // As 47 do programa, menos a TMA-05 (liberada) e os translados do Noturno (nunca vão sozinhos)
    assert.equal(lista[FORA].length, 44);
    const item = codigo => lista[FORA].find(t => t.startsWith(`${codigo} `));
    assert.deepEqual(['IN-01', 'PE-04', 'NAV-01', 'ADAPT-C152', 'NOT'].map(item), [
      'IN-01 · Voo Local · C152 · 1 h (já aprovada)',
      'PE-04 · Parafuso · C152 · 1 h (falta TMA-05)',
      'NAV-01 · Navegação · C152 · 01h30 (1,5 h) (falta TMA-05)',
      'ADAPT-C152 · Voo Local · C152 · 1 h (dispensada)',
      'NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h (a Fase 6 abre depois da Fase 4: falta TMA-05)'
    ]);
    // Com a TMA-05 no pedido principal: ela sai da lista dele, e as que esperam por ela continuam fora da ordem
    const comTMA05 = aluno({ etapa: 'TMA-05', cursoDaEtapa: 'PP', extra: [pedido({ mid: 1 })] });
    assert.deepEqual(outras(comTMA05)['Liberadas no PP'], undefined);
    assert.equal(outras(comTMA05)[FORA].some(t => t.startsWith('TMA-05 ')), false);
    // Na missão extra, a TMA-05 está no outro voo do dia: as que esperam por ela dependem do resultado
    assert.deepEqual(outras(comTMA05, 1)['Liberadas no PP'], [
      'NAV-01 · Navegação · C152 · 01h30 (1,5 h) — depende do resultado de TMA-05',
      'PE-04 · Parafuso · C152 · 1 h — depende do resultado de TMA-05',
      'NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h — depende do resultado de TMA-05'
    ]);
    assert.equal(outras(comTMA05, 1)[FORA].find(t => t.startsWith('TMA-05 ')), 'TMA-05 · Voo Local · C152 · 1 h (já em outro voo do dia)');
    // O aluno sem curso, o curso sem programa: nenhuma lista
    assert.deepEqual([outras(aluno({ curso: undefined })), outras(aluno({ curso: 'INVA' }))], [null, null]);
  });

  it('a missão escolhida na lista: liberada ou fora da ordem, com o motivo; a que não está na lista, nenhuma', () => {
    abrir({ resultados: { situacao: ate('TMA-04').map(c => reg(c)), doDia: [] } });
    const missao = codigo => PP.missoes.find(m => m.codigo === codigo).id;
    const escolha = (stu, codigo) => {
      const r = outraMissaoDoPedido(stu, stu, 0, codigo);
      return r && { ...r, missao: r.missao.id };
    };
    assert.deepEqual(escolha(aluno(), 'TMA-05'), { missao: missao('TMA-05'), curso: 'PP', liberada: true, motivo: '', encerrado: false });
    assert.deepEqual(escolha(aluno(), 'PE-04'), { missao: missao('PE-04'), curso: 'PP', liberada: false, motivo: 'falta TMA-05', encerrado: false });
    assert.deepEqual([escolha(aluno(), 'XX-99'), escolha(aluno({ etapa: 'PE-04', cursoDaEtapa: 'PP' }), 'PE-04')], [null, null]);
    // A missão do pedido é de outro curso (o aluno trocou de curso): a do mesmo código no curso dele continua na lista
    assert.equal(escolha(aluno({ etapa: 'PE-04', cursoDaEtapa: 'PC' }), 'PE-04').liberada, false);
    // A confirmação: o botão, o botão armado e os motivos
    assert.deepEqual(confirmacaoDaMissao(outraMissaoDoPedido(aluno(), aluno(), 0, 'PE-04')), { botao: 'Usar PE-04 fora da ordem', armado: 'Confirmar: PE-04 fora da ordem', motivos: 'falta TMA-05' });
  });

  // O curso encerrado é uma das regras do curso que pedem confirmação (desenho §4.9), na Demanda como no agendamento: a
  // próxima missão (Usar) e as liberadas também pedem
  it('no curso encerrado, a próxima missão e as liberadas pedem confirmação, com o curso nos motivos', () => {
    abrir({ resultados: { situacao: ate('TMA-04').map(c => reg(c)), doDia: [] }, programa: [{ ...cursoPP(), ativo: false }] });
    const stu = aluno({ fly: false });
    const usarHtml = naDemanda(stu, 0);
    assert.equal(usar(stu), 'Próxima: TMA-05 · Usar');
    assert.match(usarHtml, /title="TMA-05: [^"]* \(curso PP encerrado: pede confirmação\)"/);
    assert.deepEqual(Object.keys(outras(stu)), ['Liberadas no PP (curso encerrado: pede confirmação)', FORA]);
    const liberada = outraMissaoDoPedido(stu, stu, 0, 'TMA-05');
    assert.deepEqual([liberada.liberada, liberada.encerrado], [true, true]);
    assert.deepEqual(confirmacaoDaMissao(liberada), { botao: 'Usar TMA-05 do curso encerrado', armado: 'Confirmar: TMA-05 do curso encerrado', motivos: 'curso PP encerrado' });
    assert.deepEqual(confirmacaoDaMissao(outraMissaoDoPedido(stu, stu, 0, 'PE-04')).motivos, 'falta TMA-05; curso PP encerrado');
    // O botão que espera a confirmação: o nome diz o aluno e os motivos; a dica é a do curso encerrado
    const botao = botaoForaDaOrdem(stu, liberada);
    assert.match(botao, /data-dica="curso-encerrado" data-dica-caso="TMA-05: curso PP encerrado" aria-label="Usar TMA-05 do curso encerrado para Aluno 1000 \(curso PP encerrado\)">Usar TMA-05 do curso encerrado<\/button>$/);
    // Com o curso ativo, nada disso
    abrir({ resultados: { situacao: ate('TMA-04').map(c => reg(c)), doDia: [] } });
    assert.doesNotMatch(naDemanda(stu, 0), /encerrado/);
    assert.equal(outraMissaoDoPedido(stu, stu, 0, 'TMA-05').encerrado, false);
  });

  it('o resultado vai para o curso da missão do pedido (o aluno trocou de curso), enquanto o pedido é essa missão', () => {
    const voo = { fKey: '1000_0_1', stuId: ALUNO, mid: 0, etapa: 'NAV-01', s: 'Aluno 1000' };
    abrir({ stu: [aluno({ curso: 'PC', etapa: 'NAV-01', cursoDaEtapa: 'PP' })] });
    assert.equal(cursoDoResultado(voo), 'PP');
    // A escala gravada é de antes de o pedido mudar de missão; o pedido de antes do curso da missão: o curso do aluno
    assert.equal(cursoDoResultado({ ...voo, etapa: 'NAV-02' }), 'PC');
    abrir({ stu: [aluno({ curso: 'PC', etapa: 'NAV-01' })] });
    assert.equal(cursoDoResultado(voo), 'PC');
    abrir({ stu: [aluno({ curso: undefined, etapa: 'NAV-01' })] });
    assert.equal(cursoDoResultado(voo), null);
    abrir({ stu: [] });
    assert.equal(cursoDoResultado(voo), null, 'o aluno saiu do cadastro');
  });
});

// O Noturno em trechos (js/programa.js): a ida (TSL-01), a noite (NOT) e a volta (TSL-02) são um voo só. Num pedaço do
// PP com a Fase 6 (o noturno) impressa depois da Fase 8 e aberta depois da Fase 4, a próxima missão oferece o Noturno uma
// vez, pela noite (com os translados no nome); os translados nunca vão sozinhos e estão feitos quando a noite está
describe('O Noturno em trechos: TSL-01, NOT e TSL-02 num voo só', () => {
  const fase = (numero, ordem, campos = {}) => ({ id: `NT:F${numero}`, nome: `Fase ${numero}`, modulo: null, ordem, regra: 'ordem', requer: [], removida: false, ...campos });
  const missao = (numero, codigo, ordem, campos = {}) => ({
    id: `NT:${codigo}`, fase: `NT:F${numero}`, codigo, nome: codigo, mis: 'Voo Local', eq: 'C152', nb: 1, ordem, regra: 'ordem', requer: [], dispensada: false,
    avaliacao: false, removida: false, ...campos
  });
  const noturno = (codigo, ordem, trecho, nb = 1) => missao(6, codigo, ordem, { mis: 'Noturno', eq: 'C172', nb, trecho });
  // As Fases 4, 5 (a SPIN livre), 7, 8, 6 (o Noturno, depois da Fase 4) e 9; com trechos, ou com os translados como
  // navegações do C172 e a noite sem trecho (como o cronograma de antes)
  const curso = ({ trechos = true, mudar = {} } = {}) => ({
    sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true,
    fases: [fase(4, 0), fase(5, 1), fase(7, 2), fase(8, 3), fase(6, 4, { regra: 'depois', requer: ['NT:F4'] }), fase(9, 5)],
    missoes: [
      missao(4, 'TMA-01', 0), missao(4, 'TMA-02', 1), missao(5, 'NAV-01', 0, { mis: 'Navegação', nb: 1.5 }), missao(5, 'PE-04', 1, { mis: 'Parafuso', regra: 'livre' }),
      missao(7, 'END-SOLO', 0), missao(8, 'END-SOLO-NAV', 0, { mis: 'Navegação' }),
      ...(trechos ? [noturno('TSL-01', 0, 'ida'), noturno('NOT', 1, 'noite', 3), noturno('TSL-02', 2, 'volta')]
        : [missao(6, 'TSL-01', 0, { mis: 'Navegação', eq: 'C172' }), noturno('NOT', 1, undefined, 3), missao(6, 'TSL-02', 2, { mis: 'Navegação', eq: 'C172' })]),
      missao(9, 'AVX-CQ', 0, { mis: 'Navegação', nb: 2 })
    ].map(m => ({ ...m, ...mudar[m.codigo] }))
  });
  const NT = curso();
  const nid = codigo => `NT:${codigo}`;
  const mapaDe = registros => situacaoPorMissao(registros.map(([codigo, resultado = 'aprovado']) => reg(codigo, resultado)));
  const feitas = (...codigos) => mapaDe(codigos.map(c => [c]));
  const ATE_A_8 = ['TMA-01', 'TMA-02', 'NAV-01', 'PE-04', 'END-SOLO', 'END-SOLO-NAV'];
  const codigosDe = lista => lista.map(m => m.codigo);
  const noNoturno = { estado: 'no-noturno', noturno: nid('NOT'), faltam: [], fasesFechadas: [], dependeDe: [] };

  it('o Noturno é oferecido uma vez, pela noite: depois da Fase 4, embora impresso depois da Fase 8; os translados, nunca sozinhos', () => {
    const nada = estadoDoAluno(NT, feitas(), ALUNO);
    assert.deepEqual(codigosDe(nada.candidatas), ['TMA-01']);
    assert.deepEqual(nada.porMissao.get(nid('NOT')), { estado: 'bloqueada', faltam: [nid('TMA-01'), nid('TMA-02')], fasesFechadas: ['NT:F4'], dependeDe: [] });
    assert.deepEqual([nada.porMissao.get(nid('TSL-01')), nada.porMissao.get(nid('TSL-02'))], [noNoturno, noNoturno]);
    // A Fase 4 aprovada: a NAV-01, a SPIN e o Noturno (a noite espera o que a ida espera, não a ida)
    const ate4 = estadoDoAluno(NT, feitas('TMA-01', 'TMA-02'), ALUNO);
    assert.deepEqual(codigosDe(ate4.candidatas), ['NAV-01', 'PE-04', 'NOT']);
    assert.deepEqual(ate4.porMissao.get(nid('NOT')), { estado: 'liberada', faltam: [], fasesFechadas: [], dependeDe: [] });
    assert.equal(proximasMissoes(NT, feitas('TMA-01', 'TMA-02'), ALUNO, { preferencia: m => (m.eq === 'C172' ? 2 : 1) }).padrao.codigo, 'NOT', 'no C172');
    // Até a Fase 8: só o Noturno; a Fase 9 espera por ele (a noite, não os translados)
    const ate8 = estadoDoAluno(NT, feitas(...ATE_A_8), ALUNO);
    assert.deepEqual(codigosDe(ate8.candidatas), ['NOT']);
    assert.deepEqual(ate8.porMissao.get(nid('AVX-CQ')), { estado: 'bloqueada', faltam: [nid('NOT')], fasesFechadas: ['NT:F6'], dependeDe: [] });
  });

  it('a noite aprovada (ou dispensada) faz o Noturno: os translados contam feitos no Noturno, sem resultado deles', () => {
    const comNoturno = feitas(...ATE_A_8, 'NOT');
    const { porMissao, candidatas: lista } = estadoDoAluno(NT, comNoturno, ALUNO);
    assert.deepEqual(codigosDe(lista), ['AVX-CQ']);
    assert.deepEqual([porMissao.get(nid('NOT')).estado, porMissao.get(nid('TSL-01')), porMissao.get(nid('TSL-02'))], ['aprovada', noNoturno, noNoturno]);
    const fase9 = NT.fases.find(f => f.id === 'NT:F9');
    assert.deepEqual(progressoNoCurso(NT, comNoturno, ALUNO), { aprovadas: 9, total: 10, faseAtual: fase9, proxima: NT.missoes.at(-1), concluido: false });
    assert.equal(progressoNoCurso(NT, feitas(...ATE_A_8, 'NOT', 'AVX-CQ'), ALUNO).concluido, true);
    // A noite reprovada: o Noturno volta; o resultado de um translado (de antes) não faz o Noturno nem conta sozinho
    assert.deepEqual(codigosDe(estadoDoAluno(NT, mapaDe([...ATE_A_8.map(c => [c]), ['NOT'], ['NOT', 'reprovado']]), ALUNO).candidatas), ['NOT']);
    const soATsl = feitas(...ATE_A_8, 'TSL-01', 'TSL-02');
    assert.deepEqual(codigosDe(estadoDoAluno(NT, soATsl, ALUNO).candidatas), ['NOT']);
    assert.equal(progressoNoCurso(NT, soATsl, ALUNO).aprovadas, 6);
    // A noite dispensada: o Noturno está feito, e os translados contam
    const dispensado = curso({ mudar: { NOT: { dispensada: true } } });
    assert.deepEqual(codigosDe(estadoDoAluno(dispensado, feitas(...ATE_A_8), ALUNO).candidatas), ['AVX-CQ']);
    assert.equal(progressoNoCurso(dispensado, feitas(...ATE_A_8), ALUNO).aprovadas, 8);
  });

  it('no mesmo dia: o Noturno marcado não volta, e a missão seguinte depende do resultado da noite', () => {
    const { porMissao, candidatas: lista } = estadoDoAluno(NT, feitas(...ATE_A_8), ALUNO, { planejadas: new Set([nid('NOT')]), exceto: new Set([nid('NOT')]) });
    assert.deepEqual(codigosDe(lista), ['AVX-CQ']);
    assert.deepEqual([porMissao.get(nid('NOT')).estado, porMissao.get(nid('TSL-01')).estado], ['no-dia', 'no-noturno']);
    assert.deepEqual(porMissao.get(nid('AVX-CQ')), { estado: 'condicional', faltam: [], fasesFechadas: [], dependeDe: [nid('NOT')] });
    // O pedido com o código de um translado (de antes) é o do Noturno: ele também não volta
    const comTranslado = estadoDoAluno(NT, feitas(...ATE_A_8), ALUNO, { planejadas: new Set([nid('TSL-01')]), exceto: new Set([nid('TSL-01')]) });
    assert.deepEqual([comTranslado.porMissao.get(nid('NOT')).estado, codigosDe(comTranslado.candidatas)], ['no-dia', ['AVX-CQ']]);
  });

  it('a ida dispensada: o Noturno espera o que a noite espera; sem translados, a noite é uma missão como as outras', () => {
    // A ida dispensada esperaria o ENDOSSO SOLO: o Noturno não espera
    const idaDispensada = curso({ mudar: { 'TSL-01': { dispensada: true, regra: 'depois', requer: [nid('END-SOLO')] } } });
    const { porMissao, candidatas: lista } = estadoDoAluno(idaDispensada, feitas('TMA-01', 'TMA-02'), ALUNO);
    assert.deepEqual(codigosDe(lista), ['NAV-01', 'PE-04', 'NOT']);
    assert.deepEqual([porMissao.get(nid('TSL-01')).estado, porMissao.get(nid('TSL-02')).estado], ['dispensada', 'no-noturno']);
    const soANoite = curso({ mudar: { 'TSL-01': { trecho: undefined, mis: 'Navegação' }, 'TSL-02': { trecho: undefined, mis: 'Navegação' } } });
    assert.deepEqual(codigosDe(estadoDoAluno(soANoite, feitas('TMA-01', 'TMA-02'), ALUNO).candidatas), ['NAV-01', 'PE-04', 'TSL-01']);
  });

  it('as fases sem trecho ficam como antes: 300 históricos sorteados dão o mesmo estado e as mesmas candidatas', () => {
    const SEM = curso({ trechos: false });
    // A Fase 6 (a do Noturno) e a 9 (que espera por ela) mudam de propósito
    const foraDa6e9 = m => !['NT:F6', 'NT:F9'].includes(m.fase);
    const codigos = NT.missoes.map(m => m.codigo);
    for (let semente = 1; semente <= 300; semente++) {
      const r = mulberry32(semente);
      const mapa = mapaDe(codigos.filter(() => r() < 0.5).map(c => [c, r() < 0.8 ? 'aprovado' : 'reprovado']));
      const doDia = new Set(codigos.filter(() => r() < 0.15).map(nid));
      const opcoes = { planejadas: doDia, exceto: doDia };
      const com = estadoDoAluno(NT, mapa, ALUNO, opcoes), sem = estadoDoAluno(SEM, mapa, ALUNO, opcoes);
      for (const m of NT.missoes.filter(foraDa6e9)) assert.deepEqual(com.porMissao.get(m.id), sem.porMissao.get(m.id), `semente ${semente}: ${m.codigo}`);
      assert.deepEqual(com.candidatas.filter(foraDa6e9).map(m => m.id), sem.candidatas.filter(foraDa6e9).map(m => m.id), `semente ${semente}`);
    }
  });

  it('na Demanda e em Alunos: a próxima é o Noturno, com os translados no nome; o pedido vai como a noite', () => {
    const texto = html => html.replace(/<[^>]+>/g, '').trim();
    // Na célula da Demanda: o texto do botão Usar e os itens do Noturno na lista "Outra missão do curso"
    const usar = html => texto((/<button[^>]*data-act="usar-proxima".*?<\/button>/.exec(html) || [''])[0]);
    const doNoturno = html => [...html.matchAll(/<option value="[^"]+">([^<]*)<\/option>/g)].map(o => o[1]).filter(t => /^(TSL|NOT)\b/.test(t));
    const stu = (extra = {}) => ({ id: ALUNO, nm: 'Aluno 1000', curso: 'PP', fly: true, mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: -1, pr: 3, ss: 1, extra: [], ...extra });
    const abrir = programa => setS({ stu: [], fStatus: {}, resultados: { situacao: ATE_A_8.map(c => reg(c)), doDia: [] }, programa: [programa] });
    abrir(curso());
    const celula = etapaNaDemanda(stu(), stu(), 0);
    assert.equal(usar(celula), 'Próxima: NOT (com TSL-01 e TSL-02) · Usar');
    assert.match(celula, /title="NOT: NOT · Noturno · 4 h · C172"/);
    assert.equal(texto(progressoDoAluno(stu())), '6/10 · Fase 6 · próxima NOT (com TSL-01 e TSL-02)');
    // A lista "Outra missão do curso" também oferece o Noturno uma vez, pela noite e com os translados no nome
    assert.deepEqual(doNoturno(celula), ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h']);
    // Com o Noturno no pedido principal, a missão extra não recebe um translado: a próxima é a da Fase 9 (sob condição), e
    // a lista tem o Noturno só fora da ordem, pela noite
    const comNoturno = stu({ mis: 'Noturno', eq: 'C172', nb: 4, etapa: 'NOT', extra: [{ mid: 1, fly: true, mis: 'Voo Local', eq: 'C152', nb: 1, p1: 500, p2: -1, pr: 3, ss: 1 }] });
    const extra = etapaNaDemanda(comNoturno, comNoturno.extra[0], 1);
    assert.equal(usar(extra), 'Próxima: AVX-CQ · Usar');
    assert.deepEqual(doNoturno(extra), ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 4 h (já em outro voo do dia)']);
    // O translado dispensado não voa com a noite, e também não vai sozinho (antes, a lista o oferecia fora da ordem)
    abrir(curso({ mudar: { 'TSL-02': { dispensada: true } } }));
    const semVolta = etapaNaDemanda(stu(), stu(), 0);
    assert.equal(usar(semVolta), 'Próxima: NOT (com TSL-01) · Usar');
    assert.deepEqual(doNoturno(semVolta), ['NOT (com TSL-01) · Noturno · C172 · 4 h']);
    assert.equal(outraMissaoDoPedido(stu(), stu(), 0, 'TSL-02'), null);
  });

  it('na agenda: o pedido Noturno entra como a noite do programa (a etapa NOT), nunca como um translado', () => {
    const solicitacao = (id, missao) => ({ id, data: '2026-11-11', aluno: ALUNO, aluno_nome: 'Aluno 1000', missao, janela: 'noite', horario: null, cancelada_em: null });
    const importar = (situacao, missoes) => {
      const estado = { nid: 2000, importadas: [], stu: [alunoDoCenario(ALUNO, { fly: false }, { curso: 'PP' })] };
      importar(estado, missoes.map((m, i) => solicitacao(70 + i, m)), { situacao, programa: [curso()] });
      return [estado.stu[0], ...estado.stu[0].extra].map(p => [p.mis, p.etapa, p.eq, p.nb, p.p1]);
    };
    const ate4 = ['TMA-01', 'TMA-02'].map(c => reg(c));
    assert.deepEqual(importar(ate4, ['Noturno', 'Navegação']), [['Noturno', 'NOT', 'C172', 4, 1050], ['Navegação', 'NAV-01', 'C152', 1.5, 500]]);
    // Antes da Fase 4, o Noturno é fora da ordem: o pedido entra sem a missão do curso
    assert.deepEqual(importar([], ['Noturno']).map(p => p.slice(0, 2)), [['Noturno', undefined]]);
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

// "Colocar no curso até…" (Alunos, passo A): o aluno que chega no meio do curso. Todas as missões antes da escolhida, na
// ordem do curso, que não estão aprovadas nem dispensadas, são aprovadas sem voo; o Noturno pela noite (nunca um
// translado), e a noite da própria escolhida fica de fora
describe('Colocar no curso até uma missão', () => {
  const codigos = ids => ids.map(i => PP.missoes.find(m => m.id === i).codigo);

  it('na ordem do curso: PE-04 aprova 19, NAV-01 13, SOLO-03 26 (a dispensada fica de fora), AVX-CQ 43', () => {
    const contar = alvo => paraColocarNoCurso(PP, new Map(), ALUNO, id(alvo)).length;
    assert.deepEqual(['PE-04', 'NAV-01', 'SOLO-03', 'AVX-CQ'].map(contar), [19, 13, 26, 43]);
    assert.deepEqual(codigos(paraColocarNoCurso(PP, new Map(), ALUNO, id('NAV-01'))), ate('TMA-05'));
    assert.ok(!codigos(paraColocarNoCurso(PP, new Map(), ALUNO, id('SOLO-03'))).includes('ADAPT-C152'), 'a dispensada não ganha resultado');
  });

  it('o Noturno pela noite: até o NOT, 42 missões sem a noite dele; depois dele, a noite uma vez e nenhum translado', () => {
    const ateNot = codigos(paraColocarNoCurso(PP, new Map(), ALUNO, id('NOT')));
    assert.equal(ateNot.length, 42);
    assert.ok(!ateNot.some(c => ['TSL-01', 'NOT', 'TSL-02'].includes(c)), 'nem a noite escolhida, nem os translados');
    const ateCheque = codigos(paraColocarNoCurso(PP, new Map(), ALUNO, id('AVX-CQ')));
    assert.deepEqual(ateCheque.filter(c => ['TSL-01', 'NOT', 'TSL-02'].includes(c)), ['NOT']);
  });

  it('as já aprovadas ficam de fora (a reprovada entra); cada uma deixa a escolhida liberada e a próxima', () => {
    const mapa = situacaoPorMissao([reg('IN-01'), reg('IN-02'), reg('CT-01', 'reprovado')]);
    const ids = paraColocarNoCurso(PP, mapa, ALUNO, id('NAV-01'));
    assert.deepEqual(codigos(ids), ate('TMA-05').filter(c => !['IN-01', 'IN-02'].includes(c)));
    for (const alvo of ['PE-04', 'NAV-01', 'SOLO-03', 'NOT', 'AVX-CQ']) {
      const depois = situacaoPorMissao(codigos(paraColocarNoCurso(PP, new Map(), ALUNO, id(alvo))).map(c => reg(c)));
      assert.equal(estadoDoAluno(PP, depois, ALUNO).porMissao.get(id(alvo)).estado, 'liberada', alvo);
      assert.equal(proximasMissoes(PP, depois, ALUNO).padrao.codigo, alvo === 'PE-04' ? 'PE-04' : alvo, alvo);
    }
  });

  it('as missões que se escolhem: sem translados e sem dispensadas, agrupadas pela fase, na ordem do curso', () => {
    const alvos = alvosDaColocacao(PP);
    assert.deepEqual(alvos.map(g => g.fase.nome.split(' – ')[0]), ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 7', 'Fase 8', 'Fase 6', 'Fase 9']);
    const todas = alvos.flatMap(g => g.missoes.map(m => m.codigo));
    assert.ok(!todas.some(c => ['TSL-01', 'TSL-02', 'ADAPT-C152'].includes(c)));
    assert.deepEqual(alvos.find(g => g.fase.id === faseId(6)).missoes.map(m => m.codigo), ['NOT']);
    assert.equal(todas.length, percursoDoCurso(PP).missoes.length - 3);
  });
});

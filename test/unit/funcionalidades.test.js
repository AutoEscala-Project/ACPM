// As funcionalidades que podem ficar desligadas (js/funcionalidades.js): o padrão (as três desligadas em todos os
// endereços), a escolha que só vale no localhost, o que o motor recebe com o hangar ou a prioridade desligados e o que a
// Demanda, Alunos e a escala mostram com o progresso desligado.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ligada, escolhidasNoLocalhost, aplicarFuncionalidades } from '../../js/funcionalidades.js';
import { runAllocationEngine } from '../../js/engine.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { normalizarHangar } from '../../js/hangar.js';
import { inativoNoEstado } from '../../js/inativos.js';
import { hojeISO, somarDias } from '../../js/format.js';
import { novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { S, setS, setData, estadoDaEscala } from '../../js/state.js';
import { etapaNaDemanda, progressoDoAluno, faseDoAluno, proximaDoPedido, outraMissaoDoPedido, resultadoNaEscala } from '../../js/views/etapas.js';
import { aluno, apenas, cenario, instrutor, missaoExtra } from '../helpers/montar.js';
import { ligarFuncionalidades } from '../helpers/funcionalidades.js';

afterEach(() => ligarFuncionalidades());

describe('Funcionalidades: o padrão e a escolha do localhost', () => {
  const janela = (endereco, lista) => {
    const { hostname, search } = new URL(endereco);
    return { location: { hostname, search }, ...(lista === undefined ? {} : { FUNCIONALIDADES_LIGADAS: lista }) };
  };
  const SITES = ['https://autoescala.autoescala-acpm.workers.dev/', 'https://autoescala-previa.autoescala-acpm.workers.dev/', 'https://gdruumond.github.io/ACPM/',
    'https://thephfernandes.github.io/ACPM/', 'https://localhost.example.com/', 'https://outro.example.com/'];

  it('o hangar, o progresso e a prioridade ficam desligados', () => {
    assert.deepEqual([ligada('hangar'), ligada('progresso'), ligada('prioridade')], [false, false, false]);
  });

  it('nos sites publicados, nem o endereço nem a janela ligam: valem as do app', () => {
    for (const site of SITES) {
      assert.equal(escolhidasNoLocalhost(janela(`${site}?funcionalidades=hangar,progresso`)), null, site);
      assert.equal(escolhidasNoLocalhost(janela(site, 'hangar,progresso')), null, site);
    }
  });

  it('no localhost, o endereço escolhe as ligadas, e a lista da janela vale mais; sem nenhum dos dois, valem as do app', () => {
    for (const base of ['http://localhost:8000/', 'http://127.0.0.1:8000/', 'http://[::1]:8000/']) {
      assert.deepEqual(escolhidasNoLocalhost(janela(`${base}?data=2026-11-11&funcionalidades=hangar,%20progresso`)), ['hangar', 'progresso'], base);
    }
    assert.deepEqual(escolhidasNoLocalhost(janela('http://localhost/?funcionalidades=hangar', 'progresso')), ['progresso']);
    assert.deepEqual(escolhidasNoLocalhost(janela('http://localhost/?funcionalidades=')), [''], 'vazia: nenhuma');
    assert.equal(escolhidasNoLocalhost(janela('http://localhost/')), null);
    assert.equal(escolhidasNoLocalhost(janela('http://localhost/', ['hangar'])), null, 'só o texto vale');
  });

  it('sem a janela, sem o endereço ou com um que dá erro, nada falha', () => {
    for (const j of [null, {}, { location: null }, { get location() { throw new Error('sem acesso'); } }]) assert.equal(escolhidasNoLocalhost(j), null);
  });

  it('ligada lê a escolha do localhost', () => {
    ligarFuncionalidades('progresso');
    assert.deepEqual([ligada('hangar'), ligada('progresso')], [false, true]);
    ligarFuncionalidades('');
    assert.deepEqual([ligada('hangar'), ligada('progresso')], [false, false]);
  });

  it('da página saem os blocos das desligadas e os textos que só valem sem as ligadas', () => {
    const no = (chave, valor) => ({ dataset: { [chave]: valor }, saiu: false, remove() { this.saiu = true; } });
    const com = [no('funcionalidade', 'hangar'), no('funcionalidade', 'progresso')];
    const sem = [no('semFuncionalidade', 'hangar'), no('semFuncionalidade', 'progresso')];
    ligarFuncionalidades('hangar');
    aplicarFuncionalidades({ querySelectorAll: seletor => (seletor === '[data-funcionalidade]' ? com : sem) });
    assert.deepEqual([...com, ...sem].map(n => n.saiu), [false, true, true, false]);
  });
});

describe('Com o hangar desligado, o motor não lê a ordem guardada', () => {
  const HANGAR = ['PR-VOB', 'PP-LJV'];
  const abrir = () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { inativo: true })], stu: [aluno(1000, { p1: 390, p2: -1 })] });
    estado.frota = structuredClone(FROTA_INICIAL);
    estado.hangar = normalizarHangar(HANGAR, estado.frota);
    setS(estado);
    setData(somarDias(hojeISO(), 1));
    return estado;
  };

  it('o estado da escala vai sem a ordem; a de S continua, e o resto do estado também', () => {
    const estado = abrir();
    const antes = structuredClone(estado);
    const daEscala = estadoDaEscala();
    assert.equal(daEscala.hangar, null);
    assert.deepEqual(S, antes);
    assert.equal(daEscala.stu[0], S.stu[0]);
    // A marca dos inativos (js/inativos.js) vai junto
    assert.equal(inativoNoEstado(daEscala, S.ins[1]), true);
    assert.equal(daEscala.ins[1].on, false);
    // Numa data passada (sem os inativos de fora), também sem tocar em S
    setData('2020-01-02');
    assert.equal(estadoDaEscala().hangar, null);
    assert.deepEqual(S, antes);
  });

  it('a escala é a da ordem da frota; ligado, volta a ser a da ordem guardada', () => {
    const estado = abrir();
    const primeiro = e => runAllocationEngine(e).out[0].r;
    assert.equal(primeiro(estadoDaEscala()), 'PP-LJV');
    assert.deepEqual(runAllocationEngine(estadoDaEscala()).out, runAllocationEngine({ ...estadoDaEscala(), hangar: normalizarHangar(null, estado.frota) }).out);
    ligarFuncionalidades('hangar');
    assert.equal(primeiro(estadoDaEscala()), 'PR-VOB');
    assert.deepEqual(estadoDaEscala().hangar, S.hangar);
  });
});

// O motor (e a compactação, os candidatos, as Sugestões e a simulação do agendamento, que leem o mesmo estado) recebe
// todos os pedidos na prioridade padrão: valem a ordem dos agendamentos e a do cadastro. A guardada continua em S
describe('Com a prioridade desligada, o motor recebe a prioridade padrão', () => {
  // Um instrutor e um avião, os dois na mesma 1ª preferência (06:30): quem o motor confere antes fica com ela. O Aluno
  // 1000, primeiro no cadastro, tem a prioridade mais baixa (1); o Aluno 1001, a mais alta (5), e uma missão extra com 4
  const abrir = () => {
    const estado = cenario({
      ins: [instrutor(1, 9)], semAeronaves: apenas('C152', 'PP-LJV'),
      stu: [aluno(1000, { p1: 390, p2: -1, pr: 1 }), aluno(1001, { p1: 390, p2: -1, pr: 5, extra: [missaoExtra(1, { fly: false, pr: 4 })] }), aluno(1002, { fly: false })]
    });
    setS(estado);
    setData(somarDias(hojeISO(), 1));
    return estado;
  };
  const naPreferencia = e => runAllocationEngine(e).out.find(o => o.a === 390).stuId;

  it('o estado da escala vai com todos na prioridade padrão; a de S continua, e o aluno que já tem 3 é o mesmo', () => {
    abrir();
    const antes = structuredClone(S);
    const daEscala = estadoDaEscala();
    assert.deepEqual(daEscala.stu.map(s => [s.pr, ...s.extra.map(ex => ex.pr)]), [[3], [3, 3], [3]]);
    assert.deepEqual(S, antes);
    assert.equal(daEscala.stu[2], S.stu[2]);
    // Com o hangar ligado, também: uma não muda a outra
    ligarFuncionalidades('hangar');
    assert.deepEqual(estadoDaEscala().stu.map(s => s.pr), [3, 3, 3]);
    assert.deepEqual(S, antes);
  });

  it('a escala segue a ordem do cadastro; ligada, a prioridade guardada vale de novo', () => {
    abrir();
    assert.equal(naPreferencia(estadoDaEscala()), 1000);
    ligarFuncionalidades('prioridade');
    assert.equal(naPreferencia(estadoDaEscala()), 1001);
    assert.equal(estadoDaEscala().stu[1], S.stu[1]);
  });
});

describe('Com o progresso desligado, na Demanda, em Alunos, em Cursos e na escala', () => {
  const PP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, (s, c) => `${s}:${c}`).curso;
  const stu = extra => aluno(1000, extra, { curso: 'PP' });
  const abrir = () => setS({
    stu: [stu({ etapa: 'IN-01', cursoDaEtapa: 'PP' })], fStatus: {}, programa: [PP()],
    resultados: { situacao: [], doDia: [{ id: 1, aluno: 1000, curso: 'PP', missao: 'IN-01', resultado: 'aprovado', data: '2026-11-11', voo: '1000_0_1' }] }
  });

  it('nem a próxima missão, nem as outras, nem o progresso, nem a fase; o código que o pedido já tem continua', () => {
    abrir();
    assert.equal(etapaNaDemanda(stu(), stu(), 0), '');
    assert.equal(etapaNaDemanda(stu(), stu({ etapa: 'IN-01', cursoDaEtapa: 'PP' }), 0), ' <span class="etapa" title="Missão do curso PP">IN-01</span>');
    assert.equal(proximaDoPedido(stu(), 0), null);
    assert.equal(outraMissaoDoPedido(stu(), stu(), 0, 'IN-01'), null);
    assert.equal(progressoDoAluno(stu()), '');
    assert.equal(faseDoAluno(stu()), null);
    ligarFuncionalidades('progresso');
    assert.match(etapaNaDemanda(stu(), stu(), 0), /Próxima: IN-01 · Usar/);
    assert.match(progressoDoAluno(stu()), /0\/46/);
  });

  it('na escala, o código da missão, sem o resultado (também o já registrado, que continua guardado)', () => {
    abrir();
    const antes = structuredClone(S.resultados);
    assert.equal(resultadoNaEscala({ fKey: '1000_0_1', stuId: 1000, mid: 0, s: 'Aluno 1000', etapa: 'IN-01' }),
      '<span class="resultado"><span class="etapa" data-dica="missao-do-curso">IN-01</span></span>');
    assert.equal(resultadoNaEscala({ fKey: '1000_0_1', stuId: 1000, mid: 0, s: 'Aluno 1000' }), '');
    assert.deepEqual(S.resultados, antes);
  });
});

// O Manual (index.html): só o que está marcado fala do que pode ficar desligado
describe('O texto da página, sem as funcionalidades desligadas', () => {
  it('cada marca é de uma funcionalidade que existe', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const marcas = [...html.matchAll(/data-(?:sem-)?funcionalidade="([^"]*)"/g)].map(m => m[1]);
    assert.ok(marcas.length > 20);
    assert.deepEqual([...new Set(marcas)].sort(), ['hangar', 'prioridade', 'progresso']);
  });
});

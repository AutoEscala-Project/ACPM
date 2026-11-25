// O inativo no cadastro (js/inativos.js): vale na data aberta de hoje em diante; o motor lê o estado derivado (o instrutor
// inativo sem vir, o recurso inativo indisponível), nunca gravado; a Escala avisa dos voos de quem ficou inativo
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inativo, inativoNoEstado, inativoValeEm, ativosNaData, estadoParaEscalar, voosComInativos, textoDoVooComInativo } from '../../js/inativos.js';
import { ocupacaoDaEscala, avioesQueServem, instrutoresQueServem } from '../../js/candidatos.js';
import { instrutoresDoPedido, instrutoresDoVoo } from '../../js/instrutor-escolhido.js';
import { sugerirReparos } from '../../js/reparo.js';
import { ApiClient } from '../../js/storage.js';
import { runAllocationEngine } from '../../js/engine.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';
import { FROTA_INICIAL } from '../../js/frota.js';

const HOJE = '2026-11-10';

describe('O inativo', () => {
  it('só inativo: true conta', () => {
    assert.equal(inativo({ inativo: true }), true);
    for (const x of [{ inativo: 'sim' }, { inativo: 1 }, {}, null, undefined]) assert.equal(inativo(x), false);
  });

  it('vale de hoje em diante; numa data passada, não', () => {
    assert.equal(inativoValeEm('2026-11-10', HOJE), true);
    assert.equal(inativoValeEm('2026-11-11', HOJE), true);
    assert.equal(inativoValeEm('2026-11-09', HOJE), false);
    assert.equal(inativoValeEm(undefined, HOJE), false);
  });

  it('ativosNaData: sem os inativos de hoje em diante; numa data passada, a lista como está', () => {
    const lista = [{ id: 1 }, { id: 2, inativo: true }];
    assert.deepEqual(ativosNaData(lista, '2026-11-11', HOJE), [{ id: 1 }]);
    assert.equal(ativosNaData(lista, '2026-11-01', HOJE), lista);
  });
});

describe('O estado para escalar', () => {
  const base = () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { inativo: true })], stu: [aluno(1000, {}, { voaCom: [2, 1] })] });
    estado.frota = [{ reg: 'PR-A', tipo: 'C152' }, { reg: 'PR-B', tipo: 'C152', inativo: true }];
    return estado;
  };

  it('sem inativos, ou numa data passada, é o próprio estado', () => {
    const estado = base();
    assert.equal(estadoParaEscalar(estado, { data: '2026-11-01', hoje: HOJE }), estado);
    const semInativos = cenario({ ins: [instrutor(1)], stu: [aluno(1000)] });
    assert.equal(estadoParaEscalar(semInativos, { data: '2026-11-11', hoje: HOJE }), semInativos);
  });

  it('de hoje em diante: o instrutor inativo não vem, o recurso inativo fica indisponível, o "Priorizar com" sem ele; nada é gravado', () => {
    const estado = base();
    const antes = JSON.stringify(estado);
    const derivado = estadoParaEscalar(estado, { data: '2026-11-11', hoje: HOJE });
    assert.equal(derivado.ins.find(x => x.id === 2).on, false);
    assert.equal(derivado.ins.find(x => x.id === 1).on, true);
    assert.equal(derivado.av['PR-B'], false);
    assert.deepEqual(derivado.stu[0].voaCom, [1]);
    assert.equal(JSON.stringify(estado), antes, 'o estado da tela não muda');
  });

  it('o motor não põe voo com o instrutor nem com o recurso inativos', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { inativo: true })], stu: [aluno(1000), aluno(1001), aluno(1002)] });
    estado.frota = FROTA_INICIAL.map((f, i) => (i === 0 ? { ...f, inativo: true } : { ...f }));
    const { out } = runAllocationEngine(estadoParaEscalar(estado, { data: '2026-11-11', hoje: HOJE }));
    assert.ok(out.length > 0);
    assert.equal(out.some(o => o.insId === 2), false);
    assert.equal(out.some(o => o.r === estado.frota[0].reg), false);
  });
});

describe('Os voos com inativos', () => {
  it('um item por instrutor, recurso e aluno inativos com voos na escala, sem os cancelados; numa data passada, nenhum', () => {
    const estado = {
      ins: [{ id: 1, nm: 'Instrutor 01' }, { id: 2, nm: 'Instrutor 02', inativo: true }],
      frota: [{ reg: 'PR-B', tipo: 'C152', inativo: true }],
      stu: [{ id: 1000, nm: 'Aluno 1000', inativo: true }],
      fStatus: { c: 'Cancelado' }
    };
    const resultado = { out: [
      { fKey: 'a', insId: 2, r: 'PR-A', stuId: 1001 },
      { fKey: 'b', insId: 2, r: 'PR-B', stuId: 1000 },
      { fKey: 'c', insId: 2, r: 'PR-B', stuId: 1000 }
    ] };
    const itens = voosComInativos(estado, resultado, { data: '2026-11-11', hoje: HOJE });
    assert.deepEqual(itens, [
      { de: 'instrutor', id: 2, nome: 'Instrutor 02', voos: 2 },
      { de: 'recurso', id: 'PR-B', nome: 'PR-B', voos: 1 },
      { de: 'aluno', id: 1000, nome: 'Aluno 1000', voos: 1 }
    ]);
    assert.deepEqual(itens.map(textoDoVooComInativo), [
      '2 voos com Instrutor 02 (inativo) na escala desta data',
      '1 voo com PR-B (inativo) na escala desta data',
      '1 voo com o aluno Aluno 1000 (inativo) na escala desta data'
    ]);
    assert.deepEqual(voosComInativos(estado, resultado, { data: '2026-11-01', hoje: HOJE }), []);
  });
});

// As listas da escala recebem o estado derivado da data aberta: tiram o inativo só nele. Numa data passada, recebem o
// estado como está (estadoParaEscalar o devolve) e ninguém fica de fora, como no resto da tela dessa data
describe('As listas da escala, pela data', () => {
  const base = () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9, { inativo: true })], stu: [aluno(1000)] });
    estado.frota = FROTA_INICIAL.map(f => (f.reg === INATIVO ? { ...f, inativo: true } : { ...f }));
    return estado;
  };
  const C152 = FROTA_INICIAL.filter(f => f.tipo === 'C152').map(f => f.reg).sort();
  const INATIVO = C152[0];
  const futura = estado => estadoParaEscalar(estado, { data: '2026-11-11', hoje: HOJE });
  const passada = estado => estadoParaEscalar(estado, { data: '2026-11-01', hoje: HOJE });
  const voo = { mis: 'Voo Local', tipo: 'C152', a: 600, b: 660 };

  it('inativoNoEstado: só no estado derivado de uma data em que o inativo vale', () => {
    const estado = base();
    const x = estado.ins[1];
    assert.equal(inativoNoEstado(futura(estado), x), true);
    assert.equal(inativoNoEstado(passada(estado), x), false);
    assert.equal(inativoNoEstado(estado, x), false);
    assert.equal(inativoNoEstado(futura(estado), estado.ins[0]), false);
  });

  it('os instrutores e os aviões que servem: sem o inativo de hoje em diante; numa data passada, com ele', () => {
    const ocupacao = ocupacaoDaEscala([]);
    const estado = base();
    const ids = e => instrutoresQueServem(e, ocupacao, { ...voo, alunos: [e.stu[0]] }).map(c => c.x.id);
    assert.deepEqual(ids(futura(estado)), [1]);
    assert.deepEqual(ids(passada(estado)).sort(), [1, 2]);
    const regs = e => avioesQueServem(e, ocupacao, voo).map(c => c.r);
    assert.deepEqual(regs(futura(estado)).sort(), C152.slice(1));
    assert.deepEqual(regs(passada(estado)).sort(), C152);
  });

  it('a Demanda e a Escala: o instrutor inativo fora (ou com a nota) de hoje em diante; numa data passada, como os outros', () => {
    const estado = base();
    const nota = e => (instrutoresDoPedido(e, e.stu[0], e.stu[0]).find(o => o.id === 2) || {}).nota;
    assert.equal(nota(futura(estado)), undefined);
    assert.equal(nota(passada(estado)), '');
    const resultado = runAllocationEngine({ ...estado, ins: estado.ins.map(x => ({ ...x, inativo: undefined })) });
    const fKey = resultado.out[0].fKey;
    const opcoes = e => instrutoresDoVoo(e, resultado, fKey).map(o => o.id).sort();
    assert.equal(opcoes(futura(estado)).includes(2), resultado.out[0].insId === 2);
    assert.deepEqual(opcoes(passada(estado)), [1, 2]);
  });

  it('as Sugestões: o avião inativo indisponível não sugere "Manutenção da aeronave"; o que está em manutenção, sim', () => {
    const estado = base();
    const ativo = runAllocationEngine({ ...estado, frota: FROTA_INICIAL.map(f => ({ ...f })) }).out.find(o => o.stuId === 1000);
    estado.fixos = { [ativo.fKey]: { a: ativo.a, b: ativo.b, r: INATIVO, insId: ativo.insId } };
    const motivo = e => {
      const resultado = runAllocationEngine(e);
      const voo = resultado.out.find(o => o.stuId === 1000);
      assert.ok(voo.conflito && voo.conflito.length, 'o voo fixo fica em conflito');
      return sugerirReparos(e, resultado, voo.fKey).find(o => o.tipo === 'cancelar').motivo;
    };
    assert.equal(motivo(futura(estado)), null);
    const emManutencao = { ...estado, frota: FROTA_INICIAL.map(f => ({ ...f })), av: { ...estado.av, [INATIVO]: false } };
    assert.equal(motivo(emManutencao), 'Manutenção da aeronave');
  });
});

// Ao carregar uma data em que o inativo vale, o hangar e as filas do rodízio ficam só com os ativos; numa data passada, como
// estão gravados
describe('A carga da data', () => {
  it('normalizeAndMigrateState com ativos: o recurso inativo sai do hangar; sem a opção, fica', () => {
    const estado = { nid: 1001, ins: [instrutor(1, 9)], stu: [], frota: [{ reg: 'PR-A', tipo: 'C152' }, { reg: 'PR-B', tipo: 'C152', inativo: true }], hangar: ['PR-B', 'PR-A'] };
    const comAtivos = ApiClient.normalizeAndMigrateState(structuredClone(estado), { ativos: true });
    const semAtivos = ApiClient.normalizeAndMigrateState(structuredClone(estado));
    assert.equal(comAtivos.hangar.includes('PR-B'), false);
    assert.equal(semAtivos.hangar.includes('PR-B'), true);
  });
});

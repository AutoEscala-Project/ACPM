// Regras de viabilidade da escala: as mesmas para o motor, a divisão das horas, a troca de matrículas, a compactação
// e as sugestões de reparo.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sobrepoe, livre, cabeNoSaldo, folgaAte, saldoAteARevisao, problemasDoInstrutor } from '../../js/viabilidade.js';
import { normalizarLimites } from '../../js/limites.js';
import { GROUND_EQ_TYPE } from '../../js/config.js';
import { disponivelPara } from '../../js/disponibilidade.js';

describe('Viabilidade', () => {
  it('dois intervalos se sobrepõem quando um começa antes de o outro terminar (encostar não conta)', () => {
    assert.equal(sobrepoe(390, 450, 420, 480), true);
    assert.equal(sobrepoe(390, 450, 450, 510), false);
    assert.equal(sobrepoe(450, 510, 390, 450), false);
  });

  it('livre: nenhum intervalo ocupado se sobrepõe (sem ocupação, livre)', () => {
    assert.equal(livre([[390, 450], [610, 670]], 500, 560), true);
    assert.equal(livre([[390, 450], [610, 670]], 440, 500), false);
    assert.equal(livre(undefined, 390, 450), true);
  });

  // O cobre (o aw) saiu para js/disponibilidade.js (disponivelPara, C): os mesmos casos, pelo instrutor
  it('o instrutor disponível no voo quando está marcado em todos os tempos que o voo toca', () => {
    const todas = Array(9).fill(true);
    const x = aw => ({ on: true, aw });
    assert.equal(disponivelPara(x(todas), 390, 450), true);
    const semManha = todas.map((v, k) => k > 0);
    assert.equal(disponivelPara(x(semManha), 390, 450), false, '06:30 cai no 1º tempo');
    assert.equal(disponivelPara(x(semManha), 500, 560), true, '08:20 em diante');
    const semTerceiro = todas.map((v, k) => k !== 2);
    assert.equal(disponivelPara(x(semTerceiro), 560, 620), false, 'do 2º para o 3º tempo: precisa dos dois');
  });

  it('o voo cabe no saldo até a revisão de 50 horas', () => {
    assert.equal(cabeNoSaldo(48, 1, 49), true);
    assert.equal(cabeNoSaldo(48.5, 1, 49), false);
    assert.equal(cabeNoSaldo(10, 1, Infinity), true);
  });

  it('o saldo até a revisão: o que falta para as 50 horas; sem as horas informadas, sem limite', () => {
    assert.equal(saldoAteARevisao({ 'PR-EJA': 47.5 }, 'PR-EJA'), 2.5);
    assert.equal(saldoAteARevisao({ 'PR-EJA': 47.5 }, 'PR-EJC'), Infinity);
    assert.equal(saldoAteARevisao({ 'PR-EJA': null }, 'PR-EJA'), Infinity);
    assert.equal(saldoAteARevisao(undefined, 'PR-EJA'), Infinity);
  });

  it('a folga entre um voo e o que o avião já voa: 0 se encosta ou sobrepõe; sem voos, Infinity', () => {
    assert.equal(folgaAte([[390, 450], [600, 660]], 480, 540), 30, 'o mais perto: 30 min depois do das 06:30');
    assert.equal(folgaAte([[390, 450], [600, 660]], 520, 580), 20, '20 min antes do das 10:00');
    assert.equal(folgaAte([[390, 450]], 450, 510), 0);
    assert.equal(folgaAte([[390, 450]], 420, 480), 0);
    assert.equal(folgaAte([], 390, 450), Infinity);
  });
});

describe('O instrutor para um compromisso', () => {
  const limites = normalizarLimites();
  const instrutor = (mais = {}) => ({ id: 7, nm: 'Instrutor 07', on: true, aw: Array(9).fill(true), hab: ['local', 'c152', 'grounds'], kg: 80, ...mais });
  const voo = (mais = {}) => ({ mis: 'Voo Local', tipo: 'C152', a: 600, b: 660, ...mais });
  const codigos = (x, compromisso, opcoes = {}) => problemasDoInstrutor(x, compromisso, { limites, ...opcoes }).map(p => p.codigo);

  it('ativo, disponível, habilitado, livre, sem bloqueio, dentro da lei e do peso: nenhum problema', () => {
    assert.deepEqual(problemasDoInstrutor(instrutor(), voo({ alunos: [{ bl: [] }], stuKg: 70 }), { limites }), []);
  });

  it('fora do cadastro, inativo ou sem disponibilidade em todo o voo', () => {
    assert.deepEqual(codigos(undefined, voo()), ['instrutor-saiu']);
    assert.deepEqual(codigos(instrutor({ on: false }), voo()), ['instrutor-indisponivel']);
    assert.deepEqual(codigos(instrutor({ aw: Array(9).fill(true).map((v, k) => k !== 2) }), voo()), ['instrutor-indisponivel'], 'das 10:00 às 11:00: o tempo das 10:10, entre dois marcados, é a pausa');
  });

  it('com as faixas da data (C, formato 29): o voo começa dentro de uma e pode terminar depois, sem tocar uma pausa; o aw não é lido', () => {
    const nenhum = Array(9).fill(false);
    assert.deepEqual(codigos(instrutor({ aw: nenhum, faixas: [{ de: 390, ate: 1440 }], pausas: [] }), voo()), []);
    assert.deepEqual(codigos(instrutor({ faixas: [{ de: 390, ate: 640 }], pausas: [] }), voo()), [], 'das 10:00 às 11:00: começa antes das 10:40 e passa delas');
    assert.deepEqual(codigos(instrutor({ faixas: [{ de: 390, ate: 600 }], pausas: [] }), voo()), ['instrutor-indisponivel'], 'às 10:00, o fim da faixa: não entra');
    assert.deepEqual(codigos(instrutor({ faixas: [{ de: 390, ate: 1440 }], pausas: [{ de: 630, ate: 700 }] }), voo()), ['instrutor-indisponivel'], 'toca a pausa');
    assert.deepEqual(codigos(instrutor({ faixas: [], pausas: [] }), voo()), ['instrutor-indisponivel'], 'nenhuma faixa: não voa na data');
  });

  it('sem a habilitação da missão ou do avião', () => {
    assert.deepEqual(codigos(instrutor({ hab: ['local'] }), voo()), ['habilitacao']);
    assert.deepEqual(codigos(instrutor(), voo({ mis: 'Navegação' })), ['habilitacao']);
  });

  it('com outro compromisso no horário; quem já está na turma não é conferido de novo', () => {
    const compromissos = [{ a: 630, b: 690, voo: true }];
    assert.deepEqual(codigos(instrutor(), voo(), { compromissos }), ['instrutor-ocupado']);
    assert.deepEqual(codigos(instrutor(), voo(), { compromissos: [{ a: 540, b: 600, voo: true }] }), [], 'encostar não conta');
    assert.deepEqual(codigos(instrutor(), voo(), { compromissos, jaOcupa: true }), []);
  });

  it('no “Não escalar com” de um dos alunos', () => {
    assert.deepEqual(codigos(instrutor(), voo({ alunos: [{ bl: [] }, { bl: [7] }] })), ['bloqueio']);
    assert.deepEqual(codigos(instrutor(), voo({ alunos: [undefined, { bl: [3] }] })), []);
  });

  it('passaria do limite da lei (com o motivo); a aula de Ground não é voo; vale o intervalo efetivo', () => {
    const historico = { mes: 99.5, semestre: 0, ano: 0, fimAnterior: null };
    assert.deepEqual(problemasDoInstrutor(instrutor(), voo(), { limites, historico }), [{ codigo: 'limite-da-lei', motivo: 'mes' }]);
    assert.deepEqual(codigos(instrutor(), voo({ mis: 'Ground C152', tipo: GROUND_EQ_TYPE }), { historico }), []);
    assert.deepEqual(codigos(instrutor(), voo({ efetivo: { a: 600, b: 630 } }), { historico }), [], 'meia hora de voo cabe');
    assert.deepEqual(codigos(instrutor(), voo(), { historico, jaOcupa: true }), []);
  });

  it('peso: aceita o combustível a menos que couber, até a redução pedida; sem o peso do instrutor, só se não for exigido', () => {
    const pesado = voo({ stuKg: 100 });
    assert.deepEqual(codigos(instrutor(), pesado), [], '180 kg no C152: sai com 4 gal a menos');
    assert.deepEqual(codigos(instrutor(), pesado, { peso: { reducaoMaxima: 4 } }), []);
    assert.deepEqual(codigos(instrutor(), pesado, { peso: { reducaoMaxima: 0 } }), ['peso'], 'só o tanque cheio');
    assert.deepEqual(codigos(instrutor({ kg: 100 }), voo({ stuKg: 120 })), ['peso'], '220 kg: nem o mínimo de combustível dá');
    assert.deepEqual(codigos(instrutor({ kg: 0 }), pesado), []);
    assert.deepEqual(codigos(instrutor({ kg: 0 }), pesado, { peso: { exigirPesoDoInstrutor: true } }), ['peso']);
    assert.deepEqual(codigos(instrutor({ kg: 0 }), voo(), { peso: { exigirPesoDoInstrutor: true } }), [], 'sem o peso do aluno, não há o que conferir');
    assert.deepEqual(codigos(instrutor({ kg: 100 }), voo({ stuKg: 120 }), { peso: null }), [], 'peso: null não confere');
    assert.deepEqual(codigos(instrutor({ kg: 100, hab: ['grounds'] }), voo({ mis: 'Ground C152', tipo: GROUND_EQ_TYPE, stuKg: 120 })), [], 'na aula, sem peso');
  });

  it('só o primeiro problema, na ordem do motor; todos com todos: true', () => {
    const x = instrutor({ on: false, hab: [] });
    const compromisso = voo({ alunos: [{ bl: [7] }] });
    assert.deepEqual(codigos(x, compromisso), ['instrutor-indisponivel']);
    assert.deepEqual(codigos(x, compromisso, { todos: true }), ['instrutor-indisponivel', 'habilitacao', 'bloqueio']);
  });
});

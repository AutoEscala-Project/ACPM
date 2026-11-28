// O H em js/exportacoes.js: a impressão da escala (impressaoDaEscala) e o que ela diz de cada exportação registrada
// (situacaoDasExportacoes, registrarExportacao). A exportação fica "em dia" enquanto a escala exportada é a de agora: quem
// voa o quê, quando, onde e com quem, o cancelamento, o atraso, o conflito e o avião parado (d31). Puro
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { impressaoDaEscala, situacaoDasExportacoes, registrarExportacao, normalizarExportacoes } from '../../js/exportacoes.js';

const voo = (stuId, mid, extra = {}) => ({ fKey: `${stuId}_${mid}_1`, stuId, mid, mis: 'Voo Local', eqType: 'C152', a: 500, b: 560, r: 'PP-LJV', insId: 1, ...extra });
const escala = () => [voo(1000, 1), voo(1001, 1, { a: 520, b: 580, r: 'PR-BTB', insId: 2 })];
const dia = (extra = {}) => ({ fStatus: {}, fObs: {}, av: { 'PP-LJV': true, 'PR-BTB': true }, ...extra });

describe('impressaoDaEscala', () => {
  it('8 hexadecimais, a mesma para a mesma escala, qualquer que seja a ordem das linhas', () => {
    const i = impressaoDaEscala(escala(), dia());
    assert.match(i, /^[0-9a-f]{8}$/);
    assert.equal(impressaoDaEscala(escala(), dia()), i);
    assert.equal(impressaoDaEscala(escala().reverse(), dia()), i);
  });

  it('a impressão é aceita pelo registro (normalizarExportacoes)', () => {
    const impressao = impressaoDaEscala(escala(), dia());
    assert.deepEqual(normalizarExportacoes({ csv: { em: '2026-11-28T12:00:00.000Z', por: 'Op', impressao } }).csv.impressao, impressao);
    assert.match(impressaoDaEscala([], dia()), /^[0-9a-f]{8}$/, 'a escala vazia também tem impressão');
  });

  it('muda com quem voa, a missão, o horário, o avião e o instrutor', () => {
    const i = impressaoDaEscala(escala(), dia());
    const mudar = (k, v) => { const e = escala(); e[0] = { ...e[0], [k]: v }; return impressaoDaEscala(e, dia()); };
    for (const [k, v] of [['stuId', 1002], ['mis', 'Navegação'], ['a', 510], ['b', 570], ['r', 'PT-ABC'], ['insId', 3]]) assert.notEqual(mudar(k, v), i, k);
    assert.notEqual(impressaoDaEscala(escala().slice(0, 1), dia()), i, 'um voo a menos');
    assert.notEqual(impressaoDaEscala([...escala(), voo(1002, 1)], dia()), i, 'um voo a mais');
  });

  it('muda com o cancelamento, o atraso (o horário novo), o conflito e o avião parado', () => {
    const i = impressaoDaEscala(escala(), dia());
    assert.notEqual(impressaoDaEscala(escala(), dia({ fStatus: { '1000_1_1': 'Cancelado' } })), i, 'cancelado');
    const atrasado = dia({ fStatus: { '1000_1_1': 'Atrasado' }, fObs: { '1000_1_1': { novoInicio: 530 } } });
    assert.notEqual(impressaoDaEscala(escala(), atrasado), i, 'atrasado para as 08:50');
    assert.notEqual(impressaoDaEscala(escala(), atrasado), impressaoDaEscala(escala(), dia({ fStatus: { '1000_1_1': 'Atrasado' } })), 'o horário novo conta');
    const comConflito = escala(); comConflito[0] = { ...comConflito[0], conflito: ['o instrutor não está disponível'], conflitoCodigos: ['instrutor-indisponivel'] };
    assert.notEqual(impressaoDaEscala(comConflito, dia()), i, 'conflito');
    assert.notEqual(impressaoDaEscala(escala(), dia({ av: { 'PP-LJV': false, 'PR-BTB': true } })), i, 'avião parado');
  });

  it('não muda com o que o arquivo exportado não diz: Pendente e Confirmado, a ordem dos códigos, outro avião parado', () => {
    const i = impressaoDaEscala(escala(), dia());
    assert.equal(impressaoDaEscala(escala(), dia({ fStatus: { '1000_1_1': 'Confirmado' } })), i, 'Confirmado é o padrão');
    assert.equal(impressaoDaEscala(escala(), dia({ av: { 'PP-LJV': true, 'PR-BTB': true, 'PT-XYZ': false } })), i, 'avião parado sem voo');
    const a = escala(), b = escala();
    a[0] = { ...a[0], conflitoCodigos: ['peso', 'bloqueio'] };
    b[0] = { ...b[0], conflitoCodigos: ['bloqueio', 'peso'] };
    assert.equal(impressaoDaEscala(a, dia()), impressaoDaEscala(b, dia()));
    assert.equal(impressaoDaEscala(escala(), {}), impressaoDaEscala(escala(), dia()), 'sem fStatus, fObs nem av');
  });

  it('a volta do noturno (o trecho) é uma linha dela', () => {
    const ida = voo(1000, 2, { mis: 'Noturno' });
    const volta = { ...ida, trecho: 'volta', a: 420, b: 480 };
    assert.notEqual(impressaoDaEscala([ida, volta], dia()), impressaoDaEscala([ida], dia()));
  });
});

describe('situacaoDasExportacoes', () => {
  const impressao = 'aaaaaaaa';
  const reg = (i = impressao) => ({ em: '2026-11-28T12:00:00.000Z', por: 'Operador 01', impressao: i });

  it('sem nenhuma exportação: nenhuma, e a escala não está exportada', () => {
    const s = situacaoDasExportacoes({}, impressao);
    assert.deepEqual(s.porTipo.map(t => [t.tipo, t.estado]), [['csv', 'nenhuma'], ['pdf', 'nenhuma'], ['xlsx', 'nenhuma']]);
    assert.equal(s.exportada, false);
    assert.deepEqual(s.desatualizadas, []);
  });

  it('a registrada com a impressão de agora está em dia; com outra, desatualizada', () => {
    const s = situacaoDasExportacoes({ csv: reg(), xlsx: reg('bbbbbbbb') }, impressao);
    assert.deepEqual(s.porTipo.map(t => [t.tipo, t.estado]), [['csv', 'em-dia'], ['pdf', 'nenhuma'], ['xlsx', 'desatualizada']]);
    assert.deepEqual(s.desatualizadas, ['xlsx']);
    assert.equal(s.exportada, false, 'uma desatualizada: não está exportada');
    assert.equal(s.porTipo[0].em, '2026-11-28T12:00:00.000Z');
    assert.equal(s.porTipo[0].por, 'Operador 01');
  });

  it('exportada: ao menos uma registrada e nenhuma desatualizada', () => {
    assert.equal(situacaoDasExportacoes({ pdf: reg() }, impressao).exportada, true);
    assert.equal(situacaoDasExportacoes({ csv: reg(), pdf: reg(), xlsx: reg() }, impressao).exportada, true);
  });

  it('lê o registro normalizado: o que não tem o formato conta como nenhuma', () => {
    const s = situacaoDasExportacoes({ csv: { em: 'ontem', impressao }, pdf: 7 }, impressao);
    assert.deepEqual(s.porTipo.map(t => t.estado), ['nenhuma', 'nenhuma', 'nenhuma']);
    assert.equal(situacaoDasExportacoes(null, impressao).exportada, false);
  });
});

describe('registrarExportacao', () => {
  const em = '2026-11-28T12:00:00.000Z';

  it('grava o tipo com quando, quem e a impressão, sem mudar os outros nem o de antes', () => {
    const antes = { pdf: { em, por: 'A', impressao: 'bbbbbbbb' } };
    const depois = registrarExportacao(antes, 'csv', { em, por: 'Operador 01', impressao: 'aaaaaaaa' });
    assert.deepEqual(depois, { pdf: antes.pdf, csv: { em, por: 'Operador 01', impressao: 'aaaaaaaa' } });
    assert.deepEqual(antes, { pdf: { em, por: 'A', impressao: 'bbbbbbbb' } }, 'o de antes não muda');
  });

  it('a nova do mesmo tipo toma o lugar da de antes', () => {
    const depois = registrarExportacao({ csv: { em, por: 'A', impressao: 'bbbbbbbb' } }, 'csv', { em: '2026-11-28T13:00:00.000Z', por: 'B', impressao: 'cccccccc' });
    assert.deepEqual(depois.csv, { em: '2026-11-28T13:00:00.000Z', por: 'B', impressao: 'cccccccc' });
  });

  it('outro tipo, ou o registro fora do formato, não grava nada', () => {
    const antes = { csv: { em, por: 'A', impressao: 'bbbbbbbb' } };
    assert.deepEqual(registrarExportacao(antes, 'txt', { em, por: 'B', impressao: 'aaaaaaaa' }), antes);
    assert.deepEqual(registrarExportacao(antes, 'pdf', { em: 'ontem', por: 'B', impressao: 'aaaaaaaa' }), antes);
    assert.deepEqual(registrarExportacao(antes, 'pdf', { em, por: 'B', impressao: 'X' }), antes);
    assert.deepEqual(registrarExportacao(undefined, 'pdf', { em, por: 'B', impressao: 'aaaaaaaa' }), { pdf: { em, por: 'B', impressao: 'aaaaaaaa' } });
  });
});

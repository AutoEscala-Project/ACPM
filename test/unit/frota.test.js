// A frota no cadastro: matrícula, tipo e, no C152 acrobático, "Só Parafuso". A frota inicial vem do código (EQ em
// config.js); o formato 11 dos dados a leva para o cadastro, e o motor e as telas a leem de lá.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FROTA_INICIAL, TIPOS_DA_FROTA, normalizarFrota, matriculasDoTipo, novoRecurso, comAtributo, comExigencias, comExigencia, quemOpera, salaDisponivel } from '../../js/frota.js';
import { habilitacoesDoTipo } from '../../js/habilitacoes.js';
import { ESQUEMA, migrarCadastro } from '../../js/migracoes.js';
import { separar, juntar } from '../../js/dias.js';
import { ApiClient } from '../../js/storage.js';
import { runAllocationEngine } from '../../js/engine.js';
import { simularNavegador } from '../helpers/navegador.js';
import { aluno, cenario } from '../helpers/montar.js';

beforeEach(() => {
  simularNavegador();
  ApiClient.readOnly = false;
});

describe('Frota: o que ela guarda', () => {
  it('começa com os 26 recursos; o PR-JPL só voa Parafuso, o PR-CPL só VFR e o PR-VOM exige a habilitação própria', () => {
    assert.equal(FROTA_INICIAL.length, 26);
    assert.deepEqual(FROTA_INICIAL.find(f => f.reg === 'PR-JPL'), { reg: 'PR-JPL', tipo: 'C152', soParafuso: true });
    assert.deepEqual(FROTA_INICIAL.find(f => f.reg === 'PR-CPL'), { reg: 'PR-CPL', tipo: 'C172', soVfr: true });
    // Desde o formato 26, o que o recurso exige está na lista exige; a habilitação própria fica como espelho dela
    assert.deepEqual(FROTA_INICIAL.find(f => f.reg === 'PR-VOM'), { reg: 'PR-VOM', tipo: 'PA-34', habilitacaoPropria: true, exige: ['aviao:PR-VOM'] });
    assert.deepEqual(FROTA_INICIAL.find(f => f.reg === 'PT-JOB'), { reg: 'PT-JOB', tipo: 'PA-34' });
    assert.deepEqual(TIPOS_DA_FROTA, ['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi']);
  });

  it('normaliza: só recursos válidos, matrícula em maiúsculas e sem repetir; sem lista, a frota inicial', () => {
    assert.deepEqual(normalizarFrota(undefined), FROTA_INICIAL);
    assert.deepEqual(normalizarFrota([
      { reg: ' pr-new ', tipo: 'C152' }, { reg: 'PR-NEW', tipo: 'C172' }, { reg: 'PR-X', tipo: 'Boeing' }, { reg: '', tipo: 'C152' },
      null, { reg: 'SIM-X', tipo: 'Sim. Mono', soParafuso: true }
    ]), [{ reg: 'PR-NEW', tipo: 'C152' }, { reg: 'SIM-X', tipo: 'Sim. Mono' }]);
  });

  it('as matrículas de um tipo: as que só voam Parafuso ficam só para o Parafuso', () => {
    const frota = [{ reg: 'PR-A', tipo: 'C152' }, { reg: 'PR-B', tipo: 'C152', soParafuso: true }, { reg: 'PR-C', tipo: 'C172' }];
    assert.deepEqual(matriculasDoTipo(frota, 'C152'), ['PR-A']);
    assert.deepEqual(matriculasDoTipo(frota, 'C152', { parafuso: true }), ['PR-B']);
    assert.deepEqual(matriculasDoTipo(frota, 'C172', { parafuso: true }), ['PR-C']);
  });

  it('um recurso novo: matrícula única (em maiúsculas), categoria conhecida e "Só Parafuso" só no C152', () => {
    const frota = [{ reg: 'PR-A', tipo: 'C152' }];
    assert.deepEqual(novoRecurso(frota, { reg: ' pr-z ', tipo: 'C172' }), { recurso: { reg: 'PR-Z', tipo: 'C172' } });
    assert.deepEqual(novoRecurso(frota, { reg: 'PR-Q', tipo: 'C152', soParafuso: true }), { recurso: { reg: 'PR-Q', tipo: 'C152', soParafuso: true } });
    assert.deepEqual(novoRecurso(frota, { reg: 'PR-Q', tipo: 'C172', soParafuso: true }), { recurso: { reg: 'PR-Q', tipo: 'C172' } });
    assert.deepEqual(novoRecurso(frota, { reg: 'pr-a', tipo: 'C152' }), { erro: 'Já existe um recurso com a matrícula PR-A.', campo: 'reg' });
    assert.deepEqual(novoRecurso(frota, { reg: '', tipo: 'C152' }), { erro: 'Informe a matrícula.', campo: 'reg' });
    assert.deepEqual(novoRecurso(frota, { reg: 'PR ABC!', tipo: 'C152' }), { erro: 'Matrícula inválida: use letras, números e hífen (por exemplo, PR-ABC).', campo: 'reg' });
    assert.deepEqual(novoRecurso(frota, { reg: 'PR-Q', tipo: 'Boeing' }), { erro: 'Escolha a categoria.', campo: 'tipo' });
  });
});

describe('Frota: formato 11 dos dados', () => {
  it('o cadastro antigo ganha a frota inicial; uma frota já gravada fica como está', () => {
    assert.ok(ESQUEMA >= 11);
    const antigo = { esquema: 10, nid: 1000, ins: [], stu: [] };
    assert.deepEqual(migrarCadastro(antigo).frota, FROTA_INICIAL);
    const propria = [{ reg: 'PR-NEW', tipo: 'C152' }];
    assert.deepEqual(migrarCadastro({ ...antigo, frota: propria }).frota, propria);
  });

  it('a frota fica no cadastro; um recurso novo começa disponível nos dias que ainda não o conhecem', () => {
    const estado = juntar({ nid: 1000, ins: [], stu: [], frota: [{ reg: 'PR-NEW', tipo: 'C152' }, { reg: 'PP-LJV', tipo: 'C152' }] },
      { win: Array(9).fill(true), av: { 'PP-LJV': false }, ins: {}, pedidos: {} });
    assert.deepEqual(estado.frota, [{ reg: 'PR-NEW', tipo: 'C152' }, { reg: 'PP-LJV', tipo: 'C152' }]);
    assert.deepEqual(estado.av, { 'PR-NEW': true, 'PP-LJV': false });
    const { cadastro, dia } = separar(estado);
    assert.deepEqual(cadastro.frota, estado.frota);
    assert.equal(dia.frota, undefined);
  });

  it('estado inicial e normalização: a frota, e só os recursos dela na disponibilidade e nas horas', () => {
    const novo = ApiClient.createFreshState();
    assert.deepEqual(novo.frota, FROTA_INICIAL);
    assert.equal(Object.keys(novo.av).length, 26);
    const estado = ApiClient.normalizeAndMigrateState({
      ins: [], stu: [], frota: [{ reg: 'PR-NEW', tipo: 'C152' }],
      av: { 'PR-NEW': false, 'PR-OLD': true }, horas: { 'PR-NEW': 12, 'PR-OLD': 40 }
    });
    assert.deepEqual(estado.av, { 'PR-NEW': false });
    assert.deepEqual(estado.horas, { 'PR-NEW': 12 });
  });

});

describe('Frota: o motor usa a frota dos dados', () => {
  it('um C152 novo voa; um avião que saiu da frota não voa mais', () => {
    const estado = cenario({ stu: [aluno(1000)] });
    estado.frota = [{ reg: 'PR-NEW', tipo: 'C152' }];
    estado.av = { 'PR-NEW': true, 'PP-LJV': true };
    const { out, al } = runAllocationEngine(estado);
    assert.deepEqual(al, []);
    assert.deepEqual(out.map(o => o.r), ['PR-NEW']);
  });

  it('o Parafuso no C152 vai para o avião marcado "Só Parafuso", que não recebe outras missões', () => {
    const estado = cenario({ stu: [aluno(1000, { mis: 'Parafuso' }), aluno(1001)] });
    estado.frota = [{ reg: 'PR-A', tipo: 'C152' }, { reg: 'PR-ACR', tipo: 'C152', soParafuso: true }];
    estado.av = { 'PR-A': true, 'PR-ACR': true };
    const { out } = runAllocationEngine(estado);
    assert.equal(out.find(o => o.s === 'Aluno 1000').r, 'PR-ACR');
    assert.equal(out.find(o => o.s === 'Aluno 1001').r, 'PR-A');
  });

  it('sem avião "Só Parafuso" disponível, o Parafuso no C152 não entra e o motivo diz qual é o avião', () => {
    const estado = cenario({ stu: [aluno(1000, { mis: 'Parafuso' })] });
    estado.frota = [{ reg: 'PR-A', tipo: 'C152' }, { reg: 'PR-ACR', tipo: 'C152', soParafuso: true }];
    estado.av = { 'PR-A': true, 'PR-ACR': false };
    const { out, al } = runAllocationEngine(estado);
    assert.equal(out.length, 0);
    assert.match(al[0].m, /PR-ACR/);
  });
});

// Formato 26: o que o recurso exige do instrutor (exige) e o recurso inativo (inativo: só true fica)
describe('Frota: o que o recurso exige e o inativo (formato 26)', () => {
  it('exige: só ids do registro ou habilitações próprias, sem repetir, na ordem do registro; a habilitação própria é o espelho', () => {
    assert.deepEqual(normalizarFrota([
      { reg: 'PR-A', tipo: 'C172', exige: ['ifr', 'xyz', 'ifr', 'aviao:PR-A', 7, null] },
      { reg: 'PR-B', tipo: 'C152', habilitacaoPropria: true },
      { reg: 'PR-C', tipo: 'C152', habilitacaoPropria: true, exige: [] },
      { reg: 'PR-D', tipo: 'C152', exige: 'ifr' },
      { reg: 'PR-E', tipo: 'C152', exige: ['aviao:PR-E'] }
    ]), [
      { reg: 'PR-A', tipo: 'C172', habilitacaoPropria: true, exige: ['ifr', 'aviao:PR-A'] },
      { reg: 'PR-B', tipo: 'C152', habilitacaoPropria: true, exige: ['aviao:PR-B'] },
      { reg: 'PR-C', tipo: 'C152' },
      { reg: 'PR-D', tipo: 'C152' },
      { reg: 'PR-E', tipo: 'C152', habilitacaoPropria: true, exige: ['aviao:PR-E'] }
    ]);
  });

  it('inativo: só true fica', () => {
    assert.deepEqual(normalizarFrota([{ reg: 'PR-A', tipo: 'C152', inativo: true }, { reg: 'PR-B', tipo: 'C152', inativo: 'sim' }, { reg: 'PR-C', tipo: 'C152', inativo: false }]),
      [{ reg: 'PR-A', tipo: 'C152', inativo: true }, { reg: 'PR-B', tipo: 'C152' }, { reg: 'PR-C', tipo: 'C152' }]);
  });

  it('comAtributo: marcar a habilitação própria põe o id do recurso em exige, e desmarcar o tira (o resto de exige fica)', () => {
    const marcado = comAtributo({ reg: 'PR-X', tipo: 'C172', exige: ['ifr'] }, 'habilitacaoPropria', true);
    assert.deepEqual(marcado, { reg: 'PR-X', tipo: 'C172', habilitacaoPropria: true, exige: ['ifr', 'aviao:PR-X'] });
    assert.deepEqual(comAtributo(marcado, 'habilitacaoPropria', false), { reg: 'PR-X', tipo: 'C172', exige: ['ifr'] });
    assert.deepEqual(comAtributo({ reg: 'PR-X', tipo: 'C172' }, 'soVfr', true), { reg: 'PR-X', tipo: 'C172', soVfr: true });
    assert.deepEqual(comAtributo({ reg: 'PR-X', tipo: 'C172', soVfr: true, inativo: true }, 'soVfr', false), { reg: 'PR-X', tipo: 'C172', inativo: true });
    // O atributo que não vale no tipo não muda nada
    assert.deepEqual(comAtributo({ reg: 'PR-X', tipo: 'C172' }, 'soParafuso', true), { reg: 'PR-X', tipo: 'C172' });
  });
});

// B: "Habilitações que o INVA precisa", no detalhe do recurso (setExigencias): a lista exige que o operador marca, nunca com
// a habilitação do próprio tipo (o tipo já a exige: js/habilitacoes.js), e com a habilitação própria como espelho
describe('Frota: as habilitações que o INVA precisa (B)', () => {
  it('habilitacoesDoTipo: a do avião, a do simulador; nenhuma para a Sala Ground', () => {
    assert.deepEqual(['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi', 'Sala Ground', 'outro'].map(habilitacoesDoTipo),
      [['c152'], ['c172'], ['mlte'], ['sim_mono'], ['sim_multi'], [], []]);
  });

  it('comExigencias: a lista nova, só ids conhecidos, sem repetir, na ordem do registro, sem a do tipo; a habilitação própria acompanha', () => {
    assert.deepEqual(comExigencias({ reg: 'PR-X', tipo: 'C172', soVfr: true }, ['noturno', 'ifr', 'ifr', 'c172', 'nada', 7]),
      { reg: 'PR-X', tipo: 'C172', soVfr: true, exige: ['ifr', 'noturno'] });
    assert.deepEqual(comExigencias({ reg: 'PR-X', tipo: 'C172' }, ['aviao:PR-X', 'ifr']),
      { reg: 'PR-X', tipo: 'C172', habilitacaoPropria: true, exige: ['ifr', 'aviao:PR-X'] });
    // Vazia: sem exige (e sem a habilitação própria); o inativo continua
    assert.deepEqual(comExigencias({ reg: 'PR-X', tipo: 'C172', habilitacaoPropria: true, exige: ['aviao:PR-X'], inativo: true }, []),
      { reg: 'PR-X', tipo: 'C172', inativo: true });
    // Não é uma lista: nada muda no que o recurso exige
    assert.deepEqual(comExigencias({ reg: 'PR-X', tipo: 'C152', exige: ['ifr'] }, 'ifr'), { reg: 'PR-X', tipo: 'C152', exige: ['ifr'] });
  });

  // Uma caixa de "Exigir também…" e a reversão dela (setExigencias): só aquela habilitação entra ou sai; o resto de exige
  // (a habilitação própria, as caixas marcadas depois) fica como está
  it('comExigencia: põe ou tira só uma habilitação; a própria e as outras ficam', () => {
    const f = { reg: 'PR-X', tipo: 'C152', exige: ['ifr', 'noturno', 'aviao:PR-X'] };
    assert.deepEqual(comExigencia(f, 'ifr', false), { reg: 'PR-X', tipo: 'C152', habilitacaoPropria: true, exige: ['noturno', 'aviao:PR-X'] });
    assert.deepEqual(comExigencia({ reg: 'PR-X', tipo: 'C152', exige: ['aviao:PR-X'] }, 'noturno', true),
      { reg: 'PR-X', tipo: 'C152', habilitacaoPropria: true, exige: ['noturno', 'aviao:PR-X'] });
    // Já como pedido: nada muda; a do tipo nunca entra; um id que não é do registro não entra
    assert.deepEqual(comExigencia(f, 'ifr', true), { reg: 'PR-X', tipo: 'C152', habilitacaoPropria: true, exige: ['ifr', 'noturno', 'aviao:PR-X'] });
    assert.deepEqual(comExigencia({ reg: 'PR-X', tipo: 'C152' }, 'c152', true), { reg: 'PR-X', tipo: 'C152' });
    assert.deepEqual(comExigencia({ reg: 'PR-X', tipo: 'C152' }, 'nada', true), { reg: 'PR-X', tipo: 'C152' });
  });

  it('quemOpera: os instrutores ativos com a habilitação do tipo e tudo o que o recurso exige', () => {
    const ins = [
      { id: 1, nm: 'A', hab: ['c172', 'ifr'] }, { id: 2, nm: 'B', hab: ['c172'] }, { id: 3, nm: 'C', hab: ['ifr'] },
      { id: 4, nm: 'D', hab: ['c172', 'ifr'], inativo: true }
    ];
    assert.deepEqual(quemOpera(ins, { reg: 'PR-X', tipo: 'C172' }).map(i => i.id), [1, 2]);
    assert.deepEqual(quemOpera(ins, { reg: 'PR-X', tipo: 'C172', exige: ['ifr'] }).map(i => i.id), [1]);
    assert.deepEqual(quemOpera(ins, { reg: 'SIM', tipo: 'Sim. Mono' }).map(i => i.id), []);
    assert.deepEqual(quemOpera(null, { reg: 'PR-X', tipo: 'C172' }), []);
  });
});

// J (S4): a Sala Ground tem "Disponível" por data, como os outros recursos. A chave dela em av só existe depois que alguém
// a desliga (ou liga de novo): sem a chave, a sala está disponível. Todo leitor passa por salaDisponivel, nunca por um
// teste de verdade (S.av[r]), que diria "indisponível" em toda data sem a chave
describe('A Sala Ground disponível nesta data (S4)', () => {
  it('salaDisponivel: sem a chave ou true, disponível; só false a desliga', () => {
    assert.equal(salaDisponivel({}), true);
    assert.equal(salaDisponivel(undefined), true);
    assert.equal(salaDisponivel({ 'SALA-GROUND': true }), true);
    assert.equal(salaDisponivel({ 'SALA-GROUND': false }), false);
  });

  it('o estado normalizado guarda a chave booleana da sala, e deixa ausente a que não existe', () => {
    const { cadastro, dia } = separar(cenario());
    const base = juntar(cadastro, dia);
    const sem = ApiClient.normalizeAndMigrateState(structuredClone(base));
    assert.equal(Object.hasOwn(sem.av, 'SALA-GROUND'), false);
    const desligada = ApiClient.normalizeAndMigrateState({ ...structuredClone(base), av: { ...base.av, 'SALA-GROUND': false } });
    assert.equal(desligada.av['SALA-GROUND'], false);
    const lixo = ApiClient.normalizeAndMigrateState({ ...structuredClone(base), av: { ...base.av, 'SALA-GROUND': 'nao' } });
    assert.equal(Object.hasOwn(lixo.av, 'SALA-GROUND'), false);
  });
});

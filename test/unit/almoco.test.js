// O almoço (#104; Pedro, 28/11): branda, um passo próprio depois do C. Para cada INVA que vem na data e voa perto do
// meio-dia, o motor tenta deixar uma hora livre seguida entre 11:00 e 14:00; só desiste dela quando mantê-la tiraria um
// voo da escala, e então um aviso diz qual INVA ficou sem almoço. Uma pausa da data que já cobre 1 h dessa janela ("+
// Pausa" ou "Almoço" em "Editar faixas", ou a dos dados antigos) substitui a do motor. A reserva do motor não é gravada.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JANELA_DO_ALMOCO, DURACAO_DO_ALMOCO, horaLivre, tiraOAlmoco, pausaDeAlmoco, comAlmocoDoMotor, avisosDoAlmoco, ehAvisoDoAlmoco, INICIO_DO_SEM_ALMOCO
} from '../../js/almoco.js';
import { runAllocationEngine } from '../../js/engine.js';
import { conferirEscala } from '../../js/conferencia.js';
import { compactar } from '../../js/compactar.js';
import { hm } from '../../js/format.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const DIA_INTEIRO = { faixas: [{ de: 390, ate: 1050 }], pausas: [] };
const comPausa = (...pausas) => ({ faixas: [{ de: 390, ate: 1050 }], pausas });
// Os voos de um resultado (horário e INVA), na ordem do horário
const voos = r => r.out.map(o => [o.s, hm(o.a), hm(o.b), o.insId]);
const doAlmoco = r => r.al.filter(ehAvisoDoAlmoco);
const semCompactar = { compactar: false };

describe('O almoço: a hora livre entre 11:00 e 14:00', () => {
  it('a janela e a duração', () => {
    assert.deepEqual([JANELA_DO_ALMOCO.de, JANELA_DO_ALMOCO.ate, DURACAO_DO_ALMOCO], [660, 840, 60]);
  });

  it('uma hora seguida sem compromisso, de 11:00 a 14:00 (encostar não ocupa)', () => {
    assert.equal(horaLivre([]), true);
    assert.equal(horaLivre([[600, 700], [760, 900]]), true, '11:40–12:40');
    assert.equal(horaLivre([[600, 700], [750, 900]]), false, '50 min só');
    assert.equal(horaLivre([[390, 720], [780, 1050]]), true, '12:00–13:00, encostando nos dois');
    assert.equal(horaLivre([[600, 790]]), false, 'das 13:10 às 14:00 são 50 min');
    assert.equal(horaLivre([[600, 780]]), true, '13:00–14:00');
    assert.equal(horaLivre([[600, 781]]), false, 'das 13:01 às 14:00 são 59 min');
    assert.equal(horaLivre([[719, 721]]), true, 'antes e depois: 11:00–11:59 e 12:01–14:00');
    assert.equal(horaLivre([[690, 750], [760, 820]]), false, 'das 11:00 às 11:30, 12:30–12:40 e 13:40–14:00: nenhuma hora');
    assert.equal(horaLivre([[0, 610], [900, 1000]]), true, 'o que fica fora da janela não ocupa');
  });

  it('tirar o almoço: o compromisso que leva a última hora livre (quem já não tem a hora não perde nada)', () => {
    assert.equal(tiraOAlmoco([[610, 730]], 760, 820), true, '12:10–12:40 e 13:40–14:00 sobram');
    assert.equal(tiraOAlmoco([[610, 730]], 820, 880), false, '12:10–13:40 sobra');
    assert.equal(tiraOAlmoco([[660, 840]], 900, 960), false);
    assert.equal(tiraOAlmoco([[660, 840]], 600, 700), false, 'sem a hora antes: nada a guardar');
  });

  it('a pausa da data que cobre 1 h da janela é o almoço (juntas as que se tocam); a menor não', () => {
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 720, ate: 780 }) }), true);
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 720, ate: 750 }) }), false);
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 720, ate: 750 }, { de: 750, ate: 780 }) }), true);
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 600, ate: 690 }) }), false, 'só 30 min dela na janela');
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 800, ate: 900 }) }), false, 'só 40 min dela na janela');
    assert.equal(pausaDeAlmoco({ on: true, ...comPausa({ de: 600, ate: 900 }) }), true);
    assert.equal(pausaDeAlmoco({ on: true, ...DIA_INTEIRO }), false);
    // Sem faixas, pelo aw: o tempo das 11:30 (até 12:40) desmarcado entre dois marcados é a pausa de 70 min; o das 13:40
    // (até 14:30), 20 min na janela
    const aw = k => Array.from({ length: 9 }, (_, i) => i !== k);
    assert.equal(pausaDeAlmoco({ on: true, aw: aw(3) }), true);
    assert.equal(pausaDeAlmoco({ on: true, aw: aw(4) }), true);
    assert.equal(pausaDeAlmoco({ on: true, aw: aw(5) }), false);
  });

  it('o almoço do motor: quem vem, sem a pausa que já é o almoço', () => {
    assert.equal(comAlmocoDoMotor({ on: true, ...DIA_INTEIRO }), true);
    assert.equal(comAlmocoDoMotor({ on: false, ...DIA_INTEIRO }), false);
    assert.equal(comAlmocoDoMotor({ on: true, ...comPausa({ de: 720, ate: 780 }) }), false);
    assert.equal(comAlmocoDoMotor({ on: true, ...comPausa({ de: 720, ate: 750 }) }), true);
  });

  it('o aviso: o INVA que vem, voa na janela e fica sem a hora (a turma de Ground uma vez, o cancelado não ocupa)', () => {
    const estado = { ins: [{ id: 1, nm: 'Instrutor 01', on: true, ...DIA_INTEIRO }, { id: 2, nm: 'Instrutor 02', on: true, ...DIA_INTEIRO }], fStatus: { c: 'Cancelado' } };
    const v = (fKey, insId, a, b, extra = {}) => ({ fKey, insId, a, b, eqType: 'C152', ...extra });
    const out = [v('a', 1, 610, 730), v('b', 1, 760, 820), v('c', 2, 690, 840), v('d', 2, 400, 450)];
    assert.deepEqual(avisosDoAlmoco(estado, out), [
      { t: 'warn', s: 'Instrutor 01', m: 'Sem almoço: nenhuma hora livre seguida entre 11:00 e 14:00 (ocupado das 10:10 às 12:10 e das 12:40 às 13:40).', insId: 1 }
    ]);
    assert.ok(ehAvisoDoAlmoco(avisosDoAlmoco(estado, out)[0]));
    assert.ok(INICIO_DO_SEM_ALMOCO === 'Sem almoço: ');
    // A pausa que já é o almoço: o voo fixo que a ocupa também tira o almoço (o aviso)
    const comAPausa = { ...estado, ins: [{ id: 1, nm: 'Instrutor 01', on: true, ...comPausa({ de: 720, ate: 780 }) }] };
    assert.equal(avisosDoAlmoco(comAPausa, [v('a', 1, 660, 840)]).length, 1);
    // A turma de Ground (duas linhas, uma classKey) ocupa uma vez; quem não vem não tem aviso
    const turma = [v('g1', 1, 690, 780, { classKey: 'GND', isGround: true, eqType: 'Sala Ground' }), v('g2', 1, 690, 780, { classKey: 'GND', isGround: true, eqType: 'Sala Ground' })];
    assert.deepEqual(avisosDoAlmoco(estado, turma), []);
    assert.deepEqual(avisosDoAlmoco({ ...estado, ins: [{ ...estado.ins[0], on: false }] }, out.slice(0, 2)), []);
  });
});

describe('O almoço no motor', () => {
  // Um INVA, três voos de 1 h no C152: 10:10, 11:30 e 12:40, cada um com só a 1ª preferência
  const tres = (insExtra = DIA_INTEIRO, ultimo = {}) => cenario({
    ins: [instrutor(1, 1, insExtra)],
    stu: [aluno(1000, { p1: 610, p2: -1 }), aluno(1001, { p1: 690, p2: -1 }), aluno(1002, { p1: 760, p2: -1, ...ultimo })]
  });

  it('o voo muda de horário para o INVA ficar com a hora livre', () => {
    const sem = runAllocationEngine(tres(), { ...semCompactar, almoco: false });
    assert.deepEqual(voos(sem), [['Aluno 1000', '10:10', '11:10', 1], ['Aluno 1001', '11:30', '12:30', 1], ['Aluno 1002', '12:40', '13:40', 1]]);
    const com = runAllocationEngine(tres(), semCompactar);
    assert.deepEqual(voos(com), [['Aluno 1000', '10:10', '11:10', 1], ['Aluno 1001', '11:30', '12:30', 1], ['Aluno 1002', '13:40', '14:40', 1]]);
    assert.deepEqual(doAlmoco(com), []);
    assert.deepEqual(com.al.filter(a => a.t === 'err'), []);
  });

  it('a compactação e o motor inteiro não comem o almoço', () => {
    const com = runAllocationEngine(tres());
    assert.equal(com.out.length, 3);
    assert.ok(horaLivre(com.out.map(o => [o.a, o.b])), JSON.stringify(voos(com)));
    assert.deepEqual(doAlmoco(com), []);
    // A compactação sozinha, com o almoço do INVA: o voo das 13:40 não volta para as 12:40
    const escala = runAllocationEngine(tres(), semCompactar).out.map(o => ({ ...o }));
    compactar(escala, tres(), { almoco: { guarda: new Set([1]), recusou: () => {} } });
    assert.ok(horaLivre(escala.map(o => [o.a, o.b])));
  });

  it('o pedido de horário exato que só cabe sem o almoço entra, com o aviso de quem ficou sem ele', () => {
    // Os três com o horário exato: nenhum sai da janela (com só o último exato, os outros dois saem: veja a hora reservada)
    const exatos = cenario({ ins: [instrutor(1, 1, DIA_INTEIRO)], stu: [610, 690, 760].map((m, i) => aluno(1000 + i, { p1: m, p2: -1, jan: `h${m}` })) });
    const r = runAllocationEngine(exatos, semCompactar);
    assert.deepEqual(voos(r), [['Aluno 1000', '10:10', '11:10', 1], ['Aluno 1001', '11:30', '12:30', 1], ['Aluno 1002', '12:40', '13:40', 1]]);
    assert.deepEqual(doAlmoco(r), [{ t: 'warn', s: 'Instrutor 01', m: 'Sem almoço: nenhuma hora livre seguida entre 11:00 e 14:00 (ocupado das 10:10 às 11:10, das 11:30 às 12:30 e das 12:40 às 13:40).', insId: 1 }]);
  });

  it('com um segundo INVA, o voo vai para ele em vez de tirar o almoço', () => {
    const e = tres(DIA_INTEIRO, { jan: 'h760' });
    e.ins.push(instrutor(2, 1, DIA_INTEIRO));
    const r = runAllocationEngine(e, semCompactar);
    assert.equal(r.out.length, 3);
    for (const id of [1, 2]) assert.ok(horaLivre(r.out.filter(o => o.insId === id).map(o => [o.a, o.b])), `${id}: ${JSON.stringify(voos(r))}`);
    assert.deepEqual(doAlmoco(r), []);
  });

  it('a pausa de 1 h na janela substitui a do motor: a escala é a de sem o almoço, sem aviso', () => {
    const e = tres(comPausa({ de: 720, ate: 780 }));
    assert.deepEqual(runAllocationEngine(e), runAllocationEngine(e, { almoco: false }));
    assert.deepEqual(doAlmoco(runAllocationEngine(e)), []);
  });

  it('a pausa de 30 min não é o almoço: o motor ainda guarda a hora (a pausa conta como livre)', () => {
    // 10:10–12:10 (2 h), a pausa 12:10–12:40 e o voo das 12:40: só 30 + 20 min livres. Com o almoço, o das 12:40 vai para
    // as 13:40 e sobra 12:10–13:40
    const e = cenario({
      ins: [instrutor(1, 1, comPausa({ de: 730, ate: 760 }))],
      stu: [aluno(1000, { p1: 610, p2: -1, nb: 2 }), aluno(1001, { p1: 760, p2: -1 })]
    });
    assert.deepEqual(voos(runAllocationEngine(e, { ...semCompactar, almoco: false })), [['Aluno 1000', '10:10', '12:10', 1], ['Aluno 1001', '12:40', '13:40', 1]]);
    assert.deepEqual(voos(runAllocationEngine(e, semCompactar)), [['Aluno 1000', '10:10', '12:10', 1], ['Aluno 1001', '13:40', '14:40', 1]]);
  });

  it('o voo fixo que ocupa a janela fica onde está, só com o aviso', () => {
    const e = cenario({ ins: [instrutor(1, 1, DIA_INTEIRO)], stu: [aluno(1000, { p1: 690, p2: -1, nb: 2.5 }), aluno(1001, { p1: 500, p2: -1 })] });
    e.fixos = { '1000_0_1': { a: 690, b: 840, r: 'PP-LJV', insId: 1 } };
    const r = runAllocationEngine(e, semCompactar);
    assert.deepEqual(voos(r), [['Aluno 1001', '08:20', '09:20', 1], ['Aluno 1000', '11:30', '14:00', 1]]);
    assert.ok(r.out.find(o => o.stuId === 1000).fixo);
    assert.deepEqual(doAlmoco(r).map(a => a.s), ['Instrutor 01']);
    assert.deepEqual(r.al.filter(a => a.t !== 'warn'), []);
  });

  // O “Priorizar com” é do operador, e o que o operador diz vem antes do motor: o almoço muda o horário do voo com o INVA
  // do “Priorizar com”, nunca o INVA (como o do instrutor escolhido); sem horário que guarde a hora, o voo fica com ele, e o
  // aviso é o do almoço
  it('o “Priorizar com” vem antes do almoço: o voo fica com o INVA dele, e os horários mudam para guardar a hora', () => {
    // O escolhido do dia leva o Instrutor 01 das 10:10 às 12:10; o aluno que prioriza o 01 só pode às 12:40: o voo do
    // escolhido sai da janela (o horário dele pode mudar), e os dois ficam com o 01
    const e = cenario({
      ins: [instrutor(1, 1, DIA_INTEIRO), instrutor(2, 1, DIA_INTEIRO)],
      stu: [aluno(1000, { p1: 610, p2: -1, nb: 2, insId: 1 }), aluno(1001, { p1: 760, p2: -1, jan: 'h760' }, { voaCom: [1] })]
    });
    assert.deepEqual(voos(runAllocationEngine(e, { ...semCompactar, almoco: false })), [['Aluno 1000', '10:10', '12:10', 1], ['Aluno 1001', '12:40', '13:40', 1]]);
    const r = runAllocationEngine(e, semCompactar);
    assert.deepEqual(r.out.filter(o => o.stuId === 1001).map(o => [hm(o.a), o.insId]), [['12:40', 1]]);
    assert.deepEqual(r.out.filter(o => o.stuId === 1000).map(o => o.insId), [1]);
    assert.ok(horaLivre(r.out.filter(o => o.insId === 1).map(o => [o.a, o.b])), JSON.stringify(voos(r)));
    assert.deepEqual(doAlmoco(r), []);
    assert.deepEqual(r.al.filter(a => a.codigo === 'voa-com'), []);
  });

  it('sem horário que guarde a hora, o voo fica com o INVA do “Priorizar com”, com o aviso do almoço (nenhum do Priorizar com)', () => {
    // Os dois com o horário exato: nenhum horário guarda a hora do 01
    const e = cenario({
      ins: [instrutor(1, 1, DIA_INTEIRO), instrutor(2, 1, DIA_INTEIRO)],
      stu: [aluno(1000, { p1: 610, p2: -1, nb: 2, insId: 1, jan: 'h610' }), aluno(1001, { p1: 760, p2: -1, jan: 'h760' }, { voaCom: [1] })]
    });
    const r = runAllocationEngine(e, semCompactar);
    assert.deepEqual(voos(r), [['Aluno 1000', '10:10', '12:10', 1], ['Aluno 1001', '12:40', '13:40', 1]]);
    assert.deepEqual(doAlmoco(r).map(a => a.s), ['Instrutor 01']);
    assert.deepEqual(r.al.filter(a => a.codigo === 'voa-com'), []);
  });

  // A busca põe um pedido de cada vez: o pedido de horário livre que veio antes leva o voo para as 11:30 (ainda sobra a hora),
  // e o de horário exato das 12:40 só cabe sem ela. Então o motor monta a data de novo com o pedido das 12:40 antes na fila
  // (e, sem isso, com a hora do almoço reservada em cada hora que encosta num compromisso do INVA na janela, ou nas pontas):
  // o das 11:30 vai para outro horário (a 2ª preferência, quando ele tem), e os dois voam com a hora livre
  it('o voo que levou a hora antes de outro pedido sai dela quando o outro só cabe ali (a hora reservada, o pedido antes na fila)', () => {
    const exato = m => ({ p1: m, p2: -1, jan: `h${m}` });
    for (const [p2, esperado] of [[610, '10:10'], [-1, null]]) {
      const e = cenario({ ins: [instrutor(1, 1, DIA_INTEIRO)], stu: [aluno(1000, { p1: 690, p2 }), aluno(1001, exato(760))] });
      const sem = runAllocationEngine(e, { almoco: false });
      assert.deepEqual(voos(sem), [['Aluno 1000', '11:30', '12:30', 1], ['Aluno 1001', '12:40', '13:40', 1]]);
      // Com a compactação também (ela pode fechar o buraco de outro jeito, sem comer a hora)
      for (const opcoes of [semCompactar, {}]) {
        const r = runAllocationEngine(e, opcoes);
        assert.equal(r.out.length, 2, JSON.stringify(voos(r)));
        assert.deepEqual(r.out.filter(o => o.stuId === 1001).map(o => hm(o.a)), ['12:40']);
        if (esperado && opcoes === semCompactar) assert.deepEqual(r.out.filter(o => o.stuId === 1000).map(o => [hm(o.a), o.tag]), [[esperado, 'Pref. 2']]);
        assert.ok(horaLivre(r.out.map(o => [o.a, o.b])), JSON.stringify(voos(r)));
        assert.deepEqual(doAlmoco(r), [], `p2 ${p2}`);
      }
    }
  });

  it('o instrutor escolhido continua o único da busca: o almoço muda o horário dele, nunca o INVA', () => {
    const e = cenario({
      ins: [instrutor(1, 1, DIA_INTEIRO), instrutor(2, 1, DIA_INTEIRO)],
      stu: [aluno(1000, { p1: 610, p2: -1, nb: 2, insId: 1 }), aluno(1001, { p1: 760, p2: -1, insId: 1 })]
    });
    assert.deepEqual(voos(runAllocationEngine(e, semCompactar)), [['Aluno 1000', '10:10', '12:10', 1], ['Aluno 1001', '13:40', '14:40', 1]]);
  });

  it('sem o almoço (opcoes.almoco: false), o motor de antes; com ele, determinístico e sem mudar o estado', () => {
    const e = tres();
    const copia = structuredClone(e);
    assert.deepEqual(runAllocationEngine(e), runAllocationEngine(e));
    assert.deepEqual(e, copia);
  });

  it('conferirEscala (a escala aprovada mudada sem o motor) refaz o aviso', () => {
    // Os três com o horário exato: nenhum sai da janela
    const e = cenario({ ins: [instrutor(1, 1, DIA_INTEIRO)], stu: [610, 690, 760].map((m, i) => aluno(1000 + i, { p1: m, p2: -1, jan: `h${m}` })) });
    const r = runAllocationEngine(e);
    assert.equal(doAlmoco(r).length, 1);
    const conferida = conferirEscala(e, r);
    assert.deepEqual(doAlmoco(conferida), doAlmoco(r));
  });
});

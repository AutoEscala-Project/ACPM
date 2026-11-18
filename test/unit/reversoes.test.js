// O que "Reverter" desfaz no histórico: a reversão vem gravada no histórico, então só vale no
// formato que o próprio app produz; o resto não vira botão nem é aplicado.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validarReversao, motivoParaNaoDesfazer, desfazerAgendamento } from '../../js/reversoes.js';
import { FROTA_INICIAL } from '../../js/frota.js';
import { CAMPOS_DO_PEDIDO } from '../../js/dias.js';

const ATAQUE = 'x"><img/src/onerror=window.__xss=1>';

describe('Reversões do histórico', () => {
  it('as que o app grava passam, com o rótulo', () => {
    assert.deepEqual(validarReversao({ kind: 'setFly', stuId: 1000, mid: 0, val: false, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setFly', stuId: 1000, mid: 0, val: false, label: '↶ Reverter' });
    // As missões extras que saíram com a principal
    assert.deepEqual(validarReversao({ kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [1001, 1002], label: '↶ Restaurar' }, FROTA_INICIAL),
      { kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [1001, 1002], label: '↶ Restaurar' });
    assert.deepEqual(validarReversao({ kind: 'setAv', reg: 'PR-VOB', val: true, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setAv', reg: 'PR-VOB', val: true, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'setInsOn', insId: 3, val: true, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'setInsOn', insId: 3, val: true, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'restaurarFixos', fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'restaurarFixos', fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, label: '↶ Reverter' });
    assert.deepEqual(validarReversao({ kind: 'readicionarRecurso', recurso: { reg: 'pr-new', tipo: 'C152' }, av: false, label: '↶ Reverter' }, FROTA_INICIAL),
      { kind: 'readicionarRecurso', recurso: { reg: 'PR-NEW', tipo: 'C152' }, av: false, label: '↶ Reverter' });
  });

  it('fora do formato, ou um recurso que já voltou à frota, não vale', () => {
    const ruins = [
      null, 'x', { kind: ATAQUE }, { kind: 'setFly', stuId: ATAQUE, val: true }, { kind: 'setFly', stuId: 1000, mid: 0, val: 'sim' }, { kind: 'setFly', stuId: 1000, mid: 0, val: true, extras: [ATAQUE] },
      { kind: 'setAv', reg: ATAQUE, val: true }, { kind: 'setAv', reg: '__proto__', val: true }, { kind: 'setInsOn', insId: 1.5, val: true },
      { kind: 'restaurarFixos', fixos: { [ATAQUE]: { a: 1 } } }, { kind: 'readicionarRecurso', recurso: { reg: ATAQUE, tipo: 'C152' } },
      { kind: 'readicionarRecurso', recurso: { reg: 'PR-VOB', tipo: 'C152' } }
    ];
    for (const rev of ruins) assert.equal(validarReversao(rev, FROTA_INICIAL), null, JSON.stringify(rev));
  });

  it('o rótulo é um texto curto; fora disso, "↶ Reverter"', () => {
    assert.equal(validarReversao({ kind: 'setInsOn', insId: 3, val: true, label: 'x'.repeat(200) }, FROTA_INICIAL).label, '↶ Reverter');
    assert.equal(validarReversao({ kind: 'setInsOn', insId: 3, val: true }, FROTA_INICIAL).label, '↶ Reverter');
  });

  // Os horários de uma categoria e os pedidos que mudaram com eles
  it('os horários: a categoria da lista, horários do dia e os pedidos nos formatos do app', () => {
    const rev = { kind: 'restaurarHorarios', cat: 'PA-34', lista: [390, 450], pedidos: [{ stuId: 1000, mid: 0, p1: 450, p2: -1 }, { stuId: 1001, mid: 2, p1: 500, p2: 610, jan: 'h500' }], label: '↶ Reverter' };
    assert.deepEqual(validarReversao(rev, FROTA_INICIAL), rev);
    assert.deepEqual(validarReversao({ ...rev, pedidos: [] }, FROTA_INICIAL), { ...rev, pedidos: [] });
    for (const ruim of [{ cat: 'Sala' }, { lista: [390, 2000] }, { lista: 'x' }, { pedidos: [{ stuId: 0, mid: 0, p1: 1, p2: 1 }] },
      { pedidos: [{ stuId: 1, mid: 0, p1: 450, p2: -1, jan: '<img>' }] }, { pedidos: 'x' }]) {
      assert.equal(validarReversao({ ...rev, ...ruim }, FROTA_INICIAL), null, JSON.stringify(ruim));
    }
  });
});

// Desfazer um voo agendado na Escala: o pedido de antes, o voo fixo de antes e a disponibilidade do instrutor de antes
describe('Desfazer um voo agendado na Escala', () => {
  const TODOS = Array(9).fill(true);
  const DE_MANHA = [true, true, true, true, false, false, false, false, false];
  // O agendamento criou a missão extra 2 do Aluno 1000 (sem pedido de antes: desfazer a tira)
  const NOVO = { kind: 'desfazerAgendamento', stuId: 1000, mid: 2, criado: true, pedido: null, fixo: null, disponibilidade: null, label: '↶ Desfazer' };
  // O agendamento moveu o pedido principal das 08:20 no PR-HAR, com o Instrutor 02 escolhido na Escala, para as 10:10 no
  // PR-CPL com o Instrutor 05, que não vinha à tarde e foi marcado disponível
  const ANTES = { fly: true, mis: 'Navegação', eq: 'C172', p1: 500, p2: -1, nb: 2, ss: 1, pr: 3, etapa: 'PP-07', insId: 2 };
  const MOVIDO = {
    kind: 'desfazerAgendamento', stuId: 1000, mid: 0, criado: false, pedido: ANTES,
    fixo: { a: 500, b: 620, r: 'PR-HAR', insId: 2, escolhido: true }, disponibilidade: { insId: 5, on: true, aw: DE_MANHA }, label: '↶ Desfazer'
  };
  const campos = pedido => Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => pedido[c] !== undefined).map(c => [c, pedido[c]]));
  // O que é do aluno e não do pedido: o cadastro e as missões extras
  const doAluno = ({ id, nm, kg, bl, voaCom, curso, extra }) => ({ id, nm, kg, bl, voaCom, curso, extra });

  // O dia depois dos agendamentos: a principal movida para as 10:10 e a extra 2 criada às 14:30 (e cancelada depois)
  const dia = () => ({
    stu: [{
      id: 1000, nm: 'Aluno 1000', kg: 82, bl: [3], voaCom: [2], curso: 'PP',
      fly: true, mis: 'Navegação', eq: 'C172', p1: 610, p2: -1, nb: 2, ss: 1, pr: 3, etapa: 'PP-07', insId: 5,
      extra: [{ mid: 1, fly: false, mis: 'Voo Local', eq: 'C152', p1: 760, p2: -1, nb: 1, ss: 1, pr: 3 },
        { mid: 2, fly: true, mis: 'Voo Local', eq: 'C152', p1: 870, p2: -1, nb: 1, ss: 1, pr: 3, insId: 5 }]
    }],
    ins: [{ id: 5, nm: 'Instrutor 05', kg: 90, on: true, aw: [...TODOS] }],
    fixos: { '1000_0_1': { a: 610, b: 730, r: 'PR-CPL', insId: 5 }, '1000_2_1': { a: 870, b: 930, r: 'PR-VOB', insId: 5 } },
    fStatus: { '1000_0_1': 'Confirmado', '1000_2_1': 'Cancelado' },
    fObs: { '1000_2_1': { motivo: 'Meteorologia' } },
    resultados: { situacao: [], doDia: [] }
  });

  it('as que o app grava passam: o voo criado numa missão extra ou no pedido principal, e o voo movido', () => {
    assert.deepEqual(validarReversao(NOVO, FROTA_INICIAL), NOVO);
    const principal = { ...NOVO, mid: 0, pedido: { fly: false, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 3 } };
    assert.deepEqual(validarReversao(principal, FROTA_INICIAL), principal);
    assert.deepEqual(validarReversao(MOVIDO, FROTA_INICIAL), MOVIDO);
    // Todos os campos do pedido: a disponibilidade do aluno, a missão do curso (e o curso dela), o pedido da agenda e o
    // instrutor escolhido
    const completo = { ...MOVIDO, pedido: { ...ANTES, jan: 'h500', solicitacao: 12, cursoDaEtapa: 'PP' } };
    assert.deepEqual(Object.keys(completo.pedido).sort(), [...CAMPOS_DO_PEDIDO].sort());
    assert.deepEqual(validarReversao(completo, FROTA_INICIAL), completo);
    assert.equal(validarReversao({ ...NOVO, label: 'x'.repeat(40) }, FROTA_INICIAL).label, 'x'.repeat(40));
  });

  it('o pedido, o voo fixo ou a disponibilidade de antes que não vêm valem null; o que não é da reversão fica de fora', () => {
    const { fixo, disponibilidade, ...semFixo } = MOVIDO;
    // O peso digitado no agendamento não volta (é da pessoa e fica no cadastro)
    assert.deepEqual(validarReversao({ ...semFixo, pesos: [{ tipo: 'aluno', id: 1000, nm: 'Aluno 1000', kg: 80 }] }, FROTA_INICIAL),
      { ...MOVIDO, fixo: null, disponibilidade: null });
    const { pedido, ...semPedido } = NOVO;
    assert.deepEqual(validarReversao(semPedido, FROTA_INICIAL), NOVO);
  });

  it('o pedido de antes vai para os formatos do app (normalizeMissionFields)', () => {
    // A janela dos dados antigos vira o horário, a duração fica em décimos e a etapa fora do formato sai
    assert.deepEqual(validarReversao({ ...MOVIDO, pedido: { ...ANTES, p1: 2, nb: 1.25, etapa: ATAQUE } }, FROTA_INICIAL).pedido,
      { fly: true, mis: 'Navegação', eq: 'C172', p1: 610, p2: -1, nb: 1.3, ss: 1, pr: 3, insId: 2 });
    // O Noturno sai às 17:30 no C172, com as 4 h dele no dia
    assert.deepEqual(validarReversao({ ...MOVIDO, pedido: { fly: true, mis: 'Noturno', eq: 'C152' } }, FROTA_INICIAL).pedido,
      { fly: true, mis: 'Noturno', eq: 'C172', p1: 1050, p2: -1, nb: 4, ss: 1 });
    // O campo null é o campo que não vem (o instrutor escolhido null é o "Automático")
    const { insId, ...automatico } = ANTES;
    assert.deepEqual(validarReversao({ ...MOVIDO, pedido: { ...ANTES, insId: null, jan: null } }, FROTA_INICIAL).pedido, automatico);
  });

  // Um valor que o JSON permite e que não vira texto nem número (um objeto com "toString": null) lançava uma exceção na
  // normalização: o histórico e a escala da data não eram desenhados. O pedido de antes só tem valores simples
  it('um valor adulterado no pedido de antes não vale e não lança exceção', () => {
    const ruins = [JSON.parse('{"toString": null}'), { a: 1 }, [], ['Voo Local'], ['h500']];
    for (const campo of CAMPOS_DO_PEDIDO) {
      for (const ruim of ruins) {
        const rev = { ...MOVIDO, pedido: { ...ANTES, [campo]: ruim } };
        assert.equal(validarReversao(rev, FROTA_INICIAL), null, `${campo}: ${JSON.stringify(ruim)}`);
      }
    }
    // O nome da missão numa lista vira o texto dele na conversão: ['Noturno'] passaria por 'Noturno', sem as regras do
    // Noturno (o 17:30 e o C172)
    assert.equal(validarReversao({ ...MOVIDO, pedido: { fly: true, mis: ['Noturno'], eq: 'C172', p1: 500, nb: 1, pr: 3 } }, FROTA_INICIAL), null);
  });

  it('fora do formato não vale: não vira botão nem é aplicada', () => {
    const { label, ...semRotulo } = NOVO;
    const ruins = [
      // O aluno, a missão do aluno e se o agendamento criou o voo
      { ...NOVO, stuId: 0 }, { ...NOVO, stuId: ATAQUE }, { ...NOVO, mid: -1 }, { ...NOVO, mid: 1.5 }, { ...NOVO, mid: '2' }, { ...NOVO, criado: 'sim' },
      // Sem o pedido de antes, só o voo criado numa missão extra: nunca na missão 0 nem no voo movido
      { ...NOVO, mid: 0 }, { ...NOVO, criado: false }, { ...MOVIDO, pedido: null },
      // O pedido: só os campos do pedido, com uma missão do app e o "voa" sim ou não
      { ...MOVIDO, pedido: 'x' }, { ...MOVIDO, pedido: [ANTES] }, { ...MOVIDO, pedido: { ...ANTES, extra: [] } }, { ...MOVIDO, pedido: { ...ANTES, kg: 80 } },
      { ...MOVIDO, pedido: { ...ANTES, curso: 'PP' } }, { ...MOVIDO, pedido: { ...ANTES, [ATAQUE]: 1 } },
      { ...MOVIDO, pedido: JSON.parse('{"__proto__": {"x": 1}, "fly": true, "mis": "Voo Local"}') },
      { ...MOVIDO, pedido: { ...ANTES, mis: 'PP Local' } }, { ...MOVIDO, pedido: { ...ANTES, mis: 'constructor' } }, { ...MOVIDO, pedido: { ...ANTES, mis: ATAQUE } },
      { ...MOVIDO, pedido: { ...ANTES, fly: 'true' } }, { ...MOVIDO, pedido: { mis: 'Voo Local' } },
      // O voo fixo de antes: no formato dos voos fixos
      { ...MOVIDO, fixo: { a: 620, b: 500, r: 'PR-HAR', insId: 2 } }, { ...MOVIDO, fixo: { a: 500, b: 620, r: ATAQUE, insId: 2 } },
      { ...MOVIDO, fixo: { a: 500, b: 620, r: 'PR-HAR' } }, { ...MOVIDO, fixo: 'x' },
      // A disponibilidade de antes: o instrutor, se ele vem e cada um dos 9 horários do dia
      { ...MOVIDO, disponibilidade: { insId: 5, on: true, aw: TODOS.slice(1) } }, { ...MOVIDO, disponibilidade: { insId: 5, on: true, aw: [...TODOS, true] } },
      { ...MOVIDO, disponibilidade: { insId: 5, on: true, aw: TODOS.map(() => 1) } }, { ...MOVIDO, disponibilidade: { insId: 5, on: true } },
      { ...MOVIDO, disponibilidade: { insId: 5, on: 'não', aw: TODOS } }, { ...MOVIDO, disponibilidade: { insId: 0, on: true, aw: TODOS } },
      { ...MOVIDO, disponibilidade: 'x' },
      // O rótulo: um texto de até 40 caracteres, que não fica em branco (o botão ficaria sem nome)
      { ...NOVO, label: 'x'.repeat(41) }, { ...NOVO, label: 5 }, semRotulo, { ...NOVO, label: '' }, { ...NOVO, label: '   ' }
    ];
    for (const rev of ruins) assert.equal(validarReversao(rev, FROTA_INICIAL), null, JSON.stringify(rev));
  });

  it('o voo criado numa missão extra sai, sem sobras na chave dele; o instrutor volta como estava', () => {
    const estado = dia();
    const rev = validarReversao({ ...NOVO, disponibilidade: { insId: 5, on: false, aw: DE_MANHA } }, FROTA_INICIAL);
    // Cancelado não impede (o voo não voou)
    assert.equal(motivoParaNaoDesfazer(estado, rev), '');
    assert.equal(desfazerAgendamento(estado, rev), true);
    assert.deepEqual(estado.stu[0].extra.map(ex => ex.mid), [1]);
    assert.deepEqual(estado.fixos, { '1000_0_1': { a: 610, b: 730, r: 'PR-CPL', insId: 5 } });
    assert.deepEqual(estado.fStatus, { '1000_0_1': 'Confirmado' });
    assert.deepEqual(estado.fObs, {});
    assert.deepEqual(estado.ins[0], { id: 5, nm: 'Instrutor 05', kg: 90, on: false, aw: DE_MANHA });
    // O pedido principal e o peso digitado no agendamento ficam
    assert.deepEqual(campos(estado.stu[0]), campos(dia().stu[0]));
    assert.equal(estado.stu[0].kg, 82);
    assert.deepEqual(doAluno(estado.stu[0]).extra, dia().stu[0].extra.filter(ex => ex.mid === 1));
  });

  it('o pedido principal que o agendamento usou volta como estava, com o resto do aluno e as missões extras', () => {
    const estado = dia();
    const antes = { fly: false, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 2, jan: 'manha' };
    assert.equal(desfazerAgendamento(estado, validarReversao({ ...NOVO, mid: 0, pedido: antes }, FROTA_INICIAL)), true);
    // A etapa e o instrutor escolhido pelo agendamento saem com ele
    assert.deepEqual(campos(estado.stu[0]), antes);
    assert.deepEqual(doAluno(estado.stu[0]), doAluno(dia().stu[0]));
    // A chave do voo fica limpa; a da missão extra continua
    assert.deepEqual(estado.fixos, { '1000_2_1': { a: 870, b: 930, r: 'PR-VOB', insId: 5 } });
    assert.deepEqual(estado.fStatus, { '1000_2_1': 'Cancelado' });
  });

  it('o voo movido volta para onde estava: o pedido, o instrutor escolhido e o voo fixo de antes; o status fica', () => {
    const estado = dia();
    assert.equal(desfazerAgendamento(estado, validarReversao(MOVIDO, FROTA_INICIAL)), true);
    assert.deepEqual(campos(estado.stu[0]), ANTES);
    assert.equal(estado.stu[0].insId, 2);
    assert.deepEqual(estado.fixos['1000_0_1'], { a: 500, b: 620, r: 'PR-HAR', insId: 2, escolhido: true });
    assert.equal(estado.fStatus['1000_0_1'], 'Confirmado');
    assert.deepEqual(estado.ins[0].aw, DE_MANHA);
    // Sem instrutor escolhido antes, o app volta a escolher; sem voo fixo antes, o voo deixa de ser fixo
    const semEscolha = dia();
    const { insId, ...automatico } = ANTES;
    assert.equal(desfazerAgendamento(semEscolha, validarReversao({ ...MOVIDO, pedido: automatico, fixo: null }, FROTA_INICIAL)), true);
    assert.equal(Object.hasOwn(semEscolha.stu[0], 'insId'), false);
    assert.equal(semEscolha.fixos['1000_0_1'], undefined);
    assert.equal(semEscolha.fStatus['1000_0_1'], 'Confirmado');
  });

  it('o voo em andamento ou com resultado registrado não é desfeito, com o motivo', () => {
    const estado = dia();
    for (const status of ['Em Voo', 'Atrasado', 'Pousou']) {
      estado.fStatus['1000_0_1'] = status;
      assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), 'O voo já está em andamento: mude o status em vez de desfazer.', status);
    }
    for (const status of ['Pendente', 'Confirmado', 'Cancelado']) {
      estado.fStatus['1000_0_1'] = status;
      assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), '', status);
    }
    // Qualquer registro do resultado no voo (até o "pendente" que desfaz um engano); o de outro voo não conta
    estado.resultados.doDia.push({ id: 1, aluno: 1000, curso: 'PP', missao: 'PP-06', resultado: 'aprovado', data: '2026-11-11', voo: '1000_1_1' });
    assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), '');
    estado.resultados.doDia.push({ id: 2, aluno: 1000, curso: 'PP', missao: 'PP-07', resultado: 'pendente', data: '2026-11-11', voo: '1000_0_1' });
    assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), 'O voo já tem resultado registrado.');
    assert.equal(motivoParaNaoDesfazer({ stu: [], fStatus: {} }, MOVIDO), '');
  });

  // A leitura dos resultados falhou (js/storage.js: os registros do dia vêm vazios e 'resultados' fica indisponível): o
  // voo pode ter resultado no servidor, e desfazer o deixaria apontando um voo que saiu da escala
  it('sem os resultados dos cursos, não desfaz: não dá para conferir se o voo tem resultado', () => {
    const estado = { ...dia(), resultados: { situacao: [], doDia: [] }, indisponiveis: ['resultados'] };
    const SEM_RESULTADOS = 'Sem os resultados dos cursos, o app não confere se o voo já tem resultado: clique em "Tentar de novo" no aviso e desfaça depois.';
    assert.equal(motivoParaNaoDesfazer(estado, NOVO), SEM_RESULTADOS);
    assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), SEM_RESULTADOS);
    // O voo em andamento diz isso primeiro; quando só as horas dos instrutores faltam, desfaz
    estado.fStatus['1000_0_1'] = 'Em Voo';
    assert.equal(motivoParaNaoDesfazer(estado, MOVIDO), 'O voo já está em andamento: mude o status em vez de desfazer.');
    assert.equal(motivoParaNaoDesfazer({ ...dia(), indisponiveis: ['horas'] }, MOVIDO), '');
  });

  it('sem o aluno, ou sem o pedido do voo movido, não há o que desfazer', () => {
    const estado = dia();
    assert.equal(desfazerAgendamento(estado, { ...validarReversao(MOVIDO, FROTA_INICIAL), stuId: 1001 }), false);
    assert.equal(desfazerAgendamento(estado, validarReversao({ ...MOVIDO, mid: 7 }, FROTA_INICIAL)), false);
    assert.deepEqual(estado, dia());
    // A missão extra criada que já saiu da demanda: a chave do voo fica limpa do mesmo jeito
    estado.stu[0].extra = estado.stu[0].extra.filter(ex => ex.mid !== 2);
    assert.equal(desfazerAgendamento(estado, validarReversao(NOVO, FROTA_INICIAL)), true);
    assert.equal(Object.hasOwn(estado.fixos, '1000_2_1'), false);
    assert.equal(Object.hasOwn(estado.fStatus, '1000_2_1'), false);
  });
});

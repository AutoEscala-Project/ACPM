// Agendar um voo na Escala (js/agendamento.js): o contexto, os horários e o encaixe, os padrões do formulário (a missão
// pelo progresso, o recurso e o instrutor livres, o horário, a duração e o peso), o pedido e o voo fixo que o agendamento
// cria, a simulação (a prévia é a escala que fica) e a conferência: cada bloqueio, aviso e nota
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contextoInicial, horariosDoAgendamento, encaixarHorario, duracaoDoAgendamento, naOrdemDoMotor, opcoesDeAluno, opcoesDeMissao,
  opcoesDeRecurso, opcoesDeInstrutor, formularioDoAgendamento, aplicarAgendamento, simularAgendamento, avaliarAgendamento, comPesos,
  assinaturaDosAvisos, descricaoDoAgendamento, reversaoDoAgendamento, historicoDosPesos
} from '../../js/agendamento.js';
import { ocupacaoDaEscala } from '../../js/candidatos.js';
import { runAllocationEngine } from '../../js/engine.js';
import { validarReversao, desfazerAgendamento, motivoParaNaoDesfazer } from '../../js/reversoes.js';
import { normalizarLinhaGravada } from '../../js/escala-gravada.js';
import { situacaoPorMissao } from '../../js/resultados.js';
import { T } from '../../js/config.js';
import { HORARIOS_PADRAO, DE_30_EM_30 } from '../../js/horarios.js';
import { aluno, cenario, instrutor, missaoExtra, GROUND_C152 } from '../helpers/montar.js';
import { novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';

const DATA = '2026-11-11', HOJE = '2026-11-10';
// O cronograma do PP (o modelo do app, com o Noturno em trechos) como o curso PP, com os ids tirados da sigla e da chave
// (PP:F4, PP:TSL-01)
const cursoPP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, (s, c) => `${s}:${c}`).curso;
const PP = cursoPP();
const aprovadas = (stuId, codigos) => codigos.map((missao, i) => ({ id: i + 1, aluno: stuId, curso: 'PP', missao, resultado: 'aprovado', data: '2026-11-01' }));
const ambiente = ({ registros = [], ...resto } = {}) => ({
  programa: [PP], situacao: situacaoPorMissao(registros), inferir: true, data: DATA, hoje: HOJE, agora: 600, semHoras: false, ...resto
});
const codigos = lista => lista.map(i => i.codigo);
const opcoes = grupos => grupos.flatMap(g => g.opcoes);

// O agendamento inteiro, como o diálogo faz: o formulário, a escala com os pesos digitados, a simulação e a conferência
function agendar(estado, { amb = ambiente(), contexto = 'dia', escolhas = {}, tocados = [] } = {}) {
  const base = runAllocationEngine(estado);
  const formulario = formularioDoAgendamento(estado, base, amb, contextoInicial(contexto, amb), escolhas, new Set(tocados));
  if (!formulario.proposta) return { base, formulario, avaliacao: avaliarAgendamento({ estado, baseComPesos: base, formulario, ambiente: amb }) };
  const comOsPesos = comPesos(estado, formulario.proposta);
  const baseComPesos = comOsPesos === estado ? base : runAllocationEngine(comOsPesos);
  const { sim, fKey } = simularAgendamento(estado, base, formulario.proposta);
  return { base, formulario, sim, fKey, avaliacao: avaliarAgendamento({ estado, base, baseComPesos, sim, fKey, formulario, ambiente: amb }) };
}

// Dois instrutores; o Aluno 1000 voa às 06:30 (o app escolheu); o Aluno 1001, do PP, não voa hoje
const doDia = ({ ins = [instrutor(1, 9), instrutor(2, 9)], s1000 = {}, s1001 = {}, extra = {} } = {}) => ({
  ...cenario({ ins, stu: [aluno(1000, { p1: 390, p2: -1, ...s1000 }, { curso: 'PP' }), aluno(1001, { fly: false, ...s1001 }, { curso: 'PP' })] }),
  ...extra
});

describe('Agendamento: os horários e o encaixe', () => {
  it('os horários de cada missão, só nas janelas abertas; o Ground só nas janelas do dia', () => {
    const estado = cenario();
    assert.deepEqual(horariosDoAgendamento(estado, { mis: 'Voo Local', tipo: 'C152' }), HORARIOS_PADRAO);
    assert.deepEqual(horariosDoAgendamento(estado, { mis: 'Voo Local', tipo: 'PA-34' }), DE_30_EM_30);
    assert.deepEqual(horariosDoAgendamento(estado, { mis: 'Noturno', tipo: 'C172' }), [T[8]]);
    assert.deepEqual(horariosDoAgendamento(estado, { mis: 'Voo Solo', tipo: 'C152' }), [T[0]]);
    const comHorarios = { ...estado, horarios: { C152: [420, 480], C172: [420], sim: [420], 'PA-34': [420] } };
    assert.deepEqual(horariosDoAgendamento(comHorarios, { mis: 'Ground C152', tipo: 'Sala Ground' }), T.slice(0, 8));
    assert.deepEqual(horariosDoAgendamento(comHorarios, { mis: 'Voo Local', tipo: 'C152' }), [420, 480]);
    // A janela das 10:10 fechada: os horários que caem nela saem
    const fechada = { ...estado, win: estado.win.map((v, w) => w !== 2) };
    assert.ok(!horariosDoAgendamento(fechada, { mis: 'Voo Local', tipo: 'C152' }).includes(610));
    assert.deepEqual(horariosDoAgendamento(fechada, { mis: 'Voo Local', tipo: 'PA-34' }).filter(m => m >= 600 && m < 700), [600, 690]);
  });

  it('o encaixe: o mais perto do minuto, o mais cedo no empate, o livre antes; nenhum livre, o mais perto', () => {
    assert.equal(encaixarHorario(625, HORARIOS_PADRAO), 610);
    assert.equal(encaixarHorario(555, HORARIOS_PADRAO), 500, 'empate entre 08:20 e 10:10');
    assert.equal(encaixarHorario(625, HORARIOS_PADRAO, m => m !== 610), 690);
    assert.equal(encaixarHorario(625, HORARIOS_PADRAO, () => false), 610);
    assert.equal(encaixarHorario(625, []), null);
  });

  it('o contexto: a barra da Escala (hoje, a partir de agora), a linha de um recurso ou instrutor, um horário da lista, a turma e o clique no mapa', () => {
    const datas = { data: DATA, hoje: DATA, agora: 605 };
    assert.deepEqual(contextoInicial('dia', datas), { valor: 'dia', origem: 'dia', r: null, insId: null, classKey: null, w: null, minuto: 605, desde: 605, ate: null, perto: false });
    assert.deepEqual([contextoInicial('dia', { ...datas, hoje: HOJE })].map(c => [c.minuto, c.desde]), [[0, null]]);
    assert.deepEqual(['r:PR-VOB', 'i:7', 'w:2', 'w:8', 't:GND_1'].map(v => contextoInicial(v, { data: DATA, hoje: HOJE })).map(c => [c.origem, c.r, c.insId, c.desde, c.ate, c.classKey]), [
      ['recurso', 'PR-VOB', null, null, null, null], ['instrutor', null, 7, null, null, null], ['periodo', null, null, 610, 690, null],
      ['periodo', null, null, 1050, 1440, null], ['turma', null, null, null, null, 'GND_1']
    ]);
    const clique = contextoInicial({ r: 'PR-VOB', minuto: 625 }, datas);
    assert.deepEqual([clique.origem, clique.r, clique.minuto, clique.perto, clique.desde], ['mapa', 'PR-VOB', 625, true, null]);
    assert.equal(contextoInicial('i:x', datas).origem, 'dia');
  });

  it('a duração: a fixa (o Ground, o Noturno), a do programa, a do pedido, a padrão da missão e 1 h', () => {
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Ground C152' }), { horas: 1.5, fixa: true });
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Noturno', missao: { nb: 3 } }), { horas: 4, fixa: true });
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Navegação', missao: { nb: 1.5 }, pedido: { nb: 2.6 } }), { horas: 1.5, fixa: false });
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Navegação', pedido: { nb: 2.6 } }), { horas: 2.6, fixa: false });
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Simulador' }), { horas: 2, fixa: false });
    assert.deepEqual(duracaoDoAgendamento({ mis: 'Voo Local' }), { horas: 1, fixa: false });
  });
});

describe('Agendamento: os padrões do formulário', () => {
  const amb = ambiente({ registros: aprovadas(1001, ['IN-01']) });

  it('sem aluno, o formulário espera por ele', () => {
    const { formulario } = agendar(doDia(), { amb });
    assert.equal(formulario.aluno, null);
    assert.deepEqual(codigos(formulario.formato), ['sem-aluno']);
    assert.equal(formulario.formato[0].texto, 'Escolha o aluno: a missão, o horário e o peso vêm dele.');
  });

  it('os alunos em grupos: fora da escala, na demanda e os outros, com o curso, a próxima missão e os horários do dia', () => {
    const estado = doDia({ ins: [instrutor(1, 9)], s1000: { jan: 'h390' }, extra: {} });
    estado.stu.push(aluno(1002, { p1: 390, p2: -1, jan: 'h390' }, { bl: [1] }));
    const base = runAllocationEngine(estado);
    const grupos = opcoesDeAluno(estado, base, amb, contextoInicial('i:1', amb));
    assert.deepEqual(grupos.map(g => [g.rotulo, g.opcoes.map(o => o.texto)]), [
      ['Ficaram fora da escala', ['Aluno 1002 · não voa com Instrutor 01']],
      ['Na demanda de hoje', ['Aluno 1000 — PP · próxima IN-01 · voa hoje às 06:30']],
      ['Outros alunos', ['Aluno 1001 — PP · próxima IN-02']]
    ]);
  });

  it('a próxima missão do curso, o recurso livre, o instrutor que serve, o primeiro horário livre, a duração e o peso do cadastro', () => {
    const estado = doDia();
    const { base, formulario: f } = agendar(estado, { amb, escolhas: { aluno: 1001 } });
    assert.equal(f.missao, 'missao:PP:IN-02');
    assert.equal(f.missoes.nota, 'Próxima do PP: IN-02 (Fase 1).');
    assert.equal(f.alunoInfo, 'PP · Fase 1 · 1/46 · próxima IN-02');
    const voo1000 = base.out.find(o => o.stuId === 1000);
    assert.notEqual(f.recurso, voo1000.r, 'o recurso livre antes do ocupado agora');
    assert.equal(f.recursos.find(o => o.valor === voo1000.r).texto, `${voo1000.r} · C152 — ocupado agora (o app reorganiza)`);
    assert.equal(f.instrutor, 2, 'o instrutor 1 voa às 06:30 (o app reorganiza)');
    assert.deepEqual(f.instrutores.map(g => [g.rotulo, g.opcoes.map(o => o.texto)]), [
      ['Servem neste horário', ['Instrutor 02']], ['Com aviso', ['Instrutor 01 — ocupado agora (o app reorganiza)']]
    ]);
    assert.equal(f.horario, 390);
    assert.deepEqual(f.horas, { valor: '1', fixa: false });
    assert.deepEqual(f.peso, { visivel: true, aluno: '70', instrutor: '70', resumo: '140 kg de 170 kg no C152: tanque cheio.' });
    assert.equal(f.contextoTexto, 'Quarta-feira, 11/11 · o primeiro horário livre: 06:30');
    assert.deepEqual(f.proposta, {
      stuId: 1001, mis: 'Voo Local', eq: 'C152', nb: 1, a: 390, b: 450, r: f.recurso, insId: 2, missao: { sigla: 'PP', codigo: 'IN-02' },
      pesos: { aluno: 70, instrutor: 70 }, disponibilizar: null
    });
  });

  it('hoje, a partir de agora; o instrutor do "Priorizar com" que serve vem antes; o que o operador mudou fica', () => {
    const estado = doDia({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)] });
    estado.stu[1].voaCom = [3];
    const hoje = { ...amb, hoje: DATA, agora: 600 };
    const { formulario: f } = agendar(estado, { amb: hoje, escolhas: { aluno: 1001 } });
    assert.equal(f.horario, 610, 'a partir das 10:00');
    assert.equal(f.instrutor, 3, 'o do Priorizar com');
    assert.equal(f.contextoTexto, 'Quarta-feira, 11/11 · o primeiro horário livre a partir de agora: 10:10');
    const mudado = agendar(estado, { amb: hoje, escolhas: { aluno: 1001, instrutor: 1, horario: 820, recurso: 'PR-VOC' }, tocados: ['instrutor', 'horario', 'recurso'] }).formulario;
    assert.deepEqual([mudado.instrutor, mudado.horario, mudado.recurso], [1, 820, 'PR-VOC']);
  });

  it('o primeiro horário livre também para o aluno: quem volta do noturno de ontem só voa a partir das 10:10', () => {
    const estado = doDia();
    estado.noturnosDaVespera = [{ stuId: 1001, mid: 0, insId: 1, r: 'PR-VOY', eqType: 'C172', s: 'Aluno 1001', ins: 'Instrutor 01', stuKg: 70, fim: 1290 }];
    const { formulario } = agendar(estado, { amb, escolhas: { aluno: 1001 } });
    assert.equal(formulario.horario, 610);
    assert.match(formulario.alunoInfo, /já voa hoje 07:30 \(Noturno, PR-VOY\)$/);
  });

  it('a preferência do contexto: no avião Só Parafuso, o PE-04; sem contexto, a primeira liberada; no C172, a missão do C152 com aviso', () => {
    const f1a4 = ambiente({ registros: aprovadas(1001, PP.missoes.filter(m => ['PP:F1', 'PP:F2', 'PP:F3', 'PP:F4'].includes(m.fase)).map(m => m.codigo)) });
    const estado = doDia();
    const stu = estado.stu[1];
    const base = runAllocationEngine(estado);
    const missoes = contexto => opcoesDeMissao(estado, base, f1a4, stu, { a: 390, contexto: contextoInicial(contexto, f1a4) });
    assert.equal(missoes('dia').padrao, 'missao:PP:NAV-01');
    assert.equal(missoes('r:PR-JPL').padrao, 'missao:PP:PE-04');
    assert.deepEqual(opcoes(missoes('dia').grupos).filter(o => o.info.estado === 'liberada').map(o => o.info.missao.codigo), ['NAV-01', 'PE-04', 'NOT']);
    assert.equal(missoes('dia').nota, 'Próxima do PP: NAV-01 (Fase 5). Também liberadas: PE-04 (livre na Fase 5), NOT (com TSL-01 e TSL-02) (Fase 6).');
    // Nada aprovado, no C172: a IN-01 (do C152) no avião clicado, com o aviso do recurso do programa
    const { formulario, avaliacao } = agendar(doDia(), { amb: ambiente(), contexto: 'r:PR-VOY', escolhas: { aluno: 1001 } });
    assert.deepEqual([formulario.missao, formulario.recurso], ['missao:PP:IN-01', 'PR-VOY']);
    assert.deepEqual(codigos(avaliacao.avisos), ['recurso-do-programa']);
    assert.equal(avaliacao.avisos[0].texto, 'O programa faz IN-01 no C152; o voo vai no C172, e a missão continua IN-01.');
  });

  it('a preferência do contexto confere o curso pela sigla: o Noturno do PC (IFR) não é o padrão no avião Só VFR nem com o instrutor sem IFR', () => {
    const fase = { id: 'PC:F1', nome: 'Fase 1', ordem: 0, regra: 'ordem', requer: [], removida: false };
    const missao = (codigo, mis, ordem) => ({
      id: `PC:${codigo}`, codigo, nome: codigo, mis, eq: 'C172', nb: 1, fase: 'PC:F1', ordem, regra: 'livre', requer: [], dispensada: false, avaliacao: false, removida: false
    });
    const PC = { sigla: 'PC', nome: 'Piloto Comercial', ordem: 1, ativo: true, fases: [fase], missoes: [missao('NOT', 'Noturno', 0), missao('NAV', 'Navegação', 1)] };
    const semIfr = instrutor(1, 9).hab.filter(h => h !== 'ifr');
    const estado = cenario({ ins: [instrutor(1, 9, { hab: semIfr }), instrutor(2, 9)], stu: [aluno(1001, { fly: false }, { curso: 'PC' })] });
    const base = runAllocationEngine(estado);
    const doPC = ambiente({ programa: [PC] });
    const padrao = contexto => opcoesDeMissao(estado, base, doPC, estado.stu[0], { a: 390, contexto: contextoInicial(contexto, doPC) }).padrao;
    // O PR-CPL é Só VFR e o Instrutor 01 não tem IFR: a NAV; o PR-VOY e o Instrutor 02 servem ao Noturno do PC: a NOT
    assert.deepEqual(['r:PR-CPL', 'r:PR-VOY', 'i:1', 'i:2'].map(padrao), ['missao:PC:NAV', 'missao:PC:NOT', 'missao:PC:NAV', 'missao:PC:NOT']);
  });

  it('o recurso padrão é um em que algum instrutor voa: o PR-VOM (habilitação própria) sem ninguém habilitado não é o padrão', () => {
    const estado = doDia();
    delete estado.stu[1].curso;
    const multi = agendar(estado, { amb, escolhas: { aluno: 1001, missao: 'tipo:Multimotor' }, tocados: ['missao'] });
    assert.ok(['PT-JOB', 'PT-KIW'].includes(multi.formulario.recurso), multi.formulario.recurso);
    assert.deepEqual(codigos(multi.avaliacao.bloqueios), []);
    const nome = estado.ins.find(x => x.id === multi.formulario.instrutor).nm;
    assert.equal(multi.formulario.recursos.find(o => o.valor === 'PR-VOM').texto, `PR-VOM · PA-34 — exige a habilitação própria (${nome} não tem)`);
    // Com o Instrutor 02 habilitado nele, o PR-VOM (o primeiro do hangar) serve, com o Instrutor 02
    estado.ins[1].hab = [...estado.ins[1].hab, 'aviao:PR-VOM'];
    const habilitado = agendar(estado, { amb, escolhas: { aluno: 1001, missao: 'tipo:Multimotor' }, tocados: ['missao'] });
    assert.deepEqual([habilitado.formulario.recurso, habilitado.formulario.instrutor, codigos(habilitado.avaliacao.bloqueios)], ['PR-VOM', 2, []]);
  });

  it('o recurso clicado que não serve à missão pelos atributos (o Só Parafuso no voo local) dá lugar a um que serve, e o contexto diz', () => {
    const { formulario, avaliacao } = agendar(doDia(), { amb, contexto: 'r:PR-JPL', escolhas: { aluno: 1001 } });
    assert.equal(formulario.missao, 'missao:PP:IN-02');
    assert.notEqual(formulario.recurso, 'PR-JPL');
    assert.ok(formulario.contextoTexto.endsWith(`. O PR-JPL não serve ao Voo Local: o voo vai no ${formulario.recurso}.`), formulario.contextoTexto);
    assert.deepEqual(codigos(avaliacao.bloqueios), []);
    assert.equal(formulario.recursos.find(o => o.valor === 'PR-JPL').texto, 'PR-JPL · C152 — só Parafuso');
    // No Parafuso (a PE-04, fora da ordem), o PR-JPL clicado fica, e os outros C152 não servem (o Só Parafuso vale nos dois
    // sentidos); escolhido nele, o voo local troca de avião
    const parafuso = agendar(doDia(), { amb, contexto: 'r:PR-JPL', escolhas: { aluno: 1001, missao: 'missao:PP:PE-04' }, tocados: ['missao'] }).formulario;
    assert.equal(parafuso.recurso, 'PR-JPL');
    assert.equal(parafuso.recursos.find(o => o.valor === 'PR-VOB').texto, 'PR-VOB · C152 — não é Só Parafuso');
    const trocado = agendar(doDia(), { amb, escolhas: { aluno: 1001, recurso: 'PR-JPL', missao: 'missao:PP:IN-02' }, tocados: ['recurso', 'missao'] });
    assert.notEqual(trocado.formulario.recurso, 'PR-JPL');
    assert.deepEqual(codigos(trocado.avaliacao.bloqueios), []);
  });

  it('sem os programas dos cursos, a missão do aluno com curso não é sugerida: o operador escolhe, com a nota', () => {
    const semProgramas = ambiente({ programa: [], programaIndisponivel: true, inferir: false });
    const { formulario, avaliacao } = agendar(doDia(), { amb: semProgramas, escolhas: { aluno: 1001 } });
    assert.equal(formulario.missao, '');
    assert.equal(formulario.missoes.nota, 'Sem os programas dos cursos, as missões do PP não aparecem: escolha a missão.');
    assert.deepEqual(formulario.missoes.grupos.map(g => g.rotulo), ['Sem missão do curso']);
    assert.deepEqual(codigos(avaliacao.bloqueios), ['sem-missao']);
    // Escolhido o tipo, o voo vai sem a missão do curso; o aluno sem curso continua com o tipo padrão
    const escolhida = agendar(doDia(), { amb: semProgramas, escolhas: { aluno: 1001, missao: 'tipo:Voo Local' }, tocados: ['missao'] });
    assert.deepEqual([escolhida.formulario.proposta.missao, codigos(escolhida.avaliacao.bloqueios)], [null, []]);
    const semCurso = doDia();
    delete semCurso.stu[1].curso;
    assert.equal(agendar(semCurso, { amb: semProgramas, escolhas: { aluno: 1001 } }).formulario.missao, 'tipo:Voo Local');
  });

  it('as missões fora da ordem, com o motivo; a condicional, com a missão de que depende', () => {
    const estado = doDia({ s1000: { p1: 390, etapa: 'IN-01' } });
    const base = runAllocationEngine(estado);
    const stu = estado.stu[0];
    const textos = a => Object.fromEntries(opcoes(opcoesDeMissao(estado, base, ambiente(), stu, { a }).grupos).map(o => [o.valor, o.texto]));
    // O IN-01 voa às 06:30: às 06:30 o IN-02 espera por ele; às 08:20, depende do resultado
    assert.equal(textos(390)['missao:PP:IN-01'], 'IN-01 · Voo Local · C152 · 1 h (já no voo de hoje às 06:30)');
    assert.equal(textos(390)['missao:PP:IN-02'], 'IN-02 · Voo Local · C152 · 1 h — IN-01 voa depois, às 06:30');
    assert.equal(textos(500)['missao:PP:IN-02'], 'IN-02 · Voo Local · C152 · 1 h — depende do resultado de IN-01 (hoje 06:30)');
    assert.equal(textos(500)['missao:PP:CT-01'], 'CT-01 · Voo Local · C152 · 1 h — a Fase 2 abre depois da Fase 1: falta IN-02');
    assert.equal(textos(500)['missao:PP:ADAPT-C152'], 'ADAPT-C152 · Voo Local · C152 · 1 h (dispensada)');
    const reprovada = ambiente({ registros: [...aprovadas(1001, ['IN-01']), { id: 9, aluno: 1001, curso: 'PP', missao: 'IN-02', resultado: 'reprovado', data: '2026-11-04' }] });
    const doAluno = opcoes(opcoesDeMissao(estado, base, reprovada, estado.stu[1], { a: 390 }).grupos);
    assert.equal(doAluno.find(o => o.valor === 'missao:PP:CT-01').texto, 'CT-01 · Voo Local · C152 · 1 h — a Fase 2 abre depois da Fase 1: falta IN-02');
    assert.equal(doAluno.find(o => o.valor === 'missao:PP:IN-01').texto, 'IN-01 · Voo Local · C152 · 1 h (já aprovada)');
    const semFase = { ...PP, fases: [{ ...PP.fases[0], id: 'F' }], missoes: PP.missoes.slice(0, 3).map((m, i) => ({ ...m, fase: 'F', ordem: i })) };
    const plano = opcoes(opcoesDeMissao(estado, base, { ...reprovada, programa: [semFase] }, estado.stu[1], { a: 390 }).grupos);
    assert.equal(plano.find(o => o.valor === 'missao:PP:CT-01').texto, 'CT-01 · Voo Local · C152 · 1 h — falta IN-02 (reprovada em 04/11)');
  });

  it('sem os resultados, as missões do curso sem a ordem conferida e sem padrão; sem curso, o tipo de missão', () => {
    const semResultados = ambiente({ inferir: false });
    const { formulario, avaliacao } = agendar(doDia(), { amb: semResultados, escolhas: { aluno: 1001 } });
    assert.equal(formulario.missao, '');
    assert.deepEqual(codigos(avaliacao.bloqueios), ['sem-missao']);
    assert.deepEqual(formulario.missoes.grupos.map(g => g.rotulo), ['Missões do PP (a ordem não foi conferida)', 'Sem missão do curso']);
    const escolhida = agendar(doDia(), { amb: semResultados, escolhas: { aluno: 1001, missao: 'missao:PP:CT-02' }, tocados: ['missao'] });
    assert.deepEqual(codigos(escolhida.avaliacao.avisos), ['ordem-nao-conferida']);
    const estado = doDia();
    delete estado.stu[1].curso;
    const semCurso = agendar(estado, { amb, escolhas: { aluno: 1001 } }).formulario;
    assert.equal(semCurso.missao, 'tipo:Voo Local');
    assert.deepEqual(semCurso.missoes.grupos.map(g => g.rotulo), ['Sem missão do curso']);
    // "Outro tipo de missão…": o tipo escolhido no campo a mais, e o recurso que serve a ele
    const outro = agendar(estado, { amb, escolhas: { aluno: 1001, missao: 'tipo:', tipo: 'Simulador', recurso: 'PR-VOB' }, tocados: ['missao'] }).formulario;
    assert.deepEqual([outro.tipos.length > 10, outro.tipo, outro.recurso.startsWith('SIM-'), outro.horas.valor], [true, 'Simulador', true, '2']);
  });

  it('o Ground: a sala, a duração fixa e os horários das janelas; o Noturno, às 17:30, com a volta amanhã', () => {
    const estado = doDia();
    delete estado.stu[1].curso;
    const ground = agendar(estado, { amb, escolhas: { aluno: 1001, missao: 'tipo:Ground C152' }, tocados: ['missao'] });
    assert.deepEqual([ground.formulario.recurso, ground.formulario.horas, ground.formulario.peso.visivel], ['SALA-GROUND', { valor: '1.5', fixa: true }, false]);
    assert.deepEqual(ground.formulario.horarios, { opcoes: T.slice(0, 8).map(m => ({ valor: m, texto: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })), outro: false });
    assert.equal(ground.formulario.proposta.b - ground.formulario.proposta.a, 90);
    const linha = ground.sim.out.find(o => o.fKey === ground.fKey);
    assert.ok(normalizarLinhaGravada(linha), 'a turma nova é aceita pela escala gravada');
    const noturno = agendar(estado, { amb, contexto: { r: 'PR-VOY', minuto: 600 }, escolhas: { aluno: 1001, missao: 'tipo:Noturno' }, tocados: ['missao'] });
    assert.deepEqual([noturno.formulario.horario, noturno.formulario.horas], [1050, { valor: '4', fixa: true }]);
    assert.deepEqual(codigos(noturno.avaliacao.notas), ['horario-da-missao', 'noturno']);
    assert.deepEqual(noturno.avaliacao.notas.map(n => n.texto), ['O Noturno sai às 17:30.', 'O Noturno volta amanhã às 07:30; o instrutor, o aluno e o avião ficam livres às 10:10.']);
    // Com a janela das 17:30 fechada, o Noturno fica sem horário: o bloqueio diz por quê, e o contexto não fica pela metade
    const fechada = { ...estado, win: estado.win.map((v, w) => w !== 8) };
    const semHorario = agendar(fechada, { amb, escolhas: { aluno: 1001, missao: 'tipo:Noturno' }, tocados: ['missao'] }).formulario;
    assert.deepEqual(codigos(semHorario.formato), ['horario-invalido']);
    assert.equal(semHorario.contextoTexto, 'Quarta-feira, 11/11 · nenhum horário de decolagem aberto');
  });

  it('o Noturno em trechos vai pela noite, com os translados no nome: nenhum translado sozinho, e o voo leva a etapa da noite', () => {
    // O PP com o Noturno em trechos (o do cronograma): o TSL-01 (a ida), a NOT (a noite) e o TSL-02 (a volta) num voo só
    const comTrechos = (mudar = {}) => {
      const curso = cursoPP();
      curso.missoes = curso.missoes.map(m => ({ ...m, ...mudar[m.codigo] }));
      return curso;
    };
    const NT = comTrechos();
    const ate = fases => aprovadas(1001, NT.missoes.filter(m => fases.includes(m.fase)).map(m => m.codigo));
    const ATE_A_4 = ['PP:F1', 'PP:F2', 'PP:F3', 'PP:F4'], ATE_A_8 = [...ATE_A_4, 'PP:F5', 'PP:F7', 'PP:F8'];
    const estado = doDia();
    const base = runAllocationEngine(estado);
    const daFase6 = (amb, stu = estado.stu[1]) => {
      const { grupos, nota } = opcoesDeMissao(estado, base, amb, stu, { a: 390, contexto: contextoInicial('dia', amb) });
      return { textos: opcoes(grupos).filter(o => o.info.tipo === 'missao' && o.info.missao.fase === 'PP:F6').map(o => o.texto), nota };
    };
    // Depois da Fase 4: a noite, liberada, com os translados no nome (também na nota); sem os resultados, também só ela
    const f1a4 = ambiente({ programa: [NT], registros: ate(ATE_A_4) });
    assert.deepEqual(daFase6(f1a4), {
      textos: ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 3 h'],
      nota: 'Próxima do PP: NAV-01 (Fase 5). Também liberadas: PE-04 (livre na Fase 5), NOT (com TSL-01 e TSL-02) (Fase 6).'
    });
    assert.deepEqual(daFase6({ ...f1a4, inferir: false }).textos, ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 3 h']);
    // A noite aprovada: só ela, fora da ordem; o translado dispensado não vai, nem no nome
    assert.deepEqual(daFase6(ambiente({ programa: [NT], registros: [...ate(ATE_A_4), ...aprovadas(1001, ['NOT'])] })).textos,
      ['NOT (com TSL-01 e TSL-02) · Noturno · C172 · 3 h (já aprovada)']);
    assert.deepEqual(daFase6(ambiente({ programa: [comTrechos({ 'TSL-02': { dispensada: true } })], registros: ate(ATE_A_4) })).textos,
      ['NOT (com TSL-01) · Noturno · C172 · 3 h']);
    // Até a Fase 8: a próxima é o Noturno, no aluno e no formulário, e o pedido do voo leva a etapa da noite
    const f1a8 = ambiente({ programa: [NT], registros: ate(ATE_A_8) });
    const doAluno = opcoesDeAluno(estado, base, f1a8, contextoInicial('dia', f1a8)).flatMap(g => g.opcoes).find(o => o.valor === 1001);
    assert.equal(doAluno.texto, 'Aluno 1001 — PP · próxima NOT (com TSL-01 e TSL-02)');
    const { formulario } = agendar(estado, { amb: f1a8, escolhas: { aluno: 1001 } });
    assert.deepEqual([formulario.missao, formulario.alunoInfo], ['missao:PP:NOT', 'PP · Fase 6 · 42/46 · próxima NOT (com TSL-01 e TSL-02)']);
    assert.deepEqual([formulario.proposta.mis, formulario.proposta.missao], ['Noturno', { sigla: 'PP', codigo: 'NOT' }]);
    const depois = structuredClone(estado);
    const { criadoComo } = aplicarAgendamento(depois, base, formulario.proposta);
    assert.deepEqual([criadoComo.mis, criadoComo.etapa, criadoComo.cursoDaEtapa], ['Noturno', 'NOT', 'PP']);
  });

  it('a turma de Ground com atrasos diferentes ocupa a sala pelo primeiro aluno que o motor confere (a prioridade antes do cadastro)', () => {
    // Escala aprovada: a turma das 08:20 (Aluno 1000, prioridade 3, atrasado para as 10:10; Aluno 1001, prioridade 5)
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [
      aluno(1000, { ...GROUND_C152, p1: 500, p2: -1, pr: 3 }), aluno(1001, { ...GROUND_C152, p1: 500, p2: -1, pr: 5 }), aluno(1002, { fly: false })
    ] });
    const turma = runAllocationEngine(estado).out;
    estado.fixos = Object.fromEntries(turma.map(o => [o.fKey, { a: o.a, b: o.b, r: o.r, insId: o.insId, classKey: o.classKey }]));
    estado.aprovacao = { em: '2026-11-10T20:00:00.000Z', por: '' };
    estado.fStatus = { '1000_0_1': 'Atrasado' };
    estado.fObs = { '1000_0_1': { novoInicio: 610 } };
    const base = runAllocationEngine(estado);
    assert.deepEqual(naOrdemDoMotor(estado, base.out).map(o => o.stuId), [1001, 1000], 'o motor confere primeiro a prioridade 5');
    const opcoesNaOrdem = { fStatus: estado.fStatus, fObs: estado.fObs, efetivo: true, soFixos: true };
    assert.deepEqual(ocupacaoDaEscala(naOrdemDoMotor(estado, base.out), opcoesNaOrdem).recursos.get('SALA-GROUND').map(o => [o.a, o.b]), [[500, 590]]);
    assert.deepEqual(ocupacaoDaEscala(base.out, opcoesNaOrdem).recursos.get('SALA-GROUND').map(o => [o.a, o.b]), [[610, 700]], 'na ordem da escala, o atrasado viria primeiro');
    // A sala está livre às 10:10 para uma turma nova, como na simulação
    const sala = opcoesDeRecurso(estado, base, { mis: 'Ground C152', a: 610, b: 700 });
    assert.deepEqual(sala.map(o => [o.valor, o.desligada]), [['SALA-GROUND', false]]);
    const novo = agendar(estado, { escolhas: { aluno: 1002, missao: 'tipo:Ground C152', horario: 610 }, tocados: ['missao', 'horario'] });
    assert.deepEqual(codigos(novo.avaliacao.bloqueios), []);
    assert.equal(opcoesDeRecurso(estado, base, { mis: 'Ground C152', a: 500, b: 590 })[0].texto, 'Sala Ground — turma fixa 08:20–09:50 (Ground C152)');
  });
});

describe('Agendamento: o pedido e o voo fixo', () => {
  const proposta = (campos = {}) => ({
    stuId: 1001, mis: 'Voo Local', eq: 'C152', nb: 1, a: 610, b: 670, r: 'PR-VOB', insId: 2, missao: { sigla: 'PP', codigo: 'IN-02' },
    pesos: { aluno: 70, instrutor: 70 }, disponibilizar: null, ...campos
  });

  it('o pedido principal que não voa, com a chave limpa, recebe o voo; a reversão devolve o de antes', () => {
    const estado = doDia({ s1001: { jan: 'manha', etapa: 'IN-01', insId: 1, solicitacao: 7, p1: 500, p2: 610 } });
    const antes = aplicarAgendamento(estado, null, proposta());
    const stu = estado.stu[1];
    assert.deepEqual([antes.mid, antes.criado], [0, true]);
    assert.deepEqual(antes.pedido, { fly: false, mis: 'Voo Local', eq: 'C152', p1: 500, p2: 610, nb: 1, ss: 1, pr: 3, jan: 'manha', etapa: 'IN-01', solicitacao: 7, insId: 1 });
    assert.deepEqual([stu.fly, stu.mis, stu.p1, stu.p2, stu.etapa, stu.cursoDaEtapa, stu.insId, stu.jan, stu.solicitacao], [true, 'Voo Local', 610, -1, 'IN-02', 'PP', 2, undefined, undefined]);
    assert.deepEqual(estado.fixos['1001_0_1'], { a: 610, b: 670, r: 'PR-VOB', insId: 2, agendado: true });
    const rev = validarReversao(reversaoDoAgendamento(antes));
    assert.equal(rev.label, '↶ Desfazer');
    assert.deepEqual(rev.criadoComo.etapa, 'IN-02');
    assert.equal(motivoParaNaoDesfazer(estado, rev), '');
    assert.ok(desfazerAgendamento(estado, rev));
    assert.deepEqual([stu.fly, stu.jan, stu.etapa, stu.insId, stu.solicitacao, stu.cursoDaEtapa], [false, 'manha', 'IN-01', 1, 7, undefined]);
    assert.ok(!Object.hasOwn(estado.fixos, '1001_0_1'));
  });

  it('com o pedido principal voando, ou com sobras do dia na chave dele (inclusive um resultado), uma missão extra nova', () => {
    const voando = doDia();
    const extra = aplicarAgendamento(voando, null, proposta({ stuId: 1000 }));
    assert.deepEqual([extra.mid, extra.pedido, voando.stu[0].extra.map(ex => ex.mid)], [1, null, [1]]);
    assert.deepEqual(voando.fixos['1000_1_1'], { a: 610, b: 670, r: 'PR-VOB', insId: 2, agendado: true });
    const sobras = doDia({ extra: { fStatus: { '1001_0_1': 'Cancelado' }, resultados: { situacao: [], doDia: [{ voo: '1001_1_1' }] } } });
    const antes = aplicarAgendamento(sobras, null, proposta());
    assert.deepEqual([antes.mid, antes.pedido, sobras.stu[1].fly], [2, null, false]);
    assert.equal(sobras.stu[1].extra[0].pr, 3);
    // Desfazer tira a missão extra e limpa a chave dela
    sobras.fStatus['1001_2_1'] = 'Confirmado';
    assert.ok(desfazerAgendamento(sobras, validarReversao(reversaoDoAgendamento(antes))));
    assert.deepEqual([sobras.stu[1].extra, Object.hasOwn(sobras.fixos, '1001_2_1'), Object.hasOwn(sobras.fStatus, '1001_2_1')], [[], false, false]);
  });

  it('desfazer não tira outra missão extra que ficou com o mesmo número depois de a do agendamento sair', () => {
    const estado = doDia();
    const antes = aplicarAgendamento(estado, null, proposta({ stuId: 1000 }));
    const rev = validarReversao(reversaoDoAgendamento(antes));
    // Tirar da escala e pôr de volta não muda o pedido
    estado.stu[0].extra[0].fly = false;
    assert.equal(motivoParaNaoDesfazer(estado, rev), '');
    // A missão extra saiu na Demanda (o pino com ela) e outra foi criada no mesmo número
    estado.stu[0].extra = [missaoExtra(1, { p1: 760, p2: 870 })];
    delete estado.fixos['1000_1_1'];
    assert.equal(motivoParaNaoDesfazer(estado, rev), 'O pedido mudou depois do agendamento: desfazer agora mexeria em outro voo. Mude o pedido na Demanda.');
    // Sem a missão (tirada e não criada de novo), desfazer só limpa a chave
    estado.stu[0].extra = [];
    assert.equal(motivoParaNaoDesfazer(estado, rev), '');
    // A reversão de antes do guarda (sem criadoComo) continua valendo; criadoComo sem criado, não
    const { criadoComo, ...semGuarda } = reversaoDoAgendamento(antes);
    assert.ok(validarReversao(semGuarda) && !validarReversao(semGuarda).criadoComo && criadoComo);
    assert.equal(validarReversao({ ...reversaoDoAgendamento(antes), criado: false, pedido: antes.criadoComo }), null);
    assert.equal(validarReversao({ ...reversaoDoAgendamento(antes), criadoComo: { mis: ['Voo Local'], fly: true } }), null);
  });

  it('os pesos digitados vão para o cadastro, um texto do histórico cada; "Marcar disponível" liga o instrutor nos períodos do voo', () => {
    const estado = doDia();
    estado.ins[1].on = false;
    estado.ins[1].aw = estado.ins[1].aw.map(() => false);
    const antes = aplicarAgendamento(estado, null, proposta({ pesos: { aluno: 82.5, instrutor: 70 }, disponibilizar: { insId: 2 } }));
    assert.deepEqual(antes.pesos, [{ tipo: 'aluno', id: 1001, nm: 'Aluno 1001', kg: 82.5 }]);
    assert.deepEqual(historicoDosPesos(antes), ['Peso Aluno 1001: 82,5 kg (agendamento)']);
    assert.equal(estado.stu[1].kg, 82.5);
    assert.deepEqual([estado.ins[1].on, estado.ins[1].aw.map((v, w) => (v ? w : -1)).filter(w => w >= 0)], [true, [2]]);
    assert.deepEqual(antes.disponibilidade, { insId: 2, on: false, aw: Array(9).fill(false) });
    // Desfazer devolve a disponibilidade; o peso é da pessoa e fica
    assert.ok(desfazerAgendamento(estado, validarReversao(reversaoDoAgendamento(antes))));
    assert.deepEqual([estado.ins[1].on, estado.ins[1].aw.some(Boolean), estado.stu[1].kg], [false, false, 82.5]);
  });

  it('a prévia é a escala que fica: aplicar no estado e refazer a escala dá a escala simulada', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 5)], stu: [
      aluno(1000, { p1: 390, p2: 500 }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' }), aluno(1002, { ...GROUND_C152, p1: 500, p2: -1 }),
      aluno(1003, { mis: 'Navegação', nb: 2, p1: 610, p2: -1 }), aluno(1004, { p1: 390, p2: -1 }, { voaCom: [2] })
    ] });
    const { formulario, sim } = agendar(estado, { escolhas: { aluno: 1001, horario: 390, instrutor: 2 }, tocados: ['horario', 'instrutor'] });
    const real = structuredClone(estado);
    aplicarAgendamento(real, null, formulario.proposta);
    assert.deepEqual(runAllocationEngine(real), sim);
  });
});

describe('Agendamento: a conferência', () => {
  const amb = ambiente({ registros: aprovadas(1001, ['IN-01']) });
  const conferir = (estado, opcoesDoAgendamento = {}) => agendar(estado, { amb, ...opcoesDoAgendamento }).avaliacao;

  it('os bloqueios do formato: a missão, o horário, a duração, o peso e a meia-noite, cada um com o campo', () => {
    const estado = doDia();
    const de = (escolhas, tocados) => conferir(estado, { escolhas: { aluno: 1001, ...escolhas }, tocados }).bloqueios.map(b => [b.codigo, b.campo]);
    assert.deepEqual(de({ horario: 'outro', outroHorario: '' }, []), [['horario-invalido', 'agd-outro-horario']]);
    assert.deepEqual(de({ horas: '7' }, ['horas']), [['duracao', 'agd-horas']]);
    assert.deepEqual(de({ horario: 'outro', outroHorario: '23:30' }, []), [['depois-da-meia-noite', 'agd-outro-horario']]);
    assert.deepEqual(de({ kgAluno: '400' }, ['kgAluno']), [['peso-invalido', 'agd-kg-aluno']]);
    assert.deepEqual(de({ kgInstrutor: { 2: '0,0' } }, []), [['peso-invalido', 'agd-kg-instrutor']]);
    // Sem instrutor no cadastro, ou sem recurso do tipo na frota
    const semInstrutor = conferir(doDia({ ins: [] }), { escolhas: { aluno: 1001 } }).bloqueios.map(b => [b.codigo, b.campo]);
    assert.deepEqual(semInstrutor, [['sem-instrutor', 'agd-instrutor']]);
    const semSimulador = { ...doDia(), frota: [{ reg: 'PR-VOB', tipo: 'C152' }] };
    delete semSimulador.stu[1].curso;
    const semRecurso = conferir(semSimulador, { escolhas: { aluno: 1001, missao: 'tipo:', tipo: 'Simulador', recurso: 'PR-VOB' }, tocados: ['missao'] }).bloqueios;
    assert.deepEqual(semRecurso.map(b => [b.codigo, b.texto]), [['sem-recurso', 'Nenhum recurso para Simulador na frota.']]);
  });

  it('o instrutor indisponível bloqueia, com "Marcar disponível": marcado, o voo passa, com a nota, e o histórico diz', () => {
    const estado = doDia();
    estado.ins[1].on = false;
    const { avaliacao } = agendar(estado, { amb, escolhas: { aluno: 1001, instrutor: 2 }, tocados: ['instrutor'] });
    assert.deepEqual(avaliacao.bloqueios, [{ codigo: 'instrutor-indisponivel', texto: 'O instrutor não está disponível.', campo: 'agd-instrutor', opcoes: [{ opcao: 'disponibilizar', texto: 'Marcar Instrutor 02 disponível às 06:30' }] }]);
    const marcado = agendar(estado, { amb, escolhas: { aluno: 1001, instrutor: 2, disponibilizar: 2 }, tocados: ['instrutor'] });
    assert.deepEqual(codigos(marcado.avaliacao.bloqueios), []);
    assert.ok(codigos(marcado.avaliacao.notas).includes('disponibilizar'));
    assert.equal(descricaoDoAgendamento(estado, marcado.formulario.proposta, marcado.avaliacao),
      `Agendado na escala: Aluno 1001 · IN-02 (Voo Local) · 06:30–07:30 · ${marcado.formulario.recurso} · Instrutor 02 · Instrutor 02 marcado disponível às 06:30`);
  });

  it('o avião, o aluno e o instrutor ocupados por um voo fixo, o horário fechado e o peso acima do limite bloqueiam', () => {
    // O Aluno 1000 está em voo no PR-VOB às 06:30 com o Instrutor 01
    const emVoo = doDia({ extra: { fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 1 } }, fStatus: { '1000_0_1': 'Em Voo' } } });
    const aviao = conferir(emVoo, { escolhas: { aluno: 1001, recurso: 'PR-VOB', horario: 390 }, tocados: ['recurso', 'horario'] });
    assert.deepEqual(aviao.bloqueios, [{ codigo: 'aviao-ocupado', texto: 'O avião já está ocupado neste horário.', campo: 'agd-recurso' }]);
    const instrutor = conferir(emVoo, { escolhas: { aluno: 1001, instrutor: 1, horario: 390 }, tocados: ['instrutor', 'horario'] });
    assert.deepEqual(codigos(instrutor.bloqueios), ['instrutor-ocupado']);
    // O próprio aluno: uma missão extra às 06:30
    const aluno1000 = conferir(emVoo, { escolhas: { aluno: 1000, horario: 390 }, tocados: ['horario'] });
    assert.deepEqual(codigos(aluno1000.bloqueios), ['aluno-ocupado']);
    const fechada = doDia({ extra: { win: Array(9).fill(true).map((v, w) => w !== 2) } });
    assert.deepEqual(codigos(conferir(fechada, { escolhas: { aluno: 1001, horario: 'outro', outroHorario: '10:25' } }).bloqueios), ['horario-fechado']);
    const pesado = conferir(doDia(), { escolhas: { aluno: 1001, kgAluno: '150', kgInstrutor: { 2: '110' } }, tocados: ['kgAluno'] });
    assert.deepEqual(codigos(pesado.bloqueios), ['peso']);
  });

  it('o voo de outro aluno que fica em conflito por causa do agendamento bloqueia', () => {
    // O Aluno 1001 já está agendado no PR-VOB às 06:30; o Aluno 1000 agendado no mesmo avião e horário passa na frente
    // (o pedido com o instrutor escolhido) e deixa o outro em conflito
    const estado = doDia({ s1001: { fly: true, p1: 390, p2: -1 }, extra: { fixos: { '1001_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 2, agendado: true } } } });
    estado.stu[0].fly = false;
    const { avaliacao } = agendar(estado, { amb, escolhas: { aluno: 1000, recurso: 'PR-VOB', horario: 390, instrutor: 1 }, tocados: ['recurso', 'horario', 'instrutor'] });
    assert.deepEqual(avaliacao.bloqueios, [{ codigo: 'conflito-em-outro-voo', texto: 'Agendar aqui deixa o voo de Aluno 1001 em conflito: o avião já está ocupado neste horário.', campo: 'agd-horario' }]);
  });

  it('as regras do curso pedem confirmação: fora da ordem, já aprovada, dispensada, repetida no dia, de outro curso, curso encerrado', () => {
    const estado = doDia({ s1000: { etapa: 'IN-01' } });
    const aviso = (stuId, missao, outro = {}) => conferir(estado, { amb: { ...amb, ...outro }, escolhas: { aluno: stuId, missao }, tocados: ['missao'] }).avisos;
    assert.deepEqual(aviso(1001, 'missao:PP:CT-01'), [{ codigo: 'fora-da-ordem', texto: 'CT-01 fora da ordem: a Fase 2 abre depois da Fase 1: falta IN-02.', resumo: 'fora da ordem (a Fase 2 abre depois da Fase 1: falta IN-02)', campo: 'agd-missao' }]);
    assert.deepEqual(codigos(aviso(1001, 'missao:PP:IN-01')), ['ja-aprovada']);
    assert.deepEqual(codigos(aviso(1001, 'missao:PP:ADAPT-C152')), ['dispensada']);
    assert.deepEqual(aviso(1000, 'missao:PP:IN-01').map(a => [a.codigo, a.texto]), [['repetida-no-dia', 'IN-01 já está no voo de hoje às 06:30: o aluno voa a missão duas vezes no dia.']]);
    const encerrado = aviso(1001, 'missao:PP:IN-02', { programa: [{ ...PP, ativo: false }] });
    assert.deepEqual(codigos(encerrado), ['curso-encerrado']);
    // A missão de outro curso (o aluno trocou de curso)
    const { formulario, sim, fKey } = agendar(estado, { amb, escolhas: { aluno: 1001 } });
    const deOutro = { ...formulario, selecao: { ...formulario.selecao, info: { ...formulario.selecao.info, sigla: 'PC' } } };
    const base = runAllocationEngine(estado);
    assert.deepEqual(codigos(avaliarAgendamento({ estado, base, baseComPesos: base, sim, fKey, formulario: deOutro, ambiente: amb }).avisos), ['outro-curso']);
  });

  it('as regras que o motor não confere nos agendados viram avisos: fora dos horários, depois das 17:30, o 7º local, antes do Ground, sem peso', () => {
    const avisos = (estado, escolhas, tocados = []) => conferir(estado, { escolhas: { aluno: 1001, ...escolhas }, tocados }).avisos.map(a => [a.codigo, a.texto]);
    assert.deepEqual(avisos(doDia(), { horario: 'outro', outroHorario: '10:25' }), [['fora-dos-horarios', 'Agendado às 10:25, fora dos horários de decolagem do C152.']]);
    assert.deepEqual(avisos(doDia(), { horario: 'outro', outroHorario: '16:50' }).map(([c]) => c), ['fora-dos-horarios', 'depois-das-17h30']);
    // Seis voos locais fixos às 08:20 (escala aprovada): o agendado é o 7º
    const seis = cenario({ ins: [1, 2, 3, 4, 5, 6, 7].map(id => instrutor(id, 9)), stu: [1000, 1002, 1003, 1004, 1005, 1006].map(id => aluno(id, { p1: 500, p2: -1 })) });
    seis.stu.push(aluno(1001, { fly: false }, { curso: 'PP' }));
    const regs = ['PP-LJV', 'PR-BTB', 'PR-IGU', 'PR-MLB', 'PR-TBT', 'PR-THI'];
    seis.fixos = Object.fromEntries([1000, 1002, 1003, 1004, 1005, 1006].map((id, i) => [`${id}_0_1`, { a: 500, b: 560, r: regs[i], insId: i + 1 }]));
    seis.aprovacao = { em: '2026-11-10T20:00:00.000Z', por: '' };
    assert.deepEqual(avisos(seis, { horario: 500 }, ['horario']), [['limite-de-locais', 'Agendado às 08:20 como o 7º voo local do horário: no máximo 6 voos locais saem no mesmo horário.']]);
    // O Ground fixo do aluno às 08:20 e o voo agendado às 06:30, antes do fim dele
    const comGround = doDia({ s1001: { ...GROUND_C152, fly: true, p1: 500, p2: -1 } });
    comGround.stu[1].extra = [];
    const turma = runAllocationEngine(comGround).out.find(o => o.stuId === 1001);
    comGround.fixos = { '1001_0_1': { a: turma.a, b: turma.b, r: turma.r, insId: turma.insId, classKey: turma.classKey } };
    comGround.fStatus = { '1001_0_1': 'Confirmado' };
    comGround.aprovacao = { em: '2026-11-10T20:00:00.000Z', por: '' };
    assert.deepEqual(avisos(comGround, { horario: 390 }, ['horario']), [['antes-do-ground', 'Agendado às 06:30, antes do fim do Ground C152 do aluno (09:50): o Ground vem antes do voo.']]);
    const semPeso = conferir(doDia(), { escolhas: { aluno: 1001, kgAluno: '' }, tocados: ['kgAluno'] }).avisos;
    assert.deepEqual(semPeso.map(a => [a.codigo, a.campo, a.resumo]), [['sem-peso', 'agd-kg-aluno', 'sem peso']]);
  });

  it('o voo que sai da escala e o conflito que só o peso digitado cria pedem confirmação', () => {
    // Um instrutor só: o Aluno 1000 só pode às 06:30 e sai da escala quando o 1001 fica com o instrutor às 06:30
    const estado = doDia({ ins: [instrutor(1, 9)], s1000: { jan: 'h390' } });
    const saem = conferir(estado, { escolhas: { aluno: 1001, horario: 390 }, tocados: ['horario'] }).avisos;
    assert.deepEqual(saem.map(a => [a.codigo, a.resumo]), [['saem', 'tira 1 voo da escala']]);
    assert.match(saem[0].texto, /^Agendar aqui tira da escala: Aluno 1000 \(.+\)\.$/);
    // O Instrutor 02 voa com o Aluno 1000 (100 kg) às 08:20 na escala aprovada; com 120 kg digitados, aquele voo passa do limite
    const aprovado = doDia({ s1000: { p1: 500, insId: 2 } });
    aprovado.stu[0].kg = 100;
    const voo = runAllocationEngine(aprovado).out.find(o => o.stuId === 1000);
    aprovado.fixos = { [voo.fKey]: { a: voo.a, b: voo.b, r: voo.r, insId: voo.insId } };
    aprovado.aprovacao = { em: '2026-11-10T20:00:00.000Z', por: '' };
    const comPeso = conferir(aprovado, { escolhas: { aluno: 1001, instrutor: 2, horario: 610, kgInstrutor: { 2: '120' } }, tocados: ['instrutor', 'horario'] });
    assert.deepEqual(codigos(comPeso.bloqueios), []);
    assert.deepEqual(codigos(comPeso.avisos), ['peso-muda-outro-voo']);
    assert.match(comPeso.avisos[0].texto, /^Com o peso digitado, o voo de Aluno 1000 fica em conflito: o peso do aluno e do instrutor passa do limite/);
    assert.deepEqual(codigos(comPeso.notas), ['reduzir-combustivel', 'escala-aprovada']);
  });

  it('a data e o horário: o que já passou, a data passada, o domingo; sem as horas dos instrutores, a lei não conferida', () => {
    const avisos = (outro, escolhas = {}, tocados = []) => codigos(agendar(doDia(), { amb: { ...amb, ...outro }, escolhas: { aluno: 1001, ...escolhas }, tocados }).avaliacao.avisos);
    assert.deepEqual(avisos({ hoje: DATA, agora: 700 }, { horario: 390 }, ['horario']), ['horario-passado']);
    assert.deepEqual(avisos({ hoje: '2026-11-12' }), ['data-passada']);
    assert.deepEqual(avisos({ data: '2026-11-15', hoje: '2026-11-14' }), ['domingo']);
    assert.deepEqual(avisos({ semHoras: true }), ['lei-nao-conferida']);
  });

  it('as notas: a condicional, a duração diferente da do programa, o instrutor fora do Priorizar com e o pedido que ficou fora', () => {
    // O IN-02 voa às 06:30; o voo das 08:20 recebe o CT-01, que depende do resultado
    const estado = doDia({ s1000: { etapa: 'IN-01' } });
    estado.stu[1] = { ...estado.stu[1], fly: true, p1: 390, p2: -1, etapa: 'IN-02', voaCom: [1] };
    const notas = conferir(estado, { escolhas: { aluno: 1001, horario: 500, horas: '1,5', instrutor: 2 }, tocados: ['horario', 'horas', 'instrutor'] }).notas;
    assert.deepEqual(notas.map(n => [n.codigo, n.texto]), [
      ['condicional', 'CT-01 depende do resultado de IN-02 (hoje 06:30).'],
      ['duracao-do-programa', 'A duração (1,5 h) é diferente da do programa para CT-01 (1 h).'],
      ['fora-do-priorizar', 'Instrutor 02 está fora do Priorizar com de Aluno 1001.']
    ]);
    const fora = doDia({ ins: [instrutor(1, 9)], s1000: { jan: 'h390' } });
    fora.stu.push(aluno(1002, { p1: 390, p2: -1, jan: 'h390' }));
    assert.ok(codigos(conferir(fora, { escolhas: { aluno: 1002, horario: 500 }, tocados: ['horario'] }).notas).includes('pedido-fora'));
  });

  it('a confirmação vale para um conjunto de avisos; a descrição do histórico tem até 500 caracteres', () => {
    assert.notEqual(assinaturaDosAvisos([{ codigo: 'sem-peso', texto: 'a' }]), assinaturaDosAvisos([{ codigo: 'sem-peso', texto: 'b' }]));
    assert.equal(assinaturaDosAvisos([]), '');
    const longo = 'N'.repeat(80);
    const estado = doDia();
    estado.stu[1].nm = longo;
    estado.ins[1].nm = longo;
    const { formulario } = agendar(estado, { amb, escolhas: { aluno: 1001, instrutor: 2, disponibilizar: 2 }, tocados: ['instrutor'] });
    const avisos = Array.from({ length: 30 }, (_, i) => ({ codigo: 'fora-da-ordem', resumo: `fora da ordem (falta a missão ${i})` }));
    const texto = descricaoDoAgendamento(estado, formulario.proposta, { avisos });
    assert.ok(texto.length <= 500, `${texto.length} caracteres`);
    assert.match(texto, /^Agendado na escala: N{80} · IN-02 \(Voo Local\) · 06:30–07:30 · .+ · confirmado: fora da ordem/);
    assert.ok(texto.endsWith(`· ${longo} marcado disponível às 06:30`));
    const aprovada = { ...estado, aprovacao: { em: '2026-11-10T20:00:00.000Z', por: '' } };
    assert.match(descricaoDoAgendamento(aprovada, formulario.proposta, { avisos: [] }), /^Agendado na escala aprovada: /);
  });
});

describe('Agendamento: os instrutores', () => {
  it('em grupos: os que servem, os com aviso (indisponível; ocupado só com voo que não é fixo) e os que não servem, com o motivo', () => {
    const estado = doDia({ ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9, { on: false }), instrutor(4, 9, { hab: ['grounds'] }), instrutor(5, 9)], extra: {
      fixos: { '1000_0_1': { a: 390, b: 450, r: 'PR-VOB', insId: 5 } }, fStatus: { '1000_0_1': 'Em Voo' }
    } });
    estado.stu[1].bl = [2];
    const base = runAllocationEngine(estado);
    const grupos = opcoesDeInstrutor(estado, base, { mis: 'Voo Local', tipo: 'C152', a: 390, b: 450, stu: estado.stu[1], stuKg: 70, curso: 'PP', r: 'PR-VOC' });
    assert.deepEqual(grupos.map(g => [g.rotulo, g.opcoes.map(o => [o.texto, Boolean(o.desligada)])]), [
      ['Servem neste horário', [['Instrutor 01', false]]],
      ['Com aviso', [['Instrutor 03 — indisponível', false]]],
      ['Não servem', [['Instrutor 04 — sem a habilitação', true], ['Instrutor 02 — em Não escalar com', true], ['Instrutor 05 — ocupado: voo fixo 06:30–07:30 (Aluno 1000)', true]]]
    ]);
  });
});

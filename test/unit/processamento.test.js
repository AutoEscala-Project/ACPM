// O processamento dos pedidos da agenda (js/processamento.js): a conciliação dos pedidos da data com o dia (o plano e a
// aplicação dele, a saída com a lista de espera) e a importação para a demanda da data, feita sobre ela: cada pedido vira
// um voo, no lugar do voo da mesma missão posto à mão ou numa missão nova; o aluno de um curso entra com a missão do programa
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { conciliarPedidos, aplicarConciliacao, resumoDaConciliacao, ficaNaEscala, porQueOVooFica, missaoDaEntrada } from '../../js/processamento.js';
import { importar as importarPedidos } from '../helpers/importar.js';
import { fixosAoAprovar } from '../../js/fixos.js';
import { normalizarCursos } from '../../js/cursos.js';
import { programaDoLegado, percursoDoCurso, novoCurso } from '../../js/programa.js';
import { MODELOS } from '../../js/modelos-de-curso.js';
import { runAllocationEngine } from '../../js/engine.js';
import { blank, comAPrioridadePadrao } from '../../js/rules.js';
import { setS } from '../../js/state.js';
import { programaParaInferir } from '../../js/views/etapas.js';
import { aluno, cenario, instrutor, apenas } from '../helpers/montar.js';
import { ligarFuncionalidades } from '../helpers/funcionalidades.js';

// O cronograma do PP (o modelo do app, com o Noturno em trechos) como o curso PP, com os ids tirados da sigla e da chave
const cursoPP = () => novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, (s, c) => `${s}:${c}`).curso;

describe('Importar as solicitações da agenda para a demanda', () => {
  afterEach(() => ligarFuncionalidades());
  const pedido = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'horario', horario: '12:40', cancelada_em: null, ...extra });
  const estado = () => ({ nid: 2000, importadas: [], stu: [aluno(1000, { fly: false }), aluno(1001, { mis: 'IFR', eq: 'C172' }), aluno(1002)] });
  // O programa do cadastro (a lista de missões de cada curso) no formato dos cursos, como a tela o passa
  const doCadastro = cursos => programaDoLegado(normalizarCursos(cursos), (s, c) => `${s}:${c}`);

  it('aluno sem voo no dia: o pedido vira a missão principal', () => {
    const e = estado();
    const resumo = importarPedidos(e, [pedido(1, 1000)]);
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    assert.deepEqual([e.stu[0].fly, e.stu[0].mis, e.stu[0].jan, e.stu[0].p1], [true, 'Voo Local', 'h760', 760]);
    assert.deepEqual(e.importadas, [1]);
  });

  // Q8 (F1d): o pedido com o 7º voo local confirmado na Agenda (limite_confirmado_por e _em) entra com
  // limiteConfirmado: true; o que não foi confirmado, sem o campo. O voo à mão que dá lugar ao pedido fica com o do pedido
  it('o 7º voo local confirmado entra com limiteConfirmado; o voo que dá lugar ao pedido perde o de antes', () => {
    const e = estado();
    const confirmado = { janela: 'horario', horario: '08:20', limite_confirmado_por: 'Maria', limite_confirmado_em: '2026-11-10T14:00:00.000Z' };
    importarPedidos(e, [pedido(1, 1000, confirmado), pedido(2, 1001)]);
    assert.deepEqual([e.stu[0].limiteConfirmado, e.stu[0].jan], [true, 'h500']);
    assert.equal(Object.hasOwn(e.stu[1].extra[0], 'limiteConfirmado'), false);
    const outro = estado();
    outro.stu[2].limiteConfirmado = true;
    importarPedidos(outro, [pedido(3, 1002, { janela: 'horario', horario: '10:10' })]);
    assert.deepEqual([outro.stu[2].solicitacao, Object.hasOwn(outro.stu[2], 'limiteConfirmado')], [3, false]);
  });

  it('aluno já voando outra missão: o pedido entra como missão extra', () => {
    const e = estado();
    importarPedidos(e, [pedido(2, 1001)]);
    assert.equal(e.stu[1].mis, 'IFR', 'a missão que ele já tinha continua');
    // A missão extra é numerada no aluno: o número do cadastro (nid) não muda
    assert.deepEqual(e.stu[1].extra.map(x => [x.mid, x.mis, x.jan]), [[1, 'Voo Local', 'h760']]);
    assert.equal(e.nid, 2000);
  });

  it('aluno já voando a mesma missão (copiada da data anterior, sem pedido da agenda): o pedido toma o lugar dela', () => {
    const e = estado();
    const resumo = importarPedidos(e, [pedido(3, 1002)]);
    assert.deepEqual(resumo, { novos: 0, atualizados: 1, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    assert.deepEqual([e.stu[2].jan, e.stu[2].p1, e.stu[2].solicitacao, e.stu[2].extra], ['h760', 760, 3, []]);
  });

  it('dois pedidos da mesma missão para o mesmo aluno: dois voos, cada um no seu horário', () => {
    const e = estado();
    const pedidos = [pedido(10, 1002, { janela: 'horario', horario: '10:10' }), pedido(11, 1002, { janela: 'horario', horario: '14:30' })];
    const resumo = importarPedidos(e, pedidos);
    assert.deepEqual(resumo, { novos: 1, atualizados: 1, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    const voos = [e.stu[2], ...e.stu[2].extra];
    assert.deepEqual(voos.map(v => [v.mis, v.jan, v.solicitacao, v.fly]), [['Voo Local', 'h610', 10, true], ['Voo Local', 'h870', 11, true]]);
  });

  it('aluno de um curso: quando a próxima missão dele é do tipo pedido, o pedido já entra como ela (código, recurso e horas)', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'B', mis: 'Navegação', eq: 'C172', nb: 2 }], PC: [], INVA: [] };
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    const situacao = [{ aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'aprovado' }];
    importarPedidos(e, [pedido(7, 1000, { missao: 'Navegação' }), pedido(8, 1001, { missao: 'Navegação' })], { situacao, programa: doCadastro(programa) });
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].nb], ['PP-02', 'C172', 2]);
    assert.deepEqual([e.stu[1].etapa, e.stu[1].mis], [undefined, 'Navegação'], 'a próxima do 1001 é PP-01 (Voo Local): o pedido entra como veio');
    // Formato 30: a missão do curso dada pelo programa leva a marca (etapaDoPrograma); o que entrou sem uma, não
    assert.deepEqual([e.stu[0].etapaDoPrograma, e.stu[1].etapaDoPrograma], [true, undefined]);
  });

  it('ignora cancelados e os já importados; conta os alunos que não estão no cadastro', () => {
    const e = { ...estado(), importadas: [5] };
    const resumo = importarPedidos(e, [pedido(4, 1000, { cancelada_em: '2026-11-10T13:00:00Z' }), pedido(5, 1000), pedido(6, 9999)]);
    assert.deepEqual(resumo, { novos: 0, atualizados: 0, semAluno: 1, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    assert.equal(e.stu[0].fly, false);
    // O pedido de quem não está no cadastro não conta como visto (entra quando o aluno for cadastrado)
    assert.deepEqual(e.importadas, [5]);
  });

  // A agenda guarda a duração; o pedido sem ela fica com 1 h ou as horas do curso
  it('a duração do pedido vai para a demanda (vale mais que as horas do programa do curso)', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 2 }], PC: [], INVA: [] };
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(20, 1000, { janela: 'horario', horario: '10:10', horas: 2.6 }), pedido(21, 1001, { janela: 'horario', horario: '10:10', horas: null })], { programa: doCadastro(programa) });
    assert.deepEqual([e.stu[0].nb, e.stu[0].etapa, e.stu[1].nb, e.stu[1].etapa], [2.6, 'PP-01', 2, 'PP-01']);
  });

  it('missão do curso noutro recurso: as preferências são os horários desse recurso, no horário pedido (o exato: as duas nele)', () => {
    const programa = { PP: [], PC: [{ id: 'PC-01', nome: 'A', mis: 'IFR', eq: 'PA-34', nb: 1 }], INVA: [] };
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PC' })] };
    importarPedidos(e, [pedido(9, 1000, { missao: 'IFR', janela: 'horario', horario: '06:30' })], { programa: doCadastro(programa) });
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].p1, e.stu[0].p2], ['PC-01', 'PA-34', 390, 390]);
  });

  // O recurso que a secretaria escolheu na agenda vale: o avião, os horários e as preferências são os dele
  it('o pedido com recurso entra com ele; sem ele, ou com um que a missão não permite, com o padrão da missão', () => {
    const e = { ...estado(), stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false }), aluno(1002, { fly: false })] };
    const nav = (id, quem, recurso) => pedido(id, quem, { missao: 'Navegação', janela: 'horario', horario: '07:30', horas: 2, ...(recurso === undefined ? {} : { recurso }) });
    importarPedidos(e, [nav(50, 1000, 'PA-34'), nav(51, 1001), nav(52, 1002, 'Sim. Multi')]);
    assert.deepEqual(e.stu.map(s => [s.eq, s.p1, s.jan, s.nb]), [['PA-34', 450, 'h450', 2], ['C152', 500, 'h450', 2], ['C152', 500, 'h450', 2]]);
    for (const s of e.stu) assert.equal(Object.hasOwn(s, 'recurso'), false, 'o pedido da demanda não ganha o campo');
  });

  it('com o recurso, a missão do curso só é inferida entre as desse recurso; sem ele, a primeira do tipo, como antes', () => {
    const programa = doCadastro({
      PP: [{ id: 'NAV-01', nome: 'A', mis: 'Navegação', eq: 'C152', nb: 1.5 }, { id: 'NAV-02', nome: 'B', mis: 'Navegação', eq: 'C172', nb: 2 }], PC: [], INVA: []
    }).map(c => ({ ...c, missoes: c.missoes.map(m => ({ ...m, regra: 'livre' })) }));
    const importar = recurso => {
      const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
      importarPedidos(e, [pedido(53, 1000, { missao: 'Navegação', janela: 'horario', horario: '06:30', ...(recurso === undefined ? {} : { recurso }) })], { programa });
      return [e.stu[0].etapa, e.stu[0].eq, e.stu[0].nb];
    };
    assert.deepEqual(importar(undefined), ['NAV-01', 'C152', 1.5]);
    assert.deepEqual(importar(null), ['NAV-01', 'C152', 1.5]);
    assert.deepEqual(importar('C152'), ['NAV-01', 'C152', 1.5]);
    assert.deepEqual(importar('C172'), ['NAV-02', 'C172', 2]);
    assert.deepEqual(importar('PA-34'), [undefined, 'PA-34', 1], 'nenhuma missão do curso no PA-34: entra como veio');
    assert.deepEqual(importar('Sim. Mono'), ['NAV-01', 'C152', 1.5], 'o recurso que a missão não permite não conta');
  });

  it('a missão do curso que o operador pôs no voo continua com o recurso dela, qualquer que seja o do pedido', () => {
    const e = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 2, etapa: 'NAV-02', cursoDaEtapa: 'PP' }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(54, 1000, { missao: 'Navegação', janela: 'horario', horario: '06:30', recurso: 'PA-34' })]);
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].nb], ['NAV-02', 'C172', 2]);
  });

  // No programa em fases, várias missões podem estar liberadas: o pedido entra como a primeira do tipo pedido (o Noturno
  // em trechos, pela noite: o bloco de 4 h às 17:30, o translado e o noturno em BH); nenhuma liberada do tipo (fora da
  // ordem, ou fora do programa), ele entra como veio, com a duração da missão: o simulador, as 2 h de padrão
  it('aluno de um curso em fases: a primeira missão liberada do tipo pedido; fora da ordem, nenhuma', () => {
    // As fases 1 a 4 aprovadas (as 13 primeiras missões do curso): o Voo Solo (na Fase 7) ainda está fora da ordem
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(30, 1000, { missao: 'Parafuso' }), pedido(31, 1000, { missao: 'Navegação' }), pedido(32, 1000, { missao: 'Noturno' }),
      pedido(33, 1000, { missao: 'Simulador' }), pedido(39, 1000, { missao: 'Voo Solo' })], { situacao, programa: [PP] });
    assert.deepEqual([e.stu[0], ...e.stu[0].extra].map(p => [p.mis, p.etapa, p.eq, p.nb]), [
      ['Parafuso', 'PE-04', 'C152', 1], ['Navegação', 'NAV-01', 'C152', 1.5], ['Noturno', 'NOT', 'C172', 4], ['Simulador', undefined, 'Sim. Mono', 2],
      ['Voo Solo', undefined, 'C152', 1]
    ]);
    const noturno = e.stu[0].extra.find(p => p.mis === 'Noturno');
    assert.deepEqual([noturno.p1, noturno.p2], [1050, -1], 'o Noturno sai às 17:30');
  });

  // O curso da missão vai com o código: o resultado vai para ele, mesmo que o aluno troque de curso no mesmo dia
  it('o pedido que entra como missão do curso leva o curso dela; o que entra como veio, nenhum', () => {
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })] };
    importarPedidos(e, [pedido(34, 1000, { missao: 'Parafuso' }), pedido(35, 1000, { missao: 'Simulador' }), pedido(36, 1001)], { situacao, programa: [PP] });
    assert.deepEqual([e.stu[0], ...e.stu[0].extra, e.stu[1]].map(p => [p.mis, p.etapa, p.cursoDaEtapa]),
      [['Parafuso', 'PE-04', 'PP'], ['Simulador', undefined, undefined], ['Voo Local', undefined, undefined]]);
    assert.equal(Object.hasOwn(e.stu[0].extra[0], 'cursoDaEtapa'), false);
  });

  // A escolha do operador vale mais que a do app: a missão do curso que o operador pôs no voo ("Outra missão do curso",
  // Usar), sem voo fixo, continua quando o pedido da agenda da mesma missão toma o lugar dele. Antes, o pedido entrava
  // como a primeira liberada do tipo (a NAV-01 no lugar da NAV-02 escolhida), e a escolha se perdia
  it('a missão do curso escolhida no voo que dá lugar ao pedido da agenda continua a dele, com o curso, o recurso e as horas', () => {
    const PP = cursoPP();
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C152', nb: 1.5, etapa: 'NAV-02', cursoDaEtapa: 'PP', insId: 2 }, { curso: 'PC' })] };
    const resumo = importarPedidos(e, [pedido(37, 1000, { missao: 'Navegação', janela: 'horario', horario: '06:30' })], { situacao, programa: [PP] });
    assert.deepEqual(resumo, { novos: 0, atualizados: 1, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    const p = e.stu[0];
    assert.deepEqual([p.etapa, p.cursoDaEtapa, p.eq, p.nb, p.solicitacao, p.jan, p.insId, p.extra], ['NAV-02', 'PP', 'C152', 1.5, 37, 'h390', 2, []]);
    // Sem os programas lidos, a escolha também continua (ela não é inferida); a duração registrada na agenda vale mais
    const semPrograma = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 2, etapa: 'TSL-01' }, { curso: 'PP' })] };
    importarPedidos(semPrograma, [pedido(38, 1000, { missao: 'Navegação', horas: 1.2 })], { programa: [] });
    const q = semPrograma.stu[0];
    assert.deepEqual([q.etapa, Object.hasOwn(q, 'cursoDaEtapa'), q.eq, q.nb, q.solicitacao], ['TSL-01', false, 'C172', 1.2, 38]);
  });

  it('sem programa (os resultados ou os programas não foram lidos), nenhum pedido entra como missão do curso', () => {
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(40, 1000)], { programa: [] });
    assert.deepEqual([e.stu[0].fly, e.stu[0].etapa], [true, undefined]);
  });

  // A missão de um voo cancelado não conta como já marcada no dia
  it('as missões dos outros voos do dia contam como feitas; a do voo cancelado, não', () => {
    const programa = { PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'B', mis: 'Navegação', eq: 'C152', nb: 2 }] };
    const importar = fStatus => {
      const e = { ...estado(), fStatus, stu: [aluno(1000, { etapa: 'PP-01' }, { curso: 'PP' })] };
      importarPedidos(e, [pedido(50, 1000, { missao: 'Navegação' })], { programa: doCadastro(programa) });
      return e.stu[0].extra.map(x => [x.mis, x.etapa]);
    };
    assert.deepEqual(importar({}), [['Navegação', 'PP-02']]);
    assert.deepEqual(importar({ '1000_0_1': 'Cancelado' }), [['Navegação', undefined]], 'a PP-01 ainda falta');
  });

  // A sonda do juiz (sonda-agenda.mjs): o voo agendado na escala é o pedido com o voo fixo, sem pedido da agenda. Ele não
  // é a "mesma missão copiada": o pedido da agenda o sobrescrevia, e o voo fixo ficava em conflito (fora da
  // disponibilidade, a duração mudou)
  it('o voo fixo não dá lugar ao pedido da agenda: o pedido vira outro voo, e o fixo fica onde estava', () => {
    const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1, etapa: 'PP-07' })] });
    const o = runAllocationEngine(e).out[0];
    e.fixos = { '1000_0_1': { a: o.a, b: o.b, r: o.r, insId: o.insId, agendado: true } };
    const resumo = importarPedidos(e, [pedido(7, 1000, { janela: 'horario', horario: '13:40', horas: 2 })]);
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    const principal = e.stu[0], [extra] = principal.extra;
    assert.deepEqual([principal.p1, principal.nb, principal.etapa, principal.solicitacao], [610, 1, 'PP-07', undefined]);
    assert.deepEqual([extra.mid, extra.mis, extra.p1, extra.nb, extra.solicitacao], [1, 'Voo Local', 820, 2, 7]);
    const { out } = runAllocationEngine(e);
    assert.deepEqual(out.map(v => [v.fKey, v.a, Boolean(v.fixo), v.conflito || []]), [['1000_0_1', 610, true, []], ['1000_1_1', 820, false, []]]);
  });

  // A diferença 3 do E (a interação do F1g): o registro com um fixo posto à mão (agendado, pelo "+ Agendar voo" e pelo
  // editor do voo na Escala; escolhido, pelo INVA escolhido na Escala) nunca é sobrescrito: nem por um pedido novo da
  // mesma missão, nem pela conciliação do pedido dele (admitido ou de volta à escala, nada mais muda)
  it('o registro com o fixo posto à mão (agendado ou escolhido) nunca é sobrescrito pela importação', () => {
    for (const marca of [{ agendado: true }, { escolhido: true }]) {
      const e = { ...estado(), stu: [aluno(1000, { p1: 610, p2: -1, insId: 2 })], fixos: { '1000_0_1': { a: 610, b: 670, r: 'PP-LJV', insId: 2, ...marca } } };
      const antes = structuredClone(e.stu[0]);
      importarPedidos(e, [pedido(90, 1000, { janela: 'horario', horario: '08:20' })]);
      const { extra, ...principal } = e.stu[0];
      assert.deepEqual(principal, (({ extra: _, ...r }) => r)(antes), JSON.stringify(marca));
      assert.deepEqual(extra.map(x => [x.mid, x.solicitacao, x.jan]), [[1, 90, 'h500']]);
    }
    // O voo do pedido 91 mudado no editor da Escala (o horário, o recurso e o INVA, com o fixo agendado): importar de novo,
    // com o id fora de importadas (admitido) ou sem voar (volta), não traz de volta o que o pedido dizia
    const editado = { mis: 'Voo Local', eq: 'C172', p1: 700, p2: -1, jan: 'h700', insId: 3, solicitacao: 91 };
    for (const fly of [true, false]) {
      const e = { ...estado(), stu: [aluno(1000, { ...editado, fly })], fixos: { '1000_0_1': { a: 700, b: 760, r: 'PP-ABP', insId: 3, agendado: true } } };
      importarPedidos(e, [pedido(91, 1000, { janela: 'horario', horario: '08:20', recurso: 'C152' })]);
      assert.deepEqual(Object.fromEntries(Object.keys(editado).map(c => [c, e.stu[0][c]])), editado, `fly ${fly}`);
      assert.deepEqual([e.stu[0].fly, e.stu[0].extra, e.importadas, Object.keys(e.fixos)], [true, [], [91], ['1000_0_1']]);
    }
  });

  // A diferença 5 do E (decisão 11 do desenho; N14): o voo posto à mão que dá lugar ao pedido fica com a prioridade que o
  // operador deu, como fica com o instrutor escolhido (a entrada do operador vale mais que o motor). Com a prioridade
  // desligada, o motor da tela recebe a padrão (estadoDaEscala, comAPrioridadePadrao) e a guardada continua
  it('o voo posto à mão que dá lugar ao pedido fica com a prioridade dele; desligada, o motor recebe a padrão', () => {
    const e = { ...estado(), stu: [aluno(1000, { pr: 5, insId: 2 }), aluno(1001, { pr: 1 })] };
    const resumo = importarPedidos(e, [pedido(96, 1000, { janela: 'horario', horario: '08:20' }), pedido(97, 1001, { missao: 'Navegação', janela: 'horario', horario: '08:20' })]);
    assert.deepEqual([resumo.atualizados, resumo.novos], [1, 1]);
    assert.deepEqual([e.stu[0].solicitacao, e.stu[0].pr, e.stu[0].insId], [96, 5, 2]);
    assert.deepEqual(e.stu[1].extra.map(x => [x.solicitacao, x.pr]), [[97, 3]], 'o pedido que não toma o lugar de ninguém: a padrão');
    assert.deepEqual(comAPrioridadePadrao(e).stu.map(s => s.pr), [3, 3]);
    assert.equal(e.stu[0].pr, 5);
  });

  // O voo que já tem resultado na data aconteceu: o pedido da agenda que tomasse o lugar dele mostraria o resultado dele
  it('o voo que já tem resultado na data também não dá lugar ao pedido da agenda', () => {
    const e = { ...estado(), resultados: { situacao: [], doDia: [{ id: 1, aluno: 1002, curso: 'PP', missao: 'PP-01', resultado: 'aprovado', data: '2026-11-11', voo: '1002_0_1' }] } };
    importarPedidos(e, [pedido(3, 1002)]);
    assert.deepEqual([e.stu[2].solicitacao, e.stu[2].extra.map(x => [x.mid, x.mis, x.solicitacao])], [undefined, [[1, 'Voo Local', 3]]]);
  });

  // Em voo, atrasado, pousado ou cancelado, o voo fica onde está mesmo sem o cadeado (a aprovação da escala tira o cadeado
  // do voo que estava com o Voa desligado, e ele volta a voar sem ele): o pedido da agenda que tomasse o lugar dele
  // entraria cancelado ou em voo. Pendente e Confirmado não fixam o voo
  it('o voo fixado pelo status, mesmo sem o cadeado, também não dá lugar ao pedido da agenda', () => {
    const importar = status => {
      const e = { ...estado(), fStatus: { '1002_0_1': status } };
      importarPedidos(e, [pedido(12, 1002)]);
      return [e.stu[2].solicitacao, e.stu[2].extra.map(x => [x.mid, x.solicitacao])];
    };
    for (const status of ['Em Voo', 'Atrasado', 'Pousou', 'Cancelado']) assert.deepEqual(importar(status), [undefined, [[1, 12]]], status);
    for (const status of ['Pendente', 'Confirmado']) assert.deepEqual(importar(status), [12, []], status);
  });

  // A sonda do juiz (sonda-limpar.mjs), de antes de "Limpar demanda" soltar os voos que limpa: os pedidos voltavam ao
  // branco, e o voo fixo (o agendado) ficava preso à chave do pedido principal. O pedido da agenda que entrasse nele
  // herdaria o voo fixo de outra missão; o mesmo com o status, o detalhe ou o resultado de um voo que saiu da escala
  it('o pedido principal que não voa mas tem sobras no dia não recebe o pedido da agenda: ele vira uma missão extra', () => {
    const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1 })] });
    e.fixos = { '1000_0_1': { a: 610, b: 670, r: 'PP-LJV', insId: 1, agendado: true } };
    e.stu.forEach(d => { Object.assign(d, blank()); delete d.insId; d.extra = []; });
    importarPedidos(e, [pedido(8, 1000, { missao: 'Navegação', janela: 'horario', horario: '13:40', horas: 1.5 })]);
    assert.deepEqual([e.stu[0].fly, e.stu[0].extra.map(x => [x.mid, x.mis, x.solicitacao])], [false, [[1, 'Navegação', 8]]]);
    const { out } = runAllocationEngine(e);
    assert.deepEqual(out.map(v => [v.fKey, v.mis, v.a, Boolean(v.fixo), v.conflito || []]), [['1000_1_1', 'Navegação', 820, false, []]]);

    const sobras = [{ fStatus: { '1000_0_1': 'Cancelado' } }, { fObs: { '1000_0_1': { motivo: 'Meteorologia' } } },
      { resultados: { situacao: [], doDia: [{ id: 1, aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'reprovado', data: '2026-11-11', voo: '1000_0_1' }] } }];
    for (const sobra of sobras) {
      const comSobra = { ...estado(), ...sobra };
      importarPedidos(comSobra, [pedido(9, 1000)]);
      assert.deepEqual([comSobra.stu[0].fly, comSobra.stu[0].extra.map(x => [x.mid, x.solicitacao])], [false, [[1, 9]]], JSON.stringify(sobra));
    }
  });

  // O pedido principal que volta a voar com o pedido da agenda não traz nada do voo de antes (a disponibilidade, a missão
  // do curso, o instrutor escolhido)
  it('o pedido principal que recebe o pedido da agenda começa em branco', () => {
    const e = { ...estado(), stu: [aluno(1000, { fly: false, mis: 'Navegação', eq: 'C172', nb: 2, pr: 1, jan: 'h390', etapa: 'PP-09', insId: 1 }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(61, 1000, { janela: 'horario', horario: null })]);
    const p = e.stu[0];
    assert.deepEqual([p.fly, p.mis, p.eq, p.nb, p.pr, p.solicitacao, p.extra], [true, 'Voo Local', 'C152', 1, 3, 61, []]);
    assert.deepEqual(['jan', 'etapa', 'insId'].filter(campo => Object.hasOwn(p, campo)), []);
  });

  // A identidade do pedido (decisão 2 do desenho): o registro que tem solicitacao é o voo daquele pedido, e nunca é dado
  // a outro. O principal que não voa com o pedido de antes (cancelado ou tirado da escala pelo operador) fica com ele, e o
  // pedido novo vira uma missão extra; antes, o principal era apagado e o pedido de antes perdia o voo
  it('o pedido principal que não voa mas é de outro pedido da agenda não é reaproveitado: o novo vira uma missão extra', () => {
    const antes = { fly: false, mis: 'Navegação', eq: 'C172', nb: 2, pr: 1, jan: 'h500', etapa: 'PP-09', cursoDaEtapa: 'PP', solicitacao: 99, insId: 1 };
    const e = { ...estado(), importadas: [99], stu: [aluno(1000, antes, { curso: 'PP' })] };
    const resumo = importarPedidos(e, [pedido(61, 1000, { janela: 'horario', horario: '10:10' })]);
    assert.deepEqual([resumo.novos, resumo.atualizados], [1, 0]);
    const p = e.stu[0];
    assert.deepEqual(Object.fromEntries(Object.keys(antes).map(c => [c, p[c]])), antes, 'o registro do pedido 99 fica como estava');
    assert.deepEqual(p.extra.map(x => [x.mid, x.fly, x.mis, x.solicitacao, x.jan, x.pr]), [[1, true, 'Voo Local', 61, 'h610', 3]]);
    assert.deepEqual(e.importadas, [99, 61]);
  });

  // O pedido posto à mão com a missão do curso (o Usar), da mesma missão do pedido da agenda, dá lugar a ele, e a missão do
  // curso continua no dia. Antes, a missão dele contava como já no dia: o pedido entrava como a seguinte, no lugar dele, e
  // a do Usar sumia do dia
  it('o voo da mesma missão posto à mão com a missão do curso dá lugar ao pedido da agenda, com a mesma missão do curso', () => {
    const programa = { PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) };
    const e = { ...estado(), stu: [aluno(1000, { etapa: 'PP-01', insId: 2 }, { curso: 'PP' })] };
    const resumo = importarPedidos(e, [pedido(62, 1000, { janela: 'horario', horario: '13:40' }), pedido(63, 1000, { janela: 'horario', horario: '15:20' })],
      { programa: doCadastro(programa) });
    // As 15:20 não estão na lista do C152 (os horários padrão): o minuto fica, e o resumo diz
    assert.deepEqual(resumo, { novos: 1, atualizados: 1, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0,
      foraDaLista: [{ missao: 'Voo Local', recurso: 'C152', horario: '15:20' }], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    // O instrutor escolhido continua no voo; o segundo pedido é outro voo, a missão seguinte
    assert.deepEqual([e.stu[0].etapa, e.stu[0].solicitacao, e.stu[0].jan, e.stu[0].insId], ['PP-01', 62, 'h820', 2]);
    assert.deepEqual(e.stu[0].extra.map(x => [x.mid, x.etapa, x.solicitacao, x.insId]), [[1, 'PP-02', 63, undefined]]);
  });

  // O Noturno do programa (o NOT, com as 3 h do noturno em BH) é o bloco de 4 h às 17:30 do dia (o translado e o noturno;
  // a volta no dia seguinte), também com outra duração registrada na agenda
  it('a missão de duração fixa entra com ela: o NOT do programa com 4 h às 17:30; o Ground com 01h30', () => {
    const PP = cursoPP();
    const feitas = [...percursoDoCurso(PP).missoes.slice(0, 13).map(m => m.codigo), 'TSL-01'];
    const situacao = feitas.map((codigo, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: codigo, resultado: 'aprovado' }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })] };
    importarPedidos(e, [pedido(64, 1000, { missao: 'Noturno', janela: 'horario', horario: '17:30', horas: 3 }), pedido(65, 1001, { missao: 'Ground C152', janela: 'horario', horario: '06:30', horas: 2 })],
      { situacao, programa: [PP] });
    const [noturno, ground] = e.stu;
    assert.deepEqual([noturno.mis, noturno.etapa, noturno.eq, noturno.nb, noturno.p1, noturno.p2], ['Noturno', 'NOT', 'C172', 4, 1050, -1]);
    assert.deepEqual([ground.mis, ground.eq, ground.nb], ['Ground C152', 'Sala Ground', 1.5]);
  });

  // A missão do curso pelo horário do dia (a diferença 2 do E; regra 12 do desenho): os pedidos que entram juntos são
  // ligados na ordem dos horários, e a missão de outro voo do aluno conta como feita só quando ele termina até o início
  // deste. Antes, valia a ordem das linhas, e o voo das 08:20 ficava com a missão seguinte à do voo das 10:10
  it('os pedidos que entram juntos ganham a missão do curso na ordem dos horários', () => {
    const programa = doCadastro({ PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) });
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
    importarPedidos(e, [pedido(70, 1000, { janela: 'horario', horario: '10:10' }), pedido(71, 1000, { janela: 'horario', horario: '08:20' })], { programa });
    const porPedido = Object.fromEntries([e.stu[0], ...e.stu[0].extra].map(p => [p.solicitacao, [p.jan, p.etapa]]));
    assert.deepEqual(porPedido, { 70: ['h610', 'PP-02'], 71: ['h500', 'PP-01'] });
    assert.deepEqual(e.importadas, [71, 70]);
  });

  // A regra 8 antes da inferência (o item E: a missão do curso do pedido, e só para o pedido sem uma a do horário do dia):
  // o pedido que escolheu a missão do curso na Agenda entra antes do que não escolheu, qualquer que seja o horário, e a
  // missão dele não é dada de novo (a regra 12). Na mesma importação ou em duas, o mesmo dia
  it('a missão do curso que o pedido escolheu na Agenda não é dada ao pedido sem uma, na mesma importação ou em duas', () => {
    // Os ids das missões como os do banco (uuid): a Agenda guarda o id em missao_do_curso
    let n = 0;
    const programa = programaDoLegado(normalizarCursos({ PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) }),
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
    const idPP01 = programa[0].missoes.find(m => m.codigo === 'PP-01').id;
    const escolheu = pedido(76, 1000, { janela: 'horario', horario: '14:30', recurso: 'C152', missao_do_curso: idPP01 });
    const semUma = pedido(77, 1000, { janela: 'horario', horario: '08:20', recurso: 'C152' });
    const dia = () => ({ ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] });
    const porPedido = e => Object.fromEntries([e.stu[0], ...(e.stu[0].extra || [])].map(p => [p.solicitacao, p.etapa ?? null]));
    const juntos = dia();
    const resumo = importarPedidos(juntos, [escolheu, semUma], { programa, cursos: programa });
    const emDuas = dia();
    importarPedidos(emDuas, [escolheu], { programa, cursos: programa });
    importarPedidos(emDuas, [escolheu, semUma], { programa, cursos: programa });
    // A PP-01 das 14:30 não termina antes das 08:20: a das 08:20 não é a PP-01 (já está no dia) nem a PP-02 (ainda não)
    assert.deepEqual(porPedido(juntos), { 76: 'PP-01', 77: null });
    assert.deepEqual(porPedido(emDuas), porPedido(juntos));
    assert.deepEqual(resumo.semMissaoDoCurso, [{ missao: 'Voo Local', recurso: 'C152' }]);
  });

  it('a missão de um voo do aluno que termina depois do início do pedido não conta como feita: ela não é dada de novo, e a seguinte ainda não', () => {
    const programa = doCadastro({ PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) });
    const importar = p1 => {
      const e = { ...estado(), stu: [aluno(1000, { mis: 'Navegação', eq: 'C152', etapa: 'PP-01', cursoDaEtapa: 'PP', p1, p2: -1 }, { curso: 'PP' })] };
      const resumo = importarPedidos(e, [pedido(72, 1000, { janela: 'horario', horario: '08:20' })], { programa });
      return [e.stu[0].extra.map(x => [x.solicitacao, x.etapa]), resumo.semMissaoDoCurso];
    };
    assert.deepEqual(importar(610), [[[72, undefined]], [{ missao: 'Voo Local' }]], 'a PP-01 às 10:10: a das 08:20 não pode ser a PP-02');
    assert.deepEqual(importar(390), [[[72, 'PP-02']], []], 'a PP-01 às 06:30 termina antes das 08:20');
  });

  // AV PROF. SOLO antes de cada SOLO (docs/PLAN.md:418; R6 do desenho): o Voo Solo das 06:30 e o Voo Local das 08:20 na
  // mesma data, em qualquer ordem das linhas: o das 08:20 é a AVP-SOLO-01, e o solo fica sem missão do curso
  it('o Voo Solo das 06:30 e o Voo Local das 08:20: a AVP-SOLO-01 vai ao das 08:20, e o solo fica sem missão do curso', () => {
    const PP = cursoPP();
    const codigos = percursoDoCurso(PP).missoes.map(m => m.codigo);
    const feitas = codigos.slice(0, codigos.indexOf('AVP-SOLO-01')).concat(['TSL-01', 'NOT', 'TSL-02']);
    const situacao = feitas.map((codigo, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: codigo, resultado: 'aprovado' }));
    for (const ordem of [[80, 81], [81, 80]]) {
      const linhas = { 80: pedido(80, 1000, { missao: 'Voo Solo', janela: 'horario', horario: '06:30' }), 81: pedido(81, 1000, { janela: 'horario', horario: '08:20', horas: 0.3 }) };
      const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
      importarPedidos(e, ordem.map(id => linhas[id]), { situacao, programa: [PP] });
      const porPedido = Object.fromEntries([e.stu[0], ...e.stu[0].extra].map(p => [p.solicitacao, p.etapa]));
      assert.deepEqual(porPedido, { 80: undefined, 81: 'AVP-SOLO-01' }, ordem.join(','));
    }
  });

  // O horário exato do pedido que a lista de decolagens do recurso da missão do curso não tem (item 12 de "Left for
  // Pedro"): o pedido sem recurso ganha o da missão do programa, e a lista dele pode não ter o minuto; a lista também pode
  // ter mudado depois do registro. O minuto fica (nada o afrouxa) e o resumo diz qual
  it('o horário do pedido que o recurso da missão não tem fica, e o resumo diz', () => {
    const programa = doCadastro({ PP: [], PC: [{ id: 'PC-01', nome: 'A', mis: 'IFR', eq: 'PA-34', nb: 1 }], INVA: [] });
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PC' }), aluno(1001, { fly: false })] };
    const resumo = importarPedidos(e, [pedido(73, 1000, { missao: 'IFR', janela: 'horario', horario: '08:20', recurso: null }),
      pedido(74, 1001, { janela: 'horario', horario: '08:20', recurso: 'C152' })], { programa });
    assert.deepEqual([e.stu[0].etapa, e.stu[0].eq, e.stu[0].jan], ['PC-01', 'PA-34', 'h500']);
    assert.deepEqual(resumo.foraDaLista, [{ missao: 'IFR', recurso: 'PA-34', horario: '08:20' }]);
    // A lista do C152 mudada depois do registro, sem as 08:20
    const outra = { ...estado(), horarios: { C152: [610, 700], C172: [500], sim: [500], 'PA-34': [500] }, stu: [aluno(1000, { fly: false })] };
    const r2 = importarPedidos(outra, [pedido(75, 1000, { janela: 'horario', horario: '08:20', recurso: 'C152' })]);
    assert.deepEqual([outra.stu[0].jan, r2.foraDaLista], ['h500', [{ missao: 'Voo Local', recurso: 'C152', horario: '08:20' }]]);
  });

  // O pedido da Agenda antes do primeiro horário do dia (06:30): a lista de decolagens aceita as 06:00 (js/horarios.js,
  // PRIMEIRO_HORARIO), mas o horário exato do voo começa às 06:30 (js/rules.js, minutoExato), e o pedido entra sem ele
  // (qualquer horário). O resumo diz (semOHorario), e não o chama de "fora da lista (o horário fica)": ele não fica
  it('o pedido das 06:00, antes do primeiro horário do dia: entra sem o horário exato, e o resumo diz, sem dizer que ele fica', () => {
    for (const lista of [[360, 500, 610], [390, 500, 610]]) {
      const e = { ...estado(), horarios: { C152: lista, C172: [500], sim: [500], 'PA-34': [500] }, stu: [aluno(1000, { fly: false })] };
      const r = importarPedidos(e, [pedido(78, 1000, { janela: 'horario', horario: '06:00', recurso: 'C152' })]);
      assert.deepEqual([e.stu[0].jan, r.foraDaLista, r.semOHorario], [undefined, [], [{ missao: 'Voo Local', recurso: 'C152', horario: '06:00' }]], String(lista));
    }
  });

  // Depois do último horário exato do dia (17:30, o do Noturno): o servidor aceita o Voo Local às 18:00 (a coluna só
  // confere o formato), e o voo não guarda o minuto (minutoExato vai até HORARIO_DO_NOTURNO). Entra sem ele, como o das
  // 06:00, e o resumo o conta no mesmo semOHorario (fora dos horários exatos do dia, antes ou depois), não fora da lista
  it('o pedido das 18:00, depois do último horário exato do dia: entra sem ele, e o resumo o conta com o das 06:00', () => {
    const e = { ...estado(), horarios: { C152: [390, 500, 610], C172: [500], sim: [500], 'PA-34': [500] }, stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false })] };
    const r = importarPedidos(e, [pedido(79, 1001, { janela: 'horario', horario: '18:00', recurso: 'C152' }),
      pedido(78, 1000, { janela: 'horario', horario: '06:00', recurso: 'C152' })]);
    assert.deepEqual([e.stu[0].jan, e.stu[1].jan, r.foraDaLista], [undefined, undefined, []]);
    assert.deepEqual(r.semOHorario, [{ missao: 'Voo Local', recurso: 'C152', horario: '06:00' }, { missao: 'Voo Local', recurso: 'C152', horario: '18:00' }]);
  });

  // N12, N13 (o J): não há período do dia. A linha do servidor com "manha", "tarde" ou "noite" (a função de 9 argumentos
  // ainda aceita um, até o D1) entra sem horário exato, como a sem horário: nenhum jan, as preferências padrão da lista, e
  // o resumo não a conta nem fora da lista nem antes do primeiro horário (ela não tem horário a perder)
  it('a linha com um período de antes do J entra sem horário exato, e o resumo não diz nada dela', () => {
    const e = estado();
    const linhas = ['manha', 'tarde', 'noite'].map((janela, i) => pedido(90 + i, 1000 + i, { janela, horario: null, recurso: 'C152' }));
    const r = importarPedidos(e, linhas);
    const semHorario = estado();
    importarPedidos(semHorario, [pedido(93, 1000, { janela: 'horario', horario: null, recurso: 'C152' })]);
    const padrao = [semHorario.stu[0].p1, semHorario.stu[0].p2];
    const doPedido = id => e.stu.flatMap(a => [a, ...(a.extra || [])]).find(p => p.solicitacao === id);
    assert.deepEqual([90, 91, 92].map(doPedido).map(p => [p.jan, p.p1, p.p2]), [[undefined, ...padrao], [undefined, ...padrao], [undefined, ...padrao]]);
    assert.deepEqual([r.novos + r.atualizados, r.foraDaLista, r.semOHorario], [3, [], []]);
  });

  // A diferença 4 do E (docs/PLAN.md:424 do desenho; a regra 2.4 "Closed course"): o curso encerrado não dá missão do
  // curso na entrada (a do operador e a que o pedido escolheu na Agenda ficam: são escolhas, não inferência). Antes, o
  // pedido do aluno de um curso encerrado entrava como a próxima missão dele
  it('o curso encerrado não dá missão do curso ao pedido que não tem uma', () => {
    const programa = doCadastro({ PP: ['PP-01', 'PP-02'].map(id => ({ id, nome: id, mis: 'Voo Local', eq: 'C152', nb: 1 })) }).map(c => ({ ...c, ativo: false }));
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { mis: 'Voo Local', etapa: 'PP-02', cursoDaEtapa: 'PP' }, { curso: 'PP' })] };
    const resumo = importarPedidos(e, [pedido(92, 1000, { janela: 'horario', horario: '08:20' }), pedido(93, 1001, { janela: 'horario', horario: '08:20' })], { programa });
    assert.deepEqual([e.stu[0].fly, e.stu[0].etapa, e.stu[0].solicitacao], [true, undefined, 92]);
    assert.deepEqual([e.stu[1].etapa, e.stu[1].solicitacao], ['PP-02', 93], 'a do operador fica');
    assert.deepEqual(resumo.semMissaoDoCurso, [], 'nada a inferir num curso encerrado');
    assert.equal(missaoDaEntrada({ stu: [], fStatus: {} }, aluno(1000, { fly: false }, { curso: 'PP' }), pedido(94, 1000), { programa }).nota, 'curso-encerrado');
    // A missão do curso que o pedido escolheu na Agenda, antes de o curso ser encerrado, fica (regra 8)
    const [PP] = programa;
    const escolhida = { ...pedido(95, 1000), missao_do_curso: '00000000-0000-4000-8000-000000000001' };
    const comId = [{ ...PP, missoes: PP.missoes.map((m, i) => (i === 0 ? { ...m, id: escolhida.missao_do_curso } : m)) }];
    const daAgenda = missaoDaEntrada({ stu: [], fStatus: {} }, aluno(1000, { fly: false }, { curso: 'PP' }), escolhida, { programa: comId, cursos: comId });
    assert.deepEqual([daAgenda.missao && daAgenda.missao.codigo, daAgenda.de], ['PP-01', 'pedido']);
  });

  // A Agenda importa com o programa da tela (programaParaInferir, em js/eventos/agenda.js): sem os resultados ou os
  // programas (ou com o progresso desligado), vazio. Nenhum pedido entra como missão do curso (antes, inferia de uma situação vazia: a primeira missão)
  it('sem os resultados ou os programas lidos, nenhum pedido entra como missão do curso', () => {
    const importar = indisponiveis => {
      setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [cursoPP()], indisponiveis });
      const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' })] };
      importarPedidos(e, [pedido(66, 1000)], { situacao: [], programa: programaParaInferir() });
      return e.stu[0].etapa;
    };
    ligarFuncionalidades('progresso');
    assert.equal(importar([]), 'IN-01');
    assert.equal(importar(['horas']), 'IN-01');
    for (const parte of ['resultados', 'cursos', 'cursos-pendentes']) assert.equal(importar([parte]), undefined, parte);
  });

  it('com o progresso desligado (js/funcionalidades.js), nenhum pedido novo entra como missão do curso, e o que já tem a missão fica com ela', () => {
    ligarFuncionalidades('');
    setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [cursoPP()] });
    const comEtapa = aluno(1001, { mis: 'Voo Local', eq: 'C152', etapa: 'PP-07', cursoDaEtapa: 'PP' }, { curso: 'PP' });
    const e = { ...estado(), stu: [aluno(1000, { fly: false }, { curso: 'PP' }), comEtapa] };
    importarPedidos(e, [pedido(67, 1000), pedido(68, 1001)], { situacao: [], programa: programaParaInferir() });
    assert.equal(e.stu[0].fly, true);
    assert.equal(e.stu[0].etapa, undefined);
    assert.deepEqual([e.stu[1].etapa, e.stu[1].cursoDaEtapa], ['PP-07', 'PP']);
    assert.deepEqual(e.importadas, [67, 68]);
  });
});

// O inativo do cadastro (formato 26): o pedido do aluno inativo não entra nem conta como visto, de hoje em diante
describe('Importar: o aluno inativo', () => {
  it('com semInativos, o pedido do aluno inativo fica de fora (fora de importadas) e é contado; sem, entra como antes', () => {
    const pedidoDe = (id, aluno) => ({ id, data: '2026-11-11', aluno, aluno_nome: `Aluno ${aluno}`, missao: 'Voo Local', janela: 'horario', horario: null, cancelada_em: null });
    const estado = () => {
      const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false }, { inativo: true })] });
      e.importadas = [];
      return e;
    };
    const com = estado();
    const resumo = importarPedidos(com, [pedidoDe(1, 1000), pedidoDe(2, 1001)], { semInativos: true });
    assert.equal(resumo.novos, 1);
    assert.equal(resumo.deInativo, 1);
    assert.deepEqual(com.importadas, [1]);
    assert.equal(com.stu.find(s => s.id === 1001).fly, false);
    const sem = estado();
    assert.equal(importarPedidos(sem, [pedidoDe(1, 1000), pedidoDe(2, 1001)]).novos, 2);
  });
});

// A missão do curso do pedido (F1c, a regra 8 da Agenda): na entrada, ela é a etapa do voo, com o curso dela, também com o
// progresso desligado; o recurso e as horas são os do pedido. A que saiu do programa ou mudou de tipo depois do registro
// não entra: o pedido entra pelo tipo da missão, com o aviso. Sem ela, o pedido entra como antes
describe('Importar: a missão do curso do pedido', () => {
  afterEach(() => ligarFuncionalidades());
  // Os ids das missões são uuid, como nos programas lidos
  let n = 0;
  const PP = novoCurso([], { sigla: 'PP', nome: 'Piloto Privado', modelo: MODELOS['pp-acpm'] }, () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`).curso;
  const idDe = codigo => PP.missoes.find(m => m.codigo === codigo).id;
  const pedido = (id, alunoId, extra = {}) => ({
    id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Navegação', janela: 'horario', horario: '08:20', horas: 3, recurso: 'C152',
    cancelada_em: null, ...extra
  });
  const estado = stu => ({ nid: 2000, importadas: [], stu });

  it('com o progresso desligado, a missão do curso do pedido é a etapa do voo, com o curso dela, o recurso e as horas do pedido', () => {
    ligarFuncionalidades('');
    setS({ stu: [], fStatus: {}, resultados: { situacao: [], doDia: [] }, programa: [PP] });
    const e = estado([aluno(1000, { fly: false }, { curso: 'PC' })]);
    const resumo = importarPedidos(e, [pedido(1, 1000, { missao_do_curso: idDe('NAV-150NM'), recurso: 'PA-34', horario: '07:30', horas: 2.5 })],
      { situacao: [], programa: programaParaInferir(), cursos: [PP] });
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 0, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    const p = e.stu[0];
    assert.deepEqual([p.fly, p.mis, p.etapa, p.cursoDaEtapa, p.eq, p.nb, p.jan, p.p1, p.solicitacao], [true, 'Navegação', 'NAV-150NM', 'PP', 'PA-34', 2.5, 'h450', 450, 1]);
    assert.equal(p.etapaDoPrograma, undefined, 'a missão do curso que o pedido escolheu não é a do programa (formato 30)');
    // O Noturno do curso: as 4 h do dia às 17:30
    const n = estado([aluno(1001, { fly: false }, { curso: 'PP' })]);
    importarPedidos(n, [pedido(2, 1001, { missao: 'Noturno', missao_do_curso: idDe('NOT'), recurso: 'C172', horario: '17:30', horas: 4 })], { cursos: [PP] });
    assert.deepEqual([n.stu[0].etapa, n.stu[0].eq, n.stu[0].nb, n.stu[0].p1], ['NOT', 'C172', 4, 1050]);
  });

  it('a missão do curso que saiu do programa, ou de outro tipo, não entra: o pedido entra pelo tipo, com o aviso', () => {
    const fora = { ...PP, missoes: PP.missoes.map(m => (m.codigo === 'NAV-150NM' ? { ...m, removida: true } : m.codigo === 'NAV-01' ? { ...m, mis: 'Voo Local' } : m)) };
    const e = estado([aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false }, { curso: 'PP' }), aluno(1002, { fly: false }, { curso: 'PP' })]);
    const resumo = importarPedidos(e, [pedido(3, 1000, { missao_do_curso: idDe('NAV-150NM') }), pedido(4, 1001, { missao_do_curso: idDe('NAV-01') }),
      pedido(5, 1002, { missao_do_curso: '00000000-0000-4000-8000-000000000999' })], { cursos: [fora] });
    assert.deepEqual(resumo.foraDoPrograma, [{ missao: 'Navegação', entrouComo: null }, { missao: 'Navegação', entrouComo: null }, { missao: 'Navegação', entrouComo: null }]);
    assert.deepEqual(e.stu.map(s => [s.fly, s.mis, s.etapa, s.eq, s.nb]), [[true, 'Navegação', undefined, 'C152', 3], [true, 'Navegação', undefined, 'C152', 3], [true, 'Navegação', undefined, 'C152', 3]]);
    // Os programas lidos sem nenhum curso: a missão do curso não existe mais
    const semCursos = estado([aluno(1000, { fly: false }, { curso: 'PP' })]);
    assert.deepEqual(importarPedidos(semCursos, [pedido(6, 1000, { missao_do_curso: idDe('NAV-150NM') })], { cursos: [] }).foraDoPrograma, [{ missao: 'Navegação', entrouComo: null }]);
  });

  // Os programas não lidos (cursos: null) não dizem se a missão do curso saiu: o pedido que tem uma espera, fora de
  // importadas, e entra com ela na importação depois de lidos; o que não tem nenhuma entra como antes
  it('sem os programas lidos (cursos: null), o pedido com a missão do curso espera e não conta como visto', () => {
    const e = estado([aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })]);
    const resumo = importarPedidos(e, [pedido(16, 1000, { missao_do_curso: idDe('NAV-150NM') }), pedido(17, 1001)], { cursos: null });
    assert.deepEqual(resumo, { novos: 1, atualizados: 0, semAluno: 0, deInativo: 0, foraDoPrograma: [], semMissaoDoCurso: [], esperamOsProgramas: 1, foraDaLista: [], semOHorario: [], sairam: [], conferir: [], ficam: [] });
    assert.deepEqual(e.importadas, [17]);
    assert.deepEqual([e.stu[0].fly, e.stu[1].fly], [false, true]);
    // Lidos, ele entra com a missão do curso dele
    assert.equal(importarPedidos(e, [pedido(16, 1000, { missao_do_curso: idDe('NAV-150NM') })], { cursos: [PP] }).novos, 1);
    assert.deepEqual([e.stu[0].fly, e.stu[0].etapa, e.stu[0].cursoDaEtapa, e.importadas], [true, 'NAV-150NM', 'PP', [17, 16]]);
  });

  // Com o progresso ligado, o pedido cuja missão do curso saiu do programa pode ganhar a próxima do programa: o resumo diz
  // como qual ele entrou (entrouComo), e não que entrou pelo tipo
  it('a missão do curso que saiu do programa, com o progresso ligado: o resumo diz a missão inferida no lugar dela', () => {
    const fora = { ...PP, missoes: PP.missoes.map(m => (m.codigo === 'IN-01' ? { ...m, removida: true } : m)) };
    const e = estado([aluno(1000, { fly: false }, { curso: 'PP' })]);
    const resumo = importarPedidos(e, [pedido(18, 1000, { missao: 'Voo Local', missao_do_curso: idDe('IN-01'), horas: 1 })], { situacao: [], programa: [fora], cursos: [fora] });
    assert.deepEqual(resumo.foraDoPrograma, [{ missao: 'Voo Local', entrouComo: e.stu[0].etapa }]);
    assert.ok(/^IN-/.test(e.stu[0].etapa), e.stu[0].etapa);
  });

  it('o pedido sem missão do curso entra como antes, campo por campo (missao_do_curso null ou ausente)', () => {
    for (const progresso of ['', 'progresso']) {
      ligarFuncionalidades(progresso);
      const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
      setS({ stu: [], fStatus: {}, resultados: { situacao, doDia: [] }, programa: [PP] });
      const importar = extra => {
        const e = estado([aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { mis: 'Navegação', eq: 'C172', nb: 2, etapa: 'NAV-02', cursoDaEtapa: 'PP' }, { curso: 'PP' })]);
        const resumo = importarPedidos(e, [pedido(7, 1000, extra), pedido(8, 1001, { recurso: 'PA-34', ...extra })], { situacao, programa: programaParaInferir(), cursos: [PP] });
        return { resumo, e };
      };
      const sem = importar({}), nulo = importar({ missao_do_curso: null });
      assert.deepEqual(nulo, sem, progresso);
      assert.deepEqual(sem.e.stu.map(s => [s.etapa, s.eq, s.nb]), progresso ? [['NAV-01', 'C152', 3], ['NAV-02', 'C172', 3]] : [[undefined, 'C152', 3], ['NAV-02', 'C172', 3]], progresso);
    }
  });

  it('o voo posto à mão da mesma missão: dá lugar ao pedido da mesma missão do curso, ou ao que só o pedido tem; com outra, são dois voos', () => {
    const mesma = estado([aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 1.5, etapa: 'NAV-150NM', cursoDaEtapa: 'PP', insId: 2 }, { curso: 'PP' })]);
    assert.equal(importarPedidos(mesma, [pedido(9, 1000, { missao_do_curso: idDe('NAV-150NM') })], { cursos: [PP] }).atualizados, 1);
    assert.deepEqual([mesma.stu[0].etapa, mesma.stu[0].eq, mesma.stu[0].nb, mesma.stu[0].insId, mesma.stu[0].solicitacao, mesma.stu[0].extra], ['NAV-150NM', 'C152', 3, 2, 9, []]);
    // Uma NAV-01 posta à mão e um pedido da NAV-150NM: dois voos, cada um com a sua
    const outra = estado([aluno(1000, { mis: 'Navegação', eq: 'C152', nb: 1.5, etapa: 'NAV-01', cursoDaEtapa: 'PP' }, { curso: 'PP' })]);
    assert.equal(importarPedidos(outra, [pedido(10, 1000, { missao_do_curso: idDe('NAV-150NM') })], { cursos: [PP] }).novos, 1);
    assert.deepEqual([outra.stu[0], ...outra.stu[0].extra].map(p => [p.etapa, p.nb, p.solicitacao]), [['NAV-01', 1.5, undefined], ['NAV-150NM', 3, 10]]);
    // O voo posto à mão sem missão do curso dá lugar e fica com a do pedido
    const semEtapa = estado([aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 2 }, { curso: 'PP' })]);
    assert.equal(importarPedidos(semEtapa, [pedido(11, 1000, { missao_do_curso: idDe('NAV-150NM') })], { cursos: [PP] }).atualizados, 1);
    assert.deepEqual([semEtapa.stu[0].etapa, semEtapa.stu[0].cursoDaEtapa, semEtapa.stu[0].eq, semEtapa.stu[0].extra], ['NAV-150NM', 'PP', 'C152', []]);
    // O voo com a missão do curso posta à mão e o pedido sem nenhuma: o voo dá lugar e fica com a do operador, como antes
    const soNoVoo = estado([aluno(1000, { mis: 'Navegação', eq: 'C172', nb: 2, etapa: 'NAV-02', cursoDaEtapa: 'PP' }, { curso: 'PP' })]);
    importarPedidos(soNoVoo, [pedido(12, 1000, { recurso: 'PA-34', horas: 1.2 })], { cursos: [PP] });
    assert.deepEqual([soNoVoo.stu[0].etapa, soNoVoo.stu[0].eq, soNoVoo.stu[0].nb, soNoVoo.stu[0].solicitacao], ['NAV-02', 'C172', 1.2, 12]);
  });

  it('o pedido sem missão do curso para o qual nenhuma é inferida diz por quê (só quando há o que inferir)', () => {
    const situacao = percursoDoCurso(PP).missoes.slice(0, 13).map((m, i) => ({ id: i + 1, aluno: 1000, curso: 'PP', missao: m.codigo, resultado: 'aprovado' }));
    const e = estado([aluno(1000, { fly: false }, { curso: 'PP' }), aluno(1001, { fly: false })]);
    const resumo = importarPedidos(e, [pedido(13, 1000, { recurso: 'PA-34' }), pedido(14, 1001, { recurso: 'PA-34' })], { situacao, programa: [PP], cursos: [PP] });
    assert.deepEqual(resumo.semMissaoDoCurso, [{ missao: 'Navegação', recurso: 'PA-34' }]);
    // Com o progresso desligado (nenhum programa para inferir), nada é dito
    const desligado = estado([aluno(1000, { fly: false }, { curso: 'PP' })]);
    assert.deepEqual(importarPedidos(desligado, [pedido(15, 1000, { recurso: 'PA-34' })], { situacao, programa: [], cursos: [PP] }).semMissaoDoCurso, []);
  });
});

// Por que o voo de um pedido que sai fica na escala (decisão 6 do desenho): o que aconteceu fica; o atrasado e o que já
// decolou pedem conferência
describe('ficaNaEscala', () => {
  const base = (extra = {}) => ({ stu: [aluno(1000)], fixos: {}, fStatus: {}, fObs: {}, resultados: { situacao: [], doDia: [] }, ...extra });
  const amb = { data: '2026-11-11', hoje: '2026-11-10', agora: 600 };
  it('a data passada, os resultados não lidos, o status, o resultado, nesta ordem; nada disso: sai', () => {
    assert.equal(ficaNaEscala(base(), { ...amb, hoje: '2026-11-12' }, 1000, 0), 'data-passada');
    assert.equal(ficaNaEscala(base({ indisponiveis: ['resultados'], fStatus: { '1000_0_1': 'Atrasado' } }), amb, 1000, 0), 'sem-os-resultados');
    assert.equal(ficaNaEscala(base({ fStatus: { '1000_0_1': 'Atrasado' } }), amb, 1000, 0), 'atrasado');
    for (const st of ['Em Voo', 'Pousou']) assert.equal(ficaNaEscala(base({ fStatus: { '1000_0_1': st } }), amb, 1000, 0), 'em-voo-ou-pousou');
    assert.equal(ficaNaEscala(base({ fStatus: { '1000_0_1': 'Cancelado' } }), amb, 1000, 0), 'cancelado-na-escala');
    const doDia = [{ id: 1, aluno: 1000, curso: 'PP', missao: 'PP-01', resultado: 'aprovado', data: '2026-11-11', voo: '1000_0_1' }];
    assert.equal(ficaNaEscala(base({ resultados: { situacao: [], doDia } }), amb, 1000, 0), 'com-resultado');
    for (const st of ['Pendente', 'Confirmado', undefined]) assert.equal(ficaNaEscala(base({ fStatus: st ? { '1000_0_1': st } : {} }), amb, 1000, 0), null, String(st));
    assert.equal(ficaNaEscala(base(), {}, 1000, 0), null, 'sem as datas, nenhuma regra de data');
  });
  it('hoje, o voo fixo cujo início já passou: já decolou (conferir); o que ainda não, e o de outra data, saem', () => {
    const fixo = base({ fixos: { '1000_0_1': { a: 500, b: 560, r: 'PP-LJV', insId: 1 } } });
    const hoje = { data: '2026-11-11', hoje: '2026-11-11' };
    assert.equal(ficaNaEscala(fixo, { ...hoje, agora: 500 }, 1000, 0), 'ja-decolou');
    assert.equal(ficaNaEscala(fixo, { ...hoje, agora: 499 }, 1000, 0), null);
    assert.equal(ficaNaEscala(fixo, { ...amb, agora: 900 }, 1000, 0), null, 'amanhã: o horário ainda não chegou');
    assert.equal(ficaNaEscala(base(), { ...hoje, agora: 900 }, 1000, 0), null, 'sem voo fixo, sem horário guardado');
  });
  // A revisão do E: o aviso de Pedidos e os avisos de cancelar e de retirar a aprovação perguntam, sem mudar nada, o que a
  // conciliação faria com o voo do pedido: null, ele sai; senão, o porquê de ficaNaEscala; sem registro que voe, undefined
  it('porQueOVooFica: o voo do pedido que sai ou o porquê de ficar; o pedido sem voo na escala, undefined', () => {
    const comPedido = extra => base({ stu: [aluno(1000, { solicitacao: 7 }), aluno(1001, { fly: false, solicitacao: 8 })], ...extra });
    assert.equal(porQueOVooFica(comPedido(), 7, amb), null);
    assert.equal(porQueOVooFica(comPedido({ fStatus: { '1000_0_1': 'Cancelado' } }), 7, amb), 'cancelado-na-escala');
    assert.equal(porQueOVooFica(comPedido({ fStatus: { '1000_0_1': 'Atrasado' } }), 7, amb), 'atrasado');
    assert.equal(porQueOVooFica(comPedido(), 7, { ...amb, hoje: '2026-11-12' }), 'data-passada');
    assert.equal(porQueOVooFica(comPedido(), 8, amb), undefined, 'o registro que não voa');
    assert.equal(porQueOVooFica(comPedido(), 9, amb), undefined, 'o pedido sem registro');
  });
});

// A missão do curso com que o pedido entra (regra 8 da Agenda): a do pedido; a do operador no voo que dá lugar; a do
// programa; nenhuma, com a nota de por quê
describe('missaoDaEntrada', () => {
  const programa = programaDoLegado(normalizarCursos({ PP: [{ id: 'PP-01', nome: 'A', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'B', mis: 'Navegação', eq: 'C172', nb: 2 }], PC: [], INVA: [] }), (s, c) => `${s}:${c}`);
  const linha = (extra = {}) => ({ id: 1, aluno: 1000, missao: 'Voo Local', janela: 'horario', horario: '08:20', recurso: 'C152', horas: 1, ...extra });
  const e = () => ({ stu: [], fStatus: {} });
  it('a do programa, a do operador, a do pedido; nenhuma, com a nota', () => {
    const doCurso = aluno(1000, { fly: false }, { curso: 'PP' });
    assert.deepEqual(missaoDaEntrada(e(), doCurso, linha(), { programa }), { missao: { codigo: 'PP-01', eq: 'C152', nb: 1 }, curso: 'PP', de: 'programa', nota: null, foraDoPrograma: false });
    const copiada = { mis: 'Voo Local', eq: 'C152', nb: 1.5, etapa: 'PP-09', cursoDaEtapa: 'PP' };
    assert.deepEqual(missaoDaEntrada(e(), doCurso, linha(), { programa, copiada }).missao, { codigo: 'PP-09', eq: 'C152', nb: 1.5 });
    const vinculada = linha({ missao: 'Navegação', missao_do_curso: 'x' });
    const PP = { ...programa[0], missoes: programa[0].missoes.map(m => ({ ...m, id: m.codigo === 'PP-02' ? '00000000-0000-4000-8000-000000000002' : m.id })) };
    const pelaAgenda = missaoDaEntrada(e(), doCurso, { ...vinculada, missao_do_curso: '00000000-0000-4000-8000-000000000002' }, { programa: [], cursos: [PP] });
    assert.deepEqual([pelaAgenda.missao, pelaAgenda.de], [{ codigo: 'PP-02', eq: 'C172', nb: 2 }, 'pedido']);
    assert.equal(missaoDaEntrada(e(), doCurso, { ...vinculada, missao_do_curso: '00000000-0000-4000-8000-000000000009' }, { programa: [], cursos: [PP] }).foraDoPrograma, true);
    assert.equal(missaoDaEntrada(e(), aluno(1000, { fly: false }), linha(), { programa }).nota, 'sem-curso');
    assert.equal(missaoDaEntrada(e(), doCurso, linha(), { programa: [] }).nota, 'sem-dados');
    assert.equal(missaoDaEntrada(e(), aluno(1000, { fly: false }, { curso: 'PC' }), linha({ missao: 'IFR' }), { programa: programa.filter(c => c.sigla !== 'PC') }).nota, 'sem-programa');
    assert.deepEqual(missaoDaEntrada(e(), doCurso, linha({ recurso: 'C172' }), { programa }), { missao: null, curso: 'PP', de: null, nota: 'sem-missao-do-tipo', foraDoPrograma: false });
  });
});

// A conciliação dos pedidos da data com o dia: o plano, que não muda nada (o desenho, 2.3)
describe('conciliarPedidos: o plano', () => {
  const linha = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', recurso: 'C152', horas: 1, cancelada_em: null, ...extra });
  const aprovada = s => s.aprovada === true;
  const amb = { data: '2026-11-11', hoje: '2026-11-10', agora: 600, aprovada };
  // 1000 voa com o pedido 1; 1001 com o 2, fora de importadas; 1002 tem o 3 sem voar, guardado; 1003, o 4 sem voar, não
  // guardado; 1004 sem nada; 1005 inativo; 1006 voa sem pedido
  const estado = () => ({
    importadas: [1, 3, 5],
    stu: [aluno(1000, { solicitacao: 1 }), aluno(1001, { solicitacao: 2 }), aluno(1002, { fly: false, solicitacao: 3 }), aluno(1003, { fly: false, solicitacao: 4 }),
      aluno(1004, { fly: false }), aluno(1005, { fly: false }, { inativo: true }), aluno(1006)],
    fixos: {}, fStatus: {}, fObs: {}, resultados: { situacao: [], doDia: [] }
  });

  it('sem a regra do pedido aprovado, recusa (a importação e o app passam a sua)', () => {
    assert.throws(() => conciliarPedidos(estado(), []), /aprovada/);
  });

  it('cada pedido aprovado: entra, é admitido, volta, ou fica como está; nada muda no estado', () => {
    const e = estado(), copia = structuredClone(e);
    const plano = conciliarPedidos(e, [linha(1, 1000, { aprovada: true }), linha(2, 1001, { aprovada: true }), linha(3, 1002, { aprovada: true }),
      linha(4, 1003, { aprovada: true }), linha(6, 1004, { aprovada: true }), linha(5, 1004, { aprovada: true }), linha(7, 9999, { aprovada: true }),
      linha(8, 1005, { aprovada: true })], { ...amb, semInativos: true });
    assert.deepEqual(e, copia, 'o plano não muda nada');
    assert.deepEqual(plano.entram.map(s => s.id), [6]);
    assert.deepEqual(plano.acertos, { admitir: [2], esquecer: [] });
    assert.deepEqual(plano.voltam, [{ id: 4, stuId: 1003, mid: 0 }]);
    assert.deepEqual(plano.dispensados, [5], 'guardado sem registro: tirado desta data, não volta sozinho');
    assert.deepEqual([plano.semAluno, plano.inativos], [[7], [8]]);
    assert.deepEqual([plano.saem, plano.ficam, plano.conferir, plano.semAprovacao], [[], [], [], []]);
    assert.equal(plano.pendente, true);
  });

  it('cancelado ou sem a aprovação, voando: sai, fica ou pede conferência; cancelado sem voar e guardado: o id é esquecido', () => {
    const e = estado();
    e.fStatus = { '1001_0_1': 'Pousou' };
    e.stu[6].solicitacao = 9;
    e.stu.push(aluno(1007, { solicitacao: 10 }));
    e.fStatus['1007_0_1'] = 'Atrasado';
    const plano = conciliarPedidos(e, [linha(1, 1000, { cancelada_em: '2026-11-10T12:00:00Z', aprovada: true }), linha(2, 1001, { cancelada_em: '2026-11-10T12:00:00Z' }),
      linha(3, 1002, { cancelada_em: '2026-11-10T12:00:00Z' }), linha(9, 1006, { aprovacao_retirada_em: '2026-11-10T12:00:00Z' }),
      linha(10, 1007, { cancelada_em: '2026-11-10T12:00:00Z' })], amb);
    assert.deepEqual(plano.saem, [{ id: 1, stuId: 1000, mid: 0, motivo: 'cancelado' }, { id: 9, stuId: 1006, mid: 0, motivo: 'sem-aprovacao' }]);
    assert.deepEqual(plano.ficam, [{ id: 2, stuId: 1001, mid: 0, motivo: 'cancelado', porque: 'em-voo-ou-pousou' }]);
    assert.deepEqual(plano.conferir, [{ id: 10, stuId: 1007, mid: 0, motivo: 'cancelado', porque: 'atrasado' }]);
    assert.deepEqual(plano.acertos.esquecer, [3]);
    assert.equal(plano.pendente, true);
  });

  it('esperando a aprovação: o voo que está na escala fica, listado; o registro de um pedido fora das linhas lidas não é tocado', () => {
    const plano = conciliarPedidos(estado(), [linha(1, 1000), linha(4, 1003)], amb);
    assert.deepEqual(plano.semAprovacao, [{ id: 1, stuId: 1000, mid: 0 }]);
    assert.deepEqual([plano.entram, plano.voltam, plano.saem, plano.pendente], [[], [], [], false]);
    // O pedido 2 (o voo do 1001) não está nas linhas: faltar não é cancelar
    assert.equal(conciliarPedidos(estado(), [], amb).pendente, false);
  });

  it('numa data passada nada entra, volta ou sai: só a informação', () => {
    const passada = { ...amb, hoje: '2026-11-12' };
    const plano = conciliarPedidos(estado(), [linha(6, 1004, { aprovada: true }), linha(4, 1003, { aprovada: true }), linha(1, 1000, { cancelada_em: '2026-11-10T12:00:00Z' })], passada);
    assert.deepEqual([plano.entram, plano.voltam, plano.saem], [[], [], []]);
    assert.deepEqual(plano.naoEntrou, [6]);
    assert.deepEqual(plano.ficam, [{ id: 1, stuId: 1000, mid: 0, motivo: 'cancelado', porque: 'data-passada' }]);
    assert.equal(plano.pendente, false);
  });

  it('so: só os pedidos da ação; religar: o aprovado guardado volta (sem registro, entra)', () => {
    const linhas = [linha(3, 1002, { aprovada: true }), linha(5, 1004, { aprovada: true }), linha(6, 1004, { aprovada: true })];
    const so = conciliarPedidos(estado(), linhas, { ...amb, so: [5, 3] });
    assert.deepEqual([so.entram.map(s => s.id), so.dispensados, so.voltam], [[], [5], []]);
    const religar = conciliarPedidos(estado(), linhas, { ...amb, so: [5, 3], religar: true });
    assert.deepEqual([religar.entram.map(s => s.id), religar.voltam], [[5], [{ id: 3, stuId: 1002, mid: 0 }]]);
  });

  it('com a missão do curso e os programas não lidos, o pedido espera', () => {
    const plano = conciliarPedidos(estado(), [linha(6, 1004, { aprovada: true, missao_do_curso: '00000000-0000-4000-8000-000000000001' })], { ...amb, cursos: null });
    assert.deepEqual([plano.entram, plano.esperamOsProgramas], [[], [6]]);
  });
});

// A aplicação do plano: o único que muda importadas; a saída tira o voo e, no cancelado, limpa a chave
describe('aplicarConciliacao', () => {
  const linha = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', recurso: 'C152', horas: 1, cancelada_em: null, aprovada: true, ...extra });
  const amb = { data: '2026-11-11', hoje: '2026-11-10', agora: 600, aprovada: s => s.aprovada === true };
  const cancelada = { cancelada_em: '2026-11-10T12:00:00Z' };

  it('entram, voltam e os acertos; aplicar de novo o plano de agora não muda nada', () => {
    const e = { importadas: [9], stu: [aluno(1000, { fly: false }), aluno(1001, { fly: false, solicitacao: 4, pr: 5 }), aluno(1002, { solicitacao: 2 })], fixos: {}, fStatus: {}, fObs: {} };
    const linhas = [linha(1, 1000), linha(4, 1001), linha(2, 1002), linha(9, 1003, cancelada)];
    const feito = aplicarConciliacao(e, conciliarPedidos(e, linhas, amb));
    assert.deepEqual(feito.entraram.map(x => [x.id, x.stuId, x.mid, x.novo]), [[1, 1000, 0, true]]);
    assert.deepEqual([feito.voltaram, feito.admitidas, feito.esquecidas], [[{ id: 4, stuId: 1001, mid: 0 }], [2], [9]]);
    assert.deepEqual([e.stu[0].fly, e.stu[0].solicitacao, e.stu[0].jan], [true, 1, 'h500']);
    assert.deepEqual([e.stu[1].fly, e.stu[1].pr], [true, 5], 'o que volta continua como estava');
    assert.deepEqual([...e.importadas].sort(), [1, 2, 4]);
    const depois = structuredClone(e);
    const segundo = conciliarPedidos(e, linhas, amb);
    assert.equal(segundo.pendente, false);
    aplicarConciliacao(e, segundo);
    assert.deepEqual(e, depois, 'aplicar duas vezes é aplicar uma');
  });

  // O plano velho aplicado de novo (um duplo clique, um tratador reentrante depois da junção) e o religar de um pedido
  // guardado cujo registro sumiu: um registro por pedido, o id uma vez em importadas
  it('o mesmo plano aplicado duas vezes, ou o religar do guardado sem registro, não duplica o pedido nem o id', () => {
    const e = { importadas: [], stu: [aluno(1000, { fly: false })], fixos: {}, fStatus: {}, fObs: {} };
    const plano = conciliarPedidos(e, [linha(7, 1000)], amb);
    aplicarConciliacao(e, plano);
    const depois = structuredClone(e);
    const feito = aplicarConciliacao(e, plano);
    assert.deepEqual([e, feito.entraram], [depois, []], 'o pedido que já tem registro não entra de novo');
    const r = { importadas: [7], stu: [aluno(1000, { fly: false })], fixos: {}, fStatus: {}, fObs: {} };
    aplicarConciliacao(r, conciliarPedidos(r, [linha(7, 1000)], { ...amb, religar: true }));
    assert.deepEqual([r.importadas, r.stu[0].solicitacao, r.stu[0].fly], [[7], 7, true]);
  });

  // O religar (a aprovação feita em Pedidos, D2, até o G2): os casos do prepararEntradaNaDemanda do D, agora na conciliação.
  // Sem o religar, o guardado é do operador (ele o tirou): nada volta nem entra
  it('religar: o registro desligado volta a voar com o que tinha; o que saiu da demanda (só nas importadas) entra de novo, uma vez; o novo entra; o que aguarda, não', () => {
    const dia = () => ({
      importadas: [1, 2], stu: [aluno(1001, { fly: false, solicitacao: 1, pr: 5 }), aluno(1002), aluno(1003, { fly: false })],
      fixos: { '1001_0_1': { a: 500, b: 560, r: 'PP-LJV', insId: 7, escolhido: true } }, fStatus: {}, fObs: {}
    });
    const linhas = [linha(1, 1001), linha(2, 1002), linha(3, 1003), linha(9, 1009, { aprovada: false })];
    const e = dia();
    const feito = aplicarConciliacao(e, conciliarPedidos(e, linhas, { ...amb, so: [1, 2, 3], religar: true }));
    assert.deepEqual(feito.voltaram, [{ id: 1, stuId: 1001, mid: 0 }]);
    assert.deepEqual([e.stu[0].fly, e.stu[0].mid || 0, e.stu[0].solicitacao, e.stu[0].pr, e.fixos['1001_0_1']], [true, 0, 1, 5, { a: 500, b: 560, r: 'PP-LJV', insId: 7, escolhido: true }],
      'a missão, a prioridade e o instrutor escolhido ficam');
    assert.deepEqual(feito.entraram.map(x => [x.id, x.stuId, x.mid]), [[2, 1002, 0], [3, 1003, 0]], 'o voo posto à mão dá lugar ao 2; o principal sem pedido recebe o 3');
    assert.deepEqual([e.stu[1].solicitacao, e.stu[1].extra, e.stu[2].solicitacao], [2, [], 3]);
    assert.deepEqual([...e.importadas].sort(), [1, 2, 3], 'o id esquecido entra de novo uma vez só');
    const sem = dia();
    const plano = conciliarPedidos(sem, linhas, { ...amb, so: [1, 2, 3] });
    assert.deepEqual([plano.voltam, plano.dispensados, plano.entram.map(x => x.id)], [[], [2], [3]]);
  });

  it('o cancelado sai com a chave limpa; o sem aprovação sai e o fixo dele dorme; cada um com a linha do Histórico', () => {
    const e = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 500, p2: -1, jan: 'h500', solicitacao: 1 }), aluno(1001, { p1: 610, p2: -1, jan: 'h610', solicitacao: 2 })] });
    e.importadas = [1, 2];
    const antes = { estado: e, resultado: runAllocationEngine(e) };
    e.fixos = { '1000_0_1': { a: 500, b: 560, r: antes.resultado.out[0].r, insId: 1, agendado: true }, '1001_0_1': { a: 610, b: 670, r: antes.resultado.out[1].r, insId: 1 } };
    e.fStatus = { '1000_0_1': 'Confirmado' };
    e.fObs = { '1000_0_1': { motivo: 'x' } };
    const plano = conciliarPedidos(e, [linha(1, 1000, cancelada), linha(2, 1001, { aprovada: false, aprovacao_retirada_em: '2026-11-10T12:00:00Z' })], amb);
    const feito = aplicarConciliacao(e, plano, { antes, escalar: x => ({ estado: x, resultado: runAllocationEngine(x) }) });
    assert.deepEqual([e.stu[0].fly, e.stu[1].fly, e.importadas], [false, false, []]);
    assert.deepEqual([Object.keys(e.fixos), Object.keys(e.fStatus), Object.keys(e.fObs)], [['1001_0_1'], [], []]);
    assert.equal(e.stu[0].solicitacao, 1, 'o registro fica, com o pedido: o número não volta a ser dado');
    const r0 = antes.resultado.out[0].r, r1 = antes.resultado.out[1].r;
    assert.deepEqual(feito.historico, [
      ['exc', `Pedidos: Aluno 1000 saiu da escala, pedido cancelado (Voo Local · estava às 08:20–09:20 no ${r0} com Instrutor 01 · deixa de ser fixo)`],
      ['exc', `Pedidos: Aluno 1001 saiu da escala, aprovação retirada (Voo Local · estava às 10:10–11:10 no ${r1} com Instrutor 01)`]
    ]);
  });
});

// N14 (Pedro, 2026-11-26): um horário cheio é preenchido na ordem de registro, e os que não cabem esperam por ele nessa
// ordem. O voo do pedido cancelado sai pela conciliação, e a rodada do motor em volta dos fixos (o padrão do R5, também na
// escala aprovada) dá o lugar ao primeiro da lista de espera daquele horário que cabe nele; nenhum voo fixo muda. A linha
// do Histórico da saída diz quem saiu e quem entrou
describe('A lista de espera: o lugar do pedido cancelado', () => {
  const linha = (id, alunoId, extra = {}) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, missao: 'Voo Local', janela: 'horario', horario: '08:20', recurso: 'C152', horas: 1, cancelada_em: null, ...extra });
  const amb = { data: '2026-11-11', hoje: '2026-11-10', agora: 600, aprovada: s => !s.cancelada_em };
  const cancelar = (linhas, id) => linhas.map(s => (s.id === id ? { ...s, cancelada_em: '2026-11-10T12:00:00Z' } : s));
  const motor = x => ({ estado: x, resultado: runAllocationEngine(x) });
  // Dois C152 e dois INVAs às 08:20, quatro pedidos de horário exato registrados nesta ordem: o 1 (Aluno 1001, que não voa
  // com o Instrutor 02) e o 2 (Aluno 1002, que não voa com o 01) voam; o 3 (Aluno 1003, que não voa com o 01) e o 4 esperam
  const montar = ({ aprovada = false, prioridades = {}, comMotor = motor } = {}) => {
    const p = (id, sol, bl) => aluno(id, { p1: 500, p2: -1, jan: 'h500', solicitacao: sol, pr: prioridades[sol] || 3 }, { bl });
    const e = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], semAeronaves: apenas('C152', 'PP-LJV', 'PR-BTB'),
      stu: [p(1001, 1, [2]), p(1002, 2, [1]), p(1003, 3, [1]), p(1004, 4, [])] });
    e.importadas = [1, 2, 3, 4];
    e.fixos = {};
    e.fObs = {};
    const antes = comMotor(e);
    if (aprovada) {
      e.aprovacao = { em: '2026-11-10T18:00:00Z', por: 'Operador' };
      e.fixos = fixosAoAprovar({}, antes.resultado.out);
    }
    return { e, antes: aprovada ? comMotor(e) : antes, linhas: [1, 2, 3, 4].map(id => linha(id, 1000 + id)) };
  };
  const linhasDe = r => r.out.map(o => [o.fKey, o.a, o.r, o.insId]);

  for (const aprovada of [false, true]) {
    const nome = aprovada ? 'na escala aprovada' : 'na escala não aprovada';
    it(`${nome}: o lugar vai ao 1º da lista que cabe, ao 2º quando o 1º não cabe, a nenhum quando nenhum cabe`, () => {
      // O 2 sai: o lugar dele (o PR-BTB com o Instrutor 02) serve ao 3, o 1º da lista
      const a = montar({ aprovada });
      assert.deepEqual(linhasDe(a.antes.resultado).map(l => l[0]), ['1001_0_1', '1002_0_1']);
      const fixosAntes = structuredClone(a.e.fixos);
      const feitoA = aplicarConciliacao(a.e, conciliarPedidos(a.e, cancelar(a.linhas, 2), amb), { antes: a.antes, escalar: motor });
      const depoisA = runAllocationEngine(a.e);
      assert.deepEqual(linhasDe(depoisA).map(l => [l[0], l[1]]), [['1001_0_1', 500], ['1003_0_1', 500]]);
      assert.match(feitoA.historico[0][1], /^Pedidos: Aluno 1002 saiu da escala, pedido cancelado \(Voo Local · estava às 08:20–09:20 no .+ com Instrutor 02.*\); no lugar entrou Aluno 1003 \(1º da lista de espera das 08:20\)$/);
      if (aprovada) {
        // Nenhum voo fixo muda; o que entrou não fica fixo por esta rodada
        const { '1002_0_1': _, ...ficam } = fixosAntes;
        assert.deepEqual(a.e.fixos, ficam);
        assert.deepEqual(linhasDe(depoisA)[0], linhasDe(a.antes.resultado)[0]);
        assert.equal(Object.hasOwn(a.e.fixos, '1003_0_1'), false);
        assert.equal(feitoA.historico[0][1].includes('deixa de ser fixo'), true);
      }
      // O 1 sai: o lugar dele (o Instrutor 01) não serve ao 3, que não voa com ele; vai ao 4, o 2º da lista
      const b = montar({ aprovada });
      const feitoB = aplicarConciliacao(b.e, conciliarPedidos(b.e, cancelar(b.linhas, 1), amb), { antes: b.antes, escalar: motor });
      assert.deepEqual(linhasDe(runAllocationEngine(b.e)).map(l => l[0]).sort(), ['1002_0_1', '1004_0_1']);
      assert.match(feitoB.historico[0][1], /; no lugar entrou Aluno 1004 \(2º da lista de espera das 08:20\)$/);
      // Sem o 4 na lista (cancelado antes), o lugar do 1 não serve a ninguém
      const c = montar({ aprovada });
      aplicarConciliacao(c.e, conciliarPedidos(c.e, cancelar(c.linhas, 4), amb));
      const antesC = motor(c.e);
      const feitoC = aplicarConciliacao(c.e, conciliarPedidos(c.e, cancelar(cancelar(c.linhas, 4), 1), amb), { antes: antesC, escalar: motor });
      assert.deepEqual(linhasDe(runAllocationEngine(c.e)).map(l => l[0]), ['1002_0_1']);
      assert.match(feitoC.historico[0][1], /^Pedidos: Aluno 1001 saiu da escala, pedido cancelado \([^)]*\)$/, 'ninguém entrou');
    });
  }

  // O resumo da conciliação (o aviso do app): quem saiu e quem entrou no lugar; o voo atrasado do cancelado, para conferir
  it('o resumo diz quem saiu e quem entrou no lugar; o voo atrasado do cancelado fica para conferir', () => {
    const a = montar();
    const plano = conciliarPedidos(a.e, cancelar(a.linhas, 2), amb);
    const resumo = resumoDaConciliacao(plano, aplicarConciliacao(a.e, plano, { antes: a.antes, escalar: motor }));
    assert.deepEqual([resumo.novos, resumo.atualizados, resumo.sairam, resumo.conferir], [0, 0, [{ aluno: 'Aluno 1002', entrou: 'Aluno 1003', de: 'escala' }], []]);
    const b = montar();
    b.e.fStatus = { '1001_0_1': 'Atrasado' };
    const planoB = conciliarPedidos(b.e, cancelar(b.linhas, 1), amb);
    const resumoB = resumoDaConciliacao(planoB, aplicarConciliacao(b.e, planoB, { antes: b.antes, escalar: motor }));
    assert.deepEqual([resumoB.sairam, resumoB.conferir], [[], [{ aluno: 'Aluno 1001', porque: 'atrasado' }]]);
    assert.equal(b.e.stu[0].fly, true, 'o atrasado fica até o operador conferir');
  });

  // A revisão do E: o cancelado que só esperava saiu da lista de espera (o aviso diz isso, como o Histórico); o que fica
  // (o status Cancelado na escala, em voo, pousado, com resultado) vai no resumo com o porquê, para o aviso dizer
  it('o resumo diz de onde cada um saiu (da escala, da lista de espera, dos pedidos da data) e quem fica, com o porquê', () => {
    const a = montar();
    const plano = conciliarPedidos(a.e, cancelar(cancelar(a.linhas, 4), 2), amb);
    const resumo = resumoDaConciliacao(plano, aplicarConciliacao(a.e, plano, { antes: a.antes, escalar: motor }));
    assert.deepEqual(resumo.sairam, [{ aluno: 'Aluno 1002', entrou: 'Aluno 1003', de: 'escala' }, { aluno: 'Aluno 1004', entrou: null, de: 'espera' }]);
    const b = montar();
    Object.assign(b.e.stu[2], { mis: 'Navegação', eq: 'PA-34' });
    const antesB = motor(b.e);
    const planoB = conciliarPedidos(b.e, cancelar(b.linhas, 3), amb);
    assert.deepEqual(resumoDaConciliacao(planoB, aplicarConciliacao(b.e, planoB, { antes: antesB, escalar: motor })).sairam, [{ aluno: 'Aluno 1003', entrou: null, de: 'pedidos' }]);
    const c = montar();
    c.e.fStatus = { '1001_0_1': 'Cancelado', '1002_0_1': 'Pousou' };
    const planoC = conciliarPedidos(c.e, cancelar(cancelar(c.linhas, 1), 2), amb);
    const resumoC = resumoDaConciliacao(planoC, aplicarConciliacao(c.e, planoC, { antes: c.antes, escalar: motor }));
    assert.deepEqual([resumoC.sairam, resumoC.ficam], [[], [{ aluno: 'Aluno 1001', porque: 'cancelado-na-escala' }, { aluno: 'Aluno 1002', porque: 'em-voo-ou-pousou' }]]);
  });

  // A revisão do E (N14 na escala não aprovada): o pedido de antes na fila que vai para o lugar livre (o 3, às 06:30 pela
  // 2ª preferência, U1, ou pelo horário flexível, vai para a 1ª, as 08:20 do 2) não é o 1º da lista de espera (o 4
  // continua esperando: a regra é a ordem do motor, a pergunta fica para o Pedro), e o Histórico e o resumo dizem quem
  // entrou e de onde veio, em vez de ninguém
  for (const [caso, mudar] of [['dois horários exatos (U1)', x => Object.assign(x, { jan: 'h500|h390', p2: 390 })], ['horário flexível', x => { delete x.jan; }]]) {
    it(`na escala não aprovada, o pedido que muda de horário para o lugar livre é quem entrou (${caso}), e o Histórico diz de onde ele veio`, () => {
      const a = montar();
      mudar(a.e.stu[2]);
      const antes = motor(a.e);
      assert.deepEqual(linhasDe(antes.resultado).map(l => [l[0], l[1], l[2]]), [['1003_0_1', 390, 'PR-BTB'], ['1001_0_1', 500, 'PP-LJV'], ['1002_0_1', 500, 'PR-BTB']]);
      const plano = conciliarPedidos(a.e, cancelar(a.linhas, 2), amb);
      const feito = aplicarConciliacao(a.e, plano, { antes, escalar: motor });
      assert.deepEqual(linhasDe(runAllocationEngine(a.e)).map(l => [l[0], l[1], l[2]]), [['1001_0_1', 500, 'PP-LJV'], ['1003_0_1', 500, 'PR-BTB']]);
      assert.equal(feito.historico[0][1], 'Pedidos: Aluno 1002 saiu da escala, pedido cancelado (Voo Local · estava às 08:20–09:20 no PR-BTB com Instrutor 02); no lugar entrou Aluno 1003 (estava às 06:30 no PR-BTB)');
      assert.deepEqual(resumoDaConciliacao(plano, feito).sairam, [{ aluno: 'Aluno 1002', entrou: 'Aluno 1003', de: 'escala' }]);
    });
  }

  it('sem a escala de antes ou sem o motor, a saída não diz quem entrou; o pedido sem horário exato não espera', () => {
    const a = montar();
    const feito = aplicarConciliacao(a.e, conciliarPedidos(a.e, cancelar(a.linhas, 2), amb));
    assert.equal(feito.historico[0][1].includes('entrou'), false);
    // O 3 sem horário exato não espera (voa em outro horário, as 06:30): quando ele vai para o lugar livre, não é como o 1º
    // da lista de espera (a revisão do E: o Histórico diz de onde ele veio)
    const b = montar();
    delete b.e.stu[2].jan;
    const antes = motor(b.e);
    const feitoB = aplicarConciliacao(b.e, conciliarPedidos(b.e, cancelar(b.linhas, 2), amb), { antes, escalar: motor });
    assert.equal(feitoB.historico[0][1].includes('lista de espera'), false);
  });

  // O pedido que esperava (N14: na lista de espera, sem linha na escala) não "saiu da escala": a linha diz de onde ele saiu.
  // O que não estava na escala por outro motivo também diz; sem a escala de antes, não se sabe, e a linha é a de sempre
  it('o pedido cancelado que esperava sai da lista de espera, e o Histórico diz isso; o que não estava na escala, também', () => {
    const a = montar();
    const feitoA = aplicarConciliacao(a.e, conciliarPedidos(a.e, cancelar(cancelar(a.linhas, 3), 4), amb), { antes: a.antes, escalar: motor });
    assert.deepEqual(feitoA.historico, [
      ['exc', 'Pedidos: Aluno 1003 saiu da lista de espera das 08:20, pedido cancelado (Voo Local · era o 1º)'],
      ['exc', 'Pedidos: Aluno 1004 saiu da lista de espera das 08:20, pedido cancelado (Voo Local · era o 2º)']
    ]);
    // O 3 numa Navegação no PA-34 às 08:20: recusado pela disponibilidade (não por lugar), ele não espera
    const b = montar();
    Object.assign(b.e.stu[2], { mis: 'Navegação', eq: 'PA-34' });
    const antes = motor(b.e);
    const feitoB = aplicarConciliacao(b.e, conciliarPedidos(b.e, cancelar(b.linhas, 3), amb), { antes, escalar: motor });
    assert.deepEqual(feitoB.historico, [['exc', 'Pedidos: Aluno 1003 saiu dos pedidos da data, pedido cancelado (Navegação · não estava na escala)']]);
    const c = montar();
    const feitoC = aplicarConciliacao(c.e, conciliarPedidos(c.e, cancelar(c.linhas, 3), amb));
    assert.deepEqual(feitoC.historico, [['exc', 'Pedidos: Aluno 1003 saiu da escala, pedido cancelado (Voo Local)']]);
  });

  // Com a prioridade desligada (js/funcionalidades.js), o motor da tela recebe todos na padrão (estadoDaEscala,
  // comAPrioridadePadrao): a lista é a ordem de registro, qualquer que seja a prioridade guardada
  it('com a prioridade desligada, a lista de espera é a ordem de registro; ligada, a prioridade vem antes', () => {
    const desligada = x => { const d = comAPrioridadePadrao(x); return { estado: d, resultado: runAllocationEngine(d) }; };
    // O 1 e o 2 com a prioridade guardada 5, o 4 com 4 e o 3 com a padrão: ligada, o 4 espera antes do 3; desligada, depois
    const prioridades = { 1: 5, 2: 5, 4: 4 };
    const ligadaCaso = montar({ prioridades });
    const feitoL = aplicarConciliacao(ligadaCaso.e, conciliarPedidos(ligadaCaso.e, cancelar(ligadaCaso.linhas, 2), amb), { antes: ligadaCaso.antes, escalar: motor });
    assert.match(feitoL.historico[0][1], /entrou Aluno 1004 \(1º da lista de espera das 08:20\)$/);
    const desligadaCaso = montar({ prioridades, comMotor: desligada });
    const feitoD = aplicarConciliacao(desligadaCaso.e, conciliarPedidos(desligadaCaso.e, cancelar(desligadaCaso.linhas, 2), amb), { antes: desligadaCaso.antes, escalar: desligada });
    assert.match(feitoD.historico[0][1], /entrou Aluno 1003 \(1º da lista de espera das 08:20\)$/);
    assert.equal(desligadaCaso.e.stu[3].pr, 4, 'a prioridade guardada não muda');
  });
});

// Uma prova por propriedade (o item E do plano: 300 sequências): ações ao acaso sobre os pedidos da data e o dia (registrar,
// aprovar, cancelar, retirar a aprovação, tirar da escala, pôr um voo à mão, fixá-lo à mão, mudar o status), cada uma
// seguida da conciliação (às vezes com o religar). Depois de cada uma: aplicar de novo não muda nada; as linhas em outra
// ordem dão o mesmo dia; cada pedido tem no máximo um registro; os números das missões são únicos e nenhum registro some;
// importadas não repete; o aprovado tem um registro, guardado, que voa, a menos que o teste o tenha tirado da escala (e o
// religar o põe de volta); o cancelado só voa quando fica (o status, o resultado); o registro com o fixo posto à mão só
// muda o "voa"
describe('A conciliação, por propriedade (300 sequências)', () => {
  const sorteio = semente => () => {
    semente = (semente + 0x6D2B79F5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const amb = { data: '2026-11-11', hoje: '2026-11-10', agora: 600, aprovada: s => s.aprovada === true };
  const HORARIOS = ['06:30', '08:20', '10:10', '12:40', '14:30'];
  const MISSOES = ['Voo Local', 'Navegação', 'IFR'];
  const registros = e => e.stu.flatMap(s => [s, ...(s.extra || [])].map(r => ({ s, r, mid: r.mid || 0 })));
  const campos = r => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([c]) => c !== 'fly' && c !== 'extra').sort()));

  it('as invariantes valem depois de cada ação', () => {
    let passos = 0;
    for (let n = 0; n < 300; n++) {
      const acaso = sorteio(n + 1);
      const um = lista => lista[Math.floor(acaso() * lista.length)];
      const e = { importadas: [], stu: [1000, 1001, 1002, 1003].map(id => aluno(id, { fly: false })), fixos: {}, fStatus: {}, fObs: {}, resultados: { situacao: [], doDia: [] } };
      const linhas = [];
      // Os pedidos que o teste tirou da escala (o operador): o aprovado pode não voar só por isso
      const tirados = new Set();
      let proximo = 1;
      for (let k = 0; k < 14; k++) {
        const acao = um(['registrar', 'registrar', 'aprovar', 'cancelar', 'retirar', 'tirar', 'aMao', 'fixar', 'status', 'religar']);
        const linha = linhas.length ? um(linhas) : null;
        if (acao === 'registrar') {
          linhas.push({ id: proximo++, data: '2026-11-11', aluno: um([1000, 1001, 1002, 1003]), missao: um(MISSOES), janela: 'horario', horario: um(HORARIOS), recurso: null, horas: 1, cancelada_em: null, aprovada: acaso() < 0.6 });
        } else if (acao === 'aprovar' && linha && !linha.cancelada_em) Object.assign(linha, { aprovada: true, aprovacao_retirada_em: null });
        else if (acao === 'cancelar' && linha) linha.cancelada_em = '2026-11-10T12:00:00Z';
        else if (acao === 'retirar' && linha && linha.aprovada) Object.assign(linha, { aprovada: false, aprovacao_retirada_em: '2026-11-10T12:00:00Z' });
        else if (acao === 'tirar') {
          const x = um(registros(e));
          if (x.r.solicitacao !== undefined && x.r.fly) { x.r.fly = false; tirados.add(x.r.solicitacao); }
        }
        else if (acao === 'aMao') {
          const s = um(e.stu);
          s.extra = [...(s.extra || []), { mid: Math.max(0, ...registros(e).filter(x => x.s === s).map(x => x.mid)) + 1, fly: true, mis: um(MISSOES), eq: 'C152', p1: 500, p2: -1, nb: 1, ss: 1, pr: um([1, 3, 5]) }];
        } else if (acao === 'fixar') {
          const x = um(registros(e).filter(y => y.r.fly).concat([{ s: null }]));
          if (x.s) e.fixos[`${x.s.id}_${x.mid}_1`] = { a: 610, b: 670, r: 'PP-LJV', insId: 1, ...(acaso() < 0.5 ? { agendado: true } : { escolhido: true }) };
        } else if (acao === 'status') {
          const x = um(registros(e).filter(y => y.r.fly).concat([{ s: null }]));
          if (x.s) e.fStatus[`${x.s.id}_${x.mid}_1`] = um(['Confirmado', 'Em Voo', 'Pousou', 'Cancelado', 'Atrasado']);
        }
        // Os registros de antes: os com fixo à mão e os sem pedido
        const antes = registros(e).map(x => ({ ...x, fKey: `${x.s.id}_${x.mid}_1`, campos: campos(x.r), solicitacao: x.r.solicitacao }));
        const quantosAntes = new Map(e.stu.map(s => [s.id, registros(e).filter(x => x.s === s).length]));
        const opcoes = { ...amb, religar: acao === 'religar' };
        const outraOrdem = structuredClone(e);
        const plano = conciliarPedidos(e, linhas, opcoes);
        aplicarConciliacao(e, plano);
        if (opcoes.religar) tirados.clear();
        passos++;
        const ctx = `sequência ${n}, passo ${k} (${acao})`;
        // Aplicar de novo não muda nada
        const depois = structuredClone(e);
        const segundo = conciliarPedidos(e, linhas, opcoes);
        assert.equal(segundo.pendente, false, ctx);
        aplicarConciliacao(e, segundo);
        assert.deepEqual(e, depois, ctx);
        // As linhas em outra ordem dão o mesmo dia (importadas, na ordem em que entraram, à parte)
        aplicarConciliacao(outraOrdem, conciliarPedidos(outraOrdem, [...linhas].sort(() => acaso() - 0.5), opcoes));
        const semAOrdem = x => ({ ...x, importadas: [...x.importadas].sort((p, q) => p - q) });
        assert.deepEqual(semAOrdem(outraOrdem), semAOrdem(e), `${ctx}: outra ordem`);
        // Um registro por pedido; números únicos, nenhum registro some
        const todos = registros(e);
        const comPedido = todos.filter(x => x.r.solicitacao !== undefined).map(x => x.r.solicitacao);
        assert.equal(new Set(comPedido).size, comPedido.length, ctx);
        for (const s of e.stu) {
          const mids = todos.filter(x => x.s === s).map(x => x.mid);
          assert.equal(new Set(mids).size, mids.length, ctx);
          assert.ok(mids.every(m => Number.isInteger(m) && m >= 0 && m <= 999999), ctx);
          assert.ok(mids.length >= quantosAntes.get(s.id), ctx);
        }
        assert.equal(new Set(e.importadas).size, e.importadas.length, ctx);
        // O aprovado tem um registro, guardado, que voa, a menos que o teste o tenha tirado da escala; o cancelado e o
        // retirado só voam quando ficam
        for (const l of linhas) {
          const x = todos.find(y => y.r.solicitacao === l.id);
          const guardada = e.importadas.includes(l.id);
          if (!l.cancelada_em && l.aprovada) {
            assert.ok(x && guardada, `${ctx}: aprovado ${l.id} tem o registro, guardado`);
            assert.ok(x.r.fly || tirados.has(l.id), `${ctx}: aprovado ${l.id} voa, ou foi tirado da escala`);
          }
          if ((l.cancelada_em || l.aprovacao_retirada_em) && x && x.r.fly) {
            assert.ok(['Em Voo', 'Pousou', 'Cancelado', 'Atrasado'].includes(e.fStatus[`${x.s.id}_${x.mid}_1`]), `${ctx}: ${l.id} saiu`);
          }
        }
        // O registro com o fixo posto à mão só muda o "voa"; o sem pedido fica, ou dá lugar a um pedido no mesmo número
        for (const a of antes) {
          const pino = e.fixos[a.fKey];
          const agora = todos.find(x => x.s === a.s && x.mid === a.mid);
          if (pino && (pino.agendado || pino.escolhido)) assert.equal(campos(agora.r), a.campos, `${ctx}: fixo à mão ${a.fKey}`);
          if (a.solicitacao === undefined && agora.r.solicitacao === undefined) assert.equal(campos(agora.r), a.campos, `${ctx}: sem pedido ${a.fKey}`);
        }
      }
    }
    assert.equal(passos, 300 * 14);
  });
});

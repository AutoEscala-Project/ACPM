// As recusas do motor ligadas aos pedidos (js/rejeicoes.js): a i-ésima recusa é a do i-ésimo pedido que voa sem pino e sem
// linha, na ordem do motor. Conferido em todos os estados dos goldens e em 300 sementes (com escolhas de instrutor, com
// atributos dos recursos e com a volta do noturno): cada recusa liga a um pedido do mesmo rótulo, e cada pedido sem lugar
// a uma recusa. E nos casos em que o rótulo não basta: dois alunos de mesmo nome e duas extras da mesma missão
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { naOrdemDoMotor, rejeicoesDosPedidos, primeiroDaListaDeEspera } from '../../js/rejeicoes.js';
import { chaveDoVoo, pedidoDoAluno } from '../../js/voo.js';
import { gerarCenario, comEscolhas, comAtributos, comVolta } from '../helpers/cenarios.js';
import { lerGoldens } from '../helpers/goldens.js';
import { aluno, cenario, instrutor, missaoExtra, apenas } from '../helpers/montar.js';

// O rótulo que o motor dá à recusa de um pedido: o nome, e a missão nas extras
function rotuloDoPedido(estado, fKey) {
  const [stuId, mid] = fKey.split('_').map(Number);
  const s = estado.stu.find(x => x.id === stuId);
  return mid ? `${s.nm} (${pedidoDoAluno(s, mid).mis})` : s.nm;
}

function conferir(estado, nome) {
  const resultado = runAllocationEngine(estado);
  const recusas = resultado.al.filter(a => a.t === 'err');
  const mapa = rejeicoesDosPedidos(estado, resultado);
  assert.equal(mapa.size, recusas.length, `${nome}: cada recusa ligada a um pedido`);
  for (const [fKey, err] of mapa) assert.equal(err.s, rotuloDoPedido(estado, fKey), `${nome}: ${fKey}`);
  // Cada recusa ligada a um pedido só, e cada uma uma vez
  assert.equal(new Set(mapa.values()).size, recusas.length, `${nome}: uma recusa por pedido`);
  return { resultado, mapa };
}

describe('As recusas do motor e os pedidos', () => {
  it('nos 41 estados dos goldens', () => {
    const goldens = lerGoldens();
    conferir(goldens.exemplo.estado, 'exemplo');
    for (const { seed } of goldens.cenarios) conferir(gerarCenario(seed), `cenário ${seed}`);
  });

  it('em 300 sementes, com escolhas, atributos e a volta do noturno', () => {
    let recusas = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const base = gerarCenario(seed);
      for (const [nome, estado] of [[seed, base], [`${seed} com escolhas`, comEscolhas(gerarCenario(seed), seed)],
        [`${seed} com atributos`, comAtributos(gerarCenario(seed), seed)], [`${seed} com a volta`, comVolta(gerarCenario(seed), seed)]]) {
        recusas += conferir(estado, nome).mapa.size;
      }
    }
    // O teste só vale se houver recusas para ligar
    assert.ok(recusas > 300, `só ${recusas} recusas`);
  });

  it('dois alunos de mesmo nome: cada recusa vai para o pedido certo, pelo motivo', () => {
    // Os dois "Maria Silva" pedem Multimotor sem nenhum instrutor que o faça; um deles com o instrutor escolhido fora do dia
    const estado = cenario({
      ins: [instrutor(1, 1), instrutor(2, 1, { on: false })],
      stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }, { nm: 'Maria Silva' }), aluno(1001, { mis: 'Voo Local', insId: 2 }, { nm: 'Maria Silva' })]
    });
    const { mapa } = conferir(estado, 'homônimos');
    assert.equal(mapa.get(chaveDoVoo(1001, 0)).codigo, 'instrutor-escolhido');
    assert.notEqual(mapa.get(chaveDoVoo(1000, 0)).codigo, 'instrutor-escolhido');
  });

  it('duas extras da mesma missão: cada uma com a recusa dela', () => {
    const estado = cenario({ ins: [instrutor(1, 1)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }, { extra: [missaoExtra(2, { mis: 'Multimotor', eq: 'PA-34' }), missaoExtra(3, { mis: 'Multimotor', eq: 'PA-34' })] })] });
    const { mapa } = conferir(estado, 'extras');
    assert.deepEqual([...mapa.keys()].sort(), [chaveDoVoo(1000, 0), chaveDoVoo(1000, 2), chaveDoVoo(1000, 3)].sort());
  });

  it('duas extras da mesma missão com recusas diferentes: cada uma com a dela, na ordem das extras (não trocadas)', () => {
    // As duas escolheram um instrutor que não vem: a extra 2, o Instrutor 02; a extra 3, o Instrutor 03. Rótulo e código
    // iguais: só a ordem das extras no motor diz qual recusa é de qual
    const estado = cenario({
      ins: [instrutor(1, 1), instrutor(2, 1, { on: false }), instrutor(3, 1, { on: false })],
      stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34' }, { extra: [missaoExtra(2, { mis: 'Multimotor', eq: 'PA-34', insId: 2 }), missaoExtra(3, { mis: 'Multimotor', eq: 'PA-34', insId: 3 })] })]
    });
    const { mapa } = conferir(estado, 'extras com recusas diferentes');
    assert.match(mapa.get(chaveDoVoo(1000, 2)).m, /Instrutor 02/);
    assert.match(mapa.get(chaveDoVoo(1000, 3)).m, /Instrutor 03/);
  });

  it('o pino e o voo na escala não recebem recusa; sem recusas, o mapa vazio', () => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000), aluno(1001)] });
    const { resultado, mapa } = conferir(estado, 'sem recusas');
    assert.equal(mapa.size, 0);
    assert.equal(rejeicoesDosPedidos(null, resultado).size, 0);
  });

  it('naOrdemDoMotor: a volta do noturno, os fixos, os agendados e os outros', () => {
    const estado = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000), aluno(1001), aluno(1002)] });
    estado.fixos = { [chaveDoVoo(1002, 0)]: { a: 390, b: 450, r: 'PR-VOB', insId: 1 }, [chaveDoVoo(1001, 0)]: { a: 500, b: 560, r: 'PR-VOB', insId: 1, agendado: true } };
    const voos = [chaveDoVoo(1000, 0), chaveDoVoo(1001, 0), chaveDoVoo(1002, 0)].map(fKey => ({ fKey, stuId: +fKey.split('_')[0], mid: 0 }));
    assert.deepEqual(naOrdemDoMotor(estado, voos).map(o => o.stuId), [1002, 1001, 1000]);
  });
});

// O 1º da lista de espera do horário que o voo de um pedido da agenda cancelado deixa (D3: o aviso das novidades dos
// pedidos), como a escala diz (a espera da recusa, F1h)
describe('O 1º da lista de espera da vaga do pedido cancelado', () => {
  const pedido = (id, alunoId) => ({ id, data: '2026-11-11', aluno: alunoId, aluno_nome: `Aluno ${alunoId}`, cancelada_em: '2026-11-10T15:00:00Z', aprovada_em: '2026-11-10T14:00:00Z' });
  // A escala da data com o motor: um C152 só, dois pedidos da agenda às 08:20 (jan h500); o 1º voa, o 2º espera
  const nove = Array.from({ length: 9 }, (_, i) => instrutor(i + 1, 9));
  const as0820 = (id, solicitacao, extra = {}) => aluno(id, { p1: 500, p2: -1, jan: 'h500', solicitacao, ...extra });
  const montarDia = ({ stu, semAeronaves = apenas('C152', 'PP-LJV'), fStatus = {} }) => {
    const estado = { ...cenario({ ins: nove, stu, semAeronaves, fStatus }), importadas: stu.map(s => s.solicitacao).filter(Boolean) };
    return { estado, resultado: runAllocationEngine(estado) };
  };

  it('o 1º da lista de espera: o do horário que o voo do pedido cancelado deixa, pelo lugar na lista', () => {
    const { estado, resultado } = montarDia({ stu: [as0820(1000, 1), as0820(1001, 3), as0820(1002, 2)] });
    assert.deepEqual(resultado.al.filter(a => a.espera).map(a => [a.s, a.espera.lugar]), [['Aluno 1002', 1], ['Aluno 1001', 2]]);
    assert.deepEqual(primeiroDaListaDeEspera(pedido(1, 1000), estado, resultado), { minuto: 500, aluno: 'Aluno 1002' });
  });

  it('sem a espera na escala, ninguém: o voo sem fila no horário, o pedido sem voo, o voo cancelado e a espera de outro horário', () => {
    // Dois C152: os dois voam, ninguém espera
    const livres = montarDia({ stu: [as0820(1000, 1), as0820(1001, 2)], semAeronaves: apenas('C152', 'PP-LJV', 'PR-BTB') });
    assert.equal(primeiroDaListaDeEspera(pedido(1, 1000), livres.estado, livres.resultado), null);
    const { estado, resultado } = montarDia({ stu: [as0820(1000, 1), as0820(1001, 2), aluno(1002, { p1: 610, p2: -1, jan: 'h610', solicitacao: 3 })] });
    // O que espera (o 2) não tem voo a deixar; o pedido que nenhum registro leva, também não
    assert.equal(primeiroDaListaDeEspera(pedido(2, 1001), estado, resultado), null);
    assert.equal(primeiroDaListaDeEspera(pedido(9, 1000), estado, resultado), null);
    // O voo das 10:10 (sem ninguém esperando às 10:10) não dá o 1º das 08:20
    assert.equal(primeiroDaListaDeEspera(pedido(3, 1002), estado, resultado), null);
    // O voo já com o status Cancelado não ocupa a vaga (a Escala oferece a vaga nas Sugestões dele)
    const comStatus = { ...estado, fStatus: { '1000_0_1': 'Cancelado' } };
    assert.equal(primeiroDaListaDeEspera(pedido(1, 1000), comStatus, resultado), null);
    // Sem escala
    assert.equal(primeiroDaListaDeEspera(pedido(1, 1000), estado, null), null);
  });

  it('o pedido de uma missão extra: a vaga é a do voo dela', () => {
    const extra = { mid: 1, fly: true, mis: 'Voo Local', eq: 'C152', p1: 500, p2: -1, jan: 'h500', nb: 1, ss: 1, pr: 3, solicitacao: 1 };
    const { estado, resultado } = montarDia({ stu: [aluno(1000, { fly: false }, { extra: [extra] }), as0820(1001, 2)] });
    assert.deepEqual(primeiroDaListaDeEspera(pedido(1, 1000), estado, resultado), { minuto: 500, aluno: 'Aluno 1001' });
  });
});

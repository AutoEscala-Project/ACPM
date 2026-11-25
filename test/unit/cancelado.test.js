// O voo cancelado aproveitado (js/reparo.js): o aluno não perde o voo porque o instrutor ou o avião faltou. O motivo do
// cancelamento sai da busca; a ordem é o mesmo horário e avião com outro instrutor, outro avião, o horário mais perto e
// outro tipo de recurso; o que fica fora da disponibilidade do pedido ou em outro tipo pede a confirmação com o aluno.
// Aplicada, a sugestão fixa o voo, volta o status para Pendente e muda o pedido; desfeita, tudo volta como estava
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { pinoDoVoo } from '../../js/fixos.js';
import { hm } from '../../js/format.js';
import { cancelamentoAproveitavel, sugerirParaCancelado, aproveitarCancelado, desfazerAproveitamento, sugestoesDoRejeitado } from '../../js/reparo.js';
import { rejeicoesDosPedidos } from '../../js/rejeicoes.js';
import { pedidoDoAluno } from '../../js/voo.js';
import { gerarCenario, comEscolhas } from '../helpers/cenarios.js';
import { aluno, cenario, instrutor, apenas } from '../helpers/montar.js';

// Escala o dia, cancela o voo do aluno com o motivo e devolve o estado e a escala de depois
function cancelado(base, stuId, motivo, extra = {}) {
  const antes = runAllocationEngine(base);
  const voo = antes.out.find(o => o.stuId === stuId);
  const estado = {
    ...base, fixos: { [voo.fKey]: pinoDoVoo(voo) }, fStatus: { [voo.fKey]: 'Cancelado' }, fObs: { [voo.fKey]: { motivo } }, ...extra
  };
  return { estado, resultado: runAllocationEngine(estado), voo };
}
const textos = r => r.opcoes.map(o => o.texto);
const DIA = { data: '2026-11-11', hoje: '2026-11-10' };

describe('Quando o voo cancelado tem sugestões', () => {
  const base = () => cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] });
  it('o cancelado da data aberta, de hoje em diante', () => {
    const { estado, resultado, voo } = cancelado(base(), 1000, 'Instrutor indisponível');
    const linha = resultado.out.find(o => o.fKey === voo.fKey);
    assert.equal(cancelamentoAproveitavel(estado, linha, DIA), true);
    assert.equal(cancelamentoAproveitavel(estado, linha, { data: '2026-11-09', hoje: '2026-11-10' }), false, 'data passada');
  });
  it('não quando o aluno faltou, quando o voo tem resultado ou quando não está cancelado', () => {
    const ausente = cancelado(base(), 1000, 'Aluno ausente');
    assert.equal(cancelamentoAproveitavel(ausente.estado, ausente.resultado.out[0], DIA), false);
    const comResultado = cancelado(base(), 1000, 'Meteorologia');
    comResultado.estado.resultados = { doDia: [{ voo: comResultado.voo.fKey }] };
    assert.equal(cancelamentoAproveitavel(comResultado.estado, comResultado.resultado.out[0], DIA), false);
    const confirmado = runAllocationEngine(base());
    assert.equal(cancelamentoAproveitavel(base(), confirmado.out[0], DIA), false);
  });
});

describe('O que pode voar no lugar do cancelado', () => {
  it('"Instrutor indisponível": o mesmo horário e avião com outro instrutor; nunca o que faltou, mesmo marcado como vindo', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }), 1000, 'Instrutor indisponível');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    const outro = voo.insId === 1 ? 2 : 1;
    assert.equal(r.opcoes[0].tipo, 'instrutor');
    assert.deepEqual(r.opcoes[0].mudancas, { a: voo.a, b: voo.b, r: voo.r, insId: outro });
    assert.ok(r.opcoes.every(o => o.mudancas.insId !== voo.insId), 'o instrutor que faltou fica de fora');
  });

  it('"Manutenção da aeronave": outro avião no mesmo horário; nunca o que parou', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }), 1000, 'Manutenção da aeronave');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    assert.ok(r.opcoes.length > 0);
    assert.equal(r.opcoes[0].tipo, 'aviao');
    assert.equal(r.opcoes[0].mudancas.a, voo.a);
    assert.ok(r.opcoes.every(o => o.mudancas.r !== voo.r), 'o avião que parou fica de fora');
  });

  it('"Meteorologia" e "Operacional": o horário sai; o mais perto, antes ou depois', () => {
    for (const motivo of ['Meteorologia', 'Operacional']) {
      const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 610, p2: -1 })] }), 1000, motivo);
      const r = sugerirParaCancelado(estado, resultado, voo.fKey);
      assert.ok(r.opcoes.every(o => o.mudancas.a !== voo.a), `${motivo}: nada no mesmo horário`);
      assert.equal(r.opcoes[0].tipo, 'horario');
    }
  });

  it('"Outro": nada sai da busca (o mesmo lugar primeiro)', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }), 1000, 'Outro');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    assert.deepEqual(r.opcoes[0].mudancas, { a: voo.a, b: voo.b, r: voo.r, insId: voo.insId });
  });

  it('hoje, visto às 08:30: o voo das 08:20 não tem nada às 08:20 nem antes, e o resto do dia continua', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 500, p2: -1 })] }), 1000, 'Instrutor indisponível');
    assert.equal(hm(voo.a), '08:20');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey, { depoisDe: 510 });
    assert.ok(r.opcoes.length > 0, 'a tarde continua');
    assert.ok(r.opcoes.every(o => o.mudancas.a > 510), r.opcoes.map(o => o.texto).join(' | '));
  });

  it('fora da disponibilidade do pedido, a sugestão pede a confirmação com o aluno e muda a disponibilidade', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1, jan: 'h390' })] }), 1000, 'Meteorologia');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    assert.ok(r.opcoes[0].confirmar.startsWith('Confirme com o aluno'), textos(r).join(' | '));
    assert.equal(r.opcoes[0].pedido.jan, `h${r.opcoes[0].mudancas.a}`);
  });

  it('outro tipo de recurso que a missão permite vem por último, com a confirmação e o tipo novo no pedido', () => {
    // Só um C152 (em manutenção pelo motivo): o Voo Local voa também no C172
    const base = cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })], semAeronaves: apenas('C152', 'PR-VOB') });
    const { estado, resultado, voo } = cancelado(base, 1000, 'Manutenção da aeronave');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    const tipo = r.opcoes.find(o => o.tipo === 'tipo');
    assert.ok(tipo, textos(r).join(' | '));
    assert.notEqual(tipo.pedido.eq, voo.eqType);
    assert.match(tipo.confirmar, /Confirme com o aluno/);
    assert.equal(r.opcoes.at(-1), tipo);
  });

  it('sem nada: "impossível", com o porquê de cada grupo', () => {
    // Um instrutor só, que faltou
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }), 1000, 'Instrutor indisponível');
    const r = sugerirParaCancelado(estado, resultado, voo.fKey);
    assert.deepEqual(r.opcoes, []);
    assert.equal(r.impossivel.length, 3);
    assert.match(r.impossivel[0], /^No mesmo horário/);
  });
});

describe('Aplicar e desfazer', () => {
  it('o voo fica fixo no lugar novo, volta a Pendente sem o motivo; o pedido recebe o instrutor; desfeito, tudo volta', () => {
    const { estado, resultado, voo } = cancelado(cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1 })] }), 1000, 'Instrutor indisponível');
    const antes = structuredClone({ fixos: estado.fixos, fStatus: estado.fStatus, fObs: estado.fObs, stu: estado.stu });
    const [opcao] = sugerirParaCancelado(estado, resultado, voo.fKey).opcoes;
    const rev = aproveitarCancelado(estado, resultado, voo.fKey, opcao);
    assert.equal(rev.kind, 'aproveitarCancelado');
    assert.equal(estado.fStatus[voo.fKey], 'Pendente');
    assert.equal(estado.fObs[voo.fKey], undefined);
    assert.deepEqual(estado.fixos[voo.fKey], { ...opcao.mudancas, agendado: true });
    assert.equal(estado.stu[0].insId, opcao.mudancas.insId);
    // O motor deixa o voo no lugar, sem conflito
    const depois = runAllocationEngine(estado);
    const linha = depois.out.find(o => o.fKey === voo.fKey);
    assert.deepEqual([linha.a, linha.r, linha.insId, linha.conflito], [opcao.mudancas.a, opcao.mudancas.r, opcao.mudancas.insId, undefined]);
    desfazerAproveitamento(estado, rev);
    assert.deepEqual({ fixos: estado.fixos, fStatus: estado.fStatus, fObs: estado.fObs, stu: estado.stu }, antes);
  });
});

// O pedido recusado porque o instrutor escolhido não serve (js/reparo.js, sugestoesDoRejeitado): outro instrutor, ou
// "Automático", que encaixa o pedido sem tirar nem mudar nenhum outro voo
describe('O pedido recusado pelo instrutor escolhido', () => {
  it('o escolhido fora do dia: outro instrutor e "Automático", cada um dizendo onde o voo entra', () => {
    const estado = cenario({ ins: [instrutor(1, 9, { on: false }), instrutor(2, 9)], stu: [aluno(1000, { p1: 390, p2: -1, insId: 1 })] });
    const resultado = runAllocationEngine(estado);
    const fKey = [...rejeicoesDosPedidos(estado, resultado).keys()][0];
    assert.equal(rejeicoesDosPedidos(estado, resultado).get(fKey).codigo, 'instrutor-escolhido');
    const opcoes = sugestoesDoRejeitado(estado, resultado, fKey);
    assert.deepEqual(opcoes.map(o => o.insId), [2, 0]);
    assert.match(opcoes[0].texto, /^Com Instrutor 02: \d\d:\d\d no /);
    assert.match(opcoes[1].texto, /^Automático \(o app escolhe Instrutor 02\)/);
  });

  it('em 80 sementes com escolhas: cada sugestão aplicada faz o pedido entrar sem mudar nenhum outro voo', () => {
    let vistas = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const estado = comEscolhas(gerarCenario(seed), seed);
      const resultado = runAllocationEngine(estado);
      for (const [fKey, err] of rejeicoesDosPedidos(estado, resultado)) {
        if (err.codigo !== 'instrutor-escolhido') continue;
        for (const opcao of sugestoesDoRejeitado(estado, resultado, fKey)) {
          vistas++;
          const copia = { ...estado, stu: structuredClone(estado.stu) };
          const [stuId, mid] = fKey.split('_').map(Number);
          const ref = pedidoDoAluno(copia.stu.find(s => s.id === stuId), mid);
          if (opcao.insId) ref.insId = opcao.insId; else delete ref.insId;
          const depois = runAllocationEngine(copia);
          assert.ok(depois.out.some(o => o.fKey === fKey), `seed ${seed}: ${fKey} entra`);
          const lugar = o => [o.fKey, o.a, o.b, o.r, o.insId].join('|');
          assert.deepEqual(depois.out.filter(o => o.fKey !== fKey).map(lugar), resultado.out.map(lugar), `seed ${seed}: ${opcao.texto}`);
        }
      }
    }
    assert.ok(vistas > 0, 'nenhuma sugestão nas sementes');
  });
});

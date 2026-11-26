// A alteração de um voo feita na Escala (js/edicao-do-voo.js, F1g): na escala aprovada o motor não roda, só aquele voo
// muda e a escala da tela é conferida de novo; fora dela, o motor refaz a escala
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAllocationEngine } from '../../js/engine.js';
import { escalaDaAlteracao } from '../../js/edicao-do-voo.js';
import { conferirEscala } from '../../js/conferencia.js';
import { fixarNoLugar, fixosAoAprovar } from '../../js/fixos.js';
import { rejeicoesDosPedidos } from '../../js/rejeicoes.js';
import { normalizarEscalaGravada } from '../../js/escala-gravada.js';
import { validarReversao, desfazerEdicao } from '../../js/reversoes.js';
import { pedidoDoAluno } from '../../js/voo.js';
import { CAMPOS_DO_PEDIDO } from '../../js/dias.js';
import { diaComPinos, SEMENTES_DOS_PINOS } from '../helpers/pinos.js';
import { aluno, cenario, instrutor } from '../helpers/montar.js';

const lugar = o => `${o.fKey} ${o.stuId} ${o.mis} ${o.a}-${o.b} ${o.r} ${o.insId}`;
const espiao = () => { const chamadas = []; const motor = estado => { chamadas.push(estado); return runAllocationEngine(estado); }; return { motor, chamadas }; };
const pedidoDe = (estado, fKey) => { const [stuId, mid] = fKey.split('_').map(Number); return pedidoDoAluno(estado.stu.find(s => s.id === stuId), mid); };
const recusasEmTexto = (estado, resultado) => [...rejeicoesDosPedidos(estado, resultado)].map(([k, a]) => `${k}: ${a.m}`).sort();

describe('Sem o motor na escala aprovada', () => {
  it('na escala aprovada o motor não roda; fora dela, roda uma vez', () => {
    const estado = diaComPinos(4, 'aprovada');
    const resultado = runAllocationEngine(estado);
    const travada = espiao();
    const conferida = escalaDaAlteracao(estado, resultado, { aprovada: true, motor: travada.motor });
    assert.equal(travada.chamadas.length, 0);
    assert.equal(conferida.motor, false);
    const aberta = espiao();
    assert.equal(escalaDaAlteracao(estado, resultado, { aprovada: false, motor: aberta.motor }).motor, true);
    assert.equal(aberta.chamadas.length, 1);
  });

  it('um "✕" feito antes da aprovação, revertido depois dela: o pedido entra no dia, pelo motor em volta dos fixos', () => {
    const estado = cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, { p1: 390 }), aluno(1001, { p1: 500 })] });
    estado.stu[1].fly = false;
    const antes = runAllocationEngine(estado);
    const aprovado = { ...structuredClone(estado), fixos: fixosAoAprovar({}, antes.out), aprovacao: { em: '2026-11-26T10:00:00Z', por: 'Operador' } };
    const revertido = structuredClone(aprovado);
    revertido.stu[1].fly = true;
    const { motor, chamadas } = espiao();
    const { resultado, motor: rodou } = escalaDaAlteracao(revertido, antes, { aprovada: true, antes: aprovado, motor });
    assert.equal(rodou, true);
    assert.equal(chamadas.length, 1);
    assert.ok(resultado.out.some(o => o.stuId === 1001));
    assert.ok(resultado.out.some(o => o.stuId === 1000 && o.fixo));
  });

  it('o voo sem pino de uma data aprovada, "✕" e "↶ Restaurar": a mesma linha, e as recusas iguais', () => {
    let vistos = 0;
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 80)) {
      const estado = diaComPinos(seed, 'aprovada');
      const resultado = runAllocationEngine(estado);
      const solto = resultado.out.find(o => !o.fixo && !o.trecho);
      if (!solto) continue;
      vistos++;
      const tirado = structuredClone(estado);
      tirado.fixos = fixarNoLugar(tirado.fixos, resultado, [solto.fKey]);
      pedidoDe(tirado, solto.fKey).fly = false;
      const semEle = conferirEscala(tirado, resultado, { antes: estado });
      assert.ok(!semEle.out.some(o => o.fKey === solto.fKey), `${seed}: continua`);
      const devolvido = structuredClone(tirado);
      pedidoDe(devolvido, solto.fKey).fly = true;
      const deVolta = conferirEscala(devolvido, semEle, { antes: tirado });
      assert.equal(lugar(deVolta.out.find(o => o.fKey === solto.fKey)), lugar(solto), `${seed}: outra linha`);
      assert.deepEqual(recusasEmTexto(devolvido, deVolta), recusasEmTexto(estado, resultado), `${seed}: recusas`);
    }
    assert.ok(vistos > 40, `só ${vistos} dias com voo sem pino`);
  });

  it('a recusa tirada por uma alteração (o pedido recusado encaixado) volta no lugar dela ao desfazer', () => {
    let vistos = 0;
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 120)) {
      const estado = diaComPinos(seed, 'aprovada');
      const resultado = runAllocationEngine(estado);
      const recusas = rejeicoesDosPedidos(estado, resultado);
      if (recusas.size < 2) continue;
      vistos++;
      // A recusa do meio sai: o pedido fica fixo num lugar qualquer (agendado), como a sugestão o grava
      const [fKey, recusa] = [...recusas][Math.floor(recusas.size / 2)];
      const pedido = pedidoDe(estado, fKey);
      const rev = validarReversao({
        kind: 'desfazerEdicao', voos: [{ fKey, fixo: null, status: null, detalhe: null }],
        pedidos: [{ stuId: +fKey.split('_')[0], mid: +fKey.split('_')[1], pedido: Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => pedido[c] !== undefined).map(c => [c, pedido[c]])) }],
        recusas: [{ fKey, s: recusa.s, m: recusa.m, codigo: recusa.codigo }]
      }, estado.frota);
      assert.ok(rev, `${seed}: reversão inválida`);
      const encaixado = structuredClone(estado);
      encaixado.fixos = { ...encaixado.fixos, [fKey]: { a: 1000, b: 1060, r: pedido.mis.startsWith('Ground') ? 'SALA-GROUND' : 'PR-AAA', insId: encaixado.ins[0].id, agendado: true } };
      const comEle = conferirEscala(encaixado, resultado, { antes: estado });
      assert.ok(!rejeicoesDosPedidos(encaixado, comEle).has(fKey), `${seed}: a recusa continua`);
      const desfeito = structuredClone(encaixado);
      desfazerEdicao(desfeito, rev);
      const deVolta = conferirEscala(desfeito, comEle, { antes: encaixado, recusas: rev.recusas.map(({ fKey: k, ...r }) => [k, { t: 'err', ...r }]) });
      assert.deepEqual(deVolta.al.filter(a => a.t === 'err'), resultado.al.filter(a => a.t === 'err'), `${seed}: recusas noutra ordem`);
      assert.deepEqual(recusasEmTexto(desfeito, deVolta), recusasEmTexto(estado, resultado), `${seed}: recusas`);
    }
    assert.ok(vistos > 30, `só ${vistos} dias com recusas`);
  });

  it('a escala conferida passa pela escala gravada (normalizarEscalaGravada) sem mudar, quando a do motor passa', () => {
    let vistos = 0;
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 60)) {
      for (const tipo of ['aprovada', 'misto']) {
        const estado = diaComPinos(seed, tipo);
        const motor = { ...runAllocationEngine(estado), data: '2026-11-26' };
        // Os dias de teste têm missões que o app não tem (a escala do motor também não passa): ficam de fora
        if (!normalizarEscalaGravada(JSON.parse(JSON.stringify(motor)))) continue;
        vistos++;
        const conferida = conferirEscala(estado, motor);
        const gravada = normalizarEscalaGravada(JSON.parse(JSON.stringify(conferida)));
        assert.ok(gravada, `${seed} ${tipo}: recusada`);
        assert.deepEqual(gravada, JSON.parse(JSON.stringify(conferida)));
      }
    }
    assert.ok(vistos > 50, `só ${vistos} dias`);
  });
});

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

// O editor do voo: cada campo e o que ele grava
describe('O editor do voo: cada campo e o que ele grava', async () => {
  const { vooParaEditar, opcoesDoVoo, aplicarEdicao, avisosDaEdicao, resumoDaEdicao, missaoParaOAluno } = await import('../../js/edicao-do-voo.js');
  const { novoCurso } = await import('../../js/programa.js');
  const { MODELOS } = await import('../../js/modelos-de-curso.js');
  const gerarId = (sigla, codigo) => `${sigla}:${codigo}`;
  const curso = (sigla, modelo) => novoCurso([], { sigla, nome: sigla, modelo: MODELOS[modelo] }, gerarId).curso;
  // Dois cursos com o mesmo modelo: a missão IN-01 do PP não é a IN-01 do PC
  const programa = [curso('PP', 'pp-acpm'), curso('PC', 'pp-acpm')];
  const aprovar = estado => {
    const r = runAllocationEngine(estado);
    return { estado: { ...estado, fixos: fixosAoAprovar({}, r.out), aprovacao: { em: '2026-11-26T10:00:00Z', por: 'Operador' } }, resultado: r };
  };
  const base = () => cenario({
    ins: [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)],
    stu: [aluno(1000, { p1: 390 }), aluno(1001, { p1: 500 }), aluno(1002, { p1: 610, fly: false }, { curso: 'PP' })]
  });
  const editar = (estado, resultado, fKey, mudar) => {
    const voo = vooParaEditar(estado, resultado, fKey);
    const valores = { ...structuredClone(voo.valores), ...mudar(voo.valores) };
    const copia = structuredClone(estado);
    const feito = aplicarEdicao(copia, resultado, voo, valores);
    return { voo, valores, copia, feito, conferida: conferirEscala(copia, resultado, { antes: estado }) };
  };

  it('o horário: o pino agendado no horário novo, p1, e o minuto exato da disponibilidade vira o novo (não sai)', () => {
    const inicial = base();
    inicial.stu[0].jan = 'h390';
    const { estado, resultado } = aprovar(inicial);
    const { copia, conferida, feito } = editar(estado, resultado, '1000_0_1', () => ({ a: 690 }));
    assert.deepEqual(copia.fixos['1000_0_1'], { ...copia.fixos['1000_0_1'], a: 690, b: 750, agendado: true });
    assert.equal(copia.stu[0].p1, 690);
    assert.equal(copia.stu[0].jan, 'h690');
    assert.equal(feito.janSaiu, false);
    assert.equal(conferida.out.find(o => o.fKey === '1000_0_1').a, 690);
    assert.equal(feito.rev.kind, 'desfazerEdicao');
    assert.ok(validarReversao({ ...feito.rev, label: '↶ Reverter' }, []));
  });

  it('a disponibilidade mais larga que não inclui o horário novo sai do pedido, com o aviso', () => {
    const inicial = base();
    inicial.stu[0].jan = 'manha';
    const { estado, resultado } = aprovar(inicial);
    const voo = vooParaEditar(estado, resultado, '1000_0_1');
    const valores = { ...structuredClone(voo.valores), a: 870 };
    const avisos = avisosDaEdicao(estado, resultado, voo, valores);
    assert.ok(avisos.some(a => a.codigo === 'disponibilidade-do-aluno'), JSON.stringify(avisos));
    const copia = structuredClone(estado);
    aplicarEdicao(copia, resultado, voo, valores);
    assert.equal(copia.stu[0].jan, undefined);
  });

  it('o recurso de outro tipo muda o tipo do pedido; a duração muda as horas e o fim do pino', () => {
    const { estado, resultado } = aprovar(base());
    const { copia } = editar(estado, resultado, '1001_0_1', () => ({ r: 'PP-ABP', minutos: 90 }));
    assert.equal(copia.stu[1].eq, 'C172');
    assert.equal(copia.stu[1].nb, 1.5);
    assert.equal(copia.fixos['1001_0_1'].r, 'PP-ABP');
    assert.equal(copia.fixos['1001_0_1'].b - copia.fixos['1001_0_1'].a, 90);
  });

  it('só o instrutor: o pino escolhido (como na Lista) e o pedido com a escolha; "Automático" tira a escolha', () => {
    const { estado, resultado } = aprovar(base());
    const outro = resultado.out.find(o => o.fKey === '1000_0_1').insId === 1 ? 2 : 1;
    const { copia } = editar(estado, resultado, '1000_0_1', () => ({ insId: outro }));
    assert.equal(copia.fixos['1000_0_1'].insId, outro);
    assert.equal(copia.fixos['1000_0_1'].escolhido, true);
    assert.equal(copia.fixos['1000_0_1'].agendado, undefined);
    assert.equal(copia.stu[0].insId, outro);
    const r2 = conferirEscala(copia, resultado, { antes: estado });
    const de2 = editar(copia, r2, '1000_0_1', () => ({ insId: 0 }));
    assert.equal(de2.copia.stu[0].insId, undefined);
    assert.equal(de2.conferida.out.find(o => o.fKey === '1000_0_1').insId, outro, 'o voo fica com o instrutor, no lugar');
  });

  it('o aluno: a chave muda, o pedido de antes deixa de voar, o novo recebe tipo, horas, horário e instrutor, e não a disponibilidade, a 2ª preferência ou a prioridade', () => {
    const inicial = base();
    Object.assign(inicial.stu[0], { jan: 'h390', p2: 500, pr: 5, solicitacao: 77, insId: 1 });
    const { estado, resultado } = aprovar(inicial);
    const { copia, feito, conferida } = editar(estado, resultado, '1000_0_1', () => ({ stuId: 1002 }));
    assert.deepEqual(feito.chaves, ['1002_0_1']);
    assert.equal(copia.stu[0].fly, false);
    const novo = copia.stu[2];
    assert.equal(novo.fly, true);
    assert.equal(novo.p1, resultado.out.find(o => o.fKey === '1000_0_1').a);
    assert.equal(novo.jan, undefined);
    assert.equal(novo.p2, -1);
    assert.equal(novo.solicitacao, undefined);
    assert.equal(novo.pr, 3);
    assert.ok(copia.fixos['1002_0_1'].agendado);
    assert.equal(copia.fixos['1000_0_1'], undefined);
    assert.ok(conferida.out.some(o => o.fKey === '1002_0_1') && !conferida.out.some(o => o.fKey === '1000_0_1'));
    // Desfazer: o pedido de antes volta a voar, e o novo, como estava
    const rev = validarReversao({ ...feito.rev, label: '↶ Reverter' }, []);
    desfazerEdicao(copia, rev);
    assert.equal(copia.stu[0].fly, true);
    assert.equal(copia.stu[2].fly, false);
    assert.ok(copia.fixos['1000_0_1']);
    assert.equal(copia.fixos['1002_0_1'], undefined);
  });

  it('o aluno de outro curso: a missão do curso que ele não tem não fica (sem etapa), e fica para escolher; sem curso, o tipo sem a etapa', () => {
    const inicial = base();
    const pp = programa[0].missoes.find(m => m.codigo === 'IN-01');
    Object.assign(inicial.stu[2], { fly: true, curso: 'PP', etapa: 'IN-01', cursoDaEtapa: 'PP', mis: pp.mis, eq: pp.eq });
    const { estado, resultado } = aprovar(inicial);
    const voo = vooParaEditar(estado, resultado, '1002_0_1');
    assert.equal(voo.valores.missao.etapa, 'IN-01');
    // Para um aluno de outro curso (o PC): a missão do PP não fica
    estado.stu[0].curso = 'PC';
    assert.equal(missaoParaOAluno(estado, voo, 1000, voo.valores.missao, programa), null);
    // Sem curso: o tipo, sem a etapa
    estado.stu[1].curso = undefined;
    assert.deepEqual(missaoParaOAluno(estado, voo, 1001, voo.valores.missao, programa), { mis: 'Voo Local', eq: 'C152', nb: 1 });
    estado.stu[0].curso = undefined;
    const valores = { ...structuredClone(voo.valores), stuId: 1000, missao: missaoParaOAluno(estado, voo, 1000, voo.valores.missao, programa) };
    const copia = structuredClone(estado);
    aplicarEdicao(copia, resultado, voo, valores);
    const recebeu = copia.stu[0].extra.at(-1) || copia.stu[0];
    assert.equal(recebeu.etapa, undefined);
    assert.equal(recebeu.cursoDaEtapa, undefined);
  });

  it('o instrutor em "Não escalar com" do aluno novo, o avião ocupado e o peso: avisos de conflito, nada desligado', () => {
    const inicial = base();
    const { estado, resultado } = aprovar(inicial);
    const voo = vooParaEditar(estado, resultado, '1001_0_1');
    const outro = resultado.out.find(o => o.fKey === '1000_0_1');
    estado.stu[1].bl = [outro.insId];
    const valores = { ...structuredClone(voo.valores), a: outro.a, r: outro.r, insId: outro.insId };
    const avisos = avisosDaEdicao(estado, resultado, voo, valores);
    const codigos = avisos.filter(a => a.conflito).map(a => a.codigo);
    assert.ok(codigos.includes('aviao-ocupado') && codigos.includes('bloqueio') && codigos.includes('instrutor-ocupado'), JSON.stringify(codigos));
    const opcoes = opcoesDoVoo(estado, resultado, voo, valores, { programa });
    assert.ok(opcoes.instrutores.every(g => g.opcoes.every(o => !o.desligada)));
    assert.ok(opcoes.recursos.every(o => !o.desligada));
  });

  it('a turma de Ground muda inteira: o horário e o instrutor de cada aluno', () => {
    const g = { mis: 'Ground C152', eq: 'Sala Ground', nb: 1.5, p1: 390 };
    const { estado, resultado } = aprovar(cenario({ ins: [instrutor(1, 9), instrutor(2, 9)], stu: [aluno(1000, g), aluno(1001, g), aluno(1002, { p1: 870 })] }));
    const turma = resultado.out.find(o => o.isGround);
    const voo = vooParaEditar(estado, resultado, turma.classKey);
    assert.equal(voo.unidade.length, 2);
    const copia = structuredClone(estado);
    aplicarEdicao(copia, resultado, voo, { ...structuredClone(voo.valores), a: 610 });
    for (const o of voo.unidade) assert.equal(copia.fixos[o.fKey].a, 610);
    const conferida = conferirEscala(copia, resultado, { antes: estado });
    assert.deepEqual(conferida.out.filter(o => o.isGround).map(o => [o.a, o.groupSize]), [[610, 2], [610, 2]]);
  });

  it('o status (como na Lista) e o resumo para a pergunta', () => {
    const { estado, resultado } = aprovar(base());
    const voo = vooParaEditar(estado, resultado, '1000_0_1');
    const valores = { ...structuredClone(voo.valores), a: 500, status: { '1000_0_1': 'Atrasado' }, detalhe: { '1000_0_1': { novoInicio: 520 } } };
    assert.equal(resumoDaEdicao(estado, voo, valores), `Aluno 1000: ${['06:30', '08:20'].join(' → ')}, Confirmado → Atrasado`);
    const copia = structuredClone(estado);
    aplicarEdicao(copia, resultado, voo, valores);
    assert.equal(copia.fStatus['1000_0_1'], 'Atrasado');
    assert.deepEqual(copia.fObs['1000_0_1'], { novoInicio: 520 });
  });

  it('a volta do noturno de ontem: só o status; o voo com resultado: o aluno e a missão travados', () => {
    const estado = { ...base(), noturnosDaVespera: [{ stuId: 1000, mid: 0, insId: 1, r: 'PP-ABP', eqType: 'C172', s: 'Aluno 1000', ins: 'Instrutor 01', stuKg: 70, fim: 1290 }] };
    const resultado = runAllocationEngine(estado);
    const volta = vooParaEditar(estado, resultado, '1000_0_2');
    assert.ok(volta.travas.tudo);
    const comResultado = vooParaEditar(estado, resultado, '1001_0_1', { resultados: { doDia: [{ voo: '1001_0_1' }] } });
    assert.ok(comResultado.travas.aluno && comResultado.travas.missao);
  });

  // A propriedade: depois de qualquer alteração sem o motor, os outros voos ficam onde estavam e o motor deixa os fixos no
  // lugar; um peso mudado não move nenhum voo, e nenhum fica com o peso de antes
  it('em 100 dias aprovados, depois de editar um voo, os outros ficam onde estavam e o motor deixa os fixos no lugar', () => {
    const falhas = [];
    let editados = 0;
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 100)) {
      const estado = diaComPinos(seed, 'aprovada');
      const resultado = runAllocationEngine(estado);
      const voos = resultado.out.filter(o => !o.trecho && !o.isGround);
      if (!voos.length) continue;
      const o = voos[seed % voos.length];
      const voo = vooParaEditar(estado, resultado, o.fKey);
      const valores = { ...structuredClone(voo.valores), a: [390, 500, 610, 690, 760, 870][seed % 6], insId: estado.ins[seed % estado.ins.length].id };
      const copia = structuredClone(estado);
      const feito = aplicarEdicao(copia, resultado, voo, valores);
      if (!feito) continue;
      editados++;
      const conferida = conferirEscala(copia, resultado, { antes: estado });
      const depois = new Map(conferida.out.map(v => [v.fKey, v]));
      for (const v of resultado.out.filter(x => x.fKey !== o.fKey)) {
        if (!depois.has(v.fKey) || lugar(depois.get(v.fKey)) !== lugar(v)) falhas.push(`${seed}: ${v.fKey}`);
      }
      const refeita = runAllocationEngine(copia);
      for (const v of refeita.out.filter(x => x.fixo && !x.trecho)) if (lugar(v) !== lugar(depois.get(v.fKey) || {})) falhas.push(`${seed}: fixo ${v.fKey}`);
    }
    assert.deepEqual(falhas.slice(0, 5), []);
    assert.ok(editados > 80, `só ${editados}`);
  });

  it('um peso mudado no cadastro: nenhum voo muda de lugar, e nenhum fica com o peso de antes', () => {
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 50)) {
      const estado = diaComPinos(seed, 'aprovada');
      const resultado = runAllocationEngine(estado);
      const copia = structuredClone(estado);
      copia.stu.forEach((s, i) => { s.kg = 50 + ((i * 7 + seed) % 50); });
      copia.ins.forEach((x, i) => { x.kg = 60 + ((i * 11 + seed) % 40); });
      const conferida = conferirEscala(copia, resultado, { antes: estado });
      assert.deepEqual(conferida.out.map(lugar).sort(), resultado.out.map(lugar).sort(), `${seed}: lugares`);
      for (const v of conferida.out.filter(x => !x.trecho)) {
        assert.equal(v.stuKg, copia.stu.find(s => s.id === v.stuId).kg, `${seed}: ${v.fKey} aluno`);
        assert.equal(v.insKg, (copia.ins.find(x => x.id === v.insId) || {}).kg || 0, `${seed}: ${v.fKey} instrutor`);
      }
    }
  });
});

// A disponibilidade de um INVA numa data (C, commit "dados", formato 29): as faixas e as pausas no lugar dos nove tempos
// de antes (aw), com a regra de antes do C (o compromisso inteiro dentro de uma faixa). O aw continua sendo lido onde não
// há faixas (os dias antes do 29, os goldens), e as faixas que o passo 29 tira do aw dão a mesma leitura dele.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { disponivelPara, faixasDoAw, awComoOAppLia, normalizarFaixas, normalizarPausas, refazerFaixasDoAw, INICIO_DAS_FAIXAS } from '../../js/disponibilidade.js';
import { INICIOS_DOS_TEMPOS as T } from '../../js/horarios.js';

const fim = k => (k < T.length - 1 ? T[k + 1] : 1440);
const padrao = p => T.map((_, i) => Boolean(p & (1 << i)));
const todos = () => T.map(() => true);

// A leitura de antes do C, escrita aqui como era (o cobre de js/viabilidade.js, que sai): o instrutor vem e está marcado em
// cada tempo que o compromisso toca
const leituraDeAntes = (x, a, b) => Boolean(x.on) && T.every((inicio, k) => !(a < fim(k) && b > inicio) || x.aw[k]);

// Os inícios e as durações conferidos: de 5 em 5 minutos das 06:00 à meia-noite, mais os minutos de cada borda (antes,
// no início e depois de cada tempo, a meia-noite e além), com as durações das missões e as bordas entre si
const BORDAS = [0, 300, 389, 390, 391, ...T.flatMap(t => [t - 1, t, t + 1]), 1439, 1440, 1500];
const INTERVALOS = [
  ...Array.from({ length: 217 }, (_, i) => 360 + 5 * i).flatMap(a => [1, 30, 60, 90, 110, 120, 150, 240, 300, 600].map(d => [a, a + d])),
  ...BORDAS.flatMap(a => BORDAS.filter(b => b > a).map(b => [a, b]))
];

describe('faixasDoAw: os nove tempos de antes em faixas e pausas', () => {
  test('o dia todo: uma faixa, das 06:30 à meia-noite, sem pausa', () => {
    assert.deepEqual(faixasDoAw(todos()), { faixas: [{ de: 390, ate: 1440 }], pausas: [] });
  });

  test('o almoço (o 5º tempo desmarcado): duas faixas e a pausa entre elas', () => {
    const aw = todos();
    aw[4] = false;
    assert.deepEqual(faixasDoAw(aw), { faixas: [{ de: 390, ate: T[4] }, { de: T[5], ate: 1440 }], pausas: [{ de: T[4], ate: T[5] }] });
  });

  test('tempos marcados seguidos viram uma faixa; o que fica antes da 1ª e depois da última não é pausa', () => {
    const aw = T.map((_, i) => [1, 2, 5, 6].includes(i));
    assert.deepEqual(faixasDoAw(aw), { faixas: [{ de: T[1], ate: T[3] }, { de: T[5], ate: T[7] }], pausas: [{ de: T[3], ate: T[5] }] });
  });

  test('nenhum tempo marcado: nenhuma faixa (o INVA não voa na data)', () => {
    assert.deepEqual(faixasDoAw(T.map(() => false)), { faixas: [], pausas: [] });
  });

  test('o que sai já está normalizado, nos 512 padrões', () => {
    for (let p = 0; p < 512; p++) {
      const { faixas, pausas } = faixasDoAw(padrao(p));
      assert.deepEqual([normalizarFaixas(faixas), normalizarPausas(pausas)], [faixas, pausas], `padrão ${p}`);
    }
  });
});

describe('awComoOAppLia: o aw gravado como a data aberta o lia', () => {
  test('nove posições: só true marca (null, 0, "sim" não)', () => {
    assert.deepEqual(awComoOAppLia([true, null, 0, 'sim', true, true, true, true, false]), [true, false, false, false, true, true, true, true, false]);
  });

  test('outro tamanho, ou sem aw: o dia todo', () => {
    assert.deepEqual(awComoOAppLia([true, false]), todos());
    assert.deepEqual(awComoOAppLia(undefined), todos());
    assert.deepEqual(awComoOAppLia('manha'), todos());
  });
});

describe('disponivelPara: a regra de antes do C sobre as faixas', () => {
  test('512 padrões: as faixas e as pausas do aw dão a leitura de antes em todo intervalo conferido (nenhuma diferença)', () => {
    let diferencas = 0, conferidos = 0;
    const exemplos = [];
    for (let p = 0; p < 512; p++) {
      const aw = padrao(p);
      const peloAw = { on: true, aw };
      const pelasFaixas = { on: true, aw: T.map(() => false), ...faixasDoAw(aw) };
      for (const [a, b] of INTERVALOS) {
        conferidos++;
        const antes = leituraDeAntes(peloAw, a, b);
        if (disponivelPara(peloAw, a, b) !== antes || disponivelPara(pelasFaixas, a, b) !== antes) {
          diferencas++;
          if (exemplos.length < 5) exemplos.push(`padrão ${p}, ${a}–${b}`);
        }
      }
    }
    assert.ok(conferidos > 1_000_000, `${conferidos} conferidos`);
    assert.equal(diferencas, 0, exemplos.join('; '));
  });

  test('quem não vem não está disponível, com faixas ou sem elas', () => {
    assert.equal(disponivelPara({ on: false, aw: todos() }, 500, 560), false);
    assert.equal(disponivelPara({ on: false, faixas: [{ de: 390, ate: 1440 }], pausas: [] }, 500, 560), false);
    assert.equal(disponivelPara(undefined, 500, 560), false);
  });

  test('com faixas, o aw não é lido; sem elas, é', () => {
    const nenhum = T.map(() => false);
    assert.equal(disponivelPara({ on: true, aw: nenhum, faixas: [{ de: 390, ate: 1440 }], pausas: [] }, 500, 560), true);
    assert.equal(disponivelPara({ on: true, aw: todos(), faixas: [], pausas: [] }, 500, 560), false, 'a lista vazia: não voa na data');
    assert.equal(disponivelPara({ on: true, aw: nenhum }, 500, 560), false);
  });

  test('o compromisso inteiro dentro de uma faixa: começar dentro e terminar depois não serve (a regra do início é o "regra")', () => {
    const x = { on: true, faixas: [{ de: 390, ate: 760 }, { de: 820, ate: 1440 }], pausas: [{ de: 760, ate: 820 }] };
    assert.equal(disponivelPara(x, 610, 760), true, 'termina no fim da faixa');
    assert.equal(disponivelPara(x, 700, 770), false, 'passa do fim da faixa');
    assert.equal(disponivelPara(x, 820, 900), true);
    assert.equal(disponivelPara(x, 815, 900), false, 'começa antes da faixa');
  });

  test('uma pausa dentro de uma faixa também impede (o INVA não voa nela)', () => {
    const x = { on: true, faixas: [{ de: 390, ate: 1050 }], pausas: [{ de: 720, ate: 780 }] };
    assert.equal(disponivelPara(x, 600, 720), true, 'encosta no início da pausa');
    assert.equal(disponivelPara(x, 700, 760), false);
    assert.equal(disponivelPara(x, 780, 840), true, 'encosta no fim da pausa');
  });

  test('antes das 06:30 nada pede faixa, como nenhum tempo de antes cobria; o que passa da meia-noite também não', () => {
    const x = { on: true, faixas: [{ de: 500, ate: 610 }], pausas: [] };
    assert.equal(disponivelPara(x, 300, 389), true);
    assert.equal(disponivelPara(x, 300, 450), false, 'o que passa das 06:30 pede a faixa');
    assert.equal(disponivelPara({ on: true, faixas: [{ de: 1050, ate: 1440 }], pausas: [] }, 1400, 1500), true);
    assert.equal(INICIO_DAS_FAIXAS, 390);
  });

  test('sem pausas (um estado que não as tem): só as faixas', () => {
    assert.equal(disponivelPara({ on: true, faixas: [{ de: 390, ate: 1440 }] }, 500, 560), true);
  });
});

describe('normalizarFaixas e normalizarPausas', () => {
  test('só { de, ate } inteiros, 06:30 ≤ de < ate ≤ 24:00; o resto do objeto sai', () => {
    const lista = [{ de: 500, ate: 610, x: 1 }, { de: 389, ate: 500 }, { de: 600, ate: 1441 }, { de: 700, ate: 700 }, { de: 800, ate: 700 },
      { de: '900', ate: 1000 }, { de: 900.5, ate: 1000 }, null, 7, { de: 1050, ate: 1440 }];
    assert.deepEqual(normalizarFaixas(lista), [{ de: 500, ate: 610 }, { de: 1050, ate: 1440 }]);
    assert.deepEqual(normalizarPausas(lista), [{ de: 500, ate: 610 }, { de: 1050, ate: 1440 }]);
  });

  test('em ordem; as que se cruzam ou se tocam viram uma', () => {
    assert.deepEqual(normalizarFaixas([{ de: 900, ate: 1000 }, { de: 390, ate: 500 }, { de: 500, ate: 610 }, { de: 950, ate: 1100 }]),
      [{ de: 390, ate: 610 }, { de: 900, ate: 1100 }]);
  });

  test('no máximo 8 de cada; o que não é lista, nenhuma', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => ({ de: 400 + 60 * i, ate: 430 + 60 * i }));
    assert.equal(normalizarFaixas(muitas).length, 8);
    assert.equal(normalizarPausas(muitas).length, 8);
    assert.deepEqual(normalizarFaixas(undefined), []);
    assert.deepEqual(normalizarPausas({ de: 400, ate: 500 }), []);
  });
});

describe('refazerFaixasDoAw: até a tela do C, quem muda o aw', () => {
  test('o instrutor com faixas fica com as do aw novo', () => {
    const aw = todos();
    aw[2] = false;
    const x = refazerFaixasDoAw({ id: 1, on: true, aw, faixas: [{ de: 390, ate: 1440 }], pausas: [] });
    assert.deepEqual([x.faixas, x.pausas], [[{ de: 390, ate: T[2] }, { de: T[3], ate: 1440 }], [{ de: T[2], ate: T[3] }]]);
  });

  test('o que não tem faixas continua sem elas (lido pelo aw)', () => {
    const x = { id: 1, on: true, aw: todos() };
    assert.deepEqual(refazerFaixasDoAw(x), { id: 1, on: true, aw: todos() });
  });
});

// Os goldens e a fixture dos pinos guardam o aw: com as faixas dele no lugar (e o aw todo desmarcado, para provar que não
// é lido), o motor dá a mesma escala
describe('O motor com as faixas no lugar do aw', () => {
  const comFaixas = estado => ({ ...estado, ins: estado.ins.map(x => ({ ...x, ...faixasDoAw(awComoOAppLia(x.aw)), aw: T.map(() => false) })) });

  test('os 40 cenários e o exemplo dão os goldens', async () => {
    const { runAllocationEngine } = await import('../../js/engine.js');
    const { gerarCenario } = await import('../helpers/cenarios.js');
    const { lerGoldens } = await import('../helpers/goldens.js');
    const goldens = lerGoldens();
    assert.deepEqual(JSON.parse(JSON.stringify(runAllocationEngine(comFaixas(goldens.exemplo.estado)))), goldens.exemplo.saida);
    for (const { seed, saida } of goldens.cenarios) assert.deepEqual(JSON.parse(JSON.stringify(runAllocationEngine(comFaixas(gerarCenario(seed))))), saida, `cenário ${seed}`);
  });

  test('os dias com voos fixos (60 sementes × 5 tipos) dão a mesma saída', async () => {
    const { runAllocationEngine } = await import('../../js/engine.js');
    const { TIPOS_DE_PINO, SEMENTES_DOS_PINOS, diaComPinos, impressaoDaSaida } = await import('../helpers/pinos.js');
    const diferentes = [];
    for (const seed of SEMENTES_DOS_PINOS.slice(0, 60)) {
      for (const tipo of TIPOS_DE_PINO) {
        const estado = diaComPinos(seed, tipo);
        if (impressaoDaSaida(runAllocationEngine(comFaixas(estado))) !== impressaoDaSaida(runAllocationEngine(estado))) diferentes.push(`${seed} ${tipo}`);
      }
    }
    assert.deepEqual(diferentes, []);
  });
});

// A disponibilidade de um INVA numa data (C, commit "dados", formato 29): as faixas e as pausas no lugar dos nove tempos
// de antes (aw), com a regra de antes do C (o compromisso inteiro dentro de uma faixa). O aw continua sendo lido onde não
// há faixas (os dias antes do 29, os goldens), e as faixas que o passo 29 tira do aw dão a mesma leitura dele. O commit
// "tela": os três turnos, o que a tela mostra (o texto e a tira da linha), a conferência de "Editar faixas" e o "Marcar
// disponível" do agendamento sobre as faixas. O commit "regra" (decisão 1 do Pedro): a missão começa dentro de uma faixa
// e pode terminar depois dela, sem tocar nenhuma pausa; oQueCabe diz o que cabe e até quando a missão pode ir.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disponivelPara, faixasDoAw, awComoOAppLia, normalizarFaixas, normalizarPausas, refazerFaixasDoAw, INICIO_DAS_FAIXAS, TURNOS, ALMOCO, PAUSA_NOVA,
  MINUTOS_DAS_FAIXAS, minutoDaFaixa, faixasDe, faixasDoTurno, turnoDasFaixas, textoDasFaixas, textoDasPausas, conferirFaixas, comOIntervalo, trechosDaTira, mesmasFaixas,
  oQueCabe, textoDoQueCabe
} from '../../js/disponibilidade.js';
import { INICIOS_DOS_TEMPOS as T } from '../../js/horarios.js';

const fim = k => (k < T.length - 1 ? T[k + 1] : 1440);
const padrao = p => T.map((_, i) => Boolean(p & (1 << i)));
const todos = () => T.map(() => true);

// A leitura de antes do C, escrita aqui como era (o cobre de js/viabilidade.js, que sai): o instrutor vem e está marcado em
// cada tempo que o compromisso toca
const leituraDeAntes = (x, a, b) => Boolean(x.on) && T.every((inicio, k) => !(a < fim(k) && b > inicio) || x.aw[k]);

// A regra do início (decisão 1), escrita aqui sobre o aw, sem as faixas: o que termina até as 06:30, ou começa na
// meia-noite, não pede nada; senão, o tempo em que a missão começa (das 06:30 em diante) está marcado, e nenhum tempo
// desmarcado que ela toca fica entre dois marcados (o intervalo entre duas sequências é a pausa)
const tempoDe = m => T.findLastIndex(t => t <= m);
const entreDoisMarcados = (aw, k) => aw.slice(0, k).some(Boolean) && aw.slice(k + 1).some(Boolean);
function pelaRegraDoInicio(x, a, b) {
  if (!x.on) return false;
  const inicio = Math.max(a, T[0]);
  if (b <= inicio || inicio >= 1440) return true;
  if (!x.aw[tempoDe(inicio)]) return false;
  return T.every((t, k) => !(a < fim(k) && b > t) || x.aw[k] || !entreDoisMarcados(x.aw, k));
}

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

describe('disponivelPara: a regra do início (decisão 1), com as pausas', () => {
  test('512 padrões: nunca recusa o que os tempos de antes aceitavam; aceita o que começa numa faixa sem tocar uma pausa, pelo aw e pelas faixas dele', () => {
    let diferencas = 0, recusasNovas = 0, conferidos = 0, aceitosAgora = 0;
    const exemplos = [];
    for (let p = 0; p < 512; p++) {
      const aw = padrao(p);
      const peloAw = { on: true, aw };
      const pelasFaixas = { on: true, aw: T.map(() => false), ...faixasDoAw(aw) };
      for (const [a, b] of INTERVALOS) {
        conferidos++;
        const regra = pelaRegraDoInicio(peloAw, a, b);
        if (disponivelPara(peloAw, a, b) !== regra || disponivelPara(pelasFaixas, a, b) !== regra) {
          diferencas++;
          if (exemplos.length < 5) exemplos.push(`padrão ${p}, ${a}–${b}`);
        }
        if (leituraDeAntes(peloAw, a, b) && !regra) recusasNovas++;
        if (!leituraDeAntes(peloAw, a, b) && regra) aceitosAgora++;
      }
    }
    assert.ok(conferidos > 1_000_000, `${conferidos} conferidos`);
    assert.equal(diferencas, 0, exemplos.join('; '));
    assert.equal(recusasNovas, 0, 'o que os tempos de antes aceitavam continua aceito');
    assert.ok(aceitosAgora > 0, 'a missão que termina depois da última faixa passa a caber');
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

  test('a missão começa dentro de uma faixa e pode terminar depois dela; o fim da faixa não entra', () => {
    const manha = { on: true, faixas: [{ de: 390, ate: 760 }], pausas: [] };
    assert.equal(disponivelPara(manha, 720, 780), true, 'o voo das 12:00 no PA-34 com a faixa até as 12:40');
    assert.equal(disponivelPara(manha, 690, 990), true, 'começa às 11:30 e vai até as 16:30');
    assert.equal(disponivelPara(manha, 760, 820), false, 'às 12:40, o fim da faixa: não entra');
    const dia = { on: true, faixas: [{ de: 390, ate: 1050 }], pausas: [] };
    assert.equal(disponivelPara(dia, 980, 1100), true, 'o simulador das 16:20 não precisa da noite');
    assert.equal(disponivelPara(dia, 1050, 1290), false, 'até as 17:30 não inclui o Noturno');
    const duas = { on: true, faixas: [{ de: 390, ate: 760 }, { de: 820, ate: 1440 }], pausas: [] };
    assert.equal(disponivelPara(duas, 700, 830), true, 'sem pausa, o intervalo entre duas faixas não impede quem começou antes dele');
    assert.equal(disponivelPara(duas, 790, 830), false, 'começa no intervalo, fora de uma faixa');
  });

  test('a pausa: nenhuma missão a toca, nem a que começou antes dela numa faixa (o almoço continua sendo almoço)', () => {
    const x = { on: true, faixas: [{ de: 390, ate: 760 }, { de: 820, ate: 1440 }], pausas: [{ de: 760, ate: 820 }] };
    assert.equal(disponivelPara(x, 610, 760), true, 'encosta na pausa');
    assert.equal(disponivelPara(x, 700, 770), false, 'atravessa a pausa');
    assert.equal(disponivelPara(x, 820, 900), true);
    assert.equal(disponivelPara(x, 815, 900), false, 'começa na pausa');
    // Pelo aw: o intervalo entre duas sequências de tempos marcados é a pausa; depois da última, nada
    const almoco = T.map((_, k) => k !== 3);
    assert.equal(disponivelPara({ on: true, aw: almoco }, 610, 730), false, 'das 10:10 às 12:10 atravessa o tempo das 11:30');
    const soManha = T.map((_, k) => k <= 3);
    assert.equal(disponivelPara({ on: true, aw: soManha }, 690, 930), true, 'a manhã toda: o voo das 11:30 vai até as 15:30');
  });

  test('uma pausa dentro de uma faixa também impede (o INVA não voa nela)', () => {
    const x = { on: true, faixas: [{ de: 390, ate: 1050 }], pausas: [{ de: 720, ate: 780 }] };
    assert.equal(disponivelPara(x, 600, 720), true, 'encosta no início da pausa');
    assert.equal(disponivelPara(x, 700, 760), false);
    assert.equal(disponivelPara(x, 780, 840), true, 'encosta no fim da pausa');
  });

  test('o que termina até as 06:30 não pede faixa; o que passa delas começa às 06:30 para a regra; a meia-noite em diante, nada', () => {
    const x = { on: true, faixas: [{ de: 500, ate: 610 }], pausas: [] };
    assert.equal(disponivelPara(x, 300, 389), true);
    assert.equal(disponivelPara(x, 360, 390), true, 'o voo que termina às 06:30');
    assert.equal(disponivelPara(x, 300, 450), false, 'o que passa das 06:30 pede a faixa das 06:30');
    assert.equal(disponivelPara({ on: true, faixas: [{ de: 390, ate: 400 }], pausas: [] }, 360, 600), true, 'das 06:00: a faixa que começa às 06:30');
    assert.equal(disponivelPara({ on: true, faixas: [{ de: 1050, ate: 1440 }], pausas: [] }, 1400, 1500), true);
    assert.equal(disponivelPara({ on: true, faixas: [], pausas: [] }, 1440, 1500), true, 'nada do dia');
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

describe('refazerFaixasDoAw: a reversão de um agendamento antigo, que guardou só o aw', () => {
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

describe('Os turnos: cada um uma faixa em minutos, sem os limites de um período do dia (N12)', () => {
  test('Dia inteiro 06:30–17:30, Noturno 17:30–24:00, Dia + noturno 06:30–24:00: nem Manhã nem Tarde', () => {
    assert.deepEqual(TURNOS.map(t => [t.id, t.nome, t.de, t.ate]), [
      ['dia', 'Dia inteiro', 390, 1050], ['noturno', 'Noturno', 1050, 1440], ['dia-e-noturno', 'Dia + noturno', 390, 1440]
    ]);
    assert.ok(Object.isFrozen(TURNOS));
  });

  test('o turno dá a faixa dele e nenhuma pausa; o desconhecido, nada', () => {
    assert.deepEqual(faixasDoTurno('dia'), { faixas: [{ de: 390, ate: 1050 }], pausas: [] });
    assert.deepEqual(faixasDoTurno('dia-e-noturno'), { faixas: [{ de: 390, ate: 1440 }], pausas: [] });
    assert.equal(faixasDoTurno('manha'), null);
  });

  test('os turnos dão a leitura dos turnos de mesmo nome pelo aw (os tempos 0–7, 8 e 0–8), com a regra do início', () => {
    const tempos = { dia: [0, 1, 2, 3, 4, 5, 6, 7], noturno: [8], 'dia-e-noturno': [0, 1, 2, 3, 4, 5, 6, 7, 8] };
    for (const t of TURNOS) {
      const aw = T.map((_, i) => tempos[t.id].includes(i));
      for (const [a, b] of INTERVALOS) {
        assert.equal(disponivelPara({ on: true, ...faixasDoTurno(t.id) }, a, b), pelaRegraDoInicio({ on: true, aw }, a, b), `${t.nome} ${a}–${b}`);
      }
    }
  });

  test('o turno das faixas: a faixa só de um deles, sem pausa; outra coisa, nenhum', () => {
    assert.equal(turnoDasFaixas({ faixas: [{ de: 1050, ate: 1440 }], pausas: [] }).nome, 'Noturno');
    assert.equal(turnoDasFaixas({ faixas: [{ de: 390, ate: 1050 }], pausas: [ALMOCO] }), null);
    assert.equal(turnoDasFaixas({ faixas: [{ de: 390, ate: 720 }], pausas: [] }), null);
    assert.equal(turnoDasFaixas({ faixas: [], pausas: [] }), null);
  });
});

describe('faixasDe: o que a tela mostra e edita', () => {
  test('com faixas, as dele (normalizadas); sem elas, as do aw como o app o lia', () => {
    assert.deepEqual(faixasDe({ on: true, aw: todos(), faixas: [{ de: 500, ate: 610 }, { de: 390, ate: 500 }], pausas: [{ de: 900, ate: 930 }] }),
      { faixas: [{ de: 390, ate: 610 }], pausas: [{ de: 900, ate: 930 }] });
    const aw = todos();
    aw[4] = false;
    assert.deepEqual(faixasDe({ on: true, aw }), faixasDoAw(aw));
    assert.deepEqual(faixasDe({ on: true }), { faixas: [{ de: 390, ate: 1440 }], pausas: [] });
    assert.deepEqual(faixasDe({ on: true, faixas: [{ de: 390, ate: 1050 }] }), { faixas: [{ de: 390, ate: 1050 }], pausas: [] });
  });

  test('mesmasFaixas compara depois de normalizar', () => {
    assert.ok(mesmasFaixas({ faixas: [{ de: 390, ate: 500 }, { de: 500, ate: 610 }], pausas: [] }, { faixas: [{ de: 390, ate: 610 }] }));
    assert.ok(!mesmasFaixas({ faixas: [{ de: 390, ate: 610 }], pausas: [ALMOCO] }, { faixas: [{ de: 390, ate: 610 }], pausas: [] }));
  });
});

describe('textoDasFaixas e textoDasPausas: o que a linha e o detalhe dizem', () => {
  test('uma faixa, duas, nenhuma; as pausas à parte', () => {
    assert.equal(textoDasFaixas({ faixas: [{ de: 390, ate: 1050 }], pausas: [] }), '06:30–17:30');
    assert.equal(textoDasFaixas({ faixas: [{ de: 390, ate: 760 }, { de: 820, ate: 1440 }], pausas: [] }), '06:30–12:40 e 13:40–24:00');
    assert.equal(textoDasFaixas({ faixas: [{ de: 390, ate: 500 }, { de: 610, ate: 690 }, { de: 760, ate: 820 }], pausas: [] }), '06:30–08:20, 10:10–11:30 e 12:40–13:40');
    assert.equal(textoDasFaixas({ faixas: [], pausas: [] }), 'sem faixa');
    assert.equal(textoDasPausas({ faixas: [{ de: 390, ate: 1050 }], pausas: [ALMOCO, PAUSA_NOVA] }), '12:00–13:00 e 15:00–15:30');
    assert.equal(textoDasPausas({ faixas: [{ de: 390, ate: 1050 }], pausas: [] }), '');
  });

  test('o Almoço é 12:00–13:00; a pausa nova, 15:00–15:30', () => {
    assert.deepEqual(ALMOCO, { de: 720, ate: 780 });
    assert.deepEqual(PAUSA_NOVA, { de: 900, ate: 930 });
  });
});

describe('conferirFaixas: "Salvar faixas" de "Editar faixas"', () => {
  test('os horários de 10 em 10 minutos, das 06:30 à meia-noite', () => {
    assert.equal(MINUTOS_DAS_FAIXAS[0], 390);
    assert.equal(MINUTOS_DAS_FAIXAS.at(-1), 1440);
    assert.equal(MINUTOS_DAS_FAIXAS.length, 106);
    assert.ok(MINUTOS_DAS_FAIXAS.every((m, i) => i === 0 || m - MINUTOS_DAS_FAIXAS[i - 1] === 10));
    // Os limites dos tempos de antes (as faixas do passo 29) e dos turnos estão todos nela
    for (const m of [...T, 1440]) assert.ok(MINUTOS_DAS_FAIXAS.includes(m), String(m));
  });

  test('o que vale sai normalizado (em ordem, as que se tocam juntas)', () => {
    assert.deepEqual(conferirFaixas({ faixas: [{ de: 780, ate: 1050 }, { de: 390, ate: 720 }], pausas: [{ de: 900, ate: 930 }] }),
      { erro: null, faixas: [{ de: 390, ate: 720 }, { de: 780, ate: 1050 }], pausas: [{ de: 900, ate: 930 }] });
    assert.deepEqual(conferirFaixas({ faixas: [{ de: 390, ate: 720 }, { de: 720, ate: 1050 }], pausas: [] }).faixas, [{ de: 390, ate: 1050 }]);
  });

  test('o Até antes do De (ou igual) é recusado, com o número da faixa ou da pausa', () => {
    assert.equal(conferirFaixas({ faixas: [{ de: 390, ate: 1050 }, { de: 900, ate: 900 }], pausas: [] }).erro, 'Na 2ª faixa, o Até vem depois do De.');
    assert.equal(conferirFaixas({ faixas: [{ de: 390, ate: 1050 }], pausas: [{ de: 780, ate: 720 }] }).erro, 'Na 1ª pausa, o Até vem depois do De.');
  });

  // A lista é de 10 em 10 minutos, mas o app grava faixas fora dela ("Marcar disponível" às 07:15, com 1,3 h): o editor
  // mostra o horário gravado, e "Salvar faixas" aceita qualquer minuto inteiro das 06:30 à meia-noite (como o formato 29)
  test('um horário antes das 06:30, depois da meia-noite ou fora do minuto inteiro é recusado; fora dos 10 minutos vale', () => {
    assert.equal(conferirFaixas({ faixas: [{ de: 380, ate: 1050 }], pausas: [] }).erro, 'Na 1ª faixa, escolha o De e o Até da lista.');
    assert.equal(conferirFaixas({ faixas: [{ de: 390, ate: 1450 }], pausas: [] }).erro, 'Na 1ª faixa, escolha o De e o Até da lista.');
    assert.equal(conferirFaixas({ faixas: [{ de: 390, ate: 1050.5 }], pausas: [] }).erro, 'Na 1ª faixa, escolha o De e o Até da lista.');
    assert.deepEqual(conferirFaixas({ faixas: [{ de: 435, ate: 498 }, { de: 760, ate: 1440 }], pausas: [{ de: 600, ate: 663 }] }),
      { erro: null, faixas: [{ de: 435, ate: 498 }, { de: 760, ate: 1440 }], pausas: [{ de: 600, ate: 663 }] });
    assert.ok(minutoDaFaixa(435) && minutoDaFaixa(390) && minutoDaFaixa(1440));
    assert.ok(!minutoDaFaixa(389) && !minutoDaFaixa(1441) && !minutoDaFaixa(400.5) && !minutoDaFaixa('400'));
  });

  // O campo recusado: a lista, o número e a ponta (o editor marca o campo com aria-invalid e põe o foco nele)
  test('a recusa diz qual campo: a lista, o número e a ponta; a do máximo, nenhum', () => {
    assert.deepEqual(conferirFaixas({ faixas: [{ de: 390, ate: 1050 }, { de: 900, ate: 900 }], pausas: [] }).campo, { lista: 'faixas', i: 1, ponta: 'ate' });
    assert.deepEqual(conferirFaixas({ faixas: [], pausas: [{ de: 380, ate: 720 }] }).campo, { lista: 'pausas', i: 0, ponta: 'de' });
    assert.deepEqual(conferirFaixas({ faixas: [{ de: 390, ate: 1450 }], pausas: [] }).campo, { lista: 'faixas', i: 0, ponta: 'ate' });
    const muitas = Array.from({ length: 9 }, (_, i) => ({ de: 400 + 60 * i, ate: 430 + 60 * i }));
    assert.equal(conferirFaixas({ faixas: muitas, pausas: [] }).campo, null);
  });

  test('no máximo 8 faixas e 8 pausas; nenhuma faixa vale (o INVA não voa na data)', () => {
    const muitas = Array.from({ length: 9 }, (_, i) => ({ de: 400 + 60 * i, ate: 430 + 60 * i }));
    assert.equal(conferirFaixas({ faixas: muitas, pausas: [] }).erro, 'No máximo 8 faixas por data.');
    assert.equal(conferirFaixas({ faixas: [], pausas: muitas }).erro, 'No máximo 8 pausas por data.');
    assert.deepEqual(conferirFaixas({ faixas: [], pausas: [] }), { erro: null, faixas: [], pausas: [] });
  });
});

describe('comOIntervalo: "Marcar disponível" do agendamento, sobre as faixas', () => {
  const dia = { faixas: [{ de: 390, ate: 720 }, { de: 780, ate: 1050 }], pausas: [{ de: 720, ate: 780 }] };

  test('o voo passa a caber numa faixa, e a pausa perde só o pedaço que ele toca', () => {
    const r = comOIntervalo(dia, 700, 760);
    assert.deepEqual(r, { faixas: [{ de: 390, ate: 760 }, { de: 780, ate: 1050 }], pausas: [{ de: 760, ate: 780 }] });
    assert.ok(disponivelPara({ on: true, ...r }, 700, 760));
    assert.ok(!disponivelPara({ on: true, ...r }, 700, 770), 'o resto da pausa continua');
  });

  test('o voo depois da última faixa: uma faixa nova, junta à que ele toca', () => {
    assert.deepEqual(comOIntervalo({ faixas: [{ de: 390, ate: 1050 }], pausas: [] }, 1050, 1290), { faixas: [{ de: 390, ate: 1290 }], pausas: [] });
    assert.deepEqual(comOIntervalo({ faixas: [], pausas: [] }, 500, 560), { faixas: [{ de: 500, ate: 560 }], pausas: [] });
  });

  test('o que cai antes das 06:30 não pede faixa; a pausa de dentro do voo sai inteira', () => {
    assert.deepEqual(comOIntervalo({ faixas: [], pausas: [] }, 300, 380), { faixas: [], pausas: [] });
    assert.deepEqual(comOIntervalo({ faixas: [{ de: 390, ate: 1050 }], pausas: [{ de: 600, ate: 620 }] }, 500, 700), { faixas: [{ de: 390, ate: 1050 }], pausas: [] });
  });

  test('todo intervalo conferido fica disponível, e o que já estava continua', () => {
    for (let p = 0; p < 512; p += 37) {
      const d = faixasDoAw(padrao(p));
      for (const [a, b] of INTERVALOS.filter((_, i) => i % 97 === 0)) {
        const r = comOIntervalo(d, a, b);
        assert.ok(disponivelPara({ on: true, ...r }, a, b), `padrão ${p}, ${a}–${b}`);
        for (const [c, e] of INTERVALOS.filter((_, i) => i % 211 === 0)) {
          if (disponivelPara({ on: true, ...d }, c, e)) assert.ok(disponivelPara({ on: true, ...r }, c, e), `padrão ${p}: ${c}–${e} continua`);
        }
      }
    }
  });
});

describe('trechosDaTira: a tira da linha, das 06:30 à meia-noite', () => {
  test('as faixas, as pausas e os voos em porcentagem da tira', () => {
    const trechos = trechosDaTira({ faixas: [{ de: 390, ate: 1050 }], pausas: [ALMOCO] }, [{ a: 600, b: 660 }]);
    const em = (tipo, de, ate) => ({ tipo, inicio: Math.round((de - 390) / 1050 * 1e4) / 100, largura: Math.round((ate - de) / 1050 * 1e4) / 100 });
    assert.deepEqual(trechos, [em('faixa', 390, 1050), em('pausa', 720, 780), em('voo', 600, 660)]);
  });

  test('o voo antes das 06:30 ou que passa da meia-noite é cortado na tira; o de fora dela não aparece', () => {
    assert.deepEqual(trechosDaTira({ faixas: [], pausas: [] }, [{ a: 360, b: 450 }, { a: 300, b: 380 }]).map(t => [t.tipo, t.inicio]), [['voo', 0]]);
    assert.equal(trechosDaTira({ faixas: [], pausas: [] }, [{ a: 1400, b: 1500 }])[0].largura, Math.round(40 / 1050 * 1e4) / 100);
  });
});

// O que a linha e o detalhe mostram em "O que cabe nestas faixas": em cada lista de decolagem, os horários em que a
// missão da duração padrão pode começar e até quando a missão que começa no último deles pode ir (5 h depois, sem
// passar da pausa seguinte nem do fim da missão: 17:30 no avião de dia)
describe('oQueCabe: os horários de cada lista que cabem nas faixas, e até quando a missão pode ir', () => {
  const comFaixas = (faixas, pausas = []) => ({ on: true, faixas, pausas });
  const resumo = itens => Object.fromEntries(itens.map(i => [i.id, [i.horarios.length, i.horarios[0] ?? null, i.horarios.at(-1) ?? null, i.ate]]));

  test('as seis listas, na ordem, com o nome', () => {
    assert.deepEqual(oQueCabe(comFaixas([{ de: 390, ate: 1440 }])).map(i => [i.id, i.nome]),
      [['C152', 'C152'], ['C172', 'C172'], ['sim', 'Simulador'], ['PA-34', 'PA-34'], ['ground', 'Ground'], ['noturno', 'Noturno']]);
  });

  test('a manhã (06:30–12:40): os de até as 12:30 começam, e a missão das 11:30 vai até as 16:30', () => {
    assert.deepEqual(resumo(oQueCabe(comFaixas([{ de: 390, ate: 760 }]))), {
      C152: [4, 390, 690, 990], C172: [4, 390, 690, 990], sim: [4, 390, 690, 990], 'PA-34': [13, 390, 750, 1050], ground: [4, 390, 690, 780], noturno: [0, null, null, null]
    });
  });

  // O Ground tem duração fixa (01h30, duracaoFixaDaMissao): a aula das 16:20 termina às 17:50, não 5 h depois
  test('o dia inteiro: o simulador das 16:20 vai até as 21:20 e a aula, até as 17:50; o Noturno não começa às 17:30 (o fim não entra)', () => {
    assert.deepEqual(resumo(oQueCabe({ on: true, ...faixasDoTurno('dia') })), {
      C152: [8, 390, 980, 1050], C172: [8, 390, 980, 1050], sim: [8, 390, 980, 1280], 'PA-34': [21, 390, 990, 1050], ground: [8, 390, 980, 1070], noturno: [0, null, null, null]
    });
    assert.deepEqual(resumo(oQueCabe({ on: true, ...faixasDoTurno('dia-e-noturno') })).noturno, [1, 1050, 1050, 1290], 'o Noturno, 4 h fixas');
  });

  test('a pausa do almoço: nenhuma missão a atravessa, e a pausa seguinte limita até quando a última pode ir', () => {
    const almoco = resumo(oQueCabe(comFaixas([{ de: 390, ate: 690 }, { de: 760, ate: 1050 }], [{ de: 690, ate: 760 }])));
    assert.deepEqual([almoco.C152, almoco.sim, almoco.ground], [[7, 390, 980, 1050], [6, 390, 980, 1280], [6, 390, 980, 1070]]);
    assert.deepEqual(oQueCabe(comFaixas([{ de: 390, ate: 1050 }], [{ de: 720, ate: 780 }]))[0].horarios, [390, 500, 610, 820, 870, 980]);
    assert.equal(oQueCabe(comFaixas([{ de: 390, ate: 760 }], [{ de: 900, ate: 960 }]))[0].ate, 900, 'para na pausa das 15:00');
  });

  test('as listas da data (os horários de decolagem editados) e quem não vem', () => {
    const horarios = { C152: [360, 450], C172: [500], sim: [500], 'PA-34': [500], ground: [500] };
    assert.deepEqual(oQueCabe(comFaixas([{ de: 390, ate: 500 }]), horarios)[0].horarios, [360, 450], 'a das 06:00 começa às 06:30 para a regra');
    assert.ok(oQueCabe({ on: false, faixas: [{ de: 390, ate: 1440 }], pausas: [] }).every(i => i.horarios.length === 0 && i.ate === null));
  });

  // O fim é o da missão que começa no último horário (revisão externa de C2, 28/11): com mais de um, o texto diz qual
  test('o texto de cada lista: com mais de um horário, o fim é o do último', () => {
    const [c152, , , , , noturno] = oQueCabe(comFaixas([{ de: 390, ate: 760 }]));
    assert.equal(textoDoQueCabe(c152), 'C152: 06:30 a 11:30 (4 horários); a das 11:30 termina até as 16:30');
    assert.equal(textoDoQueCabe(noturno), 'Noturno: nenhum horário');
    assert.equal(textoDoQueCabe(oQueCabe({ on: true, ...faixasDoTurno('dia') })[4]), 'Ground: 06:30 a 16:20 (8 horários); a das 16:20 termina até as 17:50');
    assert.equal(textoDoQueCabe(oQueCabe({ on: true, ...faixasDoTurno('noturno') })[5]), 'Noturno: 17:30 (1 horário); termina até as 21:30');
  });

  // O caso da revisão: o dia com o almoço. A das 10:10 só vai até as 12:00 (a pausa); a das 16:20, até as 17:30, e é dela o fim
  test('o fim é o do último horário, não o de cada um (o dia com o almoço)', () => {
    const x = comFaixas([{ de: 390, ate: 1050 }], [{ de: 720, ate: 780 }]);
    const [c152] = oQueCabe(x);
    assert.equal(textoDoQueCabe(c152), 'C152: 06:30 a 16:20 (6 horários); a das 16:20 termina até as 17:30');
    assert.equal(disponivelPara(x, c152.horarios.at(-1), c152.ate), true, 'o fim mostrado é o do último horário');
    assert.equal(disponivelPara(x, 610, c152.ate), false, 'a das 10:10 não vai até lá');
    assert.equal(disponivelPara(x, 610, 720), true, 'a das 10:10 vai até a pausa');
  });
});

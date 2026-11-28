// As limitações do aluno (L, formato 31; N3, N9): os tipos de recurso em que ele voa e os horários em que pode voar (todas
// as datas, ou só nos dias da semana nomeados), duras para o motor. js/limitacoes.js, puro: a normalização do que vem
// gravado, as regras (o tipo, o início: a regra das faixas dos INVAs, R4) e os textos da tela e do motor
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAXIMO_DE_HORARIOS, normalizarLimitacoes, tipoPermitido, inicioPermitido, limitadoNoHorario, limitacoesNaData, comLimitacoesDaData,
  motivoDoTipo, textoDosHorarios, quandoOAlunoVoa, TIPOS_LIMITAVEIS, MINUTOS_DOS_HORARIOS, DIAS_DAS_LIMITACOES, nomeDoDia, textoDasLimitacoes,
  tiposQueNaoCabem, linhaDoPeso
} from '../../js/limitacoes.js';

// 2026-11-30 é uma segunda-feira; 2026-12-01, terça; 2026-12-05, sábado; 2026-12-06, domingo
const SEGUNDA = '2026-11-30', TERCA = '2026-12-01', SABADO = '2026-12-05', DOMINGO = '2026-12-06';

describe('normalizarLimitacoes: só o que tem o formato fica; vazio, nada', () => {
  it('sem limitação (ausente, vazia, de outro tipo): null', () => {
    for (const v of [undefined, null, {}, [], 'C172', 3, { recursos: [] }, { horarios: [] }, { recursos: ['A320'] }, { horarios: [{ de: 9, ate: 3 }] }]) {
      assert.equal(normalizarLimitacoes(v), null, JSON.stringify(v));
    }
  });

  it('os tipos: só os de avião e de simulador, sem repetir, na ordem da frota; a Sala Ground não é um deles', () => {
    assert.deepEqual(normalizarLimitacoes({ recursos: ['Sim. Multi', 'C172', 'C172', 'Sala Ground', 'x', 7, null] }), { recursos: ['C172', 'Sim. Multi'] });
  });

  it('os horários: { de, ate } em minutos, [de, ate), de 06:00 à meia-noite, os dias da semana (0 a 6) ou nenhum', () => {
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 780, ate: 1080, dias: [5, 1, 3, 3], x: 1 }, { de: 420, ate: 720 }] }),
      { horarios: [{ de: 420, ate: 720 }, { de: 780, ate: 1080, dias: [1, 3, 5] }] });
    // Fora do formato: o fim antes do começo, fora do dia, não inteiro, os dias vazios ou fora de 0 a 6, de outro tipo
    for (const h of [{ de: 600, ate: 600 }, { de: 300, ate: 600 }, { de: 600, ate: 1450 }, { de: 600.5, ate: 700 }, { de: '600', ate: 700 },
      { de: 600, ate: 700, dias: [] }, { de: 600, ate: 700, dias: [7] }, { de: 600, ate: 700, dias: 'seg' }, null, 'x']) {
      assert.equal(normalizarLimitacoes({ horarios: [h] }), null, JSON.stringify(h));
    }
    // Todos os sete dias: o mesmo que todas as datas
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 600, ate: 700, dias: [0, 1, 2, 3, 4, 5, 6] }] }), { horarios: [{ de: 600, ate: 700 }] });
    // Das 06:00 (o primeiro horário que uma lista de decolagem aceita) à meia-noite
    assert.deepEqual(normalizarLimitacoes({ horarios: [{ de: 360, ate: 1440 }, { de: 350, ate: 400 }] }), { horarios: [{ de: 360, ate: 1440 }] });
  });

  it(`no máximo ${MAXIMO_DE_HORARIOS} horários, na ordem do começo; os dois juntos`, () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ de: 400 + i * 60, ate: 430 + i * 60 }));
    assert.equal(normalizarLimitacoes({ horarios: muitos }).horarios.length, MAXIMO_DE_HORARIOS);
    assert.deepEqual(normalizarLimitacoes({ recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }], outro: 1 }), { recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }] });
  });

  it('não muda o que recebe', () => {
    const v = { recursos: ['C172', 'C172'], horarios: [{ de: 780, ate: 1080, dias: [3, 1] }] };
    const copia = structuredClone(v);
    normalizarLimitacoes(v);
    assert.deepEqual(v, copia);
  });
});

describe('tipoPermitido: o tipo do pedido entre os que o aluno voa', () => {
  it('sem limitação, todos', () => {
    for (const t of ['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi', 'Sala Ground']) assert.equal(tipoPermitido(undefined, t), true);
  });

  it('a limitação vale para a espécie que ela nomeia: os aviões, ou os simuladores; a Sala Ground nunca', () => {
    const soC172 = { recursos: ['C172'] };
    assert.deepEqual(['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi', 'Sala Ground'].map(t => tipoPermitido(soC172, t)), [false, true, false, true, true, true]);
    const soMulti = { recursos: ['Sim. Multi'] };
    assert.deepEqual(['C152', 'Sim. Mono', 'Sim. Multi'].map(t => tipoPermitido(soMulti, t)), [true, false, true]);
    const dois = { recursos: ['C152', 'C172', 'Sim. Mono'] };
    assert.deepEqual(['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi'].map(t => tipoPermitido(dois, t)), [true, true, false, true, false]);
  });

  it('o motivo: "o aluno só voa no C172"; com dois, "no C152 ou no C172"; o tipo que ele voa, null', () => {
    assert.equal(motivoDoTipo({ recursos: ['C172'] }, 'C152'), 'o aluno só voa no C172');
    assert.equal(motivoDoTipo({ recursos: ['C152', 'C172'] }, 'PA-34'), 'o aluno só voa no C152 ou no C172');
    assert.equal(motivoDoTipo({ recursos: ['Sim. Multi'] }, 'Sim. Mono'), 'o aluno só voa no Sim. Multi');
    assert.equal(motivoDoTipo({ recursos: ['C172'] }, 'C172'), null);
    assert.equal(motivoDoTipo({ recursos: ['C172'] }, 'Sim. Mono'), null);
    assert.equal(motivoDoTipo(null, 'C152'), null);
  });
});

describe('inicioPermitido: a regra do início, como nas faixas dos INVAs (R4)', () => {
  const tarde = { horarios: [{ de: 780, ate: 1080 }] };
  it('a missão começa dentro de um horário, [de, ate), e pode terminar depois dele', () => {
    assert.deepEqual([770, 780, 1000, 1079, 1080].map(m => inicioPermitido(tarde, m)), [false, true, true, true, false]);
  });

  it('sem horários, qualquer início; com vários, qualquer um deles', () => {
    assert.equal(inicioPermitido(undefined, 400), true);
    assert.equal(inicioPermitido({ recursos: ['C172'] }, 400), true);
    const dois = { horarios: [{ de: 420, ate: 540 }, { de: 780, ate: 1080 }] };
    assert.deepEqual([420, 600, 800].map(m => inicioPermitido(dois, m)), [true, false, true]);
  });

  it('um horário com dias só vale lido para a data (limitacoesNaData): sem a data, não é início (a limitação é dura)', () => {
    assert.equal(inicioPermitido({ horarios: [{ de: 780, ate: 1080, dias: [1] }] }, 800), false);
    assert.equal(limitadoNoHorario({ horarios: [] }), true);
    assert.equal(inicioPermitido({ horarios: [] }, 800), false);
    assert.equal(limitadoNoHorario({ recursos: ['C172'] }), false);
  });
});

describe('limitacoesNaData: os horários do dia da semana da data', () => {
  const l = { recursos: ['C172'], horarios: [{ de: 420, ate: 720, dias: [1, 3, 5] }, { de: 780, ate: 1080 }] };
  it('fica o que vale na data, sem os dias', () => {
    assert.deepEqual(limitacoesNaData(l, SEGUNDA), { recursos: ['C172'], horarios: [{ de: 420, ate: 720 }, { de: 780, ate: 1080 }] });
    assert.deepEqual(limitacoesNaData(l, TERCA), { recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }] });
  });

  it('nenhum horário na data: a lista vazia (o aluno não voa nela); sem limitação, null', () => {
    assert.deepEqual(limitacoesNaData({ horarios: [{ de: 420, ate: 720, dias: [1] }] }, TERCA), { horarios: [] });
    assert.deepEqual(limitacoesNaData({ horarios: [{ de: 420, ate: 720, dias: [6] }] }, SABADO), { horarios: [{ de: 420, ate: 720 }] });
    assert.deepEqual(limitacoesNaData({ horarios: [{ de: 420, ate: 720, dias: [1, 2, 3, 4, 5, 6] }] }, DOMINGO), { horarios: [] });
    assert.equal(limitacoesNaData(null, SEGUNDA), null);
    assert.equal(limitacoesNaData({ x: 1 }, SEGUNDA), null);
  });

  it('a data que não é uma data: os horários com dias não valem', () => {
    assert.deepEqual(limitacoesNaData({ horarios: [{ de: 420, ate: 720, dias: [1] }, { de: 780, ate: 1080 }] }, ''), { horarios: [{ de: 780, ate: 1080 }] });
  });
});

describe('comLimitacoesDaData: o estado que o motor lê na data', () => {
  it('sem limitação com dias, o próprio estado (nada é copiado)', () => {
    const estado = { stu: [{ id: 1, nm: 'A' }, { id: 2, nm: 'B', limitacoes: { recursos: ['C172'], horarios: [{ de: 780, ate: 1080 }] } }] };
    assert.equal(comLimitacoesDaData(estado, SEGUNDA), estado);
  });

  it('com dias, cada aluno com os horários da data; os outros alunos, os mesmos objetos', () => {
    const a = { id: 1, nm: 'A' };
    const b = { id: 2, nm: 'B', limitacoes: { horarios: [{ de: 420, ate: 720, dias: [2] }] } };
    const estado = { stu: [a, b], outro: 1 };
    const novo = comLimitacoesDaData(estado, SEGUNDA);
    assert.notEqual(novo, estado);
    assert.equal(novo.stu[0], a);
    assert.deepEqual(novo.stu[1], { id: 2, nm: 'B', limitacoes: { horarios: [] } });
    assert.equal(novo.outro, 1);
    assert.deepEqual(b.limitacoes.horarios[0].dias, [2], 'o estado de antes não muda');
    assert.deepEqual(comLimitacoesDaData(estado, TERCA).stu[1].limitacoes, { horarios: [{ de: 420, ate: 720 }] });
  });
});

describe('Os textos', () => {
  it('os horários: "13:00–18:00 (seg, qua, sex)"; nenhum, "nenhum horário nesta data"', () => {
    assert.equal(textoDosHorarios([{ de: 780, ate: 1080, dias: [1, 3, 5] }, { de: 420, ate: 540 }]), '13:00–18:00 (seg, qua, sex); 07:00–09:00');
    assert.equal(textoDosHorarios([{ de: 780, ate: 1440 }]), '13:00–24:00');
    assert.equal(textoDosHorarios([]), 'nenhum horário nesta data');
  });

  it('o que o motor diz do quando: o horário do pedido e as limitações, juntos ("às 08:20; Limitações: 13:00–18:00")', () => {
    assert.equal(quandoOAlunoVoa('às 08:20', null), 'às 08:20');
    assert.equal(quandoOAlunoVoa(null, { horarios: [{ de: 780, ate: 1080 }] }), 'Limitações: 13:00–18:00');
    assert.equal(quandoOAlunoVoa('às 08:20', { horarios: [{ de: 780, ate: 1080 }] }), 'às 08:20; Limitações: 13:00–18:00');
    assert.equal(quandoOAlunoVoa(null, { horarios: [] }), 'Limitações: nenhum horário nesta data');
  });
});

// A tela das Limitações (Alunos): os tipos que ela oferece, os minutos dos campos De e Até, os dias e o texto do Histórico
describe('A tela das Limitações', () => {
  it('os tipos: os de avião e de simulador, na ordem da frota (a Sala Ground não é um deles); os dias, de segunda a sábado', () => {
    assert.deepEqual(TIPOS_LIMITAVEIS, ['C152', 'C172', 'PA-34', 'Sim. Mono', 'Sim. Multi']);
    assert.deepEqual(DIAS_DAS_LIMITACOES, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(DIAS_DAS_LIMITACOES.map(nomeDoDia), ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
  });

  it('os minutos dos campos: das 06:00 à meia-noite, de 10 em 10', () => {
    assert.equal(MINUTOS_DOS_HORARIOS[0], 360);
    assert.equal(MINUTOS_DOS_HORARIOS.at(-1), 1440);
    assert.ok(MINUTOS_DOS_HORARIOS.every((m, i) => i === 0 || m - MINUTOS_DOS_HORARIOS[i - 1] === 10));
  });

  it('o Histórico: "só no C172; 13:00–18:00 (seg)"; sem nada, "nenhuma"', () => {
    assert.equal(textoDasLimitacoes({ recursos: ['C172', 'Sim. Multi'], horarios: [{ de: 780, ate: 1080, dias: [1] }] }), 'só no C172 e no Sim. Multi; 13:00–18:00 (seg)');
    assert.equal(textoDasLimitacoes({ horarios: [{ de: 780, ate: 1080 }] }), '13:00–18:00');
    assert.equal(textoDasLimitacoes(null), 'nenhuma');
  });

});

describe('O peso do aluno nos aviões (a linha das Limitações, sem nenhum número)', () => {
  // O C152 aceita 170 kg (aluno + INVA) com o tanque cheio, e até uns 210 kg com menos combustível num voo de 1 h; o C172,
  // 222 kg; ninguém tem a habilitação do PA-34 (mlte)
  const ins = [
    { id: 1, nm: 'Leve', kg: 60, hab: ['c152', 'c172'] },
    { id: 2, nm: 'Pesado', kg: 95, hab: ['c152', 'c172'] },
    { id: 3, nm: 'Sem peso', kg: 0, hab: ['c152'] },
    { id: 4, nm: 'Inativo leve', kg: 50, hab: ['c152'], inativo: true }
  ];
  it('o aluno que não cabe com nenhum INVA ativo, habilitado e com o peso informado, no tipo: o tipo', () => {
    assert.deepEqual(tiposQueNaoCabem({ ins }, { kg: 160 }), ['C152']);
    assert.deepEqual(tiposQueNaoCabem({ ins }, { kg: 80 }), []);
  });

  it('sem o peso do aluno, ou sem um INVA com peso no tipo, nada (o limite não é conferido)', () => {
    assert.deepEqual(tiposQueNaoCabem({ ins }, { kg: 0 }), []);
    assert.deepEqual(tiposQueNaoCabem({ ins: [ins[2], ins[3]] }, { kg: 160 }), []);
  });

  it('a linha: "Com o peso do aluno, nenhum INVA ativo habilitado cabe no C152."; com dois, "no C152 e no C172"', () => {
    assert.equal(linhaDoPeso(['C152']), 'Com o peso do aluno, nenhum INVA ativo habilitado cabe no C152.');
    assert.equal(linhaDoPeso(['C152', 'C172']), 'Com o peso do aluno, nenhum INVA ativo habilitado cabe no C152 e no C172.');
    assert.equal(linhaDoPeso([]), '');
  });
});

// Os horários fechados de uma data (J, formato 28): { de, ate, categorias? } em minutos, [de, ate), 0 ≤ de < ate ≤ 1440,
// categorias as ids de CATEGORIAS (ausente: todos os recursos). fechamentosDoWin converte as nove janelas de antes
// (dias antes do 28 e os estados dos goldens) e fecha exatamente os minutos que elas fechavam.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarFechamentos, fechamentosDoWin, horarioAberto, rotuloDosFechamentos, MAXIMO_DE_FECHAMENTOS } from '../../js/fechamentos.js';
import { INICIOS_DOS_TEMPOS as T, periodoDoMinuto } from '../../js/horarios.js';

const TODAS = ['C152', 'C172', 'sim', 'PA-34', 'ground'];

describe('normalizarFechamentos', () => {
  test('o que não é lista, e cada item inválido, sai', () => {
    assert.deepEqual(normalizarFechamentos(null), []);
    assert.deepEqual(normalizarFechamentos({ de: 0, ate: 10 }), []);
    assert.deepEqual(normalizarFechamentos([
      null, 'x', { de: 600 }, { ate: 700 }, { de: 700, ate: 700 }, { de: 800, ate: 700 }, { de: -10, ate: 100 },
      { de: 100, ate: 1441 }, { de: 1.5, ate: 100 }, { de: '600', ate: 700 }
    ]), []);
  });

  test('os limites: 0 e 1440 valem', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 0, ate: 1440 }]), [{ de: 0, ate: 1440 }]);
  });

  test('em ordem, e os que se tocam ou se cruzam, com as mesmas categorias, juntam', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 900, ate: 1000 }, { de: 600, ate: 700 }, { de: 700, ate: 760 }, { de: 950, ate: 1050 }]),
      [{ de: 600, ate: 760 }, { de: 900, ate: 1050 }]);
  });

  test('com categorias diferentes, não juntam (cada um fecha só as suas)', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: ['C152'] }, { de: 650, ate: 760 }]),
      [{ de: 600, ate: 700, categorias: ['C152'] }, { de: 650, ate: 760 }]);
  });

  test('as categorias: sem repetir, na ordem de CATEGORIAS, só as que existem', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: ['ground', 'C152', 'C152', 'nada'] }]),
      [{ de: 600, ate: 700, categorias: ['C152', 'ground'] }]);
  });

  test('todas as categorias marcadas são o mesmo que nenhuma: todos os recursos', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: [...TODAS].reverse() }]), [{ de: 600, ate: 700 }]);
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: [] }]), [{ de: 600, ate: 700 }]);
  });

  test('categorias só inválidas: o fechamento sai (nunca vira "todos os recursos")', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: ['PT-ABC'] }]), []);
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, categorias: 'C152' }]), []);
  });

  test('nada além de de, ate e categorias fica guardado', () => {
    assert.deepEqual(normalizarFechamentos([{ de: 600, ate: 700, recursos: ['PT-ABC'], x: 1 }]), [{ de: 600, ate: 700 }]);
  });

  test(`no máximo ${MAXIMO_DE_FECHAMENTOS}, os primeiros na ordem`, () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ de: 400 + 40 * i, ate: 420 + 40 * i }));
    const n = normalizarFechamentos(muitos);
    assert.equal(n.length, MAXIMO_DE_FECHAMENTOS);
    assert.deepEqual(n[0], { de: 400, ate: 420 });
  });

  test('duas vezes dá o mesmo, e a entrada não muda', () => {
    const entrada = [{ de: 700, ate: 760, categorias: ['sim', 'C152'] }, { de: 600, ate: 700 }];
    const copia = structuredClone(entrada);
    const uma = normalizarFechamentos(entrada);
    assert.deepEqual(normalizarFechamentos(uma), uma);
    assert.deepEqual(entrada, copia);
  });
});

describe('fechamentosDoWin: as nove janelas de antes', () => {
  test('o dia todo aberto: nenhum fechamento; o que não é lista também', () => {
    assert.deepEqual(fechamentosDoWin(T.map(() => true)), []);
    assert.deepEqual(fechamentosDoWin(undefined), []);
  });

  test('a janela 0 também fechava o que sai antes das 06:30; a 8 vai até a meia-noite', () => {
    const win = T.map(() => true);
    win[0] = false;
    win[8] = false;
    assert.deepEqual(fechamentosDoWin(win), [{ de: 0, ate: T[1] }, { de: T[8], ate: 1440 }]);
  });

  test('janelas fechadas seguidas viram um intervalo só', () => {
    const win = T.map((_, i) => !(i >= 4 && i <= 7));
    assert.deepEqual(fechamentosDoWin(win), [{ de: T[4], ate: T[8] }]);
  });

  test('512 padrões × 1440 minutos: os mesmos minutos fechados que win[periodoDoMinuto(m)]', () => {
    let diferencas = 0;
    for (let p = 0; p < 512; p++) {
      const win = T.map((_, i) => Boolean(p & (1 << i)));
      const fech = fechamentosDoWin(win);
      for (let m = 0; m < 1440; m++) if (Boolean(win[periodoDoMinuto(m)]) !== horarioAberto(fech, m, 'C152')) diferencas++;
    }
    assert.equal(diferencas, 0);
  });

  test('fora do padrão, como o motor lê (!win[i]): curto, null ou 0 fecham', () => {
    assert.deepEqual(fechamentosDoWin([true, true, true, true, true, true, true, true]), [{ de: T[8], ate: 1440 }]);
    assert.deepEqual(fechamentosDoWin([true, true, true, true, null, true, true, true, true]), [{ de: T[4], ate: T[5] }]);
    assert.deepEqual(fechamentosDoWin([true, true, 0, true, true, true, true, true, true]), [{ de: T[2], ate: T[3] }]);
  });

  test('o que sai já está normalizado', () => {
    for (let p = 0; p < 512; p++) {
      const fech = fechamentosDoWin(T.map((_, i) => Boolean(p & (1 << i))));
      assert.deepEqual(normalizarFechamentos(fech), fech);
    }
  });
});

describe('horarioAberto', () => {
  const fech = [{ de: 760, ate: 1050 }, { de: 390, ate: 500, categorias: ['C152', 'ground'] }];
  test('[de, ate): o início fecha, o fim já está aberto', () => {
    assert.equal(horarioAberto(fech, 759, 'C172'), true);
    assert.equal(horarioAberto(fech, 760, 'C172'), false);
    assert.equal(horarioAberto(fech, 1049, 'C172'), false);
    assert.equal(horarioAberto(fech, 1050, 'C172'), true);
  });
  test('o fechamento de categorias só fecha as suas', () => {
    assert.equal(horarioAberto(fech, 400, 'C152'), false);
    assert.equal(horarioAberto(fech, 400, 'ground'), false);
    assert.equal(horarioAberto(fech, 400, 'C172'), true);
    assert.equal(horarioAberto(fech, 400, 'sim'), true);
  });
  test('sem categoria conhecida, só o de todos os recursos fecha', () => {
    assert.equal(horarioAberto(fech, 400, null), true);
    assert.equal(horarioAberto(fech, 800, null), false);
  });
  test('sem fechamentos, tudo aberto', () => {
    assert.equal(horarioAberto([], 0, 'C152'), true);
    assert.equal(horarioAberto(undefined, 800, 'C152'), true);
  });
});

describe('rotuloDosFechamentos', () => {
  test('o intervalo e para quem, como em "Horários fechados nesta data"', () => {
    assert.deepEqual(rotuloDosFechamentos([{ de: 760, ate: 1050 }, { de: 390, ate: 500, categorias: ['C152', 'ground'] }, { de: 1050, ate: 1440 }]),
      ['12:40–17:30 · todos os recursos', '06:30–08:20 · C152, Sala Ground', '17:30–24:00 · todos os recursos']);
  });
  test('o simulador pelo nome', () => {
    assert.deepEqual(rotuloDosFechamentos([{ de: 0, ate: 1440, categorias: ['sim'] }]), ['00:00–24:00 · Simulador']);
  });
});

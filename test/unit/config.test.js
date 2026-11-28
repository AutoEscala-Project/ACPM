import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../../js/config.js';
import { INICIOS_DOS_TEMPOS, HORARIO_DO_NOTURNO, HORARIO_DO_SOLO, HORARIOS_PADRAO } from '../../js/horarios.js';
import { hm } from '../../js/format.js';

const { EQ, MIS, ACROBAT_REG, ALL_EQ_TYPES } = config;

describe('Configuração operacional', () => {
  // J (N11): as janelas de operação deixam de ser uma entidade. Os nove inícios ficam congelados só para o que ainda os
  // lê (o w das linhas, as chaves das turmas de Ground, os dados antigos e, até o C, o aw dos instrutores); o resto lê a
  // constante que diz o que ela é
  it('as nove janelas saem de js/config.js', () => {
    for (const nome of ['WIN', 'T', 'NI', 'DAY']) assert.equal(Object.hasOwn(config, nome), false, nome);
  });

  it('os nove inícios congelados e as constantes, com os mesmos minutos de antes', () => {
    assert.deepEqual(INICIOS_DOS_TEMPOS.map(hm), ['06:30', '08:20', '10:10', '11:30', '12:40', '13:40', '14:30', '16:20', '17:30']);
    assert.deepEqual(INICIOS_DOS_TEMPOS, [390, 500, 610, 690, 760, 820, 870, 980, 1050]);
    assert.ok(Object.isFrozen(INICIOS_DOS_TEMPOS));
    assert.equal(HORARIO_DO_NOTURNO, 1050);
    assert.equal(HORARIO_DO_SOLO, 390);
    assert.deepEqual(HORARIOS_PADRAO, INICIOS_DOS_TEMPOS.slice(0, 8));
  });

  it('frota com 26 recursos e o PR-JPL no C152', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(EQ).map(([k, v]) => [k, v.length])),
      { 'Sim. Mono': 2, 'Sim. Multi': 2, 'C152': 13, 'C172': 6, 'PA-34': 3 });
    assert.ok(EQ.C152.includes(ACROBAT_REG));
    assert.deepEqual(ALL_EQ_TYPES, ['Sim. Mono', 'Sim. Multi', 'C152', 'C172', 'PA-34', 'Sala Ground']);
  });

  it('cada missão tem equipamento padrão entre os permitidos', () => {
    assert.equal(Object.keys(MIS).length, 18);
    for (const [nome, m] of Object.entries(MIS)) assert.ok(m.eq.includes(m.defEq), nome);
  });

  // Os turnos rápidos da grade (PRE, com "Manhã" e "Tarde") saíram com ela (C, N12, U4): os três turnos são faixas
  // (TURNOS, js/disponibilidade.js)
  it('os turnos rápidos da grade (PRE) saíram com ela', () => {
    assert.equal('PRE' in config, false);
  });
});

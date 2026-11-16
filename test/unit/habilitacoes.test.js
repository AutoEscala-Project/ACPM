// Habilitações individuais dos instrutores: substituem os níveis cumulativos A01–A09.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HABILITACOES, habilitacoesDoNivel, normalizarHabilitacoes, podeFazer, podeAlgumCheque, descreverExigencias, marcasDoChecadorAntigo } from '../../js/habilitacoes.js';
import { MIS } from '../../js/config.js';

// Regra dos níveis cumulativos, congelada aqui: a migração não pode mudar quem pode fazer o quê
const NIVEL_DA_MISSAO = { 'Simulador': 2, 'Voo Local': 1, 'Navegação': 4, 'Voo Solo': 5, 'Parafuso': 6, 'IFR': 8, 'Noturno': 7, 'Multimotor': 9 };
const NIVEL_DO_EQUIPAMENTO = { 'Sala Ground': 1, 'C152': 1, 'Sim. Mono': 2, 'Sim. Multi': 2, 'C172': 7, 'PA-34': 9 };
const nivelExigido = (mis, eq) => (mis.startsWith('Ground') ? 1 : Math.max(NIVEL_DA_MISSAO[mis], NIVEL_DO_EQUIPAMENTO[eq]));
const MISSOES_DA_FASE_3 = ['Ground C152', 'Ground C172', 'Ground PA-34', 'Ground Navegação', ...Object.keys(NIVEL_DA_MISSAO)];
const com = (...hab) => ({ hab });

describe('Habilitações individuais', () => {
  it('a migração dá a cada nível exatamente o que ele permitia (todas as missões e equipamentos)', () => {
    let casos = 0;
    for (let lv = 1; lv <= 9; lv++) {
      const instrutor = { hab: habilitacoesDoNivel(lv) };
      for (const mis of MISSOES_DA_FASE_3) {
        for (const eq of MIS[mis].eq) {
          assert.equal(podeFazer(instrutor, mis, eq), lv >= nivelExigido(mis, eq), `A0${lv} em ${mis} no ${eq}`);
          casos++;
        }
      }
    }
    assert.equal(casos, 9 * 22);
  });

  it('o que cada nível recebe; quem tem mais nível tem mais habilitações (os checadores começam desmarcados)', () => {
    assert.deepEqual(habilitacoesDoNivel(1), ['grounds', 'ground_pa34', 'local', 'c152']);
    assert.deepEqual(habilitacoesDoNivel(3), ['grounds', 'ground_pa34', 'sim_mono', 'sim_multi', 'tgl', 'local', 'c152']);
    assert.deepEqual(habilitacoesDoNivel(9), HABILITACOES.map(h => h.id).filter(h => !h.startsWith('checa_')));
    assert.deepEqual(habilitacoesDoNivel('x'), habilitacoesDoNivel(1), 'nível inválido conta como A01');
    for (let lv = 2; lv <= 9; lv++) assert.ok(habilitacoesDoNivel(lv).length > habilitacoesDoNivel(lv - 1).length);
  });

  it('não são cumulativas: instrutor de C172 sem simulador, de PA-34 sem parafuso', () => {
    const c172 = com('local', 'navegacao', 'noturno', 'c172');
    assert.equal(podeFazer(c172, 'Voo Local', 'C172'), true);
    assert.equal(podeFazer(c172, 'Noturno', 'C172'), true);
    assert.equal(podeFazer(c172, 'Simulador', 'Sim. Mono'), false);
    const pa34 = com('local', 'mlte');
    assert.equal(podeFazer(pa34, 'Multimotor', 'PA-34'), true);
    assert.equal(podeFazer(pa34, 'Parafuso', 'PA-34'), false);
    assert.equal(podeFazer(pa34, 'Voo Local', 'C172'), false, 'PA-34 não habilita C172');
    assert.equal(podeFazer(com('sim_multi'), 'Simulador', 'Sim. Mono'), false);
    assert.equal(podeFazer(com('ground_pa34'), 'Ground C152', 'Sala Ground'), false);
    assert.equal(podeFazer({}, 'Voo Local', 'C152'), false, 'sem habilitações não faz nada');
  });

  it('normaliza a lista: só habilitações conhecidas, sem repetição, na ordem da grade', () => {
    assert.deepEqual(normalizarHabilitacoes(['c172', 'xyz', 'local', 'c172', 7]), ['local', 'c172']);
    assert.deepEqual(normalizarHabilitacoes('local'), []);
  });

  it('o C152 exige a habilitação do avião', () => {
    assert.equal(podeFazer(com('local'), 'Voo Local', 'C152'), false);
    assert.equal(podeFazer(com('local', 'c152'), 'Voo Local', 'C152'), true);
    assert.equal(podeFazer(com('local', 'c172'), 'Voo Local', 'C152'), false, 'o C172 não habilita o C152');
    assert.equal(descreverExigencias('Voo Local', 'C152'), 'Voo Local + C152');
  });

  it('TGL (TMA) exige a habilitação TGL (TMA) e a do avião', () => {
    assert.equal(podeFazer(com('tgl', 'c152'), 'TGL (TMA)', 'C152'), true);
    assert.equal(podeFazer(com('tgl'), 'TGL (TMA)', 'C152'), false);
    assert.equal(podeFazer(com('tgl'), 'TGL (TMA)', 'C172'), false);
    assert.equal(podeFazer(com('tgl', 'c172'), 'TGL (TMA)', 'C172'), true);
    assert.equal(podeFazer(com('local'), 'TGL (TMA)', 'C152'), false);
  });

  // O checador é credenciado por partes; o cheque exige as três (o curso, o motor e as regras)
  it('voos de cheque exigem as três marcas do checador: o curso, o motor e as regras (só as de checador)', () => {
    const exige = {
      'Cheque PP': ['checa_pp', 'checa_mnte', 'checa_vfr'],
      'Cheque PC MNTE VFR': ['checa_pc', 'checa_mnte', 'checa_vfr'],
      'Cheque PC MNTE IFR': ['checa_pc', 'checa_mnte', 'checa_ifr'],
      'Cheque PC MLTE VFR': ['checa_pc', 'checa_mlte', 'checa_vfr'],
      'Cheque PC MLTE IFR': ['checa_pc', 'checa_mlte', 'checa_ifr']
    };
    for (const [mis, marcas] of Object.entries(exige)) {
      for (const eq of MIS[mis].eq) {
        assert.equal(podeFazer(com(...marcas), mis, eq), true, `${mis} no ${eq}`);
        for (const falta of marcas) assert.equal(podeFazer(com(...marcas.filter(h => h !== falta)), mis, eq), false, `${mis} sem ${falta}`);
      }
    }
    assert.equal(podeFazer(com('checa_pc', 'checa_mnte', 'checa_vfr'), 'Cheque PP', 'C152'), false, 'checador do PC não checa o PP');
    assert.equal(podeFazer(com('checa_pp', 'checa_mlte', 'checa_ifr'), 'Cheque PP', 'C152'), false, 'o PP é monomotor e VFR');
    assert.equal(podeFazer(com('local', 'ifr', 'c172', 'mlte'), 'Cheque PP', 'C152'), false, 'sem checador, não faz cheque');
    assert.equal(podeAlgumCheque(com('checa_pc', 'checa_mlte', 'checa_ifr')), true);
    assert.equal(podeAlgumCheque(com('checa_inva', 'checa_mnte', 'checa_vfr')), false, 'não há cheque de INVA na escala');
  });

  it('as habilitações de checador antigas (VFR, IFR e MLTE IFR) viram as marcas que davam os mesmos cheques', () => {
    const cheques = Object.keys(MIS).filter(m => m.startsWith('Cheque'));
    const antes = {
      checador_vfr: ['Cheque PP', 'Cheque PC MNTE VFR'],
      checador_ifr: ['Cheque PP', 'Cheque PC MNTE VFR', 'Cheque PC MNTE IFR'],
      checador_mlte: cheques
    };
    for (const [antiga, podia] of Object.entries(antes)) {
      const x = com(...marcasDoChecadorAntigo([antiga]));
      for (const mis of cheques) for (const eq of MIS[mis].eq) assert.equal(podeFazer(x, mis, eq), podia.includes(mis), `${antiga}: ${mis} no ${eq}`);
      assert.ok(x.hab.includes('checa_inva'), `${antiga}: o nome dizia INVA`);
    }
    assert.deepEqual(marcasDoChecadorAntigo(['local', 'c152']), ['local', 'c152']);
  });

  it('descreve o que a missão exige', () => {
    assert.equal(descreverExigencias('IFR', 'C172'), 'Voo IFR + C172');
    assert.equal(descreverExigencias('Multimotor', 'PA-34'), 'MLTE (PA-34)');
    assert.equal(descreverExigencias('Simulador', 'Sim. Multi'), 'Simulador (Multi)');
    assert.equal(descreverExigencias('Ground Navegação', 'Sala Ground'), 'Grounds (C152, C172 e Navegação)');
    assert.equal(descreverExigencias('TGL (TMA)', 'C172'), 'TGL (TMA) + C172');
    assert.equal(descreverExigencias('Cheque PC MNTE IFR', 'C172'), 'Checador do curso PC + Checador MNTE + Checador IFR');
  });
});

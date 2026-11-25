// A configuração do painel: o quadro com que ele abre e as colunas (quais e em que ordem). Fica no cadastro e vale para
// a visão "Painel" da Escala e para a TV da recepção; sem ela (ou com uma gravada fora do formato), vale o padrão.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUADROS_DO_PAINEL, COLUNAS_DO_PAINEL, LISTAS_DO_PAINEL, painelPadrao, normalizarPainel, colunasVisiveis, ehPadrao, alternarColuna,
  moverColuna, escolherQuadro, escolherListas, listasNaLargura, rotuloDaColuna, rotuloDasListas
} from '../../js/config-do-painel.js';
import { separar, juntar } from '../../js/dias.js';
import { ApiClient } from '../../js/storage.js';
import { ESQUEMA, migrarCadastro } from '../../js/migracoes.js';

const rotulos = painel => colunasVisiveis(painel).map(rotuloDaColuna);

describe('Configuração do painel', () => {
  it('o padrão: abre em Missões, com Horário, Aeronave, Modelo, Aluno, Instrutor e Missão; Previsto e Observação desligadas', () => {
    assert.deepEqual(QUADROS_DO_PAINEL.map(q => q.rotulo), ['Missões', 'Partidas e chegadas', 'Partidas', 'Chegadas']);
    assert.equal(painelPadrao().quadro, 'missoes');
    assert.deepEqual(rotulos(painelPadrao()), ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor', 'Missão']);
    assert.deepEqual(painelPadrao().colunas.filter(c => !c.on).map(c => rotuloDaColuna(c.id)), ['Previsto', 'Observação']);
    assert.equal(COLUNAS_DO_PAINEL.length, 8);
    // Sem configuração gravada, o padrão
    for (const vazio of [undefined, null, {}, [], 'missoes', 7]) assert.deepEqual(normalizarPainel(vazio), painelPadrao(), JSON.stringify(vazio));
    assert.equal(ehPadrao(undefined), true);
  });

  it('normaliza o que vem gravado: só quadros e colunas conhecidos, cada coluna uma vez; a que falta entra no fim, como no padrão', () => {
    const gravado = {
      quadro: 'pousos',
      colunas: [{ id: 'aluno', on: true }, { id: 'aluno', on: false }, { id: 'xpto', on: true }, null, 'horario', { id: 'observacao', on: 'sim' }, { id: 'missao', on: true }]
    };
    const painel = normalizarPainel(gravado);
    assert.equal(painel.quadro, 'missoes');
    assert.deepEqual(painel.colunas, [
      { id: 'aluno', on: true }, { id: 'observacao', on: false }, { id: 'missao', on: true },
      { id: 'horario', on: true }, { id: 'aeronave', on: true }, { id: 'modelo', on: true }, { id: 'instrutor', on: true }, { id: 'previsto', on: false }
    ]);
    assert.deepEqual(normalizarPainel({ quadro: 'chegadas' }).quadro, 'chegadas');
    // A normalização não muda o que já está normalizado
    assert.deepEqual(normalizarPainel(painel), painel);
  });

  it('pelo menos uma coluna fica ligada: desligar a última não vale; gravada sem nenhuma, ligam as do padrão', () => {
    let painel = painelPadrao();
    for (const id of ['horario', 'aeronave', 'modelo', 'aluno', 'instrutor']) painel = alternarColuna(painel, id, false);
    assert.deepEqual(rotulos(painel), ['Missão']);
    assert.equal(alternarColuna(painel, 'missao', false), null);
    assert.deepEqual(rotulos(alternarColuna(painel, 'observacao', true)), ['Missão', 'Observação']);
    const nenhuma = { quadro: 'partidas', colunas: COLUNAS_DO_PAINEL.map(c => ({ id: c.id, on: false })) };
    assert.deepEqual(normalizarPainel(nenhuma), { ...painelPadrao(), quadro: 'partidas' });
  });

  it('reordena uma posição para cima ou para baixo; na ponta, não muda', () => {
    const subiu = moverColuna(painelPadrao(), 'missao', -1);
    assert.deepEqual(rotulos(subiu), ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Missão', 'Instrutor']);
    const desceu = moverColuna(subiu, 'horario', 1);
    assert.deepEqual(rotulos(desceu), ['Aeronave', 'Horário', 'Modelo', 'Aluno', 'Missão', 'Instrutor']);
    // A coluna desligada também tem lugar: ligada depois, aparece onde está
    const previsto = moverColuna(painelPadrao(), 'previsto', -1);
    assert.deepEqual(rotulos(alternarColuna(previsto, 'previsto', true)), ['Horário', 'Aeronave', 'Modelo', 'Aluno', 'Instrutor', 'Previsto', 'Missão']);
    assert.equal(moverColuna(painelPadrao(), 'horario', -1), null);
    assert.equal(moverColuna(painelPadrao(), 'observacao', 1), null);
    assert.equal(moverColuna(painelPadrao(), 'xpto', 1), null);
    assert.equal(ehPadrao(moverColuna(subiu, 'missao', 1)), true);
  });

  // Pedro, 2026-11-20: "Listas", com Automático (o padrão: duas a partir de 1.600 px de largura), "Sempre uma lista" e
  // "Sempre duas listas lado a lado"
  it('as listas: Automático no padrão e na configuração gravada antes delas; só auto, uma ou duas', () => {
    assert.deepEqual(LISTAS_DO_PAINEL.map(l => [l.id, l.rotulo]), [
      ['auto', 'Automático'], ['uma', 'Sempre uma lista'], ['duas', 'Sempre duas listas lado a lado']
    ]);
    assert.equal(painelPadrao().listas, 'auto');
    assert.equal(normalizarPainel({ quadro: 'partidas', colunas: [] }).listas, 'auto', 'gravada antes das listas');
    for (const listas of ['uma', 'duas', 'auto']) assert.equal(normalizarPainel({ listas }).listas, listas);
    for (const listas of ['tres', 2, null, '__proto__', 'Duas', ['duas'], { duas: true }]) assert.equal(normalizarPainel({ listas }).listas, 'auto', JSON.stringify(listas));
    assert.equal(escolherListas(undefined, 'duas').listas, 'duas');
    assert.deepEqual(escolherListas(undefined, 'duas').colunas, painelPadrao().colunas);
    assert.equal(escolherListas(undefined, 'muitas'), null);
    assert.equal(ehPadrao(escolherListas(undefined, 'uma')), false);
    assert.equal(ehPadrao(escolherListas(undefined, 'auto')), true);
    assert.equal(rotuloDasListas('duas'), 'Sempre duas listas lado a lado');
    // Mudar o quadro ou as colunas não muda as listas
    assert.equal(escolherQuadro({ listas: 'duas' }, 'chegadas').listas, 'duas');
    assert.equal(alternarColuna({ listas: 'uma' }, 'previsto', true).listas, 'uma');
    assert.equal(moverColuna({ listas: 'duas' }, 'aluno', 1).listas, 'duas');
  });

  it('quantas listas: no Automático, duas a partir de 1.600 px de largura; nas outras, sempre as escolhidas', () => {
    assert.equal(listasNaLargura(undefined, 1599), 1);
    assert.equal(listasNaLargura(undefined, 1600), 2);
    assert.equal(listasNaLargura({ listas: 'auto' }, 2560), 2);
    assert.equal(listasNaLargura({ listas: 'auto' }, 1280), 1);
    assert.equal(listasNaLargura({ listas: 'uma' }, 2560), 1);
    assert.equal(listasNaLargura({ listas: 'duas' }, 1024), 2);
  });

  it('o quadro com que o painel abre: só os da lista', () => {
    assert.equal(escolherQuadro(undefined, 'alternar').quadro, 'alternar');
    assert.deepEqual(escolherQuadro(undefined, 'alternar').colunas, painelPadrao().colunas);
    assert.equal(escolherQuadro(undefined, 'xpto'), null);
    assert.equal(ehPadrao(escolherQuadro(undefined, 'partidas')), false);
  });
});

describe('A configuração do painel no cadastro', () => {
  const cadastro = { nid: 1000, ins: [], stu: [] };

  it('fica no cadastro (igual em todas as datas) só depois de mudada; o cadastro antigo, sem ela, abre no padrão', () => {
    const semConfig = ApiClient.normalizeAndMigrateState(juntar(cadastro));
    assert.equal(semConfig.painel, undefined);
    assert.equal(Object.hasOwn(separar(semConfig).cadastro, 'painel'), false);
    const painel = escolherListas(moverColuna(escolherQuadro(undefined, 'partidas'), 'aluno', -1), 'duas');
    const comConfig = ApiClient.normalizeAndMigrateState(juntar({ ...cadastro, painel }));
    assert.deepEqual(comConfig.painel, painel);
    const partes = separar(comConfig);
    assert.deepEqual(partes.cadastro.painel, painel);
    assert.equal(Object.hasOwn(partes.dia, 'painel'), false);
  });

  it('gravada fora do formato, volta normalizada', () => {
    const estado = ApiClient.normalizeAndMigrateState(juntar({ ...cadastro, painel: { quadro: 'xpto', colunas: 'tudo' } }));
    assert.deepEqual(estado.painel, painelPadrao());
  });

  it('o formato 25 traz o cadastro de antes sem mudar nada (o número novo faz a aba da versão anterior recarregar)', () => {
    // O número do formato fica fixado num lugar só (test/unit/migracoes.test.js); aqui, o formato atual
    assert.ok(ESQUEMA >= 25);
    const antes = { ...cadastro, frota: [], esquema: 24 };
    assert.deepEqual(migrarCadastro(antes), { ...antes, esquema: ESQUEMA });
  });
});

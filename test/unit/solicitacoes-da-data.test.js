// O cache dos pedidos da data aberta (js/solicitacoes-da-data.js): uma leitura de cada vez vale (a mais nova), a resposta de
// uma data que não está mais aberta não entra, a leitura que falha guarda o erro e a lista de antes, quem espera a leitura
// em curso a recebe, e a marca da escala que mudou em outro computador é da data. As dependências (a data aberta, a
// leitura, o relógio e o redesenho) são injetadas
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarSolicitacoesDaData } from '../../js/solicitacoes-da-data.js';

// Uma leitura que só responde quando o teste manda (responder(lista) ou falhar())
function leituraManual() {
  const pendentes = [];
  const ler = data => new Promise((resolve, reject) => pendentes.push({ data, resolve, reject }));
  return { ler, pendentes };
}

function montar({ data = '2026-11-11' } = {}) {
  const estado = { aberta: data, desenhos: 0, agora: new Date('2026-11-10T15:00:00Z') };
  const leitura = leituraManual();
  const cache = criarSolicitacoesDaData({
    dataAberta: () => estado.aberta, ler: leitura.ler, aoLer: () => { estado.desenhos++; }, agora: () => estado.agora
  });
  return { estado, leitura, cache };
}
const pedido = (id, data = '2026-11-11') => ({ id, data, aluno: 1000 + id, cancelada_em: null });

describe('Os pedidos da data aberta (o cache)', () => {
  it('antes da primeira leitura, a data aberta está "lendo"; lida, a lista, a hora da leitura e um redesenho', async () => {
    const { estado, leitura, cache } = montar();
    assert.deepEqual(cache.solicitacoesDaData(), { data: '2026-11-11', lista: null, leitura: 'lendo', lidaEm: null, erro: null, diaMudou: false });
    const lida = cache.lerSolicitacoesDaData();
    assert.equal(leitura.pendentes[0].data, '2026-11-11');
    leitura.pendentes[0].resolve([pedido(1)]);
    await lida;
    const agora = cache.solicitacoesDaData();
    assert.deepEqual([agora.leitura, agora.lista.map(p => p.id), agora.lidaEm.toISOString(), agora.erro], ['lidos', [1], '2026-11-10T15:00:00.000Z', null]);
    assert.equal(estado.desenhos, 1);
  });

  it('a resposta de uma data que não está mais aberta não entra (a outra data continua "lendo")', async () => {
    const { estado, leitura, cache } = montar();
    const lida = cache.lerSolicitacoesDaData();
    estado.aberta = '2026-11-12';
    leitura.pendentes[0].resolve([pedido(1)]);
    await lida;
    assert.deepEqual([cache.solicitacoesDaData().data, cache.solicitacoesDaData().leitura], ['2026-11-12', 'lendo']);
    assert.equal(estado.desenhos, 0);
  });

  it('a leitura pedida depois vale; a resposta atrasada da de antes, não', async () => {
    const { leitura, cache } = montar();
    const primeira = cache.lerSolicitacoesDaData();
    const segunda = cache.lerSolicitacoesDaData();
    leitura.pendentes[1].resolve([pedido(2)]);
    await segunda;
    leitura.pendentes[0].resolve([pedido(1)]);
    await primeira;
    assert.deepEqual(cache.solicitacoesDaData().lista.map(p => p.id), [2]);
  });

  it('a leitura que falha guarda o erro e a lista da leitura de antes (e a hora dela)', async () => {
    const { estado, leitura, cache } = montar();
    const lida = cache.lerSolicitacoesDaData();
    leitura.pendentes[0].resolve([pedido(1)]);
    await lida;
    estado.agora = new Date('2026-11-10T15:05:00Z');
    const falha = cache.lerSolicitacoesDaData();
    leitura.pendentes[1].reject(new Error('sem conexão'));
    await falha;
    const agora = cache.solicitacoesDaData();
    assert.deepEqual([agora.leitura, agora.lista.map(p => p.id), agora.lidaEm.toISOString(), agora.erro.message], ['erro', [1], '2026-11-10T15:00:00.000Z', 'sem conexão']);
    // A primeira leitura da data que falha: sem lista
    const outra = montar();
    const f = outra.cache.lerSolicitacoesDaData();
    outra.leitura.pendentes[0].reject(new Error('sem conexão'));
    await f;
    assert.deepEqual([outra.cache.solicitacoesDaData().leitura, outra.cache.solicitacoesDaData().lista], ['erro', null]);
  });

  it('quem espera os pedidos lidos recebe a leitura em curso; sem leitura nenhuma, uma é feita', async () => {
    const { leitura, cache } = montar();
    cache.lerSolicitacoesDaData();
    const esperando = cache.solicitacoesDaDataLidas();
    leitura.pendentes[0].resolve([pedido(1)]);
    assert.deepEqual((await esperando).lista.map(p => p.id), [1]);
    assert.equal(leitura.pendentes.length, 1, 'nenhuma leitura a mais');
    const outra = montar();
    const pedida = outra.cache.solicitacoesDaDataLidas();
    await Promise.resolve();
    outra.leitura.pendentes[0].resolve([]);
    assert.equal((await pedida).leitura, 'lidos');
  });

  it('a escala que mudou em outro computador é marcada na data aberta, com um redesenho; fica nas leituras seguintes e sai quando a data é lida de novo', async () => {
    const { estado, leitura, cache } = montar();
    const lida = cache.lerSolicitacoesDaData();
    leitura.pendentes[0].resolve([]);
    await lida;
    cache.marcarDiaMudou('2026-11-12');
    assert.equal(cache.solicitacoesDaData().diaMudou, false, 'outra data: nada');
    cache.marcarDiaMudou('2026-11-11');
    assert.deepEqual([cache.solicitacoesDaData().diaMudou, estado.desenhos], [true, 2]);
    const de = cache.lerSolicitacoesDaData();
    leitura.pendentes[1].resolve([]);
    await de;
    assert.equal(cache.solicitacoesDaData().diaMudou, true, 'a leitura dos pedidos não lê a escala');
    const relida = cache.lerSolicitacoesDaData({ dataLida: true });
    leitura.pendentes[2].resolve([]);
    await relida;
    assert.equal(cache.solicitacoesDaData().diaMudou, false);
  });
});

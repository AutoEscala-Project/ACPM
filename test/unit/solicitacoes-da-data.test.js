// O cache dos pedidos da data aberta (js/solicitacoes-da-data.js): uma leitura de cada vez vale (a mais nova), a resposta de
// uma data que não está mais aberta não entra, a leitura que falha guarda o erro e a lista de antes, quem espera a leitura
// em curso a recebe, e a marca da escala que mudou em outro computador é da data. D3: a vigia (a cada minuto com a página
// à vista, na volta à página, na volta da conexão e quando outra aba deste navegador muda a agenda), cada leitura dela
// perguntando se a escala da data mudou em outro computador, e as novidades entre duas leituras da mesma data. As
// dependências (a data aberta, a leitura, os relógios, o redesenho, a pergunta da escala, a página e o temporizador) são
// injetadas
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarSolicitacoesDaData } from '../../js/solicitacoes-da-data.js';

// Uma leitura que só responde quando o teste manda (responder(lista) ou falhar())
function leituraManual() {
  const pendentes = [];
  const ler = data => new Promise((resolve, reject) => pendentes.push({ data, resolve, reject }));
  return { ler, pendentes };
}

function montar({ data = '2026-11-11', diaMudou } = {}) {
  const estado = { aberta: data, desenhos: 0, agora: new Date('2026-11-10T15:00:00Z'), ms: 0, perguntas: [], novidades: [] };
  const leitura = leituraManual();
  const cache = criarSolicitacoesDaData({
    dataAberta: () => estado.aberta, ler: leitura.ler, aoLer: () => { estado.desenhos++; }, agora: () => estado.agora, relogio: () => estado.ms,
    diaMudou: diaMudou || (async d => { estado.perguntas.push(d); return false; })
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

// A página e a janela de mentira (os eventos visibilitychange, online e storage) e o temporizador que o teste dispara
function vigiado(opcoes = {}) {
  const m = montar(opcoes);
  const documento = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const janela = new EventTarget();
  const relogio = { fn: null, ms: null, parado: false };
  const parar = m.cache.vigiar({
    documento, janela, aoNovidades: (novidades, data) => m.estado.novidades.push({ data, novidades }),
    agendar: (fn, ms) => { relogio.fn = fn; relogio.ms = ms; return 7; }, desagendar: id => { relogio.parado = id === 7; }
  });
  const responder = async (lista, i = m.leitura.pendentes.length - 1) => { m.leitura.pendentes[i].resolve(lista); await new Promise(r => setTimeout(r, 0)); };
  const evento = (alvo, tipo, extra = {}) => alvo.dispatchEvent(Object.assign(new Event(tipo), extra));
  return { ...m, documento, janela, relogio, parar, responder, evento };
}
const aprovado = (id, data) => ({ ...pedido(id, data), aprovada_em: '2026-11-10T14:00:00Z' });

describe('Os pedidos em dia (D3: a vigia e as novidades)', () => {
  it('a cada minuto, com a página à vista e a data já lida, uma leitura que pergunta também pela escala da data', async () => {
    const { estado, leitura, cache, relogio, responder, documento } = vigiado();
    assert.equal(relogio.ms, 60000);
    // Antes da primeira leitura da data aberta (a abertura do app, o login), nada
    relogio.fn();
    assert.equal(leitura.pendentes.length, 0);
    cache.lerSolicitacoesDaData();
    relogio.fn();
    assert.equal(leitura.pendentes.length, 1, 'com uma leitura em curso, nenhuma outra');
    await responder([pedido(1)]);
    assert.deepEqual(estado.perguntas, [], 'a leitura que não é da vigia não pergunta pela escala');
    relogio.fn();
    assert.equal(leitura.pendentes.length, 2);
    assert.deepEqual(estado.perguntas, ['2026-11-11']);
    await responder([pedido(1), pedido(2)]);
    assert.deepEqual(cache.solicitacoesDaData().lista.map(p => p.id), [1, 2]);
    // Escondida (outra aba, a tela apagada), nada
    documento.visibilityState = 'hidden';
    relogio.fn();
    assert.equal(leitura.pendentes.length, 2);
  });

  it('na volta à página e na volta da conexão, uma leitura quando a última tem mais de 30 s; outra aba deste navegador que muda a agenda, sempre', async () => {
    const { estado, leitura, cache, documento, janela, responder, evento } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([]);
    estado.ms = 29999;
    evento(documento, 'visibilitychange');
    evento(janela, 'online');
    assert.equal(leitura.pendentes.length, 1, 'a leitura de agora há pouco vale');
    estado.ms = 30000;
    documento.visibilityState = 'hidden';
    evento(documento, 'visibilitychange');
    assert.equal(leitura.pendentes.length, 1, 'ao esconder, nada');
    documento.visibilityState = 'visible';
    evento(documento, 'visibilitychange');
    assert.equal(leitura.pendentes.length, 2);
    await responder([]);
    estado.ms = 61000;
    evento(janela, 'online');
    assert.equal(leitura.pendentes.length, 3);
    await responder([]);
    assert.deepEqual(estado.perguntas, ['2026-11-11', '2026-11-11'], 'cada leitura da vigia pergunta pela escala');
    evento(janela, 'storage', { key: 'acpm_tema' });
    assert.equal(leitura.pendentes.length, 3, 'outra chave, nada');
    evento(janela, 'storage', { key: 'acpm4_agenda' });
    assert.equal(leitura.pendentes.length, 4);
  });

  it('parar a vigia tira o temporizador e os eventos', async () => {
    const { leitura, cache, documento, janela, relogio, parar, responder, evento } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([]);
    parar();
    assert.equal(relogio.parado, true);
    evento(janela, 'storage', { key: 'acpm4_agenda' });
    evento(documento, 'visibilitychange');
    assert.equal(leitura.pendentes.length, 1);
  });

  it('a escala que mudou em outro computador, pela pergunta da vigia: marcada com um redesenho, sem perguntar de novo até a data ser lida; a resposta de antes da data lida de novo não vale', async () => {
    const perguntas = [];
    const { estado, cache, relogio, responder } = vigiado({ diaMudou: data => new Promise(resolve => perguntas.push(() => resolve(data === '2026-11-11'))) });
    const esperar = () => new Promise(r => setTimeout(r, 0));
    cache.lerSolicitacoesDaData();
    await responder([]);
    relogio.fn();
    await responder([]);
    assert.equal(cache.solicitacoesDaData().diaMudou, false, 'a lista não espera a pergunta');
    const desenhos = estado.desenhos;
    perguntas[0]();
    await esperar();
    assert.deepEqual([cache.solicitacoesDaData().diaMudou, estado.desenhos], [true, desenhos + 1]);
    // Marcada, a vigia lê os pedidos sem perguntar de novo
    relogio.fn();
    await responder([]);
    assert.equal(perguntas.length, 1);
    // A data lida de novo ("Atualizar"): a marca sai, e a vigia volta a perguntar
    cache.lerSolicitacoesDaData({ dataLida: true });
    await responder([]);
    assert.equal(cache.solicitacoesDaData().diaMudou, false);
    relogio.fn();
    await responder([]);
    assert.equal(perguntas.length, 2);
    // A data lida de novo enquanto a pergunta espera: a resposta dela é da escala de antes
    cache.lerSolicitacoesDaData({ dataLida: true });
    await responder([]);
    perguntas[1]();
    await esperar();
    assert.equal(cache.solicitacoesDaData().diaMudou, false);
    // A resposta de outra data aberta durante a pergunta também não vale
    relogio.fn();
    await responder([]);
    estado.aberta = '2026-11-12';
    perguntas[2]();
    await esperar();
    estado.aberta = '2026-11-11';
    assert.equal(cache.solicitacoesDaData().diaMudou, false);
  });

  it('a pergunta que falha não marca nada nem atrapalha a lista', async () => {
    const { cache, relogio, responder } = vigiado({ diaMudou: async () => { throw new Error('sem conexão'); } });
    cache.lerSolicitacoesDaData();
    await responder([]);
    relogio.fn();
    await responder([pedido(1)]);
    assert.deepEqual([cache.solicitacoesDaData().leitura, cache.solicitacoesDaData().diaMudou, cache.solicitacoesDaData().lista.length], ['lidos', false, 1]);
  });

  it('as novidades entre duas leituras da mesma data, depois do redesenho; sem elas, na primeira leitura da data, numa leitura que falhou ou de outra data, nada', async () => {
    const { estado, leitura, cache, relogio, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1), pedido(2)]);
    assert.deepEqual(estado.novidades, [], 'a primeira leitura da data não tem com o que comparar');
    relogio.fn();
    await responder([pedido(1), pedido(2)]);
    assert.deepEqual(estado.novidades, [], 'nada mudou');
    relogio.fn();
    await responder([aprovado(1), pedido(2), pedido(3)]);
    assert.equal(estado.novidades.length, 1);
    assert.deepEqual([estado.novidades[0].data, estado.novidades[0].novidades.novas.map(p => p.id), estado.novidades[0].novidades.aprovadas.map(p => p.id)], ['2026-11-11', [3], [1]]);
    // A leitura que falha não é comparada; a seguinte compara com a última lida
    relogio.fn();
    leitura.pendentes.at(-1).reject(new Error('sem conexão'));
    await new Promise(r => setTimeout(r, 0));
    relogio.fn();
    await responder([aprovado(1), pedido(2), pedido(3), pedido(4)]);
    assert.deepEqual(estado.novidades.map(n => n.novidades.novas.map(p => p.id)), [[3], [4]]);
    // Outra data: a primeira leitura dela não compara com a de antes
    estado.aberta = '2026-11-12';
    cache.lerSolicitacoesDaData({ dataLida: true });
    await responder([pedido(9, '2026-11-12')]);
    assert.equal(estado.novidades.length, 2);
  });

  it('o que este navegador acabou de mudar (registrar, aprovar, retirar, cancelar) não é novidade; o que outro mudou junto, é', async () => {
    const { estado, cache, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1), pedido(2)]);
    cache.lerSolicitacoesDaData({ deste: [1, 3] });
    await responder([aprovado(1), aprovado(2), pedido(3)]);
    assert.deepEqual(estado.novidades.map(n => [n.novidades.aprovadas.map(p => p.id), n.novidades.novas.map(p => p.id)]), [[[2], []]]);
  });
});

// A revisão do D3: o que este navegador mudou continua fora das novidades até uma leitura boa da data o mostrar (a leitura
// dele trocada por outra mais nova, ou que falhou, não o perde); uma pergunta pela escala de cada vez; e, no modo local, a
// escala da data aberta gravada por outra aba deste navegador (a chave do dia) faz a pergunta
describe('Os pedidos em dia (D3, a revisão)', () => {
  it('duas ações deste navegador seguidas: a leitura da 1ª trocada pela da 2ª não faz da 1ª uma novidade', async () => {
    const { estado, cache, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1), pedido(2)]);
    cache.lerSolicitacoesDaData({ deste: [1] });
    cache.lerSolicitacoesDaData({ deste: [2] });
    await responder([aprovado(1), pedido(2)], 0 + 1);
    await responder([aprovado(1), aprovado(2)]);
    assert.deepEqual(estado.novidades, []);
  });

  it('a leitura da ação deste navegador que falha: a leitura boa seguinte (a da vigia) não a conta como novidade', async () => {
    const { estado, leitura, cache, relogio, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1), pedido(2)]);
    cache.lerSolicitacoesDaData({ deste: [1] });
    leitura.pendentes.at(-1).reject(new Error('sem conexão'));
    await new Promise(r => setTimeout(r, 0));
    relogio.fn();
    await responder([aprovado(1), aprovado(2)]);
    assert.deepEqual(estado.novidades.map(n => n.novidades.aprovadas.map(p => p.id)), [[2]], 'só o que outro computador aprovou');
    // Depois de uma leitura boa que o mostrou, o pedido volta a ser de todos: outra mudança dele é novidade
    relogio.fn();
    await responder([{ ...aprovado(1), cancelada_em: '2026-11-10T16:00:00Z' }, aprovado(2)]);
    assert.deepEqual(estado.novidades.at(-1).novidades.canceladas.map(p => p.id), [1]);
  });

  it('a leitura sem "deste" (abrir Pedidos, "Tentar de novo", "Importar") pedida depois da de uma ação: a ação continua fora', async () => {
    const { estado, cache, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1)]);
    cache.lerSolicitacoesDaData({ deste: [1] });
    cache.lerSolicitacoesDaData();
    await responder([aprovado(1)], 1);
    await responder([aprovado(1)]);
    assert.deepEqual(estado.novidades, []);
  });

  it('os pedidos deste navegador de uma data não valem para outra', async () => {
    const { estado, cache, responder } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([pedido(1)]);
    cache.lerSolicitacoesDaData({ deste: [1] });
    estado.aberta = '2026-11-12';
    cache.lerSolicitacoesDaData({ dataLida: true });
    await responder([aprovado(1)], 1);
    await responder([pedido(1, '2026-11-12')]);
    cache.lerSolicitacoesDaData();
    await responder([aprovado(1, '2026-11-12')]);
    assert.deepEqual(estado.novidades.map(n => n.novidades.aprovadas.map(p => p.id)), [[1]]);
  });

  it('uma pergunta pela escala de cada vez: com uma que não volta (a gravação presa deste navegador), a vigia não abre outra', async () => {
    let perguntas = 0;
    const { cache, relogio, responder } = vigiado({ diaMudou: () => { perguntas++; return new Promise(() => {}); } });
    cache.lerSolicitacoesDaData();
    await responder([]);
    for (let i = 0; i < 10; i++) {
      relogio.fn();
      await responder([]);
    }
    assert.equal(perguntas, 1);
  });

  it('a pergunta que volta libera a seguinte', async () => {
    const respostas = [];
    const { cache, relogio, responder } = vigiado({ diaMudou: () => new Promise(resolve => respostas.push(resolve)) });
    cache.lerSolicitacoesDaData();
    await responder([]);
    relogio.fn();
    await responder([]);
    respostas[0](false);
    await new Promise(r => setTimeout(r, 0));
    relogio.fn();
    await responder([]);
    assert.equal(respostas.length, 2);
  });

  it('no modo local, a escala da data aberta gravada por outra aba (a chave do dia): a pergunta pela escala, sem ler os pedidos', async () => {
    const { estado, leitura, cache, janela, responder, evento } = vigiado();
    cache.lerSolicitacoesDaData();
    await responder([]);
    evento(janela, 'storage', { key: 'acpm4_dia_2026-11-12' });
    assert.deepEqual(estado.perguntas, [], 'outra data, nada');
    evento(janela, 'storage', { key: 'acpm4_dia_2026-11-11' });
    assert.deepEqual(estado.perguntas, ['2026-11-11']);
    assert.equal(leitura.pendentes.length, 1);
  });
});

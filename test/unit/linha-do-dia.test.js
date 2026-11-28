// A linha do dia (js/linha-do-dia.js): os quatro cartões (Pedidos, Processamento, Escala, Aprovar), cada um com o valor dele, o
// estado (o pior das tarefas) e as tarefas, o selo de Recursos e os avisos da data. Dados fictícios, sem o motor
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDoDia, selosDosCadastros, avisosDaData, resumosDaEscala } from '../../js/linha-do-dia.js';

const DATA = '2026-11-11', HOJE = '2026-11-10';

// Os alunos dos pedidos (1001 a 1010), ativos no cadastro
const ALUNOS = Array.from({ length: 10 }, (_, i) => ({ id: 1001 + i, nm: `Aluno ${1001 + i}` }));
function contexto({ pedidos = [], leitura = 'lidos', out = [], al = [], tot = 0, res = true, frota, av = {}, ins, importadas = [], aprovacao = null, revisao = {}, perfil = null, opera = true, horasLidas = true, stu = ALUNOS, indisponiveis = [], fechamentos, win } = {}) {
  return {
    S: {
      frota: frota ?? [{ reg: 'PR-AAA', tipo: 'C152' }, { reg: 'PR-BBB', tipo: 'C152' }],
      av, ins: ins ?? [{ id: 1, nm: 'Instrutor 01', on: true }, { id: 2, nm: 'Instrutor 02', on: true }],
      stu, importadas, aprovacao, ...(fechamentos ? { fechamentos } : {}), ...(win ? { win } : {})
    },
    RES: res ? { out, al, tot, revisao } : null,
    pedidos: leitura === 'lidos' ? pedidos : null,
    leituraDosPedidos: leitura,
    perfil, opera, horasLidas, indisponiveis, data: DATA, hoje: HOJE
  };
}
const pedido = (id, extra = {}) => ({ id, data: DATA, aluno: 1000 + id, cancelada_em: null, ...extra });
const aprovado = (id, extra = {}) => pedido(id, { aprovada_em: '2026-11-10T14:00:00Z', ...extra });
const cartao = (ctx, id) => linhaDoDia(ctx).find(c => c.id === id);
const tarefa = (ctx, cartaoId, tarefaId) => cartao(ctx, cartaoId).tarefas.find(t => t.id === tarefaId);
const voo = n => Array.from({ length: n }, (_, i) => ({ fKey: `${1000 + i}_0_1` }));

describe('A linha do dia', () => {
  it('quatro cartões, na ordem das etapas, cada um com a tela dele', () => {
    assert.deepEqual(linhaDoDia(contexto()).map(c => [c.id, c.tela]), [['pedidos', 'age'], ['processamento', 'proc'], ['escala', 'esc'], ['aprovar', 'apr']]);
  });

  // Pedidos (D2): os registrados (não cancelados), os que aguardam aprovação (pedem atenção de hoje em diante), os aprovados
  // e, para quem opera, os aprovados que ainda não estão na escala (G2: a tarefa leva ao Processamento)
  it('Pedidos: os registrados, os que aguardam aprovação, os aprovados e os aprovados fora da escala', () => {
    const ctx = contexto({ pedidos: [pedido(1), aprovado(2), aprovado(3), aprovado(4, { cancelada_em: '2026-11-10T10:00:00Z' })], importadas: [2] });
    const c = cartao(ctx, 'pedidos');
    assert.equal(c.valor, '3');
    assert.equal(c.estado, 'atencao');
    assert.deepEqual(c.tarefas.map(t => [t.id, t.rotulo, t.valor, t.estado]), [
      ['registrados', 'pedidos da data', '3', 'feito'], ['aguardando', 'aguardando aprovação', '1', 'atencao'], ['aprovados', 'aprovados', '2 de 3', 'andamento'],
      ['fora-da-escala', 'aprovado fora da escala', '1', 'atencao']
    ]);
    assert.deepEqual([c.tarefas[0].destino, c.tarefas[3].destino], [{ tela: 'age' }, { tela: 'proc' }]);
  });

  // O rótulo vai depois do número na frase do leitor de tela ("1 aprovado fora da escala"): concorda com ele
  it('Pedidos: o rótulo de cada tarefa concorda com o número dela', () => {
    const rotulos = ctx => cartao(ctx, 'pedidos').tarefas.map(t => `${t.valor} ${t.rotulo}`);
    assert.deepEqual(rotulos(contexto({ pedidos: [aprovado(1)] })), ['1 pedido da data', '0 aguardando aprovação', '1 de 1 aprovados', '1 aprovado fora da escala']);
    assert.deepEqual(rotulos(contexto({ pedidos: [aprovado(1), aprovado(2)] })), ['2 pedidos da data', '0 aguardando aprovação', '2 de 2 aprovados', '2 aprovados fora da escala']);
  });

  // F3: o pedido do aluno inativo fica fora dos pendentes. Em D2, o que ninguém pode aprovar (o aluno inativo ou fora do
  // cadastro: Pedidos não oferece "Aprovar") nem importar (fora do cadastro, ele espera) não pede atenção, no cartão e no trilho
  it('o pedido que aguarda de um aluno inativo ou fora do cadastro não pede atenção; o aprovado de um aluno fora do cadastro não conta como fora da escala', () => {
    const inativo = contexto({ pedidos: [pedido(1)], stu: [{ id: 1001, nm: 'Aluno Fictício', inativo: true }] });
    assert.deepEqual([tarefa(inativo, 'pedidos', 'aguardando').valor, tarefa(inativo, 'pedidos', 'aguardando').estado], ['0', 'feito']);
    assert.notEqual(cartao(inativo, 'pedidos').estado, 'atencao');
    assert.deepEqual(avisosDaData(inativo), []);
    const foraDoCadastro = contexto({ pedidos: [pedido(1), aprovado(2)], stu: [] });
    assert.deepEqual(['aguardando', 'fora-da-escala'].map(t => tarefa(foraDoCadastro, 'pedidos', t).valor), ['0', '0']);
    assert.notEqual(cartao(foraDoCadastro, 'pedidos').estado, 'atencao');
    assert.deepEqual(avisosDaData(foraDoCadastro), []);
  });

  it('Pedidos: todos aprovados e na escala, feito; sem pedidos, pendente; a leitura que falhou, falhou', () => {
    const feito = cartao(contexto({ pedidos: [aprovado(1)], importadas: [1] }), 'pedidos');
    assert.deepEqual([feito.estado, ...feito.tarefas.map(t => t.estado)], ['feito', 'feito', 'feito', 'feito', 'feito']);
    const vazio = cartao(contexto(), 'pedidos');
    assert.deepEqual(vazio.tarefas.map(t => t.estado), ['pendente', 'nenhum', 'nenhum', 'nenhum']);
    assert.equal(vazio.estado, 'pendente');
    const erro = cartao(contexto({ leitura: 'erro' }), 'pedidos');
    assert.deepEqual(erro.tarefas.map(t => t.estado), ['falhou', 'falhou', 'falhou', 'falhou']);
    assert.equal(erro.estado, 'falhou');
    assert.equal(erro.valor, '—');
  });

  it('numa data que já passou, o que aguarda e o aprovado fora da escala não pedem atenção', () => {
    const ctx = { ...contexto({ pedidos: [pedido(1), aprovado(2)] }), data: '2026-11-09' };
    assert.deepEqual(cartao(ctx, 'pedidos').tarefas.map(t => [t.id, t.estado]), [['registrados', 'feito'], ['aguardando', 'nenhum'], ['aprovados', 'andamento'], ['fora-da-escala', 'nenhum']]);
    assert.deepEqual(avisosDaData(ctx), []);
  });

  it('o pedido aprovado de um aluno inativo não conta como fora da escala', () => {
    const ctx = contexto({ pedidos: [aprovado(1)], stu: [{ id: 1001, nm: 'Aluno Fictício', inativo: true }] });
    assert.equal(tarefa(ctx, 'pedidos', 'fora-da-escala').valor, '0');
  });

  it('quem não opera a escala (Gestor, Secretaria) não vê "aprovados fora da escala"', () => {
    const ctx = contexto({ pedidos: [aprovado(1)], opera: false });
    assert.deepEqual(cartao(ctx, 'pedidos').tarefas.map(t => t.id), ['registrados', 'aguardando', 'aprovados']);
    assert.equal(cartao(ctx, 'pedidos').estado, 'feito');
  });

  it('Processamento: as missões pedidas; os recursos e os instrutores que vêm', () => {
    const ctx = contexto({ tot: 7, out: voo(7), av: { 'PR-BBB': false }, ins: [{ id: 1, on: true }, { id: 2, on: false }, { id: 3, on: true }] });
    const c = cartao(ctx, 'processamento');
    assert.equal(c.valor, '7');
    assert.deepEqual(c.tarefas.map(t => [t.id, t.valor, t.estado, t.destino.tela]), [['recursos', '1 de 2', 'feito', 'rec'], ['invas', '2 de 3', 'feito', 'ins']]);
    assert.equal(c.estado, 'feito');
  });

  it('Processamento: nenhum recurso disponível falha; um avião parado ou perto da revisão pede atenção; a frota vazia fica pendente', () => {
    assert.equal(tarefa(contexto({ av: { 'PR-AAA': false, 'PR-BBB': false } }), 'processamento', 'recursos').estado, 'falhou');
    assert.equal(tarefa(contexto({ revisao: { 'PR-AAA': { paraAs: null, fim: 47 } } }), 'processamento', 'recursos').estado, 'atencao');
    assert.equal(tarefa(contexto({ revisao: { 'PR-AAA': { paraAs: 600, fim: 50 } } }), 'processamento', 'recursos').estado, 'atencao');
    assert.equal(tarefa(contexto({ revisao: { 'PR-AAA': { paraAs: null, fim: 30 } } }), 'processamento', 'recursos').estado, 'feito');
    assert.equal(tarefa(contexto({ frota: [] }), 'processamento', 'recursos').estado, 'pendente');
  });

  it('Processamento: ninguém vem falha com missões pedidas e não conta sem elas; sem as horas dos instrutores, atenção', () => {
    const ninguem = [{ id: 1, on: false }];
    assert.equal(tarefa(contexto({ tot: 2, ins: ninguem }), 'processamento', 'invas').estado, 'falhou');
    assert.equal(tarefa(contexto({ tot: 0, ins: ninguem }), 'processamento', 'invas').estado, 'nenhum');
    assert.equal(tarefa(contexto({ horasLidas: false }), 'processamento', 'invas').estado, 'atencao');
    assert.equal(tarefa(contexto({ ins: [] }), 'processamento', 'invas').estado, 'pendente');
  });

  it('Processamento: o instrutor e o recurso inativos não contam, de hoje em diante', () => {
    const ctx = contexto({ frota: [{ reg: 'PR-AAA', tipo: 'C152' }, { reg: 'PR-BBB', tipo: 'C152', inativo: true }], ins: [{ id: 1, on: true }, { id: 2, on: true, inativo: true }] });
    assert.equal(tarefa(ctx, 'processamento', 'recursos').valor, '1 de 1');
    assert.equal(tarefa(ctx, 'processamento', 'invas').valor, '1 de 1');
  });

  it('Escala: na escala de quantas pedidas; o que não entrou falha; conflitos falham; avisos pedem atenção', () => {
    const al = [{ t: 'err' }, { t: 'conf' }, { t: 'warn' }, { t: 'warn' }];
    const c = cartao(contexto({ tot: 21, out: voo(20), al }), 'escala');
    assert.equal(c.valor, '20 de 21');
    assert.deepEqual(c.tarefas.map(t => [t.id, t.valor, t.estado]), [['montada', '20 de 21', 'falhou'], ['conflitos', '3', 'falhou']]);
    assert.equal(c.estado, 'falhou');
    const avisos = cartao(contexto({ tot: 3, out: voo(3), al: [{ t: 'warn' }] }), 'escala');
    assert.deepEqual(avisos.tarefas.map(t => t.estado), ['feito', 'atencao']);
    assert.equal(avisos.estado, 'atencao');
  });

  it('Escala: tudo certo, feito; sem missões pedidas, pendente', () => {
    assert.equal(cartao(contexto({ tot: 2, out: voo(2) }), 'escala').estado, 'feito');
    const vazia = cartao(contexto({ tot: 0 }), 'escala');
    assert.deepEqual(vazia.tarefas.map(t => t.estado), ['pendente', 'pendente']);
    assert.equal(vazia.valor, '0 de 0');
  });

  it('Aprovar: a hora e quem aprovou; não aprovada, pendente; sem as horas, atenção; sem voo, nenhum', () => {
    const em = new Date(2026, 10, 10, 18, 5).toISOString();
    const aprovada = cartao(contexto({ tot: 1, out: voo(1), aprovacao: { em, por: 'Operador 01' } }), 'aprovar');
    assert.equal(aprovada.valor, '18:05');
    assert.deepEqual(aprovada.tarefas.map(t => [t.id, t.rotulo, t.estado]), [['aprovada', 'aprovada às 18:05 por Operador 01', 'feito']]);
    const pendente = cartao(contexto({ tot: 1, out: voo(1) }), 'aprovar');
    assert.deepEqual([pendente.valor, pendente.estado, pendente.tarefas[0].rotulo], ['—', 'pendente', 'não aprovada']);
    assert.equal(cartao(contexto({ tot: 1, out: voo(1), horasLidas: false }), 'aprovar').estado, 'atencao');
    const semVoo = cartao(contexto({ tot: 0 }), 'aprovar');
    assert.deepEqual([semVoo.estado, semVoo.tarefas[0].rotulo], ['nenhum', 'nenhum voo']);
  });

  it('o estado do cartão é o pior das tarefas; "nenhum" não conta', () => {
    const ctx = contexto({ pedidos: [pedido(1)], importadas: [] });
    assert.equal(cartao(ctx, 'pedidos').estado, 'atencao');
    assert.equal(cartao(contexto({ tot: 0, ins: [{ id: 1, on: false }] }), 'processamento').estado, 'feito');
  });

  it('cada valor tem o mesmo sentido em todos os estados: a dica diz qual', () => {
    for (const ctx of [contexto(), contexto({ tot: 5, out: voo(4), al: [{ t: 'err' }], pedidos: [pedido(1)] }), contexto({ leitura: 'erro' })]) {
      const [pedidos, processamento, escala] = linhaDoDia(ctx);
      assert.match(pedidos.dica, /^(\d+ pedidos? nesta data|Os pedidos desta data não foram lidos)/);
      assert.match(processamento.dica, /^\d+ miss(ão pedida|ões pedidas)$/);
      assert.match(escala.dica, /^\d+ de \d+ miss(ão|ões) na escala$/);
    }
  });

  it('sem a escala (a data ainda abrindo), nada falha', () => {
    const cartoes = linhaDoDia(contexto({ res: false, leitura: 'lendo' }));
    assert.equal(cartoes.length, 4);
    assert.ok(cartoes.every(c => c.estado !== 'falhou'));
  });
});

describe('O selo de Recursos', () => {
  it('os aviões parados ou perto da revisão de 50 horas, também na Secretaria e no Gestor', () => {
    const ctx = contexto({ revisao: { 'PR-AAA': { paraAs: 600, fim: 50 }, 'PR-BBB': { paraAs: null, fim: 46 } } });
    assert.deepEqual(selosDosCadastros(ctx), { rec: { valor: '2', estado: 'atencao', dica: '2 aviões parados ou perto da revisão de 50 horas' } });
  });

  it('nenhum: sem selo; o avião indisponível ou inativo não conta', () => {
    assert.deepEqual(selosDosCadastros(contexto()), {});
    assert.deepEqual(selosDosCadastros(contexto({ av: { 'PR-AAA': false }, revisao: { 'PR-AAA': { paraAs: 600, fim: 50 } } })), {});
    const inativo = contexto({ frota: [{ reg: 'PR-AAA', tipo: 'C152', inativo: true }], revisao: { 'PR-AAA': { paraAs: 600, fim: 50 } } });
    assert.deepEqual(selosDosCadastros(inativo), {});
    assert.equal(selosDosCadastros(contexto({ revisao: { 'PR-AAA': { paraAs: null, fim: 46 } } })).rec.dica, '1 avião parado ou perto da revisão de 50 horas');
  });
});

describe('Os avisos da data', () => {
  const ids = ctx => avisosDaData(ctx).map(a => a.id);

  it('nada a resolver: nenhum aviso', () => {
    assert.deepEqual(avisosDaData(contexto()), []);
    assert.deepEqual(avisosDaData(contexto({ res: false, leitura: 'lendo' })), []);
  });

  it('um por alerta da escala, com o horário do voo dele quando ele está na escala', () => {
    const out = [{ fKey: '1000_0_1', a: 500, b: 560 }];
    const al = [
      { t: 'conf', s: 'Aluno 01', m: 'Conflito na escala aprovada: avião em manutenção.', fKey: '1000_0_1' },
      { t: 'err', s: 'Aluno 02', m: 'Rejeitado: sem avião.', codigo: 'sem-recurso' },
      { t: 'warn', s: 'Aluno 03', m: 'Fora da escala.', fKey: '1003_0_1' }
    ];
    assert.deepEqual(avisosDaData(contexto({ out, al, tot: 3 })), [
      { id: 'err:sem-recurso', gravidade: 'erro', minuto: null, titulo: 'Aluno 02', texto: 'Rejeitado: sem avião.', destino: { tela: 'esc' }, grupo: 'erros' },
      {
        id: 'conf:1000_0_1', gravidade: 'erro', minuto: 500, duracaoMin: 60, titulo: 'Aluno 01', texto: 'Conflito na escala aprovada: avião em manutenção.', destino: { tela: 'esc' },
        grupo: 'conflitos', acao: { tipo: 'reparo', fKey: '1000_0_1', rotulo: 'Sugestões', dica: 'O que pode voar no lugar deste voo' }
      },
      { id: 'warn:1003_0_1', gravidade: 'aviso', minuto: null, titulo: 'Aluno 03', texto: 'Fora da escala.', destino: { tela: 'esc' }, grupo: 'avisos' }
    ]);
  });

  it('a ordem: erro antes de aviso; em cada um, os sem horário primeiro, depois pelo horário e pelo id', () => {
    const out = [{ fKey: '1_0_1', a: 900, b: 960 }, { fKey: '2_0_1', a: 390, b: 450 }, { fKey: '3_0_1', a: 390, b: 450 }];
    const al = [
      { t: 'warn', s: 'f', m: '', fKey: '2_0_1' }, { t: 'conf', s: 'c', m: '', fKey: '1_0_1' }, { t: 'conf', s: 'b', m: '', fKey: '3_0_1' },
      { t: 'conf', s: 'a', m: '', fKey: '2_0_1' }, { t: 'err', s: 'e', m: '', stuId: 1009, codigo: 'x' }
    ];
    assert.deepEqual(ids(contexto({ out, al })), ['err:x-1009', 'conf:2_0_1', 'conf:3_0_1', 'conf:1_0_1', 'warn:2_0_1']);
  });

  it('dois alertas do mesmo voo têm ids diferentes', () => {
    const al = [{ t: 'warn', s: 'Aluno 01', m: 'A', fKey: '1_0_1' }, { t: 'warn', s: 'Aluno 01', m: 'B', fKey: '1_0_1' }];
    assert.deepEqual(ids(contexto({ al })), ['warn:1_0_1', 'warn:1_0_1:2']);
  });

  it('os aviões parados ou perto da revisão: em Recursos; a Secretaria, que não a vê, sem destino', () => {
    const revisao = { 'PR-AAA': { fim: 47, paraAs: null }, 'PR-BBB': { fim: 50, paraAs: 600 } };
    const [aviso] = avisosDaData(contexto({ revisao }));
    assert.deepEqual(aviso, { id: 'recursos', gravidade: 'aviso', minuto: null, titulo: '2 aviões parados ou perto da revisão de 50 horas', texto: '', destino: { tela: 'rec' } });
    assert.deepEqual(avisosDaData(contexto({ revisao, perfil: 'secretaria', opera: false })).map(a => a.destino), [null]);
    assert.deepEqual(avisosDaData(contexto({ revisao, perfil: 'gestor', opera: false })).map(a => a.destino), [{ tela: 'rec' }]);
  });

  // B: os horários fechados da data são um aviso de informação (sem horário, depois dos erros e dos avisos), que leva ao
  // bloco deles na Escala; os de um dia de antes do formato 28 vêm do win. Nada fechado, nenhum aviso
  it('os horários fechados nesta data: um aviso de informação, que leva ao bloco deles na Escala', () => {
    assert.deepEqual(avisosDaData(contexto()), []);
    assert.deepEqual(avisosDaData(contexto({ fechamentos: [] })), []);
    const fechamentos = [{ de: 760, ate: 1050 }, { de: 360, ate: 1440, categorias: ['C172'] }];
    assert.deepEqual(avisosDaData(contexto({ fechamentos })), [{
      id: 'horarios-fechados', gravidade: 'info', minuto: null,
      titulo: 'Horários fechados nesta data: 12:40–17:30 · todos os recursos; 06:00–24:00 · C172', texto: '', destino: { tela: 'esc', item: 'fechamentos' }
    }]);
    // Para todos os perfis (a Escala, todos veem), e depois dos avisos
    const revisao = { 'PR-AAA': { fim: 47, paraAs: null } };
    assert.deepEqual(avisosDaData(contexto({ fechamentos, revisao, perfil: 'secretaria', opera: false })).map(a => a.id), ['recursos', 'horarios-fechados']);
    // O dia de antes do formato 28: as janelas fechadas do win
    const win = [true, true, true, true, false, false, false, false, true];
    assert.equal(avisosDaData(contexto({ win }))[0].titulo, 'Horários fechados nesta data: 12:40–17:30 · todos os recursos');
  });

  // A sugestão do Gabriel no #109 (WCAG 2.2.1): o aviso das novidades dos pedidos some; as últimas ficam no trilho, para
  // serem lidas de novo, antes dos outros avisos dos pedidos, também sem os pedidos lidos ou numa data passada
  it('as últimas novidades dos pedidos ficam nos avisos, uma informação que leva a Pedidos', () => {
    const novidades = { texto: 'Pedidos de qua 11/11: 1 novo, 1 cancelado.', hora: '14:05' };
    const item = { id: 'novidades-dos-pedidos', gravidade: 'info', minuto: null, titulo: 'Novidades dos pedidos às 14:05: Pedidos de qua 11/11: 1 novo, 1 cancelado.', texto: '', destino: { tela: 'age' } };
    assert.deepEqual(avisosDaData({ ...contexto({ pedidos: [pedido(1)] }), novidades }).map(a => a.id), ['pedidos-aguardando', 'novidades-dos-pedidos']);
    assert.deepEqual(avisosDaData({ ...contexto({ pedidos: [aprovado(1)], importadas: [1] }), novidades }), [item]);
    assert.deepEqual(avisosDaData({ ...contexto({ leitura: 'lendo' }), novidades }), [item]);
    assert.deepEqual(avisosDaData(contexto({ pedidos: [aprovado(1)], importadas: [1] })), []);
  });

  it('os pedidos que aguardam aprovação (para todos) e os aprovados fora da escala (só para quem opera), só lidos', () => {
    const pedidos = [pedido(1), aprovado(2), aprovado(3), pedido(4, { cancelada_em: 'x' })];
    assert.deepEqual(avisosDaData(contexto({ pedidos })).map(a => [a.id, a.titulo, a.gravidade, a.destino]), [
      ['fora-da-escala', '2 pedidos aprovados fora da escala', 'aviso', { tela: 'proc' }], ['pedidos-aguardando', '1 pedido aguardando aprovação', 'aviso', { tela: 'age' }]
    ]);
    assert.deepEqual(avisosDaData(contexto({ pedidos, importadas: [2] })).map(a => a.titulo), ['1 pedido aprovado fora da escala', '1 pedido aguardando aprovação']);
    assert.deepEqual(avisosDaData(contexto({ pedidos: [aprovado(2)], importadas: [2] })), []);
    assert.deepEqual(avisosDaData(contexto({ pedidos, opera: false })).map(a => a.id), ['pedidos-aguardando']);
    assert.deepEqual(avisosDaData(contexto({ pedidos, leitura: 'lendo' })), []);
  });

  it('os pedidos que não foram lidos, para todos os perfis', () => {
    for (const opera of [true, false]) {
      assert.deepEqual(avisosDaData(contexto({ leitura: 'erro', opera })).map(a => [a.id, a.titulo, a.gravidade, a.destino]),
        [['pedidos-nao-lidos', 'Não foi possível ler os pedidos desta data.', 'aviso', { tela: 'age' }]]);
    }
  });

  it('o que a data não leu: as horas são erro, o resto é aviso, sem destino (a faixa do alto tem "Tentar de novo")', () => {
    const indisponiveis = [{ id: 'resultados', texto: 'Sem os resultados.' }, { id: 'horas', texto: 'Sem as horas.' }, { id: 'cursos', texto: 'Sem os programas.' }];
    assert.deepEqual(avisosDaData(contexto({ indisponiveis })).map(a => [a.id, a.gravidade, a.titulo, a.destino]), [
      ['dados:horas', 'erro', 'Sem as horas.', null], ['dados:cursos', 'aviso', 'Sem os programas.', null], ['dados:resultados', 'aviso', 'Sem os resultados.', null]
    ]);
  });
});

// linha-fix-escala-sem-caixas (Pedro, 28/11): as caixas do resumo da Escala saíram. O trilho tem tudo o que elas tinham: as
// missões que não entraram (com "Sugestões" na recusa do instrutor escolhido), os conflitos (com "Sugestões"), os avisos, os
// voos com quem está inativo no cadastro ("Refazer a escala", ou o Processamento para o aluno) e as habilitações não conferidas
describe('O que era das caixas da Escala, no trilho', () => {
  it('o grupo de cada alerta da escala; "Sugestões" no conflito e na recusa do instrutor escolhido, só para quem opera', () => {
    const recusa = { t: 'err', s: 'Aluno 02', m: 'Rejeitado: o instrutor escolhido não serve.', codigo: 'instrutor-escolhido', stuId: 1002 };
    const al = [
      { t: 'conf', s: 'Aluno 01', m: 'Conflito.', fKey: '1000_0_1' }, recusa,
      { t: 'err', s: 'Aluno 03', m: 'Rejeitado: sem avião.', codigo: 'sem-recurso', stuId: 1003 },
      { t: 'warn', s: 'Aluno 04', m: 'Sem peso.', codigo: 'sem-peso', stuId: 1004 }
    ];
    const recusas = new Map([[recusa, '1002_0_1']]);
    assert.deepEqual(avisosDaData({ ...contexto({ al, tot: 4 }), recusas }).map(a => [a.titulo, a.grupo, a.acao || null]), [
      ['Aluno 01', 'conflitos', { tipo: 'reparo', fKey: '1000_0_1', rotulo: 'Sugestões', dica: 'O que pode voar no lugar deste voo' }],
      ['Aluno 02', 'erros', { tipo: 'rejeitado', fKey: '1002_0_1', rotulo: 'Sugestões', dica: 'Outro instrutor que encaixa este pedido' }],
      ['Aluno 03', 'erros', null],
      ['Aluno 04', 'avisos', null]
    ]);
    // Sem as recusas (a data passada, que não voa mais), a recusa fica sem "Sugestões"; quem só consulta, sem nenhuma
    assert.deepEqual(avisosDaData(contexto({ al, tot: 4 })).map(a => (a.acao ? a.acao.tipo : null)), ['reparo', null, null, null]);
    assert.deepEqual(avisosDaData({ ...contexto({ al, tot: 4, opera: false }), recusas }).map(a => a.acao || null), [null, null, null, null]);
  });

  it('os voos com quem está inativo: um por pessoa ou recurso; "Refazer a escala" no do instrutor e no do recurso; o do aluno leva ao Processamento', () => {
    const out = [
      { fKey: '1000_0_1', stuId: 1000, insId: 1, r: 'PR-AAA', a: 480, b: 540 },
      { fKey: '1001_0_1', stuId: 1001, insId: 1, r: 'PR-BBB', a: 600, b: 660 }
    ];
    const ins = [{ id: 1, nm: 'Instrutor 01', on: true, inativo: true }, { id: 2, nm: 'Instrutor 02', on: true }];
    const frota = [{ reg: 'PR-AAA', tipo: 'C152' }, { reg: 'PR-BBB', tipo: 'C152', inativo: true }];
    const stu = [{ id: 1000, nm: 'Aluno 1000', inativo: true }, { id: 1001, nm: 'Aluno 1001' }];
    const avisos = avisosDaData(contexto({ out, ins, frota, stu, tot: 2 })).filter(a => a.grupo === 'inativos');
    const refazer = { tipo: 'refazer-escala', rotulo: 'Refazer a escala', dica: 'Refaz a escala sem o instrutor e o recurso inativos' };
    assert.deepEqual(avisos.map(a => [a.id, a.gravidade, a.titulo, a.destino, a.acao || null]), [
      ['inativo:aluno:1000', 'aviso', '1 voo com o aluno Aluno 1000 (inativo) na escala desta data', { tela: 'proc' }, null],
      ['inativo:instrutor:1', 'aviso', '2 voos com Instrutor 01 (inativo) na escala desta data', { tela: 'esc' }, refazer],
      ['inativo:recurso:PR-BBB', 'aviso', '1 voo com PR-BBB (inativo) na escala desta data', { tela: 'esc' }, refazer]
    ]);
    // Quem só consulta: sem "Refazer a escala"; numa data passada, ninguém está inativo
    assert.deepEqual(avisosDaData(contexto({ out, ins, frota, stu, opera: false })).filter(a => a.grupo === 'inativos').map(a => a.acao || null), [null, null, null]);
    assert.deepEqual(avisosDaData({ ...contexto({ out, ins, frota, stu }), data: '2026-11-09' }).filter(a => a.grupo === 'inativos'), []);
  });

  it('as habilitações das missões do curso não conferidas: quantos pedidos, para todos os perfis', () => {
    assert.deepEqual(avisosDaData({ ...contexto(), habilitacoesNaoConferidas: 0 }), []);
    for (const opera of [true, false]) {
      assert.deepEqual(avisosDaData({ ...contexto({ opera }), habilitacoesNaoConferidas: 3 }), [{
        id: 'habilitacoes', gravidade: 'aviso', minuto: null, titulo: 'As habilitações das missões do curso não foram conferidas',
        texto: 'Os programas dos cursos não foram lidos: o que a missão do curso exige do INVA não foi conferido em 3 pedidos desta data: a escala foi montada sem essa conferência.',
        destino: { tela: 'esc' }, grupo: 'habilitacoes'
      }]);
    }
    assert.match(avisosDaData({ ...contexto(), habilitacoesNaoConferidas: 1 })[0].texto, / em 1 pedido desta data:/);
  });
});

// O resumo de cada grupo da escala, no alto dos avisos do trilho (o que era o título de cada caixa da Escala): com dois
// itens ou mais no grupo; com um só, o item diz tudo
describe('O resumo dos grupos da escala, no trilho', () => {
  const erro = (s, m = 'Rejeitado: sem avião.') => ({ t: 'err', s, m, codigo: 'sem-aviao' });
  const aviso = (codigo, extra = {}) => ({ t: 'warn', s: 'Aluno', m: 'Aviso.', codigo, ...extra });
  const conflito = n => ({ t: 'conf', s: `Aluno ${n}`, m: 'Conflito.', fKey: `${n}_0_1` });

  it('com um item só no grupo, nada; sem a escala, nada', () => {
    assert.deepEqual(resumosDaEscala(contexto({ al: [erro('Aluno 1'), conflito(1), aviso('sem-peso', { stuId: 1 })], tot: 2 })), []);
    assert.deepEqual(resumosDaEscala(contexto({ res: false })), []);
  });

  it('as missões que não entraram, com os nomes sem repetir', () => {
    const al = [erro('Aluno 1'), erro('Aluno 2'), erro('Aluno 1', 'Rejeitado: sem instrutor.')];
    assert.deepEqual(resumosDaEscala(contexto({ al, tot: 3 })), [{ grupo: 'erros', gravidade: 'erro', texto: '3 missões não entraram na escala: Aluno 1, Aluno 2' }]);
  });

  it('os conflitos: na escala aprovada ou dos voos fixos', () => {
    const al = [conflito(1), conflito(2)];
    assert.deepEqual(resumosDaEscala(contexto({ al })), [{ grupo: 'conflitos', gravidade: 'erro', texto: '2 voos fixos em conflito' }]);
    assert.deepEqual(resumosDaEscala(contexto({ al, aprovacao: { em: '2026-11-10T20:00:00Z' } })).map(r => r.texto), ['2 voos em conflito na escala aprovada']);
  });

  it('os avisos agrupados pelo código, as pessoas e os voos sem repetir; os sem código em "outros"', () => {
    const al = [
      aviso('sem-peso', { stuId: 1 }), aviso('sem-peso', { insId: 7 }), aviso('sem-peso', { stuId: 1, fKey: 'b' }),
      aviso('perto-do-limite', { insId: 7 }), aviso('perto-do-limite', { insId: 7 }), aviso('revisao'), aviso('atraso'), aviso('atraso'),
      aviso('voa-com'), aviso('escolhido-saiu'), aviso('repouso-do-noturno', { insId: 8 }), aviso('volta-do-noturno'),
      aviso('fora-dos-horarios', { fKey: 'x' }), aviso('depois-das-17h30', { fKey: 'x' }), aviso('antes-do-ground', { fKey: 'y' }),
      { t: 'warn', s: 'Aluno', m: 'Gravado antes dos códigos.' }
    ];
    assert.deepEqual(resumosDaEscala(contexto({ al })), [{
      grupo: 'avisos', gravidade: 'aviso',
      texto: '16 avisos: 1 aluno sem peso · 1 instrutor sem peso · 1 avião para para a revisão de 50 horas · 2 atrasos com conflito'
        + ' · 1 instrutor perto do limite da lei · 1 aviso de Priorizar com · 1 voo com o instrutor escolhido fora do cadastro'
        + ' · 1 instrutor sem o repouso da lei antes da volta do noturno · 1 volta do noturno com o avião ou o INVA indisponível'
        + ' · 2 agendamentos fora da regra · 1 outro'
    }]);
    assert.deepEqual(resumosDaEscala(contexto({ al: [aviso('sem-peso', { stuId: 1 }), aviso('sem-peso', { stuId: 2 })] })).map(r => r.texto), ['2 avisos: 2 alunos sem peso']);
  });

  // O almoço (#104): o aviso "Sem almoço" não tem código (é reconhecido pelo começo do texto) e não entra em "outros"; o
  // resumo conta os INVAs, sem repetir, e diz qual trecho tem a dica do glossário (o item do trilho é um link: a dica
  // dentro dele seria um controle dentro de outro, então ela vai no resumo). Era a caixa dos avisos da Escala, que saiu
  // (linha-fix-escala-sem-caixas)
  it('o almoço: os INVAs sem almoço contados pelo INVA, fora de "outros", com a dica no trecho deles', () => {
    const semAlmoco = (insId, s) => ({ t: 'warn', s, m: 'Sem almoço: nenhuma hora livre seguida entre 11:00 e 14:00 (ocupado das 11:00 às 14:00).', insId });
    const al = [aviso('sem-peso', { stuId: 1 }), semAlmoco(1, 'Instrutor 01'), semAlmoco(2, 'Instrutor 02'), semAlmoco(2, 'Instrutor 02')];
    assert.deepEqual(resumosDaEscala(contexto({ al })), [{
      grupo: 'avisos', gravidade: 'aviso', texto: '4 avisos: 1 aluno sem peso · 2 INVAs sem almoço',
      dica: { id: 'almoco', trecho: '2 INVAs sem almoço' }
    }]);
    const [um] = resumosDaEscala(contexto({ al: [semAlmoco(1, 'Instrutor 01'), { t: 'warn', s: 'Aluno', m: 'Gravado antes dos códigos.' }] }));
    assert.deepEqual(um, { grupo: 'avisos', gravidade: 'aviso', texto: '2 avisos: 1 INVA sem almoço · 1 outro', dica: { id: 'almoco', trecho: '1 INVA sem almoço' } });
    // Com código, o mesmo começo não é o do almoço
    assert.deepEqual(resumosDaEscala(contexto({ al: [aviso('sem-peso', { stuId: 1 }), { ...semAlmoco(1, 'Instrutor 01'), codigo: 'atraso' }] })),
      [{ grupo: 'avisos', gravidade: 'aviso', texto: '2 avisos: 1 aluno sem peso · 1 atraso com conflito' }]);
    // Cada aviso "Sem almoço" é um item do trilho, no grupo dos avisos da escala, que leva à Escala
    const itens = avisosDaData(contexto({ al: [semAlmoco(1, 'Instrutor 01')] })).filter(a => a.grupo === 'avisos');
    assert.deepEqual(itens, [{
      id: 'warn:1', gravidade: 'aviso', minuto: null, titulo: 'Instrutor 01',
      texto: 'Sem almoço: nenhuma hora livre seguida entre 11:00 e 14:00 (ocupado das 11:00 às 14:00).', destino: { tela: 'esc' }, grupo: 'avisos'
    }]);
  });

  it('na ordem: as que não entraram, os conflitos e os avisos', () => {
    const al = [aviso('atraso'), aviso('atraso'), conflito(1), conflito(2), erro('Aluno 1'), erro('Aluno 2')];
    assert.deepEqual(resumosDaEscala(contexto({ al, tot: 2 })).map(r => r.grupo), ['erros', 'conflitos', 'avisos']);
  });
});

// J (S4): a Sala Ground desligada na data é um aviso dos recursos na linha do dia; sem a chave dela (o normal), nada. As
// contagens dos aviões não mudam
describe('A Sala Ground indisponível na linha do dia', () => {
  const daSala = ctx => avisosDaData(ctx).filter(a => a.id === 'sala-ground');
  it('desligada na data: o aviso; sem a chave, ou ligada, nenhum', () => {
    assert.deepEqual(daSala(contexto({ av: { 'SALA-GROUND': false } })).map(a => [a.gravidade, a.titulo]), [['aviso', 'A Sala Ground está indisponível nesta data']]);
    assert.deepEqual(daSala(contexto()), []);
    assert.deepEqual(daSala(contexto({ av: { 'SALA-GROUND': true } })), []);
  });
});

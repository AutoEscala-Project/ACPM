// ApiClient com escala por data: carregar e salvar uma data, cópia do dia anterior, BI e migração dos
// documentos antigos (no próprio backend ou vindos de outro, como no envio dos dados do navegador).
import { describe, it, beforeEach, afterEach } from 'node:test';
import { FROTA_INICIAL } from '../../js/frota.js';
import { HORARIOS_INICIAIS } from '../../js/horarios.js';
import assert from 'node:assert/strict';
import { LIMITES_DA_LEI } from '../../js/limites.js';
import { ApiClient } from '../../js/storage.js';
import { backendLocal } from '../../js/backends/local.js';
import { simularNavegador } from '../helpers/navegador.js';
import { estadoSintetico } from '../helpers/estado.js';
import { aluno, instrutor, missaoExtra } from '../helpers/montar.js';
import { ESQUEMA, FORMATO_DOS_CURSOS } from '../../js/migracoes.js';
import { habilitacoesDoNivel } from '../../js/habilitacoes.js';
import { cursosIniciais, gravarCurso, importarProgramas, programaComResultados } from '../../js/programa.js';
import { PROGRAMA } from '../helpers/casos-do-programa.js';

// Backend em memória com a mesma interface, contando as gravações. O programa dos cursos segue as regras do servidor
// (js/programa.js), começando como o banco (PP, PC e INVA vazios); a conversão do cadastro entra em gravacoes
function backendEmMemoria() {
  const docs = new Map();
  const historico = [];
  const gravacoes = [];
  const cursos = { lista: cursosIniciais(), alteracoes: [] };
  const estadoDosCursos = () => ({ cursos: cursos.lista, resultados: [], cadastro: docs.has('cadastro') ? { esquema: docs.get('cadastro').esquema, versao: 0 } : null });
  return {
    docs, historico, gravacoes, cursos,
    async programaDosCursos() { return programaComResultados({ cursos: cursos.lista, alteracoes: cursos.alteracoes }); },
    async salvarCurso(sigla, versaoLida, conteudo, { descricao, autor = null } = {}) {
      const r = gravarCurso(estadoDosCursos(), { sigla, versaoLida, conteudo, descricao, autor });
      Object.assign(cursos, { lista: r.cursos, alteracoes: [...cursos.alteracoes, r.alteracao] });
      return r.retorno;
    },
    async importarCursos(programas, { autor = null } = {}) {
      gravacoes.push('importarCursos');
      const r = importarProgramas(estadoDosCursos(), { programas, versaoDoCadastro: 0, autor });
      Object.assign(cursos, { lista: r.cursos, alteracoes: [...cursos.alteracoes, ...r.alteracoes] });
      return r.retorno;
    },
    async ler(doc) { return docs.has(doc) ? structuredClone(docs.get(doc)) : null; },
    async gravar(doc, conteudo) { gravacoes.push(doc); docs.set(doc, structuredClone(conteudo)); return true; },
    async listarDias(de, ate) {
      return [...docs.keys()].filter(k => k.startsWith('dia:')).map(k => k.slice(4)).filter(d => d >= de && d <= ate).sort()
        .map(d => ({ data: d, conteudo: structuredClone(docs.get(`dia:${d}`)) }));
    },
    async diasEmFormatoAntigo(esquema) {
      const versao = c => (c && typeof c.esquema === 'number' ? Math.floor(c.esquema) : 0);
      return [...docs.keys()].filter(k => k.startsWith('dia:') && versao(docs.get(k)) < esquema).map(k => k.slice(4)).sort();
    },
    async diaAnterior(data) {
      const d = [...docs.keys()].filter(k => k.startsWith('dia:')).map(k => k.slice(4)).filter(x => x < data).sort().pop();
      return d ? { data: d, conteudo: structuredClone(docs.get(`dia:${d}`)) } : null;
    },
    async horasDosInstrutores() { return {}; },
    async situacaoDasMissoes() { return []; },
    async resultadosDoDia() { return []; },
    async registrar(entrada) { historico.push({ id: historico.length + 1, ...entrada }); return historico.length; },
    async listarHistorico(data) { return historico.filter(e => e.data === data).reverse(); },
    async importarHistorico(data, entradas) {
      if (historico.some(e => e.importado)) return 0;
      entradas.forEach(e => historico.push({ id: historico.length + 1, data, importado: true, ...e }));
      return entradas.length;
    }
  };
}

const original = ApiClient.backend;
let backend;
beforeEach(() => {
  simularNavegador();
  backend = backendEmMemoria();
  ApiClient.backend = backend;
  ApiClient.readOnly = false;
  ApiClient.cadastroGravado = undefined;
});
afterEach(() => { ApiClient.backend = original; ApiClient.readOnly = false; ApiClient.autorAtual = null; });

const escalaDe = data => ({ out: [{ fKey: '1000_0_1', h: 1 }], al: [], tot: 1, data });
// O cadastro já no formato dos cursos (a conversão feita): o Administrador grava os cursos
const convertido = () => backend.docs.set('cadastro', { nid: 1000, ins: [], stu: [], esquema: FORMATO_DOS_CURSOS });

describe('Carregar e salvar uma data', () => {
  it('sem cadastro nem dias: estado vazio para a data, sem escala', async () => {
    const { estado, escala, novo } = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([estado.ins, estado.stu, escala, novo], [[], [], null, true]);
    assert.equal(estado.schemaVer, 4);
  });

  it('salva e carrega de volta o mesmo estado e a mesma escala', async () => {
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000, {}, { extra: [missaoExtra(1001)] })] });
    estado.av['PR-BTB'] = false;
    estado.fStatus = { '1000_0_1': 'Em Voo' };
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, escalaDe('2026-11-11')), true);
    const lido = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual(lido.estado, estado);
    assert.deepEqual(lido.escala, escalaDe('2026-11-11'));
    assert.equal(lido.novo, false);
  });

  it('grava o cadastro só quando ele muda; o dia é gravado sempre', async () => {
    const estado = ApiClient.normalizeAndMigrateState(estadoSintetico());
    await ApiClient.carregarDia('2026-11-11');
    await ApiClient.salvarDia('2026-11-11', estado, null);
    estado.av['PR-BTB'] = false;
    await ApiClient.salvarDia('2026-11-11', estado, null);
    estado.ins[0].nm = 'Novo nome';
    await ApiClient.salvarDia('2026-11-11', estado, null);
    assert.deepEqual(backend.gravacoes, ['cadastro', 'dia:2026-11-11', 'dia:2026-11-11', 'cadastro', 'dia:2026-11-11']);
  });

  it('data nova começa com uma cópia do dia anterior (sem status, sem escala e com a demanda vazia) e não grava nada', async () => {
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), stu: [aluno(1000)] });
    estado.av['PR-BTB'] = false;
    estado.fStatus = { '1000_0_1': 'Cancelado' };
    await ApiClient.salvarDia('2026-11-11', estado, escalaDe('2026-11-11'));
    backend.gravacoes.length = 0;

    const { estado: novo, escala, novo: ehNovo } = await ApiClient.carregarDia('2026-11-14');
    assert.equal(ehNovo, true);
    assert.equal(escala, null);
    assert.equal(novo.av['PR-BTB'], false);
    // O cadastro é o mesmo; a demanda começa vazia
    assert.deepEqual(novo.stu.map(s => [s.id, s.nm, s.kg, s.fly, s.extra]), estado.stu.map(s => [s.id, s.nm, s.kg, false, []]));
    assert.deepEqual(novo.fStatus, {});
    assert.deepEqual(backend.gravacoes, []);
  });
});
// Os pedidos de cada dia do trilho (D2): pela contagem do servidor (solicitacoes_por_dia), sem baixar os pedidos do mês: os
// que aguardam e os aprovados; o domingo não tem número. E a escala que mudou em outro computador, perguntada ao backend
describe('Os pedidos por dia e a escala que mudou (ApiClient)', () => {
  it('a contagem do trilho vem da contagem do servidor, sem os domingos e sem ler a lista', async () => {
    const pedidos = [];
    backend.solicitacoesPorDia = async (de, ate) => { pedidos.push([de, ate]); return { '2026-11-11': { aguardando: 1, aprovadas: 2 }, '2026-11-15': { aguardando: 1, aprovadas: 0 } }; };
    backend.listarSolicitacoes = async () => { throw new Error('a lista não é lida'); };
    assert.deepEqual(await ApiClient.contagemDaAgenda('2026-11-01', '2026-11-30'), { '2026-11-11': 3 });
    assert.deepEqual(pedidos, [['2026-11-01', '2026-11-30']]);
  });

  it('a escala mudou em outro computador: a resposta do backend', async () => {
    backend.diaMudou = async data => data === '2026-11-12';
    assert.deepEqual([await ApiClient.diaMudou('2026-11-11'), await ApiClient.diaMudou('2026-11-12')], [false, true]);
  });
});

describe('Dados lidos à parte', () => {
  it('sem as horas dos instrutores, os resultados ou os programas dos cursos, a data abre e diz o que ficou indisponível', async () => {
    const aberta = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual(aberta.indisponiveis, []);
    assert.deepEqual(aberta.programa.map(c => [c.sigla, c.versao, c.fases, c.missoes]), [['PP', 1, [], []], ['PC', 1, [], []], ['INVA', 1, [], []]]);
    backend.horasDosInstrutores = async () => { throw new Error('sem conexão'); };
    const semHoras = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([semHoras.indisponiveis, semHoras.horasBase], [['horas'], {}]);
    backend.situacaoDasMissoes = async () => { throw new Error('sem conexão'); };
    const semResultados = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([semResultados.indisponiveis, semResultados.resultados], [['horas', 'resultados'], { situacao: [], doDia: [] }]);
    backend.programaDosCursos = async () => { throw new Error('sem conexão'); };
    const semNada = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([semNada.indisponiveis, semNada.programa], [['horas', 'resultados', 'cursos'], []]);
    assert.deepEqual(await ApiClient.lerDadosAParte('2026-11-11'), { horasBase: null, resultados: null, programa: null });
  });

  it('o programa lido vem nos formatos certos; num backend sem os cursos, a data abre sem ele e diz por quê', async () => {
    convertido();
    await ApiClient.salvarCurso('ZZ9', 0, PROGRAMA, 'Curso ZZ9 criado: Curso de teste');
    const { programa: lido, indisponiveis } = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual(lido, await ApiClient.lerProgramas());
    assert.deepEqual([lido.map(c => c.sigla), lido.at(-1).missoes.length, indisponiveis], [['PP', 'PC', 'INVA', 'ZZ9'], 5, []]);
    backend.programaDosCursos = async () => [{ sigla: 'pp' }, { sigla: 'PC', nome: 'Piloto Comercial', fases: 'x' }];
    assert.deepEqual((await ApiClient.lerDadosAParte('2026-11-11')).programa.map(c => [c.sigla, c.fases, c.missoes]), [['PC', [], []]]);
    delete backend.programaDosCursos;
    const semOsCursos = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([semOsCursos.programa, semOsCursos.indisponiveis], [[], ['cursos']]);
  });

  // Quem só consulta (a Gestor e a Secretaria no modo compartilhado) pode abrir antes da primeira abertura de um Operador,
  // que faz a conversão: com o programa ainda no cadastro, a próxima missão e o progresso ficam desligados, e a tela diz
  // por quê (as tabelas ainda não têm o programa)
  it('o programa ainda no cadastro (antes do formato dos cursos, com missões): "cursos-pendentes"', async () => {
    const comPrograma = esquema => backend.docs.set('cadastro', {
      nid: 1000, ins: [], stu: [], esquema, cursos: { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }], PC: [], INVA: [] }
    });
    comPrograma(FORMATO_DOS_CURSOS - 1);
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).indisponiveis, ['cursos-pendentes']);
    backend.docs.set('cadastro', { nid: 1000, ins: [], stu: [] });
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).indisponiveis, [], 'sem programa no cadastro, nada espera a conversão');
    comPrograma(FORMATO_DOS_CURSOS);
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).indisponiveis, [], 'no formato dos cursos, o programa é o das tabelas');
    comPrograma(FORMATO_DOS_CURSOS - 1);
    backend.programaDosCursos = async () => { throw new Error('sem conexão'); };
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).indisponiveis, ['cursos', 'cursos-pendentes']);
    assert.deepEqual(backend.gravacoes, [], 'a abertura não grava nada');
  });

  // "Tentar de novo", na tela aberta antes da conversão, pergunta se ela já foi feita: o cadastro é lido de novo só para
  // consultar o formato (a versão que a gravação seguinte leva não muda: js/backends/supabase.js)
  it('o programa ainda no cadastro, perguntado de novo: só consulta o cadastro, sem gravar', async () => {
    const opcoes = [];
    const ler = backend.ler;
    backend.ler = async (doc, opcao) => { opcoes.push([doc, opcao]); return ler(doc); };
    const comPrograma = esquema => backend.docs.set('cadastro', {
      nid: 1000, ins: [], stu: [], esquema, cursos: { PP: [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }], PC: [], INVA: [] }
    });
    comPrograma(FORMATO_DOS_CURSOS - 1);
    assert.equal(await ApiClient.programaAindaNoCadastro(), true);
    comPrograma(FORMATO_DOS_CURSOS);
    assert.equal(await ApiClient.programaAindaNoCadastro(), false, 'a conversão foi feita');
    backend.docs.set('cadastro', { nid: 1000, ins: [], stu: [] });
    assert.equal(await ApiClient.programaAindaNoCadastro(), false, 'sem programa no cadastro, nada espera a conversão');
    assert.deepEqual(opcoes, Array(3).fill(['cadastro', { guardarVersao: false }]));
    backend.ler = async () => { throw new Error('sem conexão'); };
    await assert.rejects(ApiClient.programaAindaNoCadastro(), /sem conexão/);
    assert.deepEqual(backend.gravacoes, []);
  });
});

describe('O programa dos cursos (ApiClient)', () => {
  it('lê os programas nos formatos certos', async () => {
    assert.deepEqual((await ApiClient.lerProgramas()).map(c => [c.sigla, c.versao, c.fases, c.missoes, c.alteracoes]),
      [['PP', 1, [], [], []], ['PC', 1, [], [], []], ['INVA', 1, [], [], []]]);
    backend.programaDosCursos = async () => [{ sigla: 'pp' }, { sigla: 'PC', nome: 'Piloto Comercial', fases: [{ id: 'F1', nome: 'Fase 1' }], missoes: 'x' }];
    assert.deepEqual((await ApiClient.lerProgramas()).map(c => [c.sigla, c.versao, c.fases, c.missoes]), [['PC', 1, [], []]]);
  });

  it('sem resposta, ou num backend sem os cursos, a leitura recusa: quem chamou decide o que mostrar', async () => {
    backend.programaDosCursos = async () => { throw new Error('sem conexão'); };
    await assert.rejects(ApiClient.lerProgramas(), /sem conexão/);
    delete backend.programaDosCursos;
    await assert.rejects(ApiClient.lerProgramas(), TypeError);
  });

  it('grava o curso com a descrição e quem gravou; a recusa vem com o código e o campo, e a leitura de novo mostra o programa gravado', async () => {
    convertido();
    ApiClient.autorAtual = 'Admin de Teste';
    assert.equal((await ApiClient.salvarCurso('ZZ9', 0, PROGRAMA, 'Curso ZZ9 criado: Curso de teste')).versao, 1);
    assert.deepEqual(backend.cursos.alteracoes.map(a => [a.curso, a.versao, a.descricao, a.registrado_por]), [['ZZ9', 1, 'Curso ZZ9 criado: Curso de teste', 'Admin de Teste']]);
    await assert.rejects(ApiClient.salvarCurso('ZZ9', 0, PROGRAMA, 'Curso ZZ9 criado de novo'), { code: 'PT409', campo: 'sigla' });
    const zz9 = (await ApiClient.lerProgramas()).find(c => c.sigla === 'ZZ9');
    assert.deepEqual([zz9.versao, zz9.missoes.length, zz9.alteracoes.map(a => a.versao)], [1, 5, [1]]);
    assert.deepEqual(backend.gravacoes, [], 'nada vai para o cadastro nem para os dias');
  });

  it('só consulta (o Gestor e a Secretaria, ou a tela travada depois de um conflito): a gravação é recusada (42501) sem chamar o backend', async () => {
    convertido();
    ApiClient.readOnly = true;
    let chamadas = 0;
    backend.salvarCurso = async () => { chamadas++; };
    await assert.rejects(ApiClient.salvarCurso('ZZ9', 0, PROGRAMA, 'Curso ZZ9 criado: Curso de teste'), { code: '42501' });
    assert.equal(chamadas, 0);
    assert.equal((await ApiClient.lerProgramas()).length, 3, 'a leitura continua');
  });

  it('o backend de teste converte o cadastro como o servidor e põe a conversão na lista das gravações, junto dos dias e do cadastro', async () => {
    backend.docs.set('cadastro', { nid: 1000, ins: [], stu: [], esquema: FORMATO_DOS_CURSOS - 1 });
    const fase = '00000000-0000-4000-8000-000000000001';
    const pp = { sigla: 'PP', fases: [{ id: fase, nome: 'Programa' }], missoes: [{ id: '00000000-0000-4000-8000-000000000002', fase, codigo: 'PP-01', nome: 'PP-01', mis: 'Voo Local', eq: 'C152', nb: 1 }] };
    assert.equal(await backend.importarCursos([pp, { sigla: 'ZZ7', fases: [], missoes: [] }]), 1);
    assert.deepEqual([backend.gravacoes, backend.cursos.alteracoes.map(a => a.descricao)], [['importarCursos'], ['Programa trazido do cadastro (1 missão)']]);
  });
});

describe('Ordem das gravações', () => {
  it('o cadastro é gravado antes do dia; sem o cadastro gravado, o dia não é gravado e a gravação responde false', async () => {
    const estado = ApiClient.normalizeAndMigrateState({ ...ApiClient.createFreshState(), ins: [instrutor(1, 9)], stu: [aluno(1000)] });
    const eventos = [];
    const gravar = backend.gravar;
    let cadastroFalha = true;
    backend.gravar = async (doc, conteudo) => {
      eventos.push(`início ${doc}`);
      await new Promise(r => setTimeout(r, 5));
      const ok = doc === 'cadastro' && cadastroFalha ? false : await gravar(doc, conteudo);
      eventos.push(`fim ${doc}`);
      return ok;
    };
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, null), false);
    assert.deepEqual(eventos, ['início cadastro', 'fim cadastro'], 'o dia não é gravado sem o cadastro');
    eventos.length = 0;
    cadastroFalha = false;
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, null), true);
    assert.deepEqual(eventos, ['início cadastro', 'fim cadastro', 'início dia:2026-11-11', 'fim dia:2026-11-11'], 'um depois do outro');
    eventos.length = 0;
    assert.equal(await ApiClient.salvarDia('2026-11-11', estado, null), true);
    assert.deepEqual(eventos, ['início dia:2026-11-11', 'fim dia:2026-11-11'], 'o cadastro igual ao gravado não é regravado');
  });
});


describe('Horas até a revisão de 50 horas', () => {
  it('ficam no dia e a nova data começa com as horas mais os voos do dia anterior', async () => {
    const estado = ApiClient.normalizeAndMigrateState(estadoSintetico());
    estado.horas = { 'PR-BTB': 40 };
    await ApiClient.salvarDia('2026-11-11', estado, { out: [{ fKey: '1000_0_1', r: 'PR-BTB', eqType: 'C152', h: 2 }], al: [], tot: 1 });
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).estado.horas, { 'PR-BTB': 40 });
    assert.deepEqual((await ApiClient.carregarDia('2026-11-12')).estado.horas, { 'PR-BTB': 42 });
  });
});

describe('Filas do rodízio', () => {
  it('ficam no dia; a nova data começa com quem voou na categoria no fim da fila', async () => {
    // A fila gravada não é a ordem do cadastro (1, 2, 3), que o estado montaria sozinho se o dia não a guardasse
    const ins = [instrutor(1, 9), instrutor(2, 9), instrutor(3, 9)];
    const estado = ApiClient.normalizeAndMigrateState({ ...estadoSintetico(), ins, filas: { c172: [3, 1, 2] } });
    await ApiClient.salvarDia('2026-11-11', estado, { out: [{ fKey: 'a', insId: 1, mis: 'Voo Local', eqType: 'C172', h: 1, r: 'PP-ABP' }], al: [], tot: 1 });
    assert.deepEqual((await ApiClient.carregarDia('2026-11-11')).estado.filas.c172, [3, 1, 2]);
    assert.deepEqual((await ApiClient.carregarDia('2026-11-12')).estado.filas.c172, [3, 2, 1]);
  });
});

describe('Histórico e BI por data', () => {
  it('registra e lista o histórico da data', async () => {
    await ApiClient.registrarHistorico('2026-11-11', { tipo: 'exc', descricao: 'PR-BTB: Manutenção', reverter: { kind: 'setAv' } });
    await ApiClient.registrarHistorico('2026-11-12', { tipo: 'mod', descricao: 'Outra data' });
    assert.deepEqual((await ApiClient.historicoDoDia('2026-11-11')).map(e => e.descricao), ['PR-BTB: Manutenção']);
  });

  it('o BI sai das escalas guardadas no período', async () => {
    const estado = ApiClient.normalizeAndMigrateState(estadoSintetico());
    await ApiClient.salvarDia('2026-11-10', estado, escalaDe('2026-11-10'));
    await ApiClient.salvarDia('2026-11-11', estado, null);
    await ApiClient.salvarDia('2026-12-01', estado, escalaDe('2026-12-01'));
    assert.deepEqual(await ApiClient.biDoPeriodo('2026-11-01', '2026-11-30'), { '2026-11-10': { out: escalaDe().out, tot: 1, rej: 0 } });
  });
});

describe('Migração dos documentos antigos', () => {
  async function gravarFase2(destino, { comData = false } = {}) {
    const estado = { ...estadoSintetico(), stu: [aluno(1000)] };
    const escala = { out: [{ fKey: '1000_0_1', h: 1 }], al: [], tot: 1, ...(comData ? { data: '2026-11-20' } : {}) };
    await destino.gravar('estado', estado);
    await destino.gravar('escala', escala);
    await destino.gravar('historico', [{ id: Date.UTC(2026, 10, 9, 13), ts: '10:00:00', type: 'exc', desc: 'PR-BTB: Manutenção', revert: null }]);
    await destino.gravar('bi', { '2026-11-09': { out: [{ fKey: 'x', h: 2 }], tot: 1, rej: 0 }, '2026-11-10': { out: escala.out, tot: 1, rej: 0 } });
    return estado;
  }

  it('converte uma vez: escala na sua data, dias do BI, histórico importado e cadastro por último', async () => {
    const estado = await gravarFase2(backend);
    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11'), '2026-11-10');
    assert.equal(backend.gravacoes.at(-1), 'cadastro', 'o cadastro é gravado por último (marca a migração como concluída)');
    assert.deepEqual([...backend.docs.keys()].filter(k => k.startsWith('dia:')).sort(), ['dia:2026-11-09', 'dia:2026-11-10']);
    const { estado: lido, escala } = await ApiClient.carregarDia('2026-11-10');
    assert.deepEqual(lido.stu, ApiClient.normalizeAndMigrateState(structuredClone(estado)).stu);
    assert.deepEqual(escala.out, [{ fKey: '1000_0_1', h: 1 }]);
    assert.deepEqual(backend.historico.map(e => [e.data, e.descricao, e.importado]), [['2026-11-10', 'PR-BTB: Manutenção', true]]);
    assert.ok(backend.docs.has('estado'), 'os documentos da fase 2 ficam como cópia');

    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11'), null, 'não migra de novo');
    assert.deepEqual(backend.gravacoes, []);
  });

  it('sem documentos antigos não faz nada', async () => {
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11'), null);
    assert.deepEqual(backend.gravacoes, []);
  });

  it('pode migrar os documentos de outro backend (envio dos dados do navegador para o servidor)', async () => {
    await gravarFase2(backendLocal, { comData: true });
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11', backendLocal), '2026-11-20');
    assert.ok(backend.docs.has('cadastro'));
    assert.ok(backend.docs.has('dia:2026-11-20'));
    assert.equal(backend.docs.has('estado'), false, 'o servidor recebe só o formato novo');
  });

  it('se uma gravação falha no meio, a conversão para com erro sem gravar o cadastro; a próxima abertura termina', async () => {
    await gravarFase2(backend);
    const gravar = backend.gravar;
    backend.gravar = async (doc, conteudo) => (doc === 'dia:2026-11-09' ? false : gravar(doc, conteudo));
    await assert.rejects(ApiClient.migrarDocumentosAntigos('2026-11-11'), /conversão dos dados não terminou/);
    assert.equal(backend.docs.has('cadastro'), false, 'sem o cadastro, a conversão continua pendente');
    backend.gravar = async (doc, conteudo) => (doc === 'cadastro' ? false : gravar(doc, conteudo));
    await assert.rejects(ApiClient.migrarDocumentosAntigos('2026-11-11'), /conversão dos dados não terminou/);
    backend.gravar = gravar;
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11'), '2026-11-10');
    assert.ok(backend.docs.has('cadastro'));
  });

  it('não sobrescreve dias que já existem no destino', async () => {
    await gravarFase2(backend);
    await backend.gravar('dia:2026-11-09', { meu: true });
    await ApiClient.migrarDocumentosAntigos('2026-11-11');
    assert.deepEqual(backend.docs.get('dia:2026-11-09'), { meu: true });
  });
});

describe('Formato dos dados guardados (versões)', () => {
  // Cadastro e dia no formato por data mais antigo (sem versão), com simuladores nos nomes antigos
  const cadastroFase3 = () => ({ nid: 1001, ins: [{ id: 1, nm: 'Instrutor 01', lv: 2, kg: 70 }], stu: [{ id: 1000, nm: 'Aluno 1000', kg: 60, bl: [] }] });
  const diaFase3 = (resultado = null) => ({
    win: Array(9).fill(true),
    av: { 'SIM-MONO-1': false, 'SIM-MONO-2': true, 'SIM-MULTI-1': true, 'SIM-MULTI-2': false, 'PR-BTB': true },
    ins: { 1: { on: true, aw: Array(9).fill(true) } },
    pedidos: { 1000: { fly: true, mis: 'Simulador', eq: 'Sim. Mono', p1: 1, p2: 2, nb: 1, ss: 1, pr: 3, extra: [] } },
    fStatus: {},
    resultado
  });

  it('lê dados no formato anterior já no formato atual (simuladores renomeados), sem gravar nada', async () => {
    await backend.gravar('cadastro', cadastroFase3());
    await backend.gravar('dia:2026-11-11', diaFase3({ out: [{ fKey: '1000_0_1', r: 'SIM-MONO-2', h: 1 }], al: [], tot: 1 }));
    backend.gravacoes.length = 0;
    const { estado, escala } = await ApiClient.carregarDia('2026-11-11');
    assert.equal(estado.av['SIM-MONO-A'], false);
    assert.equal(estado.av['SIM-MLTE-D'], false);
    assert.equal(Object.hasOwn(estado.av, 'SIM-MONO-1'), false, 'os nomes antigos não ficam no estado');
    assert.equal(escala.out[0].r, 'SIM-MONO-C');
    assert.deepEqual(backend.gravacoes, []);
  });

  it('a nova data copia o dia anterior já no formato atual, e o BI usa os nomes novos', async () => {
    await backend.gravar('cadastro', cadastroFase3());
    await backend.gravar('dia:2026-11-11', diaFase3({ out: [{ fKey: '1000_0_1', r: 'SIM-MULTI-1', h: 1 }], al: [], tot: 1 }));
    const { estado } = await ApiClient.carregarDia('2026-11-12');
    assert.equal(estado.av['SIM-MONO-A'], false);
    assert.deepEqual((await ApiClient.biDoPeriodo('2026-11-01', '2026-11-30'))['2026-11-11'].out.map(o => o.r), ['SIM-MLTE-E']);
  });

  it('grava sempre no formato atual', async () => {
    await ApiClient.salvarDia('2026-11-11', ApiClient.normalizeAndMigrateState(estadoSintetico()), null);
    assert.equal(backend.docs.get('cadastro').esquema, ESQUEMA);
    assert.equal(backend.docs.get('dia:2026-11-11').esquema, ESQUEMA);
  });

  it('a conversão dos documentos antigos já grava no formato atual', async () => {
    await backend.gravar('estado', { ...estadoSintetico(), av: { 'SIM-MONO-1': false } });
    await ApiClient.migrarDocumentosAntigos('2026-11-11');
    assert.equal(backend.docs.get('cadastro').esquema, ESQUEMA);
    assert.equal(backend.docs.get('dia:2026-11-11').esquema, ESQUEMA);
    assert.equal(backend.docs.get('dia:2026-11-11').av['SIM-MONO-A'], false);
  });

  it('atualiza o que está gravado: todos os dias e, por último, o cadastro; uma vez só', async () => {
    await backend.gravar('cadastro', cadastroFase3());
    await backend.gravar('dia:2026-10-16', { importado: true, resultado: { out: [{ r: 'SIM-MONO-1', h: 1 }], al: [], tot: 1, rej: 0, data: '2026-10-16' } });
    await backend.gravar('dia:2026-11-11', diaFase3());
    await backend.gravar('dia:2026-11-12', { ...diaFase3(), av: { 'SIM-MONO-A': true }, esquema: ESQUEMA });
    backend.gravacoes.length = 0;
    // Só as datas num formato anterior (o servidor devolve no máximo 1000 linhas por consulta: nada de baixar todos os dias)
    backend.listarDias = async () => { throw new Error('não deve baixar todos os dias'); };
    assert.equal(await ApiClient.atualizarFormatoGravado(), true);
    assert.deepEqual(backend.gravacoes, ['dia:2026-10-16', 'dia:2026-11-11', 'importarCursos', 'cadastro'], 'o dia que já estava no formato atual não é regravado');
    assert.equal(backend.docs.get('dia:2026-10-16').resultado.out[0].r, 'SIM-MONO-A');
    assert.equal(backend.docs.get('dia:2026-11-11').av['SIM-MLTE-D'], false);
    const fase3 = cadastroFase3();
    assert.deepEqual(backend.docs.get('cadastro'), { ...fase3, ins: fase3.ins.map(x => ({ ...x, hab: habilitacoesDoNivel(x.lv) })), frota: FROTA_INICIAL, horarios: HORARIOS_INICIAIS, limites: LIMITES_DA_LEI, cursos: { PP: [], PC: [], INVA: [] }, esquema: ESQUEMA });

    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.atualizarFormatoGravado(), false, 'já atualizado');
    assert.deepEqual(backend.gravacoes, []);
  });

  it('se uma gravação falha, para com erro e o cadastro continua no formato anterior (retoma na próxima abertura)', async () => {
    await backend.gravar('cadastro', cadastroFase3());
    await backend.gravar('dia:2026-11-11', diaFase3());
    const gravar = backend.gravar;
    backend.gravar = async (doc, conteudo) => (doc === 'dia:2026-11-11' ? false : gravar(doc, conteudo));
    await assert.rejects(ApiClient.atualizarFormatoGravado(), /atualização dos dados não terminou/);
    assert.equal(backend.docs.get('cadastro').esquema, undefined);
    backend.gravar = gravar;
    assert.equal(await ApiClient.atualizarFormatoGravado(), true);
  });

  it('não grava nada no modo somente leitura nem com o banco vazio', async () => {
    assert.equal(await ApiClient.atualizarFormatoGravado(), false);
    await backend.gravar('cadastro', cadastroFase3());
    backend.gravacoes.length = 0;
    ApiClient.readOnly = true;
    assert.equal(await ApiClient.atualizarFormatoGravado(), false);
    assert.deepEqual(backend.gravacoes, []);
  });
});

describe('A conversão única do programa dos cursos (do cadastro para as tabelas)', () => {
  const PP = [{ id: 'PP-01', nome: 'Familiarização', mis: 'Voo Local', eq: 'C152', nb: 1 }, { id: 'PP-02', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2 }];
  const cadastroDeAntes = () => ({ nid: 1001, ins: [], stu: [{ id: 1000, nm: 'Aluno 1000', kg: 60, bl: [], curso: 'PP' }], cursos: { PP, PC: [], INVA: [] }, esquema: FORMATO_DOS_CURSOS - 1 });
  const missoesDe = sigla => backend.cursos.lista.find(c => c.sigla === sigla).missoes.map(m => [m.codigo, m.nome, m.mis, m.eq, m.nb, m.removida]);

  it('na atualização do formato: os dias, depois a conversão, depois o cadastro (que a encerra); uma vez só', async () => {
    await backend.gravar('cadastro', cadastroDeAntes());
    await backend.gravar('dia:2026-11-11', { esquema: FORMATO_DOS_CURSOS - 1, pedidos: {} });
    backend.gravacoes.length = 0;
    ApiClient.autorAtual = 'Operador 01';
    assert.equal(await ApiClient.atualizarFormatoGravado(), true);
    assert.deepEqual(backend.gravacoes, ['dia:2026-11-11', 'importarCursos', 'cadastro']);
    assert.deepEqual(missoesDe('PP'), [['PP-01', 'Familiarização', 'Voo Local', 'C152', 1, false], ['PP-02', 'Navegação', 'Navegação', 'C152', 2, false]]);
    assert.deepEqual(backend.cursos.alteracoes.map(a => [a.curso, a.versao, a.descricao, a.registrado_por]), [['PP', 2, 'Programa trazido do cadastro (2 missões)', 'Operador 01']]);
    assert.deepEqual(backend.cursos.lista.filter(c => c.sigla !== 'PP').map(c => [c.sigla, c.versao, c.fases]), [['PC', 1, []], ['INVA', 1, []]], 'o curso vazio fica como estava');
    // A cópia do programa fica no cadastro, que agora está no formato dos cursos
    assert.deepEqual(backend.docs.get('cadastro'), { ...cadastroDeAntes(), esquema: ESQUEMA });

    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.atualizarFormatoGravado(), false);
    assert.deepEqual(backend.gravacoes, [], 'a conversão não volta a ser feita');
    const { programa, indisponiveis } = await ApiClient.carregarDia('2026-11-11');
    assert.deepEqual([programa.find(c => c.sigla === 'PP').missoes.map(m => m.codigo), indisponiveis], [['PP-01', 'PP-02'], []]);
  });

  it('a conversão que falha (sem conexão, ou o cadastro mudou depois da leitura) não grava o cadastro: a próxima abertura termina', async () => {
    await backend.gravar('cadastro', cadastroDeAntes());
    const importar = backend.importarCursos;
    backend.importarCursos = async () => { throw Object.assign(new Error('o cadastro foi alterado depois da leitura; recarregue a página'), { code: 'PT409' }); };
    await assert.rejects(ApiClient.atualizarFormatoGravado(), { code: 'PT409' });
    assert.equal(backend.docs.get('cadastro').esquema, FORMATO_DOS_CURSOS - 1, 'o cadastro continua antes do formato dos cursos');
    assert.deepEqual(missoesDe('PP'), []);
    backend.importarCursos = importar;
    assert.equal(await ApiClient.atualizarFormatoGravado(), true);
    assert.deepEqual(missoesDe('PP').map(([codigo]) => codigo), ['PP-01', 'PP-02']);
    assert.equal(backend.docs.get('cadastro').esquema, ESQUEMA);
  });

  it('o cadastro já no formato dos cursos (ou depois dele) não converte nada; o de antes, sem programa, converte sem mudar as tabelas', async () => {
    await backend.gravar('cadastro', { ...cadastroDeAntes(), esquema: ESQUEMA });
    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.atualizarFormatoGravado(), false);
    assert.deepEqual(backend.gravacoes, []);
    await backend.gravar('cadastro', { nid: 1000, ins: [], stu: [], cursos: { PP: [], PC: [], INVA: [] }, esquema: FORMATO_DOS_CURSOS - 1 });
    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.atualizarFormatoGravado(), true);
    assert.deepEqual([backend.gravacoes, backend.cursos.alteracoes], [['importarCursos', 'cadastro'], []], 'o igual é pulado');
  });

  it('na conversão dos documentos antigos: o programa do estado vai para as tabelas antes do cadastro', async () => {
    await backend.gravar('estado', { ...estadoSintetico(), stu: [aluno(1000, {}, { curso: 'PP' })], cursos: { PP, PC: [], INVA: [] } });
    backend.gravacoes.length = 0;
    assert.equal(await ApiClient.migrarDocumentosAntigos('2026-11-11'), '2026-11-11');
    assert.deepEqual(backend.gravacoes, ['dia:2026-11-11', 'importarCursos', 'cadastro']);
    assert.deepEqual(missoesDe('PP').map(([codigo]) => codigo), ['PP-01', 'PP-02']);
    assert.equal(backend.docs.get('cadastro').esquema, ESQUEMA);
    assert.deepEqual(backend.docs.get('cadastro').cursos.PP.map(m => m.id), ['PP-01', 'PP-02'], 'a cópia fica no cadastro');
  });

  it('a conversão dos documentos antigos que falha não grava o cadastro', async () => {
    await backend.gravar('estado', { ...estadoSintetico(), cursos: { PP, PC: [], INVA: [] } });
    backend.importarCursos = async () => { throw new Error('sem conexão'); };
    await assert.rejects(ApiClient.migrarDocumentosAntigos('2026-11-11'), /sem conexão/);
    assert.equal(backend.docs.has('cadastro'), false);
  });
});

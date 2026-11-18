// O programa dos cursos em fases: o programa de antes (o do cadastro) no formato novo, uma fase por curso com as missões
// na mesma ordem, e o índice do programa (o curso, o caminho dele, a missão pelo id e pelo código); o programa lido do
// servidor nos formatos certos; e a gravação de um curso e a conversão do cadastro como no servidor, com os casos que o
// banco também confere (test/helpers/casos-do-programa.js) e o que eles não mostram.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  programaDoLegado, percursoDoCurso, indiceDoPrograma, rotuloDaFase, normalizarProgramas, gravarCurso, importarProgramas,
  programaComResultados, cursosIniciais, novoId, conteudoDoCurso, incluirMissao, mudarMissao, moverMissao, retirarMissao, validarCurso
} from '../../js/programa.js';
import { normalizarCursos } from '../../js/cursos.js';
import { FORMATO_DOS_CURSOS } from '../../js/migracoes.js';
import { cursoPP } from '../helpers/programa-pp.js';
import { CASOS_DO_PROGRAMA, PROGRAMA, IDS, NOTURNO_EM_TRECHOS } from '../helpers/casos-do-programa.js';
import { noturnosDoCurso, rotuloDaMissao } from '../../js/programa.js';

const gerarId = (sigla, codigo) => `${sigla}:${codigo}`;
const missao = (id, extra = {}) => ({ id, nome: `Missão ${id}`, mis: 'Voo Local', eq: 'C152', nb: 1, ...extra });

describe('O programa de antes no formato novo', () => {
  it('os três cursos, na ordem, cada um numa fase "Programa" com as missões na mesma ordem, todas depois das anteriores', () => {
    const cursos = normalizarCursos({ PP: [missao('PP-01'), missao('PP-02', { nome: 'Navegação', mis: 'Navegação', nb: 2 })], PC: [missao('PC-01', { mis: 'IFR', eq: 'C172' })] });
    const programa = programaDoLegado(cursos, gerarId);
    assert.deepEqual(programa.map(({ sigla, nome, ordem, ativo }) => ({ sigla, nome, ordem, ativo })), [
      { sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true },
      { sigla: 'PC', nome: 'Piloto Comercial', ordem: 1, ativo: true },
      { sigla: 'INVA', nome: 'Instrutor de Voo', ordem: 2, ativo: true }
    ]);
    const [pp, pc, inva] = programa;
    assert.deepEqual(pp.fases, [{ id: 'PP:Programa', nome: 'Programa', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false }]);
    assert.deepEqual(pp.missoes, [
      { id: 'PP:PP-01', fase: 'PP:Programa', codigo: 'PP-01', nome: 'Missão PP-01', mis: 'Voo Local', eq: 'C152', nb: 1, ordem: 0, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false },
      { id: 'PP:PP-02', fase: 'PP:Programa', codigo: 'PP-02', nome: 'Navegação', mis: 'Navegação', eq: 'C152', nb: 2, ordem: 1, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false }
    ]);
    assert.deepEqual(pc.missoes.map(m => [m.id, m.codigo, m.mis, m.eq]), [['PC:PC-01', 'PC-01', 'IFR', 'C172']]);
    // O curso sem missões também vai (a conversão espelha o cadastro)
    assert.deepEqual([inva.fases.length, inva.missoes], [1, []]);
  });

  it('os ids vêm de quem converte (o servidor recebe ids novos; a tela, ids fixos)', () => {
    let n = 0;
    const programa = programaDoLegado(normalizarCursos({ PP: [missao('PP-01')] }), () => `id-${++n}`);
    assert.deepEqual([programa[0].fases[0].id, programa[0].missoes[0].id, programa[0].missoes[0].fase], ['id-1', 'id-2', 'id-1']);
    assert.equal(new Set(programa.flatMap(c => [...c.fases, ...c.missoes].map(x => x.id))).size, n, 'um id para cada fase e missão');
  });
});

describe('O índice do programa', () => {
  // O PP com a NAV-02 tirada do programa e uma fase tirada (sem missões), na mesma ordem da Fase 2
  const comRetiradas = () => {
    const curso = cursoPP();
    curso.missoes.find(m => m.codigo === 'NAV-02').removida = true;
    curso.fases.push({ id: 'PP:velha', nome: 'Fase velha', modulo: null, ordem: 1, regra: 'ordem', requer: [], removida: true });
    // Fora da ordem na lista: o caminho segue a ordem
    curso.fases.reverse();
    curso.missoes.reverse();
    return curso;
  };

  it('o curso pela sigla; o caminho: as fases e as missões do programa na ordem do curso, com a posição de cada missão', () => {
    const programa = [comRetiradas()];
    const indice = indiceDoPrograma(programa);
    assert.equal(indice.curso('PP'), programa[0]);
    assert.equal(indice.curso('PC'), null);
    assert.equal(indice.percurso('PC'), null);
    const { fases, porFase, missoes, posicao } = indice.percurso('PP');
    assert.deepEqual(fases.map(rotuloDaFase), ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 7', 'Fase 8', 'Fase 6', 'Fase 9']);
    assert.deepEqual(porFase.get('PP:F5').map(m => m.codigo), ['NAV-01', 'NAV-150NM', 'PE-01', 'PE-02', 'PE-03', 'PE-04'], 'a NAV-02 saiu');
    assert.equal(missoes.length, 46);
    assert.deepEqual(missoes.slice(-5).map(m => m.codigo), ['NAV-SOLO-05', 'TSL-01', 'NOT', 'TSL-02', 'AVX-CQ'], 'a Fase 6 depois da 8');
    assert.deepEqual([posicao.get('PP:IN-01'), posicao.get('PP:TSL-01'), posicao.get('PP:AVX-CQ'), posicao.has('PP:NAV-02')], [0, 42, 45, false]);
  });

  it('a missão pelo id e pelo código, também a tirada do programa (o código antigo continua com nome)', () => {
    const indice = indiceDoPrograma([comRetiradas(), ...programaDoLegado(normalizarCursos({ PC: [missao('PC-01')] }), gerarId).slice(1)]);
    assert.equal(indice.missao('PP:NAV-02').nome, 'NAV 02');
    assert.equal(indice.missaoPorCodigo('PP', 'NAV-02').removida, true);
    assert.equal(indice.missaoPorCodigo('PC', 'PC-01').id, 'PC:PC-01');
    assert.equal(indice.missaoPorCodigo('PC', 'NAV-02'), null, 'o código é do curso');
    assert.equal(indice.missao('PP:XX'), null);
  });

  it('calculado uma vez por lista de cursos e uma vez por curso', () => {
    const programa = [cursoPP()];
    assert.equal(indiceDoPrograma(programa), indiceDoPrograma(programa));
    assert.notEqual(indiceDoPrograma(programa), indiceDoPrograma([...programa]));
    assert.equal(indiceDoPrograma(programa).percurso('PP'), percursoDoCurso(programa[0]));
    assert.equal(percursoDoCurso(programa[0]), percursoDoCurso(programa[0]));
  });

  it('o nome curto da fase: o que vem antes do travessão', () => {
    assert.deepEqual(['Fase 6 – Treinamento de Voo Noturno', 'Fase 3 — Coordenação', 'Fase 2 - Navegação', 'Pré-solo', 'Programa', 'Fase 10'].map(nome => rotuloDaFase({ nome })),
      ['Fase 6', 'Fase 3', 'Fase 2', 'Pré-solo', 'Programa', 'Fase 10']);
  });
});

const AGORA = '2026-11-18T13:00:00.000Z';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const porId = lista => [...lista].sort((a, b) => (a.id < b.id ? -1 : 1));
// O curso com as listas em qualquer ordem (os casos comparam pelo id)
const pelosIds = curso => ({ ...curso, fases: porId(curso.fases), missoes: porId(curso.missoes) });
const semHora = ({ registrado_em, ...versao }) => versao;

describe('A gravação de um curso e a conversão do cadastro: os casos do banco, pela regra do app', () => {
  for (const caso of CASOS_DO_PROGRAMA) {
    it(caso.nome, () => {
      const antes = structuredClone(caso.antes);
      const fazer = () => (caso.salvar ? gravarCurso(antes, { ...caso.salvar, agora: AGORA }) : importarProgramas(antes, { ...caso.importar, agora: AGORA }));
      if (caso.erro) {
        assert.throws(fazer, caso.erro);
        assert.deepEqual(antes, caso.antes, 'a recusa não muda nada');
        return;
      }
      const { cursos, retorno, ...gravado } = fazer();
      assert.deepEqual(antes, caso.antes, 'a regra não muda o que estava guardado: devolve os cursos novos');
      assert.deepEqual(retorno, caso.salvar ? { versao: caso.retorno.versao, atualizado_em: AGORA } : caso.retorno);
      const { sigla } = caso.depois;
      assert.deepEqual(pelosIds(cursos.find(c => c.sigla === sigla)), pelosIds(caso.depois));
      assert.deepEqual(cursos.filter(c => c.sigla !== sigla), caso.antes.cursos.filter(c => c.sigla !== sigla), 'os outros cursos ficam como estavam');
      const versoes = caso.salvar ? [gravado.alteracao] : gravado.alteracoes;
      assert.deepEqual(versoes.length ? semHora(versoes.at(-1)) : null, caso.alteracao);
      assert.ok(versoes.every(v => v.registrado_em === AGORA), 'a hora da gravação');
    });
  }
});

describe('A gravação de um curso: o que os casos do banco não mostram', () => {
  // O ZZ9 dos casos guardado na versão 1, com um resultado em ZZ9-01 e o cadastro no formato dos cursos; o PP com uma
  // fase (um id de outro curso)
  const FASE_DO_PP = '00000000-0000-4000-8000-000000000001';
  function comZZ9() {
    const vazio = { cursos: cursosIniciais(), resultados: [], cadastro: null };
    const pp = { nome: 'Piloto Privado', ativo: true, fases: [{ id: FASE_DO_PP, nome: 'Fase 1' }], missoes: [] };
    const { cursos } = gravarCurso(vazio, { sigla: 'PP', versaoLida: 1, conteudo: pp, descricao: 'PP: Fase 1 incluída', agora: AGORA });
    const comZz9 = gravarCurso({ ...vazio, cursos }, { sigla: 'ZZ9', versaoLida: 0, conteudo: PROGRAMA, descricao: 'Curso ZZ9 criado', agora: AGORA });
    return { cursos: comZz9.cursos, resultados: [{ curso: 'ZZ9', missao: 'ZZ9-01' }], cadastro: { esquema: FORMATO_DOS_CURSOS, versao: 7 } };
  }
  const salvarZZ9 = (conteudo, extra = {}) => gravarCurso(comZZ9(), { sigla: 'ZZ9', versaoLida: 1, conteudo, descricao: 'ZZ9: alteração de teste', agora: AGORA, ...extra });
  const comMissao = (conteudo, i, campos) => ({ ...conteudo, missoes: conteudo.missoes.map((m, j) => (j === i ? { ...m, ...campos } : m)) });
  const comFase = (conteudo, i, campos) => ({ ...conteudo, fases: conteudo.fases.map((f, j) => (j === i ? { ...f, ...campos } : f)) });
  const zz9 = gravado => gravado.cursos.find(c => c.sigla === 'ZZ9');
  const doZZ9 = (gravado, id) => [...zz9(gravado).fases, ...zz9(gravado).missoes].find(x => x.id === id);

  it('com mais de um problema, a recusa é a primeira que o servidor daria', () => {
    const muitasFases = Array.from({ length: 51 }, (_, i) => ({ id: i ? `00000000-0000-4000-8001-${String(i).padStart(12, '0')}` : IDS.maiusculo, nome: `Fase ${i + 1}` }));
    const casos = [
      // O formato do cadastro, antes da descrição
      [() => gravarCurso({ ...comZZ9(), cadastro: { esquema: FORMATO_DOS_CURSOS - 1, versao: 7 } }, { sigla: 'ZZ9', versaoLida: 1, conteudo: PROGRAMA, descricao: '' }),
        { code: 'PT409', campo: 'formato' }],
      // A descrição, o nome do curso, "ativo", a versão lida ou a sigla, e só então o programa
      [() => salvarZZ9({ ...PROGRAMA, nome: '' }, { descricao: '' }), { code: '22023', campo: 'descricao' }],
      [() => salvarZZ9({ ...PROGRAMA, nome: '', ativo: 'sim' }), { code: '22023', campo: 'nome' }],
      [() => salvarZZ9({ ...PROGRAMA, ativo: 'sim' }, { versaoLida: 9 }), { code: '22023', campo: 'ativo' }],
      [() => salvarZZ9(comMissao(PROGRAMA, 0, { codigo: 'x' }), { versaoLida: 9 }), { code: 'PT409', campo: null }],
      [() => salvarZZ9(comMissao(PROGRAMA, 0, { codigo: 'x' }), { sigla: 'zz', versaoLida: 0 }), { code: '22023', campo: 'sigla' }],
      // No programa: o limite antes dos ids; o id de outro curso antes dos campos
      [() => salvarZZ9({ ...PROGRAMA, fases: muitasFases, missoes: [] }), { code: '22023', campo: 'limite' }],
      [() => salvarZZ9({ ...comFase(PROGRAMA, 1, { nome: '' }), fases: [...comFase(PROGRAMA, 1, { nome: '' }).fases, { id: FASE_DO_PP, nome: 'Outra' }] }),
        { code: '22023', campo: 'id' }],
      // Os campos, um de cada vez: o módulo antes da regra da fase; a regra da fase antes da fase da missão; o nome da missão
      // antes do tipo
      [() => salvarZZ9(comFase(comFase(PROGRAMA, 0, { regra: 'sempre' }), 1, { modulo: '' })), { code: '22023', campo: 'modulo' }],
      [() => salvarZZ9(comMissao(comFase(PROGRAMA, 0, { regra: 'sempre' }), 0, { fase: IDS.fora })), { code: '22023', campo: 'regra' }],
      [() => salvarZZ9(comMissao(comMissao(PROGRAMA, 0, { nome: ' ' }), 4, { eq: 'C152' })), { code: '22023', campo: 'nome' }],
      // O código fora do formato antes do repetido; o repetido antes dos requisitos; os requisitos antes do código travado
      [() => salvarZZ9(comMissao(comMissao(PROGRAMA, 1, { codigo: 'ZZ9-01' }), 4, { codigo: 'zz' })), { code: '22023', campo: 'codigo' }],
      [() => salvarZZ9(comMissao(comMissao(PROGRAMA, 1, { codigo: 'ZZ9-01' }), 3, { requer: [IDS.m5] })), { code: '23505', campo: 'codigo' }],
      [() => salvarZZ9(comMissao(comMissao(PROGRAMA, 0, { codigo: 'ZZ9-10' }), 3, { requer: [IDS.m5] })), { code: '22023', campo: 'requer' }]
    ];
    for (const [fazer, erro] of casos) assert.throws(fazer, erro, JSON.stringify(erro));
  });

  it('os nomes e as horas como o banco mede e guarda: só o espaço sai das pontas, em caracteres; as horas com uma casa', () => {
    // btrim tira só o espaço: o nome só com uma tabulação vale; o nome fica como veio
    const r = salvarZZ9(comFase({ ...PROGRAMA, nome: '  Curso de teste  ' }, 1, { nome: '\t' }));
    assert.deepEqual([zz9(r).nome, doZZ9(r, IDS.f2).nome], ['  Curso de teste  ', '\t']);
    // Em caracteres (80 aviões são 160 unidades de texto no JS); a descrição não perde os espaços
    assert.equal(zz9(salvarZZ9({ ...PROGRAMA, nome: '🛩'.repeat(80) })).nome.length, 160);
    assert.throws(() => salvarZZ9({ ...PROGRAMA, nome: '🛩'.repeat(81) }), { code: '22023', campo: 'nome' });
    assert.equal(salvarZZ9(PROGRAMA, { descricao: '🛩'.repeat(500) }).alteracao.descricao.length, 1000);
    assert.equal(salvarZZ9(PROGRAMA, { descricao: ' ' }).alteracao.descricao, ' ');
    assert.throws(() => salvarZZ9(PROGRAMA, { descricao: '🛩'.repeat(501) }), { code: '22023', campo: 'descricao' });
    // As horas com uma casa, como o round() do Postgres (a metade vai para cima); o tipo e o recurso conferidos com elas
    const horas = nb => doZZ9(salvarZZ9(comMissao(PROGRAMA, 0, { nb })), IDS.m1).nb;
    assert.deepEqual([1.15, 1.25, 1.149, 0.05, 5.04].map(horas), [1.2, 1.3, 1.1, 0.1, 5]);
    for (const nb of [0.04, 5.05, '1', null]) assert.throws(() => horas(nb), { code: '22023', campo: 'mis' }, String(nb));
    // O Ground de 1,45 h é o de 1,5 h
    assert.equal(doZZ9(salvarZZ9(comMissao(PROGRAMA, 1, { nb: 1.45 })), IDS.m2).nb, 1.5);
  });

  it('as horas de duas casas, de 0,01 a 6 h, como o round() do Postgres faz com o número escrito', () => {
    // A conta em decimal, pelo texto do número (a do banco): a segunda casa decide
    const doBanco = texto => { const [inteira, casas] = texto.split('.'); return (Number(inteira) * 10 + Number(casas[0]) + (casas[1] >= '5' ? 1 : 0)) / 10; };
    const comHoras = nb => ({ nome: 'Curso de teste', ativo: true, fases: [{ id: IDS.f1, nome: 'Fase 1' }], missoes: [{ id: IDS.m1, fase: IDS.f1, codigo: 'ZZ9-01', nome: 'Voo', mis: 'Voo Local', eq: 'C152', nb }] });
    for (let centesimos = 1; centesimos <= 600; centesimos++) {
      const texto = (centesimos / 100).toFixed(2), esperado = doBanco(texto);
      const gravar = () => gravarCurso({ cursos: [], resultados: [], cadastro: null }, { sigla: 'ZZ9', versaoLida: 0, conteudo: comHoras(Number(texto)), descricao: 'Curso ZZ9 criado' });
      if (esperado > 0 && esperado <= 5) assert.equal(gravar().cursos[0].missoes[0].nb, esperado, texto);
      else assert.throws(gravar, { code: '22023', campo: 'mis' }, texto);
    }
  });

  it('o conteúdo vai como JSON: o campo undefined é o campo que falta', () => {
    const r = salvarZZ9(comMissao(comFase(PROGRAMA, 0, { modulo: undefined, requer: undefined }), 0, { regra: undefined, requer: undefined, dispensada: undefined }));
    assert.deepEqual([doZZ9(r, IDS.f1).modulo, doZZ9(r, IDS.m1).regra, doZZ9(r, IDS.m1).dispensada], [null, 'ordem', false]);
    assert.throws(() => salvarZZ9(undefined), { code: '22023', campo: 'limite' });
  });

  it('os requisitos ficam na ordem do curso; o que sai do programa perde os dele e guarda o resto; a missão não fica numa fase que sai', () => {
    assert.deepEqual(doZZ9(salvarZZ9(comMissao(PROGRAMA, 4, { regra: 'depois', requer: [IDS.m4, IDS.m1] })), IDS.m5).requer, [IDS.m1, IDS.m4]);
    // A Fase 3 ("depois" da Fase 1) sai com a missão dela: continua "depois", sem requisitos, como no banco
    const semF3 = { ...PROGRAMA, fases: PROGRAMA.fases.slice(0, 2), missoes: PROGRAMA.missoes.slice(0, 4) };
    const r = salvarZZ9(semF3);
    assert.deepEqual(doZZ9(r, IDS.f3), { id: IDS.f3, nome: 'Fase 3 – Noturno', modulo: null, ordem: 2, regra: 'depois', requer: [], removida: true });
    assert.deepEqual(doZZ9(r, IDS.m5), { ...doZZ9(salvarZZ9(PROGRAMA), IDS.m5), removida: true });
    // A fase marcada como retirada também sai, e a missão dela não fica no programa sem ela
    assert.throws(() => salvarZZ9(comFase(PROGRAMA, 2, { removida: true })), { code: '22023', campo: 'fase' });
  });

  it('o curso novo vai para o fim da lista (até 999); o primeiro curso é o 0. Sem cadastro, grava; o formato do cadastro é o número inteiro do "esquema"', () => {
    const criar = (cursos, cadastro = null) => gravarCurso({ cursos, resultados: [], cadastro }, { sigla: 'ZZ9', versaoLida: 0, conteudo: PROGRAMA, descricao: 'Curso ZZ9 criado', agora: AGORA });
    assert.deepEqual([criar([]), criar(cursosIniciais()), criar([{ ...cursosIniciais()[0], ordem: 999 }])].map(r => zz9(r).ordem), [0, 3, 999]);
    assert.equal(zz9(criar([], { esquema: FORMATO_DOS_CURSOS + 0.9, versao: 1 })).versao, 1);
    for (const esquema of [String(FORMATO_DOS_CURSOS), undefined, FORMATO_DOS_CURSOS - 0.1]) {
      assert.throws(() => criar([], { esquema, versao: 1 }), { code: 'PT409', campo: 'formato' }, String(esquema));
    }
  });

  it('novoId: um uuid novo a cada chamada, no formato que o servidor aceita', () => {
    const ids = Array.from({ length: 50 }, novoId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(id => UUID_V4.test(id)), ids.find(id => !UUID_V4.test(id)));
    const fase = novoId();
    const conteudo = { nome: 'Curso novo', ativo: true, fases: [{ id: fase, nome: 'Fase 1' }], missoes: [{ id: novoId(), fase, codigo: 'NV-01', nome: 'NV-01', mis: 'Voo Local', eq: 'C152', nb: 1 }] };
    const { retorno } = gravarCurso({ cursos: cursosIniciais(), resultados: [], cadastro: null }, { sigla: 'NV', versaoLida: 0, conteudo, descricao: 'Curso NV criado: Curso novo' });
    assert.equal(retorno.versao, 1);
  });
});

describe('A conversão do programa do cadastro: o que os casos do banco não mostram', () => {
  const legado = normalizarCursos({ PP: [missao('PP-01'), missao('PP-02', { mis: 'Navegação', nb: 2 })], PC: [missao('PC-01', { mis: 'IFR', eq: 'C172' })] });
  const antes = { cursos: cursosIniciais(), resultados: [], cadastro: { esquema: FORMATO_DOS_CURSOS - 1, versao: 3 } };
  const importar = (programas, estado = antes) => importarProgramas(estado, { programas, versaoDoCadastro: 3, autor: 'Operador', agora: AGORA });

  it('traz o programa de antes com ids novos e o lê de volta igual; o curso vazio e o igual ficam como estavam', () => {
    const programas = programaDoLegado(legado);
    assert.ok(programas.flatMap(c => [...c.fases, ...c.missoes]).every(x => UUID_V4.test(x.id)), 'ids novos, sem gerarId');
    const r = importar(programas);
    assert.equal(r.retorno, 3);
    assert.deepEqual(r.alteracoes.map(semHora), [
      { curso: 'PP', versao: 2, descricao: 'Programa trazido do cadastro (2 missões)', registrado_por: 'Operador' },
      { curso: 'PC', versao: 2, descricao: 'Programa trazido do cadastro (1 missão)', registrado_por: 'Operador' }
    ]);
    // O INVA não tem missões no cadastro nem no servidor (a mesma assinatura): fica sem fase nenhuma, como estava
    assert.deepEqual(r.cursos[2], antes.cursos[2]);
    const lido = normalizarProgramas(programaComResultados({ cursos: r.cursos, alteracoes: r.alteracoes }));
    const campos = c => c.missoes.map(m => [m.id, m.fase, m.codigo, m.nome, m.mis, m.eq, m.nb, m.ordem, m.regra]);
    assert.deepEqual(lido.slice(0, 2).map(campos), programas.slice(0, 2).map(campos));
    assert.deepEqual(lido.slice(0, 2).map(c => c.fases.map(f => f.id)), programas.slice(0, 2).map(c => c.fases.map(f => f.id)));
    // De novo, o mesmo programa: nada
    const deNovo = importar(programas, { ...antes, cursos: r.cursos });
    assert.deepEqual([deNovo.retorno, deNovo.alteracoes, deNovo.cursos], [0, [], r.cursos]);
  });

  it('uma recusa em qualquer curso não grava nada; o mesmo curso duas vezes: a segunda vê a primeira', () => {
    const programas = programaDoLegado(legado);
    const errado = { ...programas[1], missoes: [{ ...programas[1].missoes[0], codigo: 'pc 01' }] };
    assert.throws(() => importar([programas[0], errado]), { code: '22023', campo: 'codigo' });
    const duasVezes = importar([programas[0], programas[0]]);
    assert.deepEqual([duasVezes.retorno, duasVezes.alteracoes.length], [2, 1]);
  });

  it('o curso sem as listas, como o vazio guardado, é pulado (a assinatura é a mesma); com missões guardadas, é recusado', () => {
    assert.equal(importar([{ sigla: 'INVA', fases: 'x' }]).retorno, 0);
    const comPP = importar(programaDoLegado(legado)).cursos;
    assert.throws(() => importar([{ sigla: 'PP', fases: 'x' }], { ...antes, cursos: comPP }), { code: '22023', campo: 'limite' });
  });
});

describe('Os programas como o servidor devolve (programaComResultados)', () => {
  it('os cursos na ordem, as fases e as missões na ordem do banco (as retiradas no fim), as missões com resultados e as últimas 20 alterações', () => {
    const vazio = { cursos: cursosIniciais(), resultados: [], cadastro: null };
    const criado = gravarCurso(vazio, { sigla: 'ZZ9', versaoLida: 0, conteudo: PROGRAMA, descricao: 'Curso ZZ9 criado', agora: AGORA });
    const semM4 = { ...PROGRAMA, missoes: PROGRAMA.missoes.filter(m => m.id !== IDS.m4) };
    const { cursos } = gravarCurso({ ...vazio, cursos: criado.cursos }, { sigla: 'ZZ9', versaoLida: 1, conteudo: semM4, descricao: 'ZZ9: ZZ9-04 tirada do programa', agora: AGORA });
    const embaralhados = cursos.map(c => ({ ...c, fases: [...c.fases].reverse(), missoes: [...c.missoes].reverse() })).reverse();
    const alteracoes = [
      { curso: 'PP', versao: 2, descricao: 'PP', registrado_em: AGORA, registrado_por: 'Maria' },
      ...Array.from({ length: 25 }, (_, i) => ({ curso: 'ZZ9', versao: i + 1, descricao: `ZZ9: versão ${i + 1}`, registrado_em: AGORA, registrado_por: 'Maria' }))
    ];
    // Um resultado de outro curso com o mesmo código não conta
    const lido = programaComResultados({ cursos: embaralhados, resultados: [{ curso: 'ZZ9', missao: 'ZZ9-01' }, { curso: 'PP', missao: 'ZZ9-03' }], alteracoes });
    assert.deepEqual(lido.map(c => c.sigla), ['PP', 'PC', 'INVA', 'ZZ9']);
    const [pp, , , curso] = lido;
    assert.deepEqual(curso.fases.map(f => f.id), [IDS.f1, IDS.f2, IDS.f3]);
    assert.deepEqual(curso.missoes.map(m => [m.codigo, m.removida, m.comResultados]),
      [['ZZ9-01', false, true], ['ZZ9-02', false, false], ['ZZ9-03', false, false], ['ZZ9-05', false, false], ['ZZ9-04', true, false]]);
    assert.deepEqual(curso.alteracoes.map(a => a.versao), Array.from({ length: 20 }, (_, i) => 25 - i));
    assert.deepEqual(curso.alteracoes[0], { versao: 25, descricao: 'ZZ9: versão 25', registrado_em: AGORA, registrado_por: 'Maria' });
    assert.deepEqual([pp.alteracoes.length, pp.missoes], [1, []]);
    assert.deepEqual(normalizarProgramas(lido).at(-1).missoes.map(m => m.comResultados), [true, false, false, false, false]);
  });
});

// O Noturno em trechos: a ida, a noite e a volta do Noturno de dois dias, juntas na fase. O que o curso guarda e a tela
// manda de volta, o que o programa lido mantém, os Noturnos do curso e o nome do Noturno na próxima missão
describe('O Noturno em trechos (a ida, a noite e a volta)', () => {
  const { f2, m1, m4, m5, m6, m7 } = IDS;
  // O ZZ9 com o Noturno em trechos (na Fase 3: ZZ9-06, a ida; ZZ9-05, a noite; ZZ9-07, a volta), gravado e lido de volta
  // como a tela o tem
  function lido() {
    const estado = { cursos: cursosIniciais(), resultados: [], cadastro: { esquema: FORMATO_DOS_CURSOS, versao: 7 } };
    const { cursos } = gravarCurso(estado, { sigla: 'ZZ9', versaoLida: 0, conteudo: NOTURNO_EM_TRECHOS, descricao: 'Curso ZZ9 criado', agora: AGORA });
    return normalizarProgramas(programaComResultados({ cursos })).find(c => c.sigla === 'ZZ9');
  }
  const trechos = curso => curso.missoes.filter(m => m.trecho).map(m => [m.codigo, m.trecho]);
  const daMissao = (curso, id) => curso.missoes.find(m => m.id === id);
  const comMissao = (conteudo, id, campos) => ({ ...conteudo, missoes: conteudo.missoes.map(m => (m.id === id ? { ...m, ...campos } : m)) });

  it('o curso guarda o trecho só na missão que tem um, e a tela manda o mesmo de volta', () => {
    const zz9 = lido();
    assert.deepEqual(trechos(zz9), [['ZZ9-06', 'ida'], ['ZZ9-05', 'noite'], ['ZZ9-07', 'volta']]);
    assert.ok(zz9.missoes.filter(m => !m.trecho).every(m => !Object.hasOwn(m, 'trecho')));
    assert.deepEqual(conteudoDoCurso(zz9), NOTURNO_EM_TRECHOS);
    assert.equal(validarCurso(conteudoDoCurso(zz9)), null);
  });

  it('a missão que deixa de ser Noturno perde o trecho; o Noturno desmanchado é recusado na conferência', () => {
    const zz9 = lido();
    const idaNavegacao = mudarMissao(zz9, m6, 'mis', 'Navegação');
    assert.equal(Object.hasOwn(daMissao(idaNavegacao, m6), 'trecho'), false);
    assert.deepEqual(trechos(idaNavegacao), [['ZZ9-05', 'noite'], ['ZZ9-07', 'volta']]);
    assert.equal(validarCurso(conteudoDoCurso(idaNavegacao)), null, 'a noite e a volta continuam um Noturno');
    const semNoite = mudarMissao(zz9, m5, 'mis', 'Navegação');
    assert.deepEqual(trechos(semNoite), [['ZZ9-06', 'ida'], ['ZZ9-07', 'volta']]);
    assert.deepEqual(['code', 'campo'].map(c => validarCurso(conteudoDoCurso(semNoite))[c]), ['22023', 'trecho']);
    // O nome não mexe no trecho; a volta que sobe para antes da noite desmancha o Noturno
    assert.deepEqual(trechos(mudarMissao(zz9, m7, 'nome', 'Volta de BH')), trechos(zz9));
    assert.equal(validarCurso(conteudoDoCurso(moverMissao(zz9, m7, -1))).campo, 'trecho');
  });

  it('o programa lido: o trecho vale numa missão Noturno, no Noturno inteiro e junto na fase; fora do programa, ele fica', () => {
    const u = n => `00000000-0000-4000-8100-${String(n).padStart(12, '0')}`;
    const fase = (n, campos = {}) => ({ id: u(n), nome: `Fase ${n}`, modulo: null, ordem: n - 1, regra: 'ordem', requer: [], removida: false, ...campos });
    const missao = (n, faseN, trecho, campos = {}) => ({
      id: u(100 + n), fase: u(faseN), codigo: `PP-${n}`, nome: `Missão ${n}`, mis: 'Noturno', eq: 'C172', nb: 1, ordem: n, regra: 'ordem', requer: [],
      dispensada: false, avaliacao: false, removida: false, comResultados: false, ...(trecho ? { trecho } : {}), ...campos
    });
    const [pp] = normalizarProgramas([{
      sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true, versao: 1, alteracoes: [], fases: [fase(1), fase(2), fase(3, { removida: true })],
      missoes: [
        // Na Fase 1: um Noturno inteiro; o trecho fora da lista; o trecho num voo local; a ida e a noite com outra missão no meio
        missao(1, 1, 'ida'), missao(2, 1, 'noite'), missao(3, 1, 'volta'), missao(4, 1, 'translado'), missao(5, 1, 'ida', { mis: 'Voo Local', eq: 'C152' }),
        missao(6, 1, 'ida'), missao(7, 1), missao(8, 1, 'noite'),
        // Na Fase 2: duas noites juntas (as três missões perdem o trecho); a ida no fim da fase
        missao(9, 2, 'ida'), missao(10, 2, 'noite'), missao(11, 2, 'noite'), missao(12, 2), missao(13, 2, 'ida'),
        // Fora do programa (a missão retirada e a da fase retirada): o trecho fica, para a volta ao programa (no tipo Noturno)
        missao(14, 2, 'volta', { removida: true }), missao(15, 3, 'ida'), missao(16, 2, 'ida', { removida: true, mis: 'Voo Local', eq: 'C152' })
      ]
    }]);
    assert.deepEqual(trechos(pp), [['PP-1', 'ida'], ['PP-2', 'noite'], ['PP-3', 'volta'], ['PP-8', 'noite'], ['PP-15', 'ida'], ['PP-14', 'volta']]);
  });

  it('os Noturnos do curso e o nome do Noturno na próxima missão: a noite, com os translados que voam junto', () => {
    const zz9 = lido();
    const doNoturno = noturnosDoCurso(zz9);
    assert.equal(noturnosDoCurso(zz9), doNoturno, 'calculado uma vez por curso');
    const noturno = doNoturno.get(m5);
    assert.deepEqual([noturno.ida.codigo, noturno.noite.codigo, noturno.volta.codigo], ['ZZ9-06', 'ZZ9-05', 'ZZ9-07']);
    assert.deepEqual([doNoturno.get(m6), doNoturno.get(m7), doNoturno.has(m1)], [noturno, noturno, false]);
    assert.deepEqual([m5, m6, m7, m1].map(id => rotuloDaMissao(zz9, daMissao(zz9, id))), ['ZZ9-05 (com ZZ9-06 e ZZ9-07)', 'ZZ9-06', 'ZZ9-07', 'ZZ9-01']);
    // Sem a volta; com a ida dispensada (ela não voa); a sequência que não forma um Noturno não conta
    const semVolta = retirarMissao(zz9, m7);
    assert.equal(rotuloDaMissao(semVolta, daMissao(semVolta, m5)), 'ZZ9-05 (com ZZ9-06)');
    const idaDispensada = { ...zz9, missoes: zz9.missoes.map(m => (m.id === m6 ? { ...m, dispensada: true } : m)) };
    assert.equal(rotuloDaMissao(idaDispensada, daMissao(idaDispensada, m5)), 'ZZ9-05 (com ZZ9-07)');
    const duasVoltas = { ...zz9, missoes: zz9.missoes.map(m => (m.id === m5 ? { ...m, trecho: 'volta' } : m)) };
    assert.deepEqual([noturnosDoCurso(duasVoltas).size, rotuloDaMissao(duasVoltas, daMissao(duasVoltas, m5))], [0, 'ZZ9-05']);
  });

  it('a recusa do trecho vem depois da "avaliação" e antes dos códigos e dos requisitos', () => {
    const recusa = conteudo => { const { code, campo } = validarCurso(conteudo); return `${code} ${campo}`; };
    const idaNavegacao = comMissao(NOTURNO_EM_TRECHOS, m6, { mis: 'Navegação' });
    assert.equal(recusa(comMissao(idaNavegacao, m4, { avaliacao: 1 })), '22023 avaliacao');
    assert.equal(recusa(comMissao(idaNavegacao, m1, { codigo: 'ZZ9-02' })), '22023 trecho', 'antes do código repetido');
    const emDuasFases = comMissao(NOTURNO_EM_TRECHOS, m6, { fase: f2 });
    assert.equal(recusa(comMissao(emDuasFases, m1, { codigo: 'ZZ9-02' })), '22023 trecho', 'a sequência também');
    assert.equal(recusa(comMissao(emDuasFases, m4, { requer: [m5] })), '22023 trecho', 'antes dos requisitos');
  });

  it('o programa de antes (o do cadastro) não tem trecho: a conversão não traz nenhum', () => {
    const legado = normalizarCursos({ PP: [{ id: 'TSL-01', mis: 'Noturno', trecho: 'ida' }, { id: 'NOT', mis: 'Noturno', nb: 3, trecho: 'noite' }] });
    const [pp] = programaDoLegado(legado, gerarId);
    assert.deepEqual(pp.missoes.map(m => [m.codigo, Object.hasOwn(m, 'trecho')]), [['TSL-01', false], ['NOT', false]]);
  });
});

describe('O programa lido, nos formatos certos (normalizarProgramas)', () => {
  const u = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const fase = (n, campos = {}) => ({ id: u(n), nome: `Fase ${n}`, modulo: null, ordem: n - 1, regra: 'ordem', requer: [], removida: false, ...campos });
  const missaoDe = (n, faseN, campos = {}) => ({
    id: u(100 + n), fase: u(faseN), codigo: `PP-${String(n).padStart(2, '0')}`, nome: `Missão ${n}`, mis: 'Voo Local', eq: 'C152', nb: 1,
    ordem: n - 1, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false, comResultados: false, ...campos
  });
  const curso = (campos = {}) => ({
    sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true, versao: 3, fases: [fase(1), fase(2)],
    missoes: [missaoDe(1, 1), missaoDe(2, 1), missaoDe(3, 2, { ordem: 0 })], alteracoes: [], ...campos
  });

  it('o programa do servidor fica como veio', () => {
    const programa = [curso({ alteracoes: [{ versao: 3, descricao: 'PP: PP-03 incluída na Fase 2', registrado_em: AGORA, registrado_por: 'Admin' }] })];
    assert.deepEqual(normalizarProgramas(structuredClone(programa)), programa);
  });

  it('os cursos: a sigla no formato, o primeiro de cada sigla, na ordem; sem nome, a sigla; sem lista, nenhum', () => {
    const lidos = normalizarProgramas([null, 'PP', curso({ sigla: 'pp' }), curso({ sigla: 'PC-IFR', ordem: 5, nome: '  ', ativo: undefined, versao: 0 }),
      curso({ ordem: 1 }), curso({ ordem: 0, nome: 'Outro PP' })]);
    assert.deepEqual(lidos.map(c => [c.sigla, c.nome, c.ordem, c.ativo, c.versao]), [['PP', 'Piloto Privado', 1, true, 3], ['PC-IFR', 'PC-IFR', 5, true, 1]]);
    assert.deepEqual([normalizarProgramas(null), normalizarProgramas({})], [[], []]);
  });

  it('as fases e as missões fora do formato saem: sem id (uuid), id repetido, código, tipo de missão ou fase do curso', () => {
    const [lido] = normalizarProgramas([curso({
      fases: [fase(1), fase(2, { id: 'F2' }), fase(3, { id: u(1) }), fase(4, { id: '00000000-0000-4000-8000-0000000000AA' }), null],
      missoes: [missaoDe(1, 1), missaoDe(2, 1, { codigo: 'pp 02' }), missaoDe(3, 1, { mis: 'Inexistente' }), missaoDe(4, 1, { mis: ['Voo Local'] }),
        missaoDe(5, 2), missaoDe(6, 9), missaoDe(7, 1, { id: u(1) }), missaoDe(8, 1, { id: u(101) }), null]
    })]);
    assert.deepEqual([lido.fases.map(f => f.id), lido.missoes.map(m => m.codigo)], [[u(1)], ['PP-01']]);
  });

  it('o recurso é um dos do tipo (senão o padrão), o Ground tem 1,5 h, as horas vão até 5; sem nome, a missão leva o código', () => {
    const [{ missoes }] = normalizarProgramas([curso({ missoes: [
      missaoDe(1, 1, { mis: 'Noturno', eq: 'C152' }), missaoDe(2, 1, { mis: 'Ground C152', eq: 'C152', nb: 3, nome: '' }),
      missaoDe(3, 1, { nb: 7, nome: '  Navegação   longa ' }), missaoDe(4, 1, { nb: 'x', nome: null })
    ] })]);
    assert.deepEqual(missoes.map(m => [m.eq, m.nb, m.nome]), [['C172', 1, 'Missão 1'], ['Sala Ground', 1.5, 'PP-02'], ['C152', 5, 'Navegação longa'], ['C152', 1, 'PP-04']]);
  });

  it('os nomes que o servidor aceita voltam inteiros: até 80 caracteres contados como o banco (um emoji é um só), sem emoji pela metade', () => {
    // 80 caracteres para o banco, 159 unidades de texto no JS
    const noLimite = `a${'🛩'.repeat(79)}`, longo = `b${'🛩'.repeat(85)} `;
    const [lido] = normalizarProgramas([curso({
      nome: '🛩'.repeat(80), fases: [fase(1, { nome: noLimite, modulo: noLimite }), fase(2, { nome: longo })],
      missoes: [missaoDe(1, 1, { nome: noLimite }), missaoDe(2, 2, { nome: longo, ordem: 0 })]
    })]);
    assert.deepEqual([lido.nome, lido.fases[0].nome, lido.fases[0].modulo, lido.missoes[0].nome], ['🛩'.repeat(80), noLimite, noLimite, noLimite]);
    // Mais longo (só gravado fora do app): os 80 primeiros caracteres, o que o banco aceita. Nenhum nome com meio emoji (o
    // JSON da gravação seguinte, que o banco recusaria)
    assert.deepEqual([lido.fases[1].nome, lido.missoes[1].nome], [`b${'🛩'.repeat(79)}`, `b${'🛩'.repeat(79)}`]);
    const meioEmoji = /[\ud800-\udbff](?![\udc00-\udfff])/;
    assert.ok([lido.nome, ...lido.fases.flatMap(f => [f.nome, f.modulo || '']), ...lido.missoes.map(m => m.nome)].every(nome => !meioEmoji.test(nome)));
  });

  it('um código repetido: vale a missão do programa que vem primeiro (a retirada perde)', () => {
    const [lido] = normalizarProgramas([curso({ missoes: [missaoDe(1, 1, { removida: true, codigo: 'PP-09' }), missaoDe(2, 1, { codigo: 'PP-09' }), missaoDe(3, 2, { codigo: 'PP-09' })] })]);
    assert.deepEqual(lido.missoes.map(m => m.id), [u(102)]);
  });

  it('os requisitos só apontam para trás; "depois de…" sem nenhum vira "depois das anteriores"; a retirada fica sem nenhum', () => {
    const [lido] = normalizarProgramas([curso({
      fases: [fase(1), fase(2, { regra: 'depois', requer: [u(3), u(2), u(9), u(1), u(1), 5] }), fase(3, { regra: 'depois', requer: [u(3)] }),
        fase(4, { regra: 'depois', requer: [u(1)], removida: true })],
      missoes: [missaoDe(1, 1), missaoDe(2, 1, { regra: 'depois', requer: [u(103), u(101)] }), missaoDe(3, 2, { ordem: 0, requer: [u(101)] }),
        missaoDe(4, 2, { ordem: 1, regra: 'depois', requer: [u(102)] }), missaoDe(5, 1, { removida: true, regra: 'depois', requer: [u(101)] })]
    })]);
    assert.deepEqual(lido.fases.map(f => [f.regra, f.requer]), [['ordem', []], ['depois', [u(1)]], ['ordem', []], ['ordem', []]]);
    assert.deepEqual(lido.missoes.map(m => [m.codigo, m.regra, m.requer]),
      [['PP-01', 'ordem', []], ['PP-02', 'depois', [u(101)]], ['PP-03', 'ordem', []], ['PP-04', 'depois', [u(102)]], ['PP-05', 'ordem', []]]);
  });

  it('em ordem, as retiradas no fim; no programa, até 50 fases e 200 missões (as retiradas ficam todas)', () => {
    const fases = [...Array.from({ length: 52 }, (_, i) => fase(52 - i)), fase(53, { removida: true })];
    const missoes = [...Array.from({ length: 201 }, (_, i) => missaoDe(i + 1, 1, { codigo: `PP-${i + 1}` })), missaoDe(300, 51), missaoDe(301, 1, { removida: true, codigo: 'PP-X' })];
    const [lido] = normalizarProgramas([curso({ fases, missoes: missoes.reverse() })]);
    assert.deepEqual(lido.fases.map(f => f.id), [...Array.from({ length: 50 }, (_, i) => u(i + 1)), u(53)]);
    assert.deepEqual([lido.missoes.length, lido.missoes[0].codigo, lido.missoes.at(-2).codigo, lido.missoes.at(-1).codigo], [201, 'PP-1', 'PP-200', 'PP-X']);
  });

  it('as alterações: as 20 primeiras (as mais recentes), nos formatos certos', () => {
    const alteracoes = [{ versao: 'x', descricao: 'fora' },
      ...Array.from({ length: 22 }, (_, i) => ({ versao: 30 - i, descricao: `versão ${30 - i}`, registrado_em: AGORA, registrado_por: i ? 'Maria' : 7 }))];
    const [{ alteracoes: lidas }] = normalizarProgramas([curso({ alteracoes })]);
    assert.deepEqual([lidas.length, lidas[0], lidas.at(-1).versao], [20, { versao: 30, descricao: 'versão 30', registrado_em: AGORA, registrado_por: null }, 11]);
  });
});

// A aba Cursos muda o curso na tela na hora e grava o curso inteiro: cada operação devolve o curso como fica, e ele tem
// de ser o que o servidor grava e devolve depois (a tela não mostra uma coisa e grava outra)
describe('A edição do programa na aba Cursos', () => {
  const { f1, f2, f3, m1, m2, m3, m4, m5 } = IDS;
  const NO_FORMATO = { esquema: FORMATO_DOS_CURSOS, versao: 7 };
  // O ZZ9 dos casos como a tela o tem: gravado e lido de volta, como o servidor devolve (programa_dos_cursos)
  const lido = (estado, sigla = 'ZZ9') => normalizarProgramas(programaComResultados(estado)).find(c => c.sigla === sigla);
  function guardado() {
    const estado = { cursos: cursosIniciais(), resultados: [], cadastro: NO_FORMATO };
    const { cursos } = gravarCurso(estado, { sigla: 'ZZ9', versaoLida: 0, conteudo: PROGRAMA, descricao: 'Curso ZZ9 criado', agora: AGORA });
    return { ...estado, cursos };
  }
  // O curso como a tela o mandaria (conteudoDoCurso), gravado a partir da versão dele e lido de volta
  function regravado(estado, curso) {
    const { cursos } = gravarCurso(estado, { sigla: curso.sigla, versaoLida: curso.versao, conteudo: conteudoDoCurso(curso), descricao: `${curso.sigla}: alteração`, agora: AGORA });
    return { estado: { ...estado, cursos }, curso: lido({ ...estado, cursos }, curso.sigla) };
  }
  const semVersao = ({ versao, alteracoes, ...curso }) => pelosIds(curso);
  const codigos = (curso, fase) => percursoDoCurso(curso).porFase.get(fase).map(m => m.codigo);
  let n = 0;
  const gerarId = () => `00000000-0000-4000-8abc-${String(++n).padStart(12, '0')}`;

  it('o conteúdo da gravação: as fases e as missões do programa, na ordem, sem as tiradas nem os campos da tela', () => {
    const zz9 = lido(guardado());
    assert.deepEqual(conteudoDoCurso(zz9), PROGRAMA);
    assert.equal(validarCurso(conteudoDoCurso(zz9)), null);
    const semM5 = retirarMissao(zz9, m5);
    assert.deepEqual(conteudoDoCurso(semM5).missoes.map(m => m.id), [m1, m2, m3, m4]);
    assert.deepEqual(Object.keys(conteudoDoCurso(semM5).missoes[0]), Object.keys(PROGRAMA.missoes[0]));
  });

  it('cada operação dá o curso que o servidor grava e devolve (só a versão e as alterações mudam)', () => {
    let { estado, curso } = { estado: guardado(), curso: lido(guardado()) };
    const passos = [
      c => incluirMissao(c, f1, gerarId).curso,
      c => mudarMissao(c, m1, 'nome', '  Primeiro   voo local  '),
      c => mudarMissao(c, m2, 'mis', 'Voo Local'),
      c => moverMissao(c, m2, -1),
      c => mudarMissao(c, m3, 'codigo', 'zz9-30'),
      c => mudarMissao(c, m5, 'nb', 2.5),
      c => retirarMissao(c, m1),
      c => incluirMissao(c, null, gerarId).curso,
      c => moverMissao(c, m4, -1)
    ];
    for (const [i, passo] of passos.entries()) {
      const novo = passo(curso);
      assert.ok(novo, `passo ${i}`);
      assert.equal(validarCurso(conteudoDoCurso(novo)), null, `passo ${i}`);
      ({ estado, curso } = regravado(estado, novo));
      assert.deepEqual(semVersao(curso), semVersao(novo), `passo ${i}`);
      assert.equal(curso.versao, novo.versao + 1);
    }
    assert.deepEqual([codigos(curso, f1), codigos(curso, f2), codigos(curso, f3)], [['ZZ9-02', 'ZZ9-06'], ['ZZ9-04', 'ZZ9-30'], ['ZZ9-05', 'ZZ9-31']], 'a seguinte à ZZ9-05 já era a da Fase 1: o próximo número livre');
  });

  it('"+ Missão": no fim da fase, com o tipo, o recurso e as horas da anterior e o código seguinte ao dela (ou o próximo livre do curso)', () => {
    const zz9 = lido(guardado());
    const noFim = (faseId, curso = zz9) => incluirMissao(curso, faseId, gerarId);
    // Na Fase 3, a seguinte à ZZ9-05 está livre; na Fase 1, a ZZ9-03 é de outra missão: o próximo número livre do curso
    const naF3 = noFim(f3);
    assert.deepEqual([naF3.missao.codigo, naF3.missao.nome, naF3.missao.mis, naF3.missao.eq, naF3.missao.nb, naF3.missao.ordem, naF3.missao.fase], ['ZZ9-06', 'ZZ9-06', 'Noturno', 'C172', 3, 1, f3]);
    assert.deepEqual([naF3.missao.regra, naF3.missao.requer, naF3.missao.dispensada, naF3.missao.avaliacao, naF3.missao.comResultados], ['ordem', [], false, false, false]);
    const naF1 = noFim(f1);
    assert.deepEqual([naF1.missao.codigo, naF1.missao.mis, naF1.missao.eq, naF1.missao.nb], ['ZZ9-06', 'Ground C152', 'Sala Ground', 1.5]);
    assert.deepEqual(codigos(naF1.curso, f1), ['ZZ9-01', 'ZZ9-02', 'ZZ9-06']);
    // A missão tirada do programa guarda o código: ele não volta
    assert.equal(noFim(f3, retirarMissao(zz9, m5)).missao.codigo, 'ZZ9-06');
    const comAntiga = noFim(f1, incluirMissao(zz9, f3, gerarId).curso);
    assert.equal(noFim(f1, retirarMissao(comAntiga.curso, comAntiga.missao.id)).missao.codigo, 'ZZ9-08', 'a ZZ9-07 saiu do programa e guarda o código');
    // Sem fase dita, a última; uma fase que não está no programa, nada
    assert.equal(incluirMissao(zz9, null, gerarId).missao.fase, f3);
    assert.equal(incluirMissao(zz9, IDS.fora, gerarId), null);
    assert.deepEqual(zz9, lido(guardado()), 'o curso recebido não muda');
  });

  it('o código da missão nova segue o formato da anterior (TMA-05 → TMA-06, AVP-SOLO-05 → AVP-SOLO-06, PP-099 → PP-100)', () => {
    const fase = { id: gerarId(), nome: 'Fase 4', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false };
    const comUltima = codigo => ({
      sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true, versao: 1, fases: [fase], alteracoes: [],
      missoes: [{ id: gerarId(), fase: fase.id, codigo, nome: codigo, mis: 'Voo Local', eq: 'C152', nb: 1, ordem: 0, regra: 'ordem', requer: [], dispensada: false, avaliacao: false, removida: false, comResultados: false }]
    });
    const seguinte = codigo => incluirMissao(comUltima(codigo), fase.id, gerarId).missao.codigo;
    assert.deepEqual(['TMA-05', 'AVP-SOLO-05', 'PP-099', 'CT-9', 'NAV-150NM', 'NOT', 'ABCDEFGHIJKLM-9'].map(seguinte),
      ['TMA-06', 'AVP-SOLO-06', 'PP-100', 'CT-10', 'PP-01', 'PP-01', 'PP-01']);
  });

  it('"+ Missão" no curso sem fases: a Fase 1 entra com a missão (um voo local de 1 h no C152, com o primeiro número do curso)', () => {
    const [pp] = normalizarProgramas(cursosIniciais());
    const { curso, missao } = incluirMissao(pp, null, gerarId);
    assert.deepEqual(curso.fases.map(({ nome, modulo, ordem, regra, requer, removida }) => ({ nome, modulo, ordem, regra, requer, removida })),
      [{ nome: 'Fase 1', modulo: null, ordem: 0, regra: 'ordem', requer: [], removida: false }]);
    assert.deepEqual([missao.fase, missao.codigo, missao.nome, missao.mis, missao.eq, missao.nb, missao.ordem], [curso.fases[0].id, 'PP-01', 'PP-01', 'Voo Local', 'C152', 1, 0]);
    const estado = { cursos: cursosIniciais(), resultados: [], cadastro: NO_FORMATO };
    assert.deepEqual(semVersao(regravado(estado, curso).curso), semVersao(curso));
  });

  it('um campo da missão: o código em maiúsculas (o nome igual ao código acompanha), o nome sem espaços a mais (vazio: o código), o tipo com o recurso e as horas', () => {
    const zz9 = lido(guardado());
    const missaoDe = (curso, id) => curso.missoes.find(m => m.id === id);
    const comNomeDeCodigo = mudarMissao(zz9, m5, 'nome', '');
    assert.equal(missaoDe(comNomeDeCodigo, m5).nome, 'ZZ9-05');
    assert.deepEqual(['codigo', 'nome'].map(c => missaoDe(mudarMissao(comNomeDeCodigo, m5, 'codigo', ' zz9-50 '), m5)[c]), ['ZZ9-50', 'ZZ9-50']);
    assert.deepEqual(['codigo', 'nome'].map(c => missaoDe(mudarMissao(zz9, m5, 'codigo', 'ZZ9-50'), m5)[c]), ['ZZ9-50', 'Noturno'], 'o nome próprio fica');
    assert.equal(missaoDe(mudarMissao(zz9, m1, 'nome', ` ${'x'.repeat(90)} `), m1).nome, 'x'.repeat(80));
    const tipo = (curso, id) => ['mis', 'eq', 'nb'].map(c => missaoDe(curso, id)[c]);
    assert.deepEqual(tipo(mudarMissao(zz9, m1, 'mis', 'Ground Navegação'), m1), ['Ground Navegação', 'Sala Ground', 1.5]);
    assert.deepEqual(tipo(mudarMissao(zz9, m2, 'mis', 'Voo Local'), m2), ['Voo Local', 'C152', 1.5], 'do Ground, as horas ficam');
    assert.deepEqual(tipo(mudarMissao(zz9, m1, 'mis', 'IFR'), m1), ['IFR', 'C172', 1], 'o C152 não serve: o recurso padrão do tipo');
    assert.deepEqual(tipo(mudarMissao(mudarMissao(zz9, m1, 'eq', 'C172'), m1, 'mis', 'IFR'), m1), ['IFR', 'C172', 1]);
    assert.deepEqual(tipo(mudarMissao(zz9, m1, 'nb', 2.5), m1), ['Voo Local', 'C152', 2.5]);
    // Nada muda: null (o código igual em minúsculas, o nome igual com espaços, o tipo desconhecido, a missão tirada)
    for (const [id, campo, valor] of [[m1, 'codigo', 'zz9-01'], [m1, 'nome', ' Primeiro  voo '], [m1, 'mis', 'Voo Local'], [m1, 'mis', 'Balão'], [m1, 'ordem', 3], [IDS.fora, 'nome', 'x']]) {
      assert.equal(mudarMissao(zz9, id, campo, valor), null, `${campo} ${valor}`);
    }
    assert.equal(mudarMissao(retirarMissao(zz9, m1), m1, 'nome', 'Outro'), null);
    assert.deepEqual(zz9, lido(guardado()), 'o curso recebido não muda');
  });

  it('↑ e ↓ trocam a missão com a vizinha da mesma fase; na ponta da fase, nada; a que esperaria por uma posterior é recusada pela conferência', () => {
    const zz9 = lido(guardado());
    assert.deepEqual(codigos(moverMissao(zz9, m2, -1), f1), ['ZZ9-02', 'ZZ9-01']);
    assert.deepEqual(codigos(moverMissao(zz9, m1, 1), f1), ['ZZ9-02', 'ZZ9-01']);
    assert.deepEqual(moverMissao(zz9, m1, 1).missoes.filter(m => m.fase === f1).map(m => [m.codigo, m.ordem]), [['ZZ9-02', 0], ['ZZ9-01', 1]]);
    for (const [id, passo] of [[m1, -1], [m2, 1], [m3, -1], [m5, 1], [m5, -1], [IDS.fora, 1]]) assert.equal(moverMissao(zz9, id, passo), null, `${id} ${passo}`);
    // A ZZ9-02 "depois de" a ZZ9-01: subir a ZZ9-02 a poria antes do que ela espera
    const depois = { ...zz9, missoes: zz9.missoes.map(m => (m.id === m2 ? { ...m, regra: 'depois', requer: [m1] } : m)) };
    const { code, campo } = validarCurso(conteudoDoCurso(moverMissao(depois, m2, -1)));
    assert.deepEqual([code, campo], ['22023', 'requer']);
  });

  it('tirar do programa: a missão fica no curso, fora do programa e sem requisitos; quem esperava por ela deixa de esperar', () => {
    const zz9 = lido(guardado());
    const semM1 = retirarMissao(zz9, m1);
    const tirada = semM1.missoes.find(m => m.id === m1);
    assert.deepEqual([tirada.removida, tirada.requer, tirada.codigo, tirada.ordem], [true, [], 'ZZ9-01', 0]);
    assert.deepEqual(semM1.missoes.filter(m => m.fase === f1 && !m.removida).map(m => [m.codigo, m.ordem]), [['ZZ9-02', 0]]);
    // A ZZ9-04 esperava só pela ZZ9-01: volta a "depois das anteriores"
    assert.deepEqual(['regra', 'requer'].map(c => semM1.missoes.find(m => m.id === m4)[c]), ['ordem', []]);
    const comDuas = { ...zz9, missoes: zz9.missoes.map(m => (m.id === m4 ? { ...m, requer: [m1, m2] } : m)) };
    assert.deepEqual(['regra', 'requer'].map(c => retirarMissao(comDuas, m1).missoes.find(m => m.id === m4)[c]), ['depois', [m2]]);
    assert.equal(retirarMissao(semM1, m1), null, 'já fora do programa');
    assert.deepEqual(indiceDoPrograma([semM1]).missaoPorCodigo('ZZ9', 'ZZ9-01').id, m1, 'o código continua com nome');
    assert.equal(retirarMissao(zz9, m3).missoes.filter(m => m.removida).length, 1);
  });
});

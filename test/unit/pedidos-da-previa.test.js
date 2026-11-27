// Os pedidos fictícios que scripts/semear-dias-previa.mjs grava na prévia (o passo D1) e o projeto em que ele grava: só a
// prévia, nunca a produção.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refDaPrevia, pedidosDaPrevia, sqlDosPedidos, ligarPedidos, REF_DA_PRODUCAO } from '../../scripts/pedidos-da-previa.mjs';
import { PROJETOS } from '../../js/config-supabase.js';
import { comExemplo } from '../helpers/exemplo.js';
import { estadoSintetico } from '../helpers/estado.js';
import { separar } from '../../js/dias.js';

const HORARIO = /^[0-2][0-9]:[0-5][0-9]$/;

describe('Os pedidos da prévia (scripts/pedidos-da-previa.mjs)', () => {
  it('grava só na prévia: a produção é recusada, pelo endereço dela ou pelo ref conhecido', () => {
    assert.equal(refDaPrevia(PROJETOS), new URL(PROJETOS.previa.url).hostname.split('.')[0]);
    assert.notEqual(refDaPrevia(PROJETOS), REF_DA_PRODUCAO);
    assert.throws(() => refDaPrevia({ ...PROJETOS, previa: PROJETOS.producao }), /produção/);
    assert.throws(() => refDaPrevia({ producao: { url: 'https://outro.supabase.co' }, previa: { url: `https://${REF_DA_PRODUCAO}.supabase.co` } }), /produção/);
    assert.equal(new URL(PROJETOS.producao.url).hostname.split('.')[0], REF_DA_PRODUCAO, 'o ref conhecido é o da produção do app');
    // O script recusa antes de qualquer consulta ao banco
    const script = readFileSync(new URL('../../scripts/semear-dias-previa.mjs', import.meta.url), 'utf8');
    assert.ok(script.indexOf('const PREVIA = refDaPrevia(PROJETOS);') >= 0);
    assert.ok(script.indexOf('const PREVIA = refDaPrevia(PROJETOS);') < script.indexOf('function sql('));
  });

  it('um aprovado para cada aluno com voo, dois aguardando e um cancelado, de alunos sem voo', () => {
    const estado = comExemplo(estadoSintetico());
    const pedidos = pedidosDaPrevia(estado, '2026-12-01');
    const comVoo = estado.stu.filter(s => s.fly);
    assert.deepEqual(pedidos.aprovados.map(p => p.aluno), comVoo.map(s => s.id));
    assert.equal(pedidos.aguardando.length, 2);
    assert.equal(pedidos.cancelados.length, 1);
    const semVoo = new Set(estado.stu.filter(s => !s.fly).map(s => s.id));
    assert.ok([...pedidos.aguardando, ...pedidos.cancelados].every(p => semVoo.has(p.aluno)));
    for (const p of [...pedidos.aprovados, ...pedidos.aguardando, ...pedidos.cancelados]) {
      assert.match(p.horario, HORARIO, `${p.aluno} ${p.missao}`);
      assert.equal(p.janela, 'horario');
      assert.ok(p.horas > 0 && p.horas <= 5, `${p.aluno}: ${p.horas}`);
    }
    assert.ok(pedidos.aprovados.filter(p => p.missao.startsWith('Ground')).every(p => p.recurso === 'Sala Ground' && p.horas === 1.5));
    assert.ok(pedidos.aprovados.filter(p => p.missao === 'Noturno').every(p => p.horario === '17:30'));
  });

  it('a consulta grava os pedidos e devolve o id dos aprovados; cada aprovado fica ligado ao registro e a importadas', () => {
    const estado = comExemplo(estadoSintetico());
    const pedidos = pedidosDaPrevia(estado, '2026-12-01');
    const sql = sqlDosPedidos({ ...pedidos, aguardando: [{ ...pedidos.aguardando[0], aluno_nome: "Aluno D'Ávila" }] });
    assert.match(sql, /^insert into public\.solicitacoes \(/);
    assert.ok(sql.includes("'Aluno D''Ávila'"), 'o apóstrofo dobrado');
    assert.match(sql, /returning id, aluno, aprovada_em is not null as aprovado$/);
    const gravados = [...pedidos.aprovados.map((p, i) => ({ id: String(500 + i), aluno: p.aluno, aprovado: true })), { id: 900, aluno: pedidos.aguardando[0].aluno, aprovado: false }];
    ligarPedidos(estado, gravados);
    const { dia } = separar(estado);
    assert.deepEqual(dia.importadas, pedidos.aprovados.map((_, i) => 500 + i));
    for (const [i, p] of pedidos.aprovados.entries()) assert.equal(dia.pedidos[p.aluno].solicitacao, 500 + i);
    assert.equal(dia.pedidos[pedidos.aguardando[0].aluno].solicitacao, undefined);
  });
});

// Os pedidos fictícios que scripts/semear-dias-previa.mjs grava na prévia (o passo D1) e o projeto em que ele grava: só a
// prévia, nunca a produção.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { refDaPrevia, pedidosDaPrevia, sqlDosIds, numerarPedidos, sqlDaData, ligarPedidos, REF_DA_PRODUCAO } from '../../scripts/pedidos-da-previa.mjs';
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

  it('os ids saem da sequência da tabela; cada aprovado fica ligado ao registro e a importadas', () => {
    const estado = comExemplo(estadoSintetico());
    const pedidos = pedidosDaPrevia(estado, '2026-12-01');
    const total = pedidos.aprovados.length + pedidos.aguardando.length + pedidos.cancelados.length;
    assert.equal(sqlDosIds(total), `select nextval(pg_get_serial_sequence('public.solicitacoes', 'id')) as id from generate_series(1, ${total})`);
    const ids = Array.from({ length: total }, (_, i) => String(500 + i));
    const numerados = numerarPedidos(pedidos, ids);
    assert.deepEqual(numerados.map(p => p.id), ids.map(Number));
    assert.throws(() => numerarPedidos(pedidos, ids.slice(1)), /ids/);
    ligarPedidos(estado, numerados);
    const { dia } = separar(estado);
    assert.deepEqual(dia.importadas, pedidos.aprovados.map((_, i) => 500 + i));
    for (const [i, p] of pedidos.aprovados.entries()) assert.equal(dia.pedidos[p.aluno].solicitacao, 500 + i);
    assert.equal(dia.pedidos[pedidos.aguardando[0].aluno].solicitacao, undefined);
  });

  it('a data e os pedidos dela numa consulta só: os pedidos só entram com o dia, e repetir não grava de novo', () => {
    const estado = comExemplo(estadoSintetico());
    const pedidos = pedidosDaPrevia(estado, '2026-12-01');
    const numerados = numerarPedidos({ ...pedidos, aguardando: [{ ...pedidos.aguardando[0], aluno_nome: "Aluno D'Ávila" }], cancelados: [] },
      Array.from({ length: pedidos.aprovados.length + 1 }, (_, i) => 500 + i));
    const sql = sqlDaData('2026-12-01', { esquema: 1 }, numerados);
    assert.match(sql, /^with dia as \(insert into public\.dias \(data, conteudo\) values \('2026-12-01', \$dia\$\{"esquema":1\}\$dia\$::jsonb\) on conflict \(data\) do nothing returning data\)/);
    assert.match(sql, /pedidos as \(insert into public\.solicitacoes \([^)]*\) overriding system value\s+select \* from \(values /);
    assert.match(sql, /where exists \(select 1 from dia\)\s+on conflict \(id\) do nothing returning id\)/);
    assert.match(sql, /select \(select count\(\*\) from dia\) as dias, \(select count\(\*\) from pedidos\) as pedidos$/);
    assert.ok(sql.includes("'Aluno D''Ávila'"), 'o apóstrofo dobrado');
    assert.ok(sql.includes(`(500, '2026-12-01'::date, ${pedidos.aprovados[0].aluno}, `), 'o id, a data e o aluno de cada pedido');
    // Sem o cancelado, a coluna dele fica só com null: o tipo vem escrito
    assert.ok(!/, null,|, null\)/.test(sql), 'todo null com o tipo');
  });

  it('o script: uma data que falhou fica sem pedidos, e a gravação repetida (o transporte) não duplica', { timeout: 120000 }, () => {
    const pasta = mkdtempSync(join(tmpdir(), 'semear-dias-'));
    writeFileSync(join(pasta, 'cadastro.json'), JSON.stringify(separar(estadoSintetico()).cadastro));
    writeFileSync(join(pasta, 'supabase'), CLI_FALSO, { mode: 0o755 });
    const rodar = env => spawnSync(process.execPath, ['scripts/semear-dias-previa.mjs', '3', '2026-12-01'],
      { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', env: { ...process.env, SECO: '', PATH: `${pasta}:${process.env.PATH}`, ...env } });
    // 1ª vez: a gravação de 03/12 chega ao banco e a resposta se perde (repetida); a de 02/12 falha
    const primeira = rodar({ FALHAR_DATA: '2026-12-02', TRANSPORTE_DATA: '2026-12-03' });
    assert.notEqual(primeira.status, 0, primeira.stdout);
    // 2ª vez, como o README manda: só as datas sem escala
    const segunda = rodar({ TRANSPORTE_DATA: '2026-12-03' });
    assert.equal(segunda.status, 0, segunda.stderr);
    const banco = JSON.parse(readFileSync(join(pasta, 'estado.json'), 'utf8'));
    assert.deepEqual(Object.keys(banco.dias).sort(), ['2026-12-01', '2026-12-02', '2026-12-03']);
    for (const [data, texto] of Object.entries(banco.dias)) {
      const dia = JSON.parse(texto);
      const daData = banco.pedidos.filter(p => p.data === data);
      assert.ok(dia.importadas.length > 0, data);
      assert.deepEqual(dia.importadas.filter(id => daData.some(p => p.id === id)), dia.importadas, `${data}: cada importada é um pedido da data`);
      assert.equal(daData.length, dia.importadas.length + 3, `${data}: um pedido para cada aprovado, dois aguardando e um cancelado`);
    }
    assert.deepEqual(banco.pedidos.filter(p => !banco.dias[p.data]), [], 'nenhum pedido sem a escala da data');
  });
});

// O Supabase CLI falso do teste do script: guarda os dias e os pedidos num arquivo ao lado. Uma consulta com o dia e os
// pedidos é uma só (tudo ou nada; o dia que já existe não é gravado, e os pedidos só entram com ele); FALHAR_DATA falha a
// gravação dessa data sem efeito, TRANSPORTE_DATA a grava e perde a resposta uma vez (o script tenta de novo).
const CLI_FALSO = `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const pasta = path.dirname(__filename); const arquivo = path.join(pasta, 'estado.json');
const E = fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : { dias: {}, pedidos: [], seq: 0, perdidas: [] };
const q = process.argv[process.argv.length - 1];
const guardar = () => fs.writeFileSync(arquivo, JSON.stringify(E));
const responder = rows => { guardar(); process.stdout.write(JSON.stringify({ rows })); process.exit(0); };
const data = () => q.match(/'(\\d{4}-\\d\\d-\\d\\d)'/)[1];
if (q.includes("chave = 'cadastro'")) responder([{ c: fs.readFileSync(path.join(pasta, 'cadastro.json'), 'utf8'), versao: 1 }]);
if (q.includes('order by data desc limit 1')) { const d = Object.keys(E.dias).filter(d => d < data()).sort().at(-1); responder(d ? [{ d, c: E.dias[d] }] : []); }
if (q.startsWith('select data::text as d')) responder(Object.keys(E.dias).map(d => ({ d })));
if (q.startsWith('select conteudo::text as c from public.dias where data =')) responder([{ c: E.dias[data()] }]);
if (q.startsWith('select nextval(')) { const n = Number(q.match(/generate_series\\(1, (\\d+)\\)/)[1]); responder(Array.from({ length: n }, () => ({ id: String(++E.seq) }))); }
if (q.startsWith('update public.documentos')) responder([]);
const perder = () => { if (process.env.TRANSPORTE_DATA === data() && !E.perdidas.includes(data())) { E.perdidas.push(data()); guardar(); process.stderr.write('Transport error'); process.exit(1); } };
if (q.startsWith('with dia as (insert into public.dias')) {
  if (process.env.FALHAR_DATA === data()) { process.stderr.write('falhou'); process.exit(1); }
  const nova = !E.dias[data()];
  const linhas = [...q.matchAll(/\\((\\d+), '(\\d{4}-\\d\\d-\\d\\d)'::date, (\\d+),/g)].map(m => ({ id: Number(m[1]), data: m[2], aluno: Number(m[3]) }));
  const novos = nova ? linhas.filter(l => !E.pedidos.some(p => p.id === l.id)) : [];
  if (nova) E.dias[data()] = q.split('$dia$')[1];
  E.pedidos.push(...novos); perder();
  responder([{ dias: nova ? 1 : 0, pedidos: novos.length }]);
}
process.stderr.write('consulta desconhecida: ' + q.slice(0, 80)); process.exit(1);
`;

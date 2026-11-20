-- Fase 9: a TV da recepção. O perfil "painel" não lê nenhuma tabela (nem os documentos, os dias, o histórico, a agenda,
-- os dados pessoais ou, desde a revisão de 17/11, as tabelas dos cursos) e não grava nada: ele vê só o quadro de hoje
-- (horário de São Paulo) pela função painel_do_dia, com o aluno abreviado ("Maria S.") e, do detalhe do status, só a
-- categoria do motivo e o novo horário. Desde 20/11, com a configuração do painel do cadastro (o quadro, as colunas e as
-- listas), só no formato do app.
-- Roda dentro de uma transação desfeita no final: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(58);

insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-a000-000000000031', 'painel@painel.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000032', 'operador@painel.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000033', 'sem-perfil@painel.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000034', 'admin@painel.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values
  ('00000000-0000-4000-a000-000000000031', 'painel', 'TV da recepção'),
  ('00000000-0000-4000-a000-000000000032', 'operador', 'Operador de teste'),
  ('00000000-0000-4000-a000-000000000034', 'administrador', 'Admin de teste');

-- A escala de hoje: um voo atrasado, um cancelado por "Outro" (com texto) e uma turma de Ground
delete from public.dias where data = (now() at time zone 'America/Sao_Paulo')::date;
insert into public.dias (data, conteudo) values ((now() at time zone 'America/Sao_Paulo')::date, jsonb_build_object(
  'esquema', 13,
  'fStatus', jsonb_build_object('1000_0_1', 'Atrasado', '1001_0_1', 'Cancelado'),
  'fObs', jsonb_build_object('1000_0_1', jsonb_build_object('novoInicio', 640), '1001_0_1', jsonb_build_object('motivo', 'Outro', 'texto', 'Aluno com febre')),
  'resultado', jsonb_build_object('out', jsonb_build_array(
    jsonb_build_object('fKey', '1000_0_1', 'classKey', '1000_0_1', 'isGround', false, 'a', 610, 'b', 670, 'r', 'PR-VOB', 'eqType', 'C152',
      's', 'Maria Silva Santos', 'ins', 'Instrutor 01', 'insId', 1, 'stuId', 1000, 'kg', 140, 'mis', 'Voo Local', 'etapa', 'PP-07', 'status', 'Confirmado'),
    jsonb_build_object('fKey', '1001_0_1', 'classKey', '1001_0_1', 'isGround', false, 'a', 390, 'b', 450, 'r', 'PP-ABP', 'eqType', 'C172',
      's', 'João', 'ins', 'Instrutor 02', 'insId', 2, 'stuId', 1001, 'kg', 150, 'mis', 'IFR', 'status', 'Confirmado'),
    jsonb_build_object('fKey', '1002_0_1', 'classKey', 'GND_Ground C152_1_3', 'isGround', true, 'a', 500, 'b', 590, 'r', 'SALA-GROUND',
      'eqType', 'Sala Ground', 's', 'Ana Paula Costa', 'ins', 'Instrutor 03', 'mis', 'Ground C152', 'status', 'Confirmado')
  ))
));

-- O curso de teste ZZ9 nas tabelas dos cursos: duas fases (a segunda depois da primeira), duas missões (a segunda depois
-- da primeira) e uma versão
insert into public.cursos (sigla, nome, ordem) values ('ZZ9', 'Curso de teste', 999);
insert into public.fases_do_curso (id, curso, nome, ordem, regra) values
  ('00000000-0000-4000-9001-000000000001', 'ZZ9', 'Fase 1', 0, 'ordem'),
  ('00000000-0000-4000-9001-000000000002', 'ZZ9', 'Fase 2', 1, 'depois');
insert into public.requisitos_das_fases (curso, fase, requer)
  values ('ZZ9', '00000000-0000-4000-9001-000000000002', '00000000-0000-4000-9001-000000000001');
insert into public.missoes_do_curso (id, curso, fase, codigo, nome, tipo_de_missao, recurso, horas, ordem, regra) values
  ('00000000-0000-4000-9002-000000000001', 'ZZ9', '00000000-0000-4000-9001-000000000001', 'ZZ9-01', 'Primeiro voo', 'Voo Local', 'C152', 1, 0, 'ordem'),
  ('00000000-0000-4000-9002-000000000002', 'ZZ9', '00000000-0000-4000-9001-000000000002', 'ZZ9-02', 'Solo', 'Voo Solo', 'C152', 1, 0, 'depois');
insert into public.requisitos_das_missoes (curso, missao, requer)
  values ('ZZ9', '00000000-0000-4000-9002-000000000002', '00000000-0000-4000-9002-000000000001');
insert into public.versoes_dos_cursos (curso, versao, descricao, conteudo) values ('ZZ9', 1, 'Curso ZZ9 criado: Curso de teste', '{}');

-- As linhas do ZZ9 que quem chama vê em cada tabela dos cursos: o curso, as fases, as missões, os requisitos das fases e
-- das missões e as versões
create function pg_temp.linhas_do_zz9()
  returns integer[] language sql as $$
  select array[
    (select count(*)::integer from public.cursos where sigla = 'ZZ9'),
    (select count(*)::integer from public.fases_do_curso where curso = 'ZZ9'),
    (select count(*)::integer from public.missoes_do_curso where curso = 'ZZ9'),
    (select count(*)::integer from public.requisitos_das_fases where curso = 'ZZ9'),
    (select count(*)::integer from public.requisitos_das_missoes where curso = 'ZZ9'),
    (select count(*)::integer from public.versoes_dos_cursos where curso = 'ZZ9')]
$$;

-- Estrutura
select ok('painel' = any(enum_range(null::public.perfil_acesso)::text[]), 'perfil painel existe');
select has_function('public', 'painel_do_dia', 'função painel_do_dia existe');
select is(public.nome_curto('Maria Silva Santos'), 'Maria S.', 'nome abreviado: o primeiro nome e a inicial do último');
select is(public.nome_curto('João'), 'João', 'um nome só fica inteiro');
select is(public.nome_curto('  Ana   Paula  '), 'Ana P.', 'espaços a mais não contam');
select is(public.nome_curto('Aluno 12'), 'Aluno 12', 'um número no fim fica inteiro');

set local role authenticated;

-- Painel: não lê nenhuma tabela
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
select ok(not exists (select 1 from public.documentos), 'painel não lê os documentos');
select ok(not exists (select 1 from public.dias), 'painel não lê os dias');
select ok(not exists (select 1 from public.historico), 'painel não lê o histórico');
select ok(not exists (select 1 from public.solicitacoes), 'painel não lê a agenda');
select ok(not exists (select 1 from public.dados_pessoais), 'painel não lê os dados pessoais');
select is(pg_temp.linhas_do_zz9(), array[0, 0, 0, 0, 0, 0], 'painel não lê os cursos (nem as fases, as missões, os requisitos e as versões)');
select throws_ok($$ select public.salvar_dia(current_date, '{}', 0) $$, '42501', null, 'painel não grava a escala');
select throws_ok($$ select public.salvar_dados_pessoais('aluno', 1000, '{"canac":"123456"}', null, null) $$, '42501', null, 'painel não grava dados pessoais');

-- Painel: o quadro de hoje
select is(public.painel_do_dia()->>'data', ((now() at time zone 'America/Sao_Paulo')::date)::text, 'o quadro é o de hoje (São Paulo)');
select is(jsonb_array_length(public.painel_do_dia()->'voos'), 3, 'todos os voos do dia');
select is((select array_agg(v->>'s' order by (v->>'a')::integer) from jsonb_array_elements(public.painel_do_dia()->'voos') v),
  array['João', 'Ana C.', 'Maria S.'], 'em ordem de decolagem, com o aluno abreviado');
select is((select v->>'kg' from jsonb_array_elements(public.painel_do_dia()->'voos') v limit 1), null, 'sem o peso (nem o que o quadro não mostra)');
select is((select array_agg(v->>'etapa' order by (v->>'a')::integer) from jsonb_array_elements(public.painel_do_dia()->'voos') v),
  array[null, null, 'PP-07'], 'com a missão do curso (fase 14)');
select is(public.painel_do_dia()->'fStatus', '{"1000_0_1": "Atrasado", "1001_0_1": "Cancelado"}'::jsonb, 'com o status de cada voo');
select is(public.painel_do_dia()->'fObs', '{"1000_0_1": {"novoInicio": 640}, "1001_0_1": {"motivo": "Outro"}}'::jsonb,
  'do detalhe do status, o novo horário e a categoria do motivo (sem o texto livre)');

-- Operador também vê o quadro; conta sem perfil, não
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000032","role":"authenticated"}', true);
select is(jsonb_array_length(public.painel_do_dia()->'voos'), 3, 'operador também vê o quadro');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000033","role":"authenticated"}', true);
select throws_ok($$ select public.painel_do_dia() $$, '42501', null, 'conta sem perfil não vê o quadro');

-- Valores fora do formato, gravados pela API por uma conta de operador (revisão de 14/11): só os status da lista (o
-- desconhecido da linha vira "Confirmado"; "Pousou" já vale), as chaves de voo, os motivos da lista e os horários do
-- dia; os textos longos são cortados, e a linha sem chave de voo ou sem horário válido no dia sai
reset role;
update public.dias set conteudo = conteudo || jsonb_build_object(
  'fStatus', jsonb_build_object('1000_0_1', 'Pousou', '1001_0_1', '"><img src=x>', '"><b>', 'Cancelado'),
  'fObs', jsonb_build_object(
    '1000_0_1', jsonb_build_object('novoInicio', 99999999999),
    '1001_0_1', jsonb_build_object('motivo', '"><img src=x>', 'novoInicio', 'x'),
    '"><b>', jsonb_build_object('motivo', 'Outro'),
    '1004_0_1', jsonb_build_object('motivo', 'Meteorologia', 'novoInicio', 700)),
  'resultado', jsonb_build_object('out', jsonb_build_array(
    jsonb_build_object('fKey', '1000_0_1', 'a', 610, 'b', 670, 'status', '"><img src=x>', 's', repeat('M', 300) || ' Silva',
      'ins', repeat('I', 300), 'mis', repeat('m', 300), 'r', repeat('R', 300), 'eqType', repeat('e', 300),
      'classKey', repeat('c', 300), 'etapa', '"><b>'),
    jsonb_build_object('fKey', '"><img src=x>', 'a', 390, 'b', 450),
    jsonb_build_object('fKey', '1002_0_1', 'a', 99999999999, 'b', 590),
    jsonb_build_object('fKey', '1003_0_1', 'a', 500, 'b', 2000),
    jsonb_build_object('fKey', '1004_0_1', 'a', 'x', 'b', 450),
    jsonb_build_object('fKey', '1005_0_1', 'a', 700, 'b', 640),
    '"texto"'::jsonb)))
where data = (now() at time zone 'America/Sao_Paulo')::date;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
select lives_ok($$ select public.painel_do_dia() $$, 'o quadro abre com o dia adulterado');
select is(public.painel_do_dia()->'fStatus', '{"1000_0_1": "Pousou"}'::jsonb, 'só os status da lista, nas chaves de voo ("Pousou" já vale)');
select is(public.painel_do_dia()->'fObs', '{"1004_0_1": {"motivo": "Meteorologia", "novoInicio": 700}}'::jsonb,
  'só os motivos da lista e os horários do dia, nas chaves de voo');
select is((select array_agg(v->>'fKey') from jsonb_array_elements(public.painel_do_dia()->'voos') v), array['1000_0_1'],
  'a linha sem chave de voo ou sem horário válido no dia sai');
select is(public.painel_do_dia()->'voos'->0->>'status', 'Confirmado', 'o status desconhecido da linha vira Confirmado');
select is(public.painel_do_dia()->'voos'->0->>'etapa', null, 'a missão do curso fora do formato sai');
select is((select max(length(v.value)) from jsonb_each_text(public.painel_do_dia()->'voos'->0) v), 80, 'os textos longos são cortados');

-- A configuração do painel ("Configurar painel", o campo "painel" do cadastro): a TV, que não lê o cadastro, a recebe
-- no quadro, só no formato do app (20/11)
create function pg_temp.painel_como(p_conta text)
  returns jsonb language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_conta, 'role', 'authenticated')::text, true);
  select public.painel_do_dia()->'painel'
$$;
create function pg_temp.gravar_painel(p_painel jsonb)
  returns void language sql as $$
  update public.documentos set conteudo = jsonb_set(conteudo, '{painel}', p_painel) where chave = 'cadastro'
$$;
reset role;
delete from public.documentos where chave = 'cadastro';
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), 'null'::jsonb, 'sem cadastro, a configuração vem null (a TV mostra o padrão)');
select is((select array_agg(k order by k) from jsonb_object_keys(public.painel_do_dia()) k), array['data', 'fObs', 'fStatus', 'painel', 'voos'],
  'os campos de antes e o painel');
reset role;
insert into public.documentos (chave, conteudo) values ('cadastro', '{"esquema": 25, "stu": [], "ins": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), 'null'::jsonb, 'o cadastro sem a configuração: null');
reset role;
select pg_temp.gravar_painel('{"quadro": "partidas", "colunas": [{"id": "aluno", "on": true}, {"id": "horario", "on": true},
  {"id": "observacao", "on": true}, {"id": "missao", "on": false}]}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"quadro": "partidas", "colunas": [{"id": "aluno", "on": true},
  {"id": "horario", "on": true}, {"id": "observacao", "on": true}, {"id": "missao", "on": false}]}'::jsonb,
  'a TV recebe a configuração gravada: o quadro e as colunas, na ordem');
select ok(not exists (select 1 from public.documentos), 'a TV continua sem ler o cadastro');
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000032')->>'quadro', 'partidas', 'o operador também recebe a configuração');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "colunas": [{"id": "horario", "on": true}, {"id": "aeronave", "on": true},
  {"id": "modelo", "on": true}, {"id": "aluno", "on": true}, {"id": "instrutor", "on": true}, {"id": "missao", "on": true},
  {"id": "previsto", "on": false}, {"id": "observacao", "on": false}]}');
set local role authenticated;
select is(jsonb_array_length(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'colunas'), 8, 'as oito colunas do app');
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->>'quadro', 'missoes', 'o quadro Missões');
-- Adulterada pela API: o quadro fora da lista sai; das colunas, só as conhecidas, uma vez (a primeira), com "on"
-- booleano (o que não é true é false) e sem os campos a mais
reset role;
select pg_temp.gravar_painel('{"quadro": "__proto__", "extra": {"a": 1}, "colunas": [{"id": "aluno", "on": "sim"},
  {"id": "aluno", "on": true}, {"id": "<img src=x>", "on": true}, "horario", null, [1], {"on": true},
  {"id": "horario", "on": true, "extra": "<b>"}, {"id": "missao", "on": 1}]}');
set local role authenticated;
select lives_ok($$ select pg_temp.painel_como('00000000-0000-4000-a000-000000000031') $$, 'o quadro abre com a configuração adulterada');
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"colunas": [{"id": "aluno", "on": false},
  {"id": "horario", "on": true}, {"id": "missao", "on": false}]}'::jsonb,
  'adulterada: sem o quadro de fora, só as colunas conhecidas, uma vez, com on booleano e nada a mais');
reset role;
select pg_temp.gravar_painel('{"quadro": "partidas", "colunas": [{"id": "aluno"}, {"id": "horario", "on": null}, {"id": "missao", "on": true}]}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'colunas', '[{"id": "aluno", "on": false},
  {"id": "horario", "on": false}, {"id": "missao", "on": true}]'::jsonb, 'a coluna sem o "on" (ou com null) vem com on false, não sem ele');
reset role;
select pg_temp.gravar_painel('{"quadro": "chegadas", "colunas": "horario,aluno"}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"quadro": "chegadas", "colunas": []}'::jsonb,
  'as colunas que não são uma lista: nenhuma (a TV usa as do padrão)');
reset role;
select pg_temp.gravar_painel('"missoes"');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), 'null'::jsonb, 'a configuração que não é um objeto: null');
-- As listas (uma, ou duas lado a lado na tela grande): só 'auto', 'uma' ou 'duas'; fora disso, null (o campo sai, e a TV
-- fica no Automático), com o resto da configuração como era
reset role;
select pg_temp.gravar_painel('{"quadro": "partidas", "listas": "duas", "colunas": [{"id": "horario", "on": true}]}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"quadro": "partidas", "listas": "duas", "colunas": [{"id": "horario", "on": true}]}'::jsonb,
  'a TV recebe as listas gravadas: duas lado a lado');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": "uma", "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->>'listas', 'uma', 'sempre uma lista');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": "auto", "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->>'listas', 'auto', 'o Automático');
reset role;
select pg_temp.gravar_painel('{"quadro": "chegadas", "listas": "tres", "colunas": [{"id": "aluno", "on": true}]}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"quadro": "chegadas", "colunas": [{"id": "aluno", "on": true}]}'::jsonb,
  'as listas fora da lista: null (sai), e o resto da configuração fica');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": "DUAS", "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'listas', null, 'as listas em maiúsculas: null');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": ["duas"], "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'listas', null, 'as listas numa lista: null');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": {"duas": true}, "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'listas', null, 'as listas num objeto: null');
reset role;
select pg_temp.gravar_painel('{"quadro": "missoes", "listas": 2, "colunas": []}');
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031')->'listas', null, 'as listas num número: null');
-- O dia sem escala gravada também traz a configuração
reset role;
select pg_temp.gravar_painel('{"quadro": "alternar", "colunas": [{"id": "horario", "on": true}]}');
delete from public.dias where data = (now() at time zone 'America/Sao_Paulo')::date;
set local role authenticated;
select is(pg_temp.painel_como('00000000-0000-4000-a000-000000000031'), '{"quadro": "alternar", "colunas": [{"id": "horario", "on": true}]}'::jsonb,
  'o dia sem escala também traz a configuração');
select is(public.painel_do_dia()->'voos', 'null'::jsonb, 'e continua sem os voos');
-- A função fica como era: security definer, o search_path vazio e a execução só para quem entrou
reset role;
select ok((select prosecdef from pg_proc where oid = 'public.painel_do_dia()'::regprocedure), 'painel_do_dia continua security definer');
select is((select proconfig from pg_proc where oid = 'public.painel_do_dia()'::regprocedure), array['search_path=""'], 'com o search_path vazio');
select ok(has_function_privilege('authenticated', 'public.painel_do_dia()', 'execute') and not has_function_privilege('anon', 'public.painel_do_dia()', 'execute'),
  'só quem entrou executa (anônimo não)');
set local role authenticated;

-- O administrador cria a conta da TV
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000034","role":"authenticated"}', true);
select lives_ok($$ select public.criar_conta('tv@painel.acpm.invalid', 'uma senha bem comprida', 'painel', 'TV da recepção') $$, 'administrador cria uma conta de painel');

-- Visitante anônimo
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.painel_do_dia() $$, '42501', null, 'anônimo não vê o quadro');

select * from finish();
rollback;

-- A aprovação dos pedidos da agenda (a migração 20261129100000_aprovacao_dos_pedidos, o passo D1): as colunas, a função de
-- 16 argumentos e os atalhos de 13, 11 e 10, aprovar, retirar a aprovação, cancelar, a contagem por dia e a conversão dos
-- pedidos de antes. Cada caso de test/helpers/casos-das-solicitacoes.js é uma verificação daqui, com o nome do caso na
-- descrição (test/unit/espelho-do-banco.test.js confere): os pedidos existentes do caso, gravados direto na tabela, e os
-- passos, cada um por uma conta. As datas são as de São Paulo (o current_date do servidor é o de UTC).
-- Roda dentro de uma transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(73);

delete from public.solicitacoes;
insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-d500-000000000001', 'secretaria@teste-agenda-aprovacao.acpm.invalid', now(), now()),
  ('00000000-0000-4000-d500-000000000002', 'operador@teste-agenda-aprovacao.acpm.invalid', now(), now()),
  ('00000000-0000-4000-d500-000000000003', 'gestor@teste-agenda-aprovacao.acpm.invalid', now(), now()),
  ('00000000-0000-4000-d500-000000000004', 'sem-perfil@teste-agenda-aprovacao.acpm.invalid', now(), now()),
  ('00000000-0000-4000-d500-000000000005', 'admin@teste-agenda-aprovacao.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values
  ('00000000-0000-4000-d500-000000000001', 'secretaria', 'Secretaria de teste'),
  ('00000000-0000-4000-d500-000000000002', 'operador', 'Operador de teste'),
  ('00000000-0000-4000-d500-000000000003', 'gestor', 'Gestor de teste'),
  ('00000000-0000-4000-d500-000000000005', 'administrador', 'Admin de teste');

-- As datas dos casos, de hoje em São Paulo: aberta (no prazo), fechada (hoje, ou a segunda quando hoje é domingo: fora do
-- prazo, sem ter passado), passada (antes de hoje, nunca um domingo), domingo (um domingo adiante) e outra (a data de
-- operação depois da aberta)
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.d(p_rotulo text) returns date language sql as $$
  select case p_rotulo
    when 'aberta' then pg_temp.hoje() + 5 + case when extract(isodow from pg_temp.hoje() + 5) = 7 then 1 else 0 end
    when 'outra' then pg_temp.hoje() + 6 + case when extract(isodow from pg_temp.hoje() + 5) in (6, 7) then 1 else 0 end
    when 'fechada' then pg_temp.hoje() + case when extract(isodow from pg_temp.hoje()) = 7 then 1 else 0 end
    when 'passada' then pg_temp.hoje() - 2 - case when extract(isodow from pg_temp.hoje() - 2) = 7 then 1 else 0 end
    when 'domingo' then pg_temp.hoje() + 14 - extract(isodow from pg_temp.hoje())::int
  end $$;
-- A conta de cada passo
create function pg_temp.como(p_quem text) returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-d500-00000000000' || case p_quem
    when 'secretaria' then '1' when 'operador' then '2' when 'gestor' then '3' when 'semPerfil' then '4' when 'administrador' then '5' end,
    'role', 'authenticated')::text, true) $$;
-- Os pedidos do caso pela chave, e as respostas dos passos, na ordem
create temp table ids (chave text primary key, id bigint not null);
create temp table respostas (n serial, resposta text);
grant all on ids, respostas, respostas_n_seq to public;
create function pg_temp.id(p_chave text) returns bigint language sql as $$ select coalesce((select id from pg_temp.ids where chave = p_chave), -1) $$;
-- Antes de cada caso (pelo dono da tabela): nenhum pedido, e os existentes do caso
create function pg_temp.limpar() returns void language sql as $$
  delete from public.solicitacoes; delete from pg_temp.ids; delete from pg_temp.respostas $$;
create function pg_temp.existente(p_chave text, p_data text, p_aprovada boolean default false, p_cancelada boolean default false,
  p_missao text default 'Navegação') returns void language sql as $$
  with nova as (
    insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horas, recurso, registrado_por,
      aprovada_em, aprovada_por, cancelada_em, cancelada_por)
    values (pg_temp.d(p_data), 1000, 'Aluno 1000', p_missao, 'horario', '08:20', 1, 'C152', 'Maria',
      case when p_aprovada then now() end, case when p_aprovada then 'Operador de teste' end,
      case when p_cancelada then now() end, case when p_cancelada then 'Maria' end)
    returning id
  )
  insert into pg_temp.ids select p_chave, id from nova $$;
-- Um passo: a resposta guardada ("ok", a lista aprovada ou o código e a dica da recusa: nada do passo recusado fica)
create function pg_temp.passo(p_sql text) returns void language plpgsql as $$
declare
  r text;
  codigo text;
  dica text;
begin
  begin
    execute p_sql into r;
    r := coalesce(nullif(r, ''), 'ok');
  exception when others then
    get stacked diagnostics codigo = returned_sqlstate, dica = pg_exception_hint;
    r := codigo || coalesce(' ' || nullif(dica, ''), '');
  end;
  insert into pg_temp.respostas (resposta) values (r);
end;
$$;
-- Registrar pela função de 16 argumentos (o recurso C152, às 08:20, 1 h), guardando o id na chave
create function pg_temp.registrar(p_chave text, p_data text, p_aprovar boolean default false, p_excecao boolean default false,
  p_missao text default 'Navegação') returns text language plpgsql as $$
begin
  insert into pg_temp.ids values (p_chave, public.registrar_solicitacao(pg_temp.d(p_data), 1000, 'Aluno 1000', p_missao, 'horario', '08:20', 1,
    'Maria', null, p_excecao, 'C152', null, false, null, p_aprovar, false));
  return 'ok';
end;
$$;
-- Aprovar as chaves (a que não existe, -1): as chaves aprovadas agora, na ordem da resposta
create function pg_temp.aprovar(variadic p_chaves text[]) returns text language plpgsql as $$
declare
  aprovados bigint[] := public.aprovar_solicitacoes(array(select pg_temp.id(c) from unnest(p_chaves) c));
begin
  return '[' || coalesce((select string_agg(i.chave, ',' order by k) from unnest(aprovados) with ordinality u(id, k) join pg_temp.ids i on i.id = u.id), '') || ']';
end;
$$;
-- Guardar o id de um pedido registrado direto pela função
create function pg_temp.guardar(p_chave text, p_id bigint) returns bigint language sql as $$ insert into pg_temp.ids values (p_chave, p_id) returning id $$;
-- Quem aprovou o pedido da chave
create function pg_temp.aprovado_por(p_chave text) returns text language sql as $$ select aprovada_por from public.solicitacoes where id = pg_temp.id(p_chave) $$;
-- A contagem de p_de a p_ate, com as datas pelos rótulos
create function pg_temp.contar(p_de text, p_ate text) returns text language sql as $$
  select coalesce((select jsonb_object_agg(coalesce((select r from unnest(array['aberta', 'fechada', 'passada', 'domingo']) r where pg_temp.d(r)::text = c.key), c.key), c.value)
    from jsonb_each(public.solicitacoes_por_dia(pg_temp.d(p_de), pg_temp.d(p_ate))) c), '{}'::jsonb)::text $$;
-- As respostas dos passos e a situação de cada pedido do caso (lida pelo operador; com_quem: quem aprovou)
create function pg_temp.resultado(p_com_quem boolean default false) returns text language plpgsql as $$
declare
  antes text := current_setting('request.jwt.claims', true);
  r text;
begin
  perform pg_temp.como('operador');
  r := coalesce((select string_agg(resposta, ' · ' order by n) from pg_temp.respostas), '') || ' | ' || coalesce((
    select string_agg(i.chave || ' ' || case when s.cancelada_em is not null then 'cancelada' when s.aprovada_em is not null then 'aprovada'
      || case when p_com_quem then ' por ' || s.aprovada_por else '' end when s.aprovacao_retirada_em is not null then 'retirada' else 'aguardando' end, ', ' order by i.chave)
    from pg_temp.ids i join public.solicitacoes s on s.id = i.id), '');
  perform set_config('request.jwt.claims', antes, true);
  return r;
end;
$$;

-- As colunas, as funções e quem as chama
select has_column('public', 'solicitacoes', 'aprovada_em', 'a agenda guarda quando o pedido foi aprovado');
select has_column('public', 'solicitacoes', 'aprovada_por', 'a agenda guarda quem aprovou');
select has_column('public', 'solicitacoes', 'aprovada_usuario', 'a agenda guarda a conta que aprovou');
select has_column('public', 'solicitacoes', 'aprovacao_retirada_em', 'a agenda guarda quando a aprovação foi retirada');
select has_column('public', 'solicitacoes', 'aprovacao_retirada_por', 'a agenda guarda quem retirou a aprovação');
select has_column('public', 'solicitacoes', 'aprovacao_retirada_usuario', 'a agenda guarda a conta que retirou a aprovação');
select has_function('public', 'registrar_solicitacao',
  array['date', 'integer', 'text', 'text', 'text', 'text', 'numeric', 'text', 'text', 'boolean', 'text', 'uuid', 'boolean', 'text', 'boolean', 'boolean'],
  'a função de 16 argumentos, com a 2ª preferência, a aprovação e a lista de espera');
select hasnt_function('public', 'registrar_solicitacao', array['date', 'integer', 'text', 'text', 'text', 'text', 'text', 'text', 'boolean'],
  'a função de 9 argumentos (a do período) saiu');
select ok(has_function_privilege('authenticated', 'public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean)', 'execute'),
  'só quem está conectado chama a função de 16 argumentos');
select is((select array_agg(p.prosecdef and p.proconfig = array['search_path=""'] order by p.pronargs) from pg_proc p
  where p.oid in ('public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean)'::regprocedure,
    'public.registrar_solicitacao_interna(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean, boolean)'::regprocedure,
    'public.aprovar_solicitacoes(bigint[])'::regprocedure, 'public.retirar_aprovacao_da_solicitacao(bigint)'::regprocedure,
    'public.cancelar_solicitacao(bigint, text)'::regprocedure)),
  array[true, true, true, true, true], 'as funções que gravam são security definer, com o search_path vazio');
select ok(not has_function_privilege('authenticated', 'public.registrar_solicitacao_interna(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.registrar_solicitacao_interna(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean, boolean)', 'execute'),
  'a função interna não é da API');
select ok(has_function_privilege('authenticated', 'public.aprovar_solicitacoes(bigint[])', 'execute')
  and has_function_privilege('authenticated', 'public.retirar_aprovacao_da_solicitacao(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.aprovar_solicitacoes(bigint[])', 'execute')
  and not has_function_privilege('anon', 'public.retirar_aprovacao_da_solicitacao(bigint)', 'execute'),
  'só quem está conectado chama aprovar e retirar a aprovação');
select ok(not has_function_privilege('authenticated', 'public.aprovar_solicitacoes_de_antes_da_aprovacao(boolean)', 'execute')
  and not has_function_privilege('anon', 'public.aprovar_solicitacoes_de_antes_da_aprovacao(boolean)', 'execute'),
  'a conversão não é da API');
select throws_ok($$ insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, registrado_por, aprovada_em, aprovacao_retirada_em)
  values (current_date, 1, 'A', 'B', 'horario', '08:20', 'C', now(), now()) $$, '23514', null, 'aprovado ou retirado, nunca os dois');

set local role authenticated;

-- Registrar (os casos)
reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.registrar('n', 'aberta') $$);
select is(pg_temp.resultado(), 'ok | n aguardando', 'a secretaria registra: o pedido fica aguardando aprovação');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.registrar('n', 'aberta', true) $$);
select is(pg_temp.resultado(), '42501 aprovar | ', 'a secretaria não registra já aprovado');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.registrar('n', 'aberta', true) $$);
select is(pg_temp.resultado(true), 'ok | n aprovada por Operador de teste', 'o operador registra e aprova de uma vez');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.registrar('n', 'aberta') $$);
select is(pg_temp.resultado(), 'ok | n aguardando', 'o operador registra sem aprovar: o pedido aguarda');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.registrar('n', 'fechada', false, true) $$);
select is(pg_temp.resultado(true), 'ok | n aprovada por Operador de teste', 'pela exceção da coordenação, o pedido nasce aprovado mesmo sem pedir');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.registrar('n', 'domingo', false, true) $$);
select is(pg_temp.resultado(), 'PT403 domingo | ', 'a exceção não registra num domingo');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.registrar('n', 'passada', false, true) $$);
select is(pg_temp.resultado(), 'PT403 passada | ', 'a exceção não registra numa data que já passou');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.registrar('n', 'fechada') $$);
select is(pg_temp.resultado(), 'PT403 prazo | ', 'fora do prazo, sem a exceção: recusado (prazo)');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.registrar('n', 'fechada', false, true) $$);
select is(pg_temp.resultado(), '42501 excecao | ', 'a secretaria não usa a exceção da coordenação');

reset role; select pg_temp.limpar();
select pg_temp.existente('l' || n, 'aberta', n > 2, false, 'Voo Local') from generate_series(0, 5) n;
set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.registrar('n', 'aberta', false, false, 'Voo Local') $$);
select is(pg_temp.resultado(), 'PT422 locais | l0 aguardando, l1 aguardando, l2 aguardando, l3 aprovada, l4 aprovada, l5 aprovada',
  'o limite conta os pedidos que aguardam e os aprovados');

-- Os atalhos (13, 11 e 10 argumentos): o pedido do operador nasce aprovado, o da secretaria aguarda; as regras novas valem
reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.guardar('o13', public.registrar_solicitacao(pg_temp.d('aberta'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false, 'C152', null, false));
select pg_temp.guardar('o11', public.registrar_solicitacao(pg_temp.d('aberta'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false, 'C152'));
select pg_temp.guardar('o10', public.registrar_solicitacao(pg_temp.d('aberta'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false));
select pg_temp.como('administrador');
select pg_temp.guardar('a10', public.registrar_solicitacao(pg_temp.d('aberta'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false));
select pg_temp.como('secretaria');
select pg_temp.guardar('s13', public.registrar_solicitacao(pg_temp.d('aberta'), 1001, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false, 'C152', null, false));
select pg_temp.guardar('s11', public.registrar_solicitacao(pg_temp.d('aberta'), 1001, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false, 'C152'));
select pg_temp.guardar('s10', public.registrar_solicitacao(pg_temp.d('aberta'), 1001, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false));
select is(pg_temp.aprovado_por('o13'), 'Operador de teste', 'pela função de 13 argumentos, o pedido do operador nasce aprovado');
select is(pg_temp.aprovado_por('o11'), 'Operador de teste', 'pela função de 11 argumentos, o pedido do operador nasce aprovado');
select is(pg_temp.aprovado_por('o10'), 'Operador de teste', 'pela função de 10 argumentos, o pedido do operador nasce aprovado');
select is(pg_temp.aprovado_por('a10'), 'Admin de teste', 'pelos atalhos, o do administrador também');
select is((select count(*)::int from public.solicitacoes where aprovada_em is null and id in (pg_temp.id('s13'), pg_temp.id('s11'), pg_temp.id('s10'))), 3,
  'pelos atalhos, o pedido da secretaria aguarda');
select pg_temp.como('operador');
select throws_ok($$ select public.registrar_solicitacao(pg_temp.d('domingo'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, true) $$,
  'PT403', null, 'pelos atalhos, a exceção também não registra num domingo');
select throws_ok($$ select public.registrar_solicitacao(pg_temp.d('passada'), 1000, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, true, 'C152') $$,
  'PT403', null, 'pelos atalhos, nem numa data que já passou');

-- Aprovar (os casos)
reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); select pg_temp.existente('b', 'aberta'); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.aprovar('b', 'a') $$);
select is(pg_temp.resultado(true), '[a,b] | a aprovada por Operador de teste, b aprovada por Operador de teste', 'o operador aprova os pedidos da lista');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('administrador');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select is(pg_temp.resultado(true), '[a] · [] | a aprovada por Admin de teste', 'aprovar de novo não muda nada e guarda quem aprovou primeiro');

reset role; select pg_temp.limpar();
select pg_temp.existente('c', 'aberta', false, true); select pg_temp.existente('p', 'passada'); select pg_temp.existente('a', 'aberta');
set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.aprovar('c', 'p', 'a', 'x') $$);
select is(pg_temp.resultado(), '[a] | a aprovada, c cancelada, p aguardando', 'o cancelado, o de uma data que já passou e o id que não existe ficam fora da resposta');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select is(pg_temp.resultado(), '42501 aprovar | a aguardando', 'a secretaria não aprova');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('gestor');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select is(pg_temp.resultado(), '42501 aprovar | a aguardando', 'o gestor não aprova');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('semPerfil');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select is(pg_temp.resultado(), '42501 aprovar | a aguardando', 'conta sem perfil não aprova');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.aprovar(variadic '{}'::text[]) $$);
select is(pg_temp.resultado(), '22023 ids | ', 'aprovar uma lista vazia: recusado (ids)');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select pg_temp.aprovar(variadic array_fill('x'::text, array[201])) $$);
select is(pg_temp.resultado(), '22023 ids | ', 'aprovar mais de 200 de uma vez: recusado (ids)');

reset role; select pg_temp.limpar(); set local role authenticated;
select pg_temp.como('operador');
select throws_ok($$ select public.aprovar_solicitacoes(null) $$, '22023', null, 'aprovar sem lista: recusado');

-- Retirar a aprovação (os casos)
reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta', true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('a')) $$);
select is(pg_temp.resultado(), 'ok | a retirada', 'o operador retira a aprovação: o pedido volta a aguardar');
select results_eq($$ select aprovada_por, aprovada_usuario, aprovacao_retirada_por, aprovacao_retirada_usuario, aprovacao_retirada_em is not null
  from public.solicitacoes where id = pg_temp.id('a') $$,
  $$ values (null::text, null::uuid, 'Operador de teste'::text, '00000000-0000-4000-d500-000000000002'::uuid, true) $$, 'a retirada guarda quem e quando');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta', true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('a')) $$);
select pg_temp.como('administrador');
select pg_temp.passo($$ select pg_temp.aprovar('a') $$);
select is(pg_temp.resultado(true), 'ok · [a] | a aprovada por Admin de teste', 'aprovar de novo apaga a retirada');
select is((select aprovacao_retirada_em from public.solicitacoes where id = pg_temp.id('a')), null, 'sem o rastro da retirada');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('a')) $$);
select is(pg_temp.resultado(), 'P0002 | a aguardando', 'retirar a aprovação do pedido que aguarda: recusado');

reset role; select pg_temp.limpar(); select pg_temp.existente('c', 'aberta', true, true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('c')) $$);
select is(pg_temp.resultado(), 'P0002 | c cancelada', 'retirar a aprovação do pedido cancelado: recusado');

reset role; select pg_temp.limpar(); select pg_temp.existente('p', 'passada', true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('p')) $$);
select is(pg_temp.resultado(), 'PT403 passada | p aprovada', 'a aprovação de uma data que já passou não é retirada');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta', true); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select public.retirar_aprovacao_da_solicitacao(pg_temp.id('a')) $$);
select is(pg_temp.resultado(), '42501 aprovar | a aprovada', 'a secretaria não retira a aprovação');

-- Cancelar (os casos)
reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select public.cancelar_solicitacao(pg_temp.id('a'), 'Maria') $$);
select is(pg_temp.resultado(), 'ok | a cancelada', 'a secretaria cancela o pedido que aguarda');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta', true); set local role authenticated;
select pg_temp.como('secretaria');
select pg_temp.passo($$ select public.cancelar_solicitacao(pg_temp.id('a'), 'Maria') $$);
select is(pg_temp.resultado(), 'ok | a cancelada', 'a secretaria cancela o pedido aprovado');
select results_eq($$ select aprovada_em is not null, aprovada_por from public.solicitacoes where id = pg_temp.id('a') $$,
  $$ values (true, 'Operador de teste'::text) $$, 'o cancelado guarda quem o tinha aprovado');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta', true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.cancelar_solicitacao(pg_temp.id('a'), 'Coordenação') $$);
select is(pg_temp.resultado(), 'ok | a cancelada', 'o operador cancela o pedido aprovado');

reset role; select pg_temp.limpar(); select pg_temp.existente('p', 'passada', true); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.cancelar_solicitacao(pg_temp.id('p'), 'Coordenação') $$);
select is(pg_temp.resultado(), 'PT403 passada | p aprovada', 'o pedido aprovado de uma data que já passou não é cancelado');

reset role; select pg_temp.limpar(); select pg_temp.existente('p', 'passada'); set local role authenticated;
select pg_temp.como('operador');
select pg_temp.passo($$ select public.cancelar_solicitacao(pg_temp.id('p'), 'Coordenação') $$);
select is(pg_temp.resultado(), 'ok | p cancelada', 'o que aguarda numa data que já passou é cancelado');

-- Contar (os casos)
reset role; select pg_temp.limpar();
select pg_temp.existente('a', 'aberta'); select pg_temp.existente('b', 'aberta', true); select pg_temp.existente('c', 'aberta', false, true);
select pg_temp.existente('d', 'fechada', true);
set local role authenticated;
select pg_temp.como('operador');
select is(pg_temp.contar('fechada', 'aberta')::jsonb, '{"fechada": {"aguardando": 0, "aprovadas": 1}, "aberta": {"aguardando": 1, "aprovadas": 1}}'::jsonb,
  'os pedidos por dia: aguardando e aprovados, sem os cancelados');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); select pg_temp.existente('c', 'fechada', false, true); set local role authenticated;
select pg_temp.como('operador');
select is(pg_temp.contar('fechada', 'fechada')::jsonb, '{}'::jsonb, 'um dia só com pedidos cancelados não aparece na contagem');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('gestor');
select pg_temp.passo($$ select pg_temp.contar('aberta', 'aberta') $$);
select pg_temp.como('secretaria');
select pg_temp.passo($$ select pg_temp.contar('aberta', 'aberta') $$);
select is(pg_temp.resultado(), '{"aberta": {"aprovadas": 0, "aguardando": 1}} · {"aberta": {"aprovadas": 0, "aguardando": 1}} | a aguardando',
  'o gestor e a secretaria leem a contagem');

reset role; select pg_temp.limpar(); select pg_temp.existente('a', 'aberta'); set local role authenticated;
select pg_temp.como('semPerfil');
select is(pg_temp.contar('aberta', 'aberta')::jsonb, '{}'::jsonb, 'conta sem perfil recebe a contagem vazia');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.solicitacoes_por_dia(current_date, current_date) $$, '42501', null, 'anônimo não executa a contagem');

-- A conversão dos pedidos de antes (pelo dono, como a migração a roda). Os pedidos: p1 e p2 numa data que já passou (p1 em
-- "importadas", sem registro); na data aberta, f1 (o registro do aluno 1001 o leva, sem voar), f2 (a missão extra do aluno
-- 1003 o leva), f3 (só em "importadas"), f4 (cancelado, em "importadas" e num registro), o2 (de um operador, só em
-- "importadas") e r1 (de um operador, com a aprovação retirada); na outra data, sem escala, o1 (de um operador), a1 (de um
-- administrador) e s1 (da secretaria)
reset role; select pg_temp.limpar();
create function pg_temp.antigo(p_chave text, p_data text, p_aluno integer, p_quem text default null, p_cancelado boolean default false,
  p_retirado boolean default false) returns void language sql as $$
  with novo as (
    insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horas, registrado_por, usuario, conta, cancelada_em,
      cancelada_por, aprovacao_retirada_em, aprovacao_retirada_por)
    select pg_temp.d(p_data), p_aluno, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', u.id, p.nome,
      case when p_cancelado then now() end, case when p_cancelado then 'Maria' end, case when p_retirado then now() end, case when p_retirado then 'Operador de teste' end
    from (select 1) um
    left join auth.users u on u.id = ('00000000-0000-4000-d500-00000000000' || case p_quem when 'secretaria' then '1' when 'operador' then '2' when 'administrador' then '5' end)::uuid
    left join public.perfis p on p.usuario = u.id
    returning id
  )
  insert into pg_temp.ids select p_chave, id from novo $$;
select pg_temp.antigo('p1', 'passada', 1001, 'secretaria');
select pg_temp.antigo('p2', 'passada', 1002, 'operador');
select pg_temp.antigo('f1', 'aberta', 1001, 'secretaria');
select pg_temp.antigo('f2', 'aberta', 1003, 'secretaria');
select pg_temp.antigo('f3', 'aberta', 1004, 'secretaria');
select pg_temp.antigo('f4', 'aberta', 1005, 'secretaria', true);
select pg_temp.antigo('o2', 'aberta', 1006, 'operador');
select pg_temp.antigo('r1', 'aberta', 1007, 'operador', false, true);
select pg_temp.antigo('o1', 'outra', 1001, 'operador');
select pg_temp.antigo('a1', 'outra', 1002, 'administrador');
select pg_temp.antigo('s1', 'outra', 1003, 'secretaria');
delete from public.dias where data in (pg_temp.d('passada'), pg_temp.d('aberta'), pg_temp.d('outra'));
insert into public.dias (data, conteudo) values
  (pg_temp.d('passada'), jsonb_build_object('importadas', jsonb_build_array(pg_temp.id('p1')), 'pedidos', '{}'::jsonb)),
  (pg_temp.d('aberta'), jsonb_build_object(
    'importadas', jsonb_build_array(pg_temp.id('f1'), pg_temp.id('f2'), pg_temp.id('f3'), pg_temp.id('f4'), pg_temp.id('o2')),
    'pedidos', jsonb_build_object(
      '1001', jsonb_build_object('fly', false, 'solicitacao', pg_temp.id('f1'), 'extra', '[]'::jsonb),
      '1003', jsonb_build_object('fly', true, 'mis', 'Voo Local', 'extra', jsonb_build_array(jsonb_build_object('mid', 1, 'solicitacao', pg_temp.id('f2')))),
      '1005', jsonb_build_object('fly', true, 'solicitacao', pg_temp.id('f4'), 'extra', '[]'::jsonb))));
create function pg_temp.aprovados() returns text language sql as $$
  select coalesce(string_agg(i.chave || case when s.aprovada_por = 'importação anterior' then '' else ' (' || s.aprovada_por || ')' end, ', ' order by i.chave), '')
  from pg_temp.ids i join public.solicitacoes s on s.id = i.id where s.aprovada_em is not null $$;
select is(public.aprovar_solicitacoes_de_antes_da_aprovacao(false), 3, 'sem a regra dos operadores, só o que a importação levou');
select is(pg_temp.aprovados(), 'f1, f2, p1', 'sem a regra dos operadores, o pedido futuro de um operador continua aguardando');
select is(public.aprovar_solicitacoes_de_antes_da_aprovacao(true), 2, 'com a regra dos operadores, os que eles registraram');
select ok(position('p1' in pg_temp.aprovados()) > 0 and (select aprovada_por from public.solicitacoes where id = pg_temp.id('p1')) = 'importação anterior',
  'numa data que já passou, o que está em importadas fica aprovado, mesmo sem registro');
select ok(position('p2' in pg_temp.aprovados()) = 0, 'numa data que já passou, o que não foi importado continua aguardando');
select ok(position('f1' in pg_temp.aprovados()) > 0, 'de hoje em diante, o que um registro ainda leva fica aprovado, voando ou não');
select ok(position('f2' in pg_temp.aprovados()) > 0, 'o da missão extra também');
select ok(position('f3' in pg_temp.aprovados()) = 0, 'o que só ficou em importadas continua aguardando');
select is((select aprovada_em from public.solicitacoes where id = pg_temp.id('f4')), null, 'o cancelado continua cancelado, sem aprovação');
select results_eq($$ select aprovada_por, aprovada_usuario from public.solicitacoes where id in (pg_temp.id('o1'), pg_temp.id('a1'), pg_temp.id('s1')) order by id $$,
  $$ values ('Operador de teste'::text, '00000000-0000-4000-d500-000000000002'::uuid), ('Admin de teste', '00000000-0000-4000-d500-000000000005'), (null, null) $$,
  'o pedido futuro de um operador (e de um administrador) fica aprovado por quem o registrou; o de uma secretaria, não');
select ok(position('o2' in pg_temp.aprovados()) = 0, 'o que está em importadas não entra pela regra dos operadores');
select ok(position('r1' in pg_temp.aprovados()) = 0, 'a aprovação retirada não volta pela conversão');
select is(public.aprovar_solicitacoes_de_antes_da_aprovacao(true), 0, 'rodar de novo não muda nada');
select is(pg_temp.aprovados(), 'a1 (Admin de teste), f1, f2, o1 (Operador de teste), p1', 'os aprovados, depois de rodar de novo');

select * from finish();
rollback;

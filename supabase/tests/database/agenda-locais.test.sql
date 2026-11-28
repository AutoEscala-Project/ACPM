-- Retorno da operação (14/11): no máximo 6 voos locais (Voo Local, Voo Solo e TGL) no mesmo horário; o 7º pedido é
-- recusado (PT422). Outras missões e pedidos cancelados não contam. Pela função de 13 argumentos (a migração
-- missao_do_curso_e_limite_do_pedido), o 7º passa com a confirmação, que fica registrada; com vaga, ela não registra nada.
-- Pela de 16 (a migração aprovacao_dos_pedidos, U3 de 26/11), o 7º também passa na lista de espera (p_esperar), sem nada
-- registrado; as duas juntas são recusadas (22023); os atalhos de 13 e de 11 argumentos mandam a lista de espera desligada.
-- Roda dentro de uma transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

delete from public.solicitacoes;
insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-d200-000000000001', 'secretaria@teste-agenda-locais.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values ('00000000-0000-4000-d200-000000000001', 'secretaria', 'Secretaria de teste');

-- Um voo local pela função de 16 argumentos (a confirmação e a lista de espera)
create function pg_temp.registrar(p_aluno integer, p_horario text, p_confirmar boolean, p_esperar boolean)
  returns bigint language sql as $$
  select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), p_aluno, 'Aluno', 'Voo Local',
    'horario', p_horario, 1, 'Maria', null, false, 'C152', null, p_confirmar, null, false, p_esperar)
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d200-000000000001","role":"authenticated"}', true);
select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 1000 + n, 'Aluno', (array['Voo Local', 'Voo Solo', 'TGL (TMA)'])[1 + n % 3], 'horario', '08:20', 1, 'Maria', null, false)
from generate_series(1, 6) n;
select is((select count(*)::int from public.solicitacoes), 6, 'seis voos locais às 08:20');
select throws_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2000, 'Aluno', 'Voo Local', 'horario', '08:20', 1, 'Maria', null, false) $$,
  'PT422', null, 'o sétimo voo local no mesmo horário é recusado');
select lives_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2001, 'Aluno', 'Navegação', 'horario', '08:20', 1, 'Maria', null, false) $$,
  'outra missão no mesmo horário passa');
select lives_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2002, 'Aluno', 'Voo Local', 'horario', '10:10', 1, 'Maria', null, false) $$,
  'outro horário passa');
select public.cancelar_solicitacao((select min(id) from public.solicitacoes), 'Maria');
select lives_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2003, 'Aluno', 'TGL (TMA)', 'horario', '08:20', 1, 'Maria', null, false) $$,
  'com um cancelado, abre a vaga');
-- A função de 13 argumentos: o 7º às 08:20 confirmado fica registrado, com quem confirmou; às 10:10 (um local), a
-- confirmação não registra nada
select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2004, 'Aluno', 'Voo Local', 'horario', '08:20', 1, 'Maria', null, false, 'C152', null, true);
select results_eq($$ select limite_confirmado_por, limite_confirmado_em is not null from public.solicitacoes where aluno = 2004 $$,
  $$ values ('Secretaria de teste'::text, true) $$, 'pela função de 13 argumentos, o 7º voo local confirmado fica registrado com quem confirmou');
select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2005, 'Aluno', 'Voo Local', 'horario', '10:10', 1, 'Maria', null, false, 'C152', null, true);
select results_eq($$ select limite_confirmado_por, limite_confirmado_em from public.solicitacoes where aluno = 2005 $$,
  $$ values (null::text, null::timestamptz) $$, 'pela função de 13 argumentos, a confirmação com vaga não registra nada');

-- A função de 16 argumentos (U3): às 08:20 já há 7 voos locais (o 7º confirmado); às 10:10, dois
select pg_temp.registrar(2006, '08:20', false, true);
select results_eq($$ select limite_confirmado_por, limite_confirmado_em from public.solicitacoes where aluno = 2006 $$,
  $$ values (null::text, null::timestamptz) $$, 'o 7º voo local na lista de espera: registrado sem nada a mais');
select throws_ok($$ select pg_temp.registrar(2007, '08:20', true, true) $$, '22023', null, 'a confirmação e a lista de espera juntas: recusadas (esperar)');
select pg_temp.registrar(2008, '10:10', false, true);
select results_eq($$ select limite_confirmado_por, limite_confirmado_em from public.solicitacoes where aluno = 2008 $$,
  $$ values (null::text, null::timestamptz) $$, 'a lista de espera com vaga: nada registrado');
select throws_ok($$ select pg_temp.registrar(2009, '08:20', false, false) $$, 'PT422', null, 'pela função de 16 argumentos, sem a confirmação nem a lista de espera: recusado');
select throws_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2010, 'Aluno', 'Voo Local',
  'horario', '08:20', 1, 'Maria', null, false, 'C152', null, false) $$, 'PT422', null, 'pela função de 13 argumentos, sem a lista de espera: o 7º continua recusado');
select throws_ok($$ select public.registrar_solicitacao((current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end), 2011, 'Aluno', 'Voo Local',
  'horario', '08:20', 1, 'Maria', null, false, 'C152') $$, 'PT422', null, 'pela função de 11 argumentos, sem a lista de espera: o 7º continua recusado');

select * from finish();
rollback;

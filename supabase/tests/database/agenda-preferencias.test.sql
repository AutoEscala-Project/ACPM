-- A 2ª preferência do pedido da agenda (a migração 20261129100000_aprovacao_dos_pedidos, U1 de 26/11): outro horário
-- exato, só no pedido num horário específico e diferente do 1º, pela função de 16 argumentos; o limite de voos locais conta
-- só o 1º horário. Não há disponibilidade (N13): o pedido é um horário exato. E a contagem por dia, com a regra de leitura.
-- Cada caso da 2ª preferência de test/helpers/casos-da-agenda.js é uma verificação daqui, com o nome do caso na descrição
-- (test/unit/espelho-do-banco.test.js confere). Roda dentro de uma transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

delete from public.solicitacoes;
insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-d600-000000000001', 'secretaria@teste-agenda-preferencias.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values ('00000000-0000-4000-d600-000000000001', 'secretaria', 'Secretaria de teste');

-- A data dos pedidos: daqui a cinco dias (a segunda, quando cai num domingo), no prazo
create function pg_temp.d()
  returns date language sql as $$ select current_date + 5 + case when extract(isodow from current_date + 5) = 7 then 1 else 0 end $$;
-- Um pedido pela função de 16 argumentos, como o app manda (a Navegação no C152 às 08:20, 1 h)
create function pg_temp.registrar(p_horario2 text, p_missao text default 'Navegação', p_recurso text default 'C152', p_horario text default '08:20',
  p_horas numeric default 1, p_aluno integer default 1000)
  returns bigint language sql as $$
  select public.registrar_solicitacao(pg_temp.d(), p_aluno, 'Aluno de teste', p_missao, 'horario', p_horario, p_horas, 'Maria', null, false,
    p_recurso, null, false, p_horario2, false, false)
$$;
-- O código e a dica da recusa ("22023 horario2"), ou "sem erro". Nada fica gravado
create function pg_temp.erro(p_sql text)
  returns text language plpgsql as $$
declare
  codigo text;
  dica text;
begin
  execute p_sql;
  raise exception 'pg_temp.erro: sem erro';
exception when others then
  get stacked diagnostics codigo = returned_sqlstate, dica = pg_exception_hint;
  if sqlerrm = 'pg_temp.erro: sem erro' then
    return 'sem erro';
  end if;
  return codigo || coalesce(' ' || nullif(dica, ''), '');
end;
$$;

-- A coluna, as regras da tabela e a contagem
select has_column('public', 'solicitacoes', 'horario2', 'a agenda guarda a 2ª preferência');
select col_is_null('public', 'solicitacoes', 'horario2', 'a 2ª preferência pode faltar (os pedidos de antes, e quem não tem)');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'solicitacoes' and column_name = 'disponibilidade'),
  'não há disponibilidade: o pedido é um horário exato');
select throws_ok($$ insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horario2, registrado_por)
  values (current_date, 1, 'A', 'B', 'manha', null, '08:20', 'C') $$, '23514', null, 'a 2ª preferência só no pedido num horário específico');
select ok((select not p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""'] from pg_proc p
  where p.oid = 'public.solicitacoes_por_dia(date, date)'::regprocedure), 'a contagem lê com a regra de leitura de quem a chama (security invoker)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d600-000000000001","role":"authenticated"}', true);

-- A 2ª preferência (os casos)
select pg_temp.registrar('10:10', 'Navegação', 'C152', '08:20', 1, 3001);
select is((select horario2 from public.solicitacoes where aluno = 3001), '10:10', 'a 2ª preferência: guardada no pedido');
select is(pg_temp.erro($$ select pg_temp.registrar('08:20') $$), '22023 horario2', 'a 2ª preferência igual à 1ª: recusada (horario2)');
select is(pg_temp.erro($$ select pg_temp.registrar('8:20') $$), '22023 horario2', 'a 2ª preferência fora do formato HH:MM: recusada (horario2)');
select is(pg_temp.erro($$ select pg_temp.registrar('16:20', 'Noturno', 'C172', '17:30', 4) $$), '22023 horario2', 'a 2ª preferência no Noturno: recusada (horario2)');
select is(pg_temp.erro($$ select pg_temp.registrar('10:10', 'Voo Solo', 'C152', '06:30') $$), '22023 horario2', 'a 2ª preferência no Voo Solo: recusada (horario2)');
select pg_temp.registrar(null, 'Voo Local', 'C152', '08:20', 1, 2000 + n) from generate_series(1, 6) n;
select pg_temp.registrar('08:20', 'Voo Local', 'C152', '10:10', 1, 3002);
select is((select horario2 from public.solicitacoes where aluno = 3002), '08:20', 'a 2ª preferência num horário com 6 voos locais: aceita (o limite conta o 1º)');
select is((select horario2 from public.solicitacoes where aluno = 2001), null, 'sem a 2ª preferência, nada guardado');

select * from finish();
rollback;

-- Retorno da operação (14/11): a agenda guarda a duração do voo (horas fracionadas, até 5 h) e o pedido novo é sempre
-- num horário específico. A função antiga (sem a duração) continua até o app novo estar no ar. Roda dentro de uma
-- transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

delete from public.solicitacoes;
insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-d100-000000000001', 'secretaria@teste-agenda-horas.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values ('00000000-0000-4000-d100-000000000001', 'secretaria', 'Secretaria de teste');

select has_column('public', 'solicitacoes', 'horas', 'a agenda guarda a duração');
select has_function('public', 'registrar_solicitacao', array['date', 'integer', 'text', 'text', 'text', 'text', 'numeric', 'text', 'text', 'boolean'],
  'função nova, com a duração');
select has_function('public', 'registrar_solicitacao', array['date', 'integer', 'text', 'text', 'text', 'text', 'text', 'text', 'boolean'],
  'a função antiga continua enquanto o app anterior estiver no ar');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d100-000000000001","role":"authenticated"}', true);
select isnt(public.registrar_solicitacao(current_date + 5, 1000, 'Aluno 1000', 'Navegação', 'horario', '10:10', 2.6, 'Maria', null, false), null,
  'registra o pedido com a duração');
select is((select horas from public.solicitacoes where aluno = 1000), 2.6::numeric, 'guarda a duração fracionada');
select isnt(public.registrar_solicitacao(current_date + 5, 1001, 'Aluno 1001', 'Ground C152', 'horario', '06:30', 3, 'Maria', null, false), null,
  'registra um Ground');
select is((select horas from public.solicitacoes where aluno = 1001), 1.5::numeric, 'o Ground tem sempre 01h30');
select throws_ok($$ select public.registrar_solicitacao(current_date + 5, 1000, 'Aluno', 'Voo Local', 'manha', null, 1, 'Maria', null, false) $$,
  '22023', null, 'o pedido novo é num horário específico (não por período)');
select throws_ok($$ select public.registrar_solicitacao(current_date + 5, 1000, 'Aluno', 'Voo Local', 'horario', '10:10', 5.5, 'Maria', null, false) $$,
  '22023', null, 'a duração vai até 5 h');
select throws_ok($$ select public.registrar_solicitacao(current_date + 5, 1000, 'Aluno', 'Voo Local', 'horario', '10:10', 0, 'Maria', null, false) $$,
  '22023', null, 'a duração é maior que zero');
select throws_ok($$ select public.registrar_solicitacao(current_date + 5, 1000, 'Aluno', 'Voo Local', 'horario', '10:10', null, 'Maria', null, false) $$,
  '22023', null, 'a duração é obrigatória');

select * from finish();
rollback;

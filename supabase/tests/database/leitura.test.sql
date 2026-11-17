-- Fase 9: só os perfis da escala (operador, administrador, gestor e secretaria) leem os documentos, os dias, o
-- histórico e a agenda; conta sem perfil e visitante anônimo, não. (O perfil "painel", da TV da recepção, está em
-- painel.test.sql.) Revisão de 17/11 (cursos_e_missoes): as tabelas dos cursos também (os cursos, as fases, as missões,
-- os requisitos e as versões). Roda dentro de uma transação desfeita no final: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-a000-000000000011', 'operador@leitura.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000012', 'administrador@leitura.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000013', 'gestor@leitura.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000014', 'secretaria@leitura.acpm.invalid', now(), now()),
  ('00000000-0000-4000-a000-000000000015', 'sem-perfil@leitura.acpm.invalid', now(), now());
insert into public.perfis (usuario, perfil, nome) values
  ('00000000-0000-4000-a000-000000000011', 'operador', 'Operador de teste'),
  ('00000000-0000-4000-a000-000000000012', 'administrador', 'Administrador de teste'),
  ('00000000-0000-4000-a000-000000000013', 'gestor', 'Gestor de teste'),
  ('00000000-0000-4000-a000-000000000014', 'secretaria', 'Secretaria de teste');

-- Um registro em cada tabela
insert into public.documentos (chave, conteudo) values ('bi', '{}') on conflict (chave) do nothing;
insert into public.dias (data, conteudo) values ('2099-01-01', '{}');
insert into public.historico (data, tipo, descricao) values ('2099-01-01', 'mod', 'teste de leitura');
insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, registrado_por)
  values ('2099-01-01', 1000, 'Aluno de teste', 'Voo Local', 'manha', 'Teste');

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

-- Estrutura: a leitura é pela lista dos perfis da escala (antes: qualquer conta com perfil)
select has_function('public', 'le_a_escala', 'função le_a_escala existe');
select policies_are('public', 'documentos', array['perfis da escala leem'], 'documentos: lidos pelos perfis da escala');
select policies_are('public', 'dias', array['perfis da escala leem'], 'dias: lidos pelos perfis da escala');
select policies_are('public', 'historico', array['perfis da escala leem'], 'histórico: lido pelos perfis da escala');
select policies_are('public', 'solicitacoes', array['perfis da escala leem'], 'agenda: lida pelos perfis da escala');

set local role authenticated;

-- Operador
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select ok(exists (select 1 from public.documentos), 'operador lê os documentos');
select ok(exists (select 1 from public.dias where data = '2099-01-01'), 'operador lê os dias');
select ok(exists (select 1 from public.historico where data = '2099-01-01'), 'operador lê o histórico');
select ok(exists (select 1 from public.solicitacoes where data = '2099-01-01'), 'operador lê a agenda');
select is(pg_temp.linhas_do_zz9(), array[1, 2, 2, 1, 1, 1], 'operador lê os cursos (as fases, as missões, os requisitos e as versões)');

-- Administrador
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000012","role":"authenticated"}', true);
select ok(exists (select 1 from public.documentos), 'administrador lê os documentos');
select ok(exists (select 1 from public.dias where data = '2099-01-01'), 'administrador lê os dias');
select ok(exists (select 1 from public.historico where data = '2099-01-01'), 'administrador lê o histórico');
select ok(exists (select 1 from public.solicitacoes where data = '2099-01-01'), 'administrador lê a agenda');
select is(pg_temp.linhas_do_zz9(), array[1, 2, 2, 1, 1, 1], 'administrador lê os cursos (as fases, as missões, os requisitos e as versões)');

-- Gestor
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000013","role":"authenticated"}', true);
select ok(exists (select 1 from public.documentos), 'gestor lê os documentos');
select ok(exists (select 1 from public.dias where data = '2099-01-01'), 'gestor lê os dias');
select ok(exists (select 1 from public.historico where data = '2099-01-01'), 'gestor lê o histórico');
select ok(exists (select 1 from public.solicitacoes where data = '2099-01-01'), 'gestor lê a agenda');
select is(pg_temp.linhas_do_zz9(), array[1, 2, 2, 1, 1, 1], 'gestor lê os cursos (as fases, as missões, os requisitos e as versões)');

-- Secretaria
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000014","role":"authenticated"}', true);
select ok(exists (select 1 from public.documentos), 'secretaria lê os documentos');
select ok(exists (select 1 from public.dias where data = '2099-01-01'), 'secretaria lê os dias');
select ok(exists (select 1 from public.historico where data = '2099-01-01'), 'secretaria lê o histórico');
select ok(exists (select 1 from public.solicitacoes where data = '2099-01-01'), 'secretaria lê a agenda');
select is(pg_temp.linhas_do_zz9(), array[1, 2, 2, 1, 1, 1], 'secretaria lê os cursos (as fases, as missões, os requisitos e as versões)');

-- Conta sem perfil
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000015","role":"authenticated"}', true);
select ok(not exists (select 1 from public.documentos), 'conta sem perfil não lê os documentos');
select ok(not exists (select 1 from public.dias), 'conta sem perfil não lê os dias');
select ok(not exists (select 1 from public.historico), 'conta sem perfil não lê o histórico');
select ok(not exists (select 1 from public.solicitacoes), 'conta sem perfil não lê a agenda');
select is(pg_temp.linhas_do_zz9(), array[0, 0, 0, 0, 0, 0], 'conta sem perfil não lê os cursos (nem as fases, as missões, os requisitos e as versões)');

-- Visitante anônimo
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select 1 from public.documentos $$, '42501', null, 'anônimo não acessa os documentos');
select throws_ok($$ select 1 from public.dias $$, '42501', null, 'anônimo não acessa os dias');
select throws_ok($$ select 1 from public.historico $$, '42501', null, 'anônimo não acessa o histórico');
select throws_ok($$ select 1 from public.solicitacoes $$, '42501', null, 'anônimo não acessa a agenda');
select throws_ok($$ select 1 from public.cursos $$, '42501', null, 'anônimo não acessa os cursos');
select throws_ok($$ select 1 from public.fases_do_curso $$, '42501', null, 'anônimo não acessa as fases');
select throws_ok($$ select 1 from public.missoes_do_curso $$, '42501', null, 'anônimo não acessa as missões');
select throws_ok($$ select 1 from public.requisitos_das_fases $$, '42501', null, 'anônimo não acessa os requisitos das fases');
select throws_ok($$ select 1 from public.requisitos_das_missoes $$, '42501', null, 'anônimo não acessa os requisitos das missões');
select throws_ok($$ select 1 from public.versoes_dos_cursos $$, '42501', null, 'anônimo não acessa as versões dos cursos');

select * from finish();
rollback;

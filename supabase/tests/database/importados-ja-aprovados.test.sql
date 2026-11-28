-- A regra (a) de novo (G2; a migração 20261129100100_importados_ja_aprovados): os pedidos registrados depois do D1 (com as
-- colunas da aprovação) que uma aba de antes do D2 importou e que ainda aguardam ficam aprovados por "importação anterior";
-- a conversão roda duas vezes (a segunda não muda nada). Cada caso de test/helpers/casos-dos-importados.js é uma verificação
-- daqui, com o nome do caso na descrição (test/unit/espelho-do-banco.test.js confere). As datas são as de São Paulo.
-- Roda dentro de uma transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

delete from public.solicitacoes;
-- A data aberta (no prazo, nunca um domingo) e a que já passou (antes de hoje, nunca um domingo)
create function pg_temp.hoje() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.d(p_rotulo text) returns date language sql as $$
  select case p_rotulo
    when 'aberta' then pg_temp.hoje() + 5 + case when extract(isodow from pg_temp.hoje() + 5) = 7 then 1 else 0 end
    when 'passada' then pg_temp.hoje() - 2 - case when extract(isodow from pg_temp.hoje() - 2) = 7 then 1 else 0 end
  end $$;
create temporary table ids (caso integer primary key, id bigint not null);
create function pg_temp.id(p_caso integer) returns bigint language sql as $$ select id from pg_temp.ids where caso = p_caso $$;
-- Um pedido com as colunas da aprovação, no estado do caso, e o registro do dia que o leva (o principal do aluno ou uma
-- missão extra), com o id dele em "importadas" quando importado
create function pg_temp.pedido(p_caso integer, p_data text, p_aluno integer, p_estado text, p_importada boolean, p_registro text) returns void language plpgsql as $$
declare
  novo bigint;
  dia date := pg_temp.d(p_data);
begin
  insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horas, registrado_por, cancelada_em, cancelada_por,
    aprovada_em, aprovada_por, aprovacao_retirada_em, aprovacao_retirada_por)
  values (dia, p_aluno, 'Aluno', 'Voo Local', 'horario', '08:20', 1, 'Maria',
    case when p_estado = 'cancelada' then now() end, case when p_estado = 'cancelada' then 'Maria' end,
    case when p_estado = 'aprovada' then now() end, case when p_estado = 'aprovada' then 'Operador de teste' end,
    case when p_estado = 'retirada' then now() end, case when p_estado = 'retirada' then 'Operador de teste' end)
  returning id into novo;
  insert into pg_temp.ids values (p_caso, novo);
  insert into public.dias (data, conteudo) values (dia, jsonb_build_object('importadas', '[]'::jsonb, 'pedidos', '{}'::jsonb))
  on conflict (data) do nothing;
  if p_importada then
    update public.dias set conteudo = jsonb_set(conteudo, '{importadas}', (conteudo -> 'importadas') || to_jsonb(novo)) where data = dia;
  end if;
  if p_registro = 'principal' then
    update public.dias set conteudo = jsonb_set(conteudo, array['pedidos', p_aluno::text], jsonb_build_object('fly', true, 'solicitacao', novo, 'extra', '[]'::jsonb)) where data = dia;
  elsif p_registro = 'extra' then
    update public.dias set conteudo = jsonb_set(conteudo, array['pedidos', p_aluno::text],
      jsonb_build_object('fly', true, 'mis', 'Voo Local', 'extra', jsonb_build_array(jsonb_build_object('mid', 1, 'fly', true, 'solicitacao', novo)))) where data = dia;
  end if;
end $$;
delete from public.dias where data in (pg_temp.d('aberta'), pg_temp.d('passada'));
select pg_temp.pedido(1, 'aberta', 1001, 'aguardando', true, 'principal');
select pg_temp.pedido(2, 'aberta', 1002, 'aguardando', true, 'extra');
select pg_temp.pedido(3, 'passada', 1003, 'aguardando', true, null);
select pg_temp.pedido(4, 'aberta', 1004, 'aguardando', true, null);
select pg_temp.pedido(5, 'aberta', 1005, 'aguardando', false, null);
select pg_temp.pedido(6, 'aberta', 1006, 'retirada', true, 'principal');
select pg_temp.pedido(7, 'aberta', 1007, 'cancelada', true, 'principal');
select pg_temp.pedido(8, 'aberta', 1008, 'aprovada', true, 'principal');

-- A migração (pelo dono, como a migração a roda): a regra (a) só
select is(public.aprovar_solicitacoes_de_antes_da_aprovacao(false), 3, 'a regra (a) de novo: os importados que aguardam e um registro leva, e o importado de uma data que já passou');
select is((select aprovada_por from public.solicitacoes where id = pg_temp.id(1)), 'importação anterior', 'importado e levado pelo registro principal, aguardando: aprovado');
select is((select aprovada_por from public.solicitacoes where id = pg_temp.id(2)), 'importação anterior', 'importado e levado por uma missão extra, aguardando: aprovado');
select is((select aprovada_por from public.solicitacoes where id = pg_temp.id(3)), 'importação anterior', 'importado numa data que já passou, sem registro: aprovado');
select is((select aprovada_em from public.solicitacoes where id = pg_temp.id(4)), null, 'só em importadas, sem registro, de hoje em diante: continua aguardando');
select is((select aprovada_em from public.solicitacoes where id = pg_temp.id(5)), null, 'não importado: continua aguardando');
select is((select aprovada_em from public.solicitacoes where id = pg_temp.id(6)), null, 'com a aprovação retirada: não volta pela conversão');
select is((select aprovada_em from public.solicitacoes where id = pg_temp.id(7)), null, 'cancelado: continua cancelado, sem aprovação');
select is((select aprovada_por from public.solicitacoes where id = pg_temp.id(8)), 'Operador de teste', 'já aprovado: fica com quem aprovou');
-- De novo: nada muda
create temporary table antes as select id, aprovada_em, aprovada_por from public.solicitacoes;
select is(public.aprovar_solicitacoes_de_antes_da_aprovacao(false), 0, 'rodar de novo não aprova nada');
select is((select count(*)::integer from public.solicitacoes s join pg_temp.antes a using (id) where s.aprovada_em is distinct from a.aprovada_em or s.aprovada_por is distinct from a.aprovada_por), 0,
  'rodar de novo não muda nenhum pedido');

select * from finish();
rollback;

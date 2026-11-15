-- Revisão de 14/11: o repouso do instrutor conta do pouso de verdade. O voo atrasado termina na nova decolagem mais a
-- duração, também depois de virar Em Voo ou Pousou (o app guarda a nova decolagem até o pouso). O resto continua como na
-- fase 11 (horas_dos_instrutores): só voo em avião nas horas, sem os cancelados; a TV recebe um resultado vazio.
create or replace function public.horas_dos_instrutores(p_data date)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with voos as (
    select d.data, o, d.conteudo->'fStatus'->>(o->>'fKey') as status, d.conteudo->'fObs'->(o->>'fKey')->>'novoInicio' as novo
    from public.dias d,
      jsonb_array_elements(case when jsonb_typeof(d.conteudo->'resultado'->'out') = 'array' then d.conteudo->'resultado'->'out' else '[]'::jsonb end) o
    where d.data < p_data
      and d.data >= least(date_trunc('year', p_data)::date, p_data - 1)
      and jsonb_typeof(o) = 'object'
      and coalesce(d.conteudo->'fStatus'->>(o->>'fKey'), o->>'status', 'Confirmado') <> 'Cancelado'
  ),
  horas as (
    select o->>'insId' as ins,
      sum((o->>'h')::numeric) filter (where date_trunc('month', data) = date_trunc('month', p_data)) as mes,
      sum((o->>'h')::numeric) filter (where (extract(month from data) <= 6) = (extract(month from p_data) <= 6)) as semestre,
      sum((o->>'h')::numeric) as ano
    from voos
    where data >= date_trunc('year', p_data) and o->>'eqType' in ('C152', 'C172', 'PA-34')
    group by 1
  ),
  vespera as (
    -- O atrasado (Atrasado, Em Voo ou Pousou com a nova decolagem no dia) termina na nova decolagem mais a duração
    select o->>'insId' as ins, max(case
      when coalesce(status, o->>'status') in ('Atrasado', 'Em Voo', 'Pousou') and novo ~ '^[0-9]{1,4}$' and novo::integer between 1 and 1439
        then novo::integer + (o->>'b')::integer - (o->>'a')::integer
      else (o->>'b')::integer end) as fim
    from voos
    where data = p_data - 1
    group by 1
  )
  select coalesce(jsonb_object_agg(coalesce(h.ins, v.ins), jsonb_build_object(
    'mes', round(coalesce(h.mes, 0), 1), 'semestre', round(coalesce(h.semestre, 0), 1), 'ano', round(coalesce(h.ano, 0), 1),
    'fimAnterior', v.fim)), '{}'::jsonb)
  from horas h full join vespera v on v.ins = h.ins
$$;

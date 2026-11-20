-- O painel_do_dia passa a entregar também a configuração do painel ("Configurar painel", no cadastro, campo "painel",
-- do formato 25 em diante): o perfil da TV não lê o cadastro, e a TV mostrava sempre o padrão (Missões, com as colunas
-- do padrão). Agora ela segue o quadro e as colunas que o operador escolheu, como a Escala. Só o formato do app sai do
-- cadastro: o quadro da lista e as colunas conhecidas, com "on" booleano; sem a configuração, 'painel' é null.
-- O resto da função fica como em 20261114140751_painel_status_validos.sql: os mesmos campos, security definer, o
-- search_path vazio e a execução só para authenticated (a TV que ainda não tem esta migração lê o mesmo de antes, sem o
-- campo novo, e mostra o padrão).
create or replace function public.painel_do_dia()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  status_validos constant text[] := array['Pendente', 'Confirmado', 'Atrasado', 'Em Voo', 'Cancelado', 'Pousou'];
  motivos constant text[] := array['Meteorologia', 'Manutenção da aeronave', 'Aluno ausente', 'Instrutor indisponível', 'Operacional', 'Outro'];
  chave_do_voo constant text := '^[0-9]{1,12}_[0-9]{1,6}_[0-9]{1,6}$';
  -- Os quadros e as colunas do painel (js/config-do-painel.js)
  quadros constant text[] := array['missoes', 'alternar', 'partidas', 'chegadas'];
  colunas constant text[] := array['horario', 'aeronave', 'modelo', 'aluno', 'instrutor', 'missao', 'previsto', 'observacao'];
  dia jsonb;
  guardado jsonb;
  painel jsonb;
begin
  if public.perfil_atual() is null then
    raise exception 'sem acesso ao painel' using errcode = '42501';
  end if;
  -- A configuração do painel (o campo "painel" do cadastro; sem ela, null, e a TV mostra o padrão), só no formato do app:
  -- o quadro da lista (fora dela, sai) e as colunas conhecidas, cada uma uma vez (a primeira), na ordem gravada, com
  -- "on" verdadeiro ou falso (o que não é true é false, também sem o "on": o null sumiria no jsonb_strip_nulls); a TV
  -- completa o resto como o app (normalizarPainel)
  select conteudo->'painel' into guardado from public.documentos where chave = 'cadastro';
  if jsonb_typeof(guardado) = 'object' then
    painel := jsonb_strip_nulls(jsonb_build_object(
      'quadro', case when guardado->>'quadro' = any (quadros) then guardado->>'quadro' end,
      'colunas', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'on', c.ligada) order by c.posicao)
        from (
          select distinct on (e.valor->>'id') e.valor->>'id' as id, coalesce(e.valor->'on' = 'true'::jsonb, false) as ligada, e.posicao
          from jsonb_array_elements(case when jsonb_typeof(guardado->'colunas') = 'array' then guardado->'colunas' else '[]'::jsonb end)
            with ordinality as e(valor, posicao)
          where jsonb_typeof(e.valor) = 'object' and e.valor->>'id' = any (colunas)
          order by e.valor->>'id', e.posicao
        ) c
      ), '[]'::jsonb)));
  end if;
  select conteudo into dia from public.dias where data = hoje;
  -- Dia ainda sem escala gravada: o quadro diz que não há escala
  if dia is null or jsonb_typeof(dia->'resultado') is distinct from 'object' or jsonb_typeof(dia->'resultado'->'out') is distinct from 'array' then
    return jsonb_build_object('data', hoje, 'voos', null, 'fStatus', '{}'::jsonb, 'fObs', '{}'::jsonb, 'painel', painel);
  end if;
  return jsonb_build_object(
    'data', hoje,
    'painel', painel,
    'voos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fKey', o->>'fKey', 'classKey', left(o->>'classKey', 80), 'isGround', coalesce(o->>'isGround' = 'true', false),
        'a', h.a, 'b', h.b, 'r', left(o->>'r', 15), 'eqType', left(o->>'eqType', 30),
        's', left(public.nome_curto(left(o->>'s', 200)), 80), 'ins', left(o->>'ins', 80), 'mis', left(o->>'mis', 60),
        'etapa', case when o->>'etapa' ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$' then o->>'etapa' end,
        'status', case when o->>'status' = any (status_validos) then o->>'status' else 'Confirmado' end
      ) order by h.a, o->>'fKey')
      from jsonb_array_elements(dia->'resultado'->'out') o
      -- Os horários só viram número quando têm até 4 dígitos (o case garante a ordem: o número grande não chega ao cast)
      cross join lateral (select
        case when o->>'a' ~ '^[0-9]{1,4}$' then (o->>'a')::integer end as a,
        case when o->>'b' ~ '^[0-9]{1,4}$' then (o->>'b')::integer end as b) h
      where jsonb_typeof(o) = 'object' and o->>'fKey' ~ chave_do_voo and h.a < h.b and h.b <= 1440
    ), '[]'::jsonb),
    'fStatus', coalesce((
      select jsonb_object_agg(chave, status)
      from jsonb_each_text(case when jsonb_typeof(dia->'fStatus') = 'object' then dia->'fStatus' else '{}'::jsonb end) as e(chave, status)
      where chave ~ chave_do_voo and status = any (status_validos)
    ), '{}'::jsonb),
    -- Do detalhe do status, só a categoria do motivo (da lista, sem o texto livre) e o novo horário (no dia)
    'fObs', coalesce((
      select jsonb_object_agg(chave, detalhe)
      from (
        select chave, jsonb_strip_nulls(jsonb_build_object(
          'motivo', case when d->>'motivo' = any (motivos) then d->>'motivo' end,
          'novoInicio', case when d->>'novoInicio' ~ '^[0-9]{1,4}$' then
            case when (d->>'novoInicio')::integer between 1 and 1439 then (d->>'novoInicio')::integer end end)) as detalhe
        from jsonb_each(case when jsonb_typeof(dia->'fObs') = 'object' then dia->'fObs' else '{}'::jsonb end) as e(chave, d)
        where chave ~ chave_do_voo and jsonb_typeof(d) = 'object'
      ) limpos
      where detalhe <> '{}'::jsonb
    ), '{}'::jsonb)
  );
end;
$$;
revoke execute on function public.painel_do_dia() from public, anon;
grant execute on function public.painel_do_dia() to authenticated;

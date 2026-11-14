-- Retorno da operação (14/11): a diretoria do aeroclube permite no máximo 6 voos locais (Voo Local, Voo Solo e TGL)
-- saindo no mesmo horário. registrar_solicitacao (a versão com a duração) recusa o 7º pedido local no mesmo horário da
-- data (PT422, dica "locais"); pedidos cancelados e outras missões não contam. O resto como antes.
create or replace function public.registrar_solicitacao(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean
)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  quem text := public.perfil_atual()::text;
  no_prazo boolean := public.prazo_da_agenda_permite(p_data, now());
  v_horas numeric := round(p_horas, 1);
  nova bigint;
begin
  if quem is null or quem not in ('secretaria', 'operador') then
    raise exception 'somente a secretaria e os operadores registram pedidos na agenda' using errcode = '42501';
  end if;
  if p_janela is distinct from 'horario' or p_horario is null then
    raise exception 'o pedido é num horário específico' using errcode = '22023', hint = 'horario';
  end if;
  if p_missao like 'Ground%' then
    v_horas := 1.5;
  elsif v_horas is null or v_horas <= 0 or v_horas > 5 then
    raise exception 'a duração vai de 0,1 h a 5 h' using errcode = '22023', hint = 'horas';
  end if;
  -- No máximo 6 voos locais (Voo Local, Voo Solo e TGL) no mesmo horário; o bloqueio por data e horário evita que dois
  -- pedidos ao mesmo tempo passem do limite
  if p_missao in ('Voo Local', 'Voo Solo', 'TGL (TMA)') then
    perform pg_advisory_xact_lock(hashtext('agenda-locais:' || p_data::text || ':' || p_horario));
    if (select count(*) from public.solicitacoes s
        where s.data = p_data and s.janela = 'horario' and s.horario = p_horario and s.cancelada_em is null
          and s.missao in ('Voo Local', 'Voo Solo', 'TGL (TMA)')) >= 6 then
      raise exception 'já há 6 voos locais (Voo Local, Voo Solo e TGL) às %, o máximo no mesmo horário', p_horario
        using errcode = 'PT422', hint = 'locais';
    end if;
  end if;
  if not no_prazo then
    if not coalesce(p_excecao, false) then
      raise exception 'prazo encerrado: pedido para o dia seguinte só até as 13:00' using errcode = 'PT403';
    end if;
    if quem <> 'operador' then
      raise exception 'a exceção da coordenação é só para operadores' using errcode = '42501';
    end if;
  end if;

  insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horas, observacao, registrado_por, usuario, conta, excecao)
  values (
    p_data, p_aluno, trim(p_aluno_nome), p_missao, p_janela, p_horario, v_horas, nullif(trim(p_observacao), ''), trim(p_registrado_por),
    auth.uid(),
    (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid()),
    not no_prazo
  )
  returning id into nova;
  return nova;
end;
$$;

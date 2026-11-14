-- Retorno da operação (14/11): a agenda guarda a duração do voo, e o pedido novo é sempre num horário específico.
-- - Coluna horas: em décimos de hora, de 0,1 a 5 (o Ground, 1,5); os pedidos de antes ficam sem (a demanda usa 1 h).
-- - registrar_solicitacao com a duração (p_horas, obrigatória): recusa o pedido por período (manhã, tarde, noite) e a
--   duração fora de 0,1 a 5 h (22023). O resto como antes: o prazo das 13:00, a exceção da coordenação (só
--   operadores) e quem anotou.
-- - A função antiga (sem a duração) continua até o app novo estar no ar: o app anterior ainda a chama. Uma migração
--   depois do merge a tira.
alter table public.solicitacoes add column horas numeric(3,1) check (horas is null or (horas > 0 and horas <= 5));

create function public.registrar_solicitacao(
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
revoke execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean) from public, anon;
grant execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean) to authenticated;

-- Passo D1 (a linha de produção): a aprovação dos pedidos da agenda, no servidor (docs/PLAN.md, o passo D1 e a migração
-- #3). Na tela nada muda (as páginas são do D2); o app chama a função de 16 argumentos, e o do operador nasce aprovado.
-- - Sete colunas, todas vazias nos pedidos de antes:
--   - aprovada_em, aprovada_por (o nome da conta) e aprovada_usuario: quem aprovou o pedido, e quando. Vazias: o pedido
--     aguarda a aprovação. Não há coluna de situação: cancelado (cancelada_em), aprovado (aprovada_em) ou aguardando;
--   - aprovacao_retirada_em, aprovacao_retirada_por e aprovacao_retirada_usuario: a última retirada da aprovação (a
--     próxima aprovação as apaga). Aprovado ou retirado, nunca os dois;
--   - horario2: a 2ª preferência, outro horário exato (U1, 26/11): só no pedido num horário específico (janela
--     'horario') e diferente do 1º. O pedido é um horário exato (N13): não há coluna de disponibilidade.
-- - registrar_solicitacao com 16 argumentos (a de 13 com p_horario2, p_aprovar e p_esperar, nenhum com valor padrão: o
--   PostgREST escolhe a função pelos nomes dos argumentos, e as quatro nunca se confundem). Ela e as de 13, 11 e 10
--   argumentos, que ficam como atalhos para as abas abertas do app de antes, chamam uma função interna só
--   (registrar_solicitacao_interna, sem direito de execução para ninguém: nem o service_role, a quem o Supabase dá
--   toda função nova do esquema public), com as mesmas regras, na ordem:
--   1. quem pode: a secretaria e os operadores (o administrador conta como operador): 42501;
--   2. o horário específico (22023, horario; um período é recusado, como pela de 13) e a duração (22023, horas);
--   3. pela de 16 e pela de 13, as regras da de 13 (o recurso, os horários fixos e a missão do curso: 22023 com a dica
--      recurso, horario ou missao). As de 11 e de 10 ficam como eram: o recurso pode faltar (a de 10 não o tem), e o que
--      vem não é comparado com a missão;
--   4. a 2ª preferência: um horário HH:MM diferente do 1º, e nunca no Noturno ou no Voo Solo, que têm um horário só
--      (22023, horario2); a confirmação do 7º voo local e a lista de espera juntas são recusadas (22023, esperar);
--   5. o domingo (PT403, domingo) e a data que já passou (PT403, passada), pela data de São Paulo, antes do prazo: nem a
--      exceção da coordenação as abre;
--   6. no máximo 6 voos locais no mesmo horário (com o bloqueio do horário): o 7º passa com a confirmação
--      (p_confirmar_limite, que fica registrada) ou na lista de espera (p_esperar, U3 de 26/11: registrado sem nada a
--      mais; quem espera é o motor, a cada vez que roda); sem nenhuma das duas, PT422 (locais). Com vaga, ou noutra
--      missão, nenhuma das duas registra nada;
--   7. o prazo (PT403, prazo) e a exceção da coordenação, só dos operadores (42501, excecao);
--   8. p_aprovar só dos operadores (42501, aprovar).
--   O pedido nasce aprovado (por quem o registrou) com p_aprovar, ou fora do prazo (pela exceção). Os atalhos aprovam o
--   pedido do operador e deixam o da secretaria aguardando, sem 2ª preferência e sem a lista de espera.
-- - cancelar_solicitacao: como antes (a secretaria e os operadores, o que aguarda e o aprovado), mas o pedido aprovado de
--   uma data que já passou não é cancelado (PT403, passada): a escala dessa data já voou.
-- - aprovar_solicitacoes(ids): os operadores aprovam uma lista (até 200; vazia ou maior, 22023 ids) e recebem os ids que
--   aprovaram agora, em ordem; o já aprovado, o cancelado, o de uma data que já passou e o id que não existe ficam fora.
--   Aprovar de novo não muda nada (quem aprovou primeiro fica).
-- - retirar_aprovacao_da_solicitacao(id): os operadores devolvem o pedido aprovado à espera, guardando quem e quando
--   (P0002 para o que não está aprovado ou foi cancelado; PT403, passada, para uma data que já passou).
-- - solicitacoes_por_dia(de, até): por data, os pedidos que aguardam e os aprovados (sem os cancelados), com a regra de
--   leitura da tabela (security invoker: quem não lê a agenda recebe {}).
-- - aprovar_solicitacoes_de_antes_da_aprovacao(dos_operadores), interna (sem direito de execução para ninguém, nem o
--   service_role): a conversão dos pedidos de antes, nunca o cancelado nem o de aprovação retirada. (a) Os que a
--   importação já levou para a
--   demanda: numa data que já passou, todo id em "importadas"; de hoje em diante, só o que um registro da data ainda leva
--   (o pedido principal do aluno ou uma missão extra), voando ou não ("importação anterior"). (b) Só com dos_operadores
--   (esta migração; a do G2 roda só a regra (a)): de hoje em diante, o que uma conta de operador ou de administrador
--   registrou e não está em "importadas" (quem registrou é quem aprova). Rodar de novo não muda nada.
-- - A função de 9 argumentos (a do período, sem a duração) sai: nenhum app a chama desde 14/11.
-- As mesmas regras estão em JavaScript (o modo local, o servidor falso e o cliente falso dos testes), com os casos de
-- test/helpers/casos-da-agenda.js e test/helpers/casos-das-solicitacoes.js, que são verificações de
-- supabase/tests/database/agenda-*.test.sql (test/unit/espelho-do-banco.test.js confere).

alter table public.solicitacoes
  add column aprovada_em timestamptz,
  add column aprovada_por text,
  add column aprovada_usuario uuid references auth.users (id) on delete set null,
  add column aprovacao_retirada_em timestamptz,
  add column aprovacao_retirada_por text,
  add column aprovacao_retirada_usuario uuid references auth.users (id) on delete set null,
  add column horario2 text check (horario2 ~ '^[0-2][0-9]:[0-5][0-9]$'),
  add constraint solicitacoes_horario2 check (horario2 is null or (janela = 'horario' and horario2 <> horario)),
  add constraint solicitacoes_aprovacao check (aprovada_em is null or aprovacao_retirada_em is null);
comment on table public.solicitacoes is 'Agenda de solicitações de voo (os pedidos). Gravação somente pelas funções registrar_solicitacao, cancelar_solicitacao, aprovar_solicitacoes e retirar_aprovacao_da_solicitacao.';
comment on column public.solicitacoes.aprovada_em is 'Quando o pedido foi aprovado; vazio: aguarda a aprovação.';
comment on column public.solicitacoes.aprovada_por is 'Quem aprovou o pedido (o nome da conta; "importação anterior" na conversão dos pedidos de antes).';
comment on column public.solicitacoes.aprovacao_retirada_em is 'A última retirada da aprovação (a próxima aprovação a apaga).';
comment on column public.solicitacoes.horario2 is 'A 2ª preferência: outro horário exato do pedido; vazia: só o 1º.';

drop function public.registrar_solicitacao(date, integer, text, text, text, text, text, text, boolean);

create function public.registrar_solicitacao_interna(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean,
  p_recurso text, p_missao_do_curso uuid, p_confirmar_limite boolean,
  p_horario2 text, p_aprovar boolean, p_esperar boolean,
  p_regras_do_recurso boolean
)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  quem text := public.perfil_atual()::text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  no_prazo boolean := public.prazo_da_agenda_permite(p_data, now());
  v_horas numeric := round(p_horas, 1);
  v_recurso text := nullif(trim(p_recurso), '');
  v_aprovar boolean := coalesce(p_aprovar, false);
  v_alem_do_limite boolean := false;
  v_conta text;
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
  if p_regras_do_recurso then
    -- O recurso: obrigatório e um dos que a missão permite, com as horas
    if v_recurso is null then
      raise exception 'o pedido precisa do recurso' using errcode = '22023', hint = 'recurso';
    end if;
    if public.missao_e_recurso_validos(p_missao, v_recurso, v_horas) is not true then
      raise exception 'a missão % não é feita no % com essas horas', p_missao, v_recurso using errcode = '22023', hint = 'recurso';
    end if;
    -- Os horários fixos (os do app: js/horarios.js, horariosDaMissao)
    if p_missao = 'Noturno' and p_horario is distinct from '17:30' then
      raise exception 'o Noturno sai sempre às 17:30' using errcode = '22023', hint = 'horario';
    end if;
    if p_missao = 'Voo Solo' and p_horario is distinct from '06:30' then
      raise exception 'o Voo Solo sai sempre às 06:30' using errcode = '22023', hint = 'horario';
    end if;
    -- A missão do curso: existe, está no programa (nem ela nem a fase dela foram retiradas) e é do tipo do pedido
    if p_missao_do_curso is not null and not exists (
      select 1 from public.missoes_do_curso m join public.fases_do_curso f on f.id = m.fase
      where m.id = p_missao_do_curso and not m.removida and not f.removida and m.tipo_de_missao = p_missao
    ) then
      raise exception 'a missão do curso não existe, saiu do programa ou é de outro tipo' using errcode = '22023', hint = 'missao';
    end if;
  end if;
  -- A 2ª preferência: outro horário exato; o Noturno e o Voo Solo têm um horário só
  if p_horario2 is not null and (p_horario2 !~ '^[0-2][0-9]:[0-5][0-9]$' or p_horario2 = p_horario or p_missao in ('Noturno', 'Voo Solo')) then
    raise exception 'a 2ª preferência é outro horário específico (o Noturno e o Voo Solo têm um horário só)' using errcode = '22023', hint = 'horario2';
  end if;
  if coalesce(p_confirmar_limite, false) and coalesce(p_esperar, false) then
    raise exception 'o 7º voo local é confirmado ou vai para a lista de espera, não os dois' using errcode = '22023', hint = 'esperar';
  end if;
  -- O domingo e a data que já passou (São Paulo): nem a exceção da coordenação os abre
  if extract(isodow from p_data) = 7 then
    raise exception 'o aeroclube não opera aos domingos' using errcode = 'PT403', hint = 'domingo';
  end if;
  if p_data < hoje then
    raise exception 'a data do pedido já passou' using errcode = 'PT403', hint = 'passada';
  end if;
  -- No máximo 6 voos locais (Voo Local, Voo Solo e TGL) no mesmo horário, a não ser com a confirmação ou na lista de
  -- espera; o bloqueio por data e horário evita que dois pedidos ao mesmo tempo passem do limite sem uma delas (e conta o
  -- que a confirmação registra)
  if p_missao in ('Voo Local', 'Voo Solo', 'TGL (TMA)') then
    perform pg_advisory_xact_lock(hashtext('agenda-locais:' || p_data::text || ':' || p_horario));
    if (select count(*) from public.solicitacoes s
        where s.data = p_data and s.janela = 'horario' and s.horario = p_horario and s.cancelada_em is null
          and s.missao in ('Voo Local', 'Voo Solo', 'TGL (TMA)')) >= 6 then
      if coalesce(p_confirmar_limite, false) then
        v_alem_do_limite := true;
      elsif not coalesce(p_esperar, false) then
        raise exception 'já há 6 voos locais (Voo Local, Voo Solo e TGL) às %, o máximo no mesmo horário', p_horario
          using errcode = 'PT422', hint = 'locais';
      end if;
    end if;
  end if;
  if not no_prazo then
    if not coalesce(p_excecao, false) then
      raise exception 'prazo encerrado: pedido para o dia seguinte só até as 13:00' using errcode = 'PT403', hint = 'prazo';
    end if;
    if quem <> 'operador' then
      raise exception 'a exceção da coordenação é só para operadores' using errcode = '42501', hint = 'excecao';
    end if;
  end if;
  if v_aprovar and quem <> 'operador' then
    raise exception 'somente os operadores aprovam pedidos' using errcode = '42501', hint = 'aprovar';
  end if;

  v_conta := (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid());
  insert into public.solicitacoes (data, aluno, aluno_nome, missao, janela, horario, horario2, horas, recurso, missao_do_curso, observacao,
    registrado_por, usuario, conta, excecao, limite_confirmado_por, limite_confirmado_em, aprovada_em, aprovada_por, aprovada_usuario)
  values (
    p_data, p_aluno, trim(p_aluno_nome), p_missao, p_janela, p_horario, p_horario2, v_horas, v_recurso, p_missao_do_curso, nullif(trim(p_observacao), ''),
    trim(p_registrado_por), auth.uid(), v_conta, not no_prazo,
    case when v_alem_do_limite then coalesce(v_conta, '') end, case when v_alem_do_limite then now() end,
    case when v_aprovar or not no_prazo then now() end, case when v_aprovar or not no_prazo then coalesce(v_conta, '') end,
    case when v_aprovar or not no_prazo then auth.uid() end
  )
  returning id into nova;
  return nova;
end;
$$;
revoke execute on function public.registrar_solicitacao_interna(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean, boolean) from public, anon, authenticated, service_role;

-- A função que o app chama: a de 13 com a 2ª preferência, a aprovação e a lista de espera
create function public.registrar_solicitacao(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean,
  p_recurso text, p_missao_do_curso uuid, p_confirmar_limite boolean,
  p_horario2 text, p_aprovar boolean, p_esperar boolean
)
  returns bigint
  language sql
  security definer
  set search_path = ''
as $$
  select public.registrar_solicitacao_interna(p_data, p_aluno, p_aluno_nome, p_missao, p_janela, p_horario, p_horas, p_registrado_por,
    p_observacao, p_excecao, p_recurso, p_missao_do_curso, p_confirmar_limite, p_horario2, p_aprovar, p_esperar, true);
$$;
revoke execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean) from public, anon;
grant execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean, text, boolean, boolean) to authenticated;

-- Os atalhos das abas abertas do app de antes: o pedido do operador nasce aprovado, sem 2ª preferência e sem a lista de
-- espera. A de 13 com as regras dela; a de 11 sem a missão do curso nem a confirmação, e a de 10 também sem o recurso
create or replace function public.registrar_solicitacao(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean,
  p_recurso text, p_missao_do_curso uuid, p_confirmar_limite boolean
)
  returns bigint
  language sql
  security definer
  set search_path = ''
as $$
  select public.registrar_solicitacao_interna(p_data, p_aluno, p_aluno_nome, p_missao, p_janela, p_horario, p_horas, p_registrado_por,
    p_observacao, p_excecao, p_recurso, p_missao_do_curso, p_confirmar_limite, null, coalesce(public.perfil_atual()::text = 'operador', false), false, true);
$$;
revoke execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean) from public, anon;
grant execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text, uuid, boolean) to authenticated;

create or replace function public.registrar_solicitacao(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean,
  p_recurso text
)
  returns bigint
  language sql
  security definer
  set search_path = ''
as $$
  select public.registrar_solicitacao_interna(p_data, p_aluno, p_aluno_nome, p_missao, p_janela, p_horario, p_horas, p_registrado_por,
    p_observacao, p_excecao, p_recurso, null, false, null, coalesce(public.perfil_atual()::text = 'operador', false), false, false);
$$;
revoke execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text) from public, anon;
grant execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean, text) to authenticated;

create or replace function public.registrar_solicitacao(
  p_data date, p_aluno integer, p_aluno_nome text, p_missao text, p_janela text, p_horario text, p_horas numeric,
  p_registrado_por text, p_observacao text, p_excecao boolean
)
  returns bigint
  language sql
  security definer
  set search_path = ''
as $$
  select public.registrar_solicitacao_interna(p_data, p_aluno, p_aluno_nome, p_missao, p_janela, p_horario, p_horas, p_registrado_por,
    p_observacao, p_excecao, null, null, false, null, coalesce(public.perfil_atual()::text = 'operador', false), false, false);
$$;
revoke execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean) from public, anon;
grant execute on function public.registrar_solicitacao(date, integer, text, text, text, text, numeric, text, text, boolean) to authenticated;

-- Cancelar: a secretaria e os operadores, o pedido que aguarda e o aprovado; o aprovado de uma data que já passou, não
create or replace function public.cancelar_solicitacao(p_id bigint, p_cancelada_por text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v public.solicitacoes;
begin
  if public.perfil_atual()::text is null or public.perfil_atual()::text not in ('secretaria', 'operador') then
    raise exception 'somente a secretaria e os operadores cancelam pedidos da agenda' using errcode = '42501';
  end if;
  select * into v from public.solicitacoes where id = p_id for update;
  if not found or v.cancelada_em is not null then
    raise exception 'pedido % não encontrado ou já cancelado', p_id using errcode = 'P0002';
  end if;
  if v.aprovada_em is not null and v.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'o pedido aprovado de uma data que já passou não é cancelado' using errcode = 'PT403', hint = 'passada';
  end if;
  update public.solicitacoes
  set cancelada_em = now(), cancelada_por = trim(p_cancelada_por), cancelada_usuario = auth.uid()
  where id = p_id;
end;
$$;
revoke execute on function public.cancelar_solicitacao(bigint, text) from public, anon;
grant execute on function public.cancelar_solicitacao(bigint, text) to authenticated;

-- Aprovar uma lista de pedidos (os operadores): devolve os ids aprovados agora, em ordem
create function public.aprovar_solicitacoes(p_ids bigint[])
  returns bigint[]
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_conta text;
  aprovadas bigint[];
begin
  if not coalesce(public.perfil_atual()::text = 'operador', false) then
    raise exception 'somente os operadores aprovam pedidos' using errcode = '42501', hint = 'aprovar';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    raise exception 'aprove de 1 a 200 pedidos de cada vez' using errcode = '22023', hint = 'ids';
  end if;
  v_conta := (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid());
  with feitas as (
    update public.solicitacoes
    set aprovada_em = now(), aprovada_por = coalesce(v_conta, ''), aprovada_usuario = auth.uid(),
        aprovacao_retirada_em = null, aprovacao_retirada_por = null, aprovacao_retirada_usuario = null
    where id = any(p_ids) and cancelada_em is null and aprovada_em is null and data >= (now() at time zone 'America/Sao_Paulo')::date
    returning id
  )
  select coalesce(array_agg(id order by id), '{}') into aprovadas from feitas;
  return aprovadas;
end;
$$;
revoke execute on function public.aprovar_solicitacoes(bigint[]) from public, anon;
grant execute on function public.aprovar_solicitacoes(bigint[]) to authenticated;

-- Retirar a aprovação (os operadores): o pedido volta a aguardar, e a retirada guarda quem e quando
create function public.retirar_aprovacao_da_solicitacao(p_id bigint)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v public.solicitacoes;
begin
  if not coalesce(public.perfil_atual()::text = 'operador', false) then
    raise exception 'somente os operadores retiram a aprovação de um pedido' using errcode = '42501', hint = 'aprovar';
  end if;
  select * into v from public.solicitacoes where id = p_id for update;
  if not found or v.cancelada_em is not null or v.aprovada_em is null then
    raise exception 'pedido % não encontrado, cancelado ou sem aprovação', p_id using errcode = 'P0002';
  end if;
  if v.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a aprovação de uma data que já passou não é retirada' using errcode = 'PT403', hint = 'passada';
  end if;
  update public.solicitacoes
  set aprovada_em = null, aprovada_por = null, aprovada_usuario = null,
      aprovacao_retirada_em = now(), aprovacao_retirada_usuario = auth.uid(),
      aprovacao_retirada_por = (select coalesce(nullif(p.nome, ''), u.email, '') from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid())
  where id = p_id;
end;
$$;
revoke execute on function public.retirar_aprovacao_da_solicitacao(bigint) from public, anon;
grant execute on function public.retirar_aprovacao_da_solicitacao(bigint) to authenticated;

-- Os pedidos por data, de p_de a p_ate: { "AAAA-MM-DD": { "aguardando": n, "aprovadas": n } }, sem os cancelados e sem as
-- datas sem pedidos. Com a regra de leitura da tabela: quem não lê a agenda (a TV, a conta sem perfil) recebe {}
create function public.solicitacoes_por_dia(p_de date, p_ate date)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select coalesce(jsonb_object_agg(data::text, jsonb_build_object('aguardando', aguardando, 'aprovadas', aprovadas)), '{}'::jsonb)
  from (
    select s.data, count(*) filter (where s.aprovada_em is null) as aguardando, count(*) filter (where s.aprovada_em is not null) as aprovadas
    from public.solicitacoes s
    where s.data between p_de and p_ate and s.cancelada_em is null
    group by s.data
  ) por_data;
$$;
revoke execute on function public.solicitacoes_por_dia(date, date) from public, anon;
grant execute on function public.solicitacoes_por_dia(date, date) to authenticated;

-- A conversão dos pedidos de antes da aprovação: devolve quantos aprovou. Interna (as migrações do D1 e do G2 a chamam)
create function public.aprovar_solicitacoes_de_antes_da_aprovacao(p_dos_operadores boolean)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  importados integer;
  dos_operadores integer := 0;
begin
  -- (a) O que a importação levou: numa data que já passou, todo id em "importadas"; de hoje em diante, só o que um registro
  -- da data ainda leva (o pedido principal do aluno ou uma missão extra), voando ou não
  update public.solicitacoes s
  set aprovada_em = now(), aprovada_por = 'importação anterior'
  from public.dias d
  where d.data = s.data and s.cancelada_em is null and s.aprovada_em is null and s.aprovacao_retirada_em is null
    and jsonb_typeof(d.conteudo -> 'importadas') = 'array' and d.conteudo -> 'importadas' @> to_jsonb(s.id)
    and (s.data < hoje
         or (d.conteudo -> 'pedidos' -> (s.aluno::text) ->> 'solicitacao') = s.id::text
         or exists (
           select 1 from jsonb_array_elements(case when jsonb_typeof(d.conteudo -> 'pedidos' -> (s.aluno::text) -> 'extra') = 'array'
                                                   then d.conteudo -> 'pedidos' -> (s.aluno::text) -> 'extra' else '[]'::jsonb end) e
           where (e ->> 'solicitacao') = s.id::text));
  get diagnostics importados = row_count;
  -- (b) De hoje em diante, o que um operador ou um administrador registrou e a importação não levou
  if p_dos_operadores then
    update public.solicitacoes s
    set aprovada_em = now(), aprovada_por = coalesce(s.conta, s.registrado_por), aprovada_usuario = s.usuario
    where s.cancelada_em is null and s.aprovada_em is null and s.aprovacao_retirada_em is null and s.data >= hoje
      and exists (select 1 from public.perfis p where p.usuario = s.usuario and p.perfil in ('operador', 'administrador'))
      and not exists (select 1 from public.dias d where d.data = s.data and jsonb_typeof(d.conteudo -> 'importadas') = 'array'
                        and d.conteudo -> 'importadas' @> to_jsonb(s.id));
    get diagnostics dos_operadores = row_count;
  end if;
  return importados + dos_operadores;
end;
$$;
revoke execute on function public.aprovar_solicitacoes_de_antes_da_aprovacao(boolean) from public, anon, authenticated, service_role;

select public.aprovar_solicitacoes_de_antes_da_aprovacao(true);

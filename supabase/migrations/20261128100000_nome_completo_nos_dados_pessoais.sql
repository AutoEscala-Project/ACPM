-- Passo A (a linha de produção): o nome completo nos dados pessoais, e a Secretaria só lê (o passo A2, junto com o A:
-- não há conta de Secretaria em produção, decisão 3 de 24/11).
-- - dados_pessoais.nome_completo: o nome civil inteiro do aluno ou do instrutor (1 a 120 caracteres), fora do cadastro.
--   O nome da escala (cadastro.stu[].nm, cadastro.ins[].nm, até 80) continua sendo o que o Gestor, o CSV, o PDF, o BI, a
--   TV e o histórico veem; o nome completo é dado pessoal, como o CPF.
-- - salvar_dados_pessoais (a de 5 argumentos) lê a chave nome_completo: sem a chave, fica o gravado (o app de antes do
--   passo A nunca a manda, e uma aba dele aberta não apaga o nome); vazia, apaga; com texto, grava sem os espaços das
--   pontas e com um espaço só entre as palavras; mais de 120 caracteres é recusado (22023, dica nome_completo). O
--   histórico diz "Nome completo" primeiro, só o nome do campo. A linha sai só com os seis campos vazios.
-- - grava_dados_pessoais(): quem grava dados pessoais. Operador (o administrador conta como operador); a Secretaria
--   continua lendo (le_dados_pessoais() e a política "operadores e secretaria leem" ficam como estão) e deixa de gravar:
--   a função recusa (42501).
-- - A versão de 3 argumentos sai: ela pulava a versão lida e o histórico, e nenhum app a chama desde 14/11.
-- As mesmas regras estão em JavaScript (js/dados-pessoais.js: o modo local e o servidor falso dos testes); os casos
-- de test/helpers/casos-dos-dados-pessoais.js são verificações de supabase/tests/database/dados-pessoais.test.sql.

alter table public.dados_pessoais
  add column nome_completo text check (char_length(nome_completo) between 1 and 120);

-- Quem chama grava dados pessoais? Operador e administrador (perfil_atual() devolve 'operador' para os dois)
create function public.grava_dados_pessoais()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(public.perfil_atual()::text = 'operador', false)
$$;
revoke execute on function public.grava_dados_pessoais() from public, anon;
grant execute on function public.grava_dados_pessoais() to authenticated;

create or replace function public.salvar_dados_pessoais(p_tipo text, p_id integer, p_dados jsonb, p_atualizado_em timestamptz, p_data date)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_cpf text := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '[^0-9]', '', 'g'), '');
  v_canac text := nullif(regexp_replace(coalesce(p_dados->>'canac', ''), '[^0-9]', '', 'g'), '');
  v_nascimento_texto text := nullif(trim(coalesce(p_dados->>'nascimento', '')), '');
  v_nascimento date;
  v_celular text := nullif(regexp_replace(coalesce(p_dados->>'celular', ''), '[^0-9]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_dados->>'email', ''))), '');
  -- Sem a chave, fica o gravado (lido abaixo, com a linha travada)
  v_tem_nome boolean := coalesce(p_dados ? 'nome_completo', false);
  v_nome_completo text := nullif(trim(regexp_replace(coalesce(p_dados->>'nome_completo', ''), '\s+', ' ', 'g')), '');
  v_quem text := case when p_tipo = 'aluno' then 'aluno' else 'instrutor' end;
  v_nome text;
  v_atual public.dados_pessoais;
  v_alterados text[];
  v_autor text := (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid());
  v_agora timestamptz := clock_timestamp();
  v_historico jsonb := null;
  v_descricao text;
  v_id bigint;
begin
  if not public.grava_dados_pessoais() then
    raise exception 'somente operadores e administradores alteram dados pessoais' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('aluno', 'instrutor') or p_id is null or p_id <= 0 then
    raise exception 'aluno ou instrutor inválido' using errcode = '22023';
  end if;

  -- A pessoa no cadastro (o nome vai para o histórico)
  select left(p ->> 'nm', 80) into v_nome
  from public.documentos d, jsonb_array_elements(case when jsonb_typeof(d.conteudo -> (case when p_tipo = 'aluno' then 'stu' else 'ins' end)) = 'array'
    then d.conteudo -> (case when p_tipo = 'aluno' then 'stu' else 'ins' end) else '[]'::jsonb end) p
  where d.chave = 'cadastro' and p ->> 'id' = p_id::text
  limit 1;
  if not found then
    raise exception '% que não está no cadastro', v_quem using errcode = 'P0002';
  end if;

  if v_nome_completo is not null and char_length(v_nome_completo) > 120 then
    raise exception 'o nome completo tem no máximo 120 caracteres' using errcode = '22023', hint = 'nome_completo';
  end if;
  if v_cpf is not null and not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido' using errcode = '22023', hint = 'cpf';
  end if;
  if v_canac is not null and v_canac !~ '^[0-9]{6}$' then
    raise exception 'o CANAC tem 6 dígitos' using errcode = '22023', hint = 'canac';
  end if;
  if v_nascimento_texto is not null then
    if v_nascimento_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'data de nascimento inválida' using errcode = '22023', hint = 'nascimento';
    end if;
    begin
      v_nascimento := v_nascimento_texto::date;
    exception when others then
      raise exception 'data de nascimento inválida' using errcode = '22023', hint = 'nascimento';
    end;
    if v_nascimento < date '1900-01-01' or v_nascimento > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'data de nascimento inválida' using errcode = '22023', hint = 'nascimento';
    end if;
  end if;
  if v_celular is not null and v_celular !~ '^[1-9]{2}9[0-9]{8}$' then
    raise exception 'celular inválido (DDD e 9 dígitos)' using errcode = '22023', hint = 'celular';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'e-mail inválido' using errcode = '22023', hint = 'email';
  end if;
  if v_cpf is not null and exists (select 1 from public.dados_pessoais where tipo = p_tipo and cpf = v_cpf and id_cadastro <> p_id) then
    raise exception 'CPF já cadastrado para outro %', v_quem using errcode = '23505', hint = 'cpf';
  end if;
  if v_canac is not null and exists (select 1 from public.dados_pessoais where tipo = p_tipo and canac = v_canac and id_cadastro <> p_id) then
    raise exception 'CANAC já cadastrado para outro %', v_quem using errcode = '23505', hint = 'canac';
  end if;

  -- A versão lida: a linha travada até o fim da gravação
  select * into v_atual from public.dados_pessoais where tipo = p_tipo and id_cadastro = p_id for update;
  if v_atual.atualizado_em is distinct from p_atualizado_em then
    raise exception 'os dados pessoais foram alterados por outra pessoa; abra de novo para ver a versão atual' using errcode = 'PT409';
  end if;
  if not v_tem_nome then
    v_nome_completo := v_atual.nome_completo;
  end if;

  -- Os campos que mudaram, na ordem da tela
  v_alterados := array_remove(array[
    case when v_atual.nome_completo is distinct from v_nome_completo then 'Nome completo' end,
    case when v_atual.cpf is distinct from v_cpf then 'CPF' end,
    case when v_atual.canac is distinct from v_canac then 'CANAC' end,
    case when v_atual.nascimento is distinct from v_nascimento then 'Nascimento' end,
    case when v_atual.celular is distinct from v_celular then 'Celular' end,
    case when v_atual.email is distinct from v_email then 'E-mail' end], null);

  if v_nome_completo is null and v_cpf is null and v_canac is null and v_nascimento is null and v_celular is null and v_email is null then
    delete from public.dados_pessoais where tipo = p_tipo and id_cadastro = p_id;
    v_agora := null;
  else
    insert into public.dados_pessoais (tipo, id_cadastro, nome_completo, cpf, canac, nascimento, celular, email, atualizado_em, atualizado_por)
    values (p_tipo, p_id, v_nome_completo, v_cpf, v_canac, v_nascimento, v_celular, v_email, v_agora, v_autor)
    on conflict (tipo, id_cadastro) do update set
      nome_completo = excluded.nome_completo, cpf = excluded.cpf, canac = excluded.canac, nascimento = excluded.nascimento,
      celular = excluded.celular, email = excluded.email, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
  end if;

  if cardinality(v_alterados) > 0 then
    v_descricao := left(format('Dados pessoais de %s atualizados: %s', coalesce(nullif(v_nome, ''), v_quem), array_to_string(v_alterados, ', ')), 500);
    insert into public.historico (data, usuario, autor, tipo, descricao)
    values (coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), auth.uid(), v_autor, 'mod', v_descricao)
    returning id into v_id;
    v_historico := jsonb_build_object('id', v_id, 'descricao', v_descricao);
  end if;
  return jsonb_build_object('atualizado_em', v_agora, 'atualizado_por', v_autor, 'historico', v_historico);
end;
$$;
revoke execute on function public.salvar_dados_pessoais(text, integer, jsonb, timestamptz, date) from public, anon;
grant execute on function public.salvar_dados_pessoais(text, integer, jsonb, timestamptz, date) to authenticated;

-- A versão antiga (sem a versão lida e sem o histórico) sai: a Secretaria gravaria por ela
drop function public.salvar_dados_pessoais(text, integer, jsonb);

comment on table public.dados_pessoais is 'Dados pessoais de alunos e instrutores (pelo id do cadastro): o nome completo, o CPF, o CANAC, o nascimento, o celular e o e-mail. Operadores, administradores e a secretaria leem; só operadores e administradores gravam, e só por public.salvar_dados_pessoais.';
comment on function public.salvar_dados_pessoais(text, integer, jsonb, timestamptz, date) is 'Grava os dados pessoais de um aluno ou instrutor a partir da versão lida (operadores e administradores); sem a chave nome_completo, o nome completo gravado fica.';

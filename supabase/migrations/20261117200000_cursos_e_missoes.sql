-- O programa de cada curso em tabelas próprias: cursos, fases e missões, com a regra de cada fase e de cada missão
-- ("depois das anteriores", "livre" ou "depois de…") e o histórico das versões. Quem lê a escala lê os cursos; só o
-- Administrador grava, por public.salvar_curso. A conversão única do programa guardado no cadastro (public.importar_cursos)
-- vale só antes de o cadastro chegar ao formato dos cursos (public.formato_dos_cursos(), logo abaixo).
-- - A sigla do curso não muda (renomear muda o nome) e o curso nunca é apagado: encerrar desativa. As fases e as
--   missões têm um id (uuid, criado pelo app) e saem do programa sem ser apagadas (removida): a missão retirada guarda o
--   código, que não volta para outra missão, e o código de uma missão com resultados não muda.
-- - A gravação é do curso inteiro, a partir da versão lida (outra pessoa gravou antes: PT409), e cada gravação fica em
--   versoes_dos_cursos, com a descrição, quem gravou e o curso como ficou.
-- - O resultado de uma missão vale para qualquer curso cadastrado: a tabela confere só o formato da sigla, e
--   registrar_resultado recusa o curso desconhecido (23514).
-- - O app anterior (de antes do formato dos cursos) não chama nada disto e continua como está: PP, PC e INVA já vêm
--   prontos, e os resultados deles são aceitos como antes.

-- O formato dos cursos: o formato do cadastro a partir do qual os programas vivem nas tabelas próprias. Antes dele, as
-- tabelas são só o espelho do programa guardado no cadastro (importar_cursos o traz, e salvar_curso espera); dele em
-- diante, só salvar_curso grava. É o FORMATO_DOS_CURSOS do app (test/unit/espelho-do-banco.test.js confere). Se outro
-- formato chegar antes com este número, o aumento é só a linha do número, abaixo, e a da constante
create function public.formato_dos_cursos()
  returns integer
  language sql
  immutable
  set search_path = ''
as $$
  select 23
$$;
revoke execute on function public.formato_dos_cursos() from public, anon, authenticated;

-- O tipo de missão, o recurso e as horas de uma missão do programa, como em js/config.js (MIS): o Ground é na Sala Ground,
-- com 1,5 h, e as horas vão até 5. test/unit/espelho-do-banco.test.js confere que a lista é a mesma do app
create function public.missao_e_recurso_validos(p_mis text, p_eq text, p_nb numeric)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select case p_mis
    when 'Ground C152' then p_eq = 'Sala Ground' and p_nb = 1.5
    when 'Ground C172' then p_eq = 'Sala Ground' and p_nb = 1.5
    when 'Ground PA-34' then p_eq = 'Sala Ground' and p_nb = 1.5
    when 'Ground Navegação' then p_eq = 'Sala Ground' and p_nb = 1.5
    when 'Simulador' then p_eq in ('Sim. Mono', 'Sim. Multi')
    when 'Voo Local' then p_eq in ('C152', 'C172', 'PA-34')
    when 'TGL (TMA)' then p_eq in ('C152', 'C172', 'PA-34')
    when 'Navegação' then p_eq in ('C152', 'C172', 'PA-34')
    when 'Voo Solo' then p_eq in ('C152', 'C172', 'PA-34')
    when 'Parafuso' then p_eq in ('C152', 'C172', 'PA-34')
    when 'IFR' then p_eq in ('C172', 'PA-34')
    when 'Noturno' then p_eq = 'C172'
    when 'Multimotor' then p_eq = 'PA-34'
    when 'Cheque PP' then p_eq in ('C152', 'C172')
    when 'Cheque PC MNTE VFR' then p_eq in ('C152', 'C172')
    when 'Cheque PC MNTE IFR' then p_eq = 'C172'
    when 'Cheque PC MLTE VFR' then p_eq = 'PA-34'
    when 'Cheque PC MLTE IFR' then p_eq = 'PA-34'
    else false end and p_nb > 0 and p_nb <= 5
$$;
revoke execute on function public.missao_e_recurso_validos(text, text, numeric) from public, anon, authenticated;

-- Cursos, fases e missões ------------------------------------------------------------------------------------------
create table public.cursos (
  sigla text primary key check (sigla ~ '^[A-Z][A-Z0-9-]{0,8}[A-Z0-9]$'),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  ordem integer not null default 0 check (ordem between 0 and 999),
  ativo boolean not null default true,
  versao integer not null default 1 check (versao > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
comment on table public.cursos is 'Os cursos (a sigla não muda; encerrar desativa, nada é apagado). Gravação somente por public.salvar_curso e, na conversão do cadastro, public.importar_cursos.';

create table public.fases_do_curso (
  id uuid primary key,
  curso text not null references public.cursos (sigla),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  modulo text check (modulo is null or char_length(btrim(modulo)) between 1 and 80),
  ordem integer not null check (ordem between 0 and 999),
  regra text not null default 'ordem' check (regra in ('ordem', 'livre', 'depois')),
  removida boolean not null default false,
  unique (id, curso)
);
comment on table public.fases_do_curso is 'As fases do programa de cada curso, em ordem, com a regra de quando abrem. A fase retirada continua na tabela (removida). Gravação somente pelas funções dos cursos.';

create table public.missoes_do_curso (
  id uuid primary key,
  curso text not null references public.cursos (sigla),
  fase uuid not null,
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  tipo_de_missao text not null,
  recurso text not null,
  horas numeric(2,1) not null,
  ordem integer not null check (ordem between 0 and 999),
  regra text not null default 'ordem' check (regra in ('ordem', 'livre', 'depois')),
  dispensada boolean not null default false,
  avaliacao boolean not null default false,
  removida boolean not null default false,
  unique (id, curso),
  -- Adiada até o fim da transação: dois códigos trocam de missão numa gravação só
  constraint missoes_do_curso_codigo_unico unique (curso, codigo) deferrable initially deferred,
  foreign key (fase, curso) references public.fases_do_curso (id, curso),
  check (public.missao_e_recurso_validos(tipo_de_missao, recurso, horas))
);
comment on table public.missoes_do_curso is 'As missões do programa de cada curso. O código não se repete no curso (nem com as retiradas, que continuam na tabela) e não muda depois de um resultado. Gravação somente pelas funções dos cursos.';

-- "Depois de…": os itens que uma fase (ou uma missão) espera, sempre do mesmo curso e anteriores no programa
create table public.requisitos_das_fases (
  curso text not null,
  fase uuid not null,
  requer uuid not null,
  primary key (fase, requer),
  check (fase <> requer),
  foreign key (fase, curso) references public.fases_do_curso (id, curso),
  foreign key (requer, curso) references public.fases_do_curso (id, curso)
);
comment on table public.requisitos_das_fases is 'As fases que uma fase "depois de…" espera. Gravação somente pelas funções dos cursos.';

create table public.requisitos_das_missoes (
  curso text not null,
  missao uuid not null,
  requer uuid not null,
  primary key (missao, requer),
  check (missao <> requer),
  foreign key (missao, curso) references public.missoes_do_curso (id, curso),
  foreign key (requer, curso) references public.missoes_do_curso (id, curso)
);
comment on table public.requisitos_das_missoes is 'As missões que uma missão "depois de…" espera. Gravação somente pelas funções dos cursos.';

-- Cada gravação do programa de um curso (só cresce)
create table public.versoes_dos_cursos (
  id bigint generated always as identity primary key,
  curso text not null references public.cursos (sigla),
  versao integer not null,
  descricao text not null check (char_length(descricao) between 1 and 500),
  conteudo jsonb not null,            -- o curso depois da gravação (para um "desfazer" futuro)
  registrado_em timestamptz not null default now(),
  registrado_por text,
  unique (curso, versao)
);
comment on table public.versoes_dos_cursos is 'As versões do programa de cada curso: a descrição da alteração, quem gravou e o curso como ficou. Gravação somente pelas funções dos cursos.';

create index fases_do_curso_por_curso on public.fases_do_curso (curso, ordem);
create index missoes_do_curso_por_fase on public.missoes_do_curso (fase, ordem);
create index versoes_dos_cursos_por_curso on public.versoes_dos_cursos (curso, id desc);
create index resultados_de_missao_por_codigo on public.resultados_de_missao (curso, missao);

-- Quem lê a escala lê os cursos; ninguém grava direto nas tabelas (só pelas funções abaixo)
alter table public.cursos enable row level security;
revoke all on public.cursos from anon;
revoke insert, update, delete, truncate on public.cursos from authenticated;
create policy "quem lê a escala lê os cursos" on public.cursos
  for select to authenticated
  using ((select public.le_a_escala()));

alter table public.fases_do_curso enable row level security;
revoke all on public.fases_do_curso from anon;
revoke insert, update, delete, truncate on public.fases_do_curso from authenticated;
create policy "quem lê a escala lê as fases" on public.fases_do_curso
  for select to authenticated
  using ((select public.le_a_escala()));

alter table public.missoes_do_curso enable row level security;
revoke all on public.missoes_do_curso from anon;
revoke insert, update, delete, truncate on public.missoes_do_curso from authenticated;
create policy "quem lê a escala lê as missões" on public.missoes_do_curso
  for select to authenticated
  using ((select public.le_a_escala()));

alter table public.requisitos_das_fases enable row level security;
revoke all on public.requisitos_das_fases from anon;
revoke insert, update, delete, truncate on public.requisitos_das_fases from authenticated;
create policy "quem lê a escala lê os requisitos" on public.requisitos_das_fases
  for select to authenticated
  using ((select public.le_a_escala()));

alter table public.requisitos_das_missoes enable row level security;
revoke all on public.requisitos_das_missoes from anon;
revoke insert, update, delete, truncate on public.requisitos_das_missoes from authenticated;
create policy "quem lê a escala lê os requisitos" on public.requisitos_das_missoes
  for select to authenticated
  using ((select public.le_a_escala()));

alter table public.versoes_dos_cursos enable row level security;
revoke all on public.versoes_dos_cursos from anon;
revoke insert, update, delete, truncate on public.versoes_dos_cursos from authenticated;
create policy "quem lê a escala lê as versões" on public.versoes_dos_cursos
  for select to authenticated
  using ((select public.le_a_escala()));

-- Os três cursos de hoje, sem programa (a conversão do cadastro traz as missões)
insert into public.cursos (sigla, nome, ordem) values ('PP', 'Piloto Privado', 0), ('PC', 'Piloto Comercial', 1), ('INVA', 'Instrutor de Voo', 2);

-- Funções internas (só as funções abaixo chamam) -------------------------------------------------------------------

-- Um curso no formato do app: as fases e as missões em ordem (as retiradas no fim, com removida), os requisitos de cada
-- uma, se a missão já tem resultados (comResultados) e as últimas 20 alterações do programa
create function public.programa_do_curso(p_sigla text)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'sigla', c.sigla, 'nome', c.nome, 'ordem', c.ordem, 'ativo', c.ativo, 'versao', c.versao,
    'fases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'modulo', f.modulo, 'ordem', f.ordem, 'regra', f.regra,
        'requer', coalesce((select jsonb_agg(r.requer order by g.ordem, r.requer)
          from public.requisitos_das_fases r join public.fases_do_curso g on g.id = r.requer where r.fase = f.id), '[]'::jsonb),
        'removida', f.removida) order by f.removida, f.ordem, f.id)
      from public.fases_do_curso f where f.curso = c.sigla), '[]'::jsonb),
    'missoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'fase', m.fase, 'codigo', m.codigo, 'nome', m.nome, 'mis', m.tipo_de_missao, 'eq', m.recurso, 'nb', m.horas,
        'ordem', m.ordem, 'regra', m.regra,
        'requer', coalesce((select jsonb_agg(r.requer order by gf.ordem, g.ordem, r.requer)
          from public.requisitos_das_missoes r join public.missoes_do_curso g on g.id = r.requer
          join public.fases_do_curso gf on gf.id = g.fase where r.missao = m.id), '[]'::jsonb),
        'dispensada', m.dispensada, 'avaliacao', m.avaliacao, 'removida', m.removida,
        -- Os códigos com resultados, numa consulta só (pelo índice de curso e missão)
        'comResultados', m.codigo in (select x.missao from public.resultados_de_missao x where x.curso = p_sigla))
        order by m.removida, f.ordem, m.ordem, m.id)
      from public.missoes_do_curso m join public.fases_do_curso f on f.id = m.fase where m.curso = c.sigla), '[]'::jsonb),
    'alteracoes', coalesce((
      select jsonb_agg(jsonb_build_object('versao', v.versao, 'descricao', v.descricao, 'registrado_em', v.registrado_em,
        'registrado_por', v.registrado_por) order by v.id desc)
      from (select * from public.versoes_dos_cursos where curso = c.sigla order by id desc limit 20) v), '[]'::jsonb))
  from public.cursos c where c.sigla = p_sigla
$$;
revoke execute on function public.programa_do_curso(text) from public, anon, authenticated;

-- As missões do programa (código, nome, tipo, recurso e horas), na ordem do curso, sem as retiradas: compara o programa
-- trazido do cadastro com o guardado (o mesmo programa não é gravado de novo)
create function public.assinatura_do_programa(p_curso jsonb)
  returns jsonb
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(m.e -> 'codigo', m.e -> 'nome', m.e -> 'mis', m.e -> 'eq',
      case when jsonb_typeof(m.e -> 'nb') = 'number' then to_jsonb(round((m.e ->> 'nb')::numeric, 1)) else m.e -> 'nb' end)
    order by f.i, m.i), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_curso -> 'fases') = 'array' then p_curso -> 'fases' else '[]'::jsonb end)
    with ordinality f(e, i)
  join jsonb_array_elements(case when jsonb_typeof(p_curso -> 'missoes') = 'array' then p_curso -> 'missoes' else '[]'::jsonb end)
    with ordinality m(e, i) on m.e -> 'fase' = f.e -> 'id'
  where f.e -> 'removida' is distinct from 'true'::jsonb and m.e -> 'removida' is distinct from 'true'::jsonb
$$;
revoke execute on function public.assinatura_do_programa(jsonb) from public, anon, authenticated;

-- Confere e grava o programa de um curso (as fases e as missões do conteúdo, na ordem das listas). As linhas marcadas
-- com removida ficam de fora, como as que não vêm: o que vem é o programa. p_substituir (só na conversão do cadastro)
-- apaga o programa guardado e grava o novo; senão, grava por id: o que não veio sai do programa, sem ser apagado.
-- Cada recusa traz o campo na dica. Devolve o número de missões do programa
create function public.gravar_programa(p_sigla text, p_curso jsonb, p_substituir boolean)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_fases jsonb := p_curso -> 'fases';
  v_missoes jsonb := p_curso -> 'missoes';
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_codigo text;
begin
  -- 1. Listas de objetos (sempre as duas: sem elas, o programa inteiro sairia); no máximo 50 fases e 200 missões
  if jsonb_typeof(v_fases) is distinct from 'array' or jsonb_typeof(v_missoes) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(v_fases) e where jsonb_typeof(e) <> 'object')
     or exists (select 1 from jsonb_array_elements(v_missoes) e where jsonb_typeof(e) <> 'object') then
    raise exception 'as fases e as missões do programa vão em listas' using errcode = '22023', hint = 'limite';
  end if;
  v_fases := coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(v_fases) with ordinality t(e, i)
    where e -> 'removida' is distinct from 'true'::jsonb), '[]'::jsonb);
  v_missoes := coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(v_missoes) with ordinality t(e, i)
    where e -> 'removida' is distinct from 'true'::jsonb), '[]'::jsonb);
  if jsonb_array_length(v_fases) > 50 or jsonb_array_length(v_missoes) > 200 then
    raise exception 'o programa tem no máximo 50 fases e 200 missões' using errcode = '22023', hint = 'limite';
  end if;

  -- 2. Os ids: uuid em minúsculas, sem repetir no programa e de nenhum outro curso (antes de gravar qualquer coisa)
  if exists (select 1 from (select e -> 'id' as id from jsonb_array_elements(v_fases) e
                            union all select e -> 'id' from jsonb_array_elements(v_missoes) e) x
             where jsonb_typeof(x.id) is distinct from 'string' or (x.id #>> '{}') !~ v_uuid) then
    raise exception 'cada fase e cada missão do programa têm um id (uuid)' using errcode = '22023', hint = 'id';
  end if;
  if exists (select 1 from (select e -> 'id' as id from jsonb_array_elements(v_fases) e
                            union all select e -> 'id' from jsonb_array_elements(v_missoes) e) x
             group by x.id having count(*) > 1) then
    raise exception 'o mesmo id aparece mais de uma vez no programa' using errcode = '22023', hint = 'id';
  end if;
  if exists (select 1 from jsonb_array_elements(v_fases) e join public.fases_do_curso f on f.id = (e ->> 'id')::uuid where f.curso <> p_sigla)
     or exists (select 1 from jsonb_array_elements(v_missoes) e join public.missoes_do_curso m on m.id = (e ->> 'id')::uuid where m.curso <> p_sigla) then
    raise exception 'o programa do curso % traz uma fase ou uma missão de outro curso', p_sigla using errcode = '22023', hint = 'id';
  end if;

  -- 3. Os campos, um de cada vez (o módulo, a regra, os requisitos, "dispensada" e "avaliação" podem faltar: sem módulo,
  -- "depois das anteriores", nenhum, não e não)
  if exists (select 1 from jsonb_array_elements(v_fases) e
             where jsonb_typeof(e -> 'nome') is distinct from 'string' or char_length(btrim(e ->> 'nome')) not between 1 and 80) then
    raise exception 'o nome da fase vai de 1 a 80 caracteres' using errcode = '22023', hint = 'nome';
  end if;
  if exists (select 1 from jsonb_array_elements(v_fases) e
             where coalesce(jsonb_typeof(e -> 'modulo'), 'null') <> 'null'
               and (jsonb_typeof(e -> 'modulo') <> 'string' or char_length(btrim(e ->> 'modulo')) not between 1 and 80)) then
    raise exception 'o módulo da fase vai de 1 a 80 caracteres' using errcode = '22023', hint = 'modulo';
  end if;
  if exists (select 1 from jsonb_array_elements(v_fases) e where coalesce(e ->> 'regra', 'ordem') not in ('ordem', 'livre', 'depois')) then
    raise exception 'a regra da fase é "ordem", "livre" ou "depois"' using errcode = '22023', hint = 'regra';
  end if;
  if exists (select 1 from jsonb_array_elements(v_missoes) e
             where not exists (select 1 from jsonb_array_elements(v_fases) f where f -> 'id' = e -> 'fase')) then
    raise exception 'cada missão fica numa fase do programa' using errcode = '22023', hint = 'fase';
  end if;
  select coalesce(e ->> 'codigo', '') into v_codigo from jsonb_array_elements(v_missoes) e
  where jsonb_typeof(e -> 'codigo') is distinct from 'string' or e ->> 'codigo' !~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'
  limit 1;
  if found then
    raise exception 'código de missão inválido: "%" (letras maiúsculas, números, ponto e hífen, até 15)', v_codigo
      using errcode = '22023', hint = 'codigo';
  end if;
  if exists (select 1 from jsonb_array_elements(v_missoes) e
             where jsonb_typeof(e -> 'nome') is distinct from 'string' or char_length(btrim(e ->> 'nome')) not between 1 and 80) then
    raise exception 'o nome da missão vai de 1 a 80 caracteres' using errcode = '22023', hint = 'nome';
  end if;
  select e ->> 'codigo' into v_codigo from jsonb_array_elements(v_missoes) e
  where case when jsonb_typeof(e -> 'nb') = 'number'
          then public.missao_e_recurso_validos(e ->> 'mis', e ->> 'eq', round((e ->> 'nb')::numeric, 1)) is not true
          else true end
  limit 1;
  if found then
    raise exception 'a missão % não serve com esse recurso ou essas horas (o Ground é na Sala Ground, com 1,5 h; até 5 h)', v_codigo
      using errcode = '22023', hint = 'mis';
  end if;
  if exists (select 1 from jsonb_array_elements(v_missoes) e where coalesce(e ->> 'regra', 'ordem') not in ('ordem', 'livre', 'depois')) then
    raise exception 'a regra da missão é "ordem", "livre" ou "depois"' using errcode = '22023', hint = 'regra';
  end if;
  if exists (select 1 from jsonb_array_elements(v_missoes) e where coalesce(jsonb_typeof(e -> 'dispensada'), 'null') not in ('null', 'boolean')) then
    raise exception '"dispensada" é sim ou não' using errcode = '22023', hint = 'dispensada';
  end if;
  if exists (select 1 from jsonb_array_elements(v_missoes) e where coalesce(jsonb_typeof(e -> 'avaliacao'), 'null') not in ('null', 'boolean')) then
    raise exception '"avaliação" é sim ou não' using errcode = '22023', hint = 'avaliacao';
  end if;

  -- 4. Os códigos não se repetem no programa nem com os das missões do curso que ficam fora dele (a retirada guarda o
  -- código); a restrição adiada da tabela é a rede de segurança
  select e ->> 'codigo' into v_codigo from jsonb_array_elements(v_missoes) e
  group by e ->> 'codigo' having count(*) > 1 order by 1 limit 1;
  if found then
    raise exception 'o código % aparece mais de uma vez no programa', v_codigo using errcode = '23505', hint = 'codigo';
  end if;
  if not p_substituir then
    select m.codigo into v_codigo from public.missoes_do_curso m
    where m.curso = p_sigla
      and not exists (select 1 from jsonb_array_elements(v_missoes) e where (e ->> 'id')::uuid = m.id)
      and exists (select 1 from jsonb_array_elements(v_missoes) e where e ->> 'codigo' = m.codigo)
    order by m.codigo limit 1;
    if found then
      raise exception 'o código % já é de outra missão do curso (a missão retirada guarda o código: volte com ela ao programa)', v_codigo
        using errcode = '23505', hint = 'codigo';
    end if;
  end if;

  -- 5. "Depois de…": ids do programa, do mesmo tipo, sem repetir e sempre anteriores (nunca o próprio item); e a regra
  -- "depois" tem pelo menos um, as outras nenhum
  if exists (
    select 1 from jsonb_array_elements(v_fases) with ordinality f(e, i)
    cross join lateral (select case when jsonb_typeof(f.e -> 'requer') = 'array' then f.e -> 'requer' else '[]'::jsonb end as lista) r
    where coalesce(jsonb_typeof(f.e -> 'requer'), 'null') not in ('null', 'array')
       or (coalesce(f.e ->> 'regra', 'ordem') = 'depois') <> (jsonb_array_length(r.lista) > 0)
       or exists (select 1 from jsonb_array_elements(r.lista) x
                  where not exists (select 1 from jsonb_array_elements(v_fases) with ordinality g(e, j) where g.e -> 'id' = x and g.j < f.i))
       or (select count(*) <> count(distinct x) from jsonb_array_elements(r.lista) x)) then
    raise exception 'uma fase "depois de…" espera fases anteriores do programa (e só ela espera)' using errcode = '22023', hint = 'requer';
  end if;
  if exists (
    with fases as (select f.e -> 'id' as id, f.i from jsonb_array_elements(v_fases) with ordinality f(e, i)),
    missoes as (
      select m.e, m.e -> 'id' as id, fa.i as fase, row_number() over (partition by fa.i order by m.i) as i
      from jsonb_array_elements(v_missoes) with ordinality m(e, i) join fases fa on fa.id = m.e -> 'fase')
    select 1 from missoes m
    cross join lateral (select case when jsonb_typeof(m.e -> 'requer') = 'array' then m.e -> 'requer' else '[]'::jsonb end as lista) r
    where coalesce(jsonb_typeof(m.e -> 'requer'), 'null') not in ('null', 'array')
       or (coalesce(m.e ->> 'regra', 'ordem') = 'depois') <> (jsonb_array_length(r.lista) > 0)
       or exists (select 1 from jsonb_array_elements(r.lista) x
                  where not exists (select 1 from missoes n where n.id = x and (n.fase, n.i) < (m.fase, m.i)))
       or (select count(*) <> count(distinct x) from jsonb_array_elements(r.lista) x)) then
    raise exception 'uma missão "depois de…" espera missões anteriores do programa (e só ela espera)' using errcode = '22023', hint = 'requer';
  end if;

  -- 6. O código de uma missão com resultados não muda (o nome muda)
  if not p_substituir then
    select m.codigo into v_codigo from public.missoes_do_curso m join jsonb_array_elements(v_missoes) e on (e ->> 'id')::uuid = m.id
    where m.curso = p_sigla and m.codigo <> e ->> 'codigo'
      and exists (select 1 from public.resultados_de_missao r where r.curso = p_sigla and r.missao = m.codigo)
    order by m.codigo limit 1;
    if found then
      raise exception 'a missão % já tem resultados: o código não muda (o nome muda)', v_codigo using errcode = '23514', hint = 'codigo';
    end if;
  end if;

  -- 7. A gravação. Os requisitos são refeitos (as únicas linhas apagadas, fora da conversão)
  delete from public.requisitos_das_missoes where curso = p_sigla;
  delete from public.requisitos_das_fases where curso = p_sigla;
  -- 8. Na conversão do cadastro, o programa guardado sai inteiro (nada aponta para ele ainda)
  if p_substituir then
    delete from public.missoes_do_curso where curso = p_sigla;
    delete from public.fases_do_curso where curso = p_sigla;
  end if;
  insert into public.fases_do_curso as f (id, curso, nome, modulo, ordem, regra, removida)
  select (e ->> 'id')::uuid, p_sigla, e ->> 'nome', e ->> 'modulo', (i - 1)::integer, coalesce(e ->> 'regra', 'ordem'), false
  from jsonb_array_elements(v_fases) with ordinality t(e, i)
  on conflict (id) do update set nome = excluded.nome, modulo = excluded.modulo, ordem = excluded.ordem, regra = excluded.regra,
    removida = false
  where f.curso = p_sigla;
  insert into public.missoes_do_curso as m (id, curso, fase, codigo, nome, tipo_de_missao, recurso, horas, ordem, regra, dispensada,
    avaliacao, removida)
  select (e ->> 'id')::uuid, p_sigla, (e ->> 'fase')::uuid, e ->> 'codigo', e ->> 'nome', e ->> 'mis', e ->> 'eq',
    round((e ->> 'nb')::numeric, 1), (row_number() over (partition by e ->> 'fase' order by i) - 1)::integer,
    coalesce(e ->> 'regra', 'ordem'), coalesce((e ->> 'dispensada')::boolean, false), coalesce((e ->> 'avaliacao')::boolean, false), false
  from jsonb_array_elements(v_missoes) with ordinality t(e, i)
  on conflict (id) do update set fase = excluded.fase, codigo = excluded.codigo, nome = excluded.nome,
    tipo_de_missao = excluded.tipo_de_missao, recurso = excluded.recurso, horas = excluded.horas, ordem = excluded.ordem,
    regra = excluded.regra, dispensada = excluded.dispensada, avaliacao = excluded.avaliacao, removida = false
  where m.curso = p_sigla;
  -- O que não veio sai do programa, sem ser apagado
  update public.fases_do_curso f set removida = true
  where f.curso = p_sigla and not f.removida
    and not exists (select 1 from jsonb_array_elements(v_fases) e where (e ->> 'id')::uuid = f.id);
  update public.missoes_do_curso m set removida = true
  where m.curso = p_sigla and not m.removida
    and not exists (select 1 from jsonb_array_elements(v_missoes) e where (e ->> 'id')::uuid = m.id);
  insert into public.requisitos_das_fases (curso, fase, requer)
  select p_sigla, (e ->> 'id')::uuid, (x #>> '{}')::uuid
  from jsonb_array_elements(v_fases) e, jsonb_array_elements(case when jsonb_typeof(e -> 'requer') = 'array' then e -> 'requer' else '[]'::jsonb end) x;
  insert into public.requisitos_das_missoes (curso, missao, requer)
  select p_sigla, (e ->> 'id')::uuid, (x #>> '{}')::uuid
  from jsonb_array_elements(v_missoes) e, jsonb_array_elements(case when jsonb_typeof(e -> 'requer') = 'array' then e -> 'requer' else '[]'::jsonb end) x;
  return jsonb_array_length(v_missoes);
end;
$$;
revoke execute on function public.gravar_programa(text, jsonb, boolean) from public, anon, authenticated;

-- Funções do app ----------------------------------------------------------------------------------------------------

-- Os programas de todos os cursos (os encerrados também), num documento só (sem o limite de linhas da API). Quem não lê
-- a escala recebe a lista vazia
create function public.programa_dos_cursos()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case when public.le_a_escala()
    then coalesce((select jsonb_agg(public.programa_do_curso(c.sigla) order by c.ordem, c.sigla) from public.cursos c), '[]'::jsonb)
    else '[]'::jsonb end
$$;
revoke execute on function public.programa_dos_cursos() from public, anon;
grant execute on function public.programa_dos_cursos() to authenticated;

-- Grava o curso inteiro (o nome, se está ativo e o programa) a partir da versão lida; p_versao_lida = 0 cria o curso.
-- Só o Administrador, e só com o cadastro já no formato dos cursos (depois da conversão). Devolve a versão nova e a
-- hora da gravação
create function public.salvar_curso(p_sigla text, p_versao_lida integer, p_curso jsonb, p_descricao text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_autor text := (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid());
  v_agora timestamptz := clock_timestamp();
  v_versao integer;
begin
  if not public.administrador_atual() then
    raise exception 'somente o Administrador altera os cursos' using errcode = '42501';
  end if;
  -- Antes do formato dos cursos, as tabelas são só o espelho do programa guardado no cadastro: a conversão pode
  -- refazê-las
  if exists (select 1 from public.documentos
             where chave = 'cadastro' and public.esquema_do_conteudo(conteudo) < public.formato_dos_cursos()) then
    raise exception 'os programas ainda estão sendo trazidos do cadastro; recarregue a página' using errcode = 'PT409', hint = 'formato';
  end if;
  if coalesce(char_length(p_descricao), 0) not between 1 and 500 then
    raise exception 'a descrição da alteração vai de 1 a 500 caracteres' using errcode = '22023', hint = 'descricao';
  end if;
  if jsonb_typeof(p_curso) is distinct from 'object' then
    raise exception 'o curso vai num objeto' using errcode = '22023', hint = 'limite';
  end if;
  if jsonb_typeof(p_curso -> 'nome') is distinct from 'string' or char_length(btrim(p_curso ->> 'nome')) not between 1 and 80 then
    raise exception 'o nome do curso vai de 1 a 80 caracteres' using errcode = '22023', hint = 'nome';
  end if;
  if jsonb_typeof(p_curso -> 'ativo') is distinct from 'boolean' then
    raise exception 'o curso está ativo ou encerrado (sim ou não)' using errcode = '22023', hint = 'ativo';
  end if;

  if p_versao_lida = 0 then
    if p_sigla is null or p_sigla !~ '^[A-Z][A-Z0-9-]{0,8}[A-Z0-9]$' then
      raise exception 'a sigla do curso tem de 2 a 10 caracteres: letras maiúsculas, números e hífen, começando por letra' using errcode = '22023', hint = 'sigla';
    end if;
    insert into public.cursos (sigla, nome, ordem, ativo, versao, atualizado_em, atualizado_por)
    values (p_sigla, p_curso ->> 'nome', (select least(coalesce(max(ordem) + 1, 0), 999) from public.cursos),
      (p_curso ->> 'ativo')::boolean, 1, v_agora, v_autor)
    on conflict (sigla) do nothing
    returning versao into v_versao;
    if v_versao is null then
      raise exception 'o curso % já existe', p_sigla using errcode = 'PT409', hint = 'sigla';
    end if;
    perform public.gravar_programa(p_sigla, p_curso, false);
  else
    -- A versão lida: o curso travado até o fim da gravação
    select versao into v_versao from public.cursos where sigla = p_sigla for update;
    if not found then
      raise exception 'o curso % não existe', p_sigla using errcode = 'P0002';
    end if;
    if v_versao is distinct from p_versao_lida then
      raise exception 'o programa do curso % foi alterado por outra pessoa', p_sigla using errcode = 'PT409';
    end if;
    perform public.gravar_programa(p_sigla, p_curso, false);
    update public.cursos set nome = p_curso ->> 'nome', ativo = (p_curso ->> 'ativo')::boolean, versao = versao + 1,
      atualizado_em = v_agora, atualizado_por = v_autor
    where sigla = p_sigla
    returning versao into v_versao;
  end if;

  insert into public.versoes_dos_cursos (curso, versao, descricao, conteudo, registrado_em, registrado_por)
  values (p_sigla, v_versao, p_descricao, public.programa_do_curso(p_sigla) - 'alteracoes', v_agora, v_autor);
  return jsonb_build_object('versao', v_versao, 'atualizado_em', v_agora);
end;
$$;
revoke execute on function public.salvar_curso(text, integer, jsonb, text) from public, anon;
grant execute on function public.salvar_curso(text, integer, jsonb, text) to authenticated;

-- A conversão única: o programa de cada curso guardado no cadastro (antes do formato dos cursos) vai para as tabelas,
-- no lugar do que houver (o mesmo programa não é gravado de novo). O operador (o administrador conta) faz na primeira
-- abertura do app novo; p_versao_do_cadastro é a versão do cadastro que o app leu (0 sem cadastro). Com o cadastro no
-- formato dos cursos não grava nada, nunca mais. Devolve o número de missões trazidas
create function public.importar_cursos(p_cursos jsonb, p_versao_do_cadastro integer)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_autor text := (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid());
  v_agora timestamptz := clock_timestamp();
  v_versao_do_cadastro integer;
  v_esquema integer;
  v_curso jsonb;
  v_versao integer;
  v_missoes integer;
  v_total integer := 0;
begin
  if public.perfil_atual() is distinct from 'operador' then
    raise exception 'somente operadores trazem os programas do cadastro' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.importar_cursos'));
  -- O cadastro travado: a gravação dele (public.salvar_documento) espera a conversão terminar
  select versao, public.esquema_do_conteudo(conteudo) into v_versao_do_cadastro, v_esquema
  from public.documentos where chave = 'cadastro' for update;
  if v_esquema >= public.formato_dos_cursos() then
    return 0;
  end if;
  if coalesce(v_versao_do_cadastro, 0) is distinct from p_versao_do_cadastro then
    raise exception 'o cadastro foi alterado depois da leitura; recarregue a página' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_cursos) is distinct from 'array' then
    raise exception 'os programas vão numa lista' using errcode = '22023', hint = 'limite';
  end if;

  for v_curso in
    select e from jsonb_array_elements(p_cursos) e
    where jsonb_typeof(e) = 'object' and exists (select 1 from public.cursos c where c.sigla = e ->> 'sigla')
  loop
    continue when public.assinatura_do_programa(v_curso) = public.assinatura_do_programa(public.programa_do_curso(v_curso ->> 'sigla'));
    v_missoes := public.gravar_programa(v_curso ->> 'sigla', v_curso, true);
    update public.cursos set versao = versao + 1, atualizado_em = v_agora, atualizado_por = v_autor
    where sigla = v_curso ->> 'sigla'
    returning versao into v_versao;
    insert into public.versoes_dos_cursos (curso, versao, descricao, conteudo, registrado_em, registrado_por)
    values (v_curso ->> 'sigla', v_versao,
      format('Programa trazido do cadastro (%s %s)', v_missoes, case when v_missoes = 1 then 'missão' else 'missões' end),
      public.programa_do_curso(v_curso ->> 'sigla') - 'alteracoes', v_agora, v_autor);
    v_total := v_total + v_missoes;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.importar_cursos(jsonb, integer) from public, anon;
grant execute on function public.importar_cursos(jsonb, integer) to authenticated;

-- Resultados das missões --------------------------------------------------------------------------------------------
-- Qualquer curso cadastrado: a tabela confere a sigla no formato, e a função, que o curso existe (os cursos nunca são
-- apagados: um curso encerrado continua valendo)
alter table public.resultados_de_missao drop constraint resultados_de_missao_curso_check;
alter table public.resultados_de_missao add constraint resultados_de_missao_curso_check
  check (curso ~ '^[A-Z][A-Z0-9-]{0,8}[A-Z0-9]$');

-- Como antes (fase 14), e o curso tem de existir
create or replace function public.registrar_resultado(p_aluno integer, p_curso text, p_missao text, p_resultado text, p_data date, p_voo text)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  novo bigint;
begin
  if public.perfil_atual() is distinct from 'operador' then
    raise exception 'somente operadores registram resultados' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cursos where sigla = p_curso) then
    raise exception 'curso desconhecido' using errcode = '23514';
  end if;
  insert into public.resultados_de_missao (aluno, curso, missao, resultado, data, voo, registrado_por)
  values (p_aluno, p_curso, upper(trim(p_missao)), p_resultado, p_data, p_voo,
    (select coalesce(nullif(p.nome, ''), u.email) from auth.users u left join public.perfis p on p.usuario = u.id where u.id = auth.uid()))
  returning id into novo;
  return novo;
end;
$$;
revoke execute on function public.registrar_resultado(integer, text, text, text, date, text) from public, anon;
grant execute on function public.registrar_resultado(integer, text, text, text, date, text) to authenticated;

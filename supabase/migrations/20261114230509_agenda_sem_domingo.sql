-- Retorno da operação (14/11): o aeroclube não opera aos domingos. O pedido para uma data vai até as 13:00 do dia de
-- operação anterior; o da segunda, até sábado às 10:00 (o domingo não opera). Domingo não recebe pedido. Horário de
-- São Paulo. Os pedidos e a exceção da coordenação usam esta regra (registrar_solicitacao).
create or replace function public.prazo_da_agenda_permite(p_data date, p_agora timestamptz)
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  with prazo as (
    select p_agora at time zone 'America/Sao_Paulo' as agora,
           p_data - case when extract(isodow from p_data - 1) = 7 then 2 else 1 end as dia
  )
  select extract(isodow from p_data) <> 7
     and (agora::date < dia
          or (agora::date = dia and agora::time < case when extract(isodow from dia) = 6 then time '10:00' else time '13:00' end))
  from prazo;
$$;

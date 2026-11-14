-- Retorno da operação (14/11): o aeroclube não opera aos domingos; os voos de segunda são agendados até sábado às
-- 10:00; os outros dias, até as 13:00 do dia anterior (horário de São Paulo). Roda dentro de uma transação desfeita.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select is(public.prazo_da_agenda_permite('2026-11-15', '2026-11-14 08:00:00-03'), false, 'domingo nunca');
select is(public.prazo_da_agenda_permite('2026-11-16', '2026-11-14 09:59:00-03'), true, 'segunda: até sábado 09:59');
select is(public.prazo_da_agenda_permite('2026-11-16', '2026-11-14 10:00:00-03'), false, 'segunda: encerrado sábado às 10:00');
select is(public.prazo_da_agenda_permite('2026-11-16', '2026-11-13 15:00:00-03'), true, 'segunda: na sexta à tarde ainda pode');
select is(public.prazo_da_agenda_permite('2026-11-16', '2026-11-15 08:00:00-03'), false, 'segunda: no domingo já fechou');
select is(public.prazo_da_agenda_permite('2026-11-17', '2026-11-15 08:00:00-03'), true, 'terça: no domingo pode');
select is(public.prazo_da_agenda_permite('2026-11-17', '2026-11-16 13:00:00-03'), false, 'terça: encerrado segunda às 13:00');
select is(public.prazo_da_agenda_permite('2026-11-14', '2026-11-13 12:59:00-03'), true, 'sábado: até sexta 12:59');
select is(public.prazo_da_agenda_permite('2026-11-11', '2026-11-10 16:30:00+00'), false, '16:30 UTC é 13:30 em São Paulo');

select * from finish();
rollback;

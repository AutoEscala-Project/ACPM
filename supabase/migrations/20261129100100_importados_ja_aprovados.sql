-- G2 (o Processamento; a migração #4 do plano): a regra (a) da conversão de antes da aprovação, de novo. Entre o D2 no ar e
-- o G2, uma aba aberta numa versão de antes do D2 ainda pode importar um pedido que aguarda a aprovação (o "Importar" de
-- antes não olhava a aprovação): ele fica num registro do dia (ou em "importadas" de uma data que já passou) sem estar
-- aprovado, e o Processamento o veria como "Na escala sem aprovação". Esta migração o aprova por "importação anterior",
-- como o D1 fez com os de antes dele, sem a regra (b) dos operadores (o que aguarda e não foi importado continua
-- aguardando). A função é a do D1 (20261129100000_aprovacao_dos_pedidos), interna; rodar de novo não muda nada.
-- Ordem: no ensaio, depois de semear as datas e exportar os CSVs (scripts/reiniciar-ensaio-previa.mjs e o item 9 da
-- lista da Onda 3); na prévia e na produção, com o D2 no ar, antes do merge do G2.
select public.aprovar_solicitacoes_de_antes_da_aprovacao(false);

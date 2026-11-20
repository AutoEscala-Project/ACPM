// Função meteorologia (Supabase Edge Function, Deno): o METAR e o TAF de Pampulha (SBBH) e de Confins (SBCF), do
// aviationweather.gov, para o painel do app e a TV da recepção (o navegador não chama o aviationweather.gov direto: ele
// não manda os cabeçalhos CORS). O atendimento (CORS, sessão, cache de 5 minutos, tempo máximo) fica em atendimento.js,
// e a leitura das mensagens em mensagens.js: JavaScript puro, testado também no Node (test/unit/meteorologia-funcao.test.js).
// Publicar: supabase functions deploy meteorologia --project-ref <ref> (README, "Publicar a meteorologia").
import { criarAtendimento, conferirNoAuth } from './atendimento.js';

const conferirSessao = conferirNoAuth(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');

Deno.serve(criarAtendimento({ conferirSessao }));

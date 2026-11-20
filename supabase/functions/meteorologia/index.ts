// Função meteorologia (Supabase Edge Function, Deno): o METAR e o TAF de Pampulha (SBBH) e de Confins (SBCF), da
// REDEMET (a API do DECEA), para o painel do app e a TV da recepção (o navegador não chama a REDEMET direto: a chave
// fica no servidor). O atendimento (CORS, sessão, chave, cache de 5 minutos, tempo máximo) fica em atendimento.js, e a
// leitura das mensagens em mensagens.js: JavaScript puro, testado também no Node (test/unit/meteorologia-funcao.test.js).
// A chave da REDEMET é o segredo REDEMET_API_KEY do projeto (supabase secrets set). Publicar: supabase functions deploy
// meteorologia (README, "Meteorologia no painel").
import { criarAtendimento, conferirNoAuth } from './atendimento.js';

const conferirSessao = conferirNoAuth(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');

Deno.serve(criarAtendimento({ conferirSessao, chave: Deno.env.get('REDEMET_API_KEY') ?? '' }));

// A sessão da TV da recepção (painel.html, js/painel.js): a TV fica ligada dias seguidos, sem ninguém para entrar de
// novo, e nunca mostra um quadro velho como se fosse o de agora (Pedro, 2026-11-20).
// - A sessão é renovada antes de expirar: faltando menos de 10 minutos, a cada busca do quadro e a cada 30 segundos, e
//   na hora quando a TV acorda (o relógio pulou), quando a página volta à vista e quando a conexão volta.
// - Um 401 (o JWT recusado) em painel_do_dia ou na meteorologia: a TV renova a sessão e tenta mais uma vez.
// - "Manter esta TV conectada": o e-mail e a senha da conta da TV ficam neste navegador (guardaDaEntrada). Quando a
//   renovação é recusada (a sessão revogada ou perdida), a TV entra de novo sozinha com eles; recusados (a senha mudou),
//   eles saem, e a TV pede o login.
// - Sem uma busca boa há mais de 3 minutos, o quadro sai da tela e um aviso diz desde quando (telaDaTV); a sessão que
//   não volta pede o login. O quadro volta sozinho na busca boa seguinte.
// O supabase-js também renova sozinho (a 90 segundos do fim); a renovação daqui chega antes e cobre o que ele não cobre.
import { soPainel } from './perfis.js';

export const RENOVAR_ANTES_MS = 10 * 60000;
export const SEM_ATUALIZACAO_MS = 3 * 60000;
export const TIQUE_MS = 30000;

// A sessão que expira (expires_at, em segundos) em menos de 10 minutos é renovada; sem a data, não
export const precisaRenovar = (expiraEm, agora) => typeof expiraEm === 'number' && expiraEm * 1000 - agora < RENOVAR_ANTES_MS;

// Os tiques param quando a TV dorme (a tela desligada, o aparelho em espera): o tique que chega com mais de três
// intervalos de atraso é a TV acordando
export const acordou = (ultimoTique, agora) => agora - ultimoTique > 3 * TIQUE_MS;

// O que a TV mostra: o quadro; o aviso de que ele está sem atualização (desde a última busca boa; sem nenhuma, desde
// que a página abriu, e já na primeira busca que falhou: não há quadro para mostrar); ou o login, com a sessão expirada
export function telaDaTV({ agora, inicio, ultimaBusca, falhou, sessaoExpirada }) {
  if (sessaoExpirada) return { tela: 'sessao-expirada' };
  if (ultimaBusca === null) return falhou ? { tela: 'sem-atualizacao', desde: inicio } : { tela: 'quadro' };
  return agora - ultimaBusca > SEM_ATUALIZACAO_MS ? { tela: 'sem-atualizacao', desde: ultimaBusca } : { tela: 'quadro' };
}

// Uma falha que passa (sem conexão, o servidor fora do ar ou ocupado): a sessão continua, e a TV tenta de novo. As outras
// recusas do Auth (o refresh token revogado ou já usado, a senha errada) são definitivas
export const falhaPassageira = erro => Boolean(erro) && (erro.name === 'AuthRetryableFetchError' || !erro.status || erro.status === 429 || erro.status >= 500);

// A resposta que recusa a sessão: o 401 do PostgREST (JWT expirado ou inválido) ou da função
export const erroDeSessao = erro => Boolean(erro) && (erro.status === 401 || erro.code === '401' || /^PGRST30[1-3]$/.test(erro.code || '') || /\bJWT\b/i.test(erro.message || ''));

// O e-mail e a senha da TV neste navegador (a chave do projeto, chaveDaEntradaDaTV). Sem o localStorage (bloqueado ou
// cheio), nada fica guardado
export function guardaDaEntrada(chave, armazenamento = globalThis.localStorage) {
  return {
    ler() {
      try {
        const guardada = JSON.parse(armazenamento.getItem(chave));
        return guardada && typeof guardada.email === 'string' && typeof guardada.senha === 'string' && guardada.email && guardada.senha
          ? { email: guardada.email, senha: guardada.senha } : null;
      } catch {
        return null;
      }
    },
    guardar(email, senha) {
      try { armazenamento.setItem(chave, JSON.stringify({ email, senha })); } catch { /* fica sem guardar */ }
    },
    limpar() {
      try { armazenamento.removeItem(chave); } catch { /* nada guardado */ }
    }
  };
}

// A sessão da TV sobre o auth do supabase-js. perfil(): o perfil da conta conectada (null sem perfil; undefined quando
// não deu para saber). renovar devolve 'ok' (a sessão vale), 'rede' (não deu para falar com o servidor: a sessão fica e a
// TV tenta de novo) ou 'expirada' (renovar e entrar de novo não deram certo: falta o login)
export function criarSessaoDaTV({ auth, entrada, perfil, agora = () => Date.now() }) {
  // Entra de novo com o e-mail e a senha guardados. Sem eles, ou com eles recusados (a senha mudou, a conta deixou de
  // ser a da TV), a sessão que sobrou sai deste navegador e eles também
  async function entrarDeNovo() {
    const guardada = entrada.ler();
    if (guardada) {
      const { error } = await auth.signInWithPassword({ email: guardada.email, password: guardada.senha });
      if (error && falhaPassageira(error)) return 'rede';
      if (!error) {
        const p = await perfil();
        if (p === undefined || soPainel(p)) return 'ok';
      }
      entrada.limpar();
    }
    await auth.signOut({ scope: 'local' }).catch(() => {});
    return 'expirada';
  }

  async function passo(forcar) {
    const { data, error } = await auth.getSession();
    const sessao = data && data.session;
    if (!sessao) return error && falhaPassageira(error) ? 'rede' : entrarDeNovo();
    if (!forcar && !precisaRenovar(sessao.expires_at, agora())) return 'ok';
    const { error: recusa } = await auth.refreshSession();
    if (!recusa) return 'ok';
    return falhaPassageira(recusa) ? 'rede' : entrarDeNovo();
  }

  // Uma renovação por vez (a busca do quadro, a da meteorologia e o tique podem pedir juntas)
  let fila = Promise.resolve();
  const renovar = ({ forcar = false } = {}) => {
    const vez = fila.then(() => passo(forcar));
    fila = vez.catch(() => {});
    return vez;
  };

  return {
    renovar,
    entrarDeNovo,
    // Faz a chamada com a sessão em dia; recusada a sessão (401), renova e tenta mais uma vez. aoExpirar: a sessão não
    // voltou (o erro segue para quem chamou)
    async comSessao(chamada, aoExpirar = () => {}) {
      if (await renovar() === 'expirada') {
        aoExpirar();
        throw Object.assign(new Error('Sessão expirada'), { status: 401 });
      }
      try {
        return await chamada();
      } catch (erro) {
        if (!erroDeSessao(erro)) throw erro;
        const renovada = await renovar({ forcar: true });
        if (renovada === 'expirada') aoExpirar();
        if (renovada !== 'ok') throw erro;
        return chamada();
      }
    }
  };
}

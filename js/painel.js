// TV da recepção: o painel de hoje na tela toda (js/views/painel-aeroporto.js), no quadro e com as colunas da
// configuração do painel. No modo compartilhado, a TV entra com a conta dela (perfil "painel", que só vê o quadro, pela
// função painel_do_dia) e busca o quadro a cada minuto; neste navegador (sem servidor), lê o dia e a configuração
// gravados aqui. O perfil da TV não lê o cadastro: a configuração vem no campo "painel" da função painel_do_dia
// (migração 20261120150000_painel_do_dia_com_a_configuracao.sql), e a TV a normaliza como o app. Sem o campo (o banco
// ainda sem a migração) ou sem a configuração, a TV mostra o padrão (Missões, com as colunas do padrão). Recarrega toda
// madrugada, para pegar as versões novas do app, e mantém a tela acesa. A TV fica numa tela pública: ela só aceita a
// conta da TV e guarda a sessão numa chave só dela. Embaixo do quadro, a meteorologia (js/meteorologia.js), pela função
// meteorologia do servidor, com a sessão da TV; neste navegador, "indisponível".
import { projetoSupabase, chaveDaSessao } from './config-supabase.js';
import { soPainel } from './perfis.js';
import { backendLocal } from './backends/local.js';
import { criarBackendSupabase } from './backends/supabase.js';
import { configurarMeteorologia } from './meteorologia.js';
import { linhasDoQuadro, quadroDoDia } from './quadro.js';
import { painelNaTela, atualizarPainel } from './views/painel-aeroporto.js';
import { hm, hojeISO, minutoDoDia } from './format.js';

const BUSCA_MS = 60000;
const SEM_CONEXAO_MS = 3 * 60000;
let quadro = { data: hojeISO(), voos: null, fStatus: {}, fObs: {}, painel: null };
let ultimaBusca = null;

const horaDe = instante => hm(minutoDoDia(new Date(instante)));
const fonte = () => ({
  linhas: quadro.voos ? linhasDoQuadro(quadro.voos, quadro.fStatus, quadro.fObs) : [],
  data: quadro.data,
  semEscala: !quadro.voos,
  painel: quadro.painel,
  aviso: ultimaBusca !== null && Date.now() - ultimaBusca > SEM_CONEXAO_MS ? `Sem conexão desde ${horaDe(ultimaBusca)}` : ''
});

// Busca o quadro e redesenha; sem resposta, continua o último quadro e o aviso diz desde quando
async function atualizar(buscar) {
  try {
    const novo = await buscar();
    quadro = { data: novo.data || hojeISO(), voos: novo.voos, fStatus: novo.fStatus || {}, fObs: novo.fObs || {}, painel: novo.painel || null };
    ultimaBusca = Date.now();
  } catch {
    // o aviso aparece depois de 3 minutos sem resposta
  }
  atualizarPainel();
}

// O dia gravado neste navegador (modo sem servidor), como o servidor entregaria, e a configuração do painel do cadastro
// (o painel a normaliza)
const buscarNesteNavegador = async () => {
  const cadastro = await backendLocal.ler('cadastro');
  return { data: hojeISO(), ...quadroDoDia(await backendLocal.ler(`dia:${hojeISO()}`)), painel: (cadastro && cadastro.painel) || null };
};

// O perfil da conta conectada: null sem perfil, undefined quando não deu para saber (sem conexão)
async function perfilDaConta(cliente) {
  const { data, error } = await cliente.from('perfis').select('perfil').maybeSingle();
  return error ? undefined : data ? data.perfil : null;
}

// Só a conta da TV entra: outra conta sai na hora
function pedirLogin(cliente) {
  const form = document.getElementById('form-login');
  form.hidden = false;
  document.getElementById('login-email').focus();
  return new Promise(resolve => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const erro = document.getElementById('login-erro');
      erro.textContent = '';
      const { error } = await cliente.auth.signInWithPassword({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-senha').value
      });
      if (error) { erro.textContent = 'E-mail ou senha incorretos.'; return; }
      const perfil = await perfilDaConta(cliente);
      if (!soPainel(perfil)) {
        await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
        erro.textContent = perfil === undefined
          ? 'Não foi possível verificar a conta. Verifique a conexão e tente de novo.'
          : 'Esta conta não é a da TV. Entre com a conta da TV (perfil Painel).';
        return;
      }
      form.hidden = true;
      resolve();
    });
  });
}

// A sessão guardada na chave do app (a TV que entrou pelo app, ou por uma versão sem a chave da TV): se for a conta da
// TV, a sessão passa para a chave da TV (sem pedir a senha de novo); a sessão de outra conta fica onde está
async function trazerSessaoDoApp(projeto) {
  const doApp = chaveDaSessao(projeto), daTV = chaveDaSessao(projeto, { painel: true });
  if (localStorage.getItem(daTV) || !localStorage.getItem(doApp)) return;
  const app = window.supabase.createClient(projeto.url, projeto.chave, { auth: { storageKey: doApp, autoRefreshToken: false, detectSessionInUrl: false } });
  if (!soPainel(await perfilDaConta(app))) return;
  localStorage.setItem(daTV, localStorage.getItem(doApp));
  localStorage.removeItem(doApp);
}

function manterTelaAcesa() {
  const pedir = () => {
    if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {});
  };
  document.addEventListener('visibilitychange', pedir);
  pedir();
}

// Às 03:00 a página recarrega: pega as versões novas do app e começa o dia limpa
function recarregarDeMadrugada() {
  const agora = new Date(), proxima = new Date(agora);
  proxima.setHours(3, 0, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);
  setTimeout(() => window.location.reload(), proxima - agora);
}

async function iniciar() {
  const projeto = projetoSupabase();
  let buscar = buscarNesteNavegador;
  configurarMeteorologia(null);
  if (projeto) {
    // A conta da TV que entra pelo app vem para cá já conectada (o app passa a sessão para a chave da TV)
    await trazerSessaoDoApp(projeto);
    const cliente = window.supabase.createClient(projeto.url, projeto.chave, { auth: { storageKey: chaveDaSessao(projeto, { painel: true }) } });
    const { data } = await cliente.auth.getSession();
    // A sessão guardada continua valendo enquanto a conta for a da TV (sem conexão, a TV segue com ela)
    const perfil = data.session ? await perfilDaConta(cliente) : null;
    if (!data.session || (perfil !== undefined && !soPainel(perfil))) {
      if (data.session) await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
      await pedirLogin(cliente);
    }
    buscar = async () => {
      const { data: novo, error } = await cliente.rpc('painel_do_dia');
      if (error) throw error;
      return novo;
    };
    const servidor = criarBackendSupabase(cliente);
    configurarMeteorologia(() => servidor.meteorologia());
  }
  await atualizar(buscar);
  const tela = document.getElementById('quadro');
  tela.hidden = false;
  painelNaTela(tela, fonte);
  setInterval(() => atualizar(buscar), BUSCA_MS);
  manterTelaAcesa();
  recarregarDeMadrugada();
}

iniciar();

// TV da recepção: o painel de hoje na tela toda (js/views/painel-aeroporto.js), no quadro e com as colunas da
// configuração do painel. No modo compartilhado, a TV entra com a conta dela (perfil "painel", que só vê o quadro, pela
// função painel_do_dia) e busca o quadro a cada minuto; neste navegador (sem servidor), lê o dia e a configuração
// gravados aqui. O perfil da TV não lê o cadastro: a configuração vem no campo "painel" da função painel_do_dia
// (migração 20261120150000_painel_do_dia_com_a_configuracao.sql), e a TV a normaliza como o app, a cada busca. Sem o
// campo (o banco ainda sem a migração) ou sem a configuração, a TV mostra o padrão (Missões, com as colunas do padrão).
// Recarrega toda madrugada, para pegar as versões novas do app, e mantém a tela acesa. A TV fica numa tela pública: ela
// só aceita a conta da TV e guarda a sessão numa chave só dela. Embaixo do quadro, a meteorologia (js/meteorologia.js),
// pela função meteorologia do servidor, com a sessão da TV; neste navegador, "indisponível".
// A sessão da TV fica viva sozinha (js/sessao-da-tv.js): renovada antes de expirar e, com "Manter esta TV conectada",
// refeita com o e-mail e a senha guardados neste navegador. Sem uma busca boa há mais de 3 minutos, o quadro sai da tela
// e o aviso diz desde quando; a sessão que não volta pede o login, com o aviso. O quadro volta na busca boa seguinte.
import { projetoSupabase, chaveDaSessao, chaveDaEntradaDaTV } from './config-supabase.js';
import { soPainel } from './perfis.js';
import { backendLocal } from './backends/local.js';
import { criarBackendSupabase } from './backends/supabase.js';
import { configurarMeteorologia } from './meteorologia.js';
import { linhasDoQuadro, quadroDoDia } from './quadro.js';
import { painelNaTela, atualizarPainel } from './views/painel-aeroporto.js';
import { hm, hojeISO, minutoDoDia } from './format.js';
import { TIQUE_MS, acordou, criarSessaoDaTV, falhaPassageira, guardaDaEntrada, telaDaTV } from './sessao-da-tv.js';

const BUSCA_MS = 60000;
// Uma busca sem resposta em 30 segundos (a conexão que caiu no meio) não segura as seguintes
const BUSCA_PRESA_MS = 30000;
const inicio = Date.now();
let quadro = { data: hojeISO(), voos: null, fStatus: {}, fObs: {}, painel: null };
let ultimaBusca = null, falhou = false, sessaoExpirada = false;
let buscar = null;
// No modo compartilhado: o cliente do Supabase, o e-mail e a senha guardados e a sessão da TV
let cliente = null, entrada = null, sessao = null;

const horaDe = instante => hm(minutoDoDia(new Date(instante)));
const fonte = () => ({
  linhas: quadro.voos ? linhasDoQuadro(quadro.voos, quadro.fStatus, quadro.fObs) : [],
  data: quadro.data,
  semEscala: !quadro.voos,
  painel: quadro.painel
});

// O que a tela mostra agora: o quadro, o aviso de que ele está sem atualização (o quadro sai da tela) ou o login
function mostrarTela() {
  const { tela, desde } = telaDaTV({ agora: Date.now(), inicio, ultimaBusca, falhou, sessaoExpirada });
  document.body.dataset.tela = tela;
  document.getElementById('aviso-da-tv').hidden = tela !== 'sem-atualizacao';
  const texto = tela === 'sem-atualizacao' ? `Painel sem atualização desde ${horaDe(desde)}: tentando de novo…` : '';
  const elemento = document.getElementById('aviso-da-tv-texto');
  if (elemento.textContent !== texto) elemento.textContent = texto;
}

// Busca o quadro e redesenha (a configuração do painel vem junto, e vale a cada busca). Sem resposta, o quadro fica
// como estava até o aviso tirá-lo da tela; uma resposta que chega depois de uma mais nova não volta o quadro
let buscando = null, buscandoDesde = 0, pedidos = 0, aplicado = 0;
function atualizar() {
  if (!buscar || sessaoExpirada) {
    mostrarTela();
    return Promise.resolve();
  }
  if (buscando && Date.now() - buscandoDesde < BUSCA_PRESA_MS) return buscando;
  const n = ++pedidos;
  buscandoDesde = Date.now();
  const vez = Promise.resolve().then(buscar).then(novo => {
    if (n < aplicado) return;
    aplicado = n;
    quadro = { data: novo.data || hojeISO(), voos: novo.voos, fStatus: novo.fStatus || {}, fObs: novo.fObs || {}, painel: novo.painel || null };
    ultimaBusca = Date.now();
    falhou = false;
  }, () => {
    falhou = true;
  }).then(() => {
    if (buscando === vez) buscando = null;
    atualizarPainel();
    mostrarTela();
  });
  buscando = vez;
  return vez;
}

// O dia gravado neste navegador (modo sem servidor), como o servidor entregaria, e a configuração do painel do cadastro
// (o painel a normaliza)
const buscarNesteNavegador = async () => {
  const cadastro = await backendLocal.ler('cadastro');
  return { data: hojeISO(), ...quadroDoDia(await backendLocal.ler(`dia:${hojeISO()}`)), painel: (cadastro && cadastro.painel) || null };
};

// O perfil da conta conectada: null sem perfil, undefined quando não deu para saber (sem conexão)
async function perfilDaConta(cli) {
  const { data, error } = await cli.from('perfis').select('perfil').maybeSingle();
  return error ? undefined : data ? data.perfil : null;
}

// Só a conta da TV entra: outra conta sai na hora. "Manter esta TV conectada" guarda o e-mail e a senha neste navegador
// (só os da conta da TV; desmarcado, o que havia sai). expirada: a sessão expirou e não voltou sozinha (o aviso em
// cima); email: o da conta que estava na TV
let loginAberto = null;
function pedirLogin({ expirada = false, email = '' } = {}) {
  if (loginAberto) return loginAberto;
  const form = document.getElementById('form-login');
  const campoEmail = document.getElementById('login-email'), campoSenha = document.getElementById('login-senha');
  const erro = document.getElementById('login-erro'), botao = document.getElementById('btn-entrar');
  document.getElementById('login-aviso').hidden = !expirada;
  if (email && !campoEmail.value) campoEmail.value = email;
  form.hidden = false;
  (campoEmail.value ? campoSenha : campoEmail).focus();
  loginAberto = new Promise(resolve => {
    form.onsubmit = async e => {
      e.preventDefault();
      erro.textContent = '';
      botao.disabled = true;
      const credenciais = { email: campoEmail.value.trim(), password: campoSenha.value };
      const { error } = await cliente.auth.signInWithPassword(credenciais);
      // A senha recusada (ou a de outra conta) não fica no campo, numa tela pública: alguns navegadores têm o botão de
      // mostrar a senha. Sem conexão, ela fica, para tentar de novo
      if (error) {
        botao.disabled = false;
        const recusada = error.status === 400;
        if (recusada) campoSenha.value = '';
        erro.textContent = recusada ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique a conexão e tente de novo.';
        return;
      }
      const perfil = await perfilDaConta(cliente);
      botao.disabled = false;
      if (!soPainel(perfil)) {
        if (perfil !== undefined) campoSenha.value = '';
        await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
        // Outra conta nunca fica guardada na TV (e o que estava guardado sai)
        if (perfil !== undefined) entrada.limpar();
        erro.textContent = perfil === undefined
          ? 'Não foi possível verificar a conta. Verifique a conexão e tente de novo.'
          : 'Esta conta não é a da TV. Entre com a conta da TV (perfil Painel).';
        return;
      }
      if (document.getElementById('login-manter').checked) entrada.guardar(credenciais.email, credenciais.password);
      else entrada.limpar();
      campoSenha.value = '';
      form.hidden = true;
      loginAberto = null;
      resolve();
    };
  });
  return loginAberto;
}

// A sessão não voltou (renovar e entrar de novo não deram certo): o quadro sai da tela e o login aparece, com o aviso.
// Depois do login, o quadro volta na hora
let emailDaTV = '';
function sessaoQueExpirou() {
  if (sessaoExpirada) return;
  sessaoExpirada = true;
  mostrarTela();
  pedirLogin({ expirada: true, email: emailDaTV }).then(() => {
    sessaoExpirada = false;
    atualizar();
  });
}

// A sessão renovada antes de expirar: a cada 30 segundos (além de a cada busca); quando a TV acorda (os tiques param com
// ela em espera), quando a página volta à vista e quando a conexão volta, a busca vem na hora, com a renovação
function vigiarASessao() {
  let ultimoTique = Date.now();
  setInterval(() => {
    const agora = Date.now();
    const dormiu = acordou(ultimoTique, agora);
    ultimoTique = agora;
    if (dormiu) atualizar();
    else if (sessao && !sessaoExpirada) sessao.renovar().then(r => { if (r === 'expirada') sessaoQueExpirou(); }, () => {});
    mostrarTela();
  }, TIQUE_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); });
  window.addEventListener('online', () => atualizar());
}

// Sair desta TV: a sessão e o e-mail e a senha guardados saem deste navegador, e a página pede o login. O botão aparece
// com o mouse (some 5 segundos depois de ele parar) ou com o foco do teclado
function ligarSaida() {
  const botao = document.getElementById('btn-sair-tv');
  botao.hidden = false;
  botao.onclick = async () => {
    entrada.limpar();
    await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.reload();
  };
  let parado = null;
  document.addEventListener('pointermove', () => {
    document.body.classList.add('mexeu');
    clearTimeout(parado);
    parado = setTimeout(() => document.body.classList.remove('mexeu'), 5000);
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

// A conta da TV conectada: a sessão guardada (se for a conta da TV; sem conexão, a TV segue com ela) ou, sem ela, o
// e-mail e a senha guardados; sem nada disso, o login
async function conectar(projeto) {
  // A conta da TV que entra pelo app vem para cá já conectada (o app passa a sessão para a chave da TV)
  await trazerSessaoDoApp(projeto);
  cliente = window.supabase.createClient(projeto.url, projeto.chave, { auth: { storageKey: chaveDaSessao(projeto, { painel: true }) } });
  entrada = guardaDaEntrada(chaveDaEntradaDaTV(projeto));
  sessao = criarSessaoDaTV({ auth: cliente.auth, entrada, perfil: () => perfilDaConta(cliente) });
  cliente.auth.onAuthStateChange((_evento, atual) => { if (atual && atual.user && atual.user.email) emailDaTV = atual.user.email; });
  const { data, error } = await cliente.auth.getSession();
  const perfil = data.session ? await perfilDaConta(cliente) : null;
  if (data.session && perfil !== undefined && !soPainel(perfil)) {
    await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
    entrada.limpar();
    await pedirLogin();
  } else if (!data.session && !falhaPassageira(error)) {
    // Sem sessão. (A sessão guardada vencida que não deu para renovar, sem conexão, continua guardada: a TV segue com
    // ela, mostra o aviso e renova quando a conexão voltar, sem pedir o login)
    const guardada = entrada.ler();
    if (await sessao.entrarDeNovo() === 'expirada') await pedirLogin({ expirada: Boolean(guardada), email: guardada ? guardada.email : '' });
  }
  buscar = () => sessao.comSessao(async () => {
    const { data: novo, error, status } = await cliente.rpc('painel_do_dia');
    if (error) throw Object.assign(new Error(error.message), { code: error.code, status });
    return novo;
  }, sessaoQueExpirou);
  const servidor = criarBackendSupabase(cliente);
  configurarMeteorologia(() => sessao.comSessao(() => servidor.meteorologia(), sessaoQueExpirou));
  ligarSaida();
}

async function iniciar() {
  const projeto = projetoSupabase();
  configurarMeteorologia(null);
  if (projeto) await conectar(projeto);
  else buscar = buscarNesteNavegador;
  await atualizar();
  const tela = document.getElementById('quadro');
  tela.hidden = false;
  painelNaTela(tela, fonte);
  mostrarTela();
  setInterval(atualizar, BUSCA_MS);
  vigiarASessao();
  manterTelaAcesa();
  recarregarDeMadrugada();
}

iniciar();

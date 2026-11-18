/**
 * AutoEscala - ACPM: ponto de entrada. Liga os eventos da tela (js/eventos/, uma aba por módulo) e abre o app.
 *
 *   js/config.js    Configurações operacionais (janelas, frota, missões, limites de peso)
 *   js/rules.js     Regras das missões (Ground School, precedência, normalização)
 *   js/format.js    Formatação de horários, durações e datas
 *   js/engine.js    Motor de alocação determinístico (função pura)
 *   js/storage.js   Camada de dados (estado inicial e migrações) sobre js/backends/ (local ou Supabase)
 *   js/sessao.js    Login e perfil de acesso no modo compartilhado (Supabase)
 *   js/state.js     Estado compartilhado entre os módulos
 *   js/actions.js   Perfil de acesso, data, histórico e escala; gravarAlteracao, o jeito de os eventos mudarem os dados
 *   js/dom.js       Utilitários de DOM
 *   js/views/       Renderização das abas
 *   js/eventos/     Os eventos de cada aba: registro.js (as ações dos botões e os campos das tabelas, com a trava de quem
 *                   só consulta) e confirmacao.js (o único jeito de confirmar)
 *   js/export.js    Exportação CSV, PDF e a planilha do Excel
 */
import './eventos/navegacao.js';
import './eventos/escala.js';
import './eventos/cadastros.js';
import './eventos/historico.js';
import './eventos/topo.js';
import './eventos/demanda.js';
import './eventos/bi.js';
import './eventos/recursos.js';
import './eventos/conta.js';
import './eventos/agenda.js';
import './eventos/rodizio.js';
import './eventos/cursos.js';
import { setRole, escalaCalculada, marcarEscalaSoCalculada, abrirData, historicoParaPainel, carregarBI, avisarDadosIndisponiveis } from './actions.js';
import { ehDomingo } from './agenda.js';
import { projetoSupabase } from './config-supabase.js';
import { iniciarDicas } from './dicas.js';
import { $, showToast, mostrarAviso, avisoAberto, avisarDoLink } from './dom.js';
import { amanhaISO, somarDias, dataIsoValida } from './format.js';
import { iniciarSessaoSupabase } from './sessao.js';
import { iniciarSomenteLeitura } from './somente-leitura.js';
import { setS, setRES, setAuditLog, modoCompartilhado } from './state.js';
import { ApiClient } from './storage.js';
import { abaFoiEscolhida } from './eventos/navegacao.js';
import { avisoDeDomingo, iniciarTema } from './eventos/topo.js';
import { abrirAgenda, diaDaAgenda, podeEditarAgenda } from './views/agenda.js';
import { rIns, rAlu } from './views/cadastros.js';
import { rCursos } from './views/cursos.js';
import { carregarDadosPessoais } from './views/dados-pessoais.js';
import { rDem } from './views/demanda.js';
import { renderAuditPanel, rOut } from './views/escala.js';
import { rRec } from './views/recursos.js';
import { atualizarSelosDaEscala, lerPedidosDaData } from './views/selos.js';
import { show } from './views/tabs.js';

// Fechar ou recarregar a página com alterações esperando a conexão pede confirmação (elas se perderiam)
window.addEventListener('beforeunload', e => {
  if (!ApiClient.temGravacoesPendentes()) return;
  e.preventDefault();
  e.returnValue = '';
});

// Inicialização Assíncrona
(async function bootstrap() {
  iniciarTema();
  // As dicas dos termos e a tela só de consulta do Gestor
  iniciarDicas();
  iniciarSomenteLeitura();

  // O endereço é lido antes: abrir uma data põe a data nele
  const params = new URLSearchParams(window.location.search);
  // Amanhã, ou a segunda quando amanhã é domingo
  const amanha = ehDomingo(amanhaISO()) ? somarDias(amanhaISO(), 1) : amanhaISO();
  abrirData(amanha);

  // Um link com a escala inteira no endereço (share=) não vale: sai do endereço, com o aviso
  if (params.has('share')) {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.history.replaceState(window.history.state, '', url);
    avisarDoLink('Este link antigo levava a escala no próprio endereço e não vale mais. Peça um link novo a quem compartilhou.', 'erro');
  }
  // A data do link (?data=); uma data que não existe abre amanhã, com o aviso
  const pedida = params.get('data');
  // O aeroclube não opera aos domingos: um link para um domingo abre a segunda
  const domingo = dataIsoValida(pedida) && ehDomingo(pedida);
  const data = dataIsoValida(pedida) ? (domingo ? somarDias(pedida, 1) : pedida) : amanha;

  // Sessão e dados. Se algo falhar (sem conexão, conversão pela metade), o app não abre com dados incompletos:
  // fica o aviso para recarregar (nada se perde; o que faltou é retomado na próxima abertura)
  try {
    // No site publicado os dados ficam no Supabase, com login; em localhost, no modo local
    const projeto = projetoSupabase();
    if (projeto && !(await iniciarSessaoSupabase(projeto))) return;

    // Primeira abertura com a escala por data: converte os documentos sem data (estado, escala, historico e bi), do
    // servidor ou deste navegador.
    // Depois de uma mudança no formato dos dados, regrava no formato atual o que estiver num formato anterior
    await ApiClient.migrarDocumentosAntigos(amanha);
    await ApiClient.atualizarFormatoGravado();

    abrirData(data);
    const { estado, escala, horasBase, horasDosInstrutores, resultados, indisponiveis } = await ApiClient.carregarDia(data);
    setS({ ...estado, horasBase, horasDosInstrutores, resultados, indisponiveis });
    avisarDadosIndisponiveis();
    // Data sem escala gravada: a escala calculada aparece na hora (é gravada junto com a primeira alteração)
    setRES(escala || escalaCalculada());
    marcarEscalaSoCalculada(!escala);
    setAuditLog(await historicoParaPainel(data));
    if (domingo) showToast(avisoDeDomingo(data));
    else if (pedida && data !== pedida) showToast(`A data do link não existe (${pedida.slice(0, 20)}). A escala aberta é a de amanhã.`);
  } catch (e) {
    console.warn(e);
    if (avisoAberto() !== 'conflito') mostrarAviso('falha', 'Não foi possível preparar os dados da escala. Verifique a conexão e recarregue a página; nada foi perdido.');
    return;
  }

  // No modo compartilhado o perfil vem da conta: role= da URL não vale
  if (!modoCompartilhado() && params.get('role')) setRole(params.get('role'), false);

  // As abas com os dados lidos, também a que a pessoa abriu enquanto eles carregavam (Cursos, por exemplo)
  rRec(); rIns(); rAlu(); rCursos(); rDem(); renderAuditPanel();
  document.body.dataset.agenda = podeEditarAgenda() ? 'edita' : 'consulta';
  // Dados pessoais (para a coluna CANAC das tabelas), para quem pode vê-los
  carregarDadosPessoais();

  // A Secretaria trabalha na agenda: o app abre nela, a menos que ela já tenha saído da Escala (uma aba, o Manual, Minha
  // conta) ou escolhido uma aba enquanto os dados carregavam. A Agenda aberta, por ela ou pela abertura, é lida agora,
  // com os alunos, no dia que já estiver escolhido nela
  if (ApiClient.perfil === 'secretaria' && !abaFoiEscolhida() && $('#s-esc').classList.contains('on')) show('age');
  if ($('#s-age').classList.contains('on')) abrirAgenda(diaDaAgenda() || undefined);

  rOut();
  atualizarSelosDaEscala();
  lerPedidosDaData();
  carregarBI();
  // Fim da abertura: daqui em diante, só a pessoa muda a aba. Os testes E2E esperam por esta marca (fixtures.js, entrar)
  document.body.dataset.pronto = '1';
})();

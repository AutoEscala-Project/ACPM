// Pedidos: a lista e o detalhe (o componente de lista e detalhe, com os modelos de js/views/agenda.js), registrar (cada
// pedido para a data dele, "Data do pedido"; "Registrar e aprovar", "Registrar sem aprovar", a Exceção da Coordenação e,
// no 7º voo local, "Registrar mesmo assim" e "Registrar na lista de espera"), aprovar (na linha, no detalhe, "Aprovar
// todos"), retirar a aprovação, cancelar e "Registrar de novo…". O pedido aprovado da data aberta entra na demanda na
// hora só com as cinco condições (motivoSemEntrada); senão, "Importar" (js/eventos/importacao.js) o traz
import { vagaDeVooLocal, HORARIOS_FIXOS, motivoSemEntrada, situacaoNaDemanda, solicitacaoAprovada } from '../agenda.js';
import { DURACAO_MAXIMA_H, LIMITE_DE_VOOS_LOCAIS } from '../config.js';
import { dadosLidos, diaJaGravado, carregarData } from '../actions.js';
import { $, showToast, anunciar } from '../dom.js';
import { duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S, DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import { porNaDemanda, notasDaEntrada } from '../entrada-na-demanda.js';
import {
  abrirAgenda, rAgenda, podeEditarAgenda, aprovaPedidos, lembrarRegistradoPor, lembradoRegistradoPor, descreverPedido, missaoDoPedido, pedidoDaLista, dataCurta, dataDoFormulario,
  escolherDataDoPedido, pedidosDoFormulario, lerPedidosDaAgenda, marcarInvalidos, focarNoPrimeiroInvalido, apagarErroDaAgenda, desarmarConfirmacaoDaAgenda,
  nomearRegistrar, botaoArmado, missaoEscolhida, rHorariosDoPedido, atualizarRecursoEHorario, esvaziarPedidoRegistrado, escolherNaAgenda, escolherMissaoNaAgenda, emLista,
  modeloDosPedidos, detalheDoPedido, aprovaveisNaBusca, marcarRecente, mudouADataDaLista, preencherComOPedido
} from '../views/agenda.js';
import { solicitacoesDaDataLidas, lerSolicitacoesDaData, marcarDiaMudou } from '../solicitacoes-da-data.js';
import { lerContagemDosDias } from '../views/trilho.js';
import { registrarDesenho } from '../redesenho.js';
import { criarMestreDetalhe } from '../views/mestre-detalhe.js';
import { registrarTela } from '../views/telas.js';

// A lista e o detalhe. Com nada escolhido, o detalhe mostra o formulário do pedido novo (o bloco fixo #agenda-novo-pedido)
const tela = criarMestreDetalhe({
  id: 'age',
  rotulo: 'Pedidos',
  nomes: ['pedido', 'pedidos'],
  semItens: 'Nenhum pedido para esta data.',
  vazio: { elemento: 'agenda-novo-pedido' },
  modelo: modeloDosPedidos,
  detalhe: detalheDoPedido,
  edita: () => !isGestor()
});

// O desenho de Pedidos (js/redesenho.js), pelo papel: a barra, os avisos, o formulário e a lista. Ele não faz nada até
// Pedidos ser aberta. Outra data aberta: o pedido escolhido era da de antes
function desenharPedidos(momento) {
  rAgenda();
  if (mudouADataDaLista() && tela.selecionado() !== null) tela.escolher(null, { origem: 'endereco' });
  tela.desenhar(momento);
}
registrarDesenho('pedidos', desenharPedidos, { em: ['dados', 'releitura', 'perfil', 'pedidos'], ordem: 95, comMomento: true });
// Cada alteração refaz a escala: os horários do cadastro podem ter mudado com Pedidos aberta; onde cada pedido está na
// demanda também
registrarDesenho('horarios-do-pedido', () => { rHorariosDoPedido(); rAgenda(); tela.desenhar(); }, { em: ['escala'], ordem: 96 });
// Aberta, Pedidos lê de novo os pedidos da data aberta, os da data do pedido e os de cada dia do calendário. O endereço
// (#/age/<id>) escolhe o pedido
registrarTela('age', {
  aoMostrar: (item, opcoes) => {
    abrirAgenda();
    lerSolicitacoesDaData();
    lerContagemDosDias();
    rAgenda();
    const feito = tela.aoMostrar(item, opcoes);
    // A lista de volta, com nada escolhido: o pedido registrado com ela escondida (o celular) fica à vista, com o foco
    const linha = feito.item === null || feito.item === undefined ? aVistaNaVoltaDaLista() : null;
    return linha ? { ...feito, lugar: linha, focou: true } : feito;
  }
});
// A busca também muda "Aprovar todos": ele aprova os que ela mostra
document.addEventListener('input', e => { if (e.target instanceof Element && e.target.matches('[data-flt="age"]')) rAgenda(); });

// ——— A entrada do pedido aprovado na demanda ———

// O motivo, para o aviso, de o aprovado não ter entrado na demanda na hora
const MOTIVOS = {
  'outra-data': 'Outra data foi aberta enquanto isso: na data dele, “Importar” o põe na demanda.',
  'nao-lida': 'A escala desta data ainda não abriu: “Importar” o põe na demanda.',
  'nao-gravada': 'A escala desta data ainda não foi gravada: “Importar” o põe na demanda.',
  dados: 'Os resultados ou os programas dos cursos não foram lidos: “Importar” o põe na demanda depois de lê-los.',
  mudou: 'A escala desta data mudou em outro computador: “Atualizar” e depois “Importar”.',
  conexao: 'Não foi possível conferir a escala desta data: “Importar” o põe na demanda.',
  aluno: 'O aluno não está ativo no cadastro: ele entra quando voltar.'
};

// Os aprovados (ids) entram na demanda da data na hora, com as cinco condições: a data deles é a aberta, lida e já gravada,
// com os resultados e os cursos lidos, e a escala não mudou em outro computador (perguntado ao servidor agora); outra data
// aberta durante as esperas, 'outra-data'. Responde { entrou } (o que entrou ou voltou, e o que já voava: o voo que ficou na
// demanda depois de "Retirar aprovação") ou { motivo }: o aluno fora do cadastro ou inativo ('aluno'); a lista lida que
// não os mostra aprovados (a releitura falhou: 'conexao'). Nada é dito aqui: quem chama diz
async function entrarNaHora(ids, data) {
  const condicoes = () => motivoSemEntrada({ data, aberta: DATA, lida: dadosLidos, gravada: diaJaGravado(), indisponiveis: S.indisponiveis || [] });
  if (condicoes()) return { motivo: condicoes() };
  let mudou;
  try {
    mudou = await ApiClient.diaMudou(data);
  } catch {
    return { motivo: 'conexao' };
  }
  if (condicoes()) return { motivo: condicoes() };
  if (mudou) { marcarDiaMudou(data); return { motivo: 'mudou' }; }
  const { lista } = await solicitacoesDaDataLidas();
  if (DATA !== data) return { motivo: 'outra-data' };
  if (!lista) return { motivo: 'nao-lida' };
  const aprovados = lista.filter(s => ids.includes(s.id) && solicitacaoAprovada(s));
  if (!aprovados.length) return { motivo: 'conexao' };
  const { entraram, resumo } = porNaDemanda(aprovados, { religar: true });
  const voam = aprovados.filter(s => situacaoNaDemanda(s, S) === 'voa').length;
  if (entraram || voam) return { entrou: true, notas: notasDaEntrada(resumo) };
  return { motivo: resumo.semAluno || resumo.deInativo ? 'aluno' : 'conexao' };
}

// ——— Registrar ———

// Registrar um pedido (o botão: 'registrar', o envio; 'sem-aprovar'; 'excecao', fora do prazo; 'esperar', a lista de
// espera do 7º voo local armado). Um de cada vez: o segundo clique (ou Enter), enquanto o primeiro espera a leitura ou a
// gravação, registraria o mesmo pedido de novo
async function registrarPedido(botao, qual) {
  const form = $('#form-agenda');
  if (!podeEditarAgenda() || form.hasAttribute('aria-busy')) return;
  const nome = botao.textContent;
  form.setAttribute('aria-busy', 'true');
  botao.textContent = 'Registrando…';
  let depois;
  try {
    depois = await conferirERegistrar(qual);
  } finally {
    form.removeAttribute('aria-busy');
    botao.textContent = nome;
    nomearRegistrar();
  }
  // O botão que saiu com o registro ("Registrar na lista de espera", desarmado): o foco fica no formulário, no envio
  if (botao.hidden && [botao, document.body, null].includes(document.activeElement)) $('#form-agenda [type="submit"]').focus();
  await depois?.();
}

// Confere o pedido do formulário e o registra. Registrado, devolve o que falta fazer: ler os pedidos de novo, a entrada na
// demanda (o aprovado da data aberta) e o aviso
async function conferirERegistrar(qual) {
  const espera = qual === 'esperar';
  // A lista de espera é do pedido armado: ela registra com o botão que a confirmação armou
  const base = espera ? botaoArmado() : qual;
  const excecao = base === 'excecao';
  apagarErroDaAgenda();
  const aluno = S.stu.find(s => s.id === +$('#ag-aluno').value);
  const por = $('#ag-por').value.trim();
  // A lista dos horários como está agora no cadastro: o horário que saiu dela não é registrado
  const horarioNaTela = $('#ag-horario').value;
  atualizarRecursoEHorario();
  const { tipo: missao, doCurso } = missaoEscolhida(), recurso = $('#ag-recurso').value, horario = $('#ag-horario').value, horario2 = $('#ag-horario2').value || null;
  // A missão espera o aluno, o recurso espera a missão, e o horário, os três: só falta o que já pode ser escolhido
  const faltam = [
    !aluno && ['#ag-aluno', 'o aluno'], aluno && !missao && ['#ag-missao', 'a missão'], missao && !recurso && ['#ag-recurso', 'o recurso'],
    aluno && missao && recurso && !horario && ['#ag-horario', 'o horário']
  ].filter(Boolean);
  const recusar = (texto, ...campos) => { $('#ag-erro').textContent = texto; marcarInvalidos(...campos); focarNoPrimeiroInvalido(); return null; };
  if (faltam.length || !por) {
    return recusar([
      faltam.length ? `Escolha ${emLista(faltam.map(([, nome]) => nome))}.` : '', por ? '' : 'Informe quem anotou o pedido (“Registrado por”).'
    ].filter(Boolean).join(' '), ...faltam.map(([campo]) => campo), ...(por ? [] : ['#ag-por']));
  }
  if (horario !== horarioNaTela) return recusar('Os horários deste recurso mudaram no cadastro: confira o horário e registre de novo.', '#ag-horario');
  // A duração: de 0,1 h a 5 h, em décimos (o Ground tem 01h30)
  const horas = duracaoDigitada($('#ag-horas').value);
  if (horas === null) return recusar(ERRO_DA_DURACAO, '#ag-horas');
  const dia = dataDoFormulario(), chave = chaveDaConfirmacao(base);
  const pedido = { data: dia, horario, missao, recurso };
  const observacao = $('#ag-obs').value;
  // As causas que pedem a confirmação (sem os pedidos da data lidos, as duas conferências não são feitas, e quem diz do 7º
  // voo local é o servidor): o 7º voo local no horário (o próximo com vaga) e o voo já marcado do aluno na data (pode ser
  // um reagendamento feito por outra pessoa). A confirmação armada para este pedido vale para as causas que ela mostrou;
  // uma que ela não mostrou pede de novo. A lista de espera responde pelo 7º voo local
  const pedidos = await pedidosDoFormulario(dia) || [];
  const vaga = vagaDeVooLocal(pedidos, pedido, S.horarios);
  const marcados = pedidos.filter(p => p.aluno === aluno.id && p.data === dia && !p.cancelada_em);
  const causas = [...(marcados.length ? ['marcado'] : []), ...(vaga.ok ? [] : ['locais'])];
  const confirmadas = $('#form-agenda').dataset.confirmado === chave ? causasConfirmadas : [];
  const contexto = { aluno, dia, marcados, pedido, locais: vaga.locais, proximo: vaga.proximo };
  if (espera && !confirmadas.includes('locais')) return null;
  if (causas.some(c => !confirmadas.includes(c))) return armarConfirmacao(chave, causas, contexto);
  const aprovar = base !== 'sem-aprovar' && aprovaPedidos();
  let id;
  try {
    id = await ApiClient.registrarSolicitacao({
      ...pedido, aluno: aluno.id, aluno_nome: aluno.nm, janela: 'horario', horas, observacao, registrado_por: por, excecao,
      missaoDoCurso: doCurso ? doCurso.id : null, confirmarLimite: !espera && confirmadas.includes('locais'), horario2, aprovar, esperar: espera
    });
  } catch (err) {
    // Outra pessoa registrou o 6º local no mesmo horário enquanto isso (ou os pedidos da data não foram lidos): o servidor
    // recusou, e o formulário pede a confirmação dele, com as causas já mostradas (quantos já há: os 6 que o servidor contou),
    // com os dois botões
    if (err.code === 'PT422') {
      const cheio = [...pedidos, ...Array.from({ length: LIMITE_DE_VOOS_LOCAIS }, () => ({ ...pedido, janela: 'horario', cancelada_em: null }))];
      return armarConfirmacao(chave, [...new Set([...confirmadas, 'locais'])],
        { ...contexto, locais: Math.max(LIMITE_DE_VOOS_LOCAIS, vaga.locais || 0), proximo: vagaDeVooLocal(cheio, pedido, S.horarios).proximo });
    }
    return recusar(...recusaDoServidor(err, missao));
  }
  const locais = Math.max(LIMITE_DE_VOOS_LOCAIS, vaga.locais || 0);
  const registrado = { id, dia, aluno, descricao: `${missaoDoPedido({ missao, recurso, missao_do_curso: doCurso ? doCurso.id : null })} às ${horario}`, aprovado: aprovar || excecao, excecao, espera, locais, horario };
  lembrarRegistradoPor(por);
  desarmarConfirmacaoDaAgenda();
  esvaziarPedidoRegistrado();
  return () => depoisDeRegistrar(registrado);
}

// Depois do registro: os pedidos são lidos de novo (os da data dele e os de cada dia do calendário); o aprovado da data
// aberta entra na demanda (as cinco condições); e o aviso, a linha de estado do formulário e a linha do pedido à vista (N6)
async function depoisDeRegistrar({ id, dia, aluno, descricao, aprovado, excecao, espera, locais, horario }) {
  if (dia === DATA) marcarRecente(id);
  await Promise.all([lerPedidosDaAgenda(dia), lerContagemDosDias()]);
  const entrada = aprovado && dia === DATA ? await entrarNaHora([id], dia) : null;
  // A lista é a da data aberta: o pedido de outra data diz para qual ele foi
  const para = dia === DATA ? '' : ` para ${dataCurta(dia)}`;
  const base = excecao ? `Pedido registrado e aprovado${para} pela Exceção da Coordenação` : `Pedido registrado e aprovado${para}`;
  const aviso = espera ? `Pedido registrado${para} na lista de espera das ${horario}: já há ${locais} voos locais.`
    : !aprovado ? `Pedido registrado${para}: aguardando aprovação.`
      : !entrada ? `${base}.` : entrada.entrou ? `${base}: já está na demanda${entrada.notas}.` : `${base}. ${MOTIVOS[entrada.motivo] || ''}`.trim();
  showToast(aviso, 'ok');
  // A lista de espera diz também a aprovação: o da secretaria (e o "sem aprovar") ainda espera um operador
  const situacao = [espera ? 'na lista de espera' : '', !aprovado ? 'aguardando aprovação' : !entrada ? 'aprovado' : entrada.entrou ? 'aprovado, na demanda' : 'aprovado, fora da demanda'];
  $('#agenda-status').textContent = `Último pedido: ${aluno.nm} · ${descricao}${para} · ${situacao.filter(Boolean).join(', ')}.`;
  if (dia === DATA) trazerAVista(id);
}

// A linha do pedido que acabou de entrar na lista, à vista (sem tirar o foco do formulário). Numa vista só (o celular), o
// formulário está no lugar da lista: a linha fica à vista, com o foco, quando a lista volta (aoMostrar)
let aVistaNaVolta = null;
const linhaDoPedido = id => document.getElementById(`lin-age-${id}`);
function trazerAVista(id) {
  const linha = linhaDoPedido(id);
  aVistaNaVolta = null;
  if (linha && linha.getClientRects().length) linha.scrollIntoView({ block: 'nearest' });
  else aVistaNaVolta = id;
}
function aVistaNaVoltaDaLista() {
  const id = aVistaNaVolta;
  const linha = id !== null && linhaDoPedido(id);
  if (!linha || !linha.getClientRects().length) return null;
  aVistaNaVolta = null;
  const li = linha.closest('li') || linha;
  const botao = li.querySelector('.lista-botao');
  if (botao) botao.focus({ preventScroll: true });
  // Depois da rolagem que a volta restaura (a da entrada do histórico, js/views/telas.js) e do redesenho da lista, que pode
  // trocar a linha por outra igual
  requestAnimationFrame(() => { const agora = linhaDoPedido(id); if (agora) (agora.closest('li') || agora).scrollIntoView({ block: 'nearest' }); });
  return li;
}

// O texto e o campo da recusa do servidor (o código e a dica dele)
function recusaDoServidor(err, missao) {
  const fixo = HORARIOS_FIXOS[missao];
  if (err.code === '22023' && err.campo === 'recurso') return ['O servidor não aceitou este recurso para a missão: escolha o recurso de novo.', '#ag-recurso'];
  if (err.code === '22023' && err.campo === 'horario' && fixo) return [`${missao} sai sempre às ${fixo}: escolha o horário de novo.`, '#ag-horario'];
  if (err.code === '22023' && err.campo === 'horario2') return ['A 2ª preferência é outro horário, diferente da 1ª (o Noturno e o Voo Solo têm um só): escolha de novo.', '#ag-horario2'];
  if (err.code === '22023' && err.campo === 'missao') {
    return ['Esta missão do curso saiu do programa ou mudou de tipo em Cursos: escolha a missão de novo.', '#ag-missao'];
  }
  if (err.code === 'PT403' && err.campo === 'domingo') return ['O aeroclube não opera aos domingos: escolha outra data.', '#ag-data'];
  if (err.code === 'PT403' && err.campo === 'passada') return ['Esta data já passou: escolha outra data.', '#ag-data'];
  if (err.code === '42501' && err.campo === 'aprovar') return ['Esta conta não aprova pedidos: use “Registrar pedido”.'];
  return [{
    PT403: 'Prazo encerrado para esta data: os pedidos vão até as 13:00 do dia anterior (a segunda, até sábado às 10:00).',
    42501: 'Esta conta não pode registrar este pedido (a Exceção da Coordenação é só para operadores).',
    23514: 'Pedido incompleto: confira aluno, missão, recurso, horário e quem anotou.',
    22023: `Pedido inválido: o horário é obrigatório, e a duração vai de 0,1 h a ${DURACAO_MAXIMA_H} h.`
  }[err.code] || 'Não foi possível registrar o pedido. Verifique a conexão e tente de novo.'];
}

// A confirmação: o aviso de cada causa, e o botão em uso (o envio, "Registrar sem aprovar" ou a Exceção da Coordenação
// depois do prazo) passa a "Registrar mesmo assim", armado para este pedido (o aluno, a data, a missão, o recurso, o horário
// e o botão) e para estas causas. Com o 7º voo local, também "Registrar na lista de espera" (U3)
let causasConfirmadas = [];
let avisoDaConfirmacao = '';
const chaveDaConfirmacao = botao => [+$('#ag-aluno').value, dataDoFormulario(), $('#ag-missao').value, $('#ag-recurso').value, $('#ag-horario').value, botao].join('|');
function armarConfirmacao(chave, causas, { aluno, dia, marcados, pedido, locais: quantos, proximo }) {
  const marcado = causas.includes('marcado')
    ? `${aluno.nm} já tem voo marcado em ${dia.slice(8, 10)}/${dia.slice(5, 7)}: ${marcados.map(descreverPedido).join('; ')}. É um reagendamento ou mais um voo?` : '';
  const locais = causas.includes('locais') ? semVagaDeVooLocal(pedido, quantos, proximo) : '';
  const espera = `para ele esperar uma vaga às ${pedido.horario}, em “Registrar na lista de espera”.`;
  const fim = !locais ? 'Para registrar mais este, clique em “Registrar mesmo assim”.'
    : !marcado ? `Para registrar este como o ${quantos + 1}º, clique em “Registrar mesmo assim”; ${espera}` : `Para registrar mesmo assim, clique em “Registrar mesmo assim”; ${espera}`;
  causasConfirmadas = causas;
  avisoDaConfirmacao = [marcado, locais, fim].filter(Boolean).join(' ');
  const form = $('#form-agenda');
  form.dataset.confirmado = chave;
  if (locais) form.dataset.espera = '1';
  else delete form.dataset.espera;
  $('#ag-erro').textContent = avisoDaConfirmacao;
  marcarInvalidos();
  return null;
}
// O horário cheio de voos locais: o motivo (quantos já há: 6, ou mais com o 7º confirmado) e o próximo horário com vaga
function semVagaDeVooLocal({ horario, missao }, quantos, proximo) {
  const depois = missao === 'Voo Solo' ? 'O Voo Solo sai sempre às 06:30.' : proximo ? `Próximo horário com vaga: ${proximo}.` : 'Nenhum horário mais tarde tem vaga.';
  return `Horário cheio: já há ${quantos} voos locais (Voo Local, Voo Solo e TGL) às ${horario}, o máximo no mesmo horário (determinação da diretoria). ${depois}`;
}

// O segundo clique de um duplo clique (detail 2 ou mais) não faz nada: o primeiro arma a confirmação, e o segundo a daria
// sem o aviso ter sido lido (e o pedido ficaria com a confirmação do 7º voo local). Confirma um clique depois do aviso
const segundoClique = e => e.detail > 1;
$('#form-agenda [type="submit"]').addEventListener('click', e => { if (segundoClique(e)) e.preventDefault(); });
$('#form-agenda').onsubmit = e => { e.preventDefault(); registrarPedido($('#form-agenda [type="submit"]'), 'registrar'); };
$('#ag-registrar').onclick = e => { if (!segundoClique(e)) registrarPedido($('#ag-registrar'), 'sem-aprovar'); };
$('#ag-excecao').onclick = e => { if (!segundoClique(e)) registrarPedido($('#ag-excecao'), 'excecao'); };
$('#ag-esperar').onclick = e => { if (!segundoClique(e)) registrarPedido($('#ag-esperar'), 'esperar'); };
// Uma escolha nova: o erro era do pedido de antes. A confirmação armada vale para o pedido como estava: trocar o aluno, a
// missão, o recurso ou o horário a desfaz (trocar a data também: escolherDataDoPedido). Com ela ainda armada (a escolha que
// não mudou nada, ou a 2ª preferência), o aviso fica, ou volta no lugar do erro que o substituiu
const aoEscolher = escolher => () => {
  escolher();
  const form = $('#form-agenda');
  const armado = Boolean(form.dataset.confirmado) && form.dataset.confirmado === chaveDaConfirmacao(botaoArmado());
  if (!armado) desarmarConfirmacaoDaAgenda();
  const texto = armado ? avisoDaConfirmacao : '';
  if ($('#ag-erro').textContent !== texto) $('#ag-erro').textContent = texto;
  marcarInvalidos();
};
$('#ag-data').onchange = e => escolherDataDoPedido(e.target.value);
$('#ag-aluno').onchange = aoEscolher(escolherNaAgenda);
$('#ag-missao').onchange = aoEscolher(escolherMissaoNaAgenda);
$('#ag-recurso').onchange = aoEscolher(escolherNaAgenda);
$('#ag-horario').onchange = aoEscolher(escolherNaAgenda);
$('#ag-horario2').onchange = aoEscolher(escolherNaAgenda);

// "+ Novo pedido": nada escolhido, o formulário (numa vista só, no lugar da lista), com o foco no Aluno
function novoPedido() {
  tela.escolher(null, { abrir: true });
  $('#ag-aluno').focus();
}
$('#agenda-novo').onclick = novoPedido;
// "Registrar de novo…" (no detalhe; sem data-act: também da secretaria, que só consulta a escala): o formulário com os
// campos do pedido
document.addEventListener('click', e => {
  const b = e.target instanceof Element && e.target.closest('#det-age-repetir');
  if (!b || !podeEditarAgenda()) return;
  const pedido = pedidoDaLista(+b.dataset.id);
  if (!pedido) return;
  novoPedido();
  preencherComOPedido(pedido);
  anunciar(`O formulário tem o pedido de ${pedido.aluno_nome}: confira e registre.`);
});

// ——— Aprovar, retirar a aprovação e cancelar ———

// Quem aprova, retira a aprovação ou cancela (no modo compartilhado, o servidor guarda a conta): o nome lembrado do
// último pedido, senão o da conta
const quemAge = () => $('#ag-por').value.trim() || lembradoRegistradoPor() || ApiClient.autorAtual || '';
// Um botão de cada vez por pedido e ação: o clique seguinte, enquanto o servidor responde, não faz nada. O botão não é
// desligado (disabled): desligado, ele perde o foco, e o redesenho não teria onde devolvê-lo (o componente de lista põe o
// foco na linha quando a ação dela sai). O foco que ainda assim se perdeu (o botão que saiu sem lugar equivalente) fica
// na tela: na linha do pedido, no detalhe ou na lista
const ocupado = new Set();
const focoPerdido = () => { const a = document.activeElement; return !a || a === document.body || !a.getClientRects().length; };
const aVista = el => Boolean(el) && el.getClientRects().length > 0;
function focarDepoisDaAcao(onde, id) {
  if (!focoPerdido()) return;
  const linha = onde === 'linha' && document.querySelector(`#age .lista-botao[data-item="${CSS.escape(String(id))}"]`);
  // No detalhe: a primeira ação do rodapé que ficou (a que tomou o lugar da que saiu), senão o título
  const doDetalhe = onde === 'detalhe' && ([...document.querySelectorAll('#det-age .det-rodape button')].find(aVista) || document.getElementById('det-age-titulo'));
  const destino = [linha, doDetalhe, document.querySelector('#age .lista-botao')].find(aVista);
  if (destino) destino.focus();
}
const chaveDoBotao = b => `${b.dataset.act}:${b.dataset.id || ''}`;
// O botão ainda à espera do servidor: o clique seguinte nem arma a confirmação
const emEspera = b => ocupado.has(chaveDoBotao(b));
async function comBotaoOcupado(b, fazer) {
  const chave = chaveDoBotao(b);
  if (ocupado.has(chave)) return;
  ocupado.add(chave);
  const onde = b.closest('#det-age') ? 'detalhe' : b.closest('#age') ? 'linha' : 'barra';
  b.setAttribute('aria-disabled', 'true');
  b.setAttribute('aria-busy', 'true');
  try {
    await fazer();
  } finally {
    ocupado.delete(chave);
    b.removeAttribute('aria-disabled');
    b.removeAttribute('aria-busy');
    focarDepoisDaAcao(onde, b.dataset.id);
  }
}

// Aprova os pedidos (ids) e, os da data aberta, põe na demanda (as cinco condições). um: o "Aprovar" de um pedido
async function aprovar(b, ids, { um }) {
  if (!aprovaPedidos() || !ids.length) return;
  await comBotaoOcupado(b, async () => {
    const data = DATA;
    let aprovados;
    try {
      aprovados = await ApiClient.aprovarSolicitacoes(ids, { por: quemAge() || null });
    } catch (err) {
      showToast(err.code === '42501' ? 'Esta conta não aprova pedidos.' : 'Não foi possível aprovar. Verifique a conexão e tente de novo.');
      await lerSolicitacoesDaData();
      return;
    }
    await lerSolicitacoesDaData();
    if (data !== DATA) return;
    const fora = ids.length - aprovados.length;
    const deFora = fora ? ` (${fora === 1 ? '1 já estava aprovado ou foi cancelado' : `${fora} já estavam aprovados ou foram cancelados`} em outro computador)` : '';
    if (!aprovados.length) { showToast(`Nenhum pedido aprovado${deFora}.`); return; }
    const entrada = await entrarNaHora(aprovados, data);
    const n = aprovados.length;
    const quem = um ? 'Pedido aprovado' : `${n} ${n === 1 ? 'pedido aprovado' : 'pedidos aprovados'}`;
    const motivo = entrada.motivo ? (MOTIVOS[entrada.motivo] || '').replace('o põe', n === 1 ? 'o põe' : 'os põe').replace('data dele', n === 1 ? 'data dele' : 'data deles') : '';
    showToast(entrada.entrou ? `${quem}${deFora}: ${n === 1 ? 'já está' : 'já estão'} na demanda${entrada.notas}.` : `${quem}${deFora}. ${motivo}`, 'ok');
  });
}
aoAcionar('aprovar-pedido', b => aprovar(b, [+b.dataset.id], { um: true }));
aoAcionar('aprovar-todos', b => aprovar(b, aprovaveisNaBusca().ids, { um: false }));

// O pedido que ainda voa na demanda depois de sair dela: D2 não o tira (a conciliação do G tira); o aviso diz
const aindaVoa = pedido => Boolean(pedido) && situacaoNaDemanda(pedido, S) === 'voa';

async function retirarAprovacao(b) {
  const pedido = pedidoDaLista(+b.dataset.id);
  if (emEspera(b) || !aprovaPedidos() || !confirmado(b, 'Confirmar retirada')) return;
  await comBotaoOcupado(b, async () => {
    try {
      await ApiClient.retirarAprovacaoDaSolicitacao(+b.dataset.id, { por: quemAge() || null });
      showToast(`Aprovação retirada: o pedido volta a aguardar.${aindaVoa(pedido) ? ' O voo continua na demanda: tire-o lá (Voa), se for o caso.' : ''}`, 'ok');
    } catch (err) {
      showToast(err.code === 'PT403' ? 'A aprovação de uma data que já passou não é retirada.' : err.code === 'P0002'
        ? 'O pedido já estava sem aprovação ou foi cancelado em outro computador.' : 'Não foi possível retirar a aprovação. Verifique a conexão e tente de novo.');
    }
    await lerSolicitacoesDaData();
  });
}
aoAcionar('retirar-aprovacao', retirarAprovacao);

async function cancelarPedido(b) {
  const pedido = pedidoDaLista(+b.dataset.id);
  if (emEspera(b) || !podeEditarAgenda() || !confirmado(b, 'Confirmar cancelamento')) return;
  const por = quemAge() || (ApiClient.perfil ? '' : 'Operador');
  if (!por) {
    showToast('Informe seu nome em “Registrado por” (no formulário do pedido novo) para cancelar o pedido.');
    return;
  }
  await comBotaoOcupado(b, async () => {
    try {
      await ApiClient.cancelarSolicitacao(+b.dataset.id, por);
      const voa = aindaVoa(pedido) ? (aprovaPedidos() ? ' O voo continua na demanda: tire-o lá (Voa), se for o caso.' : ' Avise o operador: o voo continua na escala até ele tirá-lo.') : '';
      showToast(`Pedido cancelado.${voa}`, 'ok');
    } catch (err) {
      showToast(err.code === 'PT403' ? 'O pedido aprovado de uma data que já passou não é cancelado.' : err.code === 'P0002'
        ? 'O pedido já tinha sido cancelado em outro computador.' : 'Não foi possível cancelar o pedido. Verifique a conexão e tente de novo.');
    }
    await Promise.all([lerSolicitacoesDaData(), lerContagemDosDias()]);
  });
}
aoAcionar('cancelar-pedido', cancelarPedido, { confereAPermissao: true });

// "Atualizar" (a escala desta data mudou em outro computador) e "Tentar de novo" (a leitura dos pedidos que falhou)
document.addEventListener('click', e => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('#agenda-atualizar-data')) carregarData(DATA);
  else if (e.target.closest('#agenda-tentar')) lerSolicitacoesDaData();
});

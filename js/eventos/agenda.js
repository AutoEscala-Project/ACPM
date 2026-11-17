// A Agenda: o calendário, registrar e cancelar pedidos e importar os pedidos da data para a Demanda
import { gravarAlteracao, carregarData } from '../actions.js';
import { importarSolicitacoes, disponibilidadeDaSolicitacao, vagaDeVooLocal, ehDomingo } from '../agenda.js';
import { DURACAO_MAXIMA_H, LIMITE_DE_VOOS_LOCAIS } from '../config.js';
import { $, showToast } from '../dom.js';
import { fmtH, dataIsoValida } from '../format.js';
import { rotuloDaDisponibilidade, duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S, DATA, isGestor } from '../state.js';
import { ApiClient } from '../storage.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import { carregarMes, mudarMes, escolherDia, diaDaAgenda, lembrarRegistradoPor, podeEditarAgenda, rAgenda, preencherHorariosDaAgenda, pedidosDoAluno, descreverPedido, pedidosCarregados } from '../views/agenda.js';
import { rDem } from '../views/demanda.js';
import { lerPedidosDaData } from '../views/selos.js';

// Agenda: o calendário é livre para navegar (inclusive para o Gestor)
document.addEventListener('click', e => {
  const cal = e.target.closest('[data-cal]');
  if (!cal) return;
  if (cal.dataset.cal === 'mes') { mudarMes(+cal.dataset.delta); return; }
  escolherDia(cal.dataset.dia);
  // O dia escolhido na agenda abre no app inteiro (as outras abas ficam nessa data); o domingo não tem escala
  if (cal.dataset.dia !== DATA && dataIsoValida(cal.dataset.dia) && !ehDomingo(cal.dataset.dia)) {
    carregarData(cal.dataset.dia).catch(() => showToast('Não foi possível abrir essa data. Verifique a conexão e tente de novo.'));
  }
});

// Demanda e Agenda: traz os pedidos da agenda da secretaria para a data aberta (só acrescenta; não importa o mesmo
// pedido de novo)
async function importarDaAgenda() {
  if (isGestor()) return;
  const data = DATA;
  let solicitacoes;
  try {
    solicitacoes = await ApiClient.agenda(data, data);
  } catch {
    showToast('Não foi possível ler a agenda. Verifique a conexão e tente de novo.');
    return;
  }
  // A resposta chegou depois de trocar de data: os pedidos são de outra data
  if (DATA !== data) {
    showToast('A data mudou durante a importação da agenda: nada foi importado. Importe de novo na data certa.');
    return;
  }
  const pendentes = solicitacoes.filter(s => !s.cancelada_em && !S.importadas.includes(s.id));
  if (!pendentes.length) {
    showToast(`Nenhum pedido novo na agenda para ${DATA.slice(8, 10)}/${DATA.slice(5, 7)}.`);
    return;
  }
  const resumo = importarSolicitacoes(S, pendentes, { situacao: (S.resultados && S.resultados.situacao) || [] });
  gravarAlteracao('inc', pendentes.filter(s => S.stu.some(x => x.id === s.aluno))
    .map(s => `Agenda: ${s.aluno_nome} incluído (${s.missao} · ${rotuloDaDisponibilidade(disponibilidadeDaSolicitacao(s))}${s.horas ? ` · ${fmtH(+s.horas)}` : ''})`));
  rDem(); rAgenda();
  showToast(`${resumo.novos + resumo.atualizados} pedido(s) da agenda na demanda` +
    (resumo.semAluno ? ` · ${resumo.semAluno} de aluno que não está no cadastro (entra depois de cadastrado)` : '') + '.', 'ok');
}
$('#importar-agenda').onclick = importarDaAgenda;
$('#agenda-importar').onclick = importarDaAgenda;

// Os campos do pedido com erro (aria-invalid): o leitor de tela diz qual campo e lê o motivo (#ag-erro é a descrição deles)
const marcarInvalidos = (...ids) => ['#ag-aluno', '#ag-horario', '#ag-horas', '#ag-por'].forEach(id => $(id).setAttribute('aria-invalid', String(ids.includes(id))));

// Agenda: registrar um pedido (pela exceção da coordenação, fora do prazo) e cancelar (com confirmação)
async function registrarPedido(excecao) {
  if (!podeEditarAgenda()) return;
  $('#ag-erro').textContent = '';
  marcarInvalidos();
  const aluno = S.stu.find(s => s.id === +$('#ag-aluno').value);
  const por = $('#ag-por').value.trim();
  if (!aluno || !por) {
    $('#ag-erro').textContent = 'Escolha o aluno e informe quem anotou o pedido (“Registrado por”).';
    marcarInvalidos(...[!aluno && '#ag-aluno', !por && '#ag-por'].filter(Boolean));
    return;
  }
  // A duração: de 0,1 h a 5 h, em décimos (o Ground tem 01h30)
  const horas = duracaoDigitada($('#ag-horas').value);
  if (horas === null) {
    $('#ag-erro').textContent = ERRO_DA_DURACAO;
    marcarInvalidos('#ag-horas');
    return;
  }
  const dia = diaDaAgenda(), confirmacao = `${aluno.id}|${dia}`;
  // No máximo 6 voos locais no mesmo horário: o horário está indisponível, com o próximo
  const pedido = { data: dia, horario: $('#ag-horario').value, missao: $('#ag-missao').value };
  const vaga = vagaDeVooLocal(pedidosCarregados(), pedido, S.horarios);
  if (!vaga.ok) { $('#ag-erro').textContent = semVagaDeVooLocal(pedido, vaga.proximo); marcarInvalidos('#ag-horario'); return; }
  // O aluno que já tem voo marcado na data: pode ser um reagendamento feito por outra pessoa; o segundo clique confirma
  const marcados = pedidosDoAluno(aluno.id, dia);
  if (marcados.length && $('#form-agenda').dataset.confirmado !== confirmacao) {
    $('#form-agenda').dataset.confirmado = confirmacao;
    $('#form-agenda [type="submit"]').textContent = 'Registrar mesmo assim';
    $('#ag-erro').textContent = `${aluno.nm} já tem voo marcado em ${dia.slice(8, 10)}/${dia.slice(5, 7)}: ${marcados.map(descreverPedido).join('; ')}. É um reagendamento ou mais um voo? Para registrar mais este, clique em “Registrar mesmo assim”.`;
    return;
  }
  try {
    await ApiClient.registrarSolicitacao({
      data: dia, aluno: aluno.id, aluno_nome: aluno.nm, missao: $('#ag-missao').value, janela: 'horario',
      horario: $('#ag-horario').value, horas, observacao: $('#ag-obs').value, registrado_por: por, excecao
    });
  } catch (err) {
    $('#ag-erro').textContent = {
      PT403: 'Prazo encerrado para esta data: os pedidos vão até as 13:00 do dia anterior (a segunda, até sábado às 10:00).',
      42501: 'Esta conta não pode registrar este pedido (a Exceção da Coordenação é só para operadores).',
      23514: 'Pedido incompleto: confira aluno, missão, horário e quem anotou.',
      22023: `Pedido inválido: o horário é obrigatório, e a duração vai de 0,1 h a ${DURACAO_MAXIMA_H} h.`,
      // Outra pessoa agendou o 6º local no mesmo horário enquanto isso: o servidor recusou
      PT422: semVagaDeVooLocal(pedido, vagaDeVooLocal([...pedidosCarregados(), ...Array.from({ length: LIMITE_DE_VOOS_LOCAIS }, () => ({ ...pedido, janela: 'horario', cancelada_em: null }))], pedido, S.horarios).proximo)
    }[err.code] || 'Não foi possível registrar o pedido. Verifique a conexão e tente de novo.';
    return;
  }
  lembrarRegistradoPor(por);
  desarmarConfirmacaoDaAgenda();
  $('#ag-obs').value = '';
  $('#ag-aluno').value = '';
  showToast(excecao ? 'Pedido registrado pela Exceção da Coordenação.' : 'Pedido registrado.', 'ok');
  await carregarMes();
  lerPedidosDaData();
}
// O horário sem vaga de voo local: o motivo e o próximo horário possível
function semVagaDeVooLocal({ horario, missao }, proximo) {
  const depois = missao === 'Voo Solo' ? 'O Voo Solo sai sempre às 06:30.' : proximo ? `Próximo horário possível: ${proximo}.` : 'Nenhum horário mais tarde tem vaga.';
  return `Horário indisponível: já há ${LIMITE_DE_VOOS_LOCAIS} voos locais (Voo Local, Voo Solo e TGL) às ${horario}, o máximo no mesmo horário (determinação da diretoria). ${depois}`;
}

// Trocar o aluno desfaz a confirmação do voo já marcado
function desarmarConfirmacaoDaAgenda() {
  delete $('#form-agenda').dataset.confirmado;
  $('#form-agenda [type="submit"]').textContent = 'Registrar pedido';
}
$('#form-agenda').onsubmit = e => { e.preventDefault(); registrarPedido(false); };
$('#ag-excecao').onclick = () => registrarPedido(true);
$('#ag-aluno').addEventListener('change', () => { desarmarConfirmacaoDaAgenda(); $('#ag-erro').textContent = ''; marcarInvalidos(); });
$('#ag-missao').onchange = preencherHorariosDaAgenda;

async function cancelarPedido(b) {
  if (!podeEditarAgenda() || !confirmado(b, 'Confirmar cancelamento')) return;
  const por = $('#ag-por').value.trim();
  if (!por) {
    $('#ag-erro').textContent = 'Informe seu nome em “Registrado por” para cancelar o pedido.';
    marcarInvalidos('#ag-por');
    return;
  }
  try {
    await ApiClient.cancelarSolicitacao(+b.dataset.id, por);
    showToast('Pedido cancelado.', 'ok');
  } catch {
    $('#ag-erro').textContent = 'Não foi possível cancelar o pedido. Verifique a conexão e tente de novo.';
  }
  await carregarMes();
  lerPedidosDaData();
}
aoAcionar('cancelar-pedido', cancelarPedido, { confereAPermissao: true });

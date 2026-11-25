// A Agenda: os pedidos da data aberta, registrar (cada pedido para a data dele, "Data do pedido") e cancelar (importar os
// pedidos da data para a Demanda: js/eventos/importacao.js)
import { vagaDeVooLocal } from '../agenda.js';
import { DURACAO_MAXIMA_H, LIMITE_DE_VOOS_LOCAIS } from '../config.js';
import { $, showToast } from '../dom.js';
import { duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S, DATA } from '../state.js';
import { ApiClient } from '../storage.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import {
  abrirAgenda, rAgenda, podeEditarAgenda, lembrarRegistradoPor, preencherHorariosDaAgenda, descreverPedido, dataCurta, dataDoFormulario,
  escolherDataDoPedido, pedidosDoFormulario, lerPedidosDaAgenda, marcarInvalidos, apagarErroDaAgenda, desarmarConfirmacaoDaAgenda, nomearRegistrar
} from '../views/agenda.js';
import { lerPedidosDaData } from '../views/selos.js';
import { lerContagemDosDias } from '../views/trilho.js';
import { registrarDesenho } from '../redesenho.js';
import { registrarTela } from '../views/telas.js';

// O desenho da Agenda (js/redesenho.js), pelo papel: os pedidos. Ele não faz nada até a Agenda ser aberta
registrarDesenho('pedidos', rAgenda, { em: ['dados', 'perfil', 'pedidos'], ordem: 95 });
// Aberta, a Agenda lê de novo os pedidos da data aberta, os da data do pedido e os de cada dia do calendário
registrarTela('age', {
  aoMostrar: () => {
    abrirAgenda();
    lerPedidosDaData();
    lerContagemDosDias();
    rAgenda();
  }
});

// Agenda: registrar um pedido (pela exceção da coordenação, fora do prazo) e cancelar (com confirmação). Um de cada vez: o
// segundo clique, enquanto o primeiro espera a leitura ou a gravação, registraria o mesmo pedido de novo
async function registrarPedido(botao, excecao) {
  const form = $('#form-agenda');
  if (!podeEditarAgenda() || form.hasAttribute('aria-busy')) return;
  const nome = botao.textContent;
  form.setAttribute('aria-busy', 'true');
  botao.textContent = 'Registrando…';
  let depois;
  try {
    depois = await conferirERegistrar(excecao);
  } finally {
    form.removeAttribute('aria-busy');
    botao.textContent = nome;
    nomearRegistrar();
  }
  await depois?.();
}

// Confere o pedido do formulário e o registra. Registrado, devolve o que falta fazer: ler os pedidos de novo
async function conferirERegistrar(excecao) {
  apagarErroDaAgenda();
  const aluno = S.stu.find(s => s.id === +$('#ag-aluno').value);
  const por = $('#ag-por').value.trim();
  if (!aluno || !por) {
    $('#ag-erro').textContent = 'Escolha o aluno e informe quem anotou o pedido (“Registrado por”).';
    marcarInvalidos(...[!aluno && '#ag-aluno', !por && '#ag-por'].filter(Boolean));
    return null;
  }
  // A duração: de 0,1 h a 5 h, em décimos (o Ground tem 01h30)
  const horas = duracaoDigitada($('#ag-horas').value);
  if (horas === null) {
    $('#ag-erro').textContent = ERRO_DA_DURACAO;
    marcarInvalidos('#ag-horas');
    return null;
  }
  const dia = dataDoFormulario(), confirmacao = `${aluno.id}|${dia}`;
  // No máximo 6 voos locais no mesmo horário: o horário está indisponível, com o próximo (sem os pedidos da data lidos, esta
  // conferência e a do voo já marcado não são feitas)
  const pedido = { data: dia, horario: $('#ag-horario').value, missao: $('#ag-missao').value };
  const observacao = $('#ag-obs').value;
  const pedidos = await pedidosDoFormulario(dia) || [];
  const vaga = vagaDeVooLocal(pedidos, pedido, S.horarios);
  if (!vaga.ok) { $('#ag-erro').textContent = semVagaDeVooLocal(pedido, vaga.proximo); marcarInvalidos('#ag-horario'); return null; }
  // O aluno que já tem voo marcado na data: pode ser um reagendamento feito por outra pessoa; o segundo clique confirma
  const marcados = pedidos.filter(p => p.aluno === aluno.id && p.data === dia && !p.cancelada_em);
  if (marcados.length && $('#form-agenda').dataset.confirmado !== confirmacao) {
    $('#form-agenda').dataset.confirmado = confirmacao;
    $('#ag-erro').textContent = `${aluno.nm} já tem voo marcado em ${dia.slice(8, 10)}/${dia.slice(5, 7)}: ${marcados.map(descreverPedido).join('; ')}. É um reagendamento ou mais um voo? Para registrar mais este, clique em “Registrar mesmo assim”.`;
    return null;
  }
  try {
    await ApiClient.registrarSolicitacao({
      ...pedido, aluno: aluno.id, aluno_nome: aluno.nm, janela: 'horario', horas, observacao, registrado_por: por, excecao
    });
  } catch (err) {
    $('#ag-erro').textContent = {
      PT403: 'Prazo encerrado para esta data: os pedidos vão até as 13:00 do dia anterior (a segunda, até sábado às 10:00).',
      42501: 'Esta conta não pode registrar este pedido (a Exceção da Coordenação é só para operadores).',
      23514: 'Pedido incompleto: confira aluno, missão, horário e quem anotou.',
      22023: `Pedido inválido: o horário é obrigatório, e a duração vai de 0,1 h a ${DURACAO_MAXIMA_H} h.`,
      // Outra pessoa agendou o 6º local no mesmo horário enquanto isso: o servidor recusou
      PT422: semVagaDeVooLocal(pedido, vagaDeVooLocal([...pedidos, ...Array.from({ length: LIMITE_DE_VOOS_LOCAIS }, () => ({ ...pedido, janela: 'horario', cancelada_em: null }))], pedido, S.horarios).proximo)
    }[err.code] || 'Não foi possível registrar o pedido. Verifique a conexão e tente de novo.';
    return null;
  }
  lembrarRegistradoPor(por);
  desarmarConfirmacaoDaAgenda();
  $('#ag-obs').value = '';
  $('#ag-aluno').value = '';
  // A lista é a da data aberta: o pedido de outra data diz para qual ele foi
  const para = dia === DATA ? '' : ` para ${dataCurta(dia)}`;
  showToast(excecao ? `Pedido registrado${para} pela Exceção da Coordenação.` : `Pedido registrado${para}.`, 'ok');
  return () => Promise.all([lerPedidosDaAgenda(dia), lerContagemDosDias()]);
}
// O horário sem vaga de voo local: o motivo e o próximo horário possível
function semVagaDeVooLocal({ horario, missao }, proximo) {
  const depois = missao === 'Voo Solo' ? 'O Voo Solo sai sempre às 06:30.' : proximo ? `Próximo horário possível: ${proximo}.` : 'Nenhum horário mais tarde tem vaga.';
  return `Horário indisponível: já há ${LIMITE_DE_VOOS_LOCAIS} voos locais (Voo Local, Voo Solo e TGL) às ${horario}, o máximo no mesmo horário (determinação da diretoria). ${depois}`;
}

$('#form-agenda').onsubmit = e => { e.preventDefault(); registrarPedido($('#form-agenda [type="submit"]'), false); };
$('#ag-excecao').onclick = () => registrarPedido($('#ag-excecao'), true);
// Trocar o aluno ou a data desfaz a confirmação do voo já marcado
$('#ag-aluno').addEventListener('change', () => { desarmarConfirmacaoDaAgenda(); apagarErroDaAgenda(); });
$('#ag-data').onchange = e => escolherDataDoPedido(e.target.value);
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
  await Promise.all([lerPedidosDaData(), lerContagemDosDias()]);
}
aoAcionar('cancelar-pedido', cancelarPedido, { confereAPermissao: true });

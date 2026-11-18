// Agendar um voo na Escala: o botão "+ Agendar voo" (data-act="agendar"; data-agendar diz de onde: 'dia', a barra da
// Escala) abre o diálogo (js/views/agendamento.js). O voo confirmado é gravado como as outras alterações (a escala é
// refeita em volta dele), com "↶ Desfazer" no histórico: o voo novo é uma inclusão; o voo de hoje do aluno que mudou de
// lugar ou entrou na escala, uma edição. O peso digitado vai para o cadastro da pessoa, com uma entrada no histórico
// cada, na mesma gravação. Depois, o foco vai para o voo na escala
import { gravarAlteracao, logChange } from '../actions.js';
import { aplicarAgendamento, descricaoDoAgendamento, reversaoDoAgendamento, historicoDosPesos } from '../agendamento.js';
import { isGroundMission } from '../rules.js';
import { hm } from '../format.js';
import { chaveDoVoo } from '../voo.js';
import { $, showToast, visivel } from '../dom.js';
import { S, isGestor, stuBy } from '../state.js';
import { ApiClient } from '../storage.js';
import { aoAcionar } from './registro.js';
import { abrirAgendamento } from '../views/agendamento.js';
import { rIns, rAlu } from '../views/cadastros.js';
import { rDem } from '../views/demanda.js';

// O voo novo na escala: o status dele na lista, ou a barra no mapa; fora da vista (um filtro), o botão que abriu o diálogo
function focarNoVoo(fKey, contexto) {
  const voo = [...document.querySelectorAll(`#out select[data-f="fstatus"][data-fkey="${CSS.escape(fKey)}"], #out .tl-bar[data-pop="${CSS.escape(fKey)}"]`)].find(visivel);
  const abriu = (contexto.valor && document.querySelector(`[data-agendar="${CSS.escape(contexto.valor)}"]`)) || $('#btn-agendar');
  const alvo = voo || (abriu && visivel(abriu) ? abriu : null);
  if (alvo) alvo.focus();
}

// O aviso depois de gravar: o voo novo, o que mudou de lugar e o que entrou na escala
const FEITO = { mover: 'Voo movido', encaixar: 'Voo encaixado' };

function confirmarAgendamento({ proposta, base, avaliacao, contexto }) {
  if (isGestor() || ApiClient.readOnly) return;
  const descricao = descricaoDoAgendamento(S, proposta, avaliacao);
  const antes = aplicarAgendamento(S, base, proposta);
  gravarAlteracao(proposta.pedido ? 'mod' : 'inc', descricao, reversaoDoAgendamento(antes));
  // Os pesos digitados: no cadastro de cada um, na mesma gravação, sem reversão (como os pesos editados no cadastro)
  historicoDosPesos(antes).forEach(texto => logChange('mod', texto));
  rDem(); rAlu(); rIns();
  focarNoVoo(chaveDoVoo(antes.stuId, antes.mid), contexto);
  const aluno = stuBy(proposta.stuId);
  const feito = (proposta.pedido && FEITO[proposta.pedido.acao]) || 'Voo agendado';
  showToast(`${feito}: ${aluno ? aluno.nm : ''} às ${hm(proposta.a)} ${isGroundMission(proposta.mis) ? 'na sala de Ground' : `no ${proposta.r}`}.`, 'ok');
}

aoAcionar('agendar', b => abrirAgendamento(b.dataset.agendar || 'dia', { aoConfirmar: confirmarAgendamento }));

// O clique no espaço livre de uma linha do mapa (js/eventos/escala.js) abre o mesmo diálogo, com o recurso ou o instrutor
// da linha e o minuto do clique ({ r ou insId, minuto })
export const agendarNoMapa = contexto => abrirAgendamento(contexto, { aoConfirmar: confirmarAgendamento });

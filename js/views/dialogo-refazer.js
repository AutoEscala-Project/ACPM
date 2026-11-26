// A pergunta antes de refazer a escala (dialog#dlg-refazer, F1g: N10, R6). Na escala não aprovada, toda alteração feita
// na Escala que roda o motor pergunta antes de mudar qualquer coisa: o editor do voo, o instrutor, o status e o detalhe
// dele (depois do diálogo do status), o "✕", as Sugestões, o "+ Agendar voo" (a frase vai na confirmação dele) e os
// critérios. Com avisos, eles vêm nela: uma pergunta, não duas. "Cancelar" (e o Esc) não muda nada (quem perguntou
// redesenha o valor de antes); "Salvar e refazer" grava e roda o motor. As reversões do Histórico não perguntam (d47)
import { DATA } from '../state.js';
import { esc, rotuloDaData, hojeISO } from '../format.js';
import { $ } from '../dom.js';

let pedido = null;

// A data como na pergunta: "qui 26/11"
export const dataCurta = () => { const r = rotuloDaData(DATA, hojeISO()); return `${r.semanaCurta.replace('.', '')} ${r.data}`; };

// A frase da pergunta (também na confirmação do agendamento)
export const fraseDoRefazer = resumo => `A escala de ${dataCurta()} não está aprovada. Com esta alteração${resumo ? ` (${resumo})` : ''}, a escala inteira será refeita, e outros voos podem mudar de horário, de recurso ou de INVA.`;

function ligar() {
  const dlg = $('#dlg-refazer');
  if (dlg.dataset.ligado) return;
  dlg.dataset.ligado = '1';
  $('#form-refazer').addEventListener('submit', e => {
    e.preventDefault();
    if (!pedido) return;
    const { aoConfirmar } = pedido;
    pedido = null;
    dlg.close();
    aoConfirmar();
  });
  $('#refazer-cancelar').addEventListener('click', () => dlg.close());
  // Esc e "Cancelar" desistem: nada muda
  dlg.addEventListener('close', () => {
    if (!pedido) return;
    const { aoDesistir } = pedido;
    pedido = null;
    aoDesistir();
  });
}

// resumo: o que muda ("Maria: 08:20 → 09:10"); avisos: os da alteração ([{ texto }])
export function perguntarAntesDeRefazer({ resumo, avisos = [], aoConfirmar, aoDesistir = () => {} }) {
  ligar();
  const dlg = $('#dlg-refazer');
  pedido = { aoConfirmar, aoDesistir };
  $('#refazer-texto').textContent = fraseDoRefazer(resumo);
  $('#refazer-avisos').innerHTML = avisos.map(a => `<li class="${a.conflito ? 'conflito' : 'aviso'}">${esc(a.texto)}</li>`).join('');
  dlg.showModal();
  $('#refazer-cancelar').focus();
}

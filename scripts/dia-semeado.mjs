// A escala de uma data semeada na prévia (scripts/semear-dias-previa.mjs), como o app abre e grava a data: a volta de BH
// dos noturnos de ontem (noturnosDaVespera, como ApiClient.carregarDia), as horas dos instrutores com o fim do noturno de
// ontem (comRepousoDoNoturno: o aviso do repouso antes da volta) e as horas de fora do app (comHorasExternas), e o pino de
// cada Noturno (pinosDoNoturno, como a gravação do app: a escala refeita com ele, js/actions.js). Muda o estado (as
// voltas e os voos fixos, que vão para o dia gravado; as horas dos instrutores não são gravadas) e devolve a escala e as
// voltas. anterior: o dia guardado antes da data (dataAnterior), já migrado
import { runAllocationEngine } from '../js/engine.js';
import { noturnosDaVespera, comRepousoDoNoturno } from '../js/noturno.js';
import { comHorasExternas } from '../js/limites.js';
import { pinosDoNoturno } from '../js/fixos.js';

export function escalaSemeada(estado, { anterior, dataAnterior, data }) {
  const noturnos = noturnosDaVespera(anterior && dataAnterior ? { data: dataAnterior, conteudo: anterior } : null, data);
  if (noturnos.length) estado.noturnosDaVespera = noturnos;
  const horasDosInstrutores = comRepousoDoNoturno(comHorasExternas({}, estado.ins, data), noturnos);
  const motor = () => ({ ...runAllocationEngine({ ...estado, horasDosInstrutores }), data });
  let resultado = motor();
  const fixos = pinosDoNoturno(estado, resultado);
  if (fixos !== estado.fixos) {
    estado.fixos = fixos;
    resultado = motor();
  }
  return { resultado, noturnos };
}

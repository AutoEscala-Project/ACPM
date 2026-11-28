// As vistas de Recursos, no controle segmentado (.seg) do alto dela: a Disponibilidade do dia e o Cadastro (até o B, que
// faz de Recursos uma lista e um detalhe e tira este módulo; INVAs já é lista e detalhe desde o C). Os botões têm
// data-vista-rec ("dia", "cadastro"); a seção guarda a vista à vista em data-vista, e o CSS mostra só a parte dela
// (.vista-dia, .vista-cadastro). A vista escolhida fica na memória até a página recarregar; antes de a pessoa escolher,
// Recursos abre na Disponibilidade do dia (a Secretaria não vê a aba)
import { $ } from '../dom.js';

const DO_PERFIL = { rec: () => 'dia' };
const escolhidas = {};
// A vista aberta de uma aba: a escolhida, ou a do perfil
export const vistaDa = aba => escolhidas[aba] || DO_PERFIL[aba]();

// Mostra a vista escolhida (sem ela, a de antes, ou a do perfil) e marca o botão dela como pressionado
export function mostrarVista(aba, vista) {
  if (vista) escolhidas[aba] = vista;
  const atual = vistaDa(aba);
  const secao = $(`#s-${aba}`);
  if (!secao) return;
  secao.dataset.vista = atual;
  secao.querySelectorAll(`[data-vista-${aba}]`).forEach(b => {
    const essa = b.getAttribute(`data-vista-${aba}`) === atual;
    b.classList.toggle('on', essa);
    b.setAttribute('aria-pressed', String(essa));
  });
}

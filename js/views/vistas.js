// As vistas de uma aba, no controle segmentado (.seg) do alto dela: em Instrutores e em Recursos, a Disponibilidade do dia
// e o Cadastro. Os botões têm data-vista-<aba> (data-vista-ins="cadastro", data-vista-rec="dia"); a seção guarda a vista
// à vista em data-vista, e o CSS mostra só a parte dela (.vista-dia, .vista-cadastro). A vista escolhida fica na memória
// até a página recarregar; antes de a pessoa escolher, vale a do perfil: a Secretaria abre Instrutores no Cadastro (o
// trabalho dela ali são os dados pessoais), e os outros perfis, na Disponibilidade do dia (a rotina do dia). Recursos abre
// na Disponibilidade do dia para todos (a Secretaria não vê a aba)
import { $ } from '../dom.js';
import { ApiClient } from '../storage.js';

const DO_PERFIL = {
  ins: perfil => (perfil === 'secretaria' ? 'cadastro' : 'dia'),
  rec: () => 'dia'
};
const escolhidas = {};
// A vista aberta de uma aba: a escolhida, ou a do perfil
export const vistaDa = aba => escolhidas[aba] || DO_PERFIL[aba](ApiClient.perfil);

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

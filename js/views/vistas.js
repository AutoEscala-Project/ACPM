// As vistas de uma aba, no controle segmentado (.seg) do alto dela: em Instrutores, a Disponibilidade do dia e o Cadastro.
// Os botões têm data-vista-<aba> (data-vista-ins="cadastro"); a seção guarda a vista à vista em data-vista, e o CSS
// mostra só a parte dela (.vista-dia, .vista-cadastro). A vista escolhida fica na memória até a página recarregar; antes
// de a pessoa escolher, vale a do perfil: a Secretaria abre Instrutores no Cadastro (o trabalho dela ali são os dados
// pessoais), e os outros perfis, na Disponibilidade do dia (a rotina do dia)
import { $ } from '../dom.js';
import { ApiClient } from '../storage.js';

const DO_PERFIL = {
  ins: perfil => (perfil === 'secretaria' ? 'cadastro' : 'dia')
};
const escolhidas = {};
const vistaDa = aba => escolhidas[aba] || DO_PERFIL[aba](ApiClient.perfil);

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

// O botão de vista em que o clique caiu: a aba e a vista dele (ou null)
export function vistaDoBotao(alvo) {
  for (const aba of Object.keys(DO_PERFIL)) {
    const botao = alvo.closest(`[data-vista-${aba}]`);
    if (botao) return { aba, vista: botao.getAttribute(`data-vista-${aba}`) };
  }
  return null;
}

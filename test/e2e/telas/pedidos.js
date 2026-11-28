// O driver dos pedidos (dono: D2): a tela Pedidos, a lista dos pedidos da data aberta por estado (o componente de lista e
// detalhe, ul#age), o detalhe de um pedido (#det-age) e o formulário do pedido novo, onde a secretaria e o operador
// registram (no modo local e no compartilhado)

import { MIS } from '../../../js/config.js';

// Um campo do formulário ('data', 'aluno', 'missao', 'missao-motivo', 'recurso', 'recurso-motivo', 'horario',
// 'horario-motivo', 'horario2', 'horario2-motivo', 'horas', 'por', 'obs', 'registrar', 'excecao', 'esperar', 'erro':
// #ag-aluno…)
export const campoDaAgenda = (page, campo) => page.locator(`#ag-${campo}`);
// O botão principal do formulário: "Registrar e aprovar" (quem aprova) ou "Registrar pedido" (a Secretaria)
export const enviarDaAgenda = page => page.locator('#form-agenda [type="submit"]');
// A missão do curso no campo "Fase / missão", pelo código ("NAV-150NM")
export const missaoDoCursoNaAgenda = (page, codigo) => campoDaAgenda(page, 'missao').locator(`option[data-codigo="${codigo}"]`);
export async function escolherMissaoDoCurso(page, codigo) {
  await campoDaAgenda(page, 'missao').selectOption(await missaoDoCursoNaAgenda(page, codigo).getAttribute('value'));
}

// Os botões do formulário: 'aprovar' (o envio: "Registrar e aprovar", ou "Registrar pedido" para a Secretaria),
// 'sem-aprovar' ("Registrar sem aprovar"), 'excecao' ("Exceção da Coordenação") e 'esperar' ("Registrar na lista de espera")
const BOTOES_DO_FORMULARIO = { aprovar: '#form-agenda [type="submit"]', 'sem-aprovar': '#ag-registrar', excecao: '#ag-excecao', esperar: '#ag-esperar' };
export const botaoDoFormulario = (page, botao) => page.locator(BOTOES_DO_FORMULARIO[botao]);

// Registra um pedido: o aluno, depois a missão (codigo: a missão do curso do aluno; senão, o tipo de missão), que decide os
// recursos (recurso null: o da missão do curso, ou o padrão do tipo), o recurso decide os horários, e o pedido é sempre num
// horário específico (horario2: a 2ª preferência, outro horário específico), com a duração (horas null: a da missão).
// botao: o que registra (BOTOES_DO_FORMULARIO; o envio, por padrão)
export async function registrarPedido(page, { aluno = 'Aluno 1000', missao = 'Voo Local', codigo = null, recurso = null, horario = '06:30', horario2 = null, horas = null, por = 'Maria', obs = '', botao = 'aprovar' } = {}) {
  await campoDaAgenda(page, 'aluno').selectOption({ label: aluno });
  if (codigo) await escolherMissaoDoCurso(page, codigo);
  else await campoDaAgenda(page, 'missao').selectOption(missao);
  if (!codigo || recurso) await campoDaAgenda(page, 'recurso').selectOption(recurso || MIS[missao].defEq);
  await campoDaAgenda(page, 'horario').selectOption(horario);
  if (horario2) await campoDaAgenda(page, 'horario2').selectOption(horario2);
  if (horas !== null) await campoDaAgenda(page, 'horas').fill(String(horas));
  await campoDaAgenda(page, 'por').fill(por);
  await campoDaAgenda(page, 'obs').fill(obs);
  await botaoDoFormulario(page, botao).click();
}

// A lista: as linhas dos pedidos (na ordem dos grupos: aguardando aprovação, aprovados, cancelados), a de um pedido (pelo id,
// ou pelo texto dela), o cabeçalho de um grupo ('aguardando', 'aprovados', 'cancelados') e a busca
export const linhasDosPedidos = page => page.locator('#age > li.lista-linha');
export const linhaDaLista = (page, pedido) => (typeof pedido === 'number'
  ? page.locator(`#age > li.lista-linha:has(#lin-age-${pedido})`)
  : linhasDosPedidos(page).filter({ hasText: pedido }));
export const grupoDosPedidos = (page, grupo) => page.locator(`#grp-age-${grupo}`);
export const buscaDosPedidos = page => page.locator('[data-flt="age"]');
// O "Aprovar" da linha de um pedido
export const aprovarNaLinha = (page, pedido) => linhaDaLista(page, pedido).locator('[data-act="aprovar-pedido"]');
// Escolhe um pedido na lista: o detalhe dele aparece
export async function escolherPedido(page, pedido) {
  await linhaDaLista(page, pedido).locator('.lista-botao').click();
}
// O detalhe do pedido escolhido, uma linha dele ("Recurso", "1ª preferência"…) e as ações: 'aprovar', 'retirar',
// 'cancelar', 'repetir' ("Registrar de novo…")
export const detalheDoPedido = page => page.locator('#det-age .det');
export const campoDoDetalhe = (page, rotulo) => page.locator('#det-age .det-campo').filter({ has: page.locator('.det-rotulo', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('.det-valor');
export const acaoDoPedido = (page, acao) => page.locator(`#det-age-${acao}`);
// Os botões da barra e dos avisos: 'novo' ("+ Novo pedido"), 'aprovar-todos', 'importar', 'atualizar-data'
export const botaoDosPedidos = (page, botao) => page.locator(`#agenda-${botao}`);
// Os avisos da lista (os aprovados fora da demanda, a escala que mudou em outro computador) e a linha de estado do formulário
export const avisoDosPedidos = page => page.locator('#agenda-aviso');
export const estadoDoFormulario = page => page.locator('#agenda-status');

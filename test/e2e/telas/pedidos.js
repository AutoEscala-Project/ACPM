// O driver dos pedidos (dono: D2): o formulário da Agenda, onde a secretaria e o operador registram os pedidos da data
// (no modo local e no compartilhado)

// Um campo do formulário ('aluno', 'missao', 'horario', 'horas', 'por', 'obs', 'excecao', 'erro': #ag-aluno…)
export const campoDaAgenda = (page, campo) => page.locator(`#ag-${campo}`);

// Registra um pedido: o pedido é sempre num horário específico, com a duração (horas null: a da missão)
export async function registrarPedido(page, { aluno = 'Aluno 1000', missao = 'Voo Local', horario = '06:30', horas = null, por = 'Maria', obs = '' } = {}) {
  await campoDaAgenda(page, 'aluno').selectOption({ label: aluno });
  await campoDaAgenda(page, 'missao').selectOption(missao);
  await campoDaAgenda(page, 'horario').selectOption(horario);
  if (horas !== null) await campoDaAgenda(page, 'horas').fill(String(horas));
  await campoDaAgenda(page, 'por').fill(por);
  await campoDaAgenda(page, 'obs').fill(obs);
  await page.locator('#form-agenda [type="submit"]').click();
}

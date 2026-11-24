// Faz sem deixar o erro parar quem chamou: ele vai para o console (os testes E2E falham com qualquer console.error) e a
// resposta é null. O foco depois de redesenhar (js/dom.js) e os desenhos das telas (js/redesenho.js) passam por aqui: um
// erro neles não pode impedir o resto do redesenho, nem a gravação e o histórico. Sem DOM: os testes unitários o importam
export function semFalhar(fazer) {
  try {
    return fazer();
  } catch (erro) {
    console.error(erro);
    return null;
  }
}

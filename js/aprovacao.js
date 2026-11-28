// A Aprovação da escala da data (H, `section#s-apr`): o que aprovar, reabrir e "Fixar os N voos novos" fazem com os voos
// fixos, sem rodar o motor. Aprovar fixa o que a escala deixa entrar (cada voo dela onde está, com as marcas do operador:
// fixosAoAprovar) e diz quando e quem; reabrir solta o que não é do operador nem do status que fixa (fixosAoReabrir) e
// fica registrada (reabertura, formato 30; d33). Na escala aprovada, o voo que entrou depois (sem pino: o 1º da lista de
// espera que a conciliação pôs no lugar do cancelado, E) é um voo novo; o botão o fixa onde está (fixarNoLugar). Puro
import { fixosAoAprovar, fixosAoReabrir, fixarNoLugar, normalizarAprovacao } from './fixos.js';

// { fixos, aprovacao: { em, por } }; sem a data válida, null (nada muda). estado: os fixos de agora; out: a escala da tela
export function aprovar({ fixos }, out, { em, por }) {
  const aprovacao = normalizarAprovacao({ em, por });
  return aprovacao ? { fixos: fixosAoAprovar(fixos, out || []), aprovacao } : null;
}

// { fixos, aprovacao: null, reabertura: { em, por } }; sem a data válida, null (nada muda)
export function reabrir({ fixos, fStatus }, { em, por }) {
  const reabertura = normalizarAprovacao({ em, por });
  return reabertura ? { fixos: fixosAoReabrir(fixos, fStatus), aprovacao: null, reabertura } : null;
}

// Os voos da escala sem pino, na ordem dela (a volta do noturno não conta: ela segue o pino da ida)
export const voosNovos = (fixos, out) => (out || []).filter(o => !o.trecho && !Object.hasOwn(fixos || {}, o.fKey));

// Os voos fixos com cada voo novo fixo onde está; os outros pinos não mudam
export const fixarVoosNovos = (fixos, out) => fixarNoLugar(fixos, { out: out || [] }, voosNovos(fixos, out).map(o => o.fKey));

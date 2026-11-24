// A porta de cada pasta: o app (npm run serve) na porta da pasta e os testes E2E na seguinte. Duas pastas do mesmo
// repositório (worktrees) rodam ao mesmo tempo sem disputar a 4173, e os testes de uma nunca abrem os arquivos da outra.
// Duas pastas coincidem 1 vez em 350: na segunda, o app para com EADDRINUSE e os testes com o "is already used" do
// Playwright; PORT=<outra porta par> escolhe outra para os dois (o app nela, os testes na seguinte).
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// 4200 + 2 × (os seis primeiros dígitos hexadecimais do sha1 da pasta, módulo 350): uma porta par, de 4200 a 4898
export function portaDaPasta(raiz) {
  const hash = createHash('sha1').update(resolve(raiz)).digest('hex');
  return 4200 + 2 * (parseInt(hash.slice(0, 6), 16) % 350);
}

// A porta do app (npm run serve): PORT, se for um número, senão a da pasta
export const portaDoApp = (raiz, env = process.env) => Number(env.PORT) || portaDaPasta(raiz);

// A porta dos testes E2E (playwright.config.js): a seguinte à do app, que nunca é a do app de outra pasta
export const portaDosTestes = (raiz, env = process.env) => portaDoApp(raiz, env) + 1;

// A porta de cada pasta: o app (npm run serve) na porta da pasta e os testes E2E na seguinte. Duas pastas do mesmo
// repositório (worktrees) rodam ao mesmo tempo sem disputar a 4173, e os testes de uma nunca abrem os arquivos da outra.
// Duas pastas coincidem 1 vez em 350: a segunda para com EADDRINUSE e escolhe outra com PORT.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// 4200 + 2 × (os seis primeiros dígitos hexadecimais do sha1 da pasta, módulo 350): uma porta par, de 4200 a 4898
export function portaDaPasta(raiz) {
  const hash = createHash('sha1').update(resolve(raiz)).digest('hex');
  return 4200 + 2 * (parseInt(hash.slice(0, 6), 16) % 350);
}

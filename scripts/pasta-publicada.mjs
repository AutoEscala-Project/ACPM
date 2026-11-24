// Monta a pasta que vai para o Cloudflare Pages (.github/workflows/publicar.yml): só o que o navegador carrega, as duas
// páginas, css, js, img e o modelo do Excel. Testes, migrações, documentos, scripts e qualquer arquivo fora do git
// ficam de fora. Uso: node scripts/pasta-publicada.mjs [destino] (padrão: publicar/, fora do git)
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLICADOS = ['index.html', 'painel.html', 'css', 'js', 'img', 'modelos'];

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = resolve(raiz, process.argv[2] ?? 'publicar');
if (destino === raiz) throw new Error('O destino não pode ser a raiz do repositório');

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });
for (const item of PUBLICADOS) await cp(join(raiz, item), join(destino, item), { recursive: true });
console.log(`Pasta publicada em ${destino}: ${PUBLICADOS.join(', ')}`);

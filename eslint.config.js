// npm run lint: as regras recomendadas do ESLint (variável ou importação sem uso, bloco vazio, nome indefinido, código
// que nunca roda…) nos módulos do app (navegador), nos scripts e nos testes (Node). Os testes no navegador mandam funções
// para a página (page.evaluate), que usam window e document.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // publicar/ e .wrangler/: a cópia que vai para o Cloudflare (scripts/pasta-publicada.mjs) e os temporários do wrangler
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'publicar/', '.wrangler/'] },
  js.configs.recommended,
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/**/*.mjs', '*.js', 'test/unit/**/*.js', 'test/helpers/**/*.js'], languageOptions: { globals: globals.node } },
  { files: ['test/e2e/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // A função meteorologia do Supabase (Deno): os módulos em JavaScript usam só o que o Deno e o Node têm em comum (fetch,
  // Request, Response, AbortSignal)
  { files: ['supabase/functions/**/*.js'], languageOptions: { globals: globals.node } },
  // { chave: _, ...resto } tira uma chave de uma cópia: a chave que sai não conta como variável sem uso
  { rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] } }
];

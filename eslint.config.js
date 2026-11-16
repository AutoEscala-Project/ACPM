// npm run lint: as regras recomendadas do ESLint (variável ou importação sem uso, bloco vazio, nome indefinido, código
// que nunca roda…) nos módulos do app (navegador), nos scripts e nos testes (Node). Os testes no navegador mandam funções
// para a página (page.evaluate), que usam window e document.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/**/*.mjs', '*.js', 'test/unit/**/*.js', 'test/helpers/**/*.js'], languageOptions: { globals: globals.node } },
  { files: ['test/e2e/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // { chave: _, ...resto } tira uma chave de uma cópia: a chave que sai não conta como variável sem uso
  { rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] } }
];

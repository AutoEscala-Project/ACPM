// O driver de Cursos (sem dono na linha de produção): as telas que os testes do celular e da acessibilidade percorrem
import { expect } from '@playwright/test';
import { irPara } from './casca.js';

// Cursos mostra um curso de cada vez, escolhido no alto: o PC (o PP é o que abre). No fim, Cursos volta ao primeiro
// curso. nome null: só o passo, sem conferir a tela
export const ESTADOS = [
  {
    nome: 'cursos: PC',
    preparar: async page => {
      await irPara(page, 'cur');
      await page.locator('#cur-ver-PC').click();
      await expect(page.locator('#cursos .curso[data-curso="PC"]')).toBeVisible();
    }
  },
  { nome: null, preparar: page => page.locator('#cur-ver-PP').click() }
];

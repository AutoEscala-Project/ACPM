// A escala acompanha os dados: é refeita a cada alteração do operador e já está pronta ao abrir a aba Escala.
import { test, expect, abrirSintetico, abrirComExemplo, irPara, lerEscala, AMANHA, entrar, alternarDisponivel, exportar } from './fixtures.js';
import { instalarSupabaseFalso, documentosAtuais, CONTAS } from './supabase-falso.js';
import { estadoSintetico } from '../helpers/estado.js';
import { comExemplo } from '../helpers/exemplo.js';

const MATRICULA = /\b(P[PRT]-[A-Z]{3})\b/;

test.describe('Escala automática', () => {
  test('cada alteração refaz a escala na hora: o avião em manutenção sai e, religado, volta', async ({ page }) => {
    await abrirComExemplo(page);
    await irPara(page, 'esc');
    const antes = await lerEscala(page);
    const matricula = antes.linhas.map(l => (l.match(MATRICULA) || [])[1]).find(Boolean);
    expect(matricula).toBeTruthy();

    await irPara(page, 'rec');
    await alternarDisponivel(page, matricula, false);
    await irPara(page, 'esc');
    expect((await lerEscala(page)).linhas.some(l => l.includes(matricula))).toBe(false);

    // Para voltar atrás, basta alterar de novo
    await irPara(page, 'rec');
    await alternarDisponivel(page, matricula, true);
    await irPara(page, 'esc');
    expect(await lerEscala(page)).toEqual(antes);
  });

  test('sem ninguém para voar, a aba Escala explica que a escala se monta sozinha', async ({ page }) => {
    await abrirSintetico(page);
    await irPara(page, 'esc');
    await expect(page.locator('#out')).toContainText('Nenhum voo nesta data');
    await expect(page.locator('#out')).toContainText('automaticamente');
  });

  test('data sem escala gravada: a escala calculada aparece na hora e é gravada junto com a primeira alteração', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), AMANHA));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'esc');
    expect((await lerEscala(page)).linhas.length).toBeGreaterThan(20);
    expect(servidor.gravacoes).toEqual([]);

    await irPara(page, 'rec');
    await alternarDisponivel(page, 'PR-BTB', false);
    await expect.poll(() => servidor.dias.get(AMANHA).conteudo.av['PR-BTB']).toBe(false);
    const { resultado } = servidor.dias.get(AMANHA).conteudo;
    expect(resultado.data).toBe(AMANHA);
    expect(resultado.out.length).toBeGreaterThan(20);
    expect(resultado.out.some(o => o.r === 'PR-BTB')).toBe(false);
    expect(servidor.gravacoes.filter(g => g.chave === `dia:${AMANHA}`)).toHaveLength(1);
  });

  test('exportar uma escala só calculada a grava (BI e dia seguinte); exportar de novo não grava outra vez', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), AMANHA));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'esc');
    await exportar(page, 'csv');
    await expect.poll(() => (servidor.dias.get(AMANHA).conteudo.resultado || { out: [] }).out.length).toBeGreaterThan(20);
    await exportar(page, 'pdf');
    await exportar(page, 'csv');
    await exportar(page, 'xlsx');
    expect(servidor.gravacoes.filter(g => g.chave === `dia:${AMANHA}`)).toHaveLength(1);
  });

  test('exportar o Excel também grava a escala só calculada', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), AMANHA));
    await entrar(page, CONTAS.operador);
    await irPara(page, 'esc');
    await exportar(page, 'xlsx');
    await expect.poll(() => (servidor.dias.get(AMANHA).conteudo.resultado || { out: [] }).out.length).toBeGreaterThan(20);
    expect(servidor.gravacoes.filter(g => g.chave === `dia:${AMANHA}`)).toHaveLength(1);
  });

  test('o gestor exporta sem gravar', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), AMANHA));
    await entrar(page, CONTAS.gestor);
    await irPara(page, 'esc');
    await exportar(page, 'csv');
    const [planilha] = await exportar(page, 'xlsx');
    expect(planilha.suggestedFilename()).toBe(`escala-acpm-${AMANHA}.xlsx`);
    expect(servidor.gravacoes).toEqual([]);
  });

  test('o gestor também vê a escala calculada de uma data ainda sem escala gravada, sem gravar nada', async ({ page, context }) => {
    const servidor = await instalarSupabaseFalso(context, documentosAtuais(comExemplo(estadoSintetico()), AMANHA));
    await entrar(page, CONTAS.gestor);
    await irPara(page, 'esc');
    expect((await lerEscala(page)).linhas.length).toBeGreaterThan(20);
    expect(servidor.gravacoes).toEqual([]);
  });
});

// Recursos como lista e detalhe (B, com o componente do F2): a lista por categoria, cada cabeçalho com o detalhe da
// categoria (os horários de decolagem); a Sala Ground no grupo dela; "Ordem no hangar" o item fixo do alto (com o hangar
// ligado); em cada linha o "Disponível" desta data e o "Ativo" do cadastro, com "Mostrar inativos"; o detalhe do recurso,
// "Nesta data" e depois "todas as datas", com "Agendar voo no <reg>" e "Retirar da frota…"; "+ Novo recurso" no detalhe; a
// busca pela matrícula. Os horários fechados da data ficam na Escala (fechamentos.spec.js)
import {
  test, comHangar, expect, abrir, abrirSintetico, abrirComExemplo, irPara, abrirEscala, lerEscala, abrirHistorico, campoDaAgenda,
  alternarDisponivel, caixaDisponivel, fecharHorarios, abrirRecursos, abrirRecurso, abrirCategoria, abrirHangar, linhaDoRecurso,
  linhasDosRecursos, gruposDosRecursos, cabecalhoDaCategoria, buscaDosRecursos, contagemDosRecursos, detalheDoRecurso, campoDoRecurso,
  horasDoRecurso, marcarAtributo, retirarRecurso, ordemNoHangar, horariosDaCategoria, confirmar, nenhumNaLista, larguraDaPagina, alvosPequenos,
  semNome, paineisQueRolamParaOLado, diaSeguinte, listaDosRecursos, appPronto, AMANHA
} from './fixtures.js';
import { documentosAtuais } from './supabase-falso.js';
import { aluno, apenas, cenario, instrutor } from '../helpers/montar.js';
import { FROTA_INICIAL } from '../../js/frota.js';

const CATEGORIAS = [/^C152/, /^C172/, /^Simulador/, /^PA-34/, /^Sala Ground/];
const regsDaLista = page => linhasDosRecursos(page).evaluateAll(lis => lis.map(li => li.dataset.id));

// O app com esta frota no cadastro (no formato atual, neste navegador)
async function abrirComFrota(page, frota) {
  const estado = cenario();
  estado.frota = frota;
  const { documentos: { cadastro }, dias } = documentosAtuais(estado, AMANHA);
  const docs = { acpm4_cadastro: cadastro, [`acpm4_dia_${AMANHA}`]: dias[AMANHA] };
  await page.addInitScript(json => {
    if (localStorage.getItem('acpm4_cadastro')) return;
    for (const [chave, valor] of Object.entries(JSON.parse(json))) localStorage.setItem(chave, JSON.stringify(valor));
  }, JSON.stringify(docs));
  await page.goto('./');
  await appPronto(page);
}

test.describe('Recursos: a lista por categoria', () => {
  test('estado inicial: a lista por categoria, a Sala Ground no grupo dela, 27 recursos; nenhum instrutor e nenhum aluno', async ({ page }) => {
    await abrir(page);
    await abrirRecursos(page);
    const secao = page.locator('#s-rec');
    await expect(secao).toHaveAttribute('data-forma', 'lista-detalhe');
    // As duas vistas e o filtro das categorias saíram; os horários fechados estão na Escala
    await expect(secao.locator('[data-vista-rec], #flt-rec-cat, #fechamentos, #eqs, #frota')).toHaveCount(0);
    await expect(gruposDosRecursos(page)).toHaveText(CATEGORIAS);
    await expect(linhasDosRecursos(page)).toHaveCount(27);
    await expect(contagemDosRecursos(page)).toHaveText('27 recursos');
    await expect(linhaDoRecurso(page, 'PR-JPL').locator('.lista-l2')).toContainText('Só Parafuso');
    // A Sala Ground: a única do grupo dela, com o "Disponível" e sem o "Ativo" (ela não é da frota)
    expect(await page.locator('#rec > li').evaluateAll(lis => lis.slice(-2).map(li => li.dataset.chave))).toEqual(['g:ground', 'i:SALA-GROUND']);
    await expect(caixaDisponivel(page, 'SALA-GROUND')).toBeChecked();
    await expect(linhaDoRecurso(page, 'SALA-GROUND').locator('.lista-chave')).toHaveCount(0);
    // Nada escolhido: o detalhe diz o que fazer
    await expect(page.locator('#det-rec')).toContainText('Escolha um recurso ou uma categoria na lista.');
    await expect(page.locator('#inst .cd')).toHaveCount(0);
    await expect(page.locator('#inst')).toContainText('Nenhum instrutor cadastrado');
    await irPara(page, 'alu');
    await expect(page.locator('#alu')).toContainText('Nenhum aluno cadastrado');
  });

  test('a linha: o tipo e os atributos, as horas até a revisão, a data com o que voa; o "Disponível" desta data e o "Ativo" do cadastro', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { p1: 1, p2: 1 })], semAeronaves: apenas('C152', 'PP-LJV'), horas: { 'PP-LJV': 42 } }) });
    await abrirRecursos(page);
    const linha = linhaDoRecurso(page, 'PP-LJV');
    await expect(linha.locator('.lista-titulo')).toHaveText('PP-LJV');
    await expect(linha.locator('.lista-l2-texto')).toHaveText('C152');
    await expect(linha.locator('.lista-meta')).toHaveText('8 h');
    await expect(linha.locator('.lista-l3')).toHaveText('11/11 · disponível · 1 h na escala');
    await expect(linha.locator(':scope > .lista-rapida input')).toBeChecked();
    await expect(linha.locator(':scope > .lista-rapida input')).toHaveAccessibleName('PP-LJV disponível em 11/11');
    await expect(linha.locator(':scope > .lista-chave')).toHaveAttribute('aria-checked', 'true');
    await expect(linha.locator(':scope > .lista-chave')).toHaveAccessibleName('PP-LJV ativo no cadastro');
    await expect(linhaDoRecurso(page, 'PR-VOB').locator('.lista-l3')).toHaveText('11/11 · em manutenção');
    await expect(linhaDoRecurso(page, 'PR-VOM').locator('.lista-l2-texto')).toHaveText('PA-34 · Exige Avião PR-VOM');
    await expect(linhaDoRecurso(page, 'PR-CPL').locator('.lista-l2-texto')).toHaveText('C172 · Só VFR');
    await expect(linhaDoRecurso(page, 'SIM-MONO-A').locator('.lista-meta')).toHaveCount(0);
    // O cabeçalho: quantos estão disponíveis nesta data e os horários de decolagem da categoria
    await expect(cabecalhoDaCategoria(page, 'C152')).toHaveText('C152 1 de 13 disponíveis · 8 horários de decolagem');
    await expect(cabecalhoDaCategoria(page, 'PA-34')).toHaveText('PA-34 3 de 3 disponíveis · 21 horários de decolagem');
  });

  test('o ponto da linha: o avião parado para a revisão e o que está perto dela', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { p1: 390, p2: -1 }), aluno(1001, { p1: 610, p2: -1 })], semAeronaves: apenas('C152', 'PP-LJV'), horas: { 'PP-LJV': 49 } }) });
    await abrirRecursos(page);
    const linha = linhaDoRecurso(page, 'PP-LJV');
    await expect(linha.locator('.lista-ponto.erro')).toHaveAttribute('title', 'parou para a revisão de 50 horas');
    await expect(linha.locator('.lista-l3')).toHaveText(/^11\/11 · parou para a revisão de 50 horas às \d\d:\d\d$/);
  });

  test('aeronave em manutenção pela chave da linha: o Histórico e a gravação', async ({ page }) => {
    await abrirSintetico(page);
    await alternarDisponivel(page, 'PR-BTB', false);
    await expect(linhaDoRecurso(page, 'PR-BTB').locator('.lista-l3')).toHaveText('11/11 · em manutenção');
    await expect(page.locator('#log-cnt')).toHaveText('1');
    await expect(page.locator('#audit-log-list')).toContainText('PR-BTB: Manutenção');
    await expect(cabecalhoDaCategoria(page, 'C152')).toContainText('12 de 13 disponíveis');
    await page.reload();
    await abrirRecursos(page);
    await expect(caixaDisponivel(page, 'PR-BTB')).not.toBeChecked();
    await expect(page.locator('#log-cnt')).toHaveText('1');
  });

  test('a Sala Ground tem "Disponível" nesta data (S4): ligada sem a chave; desligada, "indisponível", no Histórico e revertida', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    const sala = linhaDoRecurso(page, 'SALA-GROUND');
    await expect(caixaDisponivel(page, 'SALA-GROUND')).toHaveAccessibleName('Sala Ground disponível em 11/11');
    await expect(sala.locator('.lista-l3')).toHaveText('11/11 · disponível');
    await alternarDisponivel(page, 'SALA-GROUND', false);
    await expect(sala.locator('.lista-l3')).toHaveText('11/11 · indisponível');
    await expect(page.locator('#audit-log-list')).toContainText('Sala Ground: Indisponível');
    // O detalhe: sem horas, sem revisão, sem "Retirar da frota…"
    await abrirRecurso(page, 'SALA-GROUND');
    await expect(detalheDoRecurso(page).locator('input[data-a="horas"], [data-act="revisao"], [data-act="retirar-recurso"], [data-act="ativo"]')).toHaveCount(0);
    await expect(campoDoRecurso(page, 'av')).toContainText('Indisponível nesta data');
    await page.reload();
    await abrirRecursos(page);
    await expect(caixaDisponivel(page, 'SALA-GROUND')).not.toBeChecked();
    await abrirHistorico(page);
    await page.locator('#audit-log-list button[data-act="rev-log"]').first().click();
    await expect(page.locator('#audit-log-list')).toContainText('Revertido: Sala Ground disponível');
    await page.keyboard.press('Escape');
    await abrirRecursos(page);
    await expect(caixaDisponivel(page, 'SALA-GROUND')).toBeChecked();
  });

  // A Sala Ground nas horas (revisão do J): uma turma de Ground tem uma linha por aluno, mas ocupa a sala uma vez só
  test('a Sala Ground: as horas na escala uma vez por turma; os horários "da Sala Ground" no detalhe da categoria dela', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirRecursos(page);
    // O exemplo: o Ground PA-34 de um aluno às 06:30 e a turma de Ground C152 de seis alunos às 08:20, 1,5 h cada
    await expect(linhaDoRecurso(page, 'SALA-GROUND').locator('.lista-l3')).toHaveText('11/11 · disponível · 3 h na escala');
    await abrirCategoria(page, 'ground');
    const editar = horariosDaCategoria(page).locator('[data-cat="ground"] [data-act="editar-horarios"]');
    await expect(editar).toHaveAccessibleName('Editar os horários da Sala Ground');
    await editar.click();
    await expect(horariosDaCategoria(page).locator('.horarios-editor')).toHaveAccessibleName('Horários de decolagem da Sala Ground');
  });

  // A busca acha a matrícula sem os acentos, sem o hífen e sem diferença de maiúsculas; a contagem diz quantos aparecem;
  // sem nenhum, "Limpar filtros". Os cabeçalhos das categorias sem nenhum achado saem (só voltam com a busca vazia)
  test('a busca pela matrícula, a contagem e "Limpar filtros"; a Sala Ground é achada', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    const busca = buscaDosRecursos(page), contagem = contagemDosRecursos(page);
    await expect(contagem).toHaveAttribute('role', 'status');
    await busca.fill('vo');
    await expect.poll(() => regsDaLista(page)).toEqual(['PR-VOB', 'PR-VOC', 'PR-VOI', 'PR-VOP', 'PR-VOW', 'PR-VOZ', 'PR-VOY', 'PR-VOM']);
    await expect(gruposDosRecursos(page)).toHaveText([/^C152/, /^C172/, /^PA-34/]);
    await busca.fill(' PR VÓB ');
    await expect.poll(() => regsDaLista(page)).toEqual(['PR-VOB']);
    await expect(contagem).toHaveText('1 de 27 recursos');
    // O cabeçalho conta a categoria inteira, também os que a busca esconde
    await expect(cabecalhoDaCategoria(page, 'C152')).toContainText('13 de 13 disponíveis');
    await busca.fill('sala');
    await expect.poll(() => regsDaLista(page)).toEqual(['SALA-GROUND']);
    await busca.fill('nenhum assim');
    await nenhumNaLista(page, 'rec');
    await expect(page.locator('#rec > li.lista-vazia')).toHaveText('Nenhum recurso com esses filtros. Limpar filtros');
    await page.locator('#limpar-filtros-rec').click();
    await expect(busca).toBeFocused();
    await expect(busca).toHaveValue('');
    await expect(linhasDosRecursos(page)).toHaveCount(27);
    await expect(contagem).toHaveText('27 recursos');
  });

  test('cada categoria recolhe e abre pela seta, e continua assim quando a escala é refeita', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    const seta = cabecalhoDaCategoria(page, 'C152').locator('.lista-seta');
    await expect(seta).toHaveAttribute('aria-expanded', 'true');
    await seta.click();
    await expect(seta).toHaveAttribute('aria-expanded', 'false');
    // Os 13 que não são do C152 e a Sala Ground
    await expect(linhasDosRecursos(page)).toHaveCount(14);
    await alternarDisponivel(page, 'PR-VOM', false);
    await expect(seta).toHaveAttribute('aria-expanded', 'false');
    await expect(linhasDosRecursos(page)).toHaveCount(14);
    await seta.click();
    await expect(linhasDosRecursos(page)).toHaveCount(27);
  });

  // A categoria sem linha à vista (Pedro, 2026-11-28: "yes the operator should be opened in recursos"): o PA-34 com os três
  // inativos e nenhum simulador na frota. Os cabeçalhos ficam, sem a seta (nada a recolher), e o detalhe de cada um abre como o
  // dos outros, pelo clique, pelas setas e no celular; "Mostrar inativos" vale só para as linhas; a busca, que acha linhas,
  // tira o cabeçalho sem achado (volta com a busca vazia)
  test('a categoria com todos inativos, ou sem nenhum recurso, tem o cabeçalho e o detalhe dela, com os horários de decolagem', async ({ page }) => {
    await abrirComFrota(page, FROTA_INICIAL.filter(f => !f.tipo.startsWith('Sim')).map(f => (f.tipo === 'PA-34' ? { ...f, inativo: true } : f)));
    await abrirRecursos(page);
    await expect(gruposDosRecursos(page)).toHaveText(CATEGORIAS);
    await expect(cabecalhoDaCategoria(page, 'PA-34')).toHaveText('PA-34 0 de 0 disponíveis · 21 horários de decolagem');
    await expect(cabecalhoDaCategoria(page, 'sim')).toHaveText('Simulador 0 de 0 disponíveis · 8 horários de decolagem');
    expect(await regsDaLista(page)).not.toContain('PR-VOM');
    await expect(contagemDosRecursos(page)).toHaveText('20 recursos');
    for (const cat of ['PA-34', 'sim']) {
      await expect(cabecalhoDaCategoria(page, cat).locator('.lista-seta, [aria-expanded]')).toHaveCount(0);
      await expect(cabecalhoDaCategoria(page, cat).locator('.lista-botao')).toHaveAccessibleName(new RegExp(`^${cat === 'sim' ? 'Simulador' : cat} 0 de 0 disponíveis`));
    }
    // O clique abre o detalhe da categoria, com os horários e o Editar
    await abrirCategoria(page, 'PA-34');
    await expect(horariosDaCategoria(page).locator('[data-act="editar-horarios"]')).toBeVisible();
    await expect(cabecalhoDaCategoria(page, 'PA-34').locator('.lista-botao')).toHaveAttribute('aria-current', 'true');
    // As setas: do fim (a Sala Ground), ↑ três vezes chega no Simulador, ↓ no PA-34 (escolhidos); ← não recolhe nada; Enter
    // vai ao título do detalhe
    await linhaDoRecurso(page, 'PR-CPL').locator('.lista-botao').focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(cabecalhoDaCategoria(page, 'sim').locator('.lista-botao')).toBeFocused();
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'cat:sim');
    await page.keyboard.press('ArrowDown');
    await expect(cabecalhoDaCategoria(page, 'PA-34').locator('.lista-botao')).toBeFocused();
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'cat:PA-34');
    await page.keyboard.press('ArrowLeft');
    await expect(cabecalhoDaCategoria(page, 'PA-34').locator('.lista-botao')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#det-rec-titulo')).toBeFocused();
    // "Mostrar inativos": as linhas do PA-34 voltam debaixo do cabeçalho, com a seta; sem ele, saem, e o cabeçalho fica
    await page.locator('#rec-inativos').click();
    await expect.poll(() => regsDaLista(page)).toEqual(expect.arrayContaining(['PR-VOM', 'PT-JOB', 'PT-KIW']));
    await expect(cabecalhoDaCategoria(page, 'PA-34').locator('.lista-seta')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#rec-inativos').click();
    await expect.poll(() => regsDaLista(page)).not.toContain('PR-VOM');
    await expect(gruposDosRecursos(page)).toHaveText(CATEGORIAS);
    // A busca acha linhas: os cabeçalhos sem achado saem, e voltam com ela vazia
    await buscaDosRecursos(page).fill('vob');
    await expect(gruposDosRecursos(page)).toHaveText([/^C152/]);
    await buscaDosRecursos(page).fill('');
    await expect(gruposDosRecursos(page)).toHaveText(CATEGORIAS);
  });

  test('no celular, a categoria sem linha abre o detalhe dela, e "‹ Recursos" volta ao cabeçalho', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await abrirComFrota(page, FROTA_INICIAL.map(f => (f.tipo === 'PA-34' ? { ...f, inativo: true } : f)));
    await abrirRecursos(page);
    await cabecalhoDaCategoria(page, 'PA-34').locator('.lista-botao').click();
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'cat:PA-34');
    await expect(listaDosRecursos(page)).toBeHidden();
    await expect(horariosDaCategoria(page)).toBeVisible();
    await page.locator('#det-rec-voltar').click();
    await expect(listaDosRecursos(page)).toBeVisible();
    await expect(cabecalhoDaCategoria(page, 'PA-34').locator('.lista-botao')).toBeFocused();
  });
});

test.describe('Recursos: o detalhe de um recurso', () => {
  test('"Nesta data" (Disponível, as horas até a revisão, Revisão feita, o que voa) e depois "Cadastro · todas as datas"', async ({ page }) => {
    await abrir(page, { estado: cenario({ stu: [aluno(1000, { p1: 1, p2: 1 })], semAeronaves: apenas('C152', 'PP-LJV'), horas: { 'PP-LJV': 42 } }) });
    await abrirRecurso(page, 'PP-LJV');
    const det = detalheDoRecurso(page);
    await expect(page.locator('#det-rec-titulo')).toHaveText('PP-LJV');
    await expect(det.locator('.det-sub')).toHaveText('C152');
    await expect(det.locator('.det-secao-btn')).toHaveText([/^Nesta data\s*qua 11\/11/, /^Cadastro\s*todas as datas/]);
    await expect(det.locator('input[data-a="av"][data-id="PP-LJV"]')).toBeChecked();
    const horas = await horasDoRecurso(page, 'PP-LJV');
    await expect(horas).toHaveValue('8');
    await expect(campoDoRecurso(page, 'revisao').locator('.barra')).toHaveClass(/\bwa\b/);
    await expect(campoDoRecurso(page, 'escala')).toContainText('1 h na escala · termina com 7 h disponíveis');
    // As horas: gravadas ao sair do campo; fora de 0 a 50, o valor fica no campo, com a mensagem, e o Esc devolve o gravado
    await horas.fill('20');
    await horas.press('Tab');
    await expect(linhaDoRecurso(page, 'PP-LJV').locator('.lista-meta')).toHaveText('20 h');
    await expect(page.locator('#audit-log-list')).toContainText('PP-LJV: 20 h disponíveis até a revisão de 50 horas');
    await horas.fill('60');
    await horas.press('Tab');
    await expect(horas).toHaveValue('60');
    await expect(horas).toHaveAttribute('aria-invalid', 'true');
    await expect(horas).toHaveAccessibleDescription('As horas disponíveis vão de 0 a 50.');
    await horas.focus();
    await page.keyboard.press('Escape');
    await expect(horas).toHaveValue('20');
    await expect(horas).not.toHaveAttribute('aria-invalid', 'true');
    // Revisão feita: dois cliques, 50 h disponíveis
    await confirmar(page, '#det-rec [data-act="revisao"]');
    await expect(horas).toHaveValue('50');
    // O cadastro: o tipo, os atributos que valem no tipo
    await expect(campoDoRecurso(page, 'tipo')).toContainText('C152');
    await expect(campoDoRecurso(page, 'atributos').locator('input')).toHaveCount(1);
    await marcarAtributo(page, 'PP-LJV', 'soParafuso', true);
    await expect(page.locator('#audit-log-list')).toContainText('PP-LJV: Só Parafuso marcado');
    await expect(linhaDoRecurso(page, 'PP-LJV').locator('.lista-l2-texto')).toHaveText('C152 · Só Parafuso');
    await expect(det.locator('.det-sub')).toHaveText('C152 · Só Parafuso');
    // A chave desta data também no detalhe: desligada, "Em manutenção nesta data", e a linha acompanha
    await det.locator('input[data-a="av"][data-id="PP-LJV"]').uncheck();
    await expect(campoDoRecurso(page, 'av')).toContainText('Em manutenção nesta data');
    await expect(caixaDisponivel(page, 'PP-LJV')).not.toBeChecked();
  });

  // B: o que o recurso exige do instrutor, em "Cadastro · todas as datas" (setExigencias): a habilitação do tipo (fixa, sem
  // caixa), a habilitação própria (o atributo) e "Exigir também…", com as caixas do registro por grupo, como as da missão do
  // curso (F1d); quem pode operar acompanha; o histórico desfaz
  test('"Habilitações que o INVA precisa": do tipo, a própria, "Exigir também…", quem pode operar; o histórico desfaz', async ({ page }) => {
    const ins = [instrutor(1, 9, { hab: ['local', 'c152', 'ifr'] }), instrutor(2, 9, { hab: ['local', 'c152'] })];
    await abrir(page, { estado: cenario({ ins, stu: [aluno(1000)] }) });
    await abrirRecurso(page, 'PR-VOB');
    const exige = campoDoRecurso(page, 'exige');
    await expect(exige).toContainText('Habilitações que o INVA precisa');
    await expect(exige).toContainText('Do tipo: C152');
    await expect(exige.locator('input[data-a="exige"][value="c152"]')).toHaveCount(0);
    await expect(exige.locator('[data-atributo="habilitacaoPropria"]')).not.toBeChecked();
    await expect(exige.locator('.quem-opera')).toHaveText('Quem pode operar: 2 INVAs');
    await expect(exige.locator('summary')).toHaveText('Exigir também: nenhuma');
    await exige.locator('summary').click();
    const ifr = exige.locator('input[data-a="exige"][value="ifr"]');
    await expect(ifr).toHaveAccessibleName('PR-VOB exige Voo IFR');
    await ifr.check();
    await expect(page.locator('#audit-log-list')).toContainText('PR-VOB: exige Voo IFR');
    await expect(linhaDoRecurso(page, 'PR-VOB').locator('.lista-l2-texto')).toHaveText('C152 · Exige Voo IFR');
    await expect(exige.locator('.quem-opera')).toHaveText('Quem pode operar: 1 INVA');
    // A caixa continua aberta, com o foco na marca
    await expect(exige.locator('details')).toHaveJSProperty('open', true);
    await expect(ifr).toBeFocused();
    await expect(exige.locator('summary')).toHaveText('Exigir também: Voo IFR');
    await ifr.uncheck();
    await expect(page.locator('#audit-log-list')).toContainText('PR-VOB: deixa de exigir Voo IFR');
    await ifr.check();
    await abrirHistorico(page);
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await expect(linhaDoRecurso(page, 'PR-VOB').locator('.lista-l2-texto')).toHaveText('C152');
    await expect(exige.locator('.quem-opera')).toHaveText('Quem pode operar: 2 INVAs');
    // A habilitação própria também fica aqui
    await marcarAtributo(page, 'PR-VOB', 'habilitacaoPropria', true);
    await expect(linhaDoRecurso(page, 'PR-VOB').locator('.lista-l2-texto')).toHaveText('C152 · Exige Avião PR-VOB');
    await expect(exige.locator('.quem-opera')).toHaveText('Quem pode operar: 0 INVAs');
  });

  // A reversão de uma caixa mais antiga desfaz só ela: a habilitação própria e as caixas marcadas depois ficam (a própria
  // de um recurso que sumisse sem pedido deixaria o motor dar o avião a quem não a tem)
  test('reverter uma caixa mais antiga de "Exigir também…" desfaz só ela: a habilitação própria e a caixa marcada depois ficam', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9, { hab: ['local', 'c152', 'ifr', 'noturno'] })], stu: [aluno(1000)] }) });
    await abrirRecurso(page, 'PR-VOB');
    const exige = campoDoRecurso(page, 'exige');
    await exige.locator('summary').click();
    await exige.locator('input[data-a="exige"][value="ifr"]').check();
    await expect(page.locator('#audit-log-list')).toContainText('PR-VOB: exige Voo IFR');
    await exige.locator('input[data-a="exige"][value="noturno"]').check();
    await expect(page.locator('#audit-log-list')).toContainText('PR-VOB: exige Voo Noturno');
    await marcarAtributo(page, 'PR-VOB', 'habilitacaoPropria', true);
    const texto = linhaDoRecurso(page, 'PR-VOB').locator('.lista-l2-texto');
    await expect(texto).toHaveText('C152 · Exige Voo IFR · Exige Voo Noturno · Exige Avião PR-VOB');
    await abrirHistorico(page);
    await page.locator('#audit-log-list .audit-item', { hasText: 'PR-VOB: exige Voo IFR' }).locator('[data-act="rev-log"]').click();
    await page.keyboard.press('Escape');
    await expect(texto).toHaveText('C152 · Exige Voo Noturno · Exige Avião PR-VOB');
    await expect(exige.locator('input[data-a="exige"][value="ifr"]')).not.toBeChecked();
    await expect(exige.locator('input[data-a="exige"][value="noturno"]')).toBeChecked();
    await expect(exige.locator('[data-atributo="habilitacaoPropria"]')).toBeChecked();
    // A do Voo Noturno, revertida depois, tira só ela; a própria continua
    await abrirHistorico(page);
    await page.locator('#audit-log-list .audit-item', { hasText: 'PR-VOB: exige Voo Noturno' }).locator('[data-act="rev-log"]').click();
    await page.keyboard.press('Escape');
    await expect(texto).toHaveText('C152 · Exige Avião PR-VOB');
  });

  test('"Agendar voo no <reg>" abre o agendamento com o recurso; "Próximo" anda na lista', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await abrirRecurso(page, 'PR-VOB');
    const agendar = detalheDoRecurso(page).locator('[data-act="agendar"]');
    await expect(agendar).toHaveAccessibleName('Agendar voo no PR-VOB');
    await expect(agendar).toHaveAttribute('data-agendar', 'r:PR-VOB');
    await agendar.click();
    await expect(page.locator('#dlg-agendar')).toBeVisible();
    await expect(page.locator('#agd-contexto')).toContainText('PR-VOB');
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg-agendar')).toBeHidden();
    // "Próximo": o recurso seguinte da lista (a ordem da frota na categoria)
    const seguinte = await linhaDoRecurso(page, 'PR-VOB').evaluate(li => li.nextElementSibling.dataset.id);
    await page.locator('#det-rec-proximo').click();
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', seguinte);
    await expect(page).toHaveURL(new RegExp(`#/rec/${seguinte}$`));
  });

  test('o endereço #/rec/<matrícula> abre o recurso', async ({ page }) => {
    await abrirSintetico(page, { url: './#/rec/PT-KIW' });
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'PT-KIW');
    await expect(linhaDoRecurso(page, 'PT-KIW').locator('.lista-botao')).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('Recursos: acrescentar, retirar e o "Ativo"', () => {
  test('acrescenta um C152: "+ Novo recurso" abre o formulário no detalhe; o novo fica escolhido, disponível, entra na escala e fica gravado', async ({ page }) => {
    // Todos os C152 em manutenção: o voo só entra com o avião novo
    await abrir(page, { estado: cenario({ stu: [aluno(1000)], semAeronaves: apenas('C152') }) });
    await abrirRecursos(page);
    const botao = page.locator('#btn-novo-recurso'), form = page.locator('#form-recurso');
    await expect(form).toBeHidden();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await botao.click();
    // O formulário fica no detalhe (nada escolhido)
    await expect(page.locator('#det-rec #form-recurso')).toBeVisible();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#rec-reg')).toBeFocused();
    await page.locator('#rec-reg').fill('pr-new');
    await page.locator('#rec-tipo').selectOption('C152');
    await page.locator('#form-recurso [type="submit"]').click();
    // O novo, escolhido no detalhe, com o título em foco
    await expect(detalheDoRecurso(page)).toHaveAttribute('data-id', 'PR-NEW');
    await expect(page.locator('#det-rec-titulo')).toBeFocused();
    await expect(form).toBeHidden();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(caixaDisponivel(page, 'PR-NEW')).toBeChecked();
    await expect(cabecalhoDaCategoria(page, 'C152')).toContainText('1 de 14 disponíveis');
    await expect(page.locator('#toast-box .toast.ok')).toContainText('PR-NEW');
    await abrirEscala(page);
    await expect.poll(async () => (await lerEscala(page)).linhas.some(l => l.includes('PR-NEW'))).toBe(true);
    await page.reload();
    await abrirRecursos(page);
    await expect(linhaDoRecurso(page, 'PR-NEW')).toBeVisible();
  });

  // O recurso novo aparece mesmo fora da busca (até ela mudar); Cancelar fecha o formulário, com o foco de volta no botão
  test('o recurso novo fica à vista fora da busca; Cancelar fecha o formulário e devolve o foco', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    await buscaDosRecursos(page).fill('kiw');
    await expect(linhasDosRecursos(page)).toHaveCount(1);
    const botao = page.locator('#btn-novo-recurso');
    await botao.click();
    await page.locator('#rec-reg').fill('PR-ABC');
    await page.locator('#rec-tipo').selectOption('C172');
    await page.locator('#form-recurso [type="submit"]').click();
    await expect.poll(() => regsDaLista(page)).toEqual(['PR-ABC', 'PT-KIW']);
    await expect(contagemDosRecursos(page)).toHaveText('2 de 28 recursos');
    await buscaDosRecursos(page).fill('kiw');
    await expect.poll(() => regsDaLista(page)).toEqual(['PT-KIW']);
    await botao.click();
    await expect(page.locator('#rec-reg')).toHaveValue('');
    await page.locator('#rec-cancelar').click();
    await expect(page.locator('#form-recurso')).toBeHidden();
    await expect(botao).toBeFocused();
  });

  test('não aceita matrícula repetida nem sem categoria; "Só Parafuso" só no C152', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    await page.locator('#btn-novo-recurso').click();
    await page.locator('#rec-reg').fill('PP-LJV');
    await page.locator('#rec-tipo').selectOption('C152');
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(page.locator('#rec-erro')).toHaveText('Já existe um recurso com a matrícula PP-LJV.');
    await expect(page.locator('#rec-reg')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rec-reg')).toHaveAccessibleDescription('Já existe um recurso com a matrícula PP-LJV.');
    await expect(page.locator('#rec-tipo')).not.toHaveAttribute('aria-invalid');
    await page.locator('#rec-reg').fill('PR-ZZZ');
    await page.locator('#rec-tipo').selectOption('');
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(page.locator('#rec-erro')).toHaveText('Escolha a categoria.');
    await expect(page.locator('#rec-tipo')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rec-reg')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('#rec-parafuso')).toBeHidden();
    await page.locator('#rec-tipo').selectOption('C152');
    await expect(page.locator('#rec-parafuso')).toBeVisible();
    await page.locator('#rec-parafuso').check();
    await page.locator('#form-recurso [type="submit"]').click();
    await expect(linhaDoRecurso(page, 'PR-ZZZ').locator('.lista-l2-texto')).toHaveText('C152 · Só Parafuso');
  });

  test('"Retirar da frota…" no rodapé, com confirmação; o histórico desfaz', async ({ page }) => {
    await abrirSintetico(page);
    await retirarRecurso(page, 'PT-KIW');
    await expect(linhaDoRecurso(page, 'PT-KIW')).toHaveCount(0);
    await expect(page.locator('#det-rec')).toContainText('Escolha um recurso ou uma categoria na lista.');
    await expect(cabecalhoDaCategoria(page, 'PA-34')).toContainText('2 de 2 disponíveis');
    await abrirHistorico(page);
    await expect(page.locator('#audit-log-list')).toContainText('Recurso retirado: PT-KIW (PA-34)');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await expect(linhaDoRecurso(page, 'PT-KIW')).toHaveCount(1);
  });

  // "Ativo" (F2: o mesmo manipulador dos três cadastros): um clique em cada sentido; o inativo sai da lista e da escala de
  // hoje em diante, "Mostrar inativos" o traz (sem o "Disponível"), e o Histórico reverte
  test('"Ativo": desligado, o recurso sai da lista; "Mostrar inativos" o mostra, e o Histórico reverte', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    await linhaDoRecurso(page, 'PT-KIW').locator('.lista-chave').click();
    await expect(page.locator('#toast-box')).toContainText('PT-KIW');
    // A linha não some debaixo do ponteiro (F2): fica, apagada, com "inativo", até a lista mudar
    const linha = linhaDoRecurso(page, 'PT-KIW');
    await expect(linha).toHaveClass(/\binativo\b/);
    await expect(linha.locator('.lista-inativo')).toHaveText('inativo');
    await expect(linha.locator('.lista-rapida')).toHaveCount(0);
    await expect(linha.locator('.lista-chave')).toHaveAttribute('aria-checked', 'false');
    await expect(contagemDosRecursos(page)).toHaveText('26 recursos');
    const inativos = page.locator('#rec-inativos');
    await expect(inativos).toHaveText('Mostrar inativos (1)');
    await inativos.click();
    await expect(inativos).toHaveAttribute('aria-pressed', 'true');
    await expect(linha).toHaveCount(1);
    await inativos.click();
    await expect(linha).toHaveCount(0);
    await inativos.click();
    await abrirRecurso(page, 'PT-KIW');
    await expect(page.locator('#det-rec-aviso')).toContainText('Inativo no cadastro');
    await expect(detalheDoRecurso(page).locator('[data-act="agendar"]')).toHaveCount(0);
    await abrirHistorico(page);
    await expect(page.locator('#audit-log-list')).toContainText('PT-KIW: inativo no cadastro');
    await page.locator('#audit-log-list [data-act="rev-log"]').first().click();
    await page.keyboard.press('Escape');
    await expect(linhaDoRecurso(page, 'PT-KIW').locator('.lista-chave')).toHaveAttribute('aria-checked', 'true');
  });

  test('o Gestor lê: sem "+ Novo recurso", sem as chaves, sem "Retirar da frota…"; os campos como texto', async ({ page }) => {
    await abrirSintetico(page);
    await page.locator('#role-sel').selectOption('gestor');
    await abrirRecursos(page);
    await expect(page.locator('#btn-novo-recurso')).toBeHidden();
    await expect(linhaDoRecurso(page, 'PT-KIW').locator('.lista-chave')).toBeHidden();
    await expect(linhaDoRecurso(page, 'PT-KIW').locator('.lista-rapida')).toBeHidden();
    await abrirRecurso(page, 'PT-KIW');
    const det = detalheDoRecurso(page);
    await expect(det.locator('input, select')).toHaveCount(0);
    await expect(det.locator('[data-act="retirar-recurso"]:visible, [data-act="agendar"]:visible')).toHaveCount(0);
    await expect(campoDoRecurso(page, 'av')).toContainText('Disponível');
    // "Quem pode operar" também para quem só consulta (o Manual não o limita a quem edita)
    await expect(campoDoRecurso(page, 'exige')).toContainText('Do tipo: MLTE (PA-34)');
    await expect(campoDoRecurso(page, 'quem-opera')).toContainText(/Quem pode operar\s*\d+ INVAs?$/);
  });
});

test.describe('Recursos: "Ordem no hangar", o item fixo', () => {
  // O hangar desligado (o padrão, js/funcionalidades.js): o item não existe
  test('sem o hangar ligado, a lista não tem "Ordem no hangar"', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    await expect(page.locator('#rec > li[data-chave="f:hangar"], #hangar')).toHaveCount(0);
    await expect(page.locator('#rec > li').first()).toHaveAttribute('data-chave', 'g:C152');
  });

  comHangar('o item fixo no alto da lista, fora da contagem; o detalhe é a ordem inteira, que a busca não filtra', async ({ page }) => {
    await abrirSintetico(page);
    await abrirRecursos(page);
    await expect(page.locator('#rec > li').first()).toHaveAttribute('data-chave', 'f:hangar');
    await expect(page.locator('#rec > li').first()).toContainText('Ordem no hangar');
    await expect(contagemDosRecursos(page)).toHaveText('27 recursos');
    await abrirHangar(page);
    await expect(detalheDoRecurso(page).locator('.det-secao-btn')).toHaveText([/^Ordem no hangar\s*qua 11\/11/]);
    await expect(ordemNoHangar(page)).toHaveCount(22);
    await buscaDosRecursos(page).fill('vob');
    await expect(linhasDosRecursos(page)).toHaveCount(1);
    // O item fixo nunca é filtrado, e o hangar continua com todos os aviões
    await expect(page.locator('#rec > li[data-chave="f:hangar"]')).toHaveCount(1);
    await expect(ordemNoHangar(page)).toHaveCount(22);
  });
});

// Cada categoria (o cabeçalho dela) tem o detalhe: os horários de decolagem (o resumo e o editor) e o que vem do tipo
test.describe('Recursos: a categoria e os horários de decolagem', () => {
  const editor = page => horariosDaCategoria(page).locator('.horarios-editor');

  test('o cabeçalho escolhe a categoria: o resumo dos horários (o modelo, quantos, os da manhã e da tarde; o fechado nesta data riscado) e "Do tipo"', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await abrirCategoria(page, 'C152');
    const det = detalheDoRecurso(page);
    await expect(page.locator('#det-rec-titulo')).toHaveText('C152');
    await expect(det.locator('.det-secao-btn')).toHaveText([/^Horários de decolagem\s*todas as datas/, /^Do tipo\s*todas as datas/]);
    const c152 = horariosDaCategoria(page).locator('[data-cat="C152"]');
    await expect(c152.locator('.horarios-modelo')).toHaveText('Horários padrão');
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');
    await expect(c152.locator('[data-periodo="manha"] .hr')).toHaveText(['06:30', '08:20', '10:10', '11:30']);
    await expect(c152.locator('[data-periodo="tarde"] .hr')).toHaveText(['12:40', '13:40', '14:30', '16:20']);
    // Só a categoria escolhida, com um botão
    await expect(horariosDaCategoria(page).locator('.horarios-cat')).toHaveCount(1);
    await expect(horariosDaCategoria(page).locator('button')).toHaveCount(1);
    await expect(campoDoRecurso(page, 'habilitacao')).toContainText('C152');
    await expect(campoDoRecurso(page, 'revisao-50')).toContainText('sim');
    await abrirCategoria(page, 'PA-34');
    const pa34 = horariosDaCategoria(page).locator('[data-cat="PA-34"]');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('De 30 em 30 min, 06:30–16:30');
    await expect(pa34.locator('.horarios-qtd')).toHaveText('21 horários');

    // Das 10:10 às 11:30 fechado nesta data (na Escala): o horário fica apagado, e a dica diz por quê
    await fecharHorarios(page, { de: '10:10', ate: '11:30' });
    await abrirCategoria(page, 'C152');
    await expect(c152.locator('.hr.fechado')).toHaveText(['10:10 (fechado nesta data)']);
    await expect(c152.locator('.hr.fechado')).toHaveAttribute('data-dica', 'horario-fechado-na-data');
    await expect(c152.locator('.hr.fechado')).toHaveAttribute('data-dica-caso', 'Fechado nesta data (10:10–11:30).');
  });

  test('editar: tirar, pôr com Enter, o efeito antes de salvar; Salvar muda a escala, e o histórico desfaz a lista e os pedidos', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000, { mis: 'Multimotor', eq: 'PA-34', p1: 450, p2: -1 })] }) });
    await abrirEscala(page);
    expect((await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:30/);
    await abrirCategoria(page, 'PA-34');
    const pa34 = horariosDaCategoria(page).locator('[data-cat="PA-34"]');
    const editar = pa34.locator('[data-act="editar-horarios"]');
    await editar.click();
    await expect(editar).toHaveAttribute('aria-expanded', 'true');
    await expect(editor(page)).toBeVisible();
    await expect(editor(page).locator('.hr-novo')).toBeFocused();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(21);
    await expect(editor(page).locator('.horarios-efeito')).toHaveText('Nenhum pedido muda.');
    // O cabeçalho da categoria diz que a edição está aberta
    await expect(cabecalhoDaCategoria(page, 'PA-34')).toContainText('edição aberta');

    await editor(page).locator('[data-act="rascunho-tirar"][data-min="450"]').click();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(20);
    await expect(editor(page).locator('.horarios-efeito')).toHaveText('1 pedido muda de preferência.');
    await editor(page).locator('.hr-novo').fill('17:00');
    await editor(page).locator('.hr-novo').press('Enter');
    await expect(editor(page).locator('[role="alert"]')).toHaveText('Escolha um horário entre 06:00 e 16:30.');
    await editor(page).locator('.hr-novo').fill('07:45');
    await editor(page).locator('.hr-novo').press('Enter');
    await expect(editor(page).locator('.hr-chip', { hasText: '07:45' })).toHaveCount(1);
    await expect(editor(page).locator('[role="alert"]')).toHaveText('');
    await expect(pa34.locator('.horarios-modelo')).toHaveCount(0);
    await editor(page).locator('[data-act="salvar-horarios"]').click();
    await expect(editor(page)).toHaveCount(0);
    await expect(editar).toBeFocused();
    await expect(pa34.locator('.horarios-qtd')).toHaveText('21 horários');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('06:30, 07:00, 07:45, 08:00–16:30 de 30 em 30 min');
    await expect(cabecalhoDaCategoria(page, 'PA-34')).not.toContainText('edição aberta');
    await abrirEscala(page);
    await expect.poll(async () => (await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:45/);

    // Uma entrada no histórico; Reverter volta a lista e a preferência do pedido
    await abrirHistorico(page);
    const entrada = page.locator('#audit-log-list .audit-item', { hasText: 'Horários de decolagem do PA-34' });
    await expect(entrada).toHaveCount(1);
    await entrada.locator('[data-act="rev-log"]').click();
    await page.keyboard.press('Escape');
    await abrirCategoria(page, 'PA-34');
    await expect(pa34.locator('.horarios-modelo')).toHaveText('De 30 em 30 min, 06:30–16:30');
    await abrirEscala(page);
    await expect.poll(async () => (await lerEscala(page)).linhas.find(l => l.includes('Aluno 1000'))).toMatch(/^07:30/);
  });

  // O efeito do rascunho é o dos pedidos da data aberta: com o editor aberto, outra data refaz a conta
  test('com o editor aberto, outra data refaz "pedidos mudam" com os pedidos dela', async ({ page }) => {
    await abrirComExemplo(page);
    const tirar = async () => {
      await abrirCategoria(page, 'C152');
      await horariosDaCategoria(page).locator('[data-act="editar-horarios"]').click();
      for (const m of [390, 500, 610, 690]) await editor(page).locator(`[data-act="rascunho-tirar"][data-min="${m}"]`).click();
    };
    const efeito = editor(page).locator('.horarios-efeito');
    await tirar();
    await expect(efeito).toHaveText(/pedidos? mudam? de preferência/);
    const naPrimeira = await efeito.textContent();
    await diaSeguinte(page);
    await expect(editor(page)).toBeVisible();
    const naSeguinte = await efeito.textContent();
    // A mesma edição feita do começo nesta data diz o mesmo
    await editor(page).locator('[data-act="cancelar-horarios"]').click();
    await tirar();
    await expect(efeito).toHaveText(/pedidos? mudam? de preferência|Nenhum pedido muda/);
    const deNovo = await efeito.textContent();
    expect(deNovo).not.toBe(naPrimeira);
    expect(naSeguinte).toBe(deNovo);
  });

  // D22: o rascunho não se perde ao escolher outro recurso; de volta à categoria, o editor continua, com o digitado
  test('o rascunho fica ao escolher outro recurso: de volta à categoria, o editor continua, com o horário digitado', async ({ page }) => {
    await abrirSintetico(page);
    await abrirCategoria(page, 'C152');
    await horariosDaCategoria(page).locator('[data-act="editar-horarios"]').click();
    await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await editor(page).locator('.hr-novo').fill('09:15');
    await abrirRecurso(page, 'PR-VOB');
    await expect(horariosDaCategoria(page)).toHaveCount(0);
    await expect(cabecalhoDaCategoria(page, 'C152')).toContainText('edição aberta');
    await abrirCategoria(page, 'C152');
    await expect(editor(page).locator('.hr-chip')).toHaveCount(7);
    await expect(editor(page).locator('.hr-novo')).toHaveValue('09:15');
    // Outra alteração redesenha a tela: o editor continua, com o digitado
    await alternarDisponivel(page, 'PR-VOB', false);
    await expect(editor(page).locator('.hr-novo')).toHaveValue('09:15');
    await expect(editor(page).locator('.hr-chip')).toHaveCount(7);
  });

  // O Histórico abre por cima da Agenda: a lista do cadastro muda com ela aberta
  test('o "↶ Reverter" dos horários, com a Agenda aberta, muda os horários do pedido que está sendo feito', async ({ page }) => {
    await abrir(page, { estado: cenario({ ins: [instrutor(1, 9)], stu: [aluno(1000)] }) });
    await abrirCategoria(page, 'PA-34');
    await horariosDaCategoria(page).locator('[data-act="editar-horarios"]').click();
    await editor(page).locator('[data-act="rascunho-tirar"][data-min="450"]').click();
    await editor(page).locator('.hr-novo').fill('07:45');
    await editor(page).locator('.hr-novo').press('Enter');
    await editor(page).locator('[data-act="salvar-horarios"]').click();
    await expect(editor(page)).toHaveCount(0);
    await irPara(page, 'age');
    const [horario, motivo] = ['horario', 'horario-motivo'].map(c => campoDaAgenda(page, c));
    await campoDaAgenda(page, 'aluno').selectOption({ label: 'Aluno 1000' });
    await campoDaAgenda(page, 'missao').selectOption('Navegação');
    await campoDaAgenda(page, 'recurso').selectOption('PA-34');
    await horario.selectOption('07:45');
    await campoDaAgenda(page, 'obs').fill('Prefere o PT-JOB');
    await abrirHistorico(page);
    await page.locator('#audit-log-list .audit-item', { hasText: 'Horários de decolagem do PA-34' }).locator('[data-act="rev-log"]').click();
    await expect(horario.locator('option', { hasText: '07:30' })).toHaveCount(1);
    await expect(horario.locator('option', { hasText: '07:45' })).toHaveCount(0);
    await expect(horario).toHaveValue('');
    await expect(motivo).toHaveText('O horário 07:45 não é um dos de Navegação (PA-34). Escolha outro.');
    await expect(campoDaAgenda(page, 'obs')).toHaveValue('Prefere o PT-JOB');
  });

  test('os modelos; Cancelar descarta; não tira o último horário; o Gestor não edita', async ({ page }) => {
    await abrirSintetico(page);
    await abrirCategoria(page, 'C152');
    const c152 = horariosDaCategoria(page).locator('[data-cat="C152"]');
    await c152.locator('[data-act="editar-horarios"]').click();
    await editor(page).getByLabel('De 30 em 30 min').check();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(21);
    await editor(page).locator('[data-act="cancelar-horarios"]').click();
    await expect(c152.locator('.horarios-modelo')).toHaveText('Horários padrão');
    await expect(c152.locator('[data-act="editar-horarios"]')).toBeFocused();

    await c152.locator('[data-act="editar-horarios"]').click();
    for (let i = 0; i < 7; i++) await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await expect(editor(page).getByLabel('Personalizado')).toBeChecked();
    await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(1);
    await expect(editor(page).locator('[role="alert"]')).toHaveText('Cada categoria precisa de pelo menos um horário.');
    await expect(editor(page).locator('.hr-novo')).toHaveAttribute('aria-invalid', 'false');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');

    await page.locator('#role-sel').selectOption('gestor');
    await expect(horariosDaCategoria(page).locator('[data-act="editar-horarios"]')).toBeHidden();
  });

  // O Esc fecha só a camada de cima: com o foco no editor, ele fecha o editor (o rascunho é descartado), e o Histórico
  // aberto continua aberto; o Esc seguinte, com o foco fora das gavetas, fecha o Histórico
  test('o Esc no editor fecha só o editor; o Histórico aberto continua aberto', async ({ page }) => {
    await abrirSintetico(page);
    await abrirCategoria(page, 'C152');
    const c152 = horariosDaCategoria(page).locator('[data-cat="C152"]');
    const editar = c152.locator('[data-act="editar-horarios"]');
    await editar.click();
    await editor(page).locator('[data-act="rascunho-tirar"]').first().click();
    await expect(editor(page).locator('.hr-chip')).toHaveCount(7);
    const historico = page.locator('#historico');
    await abrirHistorico(page);
    await expect(historico).toBeVisible();
    await editor(page).locator('.hr-novo').focus();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(editar).toBeFocused();
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');
    await expect(historico).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(historico).toBeHidden();
  });

  test('a lista mudou depois que o editor abriu (o histórico a reverteu): Salvar não grava o rascunho por cima, com o aviso', async ({ page }) => {
    await abrirSintetico(page);
    await abrirCategoria(page, 'C152');
    const c152 = horariosDaCategoria(page).locator('[data-cat="C152"]');
    async function por(hora) {
      await editor(page).locator('.hr-novo').fill(hora);
      await editor(page).locator('.hr-novo').press('Enter');
      await expect(editor(page).locator('.hr-chip', { hasText: hora })).toHaveCount(1);
    }
    await c152.locator('[data-act="editar-horarios"]').click();
    await por('07:45');
    await editor(page).locator('[data-act="salvar-horarios"]').click();
    await expect(c152.locator('.horarios-qtd')).toHaveText('9 horários');
    await c152.locator('[data-act="editar-horarios"]').click();
    await por('08:45');
    await abrirHistorico(page);
    await page.locator('#audit-log-list .audit-item', { hasText: 'Horários de decolagem do C152' }).locator('[data-act="rev-log"]').click();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeVisible();
    await editor(page).locator('[data-act="salvar-horarios"]').click();
    await expect(page.locator('#toast-box')).toContainText('Os horários do C152 mudaram depois que o editor abriu: nada foi salvo. Confira a lista e edite de novo.');
    await expect(editor(page)).toHaveCount(0);
    await expect(c152.locator('.horarios-modelo')).toHaveText('Horários padrão');
    await expect(c152.locator('.horarios-qtd')).toHaveText('8 horários');
  });

  test('o editor pelo teclado e no leitor de tela: as setas no modelo, o efeito e o erro no mesmo lugar, o erro ligado ao campo', async ({ page }) => {
    await abrirSintetico(page);
    await abrirCategoria(page, 'C152');
    await horariosDaCategoria(page).locator('[data-act="editar-horarios"]').click();
    const ed = editor(page);
    await ed.getByLabel('Horários padrão').focus();
    await page.keyboard.press('ArrowRight');
    await expect(ed.getByLabel('De 30 em 30 min')).toBeFocused();
    await expect(ed.getByLabel('De 30 em 30 min')).toBeChecked();
    await expect(ed.locator('.hr-chip')).toHaveCount(21);
    // O efeito é uma região viva: o mesmo elemento recebe o texto novo (um elemento novo não seria anunciado)
    await ed.locator('.horarios-efeito').evaluate(el => { el.dataset.marca = '1'; });
    await page.keyboard.press('ArrowLeft');
    await expect(ed.getByLabel('Horários padrão')).toBeFocused();
    await expect(ed.locator('.horarios-efeito[data-marca="1"]')).toHaveText('Nenhum pedido muda.');
    const campo = ed.locator('.hr-novo');
    const erro = ed.locator('[role="alert"]');
    await erro.evaluate(el => { el.dataset.marca = '1'; });
    await campo.fill('17:00');
    await campo.press('Enter');
    await expect(ed.locator('[role="alert"][data-marca="1"]')).toHaveText('Escolha um horário entre 06:00 e 16:30.');
    await expect(campo).toBeFocused();
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAttribute('aria-describedby', new RegExp(`\\b${await erro.getAttribute('id')}\\b`));
    await campo.fill('07:15');
    await campo.press('Enter');
    await expect(campo).toHaveAttribute('aria-invalid', 'false');
    await expect(campo).toHaveValue('');
    await expect(erro).toHaveText('');
    // O ✕ de um horário leva o foco para o horário seguinte (tirar vários em sequência)
    await ed.locator('[data-act="rascunho-tirar"][data-min="390"]').focus();
    await page.keyboard.press('Enter');
    await expect(ed.locator('[data-act="rascunho-tirar"][data-min="435"]')).toBeFocused();
  });
});

test.describe('Recursos no celular', () => {
  for (const largura of [390, 320]) {
    test(`${largura} px: a lista, depois o detalhe; "‹ Recursos" volta; nada rola de lado; os controles têm 44 px e nome`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 780 });
      await abrirSintetico(page);
      await abrirRecursos(page);
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'lista');
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      expect(await alvosPequenos(page)).toEqual([]);
      await abrirRecurso(page, 'PP-LJV');
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'detalhe');
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
      expect(await paineisQueRolamParaOLado(page)).toEqual([]);
      expect(await alvosPequenos(page)).toEqual([]);
      expect(await semNome(page, '#s-rec')).toEqual([]);
      await page.locator('#det-rec-voltar').click();
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'lista');
      // A categoria e o editor dos horários ocupam a largura
      await abrirCategoria(page, 'PA-34');
      await horariosDaCategoria(page).locator('[data-act="editar-horarios"]').click();
      const caixa = await horariosDaCategoria(page).locator('.horarios-editor').boundingBox();
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);
      expect(await larguraDaPagina(page)).toBeLessThanOrEqual(largura);
    });
  }
});

// No celular (uma vista só), "+ Novo recurso" abre o detalhe vazio com o formulário: Cancelar e o Esc devolvem a lista, com
// o foco no botão (o detalhe vazio não tem "‹ Recursos")
test.describe('Recursos no celular: "+ Novo recurso" e a volta', () => {
  for (const sair of ['Cancelar', 'Esc']) {
    test(`390 px: ${sair} no formulário do recurso novo volta à lista, com o foco em "+ Novo recurso"`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 780 });
      await abrirSintetico(page);
      await abrirRecursos(page);
      const botao = page.locator('#btn-novo-recurso');
      await botao.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'detalhe');
      await expect(page.locator('#rec-reg')).toBeFocused();
      if (sair === 'Cancelar') {
        await page.locator('#rec-cancelar').focus();
        await page.keyboard.press('Enter');
      } else await page.keyboard.press('Escape');
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'lista');
      await expect(page.locator('#rec')).toBeVisible();
      await expect(page.locator('#form-recurso')).toBeHidden();
      await expect(botao).toHaveAttribute('aria-expanded', 'false');
      await expect(botao).toBeFocused();
      await expect(page).toHaveURL(/#\/rec$/);
      // De novo: o formulário abre outra vez
      await page.keyboard.press('Enter');
      await expect(page.locator('#s-rec')).toHaveAttribute('data-vendo', 'detalhe');
      await expect(page.locator('#rec-reg')).toBeFocused();
    });
  }
});

// O foco depois de uma ação, em Recursos (vieram de acessibilidade.spec.js)
test.describe('O foco depois de uma ação', () => {
  test('com o Enter dado de novo, o Reverter não reverte outra alteração, e quem subiu ao topo do Rodízio fica lá', async ({ page }) => {
    await abrirComExemplo(page);
    await abrirRecursos(page);
    // Três alterações que o Histórico desfaz: três recursos postos em manutenção, pela chave da linha
    const disponiveis = page.locator('#rec input[data-a="av"]:checked');
    for (let i = 0; i < 3; i++) { await disponiveis.first().focus(); await page.keyboard.press('Space'); }
    await abrirHistorico(page);
    const reverter = page.locator('#audit-log-list button[data-act="rev-log"]');
    await expect(reverter).toHaveCount(3);
    await reverter.first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(reverter).toHaveCount(2);
    await page.keyboard.press('Escape');
    await irPara(page, 'rod');
    const categoria = await page.locator('#rodizio .pn[data-cat]').evaluateAll(ps => ps.find(p => p.querySelectorAll('li').length >= 3).dataset.cat);
    const fila = page.locator(`#rodizio .pn[data-cat="${categoria}"] li`);
    const segundo = await fila.nth(1).getAttribute('data-id');
    await fila.nth(1).locator('[data-act="fila-subir"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(fila.first()).toHaveAttribute('data-id', segundo);
    expect(await page.evaluate(() => document.activeElement.dataset.id)).toBe(segundo);
  });

  // O Tab que sai de um campo digitado: o change chega com o foco já fora do campo, e o detalhe é redesenhado
  test('digitar as horas no detalhe e sair com Tab ou Shift+Tab leva ao mesmo vizinho que sem digitar', async ({ page }) => {
    await abrirComExemplo(page);
    const campo = await horasDoRecurso(page, 'PR-VOB');
    const vizinho = () => page.evaluate(() => {
      const el = document.activeElement;
      return el === document.body ? 'body' : `${el.tagName.toLowerCase()}#${el.id}[${el.dataset.a || el.dataset.act || ''}]`;
    });
    for (const [i, tecla] of ['Tab', 'Shift+Tab'].entries()) {
      await campo.focus();
      await page.keyboard.press(tecla);
      const semDigitar = await vizinho();
      await campo.fill(['20', '21'][i]);
      await page.keyboard.press(tecla);
      expect(await vizinho(), tecla).toBe(semDigitar);
    }
  });
});

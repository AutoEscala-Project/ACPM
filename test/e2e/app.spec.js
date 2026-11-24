import { test, expect, abrir, irPara, abrirMenuDaConta, botaoDaAba, campoDaData, diaAnterior, diaSeguinte, relativoDaData, rotuloDaData, rotulosDasAbas, SETAS_DA_DATA } from './fixtures.js';
import { GLOSSARIO } from '../../js/glossario.js';

test.describe('Aplicação', () => {
  test('abre na Escala, com as abas na ordem de uso e sem números', async ({ page }) => {
    await abrir(page);
    await expect(page).toHaveTitle('AutoEscala - ACPM');
    await expect(page.locator('meta[name="application-name"]')).toHaveAttribute('content', 'AutoEscala - ACPM');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'AutoEscala');
    await expect(rotulosDasAbas(page)).toHaveText(['Escala', 'Demanda', 'Agenda', 'Recursos', 'Instrutores', 'Alunos', 'Cursos', 'Rodízio', 'BI']);
    await expect(page.locator('#s-esc')).toBeVisible();
    await expect(botaoDaAba(page, 'esc')).toHaveClass(/\bon\b/);
    await expect(page.locator('#s-rec')).toBeHidden();
  });

  test('o logo do ACPM no topo e como ícone da página; no topo, a águia e "AutoEscala", alinhados, sem a sigla', async ({ page }) => {
    await abrir(page);
    const icone = page.locator('link[rel="icon"]');
    await expect(icone).toHaveAttribute('href', 'img/favicon-32.png');
    expect((await page.request.get(await icone.evaluate(l => l.href))).ok()).toBe(true);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'img/apple-touch-icon.png');
    const logo = page.locator('.topo-marca img.topo-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('alt', '');
    expect(await logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.topo-marca')).toHaveText('AutoEscala');
    const centros = await page.evaluate(() => ['.topo-logo', '.topo-titulo'].map(s => {
      const r = document.querySelector(s).getBoundingClientRect();
      return r.top + r.height / 2;
    }));
    expect(Math.max(...centros) - Math.min(...centros)).toBeLessThanOrEqual(1);
  });

  test('a data em uso fica no topo, em todas as abas; os botões ‹ e › trocam o dia', async ({ page }) => {
    await abrir(page);
    await expect(rotuloDaData(page)).toHaveText('quarta-feira, 11/11', { useInnerText: true });
    await expect(relativoDaData(page)).toHaveText('amanhã');
    await irPara(page, 'dem');
    await expect(rotuloDaData(page)).toBeVisible();
    await diaSeguinte(page);
    await expect(campoDaData(page)).toHaveValue('2026-11-12');
    await expect(rotuloDaData(page)).toHaveText('quinta-feira, 12/11', { useInnerText: true });
    await expect(relativoDaData(page)).toBeHidden();
    await diaAnterior(page);
    await expect(campoDaData(page)).toHaveValue('2026-11-11');
    await diaAnterior(page);
    await expect(campoDaData(page)).toHaveValue('2026-11-10');
    await expect(relativoDaData(page)).toHaveText('hoje');
  });

  for (const largura of [1280, 560, 360]) test(`o controle da data tem tamanho fixo: as setas não saem do lugar quando o texto muda (${largura} px)`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await abrir(page);
    const caixas = () => page.evaluate(seletores => seletores.map(s => {
      const r = document.querySelector(s).getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.width)];
    }), ['.topo-data', ...SETAS_DA_DATA]);
    const inicial = await caixas();
    for (const data of ['2026-11-12', '2026-11-10', '2026-11-14', '2026-11-16', '2027-01-04', '2026-12-31']) {
      await campoDaData(page).fill(data);
      await expect(campoDaData(page)).toHaveValue(data);
      expect(await caixas(), data).toEqual(inicial);
    }
  });

  // O único botão que leva a outra aba (data-go) é o "Abrir a Demanda", em Alunos: os pedidos de cada data ficam lá
  test('navega pelas abas; sem os botões "Próximo" de um passo a passo', async ({ page }) => {
    await abrir(page);
    for (const aba of ['ins', 'alu', 'cur', 'dem', 'esc', 'bi', 'rec']) {
      await irPara(page, aba);
      await expect(botaoDaAba(page, aba)).toHaveClass(/\bon\b/);
      await expect(page.locator('section.on')).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: /^Próximo:/ })).toHaveCount(0);
    await expect(page.locator('[data-go]')).toHaveCount(1);
    await expect(page.locator('#s-alu [data-go="dem"]')).toHaveText('Abrir a Demanda');
  });

  test('aplica a folha de estilos (tokens de cor, layout e fontes)', async ({ page }) => {
    const fontes = [];
    page.on('request', r => { if (r.url().startsWith('https://fonts.googleapis.com/css2?family=Barlow')) fontes.push(r.url()); });
    await abrir(page);
    const estilos = () => page.evaluate(() => ({
      tinta: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
      fundo: getComputedStyle(document.body).backgroundColor,
      fonte: getComputedStyle(document.body).fontFamily,
      secaoInativa: getComputedStyle(document.querySelector('#s-bi')).display,
      principalMax: getComputedStyle(document.querySelector('main')).maxWidth
    }));
    expect(await estilos()).toEqual({
      tinta: '#12263A', fundo: 'rgb(238, 242, 245)', fonte: expect.stringContaining('Barlow'), secaoInativa: 'none', principalMax: '1280px'
    });
    expect(fontes).toHaveLength(1);

    await abrirMenuDaConta(page);
    await page.locator('#btn-theme').click();
    expect((await estilos()).fundo).not.toBe('rgb(238, 242, 245)');
  });

  test('alterna o tema e lembra a escolha após recarregar', async ({ page }) => {
    await abrir(page);
    const html = page.locator('html');
    await abrirMenuDaConta(page);
    const tema = page.locator('#btn-theme');
    // Um interruptor com ícones (sol e lua), sem texto
    await expect(tema).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(tema).toHaveAttribute('aria-label', 'Tema escuro');
    await expect(tema).toHaveAttribute('aria-checked', 'false');
    await expect(tema).toHaveText('');
    await expect(tema.locator('use')).toHaveCount(2);
    await tema.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(tema).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#menu-conta')).toBeVisible();
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await abrirMenuDaConta(page);
    await page.locator('#btn-theme').click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('o botão Manual abre, de qualquer aba, o manual com as regras em vigor', async ({ page }) => {
    await abrir(page);
    await irPara(page, 'dem');
    await page.locator('#btn-manual').click();
    const manual = page.locator('#s-manual');
    await expect(manual).toBeVisible();
    await expect(page.locator('#s-dem')).toBeHidden();

    // As tabelas de regras saem do código (missões, janelas, pesos e rodízio)
    await expect(page.locator('#manual-missoes tbody tr')).toHaveCount(18);
    await expect(page.locator('#manual-missoes tbody tr', { hasText: 'Cheque PC MLTE IFR' })).toContainText('Checador PC + Checador MLTE + Checador IFR');
    await expect(page.locator('#manual-janelas li')).toHaveCount(9);
    await expect(page.locator('#manual-pesos')).toContainText('C152: 170 kg');
    await expect(page.locator('#manual-rodizio li')).toHaveText(['Voos de cheque', 'Voo MLTE (PA-34)', 'Voo noturno', 'Voo C172']);

    await expect(manual.locator('h2')).toHaveText('Manual do AutoEscala');
    // Nada das regras e dos nomes antigos
    const texto = await manual.innerText();
    for (const antigo of ['A01', 'A09', 'Gerar escala', 'Preencher exemplo', 'Link Blindado', 'Importar Solicitações da Agenda',
      'Vai voar?', 'Início pref', 'Exportar CSV', 'Emitir PDF', 'Turno rápido', 'Cada cartão', 'campo Data', 'Equipamento', 'Bloquear',
      'Sessões', 'sessão', 'Desfazer', 'Escala de Voo', 'Por avião e sala', 'Avião / sala', 'Aviões e salas', 'o botão ao lado de Alunos',
      // O "+" do mapa fica ao lado do nome da linha; o Operador não muda os Cursos nem os limites da lei; a coluna de quem
      // vem é "Vem" (a data aberta não é sempre hoje); o filtro das habilitações tem várias marcas; o peso vem antes do
      // curso em Alunos; Cursos mostra um curso de cada vez (sem "todos")
      'no fim de cada linha', 'altera tudo e opera a escala', 'o interruptor de quem vem', 'filtro por habilitação', 'Nome, CANAC, curso e peso',
      'mostra um curso só ou todos',
      // Recursos em duas vistas (não mais em duas partes), com as categorias marcadas na barra
      'A aba tem duas partes', 'Escolha uma categoria para ver só a frota dela', 'na Frota, em “Vale para todas as datas”',
      'Veja na aba Recursos se ele está ligado']) {
      expect(texto, antigo).not.toContain(antigo);
    }
    await expect(manual.locator('h3')).toHaveText(['Primeiros passos: a rotina do operador', 'Perfis de acesso', 'As abas',
      'Como a escala é montada', 'Para o gestor', 'TV da recepção', 'Glossário', 'Perguntas frequentes']);
    // O Glossário sai do glossário das dicas
    await expect(page.locator('#manual-glossario-lista dt')).toHaveCount(Object.keys(GLOSSARIO).length);
    await expect(page.locator('#manual-glossario-lista')).toContainText(GLOSSARIO['horario-livre'].texto);
    // As abas na ordem do app, sem números, com os nomes dos botões e das vistas
    await expect(manual.locator('#manual-abas h4')).toHaveText(['Escala', 'Demanda', 'Agenda', 'Recursos', 'Instrutores', 'Alunos', 'Cursos', 'Rodízio', 'BI']);
    for (const novo of ['menu da conta', 'Pôr um aluno na demanda', 'Disponibilidade do dia', 'Editar habilitações', 'Não escalar com',
      'Ainda não importado', 'Atualizada às', 'Ver todos', 'Compartilhar', 'Por recurso', 'Novo recurso', 'Retirar', 'Horários de decolagem',
      'de 30 em 30 minutos', 'divide as horas do dia',
      // O agendamento na Escala (mover e encaixar, as turmas, as alternativas, a prévia, os avisos), o voo agendado na
      // Demanda, as alterações dos cursos fora do Histórico e o peso aceito
      'Encaixar o voo', 'Mover o voo', 'Entrar na turma das', 'Horários livres', 'O que muda na escala', 'Agendar mesmo assim',
      'agendado 10:10 · PR-VOB', 'fora da regra', 'ao lado do nome de cada linha', 'não entram no Histórico da data', 'de 1 a 300 kg',
      // Acima do limite de voos locais do horário, todo voo local agendado pede a confirmação (não só o 7º)
      'mais de 6 voos locais no mesmo horário',
      // A busca sem acentos, quantos aparecem e o "Limpar filtros"; a coluna Vem (a data aberta não é sempre hoje); o filtro
      // das habilitações, com várias marcas e a regra ("todas as marcadas")
      'sem os acentos', '12 de 40 instrutores', 'Limpar filtros', 'o interruptor Vem', 'Filtro das habilitações',
      'que têm todas as marcadas', 'Habilitações: Noturno + C172',
      // Alunos com a barra de Instrutores: as colunas na mesma ordem, o filtro dos cursos (a regra "algum dos marcados"),
      // o link para a Demanda (o filtro dos cursos é um só nas duas abas) e o cartão do celular
      'Nome, CANAC, peso e curso', 'Filtro dos cursos', 'aparecem os alunos de algum dos marcados', 'Curso: PP ou PC', 'Abrir a Demanda',
      'aparecem os pedidos dos alunos de algum dos cursos marcados', 'O filtro dos cursos é um só nas duas abas', 'um cartão por pessoa',
      // Recursos: as duas vistas, a busca pela matrícula, o filtro das categorias (a regra "alguma das marcadas") e o hangar
      // sem filtros
      'em Disponibilidade do dia, desligue', 'abre o Cadastro com o formulário', 'Buscar matrícula', '3 de 26 recursos',
      'os recursos de alguma das marcadas', 'Categoria: C152 ou PA-34', 'Filtro das categorias',
      'nunca para a ordem no hangar', 'cujo botão mostra o mesmo número', 'Veja em Recursos, na Disponibilidade do dia, se ele está ligado',
      // Cursos: um de cada vez, o índice das fases, as fases recolhidas e os alunos por fase
      'um curso de cada vez', 'índice das fases', 'Recolher todas', 'Abrir todas', 'agrupados pela fase em que estão']) {
      expect(texto, novo).toContain(novo);
    }

    // O índice leva às seções e as abas continuam funcionando
    await manual.locator('.manual-indice a[href="#manual-regras"]').click();
    await expect(page.locator('#manual-regras')).toBeInViewport();
    await irPara(page, 'esc');
    await expect(manual).toBeHidden();
  });

  test('o manual tem a largura das outras páginas e fica centralizado', async ({ page }) => {
    await abrir(page);
    await irPara(page, 'rec');
    // O quadro das janelas de operação (Recursos › Disponibilidade do dia), da largura da página
    const outra = await page.locator('#s-rec .vista-dia > .pn').first().boundingBox();
    await page.locator('#btn-manual').click();
    const cartao = await page.locator('#s-manual .pn').first().boundingBox();
    expect(Math.round(cartao.x)).toBe(Math.round(outra.x));
    expect(Math.round(cartao.width)).toBe(Math.round(outra.width));
    const largura = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(cartao.x - (largura - cartao.x - cartao.width))).toBeLessThanOrEqual(1);
  });
});

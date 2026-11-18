// A aba Cursos: o programa de cada curso (as tabelas dos cursos, em S.programa), fase a fase, com as missões na ordem em
// que o aluno voa. As fases seguidas com o mesmo módulo ficam sob um título só; cada fase diz quando abre, e cada missão,
// quando voar ("Depois das anteriores", "Livre na fase" ou "Depois de…" missões anteriores) e as marcas (dispensada,
// avaliação). O Administrador (neste navegador, o Operador) inclui, muda, reordena e tira fases e missões e volta com as
// retiradas; os outros perfis leem o programa em texto. A cada alteração a aba é refeita no lugar: o foco continua onde
// estava, e as caixas abertas ("Depois de…", as retiradas, as alterações) continuam abertas. Ela é refeita também ao
// abrir e junto com as outras abas (a data carregada, os dados lidos de novo, o conflito, a troca de perfil): aberta,
// nunca fica com os controles de antes. Sem os programas (a leitura falhou, ou eles ainda esperam a conversão do
// cadastro), ela diz por quê.
import { MIS, DURACAO_MAXIMA_H } from '../config.js';
import { percursoDoCurso, rotuloDaFase, requisitosPossiveis } from '../programa.js';
import { FUSO_DO_AEROCLUBE } from '../agenda.js';
import { ApiClient } from '../storage.js';
import { gerenciaContas } from '../perfis.js';
import { S, isGestor, dadoIndisponivel } from '../state.js';
import { esc, opts, fmtH } from '../format.js';
import { $, trocarConteudo, trocarElemento } from '../dom.js';

// Os programas que não foram lidos, ou que ainda estão no cadastro: o que a aba mostra no lugar deles (o mesmo texto do
// aviso do topo, em js/actions.js). A próxima missão e o progresso ficam desligados
export const SEM_OS_PROGRAMAS = {
  cursos: 'Não foi possível ler os programas dos cursos: a próxima missão, o progresso e a missão do curso no agendamento ficam desligados.',
  'cursos-pendentes': 'Os programas dos cursos ainda não foram trazidos do cadastro (isso acontece na primeira abertura de um Operador ou Administrador depois da atualização): a próxima missão e o progresso ficam desligados.'
};
export const programasIndisponiveis = () => Object.keys(SEM_OS_PROGRAMAS).filter(parte => dadoIndisponivel(parte));

// Depois de um conflito a tela fica só para consulta, também para o Administrador
export const podeEditarCursos = () => !ApiClient.readOnly && (ApiClient.perfil ? gerenciaContas(ApiClient.perfil) : !isGestor());

// O código de uma missão com resultados não muda (os resultados guardam o código; o nome muda): vale o que o programa lido
// diz e o que a data leu dos resultados (um resultado registrado depois da leitura do programa). Os códigos com resultado
// são contados uma vez por leitura dos resultados (registrar um resultado troca a lista)
const comResultado = new WeakMap();
function codigosComResultado() {
  const situacao = (S.resultados && S.resultados.situacao) || [];
  if (!comResultado.has(situacao)) comResultado.set(situacao, new Set(situacao.map(r => `${r.curso}|${r.missao}`)));
  return comResultado.get(situacao);
}
export const codigoTravado = (sigla, m) => m.comResultados || codigosComResultado().has(`${sigla}|${m.codigo}`);
const TRAVADO = 'Já há resultados com este código: o código não muda (o nome muda)';

// "A, B e C"
export const listaComE = nomes => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0] || '');
// O que uma fase ou uma missão espera ("depois de…"): os nomes curtos das fases ou os códigos das missões, na ordem do
// curso
export function nomesDosRequisitos(curso, item) {
  const fases = new Map(curso.fases.map(f => [f.id, f])), missoes = new Map(curso.missoes.map(m => [m.id, m]));
  return item.requer.map(id => (fases.has(id) ? rotuloDaFase(fases.get(id)) : missoes.has(id) ? missoes.get(id).codigo : null)).filter(Boolean);
}
// A lista no resumo da caixa "Depois de…": até três nomes, e quantos mais
const resumoDaLista = nomes => (nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : listaComE(nomes));

// As regras de quando a fase abre e de quando voar a missão; "Depois de…" desligada quando não há nada antes para esperar
const QUANDO_ABRE = [['ordem', 'Depois das fases anteriores'], ['livre', 'Desde o início do curso'], ['depois', 'Depois de…']];
const QUANDO_VOAR = [['ordem', 'Depois das anteriores'], ['livre', 'Livre na fase'], ['depois', 'Depois de…']];
const opcoesDaRegra = (rotulos, regra, semAnteriores) => rotulos.map(([valor, rotulo]) =>
  `<option value="${valor}"${valor === regra ? ' selected' : ''}${valor === 'depois' && semAnteriores ? ' disabled' : ''}>${rotulo}</option>`).join('');
// Quando voar, em texto (para quem só consulta): "Depois das anteriores", "Livre na fase" ou "Depois de TSL-01"
const quandoVoar = (curso, m) => (m.regra === 'livre' ? 'Livre na fase'
  : m.regra === 'depois' ? `Depois de ${listaComE(nomesDosRequisitos(curso, m))}` : 'Depois das anteriores');

const opcoesDoRecurso = m => opts(MIS[m.mis].eq.map(e => [e, e]), m.eq);
const quantas = (n, uma, varias) => `${n} ${n === 1 ? uma : varias}`;
// Os nomes dos botões de uma missão: o ✕ de uma missão com resultados diz que eles ficam
const ROTULOS = { 'missao-subir': 'Subir', 'missao-descer': 'Descer' };
const rotuloDoBotao = (act, sigla, m) => (act === 'missao-retirar'
  ? `Tirar ${m.codigo} do programa${codigoTravado(sigla, m) ? '; os resultados ficam no histórico' : ''}`
  : `${ROTULOS[act]} ${m.codigo}`);

// A caixa "Depois de…" de uma fase: o resumo (o que ela espera) e uma marca para cada fase anterior
function requisitosDaFase(curso, f, abertas) {
  const marcadas = new Set(f.requer), id = `requisitos-${f.id}`;
  const fases = requisitosPossiveis(curso, f.id).map(g => `<label class="chk"><input type="checkbox" data-cfa="requer" data-fase="${esc(g.id)}" value="${esc(g.id)}"${marcadas.has(g.id) ? ' checked' : ''}> ${esc(rotuloDaFase(g))}</label>`);
  return `<details class="requisitos"${abertas.has(id) ? ' open' : ''}><summary id="${esc(id)}">Depois de: ${esc(resumoDaLista(nomesDosRequisitos(curso, f)))}</summary>
    <fieldset><legend>A ${esc(rotuloDaFase(f))} abre depois de</legend>${fases.join('')}</fieldset></details>`;
}

// A caixa "Depois de…" de uma missão: o resumo e as missões anteriores, por fase (as de fases anteriores também valem)
function requisitosDaMissao(curso, m, abertas) {
  const marcadas = new Set(m.requer), id = `requisitos-${m.id}`, possiveis = requisitosPossiveis(curso, m.id);
  const grupos = percursoDoCurso(curso).fases.map(f => [f, possiveis.filter(x => x.fase === f.id)]).filter(([, lista]) => lista.length);
  const marca = x => `<label class="chk"><input type="checkbox" data-cf="requer" data-missao="${esc(x.id)}" value="${esc(x.id)}" aria-label="${esc(m.codigo)} depois de ${esc(x.codigo)}"${marcadas.has(x.id) ? ' checked' : ''}> ${esc(x.codigo)}</label>`;
  return `<details class="requisitos"${abertas.has(id) ? ' open' : ''}><summary id="${esc(id)}">Depois de: ${esc(resumoDaLista(nomesDosRequisitos(curso, m)))}</summary>
    ${grupos.map(([f, lista]) => `<fieldset><legend>${esc(rotuloDaFase(f))}</legend>${lista.map(marca).join('')}</fieldset>`).join('')}</details>`;
}

// Uma missão da fase, para quem muda: o número na fase, o código (travado com resultados), o nome, o tipo de missão, o
// recurso, as horas, quando voar (com a caixa "Depois de…"), as marcas e os botões (subir, descer, tirar) com a fase
// dela. onde: "do PP" (o curso com uma fase só) ou "da Fase 6"
function linhaQueEdita(curso, fase, m, i, total, fases, onde, abertas) {
  const ground = Boolean(MIS[m.mis].isGround), travado = codigoTravado(curso.sigla, m), codigo = esc(m.codigo);
  const botao = (act, texto, desligado) => `<button type="button" class="x" data-act="${act}" aria-label="${esc(rotuloDoBotao(act, curso.sigla, m))}"${desligado ? ' disabled' : ''}>${texto}</button>`;
  const outraFase = fases.length > 1 ? `<select data-cf="fase" aria-label="Fase de ${codigo}">${opts(fases.map(f => [f.id, rotuloDaFase(f)]), m.fase)}</select>` : '';
  // A primeira missão do curso não tem nada antes para esperar
  const semAnteriores = percursoDoCurso(curso).posicao.get(m.id) === 0;
  return `<tr data-missao="${esc(m.id)}" data-fase="${esc(fase.id)}" data-i="${i}">
    <td class="n">${i + 1}</td>
    <td class="c-codigo"><input data-cf="codigo" class="codigo" value="${codigo}" maxlength="15" autocomplete="off" aria-label="Código da ${i + 1}ª missão ${esc(onde)}"${travado ? ` readonly title="${TRAVADO}"` : ''}>${travado ? `<svg class="ico" role="img" aria-label="${TRAVADO}"><use href="#i-cadeado"/></svg>` : ''}</td>
    <td class="c-nome"><input data-cf="nome" value="${esc(m.nome)}" maxlength="80" autocomplete="off" aria-label="Nome de ${codigo}"></td>
    <td class="c-mis"><select data-cf="mis" aria-label="Missão de ${codigo}">${opts(Object.keys(MIS).map(k => [k, k]), m.mis)}</select></td>
    <td class="c-eq"><select data-cf="eq" aria-label="Recurso de ${codigo}"${ground ? ' disabled' : ''}>${opcoesDoRecurso(m)}</select></td>
    <td class="c-nb"><input type="number" class="duracao" data-cf="nb" min="0.1" max="${DURACAO_MAXIMA_H}" step="0.1" inputmode="decimal" value="${esc(m.nb)}" aria-label="Horas de ${codigo}"${ground ? ' disabled' : ''}></td>
    <td class="c-quando"><select data-cf="regra" aria-label="Quando voar ${codigo}">${opcoesDaRegra(QUANDO_VOAR, m.regra, semAnteriores)}</select>${m.regra === 'depois' ? requisitosDaMissao(curso, m, abertas) : ''}</td>
    <td class="c-marcas"><label class="chk"><input type="checkbox" data-cf="dispensada" aria-label="${codigo} dispensada"${m.dispensada ? ' checked' : ''}> Dispensada</label> <label class="chk"><input type="checkbox" data-cf="avaliacao" aria-label="${codigo} de avaliação"${m.avaliacao ? ' checked' : ''}> Avaliação</label></td>
    <td class="acoes"><div class="acoes-da-missao">${botao('missao-subir', '↑', i === 0)}${botao('missao-descer', '↓', i === total - 1)}${botao('missao-retirar', '✕', false)}${outraFase}</div></td>
  </tr>`;
}

// Uma missão da fase, para quem só consulta: tudo em texto, e as marcas como etiquetas
function linhaDeConsulta(curso, fase, m, i) {
  const marcas = [m.dispensada ? '<span class="tag" data-dica="dispensada">dispensada</span>' : '', m.avaliacao ? '<span class="tag">AVAL</span>' : ''];
  return `<tr data-missao="${esc(m.id)}" data-fase="${esc(fase.id)}" data-i="${i}">
    <td class="n">${i + 1}</td>
    <td class="c-codigo codigo">${esc(m.codigo)}</td>
    <td class="c-nome">${esc(m.nome)}</td>
    <td class="c-mis">${esc(m.mis)}</td>
    <td class="c-eq">${esc(m.eq)}</td>
    <td class="c-nb">${esc(fmtH(m.nb))}</td>
    <td class="c-quando">${esc(quandoVoar(curso, m))}</td>
    <td class="c-marcas">${marcas.filter(Boolean).join(' ')}</td>
  </tr>`;
}

// O cabeçalho da fase, para quem muda: o título (para o leitor de tela e o nome da tabela), o nome, o módulo (com os
// módulos em uso), quando ela abre (com a caixa "Depois de…") e os botões: subir, descer e tirar (só a fase sem missões)
function cabecalhoQueEdita(curso, f, i, total, comMissoes, nivel, abertas) {
  const rotulo = esc(rotuloDaFase(f));
  const botao = (act, texto, nome, desligado, dica = '') => `<button type="button" class="x" data-act="${act}" aria-label="${nome}"${dica ? ` title="${dica}"` : ''}${desligado ? ' disabled' : ''}>${texto}</button>`;
  return `<div class="fase-cab">
    <${nivel} class="sr" id="fase-${esc(f.id)}">${esc(f.nome)}</${nivel}>
    <label class="campo-da-fase nome-da-fase"><span>Nome</span> <input data-cfa="nome" value="${esc(f.nome)}" maxlength="80" autocomplete="off" aria-label="Nome da ${rotulo}"></label>
    <label class="campo-da-fase modulo-da-fase"><span>Módulo</span> <input data-cfa="modulo" value="${esc(f.modulo || '')}" maxlength="80" autocomplete="off" list="cur-modulos" aria-label="Módulo da ${rotulo}"></label>
    <label class="campo-da-fase"><span>Abre</span> <select data-cfa="regra" aria-label="Quando a ${rotulo} abre">${opcoesDaRegra(QUANDO_ABRE, f.regra, i === 0)}</select></label>
    ${f.regra === 'depois' ? requisitosDaFase(curso, f, abertas) : ''}
    <span class="acoes">${botao('fase-subir', '↑', `Subir a ${rotulo}`, i === 0)}${botao('fase-descer', '↓', `Descer a ${rotulo}`, i === total - 1)}${botao('fase-retirar', '✕', `Tirar a ${rotulo} do programa`, comMissoes, comMissoes ? 'Só a fase sem missões sai do programa: tire as missões dela ou mude-as de fase antes' : '')}</span>
  </div>`;
}

// O cabeçalho da fase, para quem só consulta: o nome e, quando ela não espera só as fases anteriores, quando abre
function cabecalhoDeConsulta(curso, f, nivel) {
  const abre = f.regra === 'livre' ? 'Abre desde o início do curso'
    : f.regra === 'depois' ? `Abre depois ${listaComE(nomesDosRequisitos(curso, f).map(nome => `da ${nome}`))}` : '';
  return `<div class="fase-cab"><${nivel} id="fase-${esc(f.id)}">${esc(f.nome)}</${nivel}>${abre ? `<p class="regra">${esc(abre)}</p>` : ''}</div>`;
}

// Uma fase do programa: o cabeçalho, a tabela das missões e, para quem muda, o "+ Missão" dela. nivel: o título da fase
// (h5 sob o título de um módulo; h4 sem módulo). No curso com mais de uma fase, os nomes dizem a fase
function blocoDaFase(curso, fase, i, fases, missoes, edita, nivel, abertas) {
  const rotulo = rotuloDaFase(fase), variasFases = fases.length > 1, onde = variasFases ? `da ${rotulo}` : `do ${curso.sigla}`;
  const cabecalho = edita ? cabecalhoQueEdita(curso, fase, i, fases.length, missoes.length > 0, nivel, abertas) : cabecalhoDeConsulta(curso, fase, nivel);
  const linhas = missoes.map((m, j) => (edita ? linhaQueEdita(curso, fase, m, j, missoes.length, fases, onde, abertas) : linhaDeConsulta(curso, fase, m, j)));
  const colunas = `<th>#</th><th>Código</th><th>Nome</th><th>Missão</th><th>Recurso</th><th>Horas</th><th>Quando voar<button type="button" class="dica-btn" data-dica="quando-voar" aria-label="O que é Quando voar?" aria-expanded="false"></button></th><th>Marcas</th>${edita ? '<th aria-label="Ações"></th>' : ''}`;
  const tabela = missoes.length
    ? `<div class="tw"><table class="cadastro programa${edita ? '' : ' consulta'}" aria-labelledby="fase-${esc(fase.id)}"><thead><tr>${colunas}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
    : '<p class="h">Nenhuma missão nesta fase.</p>';
  return `<div class="fase" data-fase="${esc(fase.id)}">
    ${cabecalho}
    ${tabela}
    ${edita ? `<button type="button" class="btn sec" data-act="missao-nova" data-fase="${esc(fase.id)}">+ Missão${variasFases ? ` na ${esc(rotulo)}` : ''}</button>` : ''}
  </div>`;
}

// As fases e as missões tiradas do programa (elas guardam o código), com "Voltar ao programa" para quem muda
function retiradasDoCurso(curso, edita, abertas) {
  const fasesFora = curso.fases.filter(f => f.removida), missoesFora = curso.missoes.filter(m => m.removida);
  if (!fasesFora.length && !missoesFora.length) return '';
  const daFase = new Map(curso.fases.map(f => [f.id, f])), id = `retiradas-${curso.sigla}`;
  const voltar = (act, atributo, alvo, nome) => (edita
    ? ` <button type="button" class="btn quiet" data-act="${act}" ${atributo}="${esc(alvo)}" aria-label="Voltar ao programa: ${esc(nome)}">Voltar ao programa</button>` : '');
  const missao = m => {
    const fase = daFase.get(m.fase);
    return `<li><span><b>${esc(m.codigo)}</b>${m.nome !== m.codigo ? ` ${esc(m.nome)}` : ''}${fase ? ` · ${esc(rotuloDaFase(fase))}` : ''}</span>${voltar('missao-restaurar', 'data-missao', m.id, m.codigo)}</li>`;
  };
  return `<details class="retiradas"${abertas.has(id) ? ' open' : ''}><summary id="${esc(id)}">Retiradas (${fasesFora.length + missoesFora.length})</summary><ul>
    ${fasesFora.map(f => `<li><span>${esc(f.nome)}</span>${voltar('fase-restaurar', 'data-fase', f.id, rotuloDaFase(f))}</li>`).join('')}${missoesFora.map(missao).join('')}
  </ul></details>`;
}

// As últimas alterações do programa (a mais recente primeiro): quando, quem e o que mudou
const HORA_DA_ALTERACAO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DO_AEROCLUBE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
function alteracoesDoCurso(curso, aberta) {
  const lista = curso.alteracoes || [];
  if (!lista.length) return '';
  const item = a => {
    const instante = Date.parse(a.registrado_em);
    const quando = Number.isFinite(instante) ? `[${HORA_DA_ALTERACAO.format(instante).replace(',', '')}] ` : '';
    return `<li>${esc(quando)}${a.registrado_por ? `${esc(a.registrado_por)} · ` : ''}${esc(a.descricao)}</li>`;
  };
  return `<details class="alteracoes"${aberta ? ' open' : ''}><summary id="alteracoes-${esc(curso.sigla)}">Alterações do programa</summary><ol>${lista.map(item).join('')}</ol></details>`;
}

// Um curso: a sigla, o nome, quantas fases (quando são mais de uma), quantas missões contam e quantas são dispensadas;
// as fases, sob o título do módulo delas; "+ Fase", as retiradas e as alterações. O curso sem nenhuma fase tem o
// "+ Missão" que começa a Fase 1
function cartaoDoCurso(curso, edita, abertas) {
  const { fases, porFase, missoes } = percursoDoCurso(curso);
  const sigla = esc(curso.sigla), dispensadas = missoes.filter(m => m.dispensada).length;
  const resumo = `${esc(curso.nome)}${fases.length > 1 ? ` · <span data-dica="fase-do-curso">${fases.length} fases</span>` : ''} · ${quantas(missoes.length - dispensadas, 'missão', 'missões')}${dispensadas ? ` (<span data-dica="dispensada">${quantas(dispensadas, 'dispensada', 'dispensadas')}</span>)` : ''}`;
  let modulo = null;
  const corpo = fases.length
    ? fases.map((f, i) => {
      const titulo = f.modulo && f.modulo !== modulo ? `<h4 class="modulo">${esc(f.modulo)}</h4>` : '';
      modulo = f.modulo;
      return titulo + blocoDaFase(curso, f, i, fases, porFase.get(f.id), edita, f.modulo ? 'h5' : 'h4', abertas);
    }).join('')
    : `<p class="h">Nenhuma missão no programa.${edita ? ' Use “+ Missão” para incluir a primeira (ela começa a Fase 1), ou “+ Fase” para começar pelas fases.' : ''}</p>${edita ? '<button type="button" class="btn sec" data-act="missao-nova">+ Missão</button>' : ''}`;
  return `<div class="pn curso" data-curso="${sigla}">
    <div class="curso-cab"><h3 id="curso-${sigla}">${sigla} <small>${resumo}</small></h3></div>
    ${corpo}
    ${edita ? '<button type="button" class="btn sec" data-act="fase-nova">+ Fase</button>' : ''}
    ${retiradasDoCurso(curso, edita, abertas)}
    ${alteracoesDoCurso(curso, abertas.has(`alteracoes-${curso.sigla}`))}
  </div>`;
}

// Na tela estreita, a tabela de cada fase rola para o lado: refeita a aba, ela fica onde estava (e não volta ao começo a
// cada marca clicada na direita dela), com o elemento em foco à vista
const TABELA_DA_FASE = '.fase[data-fase] > .tw';
function manterRolagens(lugar, rolagens) {
  for (const tw of lugar.querySelectorAll(TABELA_DA_FASE)) tw.scrollLeft = rolagens.get(tw.parentElement.dataset.fase) || 0;
  const ativo = document.activeElement, tw = ativo && lugar.contains(ativo) ? ativo.closest('.tw') : null;
  if (!tw) return;
  const el = ativo.getBoundingClientRect(), caixa = tw.getBoundingClientRect();
  if (el.left < caixa.left) tw.scrollLeft -= caixa.left - el.left;
  else if (el.right > caixa.right) tw.scrollLeft += Math.min(el.right - caixa.right, el.left - caixa.left);
}

export function rCursos() {
  const lugar = $('#cursos');
  if (!lugar) return;
  const faltam = programasIndisponiveis();
  if (faltam.length) {
    trocarConteudo(lugar, `<p class="h">${faltam.map(parte => SEM_OS_PROGRAMAS[parte]).join(' ')}</p>`);
    return;
  }
  const edita = podeEditarCursos(), programa = S.programa || [];
  const abertas = new Set([...lugar.querySelectorAll('details[open] > summary[id]')].map(s => s.id));
  const rolagens = new Map([...lugar.querySelectorAll(TABELA_DA_FASE)].map(tw => [tw.parentElement.dataset.fase, tw.scrollLeft]));
  const modulos = [...new Set(programa.flatMap(c => percursoDoCurso(c).fases.map(f => f.modulo).filter(Boolean)))];
  // Antes de a data abrir, sem programa: a aba é refeita quando ele chega
  trocarConteudo(lugar, `<p class="h">O programa de cada curso, em fases (as fases de um módulo juntas), na ordem em que o aluno voa: quando cada fase abre e, em cada missão, o código (PP-07), o nome, o tipo de missão da escala, o recurso, as horas e quando voar. ${edita ? 'Só o Administrador muda.' : 'Só o Administrador muda; aqui é consulta.'}</p>`
    + programa.map(curso => cartaoDoCurso(curso, edita, abertas)).join('')
    + (edita ? `<datalist id="cur-modulos">${modulos.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>` : ''));
  manterRolagens(lugar, rolagens);
}

// Só a lista das alterações de um curso, depois de uma gravação confirmada (o resto da aba já mostra o curso como ficou;
// refazer a aba inteira perderia o que está sendo digitado em outro campo). A primeira alteração de um curso põe a lista
// no fim do cartão dele
export function mostrarAlteracoes(curso) {
  const cartao = $(`#cursos .curso[data-curso="${CSS.escape(curso.sigla)}"]`);
  if (!cartao) return;
  const caixa = cartao.querySelector(':scope > details.alteracoes');
  if (caixa) trocarElemento(caixa, alteracoesDoCurso(curso, caixa.open));
  else cartao.insertAdjacentHTML('beforeend', alteracoesDoCurso(curso, false));
}

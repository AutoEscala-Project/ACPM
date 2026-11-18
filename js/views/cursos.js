// A aba Cursos: o programa de cada curso (as tabelas dos cursos, em S.programa), fase a fase, com as missões na ordem em
// que o aluno voa. O Administrador (neste navegador, o Operador) inclui, muda, reordena e tira missões; os outros perfis
// só consultam. Os campos mudam no lugar, para o foco do teclado continuar onde estava. Ela é refeita ao abrir e junto
// com as outras abas (a data carregada, os dados lidos de novo, o conflito, a troca de perfil): aberta, nunca fica com os
// controles de antes. Sem os programas (a leitura falhou, ou eles ainda esperam a conversão do cadastro), ela diz por quê.
import { MIS, DURACAO_MAXIMA_H } from '../config.js';
import { percursoDoCurso, rotuloDaFase } from '../programa.js';
import { ApiClient } from '../storage.js';
import { gerenciaContas } from '../perfis.js';
import { S, isGestor, dadoIndisponivel } from '../state.js';
import { esc, opts } from '../format.js';
import { $ } from '../dom.js';

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

const opcoesDoRecurso = m => opts(MIS[m.mis].eq.map(e => [e, e]), m.eq);
const quantasMissoes = n => `${n} ${n === 1 ? 'missão' : 'missões'}`;
// Os nomes dos botões de uma missão: o ✕ de uma missão com resultados diz que eles ficam
const ROTULOS = { 'missao-subir': 'Subir', 'missao-descer': 'Descer' };
const rotuloDoBotao = (act, sigla, m) => (act === 'missao-retirar'
  ? `Tirar ${m.codigo} do programa${codigoTravado(sigla, m) ? '; os resultados ficam no histórico' : ''}`
  : `${ROTULOS[act]} ${m.codigo}`);

// Uma missão da fase: o número na fase, o código (travado com resultados), o nome, o tipo de missão, o recurso, as horas
// e os botões. onde: "do PP" (o curso com uma fase só) ou "da Fase 6"
function linha(sigla, fase, m, i, total, edita, onde) {
  const ground = Boolean(MIS[m.mis].isGround), d = edita ? '' : ' disabled', travado = codigoTravado(sigla, m);
  const botao = (act, texto, desligado) => `<button type="button" class="x" data-act="${act}" aria-label="${esc(rotuloDoBotao(act, sigla, m))}"${desligado ? ' disabled' : ''}>${texto}</button>`;
  return `<tr data-missao="${esc(m.id)}" data-fase="${esc(fase.id)}" data-i="${i}">
    <td class="n">${i + 1}</td>
    <td><input data-cf="codigo" class="codigo" value="${esc(m.codigo)}" maxlength="15" aria-label="Código da ${i + 1}ª missão ${esc(onde)}"${travado ? ` readonly title="${TRAVADO}"` : ''}${d}>${travado ? `<svg class="ico" role="img" aria-label="${TRAVADO}"><use href="#i-cadeado"/></svg>` : ''}</td>
    <td><input data-cf="nome" value="${esc(m.nome)}" maxlength="80" aria-label="Nome de ${esc(m.codigo)}"${d}></td>
    <td><select data-cf="mis" aria-label="Missão de ${esc(m.codigo)}"${d}>${opts(Object.keys(MIS).map(k => [k, k]), m.mis)}</select></td>
    <td><select data-cf="eq" aria-label="Recurso de ${esc(m.codigo)}"${ground || !edita ? ' disabled' : ''}>${opcoesDoRecurso(m)}</select></td>
    <td><input type="number" class="duracao" data-cf="nb" min="0.1" max="${DURACAO_MAXIMA_H}" step="0.1" inputmode="decimal" value="${esc(m.nb)}" aria-label="Horas de ${esc(m.codigo)}"${ground || !edita ? ' disabled' : ''}></td>
    <td class="acoes">${edita ? botao('missao-subir', '↑', i === 0) + botao('missao-descer', '↓', i === total - 1) + botao('missao-retirar', '✕', false) : ''}</td>
  </tr>`;
}

// Uma fase do programa: o nome (só leitura) e a tabela das missões, com "+ Missão" no fim. No curso com mais de uma fase,
// os nomes dizem a fase
function blocoDaFase(curso, fase, missoes, edita, variasFases) {
  const rotulo = rotuloDaFase(fase), onde = variasFases ? `da ${rotulo}` : `do ${curso.sigla}`;
  const tabela = missoes.length
    ? `<div class="tw"><table class="cadastro programa" aria-labelledby="fase-${esc(fase.id)}"><thead><tr><th>#</th><th>Código</th><th>Nome</th><th>Missão</th><th>Recurso</th><th>Horas</th><th aria-label="Ações"></th></tr></thead>
      <tbody>${missoes.map((m, i) => linha(curso.sigla, fase, m, i, missoes.length, edita, onde)).join('')}</tbody></table></div>`
    : `<p class="h">Nenhuma missão nesta fase.</p>`;
  return `<div class="fase" data-fase="${esc(fase.id)}">
    <div class="fase-cab"><h4 id="fase-${esc(fase.id)}">${esc(fase.nome)}</h4></div>
    ${tabela}
    ${edita ? `<button type="button" class="btn sec" data-act="missao-nova" data-fase="${esc(fase.id)}">+ Missão${variasFases ? ` na ${esc(rotulo)}` : ''}</button>` : ''}
  </div>`;
}

// Um curso: a sigla, o nome, quantas fases (quando são mais de uma) e quantas missões há no programa, e as fases. O curso
// sem nenhuma fase tem o "+ Missão" que começa a Fase 1
function cartaoDoCurso(curso, edita) {
  const { fases, porFase, missoes } = percursoDoCurso(curso);
  const sigla = esc(curso.sigla);
  const resumo = `${esc(curso.nome)}${fases.length > 1 ? ` · ${fases.length} fases` : ''} · ${quantasMissoes(missoes.length)}`;
  const corpo = fases.length
    ? fases.map(f => blocoDaFase(curso, f, porFase.get(f.id), edita, fases.length > 1)).join('')
    : `<p class="h">Nenhuma missão no programa.${edita ? ' Use “+ Missão” para incluir a primeira.' : ''}</p>${edita ? '<button type="button" class="btn sec" data-act="missao-nova">+ Missão</button>' : ''}`;
  return `<div class="pn curso" data-curso="${sigla}">
    <h3 id="curso-${sigla}">${sigla} <small>${resumo}</small></h3>
    ${corpo}
  </div>`;
}

export function rCursos() {
  const lugar = $('#cursos');
  if (!lugar) return;
  const faltam = programasIndisponiveis();
  if (faltam.length) {
    lugar.innerHTML = `<p class="h">${faltam.map(parte => SEM_OS_PROGRAMAS[parte]).join(' ')}</p>`;
    return;
  }
  const edita = podeEditarCursos();
  // Antes de a data abrir, sem programa: a aba é refeita quando ele chega
  lugar.innerHTML = `<p class="h">O programa de cada curso, em fases, na ordem em que o aluno voa: o código da missão (PP-07), o nome, o tipo de missão da escala, o recurso e as horas. ${edita ? 'Só o Administrador muda.' : 'Só o Administrador muda; aqui é consulta.'}</p>`
    + (S.programa || []).map(curso => cartaoDoCurso(curso, edita)).join('');
}

// A linha depois de uma mudança (ou de uma recusa), no lugar: o código (normalizado), o nome, o tipo de missão, o recurso
// e as horas da missão, e os nomes dos campos e dos botões, que dizem o código
export function atualizarLinhaDoPrograma(tr, sigla, m) {
  const ground = Boolean(MIS[m.mis].isGround);
  tr.querySelector('[data-cf="codigo"]').value = m.codigo;
  tr.querySelector('[data-cf="nome"]').value = m.nome;
  tr.querySelector('[data-cf="mis"]').value = m.mis;
  const eq = tr.querySelector('[data-cf="eq"]'), nb = tr.querySelector('[data-cf="nb"]');
  eq.innerHTML = opcoesDoRecurso(m);
  nb.value = m.nb;
  eq.disabled = nb.disabled = ground;
  [['nome', 'Nome de'], ['mis', 'Missão de'], ['eq', 'Recurso de'], ['nb', 'Horas de']].forEach(([cf, rotulo]) => tr.querySelector(`[data-cf="${cf}"]`).setAttribute('aria-label', `${rotulo} ${m.codigo}`));
  ['missao-subir', 'missao-descer', 'missao-retirar'].forEach(act => {
    const b = tr.querySelector(`[data-act="${act}"]`);
    if (b) b.setAttribute('aria-label', rotuloDoBotao(act, sigla, m));
  });
}

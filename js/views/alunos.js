// Aba Alunos: uma tabela com as mesmas colunas de Instrutores na frente (nome, CANAC e peso) e a barra no mesmo lugar (a
// busca, o filtro dos cursos, quantos aparecem e "+ Novo"). Os dados pessoais abrem num painel (js/views/painel-de-dados.js),
// só para quem pode vê-los (.so-dados)
import { esc, opts, LIMITE_DO_NOME, chaveDeBusca } from '../format.js';
import { S, insBy, isGestor, inativoNaDataAberta } from '../state.js';
import { $ } from '../dom.js';
import { canacDe } from './dados-pessoais.js';
import { progressoDoAluno } from './etapas.js';
import { criarFiltroDosCursos, cursosConhecidos, cursoDaLinha } from './filtro-dos-cursos.js';
import { filtrarLinhas } from './linhas-filtradas.js';

// O instrutor já escolhido que ficou inativo continua no chip, com "(inativo)"; a lista oferece só os ativos
const nomeComInativo = x => (inativoNaDataAberta(x) ? `${x.nm} (inativo)` : x.nm);

// Alunos: uma tabela (nome, CANAC, peso, curso e os instrutores com quem o aluno voa de preferência ou não deve ser escalado)
function naoEscalarCom(s) {
  return s.bl.map(b => insBy(b) ? `<span class="tg">${esc(nomeComInativo(insBy(b)))}<button class="edit-only" data-act="unbl" data-b="${b}" aria-label="Voltar a escalar com ${esc(insBy(b).nm)}">✕</button></span>` : '').join('') +
    `<select data-f="bl" class="edit-only" aria-label="Não escalar com"><option value="">Não escalar com…</option>${S.ins.filter(x => !s.bl.includes(x.id) && !inativoNaDataAberta(x)).map(x => `<option value="${x.id}">${esc(x.nm)}</option>`).join('')}</select>`;
}

// “Priorizar com”: os instrutores do aluno (o par permanente). A escala põe o aluno com um deles sempre que algum pode voar o
// pedido; sem nenhum, com outro instrutor, e avisa. Quem está em “Não escalar com” não entra na lista
function voaCom(s) {
  const pares = s.voaCom || [];
  return pares.map(b => insBy(b) ? `<span class="tg par">${esc(nomeComInativo(insBy(b)))}<button class="edit-only" data-act="unvc" data-b="${b}" aria-label="Tirar ${esc(insBy(b).nm)} de Priorizar com">✕</button></span>` : '').join('') +
    `<select data-f="voaCom" class="edit-only" aria-label="Priorizar com"><option value="">Priorizar com…</option>${S.ins.filter(x => !pares.includes(x.id) && !s.bl.includes(x.id) && !inativoNaDataAberta(x)).map(x => `<option value="${x.id}">${esc(x.nm)}</option>`).join('')}</select>`;
}

// O curso do aluno: os cursos ativos (a aba Cursos), e o curso dele quando está encerrado ("(encerrado)") ou não existe
// ("(curso desconhecido)"). Sem os programas lidos, os três cursos com que o app começa (o servidor sempre os tem:
// nenhum curso é apagado) e o curso dele que não é um deles, só pela sigla (nada é dito sobre ele)
function opcoesDoCurso(s) {
  const { semProgramas, programa } = cursosConhecidos();
  const atual = s.curso ? programa.find(c => c.sigla === s.curso) : null;
  const doAluno = !s.curso || (atual && atual.ativo) ? []
    : [[s.curso, atual ? `${s.curso} · ${atual.nome} (encerrado)` : semProgramas ? s.curso : `${s.curso} (curso desconhecido)`]];
  return opts([['', '—'], ...programa.filter(c => c.ativo).map(c => [c.sigla, `${c.sigla} · ${c.nome}`]), ...doAluno], s.curso || '');
}

// As colunas na ordem das de Instrutores (o nome, o CANAC e o peso; depois, as do aluno). data-curso: o curso do aluno,
// para o filtro dos cursos
const linhaDoAluno = s => `<tr class="cd" data-k="s" data-id="${s.id}" data-nm="${esc(chaveDeBusca(s.nm))}" data-curso="${esc(s.curso || '')}">
  <td class="c-nome"><input class="nm" data-f="nm" value="${esc(s.nm)}" maxlength="${LIMITE_DO_NOME}" aria-label="Nome do aluno"></td>
  <td class="c-canac so-dados" data-rotulo="CANAC">${esc(canacDe('aluno', s.id))}</td>
  <td class="c-peso" data-rotulo="Peso (kg)"><input type="number" min="1" max="300" data-f="kg" value="${s.kg || ''}" placeholder="sem peso" aria-label="Peso de ${esc(s.nm)} em kg"${s.kg ? '' : ' class="falta"'}></td>
  <td class="c-curso" data-rotulo="Curso"><select data-f="curso" aria-label="Curso de ${esc(s.nm)}"${isGestor() ? ' disabled' : ''}>${opcoesDoCurso(s)}</select>${progressoDoAluno(s)}</td>
  <td class="c-voa-com" data-rotulo="Priorizar com"><div class="bl voa-com">${voaCom(s)}</div></td>
  <td class="c-nao-escalar" data-rotulo="Não escalar com"><div class="bl nao-escalar">${naoEscalarCom(s)}</div></td>
  <td class="acoes"><button type="button" class="btn quiet so-dados" data-dados="aluno:${s.id}" aria-label="Dados pessoais de ${esc(s.nm)}">Dados pessoais</button><button class="x edit-only" data-act="dels" aria-label="Excluir ${esc(s.nm)}">✕</button></td>
</tr>`;

export const rAlu = () => {
  // As opções do filtro dos cursos acompanham os programas e os cursos dos alunos
  if (filtroDosCursos) filtroDosCursos.desenhar();
  $('#alu').innerHTML = S.stu.length ? S.stu.map(linhaDoAluno).join('')
    : '<tr><td colspan="7" class="h">Nenhum aluno cadastrado. Clique em “+ Novo aluno” acima para cadastrar.</td></tr>';
  aplicarFiltrosDosAlunos();
};

// Atualiza a linha do aluno no lugar. "Priorizar com" e "Não escalar com" são refeitos só quando mudam (um tira o instrutor
// da lista do outro), e o foco volta para o seletor que mudou. Ela é a do aluno alterado agora: continua à vista mesmo
// fora dos filtros (o curso mudado para um que não está marcado), até eles mudarem
export function atualizarLinhaDoAluno(s, { naoEscalar = false, voaComMudou = false } = {}) {
  const linha = document.querySelector(`#alu tr.cd[data-id="${s.id}"]`);
  if (!linha) return;
  linha.dataset.nm = chaveDeBusca(s.nm);
  linha.dataset.curso = s.curso || '';
  linha.querySelector('[data-f="nm"]').value = s.nm;
  const kg = linha.querySelector('[data-f="kg"]');
  kg.value = s.kg || '';
  kg.classList.toggle('falta', !s.kg);
  kg.setAttribute('aria-label', `Peso de ${s.nm} em kg`);
  // As opções acompanham o curso do aluno (o encerrado de que ele saiu não fica na lista)
  const curso = linha.querySelector('[data-f="curso"]');
  curso.innerHTML = opcoesDoCurso(s);
  curso.value = s.curso || '';
  curso.setAttribute('aria-label', `Curso de ${s.nm}`);
  const progresso = linha.querySelector('.progresso');
  if (progresso) progresso.remove();
  curso.insertAdjacentHTML('afterend', progressoDoAluno(s));
  linha.querySelector('[data-act="dels"]').setAttribute('aria-label', `Excluir ${s.nm}`);
  linha.querySelector('[data-dados]').setAttribute('aria-label', `Dados pessoais de ${s.nm}`);
  if (naoEscalar || voaComMudou) {
    linha.querySelector('.bl.nao-escalar').innerHTML = naoEscalarCom(s);
    linha.querySelector('.bl.voa-com').innerHTML = voaCom(s);
    linha.querySelector(naoEscalar ? '[data-f="bl"]' : '[data-f="voaCom"]').focus();
  }
  // O curso desconhecido de que o aluno saiu deixa de ser opção do filtro
  if (filtroDosCursos) filtroDosCursos.desenhar();
  manterAlunoAVista(s.id);
  aplicarFiltrosDosAlunos();
}

// A coluna CANAC, quando os dados pessoais chegam ou mudam (js/views/dados-pessoais.js)
export function atualizarCanacDosAlunos() {
  document.querySelectorAll('#alu tr[data-id] .c-canac').forEach(td => { td.textContent = canacDe('aluno', +td.closest('tr').dataset.id); });
}

// Os filtros de Alunos: o nome e o curso. Eles ficam aqui (a busca) e no filtro de vários valores (as marcas), e não só
// nos campos, e valem de novo a cada redesenho das linhas: o cadastro novo, outra data, um nome mudado, um resultado
// registrado. O nome é comparado pela chave da busca (sem acentos). Quem acabou de ser cadastrado (+ Novo) ou alterado na
// linha dele (o nome, o curso) continua à vista mesmo fora dos filtros, até eles mudarem
let filtroDoNome = '';
const mantidos = new Set();
const BUSCA = '[data-flt="alu"]';
// O filtro dos cursos (js/views/filtro-dos-cursos.js)
let filtroDosCursos = null;
// Na digitação, a contagem espera a pessoa parar (o leitor de tela não a dita a cada letra)
const ESPERA_DA_DIGITACAO = 500;

// Ao abrir: o filtro dos cursos, e a busca como o filtro, vazia (o navegador que devolve o texto de antes de recarregar a
// página não deixa o campo diferente do filtro). O aluno aparece se está em algum dos cursos marcados
export function prepararFiltrosDosAlunos() {
  filtroDosCursos = criarFiltroDosCursos('flt-alu-cur', () => filtrarAlunos());
  $(BUSCA).value = filtroDoNome;
}

// Um filtro mudou (a busca, { nome }, ou as marcas dos cursos): vale para todas as linhas, também as do cadastrado e do
// alterado agora
export function filtrarAlunos(mudanca = {}) {
  if ('nome' in mudanca) filtroDoNome = mudanca.nome;
  mantidos.clear();
  aplicarFiltrosDosAlunos({ esperar: 'nome' in mudanca ? ESPERA_DA_DIGITACAO : 0 });
}

// O cadastrado (+ Novo) ou alterado agora continua à vista mesmo fora dos filtros, até eles mudarem
export function manterAlunoAVista(id) {
  mantidos.add(id);
}

// "Limpar filtros": a busca e as marcas voltam a vazio, todas as linhas aparecem, e o foco vai para a busca
export function limparFiltrosDosAlunos() {
  filtroDoNome = '';
  if (filtroDosCursos) filtroDosCursos.limpar();
  mantidos.clear();
  $(BUSCA).value = '';
  aplicarFiltrosDosAlunos();
  $(BUSCA).focus();
}

const filtrando = () => Boolean(filtroDoNome) || Boolean(filtroDosCursos && filtroDosCursos.valores().length > 0);

// O nome e o curso (o aluno está em algum dos cursos marcados; data-curso)
function aplicarFiltrosDosAlunos({ esperar = 0 } = {}) {
  const q = chaveDeBusca(filtroDoNome);
  const noCurso = filtroDosCursos ? filtroDosCursos.quemPassa() : () => true;
  filtrarLinhas(['#alu'], l => mantidos.has(+l.dataset.id) || ((!q || l.dataset.nm.includes(q)) && noCurso(cursoDaLinha(l))),
    { aba: 'alu', nomes: ['aluno', 'alunos'], filtrando: filtrando(), esperar });
}

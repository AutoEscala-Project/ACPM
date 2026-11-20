// Abas Instrutores e Alunos. Os instrutores têm duas visões: a disponibilidade do dia (uma grade com as janelas e os
// voos de cada um na escala) e o cadastro (nome, CANAC, peso e habilitações, editadas num painel lateral). Os dados
// pessoais (CPF, CANAC, nascimento, celular e e-mail) abrem noutro painel, só para quem pode vê-los (.so-dados).
import { WIN, PRE, T, AIRCRAFT_EQ_TYPES, MINUTOS_DO_DIA } from '../config.js';
import { HABILITACOES, nomeDaHabilitacao } from '../habilitacoes.js';
import { FROTA_INICIAL, habilitacaoDoAviao } from '../frota.js';
import { esc, hm, opts, LIMITE_DO_NOME, numeroBr, chaveDeBusca } from '../format.js';
import { S, DATA, insBy, isGestor, voosQueVoam, dadoIndisponivel } from '../state.js';
import { $, abrirGaveta } from '../dom.js';
import { botaoDeDica } from '../dicas.js';
import { canacDe } from './dados-pessoais.js';
import { normalizarLimites } from '../limites.js';
import { ApiClient } from '../storage.js';
import { gerenciaContas } from '../perfis.js';
import { progressoDoAluno } from './etapas.js';
import { unidadeDoVoo, umPorUnidade } from '../voo.js';
import { CURSOS } from '../cursos.js';
import { mostrarVista } from './vistas.js';

const ROTULO = new Map(HABILITACOES.map(h => [h.id, h.curto]));
// No cadastro, todas na ordem do painel; na grade do dia, só as que mais distinguem o instrutor
const ORDEM_DA_GRADE = ['mlte', 'c172', 'ifr', 'noturno', 'parafuso', 'solo', 'navegacao', 'local', 'tgl', 'sim_multi', 'sim_mono',
  'ground_pa34', 'grounds'];
const rotuloDa = h => ROTULO.get(h) || nomeDaHabilitacao(h);
const resumoDasHabilitacoes = x => x.hab.map(rotuloDa).join(' · ');
// Na grade do dia, as marcas de checador (o curso, o motor e as regras) contam como uma, na frente
function resumoNaGrade(x) {
  const checador = x.hab.some(h => h.startsWith('checa_')) ? ['Checador'] : [];
  const rotulos = [...checador, ...ORDEM_DA_GRADE.filter(h => x.hab.includes(h)).map(h => ROTULO.get(h))];
  return rotulos.length > 3 ? `${rotulos.slice(0, 3).join(' · ')} · +${rotulos.length - 3}` : rotulos.join(' · ');
}
const GRUPOS_DE_HABILITACAO = [
  ['Ground e simulador', ['grounds', 'ground_pa34', 'sim_mono', 'sim_multi']],
  ['Voo', ['tgl', 'local', 'navegacao', 'solo', 'parafuso', 'ifr', 'noturno']],
  ['Aviões', ['c152', 'c172', 'mlte']],
  // O voo de cheque exige uma marca de cada grupo do checador (o "?" do primeiro explica)
  ['Checador: curso', ['checa_pp', 'checa_pc', 'checa_inva'], 'checador'],
  ['Checador: motor', ['checa_mnte', 'checa_mlte']],
  ['Checador: regras', ['checa_vfr', 'checa_ifr']]
];

// Voos e aulas de cada instrutor na escala da data, sem os cancelados (a turma de Ground conta uma vez) e as janelas em que ele está ocupado
function ocupacaoDosInstrutores() {
  const porInstrutor = new Map();
  voosQueVoam().forEach(o => {
    const atual = porInstrutor.get(o.insId) || { voos: new Set(), janelas: new Set() };
    atual.voos.add(unidadeDoVoo(o));
    WIN.forEach((_, i) => {
      const inicio = T[i], fim = i < WIN.length - 1 ? T[i + 1] : MINUTOS_DO_DIA;
      if (o.a < fim && o.b > inicio) atual.janelas.add(i);
    });
    porInstrutor.set(o.insId, atual);
  });
  return porInstrutor;
}

// data-nm: a chave da busca pelo nome (sem acentos), que os filtros comparam
const atributos = x => `data-k="i" data-id="${x.id}" data-hab="${x.hab.join(' ')}" data-nm="${esc(chaveDeBusca(x.nm))}"`;

// Limites da lei: as horas de voo do instrutor com a escala desta data (as de antes, as de fora do app e as de hoje, só
// voo em avião) no mês, no semestre e no ano
function horasComAEscala(x) {
  const passadas = (S.horasDosInstrutores || {})[x.id] || { mes: 0, semestre: 0, ano: 0, fimAnterior: null };
  const hoje = umPorUnidade(voosQueVoam().filter(o => o.insId === x.id && AIRCRAFT_EQ_TYPES.includes(o.eqType)))
    .reduce((total, o) => total + o.h, 0);
  const somar = h => Math.round((h + hoje) * 10) / 10;
  return { mes: somar(passadas.mes), semestre: somar(passadas.semestre), ano: somar(passadas.ano), fimAnterior: passadas.fimAnterior };
}
const perto = (h, limite) => limite !== null && h >= 0.9 * limite;
// O Administrador muda os limites (neste navegador, o Operador)
// Depois de um conflito a tela fica só para consulta, também para o Administrador
export const podeEditarLimites = () => !ApiClient.readOnly && (ApiClient.perfil ? gerenciaContas(ApiClient.perfil) : !isGestor());
const SEM_INSTRUTORES = 'Nenhum instrutor cadastrado. Clique em “+ Novo instrutor” acima para cadastrar.';

function linhaDoDia(x, ocupacao) {
  const { voos, janelas } = ocupacao.get(x.id) || { voos: new Set(), janelas: new Set() };
  const celulas = WIN.map((w, i) => {
    const cls = `cel${x.aw[i] ? ' on' : ''}${janelas.has(i) ? ' voo' : ''}`;
    return `<td class="jan"><label class="${cls}" title="${w}"><input type="checkbox" data-f="aw" data-w="${i}"${x.aw[i] ? ' checked' : ''} aria-label="${esc(x.nm)} às ${w}"></label></td>`;
  }).join('');
  return `<tr ${atributos(x)}${x.on ? '' : ' class="off"'}>
    <td class="nome"><b>${esc(x.nm)}</b></td>
    <td><label class="alvo"><input type="checkbox" class="sw" data-f="on"${x.on ? ' checked' : ''} aria-label="${esc(x.nm)} vem no dia"></label></td>
    ${celulas}
    <td class="voos">${voos.size || ''}</td>
    ${colunaDoMes(x)}
    <td><select data-f="pre" class="edit-only" aria-label="Aplicar um turno a ${esc(x.nm)}"><option value="">Aplicar turno…</option>${Object.keys(PRE).map(k => `<option>${k}</option>`).join('')}</select></td>
    <td class="habs-resumo" title="${esc(resumoDasHabilitacoes(x))}">${esc(resumoNaGrade(x))}</td>
  </tr>`;
}

function colunaDoMes(x) {
  const limites = normalizarLimites(S.limites);
  const h = horasComAEscala(x);
  const titulo = [`${numeroBr(h.mes)} h de voo no mês${limites.vooMesH === null ? '' : ` (limite ${limites.vooMesH} h)`}`,
    `${numeroBr(h.ano)} h no ano${limites.vooAnoH === null ? '' : ` (limite ${limites.vooAnoH} h)`}`,
    h.fimAnterior === null || h.fimAnterior === undefined ? '' : `ontem até as ${hm(h.fimAnterior)}`].filter(Boolean).join('; ');
  const atencao = perto(h.mes, limites.vooMesH) || perto(h.ano, limites.vooAnoH) || perto(h.semestre, limites.vooSemestreH);
  return `<td class="mes${atencao ? ' perto' : ''}" title="${esc(titulo)}">${numeroBr(h.mes)} h</td>`;
}

function linhaDoCadastro(x) {
  return `<tr class="cd" ${atributos(x)}>
    <td><input class="nm" data-f="nm" value="${esc(x.nm)}" maxlength="${LIMITE_DO_NOME}" aria-label="Nome do instrutor"></td>
    <td class="c-canac so-dados">${esc(canacDe('instrutor', x.id))}</td>
    <td><input type="number" min="1" max="300" data-f="kg" value="${x.kg || ''}" placeholder="sem peso" aria-label="Peso de ${esc(x.nm)} em kg"${x.kg ? '' : ' class="falta"'}></td>
    <td><span class="habs-resumo">${esc(resumoDasHabilitacoes(x)) || 'Nenhuma'}</span></td>
    <td class="acoes"><button type="button" class="btn quiet so-dados" data-dados="instrutor:${x.id}" aria-label="Dados pessoais de ${esc(x.nm)}">Dados pessoais</button><button class="btn quiet edit-only" data-act="editar-habs" data-id="${x.id}">Editar habilitações</button><button class="x edit-only" data-act="deli" aria-label="Excluir ${esc(x.nm)}">✕</button></td>
  </tr>`;
}

// A grade do dia depende da escala: é refeita junto com ela. A coluna "Vem" é a da data aberta no topo (o app abre em
// amanhã: não é "hoje")
export function rInsDia() {
  // Os termos da grade com o "?"
  $('#inst-dia-cab').innerHTML = `<tr><th>Instrutor</th><th>Vem${botaoDeDica('vem-nesta-data', 'Vem')}</th>${WIN.map(w => `<th class="jan">${w}</th>`).join('')}<th>Voos${botaoDeDica('voos-do-instrutor', 'Voos')}</th><th>Mês${botaoDeDica('horas-do-mes', 'Mês')}</th><th>Turno${botaoDeDica('turno', 'Turno')}</th><th>Habilitações</th></tr>`;
  // Quem usa o teclado continua no mesmo campo (ou no "Limpar filtros") depois que a grade é refeita e filtrada
  const foco = $('#inst-dia').contains(document.activeElement) ? seletorDoCampo(document.activeElement) : null;
  if (S.ins.length) {
    const ocupacao = ocupacaoDosInstrutores();
    $('#inst-dia').innerHTML = S.ins.map(x => linhaDoDia(x, ocupacao)).join('');
  } else {
    $('#inst-dia').innerHTML = `<tr><td colspan="${WIN.length + 6}" class="h">${SEM_INSTRUTORES}</td></tr>`;
  }
  applyInstructorFilters();
  const alvo = foco && $('#inst-dia').querySelector(foco);
  if (alvo) alvo.focus();
}

function seletorDoCampo(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const linha = el.closest('tr[data-id]');
  const campo = ['data-f', 'data-w'].filter(a => el.hasAttribute(a)).map(a => `[${a}="${el.getAttribute(a)}"]`).join('');
  return linha && campo ? `tr[data-id="${linha.dataset.id}"] ${campo}` : null;
}

// Atualiza a linha do cadastro no lugar, sem trocar os campos (o foco de quem usa o teclado continua onde estava). Ela é
// a do instrutor alterado agora: continua à vista mesmo fora dos filtros, até eles mudarem
export function atualizarLinhaDoCadastro(x) {
  const linha = document.querySelector(`#inst tr.cd[data-id="${x.id}"]`);
  if (!linha) return;
  linha.dataset.hab = x.hab.join(' ');
  linha.dataset.nm = chaveDeBusca(x.nm);
  linha.querySelector('[data-f="nm"]').value = x.nm;
  const kg = linha.querySelector('[data-f="kg"]');
  kg.value = x.kg || '';
  kg.classList.toggle('falta', !x.kg);
  kg.setAttribute('aria-label', `Peso de ${x.nm} em kg`);
  linha.querySelector('[data-act="deli"]').setAttribute('aria-label', `Excluir ${x.nm}`);
  linha.querySelector('[data-dados]').setAttribute('aria-label', `Dados pessoais de ${x.nm}`);
  linha.querySelector('.habs-resumo').textContent = resumoDasHabilitacoes(x) || 'Nenhuma';
  const titulo = $('#painel-instrutor-titulo');
  if (titulo && !$('#painel-instrutor').hidden && +$('#painel-instrutor').dataset.id === x.id) titulo.querySelector('small').textContent = x.nm;
  manterAVista('ins', x.id);
  applyInstructorFilters();
}

export function rIns() {
  mostrarVista('ins');
  rLimites();
  $('#inst').innerHTML = S.ins.length ? S.ins.map(linhaDoCadastro).join('') : `<tr><td colspan="5" class="h">${SEM_INSTRUTORES}</td></tr>`;
  rInsDia();
  rPainelDoInstrutor();
}

// Os recursos com habilitação própria (Recursos › Frota › Atributos): uma habilitação para cada, como o PR-VOM
function gruposDosRecursos() {
  const ids = (Array.isArray(S.frota) ? S.frota : FROTA_INICIAL).filter(f => f.habilitacaoPropria).map(f => habilitacaoDoAviao(f.reg));
  return ids.length ? [['Habilitação própria do recurso', ids, 'habilitacao-propria']] : [];
}

// Painel lateral com as habilitações de um instrutor, em grupos
export function rPainelDoInstrutor() {
  const painel = $('#painel-instrutor');
  if (!painel || painel.hidden) return;
  const x = insBy(+painel.dataset.id);
  if (!x) { painel.hidden = true; return; }
  painel.innerHTML = `<div class="gaveta-cab">
      <h2 id="painel-instrutor-titulo">Habilitações <small>${esc(x.nm)}</small></h2>
      <button class="x" type="button" id="btn-fechar-painel-instrutor" aria-label="Fechar o painel">✕</button>
    </div>
    <p class="h">Marque o que o instrutor pode fazer. Nos aviões (C152, C172 e PA-34), a missão exige também a habilitação do avião; o voo de cheque exige uma marca de cada grupo do checador.</p>
    <div class="habs-painel" data-k="i" data-id="${x.id}">
      ${[...GRUPOS_DE_HABILITACAO, ...gruposDosRecursos()].map(([titulo, ids, dica]) => `<fieldset><legend>${titulo}${dica ? botaoDeDica(dica, dica === 'checador' ? 'checador' : 'habilitação própria') : ''}</legend>${ids.map(h =>
        `<label class="hab"><input type="checkbox" class="sw" data-f="hab" data-h="${h}"${x.hab.includes(h) ? ' checked' : ''}>${esc(nomeDaHabilitacao(h))}</label>`).join('')}</fieldset>`).join('')}
      ${horasDoInstrutor(x)}
    </div>`;
}

// As horas de voo do instrutor (limites da lei) e as de fora do app: neste mês e, no ano, antes deste mês
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function horasDoInstrutor(x) {
  const limites = normalizarLimites(S.limites);
  const h = horasComAEscala(x);
  const de = (valor, limite) => `${numeroBr(valor)} h${limite === null ? '' : ` de ${limite} h`}`;
  const externas = x.horasExternas || {};
  const mes = MESES[+DATA.slice(5, 7) - 1];
  return `<fieldset class="horas-ins"><legend>Horas de voo (limites da lei)${botaoDeDica('limites-da-lei', 'limites da lei')}</legend>
      <p>No mês: ${de(h.mes, limites.vooMesH)} · No semestre: ${de(h.semestre, limites.vooSemestreH)} · No ano: ${de(h.ano, limites.vooAnoH)} <small>(com a escala desta data)</small></p>
      <p class="h">As horas de voo de fora do app (outra escola, por exemplo) entram nos limites do mês e do ano.</p>
      <label>Fora do app, neste mês (${mes}) <input type="number" min="0" max="999" step="0.1" data-f="ext-mes" value="${externas[DATA.slice(0, 7)] ?? ''}"></label>
      <label>Fora do app, neste ano, antes de ${mes} <input type="number" min="0" max="2000" step="0.1" data-f="ext-ano" value="${externas[`${DATA.slice(0, 4)}-00`] ?? ''}"></label>
    </fieldset>`;
}

// Os limites da lei, no cadastro dos instrutores: só o Administrador muda (neste navegador, o Operador); vazio é sem limite
const CAMPOS_DOS_LIMITES = [
  ['vooPorJornadaMin', 'Voo por jornada (h)', 60], ['jornadaMin', 'Jornada (h)', 60], ['vooMesH', 'Voo no mês (h)', 1],
  ['vooSemestreH', 'Voo no semestre (h)', 1], ['vooAnoH', 'Voo no ano (h)', 1], ['repousoMin', 'Repouso entre jornadas (h)', 60]
];
export function rLimites() {
  const quadro = $('#limites-lei');
  if (!quadro) return;
  const limites = normalizarLimites(S.limites);
  const desligado = podeEditarLimites() ? '' : ' disabled';
  quadro.innerHTML = `<h3>Limites da Lei do Aeronauta${botaoDeDica('limites-da-lei', 'limites da lei')}</h3>
    <p class="h">Lei 13.475/2017 e RBAC 117 (Apêndice A): a escala não põe um instrutor além destes limites e avisa a partir de 90% do mês, do semestre e do ano. As horas de voo contam só avião (simulador e Ground contam na jornada). A jornada vai de 30 minutos antes do primeiro compromisso a 30 minutos depois do último. Vazio é sem limite; só o Administrador muda.</p>
    <div class="limites-grade">
      ${CAMPOS_DOS_LIMITES.map(([chave, rotulo, divisor]) => `<label>${rotulo} <input type="number" min="0.5" step="0.5" data-limite="${chave}" data-divisor="${divisor}" value="${limites[chave] === null ? '' : String(limites[chave] / divisor)}"${desligado}></label>`).join('')}
    </div>
    <button type="button" class="btn quiet" data-limites-padrao${desligado}>Voltar aos valores da lei</button>`;
}

// O painel abre por cima das outras gavetas abertas (também quando já estava aberto, com outro instrutor)
export function abrirPainelDoInstrutor(id) {
  const painel = $('#painel-instrutor');
  painel.dataset.id = id;
  abrirGaveta(painel);
  rPainelDoInstrutor();
  $('#btn-fechar-painel-instrutor').focus();
}

export function fecharPainelDoInstrutor(devolverFoco = false) {
  const painel = $('#painel-instrutor');
  painel.hidden = true;
  const botao = document.querySelector(`#inst tr.cd[data-id="${painel.dataset.id}"] [data-act="editar-habs"]`);
  if (devolverFoco && botao) botao.focus();
}

// Alunos: uma tabela (nome, curso, peso e os instrutores com quem o aluno não deve ser escalado)
function naoEscalarCom(s) {
  return s.bl.map(b => insBy(b) ? `<span class="tg">${esc(insBy(b).nm)}<button class="edit-only" data-act="unbl" data-b="${b}" aria-label="Voltar a escalar com ${esc(insBy(b).nm)}">✕</button></span>` : '').join('') +
    `<select data-f="bl" class="edit-only" aria-label="Não escalar com"><option value="">Não escalar com…</option>${S.ins.filter(x => !s.bl.includes(x.id)).map(x => `<option value="${x.id}">${esc(x.nm)}</option>`).join('')}</select>`;
}

// “Priorizar com”: os instrutores do aluno (o par permanente). A escala põe o aluno com um deles sempre que algum pode voar o
// pedido; sem nenhum, com outro instrutor, e avisa. Quem está em “Não escalar com” não entra na lista
function voaCom(s) {
  const pares = s.voaCom || [];
  return pares.map(b => insBy(b) ? `<span class="tg par">${esc(insBy(b).nm)}<button class="edit-only" data-act="unvc" data-b="${b}" aria-label="Tirar ${esc(insBy(b).nm)} de Priorizar com">✕</button></span>` : '').join('') +
    `<select data-f="voaCom" class="edit-only" aria-label="Priorizar com"><option value="">Priorizar com…</option>${S.ins.filter(x => !pares.includes(x.id) && !s.bl.includes(x.id)).map(x => `<option value="${x.id}">${esc(x.nm)}</option>`).join('')}</select>`;
}

// O curso do aluno: os cursos ativos (a aba Cursos), e o curso dele quando está encerrado ("(encerrado)") ou não existe
// ("(curso desconhecido)"). Sem os programas lidos, os três cursos com que o app começa (o servidor sempre os tem:
// nenhum curso é apagado) e o curso dele que não é um deles, só pela sigla (nada é dito sobre ele)
function opcoesDoCurso(s) {
  const semProgramas = dadoIndisponivel('cursos') || !(S.programa || []).length;
  const programa = semProgramas ? CURSOS.map(([sigla, nome]) => ({ sigla, nome, ativo: true })) : S.programa;
  const atual = s.curso ? programa.find(c => c.sigla === s.curso) : null;
  const doAluno = !s.curso || (atual && atual.ativo) ? []
    : [[s.curso, atual ? `${s.curso} · ${atual.nome} (encerrado)` : semProgramas ? s.curso : `${s.curso} (curso desconhecido)`]];
  return opts([['', '—'], ...programa.filter(c => c.ativo).map(c => [c.sigla, `${c.sigla} · ${c.nome}`]), ...doAluno], s.curso || '');
}

const linhaDoAluno = s => `<tr class="cd" data-k="s" data-id="${s.id}" data-nm="${esc(chaveDeBusca(s.nm))}">
  <td><input class="nm" data-f="nm" value="${esc(s.nm)}" maxlength="${LIMITE_DO_NOME}" aria-label="Nome do aluno"></td>
  <td class="c-canac so-dados">${esc(canacDe('aluno', s.id))}</td>
  <td class="c-curso"><select data-f="curso" aria-label="Curso de ${esc(s.nm)}"${isGestor() ? ' disabled' : ''}>${opcoesDoCurso(s)}</select>${progressoDoAluno(s)}</td>
  <td><input type="number" min="1" max="300" data-f="kg" value="${s.kg || ''}" placeholder="sem peso" aria-label="Peso de ${esc(s.nm)} em kg"${s.kg ? '' : ' class="falta"'}></td>
  <td class="c-voa-com"><div class="bl voa-com">${voaCom(s)}</div></td>
  <td><div class="bl nao-escalar">${naoEscalarCom(s)}</div></td>
  <td class="acoes"><button type="button" class="btn quiet so-dados" data-dados="aluno:${s.id}" aria-label="Dados pessoais de ${esc(s.nm)}">Dados pessoais</button><button class="x edit-only" data-act="dels" aria-label="Excluir ${esc(s.nm)}">✕</button></td>
</tr>`;

export const rAlu = () => {
  $('#alu').innerHTML = S.stu.length ? S.stu.map(linhaDoAluno).join('')
    : '<tr><td colspan="7" class="h">Nenhum aluno cadastrado. Clique em “+ Novo aluno” acima para cadastrar.</td></tr>';
  aplicarFiltrosDosAlunos();
};

// Atualiza a linha do aluno no lugar. "Priorizar com" e "Não escalar com" são refeitos só quando mudam (um tira o instrutor
// da lista do outro), e o foco volta para o seletor que mudou. Ela é a do aluno alterado agora: continua à vista mesmo
// fora da busca, até ela mudar
export function atualizarLinhaDoAluno(s, { naoEscalar = false, voaComMudou = false } = {}) {
  const linha = document.querySelector(`#alu tr.cd[data-id="${s.id}"]`);
  if (!linha) return;
  linha.dataset.nm = chaveDeBusca(s.nm);
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
  manterAVista('alu', s.id);
  aplicarFiltrosDosAlunos();
}

// Os filtros de Instrutores (o nome e a habilitação, nas duas vistas) e de Alunos (o nome). Eles ficam aqui, e não só
// nos campos, e valem de novo a cada redesenho das linhas: o cadastro novo, outra data, um nome mudado, um resultado
// registrado. O nome é comparado pela chave da busca (sem acentos). Quem acabou de ser cadastrado (+ Novo) ou alterado
// na linha dele (o nome, a habilitação tirada no painel) continua à vista mesmo fora dos filtros, até eles mudarem: é na
// linha do novo que se digita o nome, e a linha alterada não some com o foco de quem usa o teclado (o Tab depois do nome,
// o botão a que o painel devolve o foco)
const SEM_FILTROS = { ins: { nome: '', hab: '' }, alu: { nome: '' } };
const filtros = { ins: { ...SEM_FILTROS.ins }, alu: { ...SEM_FILTROS.alu } };
const mantidos = { ins: new Set(), alu: new Set() };
const CAMPOS_DOS_FILTROS = { ins: { nome: '[data-flt="inst"]', hab: '#flt-ins-hab' }, alu: { nome: '[data-flt="alu"]' } };
const NOMES_DA_ABA = { ins: ['instrutor', 'instrutores'], alu: ['aluno', 'alunos'] };
// Na digitação, a contagem espera a pessoa parar (o leitor de tela não a dita a cada letra)
const ESPERA_DA_DIGITACAO = 500;

// Ao abrir: as opções do filtro de habilitação (uma por habilitação), e os campos como os filtros, vazios (o navegador
// que devolve o texto de antes de recarregar a página não deixa o campo diferente do filtro)
export function prepararFiltros() {
  $('#flt-ins-hab').insertAdjacentHTML('beforeend', HABILITACOES.map(h => `<option value="${h.id}">${esc(h.nome)}</option>`).join(''));
  for (const aba of Object.keys(CAMPOS_DOS_FILTROS)) {
    for (const [chave, seletor] of Object.entries(CAMPOS_DOS_FILTROS[aba])) $(seletor).value = filtros[aba][chave];
  }
}

// Um filtro da aba mudou ({ nome } ou { hab }): vale para todas as linhas, também as do cadastrado e do alterado agora
export function filtrar(aba, mudanca) {
  Object.assign(filtros[aba], mudanca);
  mantidos[aba].clear();
  APLICAR[aba]({ esperar: 'nome' in mudanca ? ESPERA_DA_DIGITACAO : 0 });
}

// O cadastrado (+ Novo) ou alterado agora continua à vista mesmo fora dos filtros, até eles mudarem
export function manterAVista(aba, id) {
  mantidos[aba].add(id);
}

// "Limpar filtros": os filtros e os campos voltam a vazio, todas as linhas aparecem, e o foco vai para a busca
export function limparFiltros(aba) {
  Object.assign(filtros[aba], SEM_FILTROS[aba]);
  mantidos[aba].clear();
  for (const [chave, seletor] of Object.entries(CAMPOS_DOS_FILTROS[aba])) $(seletor).value = filtros[aba][chave];
  APLICAR[aba]();
  $(CAMPOS_DOS_FILTROS[aba].nome).focus();
}

const filtrando = aba => Object.keys(SEM_FILTROS[aba]).some(chave => filtros[aba][chave]);

// Os filtros dos instrutores valem para as duas vistas: a habilitação é uma das do instrutor
function applyInstructorFilters({ esperar = 0 } = {}) {
  const { nome, hab } = filtros.ins;
  const q = chaveDeBusca(nome);
  filtrarLinhas('ins', ['#inst-dia', '#inst'], esperar,
    l => mantidos.ins.has(+l.dataset.id) || ((!q || l.dataset.nm.includes(q)) && (!hab || l.dataset.hab.split(' ').includes(hab))));
}

function aplicarFiltrosDosAlunos({ esperar = 0 } = {}) {
  const q = chaveDeBusca(filtros.alu.nome);
  filtrarLinhas('alu', ['#alu'], esperar, l => mantidos.alu.has(+l.dataset.id) || !q || l.dataset.nm.includes(q));
}
const APLICAR = { ins: applyInstructorFilters, alu: aplicarFiltrosDosAlunos };

// Esconde as linhas (data-k) que não passam nos filtros; a de "Nenhum … cadastrado" fica. Com todas escondidas, uma linha
// diz que nenhuma passa, com "Limpar filtros". A contagem é a da primeira tabela (as duas vistas dos instrutores mostram
// as mesmas linhas)
function filtrarLinhas(aba, corpos, esperar, passa) {
  let contagem = null;
  for (const seletor of corpos) {
    const corpo = $(seletor);
    if (!corpo) continue;
    const linhas = [...corpo.querySelectorAll(':scope > tr[data-k]')];
    for (const linha of linhas) linha.hidden = !passa(linha);
    const aVista = linhas.filter(l => !l.hidden).length;
    nenhumComOsFiltros(aba, corpo, linhas.length > 0 && aVista === 0);
    if (!contagem) contagem = { aVista, total: linhas.length };
  }
  if (contagem) contar(aba, contagem, esperar);
}

// A linha "Nenhum … com esses filtros", no fim da tabela, só enquanto os filtros escondem todas as linhas. Ela continua a
// mesma enquanto vale (o foco no "Limpar filtros" fica nele). O texto e o botão ficam na parte à vista da tabela que
// rola para o lado (a grade do dia, no celular: css/app.css)
function nenhumComOsFiltros(aba, corpo, mostrar) {
  const atual = corpo.querySelector(':scope > tr.sem-resultado');
  if (!mostrar) { if (atual) atual.remove(); return; }
  if (atual) return;
  const cabecalho = corpo.parentElement.tHead;
  const colunas = cabecalho && cabecalho.rows.length ? cabecalho.rows[0].cells.length : 1;
  corpo.insertAdjacentHTML('beforeend', `<tr class="sem-resultado"><td colspan="${colunas}" class="h"><div class="sem-resultado-texto">Nenhum ${NOMES_DA_ABA[aba][0]} com esses filtros. <button type="button" class="btn quiet" id="limpar-filtros-${corpo.id}" data-limpar-filtros="${aba}">Limpar filtros</button></div></td></tr>`);
}

// Quantos aparecem: "12 de 40 instrutores" com algum filtro, "40 instrutores" sem nenhum. A região é de status (o leitor de
// tela dita quando o texto muda)
const esperasDaContagem = {};
function contar(aba, { aVista, total }, esperar) {
  const [um, varios] = NOMES_DA_ABA[aba];
  const nome = total === 1 ? um : varios;
  const texto = !total ? '' : filtrando(aba) ? `${aVista} de ${total} ${nome}` : `${total} ${nome}`;
  clearTimeout(esperasDaContagem[aba]);
  const escrever = () => {
    const lugar = $(`#${aba}-contagem`);
    if (lugar && lugar.textContent !== texto) lugar.textContent = texto;
  };
  if (esperar) esperasDaContagem[aba] = setTimeout(escrever, esperar);
  else escrever();
}

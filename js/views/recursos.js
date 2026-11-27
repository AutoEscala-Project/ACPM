// Recursos como lista e detalhe (B; o componente: js/views/mestre-detalhe.js): os modelos que a tela dá a ele, lidos do
// estado. A lista é agrupada por categoria (C152, C172, Simulador, PA-34 e a Sala Ground, a única do grupo dela), cada
// cabeçalho com quantos estão disponíveis nesta data e os horários de decolagem da categoria; o cabeçalho se escolhe e
// abre o detalhe da categoria (os horários de decolagem, js/views/horarios.js, e o que vem do tipo). Com o hangar ligado,
// "Ordem no hangar" é o item fixo do alto, com a ordem inteira no detalhe (a busca não vale nela). A linha: a matrícula, o
// tipo e os atributos, as horas até a revisão, a data com o que o recurso voa nela; o "Disponível" desta data e o "Ativo"
// do cadastro (js/eventos/inativos.js). O detalhe do recurso: "Nesta data" (Disponível, as horas até a revisão, Revisão
// feita, o que voa, o lugar no hangar), depois o "Cadastro · todas as datas" (os atributos), "Agendar voo no <reg>" e
// "Retirar da frota…". Os campos têm os data-a de sempre: js/eventos/recursos.js grava
import { AIRCRAFT_EQ_TYPES, REVISAO_H, GROUND_REG, GROUND_EQ_TYPE } from '../config.js';
import { CATEGORIAS, categoriaDoTipo, nomeDoRecurso } from '../categorias.js';
import { ligada } from '../funcionalidades.js';
import { normalizarHangar } from '../hangar.js';
import { FROTA_INICIAL, ATRIBUTOS_DO_RECURSO, atributoVale, exigenciasDoAviao, habilitacaoDoAviao, salaDisponivel } from '../frota.js';
import { nomeDaHabilitacao } from '../habilitacoes.js';
import { inativo } from '../inativos.js';
import { S, RES, DATA, voosQueVoam, inativoNaDataAberta } from '../state.js';
import { umPorUnidade } from '../voo.js';
import { hm, fmtH, esc, rotuloDaData, hojeISO } from '../format.js';
import { dataCurta } from './dialogo-refazer.js';
import { rascunhoDosHorarios } from './horarios.js';

// A Sala Ground: fora da frota, mas um recurso da tela (a linha dela, no grupo dela, com o "Disponível" desta data)
const SALA_GROUND = Object.freeze({ reg: GROUND_REG, tipo: GROUND_EQ_TYPE });
// O id do detalhe de uma categoria (o cabeçalho que se escolhe) e o do item fixo do hangar (nenhuma matrícula começa assim:
// elas são maiúsculas)
const ID_DA_CATEGORIA = 'cat:';
const ID_DO_HANGAR = 'hangar';

const frotaDoCadastro = () => S.frota || [];
const ehAviao = f => AIRCRAFT_EQ_TYPES.includes(f.tipo);
// Disponível nesta data: a Sala Ground pelo "Disponível" dela (S4: sem a chave, disponível); os outros, pelo av
const disponivel = r => (r === GROUND_REG ? salaDisponivel(S.av) : Boolean(S.av[r]));
// A data aberta, curta: "11/11"
const diaMes = () => rotuloDaData(DATA, hojeISO()).data;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// As horas disponíveis até a revisão (a operadora lança as disponíveis; o dia guarda as horas desde a revisão, 50 menos
// as disponíveis), e a barra delas: âmbar abaixo de 10 h e vermelha abaixo de 5 h
const horasDisponiveis = horas => Math.round(Math.max(0, REVISAO_H - horas) * 10) / 10;
const PERTO_DA_REVISAO_H = 5;
function barra(horas) {
  const resta = horasDisponiveis(horas);
  const cor = resta < 5 ? 'er' : resta < 10 ? 'wa' : '';
  const largura = Math.max(2, Math.min(100, (resta / REVISAO_H) * 100)).toFixed(0);
  return `<span class="barra ${cor}" aria-hidden="true"><i style="width:${largura}%"></i></span>`;
}

// As horas de cada recurso na escala: uma vez por unidade (a turma de Ground tem uma linha por aluno, mas ocupa a sala
// uma vez só, como no mapa)
function horasNaEscala() {
  const voadas = {};
  umPorUnidade(voosQueVoam()).forEach(o => { voadas[o.r] = (voadas[o.r] || 0) + o.h; });
  return voadas;
}
const revisaoDe = r => ((RES && RES.revisao) || {})[r] || null;

// O que o recurso faz nesta data, em minúsculas (a terceira linha) ou como frase (o detalhe)
function situacaoNaData(r, voadas) {
  if (!disponivel(r)) return r === GROUND_REG ? 'indisponível' : 'em manutenção';
  const revisao = revisaoDe(r);
  if (revisao && revisao.paraAs !== null) return `parou para a revisão de 50 horas ${revisao.voadas ? `às ${hm(revisao.paraAs)}` : '(sem saldo nesta data)'}`;
  return voadas ? `disponível · ${fmtH(voadas)} na escala` : 'disponível';
}
const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
function naEscalaDoDia(r, voadas) {
  const revisao = revisaoDe(r);
  if (!disponivel(r)) return r === GROUND_REG ? 'Indisponível nesta data.' : 'Em manutenção nesta data.';
  if (revisao && revisao.paraAs !== null) return `${maiuscula(situacaoNaData(r, voadas))}.`;
  if (!voadas) return 'Nenhum voo nesta data.';
  return `${fmtH(voadas)} na escala${revisao ? ` · termina com ${fmtH(horasDisponiveis(revisao.fim))} disponíveis` : ''}.`;
}

// O ponto da linha: o avião parado para a revisão (erro) e o que está perto dela (aviso), nesta data
function pontoDoRecurso(f) {
  if (!ehAviao(f) || !disponivel(f.reg) || inativoNaDataAberta(f)) return { ponto: '', pontoRotulo: '' };
  const revisao = revisaoDe(f.reg);
  if (revisao && revisao.paraAs !== null) return { ponto: 'erro', pontoRotulo: 'parou para a revisão de 50 horas' };
  if (revisao && REVISAO_H - revisao.fim < PERTO_DA_REVISAO_H) return { ponto: 'aviso', pontoRotulo: 'perto da revisão de 50 horas' };
  return { ponto: '', pontoRotulo: '' };
}

// O tipo e os atributos marcados ("C152 · Só Parafuso", "PA-34 · Exige Avião PR-VOM"): os atributos pelo nome e o que o
// recurso exige do instrutor (a habilitação própria também), cada um com "Exige"
const atributosDoRecurso = f => [
  ...Object.keys(ATRIBUTOS_DO_RECURSO).filter(a => a !== 'habilitacaoPropria' && f[a]).map(a => ATRIBUTOS_DO_RECURSO[a].nome),
  ...exigenciasDoAviao(f).map(h => `Exige ${nomeDaHabilitacao(h)}`)
];
const tipoEAtributos = f => (f.reg === GROUND_REG ? 'Sala das aulas de Ground' : [f.tipo, ...atributosDoRecurso(f)].join(' · '));
const ICONE_DO_TIPO = tipo => (tipo === GROUND_EQ_TYPE ? 'i-manual' : AIRCRAFT_EQ_TYPES.includes(tipo) ? 'i-aviao' : 'i-painel');

// A linha de um recurso (a frota e a Sala Ground)
function itemDoRecurso(f, voadas) {
  const r = f.reg, sala = r === GROUND_REG;
  const horas = S.horas[r];
  const nome = nomeDoRecurso(r);
  return {
    id: r,
    titulo: nome,
    linha2: tipoEAtributos(f),
    meta: ehAviao(f) && typeof horas === 'number' ? fmtH(horasDisponiveis(horas)) : '',
    linha3: `${diaMes()} · ${situacaoNaData(r, voadas[r] || 0)}`,
    icone: ICONE_DO_TIPO(f.tipo),
    ...pontoDoRecurso(f),
    inativo: inativo(f),
    grupo: categoriaDoTipo(f.tipo),
    // O "Disponível" desta data (o mesmo campo do detalhe) e o "Ativo" do cadastro (a Sala Ground não é da frota)
    rapida: { marcado: disponivel(r), texto: 'Disponível', rotulo: `${nome} disponível em ${diaMes()}`, atributos: `data-a="av" data-id="${esc(r)}"` },
    ...(sala ? {} : { chave: { marcado: !inativo(f), texto: 'Ativo', rotulo: `${r} ativo no cadastro`, atributos: 'data-act="ativo" data-de="recurso"' } }),
    atributos: `data-r="${esc(r)}" data-id="${esc(r)}"`,
    busca: sala ? [r, nome] : [r],
    valores: {}
  };
}

// Os recursos da frota de uma categoria, na ordem da frota do cadastro (os simuladores: o Mono, depois o Multi)
const daCategoria = c => c.tipos.flatMap(tipo => (c.id === 'ground' ? [SALA_GROUND] : frotaDoCadastro().filter(f => f.tipo === tipo)));
const listaDaCategoria = cat => (S.horarios && S.horarios[cat]) || [];

// O cabeçalho de uma categoria: quantos dos ativos estão disponíveis nesta data e quantos horários de decolagem ela tem
// (com a edição deles aberta, diz isso)
function grupoDaCategoria(c) {
  const ativos = daCategoria(c).filter(f => !inativoNaDataAberta(f));
  const disponiveis = ativos.filter(f => disponivel(f.reg)).length;
  const rascunho = rascunhoDosHorarios();
  const horarios = plural(listaDaCategoria(c.id).length, 'horário de decolagem', 'horários de decolagem');
  return {
    id: c.id, titulo: c.nome, idDoDetalhe: `${ID_DA_CATEGORIA}${c.id}`,
    resumo: `${disponiveis} de ${ativos.length} disponíveis · ${horarios}${rascunho && rascunho.cat === c.id ? ' · edição aberta' : ''}`
  };
}

// O modelo da lista: o item fixo do hangar (com ele ligado), os grupos por categoria e as linhas
export function modeloDosRecursos() {
  const voadas = horasNaEscala();
  const fixos = ligada('hangar')
    ? [{ id: ID_DO_HANGAR, titulo: 'Ordem no hangar', linha2: 'da frente para o fundo, nesta data', icone: 'i-lista', busca: [], valores: {} }] : [];
  return {
    fixos,
    grupos: CATEGORIAS.map(grupoDaCategoria),
    itens: CATEGORIAS.flatMap(c => daCategoria(c).map(f => itemDoRecurso(f, voadas))),
    estado: 'pronto'
  };
}

// ——— O detalhe ———

const escopoDaData = () => dataCurta();
const leitura = (id, rotulo, texto, extra = {}) => ({ id, rotulo, tipo: 'leitura', texto, ...extra });
const html = (id, conteudo) => ({ id, tipo: 'html', html: conteudo });

// O "Disponível" desta data: a caixa (desligada, "Em manutenção nesta data"; a Sala Ground, "Indisponível nesta data");
// quem só consulta lê
function campoDisponivel(f, edita) {
  const r = f.reg, sim = disponivel(r);
  const fora = r === GROUND_REG ? 'Indisponível nesta data' : 'Em manutenção nesta data';
  if (!edita) return leitura('av', 'Disponível', sim ? 'Disponível nesta data' : fora);
  return html('av', `<label class="alvo det-chave"><input type="checkbox" class="sw" data-a="av" data-id="${esc(r)}"${sim ? ' checked' : ''} aria-label="${esc(nomeDoRecurso(r))} disponível em ${esc(diaMes())}"> Disponível</label>`
    + `<small class="det-chave-texto">${sim ? 'Disponível nesta data' : fora}</small>`);
}

// As horas disponíveis até a revisão de 50 horas (os aviões), com a barra e "Revisão feita"
function camposDasHoras(f, edita) {
  if (!ehAviao(f)) return [];
  const r = f.reg, horas = S.horas[r], tem = typeof horas === 'number';
  const rotulo = 'Horas disponíveis até a revisão de 50 horas';
  const dica = ['horas-disponiveis', 'O que é Horas disponíveis?'];
  const campo = edita
    ? { id: 'horas', rotulo, tipo: 'numero', valor: tem ? horasDisponiveis(horas) : '', dica, atributos: `data-a="horas" data-horas="${esc(r)}" min="0" max="${REVISAO_H}" step="0.1" inputmode="decimal" placeholder="—"` }
    : leitura('horas', rotulo, tem ? fmtH(horasDisponiveis(horas)) : 'não informadas', { dica });
  const revisao = html('revisao', `<div class="det-revisao">${tem ? barra(horas) : ''}<button type="button" class="btn quiet edit-only" data-act="revisao" data-id="${esc(r)}">Revisão feita</button></div>`);
  return [campo, revisao];
}

// O lugar no hangar nesta data (com o hangar ligado): "3º de 22"
function campoDoHangar(f) {
  if (!ligada('hangar') || !ehAviao(f) || inativoNaDataAberta(f)) return [];
  const ordem = normalizarHangar(S.hangar, (S.frota || FROTA_INICIAL).filter(x => !inativoNaDataAberta(x)));
  const i = ordem.indexOf(f.reg);
  return i < 0 ? [] : [leitura('hangar', 'No hangar', `${i + 1}º de ${ordem.length}`)];
}

// Os atributos que valem no tipo ("Só Parafuso" no C152, "Só VFR" no C172 e no PA-34): uma caixa para cada; a habilitação
// própria fica com o que o recurso exige do instrutor
const DICA_DO_ATRIBUTO = { soParafuso: 'so-parafuso', soVfr: 'so-vfr', habilitacaoPropria: 'habilitacao-propria' };
function campoDosAtributos(f, edita) {
  const atributos = Object.keys(ATRIBUTOS_DO_RECURSO).filter(a => a !== 'habilitacaoPropria' && atributoVale(a, f.tipo));
  if (!atributos.length) return [];
  if (!edita) return [leitura('atributos', 'Atributos', atributos.filter(a => f[a]).map(a => ATRIBUTOS_DO_RECURSO[a].nome).join(', ') || 'nenhum')];
  return [html('atributos', `<fieldset class="det-atributos"><legend>Atributos</legend>${atributos.map(a => `<label class="chk"><input type="checkbox" data-a="atributo" data-r="${esc(f.reg)}" data-atributo="${a}"${f[a] ? ' checked' : ''}> ${ATRIBUTOS_DO_RECURSO[a].nome}</label> <button type="button" class="dica-btn" data-dica="${DICA_DO_ATRIBUTO[a]}" aria-label="O que é ${ATRIBUTOS_DO_RECURSO[a].nome}?" aria-expanded="false"></button>`).join(' ')}</fieldset>`)];
}

// A habilitação própria do recurso (o recurso exige do instrutor uma habilitação só dele)
function campoDaPropria(f, edita) {
  if (!atributoVale('habilitacaoPropria', f.tipo)) return [];
  const marcada = exigenciasDoAviao(f).includes(habilitacaoDoAviao(f.reg));
  const nome = `Habilitação própria (${nomeDaHabilitacao(habilitacaoDoAviao(f.reg))})`;
  if (!edita) return [leitura('propria', 'Habilitação própria', marcada ? 'sim' : 'não', { dica: ['habilitacao-propria', 'O que é Habilitação própria?'] })];
  return [html('propria', `<label class="chk"><input type="checkbox" data-a="atributo" data-r="${esc(f.reg)}" data-atributo="habilitacaoPropria"${marcada ? ' checked' : ''}> ${esc(nome)}</label> <button type="button" class="dica-btn" data-dica="habilitacao-propria" aria-label="O que é Habilitação própria?" aria-expanded="false"></button>`)];
}

// O detalhe de um recurso da frota ou da Sala Ground
function detalheDoRecursoDaFrota(f, edita) {
  const r = f.reg, sala = r === GROUND_REG, voadas = horasNaEscala()[r] || 0;
  const desligado = inativo(f);
  const nestaData = desligado
    ? [leitura('escala', 'Na escala desta data', naEscalaDoDia(r, voadas))]
    : [campoDisponivel(f, edita), ...camposDasHoras(f, edita), leitura('escala', 'Na escala desta data', naEscalaDoDia(r, voadas)), ...campoDoHangar(f)];
  const cadastro = sala
    ? [leitura('tipo', 'Tipo', 'Sala Ground: a sala das aulas de Ground. Ela não é da frota: não sai dela nem fica inativa; os horários dela ficam na categoria Sala Ground.')]
    : [leitura('reg', 'Matrícula', r), leitura('tipo', 'Tipo', f.tipo), ...campoDosAtributos(f, edita), ...campoDaPropria(f, edita)];
  const nome = nomeDoRecurso(r);
  return {
    atributos: `data-r="${esc(r)}" data-id="${esc(r)}"`,
    id: r,
    titulo: nome,
    subtitulo: tipoEAtributos(f),
    icone: ICONE_DO_TIPO(f.tipo),
    aviso: desligado ? 'Inativo no cadastro: não entra na escala de hoje em diante (os voos que ele já tem continuam). As datas passadas ficam como estão. Para ativar de novo, ligue “Ativo” na linha dele.' : '',
    acoes: desligado ? [] : [{ id: 'agendar', rotulo: `Agendar voo ${sala ? 'na' : 'no'} ${nome}`, icone: 'i-calendario', atributos: `data-act="agendar" data-agendar="r:${esc(r)}" aria-haspopup="dialog"` }],
    secoes: [
      { id: 'data', titulo: 'Nesta data', icone: 'i-calendario', escopo: escopoDaData(), campos: nestaData },
      { id: 'cadastro', titulo: 'Cadastro', icone: ICONE_DO_TIPO(f.tipo), escopo: 'todas as datas', campos: cadastro }
    ],
    rodape: sala ? [] : [{ id: 'retirar', texto: 'Retirar da frota…', rotulo: `Retirar ${r} da frota`, atributos: `data-act="retirar-recurso" data-id="${esc(r)}"`, soEdicao: true }]
  };
}

// A habilitação que o tipo exige do instrutor (a do avião; a do simulador), pelo nome
const HABILITACAO_DO_TIPO = { C152: 'c152', C172: 'c172', 'PA-34': 'mlte', 'Sim. Mono': 'sim_mono', 'Sim. Multi': 'sim_multi' };
const habilitacaoDoTipo = tipo => HABILITACAO_DO_TIPO[tipo] || null;

// O detalhe de uma categoria: os horários de decolagem (o lugar que js/views/horarios.js preenche, sempre o mesmo HTML: o
// resumo e o editor mudam nele, sem o componente refazer a seção) e o que vem do tipo
function detalheDaCategoria(cat) {
  const c = CATEGORIAS.find(x => x.id === cat);
  if (!c) return null;
  const todos = daCategoria(c), ativos = todos.filter(f => !inativoNaDataAberta(f));
  const ground = c.id === 'ground';
  const habilitacoes = c.tipos.map(habilitacaoDoTipo).filter(Boolean).map(nomeDaHabilitacao);
  return {
    atributos: `data-cat="${esc(c.id)}" data-id="${ID_DA_CATEGORIA}${esc(c.id)}"`,
    id: `${ID_DA_CATEGORIA}${c.id}`,
    titulo: c.nome,
    subtitulo: ground ? `a Sala Ground · ${disponivel(GROUND_REG) ? 'disponível' : 'indisponível'} nesta data`
      : `${plural(ativos.length, 'recurso', 'recursos')} · ${ativos.filter(f => disponivel(f.reg)).length} disponíveis nesta data`,
    icone: 'i-relogio',
    secoes: [
      {
        id: 'horarios', titulo: 'Horários de decolagem', icone: 'i-relogio', escopo: 'todas as datas',
        campos: [], html: `<div class="horarios" id="horarios" data-cat="${esc(c.id)}"></div>`
      },
      {
        id: 'tipo', titulo: 'Do tipo', icone: ICONE_DO_TIPO(c.tipos[0]), escopo: 'todas as datas',
        campos: [
          leitura('habilitacao', 'Habilitação do INVA', habilitacoes.length ? habilitacoes.join(' ou ') : 'a do tipo de Ground da missão'),
          leitura('revisao-50', 'Revisão de 50 horas', c.tipos.some(t => AIRCRAFT_EQ_TYPES.includes(t)) ? 'sim: a escala não passa das 50 horas' : 'não')
        ]
      }
    ],
    rodape: []
  };
}

// O detalhe do item fixo do hangar: a ordem inteira nesta data, da frente para o fundo (os ativos), com o que cada um voa e
// os botões de subir, descer e pôr na frente
function detalheDoHangar() {
  if (!ligada('hangar')) return null;
  const frota = (S.frota || FROTA_INICIAL).filter(f => !inativoNaDataAberta(f));
  const hangar = normalizarHangar(S.hangar, frota);
  const voos = voosQueVoam();
  const linhas = hangar.map((r, i) => {
    const tipo = (frota.find(f => f.reg === r) || {}).tipo || '';
    const naEscala = voos.filter(o => o.r === r).length;
    const situacao = S.av[r] === false ? '<span class="tag fb">manutenção</span>'
      : naEscala ? `<span class="tag grp">${naEscala} ${naEscala === 1 ? 'voo' : 'voos'} nesta data</span>` : '';
    const botao = (acao, icone, rotulo, desligado) =>
      `<button type="button" class="x" data-act="hangar-${acao}" data-id="${esc(r)}" aria-label="${rotulo}" title="${rotulo}"${desligado ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#${icone}"/></svg></button>`;
    return `<li data-id="${esc(r)}"><span class="pos">${i + 1}º</span> <b>${esc(r)}</b> <small>${esc(tipo)}</small> ${situacao}
      <span class="acoes edit-only">${botao('subir', 'i-cima', `Subir ${esc(r)}`, i === 0)}${botao('descer', 'i-baixo', `Descer ${esc(r)}`, i === hangar.length - 1)}${botao('frente', 'i-topo', `Pôr ${esc(r)} na frente do hangar`, i === 0)}</span></li>`;
  }).join('');
  return {
    atributos: `data-id="${ID_DO_HANGAR}"`,
    id: ID_DO_HANGAR,
    titulo: 'Ordem no hangar',
    subtitulo: 'da frente para o fundo, sempre com todos os aviões ativos',
    icone: 'i-lista',
    secoes: [{
      id: 'hangar', titulo: 'Ordem no hangar', icone: 'i-lista', escopo: escopoDaData(), campos: [],
      html: '<p class="h">A escala tira primeiro os aviões da frente e junta os voos nos que já saíram, para não deixar avião parado no meio do dia; a data seguinte começa com esta ordem. A busca não vale aqui.</p>'
        + `<ol class="fila hangar" id="hangar">${linhas}</ol>`
    }],
    rodape: []
  };
}

// O detalhe de um id da lista: o item fixo do hangar, uma categoria, um recurso (null: saiu)
export function detalheDosRecursos(id, { edita = true } = {}) {
  const sel = String(id);
  if (sel === ID_DO_HANGAR) return detalheDoHangar();
  if (sel.startsWith(ID_DA_CATEGORIA)) return detalheDaCategoria(sel.slice(ID_DA_CATEGORIA.length));
  const f = sel === GROUND_REG ? SALA_GROUND : frotaDoCadastro().find(x => x.reg === sel);
  return f ? detalheDoRecursoDaFrota(f, edita) : null;
}

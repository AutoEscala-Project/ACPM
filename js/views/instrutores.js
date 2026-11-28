// INVAs como lista e detalhe (o componente: js/views/mestre-detalhe.js): os modelos que a tela dá a ele, lidos do estado.
// A linha: o nome, as faixas da data aberta (com as pausas), quantos voos ele tem nela, as habilitações que mais o
// distinguem e a tira do dia (as faixas, as pausas e os voos, das 06:30 à meia-noite), com o "Vem" desta data e o "Ativo"
// do cadastro; o ponto marca os dados pessoais não salvos, quem está sem peso e quem chega perto de um limite da lei. O
// item fixo do alto, "Limites da Lei do Aeronauta", abre os limites. O detalhe, nesta ordem: "Nesta data" (o "Vem", as
// faixas e as pausas, os três turnos, "Editar faixas", "O que cabe nestas faixas" e os voos dele na escala da data), o cadastro (nome e peso), as
// habilitações, as horas de voo (limites da lei, com as de fora do app), os dados pessoais (para quem os vê) e, no rodapé,
// "Excluir instrutor…"; no alto, "Agendar voo com <nome>". Os campos têm os data-f de sempre: js/eventos/instrutores.js
// grava. "Editar faixas" é um rascunho na memória (editarFaixas), da data aberta e das faixas de quando abriu (outra data,
// ou as faixas mudadas por fora, o tiram), gravado só por "Salvar faixas"
import { AIRCRAFT_EQ_TYPES, GROUND_REG, MINUTOS_DO_DIA } from '../config.js';
import { HABILITACOES, nomeDaHabilitacao, GRUPOS_DE_HABILITACAO, gruposDosRecursos } from '../habilitacoes.js';
import { FROTA_INICIAL } from '../frota.js';
import { esc, hm, LIMITE_DO_NOME, numeroBr, hojeISO, rotuloDaData } from '../format.js';
import { S, DATA, insBy, stuBy, voosQueVoam, isGestor } from '../state.js';
import { inativo } from '../inativos.js';
import { botaoDeDica } from '../dicas.js';
import { normalizarLimites } from '../limites.js';
import { unidadeDoVoo, umPorUnidade, statusDoVoo } from '../voo.js';
import {
  TURNOS, ALMOCO, INICIO_DAS_FAIXAS, MINUTOS_DAS_FAIXAS, MAXIMO_DE_FAIXAS, MAXIMO_DE_PAUSAS, faixasDe, turnoDasFaixas, textoDasFaixas, textoDasPausas, trechosDaTira,
  oQueCabe, textoDoQueCabe, mesmasFaixas, minutoDaFaixa
} from '../disponibilidade.js';
import { canacDe, nomeCompletoDe, podeVerDadosPessoais } from './dados-pessoais.js';
import { secaoDosDadosPessoais, marcaDaPessoa, recusasDe } from './editor-de-dados-pessoais.js';
import { limitesHtml } from './limites.js';

const ROTULO = new Map(HABILITACOES.map(h => [h.id, h.curto]));
// No detalhe, todas na ordem do registro; na linha, só as que mais distinguem o instrutor
const ORDEM_NA_LINHA = ['mlte', 'c172', 'ifr', 'noturno', 'parafuso', 'endosso_solo', 'solo', 'navegacao_150', 'navegacao', 'local', 'tgl',
  'sim_multi', 'sim_mono', 'ground_pa34', 'grounds'];
const rotuloDa = h => ROTULO.get(h) || nomeDaHabilitacao(h);
const resumoDasHabilitacoes = x => x.hab.map(rotuloDa).join(' · ');
// Na linha, as marcas de checador (o curso, o motor e as regras: os grupos do checador no registro) contam como uma, na frente
const DO_CHECADOR = new Set(GRUPOS_DE_HABILITACAO.filter(g => g.id.startsWith('checador-')).flatMap(g => g.ids));
function resumoNaLinha(x) {
  const checador = x.hab.some(h => DO_CHECADOR.has(h)) ? ['Checador'] : [];
  const rotulos = [...checador, ...ORDEM_NA_LINHA.filter(h => x.hab.includes(h)).map(h => ROTULO.get(h))];
  return rotulos.length > 3 ? `${rotulos.slice(0, 3).join(' · ')} · +${rotulos.length - 3}` : rotulos.join(' · ');
}

// O item fixo dos limites da lei (o id não é o de nenhum instrutor: os deles são números)
export const ID_DOS_LIMITES = 'limites';

// Os grupos das habilitações (no detalhe e no filtro): os do registro (js/habilitacoes.js) e as habilitações próprias que
// a frota exige
const gruposDasHabilitacoes = () => [...GRUPOS_DE_HABILITACAO, ...gruposDosRecursos(Array.isArray(S.frota) ? S.frota : FROTA_INICIAL)];
// As opções do filtro das habilitações: os grupos do detalhe, com os rótulos da linha
export const opcoesDasHabilitacoes = () => gruposDasHabilitacoes().map(({ titulo, ids }) => ({ titulo, opcoes: ids.map(h => [h, rotuloDa(h)]) }));

// Os voos e as aulas do instrutor na escala da data, sem os cancelados (a turma de Ground conta uma vez), pelo horário
const voosDoInstrutor = x => umPorUnidade(voosQueVoam().filter(o => o.insId === x.id)).sort((p, q) => p.a - q.a);
const quantosVoos = n => (n ? `${n} ${n === 1 ? 'voo' : 'voos'}` : '');

// Limites da lei: as horas de voo do instrutor com a escala desta data (as de antes, as de fora do app e as de hoje, só
// voo em avião) no mês, no semestre e no ano
function horasComAEscala(x) {
  const passadas = (S.horasDosInstrutores || {})[x.id] || { mes: 0, semestre: 0, ano: 0, fimAnterior: null };
  const hoje = umPorUnidade(voosQueVoam().filter(o => o.insId === x.id && AIRCRAFT_EQ_TYPES.includes(o.eqType))).reduce((total, o) => total + o.h, 0);
  const somar = h => Math.round((h + hoje) * 10) / 10;
  return { mes: somar(passadas.mes), semestre: somar(passadas.semestre), ano: somar(passadas.ano), fimAnterior: passadas.fimAnterior };
}
const perto = (h, limite) => limite !== null && h >= 0.9 * limite;
// "92 h de voo no mês (limite 100 h)": o limite de que o instrutor chega perto (a partir de 90%), ou nada
function limitePerto(x) {
  const limites = normalizarLimites(S.limites);
  const h = horasComAEscala(x);
  const qual = [['mes', 'vooMesH', 'no mês'], ['semestre', 'vooSemestreH', 'no semestre'], ['ano', 'vooAnoH', 'no ano']].find(([p, l]) => perto(h[p], limites[l]));
  return qual ? `${numeroBr(h[qual[0]])} h de voo ${qual[2]} (limite ${limites[qual[1]]} h)` : '';
}

// A data aberta, curta, ao lado de "Nesta data": "sex 20/11"
function escopoDaData() {
  if (!DATA) return '';
  const { semana, data } = rotuloDaData(DATA, hojeISO());
  return `${semana.slice(0, 3)} ${data}`;
}
const diaEMes = () => (DATA ? `${DATA.slice(8, 10)}/${DATA.slice(5, 7)}` : 'esta data');

// O que a linha diz das faixas: as da data e as pausas; quem não vem, que não vem
function faixasEmTexto(x, d = faixasDe(x)) {
  if (!x.on) return 'não vem nesta data';
  const pausas = textoDasPausas(d);
  return `${textoDasFaixas(d)}${pausas ? ` · pausa ${pausas}` : ''}`;
}

// A tira: as faixas, as pausas e os voos, das 06:30 à meia-noite (o texto da linha diz o mesmo: ela é só para os olhos)
function tiraHtml(x, { grande = false } = {}) {
  const trechos = trechosDaTira(faixasDe(x), voosDoInstrutor(x));
  return `<span class="tira${grande ? ' grande' : ''}${x.on ? '' : ' nao-vem'}" aria-hidden="true">${trechos
    .map(t => `<span class="tira-${t.tipo}" style="left:${t.inicio}%;width:${t.largura}%"></span>`).join('')}</span>`;
}

// O ponto da linha: os dados pessoais não salvos, o peso que falta e o limite da lei perto
function pontoDoInstrutor(x) {
  const marca = marcaDaPessoa('instrutor', x.id);
  const rotulos = [marca ? marca.rotulo : '', x.kg ? '' : 'sem peso', limitePerto(x)].filter(Boolean);
  return { ponto: marca ? marca.ponto : rotulos.length ? 'aviso' : '', pontoRotulo: rotulos.join('; ') };
}

function itemDoInstrutor(x) {
  const veDados = podeVerDadosPessoais();
  const canac = veDados ? canacDe('instrutor', x.id) : '';
  const nomeCompleto = veDados ? nomeCompletoDe('instrutor', x.id) : '';
  return {
    id: x.id,
    titulo: x.nm,
    linha2: faixasEmTexto(x),
    meta: quantosVoos(voosDoInstrutor(x).length),
    linha3: resumoNaLinha(x),
    bloco: tiraHtml(x),
    ...pontoDoInstrutor(x),
    inativo: inativo(x),
    // O "Vem" desta data e o "Ativo" do cadastro (js/eventos/inativos.js): um clique em cada sentido
    rapida: { marcado: x.on, texto: 'Vem', rotulo: `${x.nm} vem em ${diaEMes()}`, atributos: 'data-f="on"' },
    chave: { marcado: !inativo(x), texto: 'Ativo', rotulo: `${x.nm} ativo no cadastro`, atributos: 'data-act="ativo" data-de="instrutor"' },
    atributos: `data-k="i" data-id="${x.id}"`,
    busca: [x.nm, nomeCompleto, canac].filter(Boolean),
    valores: { hab: x.hab }
  };
}

// O item fixo: os limites da lei, com o do mês e o do ano
function itemDosLimites() {
  const l = normalizarLimites(S.limites);
  const h = v => (v === null ? 'sem limite' : `${numeroBr(v)} h`);
  return { id: ID_DOS_LIMITES, titulo: 'Limites da Lei do Aeronauta', icone: 'i-relogio', linha2: `${h(l.vooMesH)} no mês · ${h(l.vooAnoH)} no ano` };
}

// O modelo da lista. O aviso: os dados pessoais de um instrutor que o servidor recusou (o primeiro que não está aberto),
// com "Abrir"
export function modeloDosInstrutores(escolhido = null) {
  const recusa = recusasDe('instrutor').find(r => String(r.id) !== String(escolhido) && insBy(+r.id));
  const aviso = recusa ? { texto: `Os dados pessoais de ${insBy(+recusa.id).nm} não foram salvos: ${recusa.texto.replace(/\.$/, '')}.`, abrir: recusa.id } : null;
  return { fixos: [itemDosLimites()], grupos: [], itens: S.ins.map(itemDoInstrutor), estado: 'pronto', aviso };
}

// ——— "Editar faixas": o rascunho de cada instrutor, na memória, até "Salvar faixas" ou "Cancelar" ———
// O rascunho guarda a data e as faixas de quando abriu: noutra data, ou com as faixas do instrutor mudadas por fora (o
// "Marcar disponível" do agendamento, a gravação de outra pessoa), ele sai, e "Salvar faixas" nunca grava por cima delas
const EDICOES = new Map();
export function edicaoDasFaixas(id) {
  const e = EDICOES.get(+id);
  if (!e) return null;
  const x = insBy(+id);
  if (x && e.data === DATA && mesmasFaixas(faixasDe(x), e.base)) return e;
  EDICOES.delete(+id);
  return null;
}
export function editarFaixas(id) {
  const x = insBy(+id);
  if (x) EDICOES.set(x.id, { ...structuredClone(faixasDe(x)), data: DATA, base: faixasDe(x), erro: '', campo: null });
}
export const pararDeEditarFaixas = id => EDICOES.delete(+id);
export function mudarEdicaoDasFaixas(id, mudar) {
  const e = edicaoDasFaixas(id);
  if (e) EDICOES.set(+id, { ...mudar(structuredClone(e)), erro: '', campo: null });
}
// A recusa de "Salvar faixas": a mensagem e o campo dela ({ lista, i, ponta }, ou nenhum)
export function erroNaEdicaoDasFaixas(id, erro, campo = null) {
  const e = edicaoDasFaixas(id);
  if (e) EDICOES.set(+id, { ...e, erro, campo });
}
// O id do campo recusado no rascunho ("det-ins-faixa-0-ate"), ou null
export const idDoCampoDaFaixa = ({ lista, i, ponta }) => `det-ins-${lista === 'faixas' ? 'faixa' : 'pausa'}-${i}-${ponta}`;

// Os horários de um campo: os da lista e, fora dela, o gravado (o "Marcar disponível" grava o voo exato), no lugar dele
const opcoesDeHorario = (lista, escolhido) => (minutoDaFaixa(escolhido) && !lista.includes(escolhido) ? [...lista, escolhido].sort((p, q) => p - q) : lista)
  .map(m => `<option value="${m}"${m === escolhido ? ' selected' : ''}>${hm(m)}</option>`).join('');
// Uma faixa ou uma pausa do rascunho: o De, o Até e o ✕. Os campos têm data-a="fx" (js/eventos/instrutores.js); o
// recusado, aria-invalid, com a mensagem como descrição
function linhaDaEdicao(tipo, f, i, recusado) {
  const nome = `${i + 1}ª ${tipo}`;
  const base = `det-ins-${tipo}-${i}`;
  const invalido = ponta => (recusado === `${base}-${ponta}` ? ' aria-invalid="true" aria-describedby="det-ins-faixas-erro"' : '');
  const campo = (ponta, lista) => `<select id="${base}-${ponta}" data-a="fx" data-fx="${tipo}" data-i="${i}" data-ponta="${ponta}" aria-label="${nome}: ${ponta === 'de' ? 'de' : 'até'}"${invalido(ponta)}>${opcoesDeHorario(lista, f[ponta])}</select>`;
  return `<li class="fx-linha"><span class="fx-rotulo">${tipo === 'faixa' ? 'Pode decolar de' : 'Pausa de'}</span>${campo('de', MINUTOS_DAS_FAIXAS.slice(0, -1))}`
    + `<span class="fx-ate">até</span>${campo('ate', MINUTOS_DAS_FAIXAS.slice(1))}`
    + `<button type="button" class="btn quiet fx-tirar" id="${base}-tirar" data-act="tirar-${tipo}" data-i="${i}" aria-label="Tirar a ${nome} (${hm(f.de)}–${hm(f.ate)})">✕</button></li>`;
}
function editorDasFaixas(x, e) {
  const recusado = e.erro && e.campo ? idDoCampoDaFaixa(e.campo) : null;
  const temAlmoco = e.pausas.some(p => p.de <= ALMOCO.de && p.ate >= ALMOCO.ate);
  return `<fieldset class="det-form faixas-form" data-faixas-de="${x.id}"><legend>Editar faixas <small>nesta data</small></legend>`
    + '<p class="h fx-dica" id="det-ins-faixas-dica">O voo começa dentro de uma faixa (o Até não entra: até 17:30 não inclui o Noturno) e pode terminar depois dela; nenhum voo toca uma pausa.</p>'
    + `<ul class="fx-lista" aria-label="Faixas de ${esc(x.nm)}">${e.faixas.map((f, i) => linhaDaEdicao('faixa', f, i, recusado)).join('')}</ul>`
    + (e.faixas.length ? '' : '<p class="h fx-vazio">Sem faixa: o instrutor não voa nesta data.</p>')
    + `<div class="fx-mais"><button type="button" class="btn sec" id="det-ins-mais-faixa" data-act="mais-faixa"${e.faixas.length >= MAXIMO_DE_FAIXAS ? ' disabled' : ''}>+ Faixa</button></div>`
    + `<ul class="fx-lista" aria-label="Pausas de ${esc(x.nm)}">${e.pausas.map((p, i) => linhaDaEdicao('pausa', p, i, recusado)).join('')}</ul>`
    + `<div class="fx-mais"><button type="button" class="btn sec" id="det-ins-mais-pausa" data-act="mais-pausa"${e.pausas.length >= MAXIMO_DE_PAUSAS ? ' disabled' : ''}>+ Pausa</button>`
    + `<button type="button" class="btn sec" id="det-ins-almoco" data-act="almoco"${temAlmoco || e.pausas.length >= MAXIMO_DE_PAUSAS ? ' disabled' : ''}>Almoço <small>${hm(ALMOCO.de)}–${hm(ALMOCO.ate)}</small></button></div>`
    // A recusa: aqui, e dita uma vez pelo #anuncio (js/eventos/instrutores.js), sem um alerta a mais
    + `<p class="erro-campo fx-erro" id="det-ins-faixas-erro">${esc(e.erro || '')}</p>`
    + '<div class="det-form-acoes"><button type="button" class="btn" id="det-ins-salvar-faixas" data-act="salvar-faixas">Salvar faixas</button>'
    + '<button type="button" class="btn quiet" id="det-ins-cancelar-faixas" data-act="cancelar-faixas">Cancelar</button></div></fieldset>';
}

// As horas marcadas embaixo da tira grande do detalhe
const MARCAS_DA_TIRA = [390, 720, 1050, 1440];

// "O que cabe nestas faixas" (C, "regra"): em cada lista de decolagem da data, os horários em que a missão começa e até
// quando pode ir a que começa no último deles (js/disponibilidade.js, oQueCabe). Fechado até um clique; quem não vem não tem
function oQueCabeHtml(x) {
  if (!x.on) return '';
  return '<details class="faixas-cabe" id="det-ins-cabe"><summary>O que cabe nestas faixas</summary>'
    + '<p class="h">Com a duração padrão de cada missão (1 h; o Simulador 2 h, o Ground 01h30, o Noturno 4 h), nos horários de decolagem da data:</p>'
    + `<ul>${oQueCabe(x, S.horarios).map(item => `<li>${esc(textoDoQueCabe(item))}</li>`).join('')}</ul></details>`;
}

const recursoDoVoo = r => (r === GROUND_REG ? 'Sala Ground' : r);
// O voo da lista de "Nesta data": o horário, a missão, o aluno (a turma de Ground: quantos), o recurso e o status
function vooEmTexto(o) {
  const turma = o.classKey ? voosQueVoam().filter(v => unidadeDoVoo(v) === o.classKey).length : 0;
  const aluno = turma > 1 ? `${turma} alunos` : ((stuBy(o.stuId) || {}).nm || '');
  return [o.mis, aluno, recursoDoVoo(o.r), statusDoVoo(o, S.fStatus)].filter(Boolean).join(' · ');
}

// "Nesta data": o "Vem", as faixas e as pausas (o texto e a tira), os três turnos, "Editar faixas" (ou o rascunho aberto),
// "O que cabe nestas faixas" e os voos do instrutor na escala da data
function secaoNestaData(x, edita) {
  const d = faixasDe(x);
  const voos = voosDoInstrutor(x);
  const vem = `<div class="det-campo">${edita
    ? `<span class="det-rotulo"><label for="det-ins-on">Vem</label>${botaoDeDica('vem-nesta-data', 'Vem')}</span><div class="det-valor"><label class="alvo det-vem"><input type="checkbox" class="sw" id="det-ins-on" data-f="on"${x.on ? ' checked' : ''}> ${x.on ? 'vem nesta data' : 'não vem nesta data'}</label></div>`
    : `<span class="det-rotulo" id="det-ins-on-rotulo">Vem${botaoDeDica('vem-nesta-data', 'Vem')}</span><div class="det-valor" aria-labelledby="det-ins-on-rotulo">${x.on ? 'vem nesta data' : 'não vem nesta data'}</div>`}</div>`;
  const campos = [
    { id: 'on', tipo: 'html', html: vem },
    { id: 'faixas', rotulo: 'Pode decolar', tipo: 'leitura', texto: textoDasFaixas(d), dica: ['faixas', 'O que é Pode decolar?'] },
    { id: 'pausas', rotulo: 'Pausas', tipo: 'leitura', texto: textoDasPausas(d) || 'nenhuma', dica: ['pausa', 'O que é a pausa?'] }
  ];
  const escala = `<div class="tira-escala" aria-hidden="true">${MARCAS_DA_TIRA.map(m => `<span style="left:${Math.round((m - INICIO_DAS_FAIXAS) / (MINUTOS_DO_DIA - INICIO_DAS_FAIXAS) * 1e4) / 100}%">${hm(m)}</span>`).join('')}</div>`;
  const atual = turnoDasFaixas(d);
  const edicao = edita ? edicaoDasFaixas(x.id) : null;
  const turnos = edita ? `<div class="turnos" role="group" aria-label="Turno de ${esc(x.nm)} nesta data">${TURNOS.map(t => `<button type="button" class="btn sec turno" id="det-ins-turno-${t.id}" data-act="turno" data-turno="${t.id}" aria-pressed="${atual === t}">${t.nome} <small>${hm(t.de)}–${hm(t.ate)}</small></button>`).join('')}`
    + (edicao ? '' : '<button type="button" class="btn quiet" id="det-ins-editar-faixas" data-act="editar-faixas">Editar faixas</button>') + '</div>' : '';
  const lista = voos.length
    ? `<ul class="voos-do-instrutor" aria-label="Voos de ${esc(x.nm)} nesta data">${voos.map(o => `<li data-voo="${esc(o.fKey)}"><span class="voo-quando">${hm(o.a)}–${hm(o.b)}</span> <span class="voo-oque">${esc(vooEmTexto(o))}</span></li>`).join('')}</ul>`
    : '<p class="h det-sem-voo">Sem voo nesta data.</p>';
  const html = `<div class="det-tira">${tiraHtml(x, { grande: true })}${escala}</div>${turnos}${edicao ? editorDasFaixas(x, edicao) : ''}${oQueCabeHtml(x)}${lista}`;
  return { id: 'data', titulo: 'Nesta data', icone: 'i-calendario', escopo: escopoDaData(), resumo: quantosVoos(voos.length), campos, html };
}

// As habilitações, em grupos (quem edita marca e desmarca; quem só consulta lê o resumo)
function secaoDasHabilitacoes(x, edita) {
  if (!edita) return { id: 'habilitacoes', titulo: 'Habilitações', icone: 'i-certo', escopo: 'todas as datas', campos: [{ id: 'habs', rotulo: 'Habilitações', tipo: 'leitura', texto: resumoDasHabilitacoes(x) || 'nenhuma' }] };
  const html = `<p class="h">Marque o que o instrutor pode fazer. Nos aviões (C152, C172 e PA-34), a missão exige também a habilitação do avião; o voo de cheque exige uma marca de cada grupo do checador.</p>`
    + `<div class="habs-painel">${gruposDasHabilitacoes().map(({ titulo, ids, dica }) => `<fieldset><legend>${titulo}${dica ? botaoDeDica(dica, dica === 'checador' ? 'checador' : 'habilitação própria') : ''}</legend>${ids.map(h =>
      `<label class="hab"><input type="checkbox" class="sw" data-f="hab" data-h="${esc(h)}" id="det-ins-hab-${esc(h.replace(':', '-'))}"${x.hab.includes(h) ? ' checked' : ''}>${esc(nomeDaHabilitacao(h))}</label>`).join('')}</fieldset>`).join('')}</div>`;
  return { id: 'habilitacoes', titulo: 'Habilitações', icone: 'i-certo', escopo: 'todas as datas', resumo: `${x.hab.length}`, campos: [], html };
}

// As horas de voo do instrutor (limites da lei) e as de fora do app: neste mês e, no ano, antes deste mês
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function secoesDasHoras(x) {
  const limites = normalizarLimites(S.limites);
  const h = horasComAEscala(x);
  const de = (valor, limite) => `${numeroBr(valor)} h${limite === null ? '' : ` de ${limite} h`}`;
  const externas = x.horasExternas || {};
  const mes = DATA ? MESES[+DATA.slice(5, 7) - 1] : '';
  const doMes = DATA ? externas[DATA.slice(0, 7)] : undefined, doAno = DATA ? externas[`${DATA.slice(0, 4)}-00`] : undefined;
  const aviso = limitePerto(x);
  const horas = { id: 'horas', titulo: 'Horas de voo', icone: 'i-relogio', escopo: mes, campos: [{ id: 'horas', rotulo: 'Com esta escala', tipo: 'leitura', texto: `No mês: ${de(h.mes, limites.vooMesH)} · No semestre: ${de(h.semestre, limites.vooSemestreH)} · No ano: ${de(h.ano, limites.vooAnoH)}`, dica: ['limites-da-lei', 'O que são os limites da lei?'] }],
    html: aviso ? `<p class="det-aviso-limite">Perto do limite: ${esc(aviso)}.</p>` : '' };
  // As horas de fora do app numa seção só delas: o campo em foco fica, e as horas de cima são refeitas
  const fora = { id: 'fora-do-app', titulo: 'Fora do app', icone: 'i-relogio', escopo: mes, campos: [
    { id: 'ext-mes', rotulo: `Neste mês (${mes})`, tipo: 'numero', valor: doMes ?? '', texto: doMes === undefined ? '—' : `${numeroBr(doMes)} h`, dica: ['fora-do-app', 'O que é Fora do app?'], atributos: 'data-f="ext-mes" min="0" max="999" step="0.1"' },
    { id: 'ext-ano', rotulo: `No ano, antes de ${mes}`, tipo: 'numero', valor: doAno ?? '', texto: doAno === undefined ? '—' : `${numeroBr(doAno)} h`, atributos: 'data-f="ext-ano" min="0" max="2000" step="0.1"' }
  ] };
  return [horas, fora];
}

// O detalhe dos limites da lei (o item fixo): os campos de js/views/limites.js
function detalheDosLimites() {
  return {
    id: ID_DOS_LIMITES, titulo: 'Limites da Lei do Aeronauta', icone: 'i-relogio', subtitulo: 'Lei 13.475/2017 e RBAC 117 · todas as datas',
    secoes: [{ id: 'limites', titulo: 'Limites', icone: 'i-relogio', escopo: 'todas as datas', campos: [], html: `<div class="limites-lei" id="limites-lei">${limitesHtml()}</div>` }],
    rodape: []
  };
}

// O detalhe de um instrutor (null: ele saiu do cadastro), ou o dos limites da lei
export function detalheDoInstrutor(id) {
  if (String(id) === ID_DOS_LIMITES) return detalheDosLimites();
  const x = insBy(+id);
  if (!x) return null;
  const edita = !isGestor();
  const veDados = podeVerDadosPessoais();
  const canac = veDados ? canacDe('instrutor', x.id) : '';
  const cadastro = [
    { id: 'nm', rotulo: 'Nome (na escala)', tipo: 'texto', valor: x.nm, atributos: `data-f="nm" maxlength="${LIMITE_DO_NOME}"` },
    { id: 'kg', rotulo: 'Peso (kg)', tipo: 'numero', valor: x.kg || '', texto: x.kg ? `${numeroBr(x.kg)} kg` : 'sem peso', falta: !x.kg, atributos: 'data-f="kg" min="1" max="300" step="0.1" placeholder="sem peso"' }
  ];
  const dados = secaoDosDadosPessoais('ins', 'instrutor', x.id);
  const ativo = !inativo(x);
  return {
    atributos: `data-k="i" data-id="${x.id}"`,
    id: x.id,
    titulo: x.nm,
    subtitulo: [canac ? `CANAC ${canac}` : '', resumoNaLinha(x) || 'sem habilitações'].filter(Boolean).join(' · '),
    aviso: ativo ? '' : 'Inativo no cadastro: não é escalado de hoje em diante (os voos que ele já tem nesta data continuam). As datas passadas ficam como estão. Para ativar de novo, ligue “Ativo” na linha dele.',
    acoes: ativo ? [{ id: 'agendar', rotulo: `Agendar voo com ${x.nm}`, icone: 'i-calendario', atributos: `data-act="agendar" data-agendar="i:${x.id}" aria-haspopup="dialog"` }] : [],
    secoes: [secaoNestaData(x, edita), { id: 'cadastro', titulo: 'Cadastro', icone: 'i-conta', escopo: 'todas as datas', campos: cadastro },
      secaoDasHabilitacoes(x, edita), ...secoesDasHoras(x), ...(dados ? [dados] : [])],
    rodape: [{ id: 'excluir', texto: 'Excluir instrutor…', rotulo: `Excluir ${x.nm}`, atributos: 'data-act="deli"', soEdicao: true }]
  };
}

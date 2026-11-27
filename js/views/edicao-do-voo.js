// O editor do voo (dialog#dlg-voo, F1g): todos os campos de um voo da Escala, abertos por uma barra do mapa ou pelo
// "Editar" da Lista. Modal (o Tab fica dentro; Esc e "Cancelar" não mudam nada; o foco volta para a barra ou o botão), de
// tela inteira no celular. Nada é gravado antes de "Salvar" (js/eventos/edicao-do-voo.js); os avisos são refeitos a cada
// campo, numa lista role="status" ligada aos campos (aria-describedby). Quem só consulta vê os mesmos campos como texto,
// sem "Salvar". Os peso do aluno e do INVA aparecem com o link para o cadastro: o peso é da pessoa, em todas as datas
import { S, RES, DATA, isGestor, estadoDaEscala, programaLido } from '../state.js';
import { vooParaEditar, opcoesDoVoo, avisosDaEdicao, mudancasDoVoo } from '../edicao-do-voo.js';
import { FLIGHT_STATUSES } from '../config.js';
import { esc, hm, fmtH, pesoBr, hojeISO, somarDias } from '../format.js';
import { dataCurta } from './dialogo-refazer.js';
import { nomeDoRecurso } from '../categorias.js';
import { textoDoDetalhe, rotuloDoStatus, STATUS_COM_DETALHE } from '../status.js';
import { cancelamentoAproveitavel } from '../reparo.js';
import { $, visivel } from '../dom.js';

// O editor aberto: o voo (vooParaEditar), os valores escolhidos, de onde ele abriu (o foco volta para lá), o "Outro
// horário" aberto e a confirmação armada dos avisos (a assinatura deles)
let aberto = null;

export const editorDoVooAberto = () => Boolean(aberto);
export const vooDoEditor = () => aberto;

const ambiente = () => ({ programa: programaLido(), resultados: S.resultados || { doDia: [] } });

// Abre o editor do voo da chave (a do voo, ou a da turma de Ground). origem: o elemento que abriu (o foco volta para ele)
export function abrirEditorDoVoo(chave, { origem = null } = {}) {
  const voo = RES ? vooParaEditar(estadoDaEscala(), RES, chave, ambiente()) : null;
  if (!voo) return false;
  aberto = { voo, valores: structuredClone(voo.valores), origem, outroHorario: false, armado: null };
  $('#voo-erro').textContent = '';
  desenharEditor();
  const dlg = $('#dlg-voo');
  if (!dlg.open) dlg.showModal();
  const primeiro = [...dlg.querySelectorAll('#voo-campos select:not(:disabled), #voo-campos input:not(:disabled), #voo-campos button')].find(visivel) || $('#voo-cancelar');
  primeiro.focus();
  return true;
}

// Fecha sem gravar nada. devolverFoco: para a barra ou o botão de onde ele abriu (ou, sem ele, para o voo)
export function fecharEditorDoVoo({ devolverFoco = true } = {}) {
  if (!aberto) return;
  const { origem, voo } = aberto;
  aberto = null;
  const dlg = $('#dlg-voo');
  if (dlg.open) dlg.close();
  if (!devolverFoco) return;
  const alvo = origem && origem.isConnected && visivel(origem) ? origem
    : [...document.querySelectorAll(`#out .tl-bar[data-pop="${CSS.escape(voo.chave)}"], #out [data-act="editar-voo"][data-fkey="${CSS.escape(voo.chave)}"]`)].find(visivel);
  if (alvo) alvo.focus();
}

// A escala mudou com o editor aberto (outra pessoa, outra aba): o voo é lido de novo, com os valores escolhidos; sem ele, o
// editor fecha
export function atualizarEditorDoVoo() {
  if (!aberto) return;
  const voo = RES ? vooParaEditar(estadoDaEscala(), RES, aberto.voo.chave, ambiente()) : null;
  if (!voo) { fecharEditorDoVoo({ devolverFoco: false }); return; }
  aberto.voo = voo;
  desenharEditor();
}

const op = (valor, texto, selecionado, desligada = false) => `<option value="${esc(valor)}"${selecionado ? ' selected' : ''}${desligada ? ' disabled' : ''}>${esc(texto)}</option>`;
const nomeDoAluno = id => (S.stu.find(s => s.id === id) || {}).nm || `Aluno ${id}`;

// Os avisos de agora e, por campo, os ids deles (o campo os lê pelo aria-describedby)
function avisosDeAgora() {
  const { voo, valores } = aberto;
  if (!mudancasDoVoo(voo, valores).alguma && valores.missao) return [];
  return avisosDaEdicao(estadoDaEscala(), RES, voo, valores, { aprovada: Boolean(S.aprovacao), programa: programaLido(), diaSeguinte: somarDias(DATA, 1) });
}

export const assinaturaDosAvisosDoVoo = avisos => avisos.map(a => `${a.codigo}:${a.texto}`).join('|');

// O motivo da trava ao lado do campo
const trava = (id, texto) => (texto ? `<small class="h" id="${id}">${esc(texto)}</small>` : '');

function campoDoStatus(o, valores, { id, rotulo, travado, descricao = '' }) {
  const st = valores.status[o.fKey];
  const detalhe = valores.detalhe[o.fKey];
  const texto = textoDoDetalhe(st, detalhe);
  const botaoDoDetalhe = texto && STATUS_COM_DETALHE.includes(st) && !travado
    ? ` <button type="button" class="btn quiet voo-detalhe" data-voo-detalhe="${esc(o.fKey)}" aria-label="Mudar o detalhe do status: ${esc(texto)}">${esc(texto)}</button>` : texto ? ` <span class="h">${esc(texto)}</span>` : '';
  return `<span class="voo-status"><select id="${id}" data-voo-status="${esc(o.fKey)}" aria-label="${esc(rotulo)}"${descricao ? ` aria-describedby="${descricao}"` : ''}${travado ? ' disabled' : ''}>${FLIGHT_STATUSES.map(v => op(v, rotuloDoStatus(v, o), v === st)).join('')}</select>${botaoDoDetalhe}</span>`;
}

// O conteúdo novo (html) no lugar do de agora, sem tirar da página os elementos de manter (o campo em que se digita e o
// que tem o foco): eles ficam, com os atributos e as opções novas, e o resto é trocado em volta deles. Tirado da página, o
// campo do horário voltaria à primeira parte a cada tecla, e o foco que o Tab ou o clique acabou de levar a outro campo
// sairia dele
function trocarMantendo(caixa, html, manter) {
  const modelo = document.createElement('template');
  modelo.innerHTML = html;
  const pares = manter.filter(el => el && el.id && caixa.contains(el) && el !== caixa)
    .map(el => [el, modelo.content.getElementById(el.id)]).filter(([el, novo]) => novo && novo.tagName === el.tagName);
  if (!pares.length) { caixa.innerHTML = html; return; }
  mesclar(caixa, modelo.content, pares);
}
const contem = (no, el) => no === el || (typeof no.contains === 'function' && no.contains(el));
function copiarAtributos(velho, novo) {
  if (velho.nodeType !== 1) return;
  const pula = velho.tagName === 'INPUT' ? ['value'] : [];
  [...velho.attributes].filter(a => !novo.hasAttribute(a.name) && !pula.includes(a.name)).forEach(a => velho.removeAttribute(a.name));
  [...novo.attributes].filter(a => !pula.includes(a.name) && velho.getAttribute(a.name) !== a.value).forEach(a => velho.setAttribute(a.name, a.value));
}
function mesclar(velho, novo, pares) {
  const filhos = [...velho.childNodes];
  const lista = [...novo.childNodes].map(n => {
    const dentro = pares.filter(([, nv]) => contem(n, nv));
    const antigo = dentro.length ? filhos.find(o => o.nodeName === n.nodeName && dentro.every(([v]) => contem(o, v))) : null;
    return antigo ? { n, antigo, dentro } : { n };
  });
  const ficam = new Set(lista.filter(x => x.antigo).map(x => x.antigo));
  filhos.filter(o => !ficam.has(o)).forEach(o => o.remove());
  lista.forEach((x, i) => {
    if (x.antigo) {
      copiarAtributos(x.antigo, x.n);
      // O próprio elemento mantido: as opções novas da lista; dentro dele, nada mais muda
      if (x.dentro.some(([v]) => v === x.antigo)) { if (x.antigo.tagName === 'SELECT' && x.antigo.innerHTML !== x.n.innerHTML) x.antigo.innerHTML = x.n.innerHTML; }
      else mesclar(x.antigo, x.n, x.dentro);
      return;
    }
    const seguinte = lista.slice(i + 1).find(y => y.antigo);
    velho.insertBefore(x.n, seguinte ? seguinte.antigo : null);
  });
}

// O editor desenhado com os valores escolhidos: as opções de cada campo e os avisos. manter: os elementos que ficam na
// página (trocarMantendo)
export function desenharEditor({ manter = [] } = {}) {
  if (!aberto) return;
  const { voo, valores } = aberto;
  const estado = estadoDaEscala();
  const leitura = isGestor();
  const { principal, travas, ground } = voo;
  const opcoes = opcoesDoVoo(estado, RES, voo, valores, ambiente());
  const avisos = leitura ? [] : avisosDeAgora();
  const idsDoCampo = {};
  avisos.forEach((a, i) => { (idsDoCampo[a.campo] ||= []).push(`voo-aviso-${i}`); });
  const ligado = (id, extra = []) => {
    const ids = [...(idsDoCampo[id] || []), ...extra.filter(Boolean)];
    const conflito = avisos.some(a => a.campo === id && a.conflito);
    return `${ids.length ? ` aria-describedby="${ids.join(' ')}"` : ''}${conflito ? ' aria-invalid="true"' : ''}`;
  };
  const turma = ground && voo.unidade.length > 1;
  $('#voo-titulo').textContent = turma ? `Turma de ${principal.mis}` : `Voo de ${nomeDoAluno(valores.stuId)}`;
  $('#voo-contexto').textContent = [dataCurta(), `${hm(principal.a)}–${hm(principal.b)}`, principal.mis, nomeDoRecurso(principal.r), principal.ins,
    leitura ? '' : S.aprovacao ? 'escala aprovada: só este voo muda, sem refazer a escala' : 'escala não aprovada: Salvar refaz a escala inteira'].filter(Boolean).join(' · ');
  const tudo = Boolean(travas.tudo);
  // O porquê do campo desligado: a trava da volta do noturno, ou o aviso da missão para escolher
  const semMissao = avisos.findIndex(a => a.codigo === 'sem-missao');
  const porQue = tudo ? 'voo-trava-tudo' : !valores.missao && semMissao >= 0 ? `voo-aviso-${semMissao}` : '';
  const aluno = S.stu.find(s => s.id === valores.stuId) || null;
  const x = S.ins.find(i => i.id === valores.insId) || null;
  const missaoAtual = valores.missao;
  const valorDaMissao = m => (m ? (m.etapa ? `c:${m.cursoDaEtapa || ''}:${m.etapa}` : `t:${m.mis}`) : '');

  if (leitura) {
    const linha = (rotulo, valor) => `<div class="voo-leitura"><span>${esc(rotulo)}</span><b>${esc(valor)}</b></div>`;
    $('#voo-campos').innerHTML = [
      linha(turma ? 'Turma' : 'Aluno', turma ? voo.unidade.map(o => o.s).join(', ') : principal.s),
      linha('Missão', principal.etapa ? `${principal.etapa} · ${principal.mis}` : principal.mis),
      linha('Recurso', nomeDoRecurso(principal.r)), linha('Horário', `${hm(principal.a)}–${hm(principal.b)}`), linha('Duração', fmtH((principal.b - principal.a) / 60)),
      linha('Instrutor', principal.ins), ...voo.unidade.map(o => linha(turma ? `Status de ${o.s}` : 'Status', [rotuloDoStatus(valores.status[o.fKey], o), textoDoDetalhe(valores.status[o.fKey], valores.detalhe[o.fKey])].filter(Boolean).join(' · '))),
      linha('Peso do aluno', principal.stuKg ? `${pesoBr(principal.stuKg)} kg` : 'sem peso'), linha('Peso do INVA', principal.insKg ? `${pesoBr(principal.insKg)} kg` : 'sem peso')
    ].join('');
    $('#voo-avisos').innerHTML = '';
    $('#voo-cancelar').textContent = 'Fechar';
    return;
  }
  $('#voo-cancelar').textContent = 'Cancelar';

  const partes = [];
  if (tudo) partes.push(`<p class="voo-trava" id="voo-trava-tudo">${esc(travas.tudo)}</p>`);
  // Aluno (o voo) ou Turma (o Ground)
  if (turma || ground) {
    partes.push(`<fieldset class="voo-turma"><legend>Turma</legend><ul>${voo.unidade.map((o, i) => `<li><b>${esc(o.s)}</b>
      ${campoDoStatus(o, valores, { id: `voo-status-${i}`, rotulo: `Status de ${o.s}`, travado: false })}
      ${o.trecho ? '' : `<button type="button" class="btn quiet" data-act="rm-fly" data-id="${esc(o.stuId)}" data-mid="${esc(o.mid || 0)}" aria-label="Tirar ${esc(o.s)} da escala">Tirar</button>`}</li>`).join('')}</ul>
      ${voo.unidade.some(o => valores.status[o.fKey] !== 'Cancelado') ? `<button type="button" class="btn quiet" data-act="agendar" data-agendar="t:${esc(voo.chave)}" aria-haspopup="dialog">+ Aluno na turma</button>` : ''}</fieldset>`);
  } else {
    partes.push(`<label class="campo">Aluno <select id="voo-aluno"${tudo || travas.aluno ? ' disabled' : ''}${ligado('voo-aluno', [travas.aluno && 'voo-trava-aluno', tudo && porQue])}>
      ${opcoes.alunos.map(a => op(a.valor, a.texto, a.valor === valores.stuId)).join('')}</select>${trava('voo-trava-aluno', travas.aluno)}</label>`);
  }
  // Missão: as do curso do aluno, ou os tipos
  const grupos = opcoes.missoes.grupos;
  const temAtual = grupos.some(g => g.opcoes.some(o => o.valor === valorDaMissao(missaoAtual)));
  partes.push(`<label class="campo">Missão <select id="voo-missao"${tudo || travas.missao ? ' disabled' : ''}${ligado('voo-missao', [travas.missao && 'voo-trava-missao', tudo && porQue])}>
    ${missaoAtual ? '' : op('', 'Escolha a missão', true)}${missaoAtual && !temAtual ? op(valorDaMissao(missaoAtual), missaoAtual.etapa ? `${missaoAtual.etapa} · ${missaoAtual.mis}` : missaoAtual.mis, true) : ''}
    ${grupos.map(g => `<optgroup label="${esc(g.rotulo)}">${g.opcoes.map(o => op(o.valor, o.texto, o.valor === valorDaMissao(missaoAtual))).join('')}</optgroup>`).join('')}
    </select>${trava('voo-trava-missao', travas.missao)}${opcoes.missoes.motivo && !travas.missao ? `<small class="h">${esc(opcoes.missoes.motivo)}</small>` : ''}</label>`);
  if (!ground) {
    const recursos = opcoes.recursos.some(o => o.valor === valores.r) ? opcoes.recursos : [{ valor: valores.r, texto: nomeDoRecurso(valores.r) }, ...opcoes.recursos];
    partes.push(`<label class="campo">Recurso <select id="voo-recurso"${tudo || !missaoAtual ? ' disabled' : ''}${ligado('voo-recurso', [porQue])}>${recursos.map(o => op(o.valor, o.texto, o.valor === valores.r)).join('')}</select></label>`);
  }
  const horarios = opcoes.horarios;
  partes.push(`<div class="campo-duplo">
    <label class="campo">Decolagem <select id="voo-horario"${tudo || !missaoAtual ? ' disabled' : ''}${ligado('voo-horario', [porQue])}>${horarios.map(h => op(h.valor, h.texto, h.valor === valores.a && !aberto.outroHorario)).join('')}${op('outro', 'Outro horário…', aberto.outroHorario)}</select></label>
    <label class="campo"${aberto.outroHorario ? '' : ' hidden'}>Outro horário <input type="time" id="voo-outro-horario" step="300" value="${hm(valores.a)}"${ligado('voo-horario')}></label>
    <label class="campo">Duração (h) <input type="number" id="voo-duracao" min="0.1" max="5" step="0.1" inputmode="decimal" value="${String(Math.round((valores.minutos / 60) * 10) / 10)}"${tudo || opcoes.duracao.fixa || !missaoAtual ? ' disabled' : ''}${ligado('voo-duracao', [opcoes.duracao.fixa && 'voo-trava-duracao', porQue])}>${opcoes.duracao.fixa ? trava('voo-trava-duracao', `A duração de ${missaoAtual.mis} não muda.`) : ''}</label>
  </div>`);
  // Instrutor: "Automático" e os instrutores em grupos, cada um com o que pesa contra ele (nada desligado: o que não serve
  // avisa)
  const auto = opcoes.automatico;
  partes.push(`<label class="campo">Instrutor <select id="voo-instrutor"${tudo || !missaoAtual ? ' disabled' : ''}${ligado('voo-instrutor', [auto.desligado && 'voo-trava-automatico', porQue])}>
    ${op(0, 'Automático (o app escolhe)', valores.insId === 0, auto.desligado)}
    ${opcoes.instrutores.map(g => `<optgroup label="${esc(g.rotulo)}">${g.opcoes.map(o => op(o.valor, o.texto, o.valor === valores.insId)).join('')}</optgroup>`).join('')}
    </select>${auto.desligado ? trava('voo-trava-automatico', `Automático: ${auto.nota}.`) : ''}</label>`);
  if (!ground) partes.push(`<div class="campo">Status ${campoDoStatus(principal, valores, { id: 'voo-status', rotulo: 'Status do voo', travado: false, descricao: tudo ? 'voo-trava-tudo' : '' })}</div>`);
  // Os pesos: da pessoa, no cadastro
  partes.push(`<div class="voo-pesos">
    <span>Peso do aluno: <b>${aluno && aluno.kg ? `${pesoBr(aluno.kg)} kg` : 'sem peso'}</b> <a class="btn quiet" href="#/alu" data-voo-cadastro>no cadastro (Alunos)</a></span>
    <span>Peso do INVA: <b>${x && x.kg ? `${pesoBr(x.kg)} kg` : x ? 'sem peso' : '—'}</b> <a class="btn quiet" href="#/ins" data-voo-cadastro>no cadastro (Instrutores)</a></span>
  </div>`);
  // Sugestões: o voo em conflito e o cancelado que ainda pode voar (a gaveta abre no lugar do editor)
  const sugestoes = principal.conflito || cancelamentoAproveitavel(S, principal, { data: DATA, hoje: hojeISO() });
  if (sugestoes && !voo.volta) partes.push(`<button type="button" class="btn quiet" data-reparo="${esc(principal.fKey)}">Sugestões</button>`);
  trocarMantendo($('#voo-campos'), partes.join(''), manter);
  $('#voo-avisos').innerHTML = avisos.map((a, i) => `<li id="voo-aviso-${i}" class="${a.conflito ? 'conflito' : 'aviso'}">${esc(a.texto)}</li>`).join('');
  const assinatura = assinaturaDosAvisosDoVoo(avisos);
  if (aberto.armado !== null && aberto.armado !== assinatura) aberto.armado = null;
  aberto.avisos = avisos;
  $('#voo-salvar').textContent = aberto.armado !== null ? 'Salvar mesmo assim' : 'Salvar';
}

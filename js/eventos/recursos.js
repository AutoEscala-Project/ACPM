// Recursos como lista e detalhe (B; o componente: js/views/mestre-detalhe.js, com os modelos de js/views/recursos.js): a
// frota (acrescentar, no detalhe, e "Retirar da frota…"), o "Disponível" e as horas até a revisão de 50 horas desta data,
// os atributos, o hangar (o item fixo da lista) e os horários de decolagem (o detalhe de cada categoria). O "Ativo" do
// cadastro é de js/eventos/inativos.js (os três cadastros). Os campos são gravados ao sair deles (change), pelo mesmo
// caminho de sempre (registro.js, gravarAlteracao); o valor recusado fica no campo, com a mensagem
import { gravarAlteracao, aindaNaoAbriu, ultimaGravacao } from '../actions.js';
import { categoriaDoTipo, nomeDoRecurso, doNomeDaCategoria } from '../categorias.js';
import { REVISAO_H, GROUND_REG } from '../config.js';
import { $, showToast, fecharNoEsc } from '../dom.js';
import { fmtH, lerHoras, chaveDeBusca } from '../format.js';
import { ligada } from '../funcionalidades.js';
import { novoRecurso, ATRIBUTOS_DO_RECURSO, atributoVale, comAtributo, comExigencia, exigenciasDoAviao } from '../frota.js';
import { nomeDaHabilitacao } from '../habilitacoes.js';
import { normalizarHangar, moverNoHangar } from '../hangar.js';
import { horariosDaMissao, ajustarPreferencias, descreverHorarios } from '../horarios.js';
import { S, isGestor, getMissionTarget, inativoNaDataAberta } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { criarMestreDetalhe } from '../views/mestre-detalhe.js';
import { abrirEditorDosHorarios, fecharEditorDosHorarios, tirarDoRascunho, porNoRascunho, escolherModelo, rascunhoDosHorarios, editorDosHorariosAberto, rHorarios, digitouNoRascunho } from '../views/horarios.js';
import { modeloDosRecursos, detalheDosRecursos, lembrarExigencias } from '../views/recursos.js';
import { registrarTela } from '../views/telas.js';

const tela = criarMestreDetalhe({
  id: 'rec',
  rotulo: 'Recursos',
  nomes: ['recurso', 'recursos'],
  semItens: 'Nenhum recurso na frota.',
  // Nada escolhido: o texto e, com "+ Novo recurso", o formulário do recurso novo (um bloco fixo da página)
  vazio: { elemento: 'rec-vazio' },
  // A busca acha a matrícula sem os acentos, sem o hífen e sem os espaços ("vob" e "PR VOB" acham o PR-VOB)
  chaveDaBusca: texto => chaveDeBusca(texto).replace(/[\s-]/g, ''),
  modelo: modeloDosRecursos,
  // O detalhe de uma categoria tem o lugar dos horários de decolagem, que js/views/horarios.js preenche depois do desenho
  detalhe: id => {
    queueMicrotask(() => rHorarios());
    return detalheDosRecursos(id, { edita: !isGestor() });
  },
  edita: () => !isGestor()
});
const desenhar = momento => { tela.desenhar(momento); rHorarios(); };

// O desenho de Recursos (js/redesenho.js): os dados de uma data, quem só consulta, a releitura, o perfil e a escala (as
// horas e o que cada recurso voa nela)
registrarDesenho('recursos', desenhar, { em: ['dados', 'consulta', 'releitura', 'perfil', 'escala'], ordem: 10, comMomento: true });
// O endereço: #/rec/<matrícula> escolhe o recurso (numa vista só, abre o detalhe); #/rec/cat:C152, a categoria. Numa
// vista só, a volta do detalhe vazio com o formulário do recurso novo (Voltar, o Esc, Cancelar) fecha o formulário, com
// o foco em "+ Novo recurso" (o detalhe vazio não tem "‹ Recursos", e nada escolhido não tem linha para o foco)
const noFormularioDoCelular = () => $('#s-rec').dataset.vendo === 'detalhe' && !$('#form-recurso').hidden;
registrarTela('rec', {
  aoMostrar: (item, opcoes) => {
    const doFormulario = (item === null || item === undefined) && noFormularioDoCelular();
    const feito = tela.aoMostrar(item, opcoes);
    if (!doFormulario || $('#s-rec').dataset.vendo !== 'lista') return feito;
    mostrarFormDoRecurso(false);
    if (!opcoes || opcoes.historico !== 'nenhum') return feito;
    $('#btn-novo-recurso').focus();
    return { ...feito, focou: true };
  }
});

// ——— O recurso novo: "+ Novo recurso" abre o formulário no detalhe (nada escolhido) ———

// O campo do recurso com erro (aria-invalid); o motivo (#rec-erro) é a descrição dele: o leitor de tela diz os dois
const CAMPOS_DO_RECURSO = { reg: '#rec-reg', tipo: '#rec-tipo' };
const marcarCampoDoRecurso = campo => Object.entries(CAMPOS_DO_RECURSO).forEach(([nome, id]) => {
  if (nome === campo) $(id).setAttribute('aria-invalid', 'true');
  else $(id).removeAttribute('aria-invalid');
});
function mostrarFormDoRecurso(abrir) {
  $('#form-recurso').hidden = !abrir;
  $('#btn-novo-recurso').setAttribute('aria-expanded', String(abrir));
  $('#rec-erro').textContent = '';
  // Com o formulário aberto, o texto do detalhe vazio dá lugar a ele
  $('#rec-vazio .det-vazio').hidden = abrir;
  marcarCampoDoRecurso(null);
  if (!abrir) return;
  $('#form-recurso').reset();
  $('#rec-parafuso-rotulo').hidden = true;
}
// (abrir o formulário não grava: vale também antes de os dados da data chegarem, e o "Adicionar" é que espera por eles)
$('#btn-novo-recurso').addEventListener('click', () => {
  if (isGestor()) return;
  tela.escolher(null, { abrir: true });
  mostrarFormDoRecurso(true);
  $('#rec-reg').focus();
});
// Cancelar: numa vista só, a lista de volta (a entrada do histórico que o formulário abriu sai, como em "‹ Recursos")
$('#rec-cancelar').onclick = () => {
  if (noFormularioDoCelular()) {
    if (window.history.state && window.history.state.detalhe === 'rec') { window.history.back(); return; }
    tela.voltarParaALista({ focar: false });
  }
  mostrarFormDoRecurso(false);
  $('#btn-novo-recurso').focus();
};
$('#rec-tipo').onchange = () => {
  $('#rec-parafuso-rotulo').hidden = $('#rec-tipo').value !== 'C152';
  if ($('#rec-tipo').value !== 'C152') $('#rec-parafuso').checked = false;
};
$('#form-recurso').onsubmit = e => {
  e.preventDefault();
  if (isGestor() || aindaNaoAbriu()) return;
  const { recurso, erro, campo } = novoRecurso(S.frota, { reg: $('#rec-reg').value, tipo: $('#rec-tipo').value, soParafuso: $('#rec-parafuso').checked });
  if (erro) { $('#rec-erro').textContent = erro; marcarCampoDoRecurso(campo); return; }
  S.frota.push(recurso);
  S.av[recurso.reg] = true;
  if (!gravarAlteracao('inc', `Recurso adicionado: ${recurso.reg} (${recurso.tipo}${recurso.soParafuso ? ', só Parafuso' : ''})`)) {
    S.frota = S.frota.filter(f => f !== recurso);
    return;
  }
  mostrarFormDoRecurso(false);
  // O novo fica escolhido, à vista mesmo fora da busca (até ela mudar), com o título em foco
  tela.novo(recurso.reg, ultimaGravacao());
  redesenharPorNome('instrutores');
  tela.focarNoCampo('titulo');
  showToast(`${recurso.reg} adicionado à frota.`, 'ok');
};

// ——— O que muda nesta data ———

// O "Disponível" (a chave da linha e a do detalhe)
aoMudarCampo('av', t => {
  const reg = t.dataset.id;
  S.av[reg] = t.checked;
  // A Sala Ground não entra em manutenção: fica indisponível na data (S4)
  const fora = reg === GROUND_REG ? 'Indisponível' : 'Manutenção';
  gravarAlteracao(t.checked ? 'inc' : 'exc', `${nomeDoRecurso(reg)}: ${t.checked ? 'Disponível' : fora}`, {
    kind: 'setAv', reg, val: !t.checked, label: '↶ Reverter'
  });
  desenhar();
});

// As horas disponíveis até a revisão de 50 horas; o dia guarda as horas desde a revisão (50 menos as disponíveis). Vazio:
// sem controle para o avião. Fora de 0 a 50, o valor fica no campo, com a mensagem
aoMudarCampo('horas', t => {
  const reg = t.dataset.horas;
  const disponiveis = t.value === '' ? null : lerHoras(t.value);
  if (disponiveis !== null && !(disponiveis >= 0 && disponiveis <= REVISAO_H)) {
    tela.erroNoCampo('horas', `As horas disponíveis vão de 0 a ${REVISAO_H}.`);
    return;
  }
  if (disponiveis === null) delete S.horas[reg];
  else S.horas[reg] = Math.round((REVISAO_H - disponiveis) * 10) / 10;
  gravarAlteracao('mod', `${reg}: ${disponiveis === null ? 'horas disponíveis não informadas' : `${fmtH(disponiveis)} disponíveis até a revisão de 50 horas`}`);
  desenhar();
});

// Revisão de 50 horas feita: as horas do avião desde a última revisão voltam a zero (pede confirmação)
aoAcionar('revisao', b => {
  if (isGestor() || !confirmado(b, 'Confirmar revisão')) return;
  S.horas[b.dataset.id] = 0;
  gravarAlteracao('mod', `${b.dataset.id}: revisão de 50 horas feita (${REVISAO_H} h disponíveis)`);
  desenhar();
});

// Hangar: sobe, desce ou põe na frente um avião (na data aberta; a data seguinte começa com esta ordem)
aoAcionar(['hangar-subir', 'hangar-descer', 'hangar-frente'], b => {
  if (!ligada('hangar')) return;
  const a = b.dataset.act;
  const r = b.dataset.id;
  S.hangar = moverNoHangar(normalizarHangar(S.hangar, S.frota.filter(f => !inativoNaDataAberta(f))), r, a.slice('hangar-'.length));
  gravarAlteracao('mod', `Hangar: ${r} passou para ${S.hangar.indexOf(r) + 1}º`);
  desenhar();
});

// ——— O cadastro (todas as datas) ———

// Os atributos de um recurso (Só Parafuso, Só VFR e Habilitação própria): cada mudança vale para todas as datas (a escala
// é refeita) e entra no histórico, que desfaz. A habilitação própria também em exige (js/frota.js, comAtributo)
function marcarAtributo(reg, atributo, val) {
  const i = (S.frota || []).findIndex(f => f.reg === reg);
  if (i < 0 || !atributoVale(atributo, S.frota[i].tipo)) return false;
  S.frota[i] = comAtributo(S.frota[i], atributo, val);
  return true;
}
aoMudarCampo('atributo', t => {
  const { r: reg, atributo } = t.dataset;
  if (!marcarAtributo(reg, atributo, t.checked)) return;
  gravarAlteracao('mod', `${reg}: ${ATRIBUTOS_DO_RECURSO[atributo].nome} ${t.checked ? 'marcado' : 'desmarcado'}`, {
    kind: 'setAtributo', reg, atributo, val: !t.checked, label: '↶ Reverter'
  });
  desenhar();
  // ('instrutores' refaz também as habilitações do INVA escolhido, no detalhe de INVAs)
  redesenharPorNome('instrutores', 'pedidos-do-dia');
  document.querySelector(`#det-rec [data-a="atributo"][data-r="${CSS.escape(reg)}"][data-atributo="${atributo}"]`)?.focus();
});

// "Habilitações que o INVA precisa" › "Exigir também…": cada caixa põe ou tira uma habilitação da lista exige do recurso
// (todas as datas: a escala é refeita), com uma entrada no histórico que desfaz só aquela caixa (setExigencias: a
// habilitação própria e as caixas mudadas depois ficam). O foco fica na caixa, e a caixa de "Exigir também…" fica como
// estava (aberta)
function mudarExigencia(reg, h, exigir) {
  const i = (S.frota || []).findIndex(f => f.reg === reg);
  if (i < 0) return false;
  S.frota[i] = comExigencia(S.frota[i], h, exigir);
  return true;
}
aoMudarCampo('exige', t => {
  const reg = t.dataset.r, h = t.value;
  const f = (S.frota || []).find(x => x.reg === reg);
  if (!f) return;
  const antes = exigenciasDoAviao(f).includes(h);
  if (!mudarExigencia(reg, h, t.checked)) return;
  gravarAlteracao('mod', `${reg}: ${t.checked ? 'exige' : 'deixa de exigir'} ${nomeDaHabilitacao(h)}`, {
    kind: 'setExigencias', reg, h, val: antes, label: '↶ Reverter'
  });
  desenhar();
  redesenharPorNome('instrutores', 'pedidos-do-dia');
  document.getElementById(`det-rec-exige-${h}`)?.focus();
});
// A caixa de "Exigir também…" aberta ou fechada (o toggle não sobe: ouvido na captura)
document.addEventListener('toggle', e => {
  const caixa = e.target instanceof Element && e.target.matches('#det-rec details.exige[data-r]') ? e.target : null;
  if (caixa) lembrarExigencias(caixa.dataset.r, caixa.open);
}, true);

// "Retirar da frota…", no rodapé do detalhe: dois cliques; o histórico desfaz. INVAs é refeito: a habilitação própria
// do recurso sai das Habilitações do detalhe e do filtro das habilitações
aoAcionar('retirar-recurso', b => {
  if (!confirmado(b, 'Confirmar retirada')) return;
  const recurso = S.frota.find(f => f.reg === b.dataset.id);
  if (!recurso) return;
  S.frota = S.frota.filter(f => f !== recurso);
  gravarAlteracao('exc', `Recurso retirado: ${recurso.reg} (${recurso.tipo})`, {
    kind: 'readicionarRecurso', recurso: { ...recurso }, av: S.av[recurso.reg] !== false, label: '↶ Reverter'
  });
  tela.removido(recurso.reg);
  redesenharPorNome('instrutores');
  showToast(`${recurso.reg} retirado da frota.`, 'ok');
});

// ——— Os horários de decolagem (o detalhe da categoria) ———

// Um resumo e o botão Editar. O editor trabalha num rascunho; só "Salvar" muda a lista, e os pedidos da categoria
// acompanham (o horário mais próximo da lista nova). Uma entrada no histórico desfaz a lista e os pedidos que mudaram.
// Abrir e fechar o editor mudam o cabeçalho da categoria ("edição aberta")
aoAcionar('editar-horarios', b => { abrirEditorDosHorarios(b.dataset.cat); tela.desenhar(); });
aoAcionar('rascunho-tirar', b => tirarDoRascunho(+b.dataset.min));
aoAcionar('rascunho-por', () => porNoRascunho());
aoAcionar('cancelar-horarios', () => fecharEditor());
aoAcionar('salvar-horarios', () => salvarHorarios());
function fecharEditor() {
  fecharEditorDosHorarios();
  tela.desenhar();
}

// Salvar os horários do editor: a lista nova da categoria, os pedidos dela ajustados e uma entrada no histórico que desfaz
// os dois. Sem mudança, só fecha. O rascunho parte da lista de quando o editor abriu: se a lista da categoria mudou
// depois (a data aberta foi lida de novo, com o cadastro que outra pessoa mudou, ou o histórico reverteu os horários),
// salvar apagaria essa mudança sem conflito. Nada é salvo, e o editor fecha com o aviso
const mesmaLista = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);
function salvarHorarios() {
  const rascunho = rascunhoDosHorarios();
  if (!rascunho) return;
  const { cat, lista, base } = rascunho;
  const anterior = [...((S.horarios && S.horarios[cat]) || [])];
  if (mesmaLista(anterior, lista)) { fecharEditor(); return; }
  if (!mesmaLista(anterior, base)) {
    fecharEditor();
    showToast(`Os horários ${doNomeDaCategoria(cat)} mudaram depois que o editor abriu: nada foi salvo. Confira a lista e edite de novo.`);
    return;
  }
  S.horarios = { ...S.horarios, [cat]: lista };
  const pedidos = [];
  S.stu.forEach(s => [s, ...(s.extra || [])].forEach(p => {
    if (categoriaDoTipo(p.eq) !== cat) return;
    const antes = { p1: p.p1, p2: p.p2, jan: p.jan };
    ajustarPreferencias(p, horariosDaMissao(S.horarios, p.mis, p.eq));
    if (p.p1 === antes.p1 && p.p2 === antes.p2 && p.jan === antes.jan) return;
    pedidos.push({ stuId: s.id, mid: p === s ? 0 : p.mid, p1: antes.p1, p2: antes.p2, ...(antes.jan === undefined ? {} : { jan: antes.jan }) });
  }));
  // O editor fecha antes da gravação, que redesenha a tela (o resumo novo no lugar do editor)
  fecharEditorDosHorarios();
  gravarAlteracao('mod', `Horários de decolagem ${doNomeDaCategoria(cat)}: ${descreverHorarios(lista)}`,
    { kind: 'restaurarHorarios', cat, lista: anterior, pedidos, label: '↶ Reverter' });
  desenhar();
  redesenharPorNome('pedidos-do-dia');
  document.querySelector(`#horarios [data-act="editar-horarios"][data-cat="${cat}"]`)?.focus();
}
// O modelo escolhido no editor troca a lista do rascunho; Enter no campo põe o horário; o horário digitado fica no
// rascunho; Esc, com o foco nos horários, descarta o rascunho e fecha só o editor (o Histórico aberto continua aberto)
document.addEventListener('change', e => {
  if (e.target.name === 'hr-modelo' && e.target.closest('#horarios')) escolherModelo(e.target.value);
});
document.addEventListener('input', e => {
  if (e.target instanceof Element && e.target.matches('#horarios .hr-novo')) digitouNoRascunho(e.target);
});
document.addEventListener('keydown', e => {
  if (!editorDosHorariosAberto() || !e.target.closest || !e.target.closest('#horarios')) return;
  if (e.key === 'Enter' && e.target.classList.contains('hr-novo')) { e.preventDefault(); porNoRascunho(); }
});
fecharNoEsc(() => (editorDosHorariosAberto() ? $('#horarios') : null), fecharEditor);

// "↶ Reverter" no histórico (js/eventos/historico.js): os tipos desta tela. A reversão chega validada (js/reversoes.js)
aoReverter('setAv', (rev, entry) => {
  S.av[rev.reg] = rev.val;
  const fora = rev.reg === GROUND_REG ? 'indisponível' : 'em manutenção';
  gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${nomeDoRecurso(rev.reg)} ${rev.val ? 'disponível' : fora}`, null, entry.id);
  desenhar();
});

aoReverter('setAtributo', (rev, entry) => {
  if (marcarAtributo(rev.reg, rev.atributo, rev.val)) {
    gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
    desenhar(); redesenharPorNome('instrutores', 'pedidos-do-dia');
  }
});

aoReverter('setExigencias', (rev, entry) => {
  if (!mudarExigencia(rev.reg, rev.h, rev.val)) return;
  gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
  desenhar(); redesenharPorNome('instrutores', 'pedidos-do-dia');
});

aoReverter('restaurarHorarios', (rev, entry) => {
  // Os horários de uma categoria voltam como estavam, e os pedidos que mudaram com eles também
  S.horarios = { ...S.horarios, [rev.cat]: [...rev.lista] };
  rev.pedidos.forEach(({ stuId, mid, p1, p2, jan }) => {
    const alvo = getMissionTarget(stuId, mid);
    if (!alvo) return;
    Object.assign(alvo, { p1, p2 });
    if (jan !== undefined) alvo.jan = jan;
  });
  gravarAlteracao('mod', `Revertido: ${entry.desc}`, null, entry.id);
  desenhar(); redesenharPorNome('pedidos-do-dia');
});

aoReverter('readicionarRecurso', (rev, entry) => {
  // Um recurso retirado volta para a frota, como estava (com a habilitação própria, em INVAs)
  S.frota.push({ ...rev.recurso });
  S.av[rev.recurso.reg] = rev.av !== false;
  gravarAlteracao('inc', `Revertido: ${rev.recurso.reg} de volta à frota`, null, entry.id);
  desenhar(); redesenharPorNome('instrutores');
});

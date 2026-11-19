// Recursos: a frota (acrescentar e retirar), a disponibilidade e as horas até a revisão de 50 horas, as janelas de
// operação, o hangar, os horários de decolagem e os filtros (a busca pela matrícula e as categorias)
import { gravarAlteracao, aindaNaoAbriu } from '../actions.js';
import { categoriaDoTipo } from '../categorias.js';
import { WIN, REVISAO_H } from '../config.js';
import { $, showToast, fecharNoEsc } from '../dom.js';
import { fmtH, lerHoras } from '../format.js';
import { novoRecurso, ATRIBUTOS_DO_RECURSO, atributoVale } from '../frota.js';
import { normalizarHangar, moverNoHangar } from '../hangar.js';
import { horariosDaMissao, ajustarPreferencias, descreverHorarios } from '../horarios.js';
import { S, isGestor } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rDem } from '../views/demanda.js';
import { filtrarRecursos, limparFiltrosDosRecursos, manterRecursoAVista, filtroDasCategorias } from '../views/filtros-dos-recursos.js';
import { NOMES_DAS_CATEGORIAS, abrirEditorDosHorarios, fecharEditorDosHorarios, tirarDoRascunho, porNoRascunho, escolherModelo, rascunhoDosHorarios, editorDosHorariosAberto } from '../views/horarios.js';
import { rRec, rHangar, alternarAtributos, aplicarFiltrosDosRecursos } from '../views/recursos.js';
import { rIns, rPainelDoInstrutor } from '../views/cadastros.js';
import { mostrarVista, vistaDa } from '../views/vistas.js';

// O campo do recurso com erro (aria-invalid); o motivo (#rec-erro) é a descrição dele: o leitor de tela diz os dois
const CAMPOS_DO_RECURSO = { reg: '#rec-reg', tipo: '#rec-tipo' };
const marcarCampoDoRecurso = campo => Object.entries(CAMPOS_DO_RECURSO).forEach(([nome, id]) => {
  if (nome === campo) $(id).setAttribute('aria-invalid', 'true');
  else $(id).removeAttribute('aria-invalid');
});

// Recursos: acrescentar um recurso à frota (matrícula, categoria e, no C152, "Só Parafuso"). "+ Novo recurso", na barra
// da aba, abre o Cadastro com o formulário em cima da frota (como "+ Novo instrutor"; o formulário que ficou aberto lá
// continua com o que foi digitado); no Cadastro, ele abre e fecha o formulário. Fechado por Cancelar ou depois de
// acrescentar, o foco volta ao botão
function mostrarFormDoRecurso(abrir) {
  $('#form-recurso').hidden = !abrir;
  $('#btn-novo-recurso').setAttribute('aria-expanded', String(abrir));
  $('#rec-erro').textContent = '';
  marcarCampoDoRecurso(null);
  if (!abrir) return;
  $('#form-recurso').reset();
  $('#rec-parafuso-rotulo').hidden = true;
  $('#rec-reg').focus();
}
$('#btn-novo-recurso').onclick = () => {
  const deOutraVista = vistaDa('rec') !== 'cadastro';
  mostrarVista('rec', 'cadastro');
  if (deOutraVista && !$('#form-recurso').hidden) $('#rec-reg').focus();
  else mostrarFormDoRecurso($('#form-recurso').hidden);
};
$('#rec-cancelar').onclick = () => {
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
  // O recurso novo aparece mesmo fora dos filtros (até eles mudarem)
  manterRecursoAVista(recurso.reg);
  gravarAlteracao('inc', `Recurso adicionado: ${recurso.reg} (${recurso.tipo}${recurso.soParafuso ? ', só Parafuso' : ''})`);
  rRec();
  mostrarFormDoRecurso(false);
  $('#btn-novo-recurso').focus();
  showToast(`${recurso.reg} adicionado à frota.`, 'ok');
};

// Os atributos de um recurso (Só Parafuso, Só VFR e Habilitação própria): o botão abre as caixas no próprio recurso, e
// cada mudança vale para todas as datas (a escala é refeita) e entra no histórico, que desfaz
aoAcionar('atributos-recurso', b => alternarAtributos(b.dataset.id));
function marcarAtributo(reg, atributo, val) {
  const recurso = (S.frota || []).find(f => f.reg === reg);
  if (!recurso || !atributoVale(atributo, recurso.tipo)) return false;
  if (val) recurso[atributo] = true;
  else delete recurso[atributo];
  return true;
}
aoMudarCampo('atributo', t => {
  const { r: reg, atributo } = t.dataset;
  if (!marcarAtributo(reg, atributo, t.checked)) return;
  gravarAlteracao('mod', `${reg}: ${ATRIBUTOS_DO_RECURSO[atributo].nome} ${t.checked ? 'marcado' : 'desmarcado'}`, {
    kind: 'setAtributo', reg, atributo, val: !t.checked, label: '↶ Reverter'
  });
  rRec(); rIns(); rPainelDoInstrutor(); rDem();
  document.querySelector(`[data-a="atributo"][data-r="${CSS.escape(reg)}"][data-atributo="${atributo}"]`)?.focus();
});

// Os filtros: a busca pela matrícula e as categorias, nas duas vistas. Na digitação, a contagem espera a pessoa parar.
// "Limpar filtros" aparece na tabela e na frota quando eles não deixam nenhum recurso; sem data-act, ele vale também para
// quem só consulta. O campo começa como o filtro, vazio (o navegador que devolve o texto de antes de recarregar a página
// não deixa o campo diferente do filtro)
const ESPERA_DA_DIGITACAO = 500;
$('#flt-rec-mat').value = '';
$('#flt-rec-mat').addEventListener('input', e => {
  filtrarRecursos({ matricula: e.target.value });
  aplicarFiltrosDosRecursos({ esperar: ESPERA_DA_DIGITACAO });
});
const categorias = filtroDasCategorias($('#flt-rec-cat'), marcadas => {
  filtrarRecursos({ categorias: marcadas });
  aplicarFiltrosDosRecursos();
});
document.addEventListener('click', e => {
  if (!e.target.closest('[data-limpar-recursos]')) return;
  limparFiltrosDosRecursos();
  $('#flt-rec-mat').value = '';
  categorias.limpar();
  aplicarFiltrosDosRecursos();
  $('#flt-rec-mat').focus();
});

aoMudarCampo('win', t => {
  const idx = +t.dataset.i;
  S.win[idx] = t.checked;
  gravarAlteracao(t.checked ? 'inc' : 'exc', `Janela ${WIN[idx]} ${t.checked ? 'ativa' : 'inativa'}`);
  rRec();
});

aoMudarCampo('av', t => {
  const reg = t.dataset.id;
  S.av[reg] = t.checked;
  gravarAlteracao(t.checked ? 'inc' : 'exc', `${reg}: ${t.checked ? 'Disponível' : 'Manutenção'}`, {
    kind: 'setAv', reg, val: !t.checked, label: '↶ Reverter'
  });
  rRec();
});

aoMudarCampo('horas', t => {
  // As horas disponíveis até a revisão de 50 horas; o dia guarda as horas desde a revisão (50 menos as
  // disponíveis). Vazio: sem controle para o avião
  const reg = t.dataset.horas;
  const disponiveis = t.value === '' ? null : lerHoras(t.value);
  if (disponiveis !== null && !(disponiveis >= 0 && disponiveis <= REVISAO_H)) {
    showToast(`As horas disponíveis vão de 0 a ${REVISAO_H}.`);
    rRec();
    return;
  }
  if (disponiveis === null) delete S.horas[reg];
  else S.horas[reg] = Math.round((REVISAO_H - disponiveis) * 10) / 10;
  gravarAlteracao('mod', `${reg}: ${disponiveis === null ? 'horas disponíveis não informadas' : `${fmtH(disponiveis)} disponíveis até a revisão de 50 horas`}`);
  rRec();
});

// Retirar um recurso da frota (pede confirmação; o histórico desfaz). Instrutores é refeito: a habilitação própria do
// recurso sai do painel "Editar habilitações" e do filtro das habilitações
aoAcionar('retirar-recurso', b => {
  if (!confirmado(b, 'Confirmar retirada')) return;
  const recurso = S.frota.find(f => f.reg === b.dataset.id);
  if (!recurso) return;
  S.frota = S.frota.filter(f => f !== recurso);
  gravarAlteracao('exc', `Recurso retirado: ${recurso.reg} (${recurso.tipo})`, {
    kind: 'readicionarRecurso', recurso: { ...recurso }, av: S.av[recurso.reg] !== false, label: '↶ Reverter'
  });
  rRec(); rIns();
  showToast(`${recurso.reg} retirado da frota.`, 'ok');
});

// Hangar: sobe, desce ou põe na frente um avião (na data aberta; a data seguinte começa com esta ordem)
aoAcionar(['hangar-subir', 'hangar-descer', 'hangar-frente'], b => {
  const a = b.dataset.act;
  const r = b.dataset.id;
  S.hangar = moverNoHangar(normalizarHangar(S.hangar, S.frota), r, a.slice('hangar-'.length));
  gravarAlteracao('mod', `Hangar: ${r} passou para ${S.hangar.indexOf(r) + 1}º`);
  rHangar();
});

// Revisão de 50 horas feita: as horas do avião desde a última revisão voltam a zero (pede confirmação)
aoAcionar('revisao', b => {
  if (isGestor() || !confirmado(b, 'Confirmar revisão')) return;
  S.horas[b.dataset.id] = 0;
  gravarAlteracao('mod', `${b.dataset.id}: revisão de 50 horas feita (${REVISAO_H} h disponíveis)`);
  rRec();
});

// Horários de decolagem (um resumo e o botão Editar). O editor trabalha num rascunho; só "Salvar" muda a lista, e os
// pedidos da categoria acompanham (o horário mais próximo da lista nova). Uma entrada no histórico desfaz a lista e os
// pedidos que mudaram
aoAcionar('editar-horarios', b => abrirEditorDosHorarios(b.dataset.cat));
aoAcionar('rascunho-tirar', b => tirarDoRascunho(+b.dataset.min));
aoAcionar('rascunho-por', () => porNoRascunho());
aoAcionar('cancelar-horarios', () => fecharEditorDosHorarios());
aoAcionar('salvar-horarios', () => salvarHorarios());

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
  if (mesmaLista(anterior, lista)) { fecharEditorDosHorarios(); return; }
  if (!mesmaLista(anterior, base)) {
    fecharEditorDosHorarios();
    showToast(`Os horários do ${NOMES_DAS_CATEGORIAS[cat]} mudaram depois que o editor abriu: nada foi salvo. Confira a lista e edite de novo.`);
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
  gravarAlteracao('mod', `Horários de decolagem do ${NOMES_DAS_CATEGORIAS[cat]}: ${descreverHorarios(lista)}`,
    { kind: 'restaurarHorarios', cat, lista: anterior, pedidos, label: '↶ Reverter' });
  rRec(); rDem();
  fecharEditorDosHorarios();
}
// O modelo escolhido no editor troca a lista do rascunho; Enter no campo põe o horário; Esc, com o foco nos horários,
// descarta o rascunho e fecha só o editor (o Histórico aberto continua aberto)
document.addEventListener('change', e => {
  if (e.target.name === 'hr-modelo' && e.target.closest('#horarios')) escolherModelo(e.target.value);
});
document.addEventListener('keydown', e => {
  if (!editorDosHorariosAberto() || !e.target.closest || !e.target.closest('#horarios')) return;
  if (e.key === 'Enter' && e.target.classList.contains('hr-novo')) { e.preventDefault(); porNoRascunho(); }
});
fecharNoEsc(() => (editorDosHorariosAberto() ? $('#horarios') : null), fecharEditorDosHorarios);

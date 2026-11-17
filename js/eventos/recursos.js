// Recursos: a frota (acrescentar e retirar), a disponibilidade e as horas até a revisão de 50 horas, as janelas de
// operação, o hangar e os horários de decolagem
import { gravarAlteracao } from '../actions.js';
import { opcoesDeCategoria, categoriaDoTipo } from '../categorias.js';
import { WIN, REVISAO_H } from '../config.js';
import { $, showToast } from '../dom.js';
import { fmtH, lerHoras } from '../format.js';
import { novoRecurso } from '../frota.js';
import { normalizarHangar, moverNoHangar } from '../hangar.js';
import { horariosDaMissao, ajustarPreferencias, descreverHorarios } from '../horarios.js';
import { S, isGestor } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo } from './registro.js';
import { rDem } from '../views/demanda.js';
import { NOMES_DAS_CATEGORIAS, abrirEditorDosHorarios, fecharEditorDosHorarios, tirarDoRascunho, porNoRascunho, escolherModelo, rascunhoDosHorarios, editorDosHorariosAberto } from '../views/horarios.js';
import { rRec, rRevisao, rHangar } from '../views/recursos.js';

// Recursos: acrescentar um recurso à frota (matrícula, categoria e, no C152, "Só Parafuso")
function mostrarFormDoRecurso(abrir) {
  $('#form-recurso').hidden = !abrir;
  $('#btn-novo-recurso').setAttribute('aria-expanded', String(abrir));
  $('#rec-erro').textContent = '';
  if (!abrir) return;
  $('#form-recurso').reset();
  $('#rec-parafuso-rotulo').hidden = true;
  $('#rec-reg').focus();
}
$('#btn-novo-recurso').onclick = () => mostrarFormDoRecurso($('#form-recurso').hidden);
$('#rec-cancelar').onclick = () => mostrarFormDoRecurso(false);
$('#rec-tipo').onchange = () => {
  $('#rec-parafuso-rotulo').hidden = $('#rec-tipo').value !== 'C152';
  if ($('#rec-tipo').value !== 'C152') $('#rec-parafuso').checked = false;
};
$('#form-recurso').onsubmit = e => {
  e.preventDefault();
  if (isGestor()) return;
  const { recurso, erro } = novoRecurso(S.frota, { reg: $('#rec-reg').value, tipo: $('#rec-tipo').value, soParafuso: $('#rec-parafuso').checked });
  if (erro) { $('#rec-erro').textContent = erro; return; }
  S.frota.push(recurso);
  S.av[recurso.reg] = true;
  gravarAlteracao('inc', `Recurso adicionado: ${recurso.reg} (${recurso.tipo}${recurso.soParafuso ? ', só Parafuso' : ''})`);
  rRec();
  mostrarFormDoRecurso(false);
  showToast(`${recurso.reg} adicionado à frota.`, 'ok');
};

// Categoria (sem a sala de Ground)
$('#flt-rec-cat').innerHTML = opcoesDeCategoria({ comGround: false });
$('#flt-rec-cat').onchange = () => rRevisao();

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

// Retirar um recurso da frota (pede confirmação; o histórico desfaz)
aoAcionar('retirar-recurso', b => {
  if (!confirmado(b, 'Confirmar retirada')) return;
  const recurso = S.frota.find(f => f.reg === b.dataset.id);
  if (!recurso) return;
  S.frota = S.frota.filter(f => f !== recurso);
  gravarAlteracao('exc', `Recurso retirado: ${recurso.reg} (${recurso.tipo})`, {
    kind: 'readicionarRecurso', recurso: { ...recurso }, av: S.av[recurso.reg] !== false, label: '↶ Reverter'
  });
  rRec();
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
// os dois. Sem mudança, só fecha
function salvarHorarios() {
  const rascunho = rascunhoDosHorarios();
  if (!rascunho) return;
  const { cat, lista } = rascunho;
  const anterior = [...((S.horarios && S.horarios[cat]) || [])];
  if (anterior.length === lista.length && anterior.every((m, i) => m === lista[i])) { fecharEditorDosHorarios(); return; }
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
// O modelo escolhido no editor troca a lista do rascunho; Enter no campo põe o horário; Esc descarta o rascunho
document.addEventListener('change', e => {
  if (e.target.name === 'hr-modelo' && e.target.closest('#horarios')) escolherModelo(e.target.value);
});
document.addEventListener('keydown', e => {
  if (!editorDosHorariosAberto() || !e.target.closest || !e.target.closest('#horarios')) return;
  if (e.key === 'Enter' && e.target.classList.contains('hr-novo')) { e.preventDefault(); porNoRascunho(); }
  else if (e.key === 'Escape') fecharEditorDosHorarios();
});

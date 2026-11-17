// Cursos, em Alunos › Cursos: o programa de cada curso, uma tabela por curso. O Administrador (neste navegador, o
// Operador) inclui, muda, reordena e tira missões; os outros perfis só consultam. Os campos mudam no lugar, para o foco
// do teclado continuar onde estava.
import { MIS, DURACAO_MAXIMA_H } from '../config.js';
import { CURSOS, normalizarCursos } from '../cursos.js';
import { ApiClient } from '../storage.js';
import { gerenciaContas } from '../perfis.js';
import { S, isGestor } from '../state.js';
import { esc, opts } from '../format.js';
import { $ } from '../dom.js';

// Depois de um conflito a tela fica só para consulta, também para o Administrador
export const podeEditarCursos = () => !ApiClient.readOnly && (ApiClient.perfil ? gerenciaContas(ApiClient.perfil) : !isGestor());

export function mostrarVistaDosAlunos(vista) {
  $('#s-alu').dataset.vista = vista;
  document.querySelectorAll('#s-alu [data-vista-alu]').forEach(b => b.classList.toggle('on', b.dataset.vistaAlu === vista));
  if (vista === 'cursos') rCursos();
}

const opcoesDoRecurso = m => opts(MIS[m.mis].eq.map(e => [e, e]), m.eq);

function linha(curso, m, i, total, edita) {
  const ground = Boolean(MIS[m.mis].isGround), d = edita ? '' : ' disabled';
  return `<tr data-curso="${curso}" data-i="${i}">
    <td class="n">${i + 1}</td>
    <td><input data-cf="id" class="codigo" value="${esc(m.id)}" maxlength="15" aria-label="Código da ${i + 1}ª missão do ${curso}"${d}></td>
    <td><input data-cf="nome" value="${esc(m.nome)}" maxlength="80" aria-label="Nome de ${esc(m.id)}"${d}></td>
    <td><select data-cf="mis" aria-label="Missão de ${esc(m.id)}"${d}>${opts(Object.keys(MIS).map(k => [k, k]), m.mis)}</select></td>
    <td><select data-cf="eq" aria-label="Recurso de ${esc(m.id)}"${ground || !edita ? ' disabled' : ''}>${opcoesDoRecurso(m)}</select></td>
    <td><input type="number" class="duracao" data-cf="nb" min="0.1" max="${DURACAO_MAXIMA_H}" step="0.1" inputmode="decimal" value="${esc(m.nb)}" aria-label="Horas de ${esc(m.id)}"${ground || !edita ? ' disabled' : ''}></td>
    <td class="acoes">${edita ? `<button type="button" class="x" data-act="curso-subir" aria-label="Subir ${esc(m.id)}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="x" data-act="curso-descer" aria-label="Descer ${esc(m.id)}"${i === total - 1 ? ' disabled' : ''}>↓</button><button type="button" class="x" data-act="curso-remover" aria-label="Tirar ${esc(m.id)} do programa">✕</button>` : ''}</td>
  </tr>`;
}

export function rCursos() {
  const lugar = $('#cursos');
  if (!lugar) return;
  const cursos = normalizarCursos(S.cursos), edita = podeEditarCursos();
  lugar.innerHTML = `<p class="h">O programa de cada curso, na ordem em que o aluno voa: o código da missão (PP-07), o nome, o tipo de missão da escala, o recurso e as horas. ${edita ? 'Só o Administrador muda.' : 'Só o Administrador muda; aqui é consulta.'}</p>`
    + CURSOS.map(([id, nome]) => `<div class="pn curso" data-curso="${id}">
    <h3>${id} <small>${nome} · ${cursos[id].length} ${cursos[id].length === 1 ? 'missão' : 'missões'}</small></h3>
    ${cursos[id].length
    ? `<div class="tw"><table class="cadastro programa"><thead><tr><th>#</th><th>Código</th><th>Nome</th><th>Missão</th><th>Recurso</th><th>Horas</th><th></th></tr></thead>
      <tbody>${cursos[id].map((m, i) => linha(id, m, i, cursos[id].length, edita)).join('')}</tbody></table></div>`
    : `<p class="h">Nenhuma missão no programa.${edita ? ' Use “+ Missão” para incluir a primeira.' : ''}</p>`}
    ${edita ? `<button type="button" class="btn sec" data-act="curso-nova" data-curso="${id}">+ Missão</button>` : ''}
  </div>`).join('');
}

// A linha depois de uma mudança, no lugar: o código (normalizado), o recurso e as horas da missão
export function atualizarLinhaDoPrograma(tr, m) {
  const ground = Boolean(MIS[m.mis].isGround);
  tr.querySelector('[data-cf="id"]').value = m.id;
  tr.querySelector('[data-cf="nome"]').value = m.nome;
  const eq = tr.querySelector('[data-cf="eq"]'), nb = tr.querySelector('[data-cf="nb"]');
  eq.innerHTML = opcoesDoRecurso(m);
  nb.value = m.nb;
  eq.disabled = nb.disabled = ground;
  [['nome', 'Nome de'], ['mis', 'Missão de'], ['eq', 'Recurso de'], ['nb', 'Horas de']].forEach(([cf, rotulo]) => tr.querySelector(`[data-cf="${cf}"]`).setAttribute('aria-label', `${rotulo} ${m.id}`));
  [['curso-subir', 'Subir'], ['curso-descer', 'Descer'], ['curso-remover', 'Tirar']].forEach(([act, rotulo]) => {
    const b = tr.querySelector(`[data-act="${act}"]`);
    if (b) b.setAttribute('aria-label', act === 'curso-remover' ? `Tirar ${m.id} do programa` : `${rotulo} ${m.id}`);
  });
}

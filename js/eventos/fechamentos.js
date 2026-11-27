// Os eventos de "Horários fechados nesta data" (J; B os trouxe para a Escala; a tela em js/views/fechamentos.js): abrir e
// fechar o formulário, os campos dele, "Fechar", o ✕ de um intervalo e o ↶ do Histórico (setFechamentos). Cada mudança é
// uma entrada do Histórico e, na escala não aprovada, pergunta antes (#dlg-refazer, F1g: a escala inteira é refeita);
// "Cancelar" não muda nada. O ↶ do Histórico não pergunta (d47). A primeira mudança de uma data sem fechamentos parte dos
// das nove janelas de antes (fechamentosDoWin), que ficam na lista: a data não perde o que já estava fechado. Importado
// por js/eventos/escala.js (js/main.js é congelado)
import { gravarAlteracao } from '../actions.js';
import { S } from '../state.js';
import { $, fecharNoEsc } from '../dom.js';
import { fechamentosDoEstado, normalizarFechamentos, rotuloDosFechamentos } from '../fechamentos.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { rFechamentos, desenharFechamentos, mostrarFechamentos, atualizarFormularioDosFechamentos, abrirFormulario, fecharFormulario, mudarFormulario, formularioAberto, formularioDosFechamentos, podeFechar } from '../views/fechamentos.js';
import { perguntarAntesDeRefazer } from '../views/dialogo-refazer.js';
import { registrarTela } from '../views/telas.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';

// O desenho do bloco (js/redesenho.js): a data que abre (o bloco aberto quando ela tem algum fechado), quem só consulta e a
// releitura
registrarDesenho('fechamentos', desenharFechamentos, { em: ['dados', 'consulta', 'releitura', 'perfil'], ordem: 79, comMomento: true });
// O endereço #/esc/fechamentos (o aviso do trilho): a Escala com o bloco aberto e o foco no resumo dele
registrarTela('esc', { aoMostrar: item => (item === 'fechamentos' ? mostrarFechamentos() : null) });

// O texto do Histórico: "Horários fechados nesta data: 12:40–17:30 (todos os recursos)"
const paraOHistorico = lista => (lista.length ? rotuloDosFechamentos(lista).map(r => r.replace(' · ', ' (') + ')').join('; ') : 'nenhum');

function gravar(nova) {
  const antes = Array.isArray(S.fechamentos) ? normalizarFechamentos(S.fechamentos) : null;
  S.fechamentos = normalizarFechamentos(nova);
  gravarAlteracao('exc', `Horários fechados nesta data: ${paraOHistorico(S.fechamentos)}`, { kind: 'setFechamentos', antes, label: '↶ Reverter' });
  rFechamentos();
  redesenharPorNome('recursos');
}

// Na escala aprovada, grava (o motor roda em volta dos voos fixos, como em toda mudança que não é a de um voo); na não
// aprovada, pergunta antes, com o que muda ("fecha 12:40–17:30 · todos os recursos"). Cancelar redesenha o que estava, com
// o foco de volta no controle que pediu (focar)
function gravarComPergunta(resumo, nova, focar) {
  const fazer = () => { gravar(nova); focar(true); };
  if (S.aprovacao) { fazer(); return; }
  perguntarAntesDeRefazer({ resumo, aoConfirmar: fazer, aoDesistir: () => { rFechamentos(); focar(false); } });
}

function focarNoBotao() {
  const botao = $('#fechamentos [data-act="fechar-horarios"]');
  if (botao) botao.focus();
}

function fechar({ focar = true } = {}) {
  fecharFormulario();
  rFechamentos();
  if (focar) focarNoBotao();
}

aoAcionar('fechar-horarios', () => {
  if (formularioAberto()) { fechar(); return; }
  abrirFormulario();
  rFechamentos();
  const de = $('#fch-de');
  if (de) de.focus();
});
aoAcionar('fch-cancelar', () => fechar());
aoAcionar('fch-dia-todo', () => {
  mudarFormulario({ de: 6 * 60, ate: 24 * 60 });
  atualizarFormularioDosFechamentos();
});
aoAcionar('fch-fechar', () => {
  const f = formularioDosFechamentos();
  if (!f || !podeFechar(f)) return;
  const novo = { de: f.de, ate: f.ate, ...(f.categorias.length ? { categorias: f.categorias } : {}) };
  gravarComPergunta(`fecha ${rotuloDosFechamentos([novo])[0]}`, [...fechamentosDoEstado(S), novo], gravou => {
    // Gravado, o formulário fecha e o foco volta a "+ Fechar horários"; desistido, ele continua, com o foco em "Fechar"
    if (gravou) { fecharFormulario(); rFechamentos(); focarNoBotao(); return; }
    const fechar = $('#fechamentos [data-act="fch-fechar"]');
    if (fechar) fechar.focus();
  });
});
aoAcionar('tirar-fechamento', b => {
  const lista = fechamentosDoEstado(S);
  const i = +b.dataset.i;
  if (!Number.isInteger(i) || !lista[i]) return;
  gravarComPergunta(`abre de novo ${rotuloDosFechamentos([lista[i]])[0]}`, lista.filter((_, k) => k !== i), gravou => {
    if (gravou) { focarNoBotao(); return; }
    const x = $(`#fechamentos [data-act="tirar-fechamento"][data-i="${i}"]`);
    if (x) x.focus();
  });
});

// Os campos do formulário mudam só o rascunho (nada é gravado antes de "Fechar"); a linha do efeito e o "Fechar" mudam
// nos mesmos elementos, e o foco fica onde está
aoMudarCampo('fch-de', t => { mudarFormulario({ de: +t.value }); atualizarFormularioDosFechamentos(); });
aoMudarCampo('fch-ate', t => { mudarFormulario({ ate: +t.value }); atualizarFormularioDosFechamentos(); });
aoMudarCampo('fch-cat', t => {
  const f = formularioDosFechamentos();
  if (!f) return;
  const categorias = t.checked ? [...new Set([...f.categorias, t.dataset.cat])] : f.categorias.filter(c => c !== t.dataset.cat);
  mudarFormulario({ categorias });
  atualizarFormularioDosFechamentos();
});

// Esc no formulário: como "Cancelar"
fecharNoEsc(() => (formularioAberto() ? $('#fechamentos') : null), () => fechar());

aoReverter('setFechamentos', (rev, entry) => {
  if (rev.antes === null) delete S.fechamentos;
  else S.fechamentos = rev.antes;
  const agora = fechamentosDoEstado(S);
  gravarAlteracao('inc', `Revertido: horários fechados nesta data: ${paraOHistorico(agora)}`, null, entry.id);
  rFechamentos();
  redesenharPorNome('recursos');
});

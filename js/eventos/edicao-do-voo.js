// O editor do voo (dialog#dlg-voo, js/views/edicao-do-voo.js): abre pela barra do mapa e pelo "Editar" da Lista; cada
// campo refaz as opções e os avisos; "Salvar" grava a alteração numa entrada do histórico (desfazerEdicao). Na escala
// aprovada, sem o motor: só aquele voo muda (gravarNaEscala), e os avisos pedem "Salvar mesmo assim". Fora dela, a pergunta
// (#dlg-refazer, com os avisos nela) vem antes de mudar qualquer coisa, e "Salvar e refazer" roda o motor. "Tirar", "+ Aluno
// na turma" e "Sugestões" fecham o editor e seguem pelos caminhos deles (o "✕", o agendamento e a gaveta)
import { aindaNaoAbriu, fotoDaEscalaTravada, gravarNaEscala } from '../actions.js';
import { MIS } from '../config.js';
import { $, showToast } from '../dom.js';
import { fixarNoLugar } from '../fixos.js';
import { paraMinuto } from '../horarios.js';
import { duracaoDigitada, duracaoFixaDaMissao, isGroundMission } from '../rules.js';
import { S, RES, isGestor, estadoDaEscala, programaLido } from '../state.js';
import { STATUS_COM_DETALHE, detalheAoMudarStatus } from '../status.js';
import { vooParaEditar, aplicarEdicao, mudancasDoVoo, resumoDaEdicao, missaoParaOAluno, missoesDoVoo, opcoesDoVoo } from '../edicao-do-voo.js';
import { redesenharPorNome } from '../redesenho.js';
import { abrirEditorDoVoo, fecharEditorDoVoo, desenharEditor, vooDoEditor, editorDoVooAberto, assinaturaDosAvisosDoVoo } from '../views/edicao-do-voo.js';
import { perguntarAntesDeRefazer } from '../views/dialogo-refazer.js';
import { pedirDetalheDoStatus } from '../views/dialogo-status.js';
import { focarNoVoo } from '../views/reparo.js';
import { aoAcionar } from './registro.js';

// "Editar" na linha da Lista
aoAcionar('editar-voo', b => abrirEditorDoVoo(b.dataset.fkey, { origem: b }));

const dlg = $('#dlg-voo');
const ambiente = () => ({ programa: programaLido(), resultados: S.resultados || { doDia: [] } });

// O campo mudou: os valores, depois as opções e os avisos de novo, com o foco no mesmo campo
function redesenharNoCampo(id) {
  desenharEditor();
  const campo = id && document.getElementById(id);
  if (campo && !campo.disabled) campo.focus();
}

function mudarStatus(alvo) {
  const aberto = vooDoEditor();
  const fKey = alvo.dataset.vooStatus;
  const o = aberto.voo.unidade.find(v => v.fKey === fKey);
  const status = alvo.value;
  if (STATUS_COM_DETALHE.includes(status)) {
    // Atrasado e Cancelado pedem o detalhe antes; desistir deixa o status de antes
    pedirDetalheDoStatus({
      voo: o, status, detalhe: aberto.valores.detalhe[fKey],
      aoConfirmar: detalhe => { aberto.valores.status[fKey] = status; aberto.valores.detalhe[fKey] = detalhe; redesenharNoCampo(alvo.id); },
      aoDesistir: () => redesenharNoCampo(alvo.id)
    });
    return;
  }
  aberto.valores.status[fKey] = status;
  aberto.valores.detalhe[fKey] = detalheAoMudarStatus(aberto.valores.detalhe[fKey], status);
  redesenharNoCampo(alvo.id);
}

dlg.addEventListener('change', e => {
  const aberto = vooDoEditor();
  if (!aberto || isGestor()) return;
  const t = e.target, { valores, voo } = aberto;
  const estado = estadoDaEscala();
  if (t.dataset.vooStatus) { mudarStatus(t); return; }
  if (t.id === 'voo-aluno') {
    valores.stuId = +t.value;
    // A missão do curso que o aluno novo não tem fica para escolher; sem curso, o tipo, sem a etapa
    valores.missao = valores.missao && missaoParaOAluno(estado, voo, valores.stuId, valores.missao, programaLido());
  } else if (t.id === 'voo-missao') {
    const opcao = missoesDoVoo(estado, voo, valores.stuId, programaLido()).grupos.flatMap(g => g.opcoes).find(o => o.valor === t.value);
    if (opcao) {
      valores.missao = { ...opcao.missao };
      // As horas seguem a missão (e continuam editáveis); o recurso, quando o tipo dele não serve à missão
      valores.minutos = Math.round((duracaoFixaDaMissao(opcao.missao.mis) || opcao.missao.nb) * 60);
      if (!isGroundMission(opcao.missao.mis)) {
        const tipo = ((Array.isArray(S.frota) ? S.frota : []).find(f => f.reg === valores.r) || {}).tipo;
        if (!MIS[opcao.missao.mis].eq.includes(tipo)) {
          const recursos = opcoesDoVoo(estado, RES, voo, valores, ambiente()).recursos;
          const doTipo = recursos.find(o => o.tipo === opcao.missao.eq) || recursos[0];
          if (doTipo) valores.r = doTipo.valor;
        }
      }
    }
  } else if (t.id === 'voo-recurso') {
    valores.r = t.value;
  } else if (t.id === 'voo-horario') {
    aberto.outroHorario = t.value === 'outro';
    if (!aberto.outroHorario) valores.a = +t.value;
  } else if (t.id === 'voo-outro-horario') {
    const m = paraMinuto(t.value);
    if (m !== null) valores.a = m;
  } else if (t.id === 'voo-duracao') {
    const h = duracaoDigitada(t.value);
    if (h === null) { $('#voo-erro').textContent = 'A duração vai de 0,1 h a 5 h.'; return; }
    valores.minutos = Math.round(h * 60);
  } else if (t.id === 'voo-instrutor') {
    valores.insId = +t.value;
  } else return;
  $('#voo-erro').textContent = '';
  redesenharNoCampo(t.id);
});

// O detalhe do status (o motivo, a nova decolagem): um clique o muda
dlg.addEventListener('click', e => {
  const aberto = vooDoEditor();
  const b = e.target.closest('[data-voo-detalhe]');
  if (!aberto || !b || isGestor()) return;
  const fKey = b.dataset.vooDetalhe, o = aberto.voo.unidade.find(v => v.fKey === fKey), status = aberto.valores.status[fKey];
  pedirDetalheDoStatus({
    voo: o, status, detalhe: aberto.valores.detalhe[fKey],
    aoConfirmar: detalhe => { aberto.valores.detalhe[fKey] = detalhe; desenharEditor(); }
  });
});

// "Tirar", "+ Aluno na turma", "Sugestões" e o link do cadastro: o editor fecha antes (ouvido na captura), sem gravar nada,
// e o clique segue para o caminho deles
document.addEventListener('click', e => {
  if (!editorDoVooAberto() || !e.target.closest) return;
  const saida = e.target.closest('#dlg-voo [data-act], #dlg-voo [data-reparo], #dlg-voo [data-voo-cadastro]');
  if (saida) fecharEditorDoVoo({ devolverFoco: false });
}, true);

$('#voo-cancelar').addEventListener('click', () => fecharEditorDoVoo());
// O Esc (o cancel do <dialog>): fecha sem gravar, com o foco de volta na barra ou no botão
dlg.addEventListener('cancel', e => { e.preventDefault(); fecharEditorDoVoo(); });

// Grava a alteração: na escala aprovada, sem o motor (o voo fica fixo onde está antes, e a reversão o devolve); fora dela,
// com ele. Uma entrada do histórico, com a reversão
function gravar(chave, valores) {
  const foto = fotoDaEscalaTravada();
  const antes = vooParaEditar(S, RES, chave, ambiente());
  if (!antes) return;
  if (foto) S.fixos = fixarNoLugar(S.fixos, RES, antes.unidade.map(o => o.fKey));
  const voo = vooParaEditar(S, RES, chave, ambiente());
  const resumo = resumoDaEdicao(S, voo, valores);
  const feito = aplicarEdicao(S, RES, voo, valores, { aprovada: Boolean(foto) });
  if (!feito) return;
  if (!gravarNaEscala(foto, 'mod', `Voo editado: ${resumo}`, { ...feito.rev, label: '↶ Reverter' })) return;
  redesenharPorNome('pedidos-do-dia');
  focarNoVoo(feito.chaves[0]);
  showToast(foto ? 'Voo salvo: só ele mudou (a escala está aprovada).' : 'Voo salvo: a escala foi refeita.', 'ok');
}

$('#form-voo').addEventListener('submit', e => {
  e.preventDefault();
  const aberto = vooDoEditor();
  if (!aberto || isGestor()) return;
  const { voo, valores } = aberto;
  if (!mudancasDoVoo(voo, valores).alguma) { fecharEditorDoVoo(); return; }
  if (!valores.missao) {
    $('#voo-erro').textContent = 'Escolha a missão do aluno.';
    $('#voo-missao').focus();
    return;
  }
  if (aindaNaoAbriu()) return;
  const avisos = aberto.avisos || [];
  const chave = voo.chave, escolhidos = structuredClone(valores);
  if (S.aprovacao) {
    // Os avisos pedem a confirmação: o primeiro clique arma "Salvar mesmo assim"
    if (avisos.length && aberto.armado === null) {
      aberto.armado = assinaturaDosAvisosDoVoo(avisos);
      desenharEditor();
      $('#voo-erro').textContent = `${avisos.length === 1 ? 'Confira o aviso acima' : `Confira os ${avisos.length} avisos acima`}; para salvar assim mesmo, clique em “Salvar mesmo assim”.`;
      return;
    }
    fecharEditorDoVoo({ devolverFoco: false });
    gravar(chave, escolhidos);
    return;
  }
  // Fora da escala aprovada: a pergunta, com os avisos nela; desistir volta para o editor, como estava
  const resumo = resumoDaEdicao(estadoDaEscala(), voo, valores);
  dlg.close();
  perguntarAntesDeRefazer({
    resumo, avisos,
    aoConfirmar: () => { fecharEditorDoVoo({ devolverFoco: false }); gravar(chave, escolhidos); },
    aoDesistir: () => { if (!dlg.open) dlg.showModal(); $('#voo-salvar').focus(); }
  });
});

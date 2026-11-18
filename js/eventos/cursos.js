// O programa dos cursos, na aba Cursos: só o Administrador (neste navegador, o Operador) muda, com o programa lido das
// tabelas dos cursos. Cada alteração é uma operação de js/programa.js sobre o curso da tela, conferida antes como o
// servidor confere (com um problema, o campo volta e o aviso diz qual). O curso muda na tela na hora e vai para a
// gravação do curso inteiro (ApiClient.salvarCurso), em fila: uma gravação de cada vez, na ordem das alterações, cada uma
// com o curso como ficou naquela alteração e a versão confirmada pela gravação anterior. Uma recusa (ou a falta de
// conexão) descarta o resto da fila do curso, e a tela volta a mostrar o programa gravado, lido de novo, com o aviso do
// motivo; nada disso trava o resto da tela (outra pessoa que mudou o programa não é um conflito da escala). As alterações
// do programa não entram no histórico da data: ficam nas versões do curso
import { conteudoDoCurso, incluirMissao, mudarMissao, moverMissao, retirarMissao, validarCurso, percursoDoCurso, rotuloDaFase } from '../programa.js';
import { codigoValido } from '../cursos.js';
import { ApiClient } from '../storage.js';
import { $, showToast } from '../dom.js';
import { duracaoDigitada, ERRO_DA_DURACAO } from '../rules.js';
import { S } from '../state.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import { rCursos, podeEditarCursos, programasIndisponiveis, atualizarLinhaDoPrograma, codigoTravado } from '../views/cursos.js';
import { rAlu } from '../views/cadastros.js';
import { rDem } from '../views/demanda.js';

// As últimas alterações de cada curso, como o servidor as devolve
const ALTERACOES_NA_TELA = 20;

// As gravações esperando, por curso (a sigla): a versão confirmada pela última gravação, o curso que ela gravou, o curso
// como a tela o mostra (com todas as alterações da fila) e a fila. O curso sai daqui quando a fila esvazia
const filas = new Map();
// O último curso confirmado por uma gravação desta tela, por sigla: uma leitura que saiu antes da gravação e chegou depois
// (a da data trocada) não faz a alteração seguinte partir do programa de antes
const confirmados = new Map();

// Alguma alteração do programa esperando ou sendo gravada: fechar ou recarregar a página agora a perderia (js/main.js pede
// confirmação, como com as alterações da escala esperando a conexão)
export const programaSendoGravado = () => filas.size > 0;

const naTela = sigla => (S.programa || []).find(c => c.sigla === sigla) || null;
const porNaTela = curso => { S.programa = (S.programa || []).map(c => (c.sigla === curso.sigla ? curso : c)); };

// O curso de onde a alteração parte: com gravações esperando, o da fila (com todas elas); senão, o da tela, a não ser
// que ele seja mais antigo que o confirmado aqui
function cursoAtual(sigla) {
  if (filas.has(sigla)) return filas.get(sigla).curso;
  const lido = naTela(sigla), gravado = confirmados.get(sigla);
  return lido && gravado && gravado.versao > lido.versao ? gravado : lido;
}

// O texto de um aviso: com a primeira letra maiúscula e o ponto final
const frase = texto => {
  const t = String(texto || '').trim();
  return t && `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
};

// O curso como fica, conferido como o servidor confere: com um problema, nada muda e o aviso diz qual
function conferido(novo) {
  const erro = validarCurso(conteudoDoCurso(novo));
  if (erro) showToast(frase(erro.message));
  return !erro;
}

// O aviso de uma gravação do programa que não deu certo, pelo código da recusa (e pelo campo dela)
function avisoDaRecusa(erro, sigla) {
  const { code, campo, message } = erro || {};
  if (code === 'PT409') {
    return campo === 'formato'
      ? 'Os programas ainda estão sendo trazidos do cadastro. Recarregue a página.'
      : `Outra pessoa mudou o programa do ${sigla}: a tela mostra a versão atual. Refaça a alteração.`;
  }
  // Depois de um conflito, a tela fica só para consulta: nada mais é gravado, nem o programa
  if (code === '42501') return ApiClient.readOnly ? 'A tela está só para consulta: a alteração do programa não foi gravada.' : 'Só o Administrador muda os cursos.';
  if (code === '23514' && campo === 'codigo') {
    const travado = /missão (\S+) já tem resultados/.exec(message || '');
    return `Já há resultados com ${travado ? `o código ${travado[1]}` : 'este código'}: ele não muda (o nome muda).`;
  }
  if (['22023', '23505', '23514', 'P0002'].includes(code) && message) return frase(message);
  return 'Sem conexão: a alteração do programa não foi gravada.';
}

// Uma gravação que não deu certo: o resto da fila do curso já saiu, e a tela volta a mostrar o programa gravado, lido de
// novo (o curso com gravações esperando continua como a tela o mostra); sem conexão, o último curso confirmado. O aviso
// diz o motivo
async function mostrarOGravado(sigla, gravado, erro) {
  let programa = null;
  try {
    programa = await ApiClient.lerProgramas();
  } catch {
    // Sem conexão: fica o último curso confirmado
  }
  if (programa) S.programa = programa.map(c => (filas.has(c.sigla) ? filas.get(c.sigla).curso : c));
  else porNaTela(gravado);
  rCursos(); rAlu(); rDem();
  showToast(avisoDaRecusa(erro, sigla));
}

// As gravações do curso, uma de cada vez, na ordem das alterações: cada uma com o curso como ficou naquela alteração e a
// versão confirmada pela anterior. A gravação confirmada vira a versão nova do curso, com a alteração na lista dele
async function enviar(sigla, fila) {
  fila.enviando = true;
  while (fila.itens.length) {
    const item = fila.itens[0];
    let resposta;
    try {
      resposta = await ApiClient.salvarCurso(sigla, fila.versao, item.conteudo, item.descricao);
      if (!resposta || !Number.isInteger(resposta.versao)) throw new Error('a gravação do curso voltou sem a versão nova');
    } catch (erro) {
      filas.delete(sigla);
      await mostrarOGravado(sigla, fila.gravado, erro);
      return;
    }
    fila.itens.shift();
    fila.versao = resposta.versao;
    const alteracao = { versao: resposta.versao, descricao: item.descricao, registrado_em: resposta.atualizado_em ?? null, registrado_por: ApiClient.autorAtual || null };
    fila.gravado = { ...item.curso, versao: resposta.versao, alteracoes: [alteracao, ...(fila.gravado.alteracoes || [])].slice(0, ALTERACOES_NA_TELA) };
  }
  filas.delete(sigla);
  confirmados.set(sigla, fila.gravado);
  // A tela fica com a versão gravada (o conteúdo é o que ela já mostra). Se o programa foi lido de novo enquanto a fila
  // andava (a data trocada), ela volta a mostrar o que ficou gravado
  const mostrado = naTela(sigla);
  porNaTela(fila.gravado);
  if (mostrado !== fila.curso) {
    rCursos(); rAlu(); rDem();
  }
}

// Uma alteração conferida: o curso muda na tela (e com ele a próxima missão e o progresso dos alunos) e entra na fila de
// gravação. curso: o curso de onde ela partiu (cursoAtual)
function alterar(curso, novo, descricao) {
  const sigla = curso.sigla;
  if (!filas.has(sigla)) filas.set(sigla, { versao: curso.versao, gravado: curso, curso, itens: [], enviando: false });
  const fila = filas.get(sigla);
  fila.curso = novo;
  fila.itens.push({ curso: novo, conteudo: conteudoDoCurso(novo), descricao: `${sigla}: ${descricao}` });
  porNaTela(novo);
  rAlu(); rDem();
  if (!fila.enviando) enviar(sigla, fila);
}

// Quem muda o programa, com ele na tela (lido das tabelas dos cursos)
const editavel = () => podeEditarCursos() && !programasIndisponiveis().length;

// O curso de um botão ou de um campo (o do cartão, como está agora) e a missão da linha
function ondeNoPrograma(el) {
  const cartao = el.closest('.curso[data-curso]'), tr = el.closest('tr[data-missao]');
  const curso = cartao ? cursoAtual(cartao.dataset.curso) : null;
  const missao = curso && tr ? curso.missoes.find(m => m.id === tr.dataset.missao && !m.removida) || null : null;
  return { curso, missao, tr };
}

// A fase nos textos, só no curso com mais de uma ("na Fase 2"); no curso com uma fase só, ela não é dita
function naFase(curso, faseId) {
  const { fases } = percursoDoCurso(curso);
  const fase = fases.find(f => f.id === faseId);
  return fases.length > 1 && fase ? ` na ${rotuloDaFase(fase)}` : '';
}

// Incluir, subir, descer e tirar (com confirmação) refazem a aba, com o foco no que foi mexido
aoAcionar(['missao-nova', 'missao-subir', 'missao-descer', 'missao-retirar'], b => {
  if (!editavel()) return;
  const { curso, missao: m } = ondeNoPrograma(b);
  if (!curso) return;
  const a = b.dataset.act;
  if (a === 'missao-nova') {
    const r = incluirMissao(curso, b.dataset.fase || null);
    if (!r || !conferido(r.curso)) return;
    alterar(curso, r.curso, `${r.missao.codigo} incluída${naFase(r.curso, r.missao.fase)}`);
    rCursos();
    // O nome da missão nova em foco, selecionado: o que for digitado fica no lugar do código
    const nome = $(`#cursos tr[data-missao="${r.missao.id}"] [data-cf="nome"]`);
    if (nome) {
      nome.focus();
      nome.select();
    }
    return;
  }
  if (!m) return;
  if (a === 'missao-retirar') {
    if (!confirmado(b, 'Confirmar')) return;
    const novo = retirarMissao(curso, m.id);
    if (!novo || !conferido(novo)) return;
    alterar(curso, novo, `${m.codigo} tirada do programa`);
    rCursos();
    // O foco vai para a missão que ficou no lugar (ou para a anterior; na fase vazia, para o "+ Missão" dela)
    const antes = percursoDoCurso(curso).porFase.get(m.fase) || [], depois = percursoDoCurso(novo).porFase.get(m.fase) || [];
    const vizinha = depois[Math.min(antes.indexOf(m), depois.length - 1)];
    const alvo = vizinha ? $(`#cursos tr[data-missao="${vizinha.id}"] [data-cf="codigo"]`) : $(`#cursos [data-act="missao-nova"][data-fase="${m.fase}"]`);
    if (alvo) alvo.focus();
    return;
  }
  const novo = moverMissao(curso, m.id, a === 'missao-subir' ? -1 : 1);
  if (!novo || !conferido(novo)) return;
  const posicao = (percursoDoCurso(novo).porFase.get(m.fase) || []).findIndex(x => x.id === m.id);
  alterar(curso, novo, `${m.codigo} passou para ${posicao + 1}ª`);
  rCursos();
  const mesmo = $(`#cursos tr[data-missao="${m.id}"] [data-act="${a}"]`);
  (mesmo && !mesmo.disabled ? mesmo : $(`#cursos tr[data-missao="${m.id}"] [data-cf="codigo"]`)).focus();
});

// Os campos de uma missão mudam no lugar: o código (uma vez por curso, também entre as tiradas do programa, que guardam o
// seu; travado quando já há resultados), o nome, o tipo de missão, o recurso e as horas
document.addEventListener('change', e => {
  const campo = e.target.closest('#cursos [data-cf]');
  if (!campo || !editavel()) return;
  const { curso, missao: m, tr } = ondeNoPrograma(campo);
  if (!m) return;
  const cf = campo.dataset.cf;
  let valor = campo.value;
  if (cf === 'codigo') {
    valor = campo.value.trim().toUpperCase();
    const outra = curso.missoes.find(o => o.id !== m.id && o.codigo === valor);
    const erro = valor === m.codigo ? ''
      : codigoTravado(curso.sigla, m) ? `Já há resultados com o código ${m.codigo}: ele não muda (o nome muda).`
        : !codigoValido(valor) ? 'O código da missão usa letras, números, ponto e hífen (até 15).'
          : outra && outra.removida ? `O código ${valor} é de uma missão tirada do programa do ${curso.sigla} (ela guarda o código).`
            : outra ? `O código ${valor} já existe no ${curso.sigla}.` : '';
    if (erro) {
      showToast(erro);
      campo.value = m.codigo;
      return;
    }
  } else if (cf === 'nb') {
    // As horas: de 0,1 h a 5 h, em décimos; fora disso, não vale
    valor = duracaoDigitada(campo.value);
    if (valor === null) {
      showToast(ERRO_DA_DURACAO);
      campo.value = m.nb;
      return;
    }
  }
  const novo = mudarMissao(curso, m.id, cf, valor);
  // Nada mudou (o código em minúsculas, o nome com espaços a mais) ou a alteração não vale: a linha volta a mostrar a
  // missão como está
  if (!novo || !conferido(novo)) {
    atualizarLinhaDoPrograma(tr, curso.sigla, m);
    return;
  }
  const salva = novo.missoes.find(x => x.id === m.id);
  alterar(curso, novo, `${salva.codigo} alterada`);
  atualizarLinhaDoPrograma(tr, curso.sigla, salva);
});

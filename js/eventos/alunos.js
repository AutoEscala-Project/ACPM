// Alunos: a lista e o detalhe (o componente: js/views/mestre-detalhe.js, com os modelos de js/views/alunos.js), incluir,
// excluir, os campos do cadastro, "Priorizar com" e "Não escalar com". Os campos são gravados ao sair deles (change), pelo
// mesmo caminho de sempre (registro.js, gravarAlteracao); o valor recusado fica no campo, com a mensagem. Os resultados
// da missão do curso sem voo ("Registrar resultado sem voo", "Colocar no curso até…" e a reversão dela, no Histórico) vão
// para o servidor como o resultado da linha do voo (registrarResultadoNaTela), sem gravar o dia. "Apagar os dados
// pessoais" grava os campos vazios (js/views/editor-de-dados-pessoais.js)
import { gravarAlteracao, ultimaGravacao, logChange } from '../actions.js';
import { normalizarCursoDoAluno } from '../cursos.js';
import { anunciar, showToast } from '../dom.js';
import { nomeLimpo, numeroBr, hojeISO, dataIsoValida, hm } from '../format.js';
import { blank, pesoDoTexto, ERRO_DO_PESO } from '../rules.js';
import { S, RES, DATA, insBy, stuBy, isGestor, dadoIndisponivel } from '../state.js';
import { dataDoResultadoSemVoo, vooDaMissao, situacaoPorMissao, paraDesfazerColocacao } from '../resultados.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { registrarResultadoNaTela } from '../resultado-na-tela.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { semFalhar } from '../sem-falhar.js';
import { criarMestreDetalhe } from '../views/mestre-detalhe.js';
import { modeloDosAlunos, detalheDoAluno, escolhasDe, lembrarEscolha, esquecerEscolhas } from '../views/alunos.js';
import { missoesParaRegistrar, colocacaoDoAluno } from '../views/etapas.js';
import { aoMudarDadosPessoais } from '../views/dados-pessoais.js';
import { pessoaEscolhida, apagarDadosPessoais } from '../views/editor-de-dados-pessoais.js';
import { criarFiltroDosCursos } from '../views/filtro-dos-cursos.js';
import { registrarTela } from '../views/telas.js';

const tela = criarMestreDetalhe({
  id: 'alu',
  rotulo: 'Alunos',
  nomes: ['aluno', 'alunos'],
  semItens: 'Nenhum aluno cadastrado. Clique em “+ Novo aluno” acima para cadastrar.',
  // Nada escolhido: no meio do detalhe, a pessoa, o texto e, para quem cria, o caminho do aluno novo
  vazio: { texto: 'Escolha um aluno na lista.', icone: 'i-aluno', dica: 'ou use + Novo aluno' },
  // O filtro dos cursos (o mesmo da Demanda: as marcas valem nas duas telas)
  filtros: [{ criar: aoMudar => criarFiltroDosCursos('flt-alu-cur', aoMudar), valores: item => item.valores.curso }],
  modelo: () => modeloDosAlunos(tela.selecionado()),
  // O aluno escolhido: os dados pessoais dele são lidos (250 ms depois de a escolha parar nele)
  detalhe: id => {
    pessoaEscolhida('aluno', +id, opcoes => tela.desenhar(opcoes));
    return detalheDoAluno(id);
  },
  edita: () => !isGestor()
});

// O desenho de Alunos (js/redesenho.js): os dados de uma data, quem só consulta, a releitura e o perfil
registrarDesenho('alunos', tela.desenhar, { em: ['dados', 'consulta', 'releitura', 'perfil'], ordem: 30, comMomento: true });
// A escala refeita: "Nesta data" mostra os voos do aluno. A escala é refeita dentro do evento que mudou os dados (a
// gravação); o desenho espera o evento acabar (o aluno excluído ou incluído já tratado pela tela), numa microtarefa
let escalaPorDesenhar = false;
registrarDesenho('alunos-na-escala', () => {
  if (escalaPorDesenhar) return;
  escalaPorDesenhar = true;
  queueMicrotask(() => { escalaPorDesenhar = false; semFalhar(() => tela.desenhar()); });
}, { em: ['escala'], ordem: 31 });
// O endereço: #/alu/<id> escolhe o aluno (numa vista só, abre o detalhe)
registrarTela('alu', { aoMostrar: (item, opcoes) => tela.aoMostrar(item, opcoes) });
// O CANAC das linhas acompanha os dados pessoais
aoMudarDadosPessoais(() => tela.desenhar());

// O aluno novo: escolhido, com o nome selecionado, à vista mesmo fora da busca (até ela mudar)
aoAcionar('adds', () => {
  const novo = { id: S.nid++, nm: 'Novo aluno', kg: 0, bl: [], extra: [], ...blank() };
  S.stu.push(novo);
  if (!gravarAlteracao('inc', `Aluno cadastrado: ${novo.nm}`)) { S.stu = S.stu.filter(x => x !== novo); return; }
  tela.novo(novo.id, ultimaGravacao());
  redesenharPorNome('pedidos-do-dia');
  tela.focarNoCampo('nm', { selecionar: true });
});

// O ✕ de uma etiqueta: o foco vai para a lista do mesmo campo (o ✕ sumiu)
aoAcionar('unbl', (b, { id }) => {
  const s = stuBy(id);
  const blkIns = insBy(+b.dataset.b);
  s.bl = s.bl.filter(v => v !== +b.dataset.b);
  gravarAlteracao('mod', `${s.nm}: volta a ser escalado com ${blkIns ? blkIns.nm : ''}`);
  tela.desenhar();
  tela.focarNoCampo('bl');
  redesenharPorNome('pedidos-do-dia');
});

aoAcionar('unvc', (b, { id }) => {
  const s = stuBy(id);
  const ins = insBy(+b.dataset.b);
  s.voaCom = (s.voaCom || []).filter(v => v !== +b.dataset.b);
  if (!s.voaCom.length) delete s.voaCom;
  gravarAlteracao('mod', `${s.nm}: deixa de priorizar ${ins ? ins.nm : ''}`);
  tela.desenhar();
  tela.focarNoCampo('voaCom');
  redesenharPorNome('pedidos-do-dia');
});

// "Excluir aluno…", no rodapé do detalhe: dois cliques
aoAcionar('dels', (b, { id }) => {
  if (!confirmado(b, 'Confirmar exclusão')) return;
  const target = stuBy(id);
  S.stu = S.stu.filter(x => x.id !== id);
  gravarAlteracao('exc', `Aluno excluído: ${target ? target.nm : id}`);
  tela.removido(id);
  redesenharPorNome('instrutores', 'pedidos-do-dia');
});

// Os campos do cadastro de um aluno, no detalhe
aoMudarCampo('s', (t, { f, id }) => {
  const s = stuBy(id);
  if (!s) return;
  let historico;
  if (f === 'nm') {
    const old = s.nm;
    s.nm = nomeLimpo(t.value, s.nm);
    historico = ['mod', `Aluno: ${old} → ${s.nm}`];
  } else if (f === 'kg') {
    const kg = pesoDoTexto(t.value, t.validity.badInput);
    if (kg === null) { tela.erroNoCampo('kg', ERRO_DO_PESO); return; }
    s.kg = kg;
    historico = ['mod', `Peso ${s.nm}: ${numeroBr(s.kg)} kg`];
  } else if (f === 'bl' && t.value) {
    s.bl.push(+t.value);
    // Quem não voa com o aluno sai do “Priorizar com” dele
    if (s.voaCom) s.voaCom = s.voaCom.filter(v => v !== +t.value);
    if (s.voaCom && !s.voaCom.length) delete s.voaCom;
    const ins = insBy(+t.value);
    historico = ['exc', `${s.nm}: não escalar com ${ins ? ins.nm : ''}`];
  } else if (f === 'voaCom' && t.value) {
    s.voaCom = [...(s.voaCom || []), +t.value];
    const ins = insBy(+t.value);
    historico = ['mod', `${s.nm}: priorizar com ${ins ? ins.nm : ''}`];
  } else if (f === 'curso') {
    // O curso do aluno: qualquer sigla no formato (também a de um curso que o Administrador criou na aba Cursos)
    const curso = normalizarCursoDoAluno(t.value);
    if (curso) s.curso = curso;
    else delete s.curso;
    historico = ['mod', `Curso de ${s.nm}: ${curso || 'nenhum'}`];
  } else return;
  gravarAlteracao(...historico);
  tela.desenhar();
  // As listas de instrutores: o foco fica na lista que mudou (a opção escolhida saiu dela)
  if (f === 'bl' || f === 'voaCom') tela.focarNoCampo(f);
  // A Demanda mostra o nome do aluno, o “Priorizar com” dele (no Automático do instrutor) e as missões do curso dele
  if (['nm', 'voaCom', 'bl', 'curso'].includes(f)) redesenharPorNome('pedidos-do-dia');
});

// Os dois formulários dos resultados: o que foi escolhido fica com o aluno (os redesenhos não o perdem)
document.addEventListener('change', e => {
  const campo = e.target.closest && e.target.closest('[data-sv]');
  const det = campo && campo.closest('#det-alu .det[data-id]');
  if (!det) return;
  lembrarEscolha(det.dataset.id, campo.dataset.sv, campo.value);
  if (campo.dataset.sv === 'missao') { const erro = document.getElementById('det-alu-sv-erro'); if (erro) erro.textContent = ''; }
});

// O foco num controle do detalhe redesenhado (o botão acionado foi trocado)
const focar = idDoControle => { const el = document.getElementById(idDoControle); if (el) el.focus(); };

// A recusa do resultado sem voo: no campo da missão, dita ao leitor de tela, e fica com o aluno até outra escolha
function recusarSemVoo(id, texto) {
  lembrarEscolha(id, 'erro', texto);
  tela.desenhar({ forcar: true });
  const missao = document.getElementById('det-alu-sv-missao');
  if (missao) missao.focus();
  anunciar(texto);
}

// "Registrar resultado sem voo": a missão escolhida, o resultado e a data (até hoje). A missão com voo nesta data é
// registrada no voo ("Nesta data"); a fora da ordem pede o segundo clique. O histórico da data aberta diz "(sem voo)"
aoAcionar('resultado-sem-voo', async (b, { id }) => {
  const s = stuBy(id);
  const missoes = s && missoesParaRegistrar(s);
  if (!missoes || dadoIndisponivel('resultados')) return;
  const e = escolhasDe(id);
  const hoje = hojeISO();
  const data = e.data || dataDoResultadoSemVoo(DATA || hoje, hoje);
  const resultado = e.resultado || 'aprovado';
  const codigo = e.missao || '';
  if (!codigo) { recusarSemVoo(id, 'Escolha a missão.'); return; }
  const fora = missoes.foraDaOrdem.find(x => x.missao.codigo === codigo);
  if (!fora && ![...missoes.liberadas, ...missoes.comResultado].some(m => m.codigo === codigo)) { recusarSemVoo(id, `${codigo} não está mais no programa do ${missoes.curso.sigla}.`); return; }
  if (!dataIsoValida(data) || data > hoje) { recusarSemVoo(id, 'A data do resultado vai até hoje.'); return; }
  const voo = vooDaMissao(RES && RES.out, id, codigo);
  if (voo) { recusarSemVoo(id, `${codigo} tem voo nesta data, às ${hm(voo.a)} no ${voo.r}: registre no voo, acima.`); return; }
  // O botão armado para outra missão (a escolha mudou depois do primeiro clique) não confirma esta
  const armado = `Confirmar: ${codigo} fora da ordem`;
  if (b.dataset.arm && b.textContent !== armado) { showToast('A missão mudou depois do primeiro clique: confirme de novo.'); return; }
  if (fora && !confirmado(b, armado)) return;
  b.disabled = true;
  const registro = { aluno: id, curso: missoes.curso.sigla, missao: codigo, resultado, data, voo: null };
  const certo = await registrarResultadoNaTela(registro, { descricao: `Resultado de ${s.nm} em ${codigo}: ${resultado} (sem voo)`, dataDoHistorico: DATA });
  if (!certo) {
    b.disabled = false;
    showToast('Não foi possível registrar o resultado. Verifique a conexão e tente de novo.');
    return;
  }
  esquecerEscolhas(id);
  tela.desenhar({ forcar: true });
  redesenharPorNome('pedidos-do-dia', 'escala');
  focar('det-alu-sv-missao');
  const texto = `Resultado de ${s.nm} em ${codigo} registrado: ${resultado} (sem voo).`;
  showToast(texto, 'ok');
  anunciar(texto);
});

// Registra em sequência (uma recusa para: o que foi registrado fica, e a conta diz quanto). Responde quantos foram
const emSequencia = async registros => {
  let feitos = 0;
  for (const r of registros) {
    if (!await registrarResultadoNaTela(r)) break;
    feitos++;
  }
  return feitos;
};
const listaDeCodigos = codigos => (codigos.length > 2 ? `${codigos[0]} … ${codigos.at(-1)}` : codigos.join(' e '));

// "Colocar no curso até…": as missões antes da escolhida, na ordem do curso, que não estão aprovadas nem dispensadas,
// aprovadas sem voo depois do segundo clique (o botão armado diz quantas e quais). Uma entrada no histórico, com
// "↶ Reverter" (o resultado de antes de cada uma)
aoAcionar('colocar-no-curso', async (b, { id }) => {
  const s = stuBy(id);
  const alvo = escolhasDe(id).colocar || '';
  const colocacao = s && colocacaoDoAluno(s, alvo || null);
  if (!colocacao || dadoIndisponivel('resultados')) return;
  if (!colocacao.alvo) { showToast('Escolha a missão em que o aluno para.'); return; }
  const codigos = colocacao.aprovar.map(m => m.codigo);
  if (!codigos.length) { showToast(`Nenhuma missão antes de ${colocacao.alvo} falta aprovar para ${s.nm}.`, 'ok'); return; }
  // As que têm voo na data aberta: o botão armado avisa (o voo continua na escala; o resultado dele, registrado depois,
  // vale por cima da colocação)
  const comVoo = codigos.filter(c => vooDaMissao(RES && RES.out, id, c));
  const avisoDoVoo = comVoo.length ? `; ${listaDeCodigos(comVoo)} ${comVoo.length === 1 ? 'tem' : 'têm'} voo nesta data` : '';
  const armado = `Confirmar: aprovar ${codigos.length} ${codigos.length === 1 ? 'missão' : 'missões'} sem voo (${listaDeCodigos(codigos)})${avisoDoVoo}`;
  if (b.dataset.arm && b.textContent !== armado) { showToast('A missão mudou depois do primeiro clique: confirme de novo.'); return; }
  if (!confirmado(b, armado)) return;
  b.disabled = true;
  const hoje = hojeISO();
  const data = dataDoResultadoSemVoo(DATA || hoje, hoje);
  const feitos = await emSequencia(codigos.map(missao => ({ aluno: id, curso: colocacao.curso, missao, resultado: 'aprovado', data, voo: null })));
  if (feitos) {
    const missoes = colocacao.aprovar.slice(0, feitos).map(m => ({ missao: m.codigo, resultado: m.antes }));
    logChange('mod', `${s.nm} colocado no curso ${colocacao.curso} até ${colocacao.alvo}: ${feitos} ${feitos === 1 ? 'missão aprovada' : 'missões aprovadas'} sem voo (${listaDeCodigos(codigos.slice(0, feitos))})`,
      { kind: 'desfazerColocacao', aluno: id, curso: colocacao.curso, missoes, data, label: '↶ Reverter' });
  }
  esquecerEscolhas(id);
  tela.desenhar({ forcar: true });
  redesenharPorNome('pedidos-do-dia', 'escala');
  focar('det-alu-colocar');
  const doVoo = comVoo.length ? ` ${comVoo.length === 1 ? `O voo da ${comVoo[0]}` : `Os voos da ${listaDeCodigos(comVoo)}`} nesta data ${comVoo.length === 1 ? 'continua' : 'continuam'} na escala.` : '';
  const texto = feitos === codigos.length ? `${s.nm} colocado no curso até ${colocacao.alvo}: ${feitos} ${feitos === 1 ? 'missão aprovada' : 'missões aprovadas'} sem voo.${doVoo}`
    : `Não foi possível registrar tudo: ${feitos} de ${codigos.length} missões aprovadas. Verifique a conexão e tente de novo.`;
  showToast(texto, feitos === codigos.length ? 'ok' : undefined);
  anunciar(texto);
});

// "↶ Reverter" da colocação: cada missão ainda aprovada sem voo por ela volta ao resultado de antes (pendente,
// reprovado), registrado sem voo; a que ganhou outro resultado depois fica, e o aviso diz qual (paraDesfazerColocacao).
// A entrada vira "Revertido" só com tudo feito: a reversão que parou no meio (a conexão) fica com o ↶, e a nova
// tentativa devolve o que faltou. Com todas mudadas, nada a desfazer (o ↶ fica, como o de "Dar a vaga")
aoReverter('desfazerColocacao', async (rev, entrada) => {
  if (dadoIndisponivel('resultados')) { showToast('Os resultados dos cursos não foram lidos: tente de novo depois de “Tentar de novo”.'); return; }
  const { voltar, mudadas } = paraDesfazerColocacao(situacaoPorMissao((S.resultados || {}).situacao), rev);
  const ficaram = !mudadas.length ? ''
    : mudadas.length === 1 ? `${mudadas[0].missao} ficou com o resultado de agora (${mudadas[0].resultado}): ele mudou depois da colocação.`
      : `${listaDeCodigos(mudadas.map(m => m.missao))} ficaram com o resultado de agora: ${mudadas.length === 2 ? 'os dois mudaram' : 'mudaram'} depois da colocação.`;
  if (mudadas.length === rev.missoes.length) { showToast(`Nada a desfazer: ${ficaram}`); return; }
  const hoje = hojeISO();
  const data = dataDoResultadoSemVoo(DATA || hoje, hoje);
  const registros = voltar.map(m => ({ aluno: rev.aluno, curso: rev.curso, missao: m.missao, resultado: m.resultado, data, voo: null }));
  const feitos = await emSequencia(registros);
  if (feitos === registros.length) logChange('mod', `Revertido: ${entrada.desc}`, null, entrada.id);
  tela.desenhar({ forcar: true });
  redesenharPorNome('pedidos-do-dia', 'escala');
  if (feitos < registros.length) showToast(`Não foi possível desfazer tudo: ${feitos} de ${registros.length} missões voltaram. Verifique a conexão e tente de novo.`);
  else if (ficaram) showToast(ficaram);
});

// "Apagar os dados pessoais" (o rodapé do aluno inativo): dois cliques; o servidor tira a linha
aoAcionar('apagar-dados', async (b, { id }) => {
  const s = stuBy(id);
  if (!s || !confirmado(b, 'Confirmar: apagar os dados pessoais')) return;
  await apagarDadosPessoais('aluno', id, s.nm);
  // O botão sai com os dados: o foco perdido vai para o vizinho no rodapé, "Excluir aluno…"
  if (!document.activeElement || document.activeElement === document.body) focar('det-alu-excluir');
});

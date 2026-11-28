// Alunos como lista e detalhe (o componente: js/views/mestre-detalhe.js): os modelos que a tela dá a ele, lidos do estado.
// A linha: o nome, o CANAC (para quem vê os dados pessoais) e o curso, o progresso (com o progresso ligado) e o ponto de
// quem está sem peso; a busca acha o nome, e para quem vê os dados pessoais também o nome completo e o CANAC. O detalhe,
// nesta ordem: "Nesta data" (os voos do aluno na escala da data aberta, com o resultado da missão do curso), "Curso e
// missões" (o curso; com o progresso ligado, o progresso, a missão anterior e a atual, "Registrar resultado sem voo" e
// "Colocar no curso até…"), o cadastro (nome e peso), as limitações (L: "Só voa no", "Pode voar", "Priorizar com", "Não
// escalar com" e a linha do peso), os dados pessoais (para quem os vê: js/views/editor-de-dados-pessoais.js) e, no
// rodapé, "Excluir aluno…" e, do aluno inativo com dados pessoais,
// "Apagar os dados pessoais". Os campos têm os data-f de sempre: js/eventos/alunos.js grava; os dois formulários dos
// resultados guardam o que foi escolhido aqui (lembrarEscolha), para os redesenhos não o perderem
import { LIMITE_DO_NOME, numeroBr, esc, hm, hojeISO, rotuloDaData, opts } from '../format.js';
import { S, RES, DATA, insBy, stuBy, inativoNaDataAberta, isGestor, dadoIndisponivel } from '../state.js';
import { GROUND_REG } from '../config.js';
import { inativo } from '../inativos.js';
import { SEM_CURSO } from '../cursos.js';
import { statusDoVoo } from '../voo.js';
import { dataDoResultadoSemVoo } from '../resultados.js';
import { canacDe, nomeCompletoDe, dadosDe, podeVerDadosPessoais, podeEditarDadosPessoais } from './dados-pessoais.js';
import { progressoEmTexto, resultadoNaEscala, missoesDoAluno, missoesParaRegistrar, colocacaoDoAluno } from './etapas.js';
import { secaoDosDadosPessoais, marcaDaPessoa, recusasDe } from './editor-de-dados-pessoais.js';
import { cursosConhecidos } from './filtro-dos-cursos.js';
import { TIPOS_LIMITAVEIS, DIAS_DAS_LIMITACOES, MAXIMO_DE_HORARIOS, MINUTOS_DOS_HORARIOS, nomeDoDia, normalizarLimitacoes, textoDosHorarios, textoDasLimitacoes, tiposQueNaoCabem, linhaDoPeso } from '../limitacoes.js';

// O instrutor já escolhido que ficou inativo continua na etiqueta, com "(inativo)"; a lista oferece só os ativos
const nomeComInativo = x => (inativoNaDataAberta(x) ? `${x.nm} (inativo)` : x.nm);

// O curso do aluno: os cursos ativos (a aba Cursos), e o curso dele quando está encerrado ("(encerrado)") ou não existe
// ("(curso desconhecido)"). Sem os programas lidos, os três cursos com que o app começa (o servidor sempre os tem:
// nenhum curso é apagado) e o curso dele que não é um deles, só pela sigla (nada é dito sobre ele)
function opcoesDoCurso(s) {
  const { semProgramas, programa } = cursosConhecidos();
  const atual = s.curso ? programa.find(c => c.sigla === s.curso) : null;
  const doAluno = !s.curso || (atual && atual.ativo) ? []
    : [[s.curso, atual ? `${s.curso} · ${atual.nome} (encerrado)` : semProgramas ? s.curso : `${s.curso} (curso desconhecido)`]];
  return [['', '—'], ...programa.filter(c => c.ativo).map(c => [c.sigla, `${c.sigla} · ${c.nome}`]), ...doAluno];
}
// O nome do curso do aluno, para o subtítulo e para quem só consulta
function nomeDoCurso(s) {
  if (!s.curso) return '';
  const curso = cursosConhecidos().programa.find(c => c.sigla === s.curso);
  return curso ? `${s.curso} · ${curso.nome}` : s.curso;
}

// O ponto da linha: os dados pessoais não salvos (o rascunho, a recusa) e o peso que falta
function pontoDoAluno(s) {
  const marca = marcaDaPessoa('aluno', s.id);
  const semPeso = s.kg ? '' : 'sem peso';
  if (marca) return { ponto: marca.ponto, pontoRotulo: [marca.rotulo, semPeso].filter(Boolean).join('; ') };
  return { ponto: semPeso ? 'aviso' : '', pontoRotulo: semPeso };
}

// A linha de um aluno
function itemDoAluno(s) {
  const veDados = podeVerDadosPessoais();
  const canac = veDados ? canacDe('aluno', s.id) : '';
  const nomeCompleto = veDados ? nomeCompletoDe('aluno', s.id) : '';
  const progresso = progressoEmTexto(s);
  return {
    id: s.id,
    titulo: s.nm,
    linha2: [canac ? `CANAC ${canac}` : '', s.curso || 'sem curso'].filter(Boolean).join(' · '),
    meta: progresso ? progresso.contagem : '',
    linha3: progresso ? progresso.resto : '',
    ...pontoDoAluno(s),
    inativo: inativo(s),
    // O "Ativo" do cadastro (js/eventos/inativos.js): um clique em cada sentido
    chave: { marcado: !inativo(s), texto: 'Ativo', rotulo: `${s.nm} ativo no cadastro`, atributos: 'data-act="ativo" data-de="aluno"' },
    atributos: `data-k="s" data-id="${s.id}"`,
    busca: [s.nm, nomeCompleto, canac].filter(Boolean),
    valores: { curso: [s.curso || SEM_CURSO] }
  };
}

// O modelo da lista. O aviso: os dados pessoais de um aluno que o servidor recusou (o primeiro que não está aberto), com
// "Abrir"
export function modeloDosAlunos(escolhido = null) {
  const recusa = recusasDe('aluno').find(r => String(r.id) !== String(escolhido) && stuBy(+r.id));
  const aviso = recusa ? { texto: `Os dados pessoais de ${stuBy(+recusa.id).nm} não foram salvos: ${recusa.texto.replace(/\.$/, '')}.`, abrir: recusa.id } : null;
  return { fixos: [], grupos: [], itens: S.stu.map(itemDoAluno), estado: 'pronto', aviso };
}

// As etiquetas de um dos dois campos de instrutores ("Priorizar com", "Não escalar com") e a lista que acrescenta
function instrutoresDoAluno(s, { ids, rotuloDoX, classe, campo, vazio, fora }) {
  return {
    itens: ids.map(insBy).filter(Boolean).map(x => ({ texto: nomeComInativo(x), rotulo: rotuloDoX(x), atributos: `data-act="${campo === 'bl' ? 'unbl' : 'unvc'}" data-b="${x.id}"`, classe })),
    acrescentar: { atributos: `data-f="${campo}"`, vazio, rotulo: vazio.replace('…', ''), opcoes: S.ins.filter(x => !fora.includes(x.id) && !inativo(x)).map(x => [String(x.id), x.nm]) }
  };
}

// O que foi escolhido nos formulários dos resultados de cada aluno (a missão, o resultado, a data e a missão da
// colocação) e a recusa do resultado sem voo: os redesenhos da seção não os perdem
const ESCOLHAS = new Map();
export const escolhasDe = id => ESCOLHAS.get(+id) || {};
export function lembrarEscolha(id, campo, valor) {
  ESCOLHAS.set(+id, { ...escolhasDe(id), [campo]: valor, ...(campo === 'erro' ? {} : { erro: '' }) });
}
export const esquecerEscolhas = id => ESCOLHAS.delete(+id);

const RESULTADOS_SEM_VOO = [['aprovado', 'Aprovado'], ['reprovado', 'Reprovado'], ['pendente', 'Pendente (desfaz)']];
const dataBr = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const recursoDoVoo = r => (r === GROUND_REG ? 'Sala Ground' : r);
// A data aberta, curta, ao lado de "Nesta data": "sex 20/11"
function escopoDaData() {
  if (!DATA) return '';
  const { semana, data } = rotuloDaData(DATA, hojeISO());
  return `${semana.slice(0, 3)} ${data}`;
}

// "Nesta data": os voos do aluno na escala da data aberta, pelo horário (o horário, a missão, o código do curso, o recurso,
// o instrutor e o status), com o resultado da missão do curso (quem registra é o ouvinte da Escala: js/eventos/resultados.js)
function secaoNestaData(s) {
  const voos = RES && Array.isArray(RES.out) ? RES.out.filter(o => o.stuId === s.id).sort((p, q) => p.a - q.a) : [];
  const html = voos.length
    ? `<ul class="voos-do-aluno">${voos.map(o => `<li data-voo="${esc(o.fKey)}"><span class="voo-quando">${hm(o.a)}–${hm(o.b)}</span> `
      + `<span class="voo-oque">${esc([o.mis, recursoDoVoo(o.r), o.ins, statusDoVoo(o, S.fStatus)].join(' · '))}</span>${resultadoNaEscala(o)}</li>`).join('')}</ul>`
    : '<p class="h det-sem-voo">Sem voo nesta data.</p>';
  return { id: 'data', titulo: 'Nesta data', icone: 'i-calendario', escopo: escopoDaData(), campos: [], html };
}

// O formulário "Registrar resultado sem voo": a missão (as liberadas, as fora da ordem, que pedem confirmação, e as já
// aprovadas), o resultado, a data (até hoje) e "Registrar"
function formularioSemVoo(s, missoes) {
  const e = escolhasDe(s.id);
  const hoje = hojeISO();
  const grupo = (rotulo, itens) => (itens.length ? `<optgroup label="${esc(rotulo)}">${opts(itens, e.missao)}</optgroup>` : '');
  const nome = m => `${missoes.rotulo(m)} · ${m.nome}`;
  const lista = '<option value="">Escolha a missão…</option>'
    + grupo('Liberadas', missoes.liberadas.map(m => [m.codigo, nome(m)]))
    + grupo('Fora da ordem (pede confirmação)', missoes.foraDaOrdem.map(({ missao: m, motivo }) => [m.codigo, `${nome(m)}${motivo ? ` (${motivo})` : ''}`]))
    + grupo('Já com resultado', missoes.comResultado.map(m => [m.codigo, nome(m)]));
  const desligado = dadoIndisponivel('resultados') ? ' disabled' : '';
  // A data escolhida fica no campo, também a recusada (depois de hoje: a mensagem diz, e o clique seguinte recusa de novo)
  const data = e.data || dataDoResultadoSemVoo(DATA || hoje, hoje);
  return `<fieldset class="det-form sem-voo" data-sem-voo="${s.id}"><legend>Registrar resultado sem voo <button type="button" class="dica-btn" data-dica="resultado-sem-voo" aria-label="O que é o resultado sem voo?" aria-expanded="false"></button></legend>`
    + `<div class="det-campo"><span class="det-rotulo"><label for="det-alu-sv-missao">Missão</label></span><div class="det-valor"><select id="det-alu-sv-missao" data-sv="missao" aria-describedby="det-alu-sv-erro"${desligado}>${lista}</select></div></div>`
    + `<div class="det-campo"><span class="det-rotulo"><label for="det-alu-sv-resultado">Resultado</label></span><div class="det-valor"><select id="det-alu-sv-resultado" data-sv="resultado"${desligado}>${opts(RESULTADOS_SEM_VOO, e.resultado || 'aprovado')}</select></div></div>`
    + `<div class="det-campo"><span class="det-rotulo"><label for="det-alu-sv-data">Data</label></span><div class="det-valor"><input id="det-alu-sv-data" type="date" data-sv="data" value="${esc(data)}" max="${hoje}" min="2000-01-01"${desligado}></div></div>`
    + `<div class="det-form-acoes"><button type="button" class="btn sec edit-only" id="det-alu-sv-registrar" data-act="resultado-sem-voo" aria-label="Registrar o resultado sem voo de ${esc(s.nm)}"${desligado}>Registrar</button></div>`
    + `<small class="erro-campo" id="det-alu-sv-erro" role="alert">${esc(e.erro || '')}</small></fieldset>`;
}

// "Colocar no curso até…": a missão em que o aluno para (por fase) e o botão que pede a confirmação com quantas e quais
function formularioDaColocacao(s, colocacao) {
  const e = escolhasDe(s.id);
  const grupos = colocacao.alvos.map(g => `<optgroup label="${esc(g.fase)}">${opts(g.missoes.map(m => [m.codigo, `${m.rotulo} · ${m.nome}`]), e.colocar)}</optgroup>`).join('');
  const desligado = dadoIndisponivel('resultados') ? ' disabled' : '';
  return `<fieldset class="det-form colocar" data-colocar="${s.id}"><legend>Colocar no curso <button type="button" class="dica-btn" data-dica="colocar-no-curso" aria-label="O que é colocar no curso?" aria-expanded="false"></button></legend>`
    + '<p class="h">Para o aluno que chega no meio do curso: as missões antes da escolhida, na ordem do curso, ficam aprovadas sem voo (as já aprovadas e as dispensadas ficam como estão). O Histórico desfaz.</p>'
    + `<div class="det-campo"><span class="det-rotulo"><label for="det-alu-colocar">Até a missão</label></span><div class="det-valor"><select id="det-alu-colocar" data-sv="colocar"${desligado}><option value="">Escolha a missão…</option>${grupos}</select></div></div>`
    + `<div class="det-form-acoes"><button type="button" class="btn sec edit-only" id="det-alu-colocar-confirmar" data-act="colocar-no-curso" aria-label="Colocar ${esc(s.nm)} no curso até a missão escolhida"${desligado}>Colocar no curso até…</button></div></fieldset>`;
}

// "Curso e missões": o curso (o select de sempre, data-f="curso"); com o progresso ligado e os programas lidos, o
// progresso, a missão anterior e a atual e, para quem opera a escala, os dois formulários dos resultados. Com o progresso
// desligado (js/funcionalidades.js), só o curso
function secaoDoCurso(s, edita) {
  const progresso = progressoEmTexto(s);
  const missoes = missoesDoAluno(s);
  const campos = [{ id: 'curso', rotulo: 'Curso matriculado', tipo: 'selecao', valor: s.curso || '', texto: nomeDoCurso(s) || '—', opcoes: opcoesDoCurso(s), atributos: 'data-f="curso"' }];
  let html = '';
  if (missoes) {
    const r = missoes.anterior;
    const anterior = r ? [r.missao, `${r.resultado} em ${dataBr(r.data)}`, r.voo ? '' : 'sem voo', r.registrado_por ? `por ${r.registrado_por}` : ''].filter(Boolean).join(' · ') : `Nenhum resultado no ${missoes.curso.sigla}`;
    const atual = missoes.atual ? `${missoes.rotulo(missoes.atual)} · ${missoes.atual.nome}` : 'concluído';
    campos.push(
      ...(progresso ? [{ id: 'progresso', rotulo: 'Progresso', tipo: 'leitura', texto: `${progresso.contagem} · ${progresso.resto}`, dica: ['progresso', 'O que é o progresso?'] }] : []),
      { id: 'missao-anterior', rotulo: 'Missão anterior', tipo: 'leitura', texto: anterior, dica: ['missao-anterior', 'O que é a missão anterior?'] },
      { id: 'missao-atual', rotulo: 'Missão atual', tipo: 'leitura', texto: atual, dica: ['missao-atual', 'O que é a missão atual?'] },
      ...(missoes.tambem.length ? [{ id: 'tambem-liberadas', rotulo: 'Também liberadas', tipo: 'leitura', texto: missoes.tambem.map(missoes.rotulo).join(', ') }] : [])
    );
    if (edita && !isGestor()) {
      const paraRegistrar = missoesParaRegistrar(s);
      const colocacao = colocacaoDoAluno(s);
      html = `<div class="det-forms">${formularioSemVoo(s, paraRegistrar)}${formularioDaColocacao(s, colocacao)}</div>`;
    }
  }
  return { id: 'curso', titulo: 'Curso e missões', icone: 'i-manual', escopo: 'todas as datas', campos, html };
}

// ——— As limitações (L, N9): duras para o motor; cada campo é gravado ao mudar (js/eventos/alunos.js) ———
// A recusa de um campo de "Pode voar" (o Até antes do De, o último dia), por aluno: { texto, campo (o id do controle) }, até a
// próxima mudança que vale
const ERROS_DAS_LIMITACOES = new Map();
export const erroNasLimitacoes = (id, erro) => { if (erro) ERROS_DAS_LIMITACOES.set(+id, erro); else ERROS_DAS_LIMITACOES.delete(+id); };

// O minuto gravado fora dos 10 em 10 (pela API) entra na lista, no lugar dele: o campo mostra o horário que o motor confere
const opcoesDeMinutos = (lista, valor) => opts((lista.includes(valor) ? lista : [...lista, valor].sort((a, b) => a - b)).map(m => [String(m), hm(m)]), String(valor));
// Uma linha de "Pode voar": De, Até, os dias (todos marcados: todas as datas) e o ✕
function linhaDoHorario(h, i, erro) {
  const base = `det-alu-lim-${i}`;
  const invalido = id => (erro && erro.campo === id ? ' aria-invalid="true"' : '');
  const de = `det-alu-lim-de-${i}`, ate = `det-alu-lim-ate-${i}`;
  const dias = h.dias || DIAS_DAS_LIMITACOES;
  const descricao = ' aria-describedby="det-alu-limHorarios-erro"';
  // O De e o Até dizem, ao leitor de tela, de qual horário são (com vários, "De" sozinho não diz qual muda)
  const qual = `<span class="sr"> (horário ${i + 1})</span>`;
  return `<li class="lim-horario" data-i="${i}" id="${base}">`
    + `<span class="lim-de-ate"><label for="${de}">De${qual}</label><select id="${de}" data-f="limDe" data-i="${i}"${descricao}${invalido(de)}>${opcoesDeMinutos(MINUTOS_DOS_HORARIOS.slice(0, -1), h.de)}</select>`
    + `<label for="${ate}">até${qual}</label><select id="${ate}" data-f="limAte" data-i="${i}"${descricao}${invalido(ate)}>${opcoesDeMinutos(MINUTOS_DOS_HORARIOS.slice(1), h.ate)}</select></span>`
    + `<span class="lim-dias" role="group" aria-label="Dias do horário ${i + 1}">${DIAS_DAS_LIMITACOES.map(d => {
      const id = `det-alu-lim-dia-${i}-${d}`;
      return `<label class="lim-dia" for="${id}"><input type="checkbox" id="${id}" data-f="limDia" data-i="${i}" value="${d}"${dias.includes(d) ? ' checked' : ''}${descricao}${invalido(id)}>${nomeDoDia(d)}</label>`;
    }).join('')}</span>`
    + `<button type="button" class="lim-tirar edit-only" id="det-alu-lim-tirar-${i}" data-act="lim-tirar" data-i="${i}" aria-label="Tirar o horário ${esc(textoDosHorarios([h]))}">✕</button></li>`;
}

// "Pode voar": quem edita, as linhas, "+ Horário" e a recusa; quem só consulta, o texto
function campoDosHorarios(s, l, edita) {
  const horarios = (l && l.horarios) || [];
  const rotulo = '<span class="det-rotulo" id="det-alu-limHorarios-rotulo">Pode voar</span>';
  if (!edita) return `${rotulo}<div class="det-valor" aria-labelledby="det-alu-limHorarios-rotulo">${esc(horarios.length ? textoDosHorarios(horarios) : 'Em qualquer horário.')}</div>`;
  const erro = ERROS_DAS_LIMITACOES.get(s.id) || null;
  return `${rotulo}<div class="det-valor lim-valor" role="group" aria-labelledby="det-alu-limHorarios-rotulo">`
    + (horarios.length ? `<ul class="lim-horarios">${horarios.map((h, i) => linhaDoHorario(h, i, erro)).join('')}</ul>` : '<p class="h lim-vazio">Em qualquer horário.</p>')
    + `<button type="button" class="btn sec edit-only lim-mais" id="det-alu-lim-mais" data-act="lim-mais"${horarios.length >= MAXIMO_DE_HORARIOS ? ' disabled' : ''}>+ Horário</button>`
    + `<small class="erro-campo" id="det-alu-limHorarios-erro" role="alert">${esc(erro ? erro.texto : '')}</small></div>`;
}

// A seção "Limitações": "Só voa no" (as etiquetas dos tipos), "Pode voar", "Priorizar com" e "Não escalar com" (como o F1h os
// deixou) e, quando há, a linha do peso (os aviões em que nenhum INVA ativo habilitado cabe com o aluno; sem o número)
function secaoDasLimitacoes(s, edita) {
  const l = normalizarLimitacoes(s.limitacoes);
  const recursos = (l && l.recursos) || [];
  const voaCom = s.voaCom || [];
  const peso = linhaDoPeso(tiposQueNaoCabem(S, s));
  const campos = [
    edita
      ? {
        id: 'limRecursos', rotulo: 'Só voa no', tipo: 'etiquetas', classe: 'lim', dica: ['limitacoes', 'O que são as Limitações?'],
        itens: recursos.map(t => ({ texto: t, rotulo: `Tirar ${t} de Só voa no`, atributos: `data-act="unlr" data-t="${esc(t)}"`, classe: 'lim' })),
        acrescentar: { atributos: 'data-f="limRecurso"', vazio: recursos.length ? 'Também no…' : 'Qualquer recurso: só no…', rotulo: 'Só voa no', opcoes: TIPOS_LIMITAVEIS.filter(t => !recursos.includes(t)).map(t => [t, t]) }
      }
      : { id: 'limRecursos', rotulo: 'Só voa no', tipo: 'leitura', texto: recursos.length ? recursos.join(', ') : 'Qualquer recurso', dica: ['limitacoes', 'O que são as Limitações?'] },
    { id: 'limHorarios', tipo: 'html', html: campoDosHorarios(s, l, edita) },
    {
      id: 'voaCom', rotulo: 'Priorizar com', tipo: 'etiquetas', classe: 'voa-com', dica: ['voa-com', 'O que é Priorizar com?'],
      ...instrutoresDoAluno(s, { ids: voaCom, campo: 'voaCom', classe: 'par', vazio: 'Priorizar com…', fora: [...voaCom, ...s.bl], rotuloDoX: x => `Tirar ${x.nm} de Priorizar com` })
    },
    {
      id: 'bl', rotulo: 'Não escalar com', tipo: 'etiquetas', classe: 'nao-escalar', dica: ['nao-escalar-com', 'O que é Não escalar com?'],
      ...instrutoresDoAluno(s, { ids: s.bl, campo: 'bl', classe: '', vazio: 'Não escalar com…', fora: s.bl, rotuloDoX: x => `Voltar a escalar com ${x.nm}` })
    },
    ...(peso ? [{ id: 'limPeso', rotulo: 'Peso nos aviões', tipo: 'leitura', texto: peso }] : [])
  ];
  return { id: 'limitacoes', titulo: 'Limitações', icone: 'i-cadeado', escopo: 'todas as datas', resumo: l ? textoDasLimitacoes(l) : '', campos };
}

// O detalhe de um aluno (null: ele saiu do cadastro)
export function detalheDoAluno(id) {
  const s = stuBy(+id);
  if (!s) return null;
  const veDados = podeVerDadosPessoais();
  const canac = veDados ? canacDe('aluno', s.id) : '';
  const edita = !isGestor();
  const campos = [
    { id: 'nm', rotulo: 'Nome (na escala)', tipo: 'texto', valor: s.nm, atributos: `data-f="nm" maxlength="${LIMITE_DO_NOME}"` },
    { id: 'kg', rotulo: 'Peso (kg)', tipo: 'numero', valor: s.kg || '', texto: s.kg ? `${numeroBr(s.kg)} kg` : 'sem peso', falta: !s.kg, atributos: 'data-f="kg" min="1" max="300" step="0.1" placeholder="sem peso"' }
  ];
  const dados = secaoDosDadosPessoais('alu', 'aluno', s.id);
  const secoes = [secaoNestaData(s), secaoDoCurso(s, edita), { id: 'cadastro', titulo: 'Cadastro', icone: 'i-conta', escopo: 'todas as datas', campos },
    secaoDasLimitacoes(s, edita), ...(dados ? [dados] : [])];
  // "Apagar os dados pessoais": do aluno inativo que tem dados, para quem os altera
  const apagar = inativo(s) && podeEditarDadosPessoais() && dadosDe('aluno', s.id)
    ? [{ id: 'apagar-dados', texto: 'Apagar os dados pessoais', rotulo: `Apagar os dados pessoais de ${s.nm}`, atributos: 'data-act="apagar-dados"', soEdicao: true }] : [];
  return {
    atributos: `data-k="s" data-id="${s.id}"`,
    id: s.id,
    titulo: s.nm,
    subtitulo: [canac ? `CANAC ${canac}` : '', nomeDoCurso(s) || 'sem curso'].filter(Boolean).join(' · '),
    aviso: inativo(s) ? 'Inativo no cadastro: não entra em pedido novo de hoje em diante (os voos que ele já tem continuam). As datas passadas ficam como estão. Para ativar de novo, ligue “Ativo” na linha dele.' : '',
    secoes,
    rodape: [{ id: 'excluir', texto: 'Excluir aluno…', rotulo: `Excluir ${s.nm}`, atributos: 'data-act="dels"', soEdicao: true }, ...apagar]
  };
}

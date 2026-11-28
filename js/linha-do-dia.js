// A linha do dia, sem DOM: os quatro cartões das etapas (Pedidos, Demanda, Escala, Aprovar), cada um com o valor dele (um
// sentido fixo por cartão, dito na dica), o estado (o pior das tarefas) e as tarefas, que levam à tela onde cada coisa se
// resolve; o selo de Recursos; e os avisos da data, no trilho. Uma função por cartão e uma por grupo de avisos: cada passo
// seguinte muda só a dele.
// contexto: { S, RES, pedidos: lista | null, leituraDosPedidos: 'lendo' | 'erro' | 'lidos', perfil, opera, horasLidas,
// indisponiveis: [{ id, texto }], recusas: Map (o alerta da recusa do instrutor escolhido → o fKey do pedido; só de hoje em
// diante), habilitacoesNaoConferidas: n, data, hoje } (js/views/linha.js, contextoDoDia)
import { REVISAO_H } from './config.js';
import { CODIGOS_DE_AVISO, CODIGOS_DO_AGENDADO } from './conflitos.js';
import { fechamentosDoEstado, rotuloDosFechamentos } from './fechamentos.js';
import { salaDisponivel } from './frota.js';
import { inativo, inativoValeEm, voosComInativos, textoDoVooComInativo } from './inativos.js';
import { ESTAGIOS, podeVer } from './telas.js';
import { solicitacaoAprovada, resumoDasSolicitacoes } from './agenda.js';

// Os estados, do pior ao melhor; "nenhum" não entra na conta do cartão
const GRAVIDADE = ['falhou', 'atencao', 'andamento', 'pendente', 'feito'];
const PERTO_DA_REVISAO_H = 5;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const tarefa = (id, rotulo, valor, estado, tela) => ({ id, rotulo, valor: String(valor), estado, destino: { tela } });

// O pior estado das tarefas (sem as "nenhum"); todas "nenhum": nenhum
function estadoDoCartao(tarefas) {
  const estados = tarefas.map(t => t.estado).filter(e => e !== 'nenhum');
  return estados.length ? GRAVIDADE.find(e => estados.includes(e)) : 'nenhum';
}

// O que vale na data: o inativo só de hoje em diante
const inativoNaData = (item, { data, hoje }) => inativo(item) && inativoValeEm(data, hoje);

// Os pedidos da data (D2): os não cancelados, os que aguardam aprovação, os aprovados e os aprovados fora da demanda
// (nunca importados). Só pede atenção o pedido de um aluno do cadastro, ativo na data: o do inativo entra quando ele voltar
// a ativo (F3: fora dos pendentes) e o de quem não está no cadastro, depois de cadastrado; Pedidos não aprova nenhum dos dois.
// Numa data que já passou, o que aguarda e o que ficou fora não pedem mais nada
function contagemDosPedidos(ctx) {
  const importadas = (ctx.S && ctx.S.importadas) || [];
  const alunos = new Map(((ctx.S && ctx.S.stu) || []).map(s => [s.id, s]));
  const pedeAtencao = p => { const aluno = alunos.get(p.aluno); return Boolean(aluno) && !inativoNaData(aluno, ctx); };
  const { registradas, aguardando, aprovadas } = resumoDasSolicitacoes(ctx.pedidos, pedeAtencao);
  const fora = (ctx.pedidos || []).filter(p => solicitacaoAprovada(p) && !importadas.includes(p.id) && pedeAtencao(p));
  return { p: registradas, aguardando, aprovados: aprovadas, fora: fora.length, passada: Boolean(ctx.hoje) && ctx.data < ctx.hoje };
}

// O rótulo de cada tarefa vai depois do número (a frase do leitor de tela, "1 aprovado fora da demanda"): concorda com ele
const ROTULOS_DOS_PEDIDOS = {
  registrados: n => (n === 1 ? 'pedido da data' : 'pedidos da data'),
  aguardando: () => 'aguardando aprovação',
  aprovados: () => 'aprovados',
  'fora-da-demanda': n => (n === 1 ? 'aprovado fora da demanda' : 'aprovados fora da demanda')
};
function tarefasDosPedidos(ctx) {
  const leitura = ctx.leituraDosPedidos;
  const ids = ['registrados', 'aguardando', 'aprovados', ...(ctx.opera ? ['fora-da-demanda'] : [])];
  if (leitura === 'erro') return ids.map(id => tarefa(id, ROTULOS_DOS_PEDIDOS[id](null), '—', 'falhou', 'age'));
  const { p, aguardando, aprovados, fora, passada } = contagemDosPedidos(ctx);
  if (leitura !== 'lidos') return ids.map(id => tarefa(id, ROTULOS_DOS_PEDIDOS[id](null), '—', 'nenhum', 'age'));
  const valores = {
    registrados: [p, p ? 'feito' : 'pendente'],
    aguardando: [aguardando, !p || (aguardando && passada) ? 'nenhum' : aguardando ? 'atencao' : 'feito'],
    aprovados: [`${aprovados} de ${p}`, !p ? 'nenhum' : aprovados === p ? 'feito' : 'andamento'],
    'fora-da-demanda': [fora, !p || (fora && passada) ? 'nenhum' : fora ? 'atencao' : 'feito']
  };
  const numero = { registrados: p, 'fora-da-demanda': fora };
  return ids.map(id => tarefa(id, ROTULOS_DOS_PEDIDOS[id](numero[id] ?? null), ...valores[id], 'age'));
}

function cartaoDosPedidos(ctx) {
  const tarefas = tarefasDosPedidos(ctx);
  const { p } = contagemDosPedidos(ctx);
  const erro = ctx.leituraDosPedidos === 'erro';
  const lidos = ctx.leituraDosPedidos === 'lidos';
  return {
    valor: lidos ? String(p) : '—',
    dica: erro ? 'Os pedidos desta data não foram lidos' : lidos ? `${plural(p, 'pedido', 'pedidos')} nesta data` : 'Os pedidos desta data estão sendo lidos',
    tarefas
  };
}

// Os aviões disponíveis na data que param ou chegam a menos de 5 h da revisão de 50 horas (o selo de Recursos e a atenção
// dos recursos da Demanda)
function avioesPertoDaRevisao(ctx) {
  const revisao = (ctx.RES && ctx.RES.revisao) || {};
  const frota = (ctx.S && ctx.S.frota) || [];
  const av = (ctx.S && ctx.S.av) || {};
  return Object.entries(revisao).filter(([r, v]) => av[r] !== false && !inativoNaData(frota.find(f => f.reg === r), ctx)
    && v && (v.paraAs !== null || REVISAO_H - v.fim < PERTO_DA_REVISAO_H)).length;
}

const textoDaRevisao = n => `${plural(n, 'avião parado', 'aviões parados')} ou perto da revisão de 50 horas`;

function tarefasDaDemanda(ctx) {
  const S = ctx.S || {};
  const pedidas = (ctx.RES && ctx.RES.tot) || 0;
  const frota = (S.frota || []).filter(f => !inativoNaData(f, ctx));
  const disponiveis = frota.filter(f => (S.av || {})[f.reg] !== false).length;
  const recursos = !frota.length ? 'pendente' : !disponiveis ? 'falhou' : avioesPertoDaRevisao(ctx) ? 'atencao' : 'feito';
  const instrutores = (S.ins || []).filter(x => !inativoNaData(x, ctx));
  const vem = instrutores.filter(x => x.on).length;
  const invas = !instrutores.length ? 'pendente'
    : !vem ? (pedidas ? 'falhou' : 'nenhum')
      : ctx.horasLidas === false ? 'atencao' : 'feito';
  return [
    tarefa('recursos', 'recursos disponíveis', `${disponiveis} de ${frota.length}`, recursos, 'rec'),
    tarefa('invas', 'instrutores que vêm', `${vem} de ${instrutores.length}`, invas, 'ins')
  ];
}

function cartaoDaDemanda(ctx) {
  const pedidas = (ctx.RES && ctx.RES.tot) || 0;
  return { valor: String(pedidas), dica: plural(pedidas, 'missão pedida', 'missões pedidas'), tarefas: tarefasDaDemanda(ctx) };
}

// As missões na escala: as pedidas menos as que não entraram (como o resumo da Escala conta)
function contagemDaEscala(ctx) {
  const al = (ctx.RES && ctx.RES.al) || [];
  const pedidas = (ctx.RES && ctx.RES.tot) || 0;
  const conta = t => al.filter(a => a.t === t).length;
  return { pedidas, naEscala: pedidas - conta('err'), erros: conta('err'), conflitos: conta('conf'), avisos: al.length - conta('err') - conta('conf') };
}

function tarefasDaEscala(ctx) {
  const { pedidas, naEscala, erros, conflitos, avisos } = contagemDaEscala(ctx);
  return [
    tarefa('montada', 'escala montada', `${naEscala} de ${pedidas}`, !pedidas ? 'pendente' : erros ? 'falhou' : 'feito', 'esc'),
    tarefa('conflitos', 'conflitos e avisos', conflitos + avisos, !pedidas ? 'pendente' : conflitos ? 'falhou' : avisos ? 'atencao' : 'feito', 'esc')
  ];
}

function cartaoDaEscala(ctx) {
  const { pedidas, naEscala } = contagemDaEscala(ctx);
  return { valor: `${naEscala} de ${pedidas}`, dica: `${naEscala} de ${plural(pedidas, 'missão', 'missões')} na escala`, tarefas: tarefasDaEscala(ctx) };
}

// A hora da aprovação, no relógio deste computador (como a barra da aprovação a mostra)
const horaDe = iso => {
  const em = new Date(iso);
  return `${String(em.getHours()).padStart(2, '0')}:${String(em.getMinutes()).padStart(2, '0')}`;
};

function tarefasDeAprovar(ctx) {
  const aprovacao = ctx.S && ctx.S.aprovacao;
  if (aprovacao) {
    return [tarefa('aprovada', `aprovada às ${horaDe(aprovacao.em)}${aprovacao.por ? ` por ${aprovacao.por}` : ''}`, horaDe(aprovacao.em), 'feito', 'apr')];
  }
  const pedidas = (ctx.RES && ctx.RES.tot) || 0;
  if (!pedidas) return [tarefa('aprovada', 'nenhum voo', '—', 'nenhum', 'apr')];
  return [tarefa('aprovada', 'não aprovada', '—', ctx.horasLidas === false ? 'atencao' : 'pendente', 'apr')];
}

function cartaoDeAprovar(ctx) {
  const tarefas = tarefasDeAprovar(ctx);
  return { valor: tarefas[0].valor, dica: tarefas[0].rotulo.replace(/^./, c => c.toUpperCase()), tarefas };
}

const CARTOES = {
  pedidos: { tela: 'age', montar: cartaoDosPedidos },
  processamento: { tela: 'dem', montar: cartaoDaDemanda },
  escala: { tela: 'esc', montar: cartaoDaEscala },
  aprovar: { tela: 'apr', montar: cartaoDeAprovar }
};

// Um cartão por etapa, na ordem: { id, tela, estado, valor, dica, tarefas: [{ id, rotulo, estado, valor, destino }] }
export function linhaDoDia(ctx) {
  return ESTAGIOS.map(id => {
    const { valor, dica, tarefas } = CARTOES[id].montar(ctx);
    return { id, tela: CARTOES[id].tela, estado: estadoDoCartao(tarefas), valor, dica, tarefas };
  });
}

// Os selos dos links dos cadastros: em Recursos, os aviões parados ou perto da revisão de 50 horas
export function selosDosCadastros(ctx) {
  const n = avioesPertoDaRevisao(ctx);
  return n ? { rec: { valor: String(n), estado: 'atencao', dica: textoDaRevisao(n) } } : {};
}

// Os avisos da data, um por item a resolver: { id, gravidade: 'erro' | 'aviso' | 'info', minuto (do voo; null: sem horário),
// duracaoMin?, titulo, texto, destino: { tela, item? } | null (o perfil não abre a tela, ou o aviso se resolve no alto) }.
// Os da escala têm o grupo ('erros', 'conflitos', 'avisos', 'inativos', 'habilitacoes': o que eram as caixas do resumo da
// Escala, que saíram em linha-fix-escala-sem-caixas) e, para quem opera, a ação: { tipo: 'reparo' | 'rejeitado' |
// 'refazer-escala', fKey?, rotulo, dica }

const GRUPO_DO_ALERTA = { err: 'erros', conf: 'conflitos' };
const SUGESTOES_DO_CONFLITO = fKey => ({ tipo: 'reparo', fKey, rotulo: 'Sugestões', dica: 'O que pode voar no lugar deste voo' });
const SUGESTOES_DA_RECUSA = fKey => ({ tipo: 'rejeitado', fKey, rotulo: 'Sugestões', dica: 'Outro instrutor que encaixa este pedido' });
const REFAZER_A_ESCALA = { tipo: 'refazer-escala', rotulo: 'Refazer a escala', dica: 'Refaz a escala sem o instrutor e o recurso inativos' };

// A ação do alerta (só para quem opera): "Sugestões" no conflito com voo e na recusa do instrutor escolhido que ainda voa
function acaoDoAlerta(a, ctx) {
  if (!ctx.opera) return null;
  if (a.t === 'conf' && a.fKey) return SUGESTOES_DO_CONFLITO(a.fKey);
  const fKey = a.t === 'err' && a.codigo === 'instrutor-escolhido' && ctx.recusas ? ctx.recusas.get(a) : null;
  return fKey ? SUGESTOES_DA_RECUSA(fKey) : null;
}

// As missões que não entraram, os conflitos e os avisos da escala. Os de um voo da escala têm o horário dele
function avisosDaEscala(ctx) {
  const { RES } = ctx;
  const voos = new Map(((RES && RES.out) || []).map(o => [o.fKey, o]));
  const vistos = new Map();
  return ((RES && RES.al) || []).map(a => {
    const base = `${a.t}:${a.fKey ?? [a.codigo, a.stuId, a.insId].filter(x => x !== undefined && x !== null).join('-')}`;
    const vez = (vistos.get(base) || 0) + 1;
    vistos.set(base, vez);
    const voo = a.fKey === undefined ? null : voos.get(a.fKey);
    return {
      id: vez === 1 ? base : `${base}:${vez}`,
      gravidade: a.t === 'err' || a.t === 'conf' ? 'erro' : 'aviso',
      minuto: voo ? voo.a : null, ...(voo ? { duracaoMin: voo.b - voo.a } : {}),
      titulo: a.s, texto: a.m, destino: { tela: 'esc' }, grupo: GRUPO_DO_ALERTA[a.t] || 'avisos',
      ...(acaoDoAlerta(a, ctx) ? { acao: acaoDoAlerta(a, ctx) } : {})
    };
  });
}

// Os voos da escala com quem ficou inativo no cadastro, um por pessoa ou recurso: o do instrutor e o do recurso se resolvem
// com "Refazer a escala" (para quem opera); o do aluno, na Demanda (o pedido dele continua)
function avisosDosInativos(ctx) {
  const demanda = podeVer('dem', ctx.perfil) ? { tela: 'dem' } : null;
  return voosComInativos(ctx.S, ctx.RES, { data: ctx.data, hoje: ctx.hoje }).map(i => ({
    id: `inativo:${i.de}:${i.id}`, gravidade: 'aviso', minuto: null, titulo: textoDoVooComInativo(i), texto: '',
    destino: i.de === 'aluno' ? demanda : { tela: 'esc' }, grupo: 'inativos',
    ...(i.de !== 'aluno' && ctx.opera ? { acao: REFAZER_A_ESCALA } : {})
  }));
}

// Sem os programas dos cursos lidos, o que as missões do curso dos pedidos exigem do INVA não foi conferido (quantos
// pedidos: js/state.js, habilitacoesNaoConferidas)
function avisosDasHabilitacoes({ habilitacoesNaoConferidas: n }) {
  if (!n) return [];
  return [{
    id: 'habilitacoes', gravidade: 'aviso', minuto: null, titulo: 'As habilitações das missões do curso não foram conferidas',
    texto: `Os programas dos cursos não foram lidos: o que a missão do curso exige do INVA não foi conferido em ${plural(n, 'pedido', 'pedidos')} desta data: a escala foi montada sem essa conferência.`,
    destino: { tela: 'esc' }, grupo: 'habilitacoes'
  }];
}

function avisosDosRecursos(ctx) {
  const destino = podeVer('rec', ctx.perfil) ? { tela: 'rec' } : null;
  const n = avioesPertoDaRevisao(ctx);
  // A Sala Ground desligada na data (S4): só com a chave false (salaDisponivel; sem a chave, disponível)
  const sala = ctx.S && !salaDisponivel(ctx.S.av)
    ? [{ id: 'sala-ground', gravidade: 'aviso', minuto: null, titulo: 'A Sala Ground está indisponível nesta data', texto: '', destino }] : [];
  return [...(n ? [{ id: 'recursos', gravidade: 'aviso', minuto: null, titulo: textoDaRevisao(n), texto: '', destino }] : []), ...sala];
}

// Os horários fechados nesta data (B): uma informação, sem horário, que leva ao bloco deles na Escala (#/esc/fechamentos;
// o H a leva para as restrições da data). Os de um dia de antes do formato 28 vêm do win (fechamentosDoEstado)
function avisosDosFechamentos({ S }) {
  const rotulos = rotuloDosFechamentos(S ? fechamentosDoEstado(S) : []);
  return rotulos.length ? [{ id: 'horarios-fechados', gravidade: 'info', minuto: null, titulo: `Horários fechados nesta data: ${rotulos.join('; ')}`, texto: '', destino: { tela: 'esc', item: 'fechamentos' } }] : [];
}

function avisosDosPedidos(ctx) {
  const aviso = (id, titulo) => ({ id, gravidade: 'aviso', minuto: null, titulo, texto: '', destino: { tela: 'age' } });
  if (ctx.leituraDosPedidos === 'erro') return [aviso('pedidos-nao-lidos', 'Não foi possível ler os pedidos desta data.')];
  if (ctx.leituraDosPedidos !== 'lidos') return [];
  const { aguardando, fora, passada } = contagemDosPedidos(ctx);
  if (passada) return [];
  return [
    ...(aguardando ? [aviso('pedidos-aguardando', `${plural(aguardando, 'pedido', 'pedidos')} aguardando aprovação`)] : []),
    ...(ctx.opera && fora ? [aviso('fora-da-demanda', `${plural(fora, 'pedido aprovado', 'pedidos aprovados')} fora da demanda`)] : [])
  ];
}

// O que a data não leu: sem destino (a faixa do alto tem "Tentar de novo"). Sem as horas dos instrutores, os limites da lei
// não são conferidos: é erro
const avisosDosDados = ctx => (ctx.indisponiveis || []).map(({ id, texto }) =>
  ({ id: `dados:${id}`, gravidade: id === 'horas' ? 'erro' : 'aviso', minuto: null, titulo: texto, texto: '', destino: null }));

// O resumo de cada grupo da escala com dois itens ou mais, no alto dos avisos do trilho (o título que cada caixa do resumo
// da Escala tinha, antes de linha-fix-escala-sem-caixas); com um item só, o item diz tudo. Na ordem: as missões que não
// entraram (com os nomes, sem repetir), os conflitos (da escala aprovada ou dos voos fixos) e os avisos, agrupados pelo
// código: alunos e instrutores sem peso, aviões que param para a revisão, atrasos, instrutores perto do limite da lei, os
// do “Priorizar com”, o instrutor escolhido que saiu do cadastro, o repouso e as voltas do noturno e os voos agendados
// fora das regras (um por voo). Os avisos sem código (de uma escala gravada antes deles) entram em "outros".
// [{ grupo: 'erros' | 'conflitos' | 'avisos', gravidade: 'erro' | 'aviso', texto }]
function resumoDosAvisos(avisos) {
  const doCodigo = codigo => avisos.filter(a => a.codigo === codigo);
  const quantos = (lista, campo) => new Set(lista.map(a => a[campo]).filter(id => id !== undefined)).size;
  const partes = [
    [quantos(doCodigo('sem-peso'), 'stuId'), 'aluno sem peso', 'alunos sem peso'],
    [quantos(doCodigo('sem-peso'), 'insId'), 'instrutor sem peso', 'instrutores sem peso'],
    [doCodigo('revisao').length, 'avião para para a revisão de 50 horas', 'aviões param para a revisão de 50 horas'],
    [doCodigo('atraso').length, 'atraso com conflito', 'atrasos com conflito'],
    [quantos(doCodigo('perto-do-limite'), 'insId'), 'instrutor perto do limite da lei', 'instrutores perto do limite da lei'],
    [doCodigo('voa-com').length, 'aviso de Priorizar com', 'avisos de Priorizar com'],
    [doCodigo('escolhido-saiu').length, 'voo com o instrutor escolhido fora do cadastro', 'voos com o instrutor escolhido fora do cadastro'],
    [quantos(doCodigo('repouso-do-noturno'), 'insId'), 'instrutor sem o repouso da lei antes da volta do noturno', 'instrutores sem o repouso da lei antes da volta do noturno'],
    [doCodigo('volta-do-noturno').length, 'volta do noturno com o avião ou o INVA indisponível', 'voltas do noturno com o avião ou o INVA indisponível'],
    [quantos(avisos.filter(a => CODIGOS_DO_AGENDADO.includes(a.codigo)), 'fKey'), 'agendamento fora da regra', 'agendamentos fora da regra'],
    [avisos.filter(a => !CODIGOS_DE_AVISO.includes(a.codigo)).length, 'outro', 'outros']
  ].filter(([n]) => n).map(([n, um, varios]) => plural(n, um, varios));
  return `${plural(avisos.length, 'aviso', 'avisos')}: ${partes.join(' · ')}`;
}
export function resumosDaEscala(ctx) {
  const al = (ctx.RES && ctx.RES.al) || [];
  const erros = al.filter(a => a.t === 'err'), conflitos = al.filter(a => a.t === 'conf');
  const avisos = al.filter(a => a.t !== 'err' && a.t !== 'conf');
  const aprovada = Boolean(ctx.S && ctx.S.aprovacao);
  const resumos = [];
  if (erros.length > 1) {
    const nomes = [...new Set(erros.map(a => a.s))].join(', ');
    resumos.push({ grupo: 'erros', gravidade: 'erro', texto: `${erros.length} missões não entraram na escala: ${nomes}` });
  }
  if (conflitos.length > 1) {
    const texto = aprovada ? `${conflitos.length} voos em conflito na escala aprovada` : `${conflitos.length} voos fixos em conflito`;
    resumos.push({ grupo: 'conflitos', gravidade: 'erro', texto });
  }
  if (avisos.length > 1) resumos.push({ grupo: 'avisos', gravidade: 'aviso', texto: resumoDosAvisos(avisos) });
  return resumos;
}

// Na ordem: erro, aviso, info; em cada um, os sem horário primeiro, depois pelo horário e pelo id
const ORDEM_DOS_AVISOS = ['erro', 'aviso', 'info'];
export function avisosDaData(ctx) {
  return [avisosDaEscala, avisosDosInativos, avisosDasHabilitacoes, avisosDosRecursos, avisosDosFechamentos, avisosDosPedidos, avisosDosDados].flatMap(grupo => grupo(ctx)).sort((p, q) =>
    ORDEM_DOS_AVISOS.indexOf(p.gravidade) - ORDEM_DOS_AVISOS.indexOf(q.gravidade)
    || (p.minuto ?? -1) - (q.minuto ?? -1)
    || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

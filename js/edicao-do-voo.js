// A alteração de um voo feita na Escala (F1g, N10): o que ela grava e a escala que ela deixa. Na escala aprovada o motor
// não roda: só aquele voo muda, e a escala da tela é conferida de novo (js/conferencia.js, conferirEscala), sem pôr, mover
// ou tirar nenhum outro voo. Fora dela, o motor refaz a escala inteira (depois da pergunta, js/eventos/edicao-do-voo.js).
// Funções puras: recebem o estado e a escala e não leem a tela
import { runAllocationEngine } from './engine.js';
import { conferirEscala } from './conferencia.js';
import { GROUND_EQ_TYPE, GROUND_REG, MIS, MINUTOS_DO_DIA } from './config.js';
import { CAMPOS_DO_PEDIDO } from './dias.js';
import { GRUPO_DO_CONFLITO } from './conflitos.js';
import { isGroundMission, duracaoFixaDaMissao, duracaoPadraoDaMissao, disponibilidadeDoAluno, disponibilidadeValida, normalizeMissionFields, alvoDoNovoPedido } from './rules.js';
import { missoesDoAluno } from './agenda.js';
import { opcoesDeRecurso, opcoesDeInstrutor, horariosDoAgendamento } from './agendamento.js';
import { escolherInstrutor } from './instrutor-escolhido.js';
import { fixosAoMudarStatus } from './fixos.js';
import { chaveDoVoo, pedidoDoAluno, statusDoVoo } from './voo.js';
import { hm, fmtH } from './format.js';
import { nomeDoRecurso } from './categorias.js';
import { FROTA_INICIAL } from './frota.js';
import { comExigenciasDasMissoes, exigeDaMissaoDoPedido } from './programa.js';

// A escala que a alteração deixa (estado: o estado da escala depois dela). Na escala aprovada (aprovada), a da tela
// (resultado) conferida de novo, sem o motor (antes: o estado que fez a escala da tela; recusas: as que a reversão devolve).
// O pedido que entra no dia (sem pino, linha nem recusa: a reversão de um "✕" feito antes da aprovação) e a escala não
// aprovada pedem o motor, em volta dos voos fixos (R5). { resultado, motor: se o motor rodou }
export function escalaDaAlteracao(estado, resultado, { aprovada, antes = estado, recusas = [], motor = runAllocationEngine } = {}) {
  const conferida = aprovada && resultado ? conferirEscala(estado, resultado, { antes, recusas }) : null;
  return conferida ? { resultado: conferida, motor: false } : { resultado: motor(estado), motor: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// O editor do voo (dialog#dlg-voo): os campos, as opções de cada um, os avisos e o que "Salvar" grava

// O voo a editar pela chave (a do voo, ou a da turma de Ground: classKey): a unidade (o voo, ou os alunos da turma), o voo
// principal (o primeiro que não foi cancelado), o que trava os campos (a volta do noturno de ontem: só o status; o voo com
// resultado registrado: o aluno e a missão; o motivo ao lado do campo) e os valores de agora. ambiente.resultados: os
// registros do dia ({ doDia }). null: o voo não está na escala
export function vooParaEditar(estado, resultado, chave, ambiente = {}) {
  const out = resultado && Array.isArray(resultado.out) ? resultado.out : [];
  const alvo = out.find(o => o.fKey === chave) || out.find(o => o.classKey === chave);
  if (!alvo) return null;
  const ground = Boolean(alvo.isGround);
  const unidade = ground ? out.filter(o => o.classKey === alvo.classKey) : [alvo];
  const principal = unidade.find(o => statusDoVoo(o, estado.fStatus) !== 'Cancelado') || unidade[0];
  const pedido = pedidoDoVoo(estado, principal);
  const registros = ((ambiente.resultados || {}).doDia || []);
  const comResultado = unidade.some(o => registros.some(r => r && r.voo === o.fKey));
  const volta = Boolean(principal.trecho);
  return {
    chave: ground ? alvo.classKey : alvo.fKey, unidade, principal, ground, volta,
    travas: {
      // A volta é o voo de ontem: só o status muda nela
      tudo: volta ? 'É a volta do noturno de ontem: só o status muda aqui.' : '',
      // O resultado é do servidor, pelo aluno e pela missão: tire o resultado antes
      aluno: volta ? '' : ground ? 'Na turma de Ground, os alunos mudam em Turma.' : comResultado ? 'O voo tem resultado registrado: tire o resultado antes de mudar o aluno.' : '',
      missao: volta ? '' : comResultado ? 'O voo tem resultado registrado: tire o resultado antes de mudar a missão.' : ''
    },
    valores: {
      stuId: principal.stuId,
      missao: missaoDoVoo(principal, pedido),
      r: principal.r, a: principal.a, minutos: principal.b - principal.a, insId: principal.insId,
      status: Object.fromEntries(unidade.map(o => [o.fKey, statusDoVoo(o, estado.fStatus)])),
      detalhe: Object.fromEntries(unidade.map(o => [o.fKey, (estado.fObs || {})[o.fKey] || null]))
    }
  };
}

const pedidoDoVoo = (estado, o) => {
  if (o.trecho) return null;
  const aluno = estado.stu.find(s => s.id === o.stuId);
  return aluno ? pedidoDoAluno(aluno, o.mid || 0) || null : null;
};
const camposDoPedido = p => Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => p[c] !== undefined).map(c => [c, p[c]]));

// A missão do voo: o tipo, o recurso, as horas e a missão do curso (etapa e cursoDaEtapa, do pedido)
const missaoDoVoo = (o, pedido) => ({
  mis: o.mis, eq: o.isGround ? GROUND_EQ_TYPE : o.eqType, nb: (o.b - o.a) / 60,
  ...(pedido && pedido.etapa ? { etapa: pedido.etapa, ...(pedido.cursoDaEtapa ? { cursoDaEtapa: pedido.cursoDaEtapa } : {}) } : {})
});
const chaveDaMissao = m => (m.etapa ? `c:${m.cursoDaEtapa || ''}:${m.etapa}` : `t:${m.mis}`);

// As missões que o voo pode ter: as do curso do aluno (missoesDoAluno, F1c), em grupos por fase; sem curso (ou sem os
// programas lidos), os tipos de missão (o Ground só para outro Ground, e o voo só para um voo). A missão de agora fica na
// lista, também quando o curso não a tem mais
export function missoesDoVoo(estado, voo, stuId, programa) {
  const aluno = estado.stu.find(s => s.id === stuId) || null;
  const { curso, grupos, motivo } = missoesDoAluno(aluno, programa);
  const doTipo = m => isGroundMission(m.mis) === voo.ground;
  const lista = curso
    ? grupos.map(g => ({ rotulo: g.fase, opcoes: g.missoes.filter(doTipo).map(m => ({ valor: chaveDaMissao({ etapa: m.codigo, cursoDaEtapa: curso.sigla }), texto: m.texto, missao: { mis: m.mis, eq: isGroundMission(m.mis) ? GROUND_EQ_TYPE : m.eq, nb: m.nb, etapa: m.codigo, cursoDaEtapa: curso.sigla } })) })).filter(g => g.opcoes.length)
    : [{ rotulo: 'Tipos de missão', opcoes: Object.keys(MIS).filter(mis => isGroundMission(mis) === voo.ground).map(mis => ({ valor: chaveDaMissao({ mis }), texto: mis, missao: { mis, eq: isGroundMission(mis) ? GROUND_EQ_TYPE : MIS[mis].defEq, nb: duracaoFixaDaMissao(mis) || duracaoPadraoDaMissao(mis) } })) }];
  return { grupos: lista, motivo, curso: curso ? curso.sigla : null };
}

// A missão escolhida existe para o aluno (a do curso dele, ou um tipo, sem curso)? O aluno de outro curso perde a missão
// do curso que o novo não tem: a missão fica para escolher (null)
export function missaoParaOAluno(estado, voo, stuId, missao, programa) {
  const { grupos } = missoesDoVoo(estado, voo, stuId, programa);
  const opcao = grupos.flatMap(g => g.opcoes).find(o => o.valor === chaveDaMissao(missao));
  if (opcao) return { ...opcao.missao, eq: missao.eq, nb: missao.nb };
  // O aluno sem curso fica com o tipo da missão, sem a missão do curso
  const semCurso = grupos.length === 1 && grupos[0].rotulo === 'Tipos de missão';
  return semCurso ? { mis: missao.mis, eq: missao.eq, nb: missao.nb } : null;
}

// As opções de cada campo do editor, com os valores escolhidos (valores): os alunos ativos (o voo; a turma muda em Turma), as
// missões, os recursos dos tipos que a missão permite e os instrutores, cada um com o que o impede no horário (nada fica
// desligado: o que não serve avisa e pede a confirmação, e o voo fica em conflito, decisão 4), os horários de decolagem
// do tipo (o de agora, fora da lista, como "Outro horário") e a duração (a do Ground e a do Noturno não mudam). O
// "Automático" do instrutor fica desligado no voo posto à mão (o pino agendado): o app escolheria de novo só depois de
// revertido no Histórico. ambiente.programa: os programas dos cursos lidos
export function opcoesDoVoo(estado, resultado, voo, valores, ambiente = {}) {
  const { missao, r, a, minutos, insId, stuId } = valores;
  const aluno = estado.stu.find(s => s.id === stuId) || null;
  const exceto = voo.unidade.map(o => o.fKey);
  const tipo = missao ? (voo.ground ? GROUND_EQ_TYPE : (frotaDe(estado).find(f => f.reg === r) || {}).tipo || missao.eq) : null;
  const b = a + minutos;
  const instrutor = estado.ins.find(x => x.id === insId) || null;
  const alunos = voo.ground ? [] : estado.stu.map(s => ({ valor: s.id, texto: s.nm })).sort((p, q) => p.texto.localeCompare(q.texto, 'pt-BR') || p.valor - q.valor);
  const missoes = missoesDoVoo(estado, voo, stuId, ambiente.programa);
  const semDesligar = o => ({ ...o, desligada: false });
  const recursos = !missao || voo.ground ? [] : opcoesDeRecurso(estado, resultado, { mis: missao.mis, eq: missao.eq, curso: aluno && aluno.curso, a, b, instrutor, exceto }).map(semDesligar);
  const exige = exigeDaMissao(estado, voo, valores, ambiente.programa);
  const instrutores = !missao || !aluno ? [] : opcoesDeInstrutor(estado, resultado, {
    mis: missao.mis, tipo: tipo || missao.eq, a, b, stu: aluno, stuKg: aluno.kg || 0, curso: aluno.curso, r: voo.ground ? null : r, exige, exceto
  }).map(g => ({ ...g, opcoes: g.opcoes.map(semDesligar) }));
  // O instrutor de agora fica na lista também quando saiu do cadastro
  if (insId && !instrutores.some(g => g.opcoes.some(o => o.valor === insId))) instrutores.push({ rotulo: 'Fora do cadastro', opcoes: [{ valor: insId, texto: voo.principal.ins || `Instrutor ${insId}` }] });
  const pino = (estado.fixos || {})[voo.principal.fKey];
  const aMao = Boolean(pino && pino.agendado);
  const lista = missao ? horariosDoAgendamento(estado, { mis: missao.mis, tipo: tipo || missao.eq }) : [];
  return {
    alunos, missoes, recursos, instrutores,
    automatico: aMao ? { desligado: true, nota: 'o voo foi posto à mão: reverta no Histórico para o app escolher' } : { desligado: false, nota: '' },
    horarios: [...lista.map(m => ({ valor: m, texto: hm(m) })), ...(lista.includes(a) ? [] : [{ valor: a, texto: `${hm(a)} (outro horário)` }])],
    duracao: { fixa: Boolean(missao && duracaoFixaDaMissao(missao.mis)), horas: minutos / 60 }
  };
}

const frotaDe = estado => (Array.isArray(estado.frota) ? estado.frota : FROTA_INICIAL);

// O que a missão escolhida no editor exige do INVA (a missão do curso, pelo programa: a de agora ou outra, também com o
// aluno mudado); sem os programas lidos, o que o estado da escala derivou para o pedido de agora (nada), e só enquanto a
// missão é a mesma
function exigeDaMissao(estado, voo, { missao, stuId }, programa) {
  if (!missao) return [];
  const aluno = estado.stu.find(s => s.id === stuId) || null;
  if (Array.isArray(programa)) return [...exigeDaMissaoDoPedido(programa, missao.etapa ? { etapa: missao.etapa, cursoDaEtapa: missao.cursoDaEtapa } : null, aluno)];
  const pedido = pedidoDoVoo(estado, voo.principal) || {};
  return chaveDaMissao(missao) === chaveDaMissao(voo.valores.missao) && Array.isArray(pedido.exige) ? pedido.exige : [];
}

// O que mudou (valores contra os de agora, voo.valores): o lugar (o aluno, a missão, o recurso, o horário ou a duração), o
// instrutor e o status de cada voo da unidade
export function mudancasDoVoo(voo, valores) {
  const de = voo.valores;
  const missao = Boolean(valores.missao) && chaveDaMissao(valores.missao) + valores.missao.eq !== chaveDaMissao(de.missao) + de.missao.eq;
  const lugar = valores.stuId !== de.stuId || missao || valores.r !== de.r || valores.a !== de.a || valores.minutos !== de.minutos;
  const status = voo.unidade.map(o => o.fKey).filter(k => valores.status[k] !== de.status[k] || JSON.stringify(valores.detalhe[k] || null) !== JSON.stringify(de.detalhe[k] || null));
  return { aluno: valores.stuId !== de.stuId, missao, lugar, instrutor: valores.insId !== de.insId, status, alguma: lugar || valores.insId !== de.insId || status.length > 0 };
}

// O que impede salvar a alteração, como no "+ Agendar voo" (js/agendamento.js): o voo que terminaria depois da meia-noite
// (o "Outro horário" tarde, a duração longa, o Noturno depois das 20:00), ligado ao campo do horário. O aviso, ou null
export function bloqueioDaEdicao(voo, valores) {
  if (voo.volta || !mudancasDoVoo(voo, valores).lugar || valores.a + valores.minutos <= MINUTOS_DO_DIA) return null;
  return { codigo: 'depois-da-meia-noite', texto: 'O voo terminaria depois da meia-noite.', campo: 'voo-horario', conflito: true, bloqueia: true };
}

// O resumo da alteração, para a pergunta e o histórico: "Maria: 08:20 → 09:10, PR-AAA → PR-BBB"
export function resumoDaEdicao(estado, voo, valores) {
  const de = voo.valores;
  const nome = id => (estado.stu.find(s => s.id === id) || {}).nm || `Aluno ${id}`;
  const insNome = id => (id ? (estado.ins.find(x => x.id === id) || {}).nm || `Instrutor ${id}` : 'Automático');
  const quem = voo.ground && voo.unidade.length > 1 ? `turma de ${voo.principal.mis}` : nome(de.stuId);
  const partes = [];
  if (valores.stuId !== de.stuId) partes.push(`aluno ${nome(de.stuId)} → ${nome(valores.stuId)}`);
  if (valores.missao && chaveDaMissao(valores.missao) !== chaveDaMissao(de.missao)) partes.push(`${de.missao.etapa || de.missao.mis} → ${valores.missao.etapa || valores.missao.mis}`);
  if (valores.a !== de.a) partes.push(`${hm(de.a)} → ${hm(valores.a)}`);
  if (valores.minutos !== de.minutos) partes.push(`${fmtH(de.minutos / 60)} → ${fmtH(valores.minutos / 60)}`);
  if (valores.r !== de.r) partes.push(`${nomeDoRecurso(de.r)} → ${nomeDoRecurso(valores.r)}`);
  if (valores.insId !== de.insId) partes.push(`${insNome(de.insId)} → ${insNome(valores.insId)}`);
  for (const o of voo.unidade) {
    if (valores.status[o.fKey] !== de.status[o.fKey]) partes.push(`${voo.unidade.length > 1 ? `${o.s}: ` : ''}${de.status[o.fKey]} → ${valores.status[o.fKey]}`);
    else if (JSON.stringify(valores.detalhe[o.fKey] || null) !== JSON.stringify(de.detalhe[o.fKey] || null)) partes.push(`${voo.unidade.length > 1 ? `${o.s}: ` : ''}detalhe do status`);
  }
  return `${quem}: ${partes.join(', ') || 'sem mudança'}`;
}

// Aplica a alteração ao estado (o estado da tela, ou uma cópia para a conferência) e devolve a reversão (desfazerEdicao) e
// as chaves dos voos que ficam (a do aluno novo, quando ele muda), ou null quando nada muda. O que grava:
// - o status e o detalhe de cada voo da unidade (como na Lista: fixosAoMudarStatus);
// - só o instrutor, no mesmo lugar: como na Lista (escolherInstrutor: o pino escolhido; a turma inteira), e "Automático" tira
//   a escolha do pedido;
// - o lugar (o aluno, a missão, o recurso, o horário ou a duração): o pino agendado de cada voo da unidade (o operador pôs o
//   voo ali: vale mais que o motor e fica na reabertura), e o pedido com a missão, o tipo do recurso, as horas, o horário
//   (p1; a disponibilidade de um minuto exato vira o minuto novo, a mais larga que não o inclui sai: janSaiu) e o
//   instrutor; a confirmação do 7º local sai com o horário para que ela foi dada. O aluno novo recebe o voo num pedido
//   livre ou numa missão extra nova (alvoDoNovoPedido), com o tipo, as horas, o horário e o instrutor (nunca o pedido da
//   agenda, a disponibilidade, a 2ª preferência, a prioridade ou a confirmação do 7º local, que são do pedido de antes); o
//   pedido de antes deixa de voar, e o pino, o status e o detalhe passam para a chave nova.
// A reversão guarda também o status que a alteração deixou em cada voo (statusDepois): desfazer não troca o status mudado
// depois dela. O voo que terminaria depois da meia-noite não é gravado (bloqueioDaEdicao): null.
// aprovada: a escala está aprovada (o status Pendente ou Confirmado não solta o voo)
export function aplicarEdicao(estado, resultado, voo, valores, { aprovada = Boolean(estado.aprovacao) } = {}) {
  const m = mudancasDoVoo(voo, valores);
  if (!m.alguma || bloqueioDaEdicao(voo, valores)) return null;
  const { principal } = voo;
  const voos = new Map(), pedidos = new Map();
  // O voo sem pino que está na escala guarda o lugar dele: na escala aprovada depois, desfazer o põe de volta ali
  const guardarVoo = (fKey, o = null) => {
    if (voos.has(fKey)) return;
    const fixo = (estado.fixos || {})[fKey] || null;
    const lugar = !fixo && o && !o.trecho ? { a: o.a, b: o.b, r: o.r, insId: o.insId, ...(o.isGround && o.classKey ? { classKey: o.classKey } : {}) } : null;
    voos.set(fKey, { fKey, fixo, status: (estado.fStatus || {})[fKey] || null, detalhe: (estado.fObs || {})[fKey] || null, ...(lugar ? { lugar } : {}) });
  };
  const guardarPedido = (stuId, mid, pedido) => { const k = `${stuId}_${mid}`; if (!pedidos.has(k)) pedidos.set(k, { stuId, mid, pedido: pedido ? camposDoPedido(pedido) : null }); };
  voo.unidade.forEach(o => {
    guardarVoo(o.fKey, o);
    const p = pedidoDoVoo(estado, o);
    if (p) guardarPedido(o.stuId, o.mid || 0, p);
  });
  let chaves = voo.unidade.map(o => o.fKey);
  let janSaiu = false;
  estado.fixos = { ...(estado.fixos || {}) };
  estado.fStatus = { ...(estado.fStatus || {}) };
  estado.fObs = { ...(estado.fObs || {}) };

  if (m.lugar && !voo.volta) {
    const b = valores.a + valores.minutos;
    const tipo = voo.ground ? GROUND_EQ_TYPE : (frotaDe(estado).find(f => f.reg === valores.r) || {}).tipo || valores.missao.eq;
    const insId = valores.insId || principal.insId;
    const escreverPedido = (p, { novo = false } = {}) => {
      if (m.missao || novo) {
        p.mis = valores.missao.mis;
        delete p.exige;
        if (valores.missao.etapa) Object.assign(p, { etapa: valores.missao.etapa, cursoDaEtapa: valores.missao.cursoDaEtapa });
        else { delete p.etapa; delete p.cursoDaEtapa; }
      }
      const outroTipo = p.eq !== tipo;
      Object.assign(p, { fly: true, eq: tipo, p1: valores.a, ...(voo.ground ? {} : { nb: valores.minutos / 60 }) });
      if (novo) p.p2 = -1;
      if (valores.a !== voo.valores.a || novo) {
        // A de um minuto exato vira o minuto novo, enquanto ele é um horário da disponibilidade (das 06:30 às 17:30); fora
        // disso, ela sai, como a mais larga que não inclui o horário novo
        const permitidas = disponibilidadeDoAluno(p.jan);
        const exato = typeof p.jan === 'string' && /^h\d+$/.test(p.jan) ? `h${valores.a}` : null;
        if (exato && disponibilidadeValida(exato)) p.jan = exato;
        else if (permitidas && !permitidas(valores.a)) { delete p.jan; janSaiu = true; }
      }
      // A confirmação do 7º local foi dada para o horário, a missão e o tipo: sai quando um deles muda (como na Demanda)
      if (valores.a !== voo.valores.a || novo || m.missao || outroTipo) delete p.limiteConfirmado;
      if (valores.insId !== voo.valores.insId || novo) {
        if (valores.insId) p.insId = valores.insId;
        else if (!novo) delete p.insId;
      }
      normalizeMissionFields(p);
    };
    const pino = { a: valores.a, b, r: voo.ground ? GROUND_REG : valores.r, insId, ...(voo.ground ? { classKey: principal.classKey } : {}), agendado: true };
    if (m.aluno) {
      // O voo passa para outro aluno: a chave muda
      const novoAluno = estado.stu.find(s => s.id === valores.stuId);
      const deAntes = pedidoDoVoo(estado, principal);
      const principalDeAntes = camposDoPedido(novoAluno);
      const alvo = alvoDoNovoPedido(estado, novoAluno);
      const mid = alvo === novoAluno ? 0 : alvo.mid;
      const fKey = chaveDoVoo(novoAluno.id, mid);
      guardarVoo(fKey);
      guardarPedido(novoAluno.id, mid, mid === 0 ? principalDeAntes : null);
      escreverPedido(alvo, { novo: true });
      if (deAntes) deAntes.fly = false;
      estado.fixos[fKey] = pino;
      delete estado.fixos[principal.fKey];
      for (const mapa of [estado.fStatus, estado.fObs]) {
        if (Object.hasOwn(mapa, principal.fKey)) mapa[fKey] = mapa[principal.fKey];
        else delete mapa[fKey];
        delete mapa[principal.fKey];
      }
      chaves = [fKey];
    } else {
      for (const o of voo.unidade) {
        const p = pedidoDoVoo(estado, o);
        if (p) escreverPedido(p);
        estado.fixos[o.fKey] = { ...pino };
      }
    }
  } else if (m.instrutor && !voo.volta) {
    // Só o instrutor, no mesmo lugar: como na Lista (o pino escolhido, a turma inteira); "Automático" tira a escolha
    escolherInstrutor(estado, resultado, { stuId: principal.stuId, mid: principal.mid || 0 }, valores.insId || null, { noLugar: true });
  }

  // O status e o detalhe de cada voo (na chave nova, quando o aluno mudou)
  for (const o of voo.unidade) {
    if (!m.status.includes(o.fKey)) continue;
    const fKey = m.aluno ? chaves[0] : o.fKey;
    const status = valores.status[o.fKey], detalhe = valores.detalhe[o.fKey];
    estado.fStatus[fKey] = status;
    if (detalhe) estado.fObs[fKey] = detalhe;
    else delete estado.fObs[fKey];
    estado.fixos = fixosAoMudarStatus(estado.fixos, { ...o, fKey, ...(m.lugar ? { a: valores.a, b: valores.a + valores.minutos, r: voo.ground ? GROUND_REG : valores.r, insId: valores.insId || principal.insId } : {}) }, status, { aprovada });
  }
  const tocados = [...voos.values()].map(v => ({ ...v, statusDepois: estado.fStatus[v.fKey] || null }));
  return { rev: { kind: 'desfazerEdicao', voos: tocados, pedidos: [...pedidos.values()], recusas: [] }, chaves, janSaiu };
}

// O campo do editor de cada grupo de conflito (o aviso fica ligado a ele)
const CAMPO_DO_GRUPO = { instrutor: 'voo-instrutor', aviao: 'voo-recurso', horario: 'voo-horario', pedido: 'voo-missao' };
const CAMPO_DO_AVISO = { 'fora-dos-horarios': 'voo-horario', 'depois-das-17h30': 'voo-duracao', 'limite-de-locais': 'voo-horario', 'antes-do-ground': 'voo-horario', 'sem-peso': 'voo-instrutor' };

// Os avisos da alteração (recalculados a cada campo), na escala da tela com ela aplicada, conferida sem o motor
// (js/conferencia.js; fora da escala aprovada, sem simular o que o motor mudaria nos outros voos, d46): os conflitos do voo
// (conflito: pedem "Salvar mesmo assim" e ficam na Escala), as regras que o voo posto à mão pula, o peso que falta; na
// escala aprovada, os outros voos que ficam em conflito; a disponibilidade do aluno que sai do pedido; o voo em andamento.
// A missão para escolher e o voo que terminaria depois da meia-noite vêm sozinhos e não deixam salvar (bloqueia).
// [{ codigo, texto, campo, conflito, bloqueia }]
export function avisosDaEdicao(estado, resultado, voo, valores, { aprovada = Boolean(estado.aprovacao), programa = null } = {}) {
  const avisos = [];
  if (!valores.missao) return [{ codigo: 'sem-missao', texto: 'Escolha a missão do aluno.', campo: 'voo-missao', conflito: false, bloqueia: true }];
  const bloqueio = bloqueioDaEdicao(voo, valores);
  if (bloqueio) return [bloqueio];
  const copia = structuredClone(estado);
  const feito = aplicarEdicao(copia, resultado, voo, valores, { aprovada });
  if (!feito) return avisos;
  // O que a missão do curso de cada pedido exige do INVA, de novo: a missão ou o aluno mudados deixam o pedido sem o exige
  // de antes (como no estado da escala, js/state.js)
  const sim = conferirEscala(comExigenciasDasMissoes(copia, programa), resultado, { antes: estado });
  if (sim) {
    const meus = new Set(feito.chaves);
    const antes = new Map(resultado.out.map(o => [o.fKey, o]));
    const vistos = new Set();
    for (const o of sim.out.filter(v => meus.has(v.fKey) && v.conflito)) {
      o.conflito.forEach((texto, i) => {
        const codigo = o.conflitoCodigos[i];
        if (vistos.has(codigo)) return;
        vistos.add(codigo);
        avisos.push({ codigo, texto: `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`, campo: CAMPO_DO_GRUPO[GRUPO_DO_CONFLITO[codigo]] || 'voo-horario', conflito: true });
      });
    }
    for (const a of sim.al.filter(v => v.t === 'warn' && meus.has(v.fKey) && Object.hasOwn(CAMPO_DO_AVISO, v.codigo))) {
      if (!avisos.some(v => v.texto === a.m)) avisos.push({ codigo: a.codigo, texto: a.m, campo: CAMPO_DO_AVISO[a.codigo], conflito: false });
    }
    if (aprovada) {
      for (const o of sim.out.filter(v => !meus.has(v.fKey) && v.conflito && !(antes.get(v.fKey) || {}).conflito)) {
        avisos.push({ codigo: 'conflito-em-outro-voo', texto: `O voo de ${o.mid ? `${o.s} (${o.mis})` : o.s} fica em conflito: ${o.conflito.join('; ')}.`, campo: 'voo-horario', conflito: true });
      }
    }
  }
  if (feito.janSaiu) avisos.push({ codigo: 'disponibilidade-do-aluno', texto: `O horário ${hm(valores.a)} está fora da disponibilidade do pedido: ela sai do pedido.`, campo: 'voo-horario', conflito: false });
  const emAndamento = voo.unidade.filter(o => ['Em Voo', 'Pousou'].includes(valores.status[o.fKey]));
  if (emAndamento.length && mudancasDoVoo(voo, valores).lugar) {
    avisos.push({ codigo: 'em-andamento', texto: `O voo está ${valores.status[emAndamento[0].fKey]}: as horas, a revisão de 50 horas e o Rodízio acompanham a mudança.`, campo: 'voo-horario', conflito: false });
  }
  return avisos;
}

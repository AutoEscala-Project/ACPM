// As restrições de um voo (G1): o que o motor lê para encaixar um pedido (o tipo de recurso, o instrutor, a prioridade, o
// horário e a duração), na gaveta "Restrições" (aside.gaveta#painel-restricoes, js/views/restricoes-do-voo.js), que toma o
// lugar das colunas da Demanda. Puro: as opções de cada campo, o aviso das limitações do aluno (L), o campo aplicado no
// pedido e a regra que solta o voo agendado. O voo já posto na escala tem os campos dele no editor do voo (F1g): a gaveta
// só muda o pedido. O horário exato do pedido da agenda nunca é afrouxado nem editado aqui (N14): ele muda em Pedidos ou
// movendo o voo no editor; as preferências, só no pedido sem ele
import { MIS, GROUND_EQ_TYPE, GROUND_DURATION_H } from './config.js';
import { hm } from './format.js';
import { HORARIO_DO_NOTURNO, horariosDaMissao, ajustarPreferencias } from './horarios.js';
import { minutosExatos, duracaoDigitada, ERRO_DA_DURACAO, duracaoPadraoDaMissao, prioridadeGuardada } from './rules.js';
import { limitacoesNaData, motivoDoTipo, motivoDoHorario, inicioPermitido } from './limitacoes.js';
import { instrutoresDoPedido } from './instrutor-escolhido.js';
import { inativoNoEstado } from './inativos.js';
import { semAgendados, pinosDoNoturnoQueValem } from './fixos.js';
import { rejeicoesDosPedidos } from './rejeicoes.js';

// O voo do pedido mudou de verdade: outra missão, outro tipo de recurso ou outras horas (a mesma duração escrita de outro
// jeito, 1 e 1.0, não muda). As preferências, o instrutor e a prioridade não são do voo
export const mudouOVoo = (antes, depois) => antes.mis !== depois.mis || antes.eq !== depois.eq || Number(antes.nb) !== Number(depois.nb);

// O voo agendado na Escala (o pino com a marca agendado) é do pedido como ele estava: com outra missão, outro tipo ou
// outras horas, ele deixa de ser fixo, e a escala encaixa o pedido de novo (o fixo pelo status continua fixo, só sem a
// marca; o Noturno que deixou de ser Noturno perde o pino dele, js/fixos.js). Só a mudança de verdade solta (mudouOVoo):
// sem ela, os mesmos voos fixos (o mesmo objeto). estado: o de depois da mudança (o pedido já mudou); antes e depois: a
// missão, o tipo e as horas do pedido
export function fixosSemOAgendadoQueMudou(estado, fKey, antes, depois) {
  const fixos = estado.fixos || {};
  if (!mudouOVoo(antes, depois) || !(fixos[fKey] && fixos[fKey].agendado)) return fixos;
  return pinosDoNoturnoQueValem({ ...estado, fixos: semAgendados(fixos, [fKey], estado.fStatus) });
}

// O horário exato do pedido da agenda (jan: um minuto, ou dois): { minutos, texto: 'às 08:20' }; sem ele, null
export function horarioExatoDoPedido(pedido) {
  const minutos = minutosExatos(pedido && pedido.jan);
  return minutos.length ? { minutos, texto: minutos.map(m => `às ${hm(m)}`).join(' ou ') } : null;
}

// Os tipos de recurso da missão do pedido (o Ground, só a Sala). O que o aluno não voa (as limitações na data, L) fica na
// lista com o motivo: nada esconde, e escolher avisa e pede a confirmação. [{ valor, texto, motivo }]
export function opcoesDeTipoDoPedido(aluno, pedido, data) {
  const regra = MIS[pedido.mis] || MIS['Voo Local'];
  const limitacoes = limitacoesNaData(aluno.limitacoes, data);
  const tipos = regra.isGround ? [GROUND_EQ_TYPE] : regra.eq;
  return tipos.map(tipo => {
    const motivo = regra.isGround ? null : motivoDoTipo(limitacoes, tipo);
    return { valor: tipo, texto: motivo ? `${tipo} (${motivo})` : tipo, motivo };
  });
}

// Por que o minuto está fora das limitações do aluno na data, ou null
function motivoDoMinuto(aluno, minuto, data) {
  if (!Number.isInteger(minuto) || minuto < 0) return null;
  const limitacoes = limitacoesNaData(aluno.limitacoes, data);
  return inicioPermitido(limitacoes, minuto) ? null : motivoDoHorario(limitacoes);
}

// As opções de uma preferência: "—", os horários da lista (a da missão e do tipo; o Noturno, 17:30) e o valor de agora
// que saiu da lista (marcado). O horário fora das limitações do aluno fica com o motivo. [{ valor, texto, motivo }]
export function opcoesDeHorarioDoPedido(aluno, pedido, valor, lista, data) {
  const opcao = (m, rotulo) => {
    const motivo = motivoDoMinuto(aluno, m, data);
    return { valor: m, texto: motivo ? `${rotulo} (${motivo})` : rotulo, motivo };
  };
  const itens = [{ valor: -1, texto: '—', motivo: null }, ...lista.map(m => opcao(m, hm(m) + (m === HORARIO_DO_NOTURNO ? ' (noturno)' : '')))];
  if (Number.isInteger(valor) && valor >= 0 && !lista.includes(valor)) itens.push(opcao(valor, `${hm(valor)} (fora da lista)`));
  return itens;
}

// O instrutor do pedido: "Automático" (o app escolhe; com o “Priorizar com” do aluno, um dos instrutores dele) e os da
// Demanda (os habilitados para a missão; o que não vem na data, com a nota; o escolhido que saiu do cadastro, com o
// aviso). O de "Não escalar com" do aluno fica na lista, desligado: escolhido, o motor recusaria o pedido; o voo posto à
// mão no editor voa com ele, com o aviso. estado: o da escala (sem os inativos); aluno e pedido com o exige da missão do
// curso. [{ valor, texto, desligada }]
export function instrutoresDasRestricoes(estado, aluno, pedido) {
  const pares = (aluno.voaCom || []).map(id => estado.ins.find(x => x.id === id)).filter(x => x && !inativoNoEstado(estado, x)).map(x => x.nm);
  const automatico = { valor: '', texto: pares.length ? `Automático (prioriza ${pares.join(', ')})` : 'Automático', desligada: false };
  return [automatico, ...instrutoresDoPedido(estado, aluno, pedido, { comBloqueados: true })
    .map(o => ({ valor: o.id, texto: o.nota ? `${o.nm} (${o.nota})` : o.nm, desligada: o.nota === 'em Não escalar com' }))];
}

// O aviso do campo contra as limitações do aluno na data (L): o tipo que ele não voa, o horário fora dos dele. O motor
// recusa o pedido assim; só um voo posto à mão no editor voa. Sem nada contra, null
export function avisoDaRestricao(aluno, campo, valor, data) {
  if (campo === 'eq') {
    const motivo = motivoDoTipo(limitacoesNaData(aluno.limitacoes, data), valor);
    return motivo ? `${valor}: ${motivo}. Assim, o app não escala o pedido (ele fica fora da escala, com o motivo); só um voo posto à mão, no editor do voo, voa assim.` : null;
  }
  if (campo === 'p1' || campo === 'p2') {
    const motivo = motivoDoMinuto(aluno, Number(valor), data);
    return motivo ? `${hm(Number(valor))}: ${motivo}. Assim, o app não escala o pedido nesse horário; só um voo posto à mão, no editor do voo, voa assim.` : null;
  }
  return null;
}

// O tipo de recurso da missão do curso posta no pedido ("Usar a do programa", "Trocar…"), como no formulário de Pedidos
// (L, R7): o do programa; o aluno que não voa nele (as limitações na data) vai num dos tipos que a missão permite e ele
// voa (o do pedido, quando é um deles), e a missão continua a do curso, com o aviso. Sem nenhum desses, o do programa,
// com o aviso das limitações (o motor recusa o pedido: só um voo posto à mão voa assim). { eq, aviso }
export function tipoDaMissaoDoCurso(aluno, missao, pedido, data) {
  const regra = MIS[missao.mis] || MIS['Voo Local'];
  const limitacoes = limitacoesNaData(aluno.limitacoes, data);
  const motivo = regra.isGround ? null : motivoDoTipo(limitacoes, missao.eq);
  if (!motivo) return { eq: missao.eq, aviso: null };
  const livres = regra.eq.filter(tipo => !motivoDoTipo(limitacoes, tipo));
  const eq = livres.includes(pedido.eq) ? pedido.eq : livres[0];
  if (!eq) return { eq: missao.eq, aviso: avisoDaRestricao(aluno, 'eq', missao.eq, data) };
  return { eq, aviso: `O programa faz ${missao.codigo} no ${missao.eq}, e ${motivo}: o pedido vai no ${eq}, e a missão continua ${missao.codigo}.` };
}

// Mudar à mão a missão, o tipo ou as horas tira do pedido a missão do curso (o código, o curso e a marca do programa,
// formato 30); a confirmação do 7º voo local (Q8) foi dada na Agenda para a missão e o recurso de antes: com outros, ela não vale
function semAMissaoDoCurso(pedido, campo) {
  for (const c of ['etapa', 'cursoDaEtapa', 'etapaDoPrograma']) delete pedido[c];
  if (campo !== 'nb') delete pedido.limiteConfirmado;
}

const NAO = motivo => ({ aplicada: false, mudouOVoo: false, ...(motivo ? { motivo } : {}) });

// O campo no pedido (muda o pedido): o tipo de recurso ('eq'), a duração ('nb', o texto digitado), as preferências ('p1',
// 'p2'), a prioridade ('pr', 1 a 5 na tela) e a missão ('mis', que fica na Demanda até o G2). Os horários da missão e do
// tipo novos levam as preferências (o horário exato do pedido fica, N14). As preferências do pedido com o horário exato
// não mudam aqui. { aplicada, mudouOVoo, motivo? }
export function aplicarRestricao(pedido, campo, valor, { horarios }) {
  const antes = { mis: pedido.mis, eq: pedido.eq, nb: pedido.nb };
  if (campo === 'p1' || campo === 'p2') {
    const exato = horarioExatoDoPedido(pedido);
    if (exato) return NAO(`O horário do pedido da agenda (${exato.texto}) não muda aqui: mude-o em Pedidos (cancele e registre de novo) ou no editor do voo, movendo o voo.`);
    pedido[campo] = Number(valor);
    return { aplicada: true, mudouOVoo: false };
  }
  if (campo === 'pr') {
    const naTela = Number(valor);
    if (!Number.isInteger(naTela) || naTela < 1 || naTela > 5) return NAO();
    pedido.pr = prioridadeGuardada(naTela);
    return { aplicada: true, mudouOVoo: false };
  }
  if (campo === 'nb') {
    const h = duracaoDigitada(String(valor));
    if (h === null) return NAO(ERRO_DA_DURACAO);
    pedido.nb = h;
  } else if (campo === 'eq') {
    pedido.eq = valor;
  } else if (campo === 'mis') {
    if (!Object.hasOwn(MIS, valor)) return NAO();
    const eraGround = Boolean((MIS[pedido.mis] || {}).isGround);
    // Saindo de uma missão com duração padrão ou fixa (o simulador, o Noturno), a missão nova começa com a dela
    const tinhaPadrao = Boolean((MIS[pedido.mis] || {}).duracaoPadrao || (MIS[pedido.mis] || {}).duracaoFixaH);
    const regra = MIS[valor];
    pedido.mis = valor;
    if (!regra.eq.includes(pedido.eq)) pedido.eq = regra.defEq;
    if (regra.isGround) {
      pedido.eq = GROUND_EQ_TYPE;
      pedido.nb = GROUND_DURATION_H;
    } else if (eraGround || tinhaPadrao || regra.duracaoPadrao) {
      pedido.nb = duracaoPadraoDaMissao(valor);
    }
  } else return NAO();
  const mudou = mudouOVoo(antes, pedido);
  if (mudou) semAMissaoDoCurso(pedido, campo);
  // Os horários da missão e do tipo novos (o Noturno sai às 17:30; o PA-34 tem os seus)
  if (campo === 'mis' || campo === 'eq') ajustarPreferencias(pedido, horariosDaMissao(horarios, pedido.mis, pedido.eq));
  return { aplicada: true, mudouOVoo: mudou };
}

// A recusa de cada missão que não entrou, com o pedido dela (o item do trilho leva às restrições do pedido): um Map do
// alerta 'err' para { fKey, stuId, mid }, pelo pareamento das recusas (js/rejeicoes.js). estado: o que o motor leu
export function pedidosDasRecusas(estado, resultado) {
  return new Map([...rejeicoesDosPedidos(estado, resultado)].map(([fKey, alerta]) => {
    const [stuId, mid] = fKey.split('_').map(Number);
    return [alerta, { fKey, stuId, mid }];
  }));
}
